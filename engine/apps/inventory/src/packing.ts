/**
 * HOW A THING IS PACKAGED — the ladder between a carton and a tablet.
 *
 * ⚠️ STOCK IS ALWAYS IN BASE UNITS, AND EVERYTHING HERE IS ABOUT THE WAY IN AND
 * THE WAY OUT. A shelf holds 97 tablets whether they arrived as a carton, three
 * boxes or a handful — so there is nothing to "break open", no partial-carton
 * state, and no second balance that can disagree with the first. What people
 * actually need is to SAY "two boxes" while holding two boxes, and to READ a
 * number back in the words they think in.
 *
 * ⚠️ SO A LEVEL IS A NAMED MULTIPLIER AND NOTHING MORE. It is not a product, not
 * a location and not a row anywhere — declaring each rung as its own product
 * splits the balance across levels, makes every read a tree walk, and forces a
 * lot number printed on a box to belong either to the box (so a tablet cannot be
 * recalled) or to the tablet (so the box row bought nothing).
 *
 * ⚠️ AND THE SHEET IS WHY THIS EXISTS AT ALL. A blister sheet inside a box
 * carries no barcode, so it can never be a `code`, and before this there was
 * nowhere to put it: a pharmacy issuing by the sheet had to type 10 every time
 * and hope. A rung needs a name and a number, not a symbol somebody can scan.
 */

/**
 * ONE RUNG.
 *
 * ⚠️ `per` IS PER THE RUNG BELOW, NOT PER BASE UNIT, and the difference is the
 * whole ergonomics of the field. Somebody entering a ladder knows "a box holds 3
 * sheets" — they do not know, and should not have to multiply out, that a box
 * holds 30 tablets. Read as base units the second rung is silently wrong by a
 * factor of the first, and it renders perfectly.
 */
export interface Level {
  readonly name: string;
  readonly per: number;
}

/**
 * ⚠️ SIX, AND THE NUMBER IS A JUDGEMENT RATHER THAN A LIMIT ANYBODY WILL REACH.
 * Pallet ← layer ← case ← inner ← sheet ← tablet is five and is the deepest real
 * packaging anybody has described. The cap is here so a pasted ladder cannot
 * make `factorOf` walk something unbounded.
 */
export const MOST_LEVELS = 6;

/**
 * ⚠️ A RUNG THAT HOLDS ONE OF THE THING BELOW IT IS NOT A RUNG. "A box holds 1
 * sheet" is a second name for the same quantity, and it makes two entries on the
 * picker that put the identical number on the shelf — so the person picks one,
 * cannot tell which they picked, and neither can the history.
 */
export const LEAST_PER = 2;

/** ⚠️ Beyond this a product of the rungs stops being exact in a double. */
const MOST_FACTOR = Number.MAX_SAFE_INTEGER;

/**
 * WHAT A STORED LADDER IS, DEFENSIVELY.
 *
 * ⚠️ IT IS A JSON COLUMN, SO IT IS WHATEVER IS IN THE COLUMN. A row written by an
 * import, an older version of this app, or a hand-edited database reaches
 * `factorOf` exactly like a good one — and a `per` of `"10"` multiplies into a
 * string, which lands on the shelf as `NaN` and is never refused by anything.
 */
export const readLevels = (raw: unknown): readonly Level[] => {
  const held = typeof raw === "string" ? parsed(raw) : raw;
  if (!Array.isArray(held)) return [];
  const out: Level[] = [];
  for (const one of held.slice(0, MOST_LEVELS)) {
    if (!one || typeof one !== "object") continue;
    const at = one as { name?: unknown; per?: unknown };
    const name = typeof at.name === "string" ? at.name.trim() : "";
    const per = Math.trunc(Number(at.per));
    if (!name || !Number.isFinite(per) || per < LEAST_PER) continue;
    out.push({ name, per });
  }
  return out;
};

const parsed = (raw: string): unknown => {
  try { return JSON.parse(raw); } catch { return null; }
};

/**
 * WHY THIS LADDER CANNOT BE SAVED, or nothing.
 *
 * ⚠️ IT REFUSES AT THE DOOR RATHER THAN BEING CLEANED UP ON READ, because
 * `readLevels` DROPS what it cannot use — which is right for a column that may
 * hold anything and wrong for somebody typing into a form. A rung silently
 * discarded on save is a picker missing an entry, discovered by whoever receives
 * the next delivery.
 */
export const refuseLevels = (levels: readonly Level[], unit: string): string | null => {
  if (levels.length > MOST_LEVELS) return `That is more than ${MOST_LEVELS} levels`;
  const base = unit.trim().toLowerCase();
  const seen = new Set<string>();
  for (const one of levels) {
    const name = one.name.trim();
    if (!name) return "Every level needs a name";
    const key = name.toLowerCase();
    /*
      ⚠️ A RUNG MAY NOT BE CALLED WHAT THE BASE UNIT IS CALLED. "How many
      tablets" would then appear twice on the picker meaning two different
      numbers, and the one that is not the base unit wins silently.
    */
    if (key === base) return `"${name}" is what one is already counted in`;
    if (seen.has(key)) return `"${name}" is named twice`;
    seen.add(key);
    if (!Number.isFinite(one.per) || !Number.isInteger(one.per)) {
      return `Say how many go in a ${name}`;
    }
    if (one.per < LEAST_PER) return `A ${name} has to hold at least ${LEAST_PER}`;
  }
  /* ⚠️ THE TOP RUNG IS THE PRODUCT OF ALL OF THEM, so it is the only one that can
     leave the range where a double is exact — and past that every quantity
     derived from it is quietly approximate. */
  const deepest = factors(levels).at(-1);
  if (deepest && deepest.per > MOST_FACTOR) return "Those numbers multiply up too far";
  return null;
};

