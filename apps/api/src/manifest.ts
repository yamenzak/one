/**
 * Per-tenant PWA manifest (SPEC §14.1 white-label). On a tenant's custom domain
 * the installed app wears their name + icon + colors; on the neutral platform
 * host it's Mossa. Served dynamically by the worker (see index.ts) so a branding
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
  const name = (ht?.name || "Mossa").slice(0, 45);
  const b = ht?.branding;
  const icon = b?.iconUrl || b?.logoUrl || "/icon.svg";
  const type = iconType(icon);
  const theme = oklchToHex(b?.tokens?.dark?.["--primary"]) || oklchToHex(b?.primary) || DEFAULT_BG;
  const background = oklchToHex(b?.tokens?.dark?.["--background"]) || DEFAULT_BG;

  // SVG scales to any size; a raster mark is declared at the two install sizes.
  const icons =
    type === "image/svg+xml"
      ? [{ src: icon, sizes: "any", type, purpose: "any" }]
      : [
          { src: icon, sizes: "192x192", type, purpose: "any" },
          { src: icon, sizes: "512x512", type, purpose: "any" },
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
