/**
 * WHAT A PRODUCT NEEDS UNDERNEATH IT, DECLARED — and what each kind of thing can
 * legally be asked to promise.
 *
 * ⚠️ A NEED IS A DECLARATION, NOT A CALL (D12). An app that reached for a queue
 * by writing a binding into a config file would be an app whose infrastructure
 * is invisible to everything here — the placement rule, the residency promise,
 * the processing record, the reconciler and the bill. It says what it needs and
 * the deployment makes it exist.
 *
 * ⚠️ AND THE HALF THAT MATTERS IS `holds`. The point of declaring a queue is not
 * that somebody creates a queue; it is that a queue carrying a customer's health
 * data under an EU residency promise is a promise the platform CANNOT KEEP, and
 * the only moment anybody would notice is a regulator asking. `refuseNeeds` is
 * that question, asked at composition, in a repository where composition already
 * refuses a permission no role can hold.
 *
 * ⚠️ THE RESIDENCY TABLE BELOW IS A STATEMENT ABOUT CLOUDFLARE, NOT ABOUT US,
 * and it is the reason this file exists rather than a convention. Every entry
 * was checked against the vendor's own documentation, and three of them say no:
 *
 *   d1     jurisdiction at creation, and it CANNOT BE CHANGED afterwards
 *   r2     jurisdiction at creation, and it CANNOT BE CHANGED afterwards
 *   do     `.jurisdiction("eu")` at runtime; fixed for the life of an id
 *   kv     private beta only — so: no
 *   queue  nothing documented — so: no
 *   ai     no residency guarantee at all — so: no
 *
 * ⚠️ THE TWO IMMUTABLE ONES ARE WHY "MOVE THIS WORKSPACE TO THE EU" IS A
 * MIGRATION AND NEVER A SETTING. There is no edit that changes where a database
 * lives; there is only a new database and a copy. Anything offering a
 * residency dropdown would be offering a field whose value the storage layer
 * refuses to honour, and the mismatch would be silent.
 *
 * Layer 3. Imports primitives, field and tenancy.
 */

import type { Holding } from "./field.js";
import type { Residency } from "./tenancy.js";

/* ------------------------------------------------------------------ kinds --- */

export type ResourceKind = "d1" | "kv" | "r2" | "queue" | "ai" | "do";

/**
 * WHAT A KIND OF STORE IS CALLED IN FRONT OF SOMEBODY.
 *
 * ⚠️ `d1`, `r2` AND `kv` ARE ONE VENDOR'S PRODUCT NAMES, and the operator screen
 * was printing them as though they described anything: a row reading "d1 · the
 * EU · SHARD_EU_1", and a withheld need explaining that "a ai carries personal
 * data". The names are here rather than in a screen because the refusal
 * sentences are written here too, and two wordings of one closed set is how they
 * come to disagree.
 */
const KIND: Readonly<Record<ResourceKind, string>> = {
  d1: "database",
  kv: "cache",
  r2: "bucket",
  queue: "queue",
  ai: "model provider",
  do: "coordinator",
};

export const sayKind = (kind: ResourceKind): string => KIND[kind] ?? kind;

/**
 * ⚠️ WHETHER THIS KIND CAN BE HELD TO A RESIDENCY, per the vendor. A `false`
 * here is not a gap in our implementation and cannot be closed by writing more
 * code — it is a capability the platform underneath does not have, and the only
 * correct response is to refuse to put personal data through it under a promise
 * we would then be breaking.
 */
export const KEEPS_RESIDENCY: Readonly<Record<ResourceKind, boolean>> = {
  d1: true,
  r2: true,
  do: true,
  kv: false,
  queue: false,
  ai: false,
};

/**
 * ⚠️ WHETHER THE DEPLOYMENT HAS TO CREATE ONE. `ai` is a capability rather than
 * a resource — there is nothing to make, only a binding to add — and `do`
 * namespaces come from a MIGRATION against a class that is already in the
 * deployed code, so neither is something the reconciler can conjure.
 */
