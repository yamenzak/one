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
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

/* ⚠️ ORDER IS READING ORDER, NOT DEPENDENCY — nothing here depends on anything
   else here. `inert` leads because "can this reach production" is the question
   whose wrong answer costs the most. */
const GUARDS = [
  "inert", "docs", "guards", "kernel", "declarations", "shards", "apps",
  "heroui", "ground", "motion", "metrics", "showcase", "states", "shape", "face", "scene",
  "provenance", "surface", "hub", "services", "agent", "access", "package",
  "operator", "ai-action", "vault", "workspace", "edit", "problem", "descend", "rules",
];

/* ⚠️ `tone` carries TypeScript inline and needs the stripper. Every other guard
   is plain Node on purpose — a guard needing a build step is one that can break
   in a way that looks like the thing it was checking. */
const NODE_ARGS = { tone: ["--experimental-strip-types"] };

let failed = [];
for (const name of [...GUARDS, "tone"]) {
  const args = [...(NODE_ARGS[name] ?? []), join(ENGINE, "scripts", `${name}.test.mjs`)];
  const out = spawnSync("node", args, { encoding: "utf8" });
  process.stdout.write(out.stdout ?? "");
  process.stderr.write(out.stderr ?? "");
  if (out.status !== 0) failed.push(name);
}

console.log(failed.length
  ? `\ngate: ${failed.length} of ${GUARDS.length + 1} guard(s) failing — ${failed.join(", ")}.`
  : `\ngate: ${GUARDS.length + 1} guards, all green.`);
process.exit(failed.length ? 1 : 0);
