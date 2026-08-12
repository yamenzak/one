/**
 * WHO IS IN A WORKSPACE, AND IN WHAT ROLE — the table every app was inventing.
 *
 * ⚠️ IDENTITY IS NOT AUTHORIZATION, AND THIS IS THE OTHER HALF. The platform
 * answers "who is this" from a session; a membership answers "what are they
 * HERE". Both halves existed before this file: `resolveCaller` asked every app
 * for the second one, and every app answered with a scaffold — the reference app
 * in this repository handed OWNER to every signed-in caller, which typechecks,
 * passes every test, and would ship.
 *
 * ⚠️ REGIONAL, NEVER GLOBAL. A membership is about one product's tenants; the
 * shared identity store holds accounts and credentials only. Putting memberships
 * there would put a cross-region read on the hot path of every request, which is
 * the cost the identity split exists to avoid.
 */

import type { Instant, Membership as Resolvable, RoleRegistry, SchemaModule, SqlHandle, TenantId, UserId } from "@one/kernel";
import { permissionsFor } from "@one/kernel";

/* ---------------------------------------------------------------- schema --- */

/**
 * ⚠️ AN INVITATION IS THE MEMBERSHIP ROW, NOT A SECOND TABLE.
 *
 * The shape this replaces has `members` and `invitations` side by side, and the
 * consequence is that a member list is a UNION every screen has to remember — so the
 * pending half is missing from at least one of them, an owner re-invites
 * somebody who was already invited, and a seat ceiling counts one table while
 * the other quietly grows. `accepted_at IS NULL` is "invited"; there is no
 * second row to keep in step and no union to forget.
 */
