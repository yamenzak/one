#!/usr/bin/env node
/**
 * ONE-SHOT: rewrite the old product name out of D1 row data, case-preserving.
 *
 *   node scripts/rename-data.mjs              # audit only — changes nothing
 *   node scripts/rename-data.mjs --apply      # perform the rewrite
 *   node scripts/rename-data.mjs --local      # against .wrangler state, not remote
 *
 * The code rename is done; this is the DATA left behind — email senders, brand
 * strings, seeded copy, anything an operator typed before the rename. It is
 * idempotent (a second run finds nothing) and safe to delete once it has run.
 *
 * ── Why this is generated rather than a hand-written .sql ────────────────────
 *
 * The schema has ~59 tables. A hand-written script means hand-listing the text
 * columns, and the column you forget is the one holding the string. So tables
 * and columns are read out of `sqlite_master` + `PRAGMA table_info` at run time:
 * whatever the schema is when you run it is what gets checked.
 *
 * Everything is batched into FOUR `wrangler` invocations (introspect, describe,
 * audit, apply). One invocation per column was the obvious way to write it and
 * is unusably slow — wrangler spends seconds on process start alone, so ~200
 * columns is ~10 minutes of startup cost to run four seconds of SQL.
 *
 * ── What it will NOT touch, and why ──────────────────────────────────────────
 *
 * Some columns are identity, not prose. Rewriting them does not rename a thing,
 * it POINTS AT A DIFFERENT THING:
 *
 *   • `organization.slug` IS a studio's address. Changing it moves the studio to
 *     a new hostname, breaking every emailed link and — because the WebAuthn RP
 *     for a custom domain is per-host — potentially its passkeys.
 *   • `tenant_domains.hostname` is matched against the live Host header and
 *     against a hostname registered with Cloudflare.
 *   • Primary keys, foreign keys and external ids (Stripe, Cloudflare) are opaque
 *     handles into another system. A local edit silently de-references.
 *
 * Those are still SEARCHED — a hit is reported, never hidden — but not written.
 * If one genuinely needs changing, do it through the product, which re-provisions
 * the subdomain and invalidates the host cache. Never with a bulk UPDATE.
 *
 * ── Case ─────────────────────────────────────────────────────────────────────
 *
 * SQLite's `replace()` is case-sensitive, so three passes cover the three forms
 * that occur in practice (MOSSA/Mossa/mossa). The audit uses LIKE, which is
 * case-INsensitive for ASCII — so anything found that the three passes would not
 * fix (e.g. `MoSsA`) is reported as needing a human. Auditing with a wider net
 * than you repair with is the point, not an inconsistency.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OLD = "mossa";
const NEW = "kova";
/** MOSSA→KOVA, Mossa→Kova, mossa→kova. */
const FORMS = [
  [OLD.toUpperCase(), NEW.toUpperCase()],
  [OLD[0].toUpperCase() + OLD.slice(1), NEW[0].toUpperCase() + NEW.slice(1)],
  [OLD, NEW],
];

const API_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "api");
const APPLY = process.argv.includes("--apply");
const TARGET = process.argv.includes("--local") ? "--local" : "--remote";

/** Columns that are identity or routing, never prose. `table.column`, lowercase. */
const NEVER_TOUCH = new Set([
  "organization.slug",
  "tenant_domains.hostname",
  "app_config.key",
]);

/** Identity-ish: a key, or the name of an external system's handle. */
function isIdentity(table, col, pk) {
  if (NEVER_TOUCH.has(`${table}.${col}`.toLowerCase())) return true;
  if (pk) return true;
  return /(^|_)id$/i.test(col) || /^stripe_/i.test(col) || /_(key|token|secret)$/i.test(col);
}

