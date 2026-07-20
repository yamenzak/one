/**
 * Host → tenant resolution (SPEC §14.1, Model A white-label).
 *
 * On a tenant's custom domain the Host header — not the session — decides the
 * tenant. `mossa.4dl.app` and localhost are the neutral **platform** hosts:
 * they serve the generic Mossa entry, the `/t/<slug>` subpath fallback, and the
 * platform-admin surface, and resolve NO host tenant.
 */

import type { SessionContext } from "@mossa/protocol";
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
 * Resolve a tenant by its slug — the `/t/<slug>` branded-login path on the
 * platform host. Unlike {@link resolveHostTenant} this does NOT pin the tenant
 * (the platform host still allows cross-tenant switching post-auth); it only
 * hands the pre-auth Login screen enough to brand itself. Returns null for an
 * unknown slug.
 */
export async function resolveSlugTenant(db: D1Database, slug: string): Promise<HostTenant | null> {
  const s = slug.trim().toLowerCase();
  if (!s) return null;
  const row = await db
    .prepare(
      'SELECT o.id AS tenant_id, o.name AS name, o.slug AS slug, ts.branding_json AS branding_json, ts.marketplace_json AS marketplace_json ' +
        'FROM "organization" o LEFT JOIN tenant_settings ts ON ts.tenant_id = o.id WHERE o.slug = ?',
    )
    .bind(s)
    .first<{ tenant_id: string; name: string; slug: string; branding_json: string | null; marketplace_json: string | null }>()
    .catch(() => null);
  if (!row) return null;
  return {
    tenantId: row.tenant_id,
    name: row.name,
    slug: row.slug,
    branding: parseJson<SessionContext["branding"]>(row.branding_json ?? null, null),
    allowSignup: Boolean(parseJson<{ selfRegister?: boolean }>(row.marketplace_json ?? null, {}).selfRegister),
  };
}

/** True for the neutral platform hosts (never a custom tenant domain). */
export function isPlatformHost(hostname: string, env: { BETTER_AUTH_URL?: string }): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  const platform = env.BETTER_AUTH_URL ? hostnameOf(env.BETTER_AUTH_URL) : "mossa.4dl.app";
  return hostname === platform;
}

/** Drop the cached host→tenant resolution for a hostname. Call this whenever a
 *  domain is (de)activated or a tenant's branding changes, so the 60s TTL isn't
 *  the only path back to correctness (a deactivated domain must stop routing at
 *  once, not up to a minute later). Best-effort. */
export async function invalidateHostCache(env: { CACHE?: KVNamespace }, hostname: string): Promise<void> {
  if (env.CACHE && hostname) await env.CACHE.delete(`host:${hostname}`).catch(() => undefined);
}

/** How long a host→tenant resolution is cached in KV. The mapping is near-static
 *  (a domain is activated once), so a short TTL keeps every branded-domain
 *  request from paying 3 serial D1 reads while staying fresh within a minute. */
const HOST_CACHE_TTL_S = 60;

/**
 * Resolve the active custom-domain tenant for a hostname. Only `active`
 * hostnames route (a pending/error domain must not take over serving). Returns
 * null on platform hosts or unknown/inactive hostnames.
 *
 * The 3 reads are collapsed into one JOIN, and the result is memoized in KV per
 * hostname so a branded domain doesn't re-query D1 on every request.
 */
export async function resolveHostTenant(
  db: D1Database,
  hostname: string,
  env: { BETTER_AUTH_URL?: string; CACHE?: KVNamespace },
): Promise<HostTenant | null> {
  if (!hostname || isPlatformHost(hostname, env)) return null;

  const cacheKey = `host:${hostname}`;
  if (env.CACHE) {
    const cached = await env.CACHE.get(cacheKey).catch(() => null);
    if (cached !== null) return cached === "" ? null : (JSON.parse(cached) as HostTenant);
  }

  const row = await db
    .prepare(
      'SELECT td.tenant_id AS tenant_id, o.name AS name, o.slug AS slug, ts.branding_json AS branding_json, ts.marketplace_json AS marketplace_json ' +
        'FROM tenant_domains td JOIN "organization" o ON o.id = td.tenant_id ' +
        'LEFT JOIN tenant_settings ts ON ts.tenant_id = td.tenant_id ' +
        "WHERE td.hostname = ? AND td.status = 'active'",
    )
    .bind(hostname)
    .first<{ tenant_id: string; name: string; slug: string; branding_json: string | null; marketplace_json: string | null }>()
    .catch(() => null);

  const result: HostTenant | null = row
    ? {
        tenantId: row.tenant_id,
        name: row.name,
        slug: row.slug,
        branding: parseJson<SessionContext["branding"]>(row.branding_json ?? null, null),
        allowSignup: Boolean(parseJson<{ selfRegister?: boolean }>(row.marketplace_json ?? null, {}).selfRegister),
      }
    : null;

  // Cache hits and misses (empty string sentinel for a miss) with a short TTL.
  if (env.CACHE) {
    await env.CACHE.put(cacheKey, result ? JSON.stringify(result) : "", { expirationTtl: HOST_CACHE_TTL_S }).catch(() => undefined);
  }
  return result;
}
