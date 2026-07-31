/**
 * Host → tenant resolution. The Host header IS the tenancy.
 *
 * `hosts.ts` decides which of the five doors a hostname is, purely and testably.
 * This module does the D1 lookups that turn a `tenant` or `custom` classification
 * into an actual tenant, and attaches that tenant's host gate (`resolveHostGate`
 * — is this tenant paid up, or is its whole subdomain read-only).
 *
 * ── Why the tenant comes from the host and not the session ──────────────────
 *
 * A session's active organization is stamped once at CREATE, to the user's oldest
 * membership. Under a `/t/<slug>` model that means a user who belongs to two
 * tenants can enter through tenant B's branded door and have every API call
 * scoped to tenant A — the right brand over the wrong tenancy. Resolving from the
 * Host makes the tenancy a property of the origin, so a session pointed at the
 * wrong tenant grants exactly nothing: the auth layer only hands out
 * `tenantId`/role if the caller is a member of the HOST's tenant.
 *
 * ── What this package refuses to know ───────────────────────────────────────
 *
 * Two things arrive through `TenancyConfig` instead of being read here:
 *
 *   branding   an opaque type parameter. Tenancy stores and returns whatever
 *              blob the app puts in `tenant_settings.branding_json`; it has no
 *              opinion about what a brand is.
 *   status     the tenant's standing with the platform. That lives in a billing
 *              table this package must not read — and an app with no billing at
 *              all supplies nothing, whereupon every gate resolves `ok` and the
 *              dunning apparatus is absent rather than stubbed.
 */

import type { HasCache, HasDb } from "@4dl/core";
import { parseJson } from "@4dl/core";
import { classifyHost, tenantHostname, type SlugOptions, type HostShape } from "./hosts.js";
import { resolveHostGate, type HostGate } from "./standing.js";

/**
 * How this app is addressed, and the two facts tenancy cannot derive.
 *
 * One object, passed to every function that needs it. The app builds it once and
 * binds it behind a thin adapter — see the README.
 */
export interface TenancyConfig {
  /** The apex tenants are served under (`acme.<root>`). See `rootDomain`. */
  root: string;
  /** Labels this app reserves beyond the universal list — its own brand names. */
  reserved?: ReadonlySet<string>;
  /**
   * The tenant's CURRENT standing with the platform, read live on every request.
   *
   * Omit it and every tenant resolves `ok`. That is the correct behaviour for an
   * app that does not bill its tenants, and it is why the host gate is not a hard
   * dependency on a billing package.
   */
  statusOf?: (db: D1Database, tenantId: string) => Promise<string | null>;
}

/** Bindings this module reads. KV is optional — without it, no host cache. */
export type TenancyBindings = HasDb & Partial<HasCache>;

/** The environment fields that locate the root domain. */
export interface RootDomainEnv {
  /**
   * The apex tenants are served under. Set it EXPLICITLY: it and the advertised
   * origin are different things the moment the root door redirects somewhere
   * else, and getting the root wrong silently reclassifies every tenant
   * subdomain as a foreign custom domain — which fails closed (no tenant
   * resolves) but presents as "everything 404s", with nothing pointing at the
   * cause.
   */
  ROOT_DOMAIN?: string;
  /** The advertised canonical origin; the fallback when ROOT_DOMAIN is unset. */
  BETTER_AUTH_URL?: string;
}

export interface HostTenant<B = unknown> {
  tenantId: string;
  name: string;
  slug: string;
  /** Whatever the app stores in `tenant_settings.branding_json`. Opaque here. */
  branding: B;
  /** Whether a brand-new email may self-register at this tenant (else it is
   *  invite/existing-only). Drives the sign-in screen's affordance and the
   *  OTP-send eligibility gate. */
  allowSignup: boolean;
  /** The tenant's raw subscription status, for the gate and the owner's banner.
   *  Null when the app supplied no `statusOf`. */
  subscriptionStatus: string | null;
}

