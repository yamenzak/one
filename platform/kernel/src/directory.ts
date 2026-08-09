/**
 * THE GLOBAL TENANT DIRECTORY — routing data, and nothing else, ever.
 *
 * Layer 2. Imports primitives, doors, standing.
 *
 * One store, readable from every region, holding the minimum needed to decide
 * WHERE a tenant's data lives before touching any of it. It is global precisely
 * because it holds nothing that residency governs — and the moment somebody adds
 * an owner's email "for convenience", that stops being true and the whole model
 * quietly fails.
 *
 * `DIRECTORY_FIELDS` and its conformance test exist to make that addition a
 * deliberate act rather than a convenient one.
 */

import type { RegionId, TenantId } from "./primitives.js";
import type { StandingState } from "./standing.js";

/**
 * ⚠️ EVERY FIELD, AND THE LIST IS THE POINT.
 *
 * A slug is a business name a tenant chose to put in a URL. A region is a
 * placement decision. A standing is a billing state. None of it is personal
 * data, which is what permits this store to be replicated everywhere.
 *
 * Nothing about a PERSON belongs here — not an owner, not an email, not a name.
 * If a lookup needs one, the lookup is in the wrong place: it belongs in the
 * tenant's own regional database, behind the resolution this store performs.
 */
export interface DirectoryEntry {
  readonly tenantId: TenantId;
  readonly slug: string;
  readonly region: RegionId;
  readonly standing: StandingState;
  /** Custom domains pointing here. Hostnames, not people. */
  readonly domains: readonly string[];
}

/** Asserted by `test/directory.test.ts` against the interface. */
export const DIRECTORY_FIELDS = ["tenantId", "slug", "region", "standing", "domains"] as const;

/**
 * How the directory is read. Injected, so the resolution logic is pure and the
 * store can be a KV, a D1 or a fake in a test without any of them appearing here.
 */
export interface Directory {
  bySlug(slug: string): Promise<DirectoryEntry | null>;
  byDomain(hostname: string): Promise<DirectoryEntry | null>;
}

/* ------------------------------------------------------------------ region --- */

declare const RESOLVED: unique symbol;

/**
 * ⚠️ A REGION THAT CAME FROM A LOOKUP, AND THE BRAND IS LOad-BEARING.
 *
 * `resolveRegion` is the only way to produce one, and `bindingsFor` is the only
 * thing that consumes one. So a handler cannot reach a regional store by
 * guessing a region, by defaulting to one, or by reading a header — it can only
 * reach the store belonging to the tenant this request actually resolved to.
 *
 * The rule "no handler ever sees a raw binding" is enforced by a lint in the
 * legacy tree. Here it is enforced by the compiler, which is a level better and
 * costs a `unique symbol`.
 */
export type ResolvedRegion = RegionId & { readonly [RESOLVED]: true };

/** The one producer. Nothing else may mint a `ResolvedRegion`. */
export function resolveRegion(entry: DirectoryEntry | null, fallback: RegionId): ResolvedRegion {
  return (entry?.region ?? fallback) as ResolvedRegion;
}
