#!/usr/bin/env node
/**
 * ASK A LIVE D1 SOMETHING, AND NEVER FAIL QUIETLY.
 *
 * ⚠️ THIS EXISTS BECAUSE `wrangler d1 execute --json` PUTS ITS ERRORS WHERE ITS
 * ANSWERS GO. Every caller captures that stdout — into a shell variable, into a
 * file, through a pipe — so a query that was refused writes its refusal into the
 * capture, the step exits 1, and the log holds NOTHING. A verification step whose
 * failure is invisible is worse than no verification: it reads as "something went
 * wrong somewhere" and the next person re-runs it. Here the streams are read
 * rather than redirected, so a refusal is printed in full, once, with the query
 * that caused it.
 *
 * ⚠️ AND D1'S OWN TABLES CANNOT BE COUNTED. Every D1 database carries internal
 * tables under `_cf_` — they appear in `sqlite_master` like any other, and every
 * query against one is refused. So a table list built from `sqlite_master` and
 * used to count rows asks a question that cannot be answered, on every database,
 * always. `sqlite_%` is excluded for the same reason plus one more: SQLite
 * maintains `sqlite_sequence` for AUTOINCREMENT and its contents legitimately
 * differ between two databases holding identical rows.
 *
 * Usage:
 *   node engine/scripts/d1.mjs <database> "<sql>"   → the rows, as wrangler shapes them
 *   node engine/scripts/d1.mjs --counts <database>  → one {t,n} row per table
 */

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/* ⚠️ THE ONE PLACE THE EXCLUSION IS WRITTEN. A second copy in a workflow is a
   second answer, and the one that is wrong is the one nothing runs. */
export const TABLES =
  "SELECT name FROM sqlite_master WHERE type='table'"
  + " AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'";

/** ⚠️ `--json` answers an ARRAY of results, one per statement, each with its own
    `results`. Reading `[0]` blindly reads the first statement's answer as every
    statement's answer. */
export const rowsIn = (said) =>
  (Array.isArray(said) ? said : [said]).flatMap((one) => one?.results ?? []);

/**
 * What wrangler said, or why this cannot be believed. Pure, so the refusals are
 * testable without an account: `{ rows }` or `{ refused }`.
 */
export function answer({ code, stdout, stderr }) {
  const both = [stdout, stderr].filter(Boolean).join("\n").trim();
  const at = stdout.indexOf("[");
  if (code !== 0) {
    return { refused: `wrangler exited ${code}. It said:\n${both || "(nothing)"}` };
  }
  if (at < 0) {
    return {
      refused: "wrangler exited 0 and answered no rows at all.\n"
        + `It said:\n${both || "(nothing)"}`,
    };
  }
  let said;
  try {
    said = JSON.parse(stdout.slice(at));
  } catch (e) {
    return { refused: `wrangler's answer is not JSON (${e.message}). It said:\n${both}` };
  }
  return { rows: rowsIn(said) };
}

/**
 * One count per table, from the table list the database itself reports.
 *
 * ⚠️ SEPARATE STATEMENTS, NEVER ONE `UNION ALL`. SQLite caps the terms in a
 * compound SELECT and D1's ceiling is well under the number of tables a real
 * deployment has — 36 was refused outright with `too many terms in compound
 * SELECT`. Statements have no such limit (the import beside this one runs 365 of
 * them), and `--json` answers one result per statement, which is the shape
 * `rowsIn` already flattens. A union here is a verification that stops working
 * as the schema grows, which is the moment it is most needed.
 */
export const countsFor = (names) =>
  names
    .map((n) => `SELECT ${JSON.stringify(n)} AS t, COUNT(*) AS n FROM ${JSON.stringify(n)};`)
    .join("\n");

/* ------------------------------------------------------------------- run --- */

const ask = (db, sql) => {
  const ran = spawnSync(
    "pnpm",
    ["exec", "wrangler", "d1", "execute", db, "--remote", "--json", "--command", sql],
    { encoding: "utf8" },
  );
  const got = answer({
    code: ran.status ?? 1,
    stdout: ran.stdout ?? "",
    stderr: ran.stderr ?? "",
  });
  if (got.refused) {
    console.error(`BAD  ${db}: ${got.refused}\n\nThe query was:\n${sql}`);
    process.exit(1);
  }
  return got.rows;
};

/* Nothing below runs on import — the guard reads the pure half. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const counts = args[0] === "--counts";
  const db = counts ? args[1] : args[0];
  const sql = counts ? null : args[1];
  if (!db || (!counts && !sql)) {
    console.error('usage: d1.mjs <database> "<sql>"   |   d1.mjs --counts <database>');
    process.exit(2);
  }
  const rows = counts
    ? (() => {
        const names = ask(db, TABLES).map((r) => r.name).filter(Boolean);
        if (!names.length) {
          console.error(`BAD  ${db}: reported no tables at all. An empty database still`
            + " has its schema, so this is a query that failed.");
          process.exit(1);
        }
        return ask(db, countsFor(names));
      })()
    : ask(db, sql);
  /* ⚠️ PRINTED IN WRANGLER'S OWN SHAPE, so `copied.mjs` reads one format whether
     it was handed a capture or this. */
  process.stdout.write(JSON.stringify([{ results: rows }]));
}
