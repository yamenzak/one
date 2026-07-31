/**
 * ERASURE, DERIVED — the delete cascade comes from the schema, not from a list.
 *
 * A purge has to name every table that holds a row belonging to the thing being
 * erased. Kova kept three hand-written inventories for that, each with a comment
 * asking the next reader to keep them in step with the DDL. They did not stay in
 * step, and the way they failed is the reason this module exists:
 *
 *   • the delete loop interpolates the TABLE but hard-codes the COLUMN, so a
 *     table whose key column was renamed produced `DELETE FROM x WHERE client_id
 *     = ?` → "no such column" → swallowed by the purge's own `.catch()`. The row
 *     survived erasure and nothing was reported. It happened twice: once when
 *     commerce renamed `client_id` to `subject_id`, and again — unnoticed until
 *     this module was written — for `ai_generations` and `media_assets`.
 *   • a table added later (`offboard_requests`) was simply never added to any of
 *     the three lists, so it survived a client purge, a tenant purge AND the
 *     platform nuclear reset.
 *
 * Both are invisible at runtime by construction. So the lists are gone: a module
 * declares `scoped` next to the DDL that creates the table, this derives the
 * cascade from those declarations, and `undeclaredScopes` / `impossibleSteps`
 * turn the two failures above into test failures.
 */

import type { SchemaModule } from "@4dl/core";

/** One `DELETE FROM <table> WHERE <column> = ?`, and who declared it. */
export interface CascadeStep {
  table: string;
  column: string;
  /** The module id — so a failure names the package that owns the table. */
  module: string;
}

const dedupe = (steps: readonly CascadeStep[]): readonly CascadeStep[] => {
  const seen = new Set<string>();
  return steps.filter((s) => {
    const k = `${s.table}|${s.column}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/**
 * Every table a TENANT teardown must clear, in module order.
 *
 * A module that owns platform-wide rows — a plan catalog, a model list — simply
 * leaves them out of `tenantTables`, which is the whole reason the declaration
 * sits beside the DDL instead of being inferred from the presence of a
 * `tenant_id` column. `undeclaredScopes` is where the inference lives, as a
 * check with an explicit exemption list rather than as the source of truth.
 */
export function tenantCascade(modules: readonly SchemaModule[]): readonly CascadeStep[] {
  return dedupe(
    modules.flatMap((m) => {
      const col = m.scoped?.tenantColumn;
      if (!col) return [];
      return (m.scoped?.tenantTables ?? []).map((table) => ({ table, column: col, module: m.id }));
    }),
  );
}

/**
 * Every table one SUBJECT's erasure must clear — a client, a patient, an
 * employee, whatever the app calls the individual inside a tenant.
 */
export function subjectCascade(modules: readonly SchemaModule[]): readonly CascadeStep[] {
  return dedupe(
    modules.flatMap((m) => {
      const col = m.scoped?.subjectColumn;
      if (!col) return [];
      return (m.scoped?.subjectTables ?? []).map((table) => ({ table, column: col, module: m.id }));
    }),
  );
}

/**
 * The columns a module's statements actually declare, per table.
 *
 * Parsed from the DDL rather than from a live database so the checks below run
 * as ordinary unit tests, with no D1 and no fixtures. It reads `CREATE TABLE`
 * bodies and `ALTER TABLE … ADD COLUMN` — the only two shapes the runner
 * permits, asserted by each app's schema-module test.
 */
export function moduleColumns(m: SchemaModule): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (table: string, col: string) => {
    const set = out.get(table) ?? new Set<string>();
    set.add(col);
    out.set(table, set);
  };
  for (const sql of m.ddl ?? []) {
    const head = /^CREATE TABLE IF NOT EXISTS "?(\w+)"?\s*\((.*)\);?$/s.exec(sql);
    if (!head) continue;
    const [, table, body] = head as unknown as [string, string, string];
    // Column definitions are `<name> <TYPE> …`, comma-separated at depth 0. The
    // type keyword is what distinguishes them from a trailing table constraint
    // (`PRIMARY KEY (a, b)`, `UNIQUE (…)`), whose parenthesised column list would
    // otherwise read as declarations.
    for (const c of body.matchAll(/(?:^|,)\s*"?(\w+)"?\s+(?:TEXT|INTEGER|REAL|BLOB|NUMERIC)\b/gi)) {
      add(table, c[1]!);
    }
  }
  for (const sql of m.alters ?? []) {
    const alter = /^ALTER TABLE "?(\w+)"? ADD COLUMN "?(\w+)"?/.exec(sql);
    if (alter) add(alter[1]!, alter[2]!);
  }
  return out;
}

/** A table/column pair the cascade is wrong about, and why. */
export interface ScopeGap {
  module: string;
  table: string;
  column: string;
  reason: string;
}

const format = (g: ScopeGap): string => `${g.module}: ${g.table}.${g.column} — ${g.reason}`;

/** Render gaps for a test-failure message. */
export const formatGaps = (gaps: readonly ScopeGap[]): string => gaps.map(format).join("\n");

/**
 * Every column name the composed modules use as a scope, deduped.
 *
 * DERIVED rather than a constant, which matters more than it looks: a hard-coded
 * list would have to name the app's word for an individual — `client_id`,
 * `patient_id`, `employee_id` — and a shared package may not know that word. It
 * also makes the check follow a rename automatically, instead of quietly
 * checking a column nobody uses any more.
 */
export function scopeColumns(modules: readonly SchemaModule[]): readonly string[] {
  const cols = new Set<string>();
  for (const m of modules) {
    if (m.scoped?.tenantColumn) cols.add(m.scoped.tenantColumn);
    if (m.scoped?.subjectColumn) cols.add(m.scoped.subjectColumn);
  }
  return [...cols];
}

/**
 * Tables that carry a scope column but appear in no `scoped` declaration.
 *
 * This is the check that makes a forgotten table impossible to ship quietly. It
 * over-reports by design — a platform catalog row keyed by `tenant_id` for
 * reporting is a legitimate exemption — so it takes an `exempt` list, which is
 * the same ratchet shape the boundary checker uses: an entry is a decision
 * somebody wrote down, not an omission nobody noticed.
 */
export function undeclaredScopes(
  modules: readonly SchemaModule[],
  opts: { columns?: readonly string[]; exempt?: readonly string[] } = {},
): ScopeGap[] {
  const columns = opts.columns ?? scopeColumns(modules);
  const exempt = new Set(opts.exempt ?? []);
  const gaps: ScopeGap[] = [];
  for (const m of modules) {
    const declared = new Set<string>([
      ...(m.scoped?.tenantTables ?? []).map((t) => `${t}|${m.scoped?.tenantColumn}`),
      ...(m.scoped?.subjectTables ?? []).map((t) => `${t}|${m.scoped?.subjectColumn}`),
    ]);
    for (const [table, cols] of moduleColumns(m)) {
      for (const col of columns) {
        if (!cols.has(col)) continue;
        const key = `${table}.${col}`;
        if (declared.has(`${table}|${col}`) || exempt.has(key)) continue;
        gaps.push({
          module: m.id,
          table,
          column: col,
          reason: `carries ${col} but no scoped declaration clears it — add it to the module's scoped lists, or exempt it with a reason`,
        });
      }
    }
  }
  return gaps;
}

