/**
 * Cloudflare for SaaS — a thin custom-hostname API client.
 *
 * Tenants bring their own domain (e.g. app.acme.com), CNAME it at our
 * `cname_target`, and we register it as a **custom hostname** on the platform
 * zone. Cloudflare provisions a DV certificate and, once the CNAME + DCV TXT
 * validate, routes the hostname to this worker (the zone's fallback origin).
 *
 * Config lives in admin-editable app_config (like Stripe/Gemini), NOT in a
 * binding, so it's runtime-tunable and never shipped in the bundle:
 *   cf.saas.api_token   — token with `SSL and Certificates: Edit` on the zone
 *   cf.saas.zone_id     — the SaaS-enabled zone id
 *   cf.saas.cname_target — what tenants point their CNAME at (e.g. saas.4dl.app —
 *                          a proxied hostname on the SERVING ZONE, not one under
 *                          the tenant root, which the wildcard route would claim)
 *   cf.saas.worker_name  — the worker script to route hostnames at (the app supplies its own default)
 *
 * The token needs TWO permissions: `SSL and Certificates: Edit` to register the
 * hostname, and `Workers Routes: Edit` to point it at this worker. See the
 * worker-routes section below for why the route is per-hostname.
 */

import { getConfig } from "@4dl/core";

const API = "https://api.cloudflare.com/client/v4";

/**
 * The worker script name custom-hostname routes point at when nothing is stored.
 *
 * It must match `name` in the app's `wrangler.jsonc`, which is why the app SUPPLIES
 * it rather than this package guessing. A stored override that names a script
 * which no longer exists is the worst failure mode this module has: the route is
 * created successfully, the certificate issues, the domain reports ACTIVE — and
 * every request to it reaches a script that is not there. Nothing about the
 * tenant's screen suggests a problem. That is why the value is surfaced and
 * editable in the operator console rather than being a D1 row only a query can
 * see, and why the fallback below is a last resort rather than a default anyone
 * should rely on.
 */
export const FALLBACK_WORKER_NAME = "worker";

/**
 * Cloudflare worker script names: lowercase alphanumerics, `-` and `_`. Checked
 * before storing, because an invalid name is only discovered at the moment a
 * tenant binds a domain — by which point they are staring at a failure we caused.
 */
export const WORKER_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,62}$/;

export interface SaasConfig {
  apiToken: string;
  zoneId: string;
  cnameTarget: string;
  /** The worker script a custom hostname's route points at. Configurable rather
   *  than hardcoded so renaming the worker in wrangler.jsonc surfaces as a
   *  settable value instead of every new domain silently 404ing. */
  workerName: string;
}

/**
 * Read + validate the CF for SaaS config. Returns null when not configured.
 *
 * `defaultWorkerName` is the app's own script name, used when the operator has
 * not overridden it.
 */
export async function saasConfig(db: D1Database, defaultWorkerName = FALLBACK_WORKER_NAME): Promise<SaasConfig | null> {
  const cfg = await getConfig(db);
  const apiToken = cfg["cf.saas.api_token"];
  const zoneId = cfg["cf.saas.zone_id"];
  const cnameTarget = cfg["cf.saas.cname_target"];
  if (!apiToken || !zoneId || !cnameTarget) return null;
  return { apiToken, zoneId, cnameTarget, workerName: cfg["cf.saas.worker_name"] || defaultWorkerName };
}

/** A normalized DCV/ownership record the tenant must add at their DNS. */
export interface VerifyRecord {
  name: string | null;
  value: string | null;
}

export interface CustomHostname {
  id: string;
  status: string; // pending | active | ...  (hostname/ownership status)
  sslStatus: string | null; // pending_validation | active | ...
  /** The FIRST validation record, kept for callers that only render one. */
  verify: VerifyRecord;
  /**
   * EVERY validation record Cloudflare asked for.
   *
   * Cloudflare can return more than one `_acme-challenge` TXT — same name,
   * different values — when it is issuing more than one certificate for the
   * hostname. All of them must exist in DNS before the certs issue; DNS allows
   * multiple TXT records at one name, so they are added as separate rows.
   *
   * We used to `.find()` the first and drop the rest, so a tenant following our
   * screen added one record and then waited on a certificate that could never
   * issue — with nothing on the page to suggest anything was missing. Found by an
   * owner comparing our instructions against Cloudflare's own dashboard, which
   * listed two.
   */
  verifyAll: VerifyRecord[];
  errors: string[];
}

interface CfEnvelope<T> {
  success: boolean;
  errors?: { message: string }[];
  result?: T;
}

interface CfHostname {
  id: string;
  status: string;
  ssl?: {
    status?: string;
    validation_records?: { txt_name?: string; txt_value?: string }[];
    validation_errors?: { message: string }[];
  };
  ownership_verification?: { name?: string; value?: string; type?: string };
  verification_errors?: string[];
}

