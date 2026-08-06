/**
 * Scena — the mascot/logo, as a pure SVG-string builder (BLUEPRINT §brand).
 *
 * Scena is a friendly broadcast screen: a rounded TV body with two antennas, a
 * little face, and cheeks. It has *poses* (how the antennas sit) and *expressions*
 * (the face), which combine into *moods* mapped to product scenarios — cheerful
 * when a screen pairs, searching while it looks for a code, sad when something's
 * wrong. One zero-dependency function returns a self-contained `<svg>` string, so
 * the vanilla player pairing screen and the React dashboard render the exact same
 * character. Colors come from a palette (or design-token CSS vars), so Scena can
 * wear the tenant's brand.
 *
 * ViewBox is a fixed 0 0 400 400; scale via width/height/CSS.
 */

/** Every color the character needs. Values are any CSS color — including
 *  `var(--token)`, so a caller can bind Scena to live design tokens. */
export interface ScenaPalette {
  /** Body gradient — light → mid → deep. */
  start: string;
  mid: string;
  end: string;
  /** Antenna bulbs + stalks. */
  sprout: string;
  sproutDark: string;
  /** Ambient glow / drop-shadow tint. */
  glow: string;
  /** Cheek blush. */
  blush: string;
}

/** Antenna posture. */
export type ScenaPose = "tuned" | "noise" | "broadcaster";

/** Face. `sleeping` = closed, at-rest eyes; `sad` = worried. */
export type ScenaExpression =
  | "cheerful" | "wink" | "focused" | "zen"
  | "angry" | "thinking" | "searching" | "sad" | "sleeping";

/** A product scenario → a (pose, expression) combination. This is the API most
 *  callers want: say what's happening, not how the face is drawn. */
export type ScenaMood =
  | "idle" | "happy" | "searching" | "thinking" | "broadcasting" | "sad" | "sleeping";

export const SCENA_MOODS: Record<ScenaMood, { pose: ScenaPose; expression: ScenaExpression }> = {
  idle: { pose: "tuned", expression: "cheerful" },
  happy: { pose: "broadcaster", expression: "cheerful" },
  searching: { pose: "tuned", expression: "searching" },
  thinking: { pose: "tuned", expression: "thinking" },
  broadcasting: { pose: "broadcaster", expression: "focused" },
  sad: { pose: "noise", expression: "sad" },
  sleeping: { pose: "noise", expression: "sleeping" },
};

/**
 * The default Scena palette IS the brand: the design-system violet
 * (`--scena-brand` ≈ oklch(0.58 0.17 300)), spread light → deep on a single hue.
 * Concrete OKLCH (no CSS vars) so it renders anywhere the tokens aren't loaded —
 * the marketing page, the PWA icon, an email. In the dashboard, prefer
 * SCENA_TOKEN_PALETTE so Scena follows the tenant's live brand instead.
 */
export const SCENA_PALETTES: Record<string, ScenaPalette> = {
  brand: { start: "oklch(0.72 0.16 300)", mid: "oklch(0.58 0.17 300)", end: "oklch(0.35 0.14 300)", sprout: "oklch(0.75 0.17 300)", sproutDark: "oklch(0.5 0.17 300)", glow: "oklch(0.3 0.12 300)", blush: "oklch(0.82 0.09 300)" },
  cyber: { start: "#06b6d4", mid: "#3b82f6", end: "#1e1b4b", sprout: "#00f5ff", sproutDark: "#056b9c", glow: "#0c4a6e", blush: "#7dd3fc" },
  gold: { start: "#fbbf24", mid: "#d97706", end: "#78350f", sprout: "#ffe066", sproutDark: "#9e5200", glow: "#451a03", blush: "#fcd9a0" },
  emerald: { start: "#34d399", mid: "#059669", end: "#064e3b", sprout: "#4ff2b2", sproutDark: "#005c3b", glow: "#064e3b", blush: "#8ff0c8" },
};

export const DEFAULT_SCENA_PALETTE = SCENA_PALETTES.brand!;

/**
 * A palette wired to the dashboard's design tokens, so Scena always wears the
 * tenant's brand. Derived from `--primary` alone (lightened/darkened on one hue)
 * so it stays cohesive whatever the tenant picks, and falls back to the brand
 * violet when the var is absent. Only meaningful where the tokens are loaded.
 */