export const MEMBERSHIP_SCHEMA: SchemaModule = {
  id: "membership",
  ddl: [
    /* ⚠️ ONE LINE: the runner splits a batch on newlines, and a wrapped statement
       is applied in pieces that each fail to parse. */
    `CREATE TABLE IF NOT EXISTS membership (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL, account_id TEXT, subject_id TEXT, grants_json TEXT NOT NULL DEFAULT '[]', revoked_json TEXT NOT NULL DEFAULT '[]', invited_by TEXT, invited_at TEXT NOT NULL, accepted_at TEXT, revoked_at TEXT, updated_at TEXT NOT NULL);`,
    /*
      ⚠️ ONE MEMBERSHIP PER ADDRESS PER WORKSPACE, enforced by the store rather
      than by whoever writes the next invite path. Two rows for one person is how
      a revoked colleague keeps a live role: the list shows the revoked one and
      the resolver finds the other.
    */
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_email ON membership(tenant_id, email);`,
    /* Every request asks this exact question, and it is the only hot read here. */
    `CREATE INDEX IF NOT EXISTS idx_membership_account ON membership(account_id, tenant_id);`,
  ],
  /*
    ⚠️ SCOPED BOTH WAYS, AND BOTH ARE REAL. Closing a workspace erases its
    memberships; erasing one customer erases the membership that made them one —
    otherwise a deleted person keeps a way in.
  */
  scoped: {
    tenantColumn: "tenant_id",
    tenantTables: ["membership"],
    subjectTables: [{ table: "membership", column: "subject_id" }],
  },
};

/* ----------------------------------------------------------------- model --- */

/**
 * ⚠️ ONE ROLE PER ROW, WHERE THE KERNEL'S MODEL ALLOWS SEVERAL. That is the
 * store being narrower than the contract rather than the contract being wrong:
 * a scalar column is what makes a seat count an indexed `role IN (…)` instead of
 * a scan through JSON, and no product here has yet wanted a person to be two
 * things at once. Widening it later is a column and a migration; resolving
 * through `permissionsFor` regardless is what makes that change local.
 */
export interface Membership {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly email: string;
  readonly role: string;
  /** ⚠️ Extra permissions and withheld ones — "their role, except this". */
  readonly grants: readonly string[];
  readonly revoked: readonly string[];
  /** Null until somebody signs in with this address and claims the row. */
  readonly accountId: UserId | null;
  /** ⚠️ What makes this member a CUSTOMER of the workspace. See `subjectOf`. */
  readonly subjectId: string | null;
  readonly invitedAt: Instant;
  readonly acceptedAt: Instant | null;
  readonly revokedAt: Instant | null;
}

interface Row {
  id: string; tenant_id: string; email: string; role: string;
  account_id: string | null; subject_id: string | null;
  grants_json: string; revoked_json: string;
  invited_at: string; accepted_at: string | null; revoked_at: string | null;
}

/** A stored list that will not parse is an EMPTY one, never a thrown request. */
const strings = (text: string): readonly string[] => {
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
};

const toMembership = (r: Row): Membership => ({
  id: r.id,
  tenantId: r.tenant_id as TenantId,
  email: r.email,
  role: r.role,
  grants: strings(r.grants_json),
  revoked: strings(r.revoked_json),
  accountId: (r.account_id as UserId | null) ?? null,
  subjectId: r.subject_id,
  invitedAt: r.invited_at as Instant,
  acceptedAt: (r.accepted_at as Instant | null) ?? null,
  revokedAt: (r.revoked_at as Instant | null) ?? null,
});

const COLUMNS = `id, tenant_id, email, role, account_id, subject_id, grants_json, revoked_json, invited_at, accepted_at, revoked_at`;

/** ⚠️ Addresses are compared folded, because people do not type them consistently. */
export const foldEmail = (email: string): string => email.trim().toLowerCase();

const newId = (): string => `mem_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

/* ----------------------------------------------------------------- reads --- */

/**
 * The membership this caller holds here, if any.
 *
 * ⚠️ A REVOKED ROW IS NOT A MEMBERSHIP. Filtering in the caller instead is how a
 * removed colleague keeps working until their session expires — which is days,
 * on the one path where "removed" has to mean removed now.
 */
export async function memberOf(
  db: SqlHandle, tenantId: TenantId, accountId: UserId,
): Promise<Membership | null> {
  const row = await db.first<Row>(
    `SELECT ${COLUMNS} FROM membership WHERE tenant_id = ? AND account_id = ? AND revoked_at IS NULL`,
    tenantId, accountId,
  );
  return row ? toMembership(row) : null;
}

/**
 * Everybody in the workspace, invited or accepted.
 *
 * ⚠️ THE PENDING ONES ARE IN IT. A list of accepted members only makes
 * an unanswered invitation invisible, so nobody chases it and the seat it holds
 * looks free.
 */
export async function membersOf(db: SqlHandle, tenantId: TenantId): Promise<readonly Membership[]> {
  const rows = await db.all<Row>(
    `SELECT ${COLUMNS} FROM membership WHERE tenant_id = ? AND revoked_at IS NULL ORDER BY invited_at`,
    tenantId,
  );
  return rows.map(toMembership);
}

/**
 * How many seats are in use.
 *
 * ⚠️ AN INVITATION COUNTS. A ceiling that only counts accepted members is a
 * ceiling anybody can pass by inviting twenty people and waiting — and the
 * overage appears days later, as a surprise, on the day they all sign in.
 */
export async function seatsUsed(
  db: SqlHandle, tenantId: TenantId, counted: readonly string[],
): Promise<number> {
  if (counted.length === 0) return 0;
  const marks = counted.map(() => "?").join(", ");
  const row = await db.first<{ n: number }>(
    `SELECT COUNT(*) AS n FROM membership WHERE tenant_id = ? AND revoked_at IS NULL AND role IN (${marks})`,
    tenantId, ...counted,
  );
  return row?.n ?? 0;
}

/* ---------------------------------------------------------------- writes --- */

/**
 * Invite an address into a workspace, or change the role of one already there.
 *
 * ⚠️ RE-INVITING IS NOT AN ERROR AND NOT A SECOND ROW. Somebody who has already
 * accepted keeps their account link and gains the new role; somebody still
 * pending has their invitation replaced. A conflict here would leave an owner
 * with a stuck row and no way to correct a typo except through support.
 */
export async function invite(
  db: SqlHandle,
  tenantId: TenantId,
  input: { readonly email: string; readonly role: string; readonly subjectId?: string | null; readonly invitedBy?: UserId | null },
  at: Instant,
): Promise<Membership> {
  const email = foldEmail(input.email);
  /*
    ⚠️ `revoked_at = NULL` IN THE UPDATE IS LOAD-BEARING. The unique index means
    a removed person's row is still the one occupying their address here, so
    without this an owner who removes somebody can never invite them back — the
    insert conflicts and the update leaves them revoked.
  */
  await db.run(
    `INSERT INTO membership (id, tenant_id, email, role, subject_id, invited_by, invited_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, email) DO UPDATE SET
       role = excluded.role,
       subject_id = COALESCE(excluded.subject_id, membership.subject_id),
       revoked_at = NULL,
       updated_at = excluded.updated_at`,
    newId(), tenantId, email, input.role, input.subjectId ?? null, input.invitedBy ?? null, at, at,
  );
  const row = await db.first<Row>(`SELECT ${COLUMNS} FROM membership WHERE tenant_id = ? AND email = ?`, tenantId, email);
  return toMembership(row!);
}

/**
 * Attach a signed-in account to the invitation waiting for its address.
 *
 * ⚠️ CLAIMED ONCE, AND ONLY BY AN UNCLAIMED ROW. `account_id IS NULL` in the
 * predicate is the whole of it: without it, signing in with an address that
 * somebody else's membership already carries would re-point that membership at
 * the new account — an invitation to a colleague's old address becoming a way
 * into their workspace.
 *
 * Returns the membership when this call claimed it or it was already theirs,
 * and null when the address has no invitation here.
 */
export async function claim(
  db: SqlHandle, tenantId: TenantId, accountId: UserId, email: string, at: Instant,
): Promise<Membership | null> {
  const folded = foldEmail(email);
  await db.run(
    `UPDATE membership SET account_id = ?, accepted_at = COALESCE(accepted_at, ?), updated_at = ?
     WHERE tenant_id = ? AND email = ? AND account_id IS NULL AND revoked_at IS NULL`,
    accountId, at, at, tenantId, folded,
  );
  const row = await db.first<Row>(
    `SELECT ${COLUMNS} FROM membership WHERE tenant_id = ? AND email = ? AND account_id = ? AND revoked_at IS NULL`,
    tenantId, folded, accountId,
  );
  return row ? toMembership(row) : null;
}

/**
 * Remove somebody.
 *
 * ⚠️ REVOKED, NOT DELETED. Who was in a workspace and when is the question every
 * "how did this record change" investigation starts from, and a deleted row
 * answers it with silence. The seat is freed either way.
 */
export async function revoke(db: SqlHandle, tenantId: TenantId, id: string, at: Instant): Promise<boolean> {
  const found = await db.first<{ id: string }>(
    `SELECT id FROM membership WHERE tenant_id = ? AND id = ? AND revoked_at IS NULL`, tenantId, id,
  );
  if (!found) return false;
  await db.run(`UPDATE membership SET revoked_at = ?, updated_at = ? WHERE id = ?`, at, at, found.id);
  return true;
}

/**
 * WHETHER TAKING THIS MEMBER OUT WOULD STRAND THE WORKSPACE.
 *
 * ⚠️ A WORKSPACE WITH NOBODY WHO CAN MANAGE MEMBERS IS NOT CLOSED — IT IS
 * UNREACHABLE. Its data is intact, its bill keeps running, and there is nobody
 * left who can invite anybody back in. Closing is a different operation with a
 * different confirmation and an export attached; this is the accident that looks
 * like it and cannot be undone from inside.
 *
 * ⚠️ ONE ANSWER, ASKED BY BOTH DOORS. An administrator removing somebody and a
 * person removing themselves are the same question about the same table, reached
 * through different permissions — and two implementations of it is how a
 * workspace comes to be strandable through the door nobody re-checked. It is pure
 * so that both can ask it having already read the roster once.
 *
 * ⚠️ AND IT ASKS THE MANIFEST WHICH ROLES COUNT, rather than naming an owner. An
 * app whose administrators are called something else is the ordinary case, and a
 * hardcoded role name fails open — every removal allowed, silently.
 */
export function wouldStrand(
  roles: RoleRegistry,
  members: readonly Membership[],
  id: string,
): boolean {
  const target = members.find((m) => m.id === id);
  if (!target) return false;
  const manages = (role: string) => (roles[role] ?? []).includes("member:manage");
  if (!manages(target.role)) return false;
  return members.filter((m) => manages(m.role)).length === 1;
}

/**
 * Narrow or widen one member within their role.
 *
 * ⚠️ A DIFF, NOT A REPLACEMENT SET. "Everything the role gives, except this one
 * thing" is the request a real workspace makes, and it has to survive the role
 * gaining a permission next month — which a stored set does not.
 */
export async function setPermissions(
  db: SqlHandle,
  tenantId: TenantId,
  id: string,
  of: { readonly grants: readonly string[]; readonly revoked: readonly string[] },
  at: Instant,
): Promise<void> {
  await db.run(
    `UPDATE membership SET grants_json = ?, revoked_json = ?, updated_at = ? WHERE tenant_id = ? AND id = ?`,
    JSON.stringify(of.grants), JSON.stringify(of.revoked), at, tenantId, id,
  );
}

/* ------------------------------------------------------------- resolving --- */

/**
 * ⚠️ A ROLE NAMES A ROLE, AND PERMISSIONS ARE READ FROM THE MANIFEST.
 *
 * Storing the permission SET on the membership row is the shape that rots: a
 * permission added to a role reaches nobody who joined before it, and one
 * removed keeps working for everybody who joined before it. Neither failure is
 * visible from the role name, which is the only thing anybody looks at.
 *
 * ⚠️ AND THE WALK IS THE KERNEL'S, not a second one written here. Roles union,
 * grants add, revocations subtract — and revocation being last is what makes
 * "their role, except this one thing" expressible at all. A store that resolved
 * its own would be the second implementation of "what may this person do", which
 * is how a screen comes to promise what a route refuses.
 *
 * No membership grants NOTHING rather than everything, and so does an unknown
 * role: one deleted from the manifest must not leave its holders with whatever
 * set they happened to have.
 */
export function permissionsOf(roles: RoleRegistry, member: Membership | null): ReadonlySet<string> {
  if (!member) return new Set<string>();
  const resolvable: Resolvable = {
    accountId: (member.accountId ?? "") as UserId,
    tenantId: member.tenantId,
    roles: [member.role],
    grants: member.grants,
    revoked: member.revoked,
  };
  return permissionsFor(resolvable, roles);
}

/**
 * Who this caller is on the CUSTOMER rail.
 *
 * ⚠️ THE APP DECLARES THE SHAPE; THIS APPLIES IT. Every app used to answer this
 * in its own caller resolver, and every one of them returned the account id —
 * which is right where the signed-in person IS the customer and silently wrong
 * where they act on somebody's behalf. In the second shape a coach would resolve
 * as their own customer, hold their client's package, and the client would hold
 * nothing; nothing throws, and the capabilities screen agrees with the gate
 * because both are wrong together.
 */
export function subjectFor(
  rail: false | "member" | "record",
  accountId: UserId | null,
  member: Membership | null,
): string | undefined {
  if (!rail) return undefined;
  if (rail === "member") return accountId ?? undefined;
  return member?.subjectId ?? undefined;
}
