/**
 * "Scan-to-act" call-to-action widgets (§17) — an animated, on-brand card built
 * around the QR encoder: a headline, a supporting line, a themed icon, and the
 * code itself. Presets cover the everyday asks (rate us on Google, share
 * feedback, follow us, connect to Wi-Fi, view the menu, leave a tip); every one
 * follows the widget token system (var(--w-surface/--w-fg/--w-accent)) so it
 * drops onto any brand and looks made-for-it. Pure, so the builder preview and
 * the player paint the same card.
 */

import { type Style, type Config, str, num, bool } from "./types.js";
import { radiusValue, borderCss, shadowValue } from "./render.js";
import { qrSvg } from "./qr.js";

export type CtaPreset = "google" | "feedback" | "follow" | "instagram" | "wifi" | "menu" | "tip" | "custom";

interface PresetSpec { eyebrow: string; headline: string; sub: string; icon: string; hint: string }

/** The default copy + icon per preset. Everything stays overridable in config. */
const PRESETS: Record<CtaPreset, PresetSpec> = {
  google: { eyebrow: "Google Reviews", headline: "Rate us on Google", sub: "Your review makes our day", icon: "stars", hint: "Scan to leave a review" },
  feedback: { eyebrow: "We're listening", headline: "Your opinion matters", sub: "Tell us how we did", icon: "chat", hint: "Scan to share feedback" },
  follow: { eyebrow: "Join us", headline: "Follow us", sub: "Stay in the loop", icon: "heart", hint: "Scan to follow" },
  instagram: { eyebrow: "Instagram", headline: "Follow us on Instagram", sub: "See what's new", icon: "instagram", hint: "Scan to follow" },
  wifi: { eyebrow: "Guest Wi-Fi", headline: "Connect for free", sub: "You're our guest", icon: "wifi", hint: "Scan to join the network" },
  menu: { eyebrow: "Our Menu", headline: "View our menu", sub: "Everything we serve", icon: "menu", hint: "Scan for the full menu" },
  tip: { eyebrow: "Gratuity", headline: "Enjoyed your visit?", sub: "A tip goes a long way", icon: "tip", hint: "Scan to leave a tip" },
  custom: { eyebrow: "Scan", headline: "Scan me", sub: "", icon: "scan", hint: "Scan with your camera" },
};

export const CTA_PRESETS: { id: CtaPreset; label: string }[] = [
  { id: "google", label: "Google review" },
  { id: "feedback", label: "Feedback" },
  { id: "follow", label: "Follow us" },
  { id: "instagram", label: "Instagram" },
  { id: "wifi", label: "Wi-Fi" },
  { id: "menu", label: "Menu" },
  { id: "tip", label: "Leave a tip" },
  { id: "custom", label: "Custom" },
];

export function ctaPreset(config: Config): CtaPreset {
  const p = str(config.preset, "google") as CtaPreset;
  return p in PRESETS ? p : "google";
}

/** The default copy for a preset — used as editor placeholders. */
export function ctaDefaults(preset: string): { eyebrow: string; headline: string; sub: string; hint: string } {
  const p = (preset in PRESETS ? preset : "google") as CtaPreset;
  const s = PRESETS[p];
  return { eyebrow: s.eyebrow, headline: s.headline, sub: s.sub, hint: s.hint };
}

/** The QR payload for a CTA — a Wi-Fi join string for the wifi preset, else the
 *  configured URL/text. */
