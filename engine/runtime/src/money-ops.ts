/**
 * WHAT THIS WORKSPACE PAYS US — the read the Money area stands on.
 *
 * ⚠️ ONE ANSWER FOR THE WHOLE WORKSPACE, HOWEVER MANY PRODUCTS IT HOLDS. The
 * one-bill promise is a bill somebody can SEE: one call returns the plan each
 * enabled app is on, the lines a charge would collect, and the credit balance —
 * assembled from the same functions the gate and the sweep read, so the screen
 * cannot disagree with the charge.
 *
 * ⚠️ BEHIND `billing:read`, which managers hold and staff do not. The prices on
 * the public shelf are not the secret; what THIS workspace pays, and how much
 * credit it holds, is workspace business.
 */

import type { AppId, AppSpec, TenantId } from "@engine/kernel";
import { PLATFORM_ENTITLEMENTS, isBusiness } from "@engine/kernel";
import { MEMBERSHIP, billFor, mixedCurrencies, subscriptionFor } from "./billing.js";
import { startCheckout, startTopUp } from "./stripe.js";
import { armAutoTopUp, autoTopUpOf, movements, spentByApp, walletOf } from "./wallet.js";
import type { PlatformCtx } from "./member-ops.js";
import type { Resolved } from "./compose.js";

