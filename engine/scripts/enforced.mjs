/**
 * WHAT THE DESIGN LANGUAGE ACTUALLY CHECKS — DERIVED FROM THE GUARDS THEMSELVES.
 *
 * ⚠️ DESIGN.md §8 WAS A HAND-TYPED LIST AND IT HAD DRIFTED. Five guards were
 * missing from it, and the sharpest absence was `metrics` — the one that holds
 * card padding, the spacing scale, the page gutter and the 64px floor under a
 * pressable row. So the document that answers "is spacing enforced?" said
 * nothing about the guard that enforces spacing, while the guard ran on every
 * push. Somebody reading §8 to decide whether they could pick their own padding
 * would have concluded that they could.
 *
 * ⚠️ WHICH IS THE FAILURE EVERY GENERATED BLOCK IN THIS REPOSITORY EXISTS TO
 * REFUSE (BUILDING.md §5): an inventory lives in a verified generated block or
 * it does not live anywhere. A list of enforcement that is itself unenforced is
 * worse than no list, because it is read as complete.
 *
 * ⚠️ THE SENTENCE LIVES AT THE GUARD, NOT HERE. Each design guard carries one
 * `@design` line in its own header, so adding a guard and describing it are the
 * same edit in the same file. A guard that unambiguously belongs to the design
 * language and carries no line makes this REFUSE — which fails `docs`, because
 * an index that quietly omits an entry reads as an entry that does not exist.
 *
 * Run by `docs.test.mjs` through DESIGN.md's generated block. Prints markdown.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * ⚠️ WHO MUST CARRY A LINE, DECIDED STRUCTURALLY RATHER THAN BY A LIST. A guard
 * that reads the design package or the space and reads nothing else is a design
 * guard and cannot be anything else; a list here would be the same hand-typed
 * inventory one level down, and would go stale the same way.
 *
 * ⚠️ THE WIDE ONES OPT IN INSTEAD. `surface`, `tone`, `problem`, `descend`,
 * `doors`, `present` and `showcase` all walk the whole tree AND shape screens,
 * so no rule can classify them without guessing. They carry a line because
 * somebody decided they belong in §8 — and the block prints whatever carries
 * one, so opting in is the whole mechanism.
 */
const DRAWS = /design\/src|one-space\/src/;
const WIDER = /runtime\/src|kernel\/src|one\/src|walk\(ENGINE\)|filesIn\("packages"\)/;

const SAYS = /^\s*\*\s*@design\s+(.+?)\s*$/m;

let owed = 0;
const rows = [];

for (const file of readdirSync(HERE).filter((f) => f.endsWith(".test.mjs")).sort()) {
  const name = file.slice(0, -".test.mjs".length);
  const src = readFileSync(join(HERE, file), "utf8");
  const says = src.match(SAYS)?.[1];
  if (says) {
    rows.push(`- \`${name}\` — ${says}`);
    continue;
  }
  /* ⚠️ Only the unambiguous ones are owed; see WIDER above. */
  if (DRAWS.test(src) && !WIDER.test(src)) {
    process.stderr.write(
      `${file}: draws the interface and carries no \`@design\` line.\n` +
      `       DESIGN.md §8 is generated from those lines, so a guard without one is\n` +
      `       enforcement nobody reading the design language is told about. Add one\n` +
      `       sentence to its header saying what it checks.\n`,
    );
    owed++;
  }
}

if (owed) process.exit(1);
process.stdout.write(`${rows.join("\n")}\n`);
