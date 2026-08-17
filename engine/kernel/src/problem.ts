/**
 * WHAT A REFUSAL SAYS, AND WHO IT SAYS IT TO.
 *
 * ⚠️ A REFUSAL IS A SENTENCE SOMEBODY READS, NOT A STATUS CODE. `403` tells a
 * person nothing they can act on; "your plan includes 5 seats and 5 are in use"
 * tells them exactly what to do. So a problem carries the VALUES the sentence
 * needs — and a problem raised without them renders "your plan includes
 * undefined", which is what a real product shipped to real people.
 *
 * ⚠️ AND THE PROSE IS OURS, NEVER A PROVIDER'S. An error from a mail service, a
 * payment gateway or a model provider is written for whoever operates it. Put on
 * a screen it is at best confusing and at worst a leak; the reference is what
 * connects the two, and it is the only part a person is asked to quote.
 *
 * Layer 1. Imports primitives.
 */

import type { Tone } from "./primitives.js";

export interface ProblemDef {
  /** HTTP status. The machine's half. */
  readonly status: number;
  /** One line, ours, in the reader's terms. Interpolates `{token}`. */
  readonly title: string;
  /** What to do about it, where there is something. */
  readonly detail?: string;
  /**
   * ⚠️ WHETHER TRYING AGAIN COULD PLAUSIBLY WORK, stated rather than guessed.
   * A client retrying a `platform.forbidden` is a client hammering a door that
   * will never open; one that gives up on a `platform.unavailable` has turned a
   * blip into a failure.
   */
  readonly retryable: boolean;
  readonly tone: Tone;
}

export interface Problem {
  readonly code: string;
  readonly status: number;
  readonly title: string;
  readonly detail?: string;
  readonly retryable: boolean;
  readonly tone: Tone;
  /** Per field, so a form can put the message beside the input it belongs to. */
  readonly fields?: Readonly<Record<string, string>>;
  /**
   * ⚠️ THE ONE THING A PERSON IS ASKED TO QUOTE. It is in the log beside the
   * cause, so support can find in seconds what would otherwise be a
   * conversation. Absent, every report starts with "it said something went
   * wrong".
   */
  readonly ref?: string;
}

export type ProblemCatalog = Readonly<Record<string, ProblemDef>>;

/**
 * ⚠️ EVERY REFUSAL THE PLATFORM ITSELF CAN MAKE, IN ONE PLACE. An app adds its
 * own; it may not redefine one of these, because a product that reworded
 * "payment required" could describe its own arrears as something else.
 */
export const PLATFORM_PROBLEMS: ProblemCatalog = {
  "platform.invalid": {
    status: 400, retryable: false, tone: "warning",
    title: "That does not look right",
    detail: "Check the highlighted fields and try again.",
  },
  "platform.unauthorized": {
    status: 401, retryable: false, tone: "warning",
    title: "Sign in to continue",
  },
  "platform.forbidden": {
    status: 403, retryable: false, tone: "danger",
    title: "You do not have access to that",
  },
  "platform.not_found": {
    status: 404, retryable: false, tone: "neutral",
    title: "That is not here",
  },
  "platform.conflict": {
    status: 409, retryable: false, tone: "warning",
    title: "Something else changed first",
    detail: "Reload and have another look before trying again.",
  },
  /* ⚠️ Ours, not theirs: nobody reading this did anything, and nobody can pay
     to end it. The one problem that names the platform as the cause. */
  "platform.maintenance": {
    status: 503, retryable: true, tone: "warning",
    title: "One is being looked after",
    detail: "Everything is safe where you left it. Try again shortly.",
  },
  "platform.too_many": {
    status: 429, retryable: true, tone: "warning",
    title: "Too quickly",
    detail: "Try again in {retryAfter} seconds.",
  },
  /*
    ⚠️ THE TWO NUMBERS ARE THE MESSAGE. Raised without them this renders "your
    plan includes undefined, and undefined are in use", which is what somebody
    hitting a seat limit actually read. A problem's values are not decoration —
    they ARE the sentence.
  */
  "platform.quota_reached": {
    status: 402, retryable: false, tone: "warning",
    title: "Your plan includes {limit}, and {used} are in use",
    detail: "Change your plan, or free one up.",
  },
  "platform.payment_required": {
    status: 402, retryable: false, tone: "warning",
    title: "This needs a plan that includes it",
  },
  /*
    ⚠️ A DIFFERENT SENTENCE FROM `payment_required`, AND THE DIFFERENCE IS THE
    BUTTON. A plan is something this workspace can change today; being a business
    is a one-time step with a legal name attached, and offering "upgrade your
    plan" for it sends somebody to a price list where nothing they can buy will
    ever help.
  */
  "platform.commercial_required": {
    status: 402, retryable: false, tone: "warning",
    title: "This is for business workspaces",
    detail: "Make {workspace} a business to use it.",
  },
  "platform.proof_required": {
    status: 401, retryable: true, tone: "info",
    title: "Confirm it is you",
    detail: "We will send a code to your email.",
  },
  /*
    ⚠️ 451, WHICH IS THE ONE STATUS THAT MEANS THIS. "Unavailable for legal
    reasons" is exactly what this is — not a permission (403 invites somebody to
    find another route), not a payment (402 says the fix is money), and not a
    conflict. A client that sees 451 has one correct response, which is to show
    what needs agreeing to.
  */
  "platform.must_accept": {
    status: 451, retryable: false, tone: "warning",
    title: "There is something to agree to first",
    detail: "{document} has changed. Read it and accept to carry on.",
  },
  "platform.read_only": {
    status: 402, retryable: false, tone: "warning",
    title: "This workspace is read-only",
    detail: "{reason}",
  },
  "platform.no_credits": {
    status: 402, retryable: false, tone: "warning",
    title: "Not enough credits",
    detail: "This costs {cost} and there are {balance} left.",
  },
  "platform.unavailable": {
    status: 503, retryable: true, tone: "danger",
    title: "Something went wrong on our side",
    detail: "It is not you. Quote {ref} if you tell us about it.",
  },
};