export const SCENA_TOKEN_PALETTE: ScenaPalette = {
  start: "color-mix(in oklab, var(--primary, oklch(0.58 0.17 300)), white 20%)",
  mid: "var(--primary, oklch(0.58 0.17 300))",
  end: "color-mix(in oklab, var(--primary, oklch(0.58 0.17 300)), black 42%)",
  sprout: "color-mix(in oklab, var(--primary, oklch(0.58 0.17 300)), white 12%)",
  sproutDark: "color-mix(in oklab, var(--primary, oklch(0.58 0.17 300)), black 22%)",
  glow: "color-mix(in oklab, var(--primary, oklch(0.58 0.17 300)), black 55%)",
  blush: "color-mix(in oklab, var(--primary, oklch(0.58 0.17 300)), white 46%)",
};

export interface ScenaMascotOptions {
  /** Scenario shorthand → pose + expression. Overridden by explicit pose/expression. */
  mood?: ScenaMood;
  pose?: ScenaPose;
  expression?: ScenaExpression;
  palette?: ScenaPalette;
  /** Idle float, blink, and broadcast pulses. Default true. */
  animate?: boolean;
  /** Show cheek blush. Default true. */
  cheeks?: boolean;
  /** Unique suffix for gradient/keyframe ids so many mascots can share a page.
   *  Supply a stable value in SSR/React; defaults to an internal counter. */
  uid?: string;
  /** Extra attributes spliced onto the root `<svg>` (e.g. `class="w-40"`). */
  attrs?: string;
}

let counter = 0;

const eased = "transition:transform .35s cubic-bezier(.4,0,.2,1)";

