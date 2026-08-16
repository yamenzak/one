/**
 * NO CROSS-TENANT QUESTION IS ANSWERED BY ASKING EVERY SHARD (D5).
 *
 * ⚠️ A FAN-OUT IS CORRECT ON THE DAY IT IS WRITTEN AND GETS SLOWER FOR EVER. With
 * three shards it is three queries and nobody notices; with forty it is the
 * operator console timing out, the dunning sweep half finishing, and the erasure
 * job giving up somewhere in the middle — at exactly the size where those things
 * matter most. Nothing fails in between, so there is no moment at which somebody
 * decides to fix it.
 *
 * ⚠️ THE CHECK IS STRUCTURAL BECAUSE THE FAULT IS INVISIBLE IN BEHAVIOUR. A
 * fan-out and a directory query return the same answer; the difference only
 * shows up in a production the tests do not have. So this asks about SHAPE: the
 * code that enumerates shards is bookkeeping about capacity, and the code that
 * resolves a shard to a database is serving one tenant. A module that does both
 * is a module that walks them.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const QUAD = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(QUAD.length + 1);

const sourcesIn = (dir) => {
  const at = join(QUAD, dir);
  if (!existsSync(at)) return [];
  const out = [];
  const walk = (path) => {
    for (const e of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out.push(full);
    }
  };
  walk(at);
  return out;
};

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/*
  ⚠️ ONE EXEMPTION SHAPE, AND IT CARRIES A REASON. Moving a tenant between shards
  genuinely needs both halves, and pretending otherwise would mean either an
  un-runnable rule or a guard somebody switches off. `fan-out-exempt: <why>` in
  the file makes the exception visible in review rather than in nobody's memory.
*/
const exempt = (src) => /fan-out-exempt:\s*\S+/.test(src);

const FILES = [...sourcesIn("runtime/src"), ...sourcesIn("design/src"), ...sourcesIn("apps")];

/* ------------------------------------------------------------- both halves --- */

let checked = 0;
let both = 0;
for (const file of FILES) {
  const src = readFileSync(file, "utf8");
  const code = stripComments(src);
  checked++;
  const enumerates = /\bshards\s*\(/.test(code);
  const resolves = /\bshardFor\s*\(/.test(code);
  if (enumerates && resolves && !exempt(src)) {
    both++;
    fail(`${rel(file)}: enumerates shards AND resolves one to a database (D5).\n` +
         `       That is the shape of a fan-out. Ask the directory, or say why with ` +
         `\`fan-out-exempt: <reason>\`.`);
  }
}
if (!both) ok(`halves: ${checked} file(s), none both enumerate and resolve shards`);

/* ---------------------------------------------------------------- the loop --- */

/**
 * ⚠️ AND THE DIRECT SHAPE, IN CASE THE TWO HALVES EVER LIVE IN ONE PLACE
 * LEGITIMATELY: a query issued inside a loop over shards. The window is
 * deliberately generous — a fan-out written across twelve lines is still a
 * fan-out.
 */
const LOOP = /\bfor\s*\([^)]*\bof\s+[^)]*shards?\b[^)]*\)/g;
let loops = 0;
for (const file of FILES) {
  const src = readFileSync(file, "utf8");
  if (exempt(src)) continue;
  const code = stripComments(src);
  for (const m of code.matchAll(LOOP)) {
    const after = code.slice(m.index, m.index + 600);
    if (/\.(prepare|exec|batch)\s*\(/.test(after)) {
      loops++;
      fail(`${rel(file)}: a query inside a loop over shards (D5).\n` +
           `       This is the walk that gets slower with every shard and times out at the size where it matters.`);
    }
  }
}
if (!loops) ok(`loops: no query is issued inside a walk over shards`);

console.log(bad
  ? `\nshards: ${bad} finding(s) — a cross-tenant question answered the expensive way.`
  : `\nshards: every cross-tenant question is asked of the directory.`);
process.exit(bad ? 1 : 0);
