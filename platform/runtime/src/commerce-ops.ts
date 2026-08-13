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

import type { Allowance, AnyOperation, AppSpec, BindingSpec, EntitlementDef, Instant, Ladder, Money, PlanSpec, SqlHandle } from "@one/kernel";
import {
  DESTRUCTIVE_FLOOR_DAYS, discountUsable, explainCustomerFlags, explainEntitlements, extendBudget, gateFor,
  heldEntitlements, ladderProblems, MAX_DISCOUNT_PERCENT, mayPurchase, MIN_DISCOUNT_PERCENT,
  packageLines, operation, packageContradictions, PUBLIC, refuseDiscount, runwayFor, s, standingOf,
} from "@one/kernel";
import {
  applyPackage, claimCode, codesFor, grantsFor, issueCode, listPackages,
  openPurchase, priorGrants, purchasesFor, readAccess, readLadder, readPackage, readPayments,
  readPurchase, savePayments, saveLadder, setOverrides, setRemainingDays, settlePurchase,
  credentialProblem, verifySecretOf,
  discountsFor, readDiscount, saveDiscount, spendDiscount,
  savePackage,
} from "./commerce.js";
import { attribute, claimByCustomer, claimEvent, listParked, park, rememberCustomer, resolveParked, verifySignature } from "./provider.js";
import { OPERATE } from "./operator-ops.js";
import { balance } from "./ledger.js";
import { CREDITS } from "./generate.js";
import { applyToSubscription, choosePlanFor, grantAllowance, grantCredits, rememberProviderRef, subscriptionByProviderRef, subscriptionById, subscriptionForTenant } from "./account-billing.js";
import { parseStripeEvent } from "./provider-stripe.js";
import { previewOf, shelf } from "./market.js";

/** ⚠️ A symbol, so an app cannot reach the store by writing a property name. */
export const COMMERCE = Symbol.for("one.runtime.commerce");

/**
 * ⚠️ THE PARKING SUBSCRIPTION IS A VALUE, NOT A ROW. Materialising one on first
 * read puts a default into storage where the next reader takes it for a decision
 * — which is how an ordinary write once came to answer 402 on a deployment with
 * no payment provider at all.
 */
const PARKED_SUB = {
  planId: null, pendingPlanId: null, status: "none" as const,
  trialEndsAt: null, pastDueAt: null, closingAt: null,
  overrides: { grandfathered: {}, adjusted: {} },
};

