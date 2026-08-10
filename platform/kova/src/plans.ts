/**
 * A WEEK REPEATED, WITH PROGRESSION — pure, because it is arithmetic about
 * somebody's training and arithmetic is the part worth being sure of.
 *
 * ⚠️ THE ALTERNATIVE IS RETYPING. A coach writing a four-week block writes week
 * one and then the same movements three more times with different numbers, and
 * every one of those is a chance to change a movement in one week and not the
 * next. Copying is not a convenience here; it is the thing that keeps a block
 * internally consistent.
 */

import { s } from "@one/kernel";

/** One prescribed movement inside a day. The shape the programme body carries. */
export interface Item {
  readonly movement: string;
  readonly sets?: number;
  readonly reps?: number;
  readonly load?: number;
  readonly note?: string;
  /**
   * ⚠️ WHICH GROUP THIS BELONGS TO, and it is the whole of supersets and
   * circuits. Two items sharing a group are done together, so what is logged is
   * a ROUND rather than two independent sets — and a plan that could not say so
   * left the coach writing "superset with the next one" in a note nobody parses.
   */
  readonly group?: string;
}

/**
 * ⚠️ ONE MEAL, WITH THE VERSIONS OF IT A COACH WILL ACCEPT.
 *
 * A plan that names one breakfast survives until the first morning somebody has
 * no eggs, and then it is a plan they are failing rather than following. Offering
 * two or three is the difference between a prescription and something a person
 * can actually live on — and it has to be the COACH's list, or "I had something
 * else" is untracked either way.
 */
export interface Option {
  readonly label: string;
  readonly foods?: readonly { readonly name: string; readonly grams?: number }[];
}

export interface Meal {
  readonly name: string;
  readonly options?: readonly Option[];
}

export interface Day {
  readonly name?: string;
  readonly movements?: readonly Item[];
  /**
   * ⚠️ THE SAME BODY CARRIES BOTH KINDS OF PLAN. A programme is training or
   * eating, and both are weeks of days — so one shape with two optional lists is
   * one schema to validate and one reader to write, where two would be two of
   * everything that agree until somebody edits one.
   */
  readonly meals?: readonly Meal[];
}

export interface Week {
  readonly days?: readonly Day[];
}

/**
 * The shape a programme's body must actually have.
 *
 * ⚠️ DECLARED, BECAUSE THE NAME ALONE WAS A COMMENT. `field.json("programme.weeks")`
 * validated nothing until this existed, and the failure that follows is silent:
 * a body whose days carry `items` where every reader here wants `movements`
 * saves cleanly, copies a week, applies no progression, and reports success with
 * every number correct and nothing moved.
 *
 * ⚠️ THE CEILINGS ARE PART OF IT. A JSON column with no bound is a request body
 * limit and nothing else — and this one is read whole on every plan read, so an
 * unbounded week list is a slow screen for the person it belongs to.
 */
export const WEEKS_SHAPE = s.array(
  s.object({
    days: s.optional(s.array(
      s.object({
        name: s.optional(s.text({ max: 80 })),
        meals: s.optional(s.array(
          s.object({
            name: s.text({ max: 80 }),
            options: s.optional(s.array(
              s.object({
                label: s.text({ max: 80 }),
                foods: s.optional(s.array(
                  s.object({ name: s.text({ max: 120 }), grams: s.optional(s.number({ min: 0, max: 5_000 })) }),
                  { max: 30 },
                )),
              }, { strict: true }),
              { max: 6 },
            )),
          }, { strict: true }),
          { max: 8 },
        )),
        movements: s.optional(s.array(
          s.object({
            movement: s.text({ max: 40 }),
            sets: s.optional(s.number({ integer: true, min: 1, max: 99 })),
            reps: s.optional(s.number({ integer: true, min: 1, max: 999 })),
            load: s.optional(s.number({ min: 0, max: 2_000 })),
            note: s.optional(s.text({ max: 500 })),
            group: s.optional(s.text({ max: 20 })),
          }, { strict: true }),
          { max: 60 },
        )),
      }, { strict: true }),
      { max: 14 },
    )),
  }, { strict: true }),
  { max: 52 },
);

/**
 * How the next week differs from this one.
 *
 * ⚠️ A PERCENTAGE ON LOAD AND A COUNT ON REPS, because those are the two things
 * a coach actually says: "same weights, one more rep" and "two and a half per
 * cent up". Offering one number for both would make every progression a lie in
 * one of the two units.
 */
export interface Progression {
  readonly loadPercent?: number;
  readonly repsAdded?: number;
}

/**
 * Copy a week, with the progression applied.
 *
 * ⚠️ ONLY WHAT WAS PRESCRIBED MOVES. An item with no load keeps no load — a plan
 * that invented one from a percentage of nothing would put a number in front of
 * somebody who was told to judge it by feel.
 *
 * ⚠️ AND A LOAD IS ROUNDED TO SOMETHING LOADABLE. 62.4 kg is not a weight anybody
 * can put on a bar, and a plan full of them reads as a machine's output rather
 * than a coach's. Half a unit is the smallest plate pair in either system.
 */
export function progressWeek(week: Week, by: Progression): Week {
  const factor = 1 + (by.loadPercent ?? 0) / 100;
  const added = by.repsAdded ?? 0;
  return {
    days: (week.days ?? []).map((day) => ({
      ...day,
      movements: (day.movements ?? []).map((item) => ({
        ...item,
        ...(item.load === undefined ? {} : { load: roundToHalf(item.load * factor) }),
        ...(item.reps === undefined ? {} : { reps: Math.max(1, item.reps + added) }),
      })),
    })),
  };
}

const roundToHalf = (n: number): number => Math.round(n * 2) / 2;

/**
 * ⚠️ WHAT A WEEK NUMBER MEANS IS ONE-BASED, because that is what a coach says.
 * Off-by-one here is a week copied from the wrong place, which reads as correct
 * until somebody notices the block does not build.
 */
export function weekAt(weeks: readonly Week[], number: number): Week | null {
  return weeks[number - 1] ?? null;
}

/* ---------------------------------------------------------------- groups --- */

/**
 * The rounds a day implies, in order.
 *
 * ⚠️ AN ITEM WITH NO GROUP IS ITS OWN ROUND. A day of ordinary sets and a day of
 * supersets are then the same shape to whatever logs them, which is what stops
 * the player having two modes and stops a coach's grouping changing how a
 * history reads.
 */
export function roundsOf(day: Day): readonly (readonly Item[])[] {
  const out: Item[][] = [];
  const groups = new Map<string, Item[]>();
  for (const item of day.movements ?? []) {
    if (!item.group) {
      out.push([item]);
      continue;
    }
    const held = groups.get(item.group);
    if (held) {
      held.push(item);
      continue;
    }
    const started = [item];
    groups.set(item.group, started);
    out.push(started);
  }
  return out;
}
