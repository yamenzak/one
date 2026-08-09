/**
 * STATES — closed sets, declared, and photographed.
 *
 * ⚠️ "DID YOU DO THE LOADING STATE" IS A REVIEW QUESTION ASKED IN THE FIRST
 * MONTH AND NOT IN THE SIXTH. A component is not finished when it renders; it is
 * finished when every state it can be in has been designed. That has to be
 * structural, or it is a checklist that decays into a habit and then into
 * nothing.
 */

/** What a control is doing. Closed — a sixth is a design change, not a prop. */
export const INTERACTION = ["idle", "hover", "pressed", "focus", "busy", "disabled", "invalid", "locked"] as const;
export type Interaction = (typeof INTERACTION)[number];

/**
 * What a container knows.
 *
 * ⚠️ `unknown` IS NOT `empty`, AND THIS IS THE STATE MOST SYSTEMS OMIT. A
 * container that has not been answered yet is not a container with no results.
 * Collapsing them makes a failed load, a pending load and a genuinely empty
 * collection render identically — a confident, wrong fact wearing a loading
 * state's excuse.
 *
 * `partial` exists because responses are SHAPED: an operation may withhold what
 * the caller did not buy and say so, and a silently thinner screen makes
 * "withheld" and "empty" the same pixel.
 */
export const DATA = ["unknown", "empty", "partial", "error", "ready"] as const;
export type DataState = (typeof DATA)[number];

/** What a fetch's outcome means, before anything is rendered from it. */
export function dataStateOf<T>(input: {
  readonly value: readonly T[] | null | undefined;
  readonly failed?: boolean;
  readonly withheld?: Readonly<Record<string, boolean>>;
}): DataState {
  if (input.failed) return "error";
  /*
    ⚠️ `null` MEANS NOT KNOWN, AND `undefined` MEANS THE SAME. Neither is `[]`.
    A component that seeds an empty array and renders it as fact says "nothing
    here" for the length of a round trip, and says it again, permanently, when
    the round trip fails and somebody wrote `catch(() => setItems([]))`.
  */
  if (input.value === null || input.value === undefined) return "unknown";
  if (input.withheld && Object.values(input.withheld).some((included) => !included)) return "partial";
  return input.value.length === 0 ? "empty" : "ready";
}

/* ------------------------------------------------------------- refusal --- */

export type Refusal =
  /** ⚠️ Carries a reason, always. A control that refuses without saying why is the most common product failure there is. */
  | { readonly kind: "disabled"; readonly reason: string }
  /** Withheld by a plan, a permission or an entitlement — with the way out. */
  | { readonly kind: "locked"; readonly reason: string; readonly resolve?: string };

/**
 * ⚠️ GATED IS NOT DISABLED.
 *
 * Anything withheld by a plan, an entitlement or a permission renders as LOCKED
 * with the route out of it — never as greyed-out furniture. A disabled control
 * cannot explain itself, cannot be focused, cannot be read by assistive
 * technology, and cannot sell anything.
 */
export function refusalFor(input: { readonly gated?: boolean; readonly reason: string; readonly resolve?: string }): Refusal {
  return input.gated
    ? { kind: "locked", reason: input.reason, ...(input.resolve ? { resolve: input.resolve } : {}) }
    : { kind: "disabled", reason: input.reason };
}

/* ------------------------------------------------------------ registry --- */

export interface ComponentStates {
  readonly id: string;
  readonly interaction: readonly Interaction[];
  readonly data?: readonly DataState[];
}

export interface StateProblem { readonly id: string; readonly detail: string }

/**
 * ⚠️ A COMPONENT DECLARES ITS STATES OR IT IS NOT REGISTERED.
 *
 * The declaration is what the conformance suite renders and photographs, so an
 * undeclared state is one nobody has looked at. Two rules fall out and both are
 * refusals rather than warnings: `idle` is not optional (there is no component
 * with no resting state), and a container that declares `empty` must declare
 * `unknown` too — otherwise it has said, in the declaration, that it intends to
 * render an unanswered fetch as a fact.
 */
export function validateStates(components: readonly ComponentStates[]): readonly StateProblem[] {
  const out: StateProblem[] = [];
  const seen = new Set<string>();
  for (const c of components) {
    if (seen.has(c.id)) out.push({ id: c.id, detail: "is registered twice" });
    seen.add(c.id);
    if (!c.interaction.includes("idle")) out.push({ id: c.id, detail: "declares no `idle` state" });
    for (const state of c.interaction) {
      if (!INTERACTION.includes(state)) out.push({ id: c.id, detail: `declares unknown interaction state "${state}"` });
    }
    if (c.data?.includes("empty") && !c.data.includes("unknown")) {
      out.push({ id: c.id, detail: "declares `empty` and not `unknown` — an unanswered fetch would render as a fact" });
    }
    if (c.interaction.includes("disabled") && c.interaction.includes("locked")) {
      out.push({ id: c.id, detail: "declares both `disabled` and `locked` — gated is one or the other, and locked is the one that can explain itself" });
    }
  }
  return out;
}

/** Every state a component declares, as the matrix a suite photographs. */
export const matrixFor = (c: ComponentStates): readonly string[] => [
  ...c.interaction.map((i) => `${c.id}/${i}`),
  ...(c.data ?? []).map((d) => `${c.id}/data:${d}`),
];
