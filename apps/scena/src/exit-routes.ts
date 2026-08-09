/**
 * LEAVING — a workspace closing itself, and a person deleting their own account.
 *
 * Both are the shared packages' routes: `@4dl/tenancy`'s `tenantCloseRoutes` and
 * `@4dl/auth`'s `accountRoutes`. Neither existed in Scena, and that is worth a
 * header rather than a line.
 *
 * ── The trap this closes ────────────────────────────────────────────────────
 *
 * `route-guard.ts` says, in its own words, that "paying must be A way out, not
 * the ONLY way out" — and then exempted billing and auth and nothing else,
 * because there was nothing else to exempt. A workspace Scena suspended over an
 * unpaid invoice had every write refused, a holding card on every screen, copy
 * telling it to settle up, and no mechanism at all for the other answer: shut
 * this down and end the relationship. The principle was stated and unbuilt.
 *
 * ── Two states, and they are not the same state ─────────────────────────────
 *
 * `suspended` is something Scena did to a workspace, and paying reverses it.
 * `closing` is something the owner did, and paying does not — CANCELLING does,
 * inside a seven-day window. The dunning sweep branches on the difference; see
 * `billing-service.ts`.
 *
 * ── Why a step-up code ──────────────────────────────────────────────────────
 *
 * Both actions are irreversible and both are reachable from a signed-in session
 * that may have been left open. A code proves the person at the keyboard still
 * has the mailbox, which is the same bar sign-in clears — and it is purpose-
 * bound, so a code minted to delete an account cannot be replayed to close a
 * workspace.
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
    // ISO out, epoch in the column — this app stores milliseconds where Tessa
    // stores strings, and the shared route only reports what it is handed.
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
   * An owner cannot delete themselves out from under a workspace: that leaves
   * one nobody can administer, still billing, with screens still playing in a
   * lobby somewhere. They close the workspace instead. The code is what the app
   * branches on to offer that path.
   */
  blockedReason: async (c, userId) => ((await isOwnerAnywhere(c.env.DB, userId)) ? "owner_must_close_workspace" : null),
  sendOtp: (c, opts) => sendActionOtp(c.env, opts),
  verifyOtp: (c, opts) => verifyActionOtp(c.env, opts),
  purgeUser: (c, userId) => purgeUser(c.env, userId),
});
