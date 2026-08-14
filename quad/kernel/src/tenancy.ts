/**
 * WHO EXISTS, AND WHERE THEIR RECORDS ARE.
 *
 * ⚠️ A TENANT IS PRIMARY AND AN APP IS A CAPABILITY SWITCHED ON FOR IT (D1). The
 * previous platform keyed a workspace by its product, so a business using two of
 * them had two workspaces, two addresses, two rosters and two bills. Here a
 * tenant is a business; `Enablement` is the row that says which products it has.
 *
 * ⚠️ AND ITS RECORDS ARE PLACED RATHER THAN OWNED (D5). A tenant carries a
 * `Placement` — a shard set — instead of a database of its own. That is what
 * lets a product hammering the store and a quiet one share a shard, and what
 * lets a tenant be moved off a hot one without changing anything about it.
 *
 * Layer 2. Imports primitives.
 */

import type { AccountId, AppId, Instant, TenantId } from "./primitives.js";

/* -------------------------------------------------------------- placement --- */

/**
 * WHERE A TENANT'S RECORDS LIVE.
 *
 * ⚠️ IT IS A SHARD SET AND NOT A REGION, and the distinction is the whole point
 * of D5. A region says which continent; a placement says which *database*, so
 * two tenants in the same region can sit on different shards and a full shard
 * can be relieved by moving tenants rather than by growing.
 *
 * ⚠️ THE `where` IS A COMPLIANCE PROMISE, NOT A PERFORMANCE HINT. It comes from
 * the tenant's own declared country (D6) and it is a claim we make to that
 * business about their customers' data. Anything that would take their records
 * out of it — a shard move, an AI provider, a backup — has to honour it or
 * refuse.
 */
export interface Placement {
  /** The shard this tenant's records are on. Opaque; the directory resolves it. */
  readonly shard: string;
  readonly where: Residency;
}

/**
 * ⚠️ A CLOSED SET, DELIBERATELY. Every value here is a promise the deployment
 * has to be able to keep end to end — storage, backups, logs and every
 * sub-processor. Adding one is a commitment to build that chain, which is why it
 * is not a free-form string an app could invent.
 */
export type Residency = "eu" | "global";

/**
 * The EEA, plus the two that behave like it for this purpose.
 *
 * ⚠️ THIS IS A LIST OF COUNTRIES, NOT A LIST OF PEOPLE. See `Tenant.country` —
 * the question is where the business is, which they declare and we can act on,
 * rather than anybody's nationality, which is unverifiable and which asking for
 * would itself be collecting a special category.
 */
export const EEA: readonly string[] = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES",
  "SE", "IS", "LI", "NO", "CH", "GB",
];

/**
 * ⚠️ WHERE A NEW TENANT'S RECORDS SHOULD LIVE, AND `global` IS NOT "ANYWHERE" —
 * it is the deployment's default region, named honestly rather than promised as
 * something narrower. Offering a residency we cannot keep end to end (storage,
 * backups, logs, every sub-processor) is a promise broken by a rebalance nobody
 * connected to it.
 *
 * ⚠️ AND THIS IS A DEFAULT, NOT A CEILING. A business outside the EEA that wants
 * EU residency may have it — the rule below is what happens when nobody chose,
 * and it errs towards the stricter regime because that is the direction whose
 * mistake is recoverable.
 */
export const residencyFor = (country: string): Residency =>
  EEA.includes(country.toUpperCase()) ? "eu" : "global";

/* --------------------------------------------------------------- entities --- */

/** A person. One identity across every product (D1). */
export interface Account {
  readonly id: AccountId;
  readonly email: string;
  readonly name: string | null;
  readonly at: Instant;
}

/**
 * A business. Holds one or more apps.
 *
 * ⚠️ `country` IS A FACT ABOUT THE BUSINESS AND NEVER ABOUT A PERSON (D6). GDPR
 * follows where somebody *is* and whether we offer services into the EU — not
 * anybody's nationality, which is unverifiable and which we therefore never ask.
 * The country is what a placement is derived from, and it is the tenant's to
 * declare because the residency promise is made to the tenant.
 */
export interface Tenant {
  readonly id: TenantId;
  /** A DNS label. It is the address, so it is validated as one. */
  readonly slug: string;
  readonly name: string;
  /** ISO 3166-1 alpha-2, as the business declared it at signup. */
  readonly country: string;
  readonly placement: Placement;
  readonly at: Instant;
}

/**
 * THIS TENANT HAS THIS APP SWITCHED ON.
 *
 * ⚠️ ENABLING A PRODUCT PROVISIONS NOTHING. No worker, no database, no bucket,
 * no domain, no secret — it is this row and the schema that row implies. That is
 * the entire content of "provisioning becomes a feature flag", and it is only
 * true because a tenant is primary (D1) and storage is placed (D5).
 */
