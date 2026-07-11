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

/**
 * Resolve the active custom-domain tenant for a hostname. Only `active`
 * hostnames route (a pending/error domain must not take over serving). Returns
 * null on platform hosts or unknown/inactive hostnames.
 */
export async function resolveHostTenant(
  db: D1Database,
  hostname: string,
  env: { BETTER_AUTH_URL?: string },
): Promise<HostTenant | null> {
  if (!hostname || isPlatformHost(hostname, env)) return null;
  const dom = await db
    .prepare("SELECT tenant_id FROM tenant_domains WHERE hostname = ? AND status = 'active'")
    .bind(hostname)
    .first<{ tenant_id: string }>()
    .catch(() => null);
  if (!dom) return null;
  const org = await db
    .prepare('SELECT name, slug FROM "organization" WHERE id = ?')
    .bind(dom.tenant_id)
    .first<{ name: string; slug: string }>();
  if (!org) return null;
  const settings = await db
    .prepare("SELECT branding_json FROM tenant_settings WHERE tenant_id = ?")
    .bind(dom.tenant_id)
    .first<{ branding_json: string | null }>();
  return {
    tenantId: dom.tenant_id,
    name: org.name,
    slug: org.slug,
    branding: parseJson<SessionContext["branding"]>(settings?.branding_json ?? null, null),
  };
}
