/**
 * Per-tenant email provider (SPEC §3 notifications).
 *
 * Each tenant either sends through the PLATFORM sender (noreply@kova.4dl.app
 * via Cloudflare Email Service, metered against the tenant's credits — Cloudflare
 * bills $0.35/1k, so a small per-email credit charge keeps margin) or brings their
 * own BREVO key (their sender, their bill, no credits). `off` means inbox-only.
 * Keys never leave the server — the GET returns only whether a key is set.
 */

import type { HasDb, HasEmail, HasEnvironment, HasPlatformConfig } from "@4dl/core";
import { getConfig, isDevLane, parseJson } from "@4dl/core";
import { sendEmail, bareAddress, PLATFORM_FROM_DEFAULT, type SendResult } from "./mailer.js";

export type EmailProvider = "platform" | "brevo" | "off";

export interface TenantEmailConfig {
  provider: EmailProvider;
  brevoApiKey: string;
  senderEmail: string;
  senderName: string;
}

export function resolveEmailConfig(raw: unknown): TenantEmailConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  const provider = r.provider === "brevo" || r.provider === "off" ? r.provider : "platform";
  return {
    provider,
    brevoApiKey: typeof r.brevoApiKey === "string" ? r.brevoApiKey : "",
    senderEmail: typeof r.senderEmail === "string" ? r.senderEmail : "",
    senderName: typeof r.senderName === "string" ? r.senderName : "",
  };
}

/** A Brevo config is usable only with a key + a verified sender address. */
export function emailReady(cfg: TenantEmailConfig): boolean {
  if (cfg.provider === "off") return false;
  if (cfg.provider === "brevo") return cfg.brevoApiKey.trim().length > 0 && cfg.senderEmail.trim().length > 0;
  return true; // platform is always ready (credit-gated at send time)
}

/** Redact the key for the client — expose config minus the secret. */
export function maskEmailConfig(cfg: TenantEmailConfig): { provider: EmailProvider; senderEmail: string; senderName: string; brevoKeySet: boolean; ready: boolean } {
  return { provider: cfg.provider, senderEmail: cfg.senderEmail, senderName: cfg.senderName, brevoKeySet: cfg.brevoApiKey.trim().length > 0, ready: emailReady(cfg) };
}

export async function tenantEmailConfig(db: D1Database, tenantId: string): Promise<TenantEmailConfig> {
  const row = await db.prepare("SELECT email_config_json FROM tenant_settings WHERE tenant_id = ?").bind(tenantId).first<{ email_config_json: string | null }>();
  return resolveEmailConfig(parseJson(row?.email_config_json ?? null, {}));
}

export interface EmailMsg {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  /** Display name for the platform sender (the tenant's brand). */
  brandName?: string;
}

export type EmailSendResult = SendResult & { skipped?: string };

/**
 * What it costs a tenant to send one email on the PLATFORM lane.
 *
 * Injected, and optional, because this package must not depend on billing: an app
 * that does not resell its senders passes nothing and every send is free. Kova
 * binds it to the credit ledger — Cloudflare bills $0.35/1k, so a per-email
 * charge keeps margin. The `refund` half exists because a charged-but-undelivered
 * email must never quietly spend someone's credits.
 */
export interface EmailMeter {
  /** Charge for one send. `false` ⇒ the tenant is short; the send is skipped. */
  charge: (tenantId: string, credits: number) => Promise<boolean>;
  /** Hand it back when the send did not actually go out. Must not throw. */
  refund: (tenantId: string, credits: number) => Promise<void>;
}

/**
 * Send one email through the tenant's configured provider. Platform sends meter
 * credits (skips gracefully when the tenant is out); Brevo sends hit their API.
 *
 * The meter is a PARAMETER, not module state, because unlike the brand it needs
 * per-request bindings to reach the credit authority — a `configure…` call at
 * module load could not supply them, and arming it lazily would make "did anyone
 * remember?" the difference between a metered send and a free one.
 */
export async function sendTenantEmail(
  env: HasDb & HasEmail & HasEnvironment & HasPlatformConfig,
  tenantId: string,
  msg: EmailMsg,
  meter?: EmailMeter | null,
): Promise<EmailSendResult> {
  const cfg = await tenantEmailConfig(env.DB, tenantId);
  if (cfg.provider === "off") return { ok: false, skipped: "provider_off" };

  if (cfg.provider === "brevo") {
    if (!emailReady(cfg)) return { ok: false, skipped: "brevo_unconfigured" };
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": cfg.brevoApiKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender: { email: cfg.senderEmail, name: cfg.senderName || undefined },
          to: [{ email: msg.to }],
          subject: msg.subject,
          htmlContent: msg.html ?? undefined,
          textContent: msg.text ?? undefined,
        }),
      });
      return res.ok ? { ok: true } : { ok: false, error: `brevo ${res.status}` };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  // Platform: meter credits first (no-op charge skips the send when short).
  const conf = await getConfig(env);
  const perEmail = Number(conf["email.credits_per_email"] ?? "1");
  const metered = meter && perEmail > 0 ? meter : null;
  if (metered) {
    const charged = await metered.charge(tenantId, perEmail);
    if (!charged) return { ok: false, skipped: "no_credits" };
  }
  const platformFrom = conf["email.platform_from"] || PLATFORM_FROM_DEFAULT;
  // The From display name. `senderName` used to be honoured on the Brevo lane
  // ONLY, so a studio that set it and left the provider on Kova saw no effect at
  // all — the field silently did nothing for the default configuration. The
  // address still has to be the platform's (it is the domain that is
  // authenticated), but the name is the studio's to choose.
  const displayName = cfg.senderName.trim() || msg.brandName;
  const from = displayName ? `${displayName} <${bareAddress(platformFrom)}>` : platformFrom;
  // `env`, not `env.DB`: `email.provider` may live in the shared platform
  // store, and a bare database cannot see it.
  const result = await sendEmail(env, msg, env.EMAIL, from, isDevLane(env));
  // Refund the metered credit if the send didn't actually go out — a charged-but-
  // failed email should never silently spend a tenant's credits.
  if (metered && !result.ok) {
    await metered.refund(tenantId, perEmail).catch(() => undefined);
  }
  return result;
}
