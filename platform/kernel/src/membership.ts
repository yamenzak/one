/**
 * MEMBERSHIP — what a person may do, inside one tenant, in one product.
 *
 * Layer 2. Imports primitives only.
 *
 * ⚠️ DELIBERATELY NOT IN `identity.ts`. An account is global and answers "who is
 * this"; a membership is per-app, per-tenant, per-region, and answers "what may
 * they do here". Putting a role on the account would mean a global store
 * deciding a regional question, one product's authorization visible to another,
 * and a permission change becoming a cross-region write on a hot path.
 */

import type { TenantId, UserId } from "./primitives.js";

export interface Membership {
  readonly accountId: UserId;
  readonly tenantId: TenantId;
  readonly roles: readonly string[];
  /** Extra permissions beyond the roles. Bounded — see `canGrant`. */
  readonly grants?: readonly string[];
  /** Withheld from the roles. Applied last, so it always wins. */
  readonly revoked?: readonly string[];
}

export type RoleRegistry = Readonly<Record<string, readonly string[]>>;

/**
 * Resolve a membership to a permission set.
 *
 * Roles union, then grants add, then revocations subtract.
 *
 * ⚠️ REVOCATION IS LAST, and the order is the point: a revocation exists to take
 * something away from somebody who would otherwise have it, so anything applied
 * after it could hand it back. "Everything the role gives except this one thing"
 * has to be expressible, and it is only expressible if nothing follows it.
 */
export function permissionsFor(m: Membership, roles: RoleRegistry): ReadonlySet<string> {
  const out = new Set<string>();
  for (const role of m.roles) for (const p of roles[role] ?? []) out.add(p);
  for (const p of m.grants ?? []) out.add(p);
  for (const p of m.revoked ?? []) out.delete(p);
  return out;
}

/**
 * ⚠️ NOBODY MAY GRANT WHAT THEY DO NOT HOLD.
 *
 * Without this, any member who can edit roles can escalate to owner in two
 * steps: grant themselves a permission they lack, then use it. The check is
 * cheap, it belongs beside the resolution rather than in each admin screen, and
 * its absence is invisible until somebody notices they have been an owner for a
 * month.
 *
 * A role is grantable only when the granter holds every permission it carries —
 * so "assign a role" cannot be a back door around "grant a permission".
 */
export function canGrant(granter: ReadonlySet<string>, permissions: readonly string[]): boolean {
  return permissions.every((p) => granter.has(p));
}

export function canAssignRole(granter: ReadonlySet<string>, role: string, roles: RoleRegistry): boolean {
  return canGrant(granter, roles[role] ?? []);
}

/**
 * Whether a permission is held.
 *
 * ⚠️ THE ONLY QUESTION AN OPERATION ASKS, and it takes the resolved set rather
 * than the membership. Resolution happens once per request; a helper that
 * resolved on every check would make the cost of asking scale with the number of
 * gates, which is precisely backwards — the gates are the cheap part.
 */
export const holds = (permissions: ReadonlySet<string>, permission: string): boolean => permissions.has(permission);
