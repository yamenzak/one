/**
 * Host → tenant resolution. The Host header is the tenancy (SPEC §14.1).
 *
 * Kova is subdomain-first: `acme.kova.4dl.app` IS Acme's studio, `coaching.acme.com`
 * is the same studio on its own domain, and `kova.4dl.app` by itself is nothing.
 * `@mossa/domain` `classifyHost` decides which of the five doors a hostname is,
 * purely and testably; this module does the two D1 lookups that turn a `tenant`
 * or `custom` classification into an actual studio, and attaches that studio's
 * host gate (`resolveHostGate` — is this studio paid up, or is its whole
 * subdomain read-only).
 *
 * ── Why the tenant comes from the host and not the session ──────────────────
 *
 * `activeOrganizationId` is stamped once at session CREATE, to the user's oldest
 * membership. Under the old `/t/<slug>` model that meant a coach in two studios
 * could enter through studio B's branded door and have every API call scoped to
 * studio A — the right brand over the wrong tenancy. Resolving from the Host
 * makes the tenancy a property of the origin, so a session pointed at the wrong
 * studio grants exactly nothing: `auth-context` only hands out `tenantId`/role if
 * the caller is a member of the host's tenant.
 */

import type { SessionContext } from "@mossa/protocol";
import { classifyHost, resolveHostGate, tenantHostname, type HostGate, type HostShape } from "@mossa/domain";
import { parseJson } from "./db.js";

export interface HostTenant {
  tenantId: string;
  name: string;
  slug: string;
  branding: SessionContext["branding"];
  /** marketplace.selfRegister — whether a brand-new email may self-sign-up as a
   *  client here (else it's invite/existing-only). Drives the login screen's
   *  Log-in vs Sign-up affordance and the OTP-send eligibility gate. */
  allowSignup: boolean;
  /** The studio's raw subscription status, for the gate and the owner's banner. */
  subscriptionStatus: string | null;
}

/**
 * Everything the request needs to know about where it arrived.
 *
 * `tenant === null` with `shape.role === "tenant"` is a real and important state:
 * the hostname is well-formed and under our root, but no studio owns that slug.
 * That must render "no studio here", NOT a generic login — a login on an unclaimed
 * subdomain is an invitation to sign in somewhere that does not exist.
 */
export interface HostContext {
  hostname: string;
  shape: HostShape;
  tenant: HostTenant | null;
  /** The host gate for `tenant`'s studio, or null when no tenant resolved. */
  gate: HostGate | null;
}

/** Lowercased hostname of the request (no port). */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * The apex we serve studios under. Explicit config first, then the advertised
 * origin, then the shipped default — see `Env.ROOT_DOMAIN` for why the explicit
 * setting matters.
 */
export function rootDomain(env: { ROOT_DOMAIN?: string; BETTER_AUTH_URL?: string }): string {
  const explicit = (env.ROOT_DOMAIN || "").trim().toLowerCase();
  if (explicit) return explicit;
  const fromUrl = env.BETTER_AUTH_URL ? hostnameOf(env.BETTER_AUTH_URL) : "";
  return fromUrl || "kova.4dl.app";
}

/** Classify a request's hostname against the configured root. Pure. */
export function shapeOf(hostname: string, env: { ROOT_DOMAIN?: string; BETTER_AUTH_URL?: string }): HostShape {
  return classifyHost(hostname, rootDomain(env));
}

// ── The two lookups ──────────────────────────────────────────────────────────

/** Columns every lane selects, so one mapper covers all of them. */
const TENANT_COLS =
  'o.id AS tenant_id, o.name AS name, o.slug AS slug, ts.branding_json AS branding_json, ' +
  "ts.marketplace_json AS marketplace_json, s.status AS sub_status";

interface TenantRow {
  tenant_id: string;
  name: string;
  slug: string;
  branding_json: string | null;
  marketplace_json: string | null;
  sub_status: string | null;
}

function toHostTenant(row: TenantRow): HostTenant {
  return {
    tenantId: row.tenant_id,
    name: row.name,
    slug: row.slug,
    branding: parseJson<SessionContext["branding"]>(row.branding_json ?? null, null),
    allowSignup: Boolean(parseJson<{ selfRegister?: boolean }>(row.marketplace_json ?? null, {}).selfRegister),
    subscriptionStatus: row.sub_status ?? null,
  };
}

