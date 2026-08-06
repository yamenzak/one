/**
 * Central request guard — the auth boundary for the API.
 *
 * Three lanes:
 *   • PUBLIC / device / station-token routes  → pass through (own auth or none)
 *   • /api/admin/*                            → platform super-admin only
 *   • every other /api/* route               → an authenticated user bound to an
 *                                               active organization (tenant)
 *
 * This replaces the pre-auth state where the whole API was open (CORS-only) and
 * every request was silently treated as the single OPERATOR_EMAIL admin.
 */
import type { MiddlewareHandler } from "hono";
import { type AppEnv, requireTenant, isPlatformAdmin, can } from "./auth-context.js";

/** Routes reachable without an operator session. Method-aware where it matters. */
function isPublic(method: string, path: string): boolean {
  const isGet = method === "GET";
  // Better Auth's own endpoints (sign-in/up, magic-link, Google, org mgmt).
  if (path.startsWith("/api/auth/")) return true;
  // Identity probe — returns the session or null so the dashboard can bootstrap.
  if (path === "/api/me") return true;
  // Workspace resolver — maps a typed workspace to its login slug so the staff
  // sign-in form can build the credential email (returns only slug/name).
  if (isGet && path === "/api/org/resolve") return true;
  // Username → login email resolver + availability check, so the sign-in form
  // works with just username+password pre-auth (§auth). No membership data.
  if (path === "/api/username/resolve") return true;
  if (isGet && path === "/api/username/available") return true;
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
function permissionFor(method: string, path: string): Record<string, string[]> | null {
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

  // Team management (staff provisioning). Owner/operator manage members;
  // receptionist/viewer can't reach the Team screen at all. Reads + writes both
  // require member management, so front-desk staff never see the roster.
  if (path === "/api/members") return { member: ["create"] };
  if (path.startsWith("/api/members/")) return { member: ["update"] };

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
 * Enforce the lanes above. Runs after sessionMiddleware (which has populated
 * user/tenant/role), so it reads context; RBAC checks call Better Auth (no D1
 * writes). Owner/operator pass most gates; receptionist/viewer are restricted.
 */
export const routeGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  const path = c.req.path;
  // Only guard the API surface; non-/api/* (static assets, later) passes.
  if (!path.startsWith("/api/")) return next();

  const method = c.req.method;
  if (method === "OPTIONS" || isPublic(method, path)) return next();

  if (path.startsWith("/api/admin/")) {
    if (!isPlatformAdmin(c)) return c.json({ error: "forbidden" }, 403);
    return next();
  }

  // Everything else is an operator/tenant route: require a session bound to an org.
  if (!requireTenant(c)) return c.json({ error: "unauthenticated" }, 401);

  // Role check (owner/operator/receptionist/viewer). Platform admins bypass —
  // console operators may act across tenants for support.
  const perm = permissionFor(method, path);
  if (perm && !isPlatformAdmin(c) && !(await can(c, perm))) {
    return c.json({ error: "forbidden" }, 403);
  }
  return next();
};
