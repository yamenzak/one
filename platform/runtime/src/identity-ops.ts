/**
 * vocabulary-exempt-file(client): the WebAuthn field names crossing this
 * surface. See `webauthn.ts` for why they are not renamed.
 *
 * SIGNING IN — email code to bootstrap, passkeys thereafter.
 *
 * ⚠️ THE ORDER OF THE TWO LANES IS A SECURITY DECISION, NOT A ROADMAP.
 * Registering a passkey requires a session, always. Without that rule anybody
 * who can type an address can attach a credential to it, and the passkey lane
 * becomes a way of taking an account over rather than a way of protecting one.
 * The emailed code is what proves the address in the first place, so it is the
 * only lane that may run with no session behind it — and it is therefore the
 * only lane that needs a rate limit.
 *
 * No passwords anywhere, deliberately: there is nothing to phish, nothing to
 * reuse, and nothing to store.
 */

import type { AnyOperation, AppSpec, BindingSpec, Credential, Instant, Session, SqlHandle, UserId } from "@one/kernel";
import { nothing, operation, PUBLIC, s, shouldOfferRootCredential } from "@one/kernel";
import { b64u, verifyAssertion, verifyRegistration } from "./webauthn.js";
import type { IdentityStore, SessionStore } from "./identity.js";
import { type Membership, wouldStrand } from "./membership.js";
import { sessionCookie, clearedCookie, SESSION_RECHECK_MS } from "./identity.js";
import { belongings } from "./membership-directory.js";

/** ⚠️ A symbol, so an app cannot reach the platform's stores by writing a name. */
export const PLATFORM = Symbol.for("one.runtime.platform");

export interface PlatformDeps {
  /**
   * ⚠️ THE DIRECTORY IS WHERE AN ACCOUNT LIVES, so a personal preference is
   * written there rather than in a region. Somebody in two workspaces in two
   * regions is one person with one answer to "how do you read a weight", and a
   * per-region copy is two answers that disagree the first time one is edited.
   */
  readonly directory: SqlHandle;
  readonly identity: IdentityStore;
  readonly sessions: SessionStore;
  readonly origin: string;
  /** ⚠️ The relying party THIS DOOR may prompt for. Derived from the host. */
  readonly relyingParty: string;
  readonly cookieDomain: string | null;
  readonly secureCookies: boolean;
  readonly sessionDays: number;
  readonly session: Session | null;
  setCookie(value: string): void;
  /** Injected: the platform owns the code, an app owns how it travels. */
  deliverCode(email: string, code: string): Promise<void>;
  /**
   * ⚠️ WHICH OF THESE WORKSPACES THIS PERSON IS IN **AND AS WHAT**, asked of the
   * regions rather than guessed. Memberships are regional and the directory is
   * global, so "where do I belong" is a question one store cannot answer alone.
   *
   * ⚠️ A MAP RATHER THAN A SET, because the role decides which documents somebody
   * is asked to accept — and a second walk to fetch it is a second chance to
   * disagree with this one. `Map` answers `has`, so every caller that only asked
   * the first question still asks it the same way.
   */
  /*
    ⚠️ WHICH OF THESE WORKSPACES THIS PERSON IS IN, asked of THIS product's
    regional memberships. It is what the strand check and the leave path need —
    a real membership row, in the store that owns it. It is deliberately NOT
    what "everywhere I belong" is derived from: that spans products, and this
    cannot see one.
  */
  mineIn(tenantIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
  /**
   * ⚠️ ONE WORKSPACE'S MEMBERS, FOUND ONCE AND HANDED BACK STILL OPEN. Leaving
   * is a WRITE into a region this door does not know, and the read that decides
   * whether it is allowed must land in the same store as the write it decides —
   * two lookups is a second chance to find a different region, which is a rule
   * checked against one list of members and applied to another.
   *
   * Null where the workspace is unknown here, so a caller cannot tell a
   * workspace with no members from one that does not exist.
   */
  membershipIn(tenantId: string): Promise<WorkspaceMembership | null>;
  /**
   * ⚠️ THE WORKSPACES THIS PERSON CANNOT WALK OUT OF, BY NAME. Every one where
   * they are the last member who can manage members — so closing an account can
   * refuse and SAY WHICH, instead of either failing opaquely or quietly taking
   * somebody's colleagues offline with them.
   *
   * It is a dep rather than a walk in the handler because it spans every region,
   * which is the one thing an operation is not allowed to know about.
   */
  wouldStrandOnLeaving(): Promise<readonly string[]>;
  /**
   * ⚠️ THE WHOLE PERSON, ASSEMBLED WHERE THE STORES ARE. The account-scoped
   * tables live in the global store and the memberships live in every region, so
   * the one thing an operation may not know — where anything is — is exactly what
   * this needs. The DERIVATION stays in the kernel; only the walking is here.
   */
  exportMe(at: Instant): Promise<AccountExport>;
}

/** What `exit.account.export` answers with. */
export interface AccountExport {
  readonly at: Instant;
  /** Every account-scoped table a module declares, with its rows. */
  readonly tables: Readonly<Record<string, readonly unknown[]>>;
  /** ⚠️ What a per-table ceiling left out. Silence here would read as "all of it". */
  readonly dropped: Readonly<Record<string, number>>;
  /** The person's own row, which no cascade can carry — it is keyed by `id`. */
  readonly account: Readonly<Record<string, unknown>> | null;
  /** Where they belong, from every region: the workspace, the role, the dates. */
  readonly workspaces: readonly Readonly<Record<string, unknown>>[];
}

/** Who is in a workspace, and the one write this door may make against them. */
export interface WorkspaceMembership {
  readonly members: readonly Membership[];
  revoke(id: string, at: Instant): Promise<boolean>;
}

export interface PlatformCarrier { readonly [PLATFORM]: PlatformDeps }
const deps = (ctx: unknown): PlatformDeps => (ctx as PlatformCarrier)[PLATFORM];

/* -------------------------------------------------------------------- otp --- */

const CODE_TTL_MS = 10 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;

/** Stored hashed, so a database read is not a list of live sign-in codes. */
async function hashCode(email: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`${email}:${code}`);
  return b64u.encode(new Uint8Array(await crypto.subtle.digest("SHA-256", data as BufferSource)));
}

