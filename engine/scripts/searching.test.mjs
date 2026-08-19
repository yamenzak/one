/**
 * A RECORD THAT IS FINDABLE AFTER IT IS GONE, AND THE THREE OTHER SILENCES.
 *
 * ⚠️ EVERY FAILURE THIS GUARD IS ABOUT LOOKS LIKE AN EMPTY RESULT. Search is the
 * one capability here whose broken state is indistinguishable from its working
 * state: a write that stopped marking, a flush that stopped running and a filter
 * that stopped being applied all return a page of results somebody reads as the
 * truth. Nothing throws, no suite goes red, and the only witness is a customer.
 *
 * ⚠️ AND TWO OF THEM ARE NOT BUGS, THEY ARE DISCLOSURES. Indexing copies text
 * OUT of this database into a service that chunks and embeds it, where a chunk
 * cannot be un-said. A vault-backed field reaching that path bypasses consent,
 * the record of who looked and crypto-shredding all at once; an erasure that
 * marks nothing answers a deletion request with the words still findable. So
 * these are checked on the SHAPE — one place marks, one place filters, one place
 * erases — rather than on anybody remembering.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (p) => strip(readFileSync(join(ENGINE, p), "utf8"));

/* ------------------------------------------- what leaves this database --- */

/**
 * ⚠️ A VAULT-BACKED FIELD MAY NEVER BE INDEXED, AND THE REFUSAL IS THE ONLY
 * THING THAT SAYS SO. The vault exists so a special category lives encrypted,
 * behind a recorded grant, destroyable by shredding one key (D11). Naming that
 * field in `searchable` would copy it to a retrieval service with no consent, no
 * record of who looked and no way to shred it — with the vault itself intact and
 * every other guard green.
 */
{
  const src = read("kernel/src/collection.ts");
  if (!/searchable_vault/.test(src)) {
    fail("kernel/src/collection.ts: nothing refuses a vault-backed field in `searchable`.\n"
      + "       Indexing one copies a special category out of the vault, where there is no\n"
      + "       consent, no record of who looked, and no way to shred it.");
  } else if (!/f\.vault[\s\S]{0,200}searchable_vault/.test(src)) {
    fail("kernel/src/collection.ts: the vault refusal no longer reads the field's own `vault`.\n"
      + "       A refusal keyed on anything else is one a rename walks straight past.");
  } else {
    ok("vault: a special category cannot be named searchable");
  }
}

/**
 * ⚠️ THE TEXT THAT LEAVES IS ASSEMBLED FROM THE DECLARED FIELDS AND NOTHING
 * ELSE. A row carries columns nobody named — the scope, the provenance, whatever
 * the app added since — and an index built from the whole row would send every
 * one of them the day it was added, with no diff for anybody to review.
 */
{
  const src = read("kernel/src/collection.ts");
  const fn = /export const searchTextOf[\s\S]*?;\n/.exec(src)?.[0] ?? "";
  if (!fn) {
    fail("kernel/src/collection.ts: no `searchTextOf` — nothing decides what leaves.");
  } else if (!/spec\.searchable/.test(fn) || /Object\.(keys|values|entries)\(row\)/.test(fn)) {
    fail("kernel/src/collection.ts: `searchTextOf` no longer builds from the declared list.\n"
      + "       Reading the whole row sends every column added since, with no diff to review.");
  } else {
    ok("text: only the named fields leave this database");
  }
}

/* ------------------------------------------------ the ledger holds no text --- */

/**
 * ⚠️ A POINTER, NEVER A COPY — the same rule `ai_run` follows. A ledger carrying
 * the indexed text would be a second copy of everything every workspace has
 * written, read by nothing, deleted by nobody. The flush re-reads the record.
 */
{
  const schema = /SEARCH_SCHEMA[\s\S]*?\n\};/.exec(read("runtime/src/search.ts"))?.[0] ?? "";
  const columns = /CREATE TABLE IF NOT EXISTS search_item[\s\S]*?\);/.exec(schema)?.[0] ?? "";
  const content = ["text", "body", "title", "content", "chunk"]
    .filter((c) => new RegExp(`\\b${c}\\b`).test(columns));

  if (!columns) {
    fail("runtime/src/search.ts: no `search_item` table to check.");
  } else if (content.length) {
    fail(`runtime/src/search.ts: \`search_item\` has a column named ${content.join(", ")}.\n`
      + "       The ledger points at a record; keeping the text makes it a second copy of\n"
      + "       everything every workspace has written, read by nothing.");
  } else {
    ok("ledger: the row points at a record and never holds its words");
  }
}

/* ------------------------------------------------------- the write marks --- */

