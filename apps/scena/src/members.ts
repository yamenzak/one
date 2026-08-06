/**
 * The tenant roster, and what is left of it after Stage 2.
 *
 * ── What this file used to be ──────────────────────────────────────────────
 *
 * Scena's two-tier auth model: owners signed in with an emailed code, and STAFF
 * were provisioned by a tenant admin with a **username and a password** typed
 * into a form. Under the hood each was a Better Auth credential account keyed by
 * a synthetic address (`<username>@<org-slug>.staff.scena`), with a global
 * `"user".username` column so the sign-in form needed no workspace.
 *
 * All of that is gone. Staff are invited by email through `@4dl/auth`'s staff
 * routes and sign in with a code or a passkey, like every other person on this
 * platform. The reasons are not stylistic:
 *
 *   • An admin CHOSE and could RE-READ a colleague's password. Even setting the
 *     credential-reuse problem aside, that makes "who did this" unanswerable:
 *     any action by that account is equally attributable to the admin.
 *   • The synthetic address could not receive mail, so there was no recovery
 *     path that did not go through the admin, and no way to reach the person.
 *   • It was a second membership model beside the org plugin's, with its own
 *     invite/revoke/re-role code — `@4dl/auth` ships all three, seat-checked at
 *     all three doors, which Scena's version was not.
 *
 * ── What survives, and why ─────────────────────────────────────────────────
 *
 * `randomHandle` and the workspace resolvers. The handle generator is still
 * needed by `board-users.ts`, which mints STATION accounts — the one principal
 * that legitimately holds a credential (see that file's header). The workspace
 * resolvers are read by the sign-in surface and by tenant addressing, and move
 * to `@4dl/tenancy` in Stage 3.
 */

import type { RoleName } from "./access.js";
import { resolvePermissions } from "./perms.js";

export interface TenantMember {
  memberId: string;
  userId: string;
  role: RoleName;
  /** Display name, falling back to the address. */
  name: string;
  email: string | null;
  /** Effective per-user permission grant (custom if set, else the role preset). */
  permissions: Record<string, string[]>;
  createdAt: string | null;
}

/** Normalize a workspace name/slug to the canonical org-slug form. */
export function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * A random N-char lowercase-alnum handle, for auto-provisioned STATION accounts.
 *
 * The alphabet omits `0`/`o` and `1`/`l` on purpose: this string is read aloud
 * across a reception desk, and the two pairs are the ones that get heard wrong.
 */
export function randomHandle(len = 6): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => alphabet[b % alphabet.length]).join("");
}

/** The workspace slug for an organization. */
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

/**
 * Every HUMAN member of a tenant.
 *
 * Board users are filtered out by role. They are `member` rows like anybody
 * else — that is what makes them revocable and auditable — but they are devices,
 * they are managed on the Live Boards screen, and a roster that listed one
 * station per room would be mostly furniture.
 */
export async function listTenantMembers(db: D1Database, orgId: string): Promise<TenantMember[]> {
  const rs = await db
    .prepare(
      'SELECT m.id AS memberId, m.role AS role, m.permissions_json AS permissions_json, m.createdAt AS createdAt, u.id AS userId, u.name AS name, u.email AS email ' +
        'FROM member m JOIN "user" u ON u.id = m.userId ' +
        "WHERE m.organizationId = ? AND m.role NOT IN ('board_coordinator', 'board_station') ORDER BY m.createdAt ASC",
    )
    .bind(orgId)
    .all<{ memberId: string; role: string; permissions_json: string | null; createdAt: string | null; userId: string; name: string | null; email: string | null }>();
  return (rs.results ?? []).map((r) => ({
    memberId: r.memberId,
    userId: r.userId,
    role: (r.role as RoleName) ?? "viewer",
    name: r.name || r.email || "Member",
    email: r.email,
    permissions: resolvePermissions(r.role, r.permissions_json),
    createdAt: r.createdAt,
  }));
}
