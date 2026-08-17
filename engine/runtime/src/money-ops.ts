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
import { PLATFORM_ENTITLEMENTS } from "@engine/kernel";
import { MEMBERSHIP, billFor, mixedCurrencies, subscriptionFor } from "./billing.js";
import { startCheckout } from "./stripe.js";
import { balanceOf } from "./credits.js";
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
      const wallet = await balanceOf(ctx.directory, ctx.tenantId as TenantId);

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

      const made = await startCheckout(
        { directory: ctx.directory, ...(ctx.configSecret ? { configSecret: ctx.configSecret } : {}) },
        {
          tenantId: ctx.tenantId as TenantId,
          appId: MEMBERSHIP,
          plan,
          email: ctx.email,
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

  return { "money.view": spec, "money.checkout": checkout };
}
