/**
 * ONE DECLARATION, EVERY CROSS-CUTTING CONCERN (D12).
 *
 * ⚠️ THIS IS THE PROPERTY THE WHOLE FRAMEWORK EXISTS TO HAVE. Writing an
 * operation is all anybody does; the route, the AI tool, the webhook event, the
 * audit entry, the OpenAPI entry, the typed client, the idempotency contract and
 * every gate are derived from the literal below. The moment one of them becomes
 * something a handler CALLS, it becomes something a handler can FORGET — and a
 * forgotten one is invisible: no error, no failing test, a capability that
 * silently does not apply.
 *
 * ⚠️ SO EVERY FIELD HERE IS EITHER REQUIRED OR HAS A STATED EXEMPTION. `audit`
 * and `tool` are both `A | { why }` for that reason: opting out is allowed and
 * saying nothing is not. A previous platform made audit opt-in and twenty of its
 * own writes were recorded nowhere, with every suite green — because a missing
 * entry is indistinguishable from an action nobody took.
 *
 * Layer 2. Imports primitives, problem, field.
 */

import type { FieldSpec, Fields } from "./field.js";
import type { AiActionSpec } from "./ai.js";
import type { Tone } from "./primitives.js";

/* ------------------------------------------------------------------ gates --- */

/**
 * ⚠️ THE ORDER IS FIXED AND IT IS A DESIGN, NOT A PREFERENCE.
 *
 *   standing → permission → kind → proof → entitlement → flag → quota → credits
 *
 * Standing first, because a workspace in arrears must not be told which of its
 * powers it lacks — that is a conversation about the bill, not about roles.
 * Permission before proof, because asking somebody to confirm their identity for
 * something they may not do anyway is a code sent for nothing. Kind sits between
 * them and above entitlement for the same two reasons at once: no plan a
 * PERSONAL workspace can buy will ever unlock a commercial-only capability, so
 * "your plan does not include this" would be selling something that does not
 * exist — and asking for a code first would be a code sent for a door that
 * cannot open. Entitlement before quota, because "your plan does not include
 * this" and "you have used all of yours" are different sentences with different
 * buttons. Credits last, because they are the only gate that SPENDS something.
 */
export const GATE_ORDER = [
  "standing", "permission", "kind", "proof", "entitlement", "flag", "quota", "credits",
] as const;

export type Gate = (typeof GATE_ORDER)[number];

/**
 * ⚠️ `PUBLIC` MEANS "THE SESSION DECIDES", NEVER "ANYBODY". It is for the
 * operations about yourself — your own inbox, your own tokens, your own account
 * — where a permission would be a role check on a question about the caller, and
 * would have to be granted by a workspace, which is the wrong authority for
 * something that spans all of them.
 */
export const PUBLIC = Symbol.for("one.public");
export type Permission = string | typeof PUBLIC;

/**
 * ⚠️ `recent` EXISTS AGAINST A BORROWED LAPTOP WITH AN OPEN TAB, which is the
 * realistic threat to an account rather than a stolen password. The answer is a
 * code to an inbox — so anything a machine can hold a credential for must not
 * satisfy it, and closing an account, moving money or minting a key stay things
 * a person does in front of a screen.
 */
export type Proof = "recent";

/* -------------------------------------------------------------- the record --- */

/**
 * ⚠️ ABSENT MEANS DERIVED, NOT ABSENT. A write with no `audit` gets an entry
 * anyway: the verb from its own id, the subject from its row scope. Opting out
 * is `{ why }` — a sentence in review, not a silence.
 */
export type Audit<I> =
  | ((input: I) => { readonly subject: string; readonly verb: string })
  | { readonly why: string };

/**
 * ⚠️ EVERY OPERATION IS AN AI TOOL UNLESS IT SAYS WHY NOT, and the opt-outs are
 * the interesting half: anything that grants access, spends money, or mints a
 * credential. A model that can invite somebody to a workspace from a sentence in
 * a document it was asked to summarise is a model that can be asked to.
 */
