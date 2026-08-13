/**
 * A TABLE IN THE STORE EVERY WORKER SHARES IS KEYED BY WHOSE IT IS.
 *
 * ⚠️ THE GLOBAL STORE IS ONE PHYSICAL DATABASE FOR EVERY PRODUCT, and that is
 * the design rather than an accident — it is what makes an account, its
 * credits, its subscriptions and its vault span products, and what lets ONE
 * webhook settle a payment whichever worker it arrives at. PLAN.md §2.4 is the
 * argument.
 *
 * ⚠️ SO EVERY TABLE IN IT IS ABOUT SOMEBODY, AND FOUR WERE ABOUT NOBODY. Found
 * 2026-08-13, all four invisible because nothing under `platform/` deploys and
 * each suite binds a store of its own:
 *
 *   `tenant_directory`  a slug UNIQUE across the deployment, so the second
 *                       product could not have a workspace at a name the first
 *                       one used — a signup that fails over a business the
 *                       person has never heard of
 *   `app_config`        "this app's own store" was every app's store, so a key
 *                       declared `shared: false` PRECISELY because it is
 *                       per-app was one row for all of them
 *   `plan_override`     one operator repricing `pro` repriced every product
 *                       that named a plan `pro`
 *   `job_run`           "has `sweep` run today" was answered by whichever
 *                       product swept first, so the others silently skipped
 *
 * Every one of them typechecked, passed every suite, and would have appeared on
 * the day a second product shipped.
 *
 * ⚠️ AND THE EXEMPTION IS A SENTENCE, NOT A LIST HERE. A table genuinely about
 * the deployment — the maintenance switch, a globally-unique provider event id —
 * says so at its own DDL. That keeps the decision next to the thing it is about,
 * where the next person adding a column will read it, rather than in a file they
 * have no reason to open.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

let bad = 0;
const fail = (m) => { bad++; console.error(`BAD  ${m}`); };
const ok = (m) => console.log(`ok   ${m}`);

/**
 * ⚠️ THE COLUMNS THAT MAKE A ROW SOMEBODY'S, and the list is deliberately short.
 * An account, a workspace, a product, or a hostname — which is a workspace by
 * another name, because a custom domain is claimed by exactly one.
 */
const SCOPES = ["app_id", "account_id", "tenant_id", "hostname", "email", "customer_ref", "event_id"];

/** The marker a table uses to say one row genuinely serves every product. */
const SHARED = /deployment-wide:\s*\S/;

/* -------------------------------------------------------- the composition --- */

/*
  ⚠️ READ FROM `modules.ts` RATHER THAN FROM EVERY FILE, because the question is
  about the GLOBAL list specifically. A module in `PLATFORM_REGIONAL` lives in a
  database that already belongs to one workspace in one region, so a table there
  needs no app column and demanding one would be noise.
*/
const modulesSrc = readFileSync(join(ROOT, "runtime/src/modules.ts"), "utf8");
const globalBlock = modulesSrc.slice(
  modulesSrc.indexOf("export const PLATFORM_GLOBAL"),
  modulesSrc.indexOf("export const SHARED_MODULES"),
);
const globalNames = [...globalBlock.matchAll(/^\s*([A-Z][A-Z0-9_]*_SCHEMA)/gm)].map((m) => m[1]);

if (globalNames.length < 10) {
  fail(`only ${globalNames.length} module(s) read out of PLATFORM_GLOBAL — the parser has stopped matching, which reads as a pass`);
} else {
  ok(`composition: ${globalNames.length} module(s) in the store every worker shares`);
}

/* ------------------------------------------------------------- the tables --- */

const sources = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const at = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(at); }
    else if (e.name.endsWith(".ts")) sources.push([at, readFileSync(at, "utf8")]);
  }
};
walk(join(ROOT, "runtime/src"));

/**
 * ⚠️ THE WHOLE DECLARATION, COMMENT INCLUDED. The exemption is written at the
 * DDL it excuses, so finding it means reading from the module's opening brace to
 * the statement — which is also what makes an exemption impossible to write
 * anywhere a reviewer would not see it.
 */