/**
 * HOW MANY BASE UNITS ARE IN ONE OF `name` — or `null` where the ladder does not
 * have that rung.
 *
 * ⚠️ `null` RATHER THAN `1`, AND IT IS THE SHARPEST LINE IN THIS FILE. A level
 * name arrives from a client, and a name the product does not declare is either
 * a stale screen or somebody's mistake. Answering `1` receives a carton as a
 * single tablet — a wrong number, silently, that nothing downstream can detect.
 * The caller has to decide what an unknown rung means, and every caller here
 * decides to refuse.
 */
export const factorOf = (
  levels: readonly Level[], name: string,
): number | null => {
  const want = name.trim().toLowerCase();
  if (!want) return null;
  let factor = 1;
  for (const one of levels) {
    factor *= one.per;
    if (one.name.trim().toLowerCase() === want) return factor;
  }
  return null;
};

/** Every rung with the base units it stands for, shallowest first. */
export const factors = (
  levels: readonly Level[],
): readonly { readonly name: string; readonly per: number }[] => {
  let factor = 1;
  return levels.map((one) => {
    factor *= one.per;
    return { name: one.name, per: factor };
  });
};

/**
 * HOW MANY BASE UNITS ONE ENTRY MEANS — the multiplier, resolved once.
 *
 * ⚠️ EXACTLY ONE MULTIPLICATION EVER HAPPENS, WHICH IS THE POINT OF PUTTING IT
 * HERE. A level and a code's `pack` are the same kind of number wearing different
 * clothes, and a path that could apply both put nine hundred tablets on a shelf
 * once already. The rule: a named level wins, a code's pack is the default, and
 * one is the floor.
 */
export const perOf = (
  levels: readonly Level[], level: string | null | undefined, pack: number | null | undefined,
): number | null => {
  const named = (level ?? "").trim();
  if (named) return factorOf(levels, named);
  const held = Math.trunc(Number(pack));
  return Number.isFinite(held) && held > 0 ? held : 1;
};

/**
 * WHICH RUNG A CARRIER HOLDING `pack` BASE UNITS IS — or `null` for none of them.
 *
 * ⚠️ DERIVED RATHER THAN ASKED, because the person registering a product has
 * already said both things. A ladder with a box of 30 and a barcode that holds 30
 * is a box, and a second question about it is a second chance for the two to
 * disagree — which is a picker offering "How many of these" over a code the
 * catalogue could have named.
 *
 * ⚠️ AND AN AMBIGUOUS LADDER ANSWERS THE SHALLOWEST MATCH. Two rungs cannot share
 * a factor while `refuseLevels` holds (`per` is at least two, so each rung is
 * strictly larger than the one below), so this only has to be defined — it never
 * has to be judged.
 */
export const rungFor = (
  levels: readonly Level[], pack: number | null | undefined,
): string | null => {
  const held = Math.trunc(Number(pack));
  if (!Number.isFinite(held) || held < LEAST_PER) return null;
  return factors(levels).find((one) => one.per === held)?.name ?? null;
};

/**
 * A QUANTITY IN THE WORDS SOMEBODY THINKS IN — "3 boxes, 1 sheet, 7".
 *
 * ⚠️ IT IS THE BREAKDOWN ALONE AND NEVER THE WHOLE ANSWER. "3 boxes, 1 sheet, 7
 * tablets" is charming and useless to somebody asking whether there is enough for
 * a thirty-tablet course, so the base number stays on the screen beside it. This
 * returns the second line, not the first.
 *
 * ⚠️ AND IT RETURNS `null` RATHER THAN A NUMBER IN A STRING when there is nothing
 * to say — no ladder, or a quantity smaller than the smallest rung. A caller
 * rendering "97" under "97 tablets" has drawn a second line that repeats the
 * first, which is how a screen teaches somebody to stop reading it.
 */
export const spell = (
  quantity: number, levels: readonly Level[], unit: string,
): string | null => {
  if (!levels.length || !Number.isFinite(quantity)) return null;
  const whole = Math.trunc(Math.abs(quantity));
  const rungs = [...factors(levels)].reverse();
  if (!rungs.length || whole < rungs[rungs.length - 1]!.per) return null;

  const said: string[] = [];
  let left = whole;
  for (const rung of rungs) {
    const many = Math.floor(left / rung.per);
    if (many > 0) {
      said.push(`${many} ${plural(rung.name, many)}`);
      left -= many * rung.per;
    }
  }
  /* ⚠️ THE REMAINDER WEARS THE BASE UNIT, because it is base units — a bare
     trailing number reads as another rung whose name went missing. */
  if (left > 0) said.push(`${left} ${plural(unit, left)}`);
  if (!said.length) return null;
  return said.join(", ");
};

/**
 * ⚠️ ENGLISH, ONE RULE, AND DELIBERATELY NO MORE THAN THAT. The names here are a
 * workspace's own words — "box", "sheet", "kg", "stück" — and no plural engine
 * gets them all right. An `s` on a word ending in `s` is the one case that reads
 * as a typo rather than as a language, so it is the one case handled.
 */
const plural = (name: string, many: number): string => {
  const word = name.trim();
  if (many === 1 || !word) return word;
  return /(s|x|z|ch|sh)$/i.test(word) ? `${word}es` : `${word}s`;
};
