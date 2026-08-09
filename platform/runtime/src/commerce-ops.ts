/**
 * THE BILLING SURFACE, derived from the catalogue an app declares.
 *
 * ⚠️ EVERY ONE OF THESE IS ON THE `billing` LANE, which survives every rung of
 * the standing ladder. That is not a convenience: a workspace that has been made
 * read-only over an unpaid charge must still be able to see what it owes and pay
 * it, or the ladder has no bottom rung and the only way out of arrears is a
 * support conversation.
 *
 * ⚠️ AND NONE OF THEM GRANTS A PLAN. Choosing writes an intention; only a
 * settled payment writes `plan_id`. The distinction is what lets a deployment
 * with no payment provider complete a signup — the workspace is created, the
 * choice is recorded, nothing is charged, and the screen says so.
 */

import type { Allowance, AnyOperation, AppSpec, BindingSpec, EntitlementDef, Money, PlanSpec, SqlHandle } from "@one/kernel";
import {
  explainCustomerFlags, explainEntitlements, gateFor, heldEntitlements, mayPurchase,
  operation, packageContradictions, runwayFor, s,
} from "@one/kernel";
import {
  applyPackage, choosePlan, listPackages, priorGrants, readAccess, readPackage,
  readSubscription, savePackage, standingFor,
} from "./commerce.js";

/** ⚠️ A symbol, so an app cannot reach the store by writing a property name. */
export const COMMERCE = Symbol.for("one.runtime.commerce");

export interface CommerceDeps {
  readonly db: SqlHandle;
  readonly tenantId: string;
  /**
   * ⚠️ WHETHER THIS DEPLOYMENT CAN ACTUALLY TAKE MONEY.
   *
   * Gating "has not paid" where payment is impossible strands every workspace
   * over our own misconfiguration rather than their non-payment. Asked once, by
   * whoever wires the worker, rather than inferred from the presence of a key
   * somewhere down in a handler.
   */
  readonly chargeable: boolean;
  /**
   * ⚠️ THE RESOLVED VALUES, HANDED DOWN — not re-read here.
   *
   * The intersection with what the workspace itself bought has to be computed
   * against the same walk the gate ran, or the capabilities screen and the route
   * can disagree about the same customer. The runtime resolves once per request;
   * this is that answer, not a second read of the same row.
   */
  readonly entitlements: Readonly<Record<string, Allowance>>;
}

export interface CommerceCarrier { readonly [COMMERCE]: CommerceDeps }

const deps = (ctx: unknown): CommerceDeps => (ctx as CommerceCarrier)[COMMERCE];

/** What a plan looks like on the wire. The catalogue, never the manifest object. */
const publicPlan = (p: PlanSpec) => ({
  id: p.id,
  name: p.name,
  price: p.price,
  period: p.period,
  trialDays: p.trialDays,
  entitlements: p.entitlements,
});

