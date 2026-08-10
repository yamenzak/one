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
  explainCustomerFlags, explainEntitlements, gateFor, heldEntitlements, mayPurchase, packageLines,
  operation, packageContradictions, PUBLIC, runwayFor, s,
} from "@one/kernel";
import {
  applyPackage, applyPayment, choosePlan, listPackages, priorGrants, readAccess, readPackage,
  readSubscription, savePackage, standingFor,
} from "./commerce.js";
import { attribute, claimByCustomer, claimEvent, listParked, park, rememberCustomer, resolveParked, verifySignature } from "./provider.js";
import { parseStripeEvent } from "./provider-stripe.js";
import { previewOf, shelf } from "./market.js";

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
  /** The store that knows which region a workspace is in. Routing data only. */
  readonly global: SqlHandle;
  /** ⚠️ A webhook settles in a region the request did not arrive in. */
  forTenant(tenantId: string): Promise<SqlHandle | null>;
  /** What this workspace is on now, for a comparison that has a left column. */
  readonly currentPlanId?: string | null;
  /**
   * ⚠️ THE RUNTIME'S OWN QUOTA COUNTERS. A preview that counted its own way
   * would promise a downgrade the next write then refuses.
   */
  usage(key: string): Promise<number> | null;
  readonly signature: string;
  /** The exact bytes that were signed. Never a re-serialisation of the parse. */
  readonly body: string;
  readonly webhookSecret: string;
}

export interface CommerceCarrier { readonly [COMMERCE]: CommerceDeps }

const deps = (ctx: unknown): CommerceDeps => (ctx as CommerceCarrier)[COMMERCE];