export function ctaPayload(config: Config): string {
  const preset = ctaPreset(config);
  if (preset === "wifi") {
    const ssid = str(config.wifiSsid).trim();
    if (!ssid) return str(config.url).trim();
    const enc = (s: string) => s.replace(/([\\;,:"])/g, "\\$1");
    const pw = str(config.wifiPassword).trim();
    const auth = pw ? "WPA" : "nopass";
    return `WIFI:T:${auth};S:${enc(ssid)};${pw ? `P:${enc(pw)};` : ""};`;
  }
  return str(config.url, str(config.text, "")).trim();
}

/* ------------------------------- container ------------------------------- */

/** The CTA card frame — an on-brand glass panel by default (token surface,
 *  rounded, a hairline accent edge + layered shadow), overridable via the shared
 *  style keys. The premium look (glow, shimmer, scanner) lives in the body. */
export function ctaContainerCss(style: Style): Record<string, string | number> {
  const accent = str(style.accent, "var(--w-accent, oklch(0.72 0.19 300))");
  const css: Record<string, string | number> = {
    width: "100%", height: "100%", boxSizing: "border-box",
    background: str(style.bg, "var(--w-surface, oklch(0.17 0.02 300 / 0.82))"),
    color: str(style.color, "var(--w-fg, #ffffff)"),
    borderRadius: radiusValue(style, 34),
    opacity: num(style.opacity, 1),
    overflow: "hidden",
    display: "flex", alignItems: "center", justifyContent: "center",
  };
  Object.assign(css, borderCss(style));
  if (!css.borderTop && !css.border) css.border = `1px solid color-mix(in srgb, ${accent} 26%, transparent)`;
  css.boxShadow = shadowValue(style) || `0 30px 70px -24px oklch(0 0 0 / 0.6), inset 0 1px 0 color-mix(in srgb, #fff 12%, transparent)`;
  return css;
}

/* --------------------------------- icons --------------------------------- */

/** The inline-SVG glyph for a preset (used inside the icon chip). */
function ctaGlyph(name: string, color: string): string {
  const s = `stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  const soft = `color-mix(in srgb, ${color} 22%, transparent)`;
  switch (name) {
    case "chat": return `<path d="M4 5.5h16v10H9l-4 3v-3H4z" ${s} fill="${soft}"/><path d="M8 9.5h8M8 12.5h5" ${s}/>`;
    case "heart": return `<path d="M12 20s-7-4.6-7-9.3A3.7 3.7 0 0 1 12 8a3.7 3.7 0 0 1 7 2.7C19 15.4 12 20 12 20z" ${s} fill="${soft}"/>`;
    case "instagram": return `<rect x="4" y="4" width="16" height="16" rx="5" ${s}/><circle cx="12" cy="12" r="3.4" ${s}/><circle cx="16.6" cy="7.4" r="1.1" fill="${color}"/>`;
    case "wifi": return `<path d="M3.5 8.5a13 13 0 0 1 17 0M6.3 11.6a9 9 0 0 1 11.4 0M9 14.7a5 5 0 0 1 6 0" ${s}/><circle cx="12" cy="18.2" r="1.3" fill="${color}"/>`;
    case "menu": return `<path d="M5 6.5h14M5 10.5h14M5 14.5h9" ${s}/><circle cx="17.5" cy="14.5" r="1.2" fill="${color}"/>`;
    case "tip": return `<circle cx="12" cy="12" r="8" ${s}/><path d="M12 8v8M9.8 9.6a2.2 2.2 0 0 1 2.2-1.4c1.3 0 2.2.8 2.2 1.8 0 2.2-4.4 1.6-4.4 3.8 0 1 .9 1.8 2.2 1.8a2.2 2.2 0 0 0 2.2-1.4" ${s}/>`;
    default: return `<rect x="4" y="4" width="7" height="7" rx="1.5" ${s}/><rect x="13" y="4" width="7" height="7" rx="1.5" ${s}/><rect x="4" y="13" width="7" height="7" rx="1.5" ${s}/><path d="M13 13h3v3M20 13v7M16 20h4" ${s}/>`;
  }
}

/* --------------------------------- body ---------------------------------- */

/** The full inner HTML for a CTA node — a layered, premium scan card: accent
 *  glow, a floating icon (or a twinkling star row for Google), an eyebrow +
 *  headline with an accent underline, the QR framed by a corner-bracket scanner
 *  with a sweeping scan line and pulse ring, and a scan hint. Self-contained
 *  keyframes so it animates identically in the builder and the player. */
export function ctaBodyHtml(style: Style, config: Config, h: number): string {
  const preset = ctaPreset(config);
  const spec = PRESETS[preset];
  const fg = str(style.color, "var(--w-fg, #ffffff)");
  const accent = str(style.accent, "var(--w-accent, oklch(0.72 0.19 300))");
  const animate = bool(style.animate, true);
  const eyebrow = escapeHtml(str(config.eyebrow, spec.eyebrow).trim());
  const headline = escapeHtml(str(config.headline, spec.headline).trim() || spec.headline);
  const sub = escapeHtml(str(config.sub, spec.sub).trim());
  const hint = escapeHtml(str(config.hint, spec.hint).trim());
  const payload = ctaPayload(config);

  const pad = Math.round(h * 0.058);
  const gap = Math.round(h * 0.022);
  const ebFs = Math.round(h * 0.03);
  const headFs = Math.round(h * 0.078);
  const subFs = Math.round(h * 0.042);
  const hintFs = Math.round(h * 0.032);
  const chip = Math.round(h * 0.15);
  const glyphS = Math.round(chip * 0.5);
  const starS = Math.round(h * 0.072);
  const qrSize = Math.round(h * 0.42);
  const qrPad = Math.round(qrSize * 0.075);
  const qrRad = Math.round(qrSize * 0.1);
  const bracket = Math.round(qrSize * 0.17);
  const bw = Math.max(3, Math.round(qrSize * 0.02));

  const dark = str(style.qrDark, "#0b0b0f");
  const light = str(style.qrLight, "#ffffff");
  const svg = payload ? qrSvg(payload, { dark, light }) : "";
  // A present-but-unencodable payload (too long for the compact encoder) is a
  // distinct state from an empty one — tell the operator to shorten it.
  const placeholder = payload
    ? "Link too long for a QR code — shorten it."
    : "Add a link in the panel →";
  const qrInner = svg
    ? svg
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#8a8a93;font-size:${Math.round(qrSize * 0.08)}px;text-align:center;padding:8%;font-family:'Hanken Grotesk',system-ui,sans-serif">${placeholder}</div>`;

  const keyframes = animate
    ? `<style>
@keyframes cta-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-${Math.max(4, Math.round(h * 0.014))}px)}}
@keyframes cta-twinkle{0%,100%{opacity:.5;transform:scale(.82)}50%{opacity:1;transform:scale(1.16)}}
@keyframes cta-ring{0%{transform:scale(.94);opacity:.85}70%{transform:scale(1.14);opacity:0}100%{opacity:0}}
@keyframes cta-scan{0%{transform:translateY(0);opacity:0}12%{opacity:.9}50%{transform:translateY(${qrSize - qrPad * 2}px);opacity:.9}88%{opacity:0}100%{transform:translateY(0);opacity:0}}
@keyframes cta-shine{0%{transform:translateX(-140%) rotate(8deg)}100%{transform:translateX(140%) rotate(8deg)}}
@keyframes cta-glow{0%,100%{opacity:.7}50%{opacity:1}}
</style>`
    : "";

  // Layered ambience — a top accent glow and a slow diagonal light sweep.
  const glow = `<div style="position:absolute;inset:0;background:radial-gradient(120% 75% at 50% -12%, color-mix(in srgb, ${accent} 42%, transparent), transparent 68%);${animate ? "animation:cta-glow 4.5s ease-in-out infinite;" : ""}pointer-events:none"></div>`;
  const shine = animate
    ? `<div style="position:absolute;top:0;bottom:0;width:45%;left:-45%;background:linear-gradient(90deg,transparent,color-mix(in srgb, #fff 14%, transparent),transparent);animation:cta-shine 6s ease-in-out 1.5s infinite;pointer-events:none"></div>`
    : "";

  // Icon — a twinkling 5-star row for Google, else a glowing accent chip.
  const iconBlock = spec.icon === "stars"
    ? (() => {
        const gold = "#ffb200";
        const star = "M12 3.2l2.5 5.06 5.58.81-4.04 3.94.95 5.56L12 16.94 7.06 18.57l.95-5.56L3.97 9.07l5.58-.81z";
        const one = (i: number) => `<svg width="${starS}" height="${starS}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="${animate ? `animation:cta-twinkle 1.7s ease-in-out ${i * 0.16}s infinite;` : ""}transform-origin:center;filter:drop-shadow(0 2px 6px color-mix(in srgb, ${gold} 55%, transparent))"><path d="${star}" fill="${gold}"/></svg>`;
        return `<div style="display:flex;gap:${Math.round(starS * 0.12)}px;align-items:center;${animate ? "animation:cta-float 3.8s ease-in-out infinite;" : ""}">${[0, 1, 2, 3, 4].map(one).join("")}</div>`;
      })()
    : `<div style="width:${chip}px;height:${chip}px;border-radius:${Math.round(chip * 0.3)}px;display:flex;align-items:center;justify-content:center;background:linear-gradient(145deg, color-mix(in srgb, ${accent} 82%, transparent), color-mix(in srgb, ${accent} 26%, transparent));border:1px solid color-mix(in srgb, ${accent} 55%, transparent);box-shadow:0 12px 30px -8px color-mix(in srgb, ${accent} 60%, transparent), inset 0 1px 0 color-mix(in srgb, #fff 30%, transparent);${animate ? "animation:cta-float 3.8s ease-in-out infinite;" : ""}"><svg width="${glyphS}" height="${glyphS}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${ctaGlyph(spec.icon, "#ffffff")}</svg></div>`;

  const ebBlock = eyebrow
    ? `<div style="font-size:${ebFs}px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${accent}">${eyebrow}</div>`
    : "";
  const headBlock = `<div style="display:flex;flex-direction:column;align-items:center;gap:${Math.round(h * 0.014)}px">
      <div style="font-weight:800;font-size:${headFs}px;line-height:1.03;letter-spacing:-0.02em">${headline}</div>
      <div style="width:${Math.round(h * 0.09)}px;height:${Math.max(3, Math.round(h * 0.006))}px;border-radius:99px;background:linear-gradient(90deg, ${accent}, color-mix(in srgb, ${accent} 15%, transparent))"></div>
    </div>`;
  const subBlock = sub ? `<div style="font-size:${subFs}px;opacity:.7;line-height:1.2;max-width:88%">${sub}</div>` : "";

  const corners = `
      <div style="position:absolute;left:-${bw * 2}px;top:-${bw * 2}px;width:${bracket}px;height:${bracket}px;border-top:${bw}px solid ${accent};border-left:${bw}px solid ${accent};border-top-left-radius:${Math.round(qrRad * 0.7)}px"></div>
      <div style="position:absolute;right:-${bw * 2}px;top:-${bw * 2}px;width:${bracket}px;height:${bracket}px;border-top:${bw}px solid ${accent};border-right:${bw}px solid ${accent};border-top-right-radius:${Math.round(qrRad * 0.7)}px"></div>
      <div style="position:absolute;left:-${bw * 2}px;bottom:-${bw * 2}px;width:${bracket}px;height:${bracket}px;border-bottom:${bw}px solid ${accent};border-left:${bw}px solid ${accent};border-bottom-left-radius:${Math.round(qrRad * 0.7)}px"></div>
      <div style="position:absolute;right:-${bw * 2}px;bottom:-${bw * 2}px;width:${bracket}px;height:${bracket}px;border-bottom:${bw}px solid ${accent};border-right:${bw}px solid ${accent};border-bottom-right-radius:${Math.round(qrRad * 0.7)}px"></div>`;
  const ring = animate ? `<div style="position:absolute;inset:-${qrPad}px;border-radius:${qrRad + qrPad}px;border:2px solid ${accent};animation:cta-ring 2.6s ease-out infinite;pointer-events:none"></div>` : "";
  const scanLine = animate && svg ? `<div style="position:absolute;left:${qrPad}px;right:${qrPad}px;top:${qrPad}px;height:${Math.max(2, Math.round(qrSize * 0.018))}px;border-radius:99px;background:linear-gradient(90deg,transparent,${accent},transparent);box-shadow:0 0 ${bw * 3}px ${accent};animation:cta-scan 2.6s ease-in-out infinite;pointer-events:none"></div>` : "";
  const qrBlock =
    `<div style="position:relative;display:flex">
       ${ring}
       <div style="position:relative;width:${qrSize}px;height:${qrSize}px;background:${light};border-radius:${qrRad}px;padding:${qrPad}px;box-sizing:border-box;display:flex;box-shadow:0 18px 44px -14px oklch(0 0 0 / 0.6), inset 0 0 0 1px oklch(0 0 0 / 0.05)">
         ${qrInner}
         ${scanLine}
         ${corners}
       </div>
     </div>`;

  const hintBlock = hint
    ? `<div style="display:flex;align-items:center;gap:${Math.round(hintFs * 0.5)}px;font-size:${hintFs}px;opacity:.62;font-weight:600">
         <svg width="${Math.round(hintFs * 1.15)}" height="${Math.round(hintFs * 1.15)}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" stroke="${fg}" stroke-width="1.8" stroke-linecap="round"/></svg>
         ${hint}
       </div>`
    : "";

  return `${keyframes}<div style="position:relative;width:100%;height:100%;overflow:hidden;font-family:'Hanken Grotesk',system-ui,sans-serif;color:${fg}">
    ${glow}${shine}
    <div style="position:relative;z-index:1;width:100%;height:100%;box-sizing:border-box;padding:${pad}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${gap}px;text-align:center">
      ${iconBlock}
      ${ebBlock}
      ${headBlock}
      ${subBlock}
      <div style="height:${Math.round(h * 0.006)}px"></div>
      ${qrBlock}
      ${hintBlock}
    </div>
  </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"));
}