/**
 * Everything the request needs to know about where it arrived.
 *
 * `tenant === null` with `shape.role === "tenant"` is a real and important state:
 * the hostname is well-formed and under our root, but no tenant owns that slug.
 * That must render "nothing here", NOT a generic sign-in — a sign-in form on an
 * unclaimed subdomain is an invitation to authenticate somewhere that does not
 * exist.
 */
export interface HostContext<B = unknown> {
  hostname: string;
  shape: HostShape;
  tenant: HostTenant<B> | null;
  /** The host gate for `tenant`, or null when no tenant resolved. */
  gate: HostGate | null;
}

/** Lowercased hostname of a URL (no port). */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * The apex we serve tenants under. Explicit config first, then the advertised
 * origin. Returns "" when neither is set — the app supplies its own last resort,
 * because a shared package guessing a hostname is how every tenant 404s.
 */
export function rootDomain(env: RootDomainEnv): string {
  const explicit = (env.ROOT_DOMAIN || "").trim().toLowerCase();
  if (explicit) return explicit;
  return env.BETTER_AUTH_URL ? hostnameOf(env.BETTER_AUTH_URL) : "";
}

const slugOpts = (cfg: TenancyConfig): SlugOptions => ({ reserved: cfg.reserved });

/** Classify a request's hostname against the configured root. Pure. */
export function shapeOf(hostname: string, cfg: TenancyConfig): HostShape {
  return classifyHost(hostname, cfg.root, slugOpts(cfg));
}

// ── The two lookups ──────────────────────────────────────────────────────────

/** Columns every lane selects, so one mapper covers all of them. */
const TENANT_COLS =
  'o.id AS tenant_id, o.name AS name, o.slug AS slug, ts.branding_json AS branding_json, ' +
  "ts.marketplace_json AS marketplace_json";

interface TenantRow {
  tenant_id: string;
  name: string;
  slug: string;
  branding_json: string | null;
  marketplace_json: string | null;
}

function toHostTenant<B>(row: TenantRow): HostTenant<B> {
  return {
    tenantId: row.tenant_id,
    name: row.name,
    slug: row.slug,
    branding: parseJson<B>(row.branding_json ?? null, null as B),
    allowSignup: Boolean(parseJson<{ selfRegister?: boolean }>(row.marketplace_json ?? null, {}).selfRegister),
    subscriptionStatus: null,
  };
}

/**
 * Resolve the tenant whose BRANDED DOOR this is, by slug or by id.
 *
 * The id lane exists for links we mailed: a notification CTA can carry
 * `?t=<tenantId>`, and a signed-out recipient clicking a link that names their
 * tenant should not be asked which one they meant.
 *
 * Unlike a host resolution this does NOT pin the tenancy — it only tells a screen
 * whose brand to wear. Used by the setup/root doors and by redirect logic that
 * needs to know where a slug actually lives.
 */
export async function resolveTenantDoor<B = unknown>(
  db: D1Database,
  by: { slug?: string; tenantId?: string },
): Promise<HostTenant<B> | null> {
  const slug = by.slug?.trim().toLowerCase();
  const tenantId = by.tenantId?.trim();
  if (!slug && !tenantId) return null;
  const row = await db
    .prepare(
      `SELECT ${TENANT_COLS} FROM "organization" o ` +
        "LEFT JOIN tenant_settings ts ON ts.tenant_id = o.id WHERE " +
        (slug ? "o.slug = ?" : "o.id = ?"),
    )
    .bind(slug ?? tenantId)
    .first<TenantRow>()
    .catch(() => null);
  return row ? toHostTenant<B>(row) : null;
}

/** Resolve a tenant by its slug — the subdomain lane. */
export async function resolveSlugTenant<B = unknown>(db: D1Database, slug: string): Promise<HostTenant<B> | null> {
  return resolveTenantDoor<B>(db, { slug });
}

/** Resolve the tenant that has ACTIVATED this custom hostname. Only `active` rows
 *  route: a pending or errored domain must not take over serving. */
