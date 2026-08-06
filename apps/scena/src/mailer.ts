/**
 * Transactional email (BLUEPRINT §23 delivery, §25 billing notices).
 *
 * One sender for alert delivery, billing notices, and pairing/receipt mail.
 * Provider + credentials live in admin-editable `app_config` (like Stripe), so
 * nothing is hardcoded. Sends via the Resend HTTP API; a `mock` provider logs
 * and reports success so the whole notification path is exercisable in dev
 * without a real key (mirrors the Workers AI mock).
 *
 * ⚠️ STAGE 0 SHIM. This module is Scena's own and is replaced by `@4dl/email`
 * in Stage 6 (docs/SCENA-REWRITE.md). `PLATFORM_FROM_DEFAULT` is declared here
 * ahead of that move because the sender is the one thing that cannot wait: the
 * fallback read `noreply@scena.local`, and a sending domain is onboarded in
 * Cloudflare per DOMAIN, by hand, once — so anything but the platform's single
 * verified address bounces in production and looks like any other failure.
 * `scripts/sender-default.test.mjs` is what noticed, and it is right to.
 */

import { getConfig } from "./billing-store.js";
import { PLATFORM_FROM_DEFAULT } from "./billing-seed.js";
import type { SendEmailBinding } from "./env.js";

/** Re-exported so readers find it where every other app keeps it. It is DEFINED
 *  in `billing-seed.ts`, which is a leaf — see the note there for the cycle. */
export { PLATFORM_FROM_DEFAULT } from "./billing-seed.js";

export interface EmailConfig {
  provider: string; // disabled | mock | resend | cloudflare
  apiKey: string;
  from: string;
  admin: string; // where system/billing notices go
}

export async function emailConfig(db: D1Database): Promise<EmailConfig> {
  const cfg = await getConfig(db);
  return {
    provider: cfg["email.provider"] ?? "disabled",
    apiKey: cfg["email.api_key"] ?? "",
    from: cfg["email.from"] ?? PLATFORM_FROM_DEFAULT,
    admin: cfg["email.admin"] ?? "",
  };
}

export interface SendResult {
  ok: boolean;
  mocked?: boolean;
  skipped?: boolean;
  id?: string;
  error?: string;
}

/** Just the bare-email address out of a `Name <addr>` header (Cloudflare's
 *  send binding wants the address, not the display-name form). */
function bareAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m?.[1] ?? from).trim();
}

/**
 * Send an email. Returns `{skipped}` when disabled, `{mocked}` in mock mode,
 * or the provider result. Never throws — delivery is best-effort so it can't
 * break the flow that triggered it (an alert, a webhook, an OTP, a sweep).
 *
 * `email` is the Cloudflare Email Sending binding (`env.EMAIL`); pass it when
 * the provider is `cloudflare`. Without it, a `cloudflare` provider degrades to
 * the dev mock so local runs and unconfigured accounts never hard-fail (which,
 * on the OTP path, would lock owners out).
 */
export async function sendEmail(
  db: D1Database,
  msg: { to: string; subject: string; html: string; text?: string },
  email?: SendEmailBinding,
): Promise<SendResult> {
  const cfg = await emailConfig(db);
  if (!msg.to) return { ok: false, skipped: true };
  if (cfg.provider === "disabled") return { ok: false, skipped: true };

  // Cloudflare Email Sending: native SPF/DKIM/DMARC, no API key. The sender
  // domain must be onboarded (Cloudflare → Email → Email Sending).
  if (cfg.provider === "cloudflare") {
    if (!email) {
      console.info("[scena] email (cloudflare binding missing → mock)", { to: msg.to, subject: msg.subject });
      return { ok: true, mocked: true };
    }
    try {
      const r = await email.send({ to: msg.to, from: bareAddress(cfg.from), subject: msg.subject, html: msg.html, text: msg.text });
      return { ok: true, id: (r && "messageId" in r ? r.messageId : undefined) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "cloudflare send failed" };
    }
  }

  if (cfg.provider === "mock" || !cfg.apiKey) {
    console.info("[scena] email (mock)", { to: msg.to, subject: msg.subject });
    return { ok: true, mocked: true };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: cfg.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { ok: false, error: body.message ?? `resend ${res.status}` };
    return { ok: true, id: body.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

/** Send to the operator/admin address (billing + system notices). */
export async function notifyAdmin(
  db: D1Database,
  operatorEmail: string | undefined,
  msg: { subject: string; html: string },
  email?: SendEmailBinding,
): Promise<SendResult> {
  const cfg = await emailConfig(db);
  const to = cfg.admin || operatorEmail || "";
  return sendEmail(db, { to, ...msg }, email);
}

/** A minimal branded HTML wrapper for a transactional email. */
export function emailShell(heading: string, bodyHtml: string): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1523">
    <div style="font-size:20px;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px">Scena</div>
    <div style="height:3px;width:44px;background:oklch(0.58 0.17 300);border-radius:2px;margin-bottom:20px"></div>
    <div style="font-size:17px;font-weight:700;margin-bottom:10px">${heading}</div>
    <div style="font-size:14px;line-height:1.55;color:#4a4458">${bodyHtml}</div>
    <div style="margin-top:24px;font-size:12px;color:#8a8494">Scena digital signage</div>
  </div>`;
}
