#!/usr/bin/env node
/**
 * THE INTERFACE BOUNDARY — four rules that decay one reasonable exception at a
 * time, which is why none of them is a review convention.
 *
 *   1. NO LITERAL COLOUR   one arbitrary colour and the exhaustive sweep stops
 *                          being a guarantee.
 *   2. NO LITERAL MOTION   a duration outside the choreographer is the jungle
 *                          rebuilt: forty tasteful animations arriving at forty
 *                          different times.
 *   3. RENDERER BOUNDARY   an app defining a shell, a dialog, a toast or a form
 *                          primitive. Allowed once, it is the real API within
 *                          two quarters and the shared design system is a
 *                          component library with extra steps.
 *   4. HOVER IS NOT REQUIRED  an interaction reachable only by hover is one no
 *                          touch device and no keyboard can reach at all.
 *
 * Dependency-free Node — these run before `pnpm install` in CI.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let bad = 0;
const fail = (m) => (console.error(`BAD  ${m}`), bad++);
const ok = (m) => console.log(`ok   ${m}`);

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
};
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
     .replace(/(^|[^:\w])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));

const packages = readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(ROOT, e.name, "src")))
  .map((e) => e.name);
const rel = (f) => relative(ROOT, f);

/**
 * ⚠️ THE TOKEN LAYER IS FOUR FILES, NAMED. Widening this list is a visible edit
 * to this line, which is the entire value of a chokepoint: the question stops
 * being "is this colour reasonable" and becomes "is this file allowed to have
 * one at all".
 *
 * ⚠️ `sky.ts` IS HERE BECAUSE A MASK IS AN ALPHA CHANNEL IN COLOUR SYNTAX. Its
 * `#000` mean "opaque", never black, and every colour it actually emits is
 * derived from the brand — which `ui/test/sky.test.ts` proves by sweeping the
 * hue and the chroma ceiling, and which it keeps honest by refusing any literal
 * in that file that is not inside a mask.
 */
const TOKEN_LAYER = ["ui/src/colour.ts", "ui/src/ground.ts", "ui/src/brand.ts", "ui/src/sky.ts"];
const CHOREOGRAPHER = "ui/src/motion.ts";

const interfaceFiles = walk(join(ROOT, "ui", "src")).concat(
  packages.filter((p) => p !== "ui").flatMap((p) => walk(join(ROOT, p, "src")).filter((f) => f.endsWith(".tsx"))),
);

/* ------------------------------------------------------- 1. NO COLOUR --- */

const COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab|color-mix)\s*\(/i;
let colours = 0;
for (const file of interfaceFiles) {
  const r = rel(file);
  if (TOKEN_LAYER.includes(r)) continue;
  stripComments(readFileSync(file, "utf8")).split("\n").forEach((line, i) => {
    if (!COLOUR.test(line)) return;
    colours++;
    fail(`${r}:${i + 1}: a literal colour outside the token layer.\n` +
         `       Every value in every brand slot is provably safe BECAUSE nothing outside\n` +
         `       ${TOKEN_LAYER[0]} and its neighbours can introduce one. A single literal\n` +
         `       removes the guarantee for the whole product.`);
  });
}
ok(`no literal colour: ${interfaceFiles.length} file(s), ${colours} outside the token layer`);

/* --------------------------------------------- 1b. A BACKTICK IN A SHEET --- */

/*
  ⚠️ THIS ONE IS EMPIRICAL. A backtick inside a CSS template literal has ended a
  work session TEN times in this package, always the same way: the file stops
  parsing, esbuild names a line hundreds of rows from the cause, and the message
  is about a semicolon. The habit that causes it is good writing — quoting a
  token in a comment the way every other comment in the repo does — so it is not
  a habit anybody is going to break.

  ⚠️ AND IT IS DETECTED BY THE WRECKAGE, NOT BY THE BACKTICK. Looking for one
  inside a comment cannot work: by then the backtick has already CLOSED the
  literal, so the comment straddles the boundary and no span contains it. The
  signature that survives is an UNTERMINATED `/*` inside a sheet — a comment the
  literal ended in the middle of. The first version of this check searched for
  the backtick, passed its own mutation, and was exactly the false comfort it
  exists to prevent.
*/
let sheets = 0;
for (const file of interfaceFiles.concat(walk(join(ROOT, "ui", "reference")).filter((f) => /\.(tsx?|mjs)$/.test(f)))) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/`((?:[^`\\]|\\.)*)`/gs)) {
    const body = m[1];
    /* Only a CSS sheet: a declaration inside a rule block. */
    if (!/\{[\s\S]*?[a-z-]+\s*:[\s\S]*?\}/.test(body)) continue;
    sheets++;
    const opened = (body.match(/\/\*/g) ?? []).length;
    const closed = (body.match(/\*\//g) ?? []).length;
    if (opened === closed) continue;
    const line = src.slice(0, m.index).split("\n").length;
    fail(`${rel(file)}:${line}: a CSS template literal ending inside a comment.\n` +
         `       That is a backtick written in the comment: it CLOSES the literal, the file\n` +
         `       then fails to parse somewhere else entirely, and the error names a semicolon.`);
  }
}
ok(`no backtick in a sheet: ${sheets} CSS template literal(s)`);

/* ------------------------------------------------ 1c. TYPES, NOT GLOBALS --- */

/*
  ⚠️ THE PACKAGE HAS DOM *TYPES* AND MUST NEVER TOUCH A DOM *GLOBAL*. A component
  that renders a form control cannot be typed without `HTMLInputElement`, so the
  lib is on — and the moment it is on, `document.querySelector` typechecks and
  then throws on the server, where half of this package runs. The types are a
  build-time convenience; the globals are a runtime dependency, and only one of
  those is safe here.
*/
let globals = 0;
for (const file of walk(join(ROOT, "ui", "src"))) {
  stripComments(readFileSync(file, "utf8")).split("\n").forEach((line, i) => {
    const hit = /\b(document|window|navigator|localStorage)\s*\./.exec(line);
    if (!hit) return;
    globals++;
    fail(`${rel(file)}:${i + 1}: \`${hit[1]}\` at runtime.\n` +
         `       This package is rendered on the server. A DOM type is a build-time\n` +
         `       convenience; a DOM global is a crash in a worker.`);
  });
}
ok(`no dom global: ${globals} in ui/src`);

