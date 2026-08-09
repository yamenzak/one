/**
 * RECOGNITION — what somebody has done, noticed.
 *
 * Layer 1. Imports primitives.
 *
 * ⚠️ IT CONSUMES `emits`, WHICH IS WHY IT BELONGS TO THE PLATFORM. The event
 * stream already exists, is already declared, and is already checked against the
 * notification registry — so a milestone is a rule over something that is true
 * rather than a second set of instrumentation somebody has to remember to call.
 * The RULES are the app's: "seven sessions in a row" means nothing to a signage
 * product, and the engine does not care.
 *
 * ⚠️ AND IT IS RECOGNITION, NOT SCORE.
 *
 * A points total invites a leaderboard, a leaderboard invites comparison between
 * customers, and comparison between people being coached through their own
 * bodies is a product decision with consequences nobody asked for. There is no
 * total here and no ranking — a milestone is a person against themselves, and
 * the only comparison available is with who they were last month.
 */

import type { Instant, PlainDate } from "./primitives.js";

/* -------------------------------------------------------------- the rule --- */

/**
 * ⚠️ A CLOSED SET, AND EVERY MEMBER IS COMPUTABLE FROM ONE COUNTER.
 *
 * An escape hatch — a predicate the app supplies — would be a rule nobody can
 * explain to the person who earned it, and the first one written would read a
 * table the engine knows nothing about. Three shapes cover everything three
 * products wanted; a fourth is a decision, made in the open.
 */
export type Rule =
  /** The first one, ever. The moment a feature stops being theoretical. */
  | { readonly kind: "first"; readonly event: string }
  /** How many, ever. */
  | { readonly kind: "count"; readonly event: string; readonly reaches: number }
  /** Consecutive DAYS with at least one. Not occurrences — days. */
  | { readonly kind: "streak"; readonly event: string; readonly days: number };

export interface MilestoneDef {
  /** What it is called, to the person who earned it. Warm, short, theirs. */
  readonly title: string;
  readonly body?: string;
  readonly icon: string;
  readonly rule: Rule;
  /** Who can earn it. A milestone for everybody is one that means nothing. */
  readonly roles: readonly string[];
}

export type MilestoneRegistry = Readonly<Record<string, MilestoneDef>>;

/**
 * ⚠️ THE NOTIFICATION AN APP MUST DECLARE IF IT HAS MILESTONES, named here so
 * every product uses one word for it. Earning something and being told about it
 * are the same moment; a milestone nobody is told about is a row in a table.
 */
export const MILESTONE_EARNED = "milestone.earned";

/* ------------------------------------------------------------- the tally --- */

/**
 * ⚠️ A TALLY, NOT A SUM OVER EVENTS, AND THE DISTINCTION FROM THE LEDGER IS
 * DELIBERATE.
 *
 * A balance is summed from entries because a lost write must be recoverable and
 * because somebody may have to audit it — it is money. Recognition is not: the
 * alternative to a counter is retaining every event a person ever caused,
 * forever, so that a streak can be recomputed. The cost of a lost increment is
 * one day of a streak; the cost of retaining the other thing is a permanent
 * record of everything anybody did.
 */
export interface Tally {
  readonly count: number;
  readonly streak: number;
  /** ⚠️ THE PERSON'S OWN DAY. See `advance`. */
  readonly lastDay: PlainDate | null;
}

export const NOTHING_YET: Tally = { count: 0, streak: 0, lastDay: null };

