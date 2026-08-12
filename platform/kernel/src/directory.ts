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
  /**
   * ⚠️ WHICH PRODUCT SERVES IT — routing, like everything else in this store: the
   * name of a bundle rather than a fact about anybody. The account centre answers
   * for every product a person belongs to, and without this a workspace cannot be
   * matched to the declaration of what that product wants to know.
   */
  readonly appId: string;
  readonly standing: StandingState;
  /** Custom domains pointing here. Hostnames, not people. */
  readonly domains: readonly string[];
  /**
   * ⚠️ THE THREE BRANDING SETTINGS, COPIED, so the sign-in screen can wear them.
   * That screen renders before there is a session, and therefore before there is
   * a tenancy whose own database could be read — so without this a cold sign-in
   * shows the product's name and then corrects itself.
   */
  readonly branding: Readonly<Record<string, string>>;
}

/** Asserted by `test/directory.test.ts` against the interface. */
/*
  ⚠️ `branding` IS HERE DELIBERATELY, AND THE CONFORMANCE TEST IS WHAT MADE IT
  deliberate. It is a workspace's public face — the name, mark and colour its own
  sign-in screen wears — which is the same class of thing as its slug and no more
  personal than the address people type to reach it.

  The alternative was worse in the way that matters: the sign-in screen renders
  before there is a session, therefore before there is a tenancy whose regional
  store could be read, so without this a workspace's own customers arrive at a
  page wearing the product's name and watch it change. And it stays a COPY — the
  regional row is authoritative and this is refreshed from it on write, so there
  is no second answer to migrate.
*/
/*
  ⚠️ `appId` EARNED ITS PLACE AND THE ARGUMENT IS THE POINT OF THIS LIST. It is the
  name of a bundle, not a fact about anybody — routing, like the region beside it —
  and without it the account centre cannot match a workspace to the declaration of
  what its product wants to know, so the vault could group by nothing. Every future
  addition has to make an argument of that shape, in a diff, which is exactly what
  this list exists to force.
*/
export const DIRECTORY_FIELDS = ["tenantId", "slug", "region", "appId", "standing", "domains", "branding"] as const;

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
