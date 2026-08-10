/**
 * ARITHMETIC EVERY PRODUCT GETS WRONG THE SAME WAY.
 *
 * Layer 1. Imports nothing.
 *
 * ⚠️ THESE ARE NOT UTILITIES. Every function here encodes a decision that is
 * wrong in the obvious implementation, and each one was written in an app before
 * it was written here — which means the next app writes it again, differently,
 * and one of the two is the version with the bug.
 *
 * The test for belonging here is narrow: no product vocabulary, and a rule a
 * guard already states. Anything that knows what it is measuring stays with the
 * product that knows.
 */

/* ------------------------------------------------------------- towards it --- */

export interface Aim {
  /** Where they were when it was set. Frozen — it is the baseline. */
  readonly start: number;
  /** Where they are now, computed from the records. Never stored. */
  readonly current: number;
  readonly target: number;
}

export type Direction = "up" | "down" | "hold";

/**
 * ⚠️ `Reaching`, not `Progress` — the guide already exports a `Progress`, which
 * is a checklist's answer about a workspace. Two things called Progress in one
 * namespace is a name somebody imports the wrong one of.
 */
export interface Reaching {
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
 * How far along something is.
 *
 * ⚠️ HALF OF ALL TARGETS COUNT DOWNWARDS, AND THE NAIVE VERSION IS WRONG FOR
 * THEM. `current / target` says somebody trying to reach 75 from 90 is 120% done
 * before they have moved at all, and it says somebody going the wrong way is
 * doing better. Progress is measured from the BASELINE towards the target, which
 * is the only formula that reads correctly in both directions — and it is why
 * the baseline has to be recorded rather than only the destination.
 */
export function progressOf(aim: Aim): Reaching {
  const span = aim.target - aim.start;
  const moved = aim.current - aim.start;

  /*
    ⚠️ A TARGET EQUAL TO THE BASELINE IS "HOLD", NOT A DIVISION BY ZERO. Staying
    where you are is a real intention, and it is met while you are still there.
  */
  if (span === 0) {
    return {
      direction: "hold",
      done: aim.current === aim.target ? 1 : 0,
      moved,
      reached: aim.current === aim.target,
      toGo: Math.abs(aim.target - aim.current),
    };
  }

  const direction: Direction = span > 0 ? "up" : "down";
  const fraction = moved / span;
  /*
    ⚠️ REACHED MEANS PAST IT, NOT EQUAL TO IT. Somebody aiming for 75 who reaches
    74 has reached it; a check for equality leaves them permanently at 99% for
    having overshot.
  */
  const reached = fraction >= 1;
  return {
    direction,
    done: Math.min(1, Math.max(0, fraction)),
    moved,
    reached,
    /* Never negative: once it is reached there is nothing left to cover. */
    toGo: reached ? 0 : Math.abs(aim.target - aim.current),
  };
}

/* ------------------------------------------------------------------ days --- */

/**
 * Whole days from one plain date to another. Negative when `to` is earlier.
 *
 * ⚠️ ONE HOME FOR DATE ARITHMETIC, and the reason is that the second
 * implementation is always the one with the off-by-one. Both directions are the
 * same subtraction: "days since that last happened" and "days until this is due"
 * are one question asked from opposite ends.
 *
 * ⚠️ AND IT IS MIDNIGHT UTC ON BOTH SIDES, WHICH IS SAFE ONLY BECAUSE BOTH SIDES
 * ARE PLAIN DATES. A local date is already the person's own day — something
 * upstream decided that — so parsing both at the same instant makes the
 * difference exact rather than drifting by an hour twice a year.
 */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * How long until a date, in whole days.
 *
 * ⚠️ NEGATIVE IS OVERDUE AND IS NOT CLAMPED. "0 days left" and "11 days late"
 * are different things to say to somebody, and a product that clamps says the
 * gentler one forever.
 */
export const daysLeft = (today: string, by: string): number => daysBetween(today, by);

/**
 * The plain date the week containing this one began on.
 *
 * ⚠️ WHICH DAY A WEEK STARTS ON IS A DECLARATION, NOT A CONSTANT. Monday in most
 * of Europe, Sunday in North America and much of the Middle East, Saturday in
 * several Gulf states — and a weekly report that picks one silently is one that
 * disagrees with the calendar on the reader's own wall. The manifest has carried
 * `format.weekStart` since the first app and every weekly read chose its own
 * boundary, which is worse than a wrong default: it is several of them.
 */
export function weekStarting(day: string, weekStart: 0 | 1 | 6): string {
  const at = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(at)) return day;
  const back = (new Date(at).getUTCDay() - weekStart + 7) % 7;
  return new Date(at - back * 86_400_000).toISOString().slice(0, 10);
}

