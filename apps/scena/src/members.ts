/**
 * Staff member provisioning — the tenant-admin side of the two-tier auth model.
 *
 * Owners sign in with email OTP (auth.ts). **Staff** are provisioned by their
 * tenant admin with a plain **username + password** — no email, no invite
 * round-trip — because reception desks want instant, browser-saved logins, not
 * one-time codes. Under the hood each staff member is an ordinary Better Auth
 * credential account keyed by a synthetic, non-routable email
 * (`<username>@<org-slug>.staff.scena`), so it rides the existing
 * email+password provider and password managers work normally. The synthetic
 * address is never emailed.
 *
 * All writes go straight to the Better Auth tables (user / account / member) via
 * D1 with the same password hasher Better Auth uses, so the credentials verify
 * on sign-in exactly like any other account. The tenant admin can reset a
 * password, change a role, or revoke access at any time.
 */
import { hashPassword } from "better-auth/crypto";
import type { RoleName } from "./access.js";
import { sanitizePermissions, resolvePermissions } from "./perms.js";

/** Non-routable suffix that marks a synthetic staff email (never delivered to). */
const STAFF_DOMAIN_SUFFIX = ".staff.scena";
export const ROLE_NAMES: RoleName[] = ["owner", "operator", "receptionist", "viewer"];

export interface TenantMember {
  memberId: string;
  userId: string;
  role: RoleName;
  /** Display name (staff: the username; owners: their name/email). */
  name: string;
  /** The login username for staff accounts, or null for real-email accounts. */
  username: string | null;
  /** Real email for owner/invited accounts; null for synthetic staff accounts. */
  email: string | null;
  isStaff: boolean;
  /** Effective per-user permission grant (custom if set, else the role preset). */
  permissions: Record<string, string[]>;
  createdAt: string | null;
}