async function cf<T>(cfg: SaasConfig, path: string, init?: RequestInit): Promise<CfEnvelope<T>> {
  const res = await fetch(`${API}/zones/${cfg.zoneId}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${cfg.apiToken}`, "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  return (await res.json().catch(() => ({ success: false, errors: [{ message: "invalid CF response" }] }))) as CfEnvelope<T>;
}

function normalize(h: CfHostname): CustomHostname {
  // Prefer the SSL DCV TXT records; fall back to ownership verification. ALL of
  // them — Cloudflare issues more than one certificate for some hostnames and
  // every challenge record must be present before any of them validate.
  const dcv = (h.ssl?.validation_records ?? [])
    .filter((r) => r.txt_name && r.txt_value)
    .map((r) => ({ name: r.txt_name ?? null, value: r.txt_value ?? null }));
  const verifyAll: VerifyRecord[] = dcv.length
    ? dcv
    : h.ownership_verification?.name
      ? [{ name: h.ownership_verification.name ?? null, value: h.ownership_verification.value ?? null }]
      : [];
  const verify: VerifyRecord = verifyAll[0] ?? { name: null, value: null };
  const errors = [
    ...(h.verification_errors ?? []),
    ...((h.ssl?.validation_errors ?? []).map((e) => e.message)),
  ].filter(Boolean);
  return { id: h.id, status: h.status, sslStatus: h.ssl?.status ?? null, verify, verifyAll, errors };
}

/** Register a hostname; CF returns the DCV record(s) to validate ownership. */
export async function createCustomHostname(cfg: SaasConfig, hostname: string): Promise<CustomHostname> {
  const env = await cf<CfHostname>(cfg, "/custom_hostnames", {
    method: "POST",
    body: JSON.stringify({ hostname, ssl: { method: "txt", type: "dv", settings: { min_tls_version: "1.2" } } }),
  });
  if (!env.success || !env.result) throw new Error(env.errors?.[0]?.message ?? "cloudflare create failed");
  return normalize(env.result);
}

/** Poll a custom hostname's current provisioning + SSL status. */
export async function getCustomHostname(cfg: SaasConfig, id: string): Promise<CustomHostname> {
  const env = await cf<CfHostname>(cfg, `/custom_hostnames/${id}`);
  if (!env.success || !env.result) throw new Error(env.errors?.[0]?.message ?? "cloudflare get failed");
  return normalize(env.result);
}

/** Deregister a custom hostname (best-effort; ignore if already gone). */
export async function deleteCustomHostname(cfg: SaasConfig, id: string): Promise<void> {
  await cf(cfg, `/custom_hostnames/${id}`, { method: "DELETE" }).catch(() => undefined);
}

// ── Worker routes, one per custom hostname ───────────────────────────────────
//
// A custom hostname reaching the zone is not enough: Worker routes are matched
// by hostname pattern, and a tenant's domain is not IN our zone, so the worker's
// own `custom_domain` route never matches it. Without a route
// the worker does not run and the request dies at the fallback origin — which is
// an originless record on purpose.
//
// Cloudflare's documented answer is a zone-wide `*/*` route, but this zone hosts
// unrelated apps and `*/*` would swallow every one of them. Excluding them by
// hand is worse: a new app on the zone silently starts serving this one the day
// someone forgets to add an exclusion, and the blast radius is another product.
//
// So we create ONE route per registered hostname and delete it with the domain.
// Nothing on the zone is affected that a tenant did not explicitly bring, the
// route's lifetime is exactly the domain's, and it stays self-serve.
//
// This needs `Workers Routes: Edit` on the token IN ADDITION to
// `SSL and Certificates: Edit` — see DEPLOY.md §11.

interface CfRoute { id: string; pattern?: string; script?: string }

/**
 * Point one hostname at the worker. Returns the route id to store alongside the
 * domain, so removal can be exact rather than a pattern search.
 *
 * `/*` is appended because a Cloudflare route pattern matches a URL, not a host:
 * a bare `app.acme.com` matches only the empty path.
 */
export async function createWorkerRoute(cfg: SaasConfig, hostname: string): Promise<string> {
  const env = await cf<CfRoute>(cfg, "/workers/routes", {
    method: "POST",
    body: JSON.stringify({ pattern: `${hostname}/*`, script: cfg.workerName }),
  });
  if (!env.success || !env.result?.id) {
    throw new Error(env.errors?.[0]?.message ?? "cloudflare worker-route create failed");
  }
  return env.result.id;
}

/** Remove a hostname's worker route (best-effort; ignore if already gone). */
export async function deleteWorkerRoute(cfg: SaasConfig, routeId: string): Promise<void> {
  await cf(cfg, `/workers/routes/${routeId}`, { method: "DELETE" }).catch(() => undefined);
}
