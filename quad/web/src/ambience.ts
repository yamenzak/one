/**
 * WHAT SITS BEHIND A SCREEN — the ground, its light, its material and its grain.
 *
 * ⚠️ NAMED, NEVER A COLOUR (D7). Each ambience is a SHAPE OF LIGHT; the hue comes
 * from whatever the workspace's BRAND is at the time. A screen that named a
 * colour would stop matching the moment somebody changed their brand, and nobody
 * would connect the two.
 *
 * ⚠️ AN AMBIENCE IS FOUR LAYERS, NOT ONE GRADIENT, AND THAT IS THE WHOLE
 * DIFFERENCE. The first version of this file put one radial wash behind a screen
 * and called it ambience; against a product that does this well it read as a
 * light leak — flat, banded, obviously a CSS gradient. A ground that reads as
 * MATERIAL has:
 *
 *   1. a WASH — the deep base, so the screen has a colour rather than a tint
 *   2. FORMS — two to four soft poles of light at different values, which is what
 *      gives it somewhere to travel and stops it reading as a single blur
 *   3. DEPTH — a vignette pulling the corners down, which is most of why a
 *      photographic backdrop looks lit rather than filled
 *   4. GRAIN — a barely-there fine texture. This one is not decoration: a large
 *      smooth gradient BANDS on an 8-bit display, and the banding is the single
 *      clearest tell of a cheap background. A little noise dithers it away.
 *
 * ⚠️ ONE HUE, MANY VALUES. Every ambience below is built from the accent alone
 * (or the tone's token), varied by strength and spread, with light and shadow
 * doing the rest. Reaching for a second colour is what turns a branded surface
 * into somebody's idea of a nice gradient, and it cannot follow a tenant's brand.
 * `aurora` is the one exception and it declares its companion in writing.
 *
 * ⚠️ THEY ARE CSS RATHER THAN IMAGES, and that is not a compromise. A PNG is
 * bytes on every cold load and a FIXED colour, so it cannot follow a tenant's
 * accent — which is the entire point of the system. What CSS costs is that the
 * shapes have to be composed rather than photographed, which is what the four
 * layers above are for.
 *
 * ⚠️ AND IT REACHES A WHOLE VIEWPORT, NOT A BAND. Ambience belongs to the top of
 * a screen and should be gone by the time somebody has scrolled one screen —
 * which means a height of `100vh` and a long fade, not a strip behind the crown.
 * A `60vh` version of this file put the ramp above the fold and made every
 * patterned screen end in a visible horizontal edge.
 */

import type { Tone } from "@quad/kernel";

/**
 * ⚠️ TWELVE, AND `plain` IS STILL THE DEFAULT. Ambience everywhere is ambience
 * nowhere: the reason the rich screens in a good product land is that most
 * screens are flat. What earns a ground is a screen somebody ARRIVES at — a
 * balance, a home, a result — never a form and never a list.
 *
 *   plain      nothing. Most screens.
 *   calm       one wide, slow wash. Where somebody arrives.
 *   focus      a tight pool of light in the middle. One task.
 *   lift       light rising from below. Something that just went well.
 *   mesh       two offset poles. A landing surface with room to breathe.
 *   dots       a fading measure. Reads as technical — devices, diagnostics.
 *   weave      fine diagonal threading. Reads as woven cloth.
 *   drape      a fold of heavy fabric, lit from one side. The most material of
 *              them: worth, a plan, anything premium.
 *   aurora     several poles at different values with one companion hue. Alive
 *              and generous — a celebration, a milestone, a reward.
 *   veil       one broad diagonal sweep of light. Clean and directional; good
 *              under a single large figure.
 *   tide       two deep bands meeting on a soft horizon. Calm, wide, patient.
 *   spotlight  a hard light source with a long falloff and a heavy corner. The
 *              most staged — a single object, a single decision.
 */
/**
 * ⚠️ THE SET GROWS BY FAMILY, NOT BY WHIM. The first twelve were one family —
 * soft light — and a reference product's richest screens showed the gap: pure
 * GEOMETRY (rays, rings, slabs, strata), drawn LINE ART (topography, streams),
 * and staged GRAPHICS (a single neon ribbon). Nine more cover those:
 *
 *   rays       beams from a high corner. An announcement, a launch.
 *   arc        concentric rings on a measure — sonar. Devices, monitoring.
 *   prism      two crisp translucent slabs crossing; the overlap is the light.
 *   terrace    stepped strata descending. Levels, tiers, progression.
 *   streak     ONE bright ribbon across darkness. The most staged graphic —
 *              a premium tier, a flagship moment. Its field is nearly off,
 *              because the darkness around the ribbon IS the drama.
 *   bloom      a tight organic cluster of light. People, profiles, warmth.
 *   ridge      drawn topographic contours. A journey, terrain, progress.
 *   flow       drawn streams in parallel. Shared things — money moving,
 *              activity, anything with a current.
 *   grid       etched graph paper. Planning, technical dashboards.
 */
export type Ambience =
  | "plain" | "calm" | "focus" | "lift" | "mesh" | "dots"
  | "weave" | "drape" | "aurora" | "veil" | "tide" | "spotlight"
  | "rays" | "arc" | "prism" | "terrace" | "streak" | "bloom"
  | "ridge" | "flow" | "grid";

export const AMBIENCES: readonly Ambience[] = [
  "plain", "calm", "focus", "lift", "mesh", "dots",
  "weave", "drape", "aurora", "veil", "tide", "spotlight",
  "rays", "arc", "prism", "terrace", "streak", "bloom",
  "ridge", "flow", "grid",
];

