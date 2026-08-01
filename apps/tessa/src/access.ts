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
  /** The TYPE of a thing. Owning the catalog is a management act. */
  catalog: ["create", "read", "update", "delete"],
  /** Lots: quantity-bearing stock. */
  stock: ["read", "receive", "move", "consume", "quarantine"],
  /** Units: instruments tracked for life. */
  instrument: ["read", "manage", "retire"],
  /** Packs: composed, sterilisable sets. */
  pack: ["read", "build", "open"],
  /**
   * `run` and `release` are SEPARATE, and that separation is the point.
   *
   * Loading an autoclave and pressing start is an operational act. **Freigabe** —
   * release after reprocessing — is a qualified one: German practice expects a
   * named, competent person to release a load against its indicator evidence,
   * and that is frequently NOT the person who ran the machine. Collapsing them
   * into one permission would make every autoclave operator a releaser by
   * default, which is exactly the control the regulation exists to impose.
   */
  sterilisation: ["read", "run", "release"],
  /** A case is opened, scanned into, and closed. */
  case: ["read", "create", "close"],
  /** The recall and history queries. Read-only by nature — there is nothing to
   *  write, and an auditor should be able to hold this and nothing else. */
  trace: ["read"],
  report: ["read"],
  billing: ["read", "manage"],
  settings: ["read", "manage"],
  ai: ["use"],
} as const;

export const ac = createAccessControl(statement);

/** Runs the centre: everything, including billing, staff and settings. */
export const owner = ac.newRole({
  ...ownerAc.statements,
  catalog: ["create", "read", "update", "delete"],
  stock: ["read", "receive", "move", "consume", "quarantine"],
  instrument: ["read", "manage", "retire"],
  pack: ["read", "build", "open"],
  sterilisation: ["read", "run", "release"],
  case: ["read", "create", "close"],
  trace: ["read"],
  report: ["read"],
  billing: ["read", "manage"],
  settings: ["read", "manage"],
  ai: ["use"],
});

/** The stock room: receives, moves, counts. Never releases a sterile load. */
export const stockKeeper = ac.newRole({
  catalog: ["create", "read", "update"],
  stock: ["read", "receive", "move", "consume", "quarantine"],
  instrument: ["read"],
  pack: ["read"],
  trace: ["read"],
  ai: ["use"],
});

/** CSSD: builds packs, runs the autoclave, and RELEASES. */
export const cssd = ac.newRole({
  catalog: ["read"],
  stock: ["read"],
  instrument: ["read", "manage", "retire"],
  pack: ["read", "build", "open"],
  sterilisation: ["read", "run", "release"],
  trace: ["read"],
  ai: ["use"],
});

/** Treatment rooms: opens packs, consumes stock, logs a case. */
export const clinical = ac.newRole({
  catalog: ["read"],
  stock: ["read", "consume"],
  instrument: ["read"],
  pack: ["read", "open"],
  case: ["read", "create", "close"],
  trace: ["read"],
  ai: ["use"],
});

/**
 * Reads everything, writes nothing.
 *
 * Exists because an inspection is a real event in this market and handing an
 * auditor an account that can also change stock is a bad trade. Note it carries
 * no `ai` — an auditor spending the centre's credits would be a surprise on the
 * invoice.
 */
export const auditor = ac.newRole({
  catalog: ["read"],
  stock: ["read"],
  instrument: ["read"],
  pack: ["read"],
  sterilisation: ["read"],
  case: ["read"],
  trace: ["read"],
  report: ["read"],
});

export const roles = { owner, stockKeeper, cssd, clinical, auditor };
export type RoleName = keyof typeof roles;

/**
 * ⚠️ TESSA HAS NO CUSTOMER ROLE, and that is a real difference from the template.
 *
 * Kova has clients who sign in; a clinic's patients do not. Everyone who touches
 * Tessa works at the centre, so **every member consumes a staff seat** and there
 * is no seat-free lane to grant by accident.
 *
 * `@4dl/auth` still wants a fallback role for a member whose grant cannot be
 * resolved, and it must be the LEAST privileged one — an unresolvable grant
 * failing open to `clinical` would let an unknown member consume stock. `auditor`
 * reads and writes nothing, which is the correct shape for "we are not sure who
 * this is".
 *
 * Deliberately NO org-admin statements on any role but owner. Spreading `adminAc`
 * wider would let a member reach Better Auth's own `/organization/*` endpoints
 * and remove, re-role or invite staff — a real hole, closed by omission rather
 * than by a check somewhere downstream.
 */
export const CUSTOMER_ROLE: RoleName = "auditor";
export const CREATOR_ROLE: RoleName = "owner";
