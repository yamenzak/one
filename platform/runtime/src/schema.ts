/**
 * APPLYING THE COMPOSED SCHEMA.
 *
 * `@one/kernel`'s `schema.ts` declares and validates; this applies. The split is
 * the point: every rule that makes a module safe to re-run is checked by a pure
 * function with tests, and this file may therefore assume it.
 */

import type { SchemaModule, SqlHandle } from "@one/kernel";
import { fingerprintOf, validateComposition } from "@one/kernel";

/** Where a module records what it has already applied. */
const MARKERS = `CREATE TABLE IF NOT EXISTS schema_markers (module TEXT PRIMARY KEY, ddl TEXT NOT NULL, alters TEXT NOT NULL, backfills TEXT NOT NULL, at TEXT NOT NULL);`;

interface Marker { module: string; ddl: string; alters: string; backfills: string }

export interface SchemaReport {
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
  /** Alters and backfills the database refused. See below — most are correct. */
  readonly tolerated: readonly string[];
}

export class SchemaInvalid extends Error {
  constructor(readonly problems: readonly { moduleId: string; rule: string; detail: string }[]) {
    super(`schema composition is invalid:\n${problems.map((p) => `  ${p.moduleId} [${p.rule}] ${p.detail}`).join("\n")}`);
    this.name = "SchemaInvalid";
  }
}

/**
 * Apply every module that changed, in declared order.
 *
 * ⚠️ VALIDATION RUNS FIRST AND THROWS. The failures it catches are all silent
 * ones — a duplicate table name where one module's columns simply never exist, a
 * module ordered before something it declares it needs — and a database is the
 * worst possible place to discover them, because the state left behind is not
 * the state any marker describes.
 *
 * ⚠️ A MODULE'S SECTIONS ARE APPLIED AND MARKED SEPARATELY. Editing a backfill
 * must not re-run the DDL, and a comment reflowed in the DDL must not re-run a
 * backfill — which is the same reason the fingerprint is computed per section.
 */
export async function applySchema(db: SqlHandle, modules: readonly SchemaModule[]): Promise<SchemaReport> {
  const problems = validateComposition(modules);
  if (problems.length) throw new SchemaInvalid(problems);

  await db.batch([MARKERS]);
  const rows = await db.all<Marker>(`SELECT module, ddl, alters, backfills FROM schema_markers`);
  const seen = new Map(rows.map((r) => [r.module, r]));

  const applied: string[] = [];
  const skipped: string[] = [];
  const tolerated: string[] = [];
  const now = new Date().toISOString();

  for (const m of modules) {
    const want = fingerprintOf(m);
    const have = seen.get(m.id);
    if (have && have.ddl === want.ddl && have.alters === want.alters && have.backfills === want.backfills) {
      skipped.push(m.id);
      continue;
    }

    // One call, so a batch that fails leaves nothing half-composed.
    if (!have || have.ddl !== want.ddl) await db.batch([...m.ddl]);

    /*
      ⚠️ AN ALTER AND A BACKFILL ARE TOLERATED INDIVIDUALLY, and this is the one
      place the runner swallows anything. `ADD COLUMN` on a column that already
      exists is the expected outcome of a re-run, and it is indistinguishable
      from a typo — which is exactly why `validateModule` refuses every other
      form of ALTER, and why what was tolerated is REPORTED rather than ignored.
      A swallow nobody can see is how a column silently never appears.
    */
    if (!have || have.alters !== want.alters) {
      for (const sql of m.alters ?? []) {
        try { await db.batch([sql]); } catch { tolerated.push(`${m.id}: ${sql.slice(0, 60)}`); }
      }
    }
    if (!have || have.backfills !== want.backfills) {
      for (const b of m.backfills ?? []) {
        try { await db.batch([b.sql]); } catch { tolerated.push(`${m.id}/${b.id}`); }
      }
    }

    await db.run(
      `INSERT INTO schema_markers (module, ddl, alters, backfills, at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(module) DO UPDATE SET ddl = excluded.ddl, alters = excluded.alters, backfills = excluded.backfills, at = excluded.at`,
      m.id, want.ddl, want.alters, want.backfills, now,
    );
    applied.push(m.id);
  }

  return { applied, skipped, tolerated };
}