export type ToolPolicy = true | { readonly why: string };

export interface Outcome {
  readonly message: string;
  readonly tone: Tone;
  /** Which reads go stale. The client refetches them and nothing polls. */
  readonly invalidates?: readonly string[];
}

/**
 * ⚠️ A REPLAY IS ANSWERED BEFORE ANYTHING ELSE HAPPENS. A phone that queued a
 * write in a basement cannot know whether the first attempt landed — the ANSWER
 * went missing, not the request — so it asks again, and without this it gets a
 * second audit row, a second notification and a second charge.
 */
export type Idempotency =
  | { readonly mode: "none" }
  /** Deduplicated on a field of the input — an email, an id. */
  | { readonly mode: "natural"; readonly key: string }
  /** Deduplicated on a key the client generates. */
  | { readonly mode: "key" };

export type OperationKind = "read" | "write";

export interface OperationSpec<I = unknown, O = unknown> {
  readonly id: string;
  readonly kind: OperationKind;
  /** One line, in the reader's terms. It is the OpenAPI summary and the tool's. */
  readonly summary: string;
  readonly input: Fields;
  readonly output: Fields;

  readonly permission: Permission;
  /**
   * ⚠️ ONLY IN A COMMERCIAL WORKSPACE, AND IT IS NOT AN ENTITLEMENT. An
   * entitlement is a line on a price list a workspace can buy its way to; this
   * is a fact about what the workspace IS, and a personal one cannot buy its way
   * past it — which is exactly why it is a separate declaration with a refusal
   * that says "make this a business" rather than "change your plan".
   */
  readonly commercial?: true;
  readonly proof?: Proof;
  /** The entitlement a plan must include. */
  readonly entitlement?: string;
  /** The flag that must be on. */
  readonly flag?: string;
  /** The ceiling counted against. */
  readonly quota?: string;
  /** What one call costs, where it costs something. */
  readonly credits?: number;
  /**
   * ⚠️ THE GENERATING HALF, DECLARED LIKE EVERY OTHER CONCERN (D12, D19). An
   * operation that says `ai` names a LANE and a prompt; the model is bound by
   * the operator and the reserve is computed from the bound row's rates. An
   * app that reached for a model id instead would be a product carrying a
   * deployment decision through a release.
   */
  readonly ai?: AiActionSpec;

  readonly idempotency: Idempotency;
  readonly audit?: Audit<I>;
  readonly tool?: ToolPolicy;
  /** The events it raises. The inbox, webhooks and recognition all read this. */
  readonly emits?: readonly string[];
  readonly outcome?: Outcome;
  readonly fails?: readonly string[];
  /** Calls per minute, per caller. Absent is the platform's own default. */
  readonly rate?: number;

  readonly handler: (ctx: unknown, input: I) => Promise<O>;
}

/**
 * ⚠️ AN OPERATION WITH ITS TYPES ERASED — `never` in, `unknown` out, and the
 * asymmetry is the whole reason this line works. Input is contravariant, so a
 * handler that wants a `Publish` is assignable to one that accepts `never`;
 * output is covariant, so `never` there would reject every real handler and make
 * a list of operations impossible to hold without a cast. A cast in the type
 * that every declaration flows through is a cast that hides the next mistake.
 */
export type AnyOperation = OperationSpec<never, unknown>;

export const operation = <I, O>(spec: OperationSpec<I, O>): OperationSpec<I, O> => spec;

/* ----------------------------------------------------------------- derived --- */

/** ⚠️ The verb an audit entry uses when none was declared. */
export const verbOf = (id: string): string => id.split(".").pop() ?? id;

/**
 * ⚠️ EVERY WRITE SAYS WHAT TO RECORD OR WHY NOT. A write with neither is the
 * only shape refused here — reads are not audited by default because an audit of
 * every read is a table that grows faster than the data and that nobody has ever
 * opened.
 */
export const unrecordedWrites = (ops: readonly AnyOperation[]): readonly string[] =>
  ops.filter((o) => o.kind === "write" && o.audit === undefined && !derivable(o)).map((o) => o.id);

