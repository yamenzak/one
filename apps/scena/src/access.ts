/**
 * RBAC access control — owner / operator / receptionist / viewer.
 *
 * Built on Better Auth's access-control primitive and layered onto the
 * organization plugin: an **organization is a Scena tenant**, and a member's
 * role in their active org gates the dashboard nav and every write route.
 * `owner` maps to the account holder. Platform super-admin (the console) stays
 * separate — it's gated by the ADMIN_EMAILS env allowlist, not a tenant role.
 */
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc, ownerAc } from "better-auth/plugins/organization/access";

/** Scena resources layered on top of Better Auth's org-management statements. */
export const statement = {
  ...defaultStatements, // organization · member · invitation · team · ac
  screen: ["create", "read", "update", "delete", "control"],
  channel: ["create", "read", "update", "delete", "publish"],
  widget: ["create", "read", "update", "delete"],
  content: ["create", "read", "update", "delete"], // feeds · music · ads · schedule
  board: ["create", "read", "update", "delete", "operate"], // operate = call tickets / set room status
  station: ["create", "read", "update", "delete"],
  analytics: ["read"],
  billing: ["read", "manage"],
  settings: ["read", "manage"],
} as const;

export const ac = createAccessControl(statement);

/** Account holder: full control including billing + user management. */
export const owner = ac.newRole({
  ...ownerAc.statements,
  screen: ["create", "read", "update", "delete", "control"],
  channel: ["create", "read", "update", "delete", "publish"],
  widget: ["create", "read", "update", "delete"],
  content: ["create", "read", "update", "delete"],
  board: ["create", "read", "update", "delete", "operate"],
  station: ["create", "read", "update", "delete"],
  analytics: ["read"],
  billing: ["read", "manage"],
  settings: ["read", "manage"],
});

/** Content + fleet operator: everything except billing management + org deletion. */
export const operator = ac.newRole({
  ...adminAc.statements, // manage members/invites, cannot delete the org
  screen: ["create", "read", "update", "control"],
  channel: ["create", "read", "update", "delete", "publish"],
  widget: ["create", "read", "update", "delete"],
  content: ["create", "read", "update", "delete"],
  board: ["create", "read", "update", "delete", "operate"],
  station: ["read", "update"],
  analytics: ["read"],
  billing: ["read"],
  settings: ["read"],
});

/** Front desk: live boards + stations only — no content, billing, or settings. */
export const receptionist = ac.newRole({
  screen: ["read", "control"],
  channel: ["read"],
  board: ["read", "operate"],
  station: ["read"],
});

/** Read-only: analytics + fleet health, no writes anywhere. */
export const viewer = ac.newRole({
  screen: ["read"],
  channel: ["read"],
  widget: ["read"],
  content: ["read"],
  board: ["read"],
  station: ["read"],
  analytics: ["read"],
  billing: ["read"],
});

/**
 * Board-scoped users (§boards) — auto-provisioned, low-privilege accounts that
 * exist only to operate ONE live board. They never see the operator dashboard;
 * after login they're routed straight to their scoped control surface. Which
 * board (and which station within it) is enforced row-by-row via the
 * `board_users` table, since Better Auth AC is action-level, not row-level.
 *   • board_coordinator — controls the whole board (a receptionist / referee /
 *     clinic coordinator acting on behalf of every station).
 *   • board_station — controls a single option (one room's status, one counter's
 *     calls, one competitor's score).
 */
export const board_coordinator = ac.newRole({ board: ["read", "operate"] });
export const board_station = ac.newRole({ board: ["read", "operate"] });

export const roles = { owner, operator, receptionist, viewer, board_coordinator, board_station };
export type RoleName = keyof typeof roles;

/** Roles a board user can hold (kept out of the staff-assignable ROLE_NAMES). */
export const BOARD_ROLES = ["board_coordinator", "board_station"] as const;
export type BoardRole = (typeof BOARD_ROLES)[number];

/** The roles a human can be invited into. Board roles are provisioned, not
 *  invited, so they are deliberately absent. */
export const ROLE_NAMES = ["owner", "operator", "receptionist", "viewer"] as const;

/**
 * ⚠️ THREE CONSTANTS `@4dl/auth` asks for, and they are easy to conflate.
 *
 *   CREATOR_ROLE    what the person who creates a tenant receives.
 *   FALLBACK_ROLE   the preset used when a member's role cannot be resolved. It
 *                   must be the LEAST privileged one — falling back to
 *                   `operator` would hand an unknown member the whole fleet.
 *   SEAT_FREE_ROLES the roles that do NOT consume a staff seat.
 *
 * The third is the one Scena forced a platform change for. Board users are
 * `member` rows like anybody else, and they are minted PER BOARD — a clinic with
 * eight rooms has eight of them. Counted as staff they would exhaust a plan
 * before a single person was hired, so both board roles are seat-free. They are
 * also the reason `seatFreeRoles` is a list rather than the single
 * `customerRole` string every other app here passes.
 */
export const CREATOR_ROLE = "owner";
export const FALLBACK_ROLE = "viewer";
export const SEAT_FREE_ROLES: readonly string[] = [...BOARD_ROLES];

/**
 * The resources a tenant admin may hand out in the permission editor: this app's
 * own, without Better Auth's org-management statements (`organization`,
 * `invitation`, `team`, `ac`) which ride along on the owner role and are not
 * things anyone picks from a checklist.
 *
 * `member` is deliberately kept — managing the roster IS a grantable power here.
 */
export const GRANTABLE_RESOURCES = [
  "screen",
  "channel",
  "widget",
  "content",
  "board",
  "station",
  "member",
  "analytics",
  "billing",
  "settings",
] as const;
