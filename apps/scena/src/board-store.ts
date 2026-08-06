/**
 * Board config (D1) + scoped Station credentials (KV) — BLUEPRINT §20, §26.
 *
 * A board's live state lives in its DO; these are the config rows and the
 * controller credentials. A Station is NOT a user account (tenancy stays single-
 * user, §4): it's a board-scoped token whose only capability is pushing state to
 * the board(s) it's authorized for. Least-privilege — a station reaches only the
 * boards explicitly granted to it.
 */

import { ensureSchema, DEMO_TENANT } from "./db.js";
import type { BoardKind } from "@scena/protocol";

export interface BoardRow {
  id: string;
  tenant_id: string;
  kind: BoardKind;
  name: string;
  config_json: string;
  created_at: number;
}

export async function createBoard(
  db: D1Database,
  input: { id: string; kind: BoardKind; name: string; config: unknown; tenantId?: string },
): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare("INSERT INTO boards (id, tenant_id, kind, name, config_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(input.id, input.tenantId ?? DEMO_TENANT, input.kind, input.name, JSON.stringify(input.config ?? {}), Date.now())
    .run();
}

export async function listBoards(db: D1Database, tenantId = DEMO_TENANT): Promise<BoardRow[]> {
  await ensureSchema(db);
  const res = await db.prepare("SELECT * FROM boards WHERE tenant_id = ? ORDER BY created_at DESC").bind(tenantId).all<BoardRow>();
  return res.results ?? [];
}

export async function getBoard(db: D1Database, id: string): Promise<BoardRow | null> {
  await ensureSchema(db);
  return db.prepare("SELECT * FROM boards WHERE id = ?").bind(id).first<BoardRow>();
}

/** Shallow-merge keys into a board's config_json (drops undefined values). */
export async function updateBoardConfig(db: D1Database, id: string, patch: Record<string, unknown>): Promise<void> {
  await ensureSchema(db);
  const board = await getBoard(db, id);
  if (!board) return;
  let cfg: Record<string, unknown> = {};
  try {
    cfg = JSON.parse(board.config_json) as Record<string, unknown>;
  } catch {
    /* start fresh */
  }
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) cfg[k] = v;
  await db.prepare("UPDATE boards SET config_json = ? WHERE id = ?").bind(JSON.stringify(cfg), id).run();
}

/* ------------------------------- stations --------------------------------- */

interface StationGrant {
  name: string;
  boardIds: string[];
}

const stationKey = (token: string) => `station:${token}`;

/** Mint a board-scoped station token (§20). Persistent, unlike the QR remote. */
export async function mintStation(kv: KVNamespace, boardIds: string[], name: string): Promise<string> {
  const token = `stn_${randomToken()}`;
  const grant: StationGrant = { name, boardIds };
  await kv.put(stationKey(token), JSON.stringify(grant));
  return token;
}

export async function stationGrant(kv: KVNamespace, token: string): Promise<StationGrant | null> {
  const raw = await kv.get(stationKey(token));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StationGrant;
  } catch {
    return null;
  }
}

/** A station may act on a board only if that board is in its granted set. */
export async function stationCanControl(kv: KVNamespace, token: string, boardId: string): Promise<boolean> {
  const grant = await stationGrant(kv, token);
  return !!grant && grant.boardIds.includes(boardId);
}

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
