/**
 * COMPOSED SCHEMA — how several packages can own tables in one D1 database.
 *
 * Every 4DL app runs on a single D1. Auth needs its tables, billing needs its
 * tables, the app needs its own, and none of them may know about the others. So
 * a package does not "run migrations": it EXPORTS a `SchemaModule` describing the
 * DDL it owns, and the app composes the modules in dependency order and hands the
 * list to `applySchema`.
 *
 * ── Why a per-module marker ─────────────────────────────────────────────────
 *
 * Kova's original runner kept ONE `schema_version` row that short-circuited all
 * 66 tables, 40 indexes and 52 ALTERs. Two consequences, both real:
 *
 *  • Any DDL change anywhere re-ran everything — ~110 statements against live D1.
 *  • Forgetting to bump it made a new table INVISIBLE on a fresh database and
 *    fatal on an existing one, because the marker skipped the block that would
 *    have created it. That shipped once (`steps_logs`) and 500'd every route
 *    touching it.
 *
 * A marker per module fixes the first and shrinks the second to one module. The
 * version still has to be bumped — nothing can detect intent — but the blast
 * radius is now the package that changed, and `schemaStatements()` makes the
 * change auditable in a test rather than at runtime.
 *
 * ── The three kinds of statement, and why they are not one list ─────────────
 *
 *   ddl             tables and indexes, idempotent by construction
 *                   (`IF NOT EXISTS`), in one ordered list because an index
 *                   belongs next to the table it covers. Batched into a single
 *                   `exec`, which is one round-trip instead of ~110.
 *   alters          `ADD COLUMN` is NOT idempotent — it errors when the column is
 *                   already there. That specific error is expected and swallowed;
 *                   ANY OTHER error is a real migration failure and must abort,
 *                   because carrying on would mark the module applied while a
 *                   column every write needs is missing.
 *   backfills       data corrections, best-effort. A backfill that fails must not
 *                   block the schema — it is a repair, not a precondition, and
 *                   its own WHERE guard makes it a no-op once satisfied.
 *
 * ── Ordering ────────────────────────────────────────────────────────────────
 *
 * Modules apply in array order and the app owns that order. SQLite does not
 * enforce foreign keys here, so cross-module references do not *require* an
 * order — but a module whose backfill reads another module's table does, so the
 * rule is simply: dependencies first, the app last.
 */

import type { HasDb } from "./bindings.js";

/** The `app_config` table the marker rows live in. Owned by this module, and the
 *  one piece of DDL that must exist before anything can be read. */
const BOOTSTRAP = "CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT);";

/** Marker key for a module. Prefixed so a `LIKE 'schema:%'` sweep finds them all
 *  without reading the rest of an app's configuration. */
export const schemaMarkerKey = (id: string): string => `schema:${id}`;

/**
 * A data correction that runs after this module's DDL. Best-effort by design —
 * see the header. Give it a name so a failure is attributable in the log.
 */
export interface SchemaBackfill {
  name: string;
  sql: string;
}

/**
 * Which rows in this module's tables belong to a tenant, and which belong to an
 * individual subject within one (a client, a patient, an employee — the app's
 * word, not ours).
 *
 * This is what makes erasure derivable. Kova's purge kept two hand-written table
 * inventories that had to be maintained in step with the DDL by hand, with a
 * comment asking future readers to do so; declaring the scope next to the DDL
 * that creates the table means a new table cannot be forgotten by a cascade.
 */
export interface SchemaScope {
  /** Column tying a row to a tenant (usually `tenant_id`). */
  tenantColumn?: string;
  /** Tables carrying that column. */
  tenantTables?: readonly string[];
  /** Column tying a row to one subject inside a tenant (e.g. `client_id`). */
  subjectColumn?: string;
  /** Tables carrying that column. */
  subjectTables?: readonly string[];
}

/** The DDL one package owns. */
export interface SchemaModule {
  /** Stable id — the marker key. Never rename: a rename orphans the marker and
   *  silently re-applies the whole module. */
  id: string;
  /** Bump whenever `ddl`, `alters` or `backfills` change. */
  version: string;
  /** `CREATE TABLE/INDEX IF NOT EXISTS`, in application order. */
  ddl?: readonly string[];
  alters?: readonly string[];
  backfills?: readonly SchemaBackfill[];
  scoped?: SchemaScope;
}

