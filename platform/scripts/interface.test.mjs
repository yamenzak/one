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
 * ⚠️ THE TOKEN LAYER IS TWO FILES, NAMED. Widening this list is a visible edit
 * to this line, which is the entire value of a chokepoint: the question stops
 * being "is this colour reasonable" and becomes "is this file allowed to have
 * one at all".
 */
const TOKEN_LAYER = ["ui/src/colour.ts", "ui/src/ground.ts", "ui/src/brand.ts"];
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

/* ------------------------------------------------------- 2. NO MOTION --- */

const MOTION = /\b\d+m?s\b|cubic-bezier\s*\(|@keyframes|\btransition\s*:|\banimation\s*:/i;
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

/* -------------------------------------------------------------------------- */

if (bad) {
  console.error(`\n${bad} interface failure(s).`);
  process.exit(1);
}
console.log(`\ninterface: colour in one layer, motion in one clock, chrome in one place.`);
