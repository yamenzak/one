/**
 * Per-tenant email provider (SPEC §3 notifications).
 *
 * Each tenant either sends through the PLATFORM sender (noreply@fourdegreelabs.com
 * via Cloudflare Email Service, metered against the tenant's credits — Cloudflare
 * bills $0.35/1k, so a small per-email credit charge keeps margin) or brings their
 * own BREVO key (their sender, their bill, no credits). `off` means inbox-only.
 * Keys never leave the server — the GET returns only whether a key is set.
 */

import type { Env } from "./env.js";
import { sendEmail, bareAddress, type SendResult } from "./mailer.js";
import { getConfig } from "./billing-store.js";
import { parseJson } from "./db.js";

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
 * Send one email through the tenant's configured provider. Platform sends meter
 * credits (skips gracefully when the tenant is out); Brevo sends hit their API.
 */
export async function sendTenantEmail(env: Env, tenantId: string, msg: EmailMsg): Promise<EmailSendResult> {
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
  const conf = await getConfig(env.DB);
  const perEmail = Number(conf["email.credits_per_email"] ?? "1");
  const dobj = perEmail > 0 ? env.BILLING.get(env.BILLING.idFromName(tenantId)) : null;
  if (dobj) {
    await dobj.bind(tenantId);
    const charged = await dobj.charge(perEmail, "email.send", tenantId);
    if (!charged.ok) return { ok: false, skipped: "no_credits" };
  }
  const platformFrom = conf["email.platform_from"] || "Mossa <noreply@fourdegreelabs.com>";
  const from = msg.brandName ? `${msg.brandName} <${bareAddress(platformFrom)}>` : platformFrom;
  const result = await sendEmail(env.DB, msg, env.EMAIL, from, env.ENVIRONMENT === "development");
  // Refund the metered credit if the send didn't actually go out — a charged-but-
  // failed email should never silently spend a tenant's credits.
  if (dobj && !result.ok) {
    await dobj.topUp(perEmail, "email.refund", tenantId).catch(() => undefined);
  }
  return result;
}