async function resolveCustomDomainTenant<B>(db: D1Database, hostname: string): Promise<HostTenant<B> | null> {
  const row = await db
    .prepare(
      `SELECT ${TENANT_COLS} FROM tenant_domains td ` +
        'JOIN "organization" o ON o.id = td.tenant_id ' +
        "LEFT JOIN tenant_settings ts ON ts.tenant_id = td.tenant_id " +
        "WHERE td.hostname = ? AND td.status = 'active'",
    )
    .bind(hostname)
    .first<TenantRow>()
    .catch(() => null);
  return row ? toHostTenant<B>(row) : null;
}

// ── Caching ──────────────────────────────────────────────────────────────────

/**
 * How long a host's IDENTITY is cached in KV — who owns this hostname, their
 * name, branding and self-registration setting. All near-static, and all
 * invalidated explicitly when they change (`invalidateTenantHosts`).
 *
 * The subscription status is deliberately NOT part of this — see `resolveHost`.
 */
const HOST_CACHE_TTL_S = 60;

const cacheKey = (hostname: string): string => `host:${hostname}`;

/** Drop the cached resolution for ONE hostname. */
export async function invalidateHostCache(env: Partial<HasCache>, hostname: string): Promise<void> {
  if (env.CACHE && hostname) await env.CACHE.delete(cacheKey(hostname)).catch(() => undefined);
}

/**
 * Drop every cached resolution for a tenant — its subdomain AND all of its custom
 * domains. Call this on any change that alters what a host serves: branding,
 * self-registration, domain (de)activation.
 */
export async function invalidateTenantHosts(
  env: TenancyBindings,
  tenantId: string,
  cfg: TenancyConfig,
): Promise<void> {
  if (!env.CACHE) return;
  const rows = (await env.DB
    .prepare("SELECT hostname FROM tenant_domains WHERE tenant_id = ?")
    .bind(tenantId)
    .all<{ hostname: string }>()
    .catch(() => ({ results: [] as { hostname: string }[] }))).results ?? [];
  const hostnames = new Set(rows.map((r) => r.hostname));

  /**
   * Plus the subdomain DERIVED from the slug — which is not necessarily the one
   * in `tenant_domains`, and is the one that actually serves requests.
   *
   * `resolveHost` resolves the subdomain lane by slug off the organization row,
   * so the serving hostname is `<org.slug>.<root>` whether or not a provisioning
   * row exists or agrees. Enumerating only the table therefore missed the live
   * cache key in three real situations: provisioning failed, a slug moved and the
   * row did not follow, or the configured root differs from the row's (which is
   * every local and test run, where requests arrive on `<slug>.localhost` while
   * the row says `<slug>.<ROOT_DOMAIN>`).
   *
   * The symptom was a 60-second stale read of exactly the fields owners change
   * most — branding and self-registration — so turning self-signup on left the
   * public door still refusing strangers, with nothing to explain why.
   */
  const org = await env.DB
    .prepare('SELECT slug FROM "organization" WHERE id = ?')
    .bind(tenantId)
    .first<{ slug: string | null }>()
    .catch(() => null);
  if (org?.slug) {
    hostnames.add(tenantHostname(org.slug, cfg.root));
    // Dev and the integration suite serve every tenant on `<slug>.localhost`.
    hostnames.add(tenantHostname(org.slug, "localhost"));
  }

  await Promise.all([...hostnames].map((h) => invalidateHostCache(env, h)));
}

// ── The resolver ─────────────────────────────────────────────────────────────

interface CachedHost<B> {
  tenant: HostTenant<B> | null;
}

