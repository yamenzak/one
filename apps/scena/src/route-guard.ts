/**
 * THE ROUTE TABLE — Scena's half of `@4dl/auth`'s six-gate guard.
 *
 * The ENGINE runs the gates in a fixed order and is not the app's to reorder:
 *
 *   1.  the HOST gate       an unserved hostname 404s; the root is a signpost; a
 *                           hostname owning no tenant answers almost nothing
 *   1b. MAINTENANCE         the deployment-wide switch, above the public gate
 *   2.  the PUBLIC lane     the route carries its own auth, or needs none
 *   3.  the ADMIN gate      platform operator, on the operator door only
 *   4.  the MEMBER gate     a member OF THE HOST'S TENANT, and the grant the
 *                           route requires
 *   5.  the STANDING gate   a lapsed tenant's writes refuse — reads NEVER do
 *
 * ── What Scena's own guard could not do ────────────────────────────────────
 *
 * It had three lanes and no host at all: public, `/api/admin/*`, everything
 * else. "Everything else" meant *a session bound to any organization* — so with
 * one origin there was nothing more to check, and with a door per workspace
 * there would have been no check at all. The engine's gate 4 is the difference:
 * membership of the HOST's tenant, not of some tenant.
 *
 * The route table below is unchanged. It was right; it just had no wall to
 * stand on.
 */
import type { MiddlewareHandler } from "hono";
import { routeGuard as buildRouteGuard, type AuthEnv, type Grant } from "@4dl/auth";
import { isPlatformAdmin, type AppContext } from "./auth-context.js";
import type { Auth } from "./auth.js";
import type { Branding } from "./host-context.js";
import type { Env } from "./env.js";

/** Routes reachable without an operator session. Method-aware where it matters. */
function isPublic(method: string, path: string): boolean {
  const isGet = method === "GET";
  // Better Auth's own endpoints (sign-in/up, magic-link, Google, org mgmt).
  if (path.startsWith("/api/auth/")) return true;
  // Identity probe — returns the session or null so the dashboard can bootstrap.
  if (path === "/api/me") return true;
  /*
    THE HOST PROBE, and it must be public on every door including the ones that
    resolve no workspace.

    It is the ONE read the app makes before it knows anything: which door am I
    on, is there a workspace here, is it in good standing, is the deployment in
    maintenance. Behind a session it could not answer the question that decides
    whether to SHOW a session form — the app would have to guess, and the guess
    on an unclaimed subdomain is a sign-in screen for somewhere that does not
    exist.
  */
  if (isGet && path === "/api/host") return true;
  // Workspace resolver — maps a typed workspace to its canonical slug so the
  // sign-in surface can send someone to the right door (returns only slug/name).
  if (isGet && path === "/api/org/resolve") return true;
  // ⚠️ `/api/username/resolve` and `/api/username/available` used to be here.
  // Both were PUBLIC and both answered questions about accounts: one mapped a
  // handle to its login address, the other confirmed whether a handle existed.
  // Together that is an enumeration oracle over every account on the platform,
  // open to anyone, and it existed only to make handle+password sign-in work.
  // Nothing signs in with a handle now. Do not add them back.
  // Health + Stripe webhook (signature-verified in its handler).
  if (path === "/health") return true;
  if (path === "/api/stripe/webhook") return true;
  // Screen/device flows (pairing code + DO id are the credential, not a session).
  if (path === "/api/screen/new" || path === "/api/screen/ws") return true;
  if (/^\/api\/screen\/[^/]+\/status$/.test(path)) return true;
  // Manifests + media are served to screens; content-addressed + no PII.
  if (isGet && path.startsWith("/api/manifest/")) return true;
  if (isGet && /^\/api\/assets\/[^/]+$/.test(path)) return true; // PUT /api/assets is operator
  if (isGet && path.startsWith("/api/demo/")) return true;
  // Live-board device + station-token routes (guarded by stationCanControl).
  // NB: /kiosk + /station mint tokens and /announce/build spends credits —
  // operator actions, deliberately NOT public.
  if (/^\/api\/boards\/[^/]+\/(subscribe|call|call-number|issue|recall|room|reset|score)$/.test(path)) return true;
  // Public token-gated live read (kiosk + board surfaces); handler checks the token.
  if (isGet && /^\/api\/boards\/[^/]+\/live$/.test(path)) return true;
  if (isGet && /^\/api\/boards\/[^/]+\/announce(\/clip)?$/.test(path)) return true;
  // Device-polled widget data: ticker feed items, source datasets, + weather.
  if (isGet && /^\/api\/feeds\/[^/]+\/(items|data)$/.test(path)) return true;
  if (isGet && /^\/api\/weather\/[^/]+\/current$/.test(path)) return true;
  return false;
}

