/**
 * A SETTING NOBODY READS.
 *
 * ⚠️ A SWITCH THAT CHANGES NOTHING IS WORSE THAN AN ABSENT FEATURE. Somebody
 * turns it on, believes the thing it promised, and stops watching for the
 * problem it claimed to solve — and every signal they have says it worked: the
 * control saved, the value came back, the screen redrew. This is the enforced
 * half of the bidirectional rule, and it is the half a runtime cannot ask for
 * itself: whether an id is ever NAMED is a fact about an app's source.
 *
 * ⚠️ AND A SCREEN COUNTS AS A READER. A display density and a workspace's colour
 * are read where they are drawn, never in a handler — so a check that demanded
 * `ctx.setting` for every declaration would report four correct settings as
 * defects, which is the shape that gets a guard waived within a week.
 *
 * ⚠️ THE DECLARATION BLOCK IS CUT OUT BEFORE THE SEARCH, and that is the whole
 * trick. A manifest names every id it declares, so searching the file it is
 * declared in reports every setting as read — a check that cannot fail. What is
 * left after the cut is code, and code naming an id is a reader.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { knownStages } from "./lib/stages.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const under = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const at = join(dir, name);
    if (statSync(at).isDirectory()) under(at, out);
    else if (/\.tsx?$/.test(at)) out.push(at);
  }
  return out;
};

/* ------------------------------------------------------------- the block --- */

/**
 * ⚠️ BRACE-MATCHED, NOT LINE-COUNTED. A `settings:` block is nested objects with
 * strings in them; anything shorter than balancing the braces cuts in the middle
 * of a declaration and leaves half of it in the "code" half, where it reads as a
 * reader naming an id.
 */
function block(src, key) {
  const at = src.indexOf(`\n  ${key}: {`);
  if (at < 0) return null;
  let depth = 0;
  for (let i = src.indexOf("{", at); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return { from: at, to: i + 1 };
  }
  return null;
}

/* ----------------------------------------------------------------- apps --- */

const APPS = readdirSync(join(ENGINE, "apps"))
  .filter((name) => {
    try { return statSync(join(ENGINE, "apps", name, "src")).isDirectory(); }
    catch { return false; }
  });

if (!APPS.length) fail("apps: nothing under apps/ has a src — a check that cannot fail");

let declared = 0;
for (const app of APPS) {
  const root = join(ENGINE, "apps", app, "src");
  const files = under(root);

  /* ⚠️ Wherever the manifest is. It is `index.ts` in every app today, and
     naming that here would make moving it a silent pass. */
  const holder = files.find((f) => block(readFileSync(f, "utf8"), "settings"));
  if (!holder) continue;

  const manifest = readFileSync(holder, "utf8");
  const at = block(manifest, "settings");
  const settings = manifest.slice(at.from, at.to);

  /*
    ⚠️ A SETTING MAY BE WAITING ON A STAGE, and the mechanism is the one every
    other gap here uses — a `DEFER(engine-N)` marker, findable, with a row in the
    stage registry. `notes.reply_to` and `notes.digest` are real declarations for
    a lane that does not send anything yet; a waiver list inside this file would
    cover them and everything somebody added under them afterwards.

    ⚠️ AND THE WINDOW IS THE PREVIOUS DECLARATION, not a character count. A
    marker on one setting would otherwise excuse whichever one happened to be
    written under it.
  */
  const found = [...settings.matchAll(/\bid: "([^"]+)"/g)];
  const ids = found.map((m) => m[1]);
  const waiting = new Map();
  for (const [i, m] of found.entries()) {
    const window = settings.slice(i ? found[i - 1].index : 0, m.index);
    const stage = window.match(/DEFER\(engine-(\d+)\)/)?.[1];
    if (stage) waiting.set(m[1], stage);
  }
  const staged = knownStages();
  for (const [id, stage] of waiting) {
    if (!staged.has(stage)) {
      fail(`${app}: ${id} defers to stage ${stage} and the registry has no row for it — a marker pointing at nothing reads as a plan`);
    }
  }

  if (!ids.length) {
    fail(`${app}: a settings block with no ids in it — the walk found the block and read nothing out of it`);
    continue;
  }
  declared += ids.length;

  /* ⚠️ EVERY OTHER FILE WHOLE, AND THE MANIFEST WITHOUT ITS DECLARATIONS. */
  const code = [
    manifest.slice(0, at.from) + manifest.slice(at.to),
    ...files.filter((f) => f !== holder).map((f) => readFileSync(f, "utf8")),
  ].join("\n");

  const unread = ids.filter((id) => !code.includes(`"${id}"`) && !waiting.has(id));
  if (unread.length) {
    fail(`${app}: ${unread.join(", ")} — declared, rendered, saved, and read by nothing.\n`
      + `       Read it in a handler (\`ctx.setting\`) or in the screen it changes, delete it, or put a DEFER(engine-N) marker on it: a control somebody presses and believes is worse than a feature that is absent.`);
  } else {
    ok(`${app}: all ${ids.length} setting(s) are read by a handler or a screen`
      + (waiting.size ? `, ${waiting.size} waiting on a stage` : ""));
  }
}

if (!declared) fail("settings: no app declares one — a check that cannot fail");

console.log(bad
  ? `\nsettings: ${bad} finding(s) — a switch that saves and changes nothing.`
  : `\nsettings: ${declared} declared across ${APPS.length} app(s), every one of them read.`);
process.exit(bad ? 1 : 0);