/**
 * Resolve everything about the request's host: which door, which tenant, and
 * whether that tenant's subdomain is currently writable.
 *
 * Fails CLOSED in every ambiguous case. An `invalid` host (reserved label, or
 * nested deeper than the wildcard certificate covers) resolves no tenant and is
 * never passed to the custom-domain lookup — otherwise an owner could claim an
 * infrastructure hostname by typing it into the domains form and have it served.
 *
 * ── Why the status is never cached ──────────────────────────────────────────
 *
 * The identity beside it IS cached, and that asymmetry is deliberate. A dozen
 * different paths mutate a subscription's status (payment webhooks, the dunning
 * sweep, comp toggles, close and reopen, downgrade settlement) and any new
 * billing path is another. Caching the gate would make every one of them
 * responsible for calling an invalidation it is easy to forget — and the failure
 * mode of forgetting is a tenant that PAID and stays locked out, which is the
 * worst possible bug for this feature to have.
 *
 * `statusOf` is a primary-key point lookup, the cheapest query D1 offers. Paying
 * it per request buys a gate that is always exactly right and imposes no
 * coherence obligation anywhere else in the codebase.
 */
export async function resolveHost<B = unknown>(
  env: TenancyBindings,
  hostname: string,
  cfg: TenancyConfig,
): Promise<HostContext<B>> {
  const shape = shapeOf(hostname, cfg);
  const bare: HostContext<B> = { hostname: shape.hostname, shape, tenant: null, gate: null };

  // Doors that never carry a tenancy.
  if (shape.role === "root" || shape.role === "setup" || shape.role === "admin" || shape.role === "invalid") {
    return bare;
  }

  const key = cacheKey(shape.hostname);
  let tenant: HostTenant<B> | null = null;
  let cached = false;

  if (env.CACHE) {
    const hit = await env.CACHE.get(key).catch(() => null);
    if (hit !== null) {
      tenant = hit === "" ? null : (JSON.parse(hit) as CachedHost<B>).tenant;
      cached = true;
    }
  }

  if (!cached) {
    // The subdomain lane resolves by SLUG off the organization row, not through
    // `tenant_domains`. The org row is the authoritative answer to "what is this
    // tenant's slug", so a tenant is reachable at its own address even if the
    // provisioning row failed to write — one fewer way to have a tenant that
    // exists and cannot be reached. The `subdomain` row is for the domains
    // listing and operator visibility; see `canonicalHost`.
    tenant =
      shape.role === "tenant" && shape.slug
        ? await resolveSlugTenant<B>(env.DB, shape.slug)
        : await resolveCustomDomainTenant<B>(env.DB, shape.hostname);
    if (env.CACHE) {
      const payload: CachedHost<B> = { tenant };
      await env.CACHE
        .put(key, tenant ? JSON.stringify(payload) : "", { expirationTtl: HOST_CACHE_TTL_S })
        .catch(() => undefined);
    }
  }

  if (!tenant) return bare;

  const status = cfg.statusOf ? await cfg.statusOf(env.DB, tenant.tenantId) : null;
  const fresh: HostTenant<B> = { ...tenant, subscriptionStatus: status };
  return { ...bare, tenant: fresh, gate: resolveHostGate(status) };
}

/**
 * True for the doors that are the PLATFORM's rather than a tenant's: the root
 * dead end, the setup wizard and the operator console. Used where a surface must
 * exist outside any tenancy.
 */
export function isPlatformDoor(shape: HostShape): boolean {
  return shape.role === "root" || shape.role === "setup" || shape.role === "admin";
}

// ── Provisioning a tenant's own hostname ─────────────────────────────────────

/**
 * Give a tenant its address.
 *
 * Called once, when the tenant is created. Unlike a custom domain this touches
 * Cloudflare not at all and has no DCV step: `<slug>.<root>` is already covered
 * by the zone's wildcard DNS record, the wildcard certificate and the
 * `*.<root>/*` worker route, so the hostname works the instant the row exists.
 * That is the whole reason the subdomain tier is free and instant while a custom
 * domain is neither.
 *
 * Written as an upsert on the hostname so re-running it is harmless — tenant
 * creation is retried by the onboarding flow, and a half-created tenant must be
 * resumable rather than permanently addressless.
 */
