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
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(ENGINE.length + 1);

const filesIn = (dir, re) => {
  const at = join(ENGINE, dir);
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
  ...filesIn("design/src", /\.(tsx?|css)$/),
  ...filesIn("one-space/src", /\.(tsx?|css)$/),
  ...readdirSync(join(ENGINE, "apps"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) => filesIn(`apps/${e.name}/src`, /\.(tsx?|css)$/)),
];

/** ⚠️ Comments describe the rules; matching them reports each rule as its own breach. */
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * ⚠️ `motion.ts` AND `theme.ts` ARE THE VOCABULARY, so they are where the values
 * live. Everything else names them. The list can only shrink.
 */
const DEFINES_MOTION = new Set(["design/src/tokens/motion.ts", "design/src/tokens/theme.ts"]);

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
         `       them. Use \`EASE\` / \`MOTION\` from @engine/design.`);
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
 * ⚠️ THE RULE IS "EVERY MOTION ANSWERS TO THE SETTING", AND A BAN ON KEYFRAMES
 * WAS A PROXY FOR IT. The proxy was right for a year and then a chart needed a
 * reveal — a thing with no prior state, which a transition cannot express
 * without a mount effect and a forced reflow. Refusing it would have meant
 * either no animated charts or a JS tween, and a tween is the one form of motion
 * that genuinely cannot be switched off. The narrow check is the one that gets
 * waived; this one asks the real question instead.
 *
 * ⚠️ SO A KEYFRAME IS LEGAL WHEN THE SAME FILE SWITCHES IT OFF BOTH WAYS: the
 * media query for the OS setting, and the `data-reduce-motion` ancestor for the
 * in-app one. Either alone leaves half the people who asked still watching it.
 *
 * ⚠️ AND A KEYFRAME INSIDE A GENERATED PICTURE ANSWERS THE SAME QUESTION WITH
 * DIFFERENT MACHINERY. A scene's motion lives in a `<style>` element inside its
 * own SVG (`scene/`), which is a document of its own: `data-reduce-motion` on an
 * ancestor of the page is invisible to it, and no selector of ours crosses the
 * boundary. What covers the in-app switch there is a SECOND BAKE — the still
 * picture, served instead — so the shape to look for is the media query the SVG
 * carries PLUS a conditionally emitted `<style>`: the branch that produces the
 * still picture is the in-app opt-out. Accepting the page's spelling and refusing
 * this one would have meant either an unswitchable animation or no generated
 * motion at all.
 *
 * ⚠️ THE CONDITION IS WHAT IS CHECKED, NOT THE WORD "moving". The first version
 * looked for that identifier and passed a mutation that removed the branch
 * entirely — `Variant.moving` is a different thing in the same file, and one
 * name matching somewhere is not an assertion about anything.
 */
/*
  ⚠️ ONE LEGAL SHAPE, AND THIS USED TO HAVE TWO. The second was "a generated
  picture carries its own `<style>` with its own `no-preference` guard, and a
  still bake to serve instead" — which is a good design and blessed a defect:
  Chromium renders an SVG used as `background-image` STATICALLY, so a keyframe
  declared inside one never ran at all. The rule was excusing motion that did not
  exist. A generated field is a live element now and its beats are ordinary page
  CSS, so there is one shape again: the system preference AND the switch a person
  can reach inside the app.
*/
const offBoth = (src, name) =>
  new RegExp(`animation:[^;]*${name}`).test(src)
  && (/prefers-reduced-motion:\s*(reduce|no-preference)/.test(src)
    && /data-reduce-motion="true"/.test(src));

let frames = 0;
for (const file of SOURCES) {
  const src = strip(readFileSync(file, "utf8"));
  for (const [, name] of src.matchAll(/@keyframes\s+([\w-]+)/g)) {
    if (offBoth(src, name)) continue;
    frames++;
    fail(`${rel(file)}: declares @keyframes ${name} and does not switch it off.\n` +
         `       A keyframe is legal only where the SAME file turns it off for both\n` +
         `       \`prefers-reduced-motion\` and a \`data-reduce-motion\` ancestor.\n` +
         `       It sits outside HeroUI's reduced-motion handling, so it keeps moving\n` +
         `       for somebody who asked it to stop. Use a transition on a token.`);
  }
}
if (!frames) ok(`keyframes: every one is switched off both ways`);

/* ------------------------------------------------------------------- roles --- */