/** Eyes + mouth for an expression. Returns an SVG fragment string. */
function face(expr: ScenaExpression, uid: string, blink: boolean): string {
  const blinkClass = blink && expr !== "zen" && expr !== "wink" && expr !== "sleeping" ? ` class="sc-blink-${uid}"` : "";
  const white = "#ffffff";
  const pupil = "#182330";
  const brow = "rgba(255,255,255,.55)";
  const openEye = (cx: number) => `
    <circle cx="${cx}" cy="215" r="16" fill="${white}"/>
    <circle cx="${cx}" cy="215" r="11" fill="${pupil}"/>
    <circle cx="${cx + 4}" cy="211" r="3.5" fill="${white}"/>
    <circle cx="${cx - 4}" cy="219" r="1.8" fill="${white}"/>`;

  let mouth: string;
  let left: string;
  let right: string;

  switch (expr) {
    case "wink":
      mouth = `<path d="M 192 260 Q 200 268 208 260" fill="none" stroke="${white}" stroke-width="7" stroke-linecap="round"/>`;
      left = openEye(165);
      right = `<path d="M 223 217 Q 235 203 247 217" fill="none" stroke="${white}" stroke-width="7" stroke-linecap="round"/>`;
      break;
    case "focused":
      mouth = `<path d="M 192 264 Q 200 254 208 264" fill="none" stroke="${white}" stroke-width="7" stroke-linecap="round"/>`;
      left = `<circle cx="165" cy="216" r="15" fill="${white}"/><rect x="156" y="212" width="18" height="9" rx="4.5" fill="${pupil}"/>`;
      right = `<circle cx="235" cy="216" r="15" fill="${white}"/><rect x="226" y="212" width="18" height="9" rx="4.5" fill="${pupil}"/>`;
      break;
    case "zen":
      mouth = `<path d="M 192 260 H 208" fill="none" stroke="${white}" stroke-width="6" stroke-linecap="round"/>`;
      left = `<path d="M 151 217 Q 163 205 175 217" fill="none" stroke="${white}" stroke-width="7" stroke-linecap="round"/>`;
      right = `<path d="M 225 217 Q 237 205 249 217" fill="none" stroke="${white}" stroke-width="7" stroke-linecap="round"/>`;
      break;
    case "angry":
      mouth = `<path d="M 190 268 Q 200 256 210 268" fill="none" stroke="${white}" stroke-width="7" stroke-linecap="round"/>`;
      left = `<path d="M 148 200 L 180 208" stroke="${brow}" stroke-width="4.5" stroke-linecap="round"/>${openEye(165)}`;
      right = `<path d="M 252 200 L 220 208" stroke="${brow}" stroke-width="4.5" stroke-linecap="round"/>${openEye(235)}`;
      break;
    case "thinking":
      mouth = `<path d="M 188 261 Q 199 265 208 260" fill="none" stroke="${white}" stroke-width="6.5" stroke-linecap="round"/>`;
      left = `<path d="M 147 197 Q 165 188 178 201" fill="none" stroke="${brow}" stroke-width="4.5" stroke-linecap="round"/>${openEye(165)}`;
      right = `<path d="M 222 201 H 248" fill="none" stroke="${brow}" stroke-width="4.5" stroke-linecap="round"/>${openEye(235)}`;
      break;
    case "searching":
      mouth = `<circle cx="200" cy="261" r="5" fill="${white}"/>`;
      left = `<circle cx="165" cy="215" r="16" fill="${white}"/><g class="sc-scan-${uid}"><circle cx="165" cy="215" r="11" fill="${pupil}"/><circle cx="169" cy="211" r="3.5" fill="${white}"/></g>`;
      right = `<circle cx="235" cy="215" r="16" fill="${white}"/><g class="sc-scan-${uid}"><circle cx="235" cy="215" r="11" fill="${pupil}"/><circle cx="239" cy="211" r="3.5" fill="${white}"/></g>`;
      break;
    case "sad":
      mouth = `<path d="M 190 266 Q 200 254 210 266" fill="none" stroke="${white}" stroke-width="7" stroke-linecap="round"/>`;
      left = `<path d="M 150 202 Q 165 196 179 203" fill="none" stroke="${brow}" stroke-width="4.5" stroke-linecap="round"/><circle cx="165" cy="217" r="15" fill="${white}"/><circle cx="165" cy="220" r="10" fill="${pupil}"/><circle cx="168" cy="216" r="3" fill="${white}"/>`;
      right = `<path d="M 250 202 Q 235 196 221 203" fill="none" stroke="${brow}" stroke-width="4.5" stroke-linecap="round"/><circle cx="235" cy="217" r="15" fill="${white}"/><circle cx="235" cy="220" r="10" fill="${pupil}"/><circle cx="238" cy="216" r="3" fill="${white}"/>`;
      break;
    case "sleeping":
      mouth = `<path d="M 194 261 Q 200 265 206 261" fill="none" stroke="${white}" stroke-width="6" stroke-linecap="round"/>`;
      left = `<path d="M 152 216 Q 165 224 178 216" fill="none" stroke="${white}" stroke-width="6" stroke-linecap="round"/>`;
      right = `<path d="M 222 216 Q 235 224 248 216" fill="none" stroke="${white}" stroke-width="6" stroke-linecap="round"/>`;
      break;
    case "cheerful":
    default:
      mouth = `<path d="M 188 257 Q 200 273 212 257" fill="none" stroke="${white}" stroke-width="7" stroke-linecap="round"/>`;
      left = openEye(165);
      right = openEye(235);
      break;
  }

  return `<g style="${eased}"><g${blinkClass} style="transform-origin:165px 215px">${left}</g><g${blinkClass} style="transform-origin:235px 215px">${right}</g><g>${mouth}</g></g>`;
}

/** Antennas for a pose (rotation) + broadcast rings on `broadcaster`. */
function antennas(pose: ScenaPose, uid: string): string {
  const leftRot = pose === "noise" ? -24 : pose === "broadcaster" ? 12 : 0;
  const rightRot = pose === "noise" ? 24 : pose === "broadcaster" ? -12 : 0;
  const waves = pose === "broadcaster"
    ? `<g opacity="0.9">
        <circle cx="130" cy="70" r="30" stroke="url(#sc-sprout-${uid})" stroke-width="2.5" stroke-dasharray="6 4" fill="none" class="sc-ping-${uid}" style="transform-origin:130px 70px"/>
        <circle cx="270" cy="70" r="30" stroke="url(#sc-sprout-${uid})" stroke-width="2.5" stroke-dasharray="6 4" fill="none" class="sc-ping-${uid}" style="transform-origin:270px 70px"/>
      </g>`
    : "";
  return `${waves}
    <g style="transform-box:view-box;transform-origin:170px 130px;transform:rotate(${leftRot}deg);${eased}">
      <line x1="170" y1="130" x2="130" y2="70" stroke="url(#sc-sprout-${uid})" stroke-width="12" stroke-linecap="round"/>
      <circle cx="130" cy="70" r="16" fill="url(#sc-sprout-${uid})" stroke="#ffffff" stroke-width="3.5"/>
    </g>
    <g style="transform-box:view-box;transform-origin:230px 130px;transform:rotate(${rightRot}deg);${eased}">
      <line x1="230" y1="130" x2="270" y2="70" stroke="url(#sc-sprout-${uid})" stroke-width="12" stroke-linecap="round"/>
      <circle cx="270" cy="70" r="16" fill="url(#sc-sprout-${uid})" stroke="#ffffff" stroke-width="3.5"/>
    </g>`;
}

