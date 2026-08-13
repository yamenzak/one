/**
 * THE OPERATOR DOOR — the five things somebody running a deployment has to be
 * able to do, and could not.
 *
 * ⚠️ EVERY ONE OF THESE WAS A MECHANISM WITH NO SURFACE. The directory knew
 * every workspace and nothing listed them. `subscription.adjusted_json` was
 * read by the entitlement walk, explained by `explainEntitlements`, and written
 * by nobody. The ledger summed a balance nothing could add to. The maintenance
 * switch was read on every request, enforced above the public gate, and had no
 * way to be turned on. Each was declared, tested, correct, and unreachable —
 * which is the failure this platform is a reaction to, committed by the platform.
 *
 * ⚠️ AND THEY CARRY THEIR OWN PERMISSION RATHER THAN BILLING'S. What these five
 * have in common is not money: it is acting on ANOTHER workspace from outside
 * it, which is the one power in the product that no member of that workspace
 * holds. A key of its own is what lets an app grant the payment lane to somebody
 * without also handing them every studio on the deployment.
 */

import type { Allowance, AnyOperation, AppSpec, BindingSpec, Instant, Money, PlanOverride, PlanOverrides, RegionId, SchemaModule, SqlHandle } from "@one/kernel";
import { catalogueOf, operation, refuseCatalogueEdit, s, snapshotDowngrade } from "@one/kernel";
import { balance, record } from "./ledger.js";
import { begin, end, historyFor } from "./impersonation.js";
import { CREDITS } from "./generate.js";
import { OPEN, readMaintenance, setMaintenance, type Maintenance } from "./maintenance.js";
import { readSubscription } from "./commerce.js";
import { compSubscription, grantCredits, setAdjustments, subscriptionForTenant } from "./account-billing.js";

/** ⚠️ Held by the operator role and by nothing a workspace can grant. */
export const OPERATE = "platform:operate";

/** ⚠️ A symbol, so an app cannot reach another workspace by writing a property name. */
export const OPERATOR = Symbol.for("one.runtime.operator");

export interface OperatorDeps {
  /** The global store: the directory, and the deployment's own switches. */
  readonly global: SqlHandle;
  /**
   * ⚠️ ANOTHER WORKSPACE'S REGION, RESOLVED AND BOOTED. An operator acts from
   * one door on workspaces in every region, so the caller's own bindings are the
   * wrong store for all but one of them — and a region nobody has visited yet
   * has no tables until something opens it.
   */
  regionalIn(region: RegionId): Promise<SqlHandle>;
  /** Who is operating. Null where nobody is signed in — nothing may be acted as. */
  readonly operatorId: string | null;
  /** ⚠️ The manifest's ceiling on a support session. A request may ask for less. */
  readonly maxMinutes: number;
  /** ⚠️ Whether the workspace is told. The manifest decides; this carries it out. */
  readonly announce: boolean;
  announceTo(tenantId: string, reason: string): Promise<void>;
  /**
   * ⚠️ EVERY REGION THIS DEPLOYMENT HAS, because some operator acts reach ALL
   * workspaces rather than one named workspace. Holding an existing subscriber
   * at what they were sold is the sharpest: a snapshot written only where the
   * operator happens to be is a promise kept for some customers, and the ones it
   * is broken for are the ones furthest from whoever would notice.
   */
  readonly regions: readonly RegionId[];
  readonly actorId: string;
}

export interface OperatorCarrier { readonly [OPERATOR]: OperatorDeps }

const deps = (ctx: unknown): OperatorDeps => (ctx as OperatorCarrier)[OPERATOR];

interface Row { tenant_id: string; slug: string; region: string; standing: string; standing_reason: string }

/** Where a workspace lives, or nothing. */
async function placeOf(global: SqlHandle, tenantId: string): Promise<Row | null> {
  return global.first<Row>(
    `SELECT tenant_id, slug, region, standing, standing_reason FROM tenant_directory WHERE tenant_id = ?`, tenantId,
  ).catch(() => null);
}

