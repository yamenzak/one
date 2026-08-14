/**
 * WHO IS IN A WORKSPACE, AND WHAT THAT LETS THEM DO.
 *
 * ⚠️ A MEMBERSHIP LIVES IN THE TENANT'S OWN SHARD, and the directory only
 * INDEXES it. Access resolved from a global table would be one row's corruption
 * away from granting somebody access everywhere; here the worst case is scoped
 * to the workspace the row is in. The index exists so "which workspaces is this
 * person in" is one query rather than a walk over every shard (D5).
 *
 * ⚠️ AN INVITATION IS AN ADDRESS, NEVER AN ACCOUNT ID. An operation taking an
 * account id would let anybody holding one add themselves to a workspace they
 * were never invited to — which is why a collection like this must have no
 * `create` verb, and why the claim happens when somebody signs in as the address
 * that was invited.
 *
 * ⚠️ AND AN INVITATION OCCUPIES A SEAT BEFORE IT IS ANSWERED. Counting only
 * accepted members lets anybody past the ceiling by inviting twenty people and
 * waiting, and the overage arrives days later as a bill rather than as a refusal.
 */

import type { AccountId, Membership, RoleRegistry, TenantId } from "@quad/kernel";
import { canAssign, newId, permissionsFor, registryWith, seatsUsed, wouldStrand } from "@quad/kernel";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

/* ----------------------------------------------------------------- schema --- */

export const MEMBERSHIP_SCHEMA: SchemaModule = {
  id: "membership",
  statements: [
    `CREATE TABLE IF NOT EXISTS membership (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, account_id TEXT, email TEXT NOT NULL, role TEXT NOT NULL, grants_json TEXT, revoked_json TEXT, at TEXT NOT NULL, accepted_at TEXT, removed_at TEXT);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ix_membership_one ON membership (tenant_id, email);`,
    `CREATE INDEX IF NOT EXISTS ix_membership_account ON membership (tenant_id, account_id);`,
    `CREATE TABLE IF NOT EXISTS custom_role (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, permissions_json TEXT NOT NULL, at TEXT NOT NULL);`,
    `CREATE INDEX IF NOT EXISTS ix_custom_role_tenant ON custom_role (tenant_id);`,
  ],
};

/* ------------------------------------------------------------------- rows --- */

export interface MemberRow extends Membership {
  readonly id: string;
  readonly email: string;
  readonly acceptedAt: string | null;
}

const asMember = (r: Record<string, unknown>): MemberRow => ({
  id: r.id as string,
  tenantId: r.tenant_id as TenantId,
  accountId: (r.account_id as AccountId | null) ?? ("" as AccountId),
  email: r.email as string,
  role: r.role as string,
  grants: JSON.parse((r.grants_json as string | null) ?? "[]") as string[],
  revoked: JSON.parse((r.revoked_json as string | null) ?? "[]") as string[],
  acceptedAt: (r.accepted_at as string | null) ?? null,
});

export const membersOf = async (db: Db, tenantId: TenantId): Promise<readonly MemberRow[]> => {
  const rows = await db.prepare(
    `SELECT * FROM membership WHERE tenant_id = ? AND removed_at IS NULL ORDER BY at`)
    .bind(tenantId).all();
  return rows.results.map(asMember);
};

export const memberFor = async (
  db: Db, tenantId: TenantId, accountId: AccountId,
): Promise<MemberRow | null> => {
  const row = await db.prepare(
    `SELECT * FROM membership WHERE tenant_id = ? AND account_id = ? AND removed_at IS NULL`)
    .bind(tenantId, accountId).first();
  return row ? asMember(row) : null;
};

/* ------------------------------------------------------------ custom roles --- */

export async function rolesFor(
  db: Db, tenantId: TenantId, declared: RoleRegistry,
): Promise<RoleRegistry> {
  const rows = await db.prepare(`SELECT id, permissions_json FROM custom_role WHERE tenant_id = ?`)
    .bind(tenantId).all<{ id: string; permissions_json: string }>();
  return registryWith(declared, rows.results.map((r) => ({
    id: r.id, name: r.id, permissions: JSON.parse(r.permissions_json) as string[],
  })));
}

/* ----------------------------------------------------------------- joining --- */

export type InviteRefusal = "already_here" | "beyond_you" | "no_seats" | "no_such_role";

/**
 * Invite an address into a role.
 *
 * ⚠️ NOBODY MAY INVITE SOMEBODY INTO A ROLE THEY COULD NOT GRANT KEY BY KEY.
 * Without that, anybody who can invite escalates in two steps: invite a second
 * address of your own as an owner, then sign in as it. A previous platform
 * carried the function that checks this and called it from nowhere.
 */
