/**
 * FINDING A RECORD BY WHAT IT MEANS — derived from one line on the collection.
 *
 * ⚠️ THE WRITE PATH TOUCHES NO NETWORK, AND THAT IS THE WHOLE SHAPE. A create or
 * an edit marks a row pending here and returns; a job carries it to the index
 * later. Indexing inline would put a retrieval service on the latency of every
 * save, make a save fail because something else was down, and — because the
 * account token is what the items API takes — put the credential that can
 * rewrite this deployment's bindings on the path of a tenant request. All three
 * are avoided by the same decision.
 *
 * ⚠️ AND THE LEDGER HOLDS A POINTER, NEVER THE TEXT. The job re-reads the record
 * at flush time, so this table cannot become a second copy of everything every
 * workspace has written — the same rule `ai_run` follows about content, for the
 * same reason.
 *
 * ⚠️ ERASURE MIRRORS `erase` EXACTLY, INCLUDING WHAT IT DOES NOT DO. A row is
 * marked gone under the same scope rule the record itself dies by, so a
 * searchable collection cannot be erased from the database and left in the
 * index — which would be a deletion request answered with the records still
 * findable, by meaning, for ever.
 *
 * ⚠️ AND `gone` IS A STATE RATHER THAN A DELETE. Removing the ledger row when
 * the record goes would lose the only handle on the remote item, so the deleted
 * record would stay searchable and nothing would ever know to remove it. The row
 * is forgotten only once the index has confirmed the item is gone.
 */

import type { CollectionSpec } from "@engine/kernel";
import { eraseBy, isSearchable, newId, searchTextOf } from "@engine/kernel";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

/* ----------------------------------------------------------------- schema --- */

export const SEARCH_SCHEMA: SchemaModule = {
  id: "search",
  statements: [
    /* ⚠️ ON THE SHARD, beside the records it mirrors. A ledger in the directory
       and rows on a shard is a pair that a move has to keep in step, and one
       that erasure would have to reach across — both of which this avoids by
       putting the pointer where the thing it points at lives. */
    `CREATE TABLE IF NOT EXISTS search_item (`
    + `id TEXT PRIMARY KEY, app_id TEXT NOT NULL, collection TEXT NOT NULL, `
    + `record_id TEXT NOT NULL, scope TEXT NOT NULL, scope_of TEXT NOT NULL, `
    + `item_key TEXT NOT NULL, state TEXT NOT NULL, at TEXT NOT NULL, detail TEXT);`,
    /* ⚠️ ONE ROW PER RECORD, ENFORCED. Without it an edit adds a second pending
       row, the job indexes the same record twice under one key, and the delete
       forgets one of the two — leaving a record that stays findable after it is
       gone. */
    `CREATE UNIQUE INDEX IF NOT EXISTS ix_search_item_of `
    + `ON search_item (app_id, collection, record_id);`,
    `CREATE INDEX IF NOT EXISTS ix_search_item_due ON search_item (state, at);`,
    `CREATE INDEX IF NOT EXISTS ix_search_item_scope ON search_item (scope_of, scope);`,
  ],
};

/* ------------------------------------------------------------------ shape --- */

/** `pending` wants sending, `gone` wants removing, `failed` says why it did not. */
export type ItemState = "pending" | "indexed" | "gone" | "failed";

export interface Item {
  readonly id: string;
  readonly appId: string;
  readonly collection: string;
  readonly recordId: string;
  readonly scope: string;
  readonly scopeOf: string;
  readonly itemKey: string;
  readonly state: ItemState;
  readonly at: string;
  readonly detail: string | null;
}

interface Row {
  readonly id: string; readonly app_id: string; readonly collection: string;
  readonly record_id: string; readonly scope: string; readonly scope_of: string;
  readonly item_key: string; readonly state: string; readonly at: string;
  readonly detail: string | null;
}

const asItem = (r: Row): Item => ({
  id: r.id, appId: r.app_id, collection: r.collection, recordId: r.record_id,
  scope: r.scope, scopeOf: r.scope_of, itemKey: r.item_key,
  state: r.state as ItemState, at: r.at, detail: r.detail,
});

/**
 * ⚠️ THE KEY IS THE ADDRESS AND THE FOLDER IS THE BOUNDARY. `folder` is a
 * built-in the index filters on, so putting the scope first makes "only this
 * workspace's records" a property of where the item IS rather than of a filter
 * somebody remembered to pass. A key shaped the other way round would leave the
 * boundary entirely to the query.
 */
