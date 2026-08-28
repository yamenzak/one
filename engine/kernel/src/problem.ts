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
  /**
   * ⚠️ THE TITLE WHEN THE VALUES DID NOT ARRIVE, AND ONLY A TEMPLATED TITLE
   * NEEDS ONE. A detail can be dropped — it is optional by construction, and a
   * refusal that says less says nothing untrue. A TITLE cannot: a refusal with
   * no words in it is a card a person cannot read at all, so a templated title
   * with no values has to have somewhere to fall back to.
   *
   * ⚠️ AND IT IS DECLARED RATHER THAN DERIVED. Stripping the tokens out of the
   * sentence leaves "Your plan includes , and  are in use", which is worse than
   * either honest version. What the shorter wording says is the same fact
   * without the numbers.
   */
  readonly plain?: string;
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
    plain: "Your plan has no room left for this",
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
  /*
    ⚠️ NOT `forbidden`, AND THE DIFFERENCE IS WHAT SOMEBODY DOES NEXT. Forbidden
    is about the person — they do not have the permission, and no amount of
    walking to another shelf changes it. This is about the PLACE: they may do
    this, somewhere else, and the sentence that helps is the one naming where
    they work.
  */
  "platform.out_of_reach": {
    status: 403, retryable: false, tone: "warning",
    title: "That is not one of your {places}",
    plain: "That is not one of yours",
    detail: "Ask somebody who runs this workspace to add it.",
  },
  /*
    ⚠️ A RECORD SOMEBODY COMMITTED TO — see `DocumentSpec`. Not `invalid`: the
    caller is not wrong about anything they typed, and telling them to check the
    highlighted fields sends them back over a form that is correct. What is wrong
    is the moment — a number has been issued and a ledger has moved, so this is
    evidence now, and the way to change it is to cancel and amend.
  */
  "platform.not_a_draft": {
    status: 409, retryable: false, tone: "warning",
    title: "This has been {standing}",
    plain: "This is no longer a draft",
    detail: "{detail}",
  },
  /*
    ⚠️ A TREE BENT INTO A RING — see `treeFieldsOf`. Its own sentence because
    "that does not look right" is exactly wrong here: what the caller picked is a
    real record, they may edit both of them, and the reason it is refused is a
    relationship between the two that no single field is at fault for.
  */
  "platform.cycles": {
    status: 409, retryable: false, tone: "warning",
    title: "That would put this inside itself",
    detail: "{detail}",
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
  /*
    ⚠️ THE THREE A FILE PICKER CAN ANSWER WITHOUT ASKING THE SERVER, and they
    are in the catalogue for the same reason every other refusal is: the control
    used to write its own three sentences, in the file that draws it, painted in
    a raw danger class — so the wording, the tone and the colour were all
    decisions taken alone, and the colour was one the contrast reading later
    found short. A refusal a person reads is a refusal the platform said.

    ⚠️ AND THEY ARE THREE RATHER THAN ONE WITH THE REASON INTERPOLATED. A single
    `platform.wrong_file` taking a `{why}` is the hand-written sentence smuggled
    through a token: the catalogue would hold a shape and the screen would still
    hold the words.
  */
  "platform.wrong_kind": {
    status: 400, retryable: false, tone: "warning",
    title: "That kind of file will not work",
    detail: "It has to be {wants}.",
  },
  "platform.too_large": {
    status: 400, retryable: false, tone: "warning",
    title: "That file is too big",
    detail: "It is {size} kB and the most is {most} kB.",
  },
  "platform.empty_file": {
    status: 400, retryable: false, tone: "warning",
    title: "That file is empty",
    detail: "There is nothing in it to send.",
  },
  /*
    ⚠️ A DEPLOYMENT THAT STORES NO FILES YET IS NOT A DEPLOYMENT THAT BROKE, and
    it was reported as one. Uploading a photograph before the bucket is live
    answered "Something went wrong on our side" — the sentence for an unexpected
    throw — over a state somebody can actually finish. What a person then does is
    nothing, because they have been told it is not their problem and given no
    handle on it.

    ⚠️ AND `retryable` IS FALSE, WHICH IS THE PART A CLIENT READS. `unavailable`
    is retryable, so an upload against a deployment with no bucket was a client
    politely hammering a door that will never open until an operator opens it.
  */
  "platform.no_store": {
    status: 503, retryable: false, tone: "warning",
    title: "Files cannot be stored yet",
    detail: "This deployment's file storage is not finished. An operator can complete it.",
  },
  "platform.unavailable": {
    status: 503, retryable: true, tone: "danger",
    title: "Something went wrong on our side",
    detail: "It is not you. Quote {ref} if you tell us about it.",
  },
  /*
    ⚠️ THE ANSWER ARRIVED AND THE PAGE COULD NOT DRAW IT, which is neither a
    failed request nor an empty one. It is raised by `Await`'s boundary rather
    than by a route — the request succeeded — and it is here rather than built
    by hand in the browser so the words are in the catalogue with every other
    refusal, and one edit changes every screen that hits it.
  */
  "platform.undrawable": {
    status: 500, retryable: true, tone: "danger",
    title: "This did not draw",
    detail: "The answer came back in a shape this page did not expect",
  },
};