export interface CommerceDeps {
  readonly db: SqlHandle;
  readonly tenantId: string;
  /** ⚠️ Who pays for this workspace. Empty where nothing does — see the runtime. */
  readonly accountId: string;
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
   * ⚠️ THE CATALOGUE AS IT IS ACTUALLY SOLD, NOT AS IT WAS DECLARED.
   *
   * An operator's edit that the storefront never reads is a price list screen
   * showing one number while the gate enforces another — a customer told a plan
   * includes three and given ten, or told ten and given three, with a receipt
   * that agrees with neither. Resolved ONCE per request beside the entitlements,
   * so the shelf, the preview, the standing screen and the chooser cannot
   * disagree with each other or with the gate.
   */
  readonly selling: readonly PlanSpec[];
  /**
   * ⚠️ THE PROVIDER'S OWN BILLING SCREEN, where the deployment has one. Null is
   * a real answer and is reported as one — a "manage billing" link that opens
   * nothing is worse than a sentence saying billing is not set up.
   */
  readonly portalUrl: string | null;
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
      return { plans: shelf(deps(ctx).selling, app.access.entitlements), chargeable: deps(ctx).chargeable };
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
        app, selling: d.selling, db: d.db, tenantId: d.tenantId,
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
      /*
        ⚠️ THE ACCOUNT'S ROW, NOT A REGIONAL COPY. The payer is an account and the
        subscription lives where accounts do — read from the regional table this
        screen would show a plan the gate is not enforcing, which is the exact
        drift every other rule in this file exists to prevent.
      */
      const sub = (await subscriptionForTenant(d.global, d.tenantId)) ?? PARKED_SUB;
      const state = standingOf(sub, ctx.now(), d.chargeable);
      const plan = d.selling.find((p) => p.id === sub.planId) ?? null;
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
      if (!d.selling.some((p) => p.id === input.planId)) ctx.fail("platform.not_found", { field: "planId" });
      /*
        ⚠️ IT WRITES A PENDING PLAN ON THE ACCOUNT'S SUBSCRIPTION, and creates one
        where the workspace has none — which is the ordinary state on a deployment
        with no payment provider, where nothing was bought before creating.
        Written to a regional table nothing reads, this control would report
        success and change nothing anywhere.
      */
      await choosePlanFor(d.global, {
        tenantId: d.tenantId, accountId: d.accountId, productId: app.id, planId: input.planId,
      }, ctx.now());
      return { pendingPlanId: input.planId, chargeable: d.chargeable };
    },
  });


  /**
   * ⚠️ CREDITS ARE CONSUMPTION AND A PLAN IS ACCESS, so running out is answered
   * with more of what you were using rather than with a bigger product.
   */
  const packs = operation({
    id: "billing.packs",
    kind: "read",
    summary: "What this workspace can buy to top up its balance.",
    input: s.object({}),
    output: s.object({ packs: s.json(), balance: s.number({ integer: true }), chargeable: s.bool() }),
    permission: "billing:manage",
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      return {
        packs: app.access.creditPacks ?? [],
        /* ⚠️ The balance travels with the shelf, because "how many do I have"
           is the question that brought them to this screen. */
        balance: await balance(d.db, d.tenantId, CREDITS),
        chargeable: d.chargeable,
      };
    },
  });

  /**
   * Buy one.
   *
   * ⚠️ IT OPENS AN INTENT AND GRANTS NOTHING. Credits are minted by the
   * provider's confirmation and by an operator, and by nothing else — an
   * operation that granted on request would be a balance anybody could refill by
   * calling it.
   *
   * ⚠️ AND WITH NO PROVIDER IT REFUSES AND SAYS WHY. Answering cleanly with a
   * pending purchase nothing will ever settle is a workspace waiting for credits
   * that are not coming, with no signal at all.
   */
  const buy = operation({
    id: "billing.credits.buy",
    kind: "write",
    summary: "Buy a pack of credits.",
    input: s.object({ packId: s.text({ max: 60 }) }),
    output: s.object({ packId: s.text(), credits: s.number({ integer: true }), payAt: s.optional(s.text()) }),
    permission: "billing:manage",
    idempotency: { mode: "none" },
    audit: (i: { packId: string }) => ({ subject: i.packId, verb: "buy-credits" }),
    fails: ["platform.not_found", "platform.unavailable"],
    /*
      ⚠️ NOT A TOOL. It is a purchase. A model that can make one can be talked
      into it by a sentence in something it was asked to read.
    */
    tool: false,
    async handler(ctx, input: { packId: string }) {
      const d = deps(ctx);
      const pack = (app.access.creditPacks ?? []).find((p) => p.id === input.packId);
      if (!pack) ctx.fail("platform.not_found", { field: "packId" });
      if (!d.chargeable) {
        ctx.fail("platform.unavailable", { reason: "this deployment cannot take a payment yet" });
      }
      /*
        ⚠️ THE BALANCE DOES NOT MOVE HERE. What comes back is where to pay; the
        credits arrive when the provider says the money did.
      */
      return { packId: pack!.id, credits: pack!.credits, ...(d.portalUrl ? { payAt: d.portalUrl } : {}) };
    },
  });

  /**
   * Where to change a card, read what was charged, or cancel.
   *
   * ⚠️ IT IS THE PROVIDER'S SCREEN AND NOT A COPY OF IT. Rebuilding billing
   * history and card management inside the product means holding card details,
   * reproducing tax documents, and being wrong about both in a different way
   * from the provider — who is the one the payer's bank will ask.
   *
   * ⚠️ AND AN UNCONFIGURED DEPLOYMENT SAYS SO RATHER THAN HANDING BACK A DEAD
   * LINK. "Manage billing" that opens nothing is worse than a sentence saying
   * billing is not set up.
   */
  const portal = operation({
    id: "billing.portal",
    kind: "read",
    summary: "Where to change a card, read what was charged, or cancel.",
    input: s.object({}),
    output: s.object({ url: s.optional(s.text()), why: s.optional(s.text()) }),
    permission: "billing:manage",
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      if (!d.chargeable) return { why: "this deployment has no payment provider configured" };
      if (!d.portalUrl) return { why: "this deployment has a provider and no billing portal set" };
      return { url: d.portalUrl };
    },
  });

  return [plans, preview, standing, choose, packs, buy, portal] as unknown as readonly AnyOperation[];
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
/**
 * ⚠️ ONE SETTLEMENT PATH FOR BOTH LANES, and it is the whole reason `manual` is
 * not second-class. A signed notification and a coach pressing confirm arrive
 * here identically: the same conditional write decides whether this delivery is
 * the one that counts, and the same grant applies. Two routes to "they paid"
 * disagree eventually, and the disagreement is always about money.
 */
