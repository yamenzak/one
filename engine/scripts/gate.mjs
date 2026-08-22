/**
 * THE GATE — every guard, and every one of them RUN.
 *
 * ⚠️ THIS WAS 25 SCRIPTS CHAINED WITH `&&`, AND THE CHAIN HID FAILURES. The
 * first non-zero exit stopped the rest, so a stale documentation block — the
 * cheapest finding in the set — reported itself alone while five guards behind
 * it were failing on a half-finished refactor. The summary read "1 problem".
 *
 * ⚠️ WHICH IS THE FAILURE SHAPE EVERY GUARD HERE EXISTS TO REFUSE, one level up:
 * a check that reports something narrower than the truth. A gate that stops at
 * the first finding teaches whoever runs it to fix one thing and re-run, and the
 * count it prints is never the number of things wrong.
 *
 * Every script runs. Every finding prints. The exit code is the whole verdict.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

/* ⚠️ ORDER IS READING ORDER, NOT DEPENDENCY — nothing here depends on anything
   else here. `inert` leads because "can this reach production" is the question
   whose wrong answer costs the most. */
const GUARDS = [
  "inert", "deploy", "fixture", "seen", "runaway", "metering", "searching", "docs", "guards", "kernel", "declarations", "shards", "apps",
  "heroui", "ground", "motion", "metrics", "rhythm", "travel", "cards", "glyphs", "attrs", "showcase", "states", "shape", "face", "scene",
  "gates",
  "present", "keys",
  "provenance", "surface", "space", "doors", "services", "agent", "access", "package", "reached",
  "operator", "jobs", "ledger-chokepoint", "reach", "item-life", "ai-commits", "release-ladder", "job-tells", "label-once", "inferred-consumption", "one-planner", "input-checked", "screen-index", "ai-action", "vault", "workspace", "edit", "problem", "descend", "settings", "rules", "bundle", "capability", "routed", "dossier", "infra", "logs",
];

/* ⚠️ `tone` carries TypeScript inline and needs the stripper. Every other guard
   is plain Node on purpose — a guard needing a build step is one that can break
   in a way that looks like the thing it was checking. */
const NODE_ARGS = { tone: ["--experimental-strip-types"] };

/**
 * ⚠️ A GUARD THAT WALKS A DIRECTORY MUST REPORT WHAT IT WALKED, and this is the
 * one place that can tell — the output is already here. "No violations found"
 * and "nothing was looked at" are the same sentence without a number, and three
 * checks in this tree have been the second kind: a layering check naming a
 * package scope the rename retired, so eighty imports went unexamined; a
 * compositor check reading a directory holding none of the keyframes it was
 * about; and a settings check over a corpus that had moved. Each printed `ok` in
 * a confident sentence for months.
 *
 * ⚠️ CHECKED FROM THE OUTPUT RATHER THAN FROM THE SOURCE. Reading the script for
 * a count means parsing a template literal, which the first attempt got wrong on
 * its own guard — the running answer is the one that cannot be argued with.
 *
 * ⚠️ AND IT IS PER GUARD, NOT PER CHECK, WHICH IS THE HONEST LIMIT. A guard with
 * five checks passes this if any one of them counts, so a single silent check
 * inside a counting guard still gets through. What it catches is a guard that
 * reports no corpus at all — which is what all three of the ones above did.
 * Tightening it to per check needs a convention every `ok` line follows, and a
 * convention retrofitted at speed is how a check comes to be satisfied by its own
 * wording.
 */
const walks = (name) =>
  /readdirSync\s*\(/.test(readFileSync(join(ENGINE, "scripts", `${name}.test.mjs`), "utf8"));

let failed = [];
let silent = [];
for (const name of [...GUARDS, "tone"]) {
  const args = [...(NODE_ARGS[name] ?? []), join(ENGINE, "scripts", `${name}.test.mjs`)];
  const out = spawnSync("node", args, { encoding: "utf8" });
  process.stdout.write(out.stdout ?? "");
  process.stderr.write(out.stderr ?? "");
  if (out.status !== 0) { failed.push(name); continue; }
  const said = (out.stdout ?? "").split("\n").filter((l) => l.startsWith("ok"));
  if (walks(name) && !said.some((l) => /\b[1-9]\d*\b/.test(l))) silent.push(name);
}

if (silent.length) {
  console.error(`\nBAD  corpus: ${silent.join(", ")} walk a directory and report no count.\n` +
    `       A green run over an empty corpus reads exactly like a green run over a full one.`);
  failed.push(...silent);
}

console.log(failed.length
  ? `\ngate: ${failed.length} of ${GUARDS.length + 1} guard(s) failing — ${failed.join(", ")}.`
  : `\ngate: ${GUARDS.length + 1} guards, all green.`);
process.exit(failed.length ? 1 : 0);
