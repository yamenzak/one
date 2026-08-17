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
import { billFor, mixedCurrencies, subscriptionFor } from "./billing.js";
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
      /* ⚠️ EVERY enabled app, not the one this operation composed under — the
         bill is the workspace's, and a per-product answer is three emails from
         what looks like three companies. */
      const apps = ctx.enabledApps
        .map((id) => ctx.appOf(id))
        .filter((a): a is AppSpec => !!a);

      const held = await Promise.all(apps.map(async (a) => {
        const sub = await subscriptionFor(ctx.directory, ctx.tenantId as TenantId, a.id as AppId);
        const parking = a.plans.find((p) => p.parking) ?? null;
        const plan = a.plans.find((p) => p.id === sub?.planId) ?? parking;
        return {
          id: a.id, name: a.name, mark: a.mark,
          planId: plan?.id ?? null,
          status: sub?.status ?? null,
          plans: a.plans,
          entitlements: a.entitlements,
        };
      }));

      const bill = await billFor(ctx.directory, ctx.tenantId as TenantId,
        apps.map((a) => ({ id: a.id as AppId, plans: a.plans })));
      const balance = await balanceOf(ctx.directory, ctx.tenantId as TenantId);

      /*
        ⚠️ A MIXED-CURRENCY BILL SAYS SO. `billFor` leaves the offending lines
        out of the total rather than adding euros to dirhams, which is right —
        and on its own it produces a bill whose lines do not add up to its own
        total, with nothing on the screen explaining why. The refusal has to
        travel with the number it changed.
      */
      return { apps: held, bill, balance, mixed: mixedCurrencies(bill.lines) };
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
      const appId = String(input.app ?? app.id) as AppId;
      const of = ctx.appOf(appId);
      if (!of) return ctx.fail("platform.not_found");

      const plan = of.plans.find((p) => p.id === String(input.plan ?? ""));
      if (!plan) return ctx.fail("platform.invalid");

      const made = await startCheckout(
        { directory: ctx.directory, ...(ctx.configSecret ? { configSecret: ctx.configSecret } : {}) },
        {
          tenantId: ctx.tenantId as TenantId,
          appId,
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
