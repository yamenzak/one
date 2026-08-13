/**
 * THE MARKETPLACE — every product on this deployment, and the one place to pay.
 *
 * ⚠️ THESE ANSWER ON EVERY DOOR, INCLUDING ONES WITH NO WORKSPACE. That is the
 * whole point: somebody who has never created anything has to be able to see what
 * there is, start a trial and pay for it, and none of those questions have a
 * tenant to resolve against. Mounted on the tenant lane they would be unreachable
 * at exactly the moment they matter.
 *
 * ⚠️ AND BUYING COMES BEFORE CREATING. The old order — make a workspace, park it
 * on a plan nobody chose, ask for money afterwards — is a product given away
 * until somebody gets round to paying, with a parking state to keep it alive and
 * a gate to make it useless. Here, what somebody holds after paying is a
 * subscription looking for a workspace, and creating one claims it.
 *
 * ⚠️ NOTHING HERE MINTS ANYTHING PAID. A trial is free, so this platform may
 * grant one; being paid up is a claim about money and only the thing that took it
 * may say so. Every purchase route opens an intent and returns somewhere to pay.
 */

import type { AnyOperation, AppSpec, BindingSpec, Instant, PlanSpec, SqlHandle, Product } from "@one/kernel";
import {
  PUBLIC, hadTrial, nothing, offerOf, operation, s, setupDoorFor, standingOf,
} from "@one/kernel";
import {
  balanceFor, claimableFor, creditHistory, startSubscription, subscriptionsOf,
} from "./account-billing.js";

/** ⚠️ A symbol, so an app cannot reach the account's billing by naming a property. */
export const MARKET = Symbol.for("one.runtime.market");

export interface MarketDeps {
  readonly global: SqlHandle;
  /** Null before anybody has signed in, which is most of the storefront's traffic. */
  readonly accountId: string | null;
  /** Every product this deployment sells, from the module every worker imports. */
  readonly products: readonly Product[];
  /**
   * ⚠️ THE PLANS OF THE PRODUCT THIS WORKER IS, and only those. A hub cannot
   * import another product's manifest — so a shelf spanning every product is
   * assembled from what each worker publishes, not guessed here.
   */
  readonly selling: readonly PlanSpec[];
  readonly declared: Readonly<Record<string, { readonly label: string; readonly unit?: "count" | "bytes"; readonly parked: unknown }>>;
  readonly chargeable: boolean;
  readonly portalUrl: string | null;
}

export interface MarketCarrier { readonly [MARKET]: MarketDeps }

const deps = (ctx: unknown): MarketDeps => (ctx as MarketCarrier)[MARKET];

/**
 * Where a workspace in THIS product is created.
 *
 * ⚠️ IT FALLS BACK TO THE APP'S OWN ROOT, and the fallback is the common case
 * rather than an edge. `DEPLOYMENT.products` is the list a HUB reads to offer
 * several products; a self-host runs one app and declares none of them, and an
 * app that could not say where its own setup door was would hand somebody a
 * subscription and no way to use it — on exactly the deployments with no second
 * product to be confused with.
 */
const setupFor = <B extends BindingSpec>(app: AppSpec<B>, products: readonly Product[]): string => {
  const declared = products.find((p) => p.id === app.id);
  return declared ? setupDoorFor(declared) : `https://setup.${app.tenancy.appRoot}`;
};

const DAY_MS = 86_400_000;

