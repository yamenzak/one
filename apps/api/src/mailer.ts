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

// Palette lifted from the app tokens (DESIGN.md): near-black canvas, cards one
// tonal step lighter, a nested step again. Separation is TONE, not borders.
const T = {
  bg: "#0b0c0e", card: "#17191c", inset: "#1e2126",
  fg: "#f5f6f7", body: "#b6bbc2", muted: "#767b83", hair: "rgba(255,255,255,0.06)",
} as const;

const EMAIL_FONT = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** A restrained, brand-accented CTA — softly rounded, left-aligned to sit in the
 *  message flow (not a centered candy pill). */
export function emailButton(label: string, href: string, brand: BrandKit = MOSSA_BRAND): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 2px"><tr><td style="border-radius:12px;background:${brand.accent}">
    <a href="${encodeURI(href)}" style="display:inline-block;padding:13px 24px;font-family:${EMAIL_FONT};font-size:15px;font-weight:600;line-height:1;color:${brand.accentFg};text-decoration:none;border-radius:12px">${escapeHtml(label)}</a>
  </td></tr></table>`;
}

/** The tenant-branded wrapper. `heading`/`bodyHtml` are pre-escaped by the
 *  caller; `brand` skins it; `preheader` is the inbox preview line; `eyebrow` is
 *  an optional muted kicker above the heading; `footnote` overrides the small
 *  print. Dark-first, borderless, left-aligned — the app's own surface language
 *  (DESIGN.md), not a generic centered template. */
export function emailShell(
  heading: string,
  bodyHtml: string,
  opts: { brand?: BrandKit; preheader?: string; footnote?: string; eyebrow?: string } = {},
): string {
  const brand = opts.brand ?? MOSSA_BRAND;
  const font = EMAIL_FONT;
  // Wordmark: the tenant's public logo, else the studio name set clean in the
  // foreground — a quiet, confident mark, not a coloured chip.
  const mark = brand.logoUrl
    ? `<img src="${encodeURI(brand.logoUrl)}" alt="${escapeHtml(brand.name)}" height="26" style="height:26px;max-height:26px;width:auto;border:0;display:block">`
    : `<span style="font-size:17px;font-weight:600;letter-spacing:-0.01em;color:${T.fg}">${escapeHtml(brand.name)}</span>`;
  const preheader = opts.preheader ?? heading;
  const isMossa = brand.name === MOSSA_BRAND.name;
  const footnote = opts.footnote ?? (isMossa ? "Mossa · coaching, organized." : `Sent by ${escapeHtml(brand.name)}. Manage notifications in your account settings.`);
  const eyebrow = opts.eyebrow
    ? `<div style="font-size:12px;font-weight:600;letter-spacing:0.01em;color:${brand.accent};margin:0 0 10px">${escapeHtml(opts.eyebrow)}</div>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"></head>
<body style="margin:0;padding:0;background:${T.bg};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${T.bg};font-size:1px;line-height:1px">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${T.bg};padding:40px 16px">
  <tr><td align="center">
    <table role="presentation" width="516" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:516px">
      <tr><td style="padding:2px 6px 20px">${mark}</td></tr>
      <tr><td style="background:${T.card};border-radius:22px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:34px 34px 36px;font-family:${font}">
            ${eyebrow}
            <div style="font-size:21px;line-height:1.35;font-weight:600;letter-spacing:-0.01em;color:${T.fg};margin:0">${heading}</div>
            <div style="font-size:15px;line-height:1.65;color:${T.body};margin:13px 0 0">${bodyHtml}</div>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:18px 8px 0;font-family:${font};font-size:12px;line-height:1.6;color:${T.muted}">
        ${escapeHtml(footnote)}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