/**
 * The RBAC permission a route requires, derived from method + path. `null` means
 * "any authenticated org member" (reads/identity). Roles: owner/operator have
 * broad write access, receptionist is boards-only, viewer is read-only — the
 * matrix lives in access.ts; this maps routes onto it.
 */
export function permissionFor(method: string, path: string): Grant | null {
  const isGet = method === "GET";
  const read = isGet;
  // Method → permission verb: DELETE needs the stricter `delete` capability
  // (an operator can update a screen but not delete it, per the matrix).
  const writeVerb = method === "DELETE" ? "delete" : "update";

  // Screens + pairing + remote commands.
  if (/^\/api\/screens(\/[^/]+)?$/.test(path)) return { screen: [read ? "read" : writeVerb] };
  if (/^\/api\/screens\/[^/]+\/command$/.test(path)) return { screen: ["control"] };
  if (path === "/api/pair/claim") return { screen: ["create"] };

  // Channels + slides + versions + widgets (channel/widget content).
  if (/^\/api\/channels\/[^/]+\/widgets$/.test(path)) return { widget: [read ? "read" : "update"] };
  if (/^\/api\/channels\/[^/]+\/publish$/.test(path)) return { channel: ["publish"] };
  if (/^\/api\/channels\/[^/]+\/rollback$/.test(path)) return { channel: ["publish"] };
  if (path === "/api/channels" && !isGet) return { channel: ["create"] };
  if (path === "/api/displays" && !isGet) return { channel: ["create"] };
  if (/^\/api\/channels\/[^/]+$/.test(path) && method === "DELETE") return { channel: ["delete"] };
  if (path.startsWith("/api/channels")) return { channel: [read ? "read" : "update"] };

  // Media upload + library catalog.
  if (path === "/api/assets") return { channel: ["update"] };
  if (path.startsWith("/api/media")) return { content: [read ? "read" : writeVerb] };

  // Reusable entities (restructure): slide/music playlists + widget profiles.
  if (path.startsWith("/api/slide-playlists") || path.startsWith("/api/music-playlists") || path.startsWith("/api/profiles") || path.startsWith("/api/ad-profiles")) {
    return { content: [read ? "read" : writeVerb] };
  }
  if (/^\/api\/channels\/[^/]+\/composition$/.test(path)) return { channel: ["update"] };
  if (/^\/api\/screens\/[^/]+\/(dimensions|channel|channels|unpair|seed-sample)$/.test(path)) return { screen: [read ? "read" : "update"] };
  if (/^\/api\/screens\/[^/]+\/schedule/.test(path)) return { screen: [read ? "read" : "update"] };

  // Content buckets: feeds · tracks(music) · ads · weather · ai-gen.
  if (path.startsWith("/api/feeds")) return { content: [read ? "read" : "update"] };
  if (path.startsWith("/api/ads")) return { content: ["update"] };
  if (path.startsWith("/api/weather")) return { content: [read ? "read" : "update"] };
  if (path === "/api/library") return { content: ["read"] };
  if (/^\/api\/channels\/[^/]+\/(tracks|ads|library)/.test(path)) return { content: [read ? "read" : "update"] };
  if (path === "/api/ai/generate" || path === "/api/ai/layout") return { content: ["create"] };
  if (path === "/api/ai/defaults" && !isGet) return { settings: ["manage"] };
  // Brand kit: any member can read it (dashboard + AI); editing needs settings.
  if (path === "/api/branding") return isGet ? null : { settings: ["manage"] };
  // Global playback mode (free-run vs synced) is a tenant-wide config toggle.
  if (path === "/api/playback" && !isGet) return { settings: ["manage"] };

  // Boards + stations (receptionist reaches these; create needs board:create).
  if (path === "/api/boards" && !isGet) return { board: ["create"] };
  // Mint a kiosk/station token — owner + operator (station:update), so an
  // operator can open the take-a-ticket kiosk for a queue they manage.
  if (/^\/api\/boards\/[^/]+\/(station|kiosk)$/.test(path)) return { station: ["update"] };
  // Board-user credentials (§boards): owner + operator only (station:update) — a
  // receptionist, viewer, or board user must never see the roster of logins.
  // (The control action routes stay in the public lane, guarded by canControlBoard.)
  if (/^\/api\/boards\/[^/]+\/users/.test(path)) return { station: ["update"] };
  if (/^\/api\/boards\/[^/]+\/(categories|announce)$/.test(path) && !isGet) return { board: ["update"] };
  if (path.startsWith("/api/boards")) return { board: [read ? "read" : "update"] };

  /*
    THE TEAM.

    `/api/staff*` is `@4dl/auth`'s route tree and it does its OWN authorization:
    the roster is readable by any member (knowing who else works here is not
    privileged, and a tenant where only one person can check who holds a
    capability before handing over a shift is worse off), while every write is
    owner-only inside the routes themselves. So this returns `null` for it —
    "any authenticated member" — rather than a permission that would close the
    read half. Do NOT tighten it here without reading `staff-routes.ts`; a
    duplicate gate in front of a route that already gates itself is how the two
    end up disagreeing.

    `/api/members*` is Scena's own remainder — the roster with each member's
    resolved grant, and the per-member grant editor. Both are owner/operator
    work, and both stay behind member management so front-desk staff never see
    the roster's permission detail.
  */
  //
  // ⚠️ `member` has no `read` action — Better Auth's org statements are
  // `["create","update","delete"]` and this app layers nothing onto them. A gate
  // asking for `member: ["read"]` is unsatisfiable by every role including the
  // owner, so it does not restrict the route, it CLOSES it.
  if (path === "/api/staff" || path.startsWith("/api/staff/")) return null;
  if (path === "/api/members" || path.startsWith("/api/members/")) return { member: ["update"] };

  /*
    LEAVING — `null` on purpose, and stated rather than left to fall through.

    Both trees authorize themselves and neither can be expressed here. Closing
    the workspace is OWNER-only, enforced inside `@4dl/tenancy`'s route against
    `creatorRole` and behind a step-up code; deleting an account is SELF-only,
    which is not a permission at all — it is an identity check the route makes
    against the session. A permission in front of either would either close a
    door that must stay open or duplicate a check that already exists.
  */
  if (path.startsWith("/api/tenant/close") || path.startsWith("/api/me/delete")) return null;

  // Alerts (rules are a settings concern; the list is a read).
  if (path === "/api/alerts" || path === "/api/alerts/rules") return isGet ? { analytics: ["read"] } : { settings: ["manage"] };
  if (path.startsWith("/api/alerts/rules")) return { settings: ["manage"] };

  // Analytics / proof-of-play.
  if (path.startsWith("/api/analytics")) return { analytics: ["read"] };

  // Emergency override — an operator/safety action (never paywalled, still gated).
  if (path.startsWith("/api/emergency")) return { screen: ["control"] };

  // Billing: reads for anyone, plan changes/purchases need billing:manage.
  if (path.startsWith("/api/billing")) return isGet ? { billing: ["read"] } : { billing: ["manage"] };

  return null; // /api/me, /api/ai/models, /api/ai/defaults GET, etc. — any member
}

