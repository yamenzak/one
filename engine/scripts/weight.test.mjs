/**
 * THE FIRST SCREEN DOES NOT PAY FOR THE WHOLE LIBRARY.
 *
 * @design a component nobody has drawn yet is not in the bundle they are waiting for.
 *
 * ⚠️ A PHONE SPENT TWELVE SECONDS ON THE OPENING CURTAIN, and the cause was one
 * import list. `rendered/field.tsx` answers "a declared field becomes a control"
 * for any kind, so it named every kind it could draw — and because the design
 * system has ONE barrel, a calendar and a colour picker were downloaded, parsed
 * and compiled before the curtain could be painted, on every visit to every app
 * on this engine, including screens with no form on them at all. Measured
 * through the source map: HeroUI's calendar alone was the largest single module
 * in a 1,354 KB entry chunk, and the table was the largest one after it.
 *
 * ⚠️ AND SPLITTING ONE AT A TIME SAVED NOTHING, which is the finding this guard
 * exists to hold. `Listing`'s table was moved into its own module and the entry
 * did not shrink by a kilobyte — because the sub-processor register and the plan
 * comparison were still naming `Table` two directories away. A heavy component
 * has to have EXACTLY ONE static importer or it effectively has none, and that
 * one importer has to be reached by `import()` rather than by a plain import.
 *
 * ⚠️ THE LIST IS NAMED RATHER THAN MEASURED, on purpose. A byte threshold read
 * from a built bundle needs a build to run, would answer differently per app,
 * and moves whenever the library does; these are the components a source map
 * showed to be worth their own round trip, and adding one is a decision somebody
 * makes in review rather than a number that drifts.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { appDirs } from "./lib/trees.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(ENGINE.length + 1);

const filesIn = (dir, re = /\.tsx?$/) => {
  const at = join(ENGINE, dir);
  if (!existsSync(at)) return [];
  const out = [];
  const walk = (path) => {
    for (const e of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, e.name);
      if (e.isDirectory()) walk(full);
      else if (re.test(e.name) && !/\.test\./.test(e.name)) out.push(full);
    }
  };
  walk(at);
  return out;
};

/**
 * ⚠️ WHAT EACH ONE COSTS, AND WHERE THE ONE COPY LIVES. The bytes are emitted
 * bytes from the source map of the built entry, not source bytes — a package
 * that is 1.3 MB on disk can be 300 KB in a bundle, and the number that decides
 * anything is the one a browser downloads.
 */
const HEAVY = [
  { name: "Calendar", kb: 53, home: "design/src/parts/pickers.tsx" },
  { name: "RangeCalendar", kb: 0, home: "design/src/parts/pickers.tsx" },
  { name: "DatePicker", kb: 0, home: "design/src/parts/pickers.tsx" },
  { name: "DateRangePicker", kb: 0, home: "design/src/parts/pickers.tsx" },
  { name: "DateField", kb: 0, home: "design/src/parts/pickers.tsx" },
  { name: "ColorPicker", kb: 0, home: "design/src/parts/pickers.tsx" },
  { name: "ColorArea", kb: 0, home: "design/src/parts/pickers.tsx" },
  { name: "ColorSlider", kb: 0, home: "design/src/parts/pickers.tsx" },
  { name: "ColorField", kb: 0, home: "design/src/parts/pickers.tsx" },
  { name: "ColorSwatch", kb: 0, home: "design/src/parts/pickers.tsx" },
  { name: "Table", kb: 53, home: "design/src/parts/listing-table.tsx" },
];

/** Every tree a screen can be written in — the design system and every app. */
const TREES = ["design/src", "one-space/src", ...appDirs()];

/* --------------------------------------- one static importer, and one only --- */