export function operatorOperations<B extends BindingSpec>(app: AppSpec<B>): readonly AnyOperation[] {
  const plans = new Set(app.access.plans.map((p) => p.id));
  const entitlements = new Set(Object.keys(app.access.entitlements));

  /* ------------------------------------------------------------- the list --- */

  const tenants = operation({
    id: "admin.tenants",
    kind: "read",
    summary: "Every workspace on this deployment, and what it is on.",
    input: s.object({ limit: s.optional(s.number({ integer: true, min: 1, max: 200 })), search: s.optional(s.text({ max: 80 })) }),
    output: s.object({ tenants: s.json() }),
    permission: OPERATE,
    idempotency: { mode: "none" },
    /*
      ⚠️ NOT A TOOL. It is every customer this deployment has, in one answer, and
      a model that can request it can be asked to summarise it somewhere else.
    */
    tool: false,
    async handler(ctx, input: { limit?: number; search?: string }) {
      const d = deps(ctx);
      const limit = Math.min(input.limit ?? 50, 200);
      const rows = await d.global.all<Row>(
        `SELECT tenant_id, slug, region, standing, standing_reason FROM tenant_directory
         ${input.search ? "WHERE slug LIKE ?" : ""} ORDER BY slug LIMIT ?`,
        ...(input.search ? [`%${input.search}%`] : []), limit,
      ).catch(() => []);

      /*
        ⚠️ THE PLAN IS READ FROM THE WORKSPACE'S OWN REGION, one at a time. The
        directory holds routing only — deliberately, so it can be replicated
        everywhere — so what a workspace is ON is not in it, and a list that
        showed standing without a plan would answer half the question anybody
        opens this screen with.
      */
      const out = [];
      for (const row of rows) {
        const db = await d.regionalIn(row.region as RegionId).catch(() => null);
        /* ⚠️ THE ACCOUNT'S SUBSCRIPTION, which is the one the gate resolves. Read
           from the region, this list would show a plan nothing enforces — and an
           operator screen that disagrees with the gate is worse than none. */
        const sub = await subscriptionForTenant(d.global, row.tenant_id).catch(() => null);
        out.push({
          tenantId: row.tenant_id, slug: row.slug, region: row.region,
          standing: row.standing, reason: row.standing_reason,
          plan: sub?.planId ?? null, status: sub?.status ?? null,
          /* ⚠️ Reported, so a region that will not open is visible rather than blank. */
          reachable: db !== null,
        });
      }
      return { tenants: out };
    },
  });

  /* ------------------------------------------------------ acting as them --- */

  /**
   * ⚠️ TIME-BOXED, ANNOUNCED AND WRITTEN DOWN — the three properties a manifest
   * has declared since the first app while nothing read the declaration.
   *
   * There is no token. What exists is a ROW naming an operator and a workspace,
   * and every request the operator makes on that workspace's origin is resolved
   * against it — so ending a session is a write, expiry is a comparison, and
   * there is nothing that can be copied out of a log and used afterwards.
   */
  const impersonate = operation({
    id: "admin.impersonate",
    kind: "write",
    summary: "Act inside a workspace to help them, for a bounded time, on the record.",
    input: s.object({
      tenantId: s.text({ max: 60 }),
      /*
        ⚠️ REQUIRED, AND LONG ENOUGH TO BE A SENTENCE. "Investigating a report of
        missing records, ticket 4471" is what makes the row answerable six months
        later; "support" is what makes it a row nobody can act on.
      */
      reason: s.text({ min: 8, max: 500 }),
      minutes: s.optional(s.number({ integer: true, min: 1, max: 240 })),
    }),
    output: s.object({ id: s.text(), expiresAt: s.instant() }),
    permission: OPERATE,
    idempotency: { mode: "none" },
    audit: (i: { tenantId: string }) => ({ subject: i.tenantId, verb: "impersonate" }),
    /*
      ⚠️ DECLARED, THOUGH THE DERIVED DISPATCH CANNOT CARRY IT. `emits` announces
      to the audience of the CALLER's workspace, and an operator is on a door
      with no workspace at all — so the announcement is made explicitly, to the
      workspace being entered, in its own region.

      It is still declared, because the declaration is what puts the event in the
      webhook catalogue and forces every app to write copy for it. An
      announcement made by code and known to no registry is one no app can
      translate, no tenant can subscribe to, and nothing checks the copy of.
    */
    emits: ["support.session"],
    outcome: { message: "Acting as this workspace", tone: "warning", invalidates: ["admin.tenants"] },
    fails: ["platform.not_found", "platform.invalid", "platform.conflict"],
    /*
      ⚠️ NEVER A TOOL. A model that can act as a workspace's owner is one sentence
      in a document away from doing it, and everything it then does is recorded
      against a person who was not there.
    */
    tool: false,
    async handler(ctx, input: { tenantId: string; reason: string; minutes?: number }) {
      const d = deps(ctx);
      const where = await placeOf(d.global, input.tenantId);
      if (!where) ctx.fail("platform.not_found", { field: "tenantId" });
      if (!d.operatorId) ctx.fail("platform.invalid", { reason: "sign in first" });

      const out = await begin(d.global, {
        operatorId: d.operatorId!,
        tenantId: input.tenantId,
        reason: input.reason,
        /* ⚠️ The manifest's ceiling, and a request may only ask for less. */
        maxMinutes: Math.min(input.minutes ?? d.maxMinutes, d.maxMinutes),
      }, ctx.now());
      if (!out.ok) {
        if (out.why === "already_live") ctx.fail("platform.conflict", { reason: out.why });
        ctx.fail("platform.invalid", { reason: out.why });
      }
      const live = (out as Extract<typeof out, { ok: true }>).live;

      /*
        ⚠️ ANNOUNCED, WHERE THE MANIFEST SAYS SO. A support session somebody is
        not told about is indistinguishable, from inside the workspace, from
        somebody having got in — and the difference is exactly what the person
        looking at their own audit needs to be able to tell.
      */
      if (d.announce) await d.announceTo(input.tenantId, input.reason);

      return { id: live.id, expiresAt: live.expiresAt as Instant };
    },
  });

  const stopActing = operation({
    id: "admin.impersonate.end",
    kind: "write",
    summary: "Stop acting inside a workspace.",
    input: s.object({ id: s.text({ max: 40 }) }),
    output: s.object({ ok: s.bool() }),
    permission: OPERATE,
    idempotency: { mode: "natural", key: "id" },
    audit: (i: { id: string }) => ({ subject: i.id, verb: "impersonate-end" }),
    outcome: { message: "Stopped", tone: "success", invalidates: ["admin.tenants"] },
    tool: false,
    async handler(ctx, input: { id: string }) {
      const d = deps(ctx);
      /* ⚠️ Ended rather than deleted: an operator who can remove their own
         support session can remove the only record of what they did in it. */
      if (d.operatorId) await end(d.global, input.id, d.operatorId, ctx.now());
      return { ok: true };
    },
  });

  const sessions = operation({
    id: "admin.impersonations",
    kind: "read",
    summary: "Every time somebody acted inside this workspace, and why.",
    input: s.object({ tenantId: s.text({ max: 60 }), limit: s.optional(s.number({ integer: true, min: 1, max: 200 })) }),
    output: s.object({ sessions: s.json() }),
    permission: OPERATE,
    idempotency: { mode: "none" },
    async handler(ctx, input: { tenantId: string; limit?: number }) {
      const d = deps(ctx);
      return { sessions: await historyFor(d.global, input.tenantId, Math.min(input.limit ?? 50, 200)) };
    },
  });

  /* ------------------------------------------------------------ comping --- */

  const comp = operation({
    id: "admin.comp",
    kind: "write",
    summary: "Put a workspace on a plan without a payment, for a reason.",
    input: s.object({
      tenantId: s.text({ max: 60 }),
      planId: s.text({ max: 60 }),
      /*
        ⚠️ THE REASON IS REQUIRED, and it is the whole difference between this
        and a way to give the product away. Somebody reads this row a year later
        asking why a workspace pays nothing, and "because an operator said so"
        with no name against it is not an answer.
      */
      reason: s.text({ min: 3, max: 500 }),
    }),
    output: s.object({ plan: s.text() }),
    permission: OPERATE,
    idempotency: { mode: "none" },
    audit: (i: { tenantId: string }) => ({ subject: i.tenantId, verb: "comp" }),
    outcome: { message: "Comped", tone: "success", invalidates: ["admin.tenants"] },
    fails: ["platform.not_found", "platform.invalid"],
    tool: false,
    async handler(ctx, input: { tenantId: string; planId: string; reason: string }) {
      const d = deps(ctx);
      const where = await placeOf(d.global, input.tenantId);
      if (!where) ctx.fail("platform.not_found", { field: "tenantId" });
      /*
        ⚠️ A PLAN THIS APP DOES NOT SELL RESOLVES TO NOTHING AT THE GATE, so the
        workspace would land on the parking floor while every screen showed them
        on a plan. Refused rather than stored.
      */
      if (!plans.has(input.planId)) ctx.fail("platform.invalid", { field: "planId" });

      /*
        ⚠️ `active`, AND `past_due_at` CLEARED. A workspace comped while the
        dunning ladder was counting would keep its anchor and be suspended on
        schedule for an invoice nobody is waiting for.

        ⚠️ AND IT IS WRITTEN ON THE ACCOUNT'S SUBSCRIPTION, WHICH IS WHERE THE
        GATE READS. Written to a regional table nothing resolves against, comping
        a workspace would answer 200, record an audit entry, and change nothing
        anybody could see — which is the shape this whole rail exists to make
        impossible.
      */
      await compSubscription(d.global, { tenantId: input.tenantId, productId: app.id, planId: input.planId }, ctx.now());
      return { plan: input.planId };
    },
  });

  /* ---------------------------------------------------------- adjusting --- */

  const adjust = operation({
    id: "admin.adjust",
    kind: "write",
    summary: "Change one workspace's ceilings without editing the plan everybody is on.",
    /*
      ⚠️ A DIFF, AND `null` CLEARS. This is the operator's deliberate per-workspace
      setting — absolute, either direction, per key — and it is a DIFFERENT column
      from the grandfathering one for exactly that reason: grandfathering may only
      ratchet up, so a shared blob made "give this studio ten seats" a one-way
      door whose only undo discarded what they were originally sold.
    */
    input: s.object({ tenantId: s.text({ max: 60 }), set: s.json() }),
    output: s.object({ adjusted: s.json() }),
    permission: OPERATE,
    idempotency: { mode: "none" },
    audit: (i: { tenantId: string }) => ({ subject: i.tenantId, verb: "adjust" }),
    outcome: { message: "Adjusted", tone: "success", invalidates: ["admin.tenants"] },
    fails: ["platform.not_found", "platform.invalid"],
    tool: false,
    async handler(ctx, input: { tenantId: string; set: Record<string, unknown> }) {
      const d = deps(ctx);
      const where = await placeOf(d.global, input.tenantId);
      if (!where) ctx.fail("platform.not_found", { field: "tenantId" });

      const changes = input.set ?? {};
      for (const [key, value] of Object.entries(changes)) {
        /*
          ⚠️ A KEY THIS APP DOES NOT SELL IS READ BY NOTHING. Stored, it is an
          adjustment an operator can see on a screen and no gate will ever
          consult — which reads as a setting that does not work.
        */
        if (!entitlements.has(key)) ctx.fail("platform.invalid", { field: key, reason: "not an entitlement this app declares" });
        if (value !== null && typeof value !== "number" && typeof value !== "boolean") {
          ctx.fail("platform.invalid", { field: key, reason: "must be a number, a boolean, or null to clear" });
        }
      }

      const current = await subscriptionForTenant(d.global, input.tenantId);
      const next: Record<string, unknown> = { ...(current?.overrides.adjusted ?? {}) };
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) delete next[key];
        else next[key] = value;
      }

      /* ⚠️ The account's row, for the same reason `admin.comp` writes there. */
      await setAdjustments(d.global, input.tenantId, next, ctx.now());
      return { adjusted: next };
    },
  });

  /* ------------------------------------------------------------ topping --- */

  const topup = operation({
    id: "admin.topup",
    kind: "write",
    summary: "Give a workspace credits.",
    input: s.object({
      tenantId: s.text({ max: 60 }),
      amount: s.number({ integer: true, min: 1 }),
      reason: s.text({ min: 3, max: 500 }),
      /*
        ⚠️ THE CALLER SUPPLIES THE KEY, because only whoever is retrying knows
        that two attempts are one intent. Without it, a double-submitted form
        gives a workspace twice what somebody meant to give them.
      */
      ref: s.text({ min: 3, max: 200 }),
    }),
    output: s.object({ applied: s.bool(), balance: s.number({ integer: true }) }),
    permission: OPERATE,
    idempotency: { mode: "natural", key: "ref" },
    audit: (i: { tenantId: string }) => ({ subject: i.tenantId, verb: "topup" }),
    outcome: { message: "Credits added", tone: "success", invalidates: ["admin.tenants"] },
    fails: ["platform.not_found"],
    tool: false,
    async handler(ctx, input: { tenantId: string; amount: number; reason: string; ref: string }) {
      const d = deps(ctx);
      const where = await placeOf(d.global, input.tenantId);
      if (!where) ctx.fail("platform.not_found", { field: "tenantId" });

      /*
        ⚠️ CREDITS GO TO THE ACCOUNT THAT PAYS FOR THE WORKSPACE, because that is
        the balance every product spends from. A top-up written against the
        workspace would land somewhere nothing draws on — money given and never
        arriving, with a 200 and an audit row saying it did.
      */
      const sub = await subscriptionForTenant(d.global, input.tenantId);
      if (!sub) ctx.fail("platform.not_found", { field: "tenantId" });
      const done = await grantCredits(d.global, sub!.accountId, {
        kind: "purchased", amount: input.amount, reason: `topup:${input.reason}`, ref: input.ref, productId: app.id,
      }, ctx.now());
      /*
        ⚠️ `applied: false` IS A SUCCESS. A redelivered intent that was already
        recorded is not an error — but a caller reading a 200 as "it happened"
        would tell somebody credits were added twice.
      */
      return { applied: done.applied, balance: done.balance };
    },
  });

  /* -------------------------------------------------------- maintenance --- */

  const readSwitch = operation({
    id: "admin.maintenance",
    kind: "read",
    summary: "Whether the deployment is closed, and what it says.",
    input: s.object({}),
    output: s.object({ mode: s.text(), message: s.text(), until: s.optional(s.text()) }),
    permission: OPERATE,
    idempotency: { mode: "none" },
    async handler(ctx) {
      const state = await readMaintenance(deps(ctx).global);
      return { mode: state.mode, message: state.message, ...(state.until ? { until: state.until } : {}) };
    },
  });

  const setSwitch = operation({
    id: "admin.maintenance.set",
    kind: "write",
    summary: "Close the deployment for work, or open it again.",
    input: s.object({
      mode: s.enum(["off", "readonly", "full"]),
      /*
        ⚠️ A MESSAGE IS REQUIRED TO CLOSE AND MEANINGLESS TO OPEN. A closed
        deployment with no message is a product that has vanished; whoever is
        holding it has nothing to tell the person in front of them.
      */
      message: s.optional(s.text({ max: 500 })),
      until: s.optional(s.instant()),
    }),
    output: s.object({ mode: s.text() }),
    permission: OPERATE,
    idempotency: { mode: "none" },
    audit: (i: { mode: string }) => ({ subject: "deployment", verb: `maintenance:${i.mode}` }),
    outcome: { message: "Saved", tone: "warning", invalidates: ["admin.maintenance"] },
    fails: ["platform.invalid"],
    /*
      ⚠️ NOT A TOOL, and this is the clearest case in the platform after closing a
      workspace. A model that can close a deployment can be talked into it by a
      sentence in something it was asked to read.
    */
    tool: false,
    async handler(ctx, input: { mode: "off" | "readonly" | "full"; message?: string; until?: string }) {
      const d = deps(ctx);
      if (input.mode !== "off" && !(input.message ?? "").trim()) {
        ctx.fail("platform.invalid", { field: "message", reason: "required to close" });
      }
      const state: Maintenance = input.mode === "off"
        ? OPEN
        : { mode: input.mode, message: input.message!, ...(input.until ? { until: input.until as Instant } : {}) };
      await setMaintenance(d.global, state, ctx.now());
      return { mode: state.mode };
    },
  });

  return [tenants, comp, adjust, topup, readSwitch, setSwitch, impersonate, stopActing, sessions, ...catalogueOperations(app)] as unknown as readonly AnyOperation[];
}