export const OTP_SCHEMA = {
  id: "identity_codes",
  after: ["identity"],
  ddl: [
    `CREATE TABLE IF NOT EXISTS sign_in_codes (email TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at TEXT NOT NULL, sent_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);`,
  ],
} as const;

/* -------------------------------------------------------------------- ops --- */

export function identityOperations<B extends BindingSpec>(app: AppSpec<B>): readonly AnyOperation[] {
  const requestCode = operation({
    id: "identity.code.request",
    kind: "write",
    summary: "Send a one-time sign-in code to an email address.",
    input: s.object({ email: s.text({ max: 320 }) }),
    output: s.object({ sent: s.bool() }),
    permission: PUBLIC,
    idempotency: { mode: "natural", key: "email" },
    fails: ["platform.invalid", "platform.too_many"],
    /*
      ⚠️ NOT REACHABLE BY A TOOL. A model that can post sign-in codes to arbitrary
      addresses is a mail cannon with our sender's reputation attached.
    */
    tool: false,
    async handler(ctx, input: { email: string }) {
      const d = deps(ctx);
      const email = input.email.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) ctx.fail("platform.invalid", { field: "email" });

      const existing = await d.directory.first<{ sent_at: string }>(
        `SELECT sent_at FROM sign_in_codes WHERE email = ?`, email,
      );
      const now = ctx.now();
      if (existing && Date.parse(now) - Date.parse(existing.sent_at) < RESEND_COOLDOWN_MS) {
        /*
          ⚠️ A COOLDOWN IS THE ONE GATE IN FRONT OF AN UNAUTHENTICATED SEND. It
          is a deliverability control as much as a security one: an address that
          receives ten codes a minute marks the sender as spam for every other
          recipient on the domain, and that damage is not per-tenant.
        */
        ctx.fail("platform.too_many", { retryAfter: Math.ceil((RESEND_COOLDOWN_MS - (Date.parse(now) - Date.parse(existing.sent_at))) / 1000) });
      }

      const code = String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, "0");
      await d.directory.run(
        `INSERT INTO sign_in_codes (email, code_hash, expires_at, sent_at, attempts) VALUES (?, ?, ?, ?, 0)
         ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, sent_at = excluded.sent_at, attempts = 0`,
        email, await hashCode(email, code), new Date(Date.parse(now) + CODE_TTL_MS).toISOString(), now,
      );
      await d.deliverCode(email, code);

      /*
        ⚠️ THE ANSWER IS THE SAME WHETHER OR NOT THE ADDRESS HAS AN ACCOUNT.
        Telling them apart turns this endpoint into a membership oracle: type an
        address, learn whether that person uses the product. For a health or a
        clinical product that is a disclosure on its own.
      */
      return { sent: true };
    },
  });

  const verifyCode = operation({
    id: "identity.code.verify",
    kind: "write",
    summary: "Exchange a one-time code for a session.",
    input: s.object({ email: s.text({ max: 320 }), code: s.text({ min: 6, max: 6 }) }),
    output: s.object({ accountId: s.text(), offerPasskey: s.bool() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    fails: ["platform.invalid", "platform.too_many"],
    tool: false,
    async handler(ctx, input: { email: string; code: string }) {
      const d = deps(ctx);
      const email = input.email.trim().toLowerCase();
      const now = ctx.now() as Instant;

      const row = await d.directory.first<{ code_hash: string; expires_at: string; attempts: number }>(
        `SELECT code_hash, expires_at, attempts FROM sign_in_codes WHERE email = ?`, email,
      );
      /*
        ⚠️ A BOUNDED NUMBER OF ATTEMPTS, or six digits is a number an attacker
        counts to. The row is deleted at the ceiling rather than locked, so the
        person can simply ask for another one — a lockout here would be a denial
        of service anybody could aim at any address.
      */
      if (!row || row.attempts >= 5 || row.expires_at <= now) {
        if (row) await d.directory.run(`DELETE FROM sign_in_codes WHERE email = ?`, email);
        ctx.fail("platform.invalid", { field: "code" });
      }

      if (row!.code_hash !== (await hashCode(email, input.code))) {
        await d.directory.run(`UPDATE sign_in_codes SET attempts = attempts + 1 WHERE email = ?`, email);
        ctx.fail("platform.invalid", { field: "code" });
      }
      await d.directory.run(`DELETE FROM sign_in_codes WHERE email = ?`, email);

      const account = await d.identity.ensure(email, now);
      if (!account.emailVerified) {
        await d.directory.run(`UPDATE accounts SET email_verified = 1, profile_version = profile_version + 1 WHERE id = ?`, account.id);
      }
      const session = await d.sessions.create(account, { origin: d.origin, appId: app.id }, now, d.sessionDays);
      d.setCookie(sessionCookie(session.id, d.cookieDomain, d.sessionDays * 86_400, d.secureCookies));

      /*
        The whole of the passkey migration a person ever sees: an offer, once,
        when they hold nothing that works platform-wide. Not a lockout, and not
        a forced re-registration.
      */
      const held = await d.identity.credentials(account.id);
      const offerPasskey = held.length === 0 || shouldOfferRootCredential(held, d.relyingParty, app.identity.rootRelyingParty);
      return { accountId: account.id, offerPasskey };
    },
  });

  /* ---------------------------------------------------------------- passkey --- */

  const registerBegin = operation({
    id: "identity.passkey.register.begin",
    kind: "write",
    summary: "Start adding a passkey to the signed-in account.",
    input: nothing(),
    output: s.object({ challenge: s.text(), relyingParty: s.text(), accountId: s.text(), exclude: s.array(s.text()) }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    fails: ["platform.forbidden"],
    tool: false,
    async handler(ctx) {
      const d = deps(ctx);
      /*
        ⚠️ A SESSION IS REQUIRED, AND THIS IS THE LINE THAT MAKES THE PASSKEY LANE
        SAFE. Without it, anybody who can type an address attaches a credential to
        it, and what looks like the strongest factor in the product becomes the
        cheapest way to take an account over.
      */
      if (!d.session) ctx.fail("platform.forbidden");
      const held = await d.identity.credentials(d.session!.accountId);
      const challenge = await d.identity.issueChallenge("register", d.origin, d.session!.accountId, ctx.now() as Instant);
      return {
        challenge,
        // The door's own relying party — the root where the door is under it, so
        // a credential made here works on every product beneath it.
        relyingParty: d.relyingParty,
        accountId: d.session!.accountId,
        // Offered so an authenticator can refuse to enrol itself twice.
        exclude: held.map((c) => c.id),
      };
    },
  });

  const registerFinish = operation({
    id: "identity.passkey.register.finish",
    kind: "write",
    summary: "Finish adding a passkey.",
    input: s.object({
      challenge: s.text({ max: 200 }), attestationObject: s.text({ max: 8000 }),
      clientDataJSON: s.text({ max: 4000 }), label: s.optional(s.text({ max: 60 })),
    }),
    output: s.object({ credentialId: s.text(), relyingParty: s.text() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    fails: ["platform.forbidden", "platform.invalid"],
    tool: false,
    async handler(ctx, input: { challenge: string; attestationObject: string; clientDataJSON: string; label?: string }) {
      const d = deps(ctx);
      if (!d.session) ctx.fail("platform.forbidden");
      const now = ctx.now() as Instant;
      if (!(await d.identity.consumeChallenge(input.challenge, "register", d.origin, now))) {
        ctx.fail("platform.invalid", { field: "challenge" });
      }

      const verified = await verifyRegistration(input, {
        challenge: input.challenge, origin: d.origin, relyingParty: d.relyingParty,
      });
      if (!verified.ok) ctx.fail("platform.invalid", { field: "credential", reason: verified.why });

      const credential: Credential = {
        id: verified.ok ? verified.value.credentialId : "",
        accountId: d.session!.accountId,
        /*
          ⚠️ RECORDED AS THE DOOR'S RELYING PARTY AND NEVER REWRITTEN. This is
          the field the whole migration hangs on: what a credential is good for
          is decided once, at creation, and re-labelling one later would either
          widen a scope its authenticator never agreed to or narrow one somebody
          is relying on.
        */
        relyingParty: d.relyingParty,
        publicKey: verified.ok ? verified.value.publicKey : "",
        counter: verified.ok ? verified.value.counter : 0,
        createdAt: now,
        label: input.label ?? null,
      };
      await d.identity.addCredential(credential);
      return { credentialId: credential.id, relyingParty: credential.relyingParty };
    },
  });

  const signInBegin = operation({
    id: "identity.passkey.begin",
    kind: "write",
    summary: "Start signing in with a passkey.",
    input: s.object({ email: s.text({ max: 320 }) }),
    output: s.object({ challenge: s.text(), relyingParty: s.text(), allow: s.array(s.text()) }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    tool: false,
    async handler(ctx, input: { email: string }) {
      const d = deps(ctx);
      const account = await d.identity.byEmail(input.email);
      const now = ctx.now() as Instant;
      /*
        ⚠️ A CHALLENGE IS ISSUED WHETHER OR NOT THE ACCOUNT EXISTS, and the
        credential list is simply empty when it does not. An endpoint that
        answered differently would report who uses the product to anybody who
        asked, which is the same oracle the code lane is careful about.
      */
      const allow = account ? await d.identity.offerable(account.id, d.relyingParty) : [];
      return {
        challenge: await d.identity.issueChallenge("signin", d.origin, account?.id ?? null, now),
        relyingParty: d.relyingParty,
        allow: allow.map((c) => c.id),
      };
    },
  });

  const signInFinish = operation({
    id: "identity.passkey.finish",
    kind: "write",
    summary: "Finish signing in with a passkey.",
    input: s.object({
      challenge: s.text({ max: 200 }), credentialId: s.text({ max: 500 }),
      authenticatorData: s.text({ max: 4000 }), clientDataJSON: s.text({ max: 4000 }),
      signature: s.text({ max: 2000 }),
    }),
    output: s.object({ accountId: s.text() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    fails: ["platform.invalid"],
    tool: false,
    async handler(ctx, input: { challenge: string; credentialId: string; authenticatorData: string; clientDataJSON: string; signature: string }) {
      const d = deps(ctx);
      const now = ctx.now() as Instant;
      if (!(await d.identity.consumeChallenge(input.challenge, "signin", d.origin, now))) {
        ctx.fail("platform.invalid", { field: "challenge" });
      }

      const row = await d.directory.first<{ account_id: string; relying_party: string; public_key: string; counter: number }>(
        `SELECT account_id, relying_party, public_key, counter FROM credentials WHERE id = ?`, input.credentialId,
      );
      if (!row) ctx.fail("platform.invalid", { field: "credential" });

      /*
        ⚠️ THE RELYING PARTY COMES FROM THE STORED CREDENTIAL, NEVER FROM THE
        REQUEST. Verifying against a relying party the caller nominated would let
        a request choose the scope it is checked under, which is the whole
        protection reversed. And the credential must be offerable HERE — a
        passkey scoped to one product may not be spent at another.
      */
      const credential: Credential = {
        id: input.credentialId, accountId: row!.account_id as UserId, relyingParty: row!.relying_party,
        publicKey: row!.public_key, counter: row!.counter, createdAt: now, label: null,
      };
      const offerableHere = d.relyingParty === credential.relyingParty || d.relyingParty.endsWith(`.${credential.relyingParty}`);
      if (!offerableHere) ctx.fail("platform.invalid", { field: "credential" });

      const verified = await verifyAssertion(input, credential, {
        challenge: input.challenge, origin: d.origin, relyingParty: credential.relyingParty,
      });
      if (!verified.ok) ctx.fail("platform.invalid", { field: "assertion", reason: verified.why });
      if (verified.ok) await d.identity.advanceCounter(credential.id, verified.value.counter);

      const account = await d.identity.byId(credential.accountId);
      if (!account) ctx.fail("platform.invalid", { field: "credential" });

      const session = await d.sessions.create(account!, { origin: d.origin, appId: app.id }, now, d.sessionDays);
      d.setCookie(sessionCookie(session.id, d.cookieDomain, d.sessionDays * 86_400, d.secureCookies));
      return { accountId: account!.id };
    },
  });

  const whoami = operation({
    id: "identity.session.read",
    kind: "read",
    summary: "Who is signed in on this origin.",
    input: nothing(),
    output: s.object({ signedIn: s.bool(), email: s.optional(s.text()), name: s.optional(s.text()) }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      if (!d.session) return { signedIn: false };
      // `?? undefined` rather than `null`: absent and empty are the same answer
      // for a display name, and one shape on the wire is one fewer branch in a
      // client that has to render it.
      return { signedIn: true, email: d.session.snapshot.email, name: d.session.snapshot.name ?? undefined };
    },
  });

  const signOut = operation({
    id: "identity.signout",
    kind: "write",
    summary: "End this session.",
    input: s.object({ everywhere: s.optional(s.bool()) }),
    output: s.object({ ok: s.bool() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    tool: false,
    async handler(ctx, input: { everywhere?: boolean }) {
      const d = deps(ctx);
      if (d.session) {
        /*
          "Everywhere" is per APP, not per platform: sessions are regional and
          per-origin by design, so this ends the ones this app issued. Ending
          another product's sessions from here would be the shared-session model
          the whole design refuses.
        */
        if (input?.everywhere) await d.sessions.revokeAllFor(d.session.accountId);
        else await d.sessions.revoke(d.session.id);
      }
      d.setCookie(clearedCookie(d.cookieDomain, d.secureCookies));
      return { ok: true as const };
    },
  });


  /**
   * How this person reads weights and measures.
   *
   * ⚠️ THE PERSON'S, NOT THE WORKSPACE'S. A coach who thinks in kilograms and a
   * client who thinks in pounds are both right, in the same studio, about the
   * same barbell — so a workspace-level choice is one that is wrong for somebody
   * by construction. It hangs off the ACCOUNT rather than the membership:
   * somebody in two studios does not change how they read a weight when they
   * switch between them.
   *
   * ⚠️ AND IT IS A DISPLAY CHOICE ONLY. Everything is stored in one unit and
   * converted at the edge — a store that held whatever somebody last typed is a
   * database where a number means nothing without a second column beside it, and
   * the sum of a column like that is meaningless.
   */
  const preferences = operation({
    id: "me.preferences",
    kind: "read",
    summary: "How you read things, and how the app answers.",
    input: nothing(),
    output: s.object({
      units: s.text(), layout: s.json(), theme: s.text(), locale: s.text(),
      sound: s.bool(), haptics: s.bool(),
    }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      /* ⚠️ THE SAME SHAPE SIGNED OUT AS SIGNED IN. A response missing half its
         keys makes a client branch on presence rather than on value, and the
         branch that forgets renders `undefined` as a theme. */
      if (!d.session) return { units: "", layout: [], theme: "", locale: "", sound: false, haptics: true };
      const row = await d.directory.first<{
        units: string | null; layout: string | null; theme: string | null;
        locale: string | null; sound: number | null; haptics: number | null;
      }>(
        `SELECT units, layout, theme, locale, sound, haptics FROM accounts WHERE id = ?`, d.session.accountId,
      ).catch(() => null);
      /* ⚠️ Empty means "whatever this deployment's format says", which is the
         honest answer for somebody who has never chosen. Substituting one here
         would make a default indistinguishable from a decision. */
      /*
        ⚠️ AN EMPTY LAYOUT IS "WHATEVER THE PRODUCT PUTS FIRST", not an empty
        screen. A stored order is a list of names the app knows; anything else in
        it is ignored by whoever renders it, which is what keeps a rename from
        blanking somebody's dashboard.
      */
      /*
        ⚠️ THE FEEDBACK DEFAULTS ARE HAPTICS ON AND SOUND OFF, AND THEY LIVE
        HERE RATHER THAN IN THE SCREEN. A default applied by whichever surface
        renders first is a default that differs between a phone and a desktop,
        and nobody can tell which one they last saw.

        An interface that makes a noise nobody chose is the most
        complained-about behaviour there is; a tick you feel is silent and is
        what every native app on the device already does.
      */
      return {
        units: row?.units ?? "",
        layout: parseLayout(row?.layout ?? ""),
        theme: row?.theme ?? "",
        locale: row?.locale ?? "",
        sound: row?.sound === 1,
        haptics: row?.haptics !== 0,
      };
    },
  });

  const setPreferences = operation({
    id: "me.preferences.set",
    kind: "write",
    summary: "Change how you read things, and how the app answers.",
    input: s.object({
      units: s.optional(s.enum(["", "metric", "imperial"])),
      /* ⚠️ `""` IS A REAL ANSWER AND IT IS THE DEFAULT: "follow this device".
         A three-member enum with no empty member would make "system" the one
         choice somebody could not go back to. */
      theme: s.optional(s.enum(["", "light", "dark"])),
      /* ⚠️ BCP 47, and the SET is not checked here. Which languages exist is a
         fact about what has been translated rather than about a person, and a
         kernel that policed it would be a kernel with a translation table. */
      locale: s.optional(s.text({ max: 12 })),
      sound: s.optional(s.bool()),
      haptics: s.optional(s.bool()),
      /* ⚠️ Bounded, because it is a list of what to show first rather than a
         place to keep things. */
      layout: s.optional(s.array(s.text({ max: 40 }), { max: 20 })),
    }),
    output: s.object({ ok: s.bool() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    outcome: { message: "Saved", tone: "success", invalidates: ["me.preferences"] },
    fails: ["platform.forbidden"],
    tool: false,
    async handler(ctx, input: {
      units?: string; layout?: readonly string[]; theme?: string;
      locale?: string; sound?: boolean; haptics?: boolean;
    }) {
      const d = deps(ctx);
      /*
        ⚠️ PUBLIC IS THE LANE, NOT THE AUDIENCE. Every operation here answers on
        a door with no tenancy, so the permission cannot be a role — but writing
        a preference still needs somebody to write it FOR, and without this the
        route is an unauthenticated write against whatever account id arrived.
      */
      if (!d.session) ctx.fail("platform.forbidden", { reason: "sign in first" });
      /* ⚠️ Each is set only when it was SENT. A screen saving one preference
         must not clear the other, which is what a whole-object write does. */
      if (input.units !== undefined) {
        await d.directory.run(`UPDATE accounts SET units = ? WHERE id = ?`, input.units, d.session!.accountId);
      }
      if (input.layout !== undefined) {
        await d.directory.run(`UPDATE accounts SET layout = ? WHERE id = ?`, JSON.stringify(input.layout), d.session!.accountId);
      }
      if (input.theme !== undefined) {
        await d.directory.run(`UPDATE accounts SET theme = ? WHERE id = ?`, input.theme, d.session!.accountId);
      }
      if (input.locale !== undefined) {
        await d.directory.run(`UPDATE accounts SET locale = ? WHERE id = ?`, input.locale, d.session!.accountId);
      }
      /* ⚠️ Stored as 0/1 rather than as text, so a reader comparing to `1` and
         one comparing to `"true"` cannot disagree about the same row. */
      if (input.sound !== undefined) {
        await d.directory.run(`UPDATE accounts SET sound = ? WHERE id = ?`, input.sound ? 1 : 0, d.session!.accountId);
      }
      if (input.haptics !== undefined) {
        await d.directory.run(`UPDATE accounts SET haptics = ? WHERE id = ?`, input.haptics ? 1 : 0, d.session!.accountId);
      }
      return { ok: true };
    },
  });


  /**
   * WHERE THIS PERSON IS SIGNED IN, ACROSS EVERY PRODUCT.
   *
   * ⚠️ IT READS THE GLOBAL DIRECTORY RATHER THAN THIS APP'S SESSIONS, and that
   * is the whole point of the surface. A list of one product's sessions answers
   * a question nobody asked; "where am I signed in" spans apps and regions by
   * definition, and the regional store structurally cannot see another product.
   */
  const sessionList = operation({
    id: "me.sessions",
    kind: "read",
    summary: "Every device and product you are signed in on.",
    input: nothing(),
    output: s.object({ sessions: s.json() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    /* ⚠️ Never a tool: it is a map of somebody's devices. */
    tool: false,
    async handler(ctx) {
      const d = deps(ctx);
      if (!d.session) return { sessions: [] };
      const rows = await d.directory.all<{
        id: string; app_id: string; origin: string; created_at: string; expires_at: string; agent: string;
      }>(
        `SELECT id, app_id, origin, created_at, expires_at, agent FROM session_directory
         WHERE account_id = ? ORDER BY created_at DESC LIMIT 100`,
        d.session.accountId,
      ).catch(() => []);
      return {
        sessions: rows.map((r) => ({
          id: r.id,
          appId: r.app_id,
          origin: r.origin,
          since: r.created_at,
          until: r.expires_at,
          agent: r.agent,
          /*
            ⚠️ WHICH ONE IS THE ONE IN YOUR HAND, marked rather than hidden. A
            list that omitted it would make "sign out everywhere else" the only
            offered action and leave somebody unable to tell whether the device
            they are holding is even in the list.
          */
          current: r.id === d.session!.id,
        })),
      };
    },
  });

  const endSession = operation({
    id: "me.session.revoke",
    kind: "write",
    summary: "Sign out one device.",
    /*
      ⚠️ NO PROOF HERE, DELIBERATELY, AND IT IS THE RULE RATHER THAN AN OMISSION.
      Signing another device out is what somebody does the moment they think they
      have been compromised — and a step-up in front of a DEFENSIVE action helps
      whoever is already inside keep their foothold. The same argument covers
      leaving a workspace and turning a grant off.
    */
    input: s.object({ id: s.text({ max: 128 }) }),
    output: s.object({ ok: s.bool(), within: s.number() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    outcome: { message: "Signed out", tone: "success", invalidates: ["me.sessions"] },
    tool: false,
    fails: ["platform.forbidden"],
    async handler(ctx, input: { id: string }) {
      const d = deps(ctx);
      if (!d.session) ctx.fail("platform.forbidden", { reason: "sign in first" });
      /*
        ⚠️ ONE CALL, AND IT SCOPES BOTH STORES TO THIS ACCOUNT. Written as two
        statements it was two DIFFERENT checks: the directory delete carried the
        account and the regional one did not, so anybody signed in could end any
        session in their region whose id they had — the listed row survived and
        the session stopped working, which is the half that is invisible.
      */
      await d.sessions.revokeOwn(input.id, d.session!.accountId);
      return { ok: true, within: Math.round(SESSION_RECHECK_MS / 1000) };
    },
  });

  /**
   * THE PASSKEYS THIS PERSON HOLDS.
   *
   * ⚠️ EVERY ONE OF THEM, NOT THE ONES THIS DOOR COULD PROMPT FOR. `offerable`
   * narrows to the relying party — which is correct for a sign-in screen and
   * wrong for a list somebody manages: a credential registered under one product
   * before the relying party was raised is still theirs, still works there, and
   * would be invisible here, so they could not remove it from anywhere.
   */
  const keyList = operation({
    id: "me.passkeys",
    kind: "read",
    summary: "The passkeys on your account.",
    input: nothing(),
    output: s.object({ passkeys: s.json() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    tool: false,
    async handler(ctx) {
      const d = deps(ctx);
      if (!d.session) return { passkeys: [] };
      const all = await d.identity.credentials(d.session.accountId).catch(() => []);
      return {
        passkeys: all.map((c) => ({
          id: c.id,
          label: c.label,
          added: c.createdAt,
          /* ⚠️ WHERE IT WORKS, in the words of the thing it works on. A
             credential bound to one product and one bound to the platform are
             different objects to somebody deciding which to keep. */
          relyingParty: c.relyingParty,
        })),
      };
    },
  });

  const keyRemove = operation({
    id: "me.passkey.remove",
    kind: "write",
    summary: "Remove a passkey.",
    /*
      ⚠️ REMOVING A CREDENTIAL IS THE FIRST THING SOMEBODY WITH A BORROWED
      SESSION DOES, because it is how they stop the real owner getting back in
      before the takeover is finished. A permission check passes for them — the
      cookie is genuine — so the only thing between an open tab and a locked-out
      person is asking them to prove it is them, which on their own device is one
      tap.
    */
    proof: "recent",
    input: s.object({ id: s.text({ max: 255 }) }),
    output: s.object({ ok: s.bool() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    outcome: { message: "Removed", tone: "success", invalidates: ["me.passkeys"] },
    tool: false,
    fails: ["platform.forbidden", "platform.conflict"],
    async handler(ctx, input: { id: string }) {
      const d = deps(ctx);
      if (!d.session) ctx.fail("platform.forbidden", { reason: "sign in first" });
      const all = await d.identity.credentials(d.session!.accountId).catch(() => []);
      if (!all.some((c) => c.id === input.id)) ctx.fail("platform.forbidden", { reason: "not yours" });
      /*
        ⚠️ THE LAST ONE IS REFUSED, AND THIS IS NOT PATERNALISM. Sign-in is
        passkeys and an emailed code; removing the last passkey leaves the code,
        which is a real lane — but somebody who has also lost access to that
        address has locked themselves out of every product at once with one tap
        and no warning. The refusal is cheap and the mistake is not reversible.
      */
      if (all.length <= 1) {
        ctx.fail("platform.conflict", { reason: "this is your only passkey" });
      }
      await d.identity.removeCredential(input.id, d.session!.accountId);
      return { ok: true };
    },
  });

  /**
   * Every workspace this person belongs to.
   *
   * ⚠️ SESSIONS ARE PER ORIGIN, SO THIS IS A LIST OF ADDRESSES RATHER THAN A
   * SWITCH. Moving between workspaces is navigating to another door, and there is
   * one credential behind all of them — so it costs a tap, not a sign-in. A
   * platform that "switched" by rewriting a session would be one session valid on
   * several origins, which is the thing `sessionScope: "origin"` refuses.
   *
   * ⚠️ AND IT IS ANSWERED ON EVERY DOOR, including the one they are on. A list
   * that excluded the current workspace makes the control disappear for somebody
   * who belongs to exactly one, which is most people — and reappear later, which
   * reads as a bug.
   */
  const workspaces = operation({
    id: "me.workspaces",
    kind: "read",
    summary: "The workspaces you belong to, and where each one is.",
    input: nothing(),
    output: s.object({ workspaces: s.json() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      if (!d.session) return { workspaces: [] };
      /*
        ⚠️ FROM THE CROSS-PRODUCT INDEX, AND THAT IS WHAT MAKES THIS ANSWER TRUE.
        Memberships are regional and per-app by design, so asking this worker's
        own tables answered for this worker's own product — a list that looked
        complete and was short by every other product somebody uses. There are
        two screens making this promise and they now derive it once: one answer
        to the question the hub exists to ask.

        ⚠️ THE BRANDING STILL COMES FROM THE DIRECTORY, in one read. The index
        holds routing rather than labels, and a copy of a workspace's name in it
        would go stale the first time somebody renamed one.
      */
      const mine = await belongings(d.directory, d.session.accountId as UserId);
      if (mine.length === 0) return { workspaces: [] };
      const rows = await d.directory.all<{ slug: string; tenant_id: string; app_id: string; branding: string | null }>(
        `SELECT slug, tenant_id, app_id, branding FROM tenant_directory WHERE tenant_id IN (${mine.map(() => "?").join(", ")})`,
        ...mine.map((m) => m.tenantId),
      ).catch(() => []);
      const roles = new Map(mine.map((m) => [m.tenantId, m.role]));
      return {
        workspaces: rows.map((r) => ({
          slug: r.slug, tenantId: r.tenant_id, appId: r.app_id,
          role: roles.get(r.tenant_id) ?? "", branding: parseBranding(r.branding),
        })),
      };
    },
  });

  /**
   * LEAVING, WHICH NOBODY BUT AN ADMINISTRATOR COULD DO.
   *
   * ⚠️ THE ONE WAY OUT THAT WAS MISSING. `member.remove` needs `member:manage`,
   * which a person removing themselves does not have, and `exit.close` needs
   * `workspace:close` and closes the workspace for everybody. So an ordinary
   * member — a client, a coach, anybody invited once — could be in a workspace
   * for life and had to ask the people they were leaving to let them out.
   *
   * ⚠️ IT IS ON THE ACCOUNT'S DOOR, NOT THE WORKSPACE'S. Leaving somewhere you no
   * longer want to be must not require going there, and the list you are leaving
   * from is the hub's — a workspace whose standing has closed its own
   * origin is exactly one somebody wants out of.
   *
   * ⚠️ AND IT NAMES THE WORKSPACE IN THE INPUT, which is safe only because the
   * list of members is asked afterwards: the caller says where, and their own membership
   * there is what authorises it. Nothing about the id itself is trusted.
   */
  const leave = operation({
    id: "exit.leave",
    kind: "write",
    summary: "Leave a workspace you are in.",
    input: s.object({ tenantId: s.text({ max: 40 }) }),
    output: s.object({ left: s.text() }),
    /*
      ⚠️ PUBLIC IS THE LANE, AND THE SESSION IS THE AUTHORISATION. There is no
      permission that means "may leave": every member may, by definition, and a
      workspace that could withhold it would be one nobody can get out of. The
      handler refuses without a session, like every other `me.*` write.
    */
    permission: PUBLIC,
    idempotency: { mode: "none" },
    audit: (i: { tenantId: string }) => ({ subject: i.tenantId, verb: "leave" }),
    outcome: { message: "You have left", tone: "success", invalidates: ["me.workspaces"] },
    fails: ["platform.forbidden", "platform.not_found", "platform.conflict"],
    /*
      ⚠️ NOT A TOOL. Leaving is irreversible without an invitation from people
      you have just left, so a model that can do it from a sentence in something
      it was asked to read can lock somebody out of their own coach.
    */
    tool: false,
    async handler(ctx, input: { tenantId: string }) {
      const d = deps(ctx);
      if (!d.session) ctx.fail("platform.forbidden", { reason: "sign in first" });

      const there = await d.membershipIn(input.tenantId);
      /*
        ⚠️ NOT A MEMBER AND NOT A WORKSPACE ARE THE SAME ANSWER, deliberately.
        Distinguishing them turns this into a way of asking whether a workspace
        exists, one id at a time, from any signed-in account.
      */
      const mine = there?.members.find((m) => m.accountId === d.session!.accountId) ?? null;
      if (!mine) ctx.fail("platform.not_found", { field: "tenantId" });

      /*
        ⚠️ THE SAME RULE THE ADMINISTRATOR'S DOOR ASKS, and it is not a courtesy
        here — it is the whole reason this operation is safe to expose. The last
        person who can manage members walking out leaves the workspace running,
        billed, and impossible to re-enter.
      */
      if (wouldStrand(app.access.roles, there!.members, mine!.id)) {
        ctx.fail("platform.conflict", { field: "tenantId", reason: "last_administrator" });
      }
      await there!.revoke(mine!.id, ctx.now());
      return { left: input.tenantId };
    },
  });

  /* ------------------------------------------------------------- closing --- */

  /**
   * ⚠️ THE SAME SEVEN DAYS A WORKSPACE GETS, AND THE SAME REASON. Leaving has to
   * be a decision somebody can sleep on; a confirmation dialog in front of a
   * delete is a reflex, not a decision. The way back is CANCELLING rather than
   * signing up again, because signing up again is a different account.
   */
  const CLOSING_DAYS = 7;

  /**
   * WHAT CLOSING WOULD MEAN, BEFORE ANYTHING IS DONE.
   *
   * ⚠️ THE WORKSPACES THAT STAND IN THE WAY ARE THE POINT OF THIS READ. An
   * account is not a thing on its own — it is somebody's memberships — and
   * closing one where they are the last person who can manage members would leave
   * those workspaces running, billed, and impossible to re-enter. Naming them
   * before the button is pressed is the difference between a refusal that teaches
   * and one that just says no.
   */
  const closing = operation({
    id: "exit.account.status",
    kind: "read",
    summary: "Whether your account is closing, and what stands in the way of closing it.",
    input: nothing(),
    output: s.object({ closesAt: s.optional(s.text()), blocking: s.json() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      /* ⚠️ The same shape signed out as signed in, so a client branches on value
         rather than on presence. */
      if (!d.session) return { blocking: [] };
      const row = await d.directory.first<{ closing_at: string | null }>(
        `SELECT closing_at FROM accounts WHERE id = ?`, d.session.accountId,
      ).catch(() => null);
      return {
        ...(row?.closing_at ? { closesAt: row.closing_at } : {}),
        blocking: await d.wouldStrandOnLeaving(),
      };
    },
  });

  /**
   * EVERYTHING THIS PLATFORM HOLDS ABOUT ONE PERSON, IN ONE DOCUMENT.
   *
   * ⚠️ `exit.export` IS THE WORKSPACE'S, AND WANTS `workspace:close`. So the row
   * on the hub offering somebody their own data had nothing behind it
   * that they could reach — the only export in the product was one an ordinary
   * member is not allowed to ask for, about records that are mostly not theirs.
   *
   * ⚠️ DERIVED FROM THE DECLARATIONS, exactly as the workspace one is, and the
   * argument is stronger here. A workspace missing a table from its export is a
   * company with an incomplete backup; a PERSON missing one is being told in
   * writing, at the moment they are leaving, that this is everything they had.
   * The omission is invisible from either side: the file arrives, it is full of
   * their data, and nothing in it says what is not there.
   */
  const exportAccount = operation({
    id: "exit.account.export",
    kind: "read",
    summary: "Everything your account holds about you, in one document.",
    /*
      ⚠️ A READ, AND IT STILL ASKS. This is the one read in the platform that
      hands over EVERYTHING at once — the vault, the addresses, the record of who
      looked at what — which makes it the single most valuable thing a borrowed
      session can be pointed at. The rule that reads are never gated is about
      withholding somebody's own records from THEM; this is about handing them to
      whoever is holding the laptop.
    */
    proof: "recent",
    input: nothing(),
    output: s.object({ at: s.instant(), tables: s.json(), dropped: s.json(), account: s.json(), workspaces: s.json() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    fails: ["platform.forbidden"],
    /*
      ⚠️ NOT A TOOL. This is every row the platform has about somebody — their
      vault, who read it, what they agreed to and where they are signed in — and
      a model that can request one can be asked to summarise it somewhere it
      should not go.
    */
    tool: false,
    async handler(ctx) {
      const d = deps(ctx);
      if (!d.session) ctx.fail("platform.forbidden", { reason: "sign in first" });
      return d.exportMe(ctx.now());
    },
  });

  const close = operation({
    id: "exit.account.close",
    kind: "write",
    summary: "Close your account. Reversible for seven days.",
    /* ⚠️ THE MOST DESTRUCTIVE THING THIS PLATFORM CAN BE ASKED TO DO. Seven days
       of grace is what makes it survivable; a recent proof is what stops it
       being started by somebody who simply found the tab open. */
    proof: "recent",
    input: s.object({ reason: s.optional(s.text({ max: 500 })) }),
    output: s.object({ closesAt: s.instant() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    audit: () => ({ subject: "account", verb: "close" }),
    outcome: { message: "Your account is closing", tone: "warning", invalidates: ["exit.account.status"] },
    fails: ["platform.forbidden", "platform.conflict"],
    /*
      ⚠️ NOT A TOOL, and this is the clearest case in the file. A model that can
      close somebody's account can be talked into it by a sentence in something it
      was asked to read.
    */
    tool: false,
    async handler(ctx, input: { reason?: string }) {
      const d = deps(ctx);
      if (!d.session) ctx.fail("platform.forbidden", { reason: "sign in first" });

      /*
        ⚠️ CLOSING AN ACCOUNT MAY NEVER CLOSE A WORKSPACE. They are different
        things with different consequences for different people — a workspace has
        colleagues, records and a bill — so this refuses and names them rather
        than deciding on somebody's behalf. Handing over or closing each is the
        person's own call, and both are operations they already have.
      */
      const blocking = await d.wouldStrandOnLeaving();
      if (blocking.length) {
        ctx.fail("platform.conflict", { field: "account", reason: "last_administrator", workspaces: blocking.join(", ") });
      }

      const closesAt = new Date(Date.parse(ctx.now()) + CLOSING_DAYS * 86_400_000).toISOString() as Instant;
      await d.directory.run(
        `UPDATE accounts SET closing_at = ? WHERE id = ?`, closesAt, d.session!.accountId,
      );
      /* ⚠️ The reason is audited and not stored on the account: it is a thing
         somebody said once, not a property of them. */
      void input.reason;
      return { closesAt };
    },
  });

  const reopen = operation({
    id: "exit.account.cancel",
    kind: "write",
    summary: "Change your mind about closing your account.",
    input: nothing(),
    output: s.object({ ok: s.bool() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    audit: () => ({ subject: "account", verb: "reopen" }),
    /* ⚠️ Somebody changed their mind about leaving. That is worth saying properly. */
    outcome: { message: "Welcome back", tone: "success", moment: "welcome", invalidates: ["exit.account.status"] },
    fails: ["platform.forbidden"],
    async handler(ctx) {
      const d = deps(ctx);
      if (!d.session) ctx.fail("platform.forbidden", { reason: "sign in first" });
      await d.directory.run(`UPDATE accounts SET closing_at = '' WHERE id = ?`, d.session!.accountId);
      return { ok: true };
    },
  });

  return [requestCode, verifyCode, registerBegin, registerFinish, signInBegin, signInFinish, whoami, signOut, preferences, setPreferences, sessionList, endSession, keyList, keyRemove, workspaces, leave, closing, exportAccount, close, reopen] as unknown as readonly AnyOperation[];
}

/* ⚠️ An unreadable copy is no branding rather than a throw on a list somebody
   opened. It is a convenience field on a routing row. */
const parseBranding = (text: string | null): Readonly<Record<string, string>> => {
  if (!text) return {};
  try { return JSON.parse(text) as Record<string, string>; } catch { return {}; }
};

/* ⚠️ An unreadable layout is no layout. It decides an ORDER, so falling back to
   the product's own is always a working screen. */
const parseLayout = (text: string): readonly string[] => {
  if (!text) return [];
  try {
    const v = JSON.parse(text) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 20) : [];
  } catch { return []; }
};
