/**
 * `defineApp` — the composition, and the whole of what a product declares.
 *
 * Layer 4. Imports everything below it and nothing beside it.
 *
 * The fields here are the ones MANIFEST.md §9 marks as day-zero: each implies a
 * column, a table, or a behaviour that cannot be applied retroactively. Several
 * are typed and unimplemented on purpose — the point of stage 0 is that adding
 * the behaviour later is filling something in, rather than migrating a platform
 * that has tenants on it.
 */

import type { BindingSpec } from "./bindings.js";
import type { CollectionSpec } from "./collection.js";
import type { FlagDef } from "./customer.js";
import type { EntitlementDef, PlanSpec } from "./entitlement.js";
import { parkingAboveFloor } from "./entitlement.js";
import type { Currency, Locale, RegionId, TimeZone, UnitSystem } from "./primitives.js";
import type { ProblemCatalog, ProblemDef } from "./problem.js";
import { PLATFORM_PROBLEMS } from "./problem.js";
import type { OperationSpec } from "./operation.js";

/* -------------------------------------------------------------- identity --- */

/**
 * ⚠️ ONE ACCOUNT, ONE CREDENTIAL, SEPARATE SESSIONS.
 *
 * The passkey relying party is the ROOT, so a credential registered on one
 * product is offered on the next and first sign-in there is one biometric tap
 * rather than a sign-up. Sessions stay per-origin: an account shared across
 * products is a feature, a session shared across them means a script injected
 * into any one product acts as that person in all of them.
 *
 * `rootRelyingParty` is a registrable domain, and raising it to the root is a
 * decision with a consequence worth writing down — nothing third-party may ever
 * be hosted under it, because anything there could then assert this RP.
 */
export interface IdentitySpec {
  readonly rootRelyingParty: string;
  readonly sessionScope: "origin";
  /** Identity is read at SIGN-IN; sessions are read per request. Hence one store. */
  readonly directoryRegion: RegionId;
}

/* --------------------------------------------------------------- tenancy --- */

export interface TenancySpec {
  /**
   * The host this app's doors hang off — `kova.4dl.app`.
   *
   * ⚠️ Declared rather than derived from `id` + the platform root, because a
   * deployment that differs (a preview, a local `localhost`, an app whose
   * product name is not its host) would otherwise have to override the identity
   * root to move its host, which silently moves the relying party with it and
   * invalidates every credential.
   */
  readonly appRoot: string;
  readonly doors: readonly ("root" | "setup" | "admin" | "slug" | "custom" | "device")[];
  readonly regions: readonly RegionId[];
  readonly defaultRegion: RegionId;
  /** Labels a tenant may not take — other doors, mail autoconfig, ACME, money words. */
  readonly reservedSlugs: readonly string[];
}

/* -------------------------------------------------------------- defaults --- */

/** What a value MEANS before anybody chooses how to see it. */
export interface FormatSpec {
  readonly currency: Currency;
  readonly timeZone: TimeZone;
  readonly locale: Locale;
  readonly units: UnitSystem;
  readonly weekStart: 0 | 1 | 6;
}

/* ---------------------------------------------------------------- access --- */

export interface AccessSpec {
  readonly permissions: readonly string[];
  readonly roles: Readonly<Record<string, readonly string[]>>;
  /** What the platform sells this app's tenants, and how each one is withheld. */
  readonly entitlements: Readonly<Record<string, EntitlementDef>>;
  /** The catalogue. Empty is a legitimate deployment — one with nothing for sale. */
  readonly plans: readonly PlanSpec[];
  /**
   * ⚠️ Whether this app sells to its tenants' own customers. Two flag systems,
   * never merged — and an app that says no may not then declare flags, because
   * the rail is what decides whether anything resolves them.
   */
  readonly customerRail: boolean;
  readonly customerFlags: Readonly<Record<string, FlagDef>>;
  /**
   * ⚠️ REQUIRED, and the empty list is the honest way to say "nothing counts".
   *
   * A seat model decides what a plan's ceiling is measured against, so it is a
   * day-zero declaration: arriving late means auditing every membership row for
   * what should have been counted since the first tenant signed up. Optional, it
   * is a field an app omits — which is indistinguishable from an app that has no
   * ceiling, right up until somebody is billed for the difference.
   */
  readonly seats: { readonly counts: readonly string[] };
}

/* --------------------------------------------------------------- consent --- */

export interface LegalDoc {
  readonly id: string;
  readonly version: string;
  /** ⚠️ Who must accept it, recorded per person per version. Not backfillable. */
  readonly mustAccept: readonly string[];
}