/**
 * The studio's live subscription status — read fresh on every request, never cached.
 *
 * This is a deliberate choice against caching, and it is worth explaining because
 * the identity beside it IS cached. Fifteen different places mutate
 * `subscriptions.status` today (Stripe webhooks for six event types, the dunning
 * sweep, comp toggles, close and reopen, downgrade settlement) and any new billing
 * path is a sixteenth. Caching the gate would make every one of them responsible
 * for calling an invalidation it is easy to forget — and the failure mode of
 * forgetting is a studio that PAID and stays locked out, which is the worst
 * possible bug for this feature to have.
 *
 * The read is a primary-key point lookup (`subscriptions.tenant_id` is the PK), so
 * it is the cheapest query D1 offers. Paying it per request buys a gate that is
 * always exactly right and imposes no coherence obligation anywhere else in the
 * codebase.
 */
async function liveStatus(db: D1Database, tenantId: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT status FROM subscriptions WHERE tenant_id = ?")
    .bind(tenantId)
    .first<{ status: string | null }>()
    .catch(() => null);
  return row?.status ?? null;
}

/**
 * Resolve the tenant whose BRANDED DOOR this is, by slug or by id.
 *
 * The id lane exists for links we mailed: every notification CTA carries
 * `?t=<tenantId>`, and a signed-out recipient clicking a link that names their
 * studio should not be asked which studio they meant.
 *
 * Unlike a host resolution this does NOT pin the tenancy — it only tells a screen
 * whose brand to wear. Used by the setup/root doors and by redirect logic that
 * needs to know where a slug actually lives.
 */
export async function resolveTenantDoor(db: D1Database, by: { slug?: string; tenantId?: string }): Promise<HostTenant | null> {
  const slug = by.slug?.trim().toLowerCase();
  const tenantId = by.tenantId?.trim();
  if (!slug && !tenantId) return null;
  const row = await db
    .prepare(
      `SELECT ${TENANT_COLS} FROM "organization" o ` +
        "LEFT JOIN tenant_settings ts ON ts.tenant_id = o.id " +
        "LEFT JOIN subscriptions s ON s.tenant_id = o.id WHERE " +
        (slug ? "o.slug = ?" : "o.id = ?"),
    )
    .bind(slug ?? tenantId)
    .first<TenantRow>()
    .catch(() => null);
  return row ? toHostTenant(row) : null;
}

/** Resolve a tenant by its slug — the subdomain lane. */
export async function resolveSlugTenant(db: D1Database, slug: string): Promise<HostTenant | null> {
  return resolveTenantDoor(db, { slug });
}

/** Resolve the tenant that has ACTIVATED this custom hostname. Only `active` rows
 *  route: a pending or errored domain must not take over serving. */
async function resolveCustomDomainTenant(db: D1Database, hostname: string): Promise<HostTenant | null> {
  const row = await db
    .prepare(
      `SELECT ${TENANT_COLS} FROM tenant_domains td ` +
        'JOIN "organization" o ON o.id = td.tenant_id ' +
        "LEFT JOIN tenant_settings ts ON ts.tenant_id = td.tenant_id " +
        "LEFT JOIN subscriptions s ON s.tenant_id = td.tenant_id " +
        "WHERE td.hostname = ? AND td.status = 'active'",
    )
    .bind(hostname)
    .first<TenantRow>()
    .catch(() => null);
  return row ? toHostTenant(row) : null;
}

// ── Caching ──────────────────────────────────────────────────────────────────

/**
 * How long a host's IDENTITY is cached in KV — who owns this hostname, their name,
 * branding and self-registration setting. All near-static, and all invalidated
 * explicitly when they change (`invalidateTenantHosts`).
 *
 * The subscription status is deliberately NOT part of this — see `liveStatus`.
 */
const HOST_CACHE_TTL_S = 60;

const cacheKey = (hostname: string): string => `host:${hostname}`;

/** Drop the cached resolution for ONE hostname. */
export async function invalidateHostCache(env: { CACHE?: KVNamespace }, hostname: string): Promise<void> {
  if (env.CACHE && hostname) await env.CACHE.delete(cacheKey(hostname)).catch(() => undefined);
}