/**
 * ROUTES THAT MUST ANSWER ON THE ROOT DOOR.
 *
 * The root is a signpost, not an app — but it still has to serve the two things
 * a browser needs before it knows where to go, plus the webhook a provider
 * posts to whatever hostname is on file.
 */
const allowedOnRoot = (path: string): boolean =>
  path === "/api/host" ||
  path === "/health" ||
  path.startsWith("/api/auth/") ||
  path === "/api/me" ||
  /*
    The signpost's list. The root is not a workspace, so the one useful thing it
    can do for a signed-in visitor is hand them theirs — without this it is a
    dead end for exactly the people who have somewhere to be, and the installed
    PWA's `start_url` is `/`. Scoped to the caller's OWN memberships and empty
    for a visitor with no session.
  */
  path === "/api/me/workspaces" ||
  path === "/api/org/resolve" ||
  path === "/api/stripe/webhook";

/**
 * The ONLY routes a well-formed hostname owning NO tenant may answer.
 *
 * Deliberately much narrower than `allowedOnRoot`, and the difference is a real
 * hole rather than tidiness: the auth lane is public, so on an unowned hostname
 * — including the `*.workers.dev` name Cloudflare publishes for every worker,
 * which anyone can guess — a stranger could otherwise request a sign-in code,
 * verify it, and mint a workspace from an address that belongs to nobody.
 *
 * The host probe survives because it is how the app learns to render "nothing
 * here" instead of a sign-in form on an unclaimed subdomain.
 */
