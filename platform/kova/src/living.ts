/**
 * HOW A WEEK WENT, AND WHERE A FAST HAS GOT TO — pure, because both are
 * arithmetic somebody reads about their own body.
 *
 * ⚠️ NEITHER OF THESE MAY INVENT A NUMBER. A wellness score computed from two
 * inputs and presented like one computed from five is a person told they are
 * doing well on the strength of a single good night's sleep; a fasting zone
 * asserted from a clock nobody started is a physiological claim about somebody
 * who has eaten. Both say what they were computed FROM.
 */

import { scoreOf, type Part, type Score } from "@one/kernel";

/* --------------------------------------------------------------- fasting --- */

/**
 * ⚠️ ZONES ARE A DESCRIPTION, NOT A PROMISE. What the body is doing at hour
 * sixteen varies by person, by meal, by training and by sleep — so these are the
 * ordinary account of a fast, in hours, and the copy says so. A product that
 * asserted "you are now in autophagy" would be making a clinical claim from a
 * timer.
 *
 * ⚠️ AND THE LAST ZONE HAS NO UPPER BOUND, deliberately. A fast somebody forgot
 * to stop should read as a long fast rather than falling off the end into
 * "unknown" — the number they need to see is how long it has been.
 */
export interface Zone {
  readonly id: string;
  readonly fromHours: number;
  readonly label: string;
  /** One line, in the words of somebody who is hungry. No clinical claims. */
  readonly says: string;
}

export const FASTING_ZONES: readonly Zone[] = [
  { id: "fed", fromHours: 0, label: "Fed", says: "Still digesting what you last ate." },
  { id: "early", fromHours: 4, label: "Early fast", says: "Blood sugar settling back down." },
  { id: "burning", fromHours: 12, label: "Fat burning", says: "Glycogen is low, so more energy is coming from fat." },
  { id: "deep", fromHours: 16, label: "Deep fast", says: "The point most people are aiming for." },
  { id: "long", fromHours: 24, label: "Long fast", says: "A day in. Worth telling your coach." },
];

/**
 * Where a fast has got to.
 *
 * ⚠️ AN UNSTARTED OR FUTURE FAST IS `null`, NOT ZONE ONE. Returning the first
 * zone for a fast nobody began is a screen that says "Fed — still digesting"
 * to somebody who has not started, which reads as a working timer at hour zero
 * and stays there.
 */
export function zoneAt(startedAt: string, now: string): { readonly zone: Zone; readonly hours: number } | null {
  const from = Date.parse(startedAt);
  const at = Date.parse(now);
  if (!Number.isFinite(from) || !Number.isFinite(at) || at < from) return null;
  const hours = (at - from) / 3_600_000;
  let zone = FASTING_ZONES[0]!;
  for (const z of FASTING_ZONES) if (hours >= z.fromHours) zone = z;
  return { zone, hours: Math.floor(hours * 10) / 10 };
}

/**
 * ⚠️ A FAST THAT IS OVER IS MEASURED FROM ITS OWN END, not from now. A finished
 * fast whose length kept growing on the screen is a record that disagrees with
 * itself the next time it is read.
 */
export const lengthOf = (startedAt: string, endedAt: string | null, now: string): number | null => {
  const at = endedAt ?? now;
  const out = zoneAt(startedAt, at);
  return out ? out.hours : null;
};

/* --------------------------------------------------------------- wellness --- */

/**
 * What was actually recorded this week, out of what could have been.
 *
 * ⚠️ EVERY FIELD IS OPTIONAL AND THAT IS THE POINT. Somebody who logs sleep and
 * nothing else has told us one thing, and the score has to be honest about being
 * a score of one thing.
 */
export interface Week {
  /** 1–5, as recorded. */
  readonly sleep?: readonly number[];
  readonly mood?: readonly number[];
  readonly energy?: readonly number[];
  /** Sessions done against sessions asked for. */
  readonly sessions?: { readonly done: number; readonly expected: number };
  /** Days any food was logged, out of seven. */
  readonly loggedDays?: number;
}

export type Wellness = Score;


/**
 * ⚠️ FIVE PARTS, AND WHICH FIVE IS THIS PRODUCT'S ONLY CONTRIBUTION. The rule —
 * an average of what is present, no score below two inputs, and the coverage
 * travelling with the number — is `scoreOf`'s, in the kernel, because every
 * product that summarises a period into one number gets it wrong the same way.
 */
const PARTS = 5;

export function wellnessOf(week: Week): Wellness {
  const parts: Part[] = [];

  const rating = (name: string, values: readonly number[] | undefined) => {
    if (!values || values.length === 0) return;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    /* 1–5 becomes 0–1: a 3 is the middle, not 60%. */
    parts.push({ name, value: (mean - 1) / 4 });
  };
  rating("sleep", week.sleep);
  rating("mood", week.mood);
  rating("energy", week.energy);

  if (week.sessions && week.sessions.expected > 0) {
    parts.push({ name: "training", value: week.sessions.done / week.sessions.expected });
  }
  if (week.loggedDays !== undefined) {
    parts.push({ name: "eating", value: week.loggedDays / 7 });
  }

  return scoreOf(parts, PARTS);
}

