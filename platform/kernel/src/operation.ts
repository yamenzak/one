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
import type { Shape } from "./validate.js";
import type { Actor, Instant, RegionId, TenantId, Tone } from "./primitives.js";
import type { MomentId } from "./moment.js";
import type { HelpId, Problem } from "./problem.js";

/* --------------------------------------------------------------- outcome --- */

export type { Tone } from "./primitives.js";

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
  /** ⚠️ One line. It is read in passing — see `OUTCOME_MESSAGE_MAX`. */
  readonly message: string;
  readonly tone: Tone;
  /**
   * ⚠️ PUNCTUATION, AND THE SOUND COMES WITH IT. An outcome says what happened;
   * a moment says that it mattered — most writes deserve neither, because a
   * product that celebrates a saved field has nothing left for anything else.
   *
   * There is no `sound` field beside this on purpose: an app that chose both
   * could pair a celebration with the error chime, and would, the first time
   * somebody copied a declaration and edited half of it.
   */
  readonly moment?: MomentId;
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
  // vocabulary-exempt: the HTTP caller, not somebody's customer. The key comes
  // from whoever is retrying, because only they know two attempts are one intent.
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
  /**
   * WHO THIS CALLER IS ON THE CUSTOMER RAIL, where an app has one.
   *
   * ⚠️ ABSENT FOR STAFF, AND THAT ABSENCE IS LOAD-BEARING. A subject-scoped
   * collection narrows its reads to this when it is present, so "no subject"
   * means "asking about the workspace" and a value means "asking about mine".
   * An app that filled it in for staff would hide the roster from the coach.
   */
  readonly subjectId?: string;
  /**
   * WHICH OF THIS OPERATION'S DECLARED `shape` KEYS THIS CALLER MAY SEE.
   *
   * ⚠️ THE HANDLER WITHHOLDS; THE PLATFORM REPORTS. Only the handler knows what
   * to leave out of its own payload, and only the platform knows what the caller
   * bought — so the decision is resolved once, here, and the same map is merged
   * into the response as `included`. That is what makes "withheld" and "empty"
   * different answers on the wire, which is the whole reason shaping exists
   * instead of refusing.
   *
   * Empty for an operation that declares no shape.
   */
  readonly included: Readonly<Record<string, boolean>>;
  readonly region: RegionId;
  /**
   * Whether this caller holds a permission.
   *
   * ⚠️ THE GATE ANSWERS THE OPERATION'S OWN QUESTION AND NO OTHER. A field may
   * be narrower than the row it lives in — a swap request the customer opens and
   * only the studio may answer — and the gate cannot see fields. Without this,
   * `write` on a field is a declaration nothing reads: the operation-level
   * refusal stands, the derived update beside it does not, and the lock is
   * beside an open window.
   */
  holds(permission: string): boolean;
  /** ⚠️ Injected, so a test is deterministic and a handler cannot read a wall clock. */
  now(): Instant;
  /** Raise a declared failure. The only way out other than returning. */
  fail(code: string, meta?: Record<string, string | number | boolean>): never;
}

/* ------------------------------------------------------------- operation --- */

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

export interface OperationSpec<B extends BindingSpec, I, O, F extends string = string> {
  readonly id: string;
  readonly kind: OperationKind;
  /** One sentence. It becomes the AI tool's description, so it is read by a model. */
  readonly summary: string;
  /**
   * ⚠️ PARSED, NOT ASSERTED, and the runtime does it before the handler runs.
   * A handler therefore never sees a value it has to check — which is what makes
   * "validate at the boundary" a property rather than a convention.
   */
  readonly input: Shape<I>;
  /**
   * Not parsed at runtime: the handler is ours and the cost is per response.
   * It is declared because the API document and the typed client are generated
   * from it, and a document that can disagree with the code is worthless.
   */
  readonly output: Shape<O>;

  /** RBAC. Checked before the handler, for every transport. */
  readonly permission: string;
  /** What the TENANT bought from us. */
  readonly entitlement?: string;
  /** What the tenant's own CUSTOMER bought from them, where an app has that rail. */
  readonly customerFlag?: string;
  /**
   * The ceiling this write counts against — a seat, a stored item, a send.
   *
   * ⚠️ A SEPARATE FIELD FROM `entitlement`, because the two refuse for different
   * reasons and a caller must be told which. "Your plan does not include this"
   * and "your plan includes twenty of these and you have twenty" are different
   * problems with different ways out, and collapsing them into one gate produces
   * copy that is wrong for whichever case it was not written for.
   */
  readonly quota?: string;

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
  /**
   * Declared failures.
   *
   * ⚠️ ITS OWN TYPE PARAMETER, so the literals survive. Typed as
   * `readonly string[]` the list widens the moment it is assigned, and
   * `defineApp`'s check that every code is declared becomes vacuous —
   * `Exclude<string, …>` is `string`, which satisfies any index signature. The
   * check compiled, passed and proved nothing until this was captured.
   */
  readonly fails?: readonly F[];
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

export function operation<B extends BindingSpec, I, O, const F extends string = never>(
  spec: OperationSpec<B, I, O, F>,
): OperationSpec<B, I, O, F> {
  return spec;
}

/** What a caller gets back. A failure is always a `Problem`, never a string. */
export type Result<O> = { readonly ok: true; readonly data: O } | { readonly ok: false; readonly problem: Problem };

/**
 * ⚠️ THE ONE PERMISSION THAT IS NOT A PERMISSION, and it is a DECLARATION rather
 * than an absence.
 *
 * Signing in, asking for a code and reading who you are must work with no
 * session, so they need a way to say so. The alternative — an optional
 * `permission` field, where leaving it out means public — makes the most
 * dangerous state in the system the one you get by forgetting to type
 * something. Here, an operation with no permission does not compile, and a
 * public one says the word.
 */
export const PUBLIC = "public";
