/**
 * WHAT SOMEBODY MAY DO, AND WHO MAY GIVE IT TO THEM.
 *
 * ⚠️ NOBODY MAY GRANT WHAT THEY DO NOT HOLD. Without that one rule, anybody who
 * can edit access escalates in two steps: give yourself the key you lack, then
 * use it. It is cheap to check, it belongs beside the resolution rather than in
 * whichever screen happens to call it, and its absence is invisible until
 * somebody notices they have been an owner for a month.
 *
 * ⚠️ AND A ROLE IS A NAME FOR A BUNDLE, NEVER A COPY OF ONE. Storing the
 * permission SET on a membership row is the shape that rots: a key added to a
 * role reaches nobody who joined before it, and one removed keeps working for
 * everybody who did. Neither failure is visible from the role name, which is the
 * only thing anybody ever looks at.
 *
 * Layer 2. Imports primitives.
 */

import type { AccountId, TenantId } from "./primitives.js";

export type RoleRegistry = Readonly<Record<string, readonly string[]>>;

export interface Membership {
  readonly accountId: AccountId;
  readonly tenantId: TenantId;
  readonly role: string;
  /** Extra keys beyond the role. Bounded — see `canGrant`. */
  readonly grants?: readonly string[];
  /** Withheld from the role. Applied last, so it always wins. */
  readonly revoked?: readonly string[];
}

/**
 * A membership resolved to what it can do.
 *
 * ⚠️ REVOCATION IS LAST, AND THE ORDER IS THE POINT. A revocation exists to take
 * something away from somebody who would otherwise have it, so anything applied
 * after it could hand it back. "Their role, except this one thing" has to be
 * expressible, and it is only expressible if nothing follows it.
 */
export function permissionsFor(m: Membership | null, roles: RoleRegistry): ReadonlySet<string> {
  if (!m) return new Set();
  const out = new Set<string>(roles[m.role] ?? []);
  for (const p of m.grants ?? []) out.add(p);
  for (const p of m.revoked ?? []) out.delete(p);
  return out;
}

/**
 * ⚠️ A ROLE IS GRANTABLE ONLY WHEN THE GRANTER HOLDS EVERY KEY IT CARRIES, so
 * "assign a role" cannot be a back door around "grant a permission". Both doors
 * ask this — the invitation and the re-role — because bounding one and not the
 * other is the same escalation with a shorter first step.
 */
export const canGrant = (granter: ReadonlySet<string>, keys: readonly string[]): boolean =>
  keys.every((k) => granter.has(k));

export const canAssign = (granter: ReadonlySet<string>, role: string, roles: RoleRegistry): boolean =>
  canGrant(granter, roles[role] ?? []);

/* ------------------------------------------------------------ custom roles --- */

export interface CustomRole {
  readonly id: string;
  readonly name: string;
  readonly permissions: readonly string[];
}

/**
 * ⚠️ A ROLE ID IS A SLUG BECAUSE IT IS A KEY IN A MERGED REGISTRY. One with a
 * space or a dot in it is a key nobody can type into a `roles: [...]` and a row
 * that resolves to nothing — a role somebody made, assigned, and that grants
 * nothing at all.
 */
export const roleIdOk = (id: string): boolean => /^[a-z][a-z0-9-]{1,38}$/.test(id);

/**
 * The registry a caller is resolved against.
 *
 * ⚠️ THE APP'S OWN ROLES WIN, AND THE ORDER IS THE SECURITY PROPERTY. Spread the
 * other way a workspace could define `owner`, and every owner in it would hold
 * whatever that workspace said — the takeover the id check refuses at the door,
 * and this is the second lock on it, in the one place a mistake is exploited.
 */
export const registryWith = (declared: RoleRegistry, custom: readonly CustomRole[]): RoleRegistry => ({
  ...Object.fromEntries(custom.map((r) => [r.id, r.permissions])),
  ...declared,
});

export type RoleRefusal = "id" | "declared" | "undeclared_permission" | "beyond_you";

/**
 * ⚠️ EACH REFUSAL IS A DIFFERENT THING TO DO NEXT, which is why they are not one
 * code. A bad id is a typo; a declared name is a role that already exists; an
 * undeclared key is one that would grant nothing; and `beyond_you` is the
 * escalation. Collapsed into "invalid", the last one reads as a bug in the form.
 */
