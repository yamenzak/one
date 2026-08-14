/**
 * WHO IS IN A WORKSPACE, AND WHAT THAT LETS THEM DO.
 *
 * ⚠️ ONE MEMBERSHIP, TWO AUTHORITIES (D15). A row carries a PLATFORM role (what
 * somebody may do to the workspace — identical keys in every product) and a
 * role PER ENABLED APP (what they may do inside each product, in its own
 * vocabulary). One person, one row, one invitation — the per-app roster is the
 * previous platform's disease, and the flat single role is the bug where
 * "trainer" means something in one app and silent 403s in the next.
 *
 * ⚠️ A MEMBERSHIP LIVES IN THE TENANT'S OWN SHARD, and the directory only
 * INDEXES it. Access resolved from a global table would be one row's corruption
 * away from granting somebody access everywhere; here the worst case is scoped
 * to the workspace the row is in.
 *
 * ⚠️ AN INVITATION IS AN ADDRESS, NEVER AN ACCOUNT ID. An operation taking an
 * account id would let anybody holding one add themselves to a workspace they
 * were never invited to. The claim happens when somebody signs in as the
 * address that was invited.
 *
 * ⚠️ AND EVERY ASSIGNMENT IS BOUNDED PER AUTHORITY. The inviter's PLATFORM keys
 * bound the platform role; their keys IN EACH APP bound that app's role.
 * Bounding one and not the other is the same two-step escalation with a
 * shorter first step.
 */

import type { AccountId, Grant, Membership, RoleRegistry, TenantId } from "@quad/kernel";
import {
  PLATFORM_ROLES, canAssign, newId, permissionsFor, registryWith, seatsUsed, wouldStrand,
} from "@quad/kernel";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

/* ----------------------------------------------------------------- schema --- */