/** Self-contained keyframes + classes (scoped by uid) for the SVG. */
function styleBlock(uid: string, animate: boolean): string {
  if (!animate) return "";
  // transform-box:view-box makes transform-origin resolve in the 0..400 viewBox
  // (not the element's own bbox) so scaleY/rotate pivot correctly on every engine.
  return `<style>
    @keyframes sc-float-${uid}{0%,100%{transform:translateY(0)}50%{transform:translateY(-2%)}}
    @keyframes sc-blink-${uid}{0%,90%,94%,98%,100%{transform:scaleY(1)}92%,96%{transform:scaleY(.12)}}
    @keyframes sc-ping-${uid}{0%{transform:scale(.6);opacity:.9}80%,100%{transform:scale(1.8);opacity:0}}
    @keyframes sc-scan-${uid}{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
    .sc-root-${uid},.sc-blink-${uid},.sc-ping-${uid},.sc-scan-${uid}{transform-box:view-box}
    .sc-root-${uid}{animation:sc-float-${uid} 6s ease-in-out .4s infinite;will-change:transform}
    .sc-blink-${uid}{animation:sc-blink-${uid} 4.6s ease-in-out infinite}
    .sc-ping-${uid}{animation:sc-ping-${uid} 2s ease-out infinite}
    .sc-scan-${uid}{animation:sc-scan-${uid} 2.4s ease-in-out infinite}
  </style>`;
}

/**
 * Render Scena as a self-contained `<svg>` string. Frameworks/agnostic: inject
 * into innerHTML (player) or dangerouslySetInnerHTML (React).
 */
export function scenaMascotSvg(opts: ScenaMascotOptions = {}): string {
  const uid = opts.uid ?? `s${(counter = (counter + 1) % 1_000_000)}`;
  const mood = opts.mood ? SCENA_MOODS[opts.mood] : undefined;
  const pose = opts.pose ?? mood?.pose ?? "tuned";
  const expression = opts.expression ?? mood?.expression ?? "cheerful";
  const p = opts.palette ?? DEFAULT_SCENA_PALETTE;
  const animate = opts.animate !== false;
  const cheeks = opts.cheeks !== false;
  const rootClass = animate ? ` class="sc-root-${uid}"` : "";

  const noise = pose === "noise"
    ? `<g opacity="0.22"><line x1="95" y1="150" x2="305" y2="150" stroke="#fff" stroke-width="2" stroke-dasharray="4 4"/><line x1="95" y1="185" x2="305" y2="185" stroke="#fff" stroke-width="3.5" stroke-dasharray="8 4"/><line x1="95" y1="222" x2="305" y2="222" stroke="#fff" stroke-width="1.5" stroke-dasharray="2 2"/><line x1="95" y1="258" x2="305" y2="258" stroke="#fff" stroke-width="3" stroke-dasharray="6 3"/></g>`
    : "";
  const cheekEls = cheeks
    ? `<g><ellipse cx="128" cy="250" rx="18" ry="9.5" fill="${p.blush}" opacity="0.75"/><ellipse cx="272" cy="250" rx="18" ry="9.5" fill="${p.blush}" opacity="0.75"/></g>`
    : "";

  return `<svg viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Scena"${opts.attrs ? " " + opts.attrs : ""}>
  ${styleBlock(uid, animate)}${scenaMascotDefs(uid, p)}
  <g${rootClass} style="transform-origin:200px 210px">
    <g filter="url(#sc-shadow-${uid})">
      ${antennas(pose, uid)}
      <path d="M 140 280 Q 120 312 95 316" stroke="url(#sc-body-${uid})" stroke-width="16" stroke-linecap="round" fill="none"/>
      <path d="M 260 280 Q 280 312 305 316" stroke="url(#sc-body-${uid})" stroke-width="16" stroke-linecap="round" fill="none"/>
      <rect x="85" y="125" width="230" height="165" rx="34" fill="url(#sc-body-${uid})"/>
      ${screenDetail()}
      ${noise}
      ${cheekEls}
      ${face(expression, uid, animate)}
    </g>
  </g>
</svg>`;
}

