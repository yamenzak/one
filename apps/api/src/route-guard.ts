/**
 * Central request guard (SPEC §4) — the auth boundary. Four gates, in order:
 *
 *   1. HOST      → is this door allowed to answer this route at all?
 *   2. PUBLIC    → pass through (own auth or none)
 *   3. ADMIN     → platform super-admin, on the operator door only
 *   4. MEMBER    → authenticated member of the host's tenant, gated by
 *                  permissionFor(method, path)
 *   5. STANDING  → is the studio paid up, or is its subdomain read-only?
 *
 * Row-level checks (trainer → assigned clients, client → own record) happen
 * in the handlers via requireClientAccess — this guard is the action-level
 * outer wall. There are NO unauthenticated mutation routes (the ByShujaa
 * lesson, SPEC §11).
 */
import type { MiddlewareHandler } from "hono";
import { isDevRoot, type HostRole } from "@4dl/platform";
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

/**
 * Routes that must keep working on the ROOT door — the dead end.
 *
 * The root serves no app, but a signed-in visitor who lands there (a bookmark, a
 * stale link, an installed PWA whose start_url predates the move) should be shown
 * the way to their studios rather than a blank wall. That signpost needs its
 * identity and its studio list, and nothing else — so `/api/context` is allowed
 * and every other tenant route is not.
 */
function allowedOnRoot(path: string): boolean {
  return (
    path === "/api/me" ||
    path === "/api/context" ||
    path === "/api/host" ||
    path.startsWith("/api/auth/") ||
    path === "/health" ||
    // The STRIPE WEBHOOKS. They are platform endpoints, not a studio's, so the
    // root — the canonical platform origin, and the URL anyone configuring Stripe
    // would reach for first — has to answer them.
    //
    // Leaving them off this list was a silent outage waiting to happen: an endpoint
    // pointed at `https://<root>/api/stripe/webhook` 404s, Stripe retries a few
    // times and then DISABLES the endpoint, and the symptom is that customers pay
    // successfully while their studio is never activated. Nothing in the app would
    // report it, because from our side the request never arrived.
    //
    // Safe to expose here for the same reason they are exempt from the read-only
    // gate below: they carry no session, and each verifies Stripe's signature
    // against the configured secret before it does anything.
    isStripeWebhook(path)
  );
}

/** The two signature-verified Stripe callbacks: platform rail and Connect rail. */
function isStripeWebhook(path: string): boolean {
  return path === "/api/stripe/webhook" || path === "/api/connect/webhook";
}

/**
 * Writes that must survive a read-only (suspended / closing) studio.
 *
 * The critical one is the STRIPE WEBHOOKS. A suspended studio is un-suspended by
 * a successful payment, and Stripe tells us about that with a POST — so blocking
 * webhooks on a read-only host would make suspension permanent and unrecoverable,
 * the single worst bug this gate could have. They are signature-verified in their
 * handlers and carry no session, so letting them through costs nothing.
 *
 * The rest is the minimum needed to get out of the state or leave: sign in/out,
 * the studio switcher (you must be able to walk away to another studio), and
 * personal, non-tenant surfaces like notification read-receipts.
 */
function allowedWhileReadOnly(path: string): boolean {
  return (
    path.startsWith("/api/auth/") ||
    isStripeWebhook(path) ||
    path === "/api/context/switch" ||
    // A person may always leave, and always take their data with them, whatever
    // the studio owes. `/api/me/` covers a client deleting their own account.
    path.startsWith("/api/me/") ||
    path.startsWith("/api/tenant/close") ||
    // …and this covers the OWNER closing the studio. It was missing, which made
    // a suspended studio a trap: every write refused, the copy saying "pay to
    // restore", and no way to shut the thing down and end the relationship
    // instead. Paying must be A way out, not the ONLY way out.
    path.startsWith("/api/inbox/")
  );
}

/** Billing surfaces the owner of a lapsed studio may still write to, so the one
 *  action that fixes the situation is reachable from inside the lock. */
