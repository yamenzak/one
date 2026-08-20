/**
 * A SWITCH THAT IS OURS.
 *
 * ⚠️ A FLAG IS OUR DECISION AND AN ENTITLEMENT IS THEIR PURCHASE, and the whole
 * reason both exist is that they refuse differently. A customer told to upgrade
 * for something we have turned off has been sold something that does not exist —
 * so an unset flag answers "no such thing" and never "pay us".
 *
 * ⚠️ THE DEPLOYMENT'S `off` IS ABSORBING. A flag exists so a thing can be turned
 * off in a hurry — during an incident, on legal advice, because it is costing
 * money — and a switch a tenant can override is not that switch. Every other
 * level may only narrow what the level above allows.
 *
 * ⚠️ AND A FLAG IS TEMPORARY BY CONSTRUCTION. One with no retirement date is a
 * permanent branch in the code that nobody will ever delete, because deleting it
 * means finding out who is relying on it. `retire` is required while it is being
 * tried, and a flag past its date is reported rather than enforced — taking a
 * capability away on a date somebody typed a year ago is not a kindness.
 *
 * Layer 2. Imports primitives.
 */

import type { Day } from "./primitives.js";

/* ------------------------------------------------------------------ shape --- */

/**
 *   building  ours only. Nobody outside the deployment sees it.
 *   trying    on for some, off for others. This is the state that needs a date.
 *   on        it is the product now. The flag is waiting to be deleted.
 */
export type Stage = "building" | "trying" | "on";

/** The lowest authority that may set it. Everything above may always set it. */
export type SetBy = "operator" | "tenant" | "person";

export interface FlagDef {
  readonly id: string;
  readonly label: string;
  /** ⚠️ What it is FOR, in a sentence. A flag whose purpose is lost is a flag
      nobody dares remove, which is how a codebase acquires permanent branches. */
  readonly why: string;
  readonly stage: Stage;
  readonly fallback: boolean;
  readonly setBy: SetBy;
  /** ⚠️ Required while `trying`. See the header. */
  readonly retire?: Day;
}

export type FlagBook = Readonly<Record<string, FlagDef>>;

export const flag = (def: FlagDef): FlagDef => def;

/* ---------------------------------------------------------------- resolve --- */

export interface Switches {
  readonly deployment?: boolean;
  readonly tenant?: boolean;
  /**
   * ⚠️ THIS PERSON IN THIS WORKSPACE, never this person. Early access at one
   * workspace is not early access at another: the workspace decided it, for
   * somebody on its own roster, and the same account somewhere else is somebody
   * else's member. A row keyed by account alone would carry one workspace's
   * decision into every other workspace that account belongs to.
   */
  readonly person?: boolean;
}

/**
 * Whether a flag is on, for this request.
 *
 * ⚠️ ONE WALK, AND `false` AT A HIGHER LEVEL WINS. Anything else makes the kill
 * switch advisory — and a kill switch that a tenant setting can beat is one that
 * does not work on the day it is needed, which is the only day it is used.
 *
 * ⚠️ A STORED VALUE IS HONOURED AT EVERY LEVEL, AND `setBy` IS NOT CONSULTED
 * HERE. Both branches used to be gated on it and both were wrong for the way a
 * feature is actually released. The tenant branch ignored a workspace's row for
 * a flag declaring `setBy: "operator"` — so a switch only WE control, which is
 * most of them, could never be given to one customer at a time, which is the
 * whole point of releasing it to a workspace. The person branch only applied
 * when the person could set it themselves, so a workspace choosing which of its
 * own members get a feature was writing rows nothing read.
 *
 * ⚠️ WHO MAY WRITE A ROW IS THE ROUTE'S QUESTION, and it is answered there. A
 * stored value exists only because somebody entitled to store it did — the
 * operator from the console, the workspace's own authority, or the person for a
 * flag that says they may. Asking again while READING answers a different
 * question badly: it silently discards decisions that were correctly made.
 */
