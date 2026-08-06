/**
 * Per-member permissions — Scena's registry bound to `@4dl/auth`'s grant algebra.
 *
 * A member's authorization is a `{ resource: action[] }` map. Roles are PRESETS
 * that fill it, and an admin may attach a custom per-member grant stored as
 * `member.permissions_json`.
 *
 * ── The presets are DERIVED from `access.ts`, never restated ────────────────
 *
 * This file used to carry a second copy of every role, hand-written to mirror
 * `access.ts`. Two registries that must agree with nothing checking that they
 * do; Tessa had the same shape and three of its roles had silently degraded to
 * read-only. Scena's copy had not drifted on the four staff roles — but it
 * omitted the two BOARD roles entirely, so every station account fell through to
 * the `viewer` preset and a counter device at a reception desk resolved a grant
 * containing `billing: ["read"]`, `analytics: ["read"]` and read access to the
 * whole fleet. It could not reach much of that through the route guard, which is
 * luck rather than design.
 *
 * Deriving removes the second registry: a role added to `access.ts` arrives here
 * with the grant it was written with, and `roles.test.ts` asserts every role
 * still resolves to its own.
 *
 * ── And the custom grant is now BOUNDED ────────────────────────────────────
 *
 * The old `resolvePermissions` returned a stored custom grant as-is whenever it
 * sanitized to something non-empty. A `permissions_json` blob written to a
 * receptionist could therefore hand them `billing: ["manage"]` and
 * `settings: ["manage"]` — the role preset was never consulted once a blob
 * existed. `bindGrants` INTERSECTS the two, so a custom grant may narrow a role
 * and can never widen it.
 */

import { bindGrants, grantSatisfies as sharedGrantSatisfies, type Grant } from "@4dl/auth/model";
import { statement, roles, FALLBACK_ROLE, GRANTABLE_RESOURCES } from "./access.js";

export type { Grant };

/**
 * Resource → the actions that exist on it, as the permission editor should show
 * it: this app's own resources, without Better Auth's org-management statements.
 *
 * `statement` is the authority for what an action IS; this is a projection of it
 * for a checklist, so a resource cannot appear here that the access control does
 * not define.
 */
export const PERMISSION_CATALOG: Record<string, string[]> = Object.fromEntries(
  GRANTABLE_RESOURCES.map((r) => [r, [...((statement as Record<string, readonly string[]>)[r] ?? [])]]),
);

/**
 * Role → its default grant, read off the access-control instance.
 *
 * Better Auth's `newRole` keeps the grant on `.statements` — the same object
 * literal `access.ts` passed in. Filtered to this app's own resources for the
 * same reason the catalog is: `organization`/`invitation`/`team`/`ac` ride along
 * on the owner role, are never asked for by the route guard, and only make a
 * resolved grant harder to read in a debugger.
 */
export const ROLE_PRESETS: Record<string, Grant> = Object.fromEntries(
  Object.entries(roles).map(([name, role]) => [
    name,
    Object.fromEntries(
      Object.entries((role as { statements: Record<string, readonly string[]> }).statements)
        .filter(([resource]) => resource in PERMISSION_CATALOG)
        .map(([resource, actions]) => [resource, [...actions]]),
    ),
  ]),
);

const grants = bindGrants({
  catalog: PERMISSION_CATALOG,
  presets: ROLE_PRESETS,
  fallbackRole: FALLBACK_ROLE,
  // An owner always holds the full preset: there is nothing above them to narrow
  // toward, and letting a stored blob clip an owner is how a tenant locks itself
  // out of its own billing.
  unboundedRoles: ["owner"],
});

/** Keep only catalogue-valid resource/action pairs (drops anything unknown). */
export const sanitizePermissions = (input: unknown): Grant => grants.sanitize(input);

/** The effective grant for a member: their stored custom grant INTERSECTED with
 *  the role preset, else the preset alone. */
export const resolvePermissions = (role: string | null, permsJson: string | null | undefined): Grant =>
  grants.resolve(role, permsJson ?? null);

/** Does a grant satisfy a required `{ resource: action[] }` permission set? */
export const grantSatisfies = sharedGrantSatisfies;