{
  const named = new Map(HEAVY.map((h) => [h.name, []]));
  let files = 0;
  for (const dir of TREES) {
    for (const file of filesIn(dir)) {
      files++;
      const src = readFileSync(file, "utf8");
      /* ⚠️ THE IMPORT STATEMENT, NOT THE WORD. `TableWaiting` is a skeleton and
         `<Calendar.Grid>` is a use of one already imported; matching either
         would report the fix as the fault. */
      for (const [whole] of src.matchAll(/^import\s*\{([^}]*)\}\s*from\s*"@heroui\/react";$/gm)) {
        const brought = whole.slice(whole.indexOf("{") + 1, whole.indexOf("}"))
          .split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
        for (const one of brought) if (named.has(one)) named.get(one).push(file);
      }
    }
  }

  if (!files) {
    fail("no source files found — this guard would pass over an empty list.");
  }

  let wrong = 0;
  for (const heavy of HEAVY) {
    const where = named.get(heavy.name) ?? [];
    const home = join(ENGINE, heavy.home);
    const strays = where.filter((f) => f !== home);
    if (strays.length) {
      wrong++;
      const cost = heavy.kb ? ` (${heavy.kb} KB, plus what it reaches)` : "";
      fail(`\`${heavy.name}\`${cost} is imported outside its one home.\n`
        + `       home:  ${heavy.home}\n`
        + strays.map((f) => `       also:  ${rel(f)}\n`).join("")
        + "       A second static importer puts it back in the entry chunk, so the\n"
        + "       first screen pays for it again. Render it through the home module.");
    } else if (!where.length && !existsSync(home)) {
      wrong++;
      fail(`\`${heavy.name}\` names ${heavy.home} as its home and that file is gone.\n`
        + "       Either the component left the system or the list is stale; both are\n"
        + "       edits somebody makes on purpose.");
    }
  }
  if (!wrong) {
    ok(`weight: ${HEAVY.length} expensive component(s) across ${files} file(s), `
      + "each named in exactly one module");
  }
}

/* ------------------------------------------- and that module is not static --- */

{
  /*
    ⚠️ ONE HOME IS HALF THE RULE. A single importer that everything else imports
    NORMALLY is the same bundle with an extra file in it — the saving comes from
    the boundary, and the boundary is `import()`. So every home has to be reached
    that way, and by nothing else.
  */
  const homes = [...new Set(HEAVY.map((h) => h.home))];
  let open = 0;
  for (const home of homes) {
    const base = home.split("/").pop().replace(/\.tsx?$/, "");
    const statics = [];
    const lazies = [];
    for (const dir of TREES) {
      for (const file of filesIn(dir)) {
        if (file === join(ENGINE, home)) continue;
        const src = readFileSync(file, "utf8");
        /* A type-only import is erased and costs nothing. */
        const still = src.replace(/^import\s+type\s[\s\S]*?;$/gm, "");
        if (new RegExp(`^import\\s[^;]*?from\\s*"[^"]*${base}\\.js";$`, "m").test(still)) {
          statics.push(file);
        }
        if (new RegExp(`import\\(\\s*"[^"]*${base}\\.js"\\s*\\)`).test(still)) lazies.push(file);
      }
    }
    if (statics.length) {
      open++;
      fail(`${home} is imported statically, so its weight is in the entry anyway.\n`
        + statics.map((f) => `       by:    ${rel(f)}\n`).join("")
        + "       Reach it with `import()` behind a `React.lazy`, which is what puts\n"
        + "       it in a chunk of its own.");
    } else if (!lazies.length) {
      open++;
      fail(`${home} is reached by nothing at all.\n`
        + "       A chunk nobody imports is code that ships and never runs — either it\n"
        + "       has a caller or it should not exist.");
    }
  }
  if (!open) {
    ok(`lazy: ${homes.length} home(s), each reached only by \`import()\``);
  }
}

console.log(bad
  ? `\nweight: ${bad} finding(s) — the first screen is paying for a screen nobody opened.`
  : "\nweight: what a screen has not drawn is not in the bundle it waits for.");
process.exit(bad ? 1 : 0);
