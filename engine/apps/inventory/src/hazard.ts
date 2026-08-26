/**
 * WHAT IS DANGEROUS ABOUT A THING, AND WHAT A LABEL HAS TO SAY ABOUT IT.
 *
 * ⚠️ THIS EXISTS BECAUSE OF DECANTING, WHICH IS THE GAP IN ALMOST EVERY
 * INVENTORY PRODUCT. Pour solvent from a 20 L drum into a 500 ml bottle and that
 * bottle is a container of a hazardous substance with no label on it — which in
 * most jurisdictions is the moment a compliant workspace stops being one. The
 * supplier's label stays on the drum; the bottle needs its own, and it needs it
 * before somebody puts it on a bench.
 *
 * ⚠️ THE CLASSIFICATION IS THE WORKSPACE'S, NEVER OURS AND NEVER A MODEL'S.
 * Every field here is something a person copies off a safety data sheet. A
 * product that inferred a hazard class from a name would be producing a legal
 * declaration out of a guess — see the plan's §6.2 and `ai-commits.test.mjs`:
 * a model may fill this in as a SUGGESTION and may not commit it.
 *
 * ⚠️ AND WHAT IS PRINTED IS NOT THE REGULATED PICTOGRAM. The nine GHS marks are
 * published artwork with an exact geometry, and an approximation of a skull
 * drawn from memory is worse than none — it fails an inspection and it misleads
 * the person holding the bottle. What this prints is the red diamond with the
 * hazard NAMED in it, which is unambiguous, plus the signal word and the
 * statements, which are text and are exact. The label says so.
 *
 * Pure. No I/O, no DOM.
 */

/* ---------------------------------------------------------------- the nine --- */

export interface Hazard {
  /** The GHS code, which is what a safety data sheet names. */
  readonly code: string;
  /** What it is, in the words on the sheet. */
  readonly says: string;
  /** What it means, for somebody who has never read one. */
  readonly means: string;
}

/**
 * ⚠️ ALL NINE, IN THEIR OWN ORDER, BECAUSE A SUBSET IS A CLASSIFICATION WE MADE.
 * A workspace picks from the sheet in front of them; a list missing the gas
 * cylinder is a list that makes a compressed-gas store impossible to label
 * correctly, and nobody would report it — they would write it in the notes.
 */
export const GHS: readonly Hazard[] = [
  { code: "GHS01", says: "Explosive", means: "Can explode — heat, shock or friction" },
  { code: "GHS02", says: "Flammable", means: "Catches fire easily" },
  { code: "GHS03", says: "Oxidising", means: "Makes a fire burn harder" },
  { code: "GHS04", says: "Gas under pressure", means: "The container itself is dangerous" },
  { code: "GHS05", says: "Corrosive", means: "Burns skin, eyes or metal" },
  { code: "GHS06", says: "Acutely toxic", means: "Small amounts can kill" },
  { code: "GHS07", says: "Harmful", means: "Irritates skin, eyes or airways" },
  { code: "GHS08", says: "Health hazard", means: "Long-term harm — organs, fertility, cancer" },
  { code: "GHS09", says: "Environmental", means: "Harmful to water and wildlife" },
];

export const CODES: readonly string[] = GHS.map((one) => one.code);

export const hazardOf = (code: string): Hazard | undefined =>
  GHS.find((one) => one.code === code);

/** ⚠️ Two words, and there is no third. A label carries one or neither. */
export const SIGNALS = ["danger", "warning"] as const;
export type Signal = (typeof SIGNALS)[number] | "";

/* ------------------------------------------------------------------ reading --- */

/**
 * ⚠️ A JSON COLUMN IS WHATEVER WAS LAST WRITTEN TO IT, and this one is written
 * by a form, by an import and by a person accepting what a model read off a
 * photograph. Read defensively, in the app's own order rather than the stored
 * one: a label whose diamonds move about between two printings of the same
 * product is one somebody stops trusting.
 */
export const hazardsIn = (of: unknown): readonly string[] => {
  const said = Array.isArray(of) ? of.map((one) => String(one)) : [];
  return CODES.filter((code) => said.includes(code));
};

