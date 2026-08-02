/**
 * THE ROUTE TABLE — the app's half of `@4dl/auth`'s five-gate guard.
 *
 * The ENGINE runs the gates in a fixed order and is not the app's to reorder:
 *
 *   1. the HOST gate      an unserved hostname 404s; the root is a signpost; a
 *                         hostname owning no tenant answers almost nothing
 *   2. the SESSION gate   authenticated, or on the public lane
 *   3. the TENANT gate    a member OF THE HOST'S TENANT, not of any tenant
 *   4. the STANDING gate  a lapsed tenant's writes refuse — reads NEVER do
 *   5. the PERMISSION     the grant the route requires
 *
 * What this file supplies is which routes fall where. Five predicates, and the
 * mistakes each one prevents are specific:
 *
 * `allowedOnRoot` vs `allowedWithoutTenant` are deliberately DIFFERENT and the
 * second is much narrower. The root is ours and may serve identity and webhooks;
 * a hostname owning no tenant is nobody's. Collapsing them re-opens a real hole:
 * the auth lane is public, so on an unowned hostname — including the
 * `*.workers.dev` name Cloudflare publishes for every worker, which anyone can
 * guess — a stranger could request a sign-in code, verify it, and create a
 * tenant from an address that appears nowhere and belongs to nobody.
 *
 * `allowedWhileReadOnly` is why LEAVING is always possible. Withholding the
 * product is not the same as holding someone's data hostage over an invoice: the
 * account-close and export paths must survive every rung of the ladder, and
 * provider webhooks must too — blocking those makes suspension unrecoverable.
 */

import { routeGuard, type Grant } from "@4dl/auth";
import type { AppContext } from "./auth-context.js";
import type { Auth } from "./auth.js";
import type { Branding } from "./host-context.js";
import type { Env } from "./env.js";
import { isPlatformAdmin } from "./auth-context.js";

/** Reachable with no session at all. */
const isPublic = (method: string, path: string): boolean =>
  path.startsWith("/api/auth/") ||
  path === "/api/host" ||
  path === "/health" ||
  (method === "POST" && path.startsWith("/api/webhooks/"));

/**
 * The permission a route requires. `null` = any authenticated member.
 *
 * Default-deny is the engine's job, not this table's — an unlisted route still
 * needs a session and a tenant. What this decides is the ADDITIONAL grant.
 */
function permissionFor(method: string, path: string): Grant | null {
  const write = method !== "GET" && method !== "HEAD";
  if (path.startsWith("/api/catalog")) return write ? { catalog: ["create"] } : { catalog: ["read"] };
  /**
   * Stock and locations.
   *
   * Reads pass for anyone who may see the shelf; every WRITE re-checks its own
   * specific grant in the handler (`stock:receive` vs `stock:consume` vs
   * `stock:quarantine`), because they are genuinely different acts and the outer
   * wall cannot tell them apart from the path alone.
   */
  if (path.startsWith("/api/locations")) return write ? { settings: ["manage"] } : { catalog: ["read"] };
  if (path.startsWith("/api/stock")) return write ? { stock: ["read"] } : { stock: ["read"] };
  // Same arrangement for the CSSD surfaces: the outer wall proves you may see
  // them at all, and each handler proves the specific act — `instrument:manage`
  // is not `instrument:retire`, and `pack:build` is not `pack:open`.
  if (path.startsWith("/api/instruments")) return { instrument: ["read"] };
  if (path.startsWith("/api/packs")) return { pack: ["read"] };
  if (path.startsWith("/api/recipes")) return { pack: ["read"] };
  if (path.startsWith("/api/cycles")) return { sterilisation: ["read"] };
  if (path.startsWith("/api/cases")) return { case: ["read"] };
  // The recall report is READ-ONLY by nature, and `trace:read` is the one grant
  // an auditor holds — see access.ts. Keeping it off `sterilisation:read` is
  // what lets an inspection account see the recall and nothing else.
  if (path.startsWith("/api/trace")) return { trace: ["read"] };
  if (path.startsWith("/api/reports")) return { report: ["read"] };
  // Insights are a REPORT. `report:read` is one of the two grants an inspection
  // account holds, so an auditor sees the throughput and release-rate numbers —
  // which is exactly who those numbers are for.
  if (path.startsWith("/api/insights")) return { report: ["read"] };
  if (path.startsWith("/api/billing")) return write ? { billing: ["manage"] } : { billing: ["read"] };
  if (path.startsWith("/api/settings")) return write ? { settings: ["manage"] } : { settings: ["read"] };
  /**
   * Staff. The outer wall proves membership; `staff-routes.ts` proves OWNER on
   * every write, because staff management is not a grant a centre can hand out —
   * whoever can add staff can add themselves an owner. Reading the list is any
   * member's: checking who holds release rights before a shift handover is not a
   * privileged question.
   */
  if (path.startsWith("/api/staff")) return null;
  if (path.startsWith("/api/ai/")) return { ai: ["use"] };
  return null;
}

