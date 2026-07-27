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

/**
 * Can this deployment actually deliver an email right now?
 *
 * Callers that must not "succeed" silently — above all the OTP send path, where
 * the emailed code is the ONLY authentication factor — pre-flight this instead of
 * relying on `sendEmail`'s return value. The reason is specific and was proved by
 * probing the running worker: Better Auth invokes `sendVerificationOTP` through
 * `runInBackgroundOrAwait`, whose body is `try { await promise } catch { logger.error }`
 * — it swallows the throw and still returns `200 {"success":true}`. So a failure
 * raised from inside that callback can never reach the client, and the login UI
 * advances to the code-entry screen for a code that was never sent. Checking
 * BEFORE handing off to Better Auth is the only way to return a real error.
 */
export async function emailDeliverable(
  db: D1Database,
  binding?: SendEmailBinding,
  isDev = false,
): Promise<{ ok: true } | { ok: false; provider: string; reason: string }> {
  const cfg = await getEmailConfig(db);
  if (cfg.provider === "disabled") {
    return { ok: false, provider: cfg.provider, reason: "email delivery is switched off for this deployment" };
  }
  if (cfg.provider === "cloudflare") {
    return binding
      ? { ok: true }
      : { ok: false, provider: cfg.provider, reason: "the Email Sending binding is not available on this worker" };
  }
  // `mock` only delivers (to the console) on the dev lane; in production it is a
  // fail-closed placeholder meaning "nobody configured a real provider yet".
  if (isDev) return { ok: true };
  return {
    ok: false,
    provider: cfg.provider,
    reason: "no email provider is configured — set email.provider to `cloudflare` (see DEPLOY.md)",
  };
}

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
  opts: { brand?: BrandKit; preheader?: string; footnote?: string; eyebrow?: string; manageUrl?: string } = {},
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
  // The footer told people to "manage notifications in your account settings"
  // and gave them no way to get there — a dead instruction in every email, and
  // the one thing a recipient reaches for when they want fewer of them. When the
  // caller knows the app's origin it becomes a real link.
  const footnote = opts.footnote ?? (isMossa ? "Mossa · coaching, organized." : `Sent by ${escapeHtml(brand.name)}.`);
  const manage = opts.manageUrl
    ? `<a href="${encodeURI(opts.manageUrl)}" style="color:${T.muted};text-decoration:underline">Manage notifications</a>`
    : "";
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
      <tr><td style="padding:16px 8px 0">
        <div style="height:1px;line-height:1px;font-size:0;background:${T.hair}">&nbsp;</div>
      </td></tr>
      <tr><td style="padding:14px 8px 0;font-family:${font};font-size:12px;line-height:1.6;color:${T.muted}">
        ${escapeHtml(footnote)}${manage ? ` ${manage}` : ""}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// ── Data-viz primitives for digests (email-safe) ─────────────────────────────
// Email clients are hostile to modern CSS and Gmail strips inline SVG, so these
// degrade gracefully: table/div bars render everywhere and carry the number in
// text; the SVG sparkline/ring are progressive enhancement layered ABOVE a text
// value, so a client that drops the SVG still shows the number. All inline, no
// external assets, no flex/grid for anything load-bearing.

/** Semantic status colors for at-a-glance coding, independent of brand accent. */
export const EMAIL_TONE = { good: "#7fd6a2", warn: "#f2c56b", bad: "#f28b82", neutral: "#8a9099" } as const;
export type EmailTone = keyof typeof EMAIL_TONE;

const clamp01 = (n: number) => (Number.isFinite(n) ? (n < 0 ? 0 : n > 1 ? 1 : n) : 0);
const brandAccent = (brand?: BrandKit) => brand?.accent ?? MOSSA_BRAND.accent;
const toneOrAccent = (opts: { brand?: BrandKit; tone?: EmailTone }) =>
  opts.tone ? EMAIL_TONE[opts.tone] : brandAccent(opts.brand);

/** A muted section label above a chart/block — the digest's connective tissue. */
export function emailKicker(text: string): string {
  return `<div style="font-family:${EMAIL_FONT};font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${T.muted};margin:0 0 12px">${escapeHtml(text)}</div>`;
}

