/**
 * A BACKTICK INSIDE A CSS TEMPLATE LITERAL, NAMED WHERE IT IS.
 *
 * ⚠️ THIS IS AN EMPIRICAL GUARD, and the empiricism is the point: writing one
 * has ended a work session FIFTEEN times in `platform/ui`, always identically.
 * The literal closes early, the file stops parsing, and esbuild reports a
 * missing `,` or `;` on a line hundreds of rows away — so the diagnosis costs
 * more than the fix every single time. The habit that causes it is GOOD writing:
 * quoting a token in a comment the way every other comment in this repository
 * does. It is not a habit anybody is going to break by being careful.
 *
 * ⚠️ IT SCANS RAW TEXT AND NEEDS NOTHING TO PARSE. That is what makes it useful:
 * by the time this fires the file is not valid TypeScript, so nothing that goes
 * through the compiler — a type check, a vitest run, an import — can report it.
 * The delimiters are unambiguous in this codebase: a sheet opens with
 * `export const NAME = ` + a backtick and closes with a backtick + `.trim();`,
 * so the region between them is found by text alone.
 *
 * ⚠️ AND IT REPORTS THE CAUSE, NOT THE WRECKAGE. `interface.test.mjs` carries a
 * check for the same defect that looks for an unterminated comment inside a
 * parsed literal — the signature that survives after the fact. That one is a
 * correctness guard in the gate; this one is a diagnosis, and it runs before the
 * package's own tests so the first thing anybody sees is the file and the line.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const OPEN = /export const [A-Z_][A-Z0-9_]* (?::[^=]+)?= `/g;
const CLOSE = "`.trim();";

/** Every sheet region in one file, as {from, to} offsets into the raw source. */
export function sheetRegions(src) {
  const out = [];
  for (const m of src.matchAll(OPEN)) {
    const from = m.index + m[0].length;
    const to = src.indexOf(CLOSE, from);
    if (to === -1) continue;
    out.push({ from, to });
  }
  return out;
}

/**
 * Every stray backtick inside a sheet, as {line, text}.
 *
 * ⚠️ A BACKTICK INSIDE AN INTERPOLATION IS NOT ONE. A sheet that builds rules
 * from a list — one per masked sky, one per stagger position — writes a nested
 * template inside `${…}`, and that is correct code. The first version of this
 * scan reported four of them and would have made the guard something to switch
 * off, which is the failure mode a guard cannot recover from. So the walk tracks
 * interpolation depth and only judges what is at depth zero.
 */
export function strayBackticks(src) {
  const out = [];
  const lines = src.split("\n");
  for (const { from, to } of sheetRegions(src)) {
    let depth = 0;
    for (let i = from; i < to; i++) {
      if (src[i] === "$" && src[i + 1] === "{") { depth++; i++; continue; }
      if (depth > 0) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") depth--;
        continue;
      }
      if (src[i] !== "`") continue;
      const line = src.slice(0, i).split("\n").length;
      out.push({ line, text: lines[line - 1].trim() });
    }
  }
  return out;
}

const walk = (dir) =>
  readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

/* Run directly: scan the directories named on the command line. */
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const roots = process.argv.slice(2);
  let bad = 0;
  let scanned = 0;
  for (const root of roots) {
    for (const file of walk(root).filter((f) => /\.(tsx?|mjs)$/.test(f))) {
      scanned++;
      for (const { line, text } of strayBackticks(readFileSync(file, "utf8"))) {
        bad++;
        process.stderr.write(
          `${relative(process.cwd(), file)}:${line}: a backtick inside a CSS template literal.\n` +
            `    ${text}\n` +
            `    It CLOSES the sheet here. The compiler will report a missing , or ; somewhere\n` +
            `    else entirely, in a line that has nothing wrong with it. Reword the comment.\n`,
        );
      }
    }
  }
  if (bad) process.exit(1);
  process.stdout.write(`sheets: ${scanned} file(s), no stray backtick\n`);
}
