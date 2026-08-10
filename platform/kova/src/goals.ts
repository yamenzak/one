/**
 * GOALS — how far along, and the arithmetic that is wrong in half the cases.
 *
 * ⚠️ NO I/O, NO RUNTIME, NO MANIFEST. Layer 3, beside `nutrition.ts`.
 *
 * ⚠️ AND A GOAL STORES NO PROGRESS. Progress is a question about the entries
 * somebody has recorded since they set it — so it is computed, every time, from
 * the one place those numbers live. A stored `current` is a second copy that
 * goes stale the moment somebody corrects a weigh-in, and it goes stale
 * silently: nothing about a number that is merely old looks wrong.
 */

export interface Goal {
  /** Where they were when it was set. Frozen — it is the baseline. */
  readonly start: number;
  /** Where they are now, from the entries. Never stored. */
  readonly current: number;
  readonly target: number;
}

export type Direction = "up" | "down" | "hold";

export interface Progress {
  readonly direction: Direction;
  /** 0–1, clamped. What a bar is drawn from. */
  readonly done: number;
  /** ⚠️ Signed and unclamped: how far they have actually moved. */
  readonly moved: number;
  readonly reached: boolean;
  /** What is left to cover, in the same units, never negative. */
  readonly toGo: number;
}

/**
 * How far along a goal is.
 *
 * ⚠️ HALF OF ALL GOALS COUNT DOWNWARDS, AND THE NAIVE VERSION IS WRONG FOR THEM.
 * `current / target` says somebody trying to reach 75 kg from 90 is 120% done
 * before they have lost a gram, and it says somebody who gained weight is doing
 * better. Progress is measured from the BASELINE towards the target, which is
 * the only formula that reads correctly in both directions — and it is why a
 * goal has to record where somebody started rather than only where they are
 * going.
 */
export function progressOf(goal: Goal): Progress {
  const span = goal.target - goal.start;
  const moved = goal.current - goal.start;

  /*
    ⚠️ A TARGET EQUAL TO THE BASELINE IS "HOLD", NOT A DIVISION BY ZERO. Keeping
    a weight is a real goal, and it is reached while somebody is still there.
  */
  if (span === 0) {
    return { direction: "hold", done: goal.current === goal.target ? 1 : 0, moved, reached: goal.current === goal.target, toGo: Math.abs(goal.target - goal.current) };
  }

  const direction: Direction = span > 0 ? "up" : "down";
  const fraction = moved / span;
  /*
    ⚠️ REACHED MEANS PAST IT, NOT EQUAL TO IT. Somebody aiming for 75 kg who
    reaches 74 has reached it; a check for equality would leave them permanently
    at 99% for having overshot.
  */
  const reached = fraction >= 1;
  return {
    direction,
    done: Math.min(1, Math.max(0, fraction)),
    moved,
    reached,
    /* Never negative: once it is reached there is nothing left to cover. */
    toGo: reached ? 0 : Math.abs(goal.target - goal.current),
  };
}

/**
 * Whether a goal is running out of time, in whole days.
 *
 * ⚠️ NEGATIVE IS OVERDUE AND IS NOT CLAMPED. "0 days left" and "11 days late"
 * are different things to say to somebody, and a product that clamps says the
 * gentler one forever.
 */
export function daysLeft(today: string, by: string): number {
  const from = Date.parse(`${today}T00:00:00.000Z`);
  const until = Date.parse(`${by}T00:00:00.000Z`);
  if (!Number.isFinite(from) || !Number.isFinite(until)) return 0;
  return Math.round((until - from) / 86_400_000);
}
