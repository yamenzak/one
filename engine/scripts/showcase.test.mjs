/**
 * EVERY COMPONENT THIS PACKAGE SHIPS IS DRAWN SOMEWHERE, OR IT IS NOT SHIPPED.
 *
 * @design everything this package ships is drawn somewhere, or the reason it is not is written down.
 *
 * ⚠️ AN EXPORT NOBODY RENDERS IS THE ONE DEFECT NO OTHER GUARD CAN SEE, because
 * it is an ABSENCE. It typechecks. It has unit tests. Its own file is beautiful.
 * And the first person to reach for it finds out it renders a nested button, or
 * draws its arc in a colour this interface made monochrome, or prints "min120".
 * Every one of those is a real thing found the week this file was written, and
 * every one of them was found by rendering a component that had never been
 * rendered — not by reading it.
 *
 * ⚠️ SO THE LIST BELOW CAN ONLY SHRINK. An entry that becomes drawn fails this
 * guard until it is deleted, which is what stops an exemption rotting into a
 * permanent one. And each carries a REASON rather than a name, because half of
 * them are not gaps at all: a component with no honest home in this deployment
 * is a component to delete, and saying so in writing is how that decision gets
 * made on purpose instead of by neglect.
 *
 * ⚠️ TYPES ARE NOT CHECKED. `ScreenProps` and `Col<T>` are consumed by the
 * compiler at every call site and named at none of them; demanding a mention
 * would be a rule satisfied by writing a useless annotation, which is worse than
 * the finding (see `metrics.test.mjs` on the check whose premise died).
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const filesIn = (dir) => {
  const at = join(ENGINE, dir);
  if (!existsSync(at)) return [];
  const out = [];
  const walk = (path) => {
    for (const e of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, e.name);
      if (e.isDirectory()) { if (!/node_modules|dist/.test(e.name)) walk(full); }
      else if (/\.tsx?$/.test(e.name)) out.push(full);
    }
  };
  walk(at);
  return out;
};

/* ------------------------------------------------------------ what ships --- */

/**
 * ⚠️ READ FROM THE SOURCE, NOT FROM THE README. The inventory in
 * `design/README.md` is generated FROM these files, so checking against it would
 * be checking the generator — and a component deleted from the tree would pass
 * for as long as nobody regenerated the table.
 */
const DRAWS = /^export function ([A-Z]\w*)/gm;
const shipped = new Map();
for (const file of filesIn("design/src")) {
  const rel = file.slice(ENGINE.length + 1);
  /* ⚠️ `scene/` produces a ground rather than an element, and nothing outside
     the package may mount one — `Page` and `Band` are the only two doors, which
     the `scene` guard enforces from the other side. */
  if (rel.startsWith("design/src/scene/")) continue;
  const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [, name] of src.matchAll(DRAWS)) shipped.set(name, rel);
}

/* ------------------------------------------------------- what draws them --- */

const CONSUMERS = [
  ...filesIn("design/src"),
  ...filesIn("one-space/src"),
  ...filesIn("one/src"),
  ...readdirSync(join(ENGINE, "apps"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) => filesIn(`apps/${e.name}/src`)),
];
const seen = new Map(CONSUMERS.map((f) => [f.slice(ENGINE.length + 1), readFileSync(f, "utf8")]));

/**
 * ⚠️ RENDERED, NOT MENTIONED. `<Peek` and `<Peek/>` count; `import { Peek }` and
 * `export { Peek }` do not — a barrel re-exporting everything would otherwise
 * satisfy this guard for the entire package, which is exactly the shape of
 * "shipped and unreachable" it exists to refuse.
 */
const drawnBy = (name) => {
  const tag = new RegExp(`<${name}[\\s/>]`);
  for (const [where, src] of seen) {
    if (tag.test(src)) return where;
  }
  return null;
};

/*
  ⚠️ A SIBLING RENDERING IT COUNTS, AND THE FIRST VERSION OF THIS SKIPPED THE
  COMPONENT'S OWN FILE. That skip was for a problem this check does not have —
  a definition reads `export function Mark(`, never `<Mark` — and what it
  actually did was report `Arrival` drawing `Mark`, and `Listing` drawing
  `Paged`, as components nobody renders. Both are the package composing itself,
  which is the ordinary case rather than an exception to look for.
*/

