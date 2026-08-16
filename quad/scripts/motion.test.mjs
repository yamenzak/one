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
const DEFINES_MOTION = new Set(["web/src/tokens/motion.ts", "web/src/tokens/theme.ts"]);

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
const offBoth = (src, name) => {
  if (!new RegExp(`animation:[^;]*${name}`).test(src)) return false;
  /* The page's two opt-outs. */
  if (/prefers-reduced-motion:\s*reduce/.test(src) && /data-reduce-motion="true"/.test(src)) return true;
  /* A generated picture's: its own guard, plus a still bake to serve instead. */
  return /prefers-reduced-motion:\s*no-preference/.test(src)
    && /\?\s*`?<style>/.test(src);
};

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

const typeSrc = readFileSync(join(QUAD, "web/src/tokens/type.ts"), "utf8");
const roles = [...typeSrc.matchAll(/^\s{2}(\w+):\s*"/gm)].map((m) => m[1]);
if (roles.length < 4) {
  fail(`web/src/tokens/type.ts: fewer than four roles — the scale is what everything else names.`);
} else {
  ok(`roles: ${roles.join(", ")}`);
}

/**
 * ⚠️ A TYPE UTILITY ON OUR OWN ELEMENT IS THE HOLE THE RESTYLE GUARD LEAVES.
 * That one refuses `text-2xl` on a HeroUI component; nothing stopped it on a
 * bare `<h1>`, which is exactly where a screen reaches for one.
 */
const DEFINES_TYPE = new Set(["web/src/tokens/type.ts", "web/src/frame/layout.tsx"]);
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
const TYPE_SRC = readFileSync(join(QUAD, "web/src/tokens/type.ts"), "utf8");
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
const AMBIENCE = readFileSync(join(QUAD, "web/src/tokens/ambience.ts"), "utf8");
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

/**
 * ⚠️ MICRO-TEXTURE DIES IN LIGHT, AND IT IS A SIGN PROBLEM RATHER THAN A
 * STRENGTH ONE. The ambience threads and dot fields are marks of the brand over
 * the ground: darker-than-nothing on a near-black screen, which reads as sheen,
 * and darker-than-the-paper on a light one, which reads as grime — a hero over
 * hatching that a person described, accurately, as dusty and dirty. `--sky`
 * already halves light mode and it still showed, because no multiplier fixes a
 * sign. So every sub-pixel pattern layer must run through `thread()`, which
 * carries the knob light turns off — and a new ambience whose fibres bypass it
 * is this exact complaint shipping again.
 *
 * ⚠️ MACRO LINE-WORK IS THE ONE PERMITTED EXCEPTION, AND PITCH IS THE LINE.
 * `etch()` carries its own knob that light only DIMS: rings at 56px and graph
 * lines at 44px are sparse enough that each line reads as printing, not grime.
 * The boundary is 24px — an `etch()` layer at a finer pitch is a fibre wearing
 * the wrong helper, and it fails here rather than shipping the complaint with
 * a new name.
 */
const fibres = [...AMBIENCE.matchAll(/repeating-linear-gradient\([^,]+,\s*\$\{(\w+)\([^`]*?(\d+)px\)`/g),
  ...AMBIENCE.matchAll(/radial-gradient\(\$\{(\w+)\([^)]*\)\}\s*0?\.\d+px/g)];
const loose_ = fibres.filter(([, fn]) => fn !== "thread" && fn !== "etch");
const fine_ = fibres.filter(([, fn, pitch]) => fn === "etch" && Number(pitch ?? 0) < 24);
if (!fibres.length) {
  fail(`ambience.ts: no texture layers found — if the fibres are gone, drop this check on purpose.`);
} else if (loose_.length || fine_.length) {
  for (const [whole, fn] of loose_) {
    fail(`ambience.ts: a texture layer bypasses \`thread()\`/\`etch()\` — \`${whole.slice(0, 60)}…\` uses \`${fn}()\`.
` +
         `       Fine dark marks on light paper are grime; the knob light turns off is
` +
         `       \`--thread\`, and only \`thread()\` carries it. Macro line-work (≥24px) may use \`etch()\`.`);
  }
  for (const [whole, , pitch] of fine_) {
    fail(`ambience.ts: an \`etch()\` layer at ${pitch}px pitch — that is micro-texture, and it
` +
         `       must use \`thread()\` so light can turn it off. \`${whole.slice(0, 60)}…\``);
  }
} else if (!/--thread: 0/.test(AMBIENCE)) {
  fail(`ambience.ts: nothing sets \`--thread: 0\` in light, so every fibre still shows there.`);
} else if (!/--etch: 0?\.\d+/.test(AMBIENCE)) {
  fail(`ambience.ts: nothing dims \`--etch\` in light — etched lines at dark strength on paper.`);
} else {
  ok(`threads: ${fibres.length} texture layer(s) — fibres die in light, etching dims`);
}

console.log(bad
  ? `\nmotion: ${bad} finding(s) — a product with no motion and no typography of its own.`
  : `\nmotion: one set of curves, one set of roles, and reduced motion answered.`);
process.exit(bad ? 1 : 0);