/** A rounded inset block that groups a titled chart + caption, matching the
 *  app's nested-surface language. `title` optional; `inner` is pre-built HTML. */
export function emailPanel(inner: string, opts: { title?: string } = {}): string {
  const title = opts.title
    ? `<div style="font-family:${EMAIL_FONT};font-size:14px;font-weight:600;color:${T.fg};margin:0 0 14px">${escapeHtml(opts.title)}</div>`
    : "";
  return `<div style="background:${T.inset};border-radius:16px;padding:18px 18px 16px;margin:14px 0 0">${title}${inner}</div>`;
}

/** A single labelled horizontal progress bar: label + value on top, a track/fill
 *  below. `pct` is 0..1; `tone` colours the fill (else the brand accent). */
export function emailBar(
  label: string,
  valueText: string,
  pct: number,
  opts: { brand?: BrandKit; tone?: EmailTone } = {},
): string {
  const fill = toneOrAccent(opts);
  const w = Math.round(clamp01(pct) * 100);
  return `<div style="margin:0 0 13px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px"><tr>
      <td style="font-family:${EMAIL_FONT};font-size:13px;line-height:1.3;color:${T.body}">${escapeHtml(label)}</td>
      <td align="right" style="font-family:${EMAIL_FONT};font-size:13px;line-height:1.3;font-weight:600;color:${T.fg}">${escapeHtml(valueText)}</td>
    </tr></table>
    <div style="background:${T.card};border-radius:99px;height:8px;font-size:0;line-height:0">
      <div style="width:${w}%;height:8px;background:${fill};border-radius:99px;font-size:0;line-height:0">&nbsp;</div>
    </div>
  </div>`;
}

/** A weekly mini-histogram: one vertical bar per point (label under), bottom
 *  aligned, tone-coloured. Table-based → renders in every client. */
export function emailBars(
  points: { label: string; value: number; tone?: EmailTone }[],
  opts: { brand?: BrandKit; height?: number } = {},
): string {
  if (!points.length) return "";
  const H = opts.height ?? 52;
  const max = Math.max(1, ...points.map((p) => (Number.isFinite(p.value) ? p.value : 0)));
  const bar = (p: { label: string; value: number; tone?: EmailTone }) => {
    const h = Math.max(3, Math.round(clamp01(p.value / max) * H));
    const fill = p.tone ? EMAIL_TONE[p.tone] : brandAccent(opts.brand);
    return `<td valign="bottom" align="center" height="${H}" style="height:${H}px;padding:0 3px">
      <div style="width:100%;max-width:26px;height:${h}px;background:${fill};border-radius:5px 5px 2px 2px;font-size:0;line-height:0;margin:0 auto">&nbsp;</div>
    </td>`;
  };
  const lbl = (p: { label: string }) =>
    `<td align="center" style="padding:7px 3px 0;font-family:${EMAIL_FONT};font-size:10px;color:${T.muted}">${escapeHtml(p.label)}</td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>${points.map(bar).join("")}</tr>
    <tr>${points.map(lbl).join("")}</tr>
  </table>`;
}

/** An inline-SVG area sparkline for a trend series (weight, active clients …).
 *  Progressive enhancement: pair it with a text delta so Gmail (strips SVG)
 *  still conveys the trend. Aspect ratio preserved so the end-dot stays round. */