/* ----------------------------------------------------------- how much of --- */

export interface Consistency {
  readonly done: number;
  readonly expected: number;
  /** 0–1, clamped. Null when nothing was asked for — see below. */
  readonly ratio: number | null;
}

/**
 * How much of what was asked for actually happened.
 *
 * ⚠️ NOTHING EXPECTED IS NOT ZERO PER CENT. Somebody who was asked for nothing
 * has not failed to do it, and a screen showing them at 0% is an accusation
 * about work nobody ever set. `null` is the honest answer and it forces whoever
 * renders it to say something else.
 */
export function consistency(done: number, expected: number): Consistency {
  if (!(expected > 0)) return { done, expected: 0, ratio: null };
  return { done, expected, ratio: Math.min(1, Math.max(0, done / expected)) };
}

/** What a weekly rate comes to over a window. A null rate is "nothing asked for". */
export function expectedOver(perWeek: number | null, days: number): number {
  if (perWeek === null || days <= 0) return 0;
  return Math.round((perWeek * days) / 7);
}

/* --------------------------------------------------------------- a score --- */

export interface Part {
  readonly name: string;
  /** Already normalised to 0–1 by whoever knows what it means. */
  readonly value: number;
}

export interface Score {
  /** 0–100, or null where there is not enough to say anything. */
  readonly score: number | null;
  /**
   * ⚠️ WHAT IT WAS COMPUTED FROM, AND IT TRAVELS WITH THE NUMBER. A score of 82
   * from one input looks exactly like a score of 82 from five, and the first is
   * somebody being told they are doing well on the strength of one good day.
   */
  readonly from: readonly string[];
  /** How much of the picture is present, 0–1. Renders as "based on 2 of 5". */
  readonly coverage: number;
}

/**
 * One number from several, honestly.
 *
 * ⚠️ AN AVERAGE OF WHAT IS PRESENT, NOT A SUM WITH ZEROS FOR THE REST. Treating
 * an absent input as zero punishes somebody for not recording, which is
 * precisely backwards: the periods people record least are the hard ones, so the
 * score falls hardest exactly when it is read most.
 *
 * ⚠️ AND BELOW THE MINIMUM THERE IS NO SCORE AT ALL. One input is not a picture,
 * and a number computed from one is one somebody will act on.
 */
export function scoreOf(parts: readonly Part[], outOf: number, minimum = 2): Score {
  const from = parts.map((p) => p.name);
  const coverage = outOf > 0 ? parts.length / outOf : 0;
  if (parts.length < minimum) return { score: null, from, coverage };
  const mean = parts.reduce((a, p) => a + clamp(p.value), 0) / parts.length;
  return { score: Math.round(mean * 100), from, coverage };
}

export const clamp = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/* --------------------------------------------------- over what was there --- */

/**
 * An average over the entries somebody actually recorded.
 *
 * ⚠️ DIVIDED BY THE DAYS WITH ENTRIES, NOT BY THE LENGTH OF THE WINDOW. Dividing
 * by the window turns "I recorded three days carefully" into a number that is
 * wrong, alarming, and produced by mistaking silence for absence. The count
 * travels with the average so whoever reads it can see how much it is worth.
 *
 * ⚠️ NULL RATHER THAN ZEROS WHERE NOTHING WAS RECORDED, because a mean of
 * nothing is not nothing — it is unanswerable, and every caller has to decide
 * what to say about that rather than being handed a confident row of zeros.
 */
export function meanOverRecorded<K extends string>(
  rows: readonly Readonly<Record<K, number>>[],
  recorded: (row: Readonly<Record<K, number>>) => boolean,
): { readonly mean: Readonly<Record<K, number>> | null; readonly days: number } {
  const kept = rows.filter(recorded);
  if (!kept.length) return { mean: null, days: 0 };
  const sum = {} as Record<K, number>;
  for (const row of kept) {
    for (const key of Object.keys(row) as K[]) sum[key] = (sum[key] ?? 0) + row[key];
  }
  for (const key of Object.keys(sum) as K[]) sum[key] = sum[key]! / kept.length;
  return { mean: sum, days: kept.length };
}
