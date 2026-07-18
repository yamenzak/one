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
}

/** Lowercased hostname of the request (no port). */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** True for the neutral platform hosts (never a custom tenant domain). */
export function isPlatformHost(hostname: string, env: { BETTER_AUTH_URL?: string }): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  const platform = env.BETTER_AUTH_URL ? hostnameOf(env.BETTER_AUTH_URL) : "mossa.4dl.app";
  return hostname === platform;
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
      'SELECT td.tenant_id AS tenant_id, o.name AS name, o.slug AS slug, ts.branding_json AS branding_json ' +
        'FROM tenant_domains td JOIN "organization" o ON o.id = td.tenant_id ' +
        'LEFT JOIN tenant_settings ts ON ts.tenant_id = td.tenant_id ' +
        "WHERE td.hostname = ? AND td.status = 'active'",
    )
    .bind(hostname)
    .first<{ tenant_id: string; name: string; slug: string; branding_json: string | null }>()
    .catch(() => null);

  const result: HostTenant | null = row
    ? {
        tenantId: row.tenant_id,
        name: row.name,
        slug: row.slug,
        branding: parseJson<SessionContext["branding"]>(row.branding_json ?? null, null),
      }
    : null;

  // Cache hits and misses (empty string sentinel for a miss) with a short TTL.
  if (env.CACHE) {
    await env.CACHE.put(cacheKey, result ? JSON.stringify(result) : "", { expirationTtl: HOST_CACHE_TTL_S }).catch(() => undefined);
  }
  return result;
}
