/**
 * HOW ONEINVENTORY SAYS A PRODUCT BACK TO THE PERSON DESCRIBING IT.
 *
 * ⚠️ EVERY SENTENCE HERE EXISTS INSTEAD OF A PARAGRAPH OF DOCUMENTATION. The
 * four rungs of the tracking ladder are `listed`, `counted`, `batched` and
 * `itemised`, and as four words on a segmented control they are four words
 * nobody can choose between without being taught what they mean. Taught is the
 * expensive part: it is an induction, a wiki page, and a person in the warehouse
 * who knows. The sentence *"Deliveries are kept apart, so you can recall one"*
 * costs nothing and is read by everybody, because it is in the place they are
 * already looking.
 *
 * ⚠️ A CONSEQUENCE, NEVER A DEFINITION. "Batched means stock is grouped by
 * batch" is a dictionary entry: it restates the word in the word's own terms and
 * leaves somebody exactly as unable to choose. What a person picking between
 * these needs to know is what will be DIFFERENT afterwards — what they will be
 * asked at the door, what they will be able to find later.
 *
 * ⚠️ AND THEY ARE PURE, WHICH IS THE ONLY REASON THEY CAN BE TRUSTED. A sentence
 * assembled inline in a screen is a sentence that reads "1 tablets in a box" on
 * the one path nobody clicked through — an error no compiler sees, no reviewer
 * catches, and every customer does. These are tested.
 *
 * ⚠️ NO TERMINAL FULL STOP, ON ANY OF THEM. Each one is a CAPTION — under a
 * control while it is being answered, in the recap afterwards — and a caption
 * takes no stop (`kernel/src/tone.ts`). One string, both places, one rule.
 */

import { factorOf, plural, type Level } from "./packing.js";

/* --------------------------------------------------------------- tracking --- */

/**
 * WHAT CHOOSING A RUNG WILL ACTUALLY CHANGE.
 *
 * ⚠️ `assembled` IS HERE THOUGH THE REGISTER SHEET DOES NOT OFFER IT. A kit is
 * made out of other products rather than declared as one — but a product ALREADY
 * on that rung has to be describable, and a lookup that returns nothing for a
 * live value is how a screen comes to show a blank where a fact belongs.
 */
const FOLLOWED: Readonly<Record<string, string>> = {
  listed: "You will not count it — it is on the catalogue and nothing more",
  counted: "You will know how many there are, added up across the whole place",
  batched: "Each delivery is kept apart, so you can expire one or recall one",
  itemised: "Every single one is followed on its own, by serial number",
  assembled: "It is built out of other products rather than received",
};

export const sayTracking = (rung: string): string | null => FOLLOWED[rung] ?? null;

/* --------------------------------------------------------------- counting --- */

/**
 * ⚠️ THE UNIT IS PLURALISED, AND THAT IS NOT A FLOURISH. "Counted in box" is the
 * one thing on a screen a person is certain a machine wrote, and everything
 * beside it is trusted a little less for it.
 */
export const sayCounting = (unit: string, whole: boolean): string | null => {
  const said = unit.trim();
  if (!said) return null;
  return `Counted in ${plural(said, 2)}${whole ? ", whole ones only" : ", and a half is a real amount"}`;
};

/* ---------------------------------------------------------------- packing --- */

/** ⚠️ Only the finished rungs — a name with no number is somebody mid-typing. */
const settled = (levels: readonly Level[]): readonly Level[] =>
  levels.filter((one) => one.name.trim().length > 0 && one.per > 1);

/**
 * THE LADDER, READ TOP DOWN, IN THE FORM A DISTRIBUTOR ALREADY SAYS IT IN.
 *
 * ⚠️ "A carton of 4 boxes of 10 sheets of 10 tablets" — the nested `of` is not a
 * stylistic preference, it is what the words in that trade already are, and a
 * sentence somebody recognises is a sentence they do not have to parse.
 *
 * ⚠️ TOP DOWN RATHER THAN BOTTOM UP, WHICH IS THE ORDER IT IS ENTERED IN. The
 * editor builds from the base unit outwards because each rung is defined by the
 * one under it; a person describing the thing starts from the object in their
 * hands.
 *
 * ⚠️ AND THE SHAPE WAS CHOSEN BY A MEASUREMENT. The first draft was "A box holds
 * 10 sheets, and a sheet holds 10 tablets — 100 tablets in a box": correct,
 * readable, and seventeen words, which on a phone is the recap row wrapping to
 * three lines. The recap exists to compress the flow; a clause that wraps three
 * times is the wall of text arrived at from the helpful direction. Same fact,
 * thirteen words.
 *
 * ⚠️ THE TOTAL IS SAID ONLY WHEN IT IS NOT ALREADY ON THE LINE. With one rung,
 * "a box of 100 tablets — 100 tablets in all" says the same number twice, which
 * reads as a fault rather than as emphasis.
 */