export async function invite(
  db: Db,
  tenantId: TenantId,
  input: { readonly email: string; readonly role: string },
  by: { readonly permissions: ReadonlySet<string> },
  roles: RoleRegistry,
  seats: { readonly counts: readonly string[]; readonly allowed: number },
  now = new Date(),
): Promise<MemberRow | InviteRefusal> {
  if (!roles[input.role]) return "no_such_role";
  if (!canAssign(by.permissions, input.role, roles)) return "beyond_you";

  const members = await membersOf(db, tenantId);
  if (members.some((m) => m.email === input.email)) return "already_here";

  /* ⚠️ Counted including the invitations nobody has answered yet. */
  if (seats.allowed >= 0 && seatsUsed(members, seats.counts) >= seats.allowed) return "no_seats";

  const id = newId("mem", now);
  await db.prepare(
    `INSERT INTO membership (id, tenant_id, account_id, email, role, grants_json, revoked_json, at, accepted_at, removed_at)
     VALUES (?, ?, NULL, ?, ?, '[]', '[]', ?, NULL, NULL)`)
    .bind(id, tenantId, input.email, input.role, now.toISOString()).run();

  return {
    id, tenantId, accountId: "" as AccountId, email: input.email, role: input.role,
    grants: [], revoked: [], acceptedAt: null,
  };
}

/**
 * ⚠️ AN INVITATION IS CLAIMED BY SIGNING IN AS THE ADDRESS IT WAS SENT TO, and
 * that is the only way it is ever claimed. The email is the proof; nothing here
 * takes an account id from a caller.
 */
export async function claimInvitations(
  db: Db, accountId: AccountId, email: string, now = new Date(),
): Promise<readonly TenantId[]> {
  const rows = await db.prepare(
    `SELECT tenant_id FROM membership WHERE email = ? AND account_id IS NULL AND removed_at IS NULL`)
    .bind(email).all<{ tenant_id: string }>();
  if (!rows.results.length) return [];
  await db.prepare(
    `UPDATE membership SET account_id = ?, accepted_at = ? WHERE email = ? AND account_id IS NULL`)
    .bind(accountId, now.toISOString(), email).run();
  return rows.results.map((r) => r.tenant_id as TenantId);
}

/**
 * ⚠️ THE FOUNDING MEMBERSHIP IS ACCEPTED THE MOMENT IT IS MADE, because the
 * person creating a workspace is already signed in as themselves. Leaving it
 * pending would produce a workspace whose only member has an invitation waiting
 * at the address they are reading it from.
 */
export async function found(
  db: Db, tenantId: TenantId, accountId: AccountId, email: string, role: string, now = new Date(),
): Promise<MemberRow> {
  const id = newId("mem", now);
  await db.prepare(
    `INSERT INTO membership (id, tenant_id, account_id, email, role, grants_json, revoked_json, at, accepted_at, removed_at)
     VALUES (?, ?, ?, ?, ?, '[]', '[]', ?, ?, NULL)`)
    .bind(id, tenantId, accountId, email, role, now.toISOString(), now.toISOString()).run();
  return { id, tenantId, accountId, email, role, grants: [], revoked: [], acceptedAt: now.toISOString() };
}

/* ----------------------------------------------------------------- leaving --- */

export type RemoveRefusal = "no_such_member" | "would_strand" | "beyond_you";

/**
 * ⚠️ A WORKSPACE WITH NOBODY WHO CAN MANAGE MEMBERS IS NOT CLOSED, IT IS
 * UNREACHABLE. Its records are intact, its bill keeps running, and there is
 * nobody left who can invite anybody back in. Closing is a different action,
 * with a confirmation and an export attached.
 */
export async function remove(
  db: Db, tenantId: TenantId, memberId: string,
  by: { readonly permissions: ReadonlySet<string> }, roles: RoleRegistry, now = new Date(),
): Promise<null | RemoveRefusal> {
  const members = await membersOf(db, tenantId);
  const target = members.find((m) => m.id === memberId);
  if (!target) return "no_such_member";
  if (!canAssign(by.permissions, target.role, roles)) return "beyond_you";
  if (wouldStrand(roles, members, target.accountId)) return "would_strand";

  await db.prepare(`UPDATE membership SET removed_at = ? WHERE id = ?`)
    .bind(now.toISOString(), memberId).run();
  return null;
}

/** ⚠️ Re-roling is bounded by the same rule invitations are: both doors, or the
    bound is a suggestion. */
export async function setRole(
  db: Db, tenantId: TenantId, memberId: string, role: string,
  by: { readonly permissions: ReadonlySet<string> }, roles: RoleRegistry,
): Promise<null | RemoveRefusal | "no_such_role"> {
  if (!roles[role]) return "no_such_role";
  const members = await membersOf(db, tenantId);
  const target = members.find((m) => m.id === memberId);
  if (!target) return "no_such_member";
  if (!canAssign(by.permissions, role, roles)) return "beyond_you";
  if (!canAssign(by.permissions, target.role, roles)) return "beyond_you";
  /* ⚠️ Moving the last administrator into a role that cannot manage members
     strands the workspace exactly as removing them would. */
  if (!roles[role]?.includes("member:manage") && wouldStrand(roles, members, target.accountId)) {
    return "would_strand";
  }
  await db.prepare(`UPDATE membership SET role = ? WHERE id = ?`).bind(role, memberId).run();
  return null;
}

/* ------------------------------------------------------------- resolution --- */

/**
 * ⚠️ WHAT SOMEBODY MAY DO, RESOLVED IN ONE PLACE. Every gate reads this; a
 * second implementation is how a screen comes to offer what a route refuses.
 */
export const permissionsOf = (member: MemberRow | null, roles: RoleRegistry): ReadonlySet<string> =>
  permissionsFor(member, roles);
