/**
 * Custom domains, wired.
 *
 * The routes are `@4dl/tenancy`'s — registering a Cloudflare custom hostname,
 * exposing the DCV records the owner has to publish, polling until the
 * certificate issues, and routing the worker at it. What this file supplies is
 * the four things the package refuses to guess.
 *
 * ⚠️ `workerName` MUST match `name` in `wrangler.jsonc`. It is the one value
 * whose wrong setting fails silently: the route is created, the certificate
 * issues, the domain reports ACTIVE, and every request reaches a script that is
 * not there.
 *
 * Delete this file if the app does not sell custom domains — the tenant
 * subdomain works without any of it.
 */

import { Hono } from "hono";
import {
  domainAdminRoutes as tDomainAdminRoutes,
  domainRoutes as tDomainRoutes,
  type DomainRouteConfig,
  type RouteGuards,
} from "@4dl/tenancy";
import { turnstileAdminRoutes, turnstileConfig } from "@4dl/auth";
import { type AppEnv, requireTenant, requirePermission, isPlatformAdmin } from "./auth-context.js";
import { hasFeature } from "./billing-store.js";
import { tenancyConfig } from "./host-context.js";

/** Must match `name` in wrangler.jsonc. */
export const WORKER_NAME = "tessa";

const GUARDS: RouteGuards = {
  requireTenant: (c) => requireTenant(c as never),
  requirePermission: (c, p) => requirePermission(c as never, p),
  isPlatformAdmin: (c) => isPlatformAdmin(c as never),
  // A capability gate, if custom domains are something the app SELLS. Drop it
  // and every tenant may bind one.
  gateCustomDomain: async (c) => {
    const who = requireTenant(c as never);
    if (!who) return null;
    return (await hasFeature(c.env.DB, who.tenantId, "customDomain"))
      ? null
      : c.json({ error: "custom domains aren't included in this plan" }, 403);
  },
  turnstile: (db) => turnstileConfig(db),
};

const CONFIG: DomainRouteConfig = { config: tenancyConfig, workerName: WORKER_NAME };

export const domainRoutes = tDomainRoutes(GUARDS, CONFIG) as unknown as Hono<AppEnv>;

/** The operator console's Cloudflare tab, plus Turnstile's — one mount, two
 *  packages, because they are one screen to the operator. */
export const domainAdminRoutes = new Hono<AppEnv>()
  .route("/", tDomainAdminRoutes(GUARDS, CONFIG) as unknown as Hono<AppEnv>)
  .route("/", turnstileAdminRoutes({ isPlatformAdmin: (c) => isPlatformAdmin(c as never) }) as unknown as Hono<AppEnv>);
