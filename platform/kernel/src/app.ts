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
  readonly entitlements: Readonly<Record<string, number | boolean>>;
  /** Whether this app sells to its tenants' own customers. Two flag systems, never merged. */
  readonly customerRail: boolean;
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

/**
 * Compose an app.
 *
 * ⚠️ IT REFUSES AN OPERATION THAT FAILS WITH A CODE NOBODY DECLARED, and the
 * error names the code. That check can only live here: an operation is written
 * before the catalogue it will be composed with, so its own declaration site
 * cannot see one.
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
  return spec;
}