/** Shared gradient/shadow defs used by both the mascot and the icon. */
function scenaMascotDefs(uid: string, p: ScenaPalette): string {
  return `<defs>
    <filter id="sc-shadow-${uid}" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="16" stdDeviation="16" flood-color="${p.glow}" flood-opacity="0.6"/></filter>
    <linearGradient id="sc-body-${uid}" x1="100" y1="120" x2="300" y2="310" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="${p.start}"/><stop offset="50%" stop-color="${p.mid}"/><stop offset="100%" stop-color="${p.end}"/></linearGradient>
    <linearGradient id="sc-sprout-${uid}" x1="120" y1="55" x2="280" y2="140" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="${p.sprout}"/><stop offset="100%" stop-color="${p.sproutDark}"/></linearGradient>
  </defs>`;
}

/** The screen's scanlines + control dials (character detail on the body). */
function screenDetail(): string {
  return `<g stroke="#ffffff" stroke-width="1" stroke-dasharray="3 3" opacity="0.1"><line x1="100" y1="150" x2="270" y2="150"/><line x1="100" y1="180" x2="270" y2="180"/><line x1="100" y1="210" x2="270" y2="210"/><line x1="100" y1="240" x2="270" y2="240"/></g>
    <rect x="268" y="152" width="20" height="5" rx="2.5" fill="#0b1020" opacity="0.35"/>
    <circle cx="278" cy="170" r="4.5" fill="#0b1020" opacity="0.35"/>
    <circle cx="278" cy="184" r="4.5" fill="#0b1020" opacity="0.35"/>`;
}

export interface ScenaIconOptions {
  expression?: ScenaExpression;
  palette?: ScenaPalette;
  /** Full-bleed square (no rounding, fills the frame) for iOS / maskable icons.
   *  Otherwise a rounded tile with transparent corners (favicons, `any` PWA). */
  maskable?: boolean;
  uid?: string;
  attrs?: string;
  /** Show cheeks. Default true. */
  cheeks?: boolean;
}

/**
 * Scena as an app icon / favicon — just the screen-face (no antennas or feet),
 * filling the frame so it stays legible down to 16px. 256×256 viewBox.
 */
export function scenaIconSvg(opts: ScenaIconOptions = {}): string {
  const uid = opts.uid ?? `i${(counter = (counter + 1) % 1_000_000)}`;
  const p = opts.palette ?? DEFAULT_SCENA_PALETTE;
  const expr = opts.expression ?? "cheerful";
  const cheeks = opts.cheeks !== false;
  const inset = opts.maskable ? 0 : 16;
  const rx = opts.maskable ? 0 : 56;
  const tile = 256 - inset * 2;
  const cheekEls = cheeks
    ? `<ellipse cx="128" cy="250" rx="18" ry="9.5" fill="${p.blush}" opacity="0.75"/><ellipse cx="272" cy="250" rx="18" ry="9.5" fill="${p.blush}" opacity="0.75"/>`
    : "";
  // The face lives in 400-space; its visual centre is ~(200,236). Map that to the
  // tile centre (128,128) and scale so it sits centred with clear margin — no
  // scanline clutter at icon sizes, so it never looks cropped.
  const faceG = `<g transform="translate(128 128) scale(0.72) translate(-200 -236)">${cheekEls}${face(expr, uid, false)}</g>`;
  return `<svg viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Scena"${opts.attrs ? " " + opts.attrs : ""}>
  <defs><linearGradient id="sc-ic-${uid}" x1="40" y1="30" x2="220" y2="230" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="${p.start}"/><stop offset="52%" stop-color="${p.mid}"/><stop offset="100%" stop-color="${p.end}"/></linearGradient></defs>
  <rect x="${inset}" y="${inset}" width="${tile}" height="${tile}" rx="${rx}" fill="url(#sc-ic-${uid})"/>
  ${faceG}
</svg>`;
}
