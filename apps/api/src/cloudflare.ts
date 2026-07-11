/**
 * Cloudflare for SaaS (SPEC §14.1) — a thin custom-hostname API client.
 *
 * Tenants bring their own domain (e.g. train.byshujaa.com), CNAME it at our
 * `cname_target`, and we register it as a **custom hostname** on the platform
 * zone. Cloudflare provisions a DV certificate and, once the CNAME + DCV TXT
 * validate, routes the hostname to this worker (the zone's fallback origin).
 *
 * Config lives in admin-editable app_config (like Stripe/Gemini), NOT in a
 * binding, so it's runtime-tunable and never shipped in the bundle:
 *   cf.saas.api_token   — token with `SSL and Certificates: Edit` on the zone
 *   cf.saas.zone_id     — the SaaS-enabled zone id
 *   cf.saas.cname_target — what tenants point their CNAME at (e.g. ssl.mossa.4dl.app)
 */

import { getConfig } from "./billing-store.js";

const API = "https://api.cloudflare.com/client/v4";

export interface SaasConfig {
  apiToken: string;
  zoneId: string;
  cnameTarget: string;
}

/** Read + validate the CF for SaaS config. Returns null when not configured. */
export async function saasConfig(db: D1Database): Promise<SaasConfig | null> {
  const cfg = await getConfig(db);
  const apiToken = cfg["cf.saas.api_token"];
  const zoneId = cfg["cf.saas.zone_id"];
  const cnameTarget = cfg["cf.saas.cname_target"];
  if (!apiToken || !zoneId || !cnameTarget) return null;
  return { apiToken, zoneId, cnameTarget };
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
  verify: VerifyRecord;
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
  // Prefer the SSL DCV TXT record; fall back to ownership verification.
  const dcv = h.ssl?.validation_records?.find((r) => r.txt_name && r.txt_value);
  const verify: VerifyRecord = dcv
    ? { name: dcv.txt_name ?? null, value: dcv.txt_value ?? null }
    : { name: h.ownership_verification?.name ?? null, value: h.ownership_verification?.value ?? null };
  const errors = [
    ...(h.verification_errors ?? []),
    ...((h.ssl?.validation_errors ?? []).map((e) => e.message)),
  ].filter(Boolean);
  return { id: h.id, status: h.status, sslStatus: h.ssl?.status ?? null, verify, errors };
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