const typeSrc = readFileSync(join(ENGINE, "design/src/tokens/type.ts"), "utf8");
const roles = [...typeSrc.matchAll(/^\s{2}(\w+):\s*"/gm)].map((m) => m[1]);
if (roles.length < 4) {
  fail(`design/src/tokens/type.ts: fewer than four roles — the scale is what everything else names.`);
} else {
  ok(`roles: ${roles.join(", ")}`);
}

/**
 * ⚠️ A TYPE UTILITY ON OUR OWN ELEMENT IS THE HOLE THE RESTYLE GUARD LEAVES.
 * That one refuses `text-2xl` on a HeroUI component; nothing stopped it on a
 * bare `<h1>`, which is exactly where a screen reaches for one.
 */
const DEFINES_TYPE = new Set(["design/src/tokens/type.ts", "design/src/parts/heads.tsx"]);
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

/**
 * ⚠️ THE SCALE HAS A TOP, AND FOR A WHILE IT DID NOT. `title` and `figure` were
 * both `text-2xl`, so the number a whole screen was built around rendered at
 * exactly the size of the heading above it, and every hero read as a slightly
 * larger caption. Nothing was broken and nothing looked wrong in isolation —
 * which is the failure mode this whole file exists for.
 *
 * ⚠️ SO THE STEPS ARE CHECKED AS AN ORDER, not as values. What size `display`
 * should be is a design decision that will change; that it must be larger than
 * a title, which must be larger than a section, which must be larger than body
 * text, is the property that makes it a scale at all.
 */
const TYPE_SRC = readFileSync(join(ENGINE, "design/src/tokens/type.ts"), "utf8");
const STEP = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, "2xl": 24, "3xl": 30, "4xl": 36, "5xl": 48 };
const sizeOf = (role) => {
  const decl = new RegExp(`\\b${role}: "([^"]*)"`).exec(TYPE_SRC);
  if (!decl) return null;
  const rem = /text-\[([\d.]+)rem\]/.exec(decl[1]);
  if (rem) return Number(rem[1]) * 16;
  const named = /\btext-((?:[0-9]?xl)|xs|sm|base|lg)\b/.exec(decl[1]);
  return named ? STEP[named[1]] ?? null : null;
};
const LADDER = ["display", "title", "section", "body", "note"];
const steps = LADDER.map((r) => [r, sizeOf(r)]);
const missing = steps.filter(([, px]) => px === null).map(([r]) => r);
if (missing.length) {
  fail(`type.ts: cannot read a size for ${missing.join(", ")} — the scale guard is blind.`);
} else {
  const wrong = steps.slice(1).filter(([, px], i) => px >= steps[i][1]);
  if (wrong.length) {
    fail(`type.ts: the scale does not descend — ${steps.map(([r, px]) => `${r} ${px}px`).join(" · ")}.\n` +
         `       A role that is not larger than the one under it is a scale with no top,\n` +
         `       and a hero that renders at the size of its own heading.`);
  } else {
    ok(`scale: ${steps.map(([r, px]) => `${r} ${px}`).join(" > ")}`);
  }
}

/**
 * ⚠️ DITHER IS NOISE, AND A REPEATING GRADIENT IS THE OPPOSITE OF NOISE. The
 * grain layer shipped as two dot fields at 3px and 5px, described in its own
 * comment as invisible, and it was plainly a grid on any light ground — two
 * pitches that close beat into a lattice, which is the exact fault the layer
 * exists to hide. It survived review because it was only ever looked at
 * whole-page, in dark, at one-to-one.
 *
 * ⚠️ SO THE CHECK IS STRUCTURAL: whatever paints the grain must be real noise.
 * "Is this visible" is not a question a script can ask, but "is this periodic"
 * is the same question with an answer.
 */
const AMBIENCE = readFileSync(join(ENGINE, "design/src/tokens/ambience.ts"), "utf8");
const grain = /const GRAIN = ([\s\S]*?);\n/.exec(AMBIENCE);
if (!grain) {
  fail(`ambience.ts: no \`GRAIN\` to check — if the layer is gone, drop this guard on purpose.`);
} else if (!/feTurbulence/.test(AMBIENCE) || /repeating-|radial-gradient/.test(grain[1])) {
  fail(`ambience.ts: the grain is periodic, so it is a pattern rather than dither.\n` +
       `       A repeating gradient has a pitch, and two pitches beat into a visible\n` +
       `       lattice on any light ground. Use \`feTurbulence\` — every pixel independent.`);
} else {
  ok(`grain: the dither is noise, with no pitch to see`);
}

/*
  ⚠️ THIS IS WHERE THE `thread()` / `etch()` CHECK WAS, AND IT IS RETIRED ON
  PURPOSE RATHER THAN LOST. Its own failure message said so: "if the fibres are
  gone, drop this check on purpose." They are gone.

  ⚠️ WHAT IT PROTECTED WAS REAL AND IS NOW STRUCTURAL. Micro-texture is a SIGN
  problem, not a strength one: a field of marks finer than the eye separates
  reads as sheen on near-black and as GRIME on paper, and no multiplier fixes a
  sign — which is why light mode had to turn the fibres off outright with a knob
  every new ambience had to remember. Twenty-four hand-written grounds each had
  to remember it, and that is exactly the class of thing a guard is for.

  ⚠️ A FAMILY DECLARES A `day` OF ITS OWN INSTEAD. There is nothing left to
  remember: the light sky is a different set of decisions rather than the dark
  one turned down, so `cloth` draws black thread at a third the weight and
  `etch` halves rather than kills its rules, each said once in the file that
  owns it. A guard over a knob that no longer exists is a guard that can only
  ever be wrong.
*/

console.log(bad
  ? `\nmotion: ${bad} finding(s) — a product with no motion and no typography of its own.`
  : `\nmotion: one set of curves, one set of roles, and reduced motion answered.`);
process.exit(bad ? 1 : 0);