/* -------------------------------------------------------------- the list --- */

/**
 * ⚠️ A REASON EACH, AND THE REASONS ARE NOT THE SAME KIND OF THING. Some are
 * work somebody has to do; two are arguments that the component should not be
 * drawn here at all. Both belong in writing — the difference between them is
 * the difference between a gap and a decision, and neither survives being
 * remembered.
 */
const ELSEWHERE = {
  /* --- the account and the operator console, which are OneSpace's --- */
  MyData: "export and erase your account — OneSpace's You area, unmounted",
  WhoLooked: "who read a vault field — OneSpace's Trust area, unmounted",
  ConsentSheet: "a purpose grant — spawned by an app that holds a sensitive field, and none does",
  Ropa: "the processing record — OneSpace's Trust area, unmounted",

  /* --- arguments, not gaps --- */
  Steps: "a progress row is for a sequence of PAGES. Every flow in this deployment " +
    "is one page, and putting it on hello's form printed the three step labels " +
    "directly above three section headings reading exactly the same words",
  Crumbs: "its own header: crumbs earn their row at three levels or more. A note " +
    "has one ancestor, and the crown's back button is what says so — inventing a " +
    "middle level to give a component somewhere to live is how chrome accumulates",
  SecretInput: "nothing an APP stores is a credential — the kernel has no `secret` " +
    "field kind, and the keys an operator pastes are the console's, which is OneSpace's",

};

let missing = 0;
let stale = 0;
for (const [name, home] of [...shipped].sort()) {
  const where = drawnBy(name);
  const excused = ELSEWHERE[name];
  if (where && excused) {
    stale++;
    fail(`${name} is drawn in ${where} and still carries an excuse.\n` +
         `       Delete its entry from ELSEWHERE — the list can only shrink, which is\n` +
         `       the property that stops it becoming a permanent exemption.`);
    continue;
  }
  if (where || excused) continue;
  missing++;
  fail(`${home}: \`${name}\` is exported and nothing renders it.\n` +
       `       Draw it in the test ground (\`apps/hello\`), or stop shipping it, or add it\n` +
       `       to ELSEWHERE with the reason. An untried component is one whose first\n` +
       `       caller finds out what is wrong with it.`);
}

if (!missing && !stale) {
  ok(`drawn: ${shipped.size - Object.keys(ELSEWHERE).length} of ${shipped.size} component(s) render somewhere, ` +
     `${Object.keys(ELSEWHERE).length} excused in writing`);
}

/* ------------------------------------------------------------ the ground --- */

/**
 * ⚠️ AND THE GROUND IS WHERE MOST OF THEM ARE DRAWN, which is the claim this
 * whole file rests on. If hello stops being the place, the excuse list becomes
 * the only thing keeping this green and the guard stops meaning anything.
 */
const groundFiles = filesIn("apps/hello/src/screens");
const groundSrc = groundFiles.map((f) => readFileSync(f, "utf8")).join("\n");
const inGround = [...shipped.keys()].filter((n) => new RegExp(`<${n}[\\s/>]`).test(groundSrc));
/*
  ⚠️ THE FLOOR IS CLOSE TO THE COUNT ON PURPOSE. At 60 against a ground drawing
  82 it absorbed deleting the ENTIRE chart vocabulary without a word — measured,
  by doing it. A floor with thirty components of slack is a floor that only
  fires after somebody has already gutted the thing it guards.
*/
const FLOOR = 78;
if (inGround.length < FLOOR) {
  fail(`the test ground draws ${inGround.length} component(s), under the ${FLOOR} floor.\n` +
       `       \`apps/hello\` is where this package is tried before anybody's product\n` +
       `       meets it. A ground that stopped growing with the package is a ground\n` +
       `       whose screens are a museum.`);
} else {
  ok(`ground: apps/hello draws ${inGround.length} of the package's ${shipped.size} components`);
}

console.log(bad
  ? `\nshowcase: ${bad} finding(s) — a component nobody has rendered is a component nobody has tried.`
  : `\nshowcase: everything this package ships is drawn, or the reason is written down.`);
process.exit(bad ? 1 : 0);