export function resolve(def: FlagDef, switches: Switches = {}): boolean {
  let on = def.fallback;
  if (switches.deployment !== undefined) on = switches.deployment;
  if (switches.deployment === false) return false;

  if (switches.tenant !== undefined) on = switches.tenant;
  if (switches.tenant === false) return false;

  if (switches.person !== undefined) on = switches.person;
  return on;
}

/**
 * EVERY DECLARED FLAG, ANSWERED ONCE, FOR ONE REQUEST.
 *
 * ⚠️ ONE RESOLUTION OR THE SCREEN AND THE ROUTE DISAGREE. A gate reading the
 * stored rows directly and a nav filtering on `fallback` are two answers to
 * "is this on", and they differ on exactly the case that matters: a flag
 * nobody has switched, where the row is absent and the fallback is `true`. The
 * product then offers a destination its own route refuses.
 *
 * ⚠️ AND IT IS EVERY DECLARED FLAG, NOT EVERY STORED ROW. An unset flag has no
 * row and still has an answer — its `fallback` — so a map built from the store
 * is missing precisely the flags nobody has touched, which is most of them.
 */
export const resolveFlags = (
  books: readonly FlagBook[],
  switches: {
    readonly deployment?: Readonly<Record<string, boolean>>;
    readonly tenant?: Readonly<Record<string, boolean>>;
    readonly person?: Readonly<Record<string, boolean>>;
  } = {},
): Readonly<Record<string, boolean>> => {
  const out: Record<string, boolean> = {};
  for (const book of books) {
    for (const def of Object.values(book)) {
      out[def.id] = resolve(def, {
        ...(switches.deployment?.[def.id] !== undefined
          ? { deployment: switches.deployment[def.id] } : {}),
        ...(switches.tenant?.[def.id] !== undefined ? { tenant: switches.tenant[def.id] } : {}),
        ...(switches.person?.[def.id] !== undefined ? { person: switches.person[def.id] } : {}),
      });
    }
  }
  return out;
};

/** ⚠️ What a screen shows beside the switch: who can still change it from here. */
export const settableBy = (def: FlagDef, switches: Switches = {}): readonly SetBy[] => {
  if (switches.deployment === false) return ["operator"];
  if (def.setBy === "operator") return ["operator"];
  if (switches.tenant === false) return ["operator", "tenant"];
  if (def.setBy === "tenant") return ["operator", "tenant"];
  return ["operator", "tenant", "person"];
};

/* ------------------------------------------------------------------ rules --- */

export type FlagRefusal = "trying_without_a_date" | "no_reason" | "shipped_with_a_date";

export interface FlagProblem { readonly flag: string; readonly why: FlagRefusal; readonly detail: string }

export function refuseFlag(def: FlagDef): readonly FlagProblem[] {
  const out: FlagProblem[] = [];
  const at = (why: FlagRefusal, detail: string) => out.push({ flag: def.id, why, detail });

  if (!def.why.trim()) at("no_reason", "no reason given, so nobody will ever dare delete it");
  if (def.stage === "trying" && !def.retire) {
    at("trying_without_a_date", "being tried with no date to stop trying");
  }
  if (def.stage === "on" && def.retire) {
    at("shipped_with_a_date", "it is the product now — the flag is what should go, not the date");
  }
  return out;
}

export const refuseFlags = (book: FlagBook): readonly FlagProblem[] =>
  Object.values(book).flatMap(refuseFlag);

/**
 * ⚠️ REPORTED, NEVER ENFORCED. A flag whose date has passed is a conversation
 * for the console — withholding a capability because of a date typed a year ago
 * is an outage nobody asked for.
 */
export const overdue = (book: FlagBook, today: Day): readonly string[] =>
  Object.values(book).filter((f) => f.retire && f.retire < today).map((f) => f.id);

/** ⚠️ A flag nothing reads is a switch that does nothing (see `setting.unread`). */
export const unreadFlags = (book: FlagBook, named: readonly string[]): readonly string[] =>
  Object.keys(book).filter((id) => !named.includes(id));
