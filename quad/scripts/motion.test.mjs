/**
 * MOTION AND TYPE COME FROM THE LIBRARY, NOT FROM A SCREEN (D7).
 *
 * ⚠️ THE FAILURE IS NOT THAT ANY ONE VALUE IS WRONG. `200ms ease-in-out` is
 * perfectly defensible; so is `180ms cubic-bezier(.32,.72,0,1)`. What is not
 * defensible is thirty screens each choosing, because the product then has no
 * motion at all — a drawer decelerates one way, a toast another, a card a third,
 * and nobody can name the fault. It reads as cheap and nothing is broken.
 *
 * ⚠️ SAME ARGUMENT, SAME SHAPE, FOR TYPE. One screen picks `text-2xl` for its
 * heading and the next picks `text-xl`; both are reasonable and the pair is not.
 * Naming the ROLE moves the decision to one file, once.
 *
 * ⚠️ AND HEROUI ALREADY HANDLES REDUCED MOTION — both `prefers-reduced-motion`
 * and a `data-reduce-motion="true"` ancestor, throughout. A hand-rolled
 * `@keyframes` sits outside that machinery, so it keeps moving for somebody who
 * asked it to stop, which for some people is not a preference but a symptom.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const QUAD = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(QUAD.length + 1);

const filesIn = (dir, re) => {
  const at = join(QUAD, dir);
  if (!existsSync(at)) return [];
  const out = [];
  const walk = (path) => {
    for (const e of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, e.name);
      if (e.isDirectory()) walk(full);
      else if (re.test(e.name)) out.push(full);
    }
  };
  walk(at);
  return out;
};

const SOURCES = [
  ...filesIn("web/src", /\.(tsx?|css)$/),
  ...filesIn("one-hub/src", /\.(tsx?|css)$/),
  ...readdirSync(join(QUAD, "apps"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) => filesIn(`apps/${e.name}/src`, /\.(tsx?|css)$/)),
];

/** ⚠️ Comments describe the rules; matching them reports each rule as its own breach. */
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * ⚠️ `motion.ts` AND `theme.ts` ARE THE VOCABULARY, so they are where the values
 * live. Everything else names them. The list can only shrink.
 */
const DEFINES_MOTION = new Set(["web/src/motion.ts", "web/src/theme.ts"]);

/* --------------------------------------------------------------- the curves --- */

let curves = 0;
for (const file of SOURCES) {
  const name = rel(file);
  if (DEFINES_MOTION.has(name)) continue;
  const src = strip(readFileSync(file, "utf8"));

  for (const [, what] of src.matchAll(/(cubic-bezier\s*\([^)]*\))/g)) {
    curves++;
    fail(`${name}: writes its own curve — ${what}.\n` +
         `       HeroUI ships six easings and every control it draws already moves on\n` +
         `       them. Use \`EASE\` / \`MOTION\` from @quad/web.`);
  }
  /* ⚠️ A literal duration is the same fault with fewer characters. */
  for (const [, what] of src.matchAll(/(?:transition|animation)(?:-duration)?\s*:\s*[^;]*?(\d+(?:\.\d+)?m?s)/g)) {
    curves++;
    fail(`${name}: hard-codes a duration — ${what}.\n` +
         `       Name the intent instead: \`MOTION.enter\`, \`.exit\`, \`.press\`, \`.travel\`.`);
  }
}
if (!curves) ok(`curves: no screen writes its own easing or duration`);

/* ------------------------------------------------------------- the keyframes --- */

/**
 * ⚠️ A `@keyframes` IS THE ONE THING THAT ESCAPES THE LIBRARY'S REDUCED-MOTION
 * RULES ENTIRELY. A transition can be switched off by setting
 * `transition-property: none`; a running animation carries on.
 */
let frames = 0;
for (const file of SOURCES) {
  const src = strip(readFileSync(file, "utf8"));
  for (const [, name] of src.matchAll(/@keyframes\s+([\w-]+)/g)) {
    frames++;
    fail(`${rel(file)}: declares @keyframes ${name}.\n` +
         `       It sits outside HeroUI's reduced-motion handling, so it keeps moving\n` +
         `       for somebody who asked it to stop. Use a transition on a token.`);
  }
}
if (!frames) ok(`keyframes: none hand-rolled, so every motion answers to the setting`);

/* ------------------------------------------------------------------- roles --- */

const typeSrc = readFileSync(join(QUAD, "web/src/type.ts"), "utf8");
const roles = [...typeSrc.matchAll(/^\s{2}(\w+):\s*"/gm)].map((m) => m[1]);
if (roles.length < 4) {
  fail(`web/src/type.ts: fewer than four roles — the scale is what everything else names.`);
} else {
  ok(`roles: ${roles.join(", ")}`);
}

/**
 * ⚠️ A TYPE UTILITY ON OUR OWN ELEMENT IS THE HOLE THE RESTYLE GUARD LEAVES.
 * That one refuses `text-2xl` on a HeroUI component; nothing stopped it on a
 * bare `<h1>`, which is exactly where a screen reaches for one.
 */
const DEFINES_TYPE = new Set(["web/src/type.ts", "web/src/layout.tsx"]);
let sizes = 0;
for (const file of SOURCES) {
  const name = rel(file);
  if (DEFINES_TYPE.has(name) || !/\.tsx$/.test(name)) continue;
  const src = strip(readFileSync(file, "utf8"));
  for (const [, cls] of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    for (const one of (cls ?? "").split(/\s+/).filter(Boolean)) {
      if (/^(?:[a-z0-9]+:)*text-(?:xs|sm|base|lg|[0-9]?xl)$/.test(one)
        || /^(?:[a-z0-9]+:)*font-(?:thin|light|normal|medium|semibold|bold|black)$/.test(one)) {
        sizes++;
        fail(`${name}: sets type directly — "${one}".\n` +
             `       Name a role: \`TYPE.title\`, \`.section\`, \`.body\`, \`.label\`, \`.note\`, \`.figure\`.`);
      }
    }
  }
}
if (!sizes) ok(`type: no screen picks its own size or weight`);

console.log(bad
  ? `\nmotion: ${bad} finding(s) — a product with no motion and no typography of its own.`
  : `\nmotion: one set of curves, one set of roles, and reduced motion answered.`);
process.exit(bad ? 1 : 0);