/**
 * ⚠️ TONE SELECTS THE TOKEN, AMBIENCE SELECTS THE SHAPE. Keeping them apart is
 * what lets a warning-toned screen be calm and a success-toned one lift, without
 * anybody drawing sixty combinations by hand.
 */
const HUE: Readonly<Record<Tone, string>> = {
  /*
    ⚠️ `--brand`, WHICH IS WHERE A WORKSPACE'S COLOUR LIVES NOW. The interface is
    monochrome and the ground it sits on is not — so the ambience is the ONE
    place a tenant's hue reaches at full strength, and it is the right one: it is
    the thing being belonged to rather than a control being pressed.
  */
  neutral: "var(--brand)",
  info: "var(--brand)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};

/**
 * ⚠️ EVERY STRENGTH IS SCALED BY `--sky`, AND THAT IS HOW LIGHT MODE SURVIVES.
 * The same mix that reads as a lit ground on a dark screen reads as a stain on a
 * white one — the eye judges a tint against the paper, not in the abstract. One
 * multiplier set per theme is the whole fix; the alternative is two hand-tuned
 * numbers per layer per ambience, which is forty numbers nobody will keep true.
 */
const mix = (hue: string, pct: number) =>
  `color-mix(in oklab, ${hue} calc(var(--sky, 1) * ${pct}%), transparent)`;

/**
 * ⚠️ MICRO-TEXTURE IS A DARK-THEME MATERIAL, AND IN LIGHT IT IS DIRT. The
 * threads and dot fields below are marks of the brand laid over the ground —
 * on a near-black screen a darker-than-nothing mark reads as SHEEN, light
 * catching a fibre. On a light screen the same mark is DARKER than the paper,
 * and a field of fine dark marks on light paper has a name: grime. It is not a
 * strength problem — `--sky` already halves light mode and the hatching still
 * read as a dirty wash behind the hero — it is a sign problem, and no
 * multiplier fixes a sign. So texture layers carry a second knob that light
 * turns OFF: the folds, poles and sweeps remain, the fibres do not.
 */
const thread = (hue: string, pct: number) =>
  `color-mix(in oklab, ${hue} calc(var(--sky, 1) * var(--thread, 1) * ${pct}%), transparent)`;

/**
 * ⚠️ ETCHED LINES ARE NOT FIBRES, AND THE DIFFERENCE IS PITCH. `thread` is
 * micro-texture — a field of marks finer than the eye separates, which light
 * mode must turn OFF because a dense dark field on paper is grime. An ETCHED
 * line is macro — rings at 56px, graph lines at 44px — sparse enough that each
 * line reads as a printed line, the way a ruled notebook is not a dirty page.
 * So etching carries its own knob and light DIMS it rather than killing it:
 * the pattern survives the theme, at half voice. Using `thread` here would gut
 * `arc` and `grid` in light; using `etch` for a sub-10px field would ship the
 * grime complaint again. The boundary is ~24px pitch, and it is a judgment
 * made here, once, not per screen.
 */
const etch = (hue: string, pct: number) =>
  `color-mix(in oklab, ${hue} calc(var(--sky, 1) * var(--etch, 1) * ${pct}%), transparent)`;

/**
 * ⚠️ THE FIELD IS WHAT MAKES AN AMBIENCE OWN THE SCREEN, and its absence is what
 * made every one of them shy. The shapes — poles, folds, sweeps — were painted
 * straight onto the page's ground, so an ambience was a decoration ON a screen
 * rather than the world the screen happens in; the reference product runs its
 * colour the full height and lets the content land on it, and the difference
 * between the two is the difference between a themed page and a place.
 *
 * ⚠️ AND LIGHT KEEPS ITS SATURATION, WHICH `--sky` ALONE CANNOT DO. Scaling a
 * hue toward TRANSPARENT makes light mode paler — a wash — when what a light
 * ambience should be is the same colour at a higher VALUE: lilac, not faded
 * violet. So the field mixes toward `--lumen`, which is transparent in dark
 * (colour over near-black = glow) and paper in light (colour into white =
 * a saturated pastel field). The value lightens; the hue stays committed.
 */
const field = (hue: string, weight: number) => [
  `linear-gradient(180deg,`,
  `color-mix(in oklab, ${hue} calc(var(--field, 1) * ${Math.round(62 * weight)}%), var(--lumen, transparent)) 0%,`,
  `color-mix(in oklab, ${hue} calc(var(--field, 1) * ${Math.round(34 * weight)}%), var(--lumen, transparent)) 52%,`,
  `transparent 96%)`,
].join(" ");

/**
 * ⚠️ THE FIELD'S WEIGHT IS PER AMBIENCE, BECAUSE ONE STRENGTH DROWNED ELEVEN
 * IDENTITIES. At full strength under every ambience the twelve read as twelve
 * flat colour fields — drape's fold, veil's sweep and aurora's poles were
 * inside the field's own value range and disappeared into it. The reference
 * product has two kinds of world, not one: colour-led screens that ARE a field,
 * and graphic-led screens whose drama needs darkness around it. So the
 * field-led ambiences (calm, lift, tide) run at full and the shape-led ones
 * give their graphic room — the more distinctive the shape, the more air it
 * gets. `spotlight` is lowest because staging IS darkness.
 */
const FIELD_WEIGHT: Readonly<Record<Exclude<Ambience, "plain">, number>> = {
  calm: 1, focus: 0.85, lift: 1, mesh: 0.8, dots: 0.7, weave: 0.7,
  drape: 0.75, aurora: 0.6, veil: 0.65, tide: 1, spotlight: 0.5,
  /* Geometry wants its lines legible against the field; graphics want dark. */
  rays: 0.6, arc: 0.65, prism: 0.7, terrace: 0.7, streak: 0.25,
  bloom: 0.75, ridge: 0.55, flow: 0.6, grid: 0.7,
};

/** A soft pole of light: where, how wide, how strong. */
const pole = (hue: string, pct: number, x: string, y: string, w: string, h: string) =>
  `radial-gradient(${w} ${h} at ${x} ${y}, ${mix(hue, pct)} 0%, transparent 72%)`;

/**
 * ⚠️ LINE ART IS DRAWN, AND A DRAWING CANNOT FOLLOW A TOKEN — so it does not
 * carry one. An SVG data URI is bytes: `var(--brand)` inside it is a string,
 * not a colour. The way out is that the DRAWING is achromatic and the WORLD
 * under it is not: white strokes over the hue field read as light catching a
 * ridge (dark theme), near-black strokes read as printing on the pastel
 * (light theme), and both work over every brand because neither names one.
 * Two baked variants, switched by a custom property the theme rule flips —
 * the one legitimate use of a per-theme asset in this file.
 *
 * ⚠️ AND THE GEOMETRY IS COMPUTED, NOT HAND-AUTHORED. A hand-written path is
 * write-only — nobody re-derives forty coordinates to move a ridge — and the
 * whole point of these being functions is that a new drawing is new MATH:
 * different harmonics, same machinery.
 */
const art = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

/** Topographic contours: nested closed loops, wobbled by two harmonics. */
function ridgeArt(stroke: string, alpha: number): string {
  const paths: string[] = [];
  const cx = 760, cy = 130;
  for (let k = 0; k < 9; k++) {
    const r = 64 + k * 66;
    const pts: string[] = [];
    for (let i = 0; i <= 44; i++) {
      const a = (i / 44) * Math.PI * 2;
      const w = 1 + 0.15 * Math.sin(3 * a + k * 1.3) + 0.08 * Math.cos(5 * a - k * 0.9);
      const x = cx + Math.cos(a) * r * w;
      const y = cy + Math.sin(a) * r * w * 0.74;
      pts.push(`${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    paths.push(`<path d="${pts.join(" ")}Z" fill="none" stroke="${stroke}" stroke-opacity="${alpha}" stroke-width="1.3"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1300" height="900" viewBox="0 0 1300 900">${paths.join("")}</svg>`;
}

/** Parallel streams: rows of the same current, phase-shifted per row. */
function flowArt(stroke: string, alpha: number): string {
  const paths: string[] = [];
  for (let k = 0; k < 10; k++) {
    const base = 44 + k * 74;
    const pts: string[] = [];
    for (let x = 0; x <= 1300; x += 26) {
      const y = base + 30 * Math.sin(x / 150 + k * 0.8) + 15 * Math.sin(x / 61 + k * 2.2);
      pts.push(`${x ? "L" : "M"}${x} ${y.toFixed(1)}`);
    }
    paths.push(`<path d="${pts.join(" ")}" fill="none" stroke="${stroke}" stroke-opacity="${alpha}" stroke-width="1.4"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1300" height="800" viewBox="0 0 1300 800" preserveAspectRatio="none">${paths.join("")}</svg>`;
}

/**
 * Both variants of each drawing, baked once at module load. Alphas are tuned
 * per sign: white needs more presence over a glowing field than black needs
 * over a pastel one.
 */
const ART = {
  ridge: { dark: art(ridgeArt("#fff", 0.15)), light: art(ridgeArt("#000", 0.09)) },
  flow: { dark: art(flowArt("#fff", 0.17)), light: art(flowArt("#000", 0.1)) },
} as const;

/**
 * ⚠️ THE VIGNETTE IS THE LAYER PEOPLE LEAVE OUT, AND IT IS THE ONE THAT MAKES A
 * GROUND LOOK LIT. Without it the corners are exactly as bright as the middle,
 * which never happens to a real surface and reads as "filled" rather than
 * "photographed". It pulls DOWN toward the page's own ground rather than to
 * black, so it works in both themes and under any brand.
 *
 * ⚠️ AND IT STARTS LATE, BECAUSE A VIGNETTE THAT STARTS EARLY IS NOT A VIGNETTE
 * — it is a wash over the whole ground, and the first version of it was exactly
 * that: opaque from 40% outward, which is most of a phone. It flattened every
 * pole underneath it and made `aurora` — four poles at four values — read as a
 * faint smudge. Frame the light; do not paint over it.
 */
const DEPTH =
  "radial-gradient(135% 115% at 50% 22%, transparent 62%, "
  + "color-mix(in oklab, var(--background) calc(var(--sky, 1) * 45%), transparent) 100%)";

/**
 * ⚠️ GRAIN IS DITHER, AND DITHER MUST BE NOISE. A wash this large bands into
 * visible steps on an ordinary display, and breaking the steps up needs
 * randomness — which a repeating gradient is the precise opposite of.
 *
 * ⚠️ THE FIRST VERSION OF THIS WAS TWO DOT FIELDS AT 3px AND 5px, AND IT WAS
 * VISIBLE AS A GRID. It was described here as "invisible on their own" and
 * shipped; on a near-white ground, dots of the foreground colour at three
 * percent are plainly there, and two pitches that close beat against each other
 * into a lattice — the exact fault the old `dots` ambience had, reintroduced by
 * the layer meant to hide it. It survived because it was only ever looked at
 * whole-page, in dark.
 *
 * ⚠️ SO IT IS `feTurbulence`, WHICH IS ACTUAL NOISE. Every pixel is independent,
 * so there is no pitch to beat against anything and nothing to see at any zoom.
 * `saturate 0` because the filter's raw output is coloured; `stitchTiles`
 * because without it the tile edges are a seam — a grid again, one repeat wider.
 */
const NOISE = [
  "%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E",
  "%3Cfilter id='n'%3E",
  "%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E",
  "%3CfeColorMatrix type='saturate' values='0'/%3E",
  "%3C/filter%3E",
  "%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E",
  "%3C/svg%3E",
].join("");

const GRAIN = `url("data:image/svg+xml,${NOISE}")`;

/**
 * ⚠️ AND IT IS APPLIED BY OPACITY AND A BLEND, NOT BY A COLOUR. Noise painted as
 * a colour is a texture; noise blended at two percent is a rounding error in the
 * gradient underneath it, which is all dither ever needs to be.
 */
const GRAIN_OPACITY = "calc(var(--sky, 1) * 0.035)";

/**
 * ⚠️ THE MASK IS WHY IT READS AS DEPTH RATHER THAN AS A PANEL. Without it every
 * ground ends in a hard horizontal edge, which is the single thing that makes an
 * ambient background look like a mistake. The ramp is long and starts late: an
 * early fade wastes the ambience on the part of the screen the crown is already
 * covering.
 */
/**
 * ⚠️ THE RAMP STARTS LATE AND LANDS LATE. It used to start dropping at 45% and
 * be half gone by 72%, which is precisely why every ambience read as SHY — the
 * world died at mid-screen and the lower half of every page was bare ground
 * with a decorated hat on it. The ambience now holds to past the fold and puts
 * its whole fade into the last stretch, so content lands ON the world rather
 * than after it.
 */
export const FADE = (() => {
  const ramp = "linear-gradient(180deg, black 0%, black 62%, "
    + "color-mix(in oklab, black 60%, transparent) 84%, transparent 100%)";
  return `mask-image: ${ramp}; -webkit-mask-image: ${ramp}`;
})();

/**
 * ⚠️ ONE VIEWPORT, NOT A BAND — see the header. A ground that stops behind the
 * crown draws a line across the page; one that lasts a screen and fades has
 * depth, and is gone by the time anybody has scrolled past it.
 */
export const REACH = "100vh";

/** The layers of one ambience, innermost last, as `background-image` entries. */
function layers(what: Ambience, hue: string): readonly string[] {
  switch (what) {
    case "plain":
      return [];

    case "calm":
      return [
        pole(hue, 20, "50%", "-20%", "130%", "80%"),
        pole(hue, 10, "80%", "10%", "70%", "50%"),
      ];

    case "focus":
      return [
        pole(hue, 16, "50%", "22%", "70%", "55%"),
        pole(hue, 7, "50%", "0%", "120%", "40%"),
      ];

    case "lift":
      return [
        `linear-gradient(0deg, ${mix(hue, 22)} 0%, ${mix(hue, 6)} 40%, transparent 75%)`,
        pole(hue, 12, "50%", "95%", "110%", "60%"),
      ];

    case "mesh":
      return [
        pole(hue, 22, "8%", "-8%", "85%", "70%"),
        pole(hue, 14, "96%", "6%", "75%", "60%"),
        pole(hue, 8, "50%", "45%", "90%", "60%"),
      ];

    /*
      ⚠️ A MEASURE, NOT A DOT FIELD. The point of this one is that it says
      "technical" — so the dots sit on a wash rather than on nothing, which is
      what stopped the old version reading as a rendering fault.
    */
    case "dots":
      return [
        `radial-gradient(${thread(hue, 22)} 0.5px, transparent 0.5px)`,
        pole(hue, 14, "50%", "-10%", "120%", "70%"),
      ];

    /* Fine diagonal threading over a wash — cloth, not stripes. */
    case "weave":
      return [
        `repeating-linear-gradient(45deg, ${thread(hue, 6)} 0 1px, transparent 1px 9px)`,
        pole(hue, 18, "30%", "-10%", "110%", "70%"),
        pole(hue, 10, "90%", "40%", "70%", "60%"),
      ];

    /*
      ⚠️ THE FOLD IS A CONIC GRADIENT, AND NOTHING ELSE PRODUCES IT. A fold is a
      surface turning away from a light source — the brightness sweeps around a
      point rather than along a line, which is exactly what a conic sweep is and
      exactly what no combination of linear gradients can fake.
    */
    case "drape":
      return [
        `repeating-linear-gradient(38deg, ${thread(hue, 5)} 0 1px, transparent 1px 7px)`,
        /* ⚠️ EVERY ANGULAR STOP IS A RAMP, NEVER A JUMP. A conic gradient going
           straight from a tint to `transparent` draws a SEAM — a hard diagonal
           line across the screen that reads as a graphic, not as cloth. Cloth
           has no edges; a fold is a continuous change of angle, so every stop
           below has a neighbour a long way off rather than a stop beside it. */
        `conic-gradient(from 190deg at 22% -14%, `
          + `${mix(hue, 24)} 0deg, ${mix(hue, 13)} 48deg, ${mix(hue, 4)} 96deg, `
          + `${mix(hue, 15)} 168deg, ${mix(hue, 5)} 232deg, ${mix(hue, 20)} 306deg, `
          + `${mix(hue, 24)} 360deg)`,
        pole(hue, 20, "70%", "12%", "90%", "70%"),
      ];

    /*
      ⚠️ THE ONE AMBIENCE WITH A SECOND HUE, AND IT IS DECLARED RATHER THAN
      INVENTED. `--success` is the companion because it is the token furthest
      from the accent that every theme is guaranteed to define — so the pairing
      still follows a tenant's brand instead of freezing one screen on ours.
    */
    case "aurora":
      return [
        pole("var(--success)", 18, "18%", "8%", "70%", "55%"),
        pole(hue, 26, "78%", "-6%", "80%", "60%"),
        pole(hue, 14, "45%", "38%", "70%", "50%"),
        pole("var(--success)", 9, "88%", "45%", "60%", "45%"),
      ];

    /* One broad sweep, and a counter-sweep so the dark half is not flat. */
    case "veil":
      return [
        `linear-gradient(112deg, ${mix(hue, 30)} 0%, ${mix(hue, 12)} 34%, transparent 58%)`,
        `linear-gradient(292deg, ${mix(hue, 14)} 0%, transparent 45%)`,
        pole(hue, 10, "20%", "20%", "80%", "60%"),
      ];

    /* Two deep bands meeting on a soft horizon. */
    case "tide":
      return [
        `linear-gradient(180deg, ${mix(hue, 26)} 0%, ${mix(hue, 8)} 45%, transparent 70%)`,
        pole(hue, 16, "15%", "35%", "90%", "45%"),
        pole(hue, 12, "85%", "8%", "70%", "40%"),
      ];

    /*
      ⚠️ A LIGHT SOURCE AND A SHADOW, WHICH IS WHY THE CORNER IS HEAVY. Staging
      is direction: everything else here is lit from everywhere, and this one is
      lit from somewhere.
    */
    case "spotlight":
      return [
        pole(hue, 34, "72%", "-4%", "70%", "55%"),
        pole(hue, 12, "60%", "20%", "120%", "80%"),
        `linear-gradient(200deg, transparent 40%, `
          + `color-mix(in oklab, var(--background) calc(var(--sky, 1) * 45%), transparent) 100%)`,
      ];

    /* Beams from a high corner. Single pitch, every edge an 8deg ramp. */
    case "rays":
      return [
        `repeating-conic-gradient(from 150deg at 78% -12%, `
          + `${mix(hue, 15)} 0deg, transparent 8deg, transparent 18deg, ${mix(hue, 15)} 26deg)`,
        pole(hue, 20, "78%", "-6%", "95%", "60%"),
      ];

    /* Concentric rings on a measure — sonar. Etched: the rings survive light. */
    case "arc":
      return [
        `repeating-radial-gradient(circle at 50% -30%, ${etch(hue, 28)} 0 1px, transparent 1px 56px)`,
        pole(hue, 16, "50%", "-12%", "120%", "70%"),
      ];

    /*
      ⚠️ TWO CRISP SLABS, AND THE OVERLAP IS THE LIGHT. The edges are 2% ramps —
      deliberate geometry, not the conic seam fault: a slab has edges the way a
      pane of glass does, and softening them into washes would make this `veil`.
    */
    case "prism":
      return [
        `linear-gradient(112deg, transparent 18%, ${mix(hue, 14)} 20%, ${mix(hue, 14)} 44%, transparent 46%)`,
        `linear-gradient(248deg, transparent 20%, ${mix(hue, 11)} 22%, ${mix(hue, 11)} 48%, transparent 50%)`,
        pole(hue, 12, "50%", "-10%", "110%", "60%"),
      ];

    /* Stepped strata descending — each step edge a 2% ramp, values falling. */
    case "terrace":
      return [
        `linear-gradient(180deg, `
          + `${mix(hue, 32)} 0%, ${mix(hue, 32)} 11%, ${mix(hue, 19)} 13%, ${mix(hue, 19)} 26%, `
          + `${mix(hue, 10)} 28%, ${mix(hue, 10)} 43%, ${mix(hue, 4)} 45%, ${mix(hue, 4)} 62%, `
          + `transparent 64%)`,
        pole(hue, 10, "80%", "4%", "70%", "40%"),
      ];

    /*
      ⚠️ ONE RIBBON, AND THE DARKNESS IS THE OTHER HALF OF THE DESIGN. The field
      weight is the lowest in the table because a neon streak is bright BECAUSE
      of what surrounds it — raise the field and this becomes `veil` with extra
      steps. The ribbon peaks well above any other strength in this file, on
      purpose: it is the one ambience that is a graphic rather than a light.
    */
    case "streak":
      return [
        `linear-gradient(116deg, transparent 34%, ${mix(hue, 8)} 44%, ${mix(hue, 60)} 50%, `
          + `${mix(hue, 8)} 56%, transparent 66%)`,
        pole(hue, 18, "62%", "30%", "90%", "70%"),
      ];

    /* A tight organic cluster — three poles close enough to read as one body. */
    case "bloom":
      return [
        pole(hue, 30, "70%", "6%", "55%", "42%"),
        pole(hue, 20, "56%", "20%", "48%", "38%"),
        pole(hue, 12, "80%", "26%", "50%", "36%"),
      ];

    /* Drawn topographic contours over the field — see `ART`. */
    case "ridge":
      return [
        `var(--art)`,
        pole(hue, 16, "68%", "0%", "100%", "65%"),
      ];

    /* Drawn parallel streams — see `ART`. */
    case "flow":
      return [
        `var(--art)`,
        pole(hue, 14, "30%", "-8%", "110%", "70%"),
      ];

    /*
      ⚠️ TWO REPEATING LAYERS, AND IT IS NOT A MOIRÉ FAULT: moiré needs two
      pitches CLOSE in angle or period, and these are the same pitch crossed at
      exactly 90° — a square grid, the one crossing with no beat frequency.
    */
    case "grid":
      return [
        `repeating-linear-gradient(0deg, ${etch(hue, 10)} 0 1px, transparent 1px 44px)`,
        `repeating-linear-gradient(90deg, ${etch(hue, 10)} 0 1px, transparent 1px 44px)`,
        pole(hue, 14, "50%", "-14%", "120%", "70%"),
      ];
  }
}

/**
 * The background layer for one ambience, as CSS declarations.
 *
 * ⚠️ DEPTH GOES ON TOP OF THE FORMS AND UNDER NOTHING ELSE — first in the list,
 * because `background-image` paints its first entry last. Putting the vignette
 * under the poles lets them light the corners it exists to darken.
 */
/**
 * ⚠️ BESPOKE IS COMPOSED FROM THE SAME PRIMITIVES, WHICH IS WHAT KEEPS
 * "ENDLESS" FROM MEANING "UNGOVERNED". A workspace (or an app's one special
 * screen) can have a world of its own: a deterministic seed picks an archetype
 * — pure light, a sweep, a fold, rings, beams — and jitters positions, angles
 * and strengths within the ranges the named ambiences were tuned in. Every
 * knob the system has still applies (`--sky`, `--thread`, `--etch`, `--lumen`,
 * the field, the grain, the fade), the hue still comes from the tone, and
 * nothing a seed can produce escapes the ranges a person already approved.
 * Same seed, same world, forever — a bespoke ambience is an identity, so it
 * must never drift under someone's feet.
 *
 * ⚠️ NO `Math.random()` ANYWHERE NEAR THIS. A bespoke world is derived from
 * its seed the way a named ambience is derived from its name; randomness at
 * call time would give a workspace a different home every visit.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function bespokeCss(seed: number, tone: Tone = "neutral"): string {
  const hue = HUE[tone];
  const r = mulberry32(seed);
  const between = (lo: number, hi: number) => lo + r() * (hi - lo);
  const pct = (lo: number, hi: number) => Math.round(between(lo, hi));

  /* Two to three poles, always — every named ambience has somewhere for the
     light to travel, and a bespoke one is not the place to discover why. */
  const forms: string[] = [];
  const poles = 2 + (r() < 0.5 ? 1 : 0);
  for (let i = 0; i < poles; i++) {
    forms.push(pole(
      hue, pct(10, 26 - i * 6),
      `${pct(5, 95)}%`, `${pct(-20, 40)}%`,
      `${pct(50, 120)}%`, `${pct(35, 75)}%`,
    ));
  }

  /* One archetype on top, or none — pure light is a valid world. */
  const arch = Math.floor(r() * 5);
  if (arch === 1) {
    const a = pct(95, 130);
    forms.unshift(`linear-gradient(${a}deg, ${mix(hue, pct(18, 30))} 0%, ${mix(hue, pct(8, 14))} ${pct(28, 40)}%, transparent ${pct(52, 64)}%)`);
  } else if (arch === 2) {
    forms.unshift(`conic-gradient(from ${pct(150, 230)}deg at ${pct(10, 35)}% ${pct(-20, -5)}%, `
      + `${mix(hue, 24)} 0deg, ${mix(hue, 12)} ${pct(40, 60)}deg, ${mix(hue, 4)} ${pct(90, 110)}deg, `
      + `${mix(hue, 15)} ${pct(160, 180)}deg, ${mix(hue, 5)} ${pct(225, 245)}deg, ${mix(hue, 20)} ${pct(295, 315)}deg, `
      + `${mix(hue, 24)} 360deg)`);
  } else if (arch === 3) {
    forms.unshift(`repeating-radial-gradient(circle at ${pct(30, 70)}% ${pct(-35, -20)}%, ${etch(hue, pct(14, 22))} 0 1px, transparent 1px ${pct(44, 72)}px)`);
  } else if (arch === 4) {
    const step = pct(22, 30);
    forms.unshift(`repeating-conic-gradient(from ${pct(130, 170)}deg at ${pct(65, 85)}% ${pct(-18, -8)}%, `
      + `${mix(hue, pct(12, 17))} 0deg, transparent ${Math.round(step * 0.33)}deg, `
      + `transparent ${Math.round(step * 0.7)}deg, ${mix(hue, pct(12, 17))} ${step}deg)`);
  }

  const weight = between(0.5, 1);
  return `background-image: ${[DEPTH, ...forms, field(hue, weight)].join(", ")}`;
}

export function ambienceCss(what: Ambience, tone: Tone = "neutral"): string {
  const forms = layers(what, HUE[tone]);
  if (!forms.length) return "";
  /* ⚠️ The field is LAST, which is bottom-most: the shapes are lights ON the
     world, and the field is the world. */
  const weight = FIELD_WEIGHT[what as Exclude<Ambience, "plain">];
  return `background-image: ${[DEPTH, ...forms, field(HUE[tone], weight)].join(", ")}`;
}

/**
 * ⚠️ EVERY AMBIENCE, AS ONE STYLESHEET, WITH THE FADE AND THE GRAIN ATTACHED.
 * Built once and injected, because the gradients are derived from the accent at
 * runtime — a workspace's brand has to reach the background of every screen
 * without any screen knowing that branding exists.
 *
 * ⚠️ TWO PSEUDO-ELEMENTS, AND THEY ARE NOT INTERCHANGEABLE. `::before` carries
 * the ground and is MASKED, so it fades. `::after` carries the grain and is NOT,
 * because dither that fades out stops dithering exactly where the gradient is
 * shallowest and banding is most visible.
 */
/**
 * ⚠️ THE GLASS RECIPE, IN ONE PLACE AND IN THIS ORDER. Filters compose in the
 * order written: blurring first and correcting after is what recovers colour and
 * form; correcting first and blurring after averages the correction away.
 */
const GLASS = "blur(11px) saturate(1.4) contrast(1.2) brightness(0.92)";

/**
 * ⚠️ EXPLICIT PER LAYER, because `background-size`/`-repeat`/`-position` CYCLE
 * a short list across the layers — with the field appended, "22px, auto" would
 * tile the field itself at 22px and the whole world becomes confetti. Every
 * entry here spells out all of its ambience's layers, DEPTH first, field last.
 */
const EXTRAS: Partial<Record<Ambience, string>> = {
  dots: "background-size: auto, 22px 22px, auto, auto",
  ridge: "background-size: auto, 1300px 900px, auto, auto"
    + "; background-repeat: repeat, no-repeat, repeat, repeat"
    + "; background-position: 0 0, right -220px top -180px, 0 0, 0 0",
  flow: "background-size: auto, 100% 800px, auto, auto"
    + "; background-repeat: repeat, no-repeat, repeat, repeat",
};

export function ambienceStylesheet(): string {
  const rules = AMBIENCES.filter((a) => a !== "plain").map((a) => {
    const css = ambienceCss(a);
    const extra = EXTRAS[a] ? `; ${EXTRAS[a]}` : "";
    return `[data-sky="${a}"]::before { ${css}${extra}; ${FADE}; }`;
  });

  /* ⚠️ The drawing is baked per theme — see `art`. The var sits on the HOST
     (pseudo-elements inherit it), both selector forms for the same reason as
     the `--sky` rule below. */
  const artRules = (Object.keys(ART) as (keyof typeof ART)[]).flatMap((a) => [
    `[data-sky="${a}"] { --art: ${ART[a].dark}; }`,
    `[data-theme="light"] [data-sky="${a}"], [data-theme="light"][data-sky="${a}"] { --art: ${ART[a].light}; }`,
  ]);

  return [
    /* ⚠️ `-1` and `isolation` on the host, or the layer paints over the content
       of any ancestor that happens to create a stacking context. */
    `[data-sky] { position: relative; isolation: isolate; --sky: 1; }`,
    /* ⚠️ SEE `mix` — one multiplier per theme, not forty hand-tuned numbers.
       Both selector forms, because the stamp may be on the host or an ancestor. */
    `[data-theme="light"] [data-sky], [data-theme="light"][data-sky] {`,
    /* ⚠️ `--lumen` is what keeps light COMMITTED — see `field`. The shapes stay
       at just over half strength; the field mixes into paper at a strength of
       its own, because a saturated pastel is a choice and a faded wash is a
       default. */
    /* ⚠️ `--thread: 0` KILLS fibres; `--etch: 0.5` DIMS line-work — see the
       two helpers for why the same theme treats them oppositely. */
    `  --sky: 0.55; --thread: 0; --etch: 0.5; --lumen: oklch(0.985 0 0); --field: 0.62;`,
    `}`,
    ...artRules,
    `[data-sky]:not([data-sky="plain"])::before,`,
    `[data-sky]:not([data-sky="plain"])::after {`,
    `  content: ""; position: absolute; top: 0; left: 0; right: 0;`,
    `  height: ${REACH}; bottom: auto; z-index: -1;`,
    `  pointer-events: none;`,
    `}`,
    `[data-sky]:not([data-sky="plain"])::before { background-repeat: repeat; }`,
    /* ⚠️ The dither, unmasked — see the note above this function. */
    `[data-sky]:not([data-sky="plain"])::after {`,
    `  background-image: ${GRAIN};`,
    `  background-repeat: repeat;`,
    `  opacity: ${GRAIN_OPACITY};`,
    `  mix-blend-mode: overlay;`,
    `}`,
    ...rules,
    /* ⚠️ A bleeding ambience must reach the edge even inside a padded column. */
    `[data-bleed="edge"]::before, [data-bleed="edge"]::after {`,
    `  left: 50%; right: auto; width: 100vw; transform: translateX(-50%);`,
    `}`,
    /*
      ⚠️ CHROME OVER AN AMBIENCE IS GLASS, NOT PAINT. A solid pill over a lit
      ground is a hole punched in it — the ground is the thing that makes the
      screen, and every opaque control sitting on it takes a piece away. A
      translucent fill of the FOREGROUND token blurs whatever is behind it, so
      the same rule works on olive, on violet and on white without knowing which
      it is on. This is also why a control here is never tinted with the accent:
      see the icon rule below.

      ⚠️ GLASS IS FOR CHROME THAT DOES NOT SCROLL, WHICH IS THE ONLY LINE THAT
      MATTERS. The cost is real — the backdrop is read back and blurred, per
      frame, per layer — so a scrolling list of translucent cards is a phone
      with a weak GPU working hard for nothing. Four fixed chips and one bar are
      not that.

      ⚠️ A NOTE HERE ONCE CLAIMED THE BLUR CANNOT SAMPLE THROUGH `[data-sky]`'s
      `isolation: isolate`. Measured, it samples through it perfectly well; what
      was wrong was the FILL — at twelve percent over a card there is nothing
      for a blur to separate, so it looked flat and the flatness was diagnosed
      as the blur being absent. A wrong cause in a comment is worse than no
      comment, because the next person builds on it.
    */
    /*
      ⚠️ A LONG BLUR AND A LIGHT FILL, IN THAT ORDER OF IMPORTANCE. What makes
      glass read as glass is that the world behind it is RECOGNISABLE and
      unreadable at the same time — colour and movement survive, detail does
      not. That is a property of the blur radius, not of the opacity: a short
      blur under a heavy fill is a frosted panel, which is a different and older
      material. Twenty-eight pixels is past the point where 16px text stops
      resolving into words, so the fill can stay light.

      ⚠️ AND THE SATURATION BOOST IS NOT A FLOURISH. Blurring averages colours
      toward grey, so a plate over a coloured ground comes out duller than the
      ground it is made of — which is exactly the "dusty" reading, arrived at by
      a different route. Pushing saturation back up is what keeps the glass the
      colour of what is behind it.
    */
    /*
      ⚠️ ONE FILTER STACK, WRITTEN ONCE. Blur is only the first term: saturation
      puts back what averaging toward grey takes out, contrast keeps the shapes
      behind from going flat, and a slight darkening is what stops a plate over
      a bright ground reading as a wash. Four terms rather than one is the
      difference between glass and a frosted panel.
    */
    /*
      ⚠️ GLASS IS A VEIL OF THE RAISED TIER, NOT A WASH OF THE FOREGROUND, and
      the difference is what makes it translucent rather than merely see-through.
      A foreground tint at any strength a person can see past is one you can
      READ past — the row under the nav came through it and collided with the
      labels, two sets of words in the same place.

      ⚠️ AND THIS WAS THE ISLAND'S RULE ALONE, WHICH IS WHY THE CROWN HAD THE
      SAME BUG A SECOND TIME. The base was a ten-percent foreground wash and only
      the nav overrode it, so when the crown's chips became the only glass on the
      screen a quick-action label read straight through the search field at full
      size. There is one fill now: the value that was already proved.

      ⚠️ AND IT CANNOT BE A VEIL OF `--background` EITHER, which is the obvious
      choice and the one that fails in the interesting place: over the page's own
      ground it would BE the ground, so a chip would vanish exactly where there
      is no card behind it. `--surface-tertiary` is the tier the palette
      guarantees clears both the page and a card, so a veil of it is separable
      wherever it lands — and a quarter of whatever is behind still comes
      through, blurred, which is the whole effect.
    */
    `[data-glass="true"] {`,
    `  background-color: color-mix(in oklab, var(--surface-tertiary) 76%, transparent) !important;`,
    `  backdrop-filter: ${GLASS};`,
    `  -webkit-backdrop-filter: ${GLASS};`,
    `}`,
    /*
      ⚠️ THE PILL THAT MARKS WHERE YOU ARE, AS A RULE RATHER THAN A CLASS. It is
      one element that TRAVELS between four equal columns — see `Island` — so it
      needs a fill and a radius and nothing else. `--default` is the control
      tier, which the palette guarantees clears both the raised tier under it
      and the surfaces around it.
    */
    /*
      ⚠️ THE PILL IS GLASS ON GLASS, which is the only way it reads as sitting ON
      the bar rather than being cut out of it. Its backdrop is the bar's already
      filtered plate, so it needs no blur of its own — a second blur of an
      already blurred thing costs a full readback and changes almost nothing.
      What it needs is to be BRIGHTER and a touch more saturated than what it
      covers, which is what a raised piece of glass does to the light through it.
    */
    `[data-pill="true"] {`,
    `  background-color: color-mix(in oklab, var(--default) 72%, transparent);`,
    `  border-radius: 9999px;`,
    `  backdrop-filter: brightness(1.14) saturate(1.25);`,
    `  -webkit-backdrop-filter: brightness(1.14) saturate(1.25);`,
    `}`,
    `@media (prefers-reduced-motion: reduce) { [data-pill="true"] { transition: none !important; } }`,
    `[data-glass="true"]:hover {`,
    `  background-color: color-mix(in oklab, var(--surface-tertiary) 92%, transparent) !important;`,
    `}`,
    /*
      ⚠️ THE CHIP A ROW'S MARK SITS IN. It is here rather than on the component
      for the same reason the dot is: a component that named a colour would be
      one a workspace's branding never reaches (D7). `foreground` at seven
      percent is a fill that works on a card in either theme without knowing
      which theme it is in.
    */
    /* ⚠️ WHERE YOU ARE IS THE ONE LABEL YOU CAN READ — see `Island`. */
    `[data-here="true"] { color: var(--foreground); }`,
    `[data-chip="true"] { background-color: color-mix(in oklab, var(--foreground) 7%, transparent); }`,
    /* ⚠️ THE UNREAD DOT, COLOURED BY ITS TONE RATHER THAN BY A LITERAL. It is
       here rather than in a component because a component that named a colour
       would be one a workspace's branding never reaches (D7). */
    `[data-dot="true"] { border-radius: 9999px; background: var(--danger); }`,
    `[data-dot="true"][data-tone="accent"] { background: var(--accent); }`,
    /*
      ⚠️ ONE OPTICAL WEIGHT FOR EVERY GLYPH IN THE PRODUCT. An icon library takes
      its size from its own props, so one caller passing nothing draws at the
      library default beside one that passed 20 — and a list with two icon sizes
      is the single most visible sign of a surface nobody owns. Setting it on the
      BOX means a caller cannot get it wrong.
    */
    `[style*="--icon"] > svg { width: var(--icon); height: var(--icon); }`,
    `[style*="--icon"] > svg { stroke-width: 1.75; }`,
    /* ⚠️ THE ISLAND'S COLLAPSE, AS A RULE RATHER THAN AN INLINE STYLE. It shrinks
       when its labels go to `sr-only`, and an inline `style` on the component
       would beat every branding token it otherwise answers to. */
    `[data-island="true"] { transition: all var(--default-transition-duration) var(--ease-out-fluid); }`,
    `@media (prefers-reduced-motion: reduce) { [data-island="true"] { transition: none; } }`,
  ].join("\n");
}