const declarationOf = (name) => {
  for (const [, text] of sources) {
    const at = text.indexOf(`export const ${name}`);
    if (at < 0) continue;
    const end = text.indexOf("\n};", at);
    return text.slice(at, end < 0 ? text.length : end);
  }
  return null;
};

const CREATE = /CREATE TABLE IF NOT EXISTS ([a-z_][a-z0-9_]*) \(([^`]*?)\);/g;

let checked = 0;
let exempt = 0;
for (const name of globalNames) {
  const decl = declarationOf(name);
  if (!decl) { fail(`${name} is composed into PLATFORM_GLOBAL and declared nowhere this guard can read`); continue; }

  for (const [, table, columns] of decl.matchAll(CREATE)) {
    checked++;
    if (SCOPES.some((c) => new RegExp(`\\b${c}\\b`).test(columns))) continue;
    /*
      ⚠️ THE EXEMPTION IS READ FROM THE DECLARATION, so it sits beside the DDL it
      excuses. A list in this file would be a list nobody editing the table ever
      opens — which is how an exemption becomes permanent.
    */
    if (SHARED.test(decl)) { exempt++; continue; }
    fail(
      `${table} (${name}) is in the store every worker binds by the same id and is keyed by none of ` +
      `${SCOPES.join(", ")}.\n` +
      `       That store is ONE database for every product, so this table's rows belong to whichever\n` +
      `       product wrote them first — a signup refused over another business's name, a config key\n` +
      `       shared by products declared not to share it, a price changed in a console nobody opened.\n` +
      `       Add the column, or write "deployment-wide: <why one row serves every product>" in the\n` +
      `       module's own comment.`,
    );
  }
}

if (!bad) ok(`scope: ${checked} global table(s) keyed by whose they are, ${exempt} stated deployment-wide`);

/* ------------------------------------------------- and the readers agree --- */

/**
 * ⚠️ A COLUMN NOTHING FILTERS ON IS A COLUMN THAT DOES NOT EXIST. `app_id` on
 * `plan_override` with `SELECT * FROM plan_override` over it is the same defect
 * wearing a fix — and it is the likelier of the two to ship, because the column
 * is visible in review and the query is somewhere else.
 */
const APP_KEYED = ["app_config", "plan_override", "job_run", "tenant_directory"];

/**
 * ⚠️ A QUERY MAY BE DELIBERATELY CROSS-PRODUCT, AND ONE IS: the operator's list
 * of every workspace on the deployment. It says so on the line above itself, in
 * the file where somebody editing the query will read it — the same rule the
 * table-level exemption follows, for the same reason.
 */
const EXEMPT = /scope-exempt:\s*\S/;
const excused = (text, at) => EXEMPT.test(text.slice(Math.max(0, at - 400), at));

for (const table of APP_KEYED) {
  for (const [path, text] of sources) {
    for (const m of text.matchAll(new RegExp(`(SELECT|DELETE)[^\`]*?FROM ${table}\\b([^\`]*)`, "g"))) {
      const rest = m[2] ?? "";
      /*
        ⚠️ A READ NARROWED BY ITS OWN KEY IS ALREADY SCOPED — a tenant id and a
        hostname are unique across the deployment, so naming one answers about
        exactly one workspace whichever product it belongs to. `IN` counts for
        the same reason and had to be added: the hub resolves the names of the
        workspaces the cross-product index just handed it, which is a list of
        tenant ids and is exactly as narrow as one.
      */
      if (/\bapp_id\b|\btenant_id (=|IN) |\bhostname = \?|\bid = \?|\bevent_id = \?/.test(rest)) continue;
      if (excused(text, m.index ?? 0)) { exempt++; continue; }
      fail(
        `${path.slice(ROOT.length + 1)} reads ${table} without naming the app.\n` +
        `       ${m[0].replace(/\s+/g, " ").slice(0, 100)}\n` +
        `       The column exists; a query that ignores it answers with another product's rows.\n` +
        `       Name it, or write "scope-exempt: <why every product's rows belong here>" above the query.`,
      );
    }
  }
}
if (!bad) ok(`readers: every query against an app-keyed table names the app`);

/* ------------------------------------------------ one table, one store --- */