export const IS_CREATED: Readonly<Record<ResourceKind, boolean>> = {
  d1: true, kv: true, r2: true, queue: true, ai: false, do: false,
};

/* ------------------------------------------------------------------ needs --- */

export interface NeedDef {
  /** Unique within the app. Part of the resource's name, so it is a label. */
  readonly id: string;
  readonly kind: ResourceKind;
  /** What it is for, in a sentence a customer could read. It reaches the record. */
  readonly why: string;
  /**
   * ⚠️ THE STRONGEST CATEGORY OF PERSONAL DATA THAT PASSES THROUGH IT — not what
   * is stored in it, what PASSES through. A queue that carries a message naming
   * somebody, consumed and dropped a second later, has still taken that name out
   * of the jurisdiction it was promised to.
   */
  readonly holds: Holding;
  /**
   * ⚠️ ONE PER RESIDENCY, OR ONE FOR THE WHOLE DEPLOYMENT. `perResidency` is the
   * honest default for anything holding personal data: one database per
   * jurisdiction, because a single shared one is a single jurisdiction for
   * everybody. A cache of public reference data is legitimately global.
   */
  readonly perResidency?: boolean;
}

export type NeedBook = Readonly<Record<string, NeedDef>>;

export const need = (def: NeedDef): NeedDef => def;

/* ---------------------------------------------------------------- derived --- */

/**
 * ⚠️ THE ONE NEED NO APP DECLARES, BECAUSE THE FIELD ALREADY DID. A collection
 * with a `media` field holds files; files live in a bucket; there is exactly one
 * right answer to which bucket, and asking every app to write it out is asking
 * every app to get it wrong once — a missing declaration is a media field with
 * nowhere to put anything, and it fails at the first upload rather than at
 * composition.
 *
 * ⚠️ AND IT IS `perResidency`, NECESSARILY. An uploaded file is whatever
 * somebody put in it, so its holding is unknowable and has to be assumed to be
 * the worst — which means one bucket per jurisdiction, in that jurisdiction. A
 * single shared bucket would be a single jurisdiction for everybody.
 */
export const MEDIA_NEED = "media";

export const mediaNeedFor = (holdsAnyFiles: boolean): NeedDef | null =>
  holdsAnyFiles
    ? {
      id: MEDIA_NEED, kind: "r2", perResidency: true,
      /* ⚠️ `sensitive`, and not because anybody said so. Nobody can know what is
         in an uploaded file — a photograph of a prescription is a special
         category and looks exactly like a photograph of a cat to every check
         this framework has. Assuming the worst is the only assumption that is
         not a guess about somebody else's upload. */
      holds: "sensitive",
      why: "Holds the files people upload here.",
    }
    : null;

/* ------------------------------------------------------------------ names --- */

const SAFE = /^[a-z][a-z0-9-]*$/;

/**
 * ⚠️ THE NAME IS DERIVED, NEVER TYPED, and it is what the reconciler matches on.
 * A name somebody could edit is a name that drifts from the row describing it —
 * and `d1 create` succeeds under any name it has not seen, so the drift does not
 * error: it silently makes a SECOND, empty database, and every request then
 * succeeds against nothing while the real rows sit in the first one.
 */
export function resourceName(
  deployment: string, appId: string, need: NeedDef, where: Residency | null,
): string {
  for (const part of [deployment, appId, need.id]) {
    if (!SAFE.test(part)) throw new Error(`"${part}" cannot be part of a resource name`);
  }
  return [deployment, appId, need.kind, need.id, where].filter(Boolean).join("-");
}

/**
 * ⚠️ AND SO IS THE BINDING NAME, FOR THE SAME REASON ONE LEVEL UP. `env` is
 * addressed by this string; two authorities for it is a binding that exists
 * under one name and is read under another, which is `undefined` at the first
 * request that needs it and nothing at all before then.
 */
