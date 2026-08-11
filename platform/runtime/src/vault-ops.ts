/**
 * THE VAULT'S SURFACE — the person's side, and the app's.
 *
 * ⚠️ TWO AUDIENCES, TWO SETS OF OPERATIONS, AND THEY MUST NOT BE ONE. Everything
 * under `vault.*` is answered FOR THE SIGNED-IN PERSON about their own facts, so
 * its permission is `PUBLIC` and its subject is always the session's account —
 * never an id in the body. Everything under `subject.*` is an app asking to see
 * somebody ELSE, and every one of those goes through `mayRead`.
 *
 * A single "read a fact" operation taking an account id would collapse the two,
 * and the collapse is not theoretical: it is one missing comparison between
 * "read my own weight" and "read anybody's weight".
 *
 * ⚠️ AND THE PERSON'S OWN OPERATIONS ARE MOUNTED ON A TENANTLESS LANE. The
 * account centre answers on the `identity` door, where there is no workspace and
 * no membership — which is the whole point of that door. An operation here that
 * needed a tenancy would be unreachable for somebody who has left every
 * workspace they were in, which is exactly the person most likely to be
 * reviewing what they have shared.
 */

import type {
  AnyOperation, AppSpec, Reach, BindingSpec, Grant, Instant, PlainDate, Session, SqlHandle, UserId,
} from "@one/kernel";
import { REACH, FACTS, factOf, operation, PUBLIC, readingOf, s } from "@one/kernel";
import { derive, readDerived, readFact, stateOf, vaultStore, type VaultStore } from "./vault.js";

/** ⚠️ A symbol, so an app cannot reach the vault by writing a property name. */
export const VAULT = Symbol.for("one.runtime.vault");

export interface VaultDeps {
  /** ⚠️ The GLOBAL store. A fact belongs to the account, not to a region. */
  readonly directory: SqlHandle;
  readonly session: Session | null;
  readonly appId: string;
  /** Null on a tenantless door — which is where the person's own screens are. */
  readonly tenantId: string | null;
  readonly now: Instant;
  /** ⚠️ The reader's own day, from their device. A vault series is day-bucketed. */
  readonly today: PlainDate;
}

export interface VaultCarrier { readonly [VAULT]: VaultDeps }

const deps = (ctx: unknown): VaultDeps => (ctx as VaultCarrier)[VAULT];

/**
 * ⚠️ THE PERMISSION AN APP NEEDS TO ASK ANYTHING OF THE VAULT ABOUT SOMEBODY
 * ELSE, and it is one word for every product so a role builder cannot spell it
 * differently per app. Holding it is not permission to READ anything — every
 * read still resolves a grant — it is permission to be a party that could be
 * granted something.
 */
export const VAULT_PERMISSION = "vault:read";

const store = (d: VaultDeps): VaultStore => vaultStore(d.directory);

/**
 * How far an app is reading at, from what it says it is doing.
 *
 * ⚠️ IT DEFAULTS TO THE HIGHEST RUNG, WHICH IS THE STRICT DIRECTION. An
 * unrecognised value means the caller asked for something this platform does not
 * understand, and resolving that as `compute` would grant the read against the
 * loosest gate a person had agreed to.
 */
const reachAsked = (raw: string | undefined): Reach =>
  REACH.includes(raw as Reach) ? (raw as Reach) : "staff";