/**
 * ⚠️ A TABLE NAME DECLARED ON BOTH SIDES IS A SILENT DIVERGENCE, not a
 * duplicate. Every statement is `CREATE TABLE IF NOT EXISTS`, so whichever
 * runner reaches it first wins and the loser's columns never exist — no error,
 * no warning, and the first symptom is a query naming a column that is simply
 * not there. It has happened, one store over, and it took every route touching
 * the database down with it rather than degrading a feature.
 */
const regionalBlock = modulesSrc.slice(
  modulesSrc.indexOf("export const PLATFORM_REGIONAL"),
  modulesSrc.indexOf("export const PLATFORM_GLOBAL"),
);
const regionalNames = [...regionalBlock.matchAll(/^\s*([A-Z][A-Z0-9_]*_SCHEMA)/gm)].map((m) => m[1]);

if (regionalNames.length < 10) {
  fail(`only ${regionalNames.length} module(s) read out of PLATFORM_REGIONAL — the parser has stopped matching, which reads as a pass`);
}

const tablesOf = (name) => {
  const decl = declarationOf(name);
  return decl ? [...decl.matchAll(CREATE)].map((m) => m[1]) : [];
};

const globalTables = new Map();
for (const name of globalNames) for (const t of tablesOf(name)) globalTables.set(t, name);

for (const name of regionalNames) {
  if (globalNames.includes(name)) {
    fail(`${name} is composed into BOTH stores. A module runs once per store it is listed in, so its version marker is written twice and its DDL is applied against two databases that then disagree about what it holds`);
  }
  for (const table of tablesOf(name)) {
    const also = globalTables.get(table);
    if (!also) continue;
    fail(
      `${table} is declared by ${name} (regional) AND ${also} (global).\n` +
      `       Both are CREATE TABLE IF NOT EXISTS, so whichever store's runner reaches it first decides\n` +
      `       the shape and the other's columns silently never exist. Give it one home, or give the\n` +
      `       second one its own name.`,
    );
  }
}
if (!bad) ok(`homes: ${globalTables.size} global and ${regionalNames.flatMap(tablesOf).length} regional table(s), no name in both`);

/**
 * ⚠️ WHAT A WORKSPACE CHOSE STAYS IN ITS REGION, and this is the one placement
 * worth pinning by name rather than deriving. Everything else here is a
 * structural question the parser can answer; this is a decision, and the reasons
 * it was taken are not visible from a table's shape:
 *
 *   RESIDENCY   a workspace's records live in its region, and its settings are
 *               its records — its name, its logo, its sign-off, its policy
 *   ACROSS      the global store is bound with the same id into EVERY worker.
 *               The vault is global too, but a grant algebra stands in front of
 *               it; settings have none, and building one to make a settings row
 *               safe to co-locate is more work than leaving it where it is
 *   HOT PATH    branding and wording are read per request by the app to draw its
 *               own sign-in screen. Regional, that read is local
 *   ERASURE     `scoped` declares these tables regionally and the purge cascade
 *               is DERIVED from it. A table that changed store without the
 *               cascade following is a deleted workspace that keeps its
 *               configuration, with the sweep reporting success
 *
 * The escape hatch, where something is genuinely needed before a region is
 * known, is to PUBLISH A COPY and keep the regional row authoritative — which is
 * what `publishBranding` does for the three keys the sign-in screen wears. Never
 * the reverse.
 */
const WORKSPACE_RECORDS = ["SETTINGS_SCHEMA"];
for (const name of WORKSPACE_RECORDS) {
  if (globalNames.includes(name)) {
    fail(`${name} holds what a workspace CHOSE and is composed into the global store. Read this guard's own comment before moving it — the four reasons are residency, cross-product reach, the hot path and the erasure cascade`);
  } else if (!regionalNames.includes(name)) {
    fail(`${name} holds what a workspace CHOSE and is in neither store — either it was renamed, in which case rename it here too, or it is no longer composed at all and every settings read now answers with declared fallbacks and nothing else`);
  }
}
if (!bad) ok(`placement: what a workspace chose is stored in its own region`);

if (bad) {
  console.error(`\n${bad} scope failure(s).`);
  process.exit(1);
}
console.log(`\nscope: the store every product shares is keyed by whose each row is.`);
