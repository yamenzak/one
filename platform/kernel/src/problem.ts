/**
 * FAILURE — a `Problem`, never a provider's words.
 *
 * Layer 1. Imports primitives only.
 *
 * ⚠️ A PROVIDER ERROR MAY NOT REACH A CLIENT. Not because it reads badly:
 * because it leaks. Model names, quota internals, account identifiers, request
 * fragments, sometimes a slice of the prompt. Stripe, Gemini, Workers AI, a
 * mailer and a payment gateway all return prose written for US, not for a
 * customer, and forwarding it is a disclosure decision nobody made.
 *
 * Shaped after RFC 9457 (`application/problem+json`) rather than invented,
 * because an error envelope is a solved problem and clients already understand
 * this one.
 */

import type { Id } from "./primitives.js";

/**
 * ⚠️ RESOLVED AGAINST THE DECLARED HELP REGISTRY AT COMPOSITION, so a cross-link
 * cannot name an article that does not exist.
 *
 * The branding alone was never enough: it made two arbitrary strings different
 * types and left both of them arbitrary. What matters is that this one is
 * rendered BESIDE AN ERROR — whoever follows it is already stuck, so a dead link
 * there is the second failure in a row, which is where people stop trying.
 */
export type HelpId = Id<"help">;

/** Values safe to interpolate into copy a customer reads. Nothing free-form. */
export type ProblemMeta = Readonly<Record<string, string | number | boolean>>;

export interface Problem {
  /** Stable and namespaced — `billing.quota_exceeded`. Clients branch on it. */
  readonly code: string;
  readonly status: number;
  /** Short, from the registry, translatable. */
  readonly title: string;
  /** OURS, composed from `meta`. Never a provider's string. */
  readonly detail?: string;
  /** Per field, for a form to render in place rather than in a toast. */
  readonly fields?: Readonly<Record<string, string>>;
  readonly meta?: ProblemMeta;
  /** Whether trying again could plausibly work. Decided by the adapter, once. */
  readonly retryable: boolean;
  /** Cross-link. The article carries the depth so this stays one sentence. */
  readonly help?: HelpId;
  /**
   * ⚠️ THE FIELD THAT MAKES SECRECY USABLE RATHER THAN HOSTILE.
   *
   * The customer gets something they can quote to support; the raw provider
   * error is logged against the same id and never sent. Withholding detail
   * without offering this is just an unhelpful error message.
   */
  readonly ref: string;
}

/** A declared code, before an occurrence fills in `detail`, `meta` and `ref`. */
export interface ProblemDef<M extends ProblemMeta = ProblemMeta> {
  readonly status: number;
  readonly title: string;
  /** Built from structured meta, so it cannot accidentally carry a raw string. */
  readonly detail?: (meta: M) => string;
  readonly retryable: boolean;
  readonly help?: HelpId;
}

export type ProblemCatalog = Readonly<Record<string, ProblemDef>>;

/**
 * Declare this app's failures.
 *
 * The returned keys are what an operation's `fails` list is checked against, so
 * a code invented at a throw site does not compile — which is the difference
 * between a registry and a convention.
 */
export function declareProblems<const C extends ProblemCatalog>(catalog: C): C {
  return catalog;
}

export type ProblemCode<C extends ProblemCatalog> = keyof C & string;

/* -------------------------------------------------------------- adapters --- */

/**
 * The ONLY code permitted to see a provider's error shape.
 *
 * One per external dependency, so retryability, backoff and whose-fault-is-it
 * are decided once per provider instead of once per call site — and so there is
 * exactly one place to audit when asking "can anything from Google reach a
 * customer".
 *
 * ⚠️ Returning `null` is not "pass it through". An unrecognised failure becomes
 * `platform.unavailable` with a `ref`, and the raw text goes to the log. A
 * "we don't know" that shows a customer a stack trace is the failure this whole
 * module exists to prevent.
 */
export interface ProviderAdapter<E = unknown> {
  readonly provider: string;
  map(raw: E): { code: string; meta?: ProblemMeta } | null;
}

