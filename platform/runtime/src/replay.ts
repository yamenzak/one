/**
 * A WRITE THAT ARRIVES TWICE AND LANDS ONCE.
 *
 * ⚠️ THIS IS WHAT MAKES A PHONE IN A BASEMENT WORK. An app that queues a failed
 * write and replays it when the signal comes back has no way to know whether the
 * first attempt reached us — the answer is what went missing, not the request —
 * so it replays, and without this the set is logged twice. Nothing throws; the
 * person simply did more than they did.
 *
 * ⚠️ AND ONLY THE CALLER CAN SAY TWO ATTEMPTS ARE ONE INTENT. Deduplicating on
 * the CONTENT would be wrong in the other direction: three sets of ten really is
 * three identical rows, and a gym is the place somebody does the same thing twice
 * on purpose. So the key comes from whoever is retrying, which is exactly what
 * `client-supplied` means and why it is a mode rather than a default.
 *
 * ⚠️ `natural` IS A DIFFERENT CLAIM AND NEEDS NO TABLE. It says the operation is
 * idempotent by its own construction — publishing a plan that is published,
 * deleting a row that is deleted — so a repeat is already harmless. Caching
 * those would be worse than doing nothing: two genuine edits to the same row
 * carry the same natural key, and the second would be answered with the first
 * one's result and never applied.
 */

import type { Instant, SchemaModule, SqlHandle } from "@one/kernel";

export const REPLAY_SCHEMA: SchemaModule = {
  id: "replay",
  ddl: [
    /*
      ⚠️ THE ACTOR IS PART OF THE KEY. Two people whose apps mint keys the same
      way — a timestamp, a counter, a device id somebody reused — must not be
      able to swallow each other's writes, and "our clients generate UUIDs" is a
      property of a client we do not control.
    */
    `CREATE TABLE IF NOT EXISTS replays (tenant_id TEXT NOT NULL, actor_id TEXT NOT NULL, operation TEXT NOT NULL, key TEXT NOT NULL, answer TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (tenant_id, actor_id, operation, key));`,
    `CREATE INDEX IF NOT EXISTS idx_replays_at ON replays(at);`,
  ],
  scoped: { tenantColumn: "tenant_id", tenantTables: ["replays"] },
};

/** ⚠️ Bounded, because it arrives in a header from an untrusted client. */
export const MAX_REPLAY_KEY = 100;

export interface Replayed { readonly answer: unknown }

/**
 * What this caller was told the first time, if there was one.
 *
 * ⚠️ THE STORED ANSWER, NOT A BARE "ALREADY DONE". A replay has to be
 * indistinguishable from the original for the client that lost the first
 * response — it is waiting for the id of the row it just created, and answering
 * `{ok:true}` instead leaves it holding a set it cannot refer to.
 */
export async function replayed(
  db: SqlHandle, tenantId: string, actorId: string, operation: string, key: string,
): Promise<Replayed | null> {
  const row = await db.first<{ answer: string }>(
    `SELECT answer FROM replays WHERE tenant_id = ? AND actor_id = ? AND operation = ? AND key = ?`,
    tenantId, actorId, operation, key,
  ).catch(() => null);
  if (!row) return null;
  try { return { answer: JSON.parse(row.answer) as unknown }; } catch { return null; }
}

/**
 * Remember what this attempt was answered.
 *
 * ⚠️ ONLY AFTER THE HANDLER SUCCEEDED. Recording the key first would turn a
 * write that failed halfway into one nobody can retry — the client asks again
 * with the same key and is told, truthfully, that we have seen it, and falsely,
 * that it worked.
 *
 * ⚠️ AND A FAILURE TO REMEMBER IS NOT A FAILURE OF THE WRITE. The row is already
 * there; throwing here would report a successful change as an error and invite
 * the very retry this table exists to absorb.
 */
export async function remember(
  db: SqlHandle, tenantId: string, actorId: string, operation: string, key: string, answer: unknown, at: Instant,
): Promise<void> {
  await db.run(
    `INSERT INTO replays (tenant_id, actor_id, operation, key, answer, at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, actor_id, operation, key) DO NOTHING`,
    tenantId, actorId, operation, key, JSON.stringify(answer ?? null), at,
  ).catch(() => undefined);
}

/** The key a caller supplied, bounded and trimmed. Empty means they supplied none. */
export const replayKeyOf = (header: string | null): string => (header ?? "").trim().slice(0, MAX_REPLAY_KEY);

/**
 * ⚠️ THE HEADER, NOT A FIELD IN THE BODY. It is metadata about the ATTEMPT
 * rather than part of what is being written — the same reasoning that puts a
 * content type in a header — and putting it in the body would mean every
 * operation's declared input shape grew a field the manifest never mentioned.
 */
export const REPLAY_HEADER = "idempotency-key";
