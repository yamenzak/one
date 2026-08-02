/**
 * Cloudflare Turnstile — a config-driven human check on the OTP-send path.
 *
 * The platform admin stores a widget's `turnstile.site_key` (public, handed to
 * the login screen) + `turnstile.secret` (server-only) in app_config. Until a
 * secret is set this is a no-op, so local dev and pre-setup deployments send
 * codes without a challenge.
 *
 * Custom domains: the widget renders on whatever host the app is served on
 * (platform host or a tenant's custom domain). `siteverify` echoes back the
 * hostname the token was solved on; we require it to match the request host —
 * which is always one of ours, since the app only serves on the platform host
 * and routed custom domains. That's what makes the check work on a tenant's own
 * domain, provided the Turnstile widget lists (or allows) that domain.
 */

import type { ConfigSource, HasDb, HasPlatformConfig } from "@4dl/core";
import { getConfig } from "@4dl/core";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileConfig {
  siteKey: string | null;
  /** True once a server secret is configured — i.e. the check is enforced. */
  enabled: boolean;
}

/** Public Turnstile config for the login screen (never leaks the secret). */
export async function turnstileConfig(src: ConfigSource): Promise<TurnstileConfig> {
  const cfg = await getConfig(src).catch(() => ({}) as Record<string, string>);
  return { siteKey: cfg["turnstile.site_key"] || null, enabled: Boolean(cfg["turnstile.secret"]) };
}

export interface TurnstileResult { ok: boolean; hostname?: string }

/**
 * Verify a Turnstile token. Returns `{ ok: true }` when Turnstile isn't
 * configured (disabled) so nothing is blocked before setup. When configured, a
 * missing/failed/host-mismatched token yields `{ ok: false }`.
 */
export async function verifyTurnstile(env: HasDb & HasPlatformConfig, token: string | null, ip: string | undefined, host: string): Promise<TurnstileResult> {
  const cfg = await getConfig(env).catch(() => ({}) as Record<string, string>);
  const secret = cfg["turnstile.secret"];
  if (!secret) return { ok: true }; // disabled → pass
  if (!token) return { ok: false };

  try {
    const form = new FormData();
    form.set("secret", secret);
    form.set("response", token);
    if (ip) form.set("remoteip", ip);
    const res = await fetch(SITEVERIFY, { method: "POST", body: form });
    const data = (await res.json().catch(() => null)) as { success?: boolean; hostname?: string } | null;
    if (!data?.success) return { ok: false };
    // Localhost dev (if a secret were set) and the serving host must match what
    // the token was solved on — the app only serves on our hosts.
    if (data.hostname && host && data.hostname !== host) return { ok: false, hostname: data.hostname };
    return { ok: true, hostname: data.hostname };
  } catch {
    // A siteverify outage must not lock everyone out — fail open on transport
    // errors (the token itself was still Cloudflare-issued to reach us).
    return { ok: true };
  }
}