/* -------------------------------------------------------------- the catalogue --- */

/**
 * ⚠️ THE CATALOGUE IS EDITABLE BECAUSE A MANIFEST IS A DEPLOY AND A PRICE IS NOT.
 *
 * The same argument as a model's rate, one rail over. What an app SHIPS knowing
 * is the declaration; what a deployment currently sells is this. An operator who
 * has to ship a build to change a price ships fewer price changes than the
 * business actually makes, and the gap is filled by discounts nobody records.
 */
export const CATALOGUE_SCHEMA: SchemaModule = {
  id: "plan_overrides",
  ddl: [
    `CREATE TABLE IF NOT EXISTS plan_override (plan_id TEXT PRIMARY KEY, price_minor INTEGER, price_currency TEXT, trial_days INTEGER, entitlements_json TEXT NOT NULL DEFAULT '{}', at TEXT NOT NULL, by TEXT NOT NULL);`,
  ],
};

interface OverrideRow {
  plan_id: string; price_minor: number | null; price_currency: string | null;
  trial_days: number | null; entitlements_json: string;
}

export async function planOverrides(db: SqlHandle): Promise<PlanOverrides> {
  const rows = await db.all<OverrideRow>(`SELECT * FROM plan_override`).catch(() => []);
  const out: Record<string, PlanOverride> = {};
  for (const r of rows) {
    out[r.plan_id] = {
      ...(r.price_minor === null ? {} : { price: { minor: r.price_minor, currency: (r.price_currency ?? "usd") as Money["currency"] } }),
      ...(r.trial_days === null ? {} : { trialDays: r.trial_days }),
      entitlements: parseAllowances(r.entitlements_json),
    };
  }
  return out;
}