/**
 * ⚠️ A MISSING VALUE LEAVES ITS TOKEN VISIBLE rather than printing `undefined`.
 * Visibly wrong beats plausibly wrong, because the second one ships.
 */
export const say = (template: string, values: Readonly<Record<string, string | number>> = {}): string =>
  template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));

export function problem(
  catalog: ProblemCatalog,
  code: string,
  values: Readonly<Record<string, string | number>> = {},
  extra: { readonly fields?: Readonly<Record<string, string>>; readonly ref?: string } = {},
): Problem {
  /*
    ⚠️ AN UNKNOWN CODE BECOMES `unavailable` AND KEEPS ITS OWN NAME IN THE REF.
    The alternative is a thrown error inside the error path, which turns a
    refusal somebody could have acted on into a stack trace nobody sees.
  */
  const def = catalog[code] ?? { ...PLATFORM_PROBLEMS["platform.unavailable"]!, };
  const known = code in catalog;
  /*
    ⚠️ THE REFERENCE IS A VALUE THE SENTENCE CAN USE, and it was not. `unavailable`
    has always read "Quote {ref} if you tell us about it" and the ref arrived in
    `extra` rather than in `values`, so the token was never substituted — the one
    problem a person is most likely to see told them to quote a literal brace.
    It did not print `undefined`, which is why nothing ever failed over it: `say`
    leaves an unknown token visible on purpose, and that correct behaviour is
    exactly what made this survive.
  */
  const said = extra.ref ? { ...values, ref: extra.ref } : values;
  return {
    code: known ? code : "platform.unavailable",
    status: def.status,
    title: say(def.title, said),
    ...(def.detail ? { detail: say(def.detail, said) } : {}),
    retryable: def.retryable,
    tone: def.tone,
    ...(extra.fields ? { fields: extra.fields } : {}),
    ...(extra.ref ? { ref: extra.ref } : {}),
  };
}

/**
 * THE MESSAGE FOR ONE INPUT.
 *
 * ⚠️ A REFUSAL ABOUT A VALUE BELONGS BESIDE THE VALUE. `fields` exists so a form
 * can do that, and a screen that renders only the title puts "that does not look
 * right" over a form of six inputs without saying which — which is what makes
 * somebody re-read every one of them. This is the read half of that channel, so
 * a form does not reach into `problem.fields?.[name]` and get the optional chain
 * wrong in one of the six places it writes it.
 */
export const refusedOn = (
  refusal: Problem | null | undefined, field: string,
): string | undefined => refusal?.fields?.[field];

/**
 * ⚠️ EVERY CODE AN OPERATION SAYS IT CAN RAISE MUST EXIST. A `fails` naming a
 * code no catalogue has is a refusal that renders as "something went wrong" on
 * the one path the author thought hardest about.
 */
export const unknownProblems = (catalog: ProblemCatalog, codes: readonly string[]): readonly string[] =>
  codes.filter((c) => !(c in catalog));

/**
 * ⚠️ AND AN APP MAY NOT REDEFINE A PLATFORM REFUSAL. A product that reworded
 * "payment required" could describe its own arrears as something reassuring, to
 * staff who would then not act on it.
 */
export const redefined = (own: ProblemCatalog): readonly string[] =>
  Object.keys(own).filter((c) => c in PLATFORM_PROBLEMS);
