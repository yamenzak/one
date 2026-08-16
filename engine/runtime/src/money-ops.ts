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
import { billFor, subscriptionFor } from "./billing.js";
import { balanceOf } from "./credits.js";
import type { PlatformCtx } from "./member-ops.js";
import type { Resolved } from "./compose.js";

export function moneyOps(app: AppSpec): Readonly<Record<string, Resolved>> {
  void app;
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

      return { apps: held, bill, balance };
    },
  };
  return { "money.view": spec };
}
