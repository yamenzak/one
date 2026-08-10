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

import type { AnyOperation, AppSpec, BindingSpec, Instant, RegionId, SqlHandle } from "@one/kernel";
import { operation, s } from "@one/kernel";
import { balance, record } from "./ledger.js";
import { CREDITS } from "./generate.js";
import { OPEN, readMaintenance, setMaintenance, type Maintenance } from "./maintenance.js";
import { readSubscription } from "./commerce.js";

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
        const sub = db ? await readSubscription(db, row.tenant_id).catch(() => null) : null;
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

      const db = await d.regionalIn(where!.region as RegionId);
      /*
        ⚠️ `active`, AND `past_due_at` CLEARED. A workspace comped while the
        dunning ladder was counting would keep its anchor and be suspended on
        schedule for an invoice nobody is waiting for.
      */
      await db.run(
        `INSERT INTO subscription (tenant_id, plan_id, status, past_due_at, updated_at) VALUES (?, ?, 'active', NULL, ?)
         ON CONFLICT(tenant_id) DO UPDATE SET plan_id = excluded.plan_id, status = 'active', past_due_at = NULL, updated_at = excluded.updated_at`,
        input.tenantId, input.planId, ctx.now(),
      );
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

      const db = await d.regionalIn(where!.region as RegionId);
      const current = await readSubscription(db, input.tenantId);
      const next: Record<string, unknown> = { ...current.overrides.adjusted };
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) delete next[key];
        else next[key] = value;
      }

      await db.run(
        `INSERT INTO subscription (tenant_id, status, adjusted_json, updated_at) VALUES (?, 'none', ?, ?)
         ON CONFLICT(tenant_id) DO UPDATE SET adjusted_json = excluded.adjusted_json, updated_at = excluded.updated_at`,
        input.tenantId, JSON.stringify(next), ctx.now(),
      );
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

      const db = await d.regionalIn(where!.region as RegionId);
      const done = await record(db, input.tenantId, {
        unit: CREDITS, amount: input.amount, reason: `topup:${input.reason}`, ref: input.ref, actorId: d.actorId,
      }, ctx.now());
      /*
        ⚠️ `applied: false` IS A SUCCESS. A redelivered intent that was already
        recorded is not an error — but a caller reading a 200 as "it happened"
        would tell somebody credits were added twice.
      */
      return { applied: done.applied, balance: await balance(db, input.tenantId, CREDITS) };
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

  return [tenants, comp, adjust, topup, readSwitch, setSwitch] as unknown as readonly AnyOperation[];
}
