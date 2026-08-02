/**
 * Kova's binding of the shared tenant close (`/api/tenant/close*`).
 *
 * The routes, the owner gate and the step-up ceremony are `@4dl/tenancy`'s.
 * What is Kova's is the state transition, and it is genuinely Kova's: closing a
 * studio cancels the KOVA subscription (charging stops) *and* every client
 * subscription on the studio's own payment rail — because billing a client for
 * coaching that has already ended is not something a grace window should cover.
 * The 7-day hold then runs to `purgeTenant` on the daily sweep, and the owner
 * can undo inside the window.
 */

import { tenantCloseRoutes as sharedCloseRoutes } from "@4dl/tenancy";
import type { AppEnv } from "./auth-context.js";
import { sendActionOtp, verifyActionOtp } from "./action-otp.js";
import { scheduleTenantClose, cancelTenantClose } from "./purge.js";
import { tenantBrandKit } from "./notify.js";

export const tenantCloseRoutes = sharedCloseRoutes<AppEnv>({
  actorOf: (c) => {
    const user = c.get("user");
    const tenantId = c.get("tenantId");
    return user && tenantId ? { tenantId, userId: user.id, role: c.get("role") ?? "", email: user.email ?? null } : null;
  },
  creatorRole: "owner",
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
  // The studio's own brand name, so the code says "confirm closing Hale Studio"
  // rather than naming a tenant id nobody recognises.
  actionLabel: async (c, tenantId) => `closing ${(await tenantBrandKit(c.env.DB, tenantId)).name}`,
});
