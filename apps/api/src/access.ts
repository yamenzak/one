/**
 * RBAC access control (SPEC §4) — owner / trainer / assistant / client.
 *
 * Built on Better Auth's access-control primitive layered onto the
 * organization plugin: an **organization is a Mossa tenant**. Action-level
 * gates live here; ROW-LEVEL scoping (trainer → assigned clients only,
 * client → own record only) is enforced by the route layer via
 * requireClientAccess (clients.ts). The grantable catalog + presets mirror
 * @mossa/domain perms.ts — that module is the single source of truth for the
 * permission editor; this file feeds Better Auth's org plugin.
 */
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, ownerAc } from "better-auth/plugins/organization/access";

export const statement = {
  ...defaultStatements, // organization · member · invitation · team · ac
  client: ["create", "read", "update", "archive"],
  plan: ["create", "read", "update", "publish", "delete"],
  library: ["create", "read", "update", "delete"],
  tracking: ["create", "read", "update"],
  goal: ["create", "read", "update"],
  supplement: ["create", "read", "update", "delete"],
  lab: ["create", "read", "update", "delete"],
  content: ["create", "read", "update", "publish", "delete"],
  session: ["create", "read", "update"],
  package: ["create", "read", "update", "delete"],
  report: ["read"],
  billing: ["read", "manage"],
  settings: ["read", "manage"],
  ai: ["use"],
} as const;

export const ac = createAccessControl(statement);

/** Tenant owner: everything, incl. billing + staff + settings. */
export const owner = ac.newRole({
  ...ownerAc.statements,
  client: ["create", "read", "update", "archive"],
  plan: ["create", "read", "update", "publish", "delete"],
  library: ["create", "read", "update", "delete"],
  tracking: ["create", "read", "update"],
  goal: ["create", "read", "update"],
  supplement: ["create", "read", "update", "delete"],
  lab: ["create", "read", "update", "delete"],
  content: ["create", "read", "update", "publish", "delete"],
  session: ["create", "read", "update"],
  package: ["create", "read", "update", "delete"],
  report: ["read"],
  billing: ["read", "manage"],
  settings: ["read", "manage"],
  ai: ["use"],
});

/** Trainer: full coaching surface for ASSIGNED clients (rows gated in routes).
 *  Deliberately NO org-admin statements (no member/invitation management) — the
 *  domain preset (perms.ts) grants a trainer zero staff powers, and spreading
 *  adminAc here would let a trainer hit Better Auth's own /organization/* member
 *  endpoints to remove, re-role, or invite staff. Keep org-admin to owner only. */
export const trainer = ac.newRole({
  client: ["create", "read", "update"],
  plan: ["create", "read", "update", "publish", "delete"],
  library: ["create", "read", "update", "delete"],
  tracking: ["create", "read", "update"],
  goal: ["create", "read", "update"],
  supplement: ["create", "read", "update", "delete"],
  lab: ["create", "read", "update", "delete"],
  content: ["create", "read", "update", "publish", "delete"],
  session: ["create", "read", "update"],
  package: ["read"],
  report: ["read"],
  ai: ["use"],
});

/** Front desk: sessions/booking + roster read. No plan editing. */
export const assistant = ac.newRole({
  client: ["read"],
  session: ["create", "read", "update"],
  package: ["read"],
  content: ["read"],
});

/** Client: the client surfaces only; own-record scope enforced row-level. */
export const client = ac.newRole({
  tracking: ["create", "read", "update"],
  plan: ["read"],
  content: ["read"],
  ai: ["use"],
});

export const roles = { owner, trainer, assistant, client };
export type RoleName = keyof typeof roles;
export const STAFF_ROLES = ["owner", "trainer", "assistant"] as const;
