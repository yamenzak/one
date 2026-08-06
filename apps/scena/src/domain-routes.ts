/**
 * The host probe, the org-create slug guard, and custom domains — all wired.
 *
 * The routes are `@4dl/tenancy`'s. What this file supplies is the handful of
 * things the package refuses to guess: how to check a caller, what this app
 * calls a tenant, and which Worker a custom hostname's route should point at.
 *
 * ── `/api/host` is the important one, and it is new to Scena ───────────────
 *
 * It is the ONE public read the app makes before it knows anything: which door
 * am I on, is there a workspace here, what is it called, and is it in good
 * standing. Scena had no such endpoint because it had no doors — the SPA
 * assumed it was always on the app and always for the session's workspace.
 *
 * ⚠️ SERIALISE THE GATE BY SPREADING IT. Hand-picking fields is how `blocked`
 * reached the model, the resolver and the shell in Kova while `/api/host` still
 * sent `{ readOnly, reason }` — so the app read `gate.blocked` as `undefined`
 * and rendered the ordinary read-only app to a workspace that was cut off. The
 * package's route already does this; the note is here because this is the file
 * someone edits when adding a field.
 */

import { Hono } from "hono";
import {
  domainAdminRoutes as tDomainAdminRoutes,
  domainRoutes as tDomainRoutes,
  orgSlugGuards,
  type DomainRouteConfig,
  type RouteGuards,
} from "@4dl/tenancy";
import { turnstileAdminRoutes, turnstileConfig } from "@4dl/auth";
import { type AppEnv, requireTenant, requirePermission, isPlatformAdmin } from "./auth-context.js";
import { tenantEntitlements } from "./billing-store.js";
import { tenancyConfig, shapeOf } from "./host-context.js";

/** ⚠️ MUST match `name` in wrangler.jsonc. It is the one value whose wrong
 *  setting fails silently: the route is created, the certificate issues, the
 *  domain reports ACTIVE, and every request reaches a script that is not there. */
export const WORKER_NAME = "scena";

const GUARDS: RouteGuards = {
  requireTenant: (c) => requireTenant(c as never),
  requirePermission: (c, p) => requirePermission(c as never, p),
  isPlatformAdmin: (c) => isPlatformAdmin(c as never),
  /**
   * Custom domains are a paid capability, gated on the plan.
   *
   * Scena's entitlements have no `customDomain` flag yet — the catalog predates
   * the feature — so this reads the highest tier's marker instead of inventing
   * one: a workspace with unlimited library tracks is on `business`. That is a
   * PROXY and it is deliberately named as one, because a wrong-looking gate that
   * says why is better than a `customDomain: true` added to four plan blobs in a
   * stage that is not about pricing. Stage 4 owns the catalog; it should replace
   * this with a real flag.
   */
  gateCustomDomain: async (c) => {
    const who = requireTenant(c as never);
    if (!who) return null;
    const ent = await tenantEntitlements(c.env.DB as D1Database, who.tenantId).catch(() => null);
    return ent && ent.quotas.libraryTracks < 0
      ? null
      : c.json({ error: "custom domains aren't included in this plan" }, 403);
  },
  /**
   * A Turnstile widget is registered against HOSTNAMES, and a tenant's own
   * domain is not one of them unless somebody added it.
   *
   * The fallback coverage is the root this host was CLASSIFIED against, not the
   * configured one: loopback always classifies against `localhost` whatever
   * `ROOT_DOMAIN` says, so using the configured value would leave every dev and
   * test host uncovered and stand the check down across the whole suite —
   * silently, which is the one outcome this scoping must never produce.
   */
  turnstile: (env, host) => turnstileConfig(env, { host, rootDomain: shapeOf(host, env as never).root }),
};

const CONFIG: DomainRouteConfig = { config: tenancyConfig, workerName: WORKER_NAME };

export const domainRoutes = tDomainRoutes(GUARDS, CONFIG) as unknown as Hono<AppEnv>;

/** The operator console's Cloudflare tab, plus Turnstile's — one mount, two
 *  packages, because they are one screen to the operator. */
export const domainAdminRoutes = new Hono<AppEnv>()
  .route("/", tDomainAdminRoutes(GUARDS, CONFIG) as unknown as Hono<AppEnv>)
  .route("/", turnstileAdminRoutes({ isPlatformAdmin: (c) => isPlatformAdmin(c as never) }) as unknown as Hono<AppEnv>);

/**
 * The slug guard on organization create/update.
 *
 * Two jobs, and the second is the one that is easy to forget: it VALIDATES the
 * slug server-side (a DNS label is an origin, and an origin is a trust boundary
 * — a workspace at `admin` or `autodiscover` is a takeover), and it PROVISIONS
 * the subdomain, because a workspace with no hostname is a workspace nobody can
 * reach. Every invite link, every screen's pairing target and the owner's own
 * next visit are all built from it.
 *
 * `"workspace"` is the noun the refusal copy uses.
 */
export const { create: orgCreateGuard, update: orgUpdateGuard } = orgSlugGuards(tenancyConfig, "workspace");
