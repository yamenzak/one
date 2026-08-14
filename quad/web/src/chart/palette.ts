/**
 * THE FOUR JOBS A CHART COLOUR CAN DO, AND WHO OWNS EACH.
 *
 * ⚠️ IDENTITY IS THE PLATFORM'S AND MAGNITUDE IS THE BRAND'S. This is the one
 * place in the whole UI where a tenant's accent does NOT reach, and the reason is
 * a guarantee rather than a preference: the categorical slots below are eight
 * fixed hues in a fixed order, validated to stay separable under protanopia and
 * deuteranopia, and any of that survives only while nobody re-picks them. A
 * workspace that recoloured its series would be a workspace whose charts a
 * colourblind reader cannot use, and nothing would report it. So:
 *
 *   CATEGORICAL — which series is which. Fixed, validated, never branded.
 *   SEQUENTIAL  — how much. One hue, and that hue is `--accent`, so magnitude
 *                 does carry the brand.
 *   DIVERGING   — which side of a baseline. Two poles and a NEUTRAL middle.
 *   STATUS      — good, warning, serious, critical. Reserved meanings, and never
 *                 borrowed as "series 4".
 *
 * ⚠️ THE ORDER IS THE MECHANISM, NOT THE PALETTE. Slots are assigned 1, 2, 3 in
 * sequence and never cycled: a ninth series does not get a ninth colour, because
 * a generated hue is indistinguishable from an existing one under simulation and
 * breaks every check at once. Nine series fold to "Other", or the chart becomes
 * small multiples.
 *
 * ⚠️ VALIDATED, NOT EYEBALLED. Both modes pass the six checks — lightness band,
 * chroma floor, CVD separation, normal-vision floor, contrast — measured rather
 * than judged. Light carries a contrast WARN on three slots, which obligates a
 * second channel: every chart here ships a legend, direct labels and a hover
 * value, so the colour is never the only way to read it.
 */

/** ⚠️ Fixed order. Slot N is always the same hue, whatever else is on the chart. */
const LIGHT = [
  "#2a78d6", "#eb6834", "#1baf7a", "#eda100",
  "#e87ba4", "#008300", "#4a3aa7", "#e34948",
] as const;

const DARK = [
  "#3987e5", "#d95926", "#199e70", "#c98500",
  "#d55181", "#008300", "#9085e9", "#e66767",
] as const;

/**
 * ⚠️ DARK IS SELECTED, NOT DERIVED. Six of the eight move between modes and two
 * do not; flipping lightness automatically would push half of them out of the
 * band the checks require, which is how a palette that passes in one mode fails
 * in the other with nobody looking.
 */
export const SLOTS = LIGHT.length;

export const seriesColour = (slot: number, dark: boolean): string =>
  (dark ? DARK : LIGHT)[Math.min(slot, SLOTS - 1)]!;

/**
 * ⚠️ EIGHT IS A CEILING, NOT A TARGET. Past it the answer is fewer series, and
 * the caller is told rather than quietly given a repeat.
 */
export function assign(count: number, dark: boolean): readonly string[] {
  return Array.from({ length: Math.min(count, SLOTS) }, (_, i) => seriesColour(i, dark));
}

/* ------------------------------------------------------------- magnitude --- */

/**
 * ⚠️ SEQUENTIAL IS ONE HUE AND MORE IS DARKER, AND IT IS THE SAFE DEFAULT. A
 * reader cannot misread it: there is nothing to remember, no legend to match
 * against, and the order is visible in the colour. Reach for identity only when
 * the series ARE the subject.
 *
 * ⚠️ IT IS A FIXED HUE, NOT `--accent`, AND THAT CHANGED WHEN THE INTERFACE WENT
 * MONOCHROME. A ramp built from the accent became a ramp of GREYS the moment the
 * accent stopped being a colour — and grey already means something on a chart
 * here: `QUIET` is de-emphasis. "More of it" and "not the subject" would have
 * been the same language, on the same plot, with nothing saying which was meant.
 *
 * ⚠️ SO THE RULE IS NOW ONE SENTENCE, WHICH IS CLEANER THAN WHAT IT REPLACES:
 * the interface is monochrome and the DATA is coloured, and every colour the
 * data uses is the platform's. Categorical was already ours, and validated for
 * colour vision; this is the same argument arriving at the same answer, and it
 * removes the last place a workspace could recolour a reading.
 *
 * ⚠️ THE MIX IS AGAINST THE SURFACE rather than against white, so the light end
 * sits on the page's own ground in both themes.
 */