export const itemKeyFor = (
  scope: string, collection: string, recordId: string,
): string => `${scope}/${collection}/${recordId}.txt`;

/** ⚠️ The trailing slash is load-bearing: `a/b` would also match `a/bc`. */
export const folderFor = (scope: string, collection: string): string => `${scope}/${collection}/`;

/**
 * ⚠️ ONE INSTANCE PER APP, NOT PER WORKSPACE, AND THE CEILING IS WHY. Every
 * account here gets a personal workspace, so an instance per workspace is a
 * design with 5,000 customers in it — and the boundary does not need one:
 * the folder is in the key, the query filters on it, and both are written by the
 * platform rather than by a handler.
 */
export const instanceFor = (deployment: string, appId: string): string =>
  `${deployment}-${appId}`.replace(/[^a-z0-9-]/g, "-");

/* ------------------------------------------------------------------ write --- */

/**
 * ⚠️ MARKED PENDING ON EVERY WRITE, INCLUDING AN EDIT THAT CHANGED NOTHING. What
 * an edit changed is not knowable here without reading the row back and
 * comparing, and the cost of re-indexing something unchanged is one job pass —
 * against a record whose text silently drifts out of the index for ever.
 */
export async function noteWritten(
  db: Db, spec: CollectionSpec, appId: string, scope: string, recordId: string, now = new Date(),
): Promise<void> {
  if (!isSearchable(spec)) return;
  const of = eraseBy(spec)?.of ?? "global";
  await db.prepare(
    `INSERT INTO search_item (id, app_id, collection, record_id, scope, scope_of,`
    + ` item_key, state, at, detail) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL)`
    + ` ON CONFLICT (app_id, collection, record_id)`
    + ` DO UPDATE SET state = 'pending', at = excluded.at, detail = NULL`)
    .bind(newId("sit", now), appId, spec.id, recordId, scope, of,
      itemKeyFor(scope, spec.id, recordId), now.toISOString()).run();
}

/**
 * ⚠️ A RECORD THAT WAS NEVER INDEXED STILL GETS A `gone` ROW, and that is not
 * waste. A create followed quickly by a delete leaves a pending row the job may
 * already have sent; marking it gone is the only instruction that is correct
 * whichever of the two happened first.
 */
export async function noteGone(
  db: Db, spec: CollectionSpec, appId: string, recordId: string, now = new Date(),
): Promise<void> {
  if (!isSearchable(spec)) return;
  await db.prepare(
    `UPDATE search_item SET state = 'gone', at = ?, detail = NULL`
    + ` WHERE app_id = ? AND collection = ? AND record_id = ?`)
    .bind(now.toISOString(), appId, spec.id, recordId).run();
}

/**
 * WHAT ERASURE DOES TO THE INDEX.
 *
 * ⚠️ IT MARKS RATHER THAN DELETES, so the job still has the key it needs to
 * remove the item. A cascade that dropped these rows would leave the erased
 * records findable by meaning with nothing anywhere pointing at them.
 *
 * ⚠️ AND IT TAKES THE SAME `of` THE RECORD ERASURE TAKES. A subject's records
 * die with the subject wherever they live; a workspace's die with the workspace.
 * Mirroring the rule rather than restating it is what stops the two drifting.
 */
export async function noteScopeGone(
  db: Db, of: "tenant" | "subject", scope: string, now = new Date(),
): Promise<number> {
  const done = await db.prepare(
    `UPDATE search_item SET state = 'gone', at = ?, detail = NULL`
    + ` WHERE scope_of = ? AND scope = ? AND state != 'gone'`)
    .bind(now.toISOString(), of, scope).run() as { meta?: { changes?: number } };
  return done?.meta?.changes ?? 0;
}

/** ⚠️ Only once the index has confirmed. See the header. */
export async function forget(db: Db, id: string): Promise<void> {
  await db.prepare(`DELETE FROM search_item WHERE id = ?`).bind(id).run();
}

export async function markIndexed(db: Db, id: string, now = new Date()): Promise<void> {
  await db.prepare(`UPDATE search_item SET state = 'indexed', at = ?, detail = NULL WHERE id = ?`)
    .bind(now.toISOString(), id).run();
}

/**
 * ⚠️ A FAILURE IS A ROW WITH A REASON, NOT A RETRY FOR EVER. `failed` is
 * terminal until something changes it, so a record whose text the index refuses
 * — too large, unreadable, a name it will not take — stops consuming a slot in
 * every pass, and appears on the console screen instead of being invisible in
 * the pending count.
 */
