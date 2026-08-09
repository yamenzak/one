/**
 * THE HELP CENTRE — written for the person using the product, and checked.
 *
 * Layer 3. Imports primitives, problem, collection.
 *
 * ⚠️ HELP IS DECLARED IN THE MANIFEST, NOT KEPT IN A WIKI. A wiki is a place
 * where documentation goes to describe a version of the product that no longer
 * exists: nothing links it to a screen, nothing fails when a screen is renamed,
 * and nobody finds out it is wrong except the person who followed it.
 *
 * Here an article names the surfaces it explains, a failure names the article
 * that helps with it, and both are resolved when the app is composed — so a
 * cross-link to an article that does not exist, and an article about a screen
 * the app does not have, are refusals rather than disappointments.
 */

import type { CollectionSpec } from "./collection.js";

/* ------------------------------------------------------------- the limits --- */

/**
 * ⚠️ LENGTH IS A CORRECTNESS PROPERTY HERE, NOT A STYLE ONE.
 *
 * Help is read by somebody who is stuck, on a phone, in the middle of something
 * else. Past a screenful they stop reading and ask a human, which is the
 * outcome the article existed to prevent — so a long article is not a thorough
 * article, it is a failed one. The ceiling is deliberately uncomfortable.
 */
export const LIMITS = { title: 60, body: 900, steps: 7 } as const;

/**
 * ⚠️ WORDS THAT MEAN THE ARTICLE WAS WRITTEN FOR US.
 *
 * Every one of these is a word whose presence says the author was describing the
 * implementation rather than the task. "The endpoint returns null" is true and
 * unusable; "nothing is saved until you press Save" is the same fact for the
 * person who has to act on it.
 *
 * It is a small closed list on purpose. A large one becomes a thesaurus fight in
 * review; these nine are unambiguous, and catching them catches the habit.
 */
export const DEVELOPER_WORDS = [
  "endpoint", "payload", "null", "boolean", "schema", "webhook", "parameter", "enum", "database",
] as const;

/* ------------------------------------------------------------ the article --- */

export interface HelpArticle {
  readonly title: string;
  /** One short paragraph. What this is and when somebody would want it. */
  readonly body: string;
  /** Numbered, imperative, and few. An eighth step is a sign of a missing feature. */
  readonly steps?: readonly string[];
  /**
   * The collections this explains, so help can be OFFERED from a surface rather
   * than searched for. A name the manifest does not declare is refused.
   */
  readonly surfaces?: readonly string[];
}

export type HelpRegistry = Readonly<Record<string, HelpArticle>>;

export interface HelpProblem {
  readonly id: string;
  readonly why: string;
}

/**
 * Everything wrong with an app's help, in one pass.
 *
 * ⚠️ RETURNED RATHER THAN THROWN, so composition can report all of them at once.
 * A check that stops at the first failure turns fixing a manifest into a
 * conversation of one sentence at a time.
 */
export function helpProblems(registry: HelpRegistry, collections: readonly CollectionSpec[]): readonly HelpProblem[] {
  const known = new Set(collections.map((c) => c.id));
  const out: HelpProblem[] = [];

  for (const [id, article] of Object.entries(registry)) {
    const say = (why: string) => out.push({ id, why });

    if (!article.title.trim()) say("has no title");
    else if (article.title.length > LIMITS.title) say(`title is ${article.title.length} characters, over ${LIMITS.title}`);

    if (!article.body.trim()) say("has no body");
    else if (article.body.length > LIMITS.body) say(`body is ${article.body.length} characters, over ${LIMITS.body} — past a screenful nobody reads it`);

    if ((article.steps?.length ?? 0) > LIMITS.steps) say(`has ${article.steps!.length} steps, over ${LIMITS.steps} — an eighth step is a missing feature`);

    const prose = `${article.title} ${article.body} ${(article.steps ?? []).join(" ")}`.toLowerCase();
    for (const word of DEVELOPER_WORDS) {
      if (new RegExp(`\\b${word}s?\\b`).test(prose)) say(`says "${word}", which describes the implementation rather than the task`);
    }

    for (const surface of article.surfaces ?? []) {
      if (!known.has(surface)) say(`explains "${surface}", which this app does not declare`);
    }
  }
  return out;
}

/**
 * Help ids named somewhere and declared nowhere.
 *
 * ⚠️ THE FAILURE IS A LINK THAT GOES NOWHERE AT THE WORST MOMENT. A `help`
 * cross-link is rendered beside an error, so the person following it is already
 * stuck — and a 404 there is the second failure in a row, which is where people
 * stop trying.
 */
export function danglingHelp(registry: HelpRegistry, referenced: readonly string[]): readonly string[] {
  return [...new Set(referenced.filter((id) => !(id in registry)))];
}