/* ⚠️ An unreadable column is the empty edit, not a throw. It is read on the
   billing path of every request that resolves entitlements, and a JSON parse
   error there would take the whole deployment's billing down over one row. */
const parseAllowances = (text: string): Readonly<Record<string, Allowance>> => {
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, Allowance>) : {};
  } catch { return {}; }
};

function catalogueOperations<B extends BindingSpec>(app: AppSpec<B>): readonly AnyOperation[] {
  const read = operation({
    id: "admin.catalog",
    kind: "read",
    summary: "What this deployment sells, declared and as edited.",
    input: s.object({}),
    /*
      ⚠️ ALL THREE, because an operator editing a price needs to know whether the
      number in front of them is the one the app shipped or one somebody already
      changed. A screen showing only the effective value makes every edit look
      like the first.
    */
    output: s.object({ declared: s.json(), overrides: s.json(), selling: s.json(), keys: s.json() }),
    permission: OPERATE,
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      const overrides = await planOverrides(d.global);
      return {
        declared: app.access.plans,
        overrides,
        selling: catalogueOf(app.access.plans, overrides),
        keys: app.access.entitlements,
      };
    },
  });

  const set = operation({
    id: "admin.catalog.set",
    kind: "write",
    summary: "Change a plan's price, trial or ceilings.",
    input: s.object({
      planId: s.text({ max: 60 }),
      price: s.optional(s.money()),
      trialDays: s.optional(s.number({ integer: true, min: 0, max: 365 })),
      entitlements: s.optional(s.json()),
    }),
    output: s.object({ selling: s.json(), grandfathered: s.number({ integer: true }) }),
    permission: OPERATE,
    idempotency: { mode: "none" },
    audit: (i: { planId: string }) => ({ subject: i.planId, verb: "reprice" }),
    outcome: { message: "Catalogue updated", tone: "success", invalidates: ["admin.catalog"] },
    fails: ["platform.invalid"],
    /*
      ⚠️ NOT A TOOL. This is the price list. A model that can edit it is one
      sentence in something it was asked to read away from selling the product
      for nothing.
    */
    tool: false,
    async handler(ctx, input: { planId: string; price?: Money; trialDays?: number; entitlements?: Record<string, Allowance> }) {
      const d = deps(ctx);
      const edit: PlanOverride = {
        ...(input.price ? { price: input.price } : {}),
        ...(input.trialDays === undefined ? {} : { trialDays: input.trialDays }),
        ...(input.entitlements ? { entitlements: input.entitlements } : {}),
      };
      const refused = refuseCatalogueEdit(app.access.plans, app.access.entitlements, input.planId, edit);
      if (refused) ctx.fail("platform.invalid", { field: "planId", reason: refused });

      const before = catalogueOf(app.access.plans, await planOverrides(d.global));

      const current = await d.global.first<OverrideRow>(`SELECT * FROM plan_override WHERE plan_id = ?`, input.planId).catch(() => null);
      await d.global.run(
        `INSERT INTO plan_override (plan_id, price_minor, price_currency, trial_days, entitlements_json, at, by)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(plan_id) DO UPDATE SET price_minor = excluded.price_minor, price_currency = excluded.price_currency,
           trial_days = excluded.trial_days, entitlements_json = excluded.entitlements_json, at = excluded.at, by = excluded.by`,
        input.planId,
        input.price ? input.price.minor : current?.price_minor ?? null,
        input.price ? input.price.currency : current?.price_currency ?? null,
        input.trialDays === undefined ? current?.trial_days ?? null : input.trialDays,
        JSON.stringify({ ...parseAllowances(current?.entitlements_json ?? "{}"), ...(input.entitlements ?? {}) }),
        ctx.now(), d.actorId,
      );

      const after = catalogueOf(app.access.plans, await planOverrides(d.global));
      const wasPlan = before.find((p) => p.id === input.planId);
      const nowPlan = after.find((p) => p.id === input.planId);

      /*
        ⚠️ EDITING A PLAN DOWN HOLDS EVERYBODY ALREADY ON IT AT WHAT THEY WERE
        SOLD, and this write is the whole reason the catalogue is safe to edit.

        A workspace bought three seats. The plan becomes two — for good reasons,
        about what is sold FROM NOW ON — and without the snapshot that workspace
        loses a seat it paid for, mid-period, with no notice and no refund. The
        symptom is a colleague who cannot sign in and a support conversation
        nobody can explain, because the plan says two and appears always to have.
      */
      const grandfathered = wasPlan && nowPlan
        ? await holdExisting(d, input.planId, wasPlan.entitlements, nowPlan.entitlements, ctx.now())
        : 0;

      return { selling: after, grandfathered };
    },
  });

  return [read, set] as unknown as readonly AnyOperation[];
}

