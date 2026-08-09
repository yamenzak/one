#!/usr/bin/env node
/**
 * `one` — the CLI, and it does one thing.
 *
 * ⚠️ DEPENDENCY-FREE AND NOT COMPILED, so it runs before `pnpm install` in a
 * fresh checkout. The moment scaffolding an app requires the workspace to be
 * installed and built, the first thing anybody does with this repository is the
 * thing it cannot do.
 *
 * The templates live in `scaffold.ts` beside it, where the test can read them.
 * This file is the door: argument handling, refusals, and writing.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { filesFor, idProblem } from "./scaffold.mjs";

const PLATFORM = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const [, , command, id] = process.argv;

if (command !== "new" || !id) {
  console.error("usage: one new <app-id>");
  process.exit(2);
}

const bad = idProblem(id);
if (bad) {
  console.error(`"${id}" ${bad}.`);
  process.exit(1);
}

const root = join(PLATFORM, id);
if (existsSync(root)) {
  /*
    ⚠️ NEVER OVERWRITE. A scaffold that merges into an existing directory is one
    that silently replaces a manifest somebody wrote, and the only copy of what
    it replaced is in their editor's undo history.
  */
  console.error(`platform/${id} already exists.`);
  process.exit(1);
}

for (const [path, contents] of Object.entries(filesFor(id))) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

console.log(`platform/${id} created.

Next:
  pnpm install
  pnpm --filter @one/${id} test

It already has: the five doors, passkeys and emailed codes, a plan catalogue and
the standing ladder, an inbox wired to what its operations emit, export and
erasure derived from its schema, a maintenance switch, and a manifest lock. One
collection is its own surface — list, read, create, update, archive, activity.

What to do next is edit the manifest. Nothing else needs wiring.`);