export function moneyOps(app: AppSpec): Readonly<Record<string, Resolved>> {
  const spec: Resolved = {
    id: "money.view",
    kind: "read",
    method: "GET",
    path: "/api/money.view",
    permission: "billing:read",
    spec: {
      id: "money.view", kind: "read", summary: "What this workspace pays, and holds.",
      input: {}, output: {},
      permission: "billing:read",
      idempotency: { mode: "none" },
      async handler() { return {} as never; },
    } as Resolved["spec"],
    run: async (bare) => {
      const ctx = bare as PlatformCtx;
      /*
        ⚠️ ONE MEMBERSHIP, SO ONE ANSWER. The bill is the workspace's — its plan,
        its balance, what its meters drew — and the products it has switched on
        are a list beside it rather than N bills stacked. A per-product answer is
        three emails from what looks like three companies.
      */
      const apps = ctx.enabledApps
        .map((id) => ctx.appOf(id))
        .filter((a): a is AppSpec => !!a);

      const sub = await subscriptionFor(ctx.directory, ctx.tenantId as TenantId, MEMBERSHIP);
      const parking = ctx.plans.find((p) => p.parking) ?? null;
      const plan = ctx.plans.find((p) => p.id === sub?.planId) ?? parking;

      const bill = await billFor(ctx.directory, ctx.tenantId as TenantId, ctx.plans);
      const wallet = await walletOf(ctx.directory, ctx.tenantId as TenantId);

      /*
        ⚠️ A BALANCE WITH NO HISTORY BEHIND IT IS A NUMBER SOMEBODY HAS TO TAKE
        ON TRUST. "Where did my credits go" is the first question a shared wallet
        provokes, and it has two halves: which product spent them, and what
        happened in what order. Both travel with the balance, because a screen
        that has to fetch them separately is one that shows the number first and
        the explanation second, if at all.
      */
      const since = new Date(ctx.now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const spent = await spentByApp(ctx.directory, ctx.tenantId as TenantId, since);
      const statement = await movements(ctx.directory, ctx.tenantId as TenantId);
      /* ⚠️ AND WHAT THE STANDING INSTRUCTION IS, INCLUDING WHY IT LAST FAILED.
         A decline is answered by a bank and nobody is present to see it, so this
         row is the only place a customer can find out that their credits stopped
         topping up and what to do about it. */
      const armed = await autoTopUpOf(ctx.directory, ctx.tenantId as TenantId);

      return {
        /* ⚠️ THE PLAN IS THE WORKSPACE'S; the products are what it reaches. */
        plan: plan ? { id: plan.id, name: plan.name, kind: plan.kind } : null,
        status: sub?.status ?? null,
        plans: ctx.plans,
        /* ⚠️ Every key the workspace could hold — the platform's and every
           enabled product's — so the shelf can say what a tier changes. */
        entitlements: {
          ...PLATFORM_ENTITLEMENTS,
          ...Object.fromEntries(apps.flatMap((a) => Object.entries(a.entitlements))),
        },
        apps: apps.map((a) => ({ id: a.id, name: a.name, mark: a.mark })),
        bill,
        wallet,
        packs: ctx.packs,
        armed,
        spent,
        statement,
        mixed: mixedCurrencies(bill.lines),
      };
    },
  };

  /**
   * WHERE SOMEBODY GOES TO PAY.
   *
   * ⚠️ THE PLAN IS RESOLVED FROM THE MANIFEST, NEVER FROM THE BODY. A price in a
   * request is a price the caller chose — the oldest checkout bug there is — and
   * an id that names no declared plan is refused rather than defaulted.
   *
   * ⚠️ AND IT GRANTS NOTHING. Pressing this opens a page Stripe owns; the plan is
   * stamped only when a SIGNED event says the money moved. A handler that wrote
   * the subscription here would be one where opening the page and closing it
   * bought a month.
   *
   * ⚠️ `billing:manage`, NOT `billing:read`. Looking at what a workspace pays and
   * committing it to a monthly charge are different authorities, and the second
   * one is an owner's.
   */
  const checkout: Resolved = {
    id: "money.checkout",
    kind: "write",
    method: "POST",
    path: "/api/money.checkout",
    permission: "billing:manage",
    spec: {
      id: "money.checkout", kind: "write", summary: "Start paying for a plan.",
      input: {}, output: {},
      permission: "billing:manage",
      idempotency: { mode: "none" },
      async handler() { return {} as never; },
    } as Resolved["spec"],
    run: async (bare, input) => {
      const ctx = bare as PlatformCtx;
      /* ⚠️ THE DEPLOYMENT'S CATALOGUE, NEVER THE BODY. A price in a request is a
         price the caller chose — the oldest checkout bug there is — and an id
         naming no declared plan is refused rather than defaulted. */
      const plan = ctx.plans.find((p) => p.id === String(input.plan ?? ""));
      if (!plan) return ctx.fail("platform.invalid");
      /* ⚠️ THE LOBBY CANNOT BE BOUGHT. It is where a workspace lands, not
         something anybody chooses, and a checkout for it would be a session that
         completes and charges nothing. */
      if (plan.parking) return ctx.fail("platform.invalid");

      /*
        ⚠️ A COMMERCIAL TIER NEEDS THE LEGAL NAME BEFORE THE MONEY, because the
        name is what goes on the invoice the payment produces. Asking afterwards
        would mean a workspace that paid for a business tier and is still
        personal until somebody fills in a form — and the charge is already on
        the card by then.
      */
      const legalName = String(input.legalName ?? "").trim();
      if (isBusiness(plan.kind) && !legalName) return ctx.fail("platform.invalid");

      const made = await startCheckout(
        { directory: ctx.directory, ...(ctx.configSecret ? { configSecret: ctx.configSecret } : {}) },
        {
          tenantId: ctx.tenantId as TenantId,
          appId: MEMBERSHIP,
          plan,
          email: ctx.email,
          ...(isBusiness(plan.kind) ? { legalName } : {}),
          /* ⚠️ THE RETURN ADDRESSES COME FROM THE REQUEST'S OWN ORIGIN, handed
             down by the deployment. A constant here would send an EU workspace
             on a custom domain back to somebody else's hostname. */
          successUrl: `${ctx.origin}/space/w/${ctx.slug ?? ""}/money?paid=1`,
          cancelUrl: `${ctx.origin}/space/w/${ctx.slug ?? ""}/money`,
        });

      /* ⚠️ THREE REFUSALS, THREE DIFFERENT THINGS TO DO NEXT: ask us to
         configure it, choose a plan that costs something, or try again. */
      if (made === "not_charging") return ctx.fail("platform.unavailable");
      if (made === "free_plan") return ctx.fail("platform.invalid");
      if (made === "stripe_refused") return ctx.fail("platform.unavailable");
      return { url: made.url };
    },
  };

  /**
   * TOPPING THE WALLET UP.
   *
   * ⚠️ THE SAME SHAPE AS THE PLAN CHECKOUT, AND FOR THE SAME REASONS: the pack
   * is resolved from the deployment's own list, the session grants nothing, and
   * only a signed event moves the balance. What differs is one word — Stripe's
   * `mode` is `payment`, because a pack is bought rather than rented.
   *
   * ⚠️ `billing:manage`, because this spends money. Reading what a wallet holds
   * is a manager's; charging a card is an owner's.
   */
  const topup: Resolved = {
    id: "money.topup",
    kind: "write",
    method: "POST",
    path: "/api/money.topup",
    permission: "billing:manage",
    spec: {
      id: "money.topup", kind: "write", summary: "Buy credits.",
      input: {}, output: {},
      permission: "billing:manage",
      idempotency: { mode: "none" },
      async handler() { return {} as never; },
    } as Resolved["spec"],
    run: async (bare, input) => {
      const ctx = bare as PlatformCtx;
      const pack = ctx.packs.find((p) => p.id === String(input.pack ?? ""));
      if (!pack) return ctx.fail("platform.invalid");

      const made = await startTopUp(
        { directory: ctx.directory, ...(ctx.configSecret ? { configSecret: ctx.configSecret } : {}) },
        {
          tenantId: ctx.tenantId as TenantId,
          pack,
          email: ctx.email,
          successUrl: `${ctx.origin}/space/w/${ctx.slug ?? ""}/money?topped=1`,
          cancelUrl: `${ctx.origin}/space/w/${ctx.slug ?? ""}/money`,
        });

      if (made === "not_charging") return ctx.fail("platform.unavailable");
      if (made === "free_plan") return ctx.fail("platform.invalid");
      if (made === "stripe_refused") return ctx.fail("platform.unavailable");
      return { url: made.url };
    },
  };

  /**
   * ARMING THE STANDING TOP-UP.
   *
   * ⚠️ NOTHING TURNS THIS ON BY ITSELF, AND CLEARING THE PACK TURNS IT OFF. It
   * authorises a charge to a card with nobody present, so the only way it can
   * exist is that somebody set it — a standing charge a product armed on a
   * customer's behalf is the shape of every subscription complaint there has
   * ever been.
   *
   * ⚠️ AND A THRESHOLD BELOW WHICH IT WOULD NEVER FIRE IS REFUSED. Zero is not
   * "off", it is a switch that looks armed and never runs; turning it off is
   * clearing the pack, which is a different sentence on the screen.
   */
  const auto: Resolved = {
    id: "money.auto",
    kind: "write",
    method: "POST",
    path: "/api/money.auto",
    permission: "billing:manage",
    spec: {
      id: "money.auto", kind: "write", summary: "Buy more credits automatically.",
      input: {}, output: {},
      permission: "billing:manage",
      idempotency: { mode: "none" },
      async handler() { return {} as never; },
    } as Resolved["spec"],
    run: async (bare, input) => {
      const ctx = bare as PlatformCtx;
      const wanted = String(input.pack ?? "");

      /* ⚠️ CLEARING IT IS THE OFF SWITCH, and it is allowed unconditionally —
         somebody turning a standing charge off must never meet a refusal. */
      if (!wanted) {
        await armAutoTopUp(ctx.directory, ctx.tenantId as TenantId, null, 0);
        return { armed: false };
      }

      const pack = ctx.packs.find((p) => p.id === wanted);
      if (!pack) return ctx.fail("platform.invalid");

      const below = Math.trunc(Number(input.below ?? 0));
      if (!(below > 0)) return ctx.fail("platform.invalid");

      await armAutoTopUp(ctx.directory, ctx.tenantId as TenantId, pack.id, below);
      return { armed: true, pack: pack.id, below };
    },
  };

  return {
    "money.view": spec, "money.checkout": checkout,
    "money.topup": topup, "money.auto": auto,
  };
}
