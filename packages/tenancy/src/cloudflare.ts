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
import type { ConfigSource } from "@4dl/core";

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
export async function saasConfig(src: ConfigSource, defaultWorkerName = FALLBACK_WORKER_NAME): Promise<SaasConfig | null> {
  const cfg = await getConfig(src);
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
  /** `http` | `txt` — which DCV method this hostname was issued under. A `txt`
   *  hostname predates the switch to `http` and is migrated on the next poll. */
  sslMethod: string | null;
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
    method?: string;
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
  return { id: h.id, status: h.status, sslStatus: h.ssl?.status ?? null, sslMethod: h.ssl?.method ?? null, verify, verifyAll, errors };
}

/**
 * THE VALIDATION METHOD, and why it is `http`.
 *
 * `txt` DCV makes the tenant add three records by hand — two `_acme-challenge`
 * TXTs with opaque values and a `_cf-custom-hostname` ownership TXT — on top of
 * the CNAME. Four records, three of them meaningless to the person typing them,
 * every one a chance to paste the wrong value into the wrong field, and no
 * feedback until a certificate silently fails to issue.
 *
 * `http` DCV needs NONE of them. The CA fetches a token over port 80 at the
 * hostname itself, which already resolves to Cloudflare the moment the CNAME is
 * in place — so pointing the CNAME *is* the proof of control. One record, and
 * the thing the tenant has to do is the thing they already understand.
 *
 * The trade-off is real and it is the reason `txt` is the API default: `http`
 * cannot pre-validate. A hostname already serving live traffic somewhere else
 * can, with `txt`, have its certificate issued BEFORE the cutover, so the
 * switch is instant and there is no window without HTTPS. With `http` the
 * certificate begins issuing after the CNAME moves, and that window exists —
 * usually under a minute, occasionally a few.
 *
 * We take that trade because it does not apply to this product's actual case. A
 * tenant points a NEW subdomain (`coaching.theirgym.com`, `app.theirstudio.de`)
 * at us; there is nothing to cut over and no window to protect. Meanwhile the
 * TXT dance failed for real, repeatedly, for a reason that had nothing to do
 * with the tenant being careless — see dns-check.ts.
 */
const SSL = { method: "http", type: "dv", settings: { min_tls_version: "1.2" } } as const;

/** Register a hostname. With `http` DCV the CNAME is the only record needed. */
export async function createCustomHostname(cfg: SaasConfig, hostname: string): Promise<CustomHostname> {
  const env = await cf<CfHostname>(cfg, "/custom_hostnames", {
    method: "POST",
    body: JSON.stringify({ hostname, ssl: SSL }),
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

/**
 * Move a hostname that is still on `txt` DCV onto `http`, in place.
 *
 * Every domain added before the switch above is parked waiting for TXT records
 * its owner may never manage to publish. Telling them to delete and re-add is
 * asking them to redo the step that already failed, so the migration happens
 * on the next status poll instead — no screen, no instruction, no action.
 *
 * Guarded on `pending`, deliberately. An `active` hostname has a working
 * certificate, and reissuing it to change a validation method it no longer uses
 * risks a live domain to tidy up a field nobody can see.
 */
export async function useHttpValidation(cfg: SaasConfig, id: string): Promise<CustomHostname | null> {
  const env = await cf<CfHostname>(cfg, `/custom_hostnames/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ ssl: SSL }),
  });
  return env.success && env.result ? normalize(env.result) : null;
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