/**
 * ⚠️ A TOKEN, SO ONE HUE SERVES BOTH THEMES AND EVERY MARK THAT MEASURES. It is
 * defined in `ground.ts` beside the tiers it has to sit on, because a data hue
 * that clears a light surface and disappears on a dark one is a hue chosen
 * without its ground.
 */
export const DATA = "var(--data)";

export const magnitude = (t: number): string =>
  `color-mix(in oklab, ${DATA} ${Math.round(12 + Math.max(0, Math.min(1, t)) * 88)}%, var(--surface))`;

/**
 * ⚠️ TWO POLES AND A NEUTRAL MIDDLE — never a hue in the centre. A rainbow
 * through green says "zero is a kind of value"; grey says "zero is where the
 * sides meet", which is what a diverging scale is for.
 *
 * ⚠️ AND THE POLES ARE NOT `--success` / `--danger`, WHICH IS WHAT THEY WERE.
 * Red against green is the one pair a third of colourblind readers cannot
 * separate at all, and it is reached for precisely where the numbers are money —
 * so the chart that most needs reading is the one that stops being readable.
 * These two are measured under protanopia and deuteranopia like every other hue
 * here. Nothing is lost: the SIGN is already carried by which side of the
 * baseline the mark sits on, so the hue reinforces rather than announces.
 */
const POLE = { up: "#1478a8", down: "#d9541f" } as const;

/**
 * ⚠️ MAGNITUDE IS THE MARK'S LENGTH, SO THE COLOUR MUST NOT SAY IT AGAIN. This
 * shipped as a ramp mixed toward grey by |t| and every small bar rendered faded,
 * which reads as disabled rather than as small — the length said "a little" and
 * the colour said "not really here". A bar, a column and a dumbbell all have a
 * size; for those the pole is flat, at full strength.
 */
export const pole = (value: number): string => (value >= 0 ? POLE.up : POLE.down);

/**
 * ⚠️ THE RAMP IS FOR A CELL, WHERE COLOUR IS THE ONLY CHANNEL THERE IS. A
 * diverging heatmap has no length to read, so the mix toward neutral is the
 * magnitude rather than a second copy of it.
 */
export const polarity = (t: number): string => (t >= 0
  ? `color-mix(in oklab, ${POLE.up} ${Math.round(Math.min(1, t) * 100)}%, var(--muted))`
  : `color-mix(in oklab, ${POLE.down} ${Math.round(Math.min(1, -t) * 100)}%, var(--muted))`);

/* ---------------------------------------------------------------- chrome --- */

/**
 * ⚠️ THE CHART'S OWN FURNITURE IS RECESSIVE AND IS NOT A SERIES COLOUR. Grid,
 * axis and the de-emphasis grey come from the same tokens as the rest of the UI,
 * so a chart sits on a card rather than looking pasted onto one.
 */
export const GRID = "color-mix(in oklab, var(--foreground) 10%, transparent)";
export const AXIS = "color-mix(in oklab, var(--foreground) 18%, transparent)";
export const QUIET = "color-mix(in oklab, var(--foreground) 26%, transparent)";

/**
 * ⚠️ THE SURFACE COLOUR IS A MARK SPEC, NOT A BACKGROUND. Touching marks are
 * separated by a 2px gap IN THIS COLOUR and dots carry a 2px ring of it — which
 * is what keeps a stack readable without drawing a border around every segment.
 * A border is data-weight ink that is not data.
 */
export const SEPARATOR = "var(--surface)";

/**
 * ⚠️ ONE SERIES IN COLOUR AND THE REST IN GREY IS THE MOST UNDERUSED FORM
 * THERE IS. When the story is "this one moved", identity colour buries it among
 * seven equals; emphasis says it in the first glance. Offered here so it is as
 * easy to reach for as the categorical default.
 */
export const emphasis = (isSubject: boolean): string =>
  (isSubject ? DATA : QUIET);
