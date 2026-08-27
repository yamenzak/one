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
 *   accepted → standing → permission → kind → proof → entitlement → flag → quota
 *   → credits
 *
 * Acceptance first, and above the bill: until somebody has agreed to the terms
 * and the privacy notice there is no basis to process anything about them, which
 * includes telling them what their workspace owes. A new version is a new
 * agreement — an acceptance of last month\'s wording is not an acceptance of
 * this month\'s, and that is the entire reason the version is on the record.
 * Standing next, because a workspace in arrears must not be told which of its
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
  "accepted", "standing", "permission", "kind", "proof", "entitlement", "flag", "quota", "credits",
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

/**
 * WHERE THE REVERSING CALL'S INPUT COMES FROM — see `Outcome.back`.
 *
 * ⚠️ TWO SOURCES, AND IT IS DELIBERATELY NOT `Fill`. A screen's fill reads what
 * the screen is standing ON: the record it is about, a column of that record,
 * the day, the year, what somebody narrowed it to. A reversal reads what the
 * write just ANSWERED — which is none of those five, and is a value that did not
 * exist a moment ago. Overloading `Fill` would mean adding a sixth source that
 * means nothing to a view and refusing the other five here, which is two
 * vocabularies wearing one name.
 *
 * ⚠️ `said` IS A FIELD OF THE `output` THE OPERATION DECLARES, checked at
 * composition against exactly that. A write that can be taken back has to hand
 * back the handle — `stock.receive` answers with the ledger row it wrote — and a
 * reversal naming a field the answer does not carry is a button that fails on
 * the one press it exists for.
 *
 * ⚠️ AND `today` IS THE DEVICE'S DAY, for the reason `Fill` gives at length: the
 * server does not know what day it is where somebody is standing. It is the one
 * value here that is not out of the answer, and it is here because the reversing
 * movement is itself dated where it happens.
 */
export type Given = "today" | { readonly said: string };

export interface Outcome {
  readonly message: string;
  readonly tone: Tone;
  /** Which reads go stale. The client refetches them and nothing polls. */
  readonly invalidates?: readonly string[];
  /**
   * THE WAY BACK, OFFERED WITH THE CONFIRMATION.
   *
   * ⚠️ A REVERSAL BELONGS BESIDE THE ACT, NOT IN A LOG. Somebody who scans the
   * wrong shelf knows within a second and is holding the phone that did it — and
   * the alternative is a history screen, which asks a different permission,
   * takes three taps, and is not where the mistake is. `stock.undo` shipped
   * rule-complete and reachable from nothing at all for exactly this reason:
   * there was no way to say "and here is the button".
   *
   * ⚠️ IT NAMES AN OPERATION, NEVER A HANDLER. Same rule `goes` follows one
   * module over: an id the kernel checks, the permission gate reads and the
   * agent surface already exposes. What taking it back MEANS is the reversing
   * operation's own business, including refusing — `stock.undo` will not take
   * back somebody else's movement, one that is no longer the last on its line,
   * or one from an hour ago, and none of that is the button's to know.
   *
   * ⚠️ AND THE PRESS CAN BE REFUSED, WHICH IS THE POINT OF ROUTING IT THROUGH
   * THE DOOR. An undo that reversed optimistically in the browser would show a
   * balance the server never agreed to, on the one press where being wrong costs
   * a recount.
   */
  readonly back?: {
    /** The write that reverses this one. */
    readonly operation: string;
    /** What the button says — a verb, in the words of what it does. */
    readonly says: string;
    /** Its input, per field. Every required field of it must be named here. */
    readonly from: Readonly<Record<string, Given>>;
  };
}

/**
 * ⚠️ SAYING NOTHING IS A DECISION, AND IT IS WRITTEN DOWN — the same shape
 * `audit` uses one field up, for the same reason. `outcome` was optional, and
 * optional meant fifteen of fifty writes said nothing at all: not because
 * anybody chose silence for them, but because a field nobody has to fill is a
 * field that stays empty. Measured before this changed, and every one of the
 * fifteen was a different case — some genuinely right, none of them stated.
 *
 * ⚠️ AND SILENCE IS OFTEN CORRECT, WHICH IS WHY THE ESCAPE EXISTS RATHER THAN A
 * DEFAULT SENTENCE. An operation whose whole answer is the thing it returns has
 * already reported itself; a tally pressed forty times a minute would be forty
 * toasts. What is not correct is the third state — an operation nobody decided
 * about — and a required field is what removes it.
 */
export type Silent = { readonly why: string };

export type Reported = Outcome | Silent;

