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

/** Base64 a UTF-8 string (btoa is latin1-only), CRLF-wrapped at 76 cols per MIME. */
function base64Utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return (btoa(bin).match(/.{1,76}/g) ?? []).join("\r\n");
}

/**
 * RFC 5322 message. Multipart when both html + text are present. Bodies are
 * base64-encoded: our HTML is a single very long line with literal `=` and `"`,
 * which is invalid as 7bit (RFC line-length) and mangled if wrongly labelled
 * quoted-printable — either corrupts the markup so clients strip the styling.
 * Base64 (declared as such) is transport-safe and renders the HTML intact.
 */
function buildMime(m: { from: string; to: string; subject: string; html?: string; text?: string }): string {
  const date = new Date().toUTCString();
  const domain = bareAddress(m.from).split("@")[1] ?? "mossa";
  const messageId = `<${crypto.randomUUID()}@${domain}>`;
  const base = [
    `From: ${m.from}`,
    `To: ${m.to}`,
    `Subject: ${encodeHeader(m.subject)}`,
    `Message-ID: ${messageId}`,
    `Date: ${date}`,
    `MIME-Version: 1.0`,
  ];
  const part = (contentType: string, body: string): string[] => [
    `Content-Type: ${contentType}; charset="utf-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    base64Utf8(body),
  ];
  if (m.html && m.text) {
    const boundary = `b_${crypto.randomUUID().replace(/-/g, "")}`;
    return [
      ...base,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      ...part("text/plain", m.text),
      ``,
      `--${boundary}`,
      ...part("text/html", m.html),
      ``,
      `--${boundary}--`,
      ``,
    ].join("\r\n");
  }
  return [...base, ...part("text/html", m.html ?? m.text ?? "")].join("\r\n");
}

/** RFC 2047 encode a header value when it carries non-ASCII (accented brand names). */
function encodeHeader(s: string): string {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]*$/.test(s) ? s : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(s)))}?=`;
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
  fg: "#f2f3f5", body: "#c8cbd0", muted: "#8b9099",
} as const;

const EMAIL_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** A bulletproof, brand-accented pill CTA. */
export function emailButton(label: string, href: string, brand: BrandKit = MOSSA_BRAND): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px auto 4px"><tr><td align="center" style="border-radius:9999px;background:${brand.accent}">
    <a href="${encodeURI(href)}" style="display:inline-block;padding:14px 34px;font-family:${EMAIL_FONT};font-size:15px;font-weight:700;line-height:1;color:${brand.accentFg};text-decoration:none;border-radius:9999px">${escapeHtml(label)}</a>
  </td></tr></table>`;
}

/** The premium, tenant-branded wrapper. `heading`/`bodyHtml` are pre-escaped by
 *  the caller; `brand` skins it; `preheader` is the inbox preview line; `footnote`
 *  overrides the small print under the card. Dark-first to match the app
 *  (DESIGN.md), with a tenant-accent header rule and a wordmark chip. */
export function emailShell(
  heading: string,
  bodyHtml: string,
  opts: { brand?: BrandKit; preheader?: string; footnote?: string } = {},
): string {
  const brand = opts.brand ?? MOSSA_BRAND;
  const font = EMAIL_FONT;
  // Wordmark: the tenant's public logo, else a rounded accent chip carrying the
  // studio name — either way it reads as the tenant's own identity, not Mossa's.
  const mark = brand.logoUrl
    ? `<img src="${encodeURI(brand.logoUrl)}" alt="${escapeHtml(brand.name)}" height="34" style="height:34px;max-height:34px;width:auto;border:0;display:block;margin:0 auto">`
    : `<span style="display:inline-block;padding:9px 18px;border-radius:9999px;background:${brand.accent};font-size:15px;font-weight:800;letter-spacing:0.02em;color:${brand.accentFg}">${escapeHtml(brand.name)}</span>`;
  const preheader = opts.preheader ?? heading;
  const isMossa = brand.name === MOSSA_BRAND.name;
  const footnote = opts.footnote ?? (isMossa ? "Coaching, organized." : `Sent by ${escapeHtml(brand.name)} · manage notifications in your account settings.`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"></head>
<body style="margin:0;padding:0;background:${T.bg};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${T.bg};font-size:1px;line-height:1px">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${T.bg};padding:36px 16px">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
      <tr><td align="center" style="padding:6px 0 24px">${mark}</td></tr>
      <tr><td style="background:${T.card};border:1px solid ${T.border};border-radius:28px;overflow:hidden">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="height:4px;background:${brand.accent};line-height:4px;font-size:4px">&nbsp;</td></tr>
          <tr><td style="padding:38px 38px 42px;font-family:${font}">
            <div style="font-size:23px;line-height:1.28;font-weight:700;color:${T.fg};margin:0 0 12px">${heading}</div>
            <div style="width:36px;height:3px;background:${brand.accent};border-radius:9999px;margin:0 0 18px;line-height:3px;font-size:3px">&nbsp;</div>
            <div style="font-size:15px;line-height:1.65;color:${T.body}">${bodyHtml}</div>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:20px 36px 8px;font-family:${font};font-size:12px;line-height:1.6;color:${T.muted};text-align:center">
        ${escapeHtml(footnote)}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