/**
 * ⚠️ DERIVABLE MEANS THE PLATFORM CAN WRITE THE ENTRY ITSELF — it has a subject
 * to name. An operation whose input carries no id and no natural key has nothing
 * to put in the row, so it has to say what to record.
 */
const derivable = (op: AnyOperation): boolean =>
  "id" in op.input || (op.idempotency.mode === "natural" && op.idempotency.key in op.input);

export const isTool = (op: AnyOperation): boolean => op.tool === undefined || op.tool === true;

/**
 * The route an operation answers on.
 *
 * ⚠️ ONE SHAPE, NO PATH PARAMETERS, AND THE ID IS THE PATH. REST invents a
 * second vocabulary — which verb, which nesting, which status — for information
 * the declaration already carries, and every app then answers it slightly
 * differently. `POST /api/note.create` is boring, uniform, and generated.
 */
export const routeFor = (op: AnyOperation): { readonly method: string; readonly path: string } => ({
  method: op.kind === "read" ? "GET" : "POST",
  path: `/api/${op.id}`,
});

/* ------------------------------------------------------------------ rules --- */

export type OperationRefusal =
  | "id_not_dotted" | "write_that_reads" | "read_that_spends" | "read_that_emits"
  | "credits_without_a_cost" | "proof_on_a_read" | "unrecorded_write";

export interface OperationProblem {
  readonly operation: string;
  readonly why: OperationRefusal;
  readonly detail: string;
}

/**
 * What an operation declaration can get wrong.
 *
 * ⚠️ `read_that_spends` AND `read_that_emits` ARE THE TWO THAT BITE. A GET is
 * retried by browsers, prefetched by clients and replayed by proxies — so a read
 * that charges credits charges them repeatedly, and one that raises an event
 * sends the notification again on every refresh. Neither fails; both are
 * discovered from a bill or from somebody's inbox.
 */
export function refuseOperation(op: AnyOperation): readonly OperationProblem[] {
  const out: OperationProblem[] = [];
  const at = (why: OperationRefusal, detail: string) => out.push({ operation: op.id, why, detail });

  if (!/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(op.id)) {
    at("id_not_dotted", `"${op.id}" is not <thing>.<verb>`);
  }
  if (op.kind === "read" && (op.credits ?? 0) > 0) {
    at("read_that_spends", "a GET is prefetched and retried, so it would charge more than once");
  }
  if (op.kind === "read" && op.emits?.length) {
    at("read_that_emits", "a GET is refreshed, so it would raise the same event again each time");
  }
  if (op.kind === "read" && op.proof) {
    at("proof_on_a_read", "a code sent to an inbox to look at something is a code nobody will type");
  }
  if (op.credits !== undefined && op.credits <= 0) {
    at("credits_without_a_cost", "declared a cost of zero or less, which is not a cost");
  }
  if (op.kind === "write" && op.audit === undefined && !derivable(op)) {
    at("unrecorded_write", "nothing to record and no reason given — see `audit`");
  }
  return out;
}

/**
 * ⚠️ AN OPERATION NAMING A PERMISSION NO ROLE HOLDS REFUSES EVERY CALLER, FOR
 * EVER — including the owner — and the 403 is indistinguishable from one
 * somebody forgot to grant. It reads exactly like a feature nobody uses.
 */
export function unreachable(
  ops: readonly AnyOperation[],
  roles: Readonly<Record<string, readonly string[]>>,
  personal: readonly string[],
): readonly string[] {
  const held = new Set([...Object.values(roles).flat(), ...personal]);
  return ops
    .filter((o) => o.permission !== PUBLIC && !held.has(o.permission as string))
    .map((o) => `${o.id} needs "${String(o.permission)}", which no role and no personal set holds`);
}

/** Fields an app must declare on its input for the platform to fill them. */
/* DEFER(engine-34) stage:34 — the platform fills declared inputs by walking the fields directly. */
export const inputNames = (fields: Fields): readonly string[] => Object.keys(fields);

export type { FieldSpec };
