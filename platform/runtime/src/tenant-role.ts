/**
 * ROLES A WORKSPACE MAKES FOR ITSELF.
 *
 * ⚠️ A ROLE REGISTRY IS ALREADY A `Record<string, string[]>`, which is the whole
 * reason this is small. `permissionsFor` resolves a member against one; a custom
 * role is another entry in it. Nothing downstream changes — `canGrant`,
 * `canAssignRole` and the per-member grants all keep working, because they were
 * never about where a role came from.
 *
 * ⚠️ REGIONAL, because it is a workspace's own records. Roles are read on every
 * request that resolves a caller, they name nobody outside the workspace, and
 * they are erased with it — which is the same argument settings get, and it is
 * the rule PLAN.md §7.6 states: does the APP need it to serve a request, or does
 * a PERSON need it to understand their account.
 *
 * ⚠️ A CUSTOM ROLE MAY NOT TAKE A DECLARED ROLE'S NAME. Redefining `owner` is not
 * a customisation, it is a workspace rewriting what the product means by owner —
 * and the shadowing would be invisible, because the merged registry has one key.
 *
 * ⚠️ NOR MAY IT CARRY A PERMISSION ITS AUTHOR DOES NOT HOLD. Without that, "make
 * a role" is the two-step escalation `canGrant` exists to close, with a longer
 * first step.
 */

import type { Instant, RoleRegistry, SchemaModule, SqlHandle } from "@one/kernel";

export const TENANT_ROLE_SCHEMA: SchemaModule = {
  id: "tenant_role",
  ddl: [
    `CREATE TABLE IF NOT EXISTS tenant_role (tenant_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, permissions TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (tenant_id, id));`,
  ],
  scoped: { tenantColumn: "tenant_id", tenantTables: ["tenant_role"] },
};

export interface TenantRole {
  readonly id: string;
  readonly name: string;
  readonly permissions: readonly string[];
}

/**
 * ⚠️ A ROLE ID IS A SLUG AND IS CHECKED AS ONE. It is a key in a merged
 * registry, so a name with a space or a dot in it is a key nobody can type into
 * a `roles: ["…"]` and a row that resolves to nothing — a role somebody made,
 * assigned, and that grants nothing at all.
 */
export const roleIdOk = (id: string): boolean => /^[a-z][a-z0-9-]{1,38}$/.test(id);

export async function rolesOf(db: SqlHandle, tenantId: string): Promise<readonly TenantRole[]> {
  const rows = await db.all<{ id: string; name: string; permissions: string }>(
    /* unbounded-read: one workspace's own roles, made by hand, a handful at most. */
    `SELECT id, name, permissions FROM tenant_role WHERE tenant_id = ? ORDER BY name`,
    tenantId,
  ).catch(() => []);
  return rows.map((r) => ({
    id: r.id, name: r.name,
    permissions: JSON.parse(r.permissions || "[]") as string[],
  }));
}

/**
 * The registry a caller is resolved against.
 *
 * ⚠️ THE APP'S OWN ROLES WIN, and the order is the security property rather than
 * a preference. Spread the other way, a workspace could define `owner` and every
 * owner in it would hold whatever that workspace said — which is the takeover
 * the id check refuses at the door, and this is the second lock on the same
 * door, in the one place a mistake would actually be exploited.
 */
export const registryWith = (declared: RoleRegistry, custom: readonly TenantRole[]): RoleRegistry => ({
  ...Object.fromEntries(custom.map((r) => [r.id, r.permissions])),
  ...declared,
});

export type RoleRefusal = "id" | "declared" | "undeclared_permission" | "beyond_you" | "in_use";

/**
 * Everything a saved role can get wrong, before it is saved.
 *
 * ⚠️ EACH IS A DIFFERENT THING TO DO NEXT, which is why they are not one code. A
 * bad id is a typo; a declared name is a role that already exists; a permission
 * nobody declared is a key that would grant nothing; and one beyond the author
 * is the escalation. Told apart, each is a sentence somebody can act on.
 */
export function refuseRole(
  role: TenantRole,
  declared: RoleRegistry,
  known: ReadonlySet<string>,
  author: ReadonlySet<string>,
): RoleRefusal | null {
  if (!roleIdOk(role.id)) return "id";
  if (declared[role.id]) return "declared";
  if (role.permissions.some((p) => !known.has(p))) return "undeclared_permission";
  /*
    ⚠️ NOBODY MAY BUILD A ROLE THEY COULD NOT GRANT. `canGrant` closes the
    two-step escalation on a per-member grant; without the same check here,
    "make a role carrying owner:everything, then assign it to yourself" is the
    same escalation with a longer first step.
  */
  if (role.permissions.some((p) => !author.has(p))) return "beyond_you";
  return null;
}

export async function saveRole(db: SqlHandle, tenantId: string, role: TenantRole, at: Instant): Promise<void> {
  await db.run(
    `INSERT INTO tenant_role (tenant_id, id, name, permissions, at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, id) DO UPDATE SET name = excluded.name, permissions = excluded.permissions, at = excluded.at`,
    tenantId, role.id, role.name, JSON.stringify(role.permissions), at,
  );
}

/**
 * ⚠️ A ROLE SOMEBODY HOLDS IS NOT REMOVED, IT IS REFUSED. Deleting it leaves
 * every member on it resolving to no permissions at all — signed in, in the
 * workspace, and unable to do anything, with nothing on any screen saying why.
 * Moving them somewhere automatically is worse: it is a permission change
 * nobody asked for, applied to people who are not in the room.
 */
export async function roleInUse(db: SqlHandle, tenantId: string, id: string): Promise<number> {
  const row = await db.first<{ n: number }>(
    `SELECT COUNT(*) AS n FROM membership WHERE tenant_id = ? AND role = ? AND revoked_at IS NULL`,
    tenantId, id,
  ).catch(() => null);
  return row?.n ?? 0;
}

export async function removeRole(db: SqlHandle, tenantId: string, id: string): Promise<void> {
  await db.run(`DELETE FROM tenant_role WHERE tenant_id = ? AND id = ?`, tenantId, id);
}