/* ------------------------------------------------------- 2. NO MOTION --- */

/*
  ⚠️ `transition: none` IS THE OPPOSITE OF WHAT THIS REFUSES. The reduced-motion
  reset REMOVES motion, and a guard that flagged it would push the removal
  somewhere it is not obvious — which is the one place motion must be visible.

  ⚠️ The lookahead sits directly after the colon rather than after a whitespace
  class. Put it later and the class backtracks to empty, the lookahead inspects
  " non" instead of "none", and the exemption never applies to the one line it
  was written for.
*/
const MOTION = /\b\d+m?s\b|cubic-bezier\s*\(|@keyframes|\b(?:transition|animation)\s*:(?!\s*none\b)/i;
let motion = 0;
for (const file of interfaceFiles) {
  const r = rel(file);
  if (r === CHOREOGRAPHER) continue;
  stripComments(readFileSync(file, "utf8")).split("\n").forEach((line, i) => {
    if (!MOTION.test(line)) return;
    motion++;
    fail(`${r}:${i + 1}: a duration, curve or transition outside ${CHOREOGRAPHER}.\n` +
         `       A component holds a ROLE in a scene and never a timing. Forty individually\n` +
         `       tasteful animations arriving at forty different times is a jungle no amount\n` +
         `       of taste prevents.`);
  });
}
ok(`no literal motion: ${motion} outside ${CHOREOGRAPHER}`);

/* ----------------------------------------------------- 3. THE BOUNDARY --- */

const registry = readFileSync(join(ROOT, "ui/src/registry.ts"), "utf8");
const owned = [...(/RENDERER_OWNS[^=]*=\s*\[([\s\S]*?)\]/.exec(registry)?.[1] ?? "").matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
if (owned.length < 10) fail(`ui/src/registry.ts: RENDERER_OWNS looks empty — the boundary is a list, and this is it.`);

/*
  ⚠️ A BOUNDARY IS A PROMISE IN BOTH DIRECTIONS. Forbidding an app to build its
  own dialog is only defensible if the package HAS one — otherwise the rule reads
  as "you may not have this", the first product that needs it breaks the boundary
  with a good reason, and the boundary is over.

  This half went unchecked for four stages: `RENDERER_OWNS` promised a
  breadcrumb, a toast, a form, a field, a select, a checkbox, a pagination, a
  save bar and bulk actions, and the package contained none of them. Nothing
  failed, because nothing asked.

  ⚠️ A FEW ENTRIES ARE PLACEMENTS RATHER THAN COMPONENTS — `dialog`, `sheet`,
  `drawer` and `popover` are `Overlay`'s five kinds, which is the design (two
  components would be where "the mobile version looks different" comes from), so
  they are satisfied by `overlay` and that mapping is written here rather than
  inferred.
*/
/* ⚠️ `tabs` is what the boundary calls it and `segmented` is what we built —
   one indicator that travels rather than two pills cross-fading. Registering
   both ids would be two components with one implementation. */
const SATISFIED_BY = { dialog: "overlay", sheet: "overlay", drawer: "overlay", popover: "overlay", confirm: "overlay", tabs: "segmented" };
const registered = new Set([...registry.matchAll(/\{\s*id:\s*"([a-z-]+)"/g)].map((m) => m[1]));
for (const promise of owned) {
  const behind = SATISFIED_BY[promise] ?? promise;
  if (registered.has(behind)) continue;
  fail(`ui/src/registry.ts: RENDERER_OWNS promises "${promise}" and no component provides it.\n` +
       `       An app may not build its own, so the package owes one. A boundary that\n` +
       `       forbids without providing is a boundary the first real product breaks.`);
}
ok(`boundary kept: ${owned.length} owned surface(s), every one provided`);

/**
 * ⚠️ AN APP MAY NOT DEFINE CHROME, AND MAY NOT REACH A RAW CONTROL. A bare
 * `<button>` has no state declaration, no hit-area floor, no refusal reason and
 * no place in the matrix anybody photographs — so it is the shape every one of
 * these rules is bypassed through at once.
 */
const appDirs = packages.filter((p) => p !== "ui" && p !== "kernel" && p !== "runtime");
let boundary = 0;
for (const appDir of appDirs) {
  for (const file of walk(join(ROOT, appDir, "src")).filter((f) => f.endsWith(".tsx"))) {
    const code = stripComments(readFileSync(file, "utf8"));
    code.split("\n").forEach((line, i) => {
      const raw = /<(button|input|select|textarea|dialog)\b/.exec(line);
      if (raw) {
        boundary++;
        fail(`${rel(file)}:${i + 1}: a raw <${raw[1]}>.\n` +
             `       It has no declared state, no hit-area floor and no refusal reason — every\n` +
             `       rule in the language, bypassed at once, in one tag.`);
      }
      const defining = /(?:export\s+)?(?:function|const)\s+(Shell|Nav|Dialog|Sheet|Drawer|Toast|EmptyState|Field|Button|Modal|Popover)\b/.exec(line);
      if (defining) {
        boundary++;
        fail(`${rel(file)}:${i + 1}: an app defining ${defining[1]}.\n` +
             `       The renderer owns the chrome. Allowed once, this is the real API within\n` +
             `       two quarters and the shared design system is a component library with\n` +
             `       extra steps.`);
      }
    });
  }
}
ok(`renderer boundary: ${appDirs.length} app(s), ${owned.length} owned surface(s), ${boundary} violation(s)`);

/* --------------------------------------------------------- 4. NO HOVER --- */

/**
 * ⚠️ A HOVER-ONLY INTERACTION IS ONE NO TOUCH DEVICE AND NO KEYBOARD CAN REACH.
 * It is also invisible in review, because whoever is reviewing has a mouse.
 */
let hoverOnly = 0;
for (const file of interfaceFiles.filter((f) => f.endsWith(".tsx"))) {
  const code = stripComments(readFileSync(file, "utf8"));
  const hasHover = /onMouseEnter|onMouseOver|onPointerEnter/.test(code);
  const hasReachable = /onClick|onPress|onFocus|onKeyDown/.test(code);
  if (hasHover && !hasReachable) {
    hoverOnly++;
    fail(`${rel(file)}: an interaction reachable only by hover.\n` +
         `       Hover is an enhancement. Anything it reveals must also be reachable by tap\n` +
         `       and by keyboard, or it does not exist for most of the people using it.`);
  }
}
ok(`hover is not required: ${hoverOnly} hover-only interaction(s)`);

/* ------------------------------------------------------- 5. LIVE HOST --- */

/**
 * ⚠️ THE LIVE SUBTREE IS RENDERED IN EXACTLY ONE PLACE, AND ONLY THE SOURCE CAN
 * SAY SO.
 *
 * A branch per presentation renders identically — one host, in one position, in
 * every snapshot — so no output test can tell it from the correct version. What
 * it actually does is tear down one child slot and build another, which is a
 * REMOUNT: the render loop stops, the media element reloads, the elapsed timer
 * restarts, and the thing the whole primitive exists to preserve is gone.
 *
 * The position is a data attribute. The element is the same element.
 */
const shell = join(ROOT, "ui/src/components/shell.tsx");
if (!existsSync(shell)) fail(`ui/src/components/shell.tsx is missing — the live host has no owner.`);
else {
  const code = stripComments(readFileSync(shell, "utf8"));
  const hosts = [...code.matchAll(/data-one="live"/g)];
  if (hosts.length !== 1) {
    fail(`ui/src/components/shell.tsx: the live subtree is rendered in ${hosts.length} places.\n` +
         `       A branch per presentation renders identically and IS a remount — React tears\n` +
         `       down one child slot and builds the other, taking the render loop, the media\n` +
         `       element and the elapsed timer with it.`);
  }
  /*
    And the subtree itself may appear once. Rendering `{liveSurface}` in two
    branches is the same defect one level in, and just as invisible.
  */
  const children = [...code.matchAll(/\{liveSurface\}/g)];
  if (children.length !== 1) {
    fail(`ui/src/components/shell.tsx: the live children are rendered in ${children.length} places.`);
  }
  ok(`live host: rendered once, moved by attribute`);
}

/* -------------------------------------------------------------------------- */

if (bad) {
  console.error(`\n${bad} interface failure(s).`);
  process.exit(1);
}
console.log(`\ninterface: colour in one layer, motion in one clock, chrome in one place.`);
