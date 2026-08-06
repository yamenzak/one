/**
 * KOVA'S ROUTE TABLES, over `@4dl/auth`'s guard engine.
 *
 * The engine owns the order of the five gates, the status codes and the
 * fail-closed defaults — the subtle part, which every app would otherwise
 * re-derive. This file owns the part that cannot be shared: which of Kova's
 * routes are public, which permission each one needs, which survive the root
 * door, which survive a read-only studio.
 *
 * Row-level checks (trainer → assigned clients, client → own record) happen in
 * the handlers via `requireClientAccess`. This is the action-level outer wall.
 * There are NO unauthenticated mutation routes (the ByShujaa lesson, SPEC §11).
 */
import type { MiddlewareHandler } from "hono";
import { routeGuard as buildRouteGuard } from "@4dl/auth";
import type { Env } from "./env.js";
import type { Auth } from "./auth.js";
import type { Branding } from "./host-context.js";
import { type AppContext, type AppEnv, isPlatformAdmin } from "./auth-context.js";
import { maintenanceExempt } from "./maintenance.js";

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
  if (isProviderWebhook(path)) return true;
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
  /**
   * `@4dl/auth`'s staff routes. The outer wall proves you may SEE the roster —
   * which is any member's business, since checking who holds a capability before
   * a handover is not a privileged question. Every WRITE re-checks OWNER inside
   * the route, because staff management is not a grant a studio can hand out:
   * whoever can add staff can add themselves an owner.
   */
  if (path.startsWith("/api/staff")) return { member: ["read"] };

  // Reports.
  if (path.startsWith("/api/reports")) return { report: ["read"] };

  // AI suite.
  if (path.startsWith("/api/ai/")) return { ai: ["use"] };

  // Media: any authenticated member; tenant isolation enforced in the handler.
  if (path.startsWith("/api/media")) return null;

  /**
   * The tenant's own payment rail.
   *
   * `payments/settings` is how the studio gets paid, so it sits with the other
   * money settings: read for the owner surface, write behind `billing:manage`
   * (the handler additionally requires the owner role, because a signing secret
   * is not a thing a trainer should be able to swap).
   *
   * `purchases` splits by direction. Opening one is a CLIENT action — the buyer
   * starts it — so it is `null`, with `requireClientAccess` scoping the row in
   * the handler exactly as the old Connect checkout was. Reading the pending
   * list and confirming a payment are staff acts on the studio's takings, so
   * they ride `package`, the resource that already governs what is sold.
   */
  if (path.startsWith("/api/payments/")) return isGet ? { billing: ["read"] } : { billing: ["manage"] };
  if (path === "/api/purchases" && !isGet) return null;
  if (path.startsWith("/api/purchases")) return { package: [isGet ? "read" : "update"] };

  /**
   * A per-client capability OVERRIDE is a change to what the studio sold, so it
   * rides `package` like everything else in the catalogue. The rest of
   * `/api/subscriptions` stays open to any member and is scoped by
   * `requireClientAccess` in the handler — a client legitimately reads their own
   * access — but the override lane must never be one of those: the handler
   * refuses the client role too, because this gate is invisible to the
   * integration suite (AGENTS.md §4) and a bound nothing can test is not a bound.
   */
  if (path.startsWith("/api/subscriptions/") && path.endsWith("/overrides")) return { package: ["update"] };

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

/**
 * Every signature-verified payment callback.
 *
 * `/api/stripe/webhook` is the PLATFORM rail — studios paying Kova, on Kova's
 * own Stripe. `/api/pay/webhook/:tenantId` is the TENANT rail — a studio's own
 * customers paying the studio, on whatever provider that studio uses.
 *
 * Both carry no session by construction (the caller is a payment provider), and
 * both verify a signature before acting. They are exempt from the standing gate
 * for the same reason the Stripe one always was: blocking the message that says
 * "they paid" is how a suspension becomes unrecoverable.
 */
function isStripeWebhook(path: string): boolean {
  return isProviderWebhook(path);
}

function isProviderWebhook(path: string): boolean {
  if (path === "/api/stripe/webhook") return true;
  // The tenant id is a path segment, so this is a prefix match rather than an
  // equality check — and it is anchored so `/api/pay/webhookXYZ` cannot slip in.
  return /^\/api\/pay\/webhook\/[^/]+$/.test(path);
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
    // …and this covers the OWNER closing the studio. It was missing, which made
    // a suspended studio a trap: every write refused, the copy saying "pay to
    // restore", and no way to shut the thing down and end the relationship
    // instead. Paying must be A way out, not the ONLY way out.
    path.startsWith("/api/tenant/close") ||
    // The inbox is PERSONAL, and both halves of it belong here. The header above
    // has claimed "notification read-receipts" since this function was written;
    // only the socket was actually listed, so a suspended studio's bell filled
    // up with a badge nobody could clear for seven days. Both writes are scoped
    // to `recipient_user_id`, so neither can touch the studio's data.
    path.startsWith("/api/inbox/") ||
    path.startsWith("/api/notifications/")
  );
}

/** Billing surfaces the owner of a lapsed studio may still write to, so the one
 *  action that fixes the situation is reachable from inside the lock. */
function isBillingWrite(path: string): boolean {
  return path.startsWith("/api/billing") || path.startsWith("/api/stripe/");
}


/**
 * The one route a well-formed subdomain owning NO studio may answer.
 *
 * Deliberately far narrower than `allowedOnRoot`. The root is ours and can serve
 * identity and webhooks; an unclaimed hostname is nobody's. `/api/host` is the
 * single exception, because it is how the app learns to render "no studio here".
 */
function allowedWithoutTenant(path: string): boolean {
  return path === "/api/host";
}

/** Personal surfaces: they belong to the PERSON, not to a studio, so they work
 *  for any signed-in user even before a tenant is chosen. */
function isPersonal(path: string): boolean {
  return (
    path === "/api/context" ||
    path === "/api/context/switch" ||
    path.startsWith("/api/me/") ||
    path.startsWith("/api/inbox/")
  );
}

export const routeGuard: MiddlewareHandler<AppEnv> = buildRouteGuard<Env, Auth, Branding>({
  isPublic,
  permissionFor,
  allowedOnRoot,
  allowedWithoutTenant,
  allowedWhileReadOnly,
  isPersonal,
  isBillingWrite,
  billingPermission: { billing: ["manage"] },
  isPlatformAdmin: (c) => isPlatformAdmin(c as never),
  gate: (c) => c.get("host").gate,
  // The DEPLOYMENT-wide switch, resolved once per request by
  // `maintenanceMiddleware` (index.ts). Injected the same way the tenant gate is,
  // so `@4dl/auth` still knows nothing about where either state is stored.
  // Cast for the same reason `isPlatformAdmin` above takes one: the engine is
  // generic over `@4dl/auth`'s own variables, and `maintenance` is Kova's.
  maintenance: (c) => (c as unknown as AppContext).get("maintenance"),
  maintenanceExempt,
}) as unknown as MiddlewareHandler<AppEnv>;