export function commerceOperations<B extends BindingSpec>(app: AppSpec<B>): readonly AnyOperation[] {
  const plans = operation({
    id: "billing.plans",
    kind: "read",
    summary: "The plans this workspace can be on.",
    input: s.object({}),
    output: s.object({ plans: s.json(), chargeable: s.bool() }),
    /*
      ⚠️ PUBLIC, because a price list is a public fact and the alternative is a
      pricing page that cannot be rendered until somebody signs in.
    */
    permission: "public",
    idempotency: { mode: "none" },
    async handler(ctx) {
      return { plans: app.access.plans.map(publicPlan), chargeable: deps(ctx).chargeable };
    },
  });

  const standing = operation({
    id: "billing.standing",
    kind: "read",
    summary: "What this workspace is on, where it stands, and what it may do.",
    input: s.object({}),
    output: s.object({ planId: s.optional(s.text()), pendingPlanId: s.optional(s.text()), standing: s.json(), entitlements: s.json() }),
    permission: "public",
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      const sub = await readSubscription(d.db, d.tenantId);
      const state = standingFor(sub, ctx.now(), d.chargeable);
      const plan = app.access.plans.find((p) => p.id === sub.planId) ?? null;
      /*
        ⚠️ THE EXPLAINED WALK, NOT A SECOND ONE. This is the same function the
        gate resolves through, so a screen cannot promise something a route
        refuses — and every row carries where its value came from, which is what
        makes an operator able to see that a workspace was grandfathered rather
        than guess.
      */
      const entitlements = explainEntitlements({
        declared: app.access.entitlements as Readonly<Record<string, EntitlementDef>>,
        plan,
        overrides: sub.overrides,
        gate: gateFor(state),
      });
      return {
        planId: sub.planId ?? undefined,
        pendingPlanId: sub.pendingPlanId ?? undefined,
        standing: state,
        entitlements,
      };
    },
  });

  const choose = operation({
    id: "billing.choose",
    kind: "write",
    summary: "Record which plan this workspace intends to be on.",
    input: s.object({ planId: s.text({ max: 60 }) }),
    output: s.object({ pendingPlanId: s.text(), chargeable: s.bool() }),
    permission: "billing:manage",
    idempotency: { mode: "natural", key: "planId" },
    audit: (i: { planId: string }) => ({ subject: i.planId, verb: "choose" }),
    outcome: { message: "Plan selected", tone: "success", invalidates: ["billing.standing"] },
    emits: ["plan.chosen"],
    fails: ["platform.not_found"],
    /*
      ⚠️ NOT REACHABLE BY A TOOL. Changing what a workspace pays is a decision
      with a bill attached, and a model that can take it on somebody's behalf is
      a model that can take it from a sentence in a document it was asked to
      summarise.
    */
    tool: false,
    async handler(ctx, input: { planId: string }) {
      const d = deps(ctx);
      if (!app.access.plans.some((p) => p.id === input.planId)) ctx.fail("platform.not_found", { field: "planId" });
      await choosePlan(d.db, d.tenantId, input.planId, ctx.now());
      return { pendingPlanId: input.planId, chargeable: d.chargeable };
    },
  });

  return [plans, standing, choose] as unknown as readonly AnyOperation[];
}

/* -------------------------------------------------------- the other rail --- */

/**
 * WHAT A WORKSPACE SELLS ITS OWN CUSTOMERS, where an app declares that rail.
 *
 * ⚠️ ABSENT ENTIRELY WHERE `customerRail` IS FALSE, rather than present and
 * inert. An operation that exists and resolves nothing is a surface a later
 * stage builds on by mistake, and its refusals read as policy rather than as
 * "this product does not do that".
 */
