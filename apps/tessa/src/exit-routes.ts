/**
 * LEAVING — a centre closing itself, and a person deleting their own account.
 *
 * Both are the shared packages' routes: `@4dl/tenancy`'s `tenantCloseRoutes` and
 * `@4dl/auth`'s `accountRoutes`. Neither existed here, which is why they are
 * worth a header rather than a line.
 *
 * `route-guard.ts` has exempted `/api/tenant/close` from the read-only gate
 * since it was written — the standing ladder is deliberately built so that
 * paying is A way out and not the ONLY one. The route it exempted did not
 * exist. So a suspended centre was in a trap: every write refused, the copy
 * telling them to settle the invoice, and no way to shut the thing down and end
 * the relationship instead. The exemption protected nothing.
 *
 * Self-delete matters here for a second reason. A German medical centre's staff
 * have a DSGVO right to erasure, and an app with no mechanism has an obligation
 * it cannot discharge. What survives the erasure is deliberate and documented in
 * `purge.ts`: the ledger keeps the opaque id of whoever released a load, because
 * a Freigabe with no named releaser is not a record under MPBetreibV.
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
    return `closing ${name ?? "your centre"}`;
  },
  copy: { forbidden: "Only an owner can close the centre." },
});

export const accountRoutes = sharedAccountRoutes<AppEnv>({
  actorOf: (c) => {
    const user = c.get("user");
    return user ? { userId: user.id, email: user.email ?? null } : null;
  },
  /**
   * An owner cannot delete themselves out from under a centre: that leaves one
   * nobody can administer, still billing, holding records other people are
   * responsible for. They close the centre instead. The code is what the app
   * branches on to offer that path.
   */
  blockedReason: async (c, userId) => ((await isOwnerAnywhere(c.env.DB, userId)) ? "owner_must_close_centre" : null),
  sendOtp: (c, opts) => sendActionOtp(c.env, opts),
  verifyOtp: (c, opts) => verifyActionOtp(c.env, opts),
  purgeUser: (c, userId) => purgeUser(c.env, userId),
});