export const PLATFORM_PROBLEMS = declareProblems({
  "platform.unavailable": {
    status: 503,
    title: "Something went wrong on our side",
    retryable: true,
  },
  "platform.forbidden": { status: 403, title: "You don't have access to this", retryable: false },
  "platform.not_found": { status: 404, title: "Not found", retryable: false },
  /*
    ⚠️ RETRYABLE, and it carries how long to wait. A 429 with no `retryAfter` is
    one every client turns into a tight loop, which is the opposite of what a
    rate limit is for.
  */
  "platform.too_many": {
    status: 429, title: "Too many attempts — try again shortly",
    detail: (m) => `Try again in ${m.retryAfter} second(s).`,
    retryable: true,
  },
  "platform.invalid": { status: 400, title: "That doesn't look right", retryable: false },
  "platform.conflict": {
    status: 409,
    title: "Somebody else changed this while you were editing",
    detail: () => "Reload to see their version before saving yours.",
    retryable: false,
  },
  "platform.rate_limited": { status: 429, title: "Too many attempts — wait a moment", retryable: true },
  "platform.read_only": { status: 402, title: "This workspace is read-only right now", retryable: false },
  /*
    ⚠️ 451, AND THE STATUS IS THE POINT. This is not "you lack permission" and
    not "your workspace has not paid" — it is a legal precondition that has not
    been met, and giving it 403 puts it in the same bucket as the two things a
    person can do nothing about. What they can do about this is read a document
    and agree to it, so the code says so and the detail names which one.
  */
  "platform.consent_required": {
    status: 451,
    title: "There is something to read first",
    detail: (m) => `Agree to the ${m.documents} before continuing.`,
    retryable: false,
  },
  /*
    ⚠️ ITS OWN CODE RATHER THAN A SHARE OF `forbidden`. "Your plan does not
    include this" and "your plan includes twenty and you have twenty" are
    different problems with different ways out — one is an upgrade, the other is
    deleting something — and a single code produces copy that is wrong for
    whichever case it was not written for.
  */
  "platform.quota_reached": {
    status: 402,
    title: "You've reached what your plan includes",
    detail: (m) => `Your plan includes ${m.limit}, and ${m.used} are in use.`,
    retryable: false,
  },
  /*
    ⚠️ ITS OWN CODE, AND IT IS NOT A 403. A vault fact is withheld because the
    PERSON IT IS ABOUT has not shared it — which is not a lack of permission, is
    not something an administrator can fix, and is not a failure of the app.
    Answering 403 puts it beside "you are not allowed here" and produces copy
    that blames the reader for a decision somebody else made and is entitled to.

    ⚠️ AND THE DETAIL NEVER SAYS WHETHER THERE IS ANYTHING THERE. `mayRead`
    distinguishes "never granted" from "nothing recorded" so a SCREEN can say the
    right thing to somebody who holds a grant; this sentence reaches a reader who
    may hold none, and telling them the person has recorded nothing is itself a
    disclosure nobody made.
  */
  /*
    ⚠️ ITS OWN CODE, AND IT IS THE ONE REFUSAL THAT IS NOT ABOUT PERMISSION AT
    ALL. The caller is allowed to do this and the session is genuine; what is
    missing is a RECENT proof that the person holding it is the person it was
    issued to. A borrowed laptop with an open tab is the realistic threat, and
    against it a permission check is worth nothing — it passes.

    ⚠️ 401, WHICH IS THE ONLY STATUS THAT MEANS "PROVE IT AGAIN". 403 says the
    answer will not change, and a client that reads it that way will not offer
    the one thing that resolves this.
  */
  "platform.proof_required": {
    status: 401,
    title: "Confirm it is you",
    detail: () => "Sign in again to continue. It takes one tap with a passkey.",
    retryable: false,
  },
  /*
    ⚠️ ITS OWN CODE, AND IT IS NOT A 403. "You are not allowed here" is about a
    role somebody holds; this is about a product they have not been let into yet,
    which is a thing that CHANGES the moment somebody buys it. The way out is not
    an administrator, it is the front of the website — so the code says so and the
    detail names the product rather than the permission.
  */
  "platform.not_provisioned": {
    status: 403,
    title: "This product is not open to you yet",
    detail: (m) => `Ask for access to ${m.product} and it will be enabled on this address.`,
    retryable: false,
  },
  /*
    ⚠️ 402, AND IT NAMES THE PRODUCT RATHER THAN THE ROUTE. It is answered at the
    one moment somebody is trying to start — so the sentence has to be about the
    thing they were doing, and the way out has to be the thing they came to do.
    "Forbidden" here would be true and useless: nothing about their permissions
    is wrong, they simply have not bought it yet.
  */
  "platform.payment_required": {
    status: 402,
    title: "Start a subscription first",
    detail: (m) => `A ${m.product} workspace is created against a subscription. Choose a plan — a trial counts.`,
    retryable: false,
  },
  "platform.not_shared": {
    status: 409,
    title: "That is not shared with you",
    detail: (m) => `${m.fact} belongs to the person it is about, and they have not shared it here.`,
    retryable: false,
  },
});

/**
 * A problem's sentence, or nothing.
 *
 * ⚠️ A SENTENCE WITH A HOLE IN IT IS WORSE THAN NO SENTENCE. `detail` is a
 * template over the meta a raise site supplies, and a site that supplies less
 * than the template names renders "Your plan includes undefined, and undefined
 * are in use" — which shipped, and which somebody hitting a seat limit actually
 * read.
 *
 * Nothing throws when that happens, and nothing can: the template is a function
 * and the missing value is a legal `undefined`. So the check is here, once, on
 * the way out — a detail that cannot be completed is withheld, leaving the title
 * and the code, both of which are still true.
 */
export function detailFor(def: ProblemDef, meta: Readonly<Record<string, string | number | boolean>> | undefined): string | null {
  if (!def.detail || !meta) return null;
  const text = def.detail(meta);
  return text.includes("undefined") || text.includes("[object Object]") ? null : text;
}
