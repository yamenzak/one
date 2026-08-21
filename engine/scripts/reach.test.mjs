/**
 * A COLLECTION THAT SAYS WHERE ITS RECORDS ARE IS READ THAT WAY EVERYWHERE.
 *
 * ⚠️ THE GENERATED CRUD NARROWS ITSELF AND A HANDWRITTEN HANDLER DOES NOT. That
 * asymmetry is the whole risk of `reach`: an app declares `reachBy`, its five
 * generated operations start filtering, the roster grows a picker — and the
 * forty statements the app wrote itself go on reading every site. Nothing fails.
 * The list a person opens is narrowed, so the feature looks like it works, and
 * the routes underneath it are wide open.
 *
 * ⚠️ SO THE CHECK IS STRUCTURAL, LIKE THE LEDGER'S AND THE BUCKET'S. No test can
 * prove that a statement NOBODY HAS YET WRITTEN will carry the filter; what a
 * script can prove is that every statement naming a narrowed table already
 * mentions the narrowing, in the same expression.
 *
 * ⚠️ AND IT IS ANCHORED TO THE STATEMENT. `location` appears on nearly every
 * line of this product; what is examined is a `FROM <table>` or a write to one,
 * and what satisfies it is the app's own reach helper inside the same template
 * literal — because a rule matched on a word is a rule a comment can pass.
 *
 * ⚠️ AN EXEMPTION IS A COMMENT ON THE STATEMENT, IN THE SOURCE, SAYING WHY. Some
 * reads are correctly workspace-wide — a nightly job has no caller to narrow to,
 * and what is inside a kit is a fact about the kit. The reason belongs beside
 * the query, where the next person to change it will read it; a list of
 * exceptions in this file is a waiver nobody revisits.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");
const APPS = join(ENGINE, "apps");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(ENGINE.length + 1);

/**
 * ⚠️ COMMENTS OUT, LENGTH KEPT. Every index taken from the stripped source is
 * used against the RAW one to read the reason a statement gives for being wide —
 * so a stripper that shortened the text would report the excuse from a hundred
 * characters further up the file, which is a waiver granted by accident.
 */
const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));

/**
 * ⚠️ THE WORD THAT MARKS A STATEMENT AS DELIBERATELY WIDE. It reads as a
 * sentence where it is written — "not narrowed, and that is deliberate" — and it
 * is looked for in the COMMENT above the statement, which the stripper has
 * already removed from the code being matched.
 */
const EXCUSED = /not narrowed/i;

/**
 * HOW AN APP SAYS "AND ONLY WHERE THEY WORK" — see the product's own helpers.
 *
 * ⚠️ LOOKED FOR IN THE STATEMENT *OR* IN THE DECLARATION AROUND IT, and the
 * second is not a loophole — it is how a chokepoint works. `stockMove` asks once
 * at the top and then writes four statements; `itemIn` asks in its own `WHERE`
 * and hands a reached row to five callers. A rule that demanded the filter in
 * every statement would push an app AWAY from having one place to ask, which is
 * the shape that makes this checkable at all.
 */
const NARROWED = /\bonly\(|\bmine\(/;

const sources = (at) => {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, e.name);
      if (e.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(path);
    }
  };
  walk(at);
  return out;
};

/**
 * ⚠️ THE NARROWED TABLES COME FROM THE MANIFEST, NEVER FROM A LIST HERE. A
 * second copy would be right the day it was written and silently wrong the day a
 * sixth collection declared `reachBy` — which is the day this guard is most
 * needed. Read from the source rather than imported, because these scripts run
 * as plain Node with nothing built.
 */