/**
 * Cascade steps whose column the table does not actually have.
 *
 * The counterpart to `undeclaredScopes`, and the one that catches a RENAME. The
 * resulting DELETE raises "no such column", which a purge swallows along with
 * every other error it must tolerate (a table that legitimately does not exist
 * yet on an old database), so the erasure silently keeps the row.
 */
export function impossibleSteps(modules: readonly SchemaModule[]): ScopeGap[] {
  const columns = new Map<string, Set<string>>();
  for (const m of modules) {
    for (const [table, cols] of moduleColumns(m)) {
      const merged = columns.get(table) ?? new Set<string>();
      for (const c of cols) merged.add(c);
      columns.set(table, merged);
    }
  }
  const check = (steps: readonly CascadeStep[]): ScopeGap[] =>
    steps.flatMap((s) => {
      const cols = columns.get(s.table);
      if (!cols) return [{ ...s, reason: "no module creates this table" }];
      if (cols.has(s.column)) return [];
      return [{ ...s, reason: `the table has no ${s.column} column — the DELETE would be a swallowed no-op` }];
    });
  return [...check(tenantCascade(modules)), ...check(subjectCascade(modules))];
}

/** A statement runner. Errors are the caller's to decide about — a purge
 *  tolerates "no such table" on an old database and nothing else. */
export type CascadeExec = (sql: string, id: string) => Promise<void>;

/**
 * Run a cascade for one id.
 *
 * The table and column are INTERPOLATED, which is safe here and only here: both
 * come from a `SchemaModule` declared in code, never from a request. The id is
 * bound. Both are quoted anyway — Better Auth's tables are quoted throughout its
 * own DDL, and a package cannot know which identifiers a future app will pick.
 */
export async function applyCascade(steps: readonly CascadeStep[], id: string, exec: CascadeExec): Promise<void> {
  for (const s of steps) await exec(`DELETE FROM "${s.table}" WHERE "${s.column}" = ?`, id);
}

/** Every table any cascade touches — for a full wipe (`DELETE FROM <t>`), where
 *  the scope column is irrelevant because everything goes. */
export function cascadeTables(modules: readonly SchemaModule[]): readonly string[] {
  const all = [...tenantCascade(modules), ...subjectCascade(modules)].map((s) => s.table);
  return [...new Set(all)];
}
