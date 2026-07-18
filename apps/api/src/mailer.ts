/**
 * Transactional email (SPEC §3) — OTP codes, invites, notices.
 *
 * Provider lives in admin-editable `app_config` (`email.provider`:
 * disabled | mock | cloudflare). `mock` logs and reports success so the whole
 * auth/notification path is exercisable in dev with zero setup; `cloudflare`
 * sends via the Email Sending binding (SPF/DKIM native once the sender domain
 * is onboarded). Defaults to mock so passwordless auth never dead-ends in dev.
 */

import type { SendEmailBinding } from "./env.js";

export interface SendResult {
  ok: boolean;
  mocked?: boolean;
  error?: string;
}

async function getEmailConfig(db: D1Database): Promise<{ provider: string; from: string }> {
  try {
    const rows = await db
      .prepare("SELECT key, value FROM app_config WHERE key IN ('email.provider','email.from')")
      .all<{ key: string; value: string }>();
    const cfg = Object.fromEntries((rows.results ?? []).map((r) => [r.key, r.value]));
    return {
      provider: cfg["email.provider"] ?? "mock",
      from: cfg["email.from"] ?? "Mossa <noreply@mossa.local>",
    };
  } catch {
    return { provider: "mock", from: "Mossa <noreply@mossa.local>" };
  }
}

const bareAddress = (from: string): string => {
  const m = from.match(/<([^>]+)>/);
  return m?.[1] ?? from;
};

export { bareAddress };

export async function sendEmail(
  db: D1Database,
  msg: { to: string; subject: string; html?: string; text?: string },
  binding?: SendEmailBinding,
  fromOverride?: string,
): Promise<SendResult> {
  const cfg = await getEmailConfig(db);
  const from = fromOverride || cfg.from;
  if (cfg.provider === "disabled") return { ok: false, error: "email disabled" };
  if (cfg.provider === "cloudflare" && binding) {
    try {
      // Cloudflare's send_email binding takes an EmailMessage with a raw MIME
      // body — NOT a plain object. Build proper MIME and send that.
      const { EmailMessage } = await import("cloudflare:email");
      const raw = buildMime({ from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
      await binding.send(new EmailMessage(bareAddress(from), msg.to, raw));
      return { ok: true };
    } catch (err) {
      console.warn("email send failed", err);
      return { ok: false, error: String(err) };
    }
  }
  // Mock: log so devs can read the OTP from `wrangler dev` output.
  console.log(`[mail:mock] to=${msg.to} subject="${msg.subject}" text="${msg.text ?? ""}"`);
  return { ok: true, mocked: true };
}

/** RFC 5322 message. Multipart when both html + text are present. */
function buildMime(m: { from: string; to: string; subject: string; html?: string; text?: string }): string {
  const date = new Date().toUTCString();
  const domain = bareAddress(m.from).split("@")[1] ?? "mossa";
  const messageId = `<${crypto.randomUUID()}@${domain}>`;
  const base = [
    `From: ${m.from}`,
    `To: ${m.to}`,
    `Subject: ${m.subject}`,
    `Message-ID: ${messageId}`,
    `Date: ${date}`,
    `MIME-Version: 1.0`,
  ];
  if (m.html && m.text) {
    const boundary = `b_${crypto.randomUUID().replace(/-/g, "")}`;
    return [
      ...base,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset="utf-8"`,
      `Content-Transfer-Encoding: quoted-printable`,
      ``,
      m.text,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset="utf-8"`,
      `Content-Transfer-Encoding: quoted-printable`,
      ``,
      m.html,
      ``,
      `--${boundary}--`,
      ``,
    ].join("\r\n");
  }
  return [...base, `Content-Type: text/html; charset="utf-8"`, ``, m.html ?? m.text ?? ""].join("\r\n");
}

/** Escape user-supplied text before interpolating it into email HTML — check-in
 *  notes, trainer feedback, brand names etc. are attacker-influenced. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

export function emailShell(heading: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#0b0c0e;padding:32px 16px;font-family:ui-sans-serif,system-ui,sans-serif">
  <div style="max-width:480px;margin:0 auto;background:#16181b;border-radius:24px;padding:32px;color:#e8eaed">
    <div style="font-size:20px;font-weight:700;margin-bottom:12px">${heading}</div>
    <div style="font-size:15px;line-height:1.6;color:#c8cbd0">${bodyHtml}</div>
    <div style="margin-top:24px;font-size:12px;color:#9aa0a6">Mossa — coaching, organized.</div>
  </div></body></html>`;
}
