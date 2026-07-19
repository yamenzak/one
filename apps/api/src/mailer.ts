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
  isDev = false,
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
  // Mock: DEV ONLY. It logs the message body (incl. sign-in OTPs) so devs can
  // read the code from `wrangler dev`. In production this must fail closed — a
  // deploy left on `mock` must not (a) write the sole auth factor to retained
  // Workers logs or (b) silently "succeed" without delivering. Surface it.
  if (!isDev) return { ok: false, error: "mock email provider is disabled outside development — configure a real provider" };
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

// ── Branded email system ─────────────────────────────────────────────────────
// Dark-first to match the app (DESIGN.md: near-black canvas, one-step-lighter
// cards, very round corners, one tonal primary). Table-based + fully inline so
// it renders consistently across Gmail / Apple Mail / Outlook. Every surface is
// the tenant's: accent, logo (or wordmark), and name — a real white-label.

export interface BrandKit {
  /** Studio name — the wordmark + footer identity. */
  name: string;
  /** Primary accent (CTA background, wordmark). A tenant's `branding.primary`. */
  accent: string;
  /** Readable text ON the accent (CTA label). A tenant's `branding.primaryForeground`. */
  accentFg: string;
  /** A PUBLIC absolute logo URL, or null → fall back to the wordmark. */
  logoUrl: string | null;
}

/** Mossa's own identity — platform emails (sign-in codes, receipts). */
export const MOSSA_BRAND: BrandKit = { name: "Mossa", accent: "#a8c7fa", accentFg: "#0b1220", logoUrl: null };

/** Whitelist a CSS color before it lands in an inline `style` (tenant-supplied —
 *  must not be able to inject `;`/`}`/quotes/`url(`). Falls back when unsafe. */
export function safeColor(value: string | null | undefined, fallback: string): string {
  const v = (value ?? "").trim();
  const ok =
    /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ||
    /^(?:rgb|rgba|hsl|hsla|oklch|oklab|color)\([0-9a-z%.,/\s-]+\)$/i.test(v) ||
    /^[a-z]+$/i.test(v);
  return ok ? v : fallback;
}

const T = {
  bg: "#0b0c0e", card: "#16181b", inset: "#1e2126", border: "#23262c",
  fg: "#e8eaed", body: "#c8cbd0", muted: "#8b9099",
} as const;

/** A bulletproof, brand-accented pill CTA. */
export function emailButton(label: string, href: string, brand: BrandKit = MOSSA_BRAND): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px auto 6px"><tr><td align="center" style="border-radius:9999px;background:${brand.accent}">
    <a href="${encodeURI(href)}" style="display:inline-block;padding:13px 30px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;line-height:1;color:${brand.accentFg};text-decoration:none;border-radius:9999px">${escapeHtml(label)}</a>
  </td></tr></table>`;
}

/** The premium, tenant-branded wrapper. `heading`/`bodyHtml` are pre-escaped by
 *  the caller; `brand` skins it; `preheader` is the inbox preview line. */
export function emailShell(
  heading: string,
  bodyHtml: string,
  opts: { brand?: BrandKit; preheader?: string } = {},
): string {
  const brand = opts.brand ?? MOSSA_BRAND;
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const mark = brand.logoUrl
    ? `<img src="${encodeURI(brand.logoUrl)}" alt="${escapeHtml(brand.name)}" height="30" style="height:30px;max-height:30px;width:auto;border:0;display:block;margin:0 auto">`
    : `<span style="font-size:16px;font-weight:800;letter-spacing:0.04em;color:${brand.accent}">${escapeHtml(brand.name)}</span>`;
  const preheader = opts.preheader ?? heading;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"></head>
<body style="margin:0;padding:0;background:${T.bg};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${T.bg};font-size:1px;line-height:1px">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${T.bg};padding:32px 16px">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
      <tr><td align="center" style="padding:8px 0 22px">${mark}</td></tr>
      <tr><td style="background:${T.card};border:1px solid ${T.border};border-radius:28px;padding:40px 36px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-family:${font}">
          <div style="font-size:22px;line-height:1.25;font-weight:700;color:${T.fg};margin:0 0 14px">${heading}</div>
          <div style="font-size:15px;line-height:1.65;color:${T.body}">${bodyHtml}</div>
        </td></tr></table>
      </td></tr>
      <tr><td style="padding:22px 36px 8px;font-family:${font};font-size:12px;line-height:1.6;color:${T.muted};text-align:center">
        ${escapeHtml(brand.name)}${brand.name === MOSSA_BRAND.name ? " — coaching, organized." : ""}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