export const MEMBERSHIP_SCHEMA: SchemaModule = {
  id: "membership",
  statements: [
    `CREATE TABLE IF NOT EXISTS membership (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, account_id TEXT, email TEXT NOT NULL, platform_role TEXT NOT NULL, app_roles_json TEXT, grants_json TEXT, revoked_json TEXT, at TEXT NOT NULL, accepted_at TEXT, removed_at TEXT);`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ix_membership_one ON membership (tenant_id, email);`,
    `CREATE INDEX IF NOT EXISTS ix_membership_account ON membership (tenant_id, account_id);`,
    /* ⚠️ A custom role composes ONE app's keys — see `CustomRole`. */
    `CREATE TABLE IF NOT EXISTS custom_role (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, app TEXT NOT NULL, name TEXT NOT NULL, permissions_json TEXT NOT NULL, at TEXT NOT NULL);`,
    `CREATE INDEX IF NOT EXISTS ix_custom_role_tenant ON custom_role (tenant_id, app);`,
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
  platformRole: r.platform_role as string,
  appRoles: JSON.parse((r.app_roles_json as string | null) ?? "{}") as Record<string, string>,
  grants: JSON.parse((r.grants_json as string | null) ?? "[]") as Grant[],
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

/** The registry one app's roles resolve against: declared ∪ this tenant's own. */
export async function rolesFor(
  db: Db, tenantId: TenantId, appId: string, declared: RoleRegistry,
): Promise<RoleRegistry> {
  const rows = await db.prepare(
    `SELECT id, permissions_json FROM custom_role WHERE tenant_id = ? AND app = ?`)
    .bind(tenantId, appId).all<{ id: string; permissions_json: string }>();
  return registryWith(declared, rows.results.map((r) => ({
    id: r.id, app: appId, name: r.id, permissions: JSON.parse(r.permissions_json) as string[],
  })));
}

/* ----------------------------------------------------------------- joining --- */

/** Who is doing the assigning, resolved per authority. */
export interface Granter {
  readonly platform: ReadonlySet<string>;
  readonly inApp: (appId: string) => Promise<ReadonlySet<string>>;
}

export interface Assignment {
  readonly platformRole: string;
  readonly appRoles: Readonly<Record<string, string>>;
}

export type InviteRefusal = "already_here" | "beyond_you" | "no_seats" | "no_such_role";

/**
 * ⚠️ EVERY ROLE IN THE ASSIGNMENT IS BOUNDED — see the header. A previous
 * platform carried the function that checks this and called it from nowhere.
 */
async function beyondGranter(
  by: Granter, wants: Assignment, registryFor: (appId: string) => Promise<RoleRegistry>,
): Promise<"no_such_role" | "beyond_you" | null> {
  if (!PLATFORM_ROLES[wants.platformRole]) return "no_such_role";
  if (!canAssign(by.platform, wants.platformRole, PLATFORM_ROLES)) return "beyond_you";
  for (const [appId, role] of Object.entries(wants.appRoles)) {
    const registry = await registryFor(appId);
    if (!registry[role]) return "no_such_role";
    if (!canAssign(await by.inApp(appId), role, registry)) return "beyond_you";
  }
  return null;
}

export async function invite(
  db: Db,
  tenantId: TenantId,
  input: { readonly email: string } & Assignment,
  by: Granter,
  registryFor: (appId: string) => Promise<RoleRegistry>,
  seats: { readonly counts: readonly string[]; readonly allowed: number },
  now = new Date(),
): Promise<MemberRow | InviteRefusal> {
  const beyond = await beyondGranter(by, input, registryFor);
  if (beyond) return beyond;

  const members = await membersOf(db, tenantId);
  if (members.some((m) => m.email === input.email)) return "already_here";

  /*
    ⚠️ THE CEILING IS ABOUT THE PLATFORM ROLE BEING INVITED. A customer costs no
    seat — they are the product, not the staff — and must not be refused because
    the staff seats are full, or a studio on the smallest plan can never add the
    people it exists to serve. And invitations nobody has answered yet COUNT,
    because counting only accepted members lets anybody past the ceiling by
    inviting twenty people and waiting.
  */
  const costsASeat = seats.counts.includes(input.platformRole);
  if (costsASeat && seats.allowed >= 0 && seatsUsed(members, seats.counts) >= seats.allowed) {
    return "no_seats";
  }

  const id = newId("mem", now);
  await db.prepare(
    `INSERT INTO membership (id, tenant_id, account_id, email, platform_role, app_roles_json, grants_json, revoked_json, at, accepted_at, removed_at)
     VALUES (?, ?, NULL, ?, ?, ?, '[]', '[]', ?, NULL, NULL)`)
    .bind(id, tenantId, input.email, input.platformRole, JSON.stringify(input.appRoles),
      now.toISOString()).run();

  return {
    id, tenantId, accountId: "" as AccountId, email: input.email,
    platformRole: input.platformRole, appRoles: input.appRoles,
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
 * person creating a workspace is already signed in as themselves. They are the
 * `owner` — workspace authority is the platform's to give — and the APP role is
 * the app's own `founding` declaration.
 */
export async function found(
  db: Db, tenantId: TenantId, accountId: AccountId, email: string,
  appRoles: Readonly<Record<string, string>>, now = new Date(),
): Promise<MemberRow> {
  const id = newId("mem", now);
  await db.prepare(
    `INSERT INTO membership (id, tenant_id, account_id, email, platform_role, app_roles_json, grants_json, revoked_json, at, accepted_at, removed_at)
     VALUES (?, ?, ?, ?, 'owner', ?, '[]', '[]', ?, ?, NULL)`)
    .bind(id, tenantId, accountId, email, JSON.stringify(appRoles),
      now.toISOString(), now.toISOString()).run();
  return {
    id, tenantId, accountId, email, platformRole: "owner", appRoles,
    grants: [], revoked: [], acceptedAt: now.toISOString(),
  };
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
  by: Granter, registryFor: (appId: string) => Promise<RoleRegistry>, now = new Date(),
): Promise<null | RemoveRefusal> {
  const members = await membersOf(db, tenantId);
  const target = members.find((m) => m.id === memberId);
  if (!target) return "no_such_member";
  const beyond = await beyondGranter(by, target, registryFor);
  if (beyond === "beyond_you") return "beyond_you";
  if (wouldStrand(members, target.accountId)) return "would_strand";

  await db.prepare(`UPDATE membership SET removed_at = ? WHERE id = ?`)
    .bind(now.toISOString(), memberId).run();
  return null;
}

/**
 * Change somebody's platform role.
 *
 * ⚠️ BOUNDED BY THE SAME RULE INVITATIONS ARE — both the role being given and
 * the role being taken away, or the bound is a suggestion. And moving the last
 * administrator to a role that cannot manage members strands the workspace
 * exactly as removing them would.
 */
export async function setPlatformRole(
  db: Db, tenantId: TenantId, memberId: string, role: string,
  by: ReadonlySet<string>,
): Promise<null | RemoveRefusal | "no_such_role"> {
  if (!PLATFORM_ROLES[role]) return "no_such_role";
  const members = await membersOf(db, tenantId);
  const target = members.find((m) => m.id === memberId);
  if (!target) return "no_such_member";
  if (!canAssign(by, role, PLATFORM_ROLES)) return "beyond_you";
  if (!canAssign(by, target.platformRole, PLATFORM_ROLES)) return "beyond_you";
  if (!PLATFORM_ROLES[role]?.includes("member:manage") && wouldStrand(members, target.accountId)) {
    return "would_strand";
  }
  await db.prepare(`UPDATE membership SET platform_role = ? WHERE id = ?`).bind(role, memberId).run();
  return null;
}

/**
 * Change somebody's role in ONE app, or take them out of it (`null`).
 *
 * ⚠️ Removing an app role never strands: workspace authority is the platform
 * role's, so "no longer a user of this product" is always a safe state.
 */
export async function setAppRole(
  db: Db, tenantId: TenantId, memberId: string, appId: string, role: string | null,
  by: ReadonlySet<string>, registry: RoleRegistry,
): Promise<null | RemoveRefusal | "no_such_role"> {
  const members = await membersOf(db, tenantId);
  const target = members.find((m) => m.id === memberId);
  if (!target) return "no_such_member";
  if (role !== null && !registry[role]) return "no_such_role";
  if (role !== null && !canAssign(by, role, registry)) return "beyond_you";
  const had = target.appRoles[appId];
  if (had && !canAssign(by, had, registry)) return "beyond_you";

  const next = { ...target.appRoles };
  if (role === null) delete next[appId]; else next[appId] = role;
  await db.prepare(`UPDATE membership SET app_roles_json = ? WHERE id = ?`)
    .bind(JSON.stringify(next), memberId).run();
  return null;
}

/* ------------------------------------------------------------- resolution --- */

/**
 * ⚠️ WHAT SOMEBODY MAY DO, RESOLVED IN ONE PLACE — in one APP'S CONTEXT, with
 * expired grants already gone. Every gate reads this; a second implementation
 * is how a screen comes to offer what a route refuses.
 */
export const permissionsOf = (
  member: MemberRow | null, appId: string | null, roles: RoleRegistry, now?: Date,
): ReadonlySet<string> =>
  permissionsFor(member, appId, roles, now?.toISOString());

/**
 * The `permissionsIn` a deployment hands to `Who`, built once per request.
 *
 * ⚠️ PER APP, MEMOISED PER REQUEST (D15). The flat set this replaced was
 * resolved against whichever app happened to be FIRST on the tenant's list, so
 * a role in the second product granted nothing, silently. The memo matters
 * because one request may ask several times — the gate for the operation's own
 * app, the platform authority for a role change, every app in a tool listing.
 */
export function permissionsResolver(
  db: Db,
  tenantId: TenantId,
  member: MemberRow | null,
  declared: (appId: string) => RoleRegistry | null,
  /* ⚠️ Defaulted, never optional in effect: without a clock every timed grant
     counts for ever, which is a package that never lapses (D16). */
  now: Date = new Date(),
): (appId: string | null) => Promise<ReadonlySet<string>> {
  const asked = new Map<string | null, Promise<ReadonlySet<string>>>();
  return (appId) => {
    const hit = asked.get(appId);
    if (hit) return hit;
    const answer = (async () => {
      if (appId === null) return permissionsOf(member, null, {}, now);
      const roles = await rolesFor(db, tenantId, appId, declared(appId) ?? {});
      return permissionsOf(member, appId, roles, now);
    })();
    asked.set(appId, answer);
    return answer;
  };
}