export const signalIn = (of: unknown): Signal =>
  (SIGNALS as readonly string[]).includes(String(of)) ? (String(of) as Signal) : "";

/* ------------------------------------------------------------ contradictions --- */

/**
 * WHAT A CLASSIFICATION SAYS THAT CANNOT ALL BE TRUE.
 *
 * ⚠️ REPORTED, NEVER REFUSED — the same rule the package builder follows. The
 * person filling this in has the safety data sheet and we do not; an app that
 * refused their classification would be an app they work around by putting the
 * hazard in the notes field, where nothing prints it.
 *
 * ⚠️ AND THE PRECEDENCE RULES ARE REAL GHS, NOT HOUSE STYLE. The exclamation
 * mark is not used alongside the skull for the same hazard, nor alongside
 * corrosion for skin and eye irritation — a label carrying both tells a reader
 * the harm is minor when something else on the same label says it is lethal.
 */
export function hazardContradictions(codes: readonly string[], signal: Signal): readonly string[] {
  const out: string[] = [];
  const has = (code: string) => codes.includes(code);

  if (has("GHS06") && has("GHS07")) {
    out.push("Harmful is not shown beside Acutely toxic — the stronger one stands alone");
  }
  if (has("GHS05") && has("GHS07")) {
    out.push("Harmful is not shown beside Corrosive for skin and eye harm");
  }
  /* ⚠️ THE SKULL IS ALWAYS `Danger`. A label showing it over "Warning" reads as a
     substance somebody has decided is not that bad. */
  if (has("GHS06") && signal !== "danger") {
    out.push("Acutely toxic is always Danger");
  }
  /* ⚠️ A PICTOGRAM WITH NO SIGNAL WORD IS AN INCOMPLETE LABEL, and it is the
     commonest half-filled state — somebody ticks the diamonds and stops. */
  if (codes.length && !signal) {
    out.push("A hazard with no signal word is an incomplete label");
  }
  /* ⚠️ AND A SIGNAL WORD WITH NOTHING BEHIND IT IS A SHOUT WITH NO SUBJECT. */
  if (signal && !codes.length) {
    out.push(`"${signal}" with no hazard says nothing a reader can act on`);
  }
  return out;
}

/**
 * ⚠️ WHETHER THIS THING NEEDS A HAZARD LABEL AT ALL, which is the question the
 * label sheet asks and not "is anything filled in". A product with storage notes
 * and no classification is an ordinary product; one with a diamond is a
 * container that may not be decanted without its own label.
 */
export const isHazardous = (codes: readonly string[], signal: Signal): boolean =>
  codes.length > 0 || signal !== "";

/* ------------------------------------------------------------ on the label --- */

/**
 * A HAZARD NAME, BROKEN INTO AT MOST TWO BALANCED LINES.
 *
 * ⚠️ TWO LINES BECAUSE A DIAMOND IS WIDEST AT ITS MIDDLE. The shape narrows to
 * nothing at both points, so a phrase set on one line runs out through the red
 * border — and a hazard name a reader cannot finish is the one thing the label
 * exists to say. Balanced rather than wrapped at the first fit: two short lines
 * sit in the widest part of the shape, a long one and a stub do not.
 *
 * ⚠️ AND IT IS HERE RATHER THAN IN THE SCREEN THAT PRINTS IT. It lived inside a
 * screen file, which made it a rule about a bottle expressed as a detail of one
 * page — so it went out of the tree with that page and its tests broke, which is
 * how it was found. Nothing about where a phrase breaks depends on the surface
 * asking; the print sheet, a preview and whatever draws the label next all want
 * the same answer.
 */
export const inTwo = (phrase: string): readonly string[] => {
  const words = phrase.split(" ");
  if (words.length < 2) return words;
  let at = 1;
  let closest = Number.POSITIVE_INFINITY;
  for (let cut = 1; cut < words.length; cut++) {
    const gap = Math.abs(
      words.slice(0, cut).join(" ").length - words.slice(cut).join(" ").length);
    if (gap < closest) { closest = gap; at = cut; }
  }
  return [words.slice(0, at).join(" "), words.slice(at).join(" ")];
};
