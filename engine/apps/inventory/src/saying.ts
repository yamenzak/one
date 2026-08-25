/**
 * HOW ONEINVENTORY SAYS A THING BACK TO THE PERSON DESCRIBING IT.
 *
 * ⚠️ EVERY SENTENCE HERE EXISTS INSTEAD OF A PARAGRAPH OF DOCUMENTATION, AND
 * EVERY ONE OF THEM HAS TO WORK FOR A BASEMENT SHELF AND A DISTRIBUTOR'S
 * WAREHOUSE. The thing being described is a tin of paint, a box of screws, a
 * pallet of drinks, a surgical tray, a drum of solvent or a laptop — so a
 * sentence that only reads well for medicine is a sentence that is wrong most of
 * the time.
 *
 * ⚠️ NO SYSTEM WORDS. "Batched", "itemised", "base unit", "SKU", "par level" and
 * "tracking" are all words a person has to be TAUGHT, and being taught is an
 * induction, a wiki page and somebody in the warehouse who knows. Nothing here
 * uses one. Where an idea genuinely needs a name, it is named by an EXAMPLE —
 * "medicine, food, chemicals" does more work than any definition of a lot.
 *
 * ⚠️ A CONSEQUENCE, NEVER A DEFINITION. "Batched means stock is grouped by
 * batch" restates the word in the word's own terms and leaves somebody exactly
 * as unable to choose. What they need is what will be DIFFERENT afterwards: what
 * they will be asked at the door, what they will be able to find later.
 *
 * ⚠️ AND THEY ARE PURE, WHICH IS THE ONLY REASON THEY CAN BE TRUSTED. A sentence
 * assembled inline in a screen reads "1 tablets in a box" on the one path nobody
 * clicked through — and a customer meets that path on their first product.
 *
 * ⚠️ NO TERMINAL FULL STOP, ON ANY OF THEM. Each one is a CAPTION — under a
 * control while it is being answered, and again in the review at the end — and a
 * caption takes no stop (`kernel/src/tone.ts`). One string, both places.
 */

import { factorOf, plural, type Level } from "./packing.js";

/* ------------------------------------------------------------------- unit --- */

/**
 * ⚠️ THE UNIT IS PLURALISED EVERYWHERE IT IS SAID, AND IT IS NOT A FLOURISH.
 * "Counted in box" is the one thing on a screen a person is certain a machine
 * wrote, and everything beside it is trusted a little less for it.
 */
export const some = (unit: string, many = 2): string =>
  plural(unit.trim() || "unit", many);

/**
 * "a box", "an item", "an hour", "a unit" — the article a person would use.
 *
 * ⚠️ IT IS A SOUND RULE, NOT A LETTER RULE, AND THE NAIVE VERSION SHIPPED FIRST.
 * `/^[aeiou]/` gives "an unit" — which is the exact string this function's own
 * fallback produces, so the commonest path through it was the wrong one. "An
 * user", "an uniform" and "a hour" are the same fault from the other three
 * directions.
 *
 * ⚠️ TWO SHORT LISTS RATHER THAN A DICTIONARY, because the words this is ever
 * handed are UNIT NAMES: a hundred-odd nouns, of which about six are irregular.
 * A pronouncing dictionary to decide between "a" and "an" on `piece` would be a
 * megabyte spent on a word that was never in doubt.
 */
const SOUNDED = /^(?:uni|use|usu|uti|ubi|eu|one|once)/i;
const SILENT = /^(?:hour|honest|honour|honor|heir)/i;

export const one = (unit: string): string => {
  const said = unit.trim() || "unit";
  const an = SILENT.test(said) || (/^[aeiou]/i.test(said) && !SOUNDED.test(said));
  return `${an ? "an" : "a"} ${said}`;
};

/* ---------------------------------------------------------------- detail --- */

