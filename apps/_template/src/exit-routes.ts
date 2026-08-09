/**
 * LEAVING — a tenant closing itself, and a person deleting their own account.
 *
 * Both are the shared packages' routes: `@4dl/tenancy`'s `tenantCloseRoutes` and
 * `@4dl/auth`'s `accountRoutes`. They are in the template rather than left as an
 * exercise because of what happens when they are missing, which is not "a
 * feature is absent".
 *
 * ⚠️ **`route-guard.ts` already exempts `/api/tenant/close` and `/api/me/*`
 * from every rung of the standing ladder.** The ladder is deliberately built so
 * that paying is A way out and not the ONLY one. If the routes those exemptions
 * name do not exist, the exemption protects nothing and a suspended tenant is in
 * a trap: every write refused, the copy telling them to settle the invoice, and
 * no mechanism at all for the other answer. That shipped in two apps — the
 * comment in the guard was written first and the routes never followed.
 *
 * The self-delete matters for a second reason. A person has a right to erasure,
 * and an app with no mechanism has an obligation it cannot discharge. What
 * SURVIVES the erasure is a decision each app makes deliberately and writes down
 * — see `purge.ts`.
 */

import { accountRoutes as sharedAccountRoutes } from "@4dl/auth";
import { tenantCloseRoutes as sharedCloseRoutes } from "@4dl/tenancy";
import type { AppEnv } from "./auth-context.js";
import { sendActionOtp, verifyActionOtp } from "./action-otp.js";
import { cancelTenantClose, isOwnerAnywhere, purgeUser, scheduleTenantClose } from "./purge.js";
import { CREATOR_ROLE } from "./access.js";

export const tenantCloseRoutes = sharedCloseRoutes<AppEnv>({
  actorOf: (c) => {
    const user = c.get("user");
    const tenantId = c.get("tenantId");
    return user && tenantId ? { tenantId, userId: user.id, role: c.get("role") ?? "", email: user.email ?? null } : null;
  },
  creatorRole: CREATOR_ROLE,
  /**
   * The STATE TRANSITION is the app's, which is why this is injected rather than
   * done by the package: `closing` is a rung of the subscription's own status,
   * and which table holds that is a schema decision.
   */
  statusOf: async (c, tenantId) => {
    const row = await c.env.DB
      .prepare("SELECT status, delete_at FROM subscriptions WHERE tenant_id = ?")
      .bind(tenantId)
      .first<{ status: string; delete_at: string | null }>();
    const closing = row?.status === "closing";
    return { closing, deleteAt: closing ? (row?.delete_at ?? null) : null };
  },
  schedule: (c, tenantId) => scheduleTenantClose(c.env, tenantId),
  cancel: (c, tenantId) => cancelTenantClose(c.env, tenantId),
  sendOtp: (c, opts) => sendActionOtp(c.env, opts),
  verifyOtp: (c, opts) => verifyActionOtp(c.env, opts),
  actionLabel: async (c, tenantId) => {
    const name = (await c.env.DB.prepare('SELECT name FROM "organization" WHERE id = ?').bind(tenantId).first<{ name: string }>())?.name;
    return `closing ${name ?? "your workspace"}`;
  },
  copy: { forbidden: "Only an owner can close the workspace." },
});

export const accountRoutes = sharedAccountRoutes<AppEnv>({
  actorOf: (c) => {
    const user = c.get("user");
    return user ? { userId: user.id, email: user.email ?? null } : null;
  },
  /**
   * An owner cannot delete themselves out from under a tenant: that leaves one
   * nobody can administer, still billing, holding records other people are
   * responsible for. They close the tenant instead. The CODE is what the app
   * branches on to offer that path — a bare 403 would leave them stuck with no
   * indication that there is another door.
   */
  blockedReason: async (c, userId) => ((await isOwnerAnywhere(c.env.DB, userId)) ? "owner_must_close_tenant" : null),
  sendOtp: (c, opts) => sendActionOtp(c.env, opts),
  verifyOtp: (c, opts) => verifyActionOtp(c.env, opts),
  purgeUser: (c, userId) => purgeUser(c.env, userId),
});