export async function markFailed(
  db: Db, id: string, why: string, now = new Date(),
): Promise<void> {
  await db.prepare(`UPDATE search_item SET state = 'failed', at = ?, detail = ? WHERE id = ?`)
    .bind(now.toISOString(), why.slice(0, 300), id).run();
}

/* ------------------------------------------------------------------- read --- */

export async function itemsDue(db: Db, limit = 100): Promise<readonly Item[]> {
  const rows = await db.prepare(
    `SELECT id, app_id, collection, record_id, scope, scope_of, item_key, state, at, detail`
    + ` FROM search_item WHERE state IN ('pending', 'gone') ORDER BY at ASC LIMIT ?`)
    .bind(Math.min(limit, 500)).all<Row>();
  return rows.results.map(asItem);
}

export interface IndexState {
  readonly indexed: number;
  readonly pending: number;
  readonly failed: number;
  readonly gone: number;
}

/** ⚠️ What the console screen shows: what is in, what is waiting, what refused. */
export async function indexState(db: Db): Promise<IndexState> {
  const rows = await db.prepare(
    `SELECT state, COUNT(*) AS n FROM search_item GROUP BY state`)
    .all<{ state: string; n: number }>();
  const of = (s: string) => rows.results.find((r) => r.state === s)?.n ?? 0;
  return { indexed: of("indexed"), pending: of("pending"), failed: of("failed"), gone: of("gone") };
}

/** ⚠️ The failures themselves, because a count of them is not an answer. */
export async function itemsFailed(db: Db, limit = 20): Promise<readonly Item[]> {
  const rows = await db.prepare(
    `SELECT id, app_id, collection, record_id, scope, scope_of, item_key, state, at, detail`
    + ` FROM search_item WHERE state = 'failed' ORDER BY at DESC LIMIT ?`)
    .bind(Math.min(limit, 100)).all<Row>();
  return rows.results.map(asItem);
}

/* ------------------------------------------------------------------ flush --- */

/**
 * ⚠️ WHAT THE JOB TALKS TO, INJECTED. The implementation holds the account token
 * and lives in `cloudflare.ts`, where every bound on that credential is written
 * — a second caller inherits none of them, and the suites drive this seam rather
 * than the network.
 */
export interface Index {
  put(instance: string, key: string, text: string): Promise<{ readonly ok: true } | { readonly ok: false; readonly why: string }>;
  drop(instance: string, key: string): Promise<{ readonly ok: true } | { readonly ok: false; readonly why: string }>;
}

export interface FlushDeps {
  readonly db: Db;
  readonly index: Index;
  readonly deployment: string;
  /** ⚠️ The declarations, so the text is assembled from the named fields only. */
  readonly collections: (appId: string) => readonly CollectionSpec[];
  /**
   * ⚠️ HOW A RECORD IS READ BACK, INJECTED — which is what keeps this module off
   * `records.ts`. Erasure marks the ledger from inside `erase`, so a dependency
   * the other way would be a cycle; and the flush is drivable in a test without
   * a database either way.
   */
  readonly read: (
    spec: CollectionSpec, scope: string, recordId: string,
  ) => Promise<Record<string, unknown> | null>;
  readonly now?: Date;
  readonly limit?: number;
}

export interface Flushed {
  readonly sent: number;
  readonly removed: number;
  readonly failed: number;
  readonly detail: string;
}

/**
 * CARRY EVERY PENDING RECORD TO THE INDEX, AND REMOVE EVERY GONE ONE.
 *
 * ⚠️ A RECORD THAT HAS DISAPPEARED SINCE IT WAS MARKED IS REMOVED, NOT FAILED.
 * The delete and the flush race by construction — the row can be gone by the
 * time this reads it — and treating that as an error would fill the failed list
 * with the ordinary case and leave the item in the index.
 *
 * ⚠️ AND A COLLECTION THAT STOPPED BEING SEARCHABLE IS REMOVED TOO. Deleting the
 * `searchable` line is a decision to stop copying that text out, and it has to
 * take what is already out there with it — otherwise the one action somebody
 * takes to undo indexing does everything except undo it.
 */