function rid(prefix: string): string {
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);
  return `${prefix}_${[...buf].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Normalize a workspace name/slug to the canonical org-slug form. */
export function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Validate + normalize a staff username (lowercase, url-safe, 3–32 chars). */
export function normalizeUsername(raw: string): string | null {
  const u = raw.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(u) ? u : null;
}

/** True when a username is already taken by ANY account, across all tenants
 *  (global uniqueness, §auth). Optionally ignore one user id (for self-claims). */
export async function usernameTaken(db: D1Database, username: string, exceptUserId?: string): Promise<boolean> {
  const row = await db.prepare('SELECT id FROM "user" WHERE username = ?').bind(username).first<{ id: string }>();
  return Boolean(row && row.id !== exceptUserId);
}

/** Resolve a global username to its login email, so the sign-in form can call
 *  the normal email+password provider with no workspace to type. */
export async function resolveLoginEmail(db: D1Database, username: string): Promise<string | null> {
  const row = await db.prepare('SELECT email FROM "user" WHERE username = ?').bind(username).first<{ email: string | null }>();
  return row?.email ?? null;
}

/** Claim/rename a username for a user (owner onboarding). Global-unique. */
export async function claimUsername(db: D1Database, userId: string, raw: string): Promise<{ ok: boolean; error?: string }> {
  const username = normalizeUsername(raw);
  if (!username) return { ok: false, error: "Username must be 3–32 chars: letters, numbers, dot, dash, underscore." };
  if (await usernameTaken(db, username, userId)) return { ok: false, error: "That username is taken." };
  await db.prepare('UPDATE "user" SET username = ?, updatedAt = ? WHERE id = ?').bind(username, new Date().toISOString(), userId).run();
  return { ok: true };
}

/** A random N-char lowercase-alnum handle (for auto-provisioned board users). */
export function randomHandle(len = 6): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789"; // no ambiguous 0/o/1/l
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => alphabet[b % alphabet.length]).join("");
}

/** The synthetic credential email for a staff username within a workspace. */
export function staffEmail(username: string, orgSlug: string): string {
  return `${username}@${orgSlug}${STAFF_DOMAIN_SUFFIX}`;
}

function isStaffEmail(email: string | null): boolean {
  return Boolean(email && email.endsWith(STAFF_DOMAIN_SUFFIX));
}

function usernameOf(email: string | null): string | null {
  return isStaffEmail(email) ? (email as string).split("@")[0] ?? null : null;
}

/** The workspace slug for an organization (used to build staff login emails). */
export async function orgSlug(db: D1Database, orgId: string): Promise<string | null> {
  const row = await db.prepare('SELECT slug FROM organization WHERE id = ?').bind(orgId).first<{ slug: string }>();
  return row?.slug ?? null;
}

/** Resolve a typed workspace (slug or name) to its canonical org slug + id. */
export async function resolveWorkspace(db: D1Database, query: string): Promise<{ id: string; slug: string; name: string } | null> {
  const slug = slugify(query);
  const row = await db
    .prepare('SELECT id, slug, name FROM organization WHERE slug = ? OR lower(name) = ? LIMIT 1')
    .bind(slug, query.trim().toLowerCase())
    .first<{ id: string; slug: string; name: string }>();
  return row ?? null;
}

/** Every member of a tenant, with staff usernames surfaced for the Team screen. */
export async function listTenantMembers(db: D1Database, orgId: string): Promise<TenantMember[]> {
  const rs = await db
    .prepare(
      'SELECT m.id AS memberId, m.role AS role, m.permissions_json AS permissions_json, m.createdAt AS createdAt, u.id AS userId, u.name AS name, u.email AS email, u.username AS username ' +
        'FROM member m JOIN "user" u ON u.id = m.userId ' +
        // Board users (§boards) are auto-provisioned per board and managed on the
        // Live Boards page — keep them out of the human staff roster.
        "WHERE m.organizationId = ? AND m.role NOT IN ('board_coordinator', 'board_station') ORDER BY m.createdAt ASC",
    )
    .bind(orgId)
    .all<{ memberId: string; role: string; permissions_json: string | null; createdAt: string | null; userId: string; name: string | null; email: string | null; username: string | null }>();
  return (rs.results ?? []).map((r) => {
    const username = r.username ?? usernameOf(r.email);
    return {
      memberId: r.memberId,
      userId: r.userId,
      role: (r.role as RoleName) ?? "viewer",
      name: r.name || username || r.email || "Member",
      username,
      email: isStaffEmail(r.email) ? null : r.email,
      isStaff: isStaffEmail(r.email),
      permissions: resolvePermissions(r.role, r.permissions_json),
      createdAt: r.createdAt,
    };
  });
}

/** Set a member's custom permission grant (empty ⇒ clear → role preset applies). */
export async function setMemberPermissions(db: D1Database, orgId: string, memberId: string, permissions: unknown): Promise<{ ok: boolean; error?: string }> {
  const grant = sanitizePermissions(permissions);
  const json = Object.keys(grant).length ? JSON.stringify(grant) : null;
  const res = await db.prepare('UPDATE "member" SET permissions_json = ? WHERE id = ? AND organizationId = ?').bind(json, memberId, orgId).run();
  if (!res.meta.changes) return { ok: false, error: "Member not found." };
  return { ok: true };
}

export type ProvisionResult = { ok: true; memberId: string; userId: string; username: string; loginSlug: string } | { ok: false; error: string };

/**
 * Provision a staff member (username + password + role) under a tenant. Creates
 * the user, a credential account with the hashed password, and the org member
 * row. The username is unique within the workspace (the synthetic email carries
 * the org slug), so the same username can exist in different tenants.
 */
export async function createStaff(
  db: D1Database,
  orgId: string,
  input: { username: string; password: string; role: string; name?: string; permissions?: unknown },
): Promise<ProvisionResult> {
  const username = normalizeUsername(input.username);
  if (!username) return { ok: false, error: "Username must be 3–32 chars: letters, numbers, dot, dash, underscore." };
  if (!input.password || input.password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
  const role = ROLE_NAMES.includes(input.role as RoleName) ? (input.role as RoleName) : null;
  if (!role) return { ok: false, error: "Unknown role." };
  // Optional custom per-user grant (checklist). When omitted, the role preset
  // applies at read time (permissions_json stays null).
  const grant = input.permissions !== undefined ? sanitizePermissions(input.permissions) : null;
  const permsJson = grant && Object.keys(grant).length ? JSON.stringify(grant) : null;

  const slug = await orgSlug(db, orgId);
  if (!slug) return { ok: false, error: "Workspace not found." };
  const email = staffEmail(username, slug);

  // Usernames are globally unique now (§auth) so staff sign in with just their
  // username + password — no workspace to type.
  if (await usernameTaken(db, username)) return { ok: false, error: "That username is already taken." };

  const now = new Date().toISOString();
  const userId = rid("usr");
  const accountId = rid("acc");
  const memberId = rid("mem");
  const hash = await hashPassword(input.password);
  const name = (input.name || "").trim() || username;

  await db.batch([
    db
      .prepare('INSERT INTO "user" (id, name, email, username, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1, ?, ?)')
      .bind(userId, name, email, username, now, now),
    db
      .prepare('INSERT INTO "account" (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(accountId, userId, "credential", userId, hash, now, now),
    db.prepare('INSERT INTO "member" (id, organizationId, userId, role, permissions_json, createdAt) VALUES (?, ?, ?, ?, ?, ?)').bind(memberId, orgId, userId, role, permsJson, now),
  ]);

  return { ok: true, memberId, userId, username, loginSlug: slug };
}

/** Look up a member row bound to a tenant (guards cross-tenant writes). */
async function memberInOrg(db: D1Database, memberId: string, orgId: string): Promise<{ userId: string; role: string; email: string | null } | null> {
  return db
    .prepare('SELECT m.userId AS userId, m.role AS role, u.email AS email FROM member m JOIN "user" u ON u.id = m.userId WHERE m.id = ? AND m.organizationId = ?')
    .bind(memberId, orgId)
    .first<{ userId: string; role: string; email: string | null }>();
}

/** Count remaining owners in a tenant — used to protect the last owner. */
async function ownerCount(db: D1Database, orgId: string): Promise<number> {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM member WHERE organizationId = ? AND role = 'owner'").bind(orgId).first<{ n: number }>();
  return r?.n ?? 0;
}

/** Reset a staff member's password (admin action — no old password needed). */
export async function resetStaffPassword(db: D1Database, orgId: string, memberId: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
  if (!newPassword || newPassword.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
  const m = await memberInOrg(db, memberId, orgId);
  if (!m) return { ok: false, error: "Member not found." };
  if (!isStaffEmail(m.email)) return { ok: false, error: "Only staff accounts have admin-managed passwords." };
  const hash = await hashPassword(newPassword);
  const now = new Date().toISOString();
  await db.prepare("UPDATE \"account\" SET password = ?, updatedAt = ? WHERE userId = ? AND providerId = 'credential'").bind(hash, now, m.userId).run();
  // Sign the member out everywhere so the new password takes effect immediately.
  await db.prepare('DELETE FROM "session" WHERE userId = ?').bind(m.userId).run();
  return { ok: true };
}

/** Change a member's role (protects the last owner from being demoted). */
export async function setMemberRole(db: D1Database, orgId: string, memberId: string, role: string): Promise<{ ok: boolean; error?: string }> {
  if (!ROLE_NAMES.includes(role as RoleName)) return { ok: false, error: "Unknown role." };
  const m = await memberInOrg(db, memberId, orgId);
  if (!m) return { ok: false, error: "Member not found." };
  if (m.role === "owner" && role !== "owner" && (await ownerCount(db, orgId)) <= 1) {
    return { ok: false, error: "This is the last owner — promote someone else first." };
  }
  await db.prepare("UPDATE member SET role = ? WHERE id = ? AND organizationId = ?").bind(role, memberId, orgId).run();
  return { ok: true };
}

/**
 * Revoke a member's access. Removes the org membership and kills their sessions
 * immediately. Synthetic staff accounts (which exist only for this tenant) are
 * hard-deleted; real-email accounts keep their user record (they may belong to
 * other orgs) and only lose this membership.
 */
export async function revokeMember(db: D1Database, orgId: string, memberId: string): Promise<{ ok: boolean; error?: string }> {
  const m = await memberInOrg(db, memberId, orgId);
  if (!m) return { ok: false, error: "Member not found." };
  if (m.role === "owner" && (await ownerCount(db, orgId)) <= 1) {
    return { ok: false, error: "This is the last owner — you can't revoke it." };
  }
  await db.prepare("DELETE FROM member WHERE id = ? AND organizationId = ?").bind(memberId, orgId).run();
  await db.prepare('DELETE FROM "session" WHERE userId = ?').bind(m.userId).run();
  if (isStaffEmail(m.email)) {
    await db.prepare('DELETE FROM "account" WHERE userId = ?').bind(m.userId).run();
    await db.prepare('DELETE FROM "user" WHERE id = ?').bind(m.userId).run();
  }
  return { ok: true };
}