/* ------------------------------------------------------------ governance --- */

export interface GovernanceSpec {
  readonly legal: readonly LegalDoc[];
  /** ⚠️ Operator access to a tenant: time-boxed, audited, announced. From day one. */
  readonly impersonation: { readonly maxMinutes: number; readonly announce: boolean };
  readonly auditRetentionDays: number;
}

/* ------------------------------------------------------------ presentation --- */

export interface SoundSpec {
  /** The platform's audio set. An app names intent and never ships a file. */
  readonly pack: string;
  /** Per SURFACE, not per action: a station is audible, a dashboard is silent. */
  readonly surfaces: Readonly<Record<string, "on" | "off">>;
}

/* ------------------------------------------------------------------ app --- */

/**
 * ⚠️ THE CODES AN OPERATION IS ALLOWED TO FAIL WITH.
 *
 * The app's own catalogue plus the platform's, because the platform raises its
 * codes on an operation's behalf — the gate, the resolver and the router all
 * answer before a handler runs — so requiring an app to re-declare them would be
 * asking it to describe machinery it does not own.
 */
export type DeclaredCode<P extends ProblemCatalog> = (keyof P & string) | (keyof typeof PLATFORM_PROBLEMS & string);

/**
 * ⚠️ THE CHECK THAT MAKES A `Problem` CATALOGUE A CONTRACT RATHER THAN A LIST.
 *
 * An operation naming a code nobody declared is a failure with no copy, no
 * status and no help link — which at runtime becomes a generic 503 wearing the
 * shape of a specific answer, and no test anywhere fails. Resolving it at
 * composition time is the only place both halves are in scope.
 *
 * The mechanism: this evaluates to `never` when every `fails` entry is declared,
 * and to the offending literal otherwise — which `defineApp` turns into a type
 * error naming the code.
 */
export type UndeclaredFailure<O extends readonly { readonly fails?: readonly string[] }[], P extends ProblemCatalog> =
  Exclude<NonNullable<O[number]["fails"]>[number], DeclaredCode<P>>;

export interface AppSpec<B extends BindingSpec, P extends ProblemCatalog = ProblemCatalog> {
  readonly id: string;
  readonly name: string;
  /** ⚠️ Live data once anything is sold: it tags every Stripe object we create. */
  readonly stripeMetadataPrefix: string;

  readonly manifestVersion: string;
  readonly bindings: B;
  readonly identity: IdentitySpec;
  readonly tenancy: TenancySpec;
  readonly format: FormatSpec;
  readonly access: AccessSpec;
  readonly governance: GovernanceSpec;

  readonly collections: readonly CollectionSpec[];
  /*
    DEFER(one-013) stage:6 — the same treatment for `emits`, against the declared
    notification registry. Deferred rather than done because notifications are
    not declarable yet; the FAILURE half is the one with a live consequence, and
    it is checked below.
  */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous by nature
  readonly operations: readonly OperationSpec<B, any, any, string>[];
  readonly problems: P;

  readonly sounds?: SoundSpec;
}

/* ------------------------------------------------------------- coverage --- */

/**
 * ⚠️ EVERY SOLD CAPABILITY IS WITHHELD BY SOMETHING, AND THIS IS WHERE IT IS
 * PROVED.
 *
 * Both rails fail the same way and it is the quietest failure in a commercial
 * product: a capability appears on a price list, the interface hides it from
 * whoever did not buy it, and no route withholds anything. Every test passes,
 * because the tests drive the interface. The only signal is that the cheap plan
 * does the expensive thing for anyone who asks for it directly — which is the
 * first thing an API consumer, an assistant, or a curious customer does.
 *
 * Two products shipped that exact shape, and one of them shipped it through a
 * builder that rendered a switch for every declared capability, so adding one
 * was a single line and forgetting to enforce it was invisible.
 *
 * The check is a lookup rather than a search: an enforcement names a mechanism,
 * and the mechanism is an operation field, so composition can ask whether an
 * operation really names it. `{ unenforced }` and `{ derived }` opt out WITH A
 * REASON, which is the only kind of exemption that survives review — a boolean
 * exemption is indistinguishable from an oversight the moment its author leaves.
 */
export interface Uncovered {
  readonly rail: "entitlement" | "customer_flag";
  readonly key: string;
  readonly declared: string;
}

