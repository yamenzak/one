/**
 * THE SURFACE — one declaration, four transports.
 *
 * Layer 4. Imports primitives, problem, standing, operation.
 *
 * An `operation` is declared once. This module derives the HTTP route, the AI
 * tool, the webhook event, the audit entry and the OpenAPI document from it, and
 * runs the gates that every transport shares.
 *
 * ⚠️ THE PROPERTY THE WHOLE FILE EXISTS FOR: the tool surface is the route
 * surface MASKED BY THE CALLER. `toolsFor` and `check` read the same
 * declarations, so they cannot disagree — a second list kept in step by hand is
 * how a product ships an assistant that can do more than the person operating
 * it, with nothing failing anywhere. `test/surface.test.ts` asserts the
 * equivalence over every operation against every caller rather than sampling it.
 */

import type { BindingSpec } from "./bindings.js";
import type { Allowance } from "./entitlement.js";
import { grants, withinQuota } from "./entitlement.js";
import type { OperationSpec } from "./operation.js";
/* ⚠️ Re-exported: `PUBLIC` is what a `permission` field may say, so it lives
   beside the field. Every existing importer reads it from here. */
import { PUBLIC } from "./operation.js";
export { PUBLIC };
import type { StandingGate } from "./standing.js";
import { permits } from "./standing.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous by nature; see FINDINGS §4
export type AnyOperation = OperationSpec<BindingSpec, any, any, string>;

/* ------------------------------------------------------------------ route --- */

export interface Route {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly operationId: string;
}

/**
 * The HTTP shape of an operation.
 *
 * ⚠️ THE OPERATION ID IS THE PATH, and that is a deliberate choice against REST.
 *
 * A resource-and-verb mapping has to decide which segment is an identifier and
 * which verb expresses "publish", "grant" or "reconcile" — decisions with no
 * right answer that must then be made identically by the router, the typed
 * client, the OpenAPI document and whoever writes the tool description. The id
 * is already unique and already the name; using it directly means there is no
 * mapping to get wrong in four places.
 *
 * A read is `GET` so it is cacheable and so the standing gate can let it through
 * without inspecting anything else; a write is `POST`.
 */
export function routeFor(op: AnyOperation): Route {
  return { method: op.kind === "read" ? "GET" : "POST", path: `/api/${op.id}`, operationId: op.id };
}

/* ------------------------------------------------------------------- gate --- */

/** Everything the gates need, resolved once per request. */
export interface Caller {
  readonly permissions: ReadonlySet<string>;
  /**
   * What the TENANT bought from us — the resolved VALUES, not the names.
   *
   * ⚠️ A SET WOULD LOSE THE CEILING. Half of what a plan sells is a number, and
   * a gate holding only the keys can answer "is this included" but never "is
   * there room for one more" — so the count gets asked somewhere else, against
   * some other copy of the plan, and the two answers drift.
   */
  readonly entitlements: Readonly<Record<string, Allowance>>;
  /** What the tenant's own CUSTOMER bought from them. Absent where an app has no such rail. */
  readonly customerFlags?: ReadonlySet<string>;
  readonly gate: StandingGate;
}

export type Refusal = "standing" | "permission" | "entitlement" | "customer_flag" | "quota";

export type Verdict =
  | {
      readonly allowed: true;
      /** Which shaped keys this caller receives. Empty when the op has no `shape`. */
      readonly included: Readonly<Record<string, boolean>>;
      /** Row-level scope still to be checked, with I/O, by the runner. */
      readonly scopeRequired: boolean;
      /**
       * ⚠️ A CEILING STILL TO BE COUNTED AGAINST, reported rather than silently
       * skipped — the same treatment as row scope, and for the same reason.
       *
       * Counting needs a query, and this function is pure so that `toolsFor` can
       * filter a whole catalogue without touching a store. Returning the
       * obligation makes it something the runner must discharge; omitting it
       * would make a forgotten quota look exactly like a collection that has
       * none.
       */
      readonly quotaRequired: { readonly key: string; readonly allowance: Allowance } | null;
    }
  | { readonly allowed: false; readonly refusal: Refusal };

/**
 * The gates, in order, for every transport.
 *
 * The order is cheapest-and-broadest first: standing is one boolean about the
 * whole tenant, permission is a set lookup, and the two commerce gates are the
 * narrowest. Cost is not the reason it matters, though — a caller refused by
 * standing should be told the workspace is read-only rather than that they lack
 * a permission they in fact hold.
 *
 * ⚠️ ROW SCOPE IS NOT CHECKED HERE, and cannot be: it needs a database read, and
 * this function is pure so that `toolsFor` can use it to filter a catalogue
 * without touching a store. It is REPORTED instead — `scopeRequired` — and the
 * runner performs it before the handler. A gate that silently skipped it would
 * be the worst failure in the file, so it is a returned obligation rather than
 * an omission.
 */