/*
  ⚠️ A PLAN GOES OUT AS A SHELF CARD — `offerOf`, from the same declarations the
  gate reads. It used to go out as its raw `entitlements` map, which is a
  machine's answer: a screen showing `{ receiptsStored: 5 }` either prints the
  key or carries a translation table of its own, and the second one drifts from
  what is enforced. There is nowhere to put that copy now except the manifest.
*/

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
      return { plans: shelf(app.access.plans, app.access.entitlements), chargeable: deps(ctx).chargeable };
    },
  });

  /**
   * ⚠️ WHAT CHANGING WOULD ACTUALLY DO, BEFORE ANYBODY CHANGES ANYTHING.
   *
   * It is a READ, and it refuses nothing — see `Preview.strains`. A storefront
   * that blocked a downgrade would trap somebody on a plan they no longer want,
   * which is the same shape as the rule that leaving is always allowed.
   */
  const preview = operation({
    id: "market.preview",
    kind: "read",
    summary: "What moving to a plan would gain, lose, and strain.",
    input: s.object({ planId: s.text({ max: 60 }) }),
    output: s.object({ preview: s.json() }),
    permission: "billing:manage",
    idempotency: { mode: "none" },
    fails: ["platform.not_found"],
    async handler(ctx, input: { planId: string }) {
      const d = deps(ctx);
      const out = await previewOf({
        app, db: d.db, tenantId: d.tenantId,
        currentPlanId: d.currentPlanId ?? null, toPlanId: input.planId,
        usage: d.usage,
      });
      if (!out) ctx.fail("platform.not_found", { field: "planId" });
      return { preview: out };
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

  return [plans, preview, standing, choose] as unknown as readonly AnyOperation[];
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
        packages: packages.map((p) => ({
          ...p,
          /*
            ⚠️ THE SAME CARD SHAPE AS A PLAN, from the same declarations the
            customer gate reads. A package that turns two things on is not a
            package with two features — it is a package with two of eight on, and
            a customer comparing packages has to be able to see the six.
          */
          includes: packageLines(p.flags, app.access.customerFlags),
          problems: packageContradictions(p, app.access.customerFlags),
        })),
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

/* ------------------------------------------------------------- the wire --- */

/**
 * THE PAYMENT PROVIDER'S ENDPOINT, AND THE ONLY TWO ANSWERS IT HAS.
 *
 * ⚠️ APPLIED, OR PARKED. There is no third. A handler that could not work out
 * whose event it was once answered `200 {received: true}` with the id already
 * claimed, so the provider marked it delivered and never retried — money
 * captured, nothing granted, and no error anywhere.
 *
 * ⚠️ AND THE DEAD LETTER HAS A SURFACE. A parked table nobody can read is the
 * same silent success with an extra table, which is why the two operations
 * beside this one are not optional.
 */
export function providerOperations<B extends BindingSpec>(app: AppSpec<B>): readonly AnyOperation[] {
  const webhook = operation({
    id: "webhook.provider",
    kind: "write",
    summary: "Receive a payment provider's notification.",
    input: s.object({}),
    output: s.object({ outcome: s.text() }),
    /*
      ⚠️ PUBLIC BY CONSTRUCTION — a provider cannot hold a session — so the
      SIGNATURE is the whole of the authentication, and a deployment with no
      secret configured refuses rather than accepts.
    */
    permission: PUBLIC,
    // vocabulary-exempt: the provider retries, so it supplies the key that says
    // two deliveries are one event.
    idempotency: { mode: "client-supplied" },
    fails: ["platform.forbidden", "platform.invalid"],
    /*
      ⚠️ NOT A TOOL, and this is the clearest case in the platform: it is the one
      endpoint whose caller is authenticated by a shared secret rather than by a
      person, and a model that could invoke it could grant itself anything.
    */
    tool: false,
    async handler(ctx) {
      const d = deps(ctx);
      const at = ctx.now();

      const verdict = await verifySignature({ secret: d.webhookSecret, body: d.body, header: d.signature, now: at });
      if (!verdict.ok) {
        /*
          ⚠️ REFUSED, NOT PARKED. Parking would let anybody fill an operator's
          dead letter with whatever they liked, and an unverified body is not
          evidence of anything — there is nothing to recover.
        */
        ctx.fail("platform.forbidden", { reason: verdict.why });
      }

      const event = parseStripeEvent(d.body, app.stripeMetadataPrefix);
      if (!event) ctx.fail("platform.invalid", { reason: "unreadable" });

      const who = await attribute(event!, app.id, async (ref) => (await claimByCustomer(d.global)(ref)) ?? null);
      if (!who.ok) {
        await park(d.global, { id: event!.id, kind: event!.kind }, who.why, d.body, at);
        return { outcome: `parked:${who.why}` };
      }

      /*
        ⚠️ THE ID IS CLAIMED BEFORE ANYTHING IS APPLIED, and a claim that fails
        is a SUCCESS. A provider redelivers; without a record, every redelivery
        grants again — free access, silently, with a correct-looking 200 each
        time. A caller that grants on the strength of a 200 still needs to know
        nothing happened this time, which is why the outcome says so.
      */
      /*
        ⚠️ REMEMBERED HERE, OR EVERY RENEWAL PARKS. A checkout carries the
        metadata we wrote; the renewal that follows it a month later carries the
        fields the PROVIDER thinks are interesting and none of ours. Recording
        the customer the first time an event places itself is what lets the
        second one be claimed — without it the dead letter fills up with routine
        renewals, every one of them a workspace whose plan quietly lapses.
      */
      if (event!.customerRef) await rememberCustomer(d.global, event!.customerRef, who.tenantId, app.id, at);

      if (!(await claimEvent(d.global, event!.id, who.tenantId, event!.kind, at))) return { outcome: "already_applied" };

      const db = await d.forTenant(who.tenantId);
      if (!db) {
        await park(d.global, { id: event!.id, kind: event!.kind }, "no_tenant", d.body, at);
        return { outcome: "parked:no_tenant" };
      }
      await applyPayment(db, who.tenantId, event!, at);
      return { outcome: `applied:${event!.kind}` };
    },
  });

  const parked = operation({
    id: "billing.parked",
    kind: "read",
    summary: "Payment events this deployment could not attribute.",
    input: s.object({ limit: s.optional(s.number({ integer: true, min: 1, max: 100 })) }),
    output: s.object({ events: s.json(), dropped: s.number({ integer: true }) }),
    permission: "billing:operate",
    idempotency: { mode: "none" },
    /*
      ⚠️ NOT A TOOL, even though it is only a read. Each row carries a provider's
      raw payload — customer references, amounts, whatever else the provider
      chose to include — and the reason this table exists is that nobody knew
      whose it was. Handing that to a model to summarise is the one operation
      where "expose by default" is the wrong default.
    */
    tool: false,
    async handler(ctx, input: { limit?: number }) {
      const d = deps(ctx);
      const limit = Math.min(input.limit ?? 25, 100);
      const events = await listParked(d.global, limit + 1);
      /*
        ⚠️ WHAT WAS DROPPED IS REPORTED. A silently truncated list reads as
        "that is all of them", and the whole purpose of this surface is that
        somebody can tell how much money is sitting in it.
      */
      return { events: events.slice(0, limit), dropped: Math.max(0, events.length - limit) };
    },
  });

  const replay = operation({
    id: "billing.parked.replay",
    kind: "write",
    summary: "Attribute a parked event to a workspace and apply it.",
    input: s.object({ eventId: s.text({ max: 200 }), tenantId: s.text({ max: 120 }) }),
    output: s.object({ outcome: s.text() }),
    permission: "billing:operate",
    idempotency: { mode: "natural", key: "eventId" },
    audit: (i: { eventId: string }) => ({ subject: i.eventId, verb: "replay" }),
    fails: ["platform.not_found"],
    tool: false,
    async handler(ctx, input: { eventId: string; tenantId: string }) {
      const d = deps(ctx);
      const at = ctx.now();
      const row = (await listParked(d.global, 100)).find((e) => e.eventId === input.eventId);
      if (!row) ctx.fail("platform.not_found", { field: "eventId" });

      const event = parseStripeEvent(row!.payload, app.stripeMetadataPrefix);
      if (!event) ctx.fail("platform.not_found", { field: "eventId" });

      const db = await d.forTenant(input.tenantId);
      if (!db) ctx.fail("platform.not_found", { field: "tenantId" });

      if (await claimEvent(d.global, event!.id, input.tenantId, event!.kind, at)) {
        await applyPayment(db!, input.tenantId, event!, at);
      }
      /*
        ⚠️ RESOLVED RATHER THAN DELETED. What was parked and later replayed is
        the record of a gap in attribution, and that record is the only way
        anybody learns the gap existed — a delete makes the recovery look like it
        never had to happen.
      */
      await resolveParked(d.global, event!.id, at);
      return { outcome: "applied" };
    },
  });

  return [webhook, parked, replay] as unknown as readonly AnyOperation[];
}