export function emailSparkline(values: number[], opts: { brand?: BrandKit; tone?: EmailTone } = {}): string {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length < 2) return "";
  const n = nums.length;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const W = 320;
  const Hh = 60;
  const pad = 6;
  const pts = nums.map((v, i) => {
    const x = pad + (i / (n - 1)) * (W - 2 * pad);
    const y = pad + (1 - (v - min) / span) * (Hh - 2 * pad);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const first = pts[0]!;
  const last = pts[n - 1]!;
  const area = `${line} L${last[0].toFixed(1)} ${(Hh - pad).toFixed(1)} L${first[0].toFixed(1)} ${(Hh - pad).toFixed(1)} Z`;
  const c = toneOrAccent(opts);
  return `<svg width="100%" height="auto" viewBox="0 0 ${W} ${Hh}" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:auto">
    <path d="${area}" fill="${c}" fill-opacity="0.13"></path>
    <path d="${line}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5" fill="${c}"></circle>
  </svg>`;
}

/** An inline-SVG progress ring with a centred number. Pair with a caption below
 *  (emailPanel title / a value line) so an SVG-stripping client still reads it. */
export function emailRing(
  pct: number,
  centerText: string,
  opts: { brand?: BrandKit; tone?: EmailTone; sub?: string } = {},
): string {
  const p = clamp01(pct);
  const size = 104;
  const sw = 11;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - p);
  const c = toneOrAccent(opts);
  const sub = opts.sub
    ? `<text x="${size / 2}" y="${size / 2 + 17}" text-anchor="middle" font-family="${EMAIL_FONT}" font-size="10" fill="${T.muted}">${escapeHtml(opts.sub)}</text>`
    : "";
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" style="display:block">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${T.card}" stroke-width="${sw}"></circle>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${c}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"></circle>
    <text x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="central" font-family="${EMAIL_FONT}" font-size="26" font-weight="600" fill="${T.fg}">${escapeHtml(centerText)}</text>
    ${sub}
  </svg>`;
}

/** One stat cell (value + label, optional coloured delta) for a stat row. */
export interface EmailStat {
  value: string;
  label: string;
  delta?: string;
  deltaTone?: EmailTone;
}

/** A row of 2–4 stat cells, evenly split, each in a rounded inset. The digest's
 *  headline ledger — big numbers, muted labels, tone-coded deltas. */
export function emailStatRow(stats: EmailStat[]): string {
  if (!stats.length) return "";
  const w = Math.floor(100 / stats.length);
  const cell = (s: EmailStat) => {
    const delta = s.delta
      ? `<div style="font-family:${EMAIL_FONT};font-size:11px;font-weight:600;color:${s.deltaTone ? EMAIL_TONE[s.deltaTone] : T.muted};margin:4px 0 0">${escapeHtml(s.delta)}</div>`
      : "";
    return `<td width="${w}%" valign="top" style="padding:3px">
      <div style="background:${T.inset};border-radius:14px;padding:15px 14px;text-align:center">
        <div style="font-family:${EMAIL_FONT};font-size:24px;font-weight:600;letter-spacing:-0.02em;color:${T.fg};line-height:1.1">${escapeHtml(s.value)}</div>
        <div style="font-family:${EMAIL_FONT};font-size:11px;color:${T.muted};margin:6px 0 0;line-height:1.3">${escapeHtml(s.label)}</div>
        ${delta}
      </div>
    </td>`;
  };
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:2px -3px"><tr>${stats.map(cell).join("")}</tr></table>`;
}

/** A hairline divider between digest sections. */
export function emailDivider(): string {
  return `<div style="height:1px;background:${T.hair};margin:24px 0;font-size:0;line-height:0">&nbsp;</div>`;
}

/** A compact labelled list row (name on the left, value on the right) — for
 *  "top movers", attention breakdowns, per-client lines. `accentValue` colours
 *  the right value with the brand accent. */
export function emailListRow(label: string, value: string, opts: { brand?: BrandKit; tone?: EmailTone; sub?: string } = {}): string {
  const color = opts.tone ? EMAIL_TONE[opts.tone] : opts.brand ? brandAccent(opts.brand) : T.fg;
  const sub = opts.sub ? `<div style="font-family:${EMAIL_FONT};font-size:11px;color:${T.muted};margin:2px 0 0">${escapeHtml(opts.sub)}</div>` : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px"><tr>
    <td style="font-family:${EMAIL_FONT};font-size:14px;color:${T.body}">${escapeHtml(label)}${sub}</td>
    <td align="right" valign="top" style="font-family:${EMAIL_FONT};font-size:14px;font-weight:600;color:${color};white-space:nowrap;padding-left:12px">${escapeHtml(value)}</td>
  </tr></table>`;
}
