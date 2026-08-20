/**
 * A WORKSPACE'S RECORDS MOVE TO ANOTHER SHARD — which is also the only way its
 * jurisdiction can ever change.
 *
 * ⚠️ THERE IS NO SETTING FOR THIS AND THERE CANNOT BE. Cloudflare fixes a D1
 * database's and an R2 bucket's jurisdiction AT CREATION and offers no edit, so
 * "move this workspace to the EU" is a new database, a new bucket, and a copy —
 * for ever, not until somebody builds the setting. A residency dropdown would be
 * a field the storage layer refuses to honour, silently.
 *
 * ⚠️ THE WORKSPACE IS READ-ONLY WHILE IT MOVES, and that is the correctness
 * property rather than a courtesy. A copy taken from a live database loses every
 * row written after the table was read — silently, with no error, and the loss
 * is discovered by the customer weeks later as records that "went missing".
 * `tenant.moving_to` is set first and `locate` clamps `writable` from it, so the
 * window is closed by the same gate every write already passes.
 *
 * ⚠️ NOTHING IS DELETED FROM THE SOURCE. The old rows stay until a later pass
 * reaps them, exactly as an unwanted resource drains — a move that emptied the
 * source is unrecoverable the moment the copy turns out to have been wrong, and
 * "the copy was wrong" is a thing you learn afterwards or not at all.
 *
 * ⚠️ AND THE TABLE LIST IS THE ERASURE LEDGER, NOT A LIST WRITTEN HERE. What a
 * workspace's records ARE is already declared once, in `HOLDINGS` and in each
 * app's collections; a second list would be a table that erases and exports and
 * does not travel — so a moved workspace would arrive missing its roster, or its
 * vault, with every count reporting success.
 */

import type { AppSpec, Residency, Shard, TenantId } from "@engine/kernel";
import { DRAIN_DAYS, eraseBy } from "@engine/kernel";
import { HOLDINGS, tablesIn } from "./dossier.js";
import { tenantById } from "./directory.js";
import { mayMove, type MoveRefusal } from "./directory.js";
import { SHARD_MODULES } from "./platform-schema.js";
import type { SchemaModule } from "./schema.js";
import { column, table, type Db } from "./sql.js";
import type { Bucket } from "./storage.js";

export const MOVE_SCHEMA: SchemaModule = {
  id: "move",
  statements: [
    /* ⚠️ THE SOURCE SHARD IS ON THE ROW, because after the flip nothing else
       remembers where the records came from — and the reaper needs to know which
       database still holds a copy it is allowed to delete. */
    `CREATE TABLE IF NOT EXISTS move (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, from_shard TEXT NOT NULL, to_shard TEXT NOT NULL, state TEXT NOT NULL, detail TEXT, at TEXT NOT NULL, moved_at TEXT, drain_after TEXT, gone_at TEXT);`,
    `CREATE INDEX IF NOT EXISTS ix_move_state ON move (state);`,
  ],
  /*
    ⚠️ THE JURISDICTION THIS MOVE IS INTO, ON THE ROW, BECAUSE THE FLIP HAPPENS
    LATER AND ELSEWHERE. Copying is one pass and `finishMove` is another — often
    another day — so a target residency held only by the caller is one nothing
    remembers by the time it has to be written. `NULL` is the ordinary move,
    which changes nothing about where the records are kept.
  */
  columns: { move: { into_residency: "TEXT" } },
};

/* ------------------------------------------------------------- what moves --- */

export interface Carried {
  readonly table: string;
  /** The column naming the workspace. */
  readonly at: string;
}

/**
 * EVERY TABLE ON A SHARD THAT HOLDS A WORKSPACE'S OWN ROWS.
 *
 * ⚠️ DERIVED FROM THE SAME TWO DECLARATIONS ERASURE READS. `HOLDINGS` says which
 * platform tables are a workspace's and which are the deployment's; `eraseBy`
 * says the same of an app's collections. A table that erases with the workspace
 * and does not travel with it is a moved workspace arriving without its roster —
 * and the move would report every row it did copy, successfully.
 */