export function vaultOperations<B extends BindingSpec>(app: AppSpec<B>): readonly AnyOperation[] {
  /*
    ⚠️ THE CATALOGUE IS THE PLATFORM'S REGISTRY NARROWED BY THIS APP'S ASK, and
    both halves matter. The registry alone would offer somebody a consent sheet
    full of facts this product has no use for — which trains people to grant
    things nobody wanted. This app's ask alone would give the account centre
    nothing to show for a fact the person holds and no current app wants.
  */
  const wants = new Map((app.vault?.wants ?? []).map((w) => [w.fact, w]));

  /* ------------------------------------------------------------ the person */

  const mine = operation({
    id: "vault.mine",
    kind: "read",
    summary: "Your own facts, and who you have shared each one with.",
    input: s.object({}),
    output: s.object({ facts: s.json() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    /*
      ⚠️ NEVER A TOOL. This is the whole of somebody's sensitive data with the
      grants over it, answered for whoever is signed in — handing it to a model
      as a callable would make every fact readable at the `agent` rung whatever
      the person granted, which is the one rung they most deliberately chose.
    */
    tool: false,
    async handler(ctx) {
      const d = deps(ctx);
      if (!d.session) return { facts: [] };
      const state = await stateOf(store(d), d.session.accountId, d.now);
      const byFact = new Map(state.map((f) => [f.fact, f]));
      /* ⚠️ EVERY DECLARED FACT, NOT ONLY THE ONES HELD. A vault that showed only
         what somebody had already filled in would be a screen that starts empty
         and never explains what it is for. */
      return {
        facts: FACTS.map((f) => ({
          fact: f.id,
          label: f.label,
          kind: f.kind,
          ...(f.values ? { values: f.values } : {}),
          ...(f.dimension ? { dimension: f.dimension } : {}),
          series: f.series,
          suggests: f.suggests ?? "self",
          ...(f.because ? { because: f.because } : {}),
          readings: (f.readings ?? []).map((r) => ({ id: r.id, label: r.label, says: r.says, hides: r.hides })),
          held: byFact.get(f.id)?.held ?? false,
          grants: byFact.get(f.id)?.grants ?? [],
          /* What THIS app asked for, so the screen can say why it is here. */
          ...(wants.has(f.id) ? { asked: wants.get(f.id) } : {}),
        })),
      };
    },
  });

  const read = operation({
    id: "vault.read",
    kind: "read",
    summary: "One of your own facts, and its history.",
    input: s.object({ fact: s.text({ max: 60 }), history: s.optional(s.bool()) }),
    output: s.object({ value: s.optional(s.text()), at: s.optional(s.text()), history: s.json() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    tool: false,
    fails: ["platform.forbidden", "platform.invalid"],
    async handler(ctx, input: { fact: string; history?: boolean }) {
      const d = deps(ctx);
      if (!d.session) ctx.fail("platform.forbidden", { reason: "sign in first" });
      if (!factOf(input.fact)) ctx.fail("platform.invalid", { field: "fact" });
      const v = store(d);
      /*
        ⚠️ NO GRANT IS RESOLVED HERE AND THAT IS CORRECT: the subject is the
        session's own account, and a person does not grant themselves access to
        their own facts. The safety property is that `accountId` comes from the
        session and can never come from the body.
      */
      const rows = input.history
        ? await v.history(d.session!.accountId, input.fact)
        : await v.latest(d.session!.accountId, input.fact).then((r) => (r ? [r] : []));
      const now = rows[0];
      return {
        ...(now ? { value: now.value, at: now.at } : {}),
        history: input.history ? rows.map((r) => ({ at: r.at, value: r.value })) : [],
      };
    },
  });

  const write = operation({
    id: "vault.record",
    kind: "write",
    summary: "Record one of your own facts.",
    input: s.object({
      fact: s.text({ max: 60 }),
      value: s.text({ max: 2_000 }),
      /* ⚠️ The person's own day, from their device — a weight recorded at 11pm
         in Dubai is not the next day's. Absent means today where they are. */
      at: s.optional(s.text({ max: 10 })),
    }),
    output: s.object({ ok: s.bool() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    outcome: { message: "Saved", tone: "success", invalidates: ["vault.mine", "vault.read"] },
    tool: false,
    fails: ["platform.forbidden", "platform.invalid"],
    async handler(ctx, input: { fact: string; value: string; at?: string }) {
      const d = deps(ctx);
      if (!d.session) ctx.fail("platform.forbidden", { reason: "sign in first" });
      const spec = factOf(input.fact);
      if (!spec) ctx.fail("platform.invalid", { field: "fact" });
      if (spec!.kind === "enum" && !spec!.values?.includes(input.value)) {
        ctx.fail("platform.invalid", { field: "value" });
      }
      /*
        ⚠️ A FACT WITH NO SERIES KEEPS ONE ROW, AND THE DAY IS NOT THE PERSON'S
        CHOICE. Storing a birth date under the day it was typed would make
        "correct my birth date" produce two birth dates — and every reader takes
        the most recent day, so the wrong one wins until somebody edits again.
      */
      const at = (spec!.series ? (input.at ?? d.today) : "0001-01-01") as PlainDate;
      await store(d).put(d.session!.accountId, input.fact, at, input.value, d.now);
      return { ok: true };
    },
  });

  const forget = operation({
    id: "vault.forget",
    kind: "write",
    summary: "Delete one of your own facts.",
    input: s.object({ fact: s.text({ max: 60 }), at: s.optional(s.text({ max: 10 })) }),
    output: s.object({ ok: s.bool() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    outcome: { message: "Deleted", tone: "success", invalidates: ["vault.mine", "vault.read"] },
    tool: false,
    fails: ["platform.forbidden"],
    async handler(ctx, input: { fact: string; at?: string }) {
      const d = deps(ctx);
      if (!d.session) ctx.fail("platform.forbidden", { reason: "sign in first" });
      await store(d).forget(d.session!.accountId, input.fact, input.at as PlainDate | undefined);
      return { ok: true };
    },
  });

  /* ------------------------------------------------------------- the grants */

  const share = operation({
    id: "vault.share",
    kind: "write",
    summary: "Share one of your facts with an app, at a level you choose, for as long as you choose.",
    input: s.object({
      fact: s.text({ max: 60 }),
      /* ⚠️ Defaulted to THIS app rather than accepted freely. A body that could
         name any app would let a page somebody was tricked into opening grant
         a different product access to their health data. */
      workspace: s.optional(s.text({ max: 60 })),
      /* ⚠️ EVERY RUNG, INCLUDING `compute` — which is the one somebody most
         often wants and the one an incomplete list silently makes unreachable.
         A person granting "the maths may use this, nobody may see it" would have
         been answered 400 by a validator that knew three of the four. */
      reach: s.enum(["self", "compute", "agent", "staff"]),
      /** Days. ⚠️ Absent is "until I change it", which is a real answer. */
      days: s.optional(s.number({ integer: true, min: 1, max: 3_650 })),
    }),
    output: s.object({ ok: s.bool(), expiresAt: s.optional(s.text()) }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    outcome: { message: "Shared", tone: "success", invalidates: ["vault.mine"] },
    tool: false,
    fails: ["platform.forbidden", "platform.invalid"],
    async handler(ctx, input: { fact: string; workspace?: string; reach: Reach; days?: number }) {
      const d = deps(ctx);
      if (!d.session) ctx.fail("platform.forbidden", { reason: "sign in first" });
      /*
        ⚠️ A READING IS GRANTED IN ITS OWN RIGHT, so this accepts either id. "My
        coach may see which way my weight is going; my coach may not see my
        weight" is two decisions about two different disclosures, and a share
        that only knew about facts could express one of them.
      */
      if (!factOf(input.fact) && !readingOf(input.fact)) ctx.fail("platform.invalid", { field: "fact" });

      /*
        ⚠️ `self` IS A REVOCATION, NOT A GRANT AT THE BOTTOM RUNG. Every fact is
        already the person's; a row saying "shared with nobody" is a row every
        resolver has to interpret, and the one that reads it as a grant is the
        bug. Writing the bottom rung as a revoke means there is one shape for
        "not shared" — no row — and the log still records the decision.
      */
      const tenant = input.workspace ?? d.tenantId;
      if (input.reach === "self") {
        await store(d).revoke(d.session!.accountId, input.fact, d.appId, tenant, d.now);
        return { ok: true };
      }

      const expiresAt = input.days
        ? (new Date(Date.parse(d.now) + input.days * 86_400_000).toISOString() as Instant)
        : null;
      const g: Grant = {
        accountId: d.session!.accountId,
        fact: input.fact,
        appId: d.appId,
        tenantId: tenant,
        reach: input.reach,
        expiresAt,
        grantedAt: d.now,
        via: "sheet",
      };
      await store(d).grant(g);
      return { ok: true, ...(expiresAt ? { expiresAt } : {}) };
    },
  });

  const unshare = operation({
    id: "vault.unshare",
    kind: "write",
    summary: "Stop sharing one of your facts.",
    input: s.object({ fact: s.text({ max: 60 }), app: s.optional(s.text({ max: 60 })), workspace: s.optional(s.text({ max: 60 })) }),
    output: s.object({ ok: s.bool() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    outcome: { message: "Stopped sharing", tone: "success", invalidates: ["vault.mine"] },
    tool: false,
    fails: ["platform.forbidden"],
    async handler(ctx, input: { fact: string; app?: string; workspace?: string }) {
      const d = deps(ctx);
      if (!d.session) ctx.fail("platform.forbidden", { reason: "sign in first" });
      /*
        ⚠️ AN APP MAY BE NAMED HERE WHERE IT MAY NOT BE ON `share`, and the
        asymmetry is the right way round: naming another app can only ever take
        access away. The account centre lists every app a person has shared with,
        so revoking has to reach the ones they are not currently inside.
      */
      await store(d).revoke(
        d.session!.accountId, input.fact, input.app ?? d.appId,
        input.workspace ?? (input.app ? null : d.tenantId), d.now,
      );
      return { ok: true };
    },
  });

  const history = operation({
    id: "vault.disclosures",
    kind: "read",
    summary: "Who has read your facts, and when.",
    input: s.object({}),
    output: s.object({ disclosures: s.json() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    tool: false,
    async handler(ctx) {
      const d = deps(ctx);
      if (!d.session) return { disclosures: [] };
      const rows = await store(d).disclosures(d.session.accountId);
      return {
        disclosures: rows.map((r) => ({
          ...r,
          label: factOf(r.fact)?.label ?? r.fact,
        })),
      };
    },
  });

  /* ---------------------------------------------------------- somebody else */

  /**
   * ⚠️ THE ONE OPERATION AN APP USES TO SEE SOMEBODY ELSE, and it answers with a
   * REFUSAL rather than a 403 when nothing is shared. "Not shared with you" is
   * not a permission failure — it is a decision the person made and is entitled
   * to — and a screen that renders it as an access error tells a coach their
   * client's privacy choice is a configuration problem.
   */
  const about = operation({
    id: "subject.fact",
    kind: "read",
    summary: "A fact about somebody, if they have shared it here.",
    input: s.object({
      account: s.text({ max: 64 }),
      fact: s.text({ max: 60 }),
      /* ⚠️ A reading rather than the value, where the app asked for one. */
      reading: s.optional(s.text({ max: 80 })),
      as: s.optional(s.enum(["compute", "agent", "staff"])),
    }),
    output: s.object({ shared: s.bool(), why: s.optional(s.text()), value: s.optional(s.text()), at: s.optional(s.text()), derived: s.json() }),
    permission: VAULT_PERMISSION,
    idempotency: { mode: "none" },
    /*
      ⚠️ IT IS A TOOL — the default, and left as the default deliberately. The
      `as` parameter is what makes that safe: a model calling it reads at the
      `agent` rung, so a fact granted only to an agent is available to the
      assistant and refused to the coach reading the same screen, which is the
      rung the whole ladder exists for. A model passing `staff` would be a
      laundering path, so the runtime pins the audience for a tool caller rather
      than trusting the argument.
    */
    fails: ["platform.forbidden", "platform.invalid"],
    async handler(ctx, input: { account: string; fact: string; reading?: string; as?: Reach }) {
      const d = deps(ctx);
      if (!d.session) ctx.fail("platform.forbidden", { reason: "sign in first" });
      const reach = reachAsked(input.as);
      const v = store(d);
      const look = {
        accountId: input.account as UserId,
        appId: d.appId,
        tenantId: d.tenantId,
        reach,
        readerId: d.session!.accountId,
        today: d.today,
        now: d.now,
      };

      if (input.reading) {
        if (!readingOf(input.reading)) ctx.fail("platform.invalid", { field: "reading" });
        const out = await readDerived(v, { ...look, reading: input.reading });
        return out.seen
          ? { shared: true, derived: out.derived }
          : { shared: false, why: out.why, derived: null };
      }

      if (!factOf(input.fact)) ctx.fail("platform.invalid", { field: "fact" });
      const out = await readFact(v, { ...look, fact: input.fact });
      return out.seen
        ? { shared: true, value: out.value, at: out.at, derived: null }
        : { shared: false, why: out.why, derived: null };
    },
  });

  /**
   * WHAT THIS APP WOULD LIKE TO SEE, AND WHAT IT HAS.
   *
   * ⚠️ THIS IS WHAT THE CONSENT SHEET IS RENDERED FROM, and it is answered for
   * the signed-in person about their OWN account — so an app cannot use it to
   * discover what somebody else has withheld. A version that took an account id
   * would let a coach enumerate exactly which facts a client had declined, which
   * is a disclosure the refusal codes are carefully written to avoid.
   */
  const asked = operation({
    id: "vault.asked",
    kind: "read",
    summary: "What this app has asked to see of your facts, and what you have decided.",
    input: s.object({}),
    output: s.object({ app: s.text(), wants: s.json() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    tool: false,
    async handler(ctx) {
      const d = deps(ctx);
      const list = app.vault?.wants ?? [];
      if (!d.session || !list.length) return { app: app.name, wants: [] };

      const v = store(d);
      const [grants, held] = await Promise.all([v.grants(d.session.accountId), v.holds(d.session.accountId)]);
      return {
        app: app.name,
        wants: list.flatMap((w) => {
          const fact = factOf(w.fact);
          if (!fact) return [];
          const here = grants.filter(
            (g) => g.fact === w.fact && g.appId === d.appId && (g.tenantId === null || g.tenantId === d.tenantId),
          );
          const best = here.filter((g) => g.expiresAt === null || g.expiresAt > d.now)
            .reduce<Grant | null>((a, b) => (!a || REACH.indexOf(b.reach) > REACH.indexOf(a.reach) ? b : a), null);
          return [{
            fact: w.fact,
            label: fact.label,
            kind: fact.kind,
            why: w.why,
            need: w.need,
            required: w.required ?? false,
            /* ⚠️ The FACT's recommendation, not the app's, where they differ —
               and they cannot differ upward, which composition refuses. */
            recommend: w.recommend ?? fact.suggests ?? "self",
            because: fact.because ?? null,
            readings: (w.readings ?? []).flatMap((r) => {
              const spec = readingOf(r);
              return spec ? [{ id: r, label: spec.label, says: spec.says, hides: spec.hides }] : [];
            }),
            held: held.has(w.fact),
            /* `self` where nothing is granted — one shape for "not shared". */
            reach: best?.reach ?? "self",
            expiresAt: best?.expiresAt ?? null,
          }];
        }),
      };
    },
  });

  /*
    ⚠️ AN APP THAT ASKS FOR NOTHING GETS THE PERSON'S OWN SURFACE AND NOT THE
    APP'S. The account centre is the platform's and answers on every product —
    somebody has facts and grants whether or not the app in front of them wants
    any — while `subject.fact` and `vault.asked` are meaningless with no ask and
    would be a route that exists to refuse.
  */
  const personal = [mine, read, write, forget, share, unshare, history];
  const appSide = (app.vault?.wants ?? []).length ? [about, asked] : [];
  return [...personal, ...appSide] as unknown as readonly AnyOperation[];
}

/** ⚠️ Re-exported so an app never reaches into the store module directly. */
export { derive };