const collectionsIn = (code) => {
  const out = [];
  /* Each collection literal opens `id: "x",` and may carry `reachBy: "y",`. */
  for (const block of code.split(/\bcollection\(\{/).slice(1)) {
    const head = block.slice(0, 4_000);
    const id = /\bid:\s*"([a-z0-9-]+)"/.exec(head);
    if (!id) continue;
    out.push({ id: id[1], narrowed: /\breachBy:\s*"/.test(head), head });
  }
  return out;
};

/** What a product says it is narrowed BY — the collection whose rows are places. */
const placesIn = (code) => /\breach:\s*\{[\s\S]{0,400}?\bof:\s*"([a-z0-9-]+)"/.exec(code)?.[1];

/**
 * THE TOP-LEVEL DECLARATION ONE STATEMENT SITS INSIDE.
 *
 * ⚠️ BY INDENTATION RATHER THAN BY BRACES, because a brace counter over a file
 * this size is a parser, and a parser that is subtly wrong reports a hole where
 * there is none. Every declaration in these files begins at column zero, which
 * is what makes the span exact without one.
 */
const TOP = /^(?:export\s+)?(?:async\s+)?(?:const|function|class)\s/gm;
const spanOf = (code, at) => {
  const heads = [...code.matchAll(TOP)].map((m) => m.index);
  let from = 0;
  let to = code.length;
  for (const head of heads) {
    if (head <= at) from = head; else { to = head; break; }
  }
  return [from, to];
};

let looked = 0;
let checked = 0;
let excused = 0;

for (const app of readdirSync(APPS, { withFileTypes: true })) {
  if (!app.isDirectory()) continue;
  const src = join(APPS, app.name, "src");
  if (!existsSync(src)) continue;

  const files = sources(src);
  const raws = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));
  const whole = [...raws.values()].join("\n");
  const declared = collectionsIn(strip(whole));
  const narrowed = new Set(declared.filter((c) => c.narrowed).map((c) => c.id));
  if (!narrowed.size) continue;
  looked++;

  /*
    ⚠️ AND A COLLECTION THAT HOLDS A PLACE AND DOES NOT SAY SO. This is the hole
    the statement check cannot see: deleting one `reachBy` line makes seven
    statements legitimately un-narrowed, the guard's own count quietly falls, and
    every read of that collection goes back to answering for the whole workspace.
    A field pointing at the places collection is the evidence — so the omission
    has to be deliberate and written down, exactly like a wide statement.
  */
  const places = placesIn(strip(whole));
  if (places) {
    const POINTS_AT = new RegExp(`\\bto:\\s*"${places}"`);
    for (const c of declared) {
      if (c.narrowed || c.id === places) continue;
      if (!POINTS_AT.test(c.head)) continue;
      /* ⚠️ The reason is read from the raw declaration, where the comment is. */
      const at = whole.indexOf(c.head);
      if (at >= 0 && EXCUSED.test(whole.slice(at, at + c.head.length))) { excused++; continue; }
      fail(`reach: the ${c.id} collection holds a ${places} and declares no reachBy — `
        + `narrow it, or say "not narrowed" in a comment inside the declaration with the reason.`);
    }
  }

  const NAMES = [...narrowed].join("|");
  /* ⚠️ A READ OR A WRITE. Both leak: one shows another site's rows, the other
     changes them. */
  const TOUCH = new RegExp(
    `\\b(?:FROM|JOIN|INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+(${NAMES})\\b`, "gi");

  for (const file of files) {
    const raw = raws.get(file);
    const code = strip(raw);
    for (const m of code.matchAll(TOUCH)) {
      /*
        ⚠️ THE WHOLE TEMPLATE LITERAL IS THE UNIT, because a filter appended
        after a `WHERE` is several lines from the table name and a fixed window
        of characters would either miss it or reach into the next statement.
      */
      const opened = code.lastIndexOf("`", m.index);
      const closed = code.indexOf("`", m.index);
      if (opened < 0 || closed < 0) continue;
      const statement = code.slice(opened, closed + 1);
      checked++;

      if (NARROWED.test(statement)) continue;
      /* ⚠️ OR THE DECLARATION THIS STATEMENT IS IN — see `NARROWED`. */
      const [from, to] = spanOf(code, m.index);
      if (NARROWED.test(code.slice(from, to))) continue;
      /* ⚠️ THE EXCUSE IS READ FROM THE RAW SOURCE, where the comment still is,
         over the same span — so one sentence covers the operation it is written
         in rather than one statement, which is where a reason belongs. */
      if (EXCUSED.test(raw.slice(from, to))) { excused++; continue; }

      const line = code.slice(0, m.index).split("\n").length;
      fail(`reach: ${rel(file)}:${line} reads ${m[1]} without narrowing to the caller's own — `
        + `add the app's reach filter, or say "not narrowed" in a comment above it with the reason.`);
    }
  }
}

if (!looked) {
  ok("reach: no app declares a reach, so nothing here is narrowed");
} else {
  ok(`reach: ${checked} statement(s) over narrowed tables in ${looked} app(s), `
    + `${excused} deliberately wide`);
}

console.log(bad
  ? "\nreach: a narrowed collection is read past its narrowing."
  : "\nreach: where somebody works is applied by every statement, not only by the generated ones.");
process.exit(bad ? 1 : 0);