/**
 * Drop every cached resolution for a tenant — its subdomain AND all of its custom
 * domains. Call this on any change that alters what a host serves: branding,
 * marketplace self-registration, domain (de)activation, and above all a
 * SUBSCRIPTION STATUS change, because the gate is cached with the identity.
 */
export async function invalidateTenantHosts(
  env: { CACHE?: KVNamespace; ROOT_DOMAIN?: string; BETTER_AUTH_URL?: string },
  db: D1Database,
  tenantId: string,
): Promise<void> {
  if (!env.CACHE) return;
  const rows = (await db
    .prepare("SELECT hostname FROM tenant_domains WHERE tenant_id = ?")
    .bind(tenantId)
    .all<{ hostname: string }>()
    .catch(() => ({ results: [] as { hostname: string }[] }))).results ?? [];
  const hostnames = new Set(rows.map((r) => r.hostname));

  /**
   * Plus the subdomain DERIVED from the slug — which is not necessarily the one in
   * `tenant_domains`, and is the one that actually serves requests.
   *
   * `resolveHost` resolves the subdomain lane by slug off the organization row, so
   * the serving hostname is `<org.slug>.<root>` whether or not a provisioning row
   * exists or agrees. Enumerating only the table therefore missed the live cache
   * key in three real situations: provisioning failed, a slug moved and the row
   * did not follow, or the configured root differs from the row's (which is every
   * local and test run, where requests arrive on `<slug>.localhost` while the row
   * says `<slug>.<ROOT_DOMAIN>`).
   *
   * The symptom was a 60-second stale read of exactly the fields owners change most
   * — branding and marketplace self-registration — so turning self-signup on left
   * the public door still refusing strangers, with nothing to explain why.
   */
  const org = await db
    .prepare('SELECT slug FROM "organization" WHERE id = ?')
    .bind(tenantId)
    .first<{ slug: string | null }>()
    .catch(() => null);
  if (org?.slug) {
    hostnames.add(tenantHostname(org.slug, rootDomain(env)));
    // Dev and the integration suite serve every studio on `<slug>.localhost`.
    hostnames.add(tenantHostname(org.slug, "localhost"));
  }

  await Promise.all([...hostnames].map((h) => invalidateHostCache(env, h)));
}

// ── The resolver ─────────────────────────────────────────────────────────────

interface CachedHost {
  tenant: HostTenant | null;
}

/**
 * Resolve everything about the request's host: which door, which studio, and
 * whether that studio's subdomain is currently writable.
 *
 * Fails CLOSED in every ambiguous case. An `invalid` host (reserved label, or
 * nested deeper than the wildcard certificate covers) resolves no tenant and is
 * never passed to the custom-domain lookup — otherwise an owner could claim an
 * infrastructure hostname by typing it into the domains form and have it served.
 */
export async function resolveHost(
  db: D1Database,
  hostname: string,
  env: { ROOT_DOMAIN?: string; BETTER_AUTH_URL?: string; CACHE?: KVNamespace },
): Promise<HostContext> {
  const shape = shapeOf(hostname, env);
  const bare: HostContext = { hostname: shape.hostname, shape, tenant: null, gate: null };

  // Doors that never carry a tenancy.
  if (shape.role === "root" || shape.role === "setup" || shape.role === "admin" || shape.role === "invalid") {
    return bare;
  }

  const key = cacheKey(shape.hostname);
  let tenant: HostTenant | null = null;
  let fromCache = false;

  if (env.CACHE) {
    const cached = await env.CACHE.get(key).catch(() => null);
    if (cached !== null) {
      tenant = cached === "" ? null : (JSON.parse(cached) as CachedHost).tenant;
      fromCache = true;
    }
  }

  if (!fromCache) {
    // The subdomain lane resolves by SLUG off the organization row, not through
    // `tenant_domains`. The org row is the authoritative answer to "what is this
    // studio's slug", so a studio is reachable at its own address even if the
    // provisioning row failed to write — one fewer way to have a studio that
    // exists and cannot be reached. The `subdomain` row is for the domains
    // listing and operator visibility; see `canonicalHost`.
    tenant =
      shape.role === "tenant" && shape.slug
        ? await resolveSlugTenant(db, shape.slug)
        : await resolveCustomDomainTenant(db, shape.hostname);
    if (env.CACHE) {
      const payload: CachedHost = { tenant };
      await env.CACHE
        .put(key, tenant ? JSON.stringify(payload) : "", { expirationTtl: HOST_CACHE_TTL_S })
        .catch(() => undefined);
    }
  }

  if (!tenant) return bare;

  // Always live, cached or not. A cached identity carries whatever status it had
  // when it was written, which is exactly the stale value the gate must not use.
  const status = fromCache ? await liveStatus(db, tenant.tenantId) : tenant.subscriptionStatus;
  const fresh: HostTenant = { ...tenant, subscriptionStatus: status };
  return { ...bare, tenant: fresh, gate: resolveHostGate(status) };
}

