/**
 * A MOMENT — punctuation, and the only thing above an outcome.
 *
 * Layer 1. Imports primitives.
 *
 * ⚠️ AN OUTCOME SAYS WHAT HAPPENED; A MOMENT SAYS THAT IT MATTERED. Most writes
 * deserve neither a sound nor an animation — a row appearing is its own feedback,
 * and a product that celebrates a saved field has no way left to celebrate
 * anything else. The vocabulary is four words because a fifth would be a shade
 * of one of them, and shades are how "significant" comes to mean "any write".
 *
 * ⚠️ AND A MOMENT NEVER REPORTS A FAILURE. A failure is a `Problem`: a code,
 * copy, a status and a way out. Dressing one in this vocabulary is how a product
 * ends up playing a chime over somebody's lost work — so `error` and `alert` are
 * sounds a moment cannot reach, and a `danger` tone may not carry one at all.
 */

import type { Tone } from "./primitives.js";

/* ---------------------------------------------------------- the four --- */

/**
 * ⚠️ CLOSED, AND ORDERED BY WEIGHT. The order is not decoration: two things can
 * land in one response — a save that also completed a milestone — and something
 * has to decide which one the person sees. See `strongest`.
 */
export const MOMENTS = ["acknowledge", "welcome", "farewell", "celebrate"] as const;
export type MomentId = (typeof MOMENTS)[number];

/**
 * ⚠️ SEMANTIC INTENT, AND THE PLATFORM OWNS THE AUDIO — an app names a moment
 * and never ships a file, exactly as it names a role and never a colour.
 */
export type SoundId = "commit" | "arrive" | "depart" | "earn" | "error" | "alert" | "scan";

/**
 * ⚠️ DERIVED, NEVER CHOSEN BESIDE IT. An app that picked a moment AND a sound
 * could pair a celebration with the error chime — and would, the first time
 * somebody copied a declaration and edited half of it. There is no field to get
 * out of step because there is no field.
 *
 * `error`, `alert` and `scan` are deliberately unreachable from here: the first
 * two belong to problems, and the third to a piece of hardware finishing its
 * job, which is not a moment in somebody's day.
 */
export const SOUND_OF: Readonly<Record<MomentId, SoundId>> = {
  acknowledge: "commit",
  welcome: "arrive",
  farewell: "depart",
  celebrate: "earn",
};

/**
 * Which of two moments the person actually sees.
 *
 * ⚠️ ONE AT A TIME, AND THE HEAVIER WINS — never a queue. A queue is how a batch
 * import produces four celebrations in a row, each one meaning less than the
 * last; and "saved" is not news standing next to "you earned something".
 */
export function strongest(a: MomentId | undefined, b: MomentId | undefined): MomentId | undefined {
  if (!a) return b;
  if (!b) return a;
  return MOMENTS.indexOf(a) >= MOMENTS.indexOf(b) ? a : b;
}

/* ----------------------------------------------------------- the check --- */

/**
 * ⚠️ AN OUTCOME MESSAGE IS ONE LINE, AND NOW IT TRAVELS IN A HEADER.
 *
 * It was always meant to be one line — it is read in passing, often while
 * something else is being looked at. The cap is enforced rather than advised
 * because the transport has one: a paragraph in a response header is silently
 * truncated by an intermediary, and the failure is copy that stops mid-sentence
 * in production and is complete in every test.
 */
export const OUTCOME_MESSAGE_MAX = 80;

export interface MomentProblem {
  readonly id: string;
  readonly why: string;
}

interface Declared {
  readonly id: string;
  readonly outcome?: {
    readonly message: string;
    readonly tone: Tone;
    readonly moment?: MomentId;
  };
}

/**
 * What an app may not say about its own punctuation.
 *
 * ⚠️ `celebrate` IS NOT AN APP'S TO DECLARE. It belongs to a milestone, which is
 * a rule over an event, declared once, checked at composition, and earned once
 * per person for the rest of their account. An operation that could celebrate on
 * every call is the leaderboard problem arriving through a different door — and
 * the first one written would be on whatever the product most wants people to do.
 */
export function momentProblems(operations: readonly Declared[]): readonly MomentProblem[] {
  const out: MomentProblem[] = [];
  for (const op of operations) {
    const outcome = op.outcome;
    if (!outcome) continue;
    const say = (why: string) => out.push({ id: op.id, why });

    if (outcome.message.trim().length === 0) say("has an outcome with nothing to say");
    if (outcome.message.length > OUTCOME_MESSAGE_MAX) {
      say(`has an outcome message of ${outcome.message.length} characters, over the ${OUTCOME_MESSAGE_MAX} an outcome may be`);
    }
    if (!outcome.moment) continue;

    if (outcome.moment === "celebrate") {
      say("celebrates. A celebration belongs to a milestone — earned once, from a rule over an event — not to an operation that can run all day");
    }
    /*
      ⚠️ A MOMENT OVER A `danger` TONE IS A CHIME OVER SOMEBODY'S LOST WORK. The
      tone already says this is the destructive one; punctuating it is the
      product being pleased about it.
    */
    if (outcome.tone === "danger") say("punctuates a danger outcome, which is a celebration of something going wrong");
  }
  return out;
}
