/**
 * Per-tenant PWA manifest (SPEC §14.1 white-label). On a tenant's custom domain
 * the installed app wears their name + icon + colors; on the neutral platform
 * host it's Kova. Served dynamically by the worker (see index.ts) so a branding
 * change re-skins the installed app without a rebuild.
 *
 * Icons reference the tenant's uploaded square mark (public brand asset); we
 * don't rasterize sizes server-side — one image is declared at the install
 * sizes and the browser scales it.
 */

import type { HostTenant } from "./host-context.js";

const DEFAULT_BG = "#0b0c0e";

/** Parse an `oklch(L C H)` token (L may be a %) to a #rrggbb hex. Null on miss
 *  so the caller can fall back to a default. */
function oklchToHex(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = /oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/i.exec(input);
  if (!m) return input.startsWith("#") ? input : null;
  let L = parseFloat(m[1]!);
  if (m[1]!.endsWith("%")) L /= 100;
  const C = parseFloat(m[2]!), H = parseFloat(m[3]!);
  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr), b = C * Math.sin(hr);
  const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  const hex = lin
    .map((c) => {
      const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
      return Math.min(255, Math.max(0, Math.round(v * 255))).toString(16).padStart(2, "0");
    })
    .join("");
  return `#${hex}`;
}

/** MIME type for an icon URL from its extension (brand assets keep their ext). */
function iconType(url: string): string {
  if (/\.svg(\?|$)/i.test(url)) return "image/svg+xml";
  if (/\.png(\?|$)/i.test(url)) return "image/png";
  if (/\.(jpe?g)(\?|$)/i.test(url)) return "image/jpeg";
  if (/\.webp(\?|$)/i.test(url)) return "image/webp";
  return "image/png";
}

export function buildManifest(ht: HostTenant | null): string {
  const name = (ht?.name || "Kova").slice(0, 45);
  const b = ht?.branding;
  /*
    A LAUNCHER IS NOT A DARK SURFACE.

    This read used to be `b?.iconUrl || b?.logoUrl` — the DARK-mode mark,
    unconditionally, declared `maskable` on top. Chrome builds an Android
    adaptive icon by compositing the maskable entry onto a WHITE background
    layer, so a studio whose mark is bare letterforms (plate `none`, the
    generator's own option) shipped pale-on-transparent ink onto white: an
    installed app whose home-screen icon is an empty white circle. Observed in
    production 2026-08, on byShujaa's phone, at the exact moment a customer
    installs the app and decides what it is.

    Three renditions, in the order they are correct:

      installIconUrl  purpose-built — opaque, full bleed, letters inside the
                      maskable safe zone. The only one that may claim
                      `maskable`.
      iconUrlLight    the LIGHT-mode mark: dark ink, which at least reads on
                      the white fill. Declared `any` only.
      iconUrl         the dark mark, last, because it is the one that fails.

    `apps/app/src/brand-mark.conformance.test.ts` bans exactly this mistake in
    the app and could not see it here — the file is server-side. It now walks
    `apps/api/src` too.
  */
  const install = b?.installIconUrl || null;
  const icon = install || b?.iconUrlLight || b?.iconUrl || b?.logoUrl || null;
  const type = icon ? iconType(icon) : "image/svg+xml";
  const theme = oklchToHex(b?.tokens?.dark?.["--primary"]) || oklchToHex(b?.primary) || DEFAULT_BG;
  const background = oklchToHex(b?.tokens?.dark?.["--background"]) || DEFAULT_BG;

  // No tenant mark → advertise the platform PNG icons (iOS/Android need a real
  // raster; SVG alone leaves the low-fidelity screenshot tile) plus a maskable
  // entry for Android adaptive launchers. A tenant mark is a square upload:
  // declare it at the two install sizes (192/512) so iOS/Android get a real
  // raster tile, plus a maskable 512 for Android adaptive launchers.
  const icons = !icon
    ? [
        { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ]
    : [
        { src: icon, sizes: "192x192", type, purpose: "any" },
        { src: icon, sizes: "512x512", type, purpose: "any" },
        // `maskable` is a PROMISE about the pixels — full bleed, opaque, content
        // inside the inner 80% — and only the purpose-built rendition keeps it.
        // A studio's own upload or a bare generated mark is declared `any` and
        // left to the launcher's legacy path, which insets it on a plate rather
        // than cropping into transparency.
        ...(install ? [{ src: install, sizes: "512x512", type: iconType(install), purpose: "maskable" }] : []),
      ];

  return JSON.stringify({
    name,
    short_name: name.slice(0, 12),
    description: ht ? `${name} — your coaching app.` : "Coaching, organized — train, eat, log, progress.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: background,
    theme_color: theme,
    icons,
  });
}