/**
 * Every idempotent statement a module applies, in application order.
 *
 * Exposed so a package can assert its own DDL in a unit test — including the
 * assertion that an extraction did not change a single statement, which is the
 * only cheap way to move schema between packages safely.
 */
export function schemaStatements(m: SchemaModule): readonly string[] {
  return m.ddl ?? [];
}

/** Thrown when a module's ALTERs fail for a reason other than "already there". */
export class SchemaMigrationError extends Error {
  constructor(
    public moduleId: string,
    public failures: string[],
  ) {
    super(`schema module "${moduleId}": ${failures.length} migration failure(s)`);
    this.name = "SchemaMigrationError";
  }
}

/** `ADD COLUMN` on a column that is already there. Expected on every re-run. */
const isDuplicateColumn = (msg: string): boolean => /duplicate column/i.test(msg);

async function readMarkers(db: D1Database): Promise<Map<string, string>> {
  const rows = await db
    .prepare("SELECT key, value FROM app_config WHERE key LIKE 'schema:%'")
    .all<{ key: string; value: string }>()
    .catch(() => ({ results: [] as { key: string; value: string }[] }));
  return new Map((rows.results ?? []).map((r) => [r.key, r.value]));
}

/**
 * D1's `exec` takes several statements in one string. Joined with a SPACE rather
 * than a newline, which is what Kova has shipped since the beginning and what the
 * integration suite exercises on every run — a newline join would have D1 treat
 * each line as its own statement, which is *also* valid but is a behaviour change
 * with nothing to gain. The invariant a module must respect either way: no
 * statement may contain a `--` line comment (it would swallow the rest of the
 * batch) or an embedded newline.
 */
const DDL_JOIN = " ";

async function applyModule(db: D1Database, m: SchemaModule): Promise<void> {
  const ddl = schemaStatements(m);
  if (ddl.length) await db.exec(ddl.join(DDL_JOIN));

  const failures: string[] = [];
  for (const sql of m.alters ?? []) {
    try {
      await db.exec(sql);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isDuplicateColumn(msg)) continue;
      failures.push(`${sql.slice(0, 64)} → ${msg}`);
    }
  }
  if (failures.length) {
    console.error(`[schema:${m.id}] migration failures:`, failures);
    throw new SchemaMigrationError(m.id, failures);
  }

  for (const b of m.backfills ?? []) {
    await db
      .prepare(b.sql)
      .run()
      .catch((e: unknown) => {
        console.warn(`[schema:${m.id}] backfill "${b.name}" skipped:`, e instanceof Error ? e.message : e);
      });
  }

  // The marker is stamped LAST and only on a fully-applied module, so a run that
  // died halfway retries on the next request rather than being recorded as done.
  await db
    .prepare("INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(schemaMarkerKey(m.id), m.version)
    .run()
    .catch(() => undefined);
}

/**
 * Apply every module whose recorded version differs from its declared one.
 *
 * Idempotent and safe to call on every cold start: a database already at every
 * module's version costs exactly one `CREATE TABLE IF NOT EXISTS` and one SELECT.
 */
export async function applySchema(db: D1Database, modules: readonly SchemaModule[]): Promise<void> {
  const seen = new Set<string>();
  for (const m of modules) {
    if (seen.has(m.id)) throw new Error(`duplicate schema module id "${m.id}"`);
    seen.add(m.id);
  }

  await db.exec(BOOTSTRAP);
  const markers = await readMarkers(db);

  for (const m of modules) {
    if (markers.get(schemaMarkerKey(m.id)) === m.version) continue;
    await applyModule(db, m);
  }
}

/**
 * Cache `applySchema` for the isolate's lifetime, retrying on failure.
 *
 * Workers re-enter the module scope per isolate, not per request, so this turns
 * ~110 statements into one promise every cold start. A rejection clears the
 * cache so the next request tries again instead of inheriting a broken schema
 * for as long as the isolate lives.
 */
export function schemaGate(modules: readonly SchemaModule[]): (env: HasDb) => Promise<void> {
  let ready: Promise<void> | null = null;
  return (env: HasDb) => {
    if (!ready) {
      ready = applySchema(env.DB, modules).catch((err) => {
        ready = null;
        throw err;
      });
    }
    return ready;
  };
}
