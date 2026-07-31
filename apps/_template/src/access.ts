/**
 * THIS APP'S RBAC REGISTRY — the roles, and what each may do.
 *
 * `@4dl/auth` owns the ENGINE (the grant algebra, the five-gate route guard,
 * the three seat doors). It cannot own this: "who is an owner" and "what is a
 * customer allowed to touch" are product decisions.
 *
 * Two roles is the honest minimum for a multi-tenant app: someone who runs the
 * tenant, and someone the tenant serves. Add more as the product grows — Kova
 * has four (owner / trainer / assistant / client).
 *
 * ⚠️ `customerRole` (below, and in `auth.ts`) is load-bearing. It is the role
 * that does NOT consume a staff seat, so naming the wrong one either gives away
 * unlimited staff or charges a tenant for every customer it signs up.
 */

import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, ownerAc } from "better-auth/plugins/organization/access";

/** The grantable catalog. Every permission the app can check must appear here —
 *  `@4dl/auth`'s `sanitizeGrant` drops anything that does not. */
export const statement = {
  ...defaultStatements, // organization · member · invitation · team · ac
  record: ["create", "read", "update", "delete"],
  report: ["read"],
  billing: ["read", "manage"],
  settings: ["read", "manage"],
  ai: ["use"],
} as const;

export const ac = createAccessControl(statement);

/** Runs the tenant: everything, including billing, staff and settings. */
export const owner = ac.newRole({
  ...ownerAc.statements,
  record: ["create", "read", "update", "delete"],
  report: ["read"],
  billing: ["read", "manage"],
  settings: ["read", "manage"],
  ai: ["use"],
});

/**
 * The person the tenant serves.
 *
 * Deliberately NO org-admin statements. Spreading `adminAc` here would let a
 * customer reach Better Auth's own `/organization/*` endpoints and remove,
 * re-role or invite staff — a real hole, closed by omission rather than by a
 * check somewhere downstream.
 *
 * Row-level scope is still the route layer's job: this says a customer may read
 * records, not WHICH records. Kova's equivalent invariant is
 * `requireClientAccess`, and every coaching route goes through it.
 */
export const customer = ac.newRole({
  record: ["create", "read", "update"],
  ai: ["use"],
});

export const roles = { owner, customer };
export type RoleName = keyof typeof roles;

/** The role that does not consume a staff seat. See the warning above. */
export const CUSTOMER_ROLE: RoleName = "customer";
export const CREATOR_ROLE: RoleName = "owner";