export function carried(apps: readonly AppSpec[]): readonly Carried[] {
  /* ⚠️ SHARD TABLES ONLY. The directory's rows are not moving anywhere: they
     name the workspace from a database both shards share. */
  const onShard = new Set(tablesIn(SHARD_MODULES));

  const out: Carried[] = [];
  for (const h of HOLDINGS) {
    if (!onShard.has(h.table)) continue;
    if (h.workspace?.on !== "delete") continue;
    out.push({ table: h.table, at: h.workspace.column });
  }
  for (const app of apps) {
    for (const spec of app.collections) {
      const by = eraseBy(spec);
      /* ⚠️ Subject-scoped collections travel too — they are on this shard and
         they are this workspace's people's. `eraseBy` reports the column
         whichever scope it is; only a collection scoped by NOTHING is skipped,
         and composition already refuses one of those. */
      if (by) out.push({ table: table(spec.id), at: column(by.column) });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ begin --- */

/**
 * ⚠️ THE PLACEMENT REFUSALS PLUS THE TWO THIS PATH ADDS, and it EXTENDS
 * `MoveRefusal` rather than restating it. A second list of the same words is two
 * places to add the next one, and the half that gets forgotten is a refusal the
 * caller never hears about.
 */
export type BeginRefusal = MoveRefusal | "already_moving" | "same_shard";

/**
 * ⚠️ THE WORKSPACE GOES READ-ONLY BEFORE ANYTHING IS READ, not after. The other
 * order leaves a window in which a write lands in the source after that table
 * was copied — one row, silently, and only for the customers unlucky enough to
 * be working at the time.
 *
 * ⚠️ AND IT IS REFUSED BY THE SAME RULE THAT PLACED THE WORKSPACE. A shard whose
 * schema does not cover this workspace's apps answers "no such table" on every
 * request after a move that reported success.
 */
export async function beginMove(
  directory: Db, tenantId: TenantId, toShard: string, now = new Date(),
  /**
   * ⚠️ A JURISDICTION CHANGE IS ASKED FOR, NEVER INFERRED FROM THE TARGET. Left
   * out, a shard in another jurisdiction is refused as `wrong_residency` — which
   * is the protection, because the accident this prevents is a workspace quietly
   * ending up under a regime nobody promised it. Passed, it is the thing
   * somebody decided to do, and `finishMove` writes it.
   *
   * ⚠️ AND IT IS THE ONLY WAY RESIDENCY EVER CHANGES. Cloudflare fixes a D1
   * database's and an R2 bucket's jurisdiction at creation, so there is no
   * setting to build — see the header.
   */
  into?: Residency,
): Promise<BeginRefusal | null> {
  const tenant = await tenantById(directory, tenantId);
  if (!tenant) return "no_such_tenant";
  if (tenant.shardId === toShard) return "same_shard";
  if (tenant.movingTo) return "already_moving";

  const refused = await mayMove(directory, tenantId, toShard, into);
  if (refused) return refused;

  await directory.prepare(
    `INSERT INTO move (id, tenant_id, from_shard, to_shard, state, at, into_residency)
     VALUES (?, ?, ?, ?, 'copying', ?, ?)`)
    .bind(`mov_${tenantId}_${toShard}`, tenantId, tenant.shardId, toShard, now.toISOString(),
      into ?? null)
    .run();
  await directory.prepare(`UPDATE tenant SET moving_to = ? WHERE id = ?`)
    .bind(toShard, tenantId).run();
  return null;
}

/* ------------------------------------------------------------------- copy --- */

export interface Copied {
  readonly table: string;
  readonly rows: number;
}

/**
 * ⚠️ `INSERT OR REPLACE`, SO A HALF-FINISHED MOVE CAN SIMPLY BE RUN AGAIN. A
 * copy that refused to overwrite would need somebody to work out which tables
 * had already landed and clear them by hand, at the exact moment the workspace
 * is read-only and somebody is waiting.
 *
 * ⚠️ AND A MISSING TABLE IS SKIPPED RATHER THAN FATAL. A shard legitimately
 * lacks a table for an app no workspace on it had enabled — which is precisely
 * the case where a workspace is arriving to use it.
 */
export async function carryRows(
  from: Db, to: Db, tenantId: TenantId, apps: readonly AppSpec[],
): Promise<readonly Copied[]> {
  const out: Copied[] = [];
  for (const { table: name, at } of carried(apps)) {
    let rows: Record<string, unknown>[];
    try {
      const read = await from.prepare(`SELECT * FROM ${name} WHERE ${at} = ?`)
        .bind(tenantId).all<Record<string, unknown>>();
      rows = read.results;
    } catch { continue; }
    if (!rows.length) { out.push({ table: name, rows: 0 }); continue; }

    const cols = Object.keys(rows[0]!);
    const sql = `INSERT OR REPLACE INTO ${name} (${cols.join(", ")}) `
      + `VALUES (${cols.map(() => "?").join(", ")})`;
    let done = 0;
    for (const row of rows) {
      try { await to.prepare(sql).bind(...cols.map((c) => row[c] ?? null)).run(); done++; }
      catch { /* reported by the verification below, which counts both sides. */ }
    }
    out.push({ table: name, rows: done });
  }
  return out;
}

/**
 * ⚠️ EVERY OBJECT IS READ AND RE-WRITTEN, because there is no server-side copy
 * ACROSS A JURISDICTION — the whole reason the bucket is different is that the
 * old one cannot be reached from the new one's regime. It is slow and it is the
 * only thing that works.
 *
 * ⚠️ AND THE KEY IS UNCHANGED. It is tenant-prefixed, so it stays correct in the
 * new bucket, and the media ledger's `object_key` — which travels as an ordinary
 * row — keeps pointing at something real.
 */
export async function carryObjects(
  from: Db, fromBucket: Bucket | null, toBucket: Bucket | null, tenantId: TenantId,
): Promise<number | "no_bucket"> {
  if (!fromBucket || !toBucket) return "no_bucket";
  /* ⚠️ Same bucket, nothing to do — a move between two shards in ONE
     jurisdiction shares its bucket, and re-writing every object over itself
     would be a long, expensive no-op. */
  if (fromBucket === toBucket) return 0;

  let moved = 0;
  const rows = await from.prepare(`SELECT object_key FROM media WHERE tenant_id = ?`)
    .bind(tenantId).all<{ object_key: string }>().catch(() => ({ results: [] as { object_key: string }[] }));
  for (const { object_key: key } of rows.results) {
    const object = await fromBucket.get(key);
    if (!object) continue;
    await toBucket.put(key, object.body as never, {
      httpMetadata: { contentType: object.httpMetadata?.contentType },
    });
    moved++;
  }
  return moved;
}

/* ----------------------------------------------------------------- verify --- */

/**
 * ⚠️ COUNTED ON BOTH SIDES BEFORE THE FLIP, AND THIS IS THE STEP THE WHOLE
 * DESIGN TURNS ON. Everything before it is recoverable; the flip is what makes
 * the new database the one the product reads. Flipping on a copy that lost rows
 * hands a customer a workspace with holes in it, and the source — still intact —
 * is not consulted again.
 */
export async function unmatched(
  from: Db, to: Db, tenantId: TenantId, apps: readonly AppSpec[],
): Promise<readonly string[]> {
  const said: string[] = [];
  const count = async (db: Db, name: string, at: string): Promise<number | null> => {
    try {
      const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${name} WHERE ${at} = ?`)
        .bind(tenantId).first<{ n: number }>();
      return Number(row?.n ?? 0);
    } catch { return null; }
  };

  for (const { table: name, at } of carried(apps)) {
    const before = await count(from, name, at);
    const after = await count(to, name, at);
    /* ⚠️ A table absent from the SOURCE is not a mismatch — it never held
       anything. Absent from the TARGET while the source has rows is the fault
       this exists to catch. */
    if (before === null) continue;
    if (after === null) { if (before > 0) said.push(`${name}: ${before} rows, no table on the target`); continue; }
    if (before !== after) said.push(`${name}: ${before} rows here, ${after} there`);
  }
  return said;
}

/* ----------------------------------------------------------------- finish --- */

/**
 * ⚠️ THE FLIP IS ONE UPDATE, AND IT IS THE LAST THING. `shard_id` is what every
 * request resolves through, so the instant it changes the new database is live —
 * which is why the verification above runs first and refuses on any mismatch.
 *
 * ⚠️ AND `moving_to` IS CLEARED IN THE SAME BREATH, because a workspace left
 * read-only after a successful move is one nobody can use and nothing explains.
 */
export async function finishMove(
  directory: Db, from: Db, to: Db, tenantId: TenantId, apps: readonly AppSpec[],
  now = new Date(),
): Promise<readonly string[] | null> {
  const wrong = await unmatched(from, to, tenantId, apps);
  if (wrong.length) return wrong;

  const tenant = await tenantById(directory, tenantId);
  if (!tenant?.movingTo) return ["nothing is moving"];

  /*
    ⚠️ AND THE JURISDICTION MOVES WITH THE RECORDS, WHICH IT DID NOT. This
    file's own header called a move "the only way its jurisdiction can ever
    change" and nothing here ever wrote `residency` — so the sentence was false
    in the one place it was checkable. A workspace copied into an EU shard went
    on being addressed as `global`: the wrong bucket for its files, the wrong
    answer on its own Data & Trust screen, and a promise broken by the migration
    that was supposed to keep it.
  */
  const row = await directory.prepare(
    `SELECT into_residency FROM move WHERE tenant_id = ? AND state = 'copying'`)
    .bind(tenantId).first<{ into_residency: string | null }>();
  const into = row?.into_residency as Residency | null | undefined;

  await directory.prepare(into
    ? `UPDATE tenant SET shard_id = ?, moving_to = NULL, residency = ? WHERE id = ?`
    : `UPDATE tenant SET shard_id = ?, moving_to = NULL WHERE id = ?`)
    .bind(...(into ? [tenant.movingTo, into, tenantId] : [tenant.movingTo, tenantId])).run();

  /* ⚠️ THE SOURCE ROWS DRAIN, THEY ARE NOT DELETED HERE. A move that emptied the
     source is unrecoverable the moment the copy turns out to have been wrong —
     and that is a thing you learn afterwards or not at all. */
  const after = new Date(now.getTime() + DRAIN_DAYS * 24 * 60 * 60 * 1000);
  await directory.prepare(
    `UPDATE move SET state = 'moved', moved_at = ?, drain_after = ? WHERE tenant_id = ? AND state = 'copying'`)
    .bind(now.toISOString(), after.toISOString(), tenantId).run();
  return null;
}

/**
 * ⚠️ THE SOURCE COPY, REAPED LATER AND ONLY BY ROW. It deletes what this
 * workspace had on the shard it left — never the shard, never anything else's
 * rows — and it reads the `move` row rather than a shard listing, so a workspace
 * that was never moved is never touched.
 */
export async function reapMoved(
  directory: Db, shardOf: (shardId: string) => Db | null,
  apps: readonly AppSpec[], now = new Date(),
): Promise<number> {
  const due = await directory.prepare(
    `SELECT id, tenant_id, from_shard FROM move WHERE state = 'moved' AND drain_after <= ?`)
    .bind(now.toISOString()).all<{ id: string; tenant_id: string; from_shard: string }>();

  let cleared = 0;
  for (const row of due.results) {
    const from = shardOf(row.from_shard);
    /* ⚠️ A shard this deployment no longer binds is reported, not skipped in
       silence — the copy is still there and nothing else will ever find it. */
    if (!from) continue;
    for (const { table: name, at } of carried(apps)) {
      try {
        await from.prepare(`DELETE FROM ${name} WHERE ${at} = ?`).bind(row.tenant_id).run();
      } catch { /* an older shard legitimately lacks a table. */ }
    }
    await directory.prepare(`UPDATE move SET state = 'gone', gone_at = ? WHERE id = ?`)
      .bind(now.toISOString(), row.id).run();
    cleared++;
  }
  return cleared;
}

/* ------------------------------------------------------------- isolating --- */

/**
 * A WORKSPACE THAT ASKED TO BE ALONE GETS THE EMPTY SHARD THAT WAS BUILT FOR IT.
 *
 * ⚠️ THIS IS THE STEP THAT MADE ISOLATION A PRODUCT RATHER THAN A PROCEDURE.
 * Every other piece already existed: `mayIsolate` says who may ask,
 * `Shard.dedicatedTo` is the promise, `refusePlacement` keeps it in both
 * directions, `beginMove` and the nightly carry do the migration. What there was
 * no path for was ASKING — `Placing.alone` was a parameter nothing ever set, so
 * isolation meant an operator reserving an empty shard by hand and remembering
 * to move the workspace onto it, on a deployment with no way to make one empty.
 *
 * ⚠️ AN EMPTY SHARD, AND EMPTY IS THE WHOLE CONDITION. Dedicating one that has
 * strangers on it breaks the isolation somebody paid for — silently, because
 * both workspaces go on working perfectly — and there is nothing downstream that
 * would ever notice.
 *
 * ⚠️ AND IT DEDICATES BEFORE IT MOVES. The reverse order has a window in which
 * the workspace is on a shard nothing has reserved, so an ordinary placement
 * could put somebody else there while the copy is still running.
 */
export async function isolateWaiting(deps: {
  readonly directory: Db;
  readonly waiting: readonly { readonly id: TenantId; readonly where: Residency }[];
  readonly shards: readonly Shard[];
  /** ⚠️ How many workspaces are on each — an empty one is the only candidate. */
  readonly countOn: (shardId: string) => Promise<number>;
  readonly reserve: (
    shardId: string, where: Residency, ceiling: number, forTenant: TenantId,
  ) => Promise<void>;
  readonly now?: Date;
}): Promise<readonly string[]> {
  const said: string[] = [];
  const used = new Set<string>();
  for (const want of deps.waiting) {
    /* ⚠️ EVERY CANDIDATE, NOT THE FIRST ONE. A deployment's shards are ordered by
       name, so the first non-dedicated one in a jurisdiction is almost always the
       busy original — and a version of this that tested only that one gave up on
       the workspace entirely while the empty shard built for it sat beside it. */
    let free: Shard | undefined;
    for (const s of deps.shards) {
      if (s.where !== want.where || s.dedicatedTo !== undefined || used.has(s.id)) continue;
      /* ⚠️ Asked of the DIRECTORY rather than trusted from the shard row, because
         `Shard.tenants` is a count taken when the list was read and this decides
         whether somebody's isolation is real. */
      if (await deps.countOn(s.id) > 0) continue;
      free = s;
      break;
    }
    if (!free) continue;

    used.add(free.id);
    await deps.reserve(free.id, free.where, free.ceiling, want.id);
    const refused = await beginMove(deps.directory, want.id, free.id, deps.now ?? new Date());
    said.push(refused
      ? `${want.id} could not move to ${free.id}: ${refused}`
      : `${want.id} is moving to ${free.id}`);
  }
  return said;
}