/**
 * True for the doors that are ours rather than a studio's: the root dead end, the
 * setup wizard and the operator console. Used where a surface must exist outside
 * any tenancy.
 */
export function isPlatformDoor(shape: HostShape): boolean {
  return shape.role === "root" || shape.role === "setup" || shape.role === "admin";
}

// ── Provisioning a studio's own hostname ─────────────────────────────────────

type HostEnv = { CACHE?: KVNamespace; ROOT_DOMAIN?: string; BETTER_AUTH_URL?: string };

/**
 * Give a studio its address.
 *
 * Called once, when the studio is created. Unlike a custom domain this touches
 * Cloudflare not at all and has no DCV step: `<slug>.<root>` is already covered by
 * the zone's wildcard DNS record, the ACM wildcard certificate and the
 * `*.<root>/*` worker route, so the hostname works the instant the row exists.
 * That is the whole reason the subdomain tier is free and instant while a custom
 * domain is neither.
 *
 * Written as an upsert on the hostname so re-running it is harmless — studio
 * creation is retried by the onboarding wizard, and a half-created studio must be
 * resumable rather than permanently addressless.
 */
export async function provisionSubdomain(
  env: HostEnv,
  db: D1Database,
  tenantId: string,
  slug: string,
  createdBy?: string | null,
): Promise<string> {
  const hostname = tenantHostname(slug, rootDomain(env));
  const now = new Date().toISOString();
  await db
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
 * Move a studio's subdomain when its slug changes.
 *
 * The old hostname must actually GO, not merely stop being canonical: while the
 * row exists it still resolves and still pins the tenancy, so a stale row would
 * leave the studio reachable at an address it has abandoned — and would block
 * another studio from ever claiming that slug.
 */
export async function moveSubdomain(
  env: HostEnv,
  db: D1Database,
  tenantId: string,
  nextSlug: string,
): Promise<string> {
  const stale = (await db
    .prepare("SELECT hostname FROM tenant_domains WHERE tenant_id = ? AND kind = 'subdomain'")
    .bind(tenantId)
    .all<{ hostname: string }>()
    .catch(() => ({ results: [] as { hostname: string }[] }))).results ?? [];
  const next = tenantHostname(nextSlug, rootDomain(env));
  for (const s of stale) {
    if (s.hostname === next) continue;
    await db.prepare("DELETE FROM tenant_domains WHERE hostname = ?").bind(s.hostname).run().catch(() => undefined);
    await invalidateHostCache(env, s.hostname);
  }
  return provisionSubdomain(env, db, tenantId, nextSlug);
}

/**
 * The hostname to build links for this tenant: its own domain if it has an active
 * one, else its subdomain.
 *
 * Every emailed link, invite and notification CTA goes through here. The
 * preference order matters for white-label — a studio that bought a domain should
 * never see our root domain in an email its clients receive — and the fallback
 * matters for reliability: before the subdomain tier existed, a tenant with no
 * custom domain got links pointing at the shared platform host, which is now a
 * dead end that would serve them nothing.
 */
export async function canonicalHost(env: HostEnv, db: D1Database, tenantId: string): Promise<string> {
  const custom = await db
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
  // studio answers; the `subdomain` row exists for the domains listing. Deriving
  // here means a failed or half-applied `moveSubdomain` cannot send a studio's
  // invite emails to an address that no longer resolves.
  const org = await db
    .prepare('SELECT slug FROM "organization" WHERE id = ?')
    .bind(tenantId)
    .first<{ slug: string | null }>()
    .catch(() => null);
  return org?.slug ? tenantHostname(org.slug, rootDomain(env)) : rootDomain(env);
}