/**
 * ⚠️ EVERY WORKSPACE ON THE PLAN, IN ONE QUERY. Subscriptions are the account's
 * and live in the global store, so a sweep that once had to visit every region —
 * and quietly kept the promise for some customers when one would not open — is a
 * single statement that either runs or does not.
 */
async function holdExisting(
  d: OperatorDeps,
  planId: string,
  before: Readonly<Record<string, Allowance>>,
  after: Readonly<Record<string, Allowance>>,
  at: Instant,
): Promise<number> {
  let held = 0;
  const rows = await d.global.all<{ id: string; grandfathered_json: string }>(
    `SELECT id, grandfathered_json FROM account_subscription WHERE plan_id = ?`, planId,
  ).catch(() => []);
  for (const row of rows) {
    const kept = snapshotDowngrade(before, after, parseAllowances(row.grandfathered_json));
    /* ⚠️ Only where something actually moved. A write per workspace per edit
       would rewrite the whole subscriber table to change a trial length. */
    if (JSON.stringify(kept) === JSON.stringify(parseAllowances(row.grandfathered_json))) continue;
    await d.global.run(
      `UPDATE account_subscription SET grandfathered_json = ?, updated_at = ? WHERE id = ?`,
      JSON.stringify(kept), at, row.id,
    ).catch(() => undefined);
    held++;
  }
  return held;
}
