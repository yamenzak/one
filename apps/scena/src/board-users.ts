/**
 * Board-scoped users (§boards) — the replacement for public station/kiosk tokens.
 *
 * Every board is provisioned a **coordinator** (controls the whole board) plus
 * one **station** user per option (a room to flip, a counter to call from, a
 * competitor to score). Each is a Better Auth credential account with an
 * auto-issued 6-char handle + 6-char code, a restricted board role, and a
 * `board_users` row binding it to its board (and station). When the board is
 * deleted, its users vanish with it.
 *
 * ⚠️ THESE ARE THE ONLY ACCOUNTS ON THIS PLATFORM THAT HOLD A PASSWORD.
 *
 * Every other 4DL app is passwordless for people, and Scena is too: staff are
 * invited by email and sign in with a code or a passkey. A station is not a
 * person — it is a shared device at a counter, operated by whoever is standing
 * there, dozens of times an hour. `@4dl/auth` makes that distinction checkable
 * rather than conventional: the account's address is synthetic and non-routable
 * (`<handle>@bd.scena` — `STATION_DOMAIN`), `isStationPrincipal` is the one
 * place it is asked, and `packages/auth/test/station-credentials.test.ts`
 * asserts the lane stays opt-in. Mint an account here with a ROUTABLE address
 * and you have quietly given a human being a password.
 *
 * ⚠️ THE CODE IS SHOWN ONCE AND NEVER STORED.
 *
 * It used to be kept in plaintext on the `board_users` row, and four routes
 * returned it, so an admin could re-read a station's credentials at any time.
 * The reasoning was that these are low-privilege board-only accounts — which is
 * true and is not the point. A plaintext credential column means one D1 read
 * hands an attacker working logins for every station in every tenant, and
 * "low-privilege" here still means calling tickets and flipping room status on
 * a public screen. It is also the finding that ends any security review.
 *
 * The distribution problem it was solving is real, and `regenerateBoardUserPassword`
 * already solved it: issue a new code, show it once, hand it over. So creation
 * and regeneration both RETURN the code, nothing persists it, and an admin who
 * loses one regenerates rather than looks it up. The verifying hash lives in
 * `account`, exactly like any other credential login.
 */
import { hashPassword } from "better-auth/crypto";
import type { BoardRole } from "./access.js";
import { STATION_DOMAIN } from "./auth.js";
import { randomHandle } from "./members.js";
import type { BoardRow } from "./board-store.js";

/**
 * ⚠️ `password` is ALWAYS NULL on a row read back. It is typed as nullable so a
 * caller cannot accidentally ship it, and it exists at all only because the
 * column does. Read it and you get nothing; the code is returned by
 * `createBoardUser` / `regenerateBoardUserPassword` and nowhere else.
 */
export interface BoardUserRow {
  id: string;
  tenant_id: string;
  board_id: string;
  station_id: string | null; // null = coordinator
  kind: "coordinator" | "station";
  label: string;
  user_id: string;
  username: string;
  password: null;
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

/**
 * A 6-char handle guaranteed unique across all accounts (retries, then widens).
 *
 * Uniqueness is asked of `"user".email`, which is where it is actually ENFORCED
 * — the column is `TEXT UNIQUE` in `@4dl/auth`'s schema. It used to be asked of
 * a separate `"user".username` column that Scena added, so the question and the
 * constraint were two different things and could disagree; the address is
 * derived from the handle, so one answers for both.
 */
async function uniqueHandle(db: D1Database): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const u = randomHandle(6);
    const taken = await db
      .prepare('SELECT 1 AS x FROM "user" WHERE email = ?')
      .bind(`${u}${STATION_DOMAIN}`)
      .first<{ x: number }>();
    if (!taken) return u;
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
  const email = `${username}${STATION_DOMAIN}`;
  const role: BoardRole = opts.stationId ? "board_station" : "board_coordinator";
  const now = new Date().toISOString();
  const userId = rid("usr"), accountId = rid("acc"), memberId = rid("mem"), buId = rid("bu");
  const hash = await hashPassword(password);
  await db.batch([
    // No `username` column: `@4dl/auth` owns `"user"` and the handle lives in
    // the synthetic address, which is the unique one.
    db.prepare('INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)').bind(userId, opts.label, email, now, now),
    db.prepare('INSERT INTO "account" (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(accountId, userId, "credential", userId, hash, now, now),
    db.prepare('INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)').bind(memberId, opts.orgId, userId, role, now),
    // `password` is intentionally absent from this INSERT — the column survives
    // only so an existing row can be nulled (see the schema backfill). The code
    // is returned to the caller and never written.
    db.prepare('INSERT INTO board_users (id, tenant_id, board_id, station_id, kind, label, user_id, username, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(buId, opts.orgId, opts.boardId, opts.stationId, opts.stationId ? "station" : "coordinator", opts.label, userId, username, Date.now()),
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
    // Nulled, not rewritten: regeneration is the one moment the code exists in
    // the clear, and it leaves in the return value.
    db.prepare("UPDATE board_users SET password = NULL WHERE id = ?").bind(row.id),
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
