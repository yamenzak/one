#!/usr/bin/env node
/**
 * A SHARED KEY MUST BE READ THROUGH `getConfig`.
 *
 * `@4dl/core` owns `app_config` and merges it with the shared platform store.
 * Anything that reads the table DIRECTLY sees this app's rows and nothing else —
 * which is fine for a key that is app-local, and silently wrong for one on the
 * shared allow-list.
 *
 * That combination shipped twice in one sitting, both times because a key was
 * added to the allow-list without checking what actually consumes it:
 *
 *   `ai.markup`       listed, and inert — metering reads `ai_models.markup`, a
 *                     per-row column, so the shared value changed a screen and
 *                     not a charge.
 *   `email.provider`  listed, while the send path ran a raw
 *                     `SELECT … WHERE key IN ('email.provider','email.from')`.
 *                     Clearing this app's row — which the console offers, as
 *                     "Use shared" — would have dropped delivery to the `mock`
 *                     default while every screen reported a provider. On a
 *                     passwordless platform that is "nobody can sign in".
 *
 * Neither was catchable by a type or a test: both were perfectly valid code
 * reading a perfectly real row. So the rule is checked structurally instead —
 * outside core, a raw `app_config` statement may only name keys that are NOT
 * shared.
 *
 * Plain Node, no dependencies, like the rest of `scripts/`.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
let bad = 0;
const fail = (m) => (console.error(`BAD  ${m}`), bad++);

/**
 * The allow-list, read out of core's source.
 *
 * Parsed rather than imported: this runs before `pnpm install` and cannot load
 * TypeScript. An empty parse is itself a failure — a silently empty list would
 * make every check below pass.
 */
const configSrc = readFileSync(join(ROOT, "packages/core/src/config.ts"), "utf8");
const block = /export const SHARED_CONFIG_KEYS[^=]*=\s*\[([\s\S]*?)\n\];/.exec(configSrc)?.[1] ?? "";
const SHARED = new Set([...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
if (SHARED.size === 0) fail("could not read SHARED_CONFIG_KEYS out of packages/core/src/config.ts — the checks below would all pass vacuously.");

/** Every `.ts`/`.tsx` under a source dir, minus tests. */
function sources(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir));
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = `${dir}/${e}`;
    const st = statSync(join(ROOT, rel));
    if (st.isDirectory()) {
      if (e !== "node_modules" && e !== "dist" && e !== "test") sources(rel, out);
    } else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) {
      out.push(rel);
    }
  }
  return out;
}

const files = [...sources("packages"), ...sources("apps")].filter((f) => !f.startsWith("packages/core/src"));

for (const f of files) {
  const text = readFileSync(join(ROOT, f), "utf8");
  text.split("\n").forEach((line, i) => {
    // Only real SQL — a line mentioning the table in prose or a comment is not
    // a read. Comments are the commonest mention by far, and flagging them
    // would train everyone to ignore this check.
    const trimmed = line.trim();
    if (trimmed.startsWith("*") || trimmed.startsWith("//")) return;
    if (!/\b(SELECT|INSERT|UPDATE|DELETE)\b[\s\S]*app_config/i.test(line)) return;

    for (const m of line.matchAll(/['"]([a-z][a-z0-9_.]*\.[a-z0-9_.]+)['"]/gi)) {
      if (SHARED.has(m[1])) {
        fail(
          `${f}:${i + 1} reads "${m[1]}" straight out of app_config. That key is SHARED, so this sees only ` +
            `this app's row and misses the platform value. Use getConfig(env).\n     ${trimmed.slice(0, 120)}`,
        );
      }
    }
  });
}

/**
 * The allow-list may not name a key nothing reads.
 *
 * A shared key with no consumer is a control that appears to work and does not
 * — `ai.markup` for a day. Any mention counts (the panel that displays it, the
 * consumer that acts on it), so this is a floor, not a proof: it catches a
 * typo and a key deleted from the code but left on the list.
 */
const all = files.map((f) => readFileSync(join(ROOT, f), "utf8")).join("\n");
for (const key of SHARED) {
  if (!all.includes(`"${key}"`)) fail(`"${key}" is on the shared allow-list and appears nowhere outside core. Nothing reads it.`);
}

if (bad) {
  console.error(`\n${bad} problem(s). A shared key read from a bare database is wrong in a way nothing else reports.`);
  process.exit(1);
}
console.log(`✓ all ${SHARED.size} shared config keys are read through getConfig`);