export function customerOperations<B extends BindingSpec>(app: AppSpec<B>): readonly AnyOperation[] {
  if (!app.access.customerRail) return [];

  const offer = operation({
    id: "commerce.packages",
    kind: "read",
    summary: "The packages this workspace offers its customers.",
    input: s.object({}),
    output: s.object({ packages: s.json() }),
    permission: "commerce:read",
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      const packages = await listPackages(d.db, d.tenantId);
      /*
        ⚠️ THE CONTRADICTIONS TRAVEL WITH THE OFFER, AND ARE NEVER A REFUSAL. A
        capability sold with no days for the scope that gates it resolves off
        anyway; days sold for a scope nothing turns on buy nothing and still
        count down. Both are usually mistakes — and "usually" is why the builder
        says so and the person decides.
      */
      return {
        packages: packages.map((p) => ({ ...p, problems: packageContradictions(p, app.access.customerFlags) })),
      };
    },
  });

  const save = operation({
    id: "commerce.package.save",
    kind: "write",
    summary: "Create or change a package this workspace offers.",
    input: s.object({
      id: s.text({ max: 60 }),
      name: s.text({ min: 1, max: 120 }),
      price: s.json(),
      flags: s.json(),
      budgets: s.json(),
      oncePerCustomer: s.bool(),
    }),
    output: s.object({ id: s.text(), problems: s.json() }),
    permission: "commerce:manage",
    idempotency: { mode: "natural", key: "id" },
    audit: (i: { id: string }) => ({ subject: i.id, verb: "save" }),
    outcome: { message: "Package saved", tone: "success", invalidates: ["commerce.packages"] },
    fails: ["platform.invalid"],
    async handler(ctx, input: { id: string; name: string; price: Money; flags: Record<string, boolean>; budgets: Record<string, number>; oncePerCustomer: boolean }) {
      const d = deps(ctx);
      /*
        ⚠️ A CAPABILITY NOT IN THE MANIFEST CANNOT BE SOLD. Storing one would put
        a key in the offer that no resolution reads and no route gates — a
        toggle that appears to do something and does nothing, forever.
      */
      const unknown = Object.keys(input.flags).filter((k) => !(k in app.access.customerFlags));
      if (unknown.length) ctx.fail("platform.invalid", { field: "flags", reason: `not sold here: ${unknown.join(", ")}` });

      const pkg = { id: input.id, name: input.name, price: input.price, flags: input.flags, budgets: input.budgets, oncePerCustomer: input.oncePerCustomer };
      await savePackage(d.db, d.tenantId, pkg, ctx.now());
      return { id: input.id, problems: packageContradictions(pkg, app.access.customerFlags) };
    },
  });

  const grant = operation({
    id: "commerce.grant",
    kind: "write",
    summary: "Apply a package's days and capabilities to one customer.",
    input: s.object({ subjectId: s.text({ max: 120 }), packageId: s.text({ max: 60 }), ref: s.optional(s.text({ max: 200 })) }),
    output: s.object({ daysAdded: s.number({ integer: true }), runway: s.json() }),
    permission: "commerce:manage",
    /*
      ⚠️ THE CALLER SUPPLIES THE KEY, because only whoever is retrying knows that
      two attempts are one intent — and a payment provider redelivering a success
      without one grants the package again, free, with a correct-looking 200.
    */
    // vocabulary-exempt: the HTTP caller, not somebody's customer — the key comes
    // from whoever is retrying, because only they know two attempts are one intent.
    idempotency: { mode: "client-supplied" },
    audit: (i: { subjectId: string }) => ({ subject: i.subjectId, verb: "grant" }),
    emits: ["package.granted"],
    fails: ["platform.not_found", "platform.conflict"],
    /*
      ⚠️ NOT REACHABLE BY A TOOL. Granting paid access on somebody's say-so is
      not something a language model should be able to reach from a sentence in
      a document it was asked to read.
    */
    tool: false,
    async handler(ctx, input: { subjectId: string; packageId: string; ref?: string }) {
      const d = deps(ctx);
      const pkg = await readPackage(d.db, d.tenantId, input.packageId);
      if (!pkg) ctx.fail("platform.not_found", { field: "packageId" });

      /*
        ⚠️ ANSWERED FROM THE GRANT LEDGER, NEVER FROM THE OPEN ROW. A repeat
        purchase folds into the row already open, so that row's package id is
        only ever the package that opened it — and asking it answers "no,
        never" forever for everything bought after the first.
      */
      const verdict = mayPurchase(pkg!, await priorGrants(d.db, d.tenantId, input.subjectId));
      if (!verdict.allowed) ctx.fail("platform.conflict", { reason: verdict.refusal });

      const applied = await applyPackage(d.db, d.tenantId, input.subjectId, pkg!, ctx.now(), input.ref);
      return { daysAdded: applied.daysAdded, runway: runwayFor(applied.budgets, ctx.now()) };
    },
  });

  const capabilities = operation({
    id: "commerce.capabilities",
    kind: "read",
    summary: "What one customer may do, and why each answer is what it is.",
    input: s.object({ subjectId: s.text({ max: 120 }) }),
    output: s.object({ flags: s.json(), runway: s.json() }),
    permission: "commerce:read",
    /*
      ⚠️ ROW SCOPE, because a customer may read their OWN answer and staff may
      read anybody's — which is a question about a relationship, not a
      permission, and no gate can replace it.
    */
    scope: (i: { subjectId: string }) => ({ subject: i.subjectId }),
    idempotency: { mode: "none" },
    async handler(ctx, input: { subjectId: string }) {
      const d = deps(ctx);
      const access = await readAccess(d.db, d.tenantId, input.subjectId);
      const pkg = access.packageId ? await readPackage(d.db, d.tenantId, access.packageId) : null;
      const runway = runwayFor(access.budgets, ctx.now());
      /*
        ⚠️ THE EXPLAINED WALK, WHICH IS ALSO THE ONE THE GATE USES. A second
        implementation of "what may this customer do" is how a screen comes to
        promise what a route refuses — and the screen is the half people look at.
      */
      return {
        flags: explainCustomerFlags({
          declared: app.access.customerFlags,
          pkg,
          snapshot: access.snapshot,
          overrides: access.overrides,
          runway,
          tenantHolds: heldEntitlements(d.entitlements),
        }),
        runway,
      };
    },
  });

  return [offer, save, grant, capabilities] as unknown as readonly AnyOperation[];
}
