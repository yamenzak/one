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
import type { ProblemCatalog } from "./problem.js";
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
  readonly seats?: { readonly counts: readonly string[] };
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

export interface AppSpec<B extends BindingSpec> {
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
    DEFER(one-001) stage:1 — a builder that accumulates the operation union, so
    `fails` can be checked against declared problems and `emits` against declared
    notifications. See test/FINDINGS.md §4.
  */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous by nature
  readonly operations: readonly OperationSpec<B, any, any>[];
  readonly problems: ProblemCatalog;

  readonly sounds?: SoundSpec;
}

export function defineApp<const B extends BindingSpec>(spec: AppSpec<B>): AppSpec<B> {
  return spec;
}