export const isSilent = (said: Reported): said is Silent => "why" in said;

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
  /**
   * ⚠️ REACHABLE BY SOMEBODY WHO HAS NOT ACCEPTED, AND THE LIST IS SHORT ON
   * PURPOSE. Holding the documents over somebody is fair; holding their DATA
   * over them is not. Reading what is being asked, agreeing to it, taking their
   * records with them, deleting them, ending what they pay for and signing out
   * all stay open — a wall somebody cannot leave through is not a wall, it is a
   * hostage.
   *
   * ⚠️ AND IT IS DECLARED HERE RATHER THAN LISTED IN THE GATE. A list in the
   * gate is a list an app cannot add to and nobody reviewing an operation can
   * see.
   */
  readonly beforeAccepting?: true;
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
  /**
   * What it says when it worked, and what it makes stale — see `outcomeBook`.
   *
   * ⚠️ REQUIRED ON A WRITE, AND `{ why }` IS HOW AN OPERATION SAYS NOTHING. See
   * `Silent`. A read never reports — the answer is the report — so this is
   * optional on the type and asked for by the guard only where `kind` is
   * `"write"`, which is the one place a person presses something and waits.
   */
  readonly outcome?: Reported;
  readonly fails?: readonly string[];
  /**
   * Calls per minute, per caller. Absent is the platform's own default.
   *
   * DEFER(engine-58) stage:58 — declared and read by nothing, so an operation
   * that names a ceiling has none. It is deferred rather than deleted because
   * the ceiling is a security control this deployment will need the day a door
   * opens to strangers (D23), and a control somebody believes is in force is
   * worse than one nobody has written.
   */
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
 * ⚠️ WHAT EVERY WRITE SAYS WHEN IT WORKED, IN ONE MAP THE BROWSER CAN BE HANDED.
 * The page holds no manifest (D17), so a confirmation written in the screen that
 * pressed the button is a sentence the declaration cannot see — and two screens
 * calling one operation are then two answers to what just happened.
 *
 * ⚠️ AND ONLY WHERE ONE WAS DECLARED. A default the platform invented would put
 * a sentence under every generated verb in a product, which is a toast on every
 * keystroke of an autosaving screen; silence is what an operation that has not
 * said anything means.
 */
export const outcomeBook = (
  ops: readonly AnyOperation[],
): Readonly<Record<string, Outcome>> =>
  Object.fromEntries(
    ops
      .filter((o): o is AnyOperation & { outcome: Outcome } =>
        o.outcome !== undefined && !isSilent(o.outcome))
      .map((o) => [o.id, o.outcome]),
  );

/**
 * WHICH OF AN APP'S OPERATIONS SPEND CREDITS — derived from the one fact that
 * makes them metered, which is that they declare a model to run.
 *
 * ⚠️ A CONTROL THAT SPENDS MONEY HAS TO SAY SO BEFORE IT IS PRESSED. Every AI
 * operation here reserves against the workspace's wallet and settles what it
 * used; a screen that draws the control and says nothing takes the decision
 * away from the person making it, and the first they hear of it is a smaller
 * balance on a screen they were not on.
 *
 * ⚠️ AND IT IS DERIVED RATHER THAN WRITTEN, because a sentence an app types is
 * a claim it can forget to remove and can make about an operation that costs
 * nothing. This cannot be either: the same field that makes the run metered is
 * the field this reads.
 *
 * ⚠️ THE IDS, NOT AN ESTIMATE. What a run costs is known after the tokens are
 * counted — a figure before the press would be a guess printed as a price. The
 * honest fact available at that moment is THAT it costs, and that is enough for
 * somebody deciding whether to press.
 */
export const meteredIds = (ops: readonly AnyOperation[]): readonly string[] =>
  ops.filter((o) => o.ai !== undefined).map((o) => o.id);

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
  | "credits_without_a_cost" | "proof_on_a_read" | "unrecorded_write"
  | "unreported_write";

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
  /*
    ⚠️ AND NOTHING TO SAY IS A DECISION SOMEBODY MAKES, NOT A FIELD LEFT BLANK.
    A person pressed something and waited; what they get back is either a
    sentence or a screen that visibly changed, and which one it is belongs in
    the declaration rather than in whichever screen happened to call it. Left
    optional, fifteen of fifty writes said nothing — none of them deliberately.
  */
  if (op.kind === "write" && op.outcome === undefined) {
    at("unreported_write", "nothing said when it worked and no reason given — see `outcome`");
  }
  /* ⚠️ A REASON THAT IS A LABEL IS NOT A REASON. Same floor as a guard's
     `fails`: "n/a" and "none" are how a required field becomes optional again. */
  if (op.outcome && isSilent(op.outcome) && op.outcome.why.trim().length < 20) {
    at("unreported_write", `"${op.outcome.why}" is a label, not a reason to say nothing`);
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

export type { FieldSpec };