function isBillingWrite(path: string): boolean {
  return path.startsWith("/api/billing") || path.startsWith("/api/stripe/") || path === "/api/connect/onboard";
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const routeGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  const path = c.req.path;
  if (!path.startsWith("/api/") && path !== "/health") return next();

  const method = c.req.method;
  if (method === "OPTIONS") return next();

  const host = c.get("host");
  const role: HostRole = host.shape.role;

  // ── 1. The host gate ──────────────────────────────────────────────────────
  //
  // A hostname under our root that we do not serve (a reserved label, or nested
  // deeper than the wildcard certificate covers) answers nothing. Fail closed and
  // do not leak that the platform is here.
  if (role === "invalid") return c.json({ error: "not_found" }, 404);

  // The root is a signpost, not an app.
  if (role === "root" && !allowedOnRoot(path)) return c.json({ error: "wrong_door" }, 404);

  /**
   * A hostname that resolves NO STUDIO serves nothing but `/api/host`.
   *
   * Two roles land here and both must be closed:
   *
   *  • `tenant` — a well-formed subdomain nobody owns. `/api/host` still answers,
   *    because that is how the app learns to render "no studio here".
   *  • `custom` — any hostname that reached this worker without an ACTIVE row in
   *    `tenant_domains`. That is a custom domain still provisioning… and it is also
   *    `kova.4dl.workers.dev`, which Cloudflare publishes for every worker and
   *    which anyone can guess.
   *
   * The `custom` case is the one that mattered. `/api/auth/*` is a public lane, so
   * on an unowned hostname a stranger could request a sign-in code, verify it, and
   * POST `organization/create` — minting a studio on the platform from an address
   * that appears nowhere and belongs to nobody. Closing it here covers every stray
   * hostname uniformly rather than relying on `workers_dev: false` to hide one.
   *
   * `/health` stays open on purpose: it is dependency-free, reveals nothing, and is
   * what uptime checks and `wrangler dev`'s readiness probe use.
   */
  if ((role === "tenant" || role === "custom") && !host.tenant && path !== "/api/host" && path !== "/health") {
    return c.json({ error: "no_studio" }, 404);
  }

  if (method !== "OPTIONS" && isPublic(method, path)) return next();

  // ── 2. The operator console ───────────────────────────────────────────────
  //
  // Restricted to the admin door, so a studio's subdomain cannot reach platform
  // administration even when the caller genuinely IS a platform admin with a live
  // cookie. That closes a real path: our cookie is now valid across every host
  // under the root, so without this an operator's session would carry full
  // platform powers onto every tenant subdomain they happened to visit.
  //
  // Dev has only one root and therefore no separate door, so the restriction
  // cannot apply there — see `isDevRoot`.
  if (path.startsWith("/api/admin/")) {
    if (role !== "admin" && !isDevRoot(host.shape)) return c.json({ error: "wrong_door" }, 404);
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

  // ── 5. The studio's standing ───────────────────────────────────────────────
  //
  // A suspended or closing studio is read-only for EVERYONE on its host — owner,
  // coaches and clients alike. This is the one place it is enforced, which is the
  // point: before this the studio axis existed in `resolveStanding` and both
  // callers passed a hardcoded `studio: "ok"`, so nothing anywhere actually
  // stopped a write to a lapsed studio.
  //
  // Reads are never gated. A person's own training history is theirs and is not
  // collateral for their coach's invoice — the same principle that lets an
  // archived client keep reading their record.
  //
  // 402 rather than 403: this is not an authorization failure, it is a billing
  // state, and the app has to tell them apart to know whether to show "you don't
  // have permission" or "this studio needs to renew".
  const gate = c.get("host").gate;
  if (gate?.readOnly && WRITE_METHODS.has(method) && !allowedWhileReadOnly(path)) {
    const payingOwner = gate.billingWritable && isBillingWrite(path) && can(c, { billing: ["manage"] });
    if (!payingOwner) {
      return c.json({ error: "studio_read_only", reason: gate.reason, readOnly: true }, 402);
    }
  }
  return next();
};
