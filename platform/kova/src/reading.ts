/**
 * READING A PERSON — the arithmetic behind what a coach is shown.
 *
 * ⚠️ NO I/O, NO RUNTIME, NO MANIFEST. Layer 3, beside `nutrition.ts` and
 * `goals.ts`.
 *
 * Everything here turns records somebody already made into something worth
 * acting on. None of it is stored: a report that is a table is a report that is
 * wrong the moment anybody corrects anything, and it is wrong silently.
 */

/* ------------------------------------------------------------- strength --- */

export interface Effort {
  readonly load: number;
  readonly reps: number;
}

/**
 * ⚠️ A HEAVIER SET IS NOT A BETTER SET. Eighty kilos for one and seventy for
 * eight are not comparable by load, and a "best" that sorts on weight alone
 * tells somebody their hardest session was their easiest. Epley's estimate puts
 * both on one axis, which is the only way a personal best across a year of
 * mixed rep ranges means anything.
 *
 * ⚠️ AND IT IS AN ESTIMATE THAT DEGRADES. Past about twelve reps the formula
 * flatters high-rep work badly — so `beyond` says so rather than the product
 * quietly claiming somebody's twenty-rep set was a record.
 */
export const RELIABLE_REPS = 12;

export interface Estimate {
  readonly value: number;
  /** ⚠️ True when the rep count is past where the formula is trustworthy. */
  readonly beyond: boolean;
}

export function estimatedMax(set: Effort): Estimate {
  /* A set of nothing is not a set. Zero rather than a division or a flatter. */
  if (!(set.load > 0) || !(set.reps > 0)) return { value: 0, beyond: false };
  /* One rep IS the maximum — no estimate, no inflation. */
  if (set.reps === 1) return { value: set.load, beyond: false };
  return { value: set.load * (1 + set.reps / 30), beyond: set.reps > RELIABLE_REPS };
}

export interface Best<T> {
  readonly of: T;
  readonly estimate: Estimate;
}

/**
 * The best set of a group, by what it is worth rather than by what it weighed.
 *
 * ⚠️ IT RETURNS THE SET, NOT THE ESTIMATE. A coach wants to see "100 × 5", which
 * is what happened; the estimate is how it was chosen, and showing it instead is
 * a product telling somebody they lifted a number they never touched.
 */
export function bestOf<T extends Effort>(sets: readonly T[]): Best<T> | null {
  let best: Best<T> | null = null;
  for (const set of sets) {
    const estimate = estimatedMax(set);
    if (estimate.value <= 0) continue;
    if (!best || estimate.value > best.estimate.value) best = { of: set, estimate };
  }
  return best;
}

/* ---------------------------------------------------------- consistency --- */

export interface Consistency {
  readonly done: number;
  readonly expected: number;
  /** 0–1, clamped. Null when nothing was asked for — see below. */
  readonly ratio: number | null;
}

/**
 * How much of what was asked for actually happened.
 *
 * ⚠️ NOTHING EXPECTED IS NOT ZERO PER CENT. A person with no programme has not
 * failed to follow one, and a dashboard that shows them at 0% is accusing
 * somebody of missing sessions nobody ever prescribed. `null` is the honest
 * answer and it forces the reader to say something else.
 */
export function consistency(done: number, expected: number): Consistency {
  if (!(expected > 0)) return { done, expected: 0, ratio: null };
  return { done, expected, ratio: Math.min(1, Math.max(0, done / expected)) };
}

/**
 * How many sessions a week a programme asks for.
 *
 * ⚠️ NULL WHEN THE BODY DOES NOT SAY, AND THAT IS NOT THE SAME AS ZERO. A
 * programme with no days in it, or one written in a shape this cannot read, has
 * asked for nothing — and `consistency` reports that as "nothing was asked for"
 * rather than as nought per cent. Returning 0 here would accuse somebody of
 * missing sessions that a parsing failure invented.
 *
 * ⚠️ AND IT IS AVERAGED ACROSS THE WEEKS RATHER THAN TAKEN FROM THE FIRST. A
 * four-week block that deloads in week four asks for less than its first week
 * does, and measuring against week one tells somebody they fell behind by
 * following the plan.
 */
export function prescribedPerWeek(body: unknown): number | null {
  if (!Array.isArray(body) || body.length === 0) return null;
  let days = 0;
  for (const week of body) {
    const list = (week as { days?: unknown })?.days;
    if (!Array.isArray(list)) continue;
    days += list.filter((d) => {
      const items = (d as { items?: unknown })?.items;
      return Array.isArray(items) && items.length > 0;
    }).length;
  }
  return days === 0 ? null : days / body.length;
}

/** What that comes to over a window. Zero expected is "nothing asked for". */
export function expectedOver(perWeek: number | null, days: number): number {
  if (perWeek === null || days <= 0) return 0;
  return Math.round((perWeek * days) / 7);
}

