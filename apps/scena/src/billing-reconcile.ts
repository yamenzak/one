/**
 * THE ONE-WAY MIGRATION THAT LETS SCENA ADOPT `BILLING_SCHEMA`.
 *
 * Scena was built outside the platform and shipped four tables whose NAMES match
 * `@4dl/billing`'s and whose COLUMNS do not:
 *
 *   plans          `price_cents INTEGER` + `currency` + `interval` + `sort`
 *                  against `price_usd_month REAL` + `ord`
 *   credit_packs   the same pair again
 *   credit_ledger  `created_at` against `at`
 *   subscriptions  the same five timestamp columns, holding EPOCH MILLISECONDS
 *                  where the shared shape holds ISO-8601 text
 *
 * A `CREATE TABLE IF NOT EXISTS` is won by whichever module runs first and the
 * loser's columns silently never exist, so the shared module could not simply be
 * added to the list. That is why `SCHEMA_MODULES` carried a paragraph explaining
 * its absence for four stages.
 *
 * ── Why this is a function and not a `SchemaModule` ─────────────────────────
 *
 * A module's `backfills` are plain SQL, and every statement here names a column
 * that exists on exactly ONE of the two shapes. `UPDATE plans SET price_usd_month
 * = price_cents / 100.0` does not fail to MATCH on a database created after the
 * migration — it fails to PARSE, because `price_cents` is not there. The runner
 * swallows that with a warning, so the migration would work, and every fresh
 * deployment and every test isolate would print ten alarming lines about columns
 * that are correctly absent. Noise that is expected is noise nobody reads.
 *
 * Reading the actual column set first turns each step into a decision instead of
 * an attempt: `PRAGMA table_info` on a table that does not exist returns no rows,
 * so a fresh database skips every step in silence and pays four small reads once
 * per isolate.
 *
 * ── Why it runs BEFORE `applySchema` and not after ─────────────────────────
 *
 * This is the `AI_LEGACY_RESET` lesson, and it is the same failure exactly.
 * `BILLING_SCHEMA` declares `CREATE INDEX IF NOT EXISTS idx_ledger_tenant ON
 * credit_ledger(tenant_id, at)`. On a pre-migration database `credit_ledger` has
 * `created_at` and no `at`, so that index fails with `no such column: at`, the
 * whole `db.exec` throws, `applySchema` throws with it, and EVERY route that
 * touches D1 answers 500. Not a degraded feature — a total outage, on the one
 * kind of database this migration exists for.
 *
 * So the columns are moved into place first, and only then is the shared module
 * allowed to build its indexes over them.
 *
 * ── What it will not do ────────────────────────────────────────────────────
 *
 * It never DROPS the legacy columns. Nothing reads them after this change, they
 * cost nothing, and `ALTER TABLE … DROP COLUMN` against a live table to reclaim
 * four bytes a row is a risk taken for tidiness. A database that has been through
 * this carries both sets; a fresh one carries only the shared set, which is the
 * shape everything is written against.
 */

/** Shared column ← legacy column, per table. `value` is SQL over the legacy row. */
const COLUMN_MOVES = [
  { table: "plans", to: "price_usd_month", type: "REAL", from: "price_cents", value: "price_cents / 100.0" },
  { table: "plans", to: "ord", type: "INTEGER", from: "sort", value: "sort" },
  { table: "credit_packs", to: "price_usd", type: "REAL", from: "price_cents", value: "price_cents / 100.0" },
  { table: "credit_packs", to: "ord", type: "INTEGER", from: "sort", value: "sort" },
  // Both are epoch milliseconds. This one really is only a rename.
  { table: "credit_ledger", to: "at", type: "INTEGER", from: "created_at", value: "created_at" },
] as const;

/**
 * The five columns that changed REPRESENTATION rather than name.
 *
 * ⚠️ This is the half that would have failed silently and expensively. SQLite
 * types are per-value, so a millisecond integer sits perfectly happily in a
 * column the shared DDL declares TEXT — and then `sub.past_due_at + graceMs` is
 * string concatenation, `past_due_at < ?` compares a number against ISO text,
 * and a workspace is either never suspended or suspended immediately. Nothing
 * throws anywhere.
 */
const MS_TO_ISO_COLUMNS = ["current_period_end", "past_due_at", "suspend_at", "delete_at", "updated_at"] as const;

/**
 * `strftime` with a millisecond-precision seconds field, which is byte-identical
 * to what `Date.prototype.toISOString` produces — the format every other 4DL app
 * has in these columns, and the one ISO's lexicographic ordering makes safe to
 * compare with `<` in SQL.
 */
const ISO = (col: string) => `strftime('%Y-%m-%dT%H:%M:%fZ', ${col} / 1000.0, 'unixepoch')`;

async function columnsOf(db: D1Database, table: string): Promise<Set<string>> {
  const rows = await db.prepare("SELECT name FROM pragma_table_info(?)").bind(table).all<{ name: string }>();
  return new Set((rows.results ?? []).map((r) => r.name));
}

/**
 * Bring a pre-platform Scena database to `BILLING_SCHEMA`'s column shape.
 *
 * Idempotent, and idempotent in the strong sense: every step is guarded by the
 * state it produces, so a half-finished run resumes rather than double-applying.
 * The millisecond conversions are guarded on `typeof(col)` being numeric, which
 * is what stops a second run from re-interpreting an ISO string as an epoch.
 *
 * Returns the steps it applied, in order — an empty array on a database that was
 * already the shared shape, which is every fresh one. The return value exists so
 * a test can assert what happened; nothing in the app reads it.
 *
 * ⚠️ A failure THROWS. It is tempting to make a migration best-effort, and it is
 * wrong here: the caller runs `applySchema` next, whose indexes need these
 * columns, and carrying on would trade a loud failure at boot for a silent one
 * in the dunning ladder a month later.
 */
export async function reconcileLegacyBilling(db: D1Database): Promise<string[]> {
  const applied: string[] = [];
  const cols = new Map<string, Set<string>>();
  const columns = async (t: string): Promise<Set<string>> => {
    let c = cols.get(t);
    if (!c) cols.set(t, (c = await columnsOf(db, t)));
    return c;
  };

  for (const m of COLUMN_MOVES) {
    const have = await columns(m.table);
    // No legacy column means a fresh database, which is already correct. The
    // shared column already present means a previous run got this far.
    if (!have.has(m.from) || have.has(m.to)) continue;
    await db.exec(`ALTER TABLE ${m.table} ADD COLUMN ${m.to} ${m.type}`);
    await db.prepare(`UPDATE ${m.table} SET ${m.to} = ${m.value} WHERE ${m.to} IS NULL`).run();
    have.add(m.to);
    applied.push(`${m.table}.${m.from} → ${m.to}`);
  }

  const subs = await columns("subscriptions");
  for (const col of MS_TO_ISO_COLUMNS) {
    if (!subs.has(col)) continue;
    const res = await db.prepare(`UPDATE subscriptions SET ${col} = ${ISO(col)} WHERE typeof(${col}) IN ('integer', 'real')`).run();
    if (res.meta.changes > 0) applied.push(`subscriptions.${col} ms → ISO (${res.meta.changes})`);
  }

  return applied;
}