export function bindingName(appId: string, need: NeedDef, where: Residency | null): string {
  return [appId, need.id, where].filter(Boolean)
    .join("_").toUpperCase().replace(/-/g, "_");
}

/* --------------------------------------------------------------- refusals --- */

export type NeedRefusal =
  | "residency_cannot_be_kept"
  | "not_ours_to_create"
  | "duplicate_binding";

export interface NeedProblem {
  readonly of: string;
  readonly why: NeedRefusal;
  readonly detail: string;
}

/**
 * WHAT AN APP'S INFRASTRUCTURE DECLARATION CANNOT BE ALLOWED TO SAY.
 *
 * ⚠️ `residency_cannot_be_kept` IS THE ONE THAT EARNS THIS FILE. Everything else
 * here is hygiene; this is a promise made to a business about their customers'
 * data, contradicted by the storage underneath it, with nothing on any screen
 * and nothing in any log. It is found by a regulator or by nobody.
 *
 * ⚠️ AND IT IS ASKED OF THE RESIDENCIES A DEPLOYMENT ACTUALLY SERVES. A
 * deployment with no EU workspaces is not making an EU promise, so a queue
 * carrying a name is not breaking one — refusing it there would teach everybody
 * that the check is noise, and a check people route around is worse than none.
 */
export function refuseNeeds(
  needs: NeedBook,
  serves: readonly Residency[],
): readonly NeedProblem[] {
  const out: NeedProblem[] = [];
  const at = (of: string, why: NeedRefusal, detail: string) => out.push({ of, why, detail });

  /* ⚠️ `global` is the deployment's own default region, named honestly. It is
     not a promise, so nothing can break it. */
  const promises = serves.filter((r) => r !== "global");

  const seen = new Set<string>();
  for (const n of Object.values(needs)) {
    if (seen.has(n.id)) at(n.id, "duplicate_binding", "two needs share an id, so one binding is both");
    seen.add(n.id);

    if (n.holds !== "none" && promises.length && !KEEPS_RESIDENCY[n.kind]) {
      at(n.id, "residency_cannot_be_kept",
        `a ${sayKind(n.kind)} carries ${n.holds} data and cannot be held to ${promises.join("/")} — `
        + `the vendor offers no residency control for it, so the promise is broken the first time it runs`);
    }
  }
  return out;
}

/* ------------------------------------------------------------- the ladder --- */

/**
 * WHERE A RESOURCE IS IN ITS LIFE.
 *
 * ⚠️ `bound` AND `live` ARE DIFFERENT, AND CONFLATING THEM IS THE BUG THIS WHOLE
 * STATE MACHINE EXISTS FOR. Adding a binding is a PATCH that produces a new
 * version of the worker; the isolate that made the call is running the old one
 * and cannot see it, and neither can any isolate already serving. A reconciler
 * that wrote `live` after a successful PATCH would report a resource as usable
 * for however long the rollout takes, and every read through it would be
 * `undefined` — which is not an error, it is an empty answer.
 *
 * ⚠️ AND `draining` IS NOT `gone`. A resource whose need disappeared is a typo
 * away from a database somebody still has customers on, so nothing is ever
 * deleted on the pass that notices. It drains for a stated number of days and is
 * reaped later, which is the only version of this that survives a bad edit.
 */
export type ResourceState =
  | "wanted" | "creating" | "created" | "bound" | "live" | "draining" | "gone" | "failed";

export const LIVE_STATES: readonly ResourceState[] = ["created", "bound", "live"];

/**
 * ⚠️ THE GRACE IS IN DAYS AND IT IS DELIBERATELY LONG. The cost of holding an
 * empty database for a month is pennies; the cost of the other mistake is
 * somebody's records. Erasure obligations are met by the ROW-level purge, which
 * runs on its own ladder — this window is about the container, so lengthening it
 * withholds nothing from anybody.
 */
export const DRAIN_DAYS = 30;