/** wrangler prints a version banner to stdout before the JSON payload. */
function jsonOnly(s) {
  const i = s.search(/^[ \t]*[[{]/m);
  return i === -1 ? "" : s.slice(i);
}

const SCRATCH = mkdtempSync(join(tmpdir(), "d1-rename-"));
process.on("exit", () => rmSync(SCRATCH, { recursive: true, force: true }));

/**
 * Run N statements in ONE wrangler call; returns one result array per statement.
 *
 * Via `--file`, not `--command`: the audit is a UNION ALL over every string
 * column in the schema, which is ~130 KB of SQL — well past the argv limit, so
 * `--command` dies with E2BIG before wrangler ever starts.
 */
function run(statements) {
  const path = join(SCRATCH, "batch.sql");
  writeFileSync(path, statements.join("\n") + "\n");
  const out = execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "execute", "DB", TARGET, "--json", "--file", path],
    { cwd: API_DIR, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
  );
  const text = jsonOnly(out);
  if (!text) throw new Error(`No JSON from wrangler. Raw output:\n${out.slice(0, 800)}`);
  return JSON.parse(text).map((r) => r.results ?? []);
}

const one = (statement) => run([statement])[0];
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const id = (s) => `"${String(s).replace(/"/g, '""')}"`;

// ── 1. Introspect ────────────────────────────────────────────────────────────
const tables = one(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;",
).map((r) => r.name);

if (!tables.length) {
  console.error("No tables found — is the database reachable? (wrangler auth; --local vs --remote)");
  process.exit(1);
}

// ── 2. Describe every table, in one call ─────────────────────────────────────
const infos = run(tables.map((t) => `PRAGMA table_info(${id(t)});`));

/** [{ table, col, identity }] for every column that can hold a string. */
const columns = [];
tables.forEach((t, i) => {
  for (const c of infos[i] ?? []) {
    const type = String(c.type ?? "").toUpperCase();
    // Only string-capable columns. An untyped column has BLOB affinity in SQLite
    // and can hold text, so "" counts as text rather than being skipped.
    if (type && !/CHAR|CLOB|TEXT|JSON/.test(type)) continue;
    columns.push({ table: t, col: c.name, identity: isIdentity(t, c.name, c.pk) });
  }
});

// ── 3. Audit — one UNION ALL across every candidate column ───────────────────
const like = `'%${OLD}%'`;
/** The expression after all three case passes; used to find what they'd MISS. */
function repaired(col) {
  let e = id(col);
  for (const [from, to] of FORMS) e = `replace(${e}, ${q(from)}, ${q(to)})`;
  return e;
}

/**
 * ONE STATEMENT PER COLUMN, all in a single file — deliberately not a UNION ALL.
 *
 * Stitching the probes together with UNION ALL is the obvious way to get one
 * result set, and D1 rejects it twice over: the full union is ~130 KB and trips
 * SQLITE_TOOBIG (a per-statement length cap), and chunking it to 20 terms then
 * trips "too many terms in compound SELECT". Both limits are per statement and
 * neither applies to the number of statements in a file, so separate statements
 * sidestep both while still costing exactly one wrangler round trip.
 */
const probe = ({ table, col }) =>
  `SELECT ${q(table)} AS t, ${q(col)} AS c, count(*) AS n, ` +
  `sum(CASE WHEN ${repaired(col)} LIKE ${like} THEN 1 ELSE 0 END) AS bad ` +
  `FROM ${id(table)} WHERE ${id(col)} LIKE ${like};`;

const auditRows = run(columns.map(probe)).flat();

const byKey = new Map(auditRows.filter((r) => Number(r.n) > 0).map((r) => [`${r.t}.${r.c}`, r]));
const hits = columns
  .map((c) => ({ ...c, ...(byKey.get(`${c.table}.${c.col}`) ?? {}) }))
  .filter((c) => Number(c.n ?? 0) > 0);

if (!hits.length) {
  console.log(`Nothing to do — no row in ${tables.length} tables contains "${OLD}".`);
  process.exit(0);
}

// A sample per hit column, so the audit shows real values rather than counts.
const samples = run(
  hits.map(({ table, col }) => `SELECT ${id(col)} AS v FROM ${id(table)} WHERE ${id(col)} LIKE ${like} LIMIT 3;`),
);

const writable = hits.filter((h) => !h.identity);
const frozen = hits.filter((h) => h.identity);
let unfixable = 0;

console.log("");
for (const [i, h] of hits.entries()) {
  const bad = Number(h.bad ?? 0);
  unfixable += h.identity ? 0 : bad;
  const flags = [h.identity ? "SKIPPED (identity)" : null, bad && !h.identity ? `${bad} odd casing` : null]
    .filter(Boolean)
    .join(", ");
  console.log(`  ${h.table}.${h.col}  ${h.n} row(s)${flags ? `  ⚠️ ${flags}` : ""}`);
  for (const s of samples[i] ?? []) console.log(`      ${String(s.v).slice(0, 160)}`);
}

console.log("");
console.log(
  `${writable.reduce((a, h) => a + Number(h.n), 0)} row(s) across ${writable.length} column(s) would be rewritten.`,
);

if (frozen.length) {
  console.log("");
  console.log("⚠️  NOT rewritten — identity/routing columns. Rewriting these repoints");
  console.log("    rather than renames; change them through the product if you mean to:");
  for (const f of frozen) console.log(`      ${f.table}.${f.col}  ${f.n} row(s)`);
}

if (unfixable) {
  console.log("");
  console.log(`⚠️  ${unfixable} row(s) hold the name in a casing the three passes`);
  console.log("    (MOSSA / Mossa / mossa) do not cover. Fix those by hand.");
}

// ── 4. Apply ─────────────────────────────────────────────────────────────────
if (!APPLY) {
  console.log("");
  console.log("Audit only — nothing was written. Re-run with --apply to perform the rewrite.");
  process.exit(0);
}

if (!writable.length) {
  console.log("");
  console.log("Nothing writable. Every hit is an identity column; see above.");
  process.exit(0);
}

run(
  writable.map(
    ({ table, col }) => `UPDATE ${id(table)} SET ${id(col)} = ${repaired(col)} WHERE ${id(col)} LIKE ${like};`,
  ),
);

console.log("");
for (const w of writable) console.log(`  ✓ ${w.table}.${w.col}`);
console.log("");
console.log("Done. Re-run without --apply to confirm it comes back clean.");
console.log("If app_config changed, the host cache can serve a stale copy for up to 60s.");