const allowedWithoutTenant = (path: string): boolean => path === "/api/host";

/**
 * PERSONAL surfaces — they belong to the PERSON, not to a workspace, so they
 * answer for any signed-in caller before (or without) a tenancy.
 *
 * ⚠️ Scena declared none, and it got away with it only because the tenancy was
 * being BORROWED. `@4dl/auth` used to fall back to the session's active
 * organization on any door with no tenant of its own, so on the root every
 * caller looked tenanted and the tenant gate below never fired. Closing that
 * fallback (it is what made `scena.4dl.app` render a whole workspace app that
 * 404'd on every call) left the genuinely personal routes refused with a 401.
 *
 * `/api/me/*` is the whole set today: the signpost's workspace list, and the
 * account-erasure lane. Neither has a workspace to be scoped to — that is what
 * makes them personal rather than an exception.
 */
const isPersonal = (path: string): boolean => path === "/api/me" || path.startsWith("/api/me/");

/**
 * Writes that must survive a lapsed workspace.
 *
 * Paying must be A way out, not the ONLY way out. Billing so the owner can
 * settle up, and the auth lane so they can sign in to do it — withholding the
 * product is not the same as holding a screen's content hostage.
 *
 * ⚠️ THE EMERGENCY OVERRIDE IS HERE, and it is not a convenience. Scena's
 * screens carry fire, evacuation and incident messages. A workspace whose card
 * expired must still be able to put an emergency on every screen it owns, and
 * that has to hold at EVERY rung of the ladder. Removing this line would make an
 * unpaid invoice into a safety control.
 */
const allowedWhileReadOnly = (path: string): boolean =>
  path.startsWith("/api/billing") ||
  path.startsWith("/api/auth/") ||
  path.startsWith("/api/emergency") ||
  /*
    ⚠️ LEAVING IS ALWAYS ALLOWED, at every rung, and this line is the whole
    difference between the principle above and a trap.

    A PREFIX, not equality: `/api/tenant/close` schedules the close,
    `/close/request-otp` mints the confirmation code and `/close/cancel` undoes
    it inside the window. Exempting only the first would let a suspended
    workspace ASK to close and then refuse the code that confirms it.

    `/api/me/delete*` for the same reason on the personal side: a person's right
    to erase themselves does not depend on their employer's invoice.
  */
  path.startsWith("/api/tenant/close") ||
  path.startsWith("/api/me/delete") ||
  path === "/api/stripe/webhook";

/**
 * Paths that answer while the whole DEPLOYMENT is closed.
 *
 * The host probe, because it is how the app learns to render the notice at all,
 * and the signature-verified provider callback, because a payment webhook
 * dropped during a maintenance window is not retried forever — the provider
 * gives up and disables the endpoint, turning a planned twenty minutes into
 * silently lost money.
 */
const maintenanceExempt = (path: string): boolean =>
  path === "/api/host" || path === "/api/stripe/webhook";

// Annotated for the same reason `sessionMiddleware` is — see auth-context.ts.
export const routeGuard: MiddlewareHandler<AuthEnv<Env, Auth, Branding>> = buildRouteGuard<Env, Auth, Branding>({
  isPublic,
  permissionFor,
  allowedOnRoot,
  allowedWithoutTenant,
  allowedWhileReadOnly,
  isPersonal,
  maintenanceExempt,
  isPlatformAdmin: (c) => isPlatformAdmin(c as unknown as AppContext),
  /*
    The STANDING gate, INJECTED — this is what keeps `@4dl/auth` independent of
    billing, and what makes the device door work: the engine skips this entirely
    for `role === "device"`, so a screen keeps playing while its owner's
    dashboard goes read-only. What a lapsed workspace's screens actually SHOW is
    Scena's decision, made where the manifest is compiled, not the edge's to make
    by refusing the request.
  */
  gate: (c) => c.get("host").gate,
  isBillingWrite: (path) => path.startsWith("/api/billing"),
  billingPermission: { billing: ["manage"] },
});