export async function provisionSubdomain(
  env: TenancyBindings,
  tenantId: string,
  slug: string,
  cfg: TenancyConfig,
  createdBy?: string | null,
): Promise<string> {
  const hostname = tenantHostname(slug, cfg.root);
  const now = new Date().toISOString();
  await env.DB
    .prepare(
      "INSERT INTO tenant_domains (hostname, tenant_id, kind, status, ssl_status, created_by, created_at, updated_at) " +
        "VALUES (?, ?, 'subdomain', 'active', 'active', ?, ?, ?) " +
        "ON CONFLICT(hostname) DO UPDATE SET tenant_id = excluded.tenant_id, kind = 'subdomain', status = 'active', updated_at = excluded.updated_at",
    )
    .bind(hostname, tenantId, createdBy ?? null, now, now)
    .run();
  await invalidateHostCache(env, hostname);
  return hostname;
}

/**
 * Move a tenant's subdomain when its slug changes.
 *
 * The old hostname must actually GO, not merely stop being canonical: while the
 * row exists it still resolves and still pins the tenancy, so a stale row would
 * leave the tenant reachable at an address it has abandoned — and would block
 * another tenant from ever claiming that slug.
 */
export async function moveSubdomain(
  env: TenancyBindings,
  tenantId: string,
  nextSlug: string,
  cfg: TenancyConfig,
): Promise<string> {
  const stale = (await env.DB
    .prepare("SELECT hostname FROM tenant_domains WHERE tenant_id = ? AND kind = 'subdomain'")
    .bind(tenantId)
    .all<{ hostname: string }>()
    .catch(() => ({ results: [] as { hostname: string }[] }))).results ?? [];
  const next = tenantHostname(nextSlug, cfg.root);
  for (const s of stale) {
    if (s.hostname === next) continue;
    await env.DB.prepare("DELETE FROM tenant_domains WHERE hostname = ?").bind(s.hostname).run().catch(() => undefined);
    await invalidateHostCache(env, s.hostname);
  }
  return provisionSubdomain(env, tenantId, nextSlug, cfg);
}

/**
 * The hostname to build links for this tenant: its own domain if it has an active
 * one, else its subdomain.
 *
 * Every emailed link, invite and notification CTA goes through here. The
 * preference order matters for white-label — a tenant that bought a domain should
 * never see our root domain in an email its own customers receive — and the
 * fallback matters for reliability: before the subdomain tier existed, a tenant
 * with no custom domain got links pointing at the shared platform host, which is
 * a dead end that would serve them nothing.
 */
export async function canonicalHost(
  env: TenancyBindings,
  tenantId: string,
  cfg: TenancyConfig,
  /**
   * The root to derive the subdomain against, when the caller knows the one this
   * REQUEST was classified against (`host.shape.root`).
   *
   * It differs from the configured root on loopback, where `classifyHost` always
   * uses `localhost` so dev and E2E run the real topology. Without the override,
   * an invite emailed from a local run carried a link to the real production
   * hostname — unreachable from the machine that generated it, and impossible to
   * notice until someone clicked it. Omitted by background jobs (a cron has no
   * request), which correctly fall back to the configured root.
   */
  rootOverride?: string,
): Promise<string> {
  const custom = await env.DB
    .prepare("SELECT hostname FROM tenant_domains WHERE tenant_id = ? AND kind = 'custom' AND status = 'active' ORDER BY created_at LIMIT 1")
    .bind(tenantId)
    .first<{ hostname: string }>()
    .catch(() => null);
  if (custom?.hostname) return custom.hostname;

  // Derived from the ORG's slug, not from the `subdomain` row.
  //
  // Both would normally agree, but they have different failure modes and only one
  // of them is authoritative. `resolveHost` resolves a subdomain by looking the
  // slug up on the organization, so the org row is what actually decides where a
  // tenant answers; the `subdomain` row exists for the domains listing. Deriving
  // here means a failed or half-applied `moveSubdomain` cannot send a tenant's
  // invite emails to an address that no longer resolves.
  const org = await env.DB
    .prepare('SELECT slug FROM "organization" WHERE id = ?')
    .bind(tenantId)
    .first<{ slug: string | null }>()
    .catch(() => null);
  const root = rootOverride || cfg.root;
  return org?.slug ? tenantHostname(org.slug, root) : root;
}
