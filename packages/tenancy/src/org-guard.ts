/**
 * Organization create/update guard — because a tenant's slug is now a HOSTNAME.
 *
 * Better Auth's `organization/create` and `organization/update` are mounted as a
 * pass-through (`/api/auth/*` → `auth.handler`), which means the slug it stores is
 * whatever the request body contained. That was harmless while a slug only
 * appeared in a `/t/<slug>` path. It is not harmless now: the slug becomes
 * `<slug>.example.app`, an ORIGIN, and an origin is a trust boundary —
 *
 *   • a tenant that claimed `admin` would be served at the operator console's URL;
 *   • one that claimed `setup` would intercept every new tenant's first visit;
 *   • one that claimed `autodiscover` could interfere with mail autoconfiguration
 *     for the whole zone;
 *   • and because the session cookie is widened to the root, every one of those
 *     hosts receives our users' session cookie.
 *
 * The app slugifies before it posts, so the happy path was already DNS-shaped —
 * but that is a client-side convenience, not a control, and a tenant named "API"
 * produced the slug `api` on the entirely honest path.
 *
 * These are middleware, not handlers: they validate, call `next()` into Better
 * Auth's real endpoint, and then — only if it succeeded — provision or move the
 * tenant's hostname. Doing it after rather than before is deliberate; the slug is
 * not real until Better Auth has accepted it and won the uniqueness check.
 */

import type { MiddlewareHandler } from "hono";
import { checkSlug, slugRejectionMessage, type SlugRejection } from "./hosts.js";
import { invalidateTenantHosts, moveSubdomain, provisionSubdomain, type RootDomainEnv, type TenancyConfig } from "./host-context.js";
import type { RouteEnv } from "./route-deps.js";

/**
 * There is no authorization here, and none is needed: Better Auth decides who
 * may create or rename an organization. These only decide what a slug may BE,
 * which is why they could move into the package ahead of the routes.
 */

/** Read a JSON body without consuming it for the downstream handler. */
async function peekBody(c: Parameters<MiddlewareHandler<RouteEnv>>[0]): Promise<Record<string, unknown>> {
  try {
    return (await c.req.raw.clone().json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Read the response Better Auth produced, without consuming it for the client. */
async function peekResponse(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.clone().json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * The slug rejection, shaped like Better Auth's own errors so the app's existing
 * error handling renders it. `code` is stable for the UI to branch on.
 */
function rejection(reason: SlugRejection, noun: string) {
  return { code: "INVALID_SLUG", message: slugRejectionMessage(reason, noun), reason } as const;
}

/**
 * Both guards, bound to one app's slug rules.
 *
 * A factory rather than two exported middlewares because the reserved-label list
 * is the APP's: the universal DNS/infrastructure reservations live in
 * `hosts.ts`, and each product adds its own brand labels on top. Both halves are
 * load-bearing and this is the one place they meet — a tenant that claimed
 * `admin` gets the operator console's URL, and one that claimed the product's
 * own name gets an address more official-looking than the product's.
 */
export function orgSlugGuards(
  config: (env: RootDomainEnv) => TenancyConfig,
  /** The app's word for a tenant, for the rejection copy a user reads. */
  noun = "workspace",
): { create: MiddlewareHandler<RouteEnv>; update: MiddlewareHandler<RouteEnv> } {
  const slugOpts = (c: { env: RootDomainEnv }) => ({ reserved: config(c.env).reserved });

  /**
   * `POST /api/auth/organization/create` — validate the slug, then give the new
   * tenant its address.
   *
   * The subdomain is provisioned here rather than lazily on first request because a
   * tenant with no hostname is a tenant nobody can reach: every emailed invite,
   * every notification CTA and the owner's own sign-out target are all built from
   * `canonicalHost`, which needs the row to exist.
   */
  const create: MiddlewareHandler<RouteEnv> = async (c, next) => {
    const body = await peekBody(c);
    const check = checkSlug(typeof body.slug === "string" ? body.slug : null, slugOpts(c));
    if (!check.ok) return c.json(rejection(check.reason, noun), 400);

    await next();

    if (c.res.status < 200 || c.res.status >= 300) return;
    const created = await peekResponse(c.res);
    // Better Auth returns the organization itself. Trust its `slug` rather than the
    // request's: if a future version normalises or de-duplicates the value, the
    // hostname must follow what was actually stored.
    const id = typeof created?.id === "string" ? created.id : null;
    const slug = typeof created?.slug === "string" ? created.slug : check.slug;
    if (!id) return;
    // Best-effort: a tenant that exists without its hostname row is recoverable
    // (the next create attempt upserts, and the owner can still reach it through the
    // setup wizard), whereas throwing here would surface as "creating your tenant
    // failed" after it had in fact been created.
    await provisionSubdomain(c.env, id, slug, config(c.env), c.get("user")?.id ?? null).catch((e) =>
      console.error(`[orgCreateGuard] subdomain provisioning failed for ${id}/${slug}:`, e),
    );
  };

  /**
   * `POST /api/auth/organization/update` — a slug change is an ADDRESS change.
   *
   * Renaming has real consequences the UI has to warn about, and they are worth
   * stating here because they are not obvious: everyone's bookmarks break, and any
   * passkey registered on a CUSTOM domain is unaffected while one registered on the
   * subdomain keeps working (rpID is the root, not the label). The old hostname is
   * deleted rather than kept as an alias — see `moveSubdomain`.
   *
   * A NAME change reaches this endpoint too, and needs the second half: the
   * tenant's display name is inside the cached host resolution, so `/api/host`,
   * the pre-auth sign-in screen and the PWA manifest would keep serving the old
   * name for up to a minute after a rename that the app reports as saved. Sixty
   * seconds of "did that work?" on the one screen an owner checks it on.
   */
  const update: MiddlewareHandler<RouteEnv> = async (c, next) => {
    const body = await peekBody(c);
    const data = (body.data ?? body) as Record<string, unknown>;
    const wanted = typeof data.slug === "string" ? data.slug : null;
    if (wanted !== null) {
      const check = checkSlug(wanted, slugOpts(c));
      if (!check.ok) return c.json(rejection(check.reason, noun), 400);
    }

    await next();

    if (c.res.status < 200 || c.res.status >= 300) return;
    const updated = await peekResponse(c.res);
    const id = typeof updated?.id === "string" ? updated.id : null;
    if (!id) return;
    const cfg = config(c.env);
    if (wanted !== null) {
      const slug = typeof updated?.slug === "string" ? updated.slug : wanted;
      await moveSubdomain(c.env, id, slug, cfg).catch((e) =>
        console.error(`[orgUpdateGuard] subdomain move failed for ${id}/${slug}:`, e),
      );
    }
    // Unconditional, because ANY field this endpoint writes could be one the
    // host resolution carries — today the name, and the next one added will not
    // come back here to remember.
    await invalidateTenantHosts(c.env, id, cfg).catch((e) =>
      console.error(`[orgUpdateGuard] host cache invalidation failed for ${id}:`, e),
    );
  };

  return { create, update };
}
