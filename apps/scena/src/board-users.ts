/**
 * Board-scoped users (§boards) — the replacement for public station/kiosk tokens.
 *
 * Every board is provisioned a **coordinator** (controls the whole board) plus
 * one **station** user per option (a room to flip, a counter to call from, a
 * competitor to score). Each is an ordinary Better Auth credential account with
 * an auto-issued 6-char username + 6-char password, a restricted board role, and
 * a `board_users` row binding it to its board (and station). They sign in through
 * the normal username+password form and land on their scoped control surface.
 * When the board is deleted, its users vanish with it.
 *
 * The plaintext password is stored on the `board_users` row so the admin can hand
 * the credentials to staff (these are low-privilege, board-only accounts); the
 * verifying hash lives in `account`, exactly like any other credential login.
 */
import { hashPassword } from "better-auth/crypto";
import type { BoardRole } from "./access.js";
import { usernameTaken, randomHandle } from "./members.js";
import type { BoardRow } from "./board-store.js";

/** Non-routable suffix marking an auto-provisioned board account. */
const BOARD_DOMAIN = "@bd.scena";

export interface BoardUserRow {
  id: string;
  tenant_id: string;
  board_id: string;
  station_id: string | null; // null = coordinator
  kind: "coordinator" | "station";
  label: string;
  user_id: string;
  username: string;
  password: string;
  created_at: number;
}

export interface BoardOption {
  id: string;
  label: string;
}

const str = (v: unknown, f = ""): string => (typeof v === "string" ? v : v == null ? f : String(v));

