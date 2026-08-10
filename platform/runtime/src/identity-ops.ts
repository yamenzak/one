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
import { sessionCookie, clearedCookie } from "./identity.js";

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
   * ⚠️ WHICH OF THESE WORKSPACES THIS PERSON IS IN, asked of the regions rather
   * than guessed. Memberships are regional and the directory is global, so
   * "where do I belong" is a question one store cannot answer alone.
   */
  mineIn(tenantIds: readonly string[]): Promise<ReadonlySet<string>>;
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
    summary: "How you read weights and measures.",
    input: nothing(),
    output: s.object({ units: s.text(), layout: s.json() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      if (!d.session) return { units: "", layout: [] };
      const row = await d.directory.first<{ units: string | null; layout: string | null }>(
        `SELECT units, layout FROM accounts WHERE id = ?`, d.session.accountId,
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
      return { units: row?.units ?? "", layout: parseLayout(row?.layout ?? "") };
    },
  });

  const setPreferences = operation({
    id: "me.preferences.set",
    kind: "write",
    summary: "Change how you read weights and measures, and what you see first.",
    input: s.object({
      units: s.optional(s.enum(["", "metric", "imperial"])),
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
    async handler(ctx, input: { units?: string; layout?: readonly string[] }) {
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
        ⚠️ READ FROM MEMBERSHIP AND THE DIRECTORY, WHICH ARE IN DIFFERENT
        STORES. Memberships are regional and the directory is global, so this
        cannot be one join — and the honest order is directory-first, because the
        directory is the thing that knows which region to ask.
      */
      const rows = await d.directory.all<{ slug: string; tenant_id: string; branding: string | null }>(
        `SELECT slug, tenant_id, branding FROM tenant_directory ORDER BY slug LIMIT 200`,
      ).catch(() => []);
      const mine = await d.mineIn(rows.map((r) => r.tenant_id));
      return {
        workspaces: rows
          .filter((r) => mine.has(r.tenant_id))
          .map((r) => ({ slug: r.slug, tenantId: r.tenant_id, branding: parseBranding(r.branding) })),
      };
    },
  });

  return [requestCode, verifyCode, registerBegin, registerFinish, signInBegin, signInFinish, whoami, signOut, preferences, setPreferences, workspaces] as unknown as readonly AnyOperation[];
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