export function refuseRole(
  role: CustomRole, declared: RoleRegistry, known: ReadonlySet<string>, author: ReadonlySet<string>,
): RoleRefusal | null {
  if (!roleIdOk(role.id)) return "id";
  if (declared[role.id]) return "declared";
  if (role.permissions.some((p) => !known.has(p))) return "undeclared_permission";
  if (role.permissions.some((p) => !author.has(p))) return "beyond_you";
  return null;
}

/* ------------------------------------------------------------- stranding --- */

/**
 * WHETHER REMOVING SOMEBODY WOULD LEAVE NOBODY IN CHARGE.
 *
 * ⚠️ A WORKSPACE WITH NOBODY WHO CAN MANAGE MEMBERS IS NOT CLOSED, IT IS
 * UNREACHABLE. Its records are intact, its bill keeps running, and there is
 * nobody left who can invite anybody back in. Closing is a different action with
 * a confirmation and an export attached; this is the accident that looks like it
 * and cannot be undone from inside.
 *
 * ⚠️ AND IT ASKS THE MERGED REGISTRY WHICH ROLES COUNT rather than naming an
 * owner. A workspace whose administrators sit in a role it composed itself is
 * the ordinary case, and a hardcoded name fails open — every removal allowed.
 */
export function wouldStrand(
  roles: RoleRegistry, members: readonly Membership[], accountId: AccountId, key = "member:manage",
): boolean {
  const manages = (m: Membership) => permissionsFor(m, roles).has(key);
  const target = members.find((m) => m.accountId === accountId);
  if (!target || !manages(target)) return false;
  return members.filter(manages).length === 1;
}

/* -------------------------------------------------------------- the seats --- */

export interface SeatSpec {
  /** Which roles cost a seat. A role outside this list is free. */
  readonly counts: readonly string[];
  /** The entitlement key the count is checked against. */
  readonly entitlement: string;
}

/**
 * ⚠️ AN INVITATION OCCUPIES A SEAT BEFORE IT IS ANSWERED. Counting only accepted
 * members lets anybody past the ceiling by inviting twenty people and waiting —
 * and the overage then arrives days later, all at once, as a bill rather than as
 * a refusal, which is the wrong end of the product to discover a limit from.
 */
export const seatsUsed = (members: readonly Membership[], counts: readonly string[]): number =>
  members.filter((m) => counts.includes(m.role)).length;

export interface AccessSpec {
  readonly permissions: readonly string[];
  readonly roles: RoleRegistry;
  /**
   * ⚠️ WHAT SOMEBODY HOLDS BEFORE THEY BELONG TO ANYTHING. Required, and usually
   * one key: somebody has to be able to make their first tenant while outside
   * every tenant, and a role cannot express that because a role is held inside
   * one. Leaving it to a resolver is what produces "give a signed-in person the
   * owner role", which is an authorization bypass on every other door.
   */
  readonly personal: readonly string[];
  readonly seats: SeatSpec;
}

/**
 * ⚠️ A PERMISSION NO ROLE AND NO PERSONAL SET HOLDS IS DECLARED AND UNHOLDABLE.
 * Every operation naming it refuses every caller, for ever, and the 403 is
 * indistinguishable from one somebody forgot to grant.
 */
export const unholdable = (access: AccessSpec): readonly string[] => {
  const held = new Set([...Object.values(access.roles).flat(), ...access.personal]);
  return access.permissions.filter((p) => !held.has(p));
};

/**
 * ⚠️ AND A ROLE OR PERSONAL SET NAMING AN UNDECLARED KEY GRANTS NOTHING. It
 * looks like access somebody has and behaves like access they do not, which is
 * the hardest kind of permission bug to see from either side.
 */
export const undeclared = (access: AccessSpec): readonly string[] => {
  const known = new Set(access.permissions);
  return [...new Set([...Object.values(access.roles).flat(), ...access.personal])]
    .filter((p) => !known.has(p));
};

/**
 * ⚠️ SOMEBODY MUST BE ABLE TO ADMINISTER A NEW TENANT. The platform makes the
 * creator a member in whichever role can manage members — chosen by capability
 * rather than by name, so an app whose administrators are called something else
 * still works. With no such role there is no founding membership: every request
 * answers 403, and the tenant row, the tables and the session are all perfectly
 * correct.
 */
export const foundingRole = (roles: RoleRegistry, key = "member:manage"): string | null =>
  Object.entries(roles).find(([, keys]) => keys.includes(key))?.[0] ?? null;