function rid(prefix: string): string {
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);
  return `${prefix}_${[...buf].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function parseConfig(json: string): Record<string, unknown> {
  try { return JSON.parse(json) as Record<string, unknown>; } catch { return {}; }
}

/** The controllable options of a board (one station user each), per kind. */
export function boardOptions(kind: string, config: Record<string, unknown>): BoardOption[] {
  const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
  if (kind === "room") return arr(config.rooms).map((r) => ({ id: str(r.id), label: str(r.name) || str(r.id) })).filter((o) => o.id);
  if (kind === "queue") {
    const counters = arr(config.counters);
    const src = counters.length ? counters : [{ id: "c1", name: "Counter 1" }];
    return src.map((c) => ({ id: str(c.id), label: str(c.name) || str(c.id) })).filter((o) => o.id);
  }
  if (kind === "score") return arr(config.sides).map((s) => ({ id: str(s.id), label: str(s.name) || str(s.id) })).filter((o) => o.id);
  return [];
}

/** A 6-char handle guaranteed unique across all accounts (retries, then widens). */
async function uniqueHandle(db: D1Database): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const u = randomHandle(6);
    if (!(await usernameTaken(db, u))) return u;
  }
  return randomHandle(9);
}

/** Provision one board user (coordinator when stationId is null). */
export async function provisionBoardUser(
  db: D1Database,
  opts: { orgId: string; boardId: string; stationId: string | null; label: string },
): Promise<{ userId: string; username: string; password: string }> {
  const username = await uniqueHandle(db);
  const password = randomHandle(6);
  const email = `${username}${BOARD_DOMAIN}`;
  const role: BoardRole = opts.stationId ? "board_station" : "board_coordinator";
  const now = new Date().toISOString();
  const userId = rid("usr"), accountId = rid("acc"), memberId = rid("mem"), buId = rid("bu");
  const hash = await hashPassword(password);
  await db.batch([
    db.prepare('INSERT INTO "user" (id, name, email, username, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1, ?, ?)').bind(userId, opts.label, email, username, now, now),
    db.prepare('INSERT INTO "account" (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(accountId, userId, "credential", userId, hash, now, now),
    db.prepare('INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)').bind(memberId, opts.orgId, userId, role, now),
    db.prepare('INSERT INTO board_users (id, tenant_id, board_id, station_id, kind, label, user_id, username, password, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(buId, opts.orgId, opts.boardId, opts.stationId, opts.stationId ? "station" : "coordinator", opts.label, userId, username, password, Date.now()),
  ]);
  return { userId, username, password };
}

export async function listBoardUsers(db: D1Database, boardId: string): Promise<BoardUserRow[]> {
  const rs = await db.prepare("SELECT * FROM board_users WHERE board_id = ? ORDER BY kind DESC, created_at ASC").bind(boardId).all<BoardUserRow>();
  return rs.results ?? [];
}

/** Reconcile a board's users to its current options: ensure a coordinator, add a
 *  station user for every new option, drop users for removed ones, keep labels
 *  fresh. Called on board create + whenever the option set changes. */
export async function syncBoardUsers(db: D1Database, orgId: string, board: BoardRow): Promise<void> {
  const rows = await listBoardUsers(db, board.id);
  if (!rows.some((r) => r.kind === "coordinator")) {
    await provisionBoardUser(db, { orgId, boardId: board.id, stationId: null, label: "Coordinator" });
  }
  const options = boardOptions(board.kind, parseConfig(board.config_json));
  const byStation = new Map(rows.filter((r) => r.kind === "station" && r.station_id).map((r) => [r.station_id as string, r]));
  for (const o of options) {
    const existing = byStation.get(o.id);
    if (!existing) await provisionBoardUser(db, { orgId, boardId: board.id, stationId: o.id, label: o.label });
    else if (existing.label !== o.label) await db.prepare("UPDATE board_users SET label = ? WHERE id = ?").bind(o.label, existing.id).run();
  }
  const keep = new Set(options.map((o) => o.id));
  for (const r of rows) if (r.kind === "station" && r.station_id && !keep.has(r.station_id)) await deleteBoardUserRow(db, r);
}

/** Delete one board user completely (user + account + member + session + row). */
async function deleteBoardUserRow(db: D1Database, row: BoardUserRow): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM "session" WHERE userId = ?').bind(row.user_id),
    db.prepare('DELETE FROM "account" WHERE userId = ?').bind(row.user_id),
    db.prepare('DELETE FROM "member" WHERE userId = ?').bind(row.user_id),
    db.prepare('DELETE FROM "user" WHERE id = ?').bind(row.user_id),
    db.prepare("DELETE FROM board_users WHERE id = ?").bind(row.id),
  ]);
}

/** Remove every user of a board (called when the board is deleted). */
export async function deleteBoardUsers(db: D1Database, boardId: string): Promise<void> {
  for (const r of await listBoardUsers(db, boardId)) await deleteBoardUserRow(db, r);
}

/** Regenerate a board user's password (admin action). Returns the new code. */
export async function regenerateBoardUserPassword(db: D1Database, boardId: string, userRowId: string): Promise<string | null> {
  const row = await db.prepare("SELECT * FROM board_users WHERE id = ? AND board_id = ?").bind(userRowId, boardId).first<BoardUserRow>();
  if (!row) return null;
  const password = randomHandle(6);
  const hash = await hashPassword(password);
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE \"account\" SET password = ?, updatedAt = ? WHERE userId = ? AND providerId = 'credential'").bind(hash, now, row.user_id),
    db.prepare("UPDATE board_users SET password = ? WHERE id = ?").bind(password, row.id),
    db.prepare('DELETE FROM "session" WHERE userId = ?').bind(row.user_id), // force re-login
  ]);
  return password;
}

/** The board scope of a signed-in user (for post-login routing), or null if the
 *  user isn't a board account. */
export async function boardUserScope(db: D1Database, userId: string): Promise<{ boardId: string; stationId: string | null; kind: string; label: string } | null> {
  const row = await db.prepare("SELECT board_id, station_id, kind, label FROM board_users WHERE user_id = ?").bind(userId).first<{ board_id: string; station_id: string | null; kind: string; label: string }>();
  return row ? { boardId: row.board_id, stationId: row.station_id, kind: row.kind, label: row.label } : null;
}

/** May this signed-in user operate this board (optionally this station)? A
 *  coordinator may operate any station on their board; a station only its own. */
export async function boardUserCanControl(db: D1Database, userId: string, boardId: string, stationId?: string | null): Promise<boolean> {
  const row = await db.prepare("SELECT kind, station_id FROM board_users WHERE user_id = ? AND board_id = ?").bind(userId, boardId).first<{ kind: string; station_id: string | null }>();
  if (!row) return false;
  if (row.kind === "coordinator") return true;
  return !stationId || row.station_id === stationId;
}