/**
 * How long until the first thing somebody holds runs out.
 *
 * ⚠️ THE SOONEST, NOT THE HEADLINE. The headline runway is a MAXIMUM across
 * scopes, which is the right number to show the person themselves — and exactly
 * the wrong one for a coach, because somebody with sixty days of training and
 * two of nutrition reads as sixty days covered. What needs acting on is the one
 * that ends first.
 *
 * Null when they hold nothing: there is no expiry to warn about, and a zero
 * would put every client who never bought anything at the top of the list.
 */
export function soonest(byScope: Readonly<Record<string, number>>): number | null {
  const days = Object.values(byScope);
  return days.length ? Math.min(...days) : null;
}

/* ------------------------------------------------------------ attention --- */

/**
 * ⚠️ A CLOSED SET, ORDERED BY URGENCY, AND THE ORDER IS THE PRODUCT DECISION.
 *
 * Somebody who reached out and got nothing back is the most urgent person on a
 * coach's list — more urgent than somebody who has simply gone quiet, because
 * one of them is waiting on US. A ranking that sorted by days-since-anything
 * would bury them under people who never wrote.
 */
export const REASONS = ["unanswered", "overdue", "quiet", "ending"] as const;
export type Reason = (typeof REASONS)[number];

export interface Watch {
  readonly reason: Reason;
  /** How many days it has been true. Bigger is worse WITHIN a reason, never across. */
  readonly days: number;
}

export interface Facts {
  /**
   * Days of silence.
   *
   * ⚠️ NOT NULLABLE, AND THAT IS THE POINT. Somebody who has never recorded
   * anything is the quietest person on a roster, and a fact that says "no data"
   * reads as "nothing to report" — so silence is counted from their last
   * activity, or from the day they joined when there has never been one.
   */
  readonly quietFor: number;
  /** Days a check-in of theirs has been waiting for a reply. */
  readonly unansweredFor: number | null;
  /** Days past a goal's date, when it has not been reached. */
  readonly overdueBy: number | null;
  /** Days until their access runs out, when that is soon. */
  readonly endingIn: number | null;
  /**
   * ⚠️ Days since they joined. Somebody new is not somebody quiet — and this is
   * NOT implied by `quietFor`, because a coach onboarding somebody enters the
   * training they already did. Back-dated history makes a person who joined on
   * Tuesday look silent for months.
   */
  readonly joinedAgo: number;
}

/** How long somebody may be new before silence starts to mean something. */
export const SETTLING_DAYS = 7;
/** How long silence has to run before it is worth a coach's attention. */
export const QUIET_DAYS = 10;

/**
 * Why this person needs a coach today, most urgent first.
 *
 * ⚠️ A NEW PERSON IS NOT A QUIET PERSON. Somebody who joined on Tuesday has not
 * gone silent by Thursday, and a list that says they have teaches a coach to
 * ignore it — which costs the one person who really has stopped.
 */
export function watchesFor(facts: Facts): readonly Watch[] {
  const out: Watch[] = [];
  if (facts.unansweredFor !== null && facts.unansweredFor >= 1) out.push({ reason: "unanswered", days: facts.unansweredFor });
  if (facts.overdueBy !== null && facts.overdueBy >= 1) out.push({ reason: "overdue", days: facts.overdueBy });
  if (facts.joinedAgo > SETTLING_DAYS && facts.quietFor >= QUIET_DAYS) {
    out.push({ reason: "quiet", days: facts.quietFor });
  }
  if (facts.endingIn !== null && facts.endingIn <= 7) out.push({ reason: "ending", days: facts.endingIn });
  return out.sort((a, b) => REASONS.indexOf(a.reason) - REASONS.indexOf(b.reason));
}

export interface Needs<T> {
  readonly who: T;
  readonly watches: readonly Watch[];
}

/**
 * The roster, narrowed to the people who need something, most urgent first.
 *
 * ⚠️ ORDERED BY THE WORST REASON, NOT BY HOW MANY. Somebody with one unanswered
 * check-in comes before somebody with three mild ones — a count would sort by
 * volume, and volume is not urgency. Ties break on how long it has been true.
 */
export function needing<T>(people: readonly { readonly who: T; readonly facts: Facts }[]): readonly Needs<T>[] {
  return people
    .map(({ who, facts }) => ({ who, watches: watchesFor(facts) }))
    .filter((n) => n.watches.length > 0)
    .sort((a, b) => {
      const rank = REASONS.indexOf(a.watches[0]!.reason) - REASONS.indexOf(b.watches[0]!.reason);
      return rank !== 0 ? rank : b.watches[0]!.days - a.watches[0]!.days;
    });
}