export function marketOperations<B extends BindingSpec>(app: AppSpec<B>): readonly AnyOperation[] {
  /**
   * WHAT THIS ACCOUNT IS ON, EVERYWHERE.
   *
   * ⚠️ ONE ANSWER FOR EVERY PRODUCT, WHICH IS WHY IT READS THE GLOBAL STORE. The
   * hub is served by one worker; asking each product's worker in turn would make
   * the page's completeness depend on how many of them are awake.
   */
  const holdings = operation({
    id: "me.subscriptions",
    kind: "read",
    summary: "What you are subscribed to, and where each stands.",
    input: nothing(),
    output: s.object({ subscriptions: s.json(), chargeable: s.bool() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    tool: false,
    async handler(ctx) {
      const d = deps(ctx);
      if (!d.accountId) return { subscriptions: [], chargeable: d.chargeable };
      const at = ctx.now();
      const mine = await subscriptionsOf(d.global, d.accountId);
      return {
        chargeable: d.chargeable,
        subscriptions: mine.map((sub) => {
          const product = d.products.find((p) => p.id === sub.productId);
          return {
            id: sub.id,
            productId: sub.productId,
            productName: product?.name ?? sub.productId,
            planId: sub.planId,
            status: sub.status,
            tenantId: sub.tenantId,
            trialEndsAt: sub.trialEndsAt,
            /*
              ⚠️ THE STANDING TRAVELS WITH IT, FROM THE SAME FUNCTION THE GATE
              READS. A hub that computed "past due" its own way is a screen that
              can disagree with the door somebody is being turned away from.
            */
            standing: standingOf(sub, at, d.chargeable),
            /* ⚠️ Where to go and finish, for the ordinary case of having paid and
               not yet made anything. Without it the only route back is memory. */
            ...(sub.tenantId === null ? { setupAt: product ? setupDoorFor(product) : setupFor(app, d.products) } : {}),
          };
        }),
      };
    },
  });

  /**
   * THE SHELF FOR THIS PRODUCT.
   *
   * ⚠️ PUBLIC, because a price list is a public fact — and the alternative is a
   * pricing page that cannot be rendered until somebody signs in.
   */
  const shelf = operation({
    id: "market.shelf",
    kind: "read",
    summary: "What this product sells, and whether a trial is still available.",
    input: nothing(),
    output: s.object({ productId: s.text(), plans: s.json(), trialAvailable: s.bool(), chargeable: s.bool() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      /*
        ⚠️ WHETHER A TRIAL IS STILL AVAILABLE IS PART OF THE SHELF, NOT A
        SURPRISE AT THE END. A card offering "14 days free" to somebody who has
        already had them is a promise the next screen takes back.
      */
      const mine = d.accountId ? await subscriptionsOf(d.global, d.accountId) : [];
      return {
        productId: app.id,
        plans: d.selling.map((plan) => offerOf(plan, app.access.entitlements)),
        trialAvailable: !hadTrial(mine, app.id),
        chargeable: d.chargeable,
      };
    },
  });

  /**
   * START ONE.
   *
   * ⚠️ A TRIAL IS GRANTED HERE AND A PAYMENT IS NOT. The row that comes back is
   * `trialing` — real, usable, with an end date — or `none`, which is a
   * subscription waiting for a provider to say the money moved. There is no third
   * outcome, and in particular there is no `active` this operation can write.
   */
  const start = operation({
    id: "market.start",
    kind: "write",
    summary: "Begin a subscription to this product, on a trial or awaiting payment.",
    input: s.object({ planId: s.text({ max: 60 }) }),
    output: s.object({ subscriptionId: s.text(), status: s.text(), trialEndsAt: s.optional(s.text()), setupAt: s.optional(s.text()), payAt: s.optional(s.text()) }),
    /*
      ⚠️ ON THE PERSONAL LANE, because the caller has no workspace — that is the
      entire situation this exists for. A permission naming a tenant would make
      the one operation that precedes having one unreachable.
    */
    permission: "workspace:create",
    idempotency: { mode: "none" },
    audit: (i: { planId: string }) => ({ subject: i.planId, verb: "subscribe" }),
    outcome: { message: "Subscription started", tone: "success", invalidates: ["me.subscriptions"] },
    fails: ["platform.not_found", "platform.conflict", "platform.forbidden"],
    /*
      ⚠️ NOT A TOOL. It commits somebody to a bill. A model that can start one can
      be talked into it by a sentence in a document it was asked to summarise.
    */
    tool: false,
    async handler(ctx, input: { planId: string }) {
      const d = deps(ctx);
      if (!d.accountId) ctx.fail("platform.forbidden", { reason: "sign in first" });
      const at = ctx.now();

      const plan = d.selling.find((p) => p.id === input.planId);
      if (!plan) ctx.fail("platform.not_found", { field: "planId" });

      const mine = await subscriptionsOf(d.global, d.accountId!);
      /*
        ⚠️ AN UNCLAIMED SUBSCRIPTION IS NOT A REASON TO SELL A SECOND ONE. Paying
        and then closing the tab is ordinary; coming back and pressing the button
        again would otherwise charge for a second workspace nobody asked for, and
        the person would be told they had bought one.
      */
      const waiting = await claimableFor(d.global, d.accountId!, app.id, at);
      if (waiting) {
        ctx.fail("platform.conflict", { field: "planId", reason: "you already hold one for this product with no workspace on it" });
      }

      /*
        ⚠️ ONE TRIAL PER ACCOUNT PER PRODUCT. The record is the subscription row's
        own `trialEndsAt`, kept after the trial ends — cleared, somebody gets a
        fresh trial every time they cancel, which is a free product with steps.
      */
      const trialDays = hadTrial(mine, app.id) ? 0 : plan!.trialDays;
      const trialEndsAt = trialDays > 0
        ? (new Date(Date.parse(at) + trialDays * DAY_MS).toISOString() as Instant)
        : null;

      const started = await startSubscription(d.global, {
        accountId: d.accountId!, productId: app.id, planId: plan!.id, trialEndsAt, providerRef: null,
      }, at);

      return {
        subscriptionId: started.id,
        status: started.status,
        ...(started.trialEndsAt ? { trialEndsAt: started.trialEndsAt } : {}),
        /* ⚠️ A TRIAL IS USABLE NOW, so it is handed straight to the setup door. */
        ...(started.status === "trialing" ? { setupAt: setupFor(app, d.products) } : {}),
        /* ⚠️ AND A PAID START GOES TO THE PROVIDER FIRST. Handing somebody to the
           setup door with an unpaid subscription would let them create a workspace
           against money that never arrived. */
        ...(started.status !== "trialing" && d.portalUrl ? { payAt: d.portalUrl } : {}),
      };
    },
  });

  /* ------------------------------------------------------------- credits --- */

  /**
   * ⚠️ ONE BALANCE, EVERY PRODUCT, AND THE TWO HALVES REPORTED SEPARATELY. A
   * single total is a number that drops overnight when an allowance lapses, with
   * nothing on the screen having said it would.
   */
  const wallet = operation({
    id: "me.credits",
    kind: "read",
    summary: "Your credit balance, what expires and when.",
    input: s.object({ limit: s.optional(s.number({ integer: true, min: 1, max: 100 })) }),
    output: s.object({ balance: s.json(), history: s.json(), packs: s.json(), chargeable: s.bool() }),
    permission: PUBLIC,
    idempotency: { mode: "none" },
    tool: false,
    async handler(ctx, input: { limit?: number }) {
      const d = deps(ctx);
      const packs = app.access.creditPacks ?? [];
      if (!d.accountId) {
        return { balance: { total: 0, granted: 0, purchased: 0, expiring: null }, history: [], packs, chargeable: d.chargeable };
      }
      const at = ctx.now();
      return {
        balance: await balanceFor(d.global, d.accountId, at),
        history: await creditHistory(d.global, d.accountId, Math.min(input.limit ?? 25, 100)),
        packs,
        chargeable: d.chargeable,
      };
    },
  });

  /**
   * ⚠️ IT OPENS AN INTENT AND GRANTS NOTHING, which is the same rule the tenant
   * rail had and matters more here: this balance is spendable in every product,
   * so an operation that granted on request would be an unmetered tap on all of
   * them at once.
   */
  const buy = operation({
    id: "me.credits.buy",
    kind: "write",
    summary: "Buy a pack of credits, usable in any product.",
    input: s.object({ packId: s.text({ max: 60 }) }),
    output: s.object({ packId: s.text(), credits: s.number({ integer: true }), payAt: s.optional(s.text()) }),
    permission: "workspace:create",
    idempotency: { mode: "none" },
    audit: (i: { packId: string }) => ({ subject: i.packId, verb: "buy-credits" }),
    fails: ["platform.not_found", "platform.unavailable", "platform.forbidden"],
    tool: false,
    async handler(ctx, input: { packId: string }) {
      const d = deps(ctx);
      if (!d.accountId) ctx.fail("platform.forbidden", { reason: "sign in first" });
      const pack = (app.access.creditPacks ?? []).find((p) => p.id === input.packId);
      if (!pack) ctx.fail("platform.not_found", { field: "packId" });
      /*
        ⚠️ AN UNPAYABLE PURCHASE REFUSES AND SAYS WHY. Answering cleanly with a
        pending purchase nothing will ever settle is somebody waiting for credits
        that are not coming, with no signal at all.
      */
      if (!d.chargeable) ctx.fail("platform.unavailable", { reason: "this deployment cannot take a payment yet" });
      return { packId: pack!.id, credits: pack!.credits, ...(d.portalUrl ? { payAt: d.portalUrl } : {}) };
    },
  });

  return [holdings, shelf, start, wallet, buy] as unknown as readonly AnyOperation[];
}
