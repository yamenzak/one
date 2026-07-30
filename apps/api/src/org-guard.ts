/**
 * Organization create/update guard — because a studio's slug is now a HOSTNAME.
 *
 * Better Auth's `organization/create` and `organization/update` are mounted as a
 * pass-through (`/api/auth/*` → `auth.handler`), which means the slug it stores is
 * whatever the request body contained. That was harmless while a slug only
 * appeared in a `/t/<slug>` path. It is not harmless now: the slug becomes
 * `<slug>.kova.4dl.app`, an ORIGIN, and an origin is a trust boundary —
 *
 *   • a studio that claimed `admin` would be served at the operator console's URL;
 *   • one that claimed `setup` would intercept every new studio's first visit;
 *   • one that claimed `autodiscover` could interfere with mail autoconfiguration
 *     for the whole zone;
 *   • and because the session cookie is widened to the root, every one of those
 *     hosts receives our users' session cookie.
 *
 * The app slugifies before it posts, so the happy path was already DNS-shaped —
 * but that is a client-side convenience, not a control, and a studio named "API"
 * produced the slug `api` on the entirely honest path.
 *
 * These are middleware, not handlers: they validate, call `next()` into Better
 * Auth's real endpoint, and then — only if it succeeded — provision or move the
 * studio's hostname. Doing it after rather than before is deliberate; the slug is
 * not real until Better Auth has accepted it and won the uniqueness check.
 */

import type { MiddlewareHandler } from "hono";
import { checkSlug, slugRejectionMessage, type SlugRejection } from "@4dl/tenancy";
import { KOVA_RESERVED_LABELS } from "./host-context.js";

/**
 * Kova's slug rules = the universal DNS/infrastructure reservations in
 * `@4dl/tenancy` PLUS our own brand labels, which the package cannot know.
 *
 * Both halves are load-bearing and this is the one place they meet: a studio
 * that claimed `admin` gets the operator console's URL, and one that claimed
 * `kova` gets an address more official-looking than ours.
 */
const SLUG_OPTS = { reserved: KOVA_RESERVED_LABELS } as const;
import type { AppEnv } from "./auth-context.js";
import { moveSubdomain, provisionSubdomain } from "./host-context.js";

/** Read a JSON body without consuming it for the downstream handler. */
async function peekBody(c: Parameters<MiddlewareHandler<AppEnv>>[0]): Promise<Record<string, unknown>> {
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
function rejection(reason: SlugRejection) {
  return { code: "INVALID_SLUG", message: slugRejectionMessage(reason, "studio"), reason } as const;
}

/**
 * `POST /api/auth/organization/create` — validate the slug, then give the new
 * studio its address.
 *
 * The subdomain is provisioned here rather than lazily on first request because a
 * studio with no hostname is a studio nobody can reach: every emailed invite,
 * every notification CTA and the owner's own sign-out target are all built from
 * `canonicalHost`, which needs the row to exist.
 */
export const orgCreateGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  const body = await peekBody(c);
  const check = checkSlug(typeof body.slug === "string" ? body.slug : null, SLUG_OPTS);
  if (!check.ok) return c.json(rejection(check.reason), 400);

  await next();

  if (c.res.status < 200 || c.res.status >= 300) return;
  const created = await peekResponse(c.res);
  // Better Auth returns the organization itself. Trust its `slug` rather than the
  // request's: if a future version normalises or de-duplicates the value, the
  // hostname must follow what was actually stored.
  const id = typeof created?.id === "string" ? created.id : null;
  const slug = typeof created?.slug === "string" ? created.slug : check.slug;
  if (!id) return;
  // Best-effort: a studio that exists without its hostname row is recoverable
  // (the next create attempt upserts, and the owner can still reach it through the
  // setup wizard), whereas throwing here would surface as "creating your studio
  // failed" after it had in fact been created.
  await provisionSubdomain(c.env, c.env.DB, id, slug, c.get("user")?.id ?? null).catch((e) =>
    console.error(`[orgCreateGuard] subdomain provisioning failed for ${id}/${slug}:`, e),
  );
};

/**
 * `POST /api/auth/organization/update` — a slug change is an ADDRESS change.
 *
 * Renaming has real consequences the UI has to warn about, and they are worth
 * stating here because they are not obvious: clients' bookmarks break, and any
 * passkey registered on a CUSTOM domain is unaffected while one registered on the
 * subdomain keeps working (rpID is the root, not the label). The old hostname is
 * deleted rather than kept as an alias — see `moveSubdomain`.
 */
export const orgUpdateGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  const body = await peekBody(c);
  const data = (body.data ?? body) as Record<string, unknown>;
  const wanted = typeof data.slug === "string" ? data.slug : null;
  if (wanted !== null) {
    const check = checkSlug(wanted, SLUG_OPTS);
    if (!check.ok) return c.json(rejection(check.reason), 400);
  }

  await next();

  if (wanted === null || c.res.status < 200 || c.res.status >= 300) return;
  const updated = await peekResponse(c.res);
  const id = typeof updated?.id === "string" ? updated.id : null;
  const slug = typeof updated?.slug === "string" ? updated.slug : wanted;
  if (!id) return;
  await moveSubdomain(c.env, c.env.DB, id, slug).catch((e) =>
    console.error(`[orgUpdateGuard] subdomain move failed for ${id}/${slug}:`, e),
  );
};
