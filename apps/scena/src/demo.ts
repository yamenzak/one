/**
 * A self-contained demo channel + the built-in "sample display" slides.
 *
 * It lets a freshly paired screen start playing a real, clock-synced playlist
 * with no D1/R2 configured: the slides are SVGs served by the API itself, and
 * the epoch comes from the ChannelDO. The same slides back the one-click sample
 * display (see provision.ts). The manifest *shape* is the real one from
 * @scena/manifest, so the player never learns a throwaway format.
 *
 * The slides deliberately speak the PRODUCT's design language — the same the
 * pairing screen uses: a single brand-violet panel (the `from-primary` hue, no
 * multi-colour gradients), the real Scena mascot, and clean white type. Content
 * sits in the safe left band so the sample widget layer (a clock + brand tag in
 * the corners) never collides, and the panels stay dark enough that the white
 * widgets read on top.
 */

import { scenaMascotSvg } from "@scena/brand";
import { parseManifest, type Manifest, type Widget } from "@scena/manifest";

export const DEMO_CHANNEL_ID = "demo";

/** The out-of-the-box widget layer, used until the operator publishes their own. */
export const DEFAULT_WIDGETS: Widget[] = [
  {
    id: "clock1",
    type: "clock",
    rect: [1480, 60, 380, 120],
    rot: 0,
    z: 10,
    style: { color: "#fff", opacity: 0.92 },
    config: { style: "digital", format: "HH:mm:ss" },
  },
];

type Mood = "happy" | "searching" | "thinking";
interface DemoSlide {
  id: string;
  asset: string;
  durationMs: number;
  /** Small kicker above the headline. */
  eyebrow: string;
  /** Headline, one string per line (1–2 lines). */
  title: string[];
  /** Mascot mood, mirroring how the pairing screen uses the character. */
  mood: Mood;
}

/** A cohesive set of on-brand sample scenes that also quietly pitch Scena — all
 *  in the one brand-violet panel language of the pairing screen. */
export const DEMO_SLIDES: DemoSlide[] = [
  { id: "s1", asset: "aurora", durationMs: 7000, eyebrow: "Scena", title: ["Bring every screen", "to life"], mood: "happy" },
  { id: "s2", asset: "sunrise", durationMs: 6500, eyebrow: "On schedule", title: ["Fresh content,", "right on time"], mood: "searching" },
  { id: "s3", asset: "ocean", durationMs: 7000, eyebrow: "In sync", title: ["Perfectly in sync,", "every frame"], mood: "thinking" },
  { id: "s4", asset: "forest", durationMs: 6500, eyebrow: "Always on", title: ["Keeps playing,", "even offline"], mood: "happy" },
];

export const DEMO_CYCLE_MS = DEMO_SLIDES.reduce((s, x) => s + x.durationMs, 0);

/** Build the demo manifest anchored at the channel's epoch `t0`. */
export function buildDemoManifest(
  t0: number,
  baseUrl: string,
  opts: { version?: number; widgets?: Widget[] } = {},
): Manifest {
  return parseManifest({
    version: opts.version ?? 1,
    channelId: DEMO_CHANNEL_ID,
    role: "content",
    dimensions: { w: 1920, h: 1080, orientation: "landscape", rotation: 0 },
    epoch: { t0, cycleMs: DEMO_CYCLE_MS },
    slides: {
      transitionDefault: "fade",
      durationDefaultMs: 6000,
      shuffle: false,
      items: DEMO_SLIDES.map((s) => ({
        id: s.id,
        type: "image",
        hash: `demo-${s.asset}`,
        durationMs: s.durationMs,
      })),
    },
    music: { items: [] },
    widgets: opts.widgets ?? DEFAULT_WIDGETS,
    fonts: [],
    assets: DEMO_SLIDES.map((s) => ({
      hash: `demo-${s.asset}`,
      mime: "image/svg+xml",
      bytes: 0,
      url: `${baseUrl}/api/demo/asset/${s.asset}.svg`,
    })),
  });
}

/** A robust system sans stack — an <img>-embedded SVG can't load webfonts, so we
 *  render in the screen's own clean sans rather than a font that won't arrive. */
const FONT = "'Hanken Grotesk',system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

/** Render a demo slide's SVG by asset name. Returns null for unknown names.
 *  A brand-violet panel (same hue as the pairing screen) + the Scena mascot +
 *  white type — one brand colour, no rainbow gradients. */
export function demoAssetSvg(asset: string): string | null {
  const s = DEMO_SLIDES.find((x) => x.asset === asset);
  if (!s) return null;
  const uid = s.asset;
  const two = s.title.length > 1;
  const line1Y = two ? 556 : 604;
  const eyebrowY = line1Y - 120;
  const title = s.title
    .map((line, i) => `<text x="160" y="${line1Y + i * 128}" font-family="${FONT}" font-size="104" font-weight="800" letter-spacing="-3" fill="#ffffff">${escapeXml(line)}</text>`)
    .join("");
  // The real brand character, positioned right, on a soft white halo for lift.
  const mascot = scenaMascotSvg({ mood: s.mood, animate: false, uid: `m-${uid}`, attrs: `x="1300" y="315" width="470" height="470"` });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="bg-${uid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="oklch(0.585 0.17 300)"/><stop offset="1" stop-color="oklch(0.47 0.16 300)"/>
    </linearGradient>
    <radialGradient id="halo-${uid}" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.14"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vig-${uid}" cx="0.32" cy="0.5" r="0.9">
      <stop offset="0.5" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.16"/>
    </radialGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#bg-${uid})"/>
  <ellipse cx="1535" cy="550" rx="460" ry="460" fill="url(#halo-${uid})"/>
  <rect width="1920" height="1080" fill="url(#vig-${uid})"/>
  <line x1="160" y1="${eyebrowY}" x2="216" y2="${eyebrowY}" stroke="#ffffff" stroke-opacity="0.65" stroke-width="2"/>
  <text x="236" y="${eyebrowY + 7}" font-family="${FONT}" font-size="24" font-weight="600" letter-spacing="6" fill="#ffffff" fill-opacity="0.74">${escapeXml(s.eyebrow.toUpperCase())}</text>
  ${title}
  ${mascot}
</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === "'" ? "&apos;" : "&quot;",
  );
}