export async function flushIndex(deps: FlushDeps): Promise<Flushed> {
  const now = deps.now ?? new Date();
  let sent = 0, removed = 0, failed = 0;
  const said: string[] = [];

  for (const item of await itemsDue(deps.db, deps.limit ?? 100)) {
    const instance = instanceFor(deps.deployment, item.appId);
    const spec = deps.collections(item.appId).find((c) => c.id === item.collection);

    if (item.state === "gone" || !spec || !isSearchable(spec)) {
      const out = await deps.index.drop(instance, item.itemKey);
      if (out.ok) { await forget(deps.db, item.id); removed++; }
      else { await markFailed(deps.db, item.id, out.why, now); failed++; said.push(out.why); }
      continue;
    }

    const row = await deps.read(spec, item.scope, item.recordId);
    if (!row) {
      const out = await deps.index.drop(instance, item.itemKey);
      if (out.ok) { await forget(deps.db, item.id); removed++; }
      else { await markFailed(deps.db, item.id, out.why, now); failed++; }
      continue;
    }

    const text = searchTextOf(spec, row);
    /* ⚠️ A RECORD WITH NOTHING IN ITS SEARCHABLE FIELDS IS REMOVED RATHER THAN
       SENT. An empty document indexes as a chunk that matches weakly against
       everything, so it is not absent from results — it is noise in all of
       them. */
    if (!text) {
      const out = await deps.index.drop(instance, item.itemKey);
      if (out.ok) { await forget(deps.db, item.id); removed++; }
      else { await markFailed(deps.db, item.id, out.why, now); failed++; }
      continue;
    }

    const out = await deps.index.put(instance, item.itemKey, text);
    if (out.ok) { await markIndexed(deps.db, item.id, now); sent++; }
    else { await markFailed(deps.db, item.id, out.why, now); failed++; said.push(out.why); }
  }

  return {
    sent, removed, failed,
    detail: [
      sent ? `${sent} indexed` : "",
      removed ? `${removed} removed` : "",
      failed ? `${failed} refused (${said[0] ?? "no reason given"})` : "",
    ].filter(Boolean).join(", ") || "nothing to do",
  };
}

/* ----------------------------------------------------------------- search --- */

/** What the binding hands back, reduced to what a result is made of. */
interface Chunk {
  readonly score?: number;
  readonly text?: string;
  readonly item?: { readonly key?: string };
}

export interface Searcher {
  get(instance: string): {
    search(input: unknown): Promise<{ readonly chunks?: readonly Chunk[] }>;
  };
}

export interface Found {
  readonly recordId: string;
  readonly score: number;
  readonly text: string;
}

export const MAX_RESULTS = 10;

/**
 * ⚠️ THE FOLDER FILTER IS WRITTEN HERE AND NEVER BY A CALLER. It is the row-level
 * scope of the whole retrieval path: the one bound between a query and every
 * other workspace's records. A filter a handler passes is a filter a handler
 * will one day forget, and the failure is somebody else's notes in somebody
 * else's search results.
 *
 * ⚠️ AND A RESULT IS A RECORD ID, NOT A DOCUMENT. What the index holds is a copy
 * that can be a pass behind; the record is the truth, so the caller reads it
 * back from the database and the index only ever says WHICH.
 */
export async function searchIn(
  searcher: Searcher | null, deployment: string, appId: string,
  spec: CollectionSpec, scope: string, query: string, limit = MAX_RESULTS,
): Promise<readonly Found[] | "no_index" | "failed"> {
  if (!searcher) return "no_index";
  if (!query.trim()) return [];

  let answer: { readonly chunks?: readonly Chunk[] };
  try {
    answer = await searcher.get(instanceFor(deployment, appId)).search({
      query,
      ai_search_options: {
        retrieval: {
          max_num_results: Math.min(limit, MAX_RESULTS),
          filters: { type: "eq", key: "folder", value: folderFor(scope, spec.id) },
        },
      },
    });
  } catch {
    return "failed";
  }

  const seen = new Set<string>();
  const out: Found[] = [];
  for (const chunk of answer.chunks ?? []) {
    const id = recordIdIn(chunk.item?.key ?? "");
    /* ⚠️ CHUNKS ARE PER PASSAGE AND A RESULT IS PER RECORD. A long note matches
       four times and would otherwise fill the whole list on its own. */
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ recordId: id, score: chunk.score ?? 0, text: (chunk.text ?? "").slice(0, 400) });
  }
  return out;
}

/**
 * ⚠️ READ BACK OUT OF THE KEY RATHER THAN OUT OF METADATA, because the key is the
 * one thing the index cannot lose: it is how the item is addressed, so a result
 * without it could not have been written by us.
 */
export const recordIdIn = (key: string): string | null => {
  const last = key.split("/").pop() ?? "";
  const id = last.replace(/\.txt$/, "");
  return id || null;
};
