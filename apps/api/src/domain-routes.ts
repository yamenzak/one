/**
 * Kova's binding of `@4dl/tenancy`'s custom-domain routes.
 *
 * The routes are the platform's — registering a Cloudflare custom hostname,
 * exposing the DCV records, polling the certificate, routing the worker. Four
 * things are Kova's and all four are injected here:
 *
 *   the GUARDS         `requireTenant` / `requirePermission` / `isPlatformAdmin`.
 *                      These are why the module could not move for four stages:
 *                      it needs the request identity, and `@4dl/auth` already
 *                      depends on `@4dl/tenancy`, so importing it back is a
 *                      cycle. Passing them as FUNCTIONS breaks it.
 *   the FEATURE gate   a custom domain is part of what `branding` sells here. An
 *                      app that does not gate it passes nothing.
 *   the WORKER name    must match `name` in `wrangler.jsonc`. Its wrong setting
 *                      is the worst failure mode in this whole flow: the route is
 *                      created, the certificate issues, the domain reports
 *                      ACTIVE, and every request reaches a script that is not
 *                      there.
 *   the TENANCY config the root domain and reserved labels.
 *
 * Turnstile's operator endpoints used to live in this file — they sat next to the
 * Cloudflare-for-SaaS credentials because both are "Cloudflare things an operator
 * configures". They are unrelated, and that accidental neighbouring was the only
 * reason tenancy would have had to import auth. They are `@4dl/auth`'s now.
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
import { gateFeature } from "./client-flags.js";
import { tenancyConfig, shapeOf } from "./host-context.js";

/** Must match `name` in apps/api/wrangler.jsonc. */
export const DEFAULT_WORKER_NAME = "kova";

const GUARDS: RouteGuards = {
  requireTenant: (c) => requireTenant(c as never),
  requirePermission: (c, p) => requirePermission(c as never, p),
  isPlatformAdmin: (c) => isPlatformAdmin(c as never),
  gateCustomDomain: (c) => gateFeature(c as never, "branding"),
  // The host is what decides whether a bot-check widget applies at all: a
  // Turnstile widget is registered against hostnames, and a tenant's own domain
  // is not one of them unless somebody added it. The fallback coverage is the
  // root this host was CLASSIFIED against, not the configured one: loopback is
  // always classified against `localhost` whatever `ROOT_DOMAIN` says, so using
  // the configured value would leave every dev and E2E host uncovered and stand
  // the check down across the whole suite — silently, which is the one outcome
  // this scoping must never produce.
  turnstile: (env, host) => turnstileConfig(env, { host, rootDomain: shapeOf(host, env as never).root }),
};

const CONFIG: DomainRouteConfig = { config: tenancyConfig, workerName: DEFAULT_WORKER_NAME };

export const domainRoutes = tDomainRoutes(GUARDS, CONFIG) as unknown as Hono<AppEnv>;

/**
 * The operator console's Cloudflare tab, plus Turnstile's — one mount, two
 * packages. Kept together because they are one screen to the operator, even
 * though they are two concerns to the codebase.
 */
export const domainAdminRoutes = new Hono<AppEnv>()
  .route("/", tDomainAdminRoutes(GUARDS, CONFIG) as unknown as Hono<AppEnv>)
  .route("/", turnstileAdminRoutes({ isPlatformAdmin: (c) => isPlatformAdmin(c as never) }) as unknown as Hono<AppEnv>);