async function settle(
  ctx: { now(): Instant; fail(code: string, meta?: Record<string, string | number | boolean>): never },
  d: CommerceDeps,
  purchaseId: string,
  by: string,
  ref: string | null,
): Promise<{ purchaseId: string; daysAdded: number; alreadySettled: boolean }> {
  const purchase = await readPurchase(d.db, d.tenantId, purchaseId);
  if (!purchase) ctx.fail("platform.not_found", { field: "purchaseId" });

  const at = ctx.now();
  /*
    ⚠️ THE CONDITIONAL WRITE IS THE LOCK. A provider redelivering a success, or a
    coach pressing the button twice, must not buy the package again — and a
    read-then-write would let both through on the same second.
  */
  const ours = await settlePurchase(d.db, d.tenantId, purchase!.id, by, ref, at);
  if (!ours) return { purchaseId: purchase!.id, daysAdded: 0, alreadySettled: true };

  const pkg = await readPackage(d.db, d.tenantId, purchase!.packageId);
  /*
    ⚠️ A PACKAGE DELETED BETWEEN PAYING AND SETTLING LEAVES THE INTENT SETTLED
    AND NOTHING GRANTED, which is the honest state: the money moved, and what it
    bought no longer exists for anybody to describe. It is visible in the
    purchase list rather than swallowed.
  */
  if (!pkg) return { purchaseId: purchase!.id, daysAdded: 0, alreadySettled: false };

  /*
    ⚠️ THE CODE IS SPENT HERE, WHERE THE MONEY MOVED, and never at checkout. An
    intent is somebody saying they mean to pay, on a page this platform does not
    own; most are abandoned. Spending a use there exhausts a code for twenty on
    twenty people who looked at a price and closed the tab.

    ⚠️ AND A CODE THAT CANNOT BE SPENT DOES NOT UNDO THE SETTLEMENT. The payment
    already happened at the reduced price the customer was quoted; refusing here
    would be this platform arguing with a receipt.
  */
  if (purchase!.discountCode) await spendDiscount(d.db, d.tenantId, purchase!.discountCode, at);

  const applied = await applyPackage(d.db, d.tenantId, purchase!.subjectId, pkg, at, purchase!.id);
  return { purchaseId: purchase!.id, daysAdded: applied.daysAdded, alreadySettled: false };
}

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

  const override = operation({
    id: "commerce.override",
    kind: "write",
    summary: "Make an exception for one customer, without changing the package.",
    input: s.object({ subjectId: s.text({ max: 120 }), changes: s.json() }),
    output: s.object({ subjectId: s.text(), flags: s.json(), exceptions: s.json() }),
    permission: "commerce:manage",
    idempotency: { mode: "none" },
    audit: (i: { subjectId: string }) => ({ subject: i.subjectId, verb: "override" }),
    outcome: { message: "Exception saved", tone: "success", invalidates: ["commerce.capabilities"] },
    fails: ["platform.invalid"],
    /*
      ⚠️ NOT REACHABLE BY A TOOL. Widening what one customer may do is a decision
      somebody makes about a person, not one a model should take from a sentence
      in a document it was asked to summarise.
    */
    tool: false,
    async handler(ctx, input: { subjectId: string; changes: Record<string, boolean | null> }) {
      const d = deps(ctx);
      const changes = input.changes && typeof input.changes === "object" ? input.changes : {};
      /*
        ⚠️ A CAPABILITY THE MANIFEST DOES NOT SELL CANNOT BE EXCEPTED. Storing
        one puts a key in the walk that no gate reads — an exception that appears
        to do something and does nothing, for as long as anybody looks at it.
      */
      const unknown = Object.keys(changes).filter((k) => !(k in app.access.customerFlags));
      if (unknown.length) ctx.fail("platform.invalid", { field: "changes", reason: `not sold here: ${unknown.join(", ")}` });

      await setOverrides(d.db, d.tenantId, input.subjectId, changes, ctx.now());

      const access = await readAccess(d.db, d.tenantId, input.subjectId);
      const pkg = access.packageId ? await readPackage(d.db, d.tenantId, access.packageId) : null;
      return {
        subjectId: input.subjectId,
        /*
          ⚠️ WHICH EXCEPTIONS ARE ACTUALLY IN FORCE, and it is not decoration:
          clearing one has to REMOVE the key rather than store a null beside it.
          The resolver reads a null as "no exception", so the two look identical
          to the gate — and a workspace's list of people it has made exceptions
          for then grows forever with entries that mean nothing.
        */
        exceptions: access.overrides,
        /* ⚠️ The walk with its working shown, so the caller sees what the gate will. */
        flags: explainCustomerFlags({
          declared: app.access.customerFlags,
          pkg,
          snapshot: access.snapshot,
          overrides: access.overrides,
          runway: runwayFor(access.budgets, ctx.now()),
          tenantHolds: heldEntitlements(d.entitlements),
        }),
      };
    },
  });

  const repair = operation({
    id: "commerce.days",
    kind: "write",
    summary: "Correct how many days a customer has left, with a reason.",
    input: s.object({
      subjectId: s.text({ max: 120 }),
      scope: s.text({ max: 60 }),
      days: s.number({ integer: true, min: 0, max: 3_650 }),
      /* ⚠️ REQUIRED. A correction with no reason is indistinguishable from a
         mistake, six months later, to whoever has to explain it. */
      reason: s.text({ min: 3, max: 400 }),
    }),
    output: s.object({ subjectId: s.text(), runway: s.json() }),
    permission: "commerce:manage",
    idempotency: { mode: "none" },
    audit: (i: { subjectId: string }) => ({ subject: i.subjectId, verb: "days" }),
    outcome: { message: "Days corrected", tone: "success", invalidates: ["commerce.capabilities"] },
    fails: ["platform.invalid"],
    tool: false,
    async handler(ctx, input: { subjectId: string; scope: string; days: number; reason: string }) {
      const d = deps(ctx);
      /*
        ⚠️ A SCOPE NOTHING GATES BUYS NOTHING AND STILL COUNTS DOWN. The declared
        flags are where scopes come from, so a typo here is days somebody paid
        attention to and nobody can spend.
      */
      const scopes = new Set(Object.values(app.access.customerFlags).flatMap((f) => (f.scope ? [f.scope] : [])));
      if (!scopes.has(input.scope)) {
        ctx.fail("platform.invalid", { field: "scope", reason: `nothing is gated on it: ${[...scopes].join(", ")}` });
      }
      const budgets = await setRemainingDays(d.db, d.tenantId, input.subjectId, input.scope, input.days, ctx.now());
      return { subjectId: input.subjectId, runway: runwayFor(budgets, ctx.now()) };
    },
  });

  const history = operation({
    id: "commerce.history",
    kind: "read",
    summary: "What this customer has been given, most recent first.",
    input: s.object({ subjectId: s.text({ max: 120 }) }),
    output: s.object({ grants: s.json() }),
    permission: "commerce:read",
    /* ⚠️ Row scope: a customer may read their own history and staff anybody's. */
    scope: (i: { subjectId: string }) => ({ subject: i.subjectId }),
    idempotency: { mode: "none" },
    async handler(ctx, input: { subjectId: string }) {
      const d = deps(ctx);
      return { grants: await grantsFor(d.db, d.tenantId, input.subjectId) };
    },
  });

  /* ------------------------------------------------------- being paid --- */

  const payments = operation({
    id: "commerce.payments",
    kind: "read",
    summary: "How this workspace takes money from its own customers.",
    input: s.object({}),
    output: s.object({ provider: s.text(), checkoutUrl: s.text(), verifies: s.bool() }),
    permission: "commerce:read",
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      const setup = await readPayments(d.db, d.tenantId);
      /* ⚠️ The secret is never returned, only whether one is stored. */
      return { provider: setup.provider, checkoutUrl: setup.checkoutUrl ?? "", verifies: setup.verifies };
    },
  });

  const setPayments = operation({
    id: "commerce.payments.set",
    kind: "write",
    summary: "Say where customers pay, and how a notification is verified.",
    input: s.object({
      provider: s.text({ max: 16 }),
      checkoutUrl: s.optional(s.text({ max: 500 })),
      verifySecret: s.optional(s.text({ max: 200 })),
    }),
    output: s.object({ provider: s.text(), verifies: s.bool() }),
    permission: "commerce:manage",
    idempotency: { mode: "none" },
    audit: (i: { provider: string }) => ({ subject: i.provider, verb: "payments" }),
    outcome: { message: "Payment settings saved", tone: "success", invalidates: ["commerce.payments"] },
    fails: ["platform.invalid"],
    tool: false,
    async handler(ctx, input: { provider: string; checkoutUrl?: string; verifySecret?: string }) {
      const d = deps(ctx);
      if (input.provider !== "manual" && input.provider !== "link") {
        ctx.fail("platform.invalid", { field: "provider", reason: "manual or link" });
      }
      /*
        ⚠️ A LANE THAT SENDS SOMEBODY SOMEWHERE MUST HAVE SOMEWHERE TO SEND THEM.
        Storing `link` with no address produces a checkout that answers with an
        empty URL, which a screen renders as a broken button rather than as
        anything anybody can act on.
      */
      const url = input.checkoutUrl?.trim() || null;
      if (input.provider === "link" && !url) ctx.fail("platform.invalid", { field: "checkoutUrl", reason: "required" });
      if (url && !/^https:\/\//.test(url)) ctx.fail("platform.invalid", { field: "checkoutUrl", reason: "must be https" });

      const secret = input.verifySecret?.trim() || null;
      if (secret) {
        const unsafe = credentialProblem(secret);
        if (unsafe) ctx.fail("platform.invalid", { field: "verifySecret", reason: unsafe });
      }
      await savePayments(
        d.db, d.tenantId,
        { provider: input.provider === "link" ? "link" : "manual", checkoutUrl: url, verifySecret: secret },
        ctx.now(),
      );
      const after = await readPayments(d.db, d.tenantId);
      return { provider: after.provider, verifies: after.verifies };
    },
  });

  const checkout = operation({
    id: "commerce.checkout",
    kind: "write",
    summary: "Say you want to buy a package, and be told where to pay for it.",
    input: s.object({ subjectId: s.text({ max: 120 }), packageId: s.text({ max: 60 }), code: s.optional(s.text({ max: 40 })) }),
    output: s.object({ purchaseId: s.text(), payAt: s.text(), amount: s.json(), settlement: s.text(), discount: s.json() }),
    permission: "commerce:read",
    /* ⚠️ A customer may open one for themselves and nobody else. */
    scope: (i: { subjectId: string }) => ({ subject: i.subjectId }),
    idempotency: { mode: "none" },
    audit: (i: { packageId: string }) => ({ subject: i.packageId, verb: "checkout" }),
    fails: ["platform.not_found", "platform.conflict"],
    tool: false,
    async handler(ctx, input: { subjectId: string; packageId: string; code?: string }) {
      const d = deps(ctx);
      const pkg = await readPackage(d.db, d.tenantId, input.packageId);
      if (!pkg) ctx.fail("platform.not_found", { field: "packageId" });

      /*
        ⚠️ A CODE THAT DOES NOT WORK IS REFUSED RATHER THAN IGNORED. Quietly
        charging the full price to somebody who typed a code is the worst of the
        three outcomes: they pay more than they expected and find out from a
        receipt, on a page we do not own, with nothing to point at.
      */
      let discount: { code: string; percent: number } | undefined;
      if (input.code?.trim()) {
        const code = input.code.trim().toUpperCase();
        const found = await readDiscount(d.db, d.tenantId, code);
        if (!discountUsable(found, ctx.now())) ctx.fail("platform.not_found", { field: "code" });
        discount = { code, percent: found!.percent };
      }

      /*
        ⚠️ REFUSED HERE RATHER THAN AT SETTLEMENT. A once-only package somebody
        can pay for and not receive is worse than one they cannot buy — the money
        has moved on a page this platform does not control, and there is nothing
        here that could give it back.
      */
      const verdict = mayPurchase(pkg!, await priorGrants(d.db, d.tenantId, input.subjectId));
      if (!verdict.allowed) ctx.fail("platform.conflict", { reason: verdict.refusal });

      const setup = await readPayments(d.db, d.tenantId);
      const purchase = await openPurchase(d.db, d.tenantId, input.subjectId, pkg!, ctx.now(), discount);
      return {
        purchaseId: purchase.id,
        /*
          ⚠️ SAID BACK, WITH THE FULL PRICE BESIDE IT. A number that is simply
          lower than the poster is one nobody can check, and the workspace has to
          be able to confirm a payment against what it actually asked for.
        */
        discount: discount ? { code: discount.code, percent: discount.percent, was: pkg!.price } : null,
        /*
          ⚠️ THE WORKSPACE OWNS THAT PAGE, NOT US. We open an intent and hand
          over an address; tokenization, 3DS, retries and the money itself stay
          on the other side of it. That is the whole reason this abstraction can
          survive a provider it has never heard of.
        */
        payAt: setup.checkoutUrl ?? "",
        amount: purchase.amount,
        /* ⚠️ Said out loud, because "pay and wait" and "pay and it works" are
           different promises and a screen has to make the right one. */
        settlement: setup.provider === "link" && setup.verifies ? "automatic" : "confirmed_by_the_workspace",
      };
    },
  });

  const confirm = operation({
    id: "commerce.confirm",
    kind: "write",
    summary: "Confirm a customer paid, and apply what they bought.",
    input: s.object({ purchaseId: s.text({ max: 40 }), ref: s.optional(s.text({ max: 200 })) }),
    output: s.object({ purchaseId: s.text(), daysAdded: s.number({ integer: true }), alreadySettled: s.bool() }),
    permission: "commerce:manage",
    idempotency: { mode: "none" },
    audit: (i: { purchaseId: string }) => ({ subject: i.purchaseId, verb: "confirm" }),
    outcome: { message: "Payment confirmed", tone: "success", moment: "acknowledge", invalidates: ["commerce.capabilities"] },
    emits: ["package.granted"],
    fails: ["platform.not_found"],
    /*
      ⚠️ NOT A TOOL. "Somebody says they paid" is the one sentence a model must
      never be able to act on, and it is a sentence that turns up in every
      support inbox.
    */
    tool: false,
    async handler(ctx, input: { purchaseId: string; ref?: string }) {
      const d = deps(ctx);
      return settle(ctx, d, input.purchaseId, `staff:${d.tenantId}`, input.ref ?? null);
    },
  });

  /*
    ⚠️ THE WORKSPACE'S OWN PROVIDER TELLING US SOMEBODY PAID, and it is PUBLIC by
    construction — a provider cannot hold a session. So the SIGNATURE is the
    whole of the authentication, and a workspace with no stored secret must be
    REFUSED rather than trusted: this endpoint grants paid access, so an
    unverifiable lane is an open door for every workspace that has configured
    nothing, which is most of them.
  */
  const notified = operation({
    id: "webhook.customer",
    kind: "write",
    /* ⚠️ Its own record, not this one — see `auditFor`. */
    audit: { why: "a provider's own event id is the record, and `provider_event` keeps it — an audit row would be a second copy of somebody else's ledger" },
    summary: "Receive the workspace's own provider saying a customer paid.",
    input: s.object({}),
    output: s.object({ outcome: s.text() }),
    permission: PUBLIC,
    // vocabulary-exempt: the provider retries, so it supplies the key that says
    // two deliveries are one event.
    idempotency: { mode: "client-supplied" },
    fails: ["platform.forbidden", "platform.invalid", "platform.not_found"],
    tool: false,
    async handler(ctx) {
      const d = deps(ctx);
      const secret = await verifySecretOf(d.db, d.tenantId);
      /*
        ⚠️ NO SECRET IS A REFUSAL, NOT A PASS. `manual` is the default, so most
        workspaces have none — and answering them 200 would make this the way in
        for anybody who can guess a purchase id.
      */
      if (!secret) ctx.fail("platform.forbidden", { reason: "no_verification_configured" });

      const verdict = await verifySignature({ secret: secret!, body: d.body, header: d.signature, now: ctx.now() });
      if (!verdict.ok) ctx.fail("platform.forbidden", { reason: verdict.why ?? "wrong" });

      let said: { purchaseId?: unknown; ref?: unknown };
      try { said = JSON.parse(d.body) as typeof said; } catch { return ctx.fail("platform.invalid", { reason: "unreadable" }); }
      if (typeof said.purchaseId !== "string") ctx.fail("platform.invalid", { field: "purchaseId" });

      const out = await settle(
        ctx as never, d, said.purchaseId as string, "provider",
        typeof said.ref === "string" ? said.ref : null,
      );
      return { outcome: out.alreadySettled ? "already_settled" : "settled" };
    },
  });

  const purchases = operation({
    id: "commerce.purchases",
    kind: "read",
    summary: "What has been asked for and what has been paid for.",
    input: s.object({ subjectId: s.optional(s.text({ max: 120 })) }),
    output: s.object({ purchases: s.json() }),
    permission: "commerce:read",
    idempotency: { mode: "none" },
    async handler(ctx, input: { subjectId?: string }) {
      const d = deps(ctx);
      /*
        ⚠️ A CUSTOMER SEES THEIR OWN AND NOTHING ELSE, decided from the SESSION
        rather than from the request — an optional filter that a customer could
        set to somebody else's id is not a filter, it is the hole.
      */
      const mine = (ctx as { subjectId?: string }).subjectId;
      return { purchases: await purchasesFor(d.db, d.tenantId, mine ?? input.subjectId ?? null) };
    },
  });

  /* ------------------------------------------------------------ lapsing --- */

  const lapse = operation({
    id: "commerce.lapse",
    kind: "read",
    summary: "What happens to a customer whose access has run out.",
    input: s.object({}),
    output: s.object({ ladder: s.json(), floorDays: s.number({ integer: true }) }),
    permission: "commerce:read",
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      /* ⚠️ The floor travels with the setting, so a screen can say why before
         somebody types something that will be refused. */
      return { ladder: await readLadder(d.db, d.tenantId), floorDays: DESTRUCTIVE_FLOOR_DAYS };
    },
  });

  const setLapse = operation({
    id: "commerce.lapse.set",
    kind: "write",
    summary: "Decide what happens to a customer whose access has run out, and when.",
    input: s.object({ ladder: s.json() }),
    output: s.object({ ladder: s.json() }),
    permission: "commerce:manage",
    idempotency: { mode: "none" },
    audit: () => ({ subject: "lapse", verb: "set" }),
    outcome: { message: "Saved", tone: "success", invalidates: ["commerce.lapse"] },
    fails: ["platform.invalid"],
    tool: false,
    async handler(ctx, input: { ladder: Ladder }) {
      const d = deps(ctx);
      const ladder = (input.ladder && typeof input.ladder === "object" ? input.ladder : {}) as Ladder;
      /*
        ⚠️ REFUSED RATHER THAN CLAMPED. Quietly doing something gentler than what
        somebody typed leaves a settings screen showing a number the sweep does
        not use — and the number they meant was about deleting people's records.
      */
      const problems = ladderProblems(ladder);
      if (problems.length) ctx.fail("platform.invalid", { field: "ladder", reason: problems.join("; ") });

      await saveLadder(d.db, d.tenantId, ladder, ctx.now());
      return { ladder };
    },
  });

  /* -------------------------------------------------------------- codes --- */

  const issue = operation({
    id: "commerce.code.issue",
    kind: "write",
    summary: "Issue a code that tops somebody's access up.",
    input: s.object({
      code: s.text({ min: 4, max: 40 }),
      scope: s.text({ max: 60 }),
      days: s.number({ integer: true, min: 1, max: 3_650 }),
      uses: s.number({ integer: true, min: 1, max: 10_000 }),
      expiresAt: s.optional(s.text({ max: 40 })),
    }),
    output: s.object({ code: s.text(), scope: s.text(), days: s.number({ integer: true }), usesLeft: s.number({ integer: true }) }),
    permission: "commerce:manage",
    idempotency: { mode: "natural", key: "code" },
    audit: (i: { code: string }) => ({ subject: i.code, verb: "issue" }),
    outcome: { message: "Code issued", tone: "success", invalidates: ["commerce.codes"] },
    fails: ["platform.invalid", "platform.conflict"],
    tool: false,
    async handler(ctx, input: { code: string; scope: string; days: number; uses: number; expiresAt?: string }) {
      const d = deps(ctx);
      const scopes = new Set(Object.values(app.access.customerFlags).flatMap((f) => (f.scope ? [f.scope] : [])));
      if (!scopes.has(input.scope)) {
        ctx.fail("platform.invalid", { field: "scope", reason: `nothing is gated on it: ${[...scopes].join(", ")}` });
      }
      const code = input.code.trim().toUpperCase();
      const taken = (await codesFor(d.db, d.tenantId)).some((c) => c.code === code);
      if (taken) ctx.fail("platform.conflict", { field: "code", reason: "already issued" });

      const made = await issueCode(
        d.db, d.tenantId,
        { code, scope: input.scope, days: input.days, uses: input.uses, expiresAt: (input.expiresAt ?? null) as Instant | null },
        ctx.now(),
      );
      return { code: made.code, scope: made.scope, days: made.days, usesLeft: made.usesLeft };
    },
  });

  /* ---------------------------------------------------------- discounts --- */

  /**
   * ⚠️ A WORKSPACE'S OWN CODE AGAINST ITS OWN PRICES, and what it can honestly
   * do is bounded by who owns the checkout page. The workspace is paid on ITS
   * OWN provider — this platform opens an intent and hands over an address — so
   * a code changes the amount we QUOTE, record on the purchase, and ask the
   * workspace to confirm. It cannot change what a page we do not control asks
   * for, and pretending otherwise would be a discount that exists only on our
   * screen.
   */
  const saveCode = operation({
    id: "commerce.discount.save",
    kind: "write",
    summary: "Issue a code that takes a percentage off your own prices.",
    input: s.object({
      code: s.text({ min: 3, max: 40 }),
      percent: s.number({ integer: true, min: MIN_DISCOUNT_PERCENT, max: MAX_DISCOUNT_PERCENT }),
      uses: s.number({ integer: true, min: 1, max: 100_000 }),
      expiresAt: s.optional(s.text({ max: 40 })),
    }),
    output: s.object({ code: s.text(), percent: s.number({ integer: true }), usesLeft: s.number({ integer: true }) }),
    permission: "commerce:manage",
    idempotency: { mode: "natural", key: "code" },
    audit: (i: { code: string }) => ({ subject: i.code, verb: "discount" }),
    outcome: { message: "Code saved", tone: "success", invalidates: ["commerce.discounts"] },
    fails: ["platform.invalid"],
    /* ⚠️ Not a tool. A model that can mint a discount can be handed a document
       asking it to, and the loss is real money on somebody else's account. */
    tool: false,
    async handler(ctx, input: { code: string; percent: number; uses: number; expiresAt?: string }) {
      const d = deps(ctx);
      const code = input.code.trim().toUpperCase();
      const refused = refuseDiscount({ code, percent: input.percent, uses: input.uses });
      if (refused) ctx.fail("platform.invalid", { field: refused });

      const made = await saveDiscount(
        d.db, d.tenantId,
        { code, percent: input.percent, uses: input.uses, expiresAt: (input.expiresAt ?? null) as Instant | null },
        ctx.now(),
      );
      return { code: made.code, percent: made.percent, usesLeft: made.usesLeft };
    },
  });

  const discounts = operation({
    id: "commerce.discounts",
    kind: "read",
    summary: "The discount codes this workspace has issued, and what is left of them.",
    input: s.object({}),
    output: s.object({ discounts: s.json() }),
    permission: "commerce:manage",
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      return { discounts: await discountsFor(d.db, d.tenantId) };
    },
  });

  const codes = operation({
    id: "commerce.codes",
    kind: "read",
    summary: "The codes this workspace has issued, and what is left of them.",
    input: s.object({}),
    output: s.object({ codes: s.json() }),
    permission: "commerce:manage",
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      return { codes: await codesFor(d.db, d.tenantId) };
    },
  });

  const redeem = operation({
    id: "commerce.redeem",
    kind: "write",
    summary: "Redeem a code and see the days arrive.",
    input: s.object({ subjectId: s.text({ max: 120 }), code: s.text({ min: 4, max: 40 }) }),
    output: s.object({ scope: s.text(), daysAdded: s.number({ integer: true }), runway: s.json() }),
    permission: "commerce:read",
    /* ⚠️ Onto their own access and nobody else's. */
    scope: (i: { subjectId: string }) => ({ subject: i.subjectId }),
    idempotency: { mode: "none" },
    audit: (i: { code: string }) => ({ subject: i.code, verb: "redeem" }),
    outcome: { message: "Days added", tone: "success", moment: "acknowledge", invalidates: ["commerce.capabilities"] },
    fails: ["platform.not_found", "platform.conflict"],
    /*
      ⚠️ NOT A TOOL. A code is a string, and a model that can redeem one can be
      handed one in a document and asked to try it.
    */
    tool: false,
    async handler(ctx, input: { subjectId: string; code: string }) {
      const d = deps(ctx);

      /*
        ⚠️ A CODE TOPS UP; IT NEVER CREATES ACCESS — and this is checked BEFORE
        the use is claimed. This route is callable by a customer, so a code that
        leaks would otherwise mint access for anybody holding the string, and
        every attempt would burn a use belonging to somebody who was given it.
      */
      const access = await readAccess(d.db, d.tenantId, input.subjectId);
      if (!access.packageId) ctx.fail("platform.conflict", { reason: "no_package_to_top_up" });

      const claimed = await claimCode(d.db, d.tenantId, input.code.trim().toUpperCase(), ctx.now());
      if (!claimed) ctx.fail("platform.not_found", { field: "code" });

      const budgets: Record<string, Instant> = { ...access.budgets };
      /* ⚠️ Queued onto what is running, exactly as a purchase is. */
      budgets[claimed!.scope] = extendBudget(budgets[claimed!.scope] ?? null, ctx.now(), claimed!.days);
      await d.db.run(
        `UPDATE subject_access SET budgets_json = ?, updated_at = ? WHERE tenant_id = ? AND subject_id = ?`,
        JSON.stringify(budgets), ctx.now(), d.tenantId, input.subjectId,
      );
      return { scope: claimed!.scope, daysAdded: claimed!.days, runway: runwayFor(budgets, ctx.now()) };
    },
  });

  return [
    offer, save, grant, capabilities, override, repair, history,
    payments, setPayments, checkout, confirm, notified, purchases,
    lapse, setLapse, issue, codes, redeem, saveCode, discounts,
  ] as unknown as readonly AnyOperation[];
}