/**
 * WHAT PICKING A LEVEL OF DETAIL WILL ACTUALLY CHANGE.
 *
 * ⚠️ THE FOUR RUNGS ARE THE HARDEST WORDING IN THE PRODUCT AND THEY USED TO BE
 * FOUR BARE ADJECTIVES — Listed, Counted, Batched, Itemised — which is four
 * words nobody can choose between without being taught. The question is not what
 * the system calls them. It is what somebody will be able to ANSWER later.
 *
 * ⚠️ `assembled` IS HERE THOUGH THE FLOW DOES NOT OFFER IT. A kit is made out of
 * other things rather than declared as one — but something ALREADY on that rung
 * has to be describable, and a lookup that returns nothing for a live value
 * draws a blank where a fact belongs.
 */
const DETAIL: Readonly<Record<string, string>> = {
  listed: "You will never be asked how many there are",
  counted: "You will always know how many you have",
  batched: "You will know which delivery any of it came from",
  itemised: "You will be able to look up any single one by its number",
  assembled: "It is put together from other things rather than bought",
};

export const sayDetail = (rung: string): string | null => DETAIL[rung] ?? null;

/* -------------------------------------------------------------- counting --- */

/**
 * ⚠️ THE HALF IS SAID ONLY WHEN IT IS TRUE, because "whole ones only" is what
 * everybody expects and a sentence spent confirming the default is a sentence
 * nobody reads. A half being allowed is the surprising half.
 */
export const sayUnit = (unit: string, whole: boolean): string | null => {
  const said = unit.trim();
  if (!said) return null;
  return whole
    ? `You count these in ${some(said)}`
    : `You count these in ${some(said)}, and half ${one(said)} is a real amount`;
};

/* ----------------------------------------------------------------- packs --- */

/** ⚠️ Only the finished rungs — a name with no number is somebody mid-typing. */
const settled = (levels: readonly Level[]): readonly Level[] =>
  levels.filter((level) => level.name.trim().length > 0 && level.per > 1);

/**
 * THE PACKAGING, IN THE FORM THE TRADE ALREADY SAYS IT IN.
 *
 * ⚠️ "A case of 4 boxes of 10 sheets of 100 tablets" — the nested `of` is not a
 * stylistic preference, it is what the words in that trade already are, and a
 * sentence somebody recognises is one they do not have to parse. It works
 * equally for a pallet of 20 cases of 24 cans.
 *
 * ⚠️ AND THE SHAPE WAS CHOSEN BY A MEASUREMENT. The first draft was "A box holds
 * 10 sheets, and a sheet holds 10 tablets — 100 tablets in a box": correct,
 * readable, and seventeen words, which on a phone is a row wrapping three times.
 * Same fact, thirteen words.
 *
 * ⚠️ THE TOTAL IS SAID ONLY WHEN IT IS NOT ALREADY ON THE LINE. With one rung,
 * "a box of 100 tablets — 100 tablets in all" says the same number twice, which
 * reads as a fault rather than as emphasis.
 */
export const sayPacks = (levels: readonly Level[], unit: string): string => {
  const rungs = settled(levels);
  if (!rungs.length) return `They arrive as single ${some(unit)}`;

  /* ⚠️ `per` IS PER THE PACK BELOW — see `packing.ts`. Read top down, the thing
     below the LAST pack is the unit itself, which is the case a loop over
     adjacent pairs misses entirely: it names the smallest pack twice. */
  const down = [...rungs].reverse();
  const top = down[0] as Level;
  const parts = down.map((level, at) => {
    const below = down[at + 1];
    return `${level.per} ${plural(below ? below.name : unit.trim() || "unit", level.per)}`;
  });
  const line = `${one(top.name)} of ${parts.join(" of ")}`;
  const said = line.charAt(0).toUpperCase() + line.slice(1);
  if (rungs.length === 1) return said;

  const total = factorOf(rungs, top.name);
  /* ⚠️ `factorOf` RETURNS `null` RATHER THAN 1 FOR A NAME IT CANNOT FIND, and
     the top pack is always findable — but a sentence that silently multiplies by
     one is the failure that rule exists to prevent, so it is not assumed here. */
  if (total === null) return said;
  return `${said} — ${total} ${some(unit, total)} in all`;
};

/* ----------------------------------------------------------------- dates --- */