export const sayPacking = (levels: readonly Level[], unit: string): string => {
  const said = unit.trim() || "unit";
  const rungs = settled(levels);
  if (!rungs.length) return "It comes as it is — nothing inside it to open";

  /* ⚠️ `per` IS PER THE RUNG BELOW — see `packing.ts`. Read top down, the rung
     below the LAST one is the base unit itself, which is the case a loop over
     adjacent pairs misses entirely: it names the bottom rung twice. */
  const down = [...rungs].reverse();
  const top = down[0] as Level;
  const parts = down.map((one, at) => {
    const below = down[at + 1];
    return `${one.per} ${plural(below ? below.name : said, one.per)}`;
  });
  const line = `A ${top.name} of ${parts.join(" of ")}`;
  if (rungs.length === 1) return line;

  const total = factorOf(rungs, top.name);
  /* ⚠️ `factorOf` RETURNS `null` RATHER THAN 1 FOR A NAME IT CANNOT FIND, and
     the top rung is always findable — but a sentence that silently multiplies by
     one is the failure that rule exists to prevent, so it is not assumed here
     either. */
  if (total === null) return line;
  return `${line} — ${total} ${plural(said, total)} in all`;
};

/* ---------------------------------------------------------------- keeping --- */

/** ⚠️ Days in, months out — nobody thinks of a shelf life in days. */
const inMonths = (days: number): string => {
  const months = Math.round(days / 30);
  if (months < 1) return `${days} ${plural("day", days)}`;
  if (months % 12 === 0) {
    const years = months / 12;
    return `${years} ${plural("year", years)}`;
  }
  return `${months} months`;
};

export const sayKeeping = (shelfDays: number | null, openDays: number | null): string | null => {
  const shelf = shelfDays && shelfDays > 0 ? `Keeps about ${inMonths(shelfDays)} from the day it was made` : null;
  const open = openDays && openDays > 0 ? `${openDays} ${plural("day", openDays)} once opened` : null;
  if (shelf && open) return `${shelf}, and ${open}`;
  /* ⚠️ AN OPEN-JAR LIFE WITH NO SHELF LIFE IS A REAL ANSWER, not a half-filled
     one — a shampoo prints 12M and no expiry date at all. */
  if (open) return `Good for ${open}`;
  return shelf;
};

/* ------------------------------------------------------------------ codes --- */

export const sayCodes = (
  codes: readonly { readonly value: string; readonly pack: number }[],
  unit: string,
): string | null => {
  const real = codes.filter((one) => one.value.trim().length > 0);
  if (!real.length) return null;
  const said = unit.trim();
  /* ⚠️ THE BIGGEST PACK IS THE INTERESTING ONE, because it is the one a wrong
     scan costs the most: scanning a carton and recording a single item is the
     commonest wrong number in inventory work. */
  const biggest = real.reduce((most, one) => Math.max(most, one.pack), 1);
  const many = real.length === 1 ? "One barcode" : `${real.length} barcodes`;
  if (biggest <= 1 || !said) return many;
  return `${many}, the largest a pack of ${biggest} ${plural(said, biggest)}`;
};

/* ----------------------------------------------------------------- naming --- */

export const sayNamed = (brand: string, name: string): string | null => {
  const called = name.trim();
  if (!called) return null;
  const by = brand.trim();
  return by ? `${called}, by ${by}` : called;
};

/* ---------------------------------------------------------------- photos --- */

export const sayPhotos = (many: number, read: boolean): string | null => {
  if (many < 1) return null;
  const shots = `${many} ${plural("photograph", many)}`;
  return read ? `${shots}, read by a model` : shots;
};

/* ------------------------------------------------------------------ where --- */

export const sayGettingMore = (
  supplier: string | null, low: number | null, unit: string,
): string | null => {
  const from = supplier?.trim() ? `Ordered from ${supplier.trim()}` : null;
  const said = unit.trim();
  const at = low && low > 0
    ? `Running low at ${low}${said ? ` ${plural(said, low)}` : ""}`
    : null;
  if (from && at) return `${from}, and ${at.charAt(0).toLowerCase()}${at.slice(1)}`;
  return from ?? at;
};
