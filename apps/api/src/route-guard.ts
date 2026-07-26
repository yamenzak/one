/**
 * Central request guard (SPEC §4) — the auth boundary. Three lanes:
 *
 *   • PUBLIC routes                → pass through (own auth or none)
 *   • /api/admin/*                 → platform super-admin only
 *   • every other /api/* route     → authenticated member of an active tenant,
 *                                    gated by permissionFor(method, path)
 *
 * Row-level checks (trainer → assigned clients, client → own record) happen
 * in the handlers via requireClientAccess — this guard is the action-level
 * outer wall. There are NO unauthenticated mutation routes (the ByShujaa
 * lesson, SPEC §11).
 */
import type { MiddlewareHandler } from "hono";
import { type AppEnv, requireTenant, isPlatformAdmin, can } from "./auth-context.js";

/** Routes reachable without a tenant session. */
function isPublic(method: string, path: string): boolean {
  const isGet = method === "GET";
  // Better Auth's own endpoints (OTP send/verify, passkey ceremonies, org mgmt).
  if (path.startsWith("/api/auth/")) return true;
  // Identity probe — session or null, lets the app bootstrap.
  if (path === "/api/me") return true;
  // Which tenant owns this domain — pre-auth, brands the login screen.
  if (isGet && path === "/api/host") return true;
  // Brand assets (logo, app icon) are public by nature — they appear on the
  // pre-auth login, the storefront, the favicon, and PWA-install icons (fetched
  // without our session). Only the `brand/` prefix; all other media stays authed.
  if (isGet && /^\/api\/media\/t\/[^/]+\/brand\//.test(path)) return true;
  // Health + Stripe webhooks (signature-verified in their handlers).
  if (path === "/health") return true;
  if (path === "/api/stripe/webhook" || path === "/api/connect/webhook") return true;
  // Tenant marketplace page data + headless public article API (storefront,
  // branded sign-in skin, and /posts index + /posts/:slug full body).
  if (isGet && /^\/api\/marketplace\/[^/]+(\/posts(\/[^/]+)?)?$/.test(path)) return true;
  return false;
}

/**
 * The RBAC permission a route requires. `null` = any authenticated member of
 * the active tenant (identity/context reads).
 */
export function permissionFor(method: string, path: string): Record<string, string[]> | null {
  const isGet = method === "GET";
  const read = isGet;
  const writeVerb = method === "DELETE" ? "delete" : "update";

  // Clients & roster. Reads pass the action gate for every staff role +
  // clients themselves; the handlers scope rows via requireClientAccess.
  if (path === "/api/clients" && !isGet) return { client: ["create"] };
  if (/^\/api\/clients\/[^/]+\/archive$/.test(path)) return { client: ["archive"] };
  // Permanent delete is irreversible and reclaims storage — hold it to the same
  // owner-only action as archive rather than letting the generic
  // `client:["update"]` mapping through, which the TRAINER preset also carries.
  // The handler re-checks `role === "owner"` as well; this is the outer wall.
  if (/^\/api\/clients\/[^/]+\/delete$/.test(path)) return { client: ["archive"] };
  // Who staffs a client is studio management, not coaching. Reads stay open to
  // any coaching role (an assigned coach should see who else is on the client),
  // but assigning and unassigning ride `member:["update"]` — a resource only the
  // owner preset carries — so a trainer cannot staff other coaches onto their own
  // clients or move the `is_primary` flag that routes notifications. Previously
  // this was `client:["update"]`, which the trainer preset holds.
  if (/^\/api\/clients\/[^/]+\/trainers/.test(path)) {
    return isGet ? { client: ["read"] } : { member: ["update"] };
  }
  // Self-service writes on a client's OWN record: onboarding, profile, unit
  // prefs, dashboard layout, avatar, and the lane they're currently training.
  // The `client` role deliberately carries no `client` resource (roster
  // management is staff-only), so these ride `tracking:["update"]` — the same
  // idiom as /supplements/:id/log — and the own-record check is enforced by
  // requireClientAccess in the handler. Without this the client persona 403s on
  // the very first write onboarding makes, locking every client out of the app.
  if (
    (method === "PATCH" && /^\/api\/clients\/[^/]+$/.test(path)) ||
    (method === "POST" && /^\/api\/clients\/[^/]+\/avatar$/.test(path)) ||
    (method === "PATCH" && /^\/api\/clients\/[^/]+\/current-variant$/.test(path))
  ) {
    return { tracking: ["update"] };
  }
  if (path.startsWith("/api/clients")) return read ? null : { client: ["update"] };

  // Goals.
  if (path.includes("/goals")) return { goal: [read ? "read" : "update"] };

  // Plans + templates (workout + meal).
  if (/^\/api\/(workout|meal)-(plans|templates)\/[^/]+\/publish$/.test(path)) return { plan: ["publish"] };
  if (/^\/api\/(workout|meal)-(plans|templates)/.test(path)) {
    if (read) return null; // clients read their own published plans; rows scoped in handlers
    return { plan: [method === "POST" ? "create" : writeVerb] };
  }

  // Libraries: exercises + foods. Any member reads; staff writes. Food CREATE
  // and import stay open to clients (barcode/scan auto-import) — handler marks
  // client-created rows unverified. Exercise import is staff-only (handler).
  if ((path === "/api/foods" || path === "/api/foods/import") && method === "POST") return null;
  if (path.startsWith("/api/exercises") || path.startsWith("/api/foods")) {
    return read ? null : { library: [method === "POST" ? "create" : writeVerb] };
  }

  // Logging & tracking (own-record scope enforced in handlers).
  if (
    path.startsWith("/api/logs/") ||
    path.startsWith("/api/check-ins") ||
    path.startsWith("/api/measurements") ||
    path.startsWith("/api/arrangements") ||
    path.startsWith("/api/fasting") ||
    path.startsWith("/api/swaps") ||
    path.startsWith("/api/today")
  ) {
    return { tracking: [read ? "read" : "update"] };
  }

  // Supplements & labs.
  if (path.startsWith("/api/supplements")) {
    // Clients toggle their own supplement logs; prescribing is staff-only.
    if (/\/log$/.test(path)) return { tracking: ["update"] };
    return { supplement: [read ? "read" : writeVerb] };
  }
  if (path.startsWith("/api/labs")) {
    // Clients may upload to their own lab request (status flip in handler).
    if (/\/upload$/.test(path)) return { tracking: ["update"] };
    return { lab: [read ? "read" : writeVerb] };
  }

  // Content hub.
  if (/^\/api\/resources\/[^/]+\/publish$/.test(path)) return { content: ["publish"] };
  if (path.startsWith("/api/resources")) return read ? null : { content: [method === "POST" ? "create" : writeVerb] };

  // Sessions / front desk.
  if (path.startsWith("/api/sessions")) return { session: [read ? "read" : "update"] };

  // Commerce (packages, codes). Purchases/redeem are client actions -> null.
  if (path === "/api/redeem") return null;
  if (path.startsWith("/api/packages") || path.startsWith("/api/redemption-codes") || path.startsWith("/api/addon-types") || path.startsWith("/api/promo-codes")) {
    return read ? { package: ["read"] } : { package: [method === "POST" ? "create" : writeVerb] };
  }

  // Members / staff management.
  if (path === "/api/members" && !isGet) return { member: ["create"] };
  if (path.startsWith("/api/members")) return { member: [read ? "read" : "update"] };

  // Reports.
  if (path.startsWith("/api/reports")) return { report: ["read"] };

  // AI suite.
  if (path.startsWith("/api/ai/")) return { ai: ["use"] };

  // Media: any authenticated member; tenant isolation enforced in the handler.
  if (path.startsWith("/api/media")) return null;

  // Connect: onboarding + checkout. Onboarding is owner (billing:manage);
  // client-package checkout is a purchase (any member, row-scoped in handler).
  if (path === "/api/connect/onboard") return { billing: ["manage"] };
  if (path === "/api/connect/checkout") return null;

  // Billing: reads for owner surface, mutations need billing:manage.
  if (path.startsWith("/api/billing")) return isGet ? { billing: ["read"] } : { billing: ["manage"] };

  // Tenant settings.
  if (path.startsWith("/api/settings")) return isGet ? { settings: ["read"] } : { settings: ["manage"] };

  // Custom domains — owner surface (settings:manage); handlers scope per tenant.
  if (path.startsWith("/api/domains")) return { settings: ["manage"] };

  return null; // /api/context, /api/notifications, etc. — any member
}

export const routeGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  const path = c.req.path;
  if (!path.startsWith("/api/") && path !== "/health") return next();

  const method = c.req.method;
  if (method === "OPTIONS" || isPublic(method, path)) return next();

  if (path.startsWith("/api/admin/")) {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    return next();
  }

  // /api/context + personal /api/me/* + the personal inbox WS work for any
  // signed-in user, even before a tenant is chosen (these are personal, not
  // tenant-scoped).
  if (path === "/api/context" || path === "/api/context/switch" || path.startsWith("/api/me/") || path.startsWith("/api/inbox/")) {
    if (!c.get("user")) return c.json({ error: "unauthenticated" }, 401);
    return next();
  }

  if (!requireTenant(c)) return c.json({ error: "unauthenticated" }, 401);

  const perm = permissionFor(method, path);
  if (perm && !isPlatformAdmin(c) && !can(c, perm)) {
    return c.json({ error: "forbidden" }, 403);
  }
  return next();
};