/* ------------------------------------------------------------- the wire --- */

/**
 * WHAT A PAYMENT DOES TO AN ACCOUNT.
 *
 * ⚠️ ONE PLACE, BECAUSE THERE ARE TWO WAYS IN. An event that names its
 * subscription and one attributed through a workspace arrive at different
 * branches and must do exactly the same thing — two settlement paths disagree
 * eventually, and the disagreement is always about money.
 *
 * ⚠️ AND A PACK IS NOT A PLAN. Credits bought outright never expire; a plan's
 * allowance is granted for the period and does not roll over. Applying one as
 * the other either destroys money somebody paid for or makes an allowance
 * permanent, and neither reports anything.
 */
async function settleOnAccount<B extends BindingSpec>(
  global: SqlHandle,
  sub: { readonly id: string; readonly accountId: string; readonly planId: string | null; readonly pendingPlanId: string | null },
  event: { readonly kind: "paid" | "failed" | "cancelled" | "refunded" | "other"; readonly planId: string | null; readonly packId: string | null; readonly customerRef: string | null },
  app: AppSpec<B>,
  at: Instant,
): Promise<void> {
  if (event.customerRef) await rememberProviderRef(global, sub.id, event.customerRef, at);

  /*
    ⚠️ A CREDIT PURCHASE MUST NOT TOUCH THE SUBSCRIPTION. Somebody topping up
    while past due would otherwise be marked paid up by buying credits — the
    ladder reset by a payment that settled nothing it was measuring.
  */
  if (event.packId) {
    const pack = (app.access.creditPacks ?? []).find((p) => p.id === event.packId);
    if (pack && event.kind === "paid") {
      await grantCredits(global, sub.accountId, {
        kind: "purchased", amount: pack.credits, reason: `pack:${pack.id}`,
        ref: `pack:${sub.id}:${event.packId}:${at}`, productId: app.id,
      }, at);
    }
    return;
  }

  await applyToSubscription(global, sub.id, event.kind, event.planId ?? sub.pendingPlanId, at);

  /*
    ⚠️ THE ALLOWANCE ARRIVES WITH THE PAYMENT, KEYED TO THE PERIOD. A renewal
    redelivered is a second month's credits inside one month unless the entry
    carries the period it is for; the ledger's own uniqueness is what stops it,
    so there is no counter anybody has to keep.
  */
  if (event.kind === "paid") {
    const planId = event.planId ?? sub.planId ?? sub.pendingPlanId;
    const plan = app.access.plans.find((p) => p.id === planId);
    const allowance = plan ? Number(plan.entitlements[CREDITS] ?? 0) : 0;
    if (allowance > 0) {
      await grantAllowance(global, { accountId: sub.accountId, subscriptionId: sub.id, productId: app.id, credits: allowance }, at);
    }
  }
}

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
    /* ⚠️ Its own record, not this one — see `auditFor`. */
    audit: { why: "a provider's own event id is the record, and `provider_event` keeps it — an audit row would be a second copy of somebody else's ledger" },
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

      /*
        ⚠️ THE SUBSCRIPTION IS TRIED FIRST, AND IT IS THE ONLY ATTRIBUTION THAT
        WORKS BEFORE A WORKSPACE EXISTS. Buying now comes before creating, so the
        ordinary successful payment names a subscription and no tenant at all —
        routed by tenant alone, every first purchase on the platform would be
        parked as `no_tenant`, which is money taken and nothing granted.
      */
      /*
        ⚠️ AND THE PROVIDER'S OWN REFERENCE IS THE SECOND TRY, WHICH IS WHAT MAKES
        A RENEWAL LAND. A checkout carries the metadata we wrote; the invoice a
        month later carries the fields the PROVIDER thinks are interesting and
        none of ours. Stamping the reference the first time an event places itself
        is what lets the second one be claimed — without it the dead letter fills
        with routine renewals, every one a subscription quietly lapsing.
      */
      /*
        ⚠️ STATED METADATA STILL WINS, AND IT WINS FIRST. An event that names
        another product must be parked here even when this worker could resolve it
        by reference — a lookup that ran ahead of the check would let one product's
        worker apply another's payment, which is the one attribution mistake that
        is worse than parking. Written the other way round it passed every test
        but the one that says so.
      */
      const mine = event!.appId === null || event!.appId === app.id;
      const named = !mine ? null
        : event!.subscriptionRef ? await subscriptionById(d.global, event!.subscriptionRef)
          : event!.customerRef ? await subscriptionByProviderRef(d.global, event!.customerRef)
            : null;
      if (named) {
        if (!(await claimEvent(d.global, event!.id, named.tenantId ?? named.id, event!.kind, at))) {
          return { outcome: "already_applied" };
        }
        await settleOnAccount(d.global, named, event!, app, at);
        return { outcome: `applied:${event!.kind}` };
      }

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

      /*
        ⚠️ IT SETTLES ON THE ACCOUNT'S SUBSCRIPTION, WHICH IS GLOBAL — so the
        region a workspace lives in no longer decides whether a payment can be
        applied at all. What still needs the region is the app's own reaction to
        it, and there is none here.
      */
      const forTenant = await subscriptionForTenant(d.global, who.tenantId);
      if (!forTenant) {
        await park(d.global, { id: event!.id, kind: event!.kind }, "no_tenant", d.body, at);
        return { outcome: "parked:no_tenant" };
      }
      await settleOnAccount(d.global, forTenant, event!, app, at);
      return { outcome: `applied:${event!.kind}` };
    },
  });

  const parked = operation({
    id: "billing.parked",
    kind: "read",
    summary: "Payment events this deployment could not attribute.",
    input: s.object({ limit: s.optional(s.number({ integer: true, min: 1, max: 100 })) }),
    output: s.object({ events: s.json(), dropped: s.number({ integer: true }) }),
    permission: OPERATE,
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
    permission: OPERATE,
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

      /*
        ⚠️ REPLAYED THROUGH THE SAME SETTLEMENT THE WEBHOOK USES, and it needs no
        region at all now — the subscription is the account's. A second apply
        here would be a second answer to "what did this payment do", reachable
        only from the operator console, which is the worst place for the two to
        disagree.
      */
      const sub = await subscriptionForTenant(d.global, input.tenantId);
      if (!sub) ctx.fail("platform.not_found", { field: "tenantId" });

      if (await claimEvent(d.global, event!.id, input.tenantId, event!.kind, at)) {
        await settleOnAccount(d.global, sub!, event!, app, at);
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