const dayAfter = (day: PlainDate): string =>
  new Date(Date.parse(`${day}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * One more occurrence, on the day it happened where the person was standing.
 *
 * ⚠️ THE DAY IS THEIRS, NOT UTC. A boundary at midnight UTC is four in the
 * afternoon in California — so a streak computed in UTC breaks halfway through
 * somebody's day, and they lose it having done nothing wrong. This takes the
 * date already resolved in their own zone, which is the only version of "day"
 * that means anything to the person being recognised.
 *
 * ⚠️ AND A SECOND OCCURRENCE ON THE SAME DAY DOES NOT EXTEND A STREAK. A streak
 * counts days, not enthusiasm; letting it count occurrences turns it into a
 * volume score, which is the thing this whole file avoids.
 */
export function advance(tally: Tally, today: PlainDate): Tally {
  const count = tally.count + 1;
  if (!tally.lastDay) return { count, streak: 1, lastDay: today };
  if (tally.lastDay === today) return { ...tally, count };
  if (dayAfter(tally.lastDay) === today) return { count, streak: tally.streak + 1, lastDay: today };
  /*
    ⚠️ A GAP RESTARTS AT ONE, NOT AT ZERO. Today still happened, and telling
    somebody who came back after a week that their streak is zero is a product
    describing their absence rather than their return.
  */
  return { count, streak: 1, lastDay: today };
}

/* ------------------------------------------------------------ the earning --- */

/**
 * Which milestones this tally has just satisfied.
 *
 * ⚠️ PURE, AND IT DOES NOT KNOW WHAT WAS ALREADY EARNED. The caller holds that,
 * because "already earned" is storage and this is arithmetic — and keeping them
 * apart is what makes every rule testable without a database.
 */
/**
 * ⚠️ EARNED ONCE, PERMANENTLY. Nothing in this file revokes: a milestone that can
 * be lost is a punishment, a streak that already broke is punishment enough, and
 * the badge records that it HAPPENED — which stays true afterwards.
 */
export function satisfied(
  registry: MilestoneRegistry,
  event: string,
  role: string,
  tally: Tally,
): readonly string[] {
  return Object.entries(registry)
    .filter(([, def]) => def.rule.event === event && def.roles.includes(role))
    .filter(([, def]) => {
      switch (def.rule.kind) {
        case "first": return tally.count >= 1;
        case "count": return tally.count >= def.rule.reaches;
        case "streak": return tally.streak >= def.rule.days;
      }
    })
    .map(([id]) => id);
}

/* -------------------------------------------------------------- the check --- */

export interface MilestoneProblem {
  readonly id: string;
  readonly why: string;
}

/**
 * ⚠️ A RULE OVER AN EVENT NOTHING RAISES IS A MILESTONE NOBODY CAN EARN, and it
 * looks exactly like one that is merely hard. Somebody works towards it forever.
 */
export function milestoneProblems(
  registry: MilestoneRegistry,
  raised: readonly string[],
  /**
   * ⚠️ THE ANNOUNCEMENT ITSELF, PASSED IN — not the registry it lives in.
   * Reading the registry here would put this file above `notify`, and it does
   * not need to be: the only question is who `milestone.earned` reaches.
   */
  announcement: { readonly roles: readonly string[] } | undefined,
): readonly MilestoneProblem[] {
  const events = new Set(raised);
  const out: MilestoneProblem[] = [];

  for (const [id, def] of Object.entries(registry)) {
    if (!events.has(def.rule.event)) out.push({ id, why: `waits for "${def.rule.event}", which nothing in this app raises` });
    if (def.roles.length === 0) out.push({ id, why: "is for nobody" });
    if (!def.title.trim()) out.push({ id, why: "has no title" });
    if (def.rule.kind === "count" && def.rule.reaches < 2) {
      out.push({ id, why: "counts to fewer than two — use `first`, which says what it means" });
    }
    if (def.rule.kind === "streak" && def.rule.days < 2) {
      out.push({ id, why: "is a streak of one day, which is not a streak" });
    }
    /*
      ⚠️ AND THE ANNOUNCEMENT HAS TO REACH THE PERSON WHO EARNED IT. A
      notification is delivered by ROLE, so a milestone a client can earn and an
      announcement addressed to owners is earned in silence — which looks
      identical to a rule that never fired, from every side.
    */
    if (announcement) {
      const unreachable = def.roles.filter((role) => !announcement.roles.includes(role));
      if (unreachable.length) {
        out.push({ id, why: `is earnable by ${unreachable.join(", ")}, whom "${MILESTONE_EARNED}" is not addressed to` });
      }
    }
  }

  /*
    ⚠️ EARNING SOMETHING AND BEING TOLD ABOUT IT ARE THE SAME MOMENT. A milestone
    with nothing to announce it is a row in a table — earned in silence, at the
    exact moment a person would most like to hear something.
  */
  if (Object.keys(registry).length && !announcement) {
    out.push({ id: MILESTONE_EARNED, why: "is not declared, so nothing announces anything anybody earns" });
  }
  return out;
}

/* ------------------------------------------------------------- the shelf --- */

/**
 * ⚠️ WHAT ONE PERSON HAS, AND WHAT THEY ARE PART-WAY THROUGH — never what anybody
 * else has. There is no argument here for a second person, which is what keeps
 * the comparison this file refuses from being one field away.
 */
export interface Recognition {
  readonly id: string;
  readonly title: string;
  readonly body?: string;
  readonly icon: string;
  readonly earned: boolean;
  readonly at?: Instant;
  /** Progress in the rule's own units — occurrences for `count`, days for `streak`. */
  readonly have: number;
  readonly need: number;
}

const needOf = (rule: Rule): number => (rule.kind === "count" ? rule.reaches : rule.kind === "streak" ? rule.days : 1);
const haveOf = (rule: Rule, tally: Tally): number => (rule.kind === "streak" ? tally.streak : tally.count);

/**
 * One person's shelf.
 *
 * ⚠️ PURE, AND ORDERED SO THE NEXT ONE IS VISIBLE. Earned first, most recent
 * first — a shelf is a record of what happened. Then the unearned, NEAREST
 * first, because the only useful thing to say about an unearned milestone is
 * how close it is; ordering them by declaration buries the one somebody is two
 * days away from under nine they have not started.
 */
export function recognitionsFor(
  registry: MilestoneRegistry,
  role: string,
  tallies: Readonly<Record<string, Tally>>,
  earned: Readonly<Record<string, Instant>>,
): readonly Recognition[] {
  const mine = Object.entries(registry).filter(([, def]) => def.roles.includes(role));
  const rows = mine.map(([id, def]): Recognition => {
    const tally = tallies[def.rule.event] ?? NOTHING_YET;
    const need = needOf(def.rule);
    const at = earned[id];
    return {
      id,
      title: def.title,
      ...(def.body ? { body: def.body } : {}),
      icon: def.icon,
      earned: at !== undefined,
      ...(at !== undefined ? { at } : {}),
      /*
        ⚠️ CLAMPED AT WHAT IT NEEDED. A streak that broke after an award would
        otherwise report less progress than the thing already earned, which reads
        as the milestone being taken back.
      */
      have: Math.min(at !== undefined ? need : haveOf(def.rule, tally), need),
      need,
    };
  });

  const done = rows.filter((r) => r.earned).sort((a, b) => (a.at! < b.at! ? 1 : a.at! > b.at! ? -1 : 0));
  const todo = rows.filter((r) => !r.earned).sort((a, b) => b.have / b.need - a.have / a.need);
  return [...done, ...todo];
}