/** ⚠️ Days in, months out — nobody thinks of a shelf life in days. */
const roughly = (days: number): string => {
  const months = Math.round(days / 30);
  if (months < 1) return `${days} ${plural("day", days)}`;
  if (months % 12 === 0) {
    const years = months / 12;
    return `${years} ${plural("year", years)}`;
  }
  return `${months} months`;
};

/**
 * ⚠️ "NO" IS AN ANSWER AND IT IS SAID OUT LOUD. A blank line in the review for
 * something that genuinely never expires is indistinguishable from a step
 * somebody skipped, and the two want completely different attention.
 */
export const sayDates = (
  expires: boolean, shelfDays: number | null, openDays: number | null,
): string | null => {
  if (!expires) return "It does not go out of date";
  const shelf = shelfDays && shelfDays > 0
    ? `Good for about ${roughly(shelfDays)} from the day it was made`
    : null;
  const open = openDays && openDays > 0
    ? `${openDays} ${plural("day", openDays)} once opened`
    : null;
  if (shelf && open) return `${shelf}, and ${open}`;
  /* ⚠️ AN OPEN-JAR LIFE WITH NO SHELF LIFE IS A REAL ANSWER, not a half-filled
     one — a shampoo prints 12M and no expiry date at all. */
  if (open) return `Good for ${open}`;
  /* ⚠️ AND "IT EXPIRES" WITH NO NUMBER IS ALSO REAL: plenty of things carry a
     printed date and no fixed life, and the date is read off each delivery. */
  return shelf ?? "Each delivery carries its own date";
};

/* -------------------------------------------------------------- barcodes --- */

export const sayCodes = (
  codes: readonly { readonly value: string; readonly pack: number }[],
  unit: string,
): string | null => {
  const real = codes.filter((code) => code.value.trim().length > 0);
  if (!real.length) return "No barcode";
  /* ⚠️ THE BIGGEST PACK IS THE INTERESTING ONE, because it is the one a wrong
     scan costs the most: scanning an outer case and recording a single item is
     the commonest wrong number in this kind of work. */
  const biggest = real.reduce((most, code) => Math.max(most, code.pack), 1);
  const many = real.length === 1 ? "One barcode" : `${real.length} barcodes`;
  if (biggest <= 1) return many;
  return `${many}, the biggest covering ${biggest} ${some(unit, biggest)}`;
};

/* ----------------------------------------------------------------- named --- */

export const sayNamed = (brand: string, name: string): string | null => {
  const called = name.trim();
  if (!called) return null;
  const by = brand.trim();
  return by ? `${called}, by ${by}` : called;
};

/* ---------------------------------------------------------------- photos --- */

export const sayPhotos = (many: number, read: boolean): string | null => {
  if (many < 1) return "No photo";
  const shots = `${many} ${plural("photo", many)}`;
  return read ? `${shots}, read by the camera` : shots;
};

/**
 * ⚠️ THE NAME AND THE PHOTOGRAPHS ARE ONE ANSWER NOW, so the review says both in
 * one line — see the first step of `Register`. Two lines for one screen would
 * make the recap longer than the flow.
 */
export const sayThing = (brand: string, name: string, photos: number, read: boolean): string | null => {
  const called = sayNamed(brand, name);
  if (!called) return null;
  const shots = photos > 0 ? sayPhotos(photos, read) : null;
  return shots ? `${called} — ${shots.toLowerCase()}` : called;
};

/* ------------------------------------------------------------------ more --- */

/**
 * ⚠️ TWO FACTS ABOUT GETTING MORE, JOINED ONLY WHERE BOTH ARE THERE. Either on
 * its own is a complete answer — plenty of workspaces know their supplier and
 * have never set a threshold, and plenty of the reverse.
 */
export const sayMore = (
  supplier: string | null, low: number | null, unit: string,
): string | null => {
  const from = supplier?.trim() ? `Bought from ${supplier.trim()}` : null;
  const at = low && low > 0 ? `tell you at ${low} ${some(unit, low)} left` : null;
  if (from && at) return `${from}, and ${at}`;
  if (at) return `Tells you at ${low} ${some(unit, low as number)} left`;
  return from;
};