/** The root door is a signpost — it may still sign people in and take webhooks. */
const allowedOnRoot = (path: string): boolean =>
  path.startsWith("/api/auth/") || path === "/api/host" || path === "/health" || path.startsWith("/api/webhooks/");

/** A well-formed hostname owning NO tenant: the host probe, and nothing else. */
const allowedWithoutTenant = (path: string): boolean => path === "/api/host" || path === "/health";

/**
 * PERSONAL surfaces — a person's own identity, which no tenant owns.
 *
 * The engine's gate 3 requires a tenant, and on the `setup.` door there is no
 * tenant by definition: somebody who has just proved they own an email has not
 * created a centre yet. Without this the app cannot tell a signed-in owner from
 * a signed-out stranger, so it re-renders the sign-in form they just completed,
 * forever — which is exactly what it did until the flow was driven in a browser.
 * Neither the typecheck nor the integration suite could see it, because both
 * stop at the HTTP boundary and 401 is a perfectly ordinary answer there.
 *
 * Deliberately two paths and no prefix: identity and the list of workspaces this
 * person belongs to. `/api/context` reports `active: null` when there is no
 * tenant, which is the signal the app needs and the whole of what it may learn
 * here. Every route that touches a centre's DATA stays behind the tenant gate.
 */
const isPersonal = (path: string): boolean => path === "/api/context" || path === "/api/me";

/** Writes that survive a read-only tenant. Leaving is always allowed. */
const allowedWhileReadOnly = (path: string): boolean =>
  path.startsWith("/api/webhooks/") ||
  path.startsWith("/api/me") ||
  /**
   * PREFIX, not equality. `/api/tenant/close` schedules the close and flips the
   * centre to `closing`, which is itself a read-only rung — so with an exact
   * match the UNDO (`/close/cancel`), the confirmation code (`/close/request-otp`)
   * and the status read were all refused by the very state they exist to get out
   * of. A close you cannot cancel is not a grace window.
   */
  path.startsWith("/api/tenant/close") ||
  // The inbox is PERSONAL — both writes are scoped to `recipient_user_id` and
  // touch no centre data. A centre spends up to seven days read-only, and a bell
  // whose badge cannot be cleared for a week trains people to ignore it, which
  // is the last thing you want of the surface that carries a recall.
  path.startsWith("/api/inbox/") ||
  path.startsWith("/api/notifications/");

/**
 * Paths that answer even while the DEPLOYMENT is closed for maintenance.
 *
 * `/health` and the `admin.` door are exempt inside the engine. This is the
 * app's own short list, and it is short on purpose:
 *
 *   `/api/host`         carries the maintenance state, so it is how the app
 *                       learns to render the notice instead of a broken login.
 *   `/api/webhooks/*`   signature-verified provider callbacks. A payment webhook
 *                       dropped during a window is not retried forever — the
 *                       provider disables the endpoint, and money is captured
 *                       with nothing granted.
 */
const maintenanceExempt = (path: string): boolean =>
  path === "/api/host" || path.startsWith("/api/webhooks/");

export const guard = routeGuard<Env, Auth, Branding>({
  isPublic,
  permissionFor,
  allowedOnRoot,
  allowedWithoutTenant,
  isPersonal,
  allowedWhileReadOnly,
  isPlatformAdmin: (c) => isPlatformAdmin(c as never),
  // The STANDING gate, injected — this is what keeps `@4dl/auth` independent of
  // billing. An app that never bills returns `null` here and every route passes
  // the gate untouched.
  gate: (c) => c.get("host").gate,
  isBillingWrite: (path) => path.startsWith("/api/billing"),
  billingPermission: { billing: ["manage"] },
  // The DEPLOYMENT-wide switch, resolved once per request by
  // `maintenanceMiddleware` (index.ts). Same injection shape as `gate` above,
  // for the same reason: `@4dl/auth` learns nothing about where it is stored.
  maintenance: (c) => (c as unknown as AppContext).get("maintenance"),
  maintenanceExempt,
});
