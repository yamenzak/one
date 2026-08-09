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
 * DEFER(one-003) stage:6 — resolve against the declared help registry, so a
 * cross-link cannot name an article that does not exist. Until then a call site
 * casts, and the cast marks where a real link belongs. See test/FINDINGS.md §5.
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
  "platform.invalid": { status: 400, title: "That doesn't look right", retryable: false },
  "platform.conflict": {
    status: 409,
    title: "Somebody else changed this while you were editing",
    detail: () => "Reload to see their version before saving yours.",
    retryable: false,
  },
  "platform.rate_limited": { status: 429, title: "Too many attempts — wait a moment", retryable: true },
  "platform.read_only": { status: 402, title: "This workspace is read-only right now", retryable: false },
});
