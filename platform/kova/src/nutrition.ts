/**
 * NUTRITION MATHS — the pure layer, and it imports nothing.
 *
 * ⚠️ NO I/O, NO RUNTIME, NO MANIFEST. Everything here is arithmetic over plain
 * numbers, which is what makes it exhaustively testable without a database and
 * what stops nutrition rules leaking into a handler where they are reachable
 * only through a request. [KOVA.md](../../docs/KOVA.md) §3 layer 3.
 *
 * It is a module rather than its own package because there is not yet enough of
 * it to be one; the property that matters — no imports — is what makes moving it
 * later a file move rather than an untangling.
 *
 * ⚠️ AND ENERGY IS NOT A FIELD. See `energyOf`.
 */

/** Grams of each. The whole vocabulary. */
export interface Macros {
  readonly protein: number;
  readonly carbs: number;
  readonly fat: number;
  readonly fibre: number;
}

export const NOTHING: Macros = { protein: 0, carbs: 0, fat: 0, fibre: 0 };

/**
 * ⚠️ ENERGY IS DERIVED AND NEVER STORED. A food row carrying both `calories` and
 * its macros holds two numbers that disagree the moment anybody edits one — and
 * every product that stores both ends up with a diary whose totals do not match
 * the sum of its rows. There is nothing to reconcile if there is nothing to
 * disagree with.
 *
 * Atwater's factors, and `fibre` at two rather than four: it is a carbohydrate
 * by measurement and mostly not absorbed, so counting it at four overstates
 * every high-fibre day by a meaningful amount.
 */
export const energyOf = (m: Macros): number =>
  Math.round(m.protein * 4 + (m.carbs - m.fibre) * 4 + m.fat * 9 + m.fibre * 2);

/**
 * One food's macros at the amount somebody actually ate.
 *
 * ⚠️ THE BASIS TRAVELS WITH THE FOOD. A tin declares its numbers per 100 g and
 * an egg declares them per egg; assuming 100 everywhere is how a product tells
 * somebody a single egg was 620 calories. `per` is a field, not a constant.
 */
export function portionOf(food: Macros & { readonly per: number }, amount: number): Macros {
  /* A basis of zero is a food nobody can eat a portion of. Refuse it as nothing. */
  if (!(food.per > 0) || !(amount > 0)) return NOTHING;
  const scale = amount / food.per;
  return {
    protein: food.protein * scale,
    carbs: food.carbs * scale,
    fat: food.fat * scale,
    fibre: food.fibre * scale,
  };
}

/** Everything eaten, added up. */
export const totalOf = (portions: readonly Macros[]): Macros =>
  portions.reduce(
    (a, p) => ({
      protein: a.protein + p.protein,
      carbs: a.carbs + p.carbs,
      fat: a.fat + p.fat,
      fibre: a.fibre + p.fibre,
    }),
    NOTHING,
  );

/* ---------------------------------------------------------------- targets --- */

export interface Against {
  readonly eaten: number;
  readonly target: number;
  /** ⚠️ Signed: over is as important as under, and clamping hides the half that matters. */
  readonly left: number;
  /** 0–1, and CLAMPED — a bar cannot be 140% long. `left` carries the overage. */
  readonly filled: number;
}

/**
 * How a day is going against what was asked for.
 *
 * ⚠️ `left` IS SIGNED AND `filled` IS CLAMPED, and they are two fields because
 * they answer two questions. A single number cannot say both "you are 300 over"
 * and "draw the bar full" — and a product that clamps the first tells somebody
 * they are exactly on target while they are not.
 */
export function against(eaten: number, target: number): Against {
  /* No target is not a target of zero: nothing is over, and nothing is filled. */
  if (!(target > 0)) return { eaten, target: 0, left: 0, filled: 0 };
  return { eaten, target, left: target - eaten, filled: Math.min(1, Math.max(0, eaten / target)) };
}

/* ------------------------------------------------------------------ week --- */

/**
 * An average over the days somebody actually recorded.
 *
 * ⚠️ DIVIDED BY THE DAYS WITH ENTRIES, NOT BY SEVEN. Dividing by seven turns
 * "I logged three days carefully" into "you ate 800 calories a day" — a number
 * that is wrong, alarming, and produced by a product that mistook silence for
 * abstinence. The count travels with the average so the reader can see how much
 * it is worth.
 */
export function overDays(days: readonly Macros[]): { readonly mean: Macros; readonly days: number } {
  const kept = days.filter((d) => d.protein > 0 || d.carbs > 0 || d.fat > 0);
  if (!kept.length) return { mean: NOTHING, days: 0 };
  const sum = totalOf(kept);
  const n = kept.length;
  return {
    mean: { protein: sum.protein / n, carbs: sum.carbs / n, fat: sum.fat / n, fibre: sum.fibre / n },
    days: n,
  };
}