export function coverage(spec: {
  readonly access: AccessSpec;
  /**
   * ⚠️ COLLECTIONS COUNT, and forgetting them would make this check vacuous for
   * exactly the apps it matters most to. An app whose whole surface is derived
   * declares no operations at all — so a coverage check reading `operations`
   * alone would report full coverage over an empty list and pass every app that
   * writes no routing, which is the shape the platform is built to encourage.
   */
  readonly collections: readonly CollectionSpec[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous by nature
  readonly operations: readonly OperationSpec<any, any, any, string>[];
}): readonly Uncovered[] {
  const gated = new Set<string>();
  const quotaed = new Set<string>();
  const flagged = new Set<string>();
  const shaped = new Set<string>();
  for (const c of spec.collections) {
    if (c.entitlement) gated.add(c.entitlement);
    if (c.quota) quotaed.add(c.quota);
  }
  for (const op of spec.operations) {
    if (op.entitlement) gated.add(op.entitlement);
    if (op.quota) quotaed.add(op.quota);
    if (op.customerFlag) flagged.add(op.customerFlag);
    for (const key of Object.values(op.shape ?? {})) shaped.add(key);
  }

  const out: Uncovered[] = [];
  for (const [key, def] of Object.entries(spec.access.entitlements)) {
    if (typeof def.enforcement !== "string") continue;
    const found = def.enforcement === "gate" ? gated.has(key)
      : def.enforcement === "quota" ? quotaed.has(key)
      : shaped.has(key);
    if (!found) out.push({ rail: "entitlement", key, declared: def.enforcement });
  }
  for (const [key, def] of Object.entries(spec.access.customerFlags)) {
    if (typeof def.enforcement !== "string") continue;
    const found = def.enforcement === "gate" ? flagged.has(key) : shaped.has(key);
    if (!found) out.push({ rail: "customer_flag", key, declared: def.enforcement });
  }
  return out;
}

/**
 * Compose an app.
 *
 * ⚠️ IT REFUSES AN OPERATION THAT FAILS WITH A CODE NOBODY DECLARED, and the
 * error names the code. That check can only live here: an operation is written
 * before the catalogue it will be composed with, so its own declaration site
 * cannot see one.
 *
 * It refuses three more things for the same reason — all of them are questions
 * only the whole manifest can answer, and all of them are silent at runtime:
 * a sold capability nothing withholds, a workspace that is better off never
 * paying, and customer capabilities declared by an app with no customer rail to
 * resolve them.
 *
 * ⚠️ IT THROWS RATHER THAN REPORTING. A manifest is evaluated when the worker
 * boots, so a refusal here is a deployment that does not start — which is the
 * correct outcome for a product about to sell something it does not enforce, and
 * it is loud in a way a warning in a log is not.
 */
export function defineApp<
  const B extends BindingSpec,
  const P extends ProblemCatalog,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous by nature
  const O extends readonly OperationSpec<B, any, any, string>[],
>(
  spec: AppSpec<B, P> & { readonly operations: O } & (
    [UndeclaredFailure<O, P>] extends [never] ? unknown
      : { readonly problems: { readonly [K in UndeclaredFailure<O, P>]: ProblemDef } }
  ),
): AppSpec<B, P> {
  assertComposable(spec);
  return spec;
}

/**
 * The three whole-manifest refusals, in one function with two callers.
 *
 * ⚠️ CALLED AGAIN BY THE RUNTIME, deliberately. `defineApp` is where the error
 * is most useful — it names the manifest — but a spec is structurally typed, so
 * an app can assemble one without ever calling it. The runtime is the chokepoint
 * every app genuinely passes through, and a check that can be sidestepped by not
 * using the constructor is a check with an opt-out nobody documented.
 */
export function assertComposable(spec: {
  readonly id: string;
  readonly access: AccessSpec;
  readonly collections: readonly CollectionSpec[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous by nature
  readonly operations: readonly OperationSpec<any, any, any, string>[];
}): void {
  const uncovered = coverage(spec);
  if (uncovered.length) {
    throw new Error(
      `${spec.id}: ${uncovered.length} sold capability(s) that nothing withholds — ` +
        uncovered.map((u) => `${u.key} (declared "${u.declared}" on the ${u.rail} rail)`).join(", ") +
        `. Name it on an operation, or declare it unenforced with a reason.`,
    );
  }

  const generous = parkingAboveFloor(spec.access.entitlements, spec.access.plans);
  if (generous.length) {
    throw new Error(
      `${spec.id}: the parking state is more generous than the cheapest plan for ${generous.join(", ")} — ` +
        `not paying would buy more than paying does.`,
    );
  }

  if (!spec.access.customerRail && Object.keys(spec.access.customerFlags).length) {
    throw new Error(`${spec.id}: declares customer capabilities with customerRail false, so nothing resolves them.`);
  }
}