export interface Enablement {
  readonly tenantId: TenantId;
  readonly appId: AppId;
  readonly at: Instant;
  /**
   * ⚠️ TURNED OFF IS NOT REMOVED. A business that stops paying for one of our
   * products keeps its records — it has not asked to be forgotten, and erasing
   * on a downgrade is a decision nobody made. What ends is reachability.
   */
  readonly disabledAt: Instant | null;
}

export const enabled = (row: Enablement): boolean => row.disabledAt === null;

/* ------------------------------------------------------- the placement rule --- */

/**
 * WHETHER A TENANT MAY BE PLACED ON A SHARD.
 *
 * ⚠️ A SHARD'S SCHEMA IS THE UNION OF THE SCHEMAS ITS TENANTS' APPS NEED, and
 * that couples placement to migration: a tenant cannot land somewhere its
 * products' tables do not exist. Discovered late this is a class of outage —
 * every request for the moved tenant answering "no such table" — so it is a rule
 * with a name, asked before a move and before an app is enabled.
 */
export type PlacementRefusal = "schema_missing" | "wrong_residency" | "full";

export interface Shard {
  readonly id: string;
  readonly where: Residency;
  /** Which apps' schemas this shard has applied. */
  readonly apps: readonly AppId[];
  readonly tenants: number;
  /** What the operator set as this shard's ceiling. Never a hard limit — see below. */
  readonly ceiling: number;
}

/**
 * ⚠️ THE CEILING REFUSES A NEW ARRIVAL AND NEVER EVICTS ONE. A shard past its
 * ceiling is a shard that stops *accepting* tenants; the ones already on it keep
 * working exactly as before. The other reading — a ceiling that forces a move —
 * turns a capacity setting into an outage trigger, at whatever hour it happens
 * to be crossed.
 */
export function refusePlacement(
  shard: Shard,
  wants: { readonly where: Residency; readonly apps: readonly AppId[] },
): PlacementRefusal | null {
  if (shard.where !== wants.where) return "wrong_residency";
  if (wants.apps.some((app) => !shard.apps.includes(app))) return "schema_missing";
  if (shard.tenants >= shard.ceiling) return "full";
  return null;
}

/**
 * Where a tenant should go, out of what there is.
 *
 * ⚠️ THE EMPTIEST ELIGIBLE SHARD, WHICH IS A CHOICE AND NOT AN OPTIMISATION.
 * Filling one shard before starting the next would keep the number of databases
 * down and put every new tenant — the ones most likely to be evaluating us — on
 * the busiest store we have. Spreading costs a little and means a new customer's
 * first week is on quiet infrastructure.
 */
export function placeOn(
  shards: readonly Shard[],
  wants: { readonly where: Residency; readonly apps: readonly AppId[] },
): Shard | null {
  const able = shards.filter((s) => refusePlacement(s, wants) === null);
  if (able.length === 0) return null;
  return able.reduce((best, s) => (s.tenants < best.tenants ? s : best));
}

/**
 * ⚠️ WHAT A TENANT NEEDS IS THE UNION OF ITS LIVE APPS, and a disabled one still
 * counts. Its records are still there (see `Enablement`), so a move that dropped
 * its schema would strand data nobody deleted — reachable again the moment the
 * product is switched back on, and by then in a database that cannot read it.
 */
export const appsOf = (rows: readonly Enablement[]): readonly AppId[] =>
  [...new Set(rows.map((r) => r.appId))];

/* ------------------------------------------------------------- standing --- */

/**
 * WHERE A TENANT STANDS WITH US.
 *
 * ⚠️ TWO SEPARATE FACTS, AND CONFLATING THEM IS THE BUG. `writable` is the rung
 * a tenant in arrears sits on — they read everything they have and change
 * nothing. `serving` is further down: we have stopped providing the product, so
 * every ceiling clamps to nothing. A single boolean forces one to imply the
 * other, and then the first missed invoice either takes away too little or
 * withholds a business's own records.
 *
 * ⚠️ AND `reason` IS RENDERED, so it is a sentence rather than a code. Somebody
 * meeting this needs to know what to do about it, and "read_only" is not that.
 */
export interface Standing {
  readonly writable: boolean;
  readonly serving: boolean;
  readonly reason: string;
}

/** ⚠️ The ordinary case, named, so nothing has to spell it out to mean "fine". */
export const IN_GOOD_STANDING: Standing = { writable: true, serving: true, reason: "" };