export function check(op: AnyOperation, caller: Caller): Verdict {
  if (!permits(caller.gate, laneOf(op), op.kind === "write")) return { allowed: false, refusal: "standing" };
  if (op.permission !== PUBLIC && !caller.permissions.has(op.permission)) return { allowed: false, refusal: "permission" };
  if (op.entitlement && !grants(caller.entitlements[op.entitlement] ?? false)) return { allowed: false, refusal: "entitlement" };
  if (op.customerFlag && !(caller.customerFlags?.has(op.customerFlag) ?? false)) {
    return { allowed: false, refusal: "customer_flag" };
  }
  /*
    ⚠️ A CEILING OF ZERO IS REFUSED HERE RATHER THAN COUNTED. Nothing fits under
    it, so the count is a query whose answer cannot change the verdict — and a
    tool catalogue filtered without one would still offer the operation, which
    is a promise the first call breaks.
  */
  const allowance = op.quota === undefined ? undefined : caller.entitlements[op.quota] ?? false;
  if (allowance !== undefined && !withinQuota(allowance, 0)) return { allowed: false, refusal: "quota" };
  return {
    allowed: true,
    included: shapeFor(op, caller),
    scopeRequired: Boolean(op.scope),
    quotaRequired: op.quota !== undefined && allowance !== undefined ? { key: op.quota, allowance } : null,
  };
}

/** The standing lane an operation belongs to — its id's first segment. */
export const laneOf = (op: AnyOperation): string => op.id.split(".")[0] ?? "";

/**
 * ⚠️ SHAPING, NOT REFUSING.
 *
 * A response carrying several capabilities where the caller bought some must
 * withhold the rest and SAY SO. Refusing outright takes the ungated parts down
 * with the sold ones; returning everything gives away what was not paid for; and
 * returning a quietly thinner payload makes "withheld" and "empty" the same
 * answer, so no screen can tell the difference either.
 *
 * `included` is what makes the third case impossible: the response reports which
 * keys are present, so a client renders "not in your plan" rather than "nothing
 * here".
 */
export function shapeFor(op: AnyOperation, caller: Caller): Readonly<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  for (const [key, flag] of Object.entries(op.shape ?? {})) {
    out[key] = caller.customerFlags?.has(flag) ?? grants(caller.entitlements[flag] ?? false);
  }
  return out;
}

/* ------------------------------------------------------------------- tool --- */

export interface Tool {
  /** Dots are not valid in a tool name for most providers. */
  readonly name: string;
  readonly description: string;
  readonly operationId: string;
  readonly mutates: boolean;
}

export const toolNameFor = (op: AnyOperation): string => op.id.replace(/\./g, "_");

/**
 * The tools a caller may see.
 *
 * ⚠️ THIS IS `check` OVER THE SAME CATALOGUE, AND THAT IS THE ENTIRE SAFETY
 * ARGUMENT. Not a parallel allow-list, not a second registry, not a flag an
 * author remembers to set — one filter over one set of declarations, so the
 * assistant's reach is the caller's reach by construction.
 *
 * `tool: false` removes an operation from every caller, with a stated reason.
 * Exposure is opt-OUT rather than opt-in because an opt-in list is one somebody
 * forgets to extend, and the symptom of that is an assistant that mysteriously
 * cannot do things the person in front of it can.
 */
export function toolsFor(ops: readonly AnyOperation[], caller: Caller): readonly Tool[] {
  return ops
    .filter((op) => op.tool !== false)
    .filter((op) => check(op, caller).allowed)
    .map((op) => ({
      name: toolNameFor(op),
      description: op.summary,
      operationId: op.id,
      mutates: op.kind === "write",
    }));
}

/* ---------------------------------------------------------------- webhook --- */

export interface WebhookEvent {
  readonly event: string;
  readonly operationId: string;
}

/**
 * The events a tenant may subscribe to, derived from what operations emit.
 *
 * The same declaration drives notification dispatch, so an event cannot exist in
 * one and not the other — and an operation cannot quietly raise something
 * nothing can receive.
 */
export function webhookEventsFor(ops: readonly AnyOperation[]): readonly WebhookEvent[] {
  const seen = new Set<string>();
  const out: WebhookEvent[] = [];
  for (const op of ops) {
    for (const event of op.emits ?? []) {
      if (seen.has(event)) continue;
      seen.add(event);
      out.push({ event, operationId: op.id });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ audit --- */

export interface AuditEntry {
  readonly operationId: string;
  readonly subject: string;
  readonly verb: string;
  /** ⚠️ Which transport. An action taken BY a tool is worth telling apart. */
  readonly via: "http" | "tool";
}

export function auditFor(op: AnyOperation, input: unknown, via: AuditEntry["via"]): AuditEntry | null {
  if (!op.audit) return null;
  const { subject, verb } = op.audit(input);
  return { operationId: op.id, subject, verb, via };
}

/* ---------------------------------------------------------------- openapi --- */

export interface OpenApiPath {
  readonly path: string;
  readonly method: string;
  readonly operationId: string;
  readonly summary: string;
  /** Declared failures, so a client knows what it may have to render. */
  readonly responses: readonly number[];
}

/**
 * The document, derived.
 *
 * Hand-written API documentation is level 5 on the ranking in STANDARDS.md and
 * drifts the first time a route changes. This is level 4: generated from the
 * declarations that also produce the routes, so it cannot describe an endpoint
 * that does not exist or omit one that does.
 */
export function openApiFor(ops: readonly AnyOperation[], problemStatus: Readonly<Record<string, number>>): readonly OpenApiPath[] {
  return ops.map((op) => {
    const route = routeFor(op);
    const failures = (op.fails ?? []).map((code) => problemStatus[code]).filter((s): s is number => typeof s === "number");
    return {
      path: route.path,
      method: route.method,
      operationId: op.id,
      summary: op.summary,
      responses: [...new Set([200, ...failures])].sort((a, b) => a - b),
    };
  });
}
