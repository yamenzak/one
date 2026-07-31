/**
 * WHICH DOOR IS THIS? — the browser half of `@4dl/tenancy`'s host model.
 *
 * The server classifies every hostname into one of five doors before any of this
 * code runs (`@4dl/tenancy` hosts.ts). `/api/host` reports the answer, and this
 * is the shape it comes back in plus the two URL builders that let the app move
 * between doors.
 *
 * The whole point of resolving the tenant from the HOSTNAME is that the app never
 * has to remember which tenant it is showing. There is no `/t/<slug>` path, no
 * remembered "last door" in local storage, and no post-sign-in switch: signing
 * out of `acme.example.app` lands on Acme's branded login because the origin
 * never changed. Anything that reintroduces a client-side memory of the tenancy
 * reintroduces the entire class of bug where the brand and the tenancy disagree.
 */

import type { HostGate } from "@4dl/tenancy/model";

export type HostRole = "root" | "setup" | "admin" | "tenant" | "custom" | "invalid";

/**
 * The tenant behind a door, as far as the BROWSER needs to know it.
 *
 * Generic in its branding type: the design system owns what a brand is, and an
 * app that has none passes `never`.
 */
export interface HostTenantInfo<B = unknown> {
  tenantId: string;
  name: string;
  slug: string;
  branding: B | null;
  allowSignup: boolean;
}

/** Which door this is, and whose. Resolved pre-auth from `/api/host`. */
export interface HostInfo<B = unknown> {
  role: HostRole;
  /** True on the platform's own doors (root / setup / admin); false when a
   *  tenant resolved. */
  platform: boolean;
  /** The apex tenants live under, e.g. `example.app`. Used to build another
   *  tenant's URL when switching, so the switcher can cross hostnames. */
  rootDomain: string;
  /** Absolute URL of the setup door — the only place a tenant is created. */
  setupUrl: string;
  /**
   * The tenant this host belongs to. `null` while `role === "tenant"` is
   * meaningful and must not be read as "platform": it is a well-formed tenant
   * address with no tenant behind it, and the app should say so.
   */
  tenant: HostTenantInfo<B> | null;
  /**
   * The tenant's standing gate — `@4dl/tenancy`'s own `HostGate`, not a copy.
   *
   * The server spreads it whole (`{ ...host.gate }`) and this names the same
   * type, so the two cannot drift. Re-declaring the shape here is precisely how
   * `blocked` once reached the model, the resolver and the shell while the
   * endpoint still sent only `{ readOnly, reason }`: the app read
   * `gate.blocked` as undefined and rendered the ordinary read-only app for a
   * tenant whose access was withheld.
   */
  gate?: HostGate | null;
  /** Cloudflare Turnstile — render the widget when a site key is set AND
   *  `enabled` (a server secret is configured, so codes are gated on it). */
  turnstile?: { siteKey: string | null; enabled: boolean } | null;
}

/**
 * The URL of a tenant, by slug, on the platform root.
 *
 * Always the SUBDOMAIN, never the tenant's custom domain — even when it has one.
 * The session cookie is issued for the root, so a subdomain hop carries the
 * session and switches instantly, while a custom domain is a separate origin
 * with its own cookie jar and would demand a fresh sign-in. The custom domain is
 * for that tenant's own users arriving cold, not for crossing between tenants.
 */
export function tenantUrl(slug: string, rootDomain: string): string {
  // The PORT has to come along. Dev serves on a non-standard port, and a bare
  // hostname points at :80 — where nothing is listening — so dropping it turns
  // every tenant hop into a blank page locally while working fine in production.
  // Protocol likewise follows the current page rather than being hardcoded.
  const port = location.port ? `:${location.port}` : "";
  return `${location.protocol}//${slug}.${rootDomain}${port}/`;
}

/**
 * The operator console's address. It has exactly one, and this is how you get
 * there from inside a tenant.
 *
 * `/api/admin/*` answers on this door and nowhere else, which is what stops a
 * session valid across the whole root from carrying platform powers onto a
 * tenant's subdomain. Rendering the console as an in-app route inside a tenant
 * looks like it works and then 404s on every call it makes.
 */
export const adminUrl = (rootDomain: string): string => tenantUrl("admin", rootDomain);

/**
 * Read `/api/host`, with the one fallback distinction that matters.
 *
 * A **404 is an answer**: the route guard returns it for a reserved or
 * over-nested host, meaning "this door is not one of ours". Treating that as a
 * network error and falling back to `root` renders the platform signpost on a
 * host the deployment deliberately serves nothing at. Anything else (offline,
 * 500, a proxy eating the request) is genuinely unknown, and there the
 * conservative root fallback is right: a signpost beats inventing a login for a
 * tenant that could not be confirmed to exist.
 */
export async function resolveHostInfo<B = unknown>(
  get: (path: string) => Promise<HostInfo<B>>,
  isNotFound: (e: unknown) => boolean,
): Promise<HostInfo<B>> {
  try {
    return await get("/api/host");
  } catch (e) {
    return {
      role: isNotFound(e) ? "invalid" : "root",
      platform: true,
      rootDomain: location.hostname,
      setupUrl: "/",
      tenant: null,
    };
  }
}