/**
 * ⚠️ EVERY GENERATED WRITE MARKS, OR THE INDEX SILENTLY GOES STALE. This is the
 * failure with no symptom at all: records save, screens work, and search returns
 * an ever-older version of the workspace. A create or an edit that stops marking
 * is invisible until somebody searches for something they wrote today.
 */
{
  const src = read("runtime/src/compose.ts");
  const arm = (verb) => new RegExp(`case "${verb}": \\{[\\s\\S]*?\\n      \\}`).exec(src)?.[0] ?? "";
  const missing = [
    ["create", /noteWritten\(/],
    ["update", /noteWritten\(/],
    /* ⚠️ A DELETE MARKS `gone`, NOT NOTHING. Removing the ledger row instead
       would drop the only handle on the remote item, and the deleted record
       would stay findable for ever. */
    ["delete", /noteGone\(/],
  ].filter(([verb, re]) => !re.test(arm(verb)));

  if (!arm("create")) {
    fail("runtime/src/compose.ts: no generated verbs to check.");
  } else if (missing.length) {
    fail(`runtime/src/compose.ts: ${missing.map((m) => m[0]).join(", ")} no longer marks the index.\n`
      + "       Records save, every screen works, and search quietly serves an older version of\n"
      + "       the workspace — with nothing failing anywhere.");
  } else {
    ok("write: create, edit and delete each mark the index");
  }
}

/* ------------------------------------------------------ the erasure marks --- */

/**
 * ⚠️ MARKED BY `erase` ITSELF, WHICH IS WHY IT LIVES THERE. A version that left
 * this to the callers would have four places to forget it, and forgetting it is
 * a deletion request answered with the records still findable by meaning — while
 * the sweep reports a clean erasure and the person is emailed to say so.
 */
{
  const src = read("runtime/src/records.ts");
  const fn = /export async function erase\([\s\S]*?\n\}/.exec(src)?.[0] ?? "";
  if (!fn) {
    fail("runtime/src/records.ts: no `erase` to check.");
  } else if (!/noteScopeGone\(/.test(fn)) {
    fail("runtime/src/records.ts: erasure no longer marks the index.\n"
      + "       The rows go and the text stays findable, while the sweep reports success and\n"
      + "       the person is emailed to say they have been forgotten.");
  } else {
    ok("erasure: the same call that deletes the rows marks the index");
  }
}

/* ------------------------------------------------------- the query filters --- */

/**
 * ⚠️ THE FOLDER FILTER IS THE ROW-LEVEL SCOPE OF THE WHOLE RETRIEVAL PATH, and
 * it is written in one place for the reason every other scope here is: a filter
 * a caller passes is a filter a caller will one day forget, and the failure is
 * somebody else's records in somebody's search results.
 */
{
  const src = read("runtime/src/search.ts");
  const fn = /export async function searchIn\([\s\S]*?\n\}/.exec(src)?.[0] ?? "";
  if (!fn) {
    fail("runtime/src/search.ts: no `searchIn` to check.");
  } else if (!/filters:\s*\{[^}]*folderFor\(/.test(fn)) {
    fail("runtime/src/search.ts: the query no longer filters by the caller's own folder.\n"
      + "       That filter is the only bound between one workspace's query and every other\n"
      + "       workspace's records, and losing it reads as unusually good results.");
  } else {
    ok("query: the scope filter is composed here, not by a caller");
  }
}

/**
 * ⚠️ AND NO OTHER FILE MAY COMPOSE ONE. A second caller building its own filter
 * is a second chance to build it wrong — and a wrong one does not fail, it
 * widens.
 */
{
  const others = ["runtime/src/search-ops.ts", "runtime/src/serve.ts", "runtime/src/operator.ts"]
    .filter((p) => /ai_search_options|"folder"/.test(read(p)));
  if (others.length) {
    fail(`${others.join(", ")} composes its own retrieval filter.\n`
      + "       One place builds it — a second is a second chance to widen it, and a widened\n"
      + "       filter returns more results rather than an error.");
  } else {
    ok("query: one file composes a filter, and it is the one that owns the boundary");
  }
}

/* ---------------------------------------------------- something carries it --- */

/**
 * ⚠️ MARKING WITHOUT CARRYING IS THE WHOLE FEATURE NOT HAPPENING. The write path
 * touches no network on purpose, so the job IS the indexing — declared and
 * unrun, every record is marked pending for ever and every search is empty, with
 * a ledger full of work and a green suite.
 */
{
  const src = read("runtime/src/sweep.ts");
  if (!/at\("search",/.test(src)) {
    fail("runtime/src/sweep.ts: no job carries marked records to the index.\n"
      + "       The write path marks and returns by design, so nothing else ever sends them:\n"
      + "       every record sits pending and every search is empty.");
  } else if (!/flushIndex\(/.test(src)) {
    fail("runtime/src/sweep.ts: the search job no longer flushes anything.");
  } else if (!/ensureInstance\(/.test(src)) {
    fail("runtime/src/sweep.ts: the pass no longer makes sure the instance exists.\n"
      + "       Pushing to a missing instance fails per item, and a refusal is terminal — so\n"
      + "       one absent instance permanently poisons a whole product's index.");
  } else {
    ok("job: something carries what the writes marked, into an instance it ensures");
  }
}

/**
 * ⚠️ AND THE ACCOUNT TOKEN STAYS OFF THE REQUEST PATH. The items API takes the
 * credential that can rewrite this deployment's bindings; indexing inline would
 * put it behind every save, which is the one reason the marking/carrying split
 * is worth its complexity at all.
 */
{
  /* ⚠️ THE NAME ANYWHERE, NOT A CALL. Matching `putItem(` passed a mutation that
     imported it and had not called it yet — which is the shape a regression
     actually arrives in, one edit before the call. Nothing else in this tree
     mentions these three, so a bare name here is already the signal. */
  const onRequest = ["runtime/src/search.ts", "runtime/src/search-ops.ts", "runtime/src/compose.ts"]
    .filter((p) => /\b(putItem|dropItem|ensureInstance)\b/.test(read(p)));
  if (onRequest.length) {
    fail(`${onRequest.join(", ")} reaches the items API from the request path.\n`
      + "       That call takes the account token — the credential that can rewrite this\n"
      + "       deployment's bindings — and it belongs to the job, not to a tenant's save.");
  } else {
    ok("token: the credential that provisions never sits behind a save");
  }
}

console.log(bad
  ? `\nsearching: ${bad} finding(s) — a record findable after it is gone, or never findable at all.`
  : "\nsearching: one place marks, one place filters, one place erases.");
process.exit(bad ? 1 : 0);