/**
 * ⚠️ A MISSING VALUE LEAVES ITS TOKEN VISIBLE rather than printing `undefined`.
 * Visibly wrong beats plausibly wrong, because the second one ships.
 */
export const say = (template: string, values: Readonly<Record<string, string | number>> = {}): string =>
  template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));

/**
 * A SENTENCE WHOSE VALUE NEVER ARRIVED IS DROPPED, NOT SHOWN WITH ITS BRACES.
 *
 * ⚠️ THIS SHIPPED AND WAS PHOTOGRAPHED. A refused upload told somebody
 * "It is not you. Quote {ref} if you tell us about it." — the one refusal a
 * person is most likely to see, asking them to quote a literal brace. The value
 * was missing because `ctx.fail("platform.unavailable")` supplies no reference;
 * only the unexpected-throw path does.
 *
 * ⚠️ AND `say` LEAVING THE TOKEN VISIBLE IS CORRECT — IT IS THE REASON THIS
 * SURVIVED. The rule is "visibly wrong beats plausibly wrong", written so a
 * missing value could not print `undefined`, and it works: it is loud, and it
 * is loud AT THE PERSON rather than at whoever wrote the call. Being visible in
 * development requires somebody to look; being visible in production requires
 * nothing.
 *
 * ⚠️ SO THE TOKEN STAYS VISIBLE IN `say` — where tests and guards read it — and
 * a `Problem` on its way to a screen loses the sentence instead. A refusal that
 * says less is a refusal that says nothing untrue, and "It is not you." on its
 * own is still the whole point of that message.
 */
const whole = (text: string): string => text
  /* ⚠️ Split AFTER a full stop, so the stop stays with the sentence it ends. */
  .split(/(?<=[.!?])\s+/)
  .filter((sentence) => !/\{\w+\}/.test(sentence))
  .join(" ")
  .trim();

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
  /*
    ⚠️ A TITLE IS MANDATORY, SO IT FALLS BACK TO THE INTERPOLATED TEXT rather
    than to nothing — a refusal with no title is a card with no words in it,
    which is worse than one brace. A DETAIL is optional by construction, so an
    emptied one is simply absent and the screen draws the title alone.
  */
  const titled = whole(say(def.title, said));
  const detailed = def.detail ? whole(say(def.detail, said)) : "";
  return {
    code: known ? code : "platform.unavailable",
    status: def.status,
    /*
      ⚠️ THE DECLARED FALLBACK, THEN THE RAW. `plain` is what a templated title
      says without its numbers; the raw interpolation is the last resort and
      keeps its braces, which is a bug somebody has to have introduced by
      writing a token into a title and no `plain` beside it — `problem-words`
      fails on exactly that.
    */
    title: titled || (def.plain ? say(def.plain, said) : say(def.title, said)),
    ...(detailed ? { detail: detailed } : {}),
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
