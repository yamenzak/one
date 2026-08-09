/**
 * AN OPERATION — one declaration, four transports.
 *
 * Layer 3. Imports primitives, bindings, problem.
 *
 * From this single object the framework derives the HTTP route, the AI tool, the
 * webhook event, the activity entry, the OpenAPI document and the typed client.
 * Declaring the gates rather than calling them is what makes it impossible for
 * the tool surface and the route surface to disagree.
 *
 * ⚠️ THE SAFETY PROPERTY: the tool surface is the route surface MASKED by the
 * caller. One registry, filtered at resolution — never a second list kept in
 * step by hand. Two registries is how a product ships an assistant that can do
 * more than the person operating it, with nothing failing anywhere.
 */

import type { BindingSpec, ResolvedBindings } from "./bindings.js";
import type { Actor, Instant, RegionId, TenantId } from "./primitives.js";
import type { HelpId, Problem } from "./problem.js";

/* --------------------------------------------------------------- outcome --- */

export type Tone = "success" | "info" | "warning" | "danger";
/** Semantic intent. The platform owns the audio, as it owns colour tokens. */
export type SoundId = "commit" | "error" | "alert" | "arrive" | "scan";

/**
 * WHAT HAPPENED — declared by the app, PRESENTED by the platform.
 *
 * ⚠️ There is deliberately no way to say "show a toast". An operation that
 * chooses its own surface is how three products end up with three answers to
 * the same interaction, which is the inconsistency this platform exists to end.
 * The renderer decides: inline for a field saved in place, a toast for something
 * the user cannot see happen, a dialog before something destructive, and nothing
 * at all when the result is already visible — a row appearing is its own
 * feedback.
 */
export interface Outcome {
  readonly message: string;
  readonly tone: Tone;
  readonly sound?: SoundId;
  /** Collections whose cached reads this invalidates. */
  readonly invalidates?: readonly string[];
  /** Whether the client may apply the change before the server confirms. */
  readonly optimistic?: boolean;
}

/* --------------------------------------------------------- idempotency --- */

/**
 * ⚠️ WHETHER THIS MAY BE SAFELY RETRIED, AND ON WHAT KEY.
 *
 * A payment webhook, a credit grant, a package application and every mutating
 * tool call need this. Adding it after the fact means auditing every write in
 * the product for double application — which is the same work as hunting the
 * bug, done later and under worse conditions.
 *
 * `none` is a legitimate answer for a pure read. It is not a default: a mutation
 * has to say which it is.
 */
export type Idempotency =
  | { readonly mode: "none" }
  | { readonly mode: "natural"; readonly key: string }
  | { readonly mode: "client-supplied" };

/* -------------------------------------------------------------- metering --- */

export interface Meter {
  /** What is consumed — the ledger's unit, not a price. */
  readonly unit: "credits" | "bytes" | "seats" | "messages";
  /**
   * ⚠️ A RESERVE IS A CEILING ON REVENUE, NOT AN ESTIMATE.
   *
   * Settlement charges the lesser of what was held and what was used, so
   * anything a reserve fails to count is paid for by the platform and not by the
   * tenant — silently, on every call. Estimating high is a rounding error;
   * estimating low is a transfer.
   */
  readonly reserve?: boolean;
}

export interface RateLimit {
  readonly per: "actor" | "tenant" | "ip";
  readonly window: "minute" | "hour" | "day";
  readonly max: number;
}

/* --------------------------------------------------------------- context --- */

/**
 * What a handler receives. Note what is absent: an `env`, a region, a raw
 * binding, a clock.
 */
export interface Ctx<B extends BindingSpec> {
  readonly bind: ResolvedBindings<B>;
  readonly actor: Actor;
  readonly tenantId: TenantId;
  readonly region: RegionId;
  /** ⚠️ Injected, so a test is deterministic and a handler cannot read a wall clock. */
  now(): Instant;
  /** Raise a declared failure. The only way out other than returning. */
  fail(code: string, meta?: Record<string, string | number | boolean>): never;
}

/* ------------------------------------------------------------- operation --- */

/**
 * A stand-in for the runtime validator.
 *
 * DEFER(one-002) stage:2 — bind to the real validator, and make `output` carry
 * BRANDED types so an Instant is protected at the wire and not only in the
 * column. See test/FINDINGS.md §7.
 */
export interface Schema<T> { readonly _t?: T }

/**
 * ⚠️ READ OR WRITE, DECLARED. Stage 2 needed this and stage 0 did not have it.
 *
 * It decides three things at once, which is why it is worth a field rather than
 * an inference: the HTTP method, whether the standing gate refuses it (reads are
 * never gated, at any rung), and whether a response may be cached.
 *
 * Inferring it from `outcome` or `audit` being present would be one subtle
 * signal deciding all three, and the failure — a write treated as a read — is a
 * mutation surviving a read-only workspace.
 */
export type OperationKind = "read" | "write";

export interface OperationSpec<B extends BindingSpec, I, O> {
  readonly id: string;
  readonly kind: OperationKind;
  /** One sentence. It becomes the AI tool's description, so it is read by a model. */
  readonly summary: string;
  readonly input: Schema<I>;
  readonly output: Schema<O>;

  /** RBAC. Checked before the handler, for every transport. */
  readonly permission: string;
  /** What the TENANT bought from us. */
  readonly entitlement?: string;
  /** What the tenant's own CUSTOMER bought from them, where an app has that rail. */
  readonly customerFlag?: string;

  /**
   * ROW-LEVEL scope — the invariant no framework can supply and no gate replaces.
   * Returns the subject this call must be authorised against.
   */
  readonly scope?: (input: I) => Readonly<Record<string, string>>;

  readonly idempotency: Idempotency;
  readonly meter?: Meter;
  readonly rateLimit?: RateLimit;

  /**
   * ⚠️ SHAPING, NOT REFUSING — for a response carrying several capabilities.
   *
   * A read that answers with four things where the caller bought two must
   * withhold two and say so, not refuse all four. Refusing outright takes the
   * ungated parts down with the sold ones; returning everything gives away what
   * was not paid for; returning a silently thinner payload makes "withheld" and
   * "empty" the same answer. Declaring which keys are gated is what lets the
   * response report `included`.
   */
  readonly shape?: Readonly<Record<string, string>>;

  readonly audit?: (input: I) => { readonly subject: string; readonly verb: string };
  readonly outcome?: Outcome;
  /** Events this raises. The ONLY notification and webhook dispatcher. */
  readonly emits?: readonly string[];
  /** Declared failures. A code invented at a throw site does not compile. */
  readonly fails?: readonly string[];
  readonly help?: HelpId;

  /**
   * ⚠️ Exposed to the AI by DEFAULT, and hidden only with a reason.
   *
   * Opt-out rather than opt-in, because an opt-in list is one somebody forgets
   * to extend, and the result is an assistant that mysteriously cannot do things
   * the person can. Where a capability genuinely must not be automated, saying so
   * out loud is cheap.
   */
  readonly tool?: false | { readonly why: string };

  handler(ctx: Ctx<B>, input: I): Promise<O>;
}

export function operation<B extends BindingSpec, I, O>(spec: OperationSpec<B, I, O>): OperationSpec<B, I, O> {
  return spec;
}

/** What a caller gets back. A failure is always a `Problem`, never a string. */
export type Result<O> = { readonly ok: true; readonly data: O } | { readonly ok: false; readonly problem: Problem };
