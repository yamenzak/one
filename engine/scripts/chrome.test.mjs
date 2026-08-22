/**
 * THERE IS ONE CHROME, AND IT HAS THREE PIECES.
 *
 * @design one crown, one foot, and nothing else pinned to an edge — the head carries slots, the foot carries the navigation or the one act.
 *
 * ⚠️ EVERY CHROME DEFECT THIS REPOSITORY HAS HAD WAS A SECOND ONE. A screen that
 * pins its own bar, a door that hand-rolls a header, a foot that draws a
 * navigation AND an action — each is somebody solving a problem the frame had
 * already solved, in a file where nothing could see the two answers disagree. The
 * crown was a hand-assembled `<header>` in the Shell for months, which is exactly
 * why it was the one that scrolled away, the one with a separator under it, and
 * the one whose controls were three different heights.
 *
 * ⚠️ SO THE RULE IS ABOUT PINNING, NOT ABOUT NAMES. `<Crown>` is fine anywhere —
 * it IS the chrome, and a door with no shell around it legitimately renders one.
 * What must not exist is a second thing STUCK TO AN EDGE, because that is the
 * act a person reads as chrome whatever it is called. Named components would
 * need an exemption list; the edge needs none.
 *
 * ⚠️ AND WHAT PINS MUST WEAR THE HEM. Content does not stop at a floating bar, it
 * arrives at the control's own edge and is sliced by it. `scene.test.mjs` holds
 * that half; this one holds that there is nothing else to hold it FOR.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ENGINE, appDirs } from "./lib/trees.mjs";

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const filesIn = (dir, ext = /\.tsx$/) => {
  const at = join(ENGINE, dir);
  if (!existsSync(at)) throw new Error(`${dir} is not there — a guard reading nothing reports green`);
  const out = [];
  const walk = (path) => {
    for (const e of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, e.name);
      if (e.isDirectory()) walk(full);
      else if (ext.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(full);
    }
  };
  walk(at);
  return out;
};

const rel = (p) => p.slice(ENGINE.length + 1);

/** ⚠️ THE FRAME, which is the one place a pinned surface may be declared. */
const FRAME = "design/src/frame";

/**
 * ⚠️ EVERYWHERE A SURFACE IS DRAWN EXCEPT THE FRAME ITSELF — the design system's
 * own parts, the deployment's screens, and every app including the one added
 * tomorrow. `lib/trees.mjs` is the one walk, so a product cannot be outside the
 * corpus by being new.
 */
const OUTSIDE = [
  ...filesIn("design/src").filter((f) => !rel(f).startsWith(FRAME)),
  ...filesIn("one-space/src"),
  ...appDirs().flatMap((d) => filesIn(d)),
];

/**
 * ⚠️ AND EVERY FILE, NOT ONLY THE ONES THAT DRAW. The seal below is about
 * numbers and readings as much as markup, and those live in `.ts` as happily as
 * in `.tsx`.
 */
const OUTSIDE_ALL = [
  ...filesIn("design/src", /\.tsx?$/).filter((f) => !rel(f).startsWith(FRAME)
    && !rel(f).startsWith("design/src/tokens")),
  ...filesIn("one-space/src", /\.tsx?$/),
  ...appDirs().flatMap((d) => filesIn(d, /\.tsx?$/)),
];

/* ------------------------------------------------- the chrome is sealed --- */

/**
 * THE MECHANISM HAS TWO HOMES AND NOWHERE ELSE MAY REACH INTO IT.
 *
 * ⚠️ THE GEOMETRY COST MORE TO FIND THAN IT LOOKS LIKE IT DID, WHICH IS WHY IT
 * IS SEALED RATHER THAN DOCUMENTED. How far the veil is solid is set by the
 * height of the controls standing on that edge; how far it fades is bounded by
 * the rate a gradient becomes findable at; where a page's name hands over to the
 * crown is the heading's box against that same solid depth; what the page
 * reserves for a pinned bar has to grow with the safe area the bar pads by.
 * Every one of those is a relationship between two numbers in two files, and
 * every one of them was got wrong at least once by changing one of the two.
 *
 * ⚠️ A SECOND COPY IS THE FAILURE, NOT A SECOND VALUE. Nothing here forbids a
 * product from looking different; what it forbids is a product ANSWERING these
 * questions again — reading the scroll to fade its own header, padding its own
 * edge by the safe area, writing the hem's own property. Each of those is one
 * line, each looks local, and each produces two chromes that agree until the day
 * the shared one is retuned.
 *
 * ⚠️ THE FRAME AND THE TOKENS ARE THE TWO HOMES. `design/src/frame` composes it,
 * `design/src/tokens` holds the numbers and emits the CSS. Everything else —
 * this design system's own parts, the deployment's screens, and every app
 * including the one added tomorrow — is a consumer.
 */
{
  const SEALED = [
    {
      what: "the safe area",
      of: /env\(safe-area-inset-/,
      why: "`SAFE_TOP` and `SAFE_BOTTOM` are the frame's, and what a page reserves\n"
        + "       for a pinned bar (`NAV_SPACE`, `ACTION_SPACE`) grows by the same env().\n"
        + "       Padding an edge locally is a second answer that does not.",
    },
    {
      what: "the hem's strength",
      of: /--hem-(?:top|bottom)\b/,
      why: "It is the amount of page behind the hem, written by `Page` from one\n"
        + "       scroll reading. A second writer is two answers on one property.",
    },
    {
      what: "the hem's marker",
      of: /\bdata-hem\b/,
      why: "It is what makes a surface wear the vignette. On anything the frame did\n"
        + "       not pin, it draws a veil for a chrome that is not there.",
      /* ⚠️ THE HARNESS READS IT TO FIND THE CHROME, which is the opposite of
         declaring one — and it is the only file that may. */
      but: "design/src/measure/index.tsx",
    },
    {
      what: "the scroll reading",
      of: /\buseScrolling\b/,
      why: "Both hems and the crown's hand-off are driven by it, from whatever is\n"
        + "       actually scrolling. A screen reading the scroll itself is a second\n"
        + "       collapsing header, tuned against nothing.",
    },
    {
      what: "the veil's own depth",
      of: /\bHEM_HOLD\b/,
      why: "It is how far the veil is opaque, so it is also where a page's name stops\n"
        + "       being legible — which is why the crown's hand-off measures against it.\n"
        + "       A copy is a hand-off tuned against a hem that has since moved.",
    },
  ];

  const broke = [];
  for (const rule of SEALED) {
    for (const file of OUTSIDE_ALL) {
      if (rule.but && rel(file) === rule.but) continue;
      const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      if (rule.of.test(src)) broke.push({ rule, at: rel(file) });
    }
  }

  if (!OUTSIDE_ALL.length) {
    fail("chrome: no files outside the frame — this seal is reading nothing.");
  } else if (broke.length) {
    for (const { rule, at } of broke) {
      fail(`${at}: reaches into ${rule.what}, which is the frame's.\n       ${rule.why}`);
    }
  } else {
    ok(`sealed: ${OUTSIDE_ALL.length} file(s) outside the frame, none holding a `
      + `second copy of its ${SEALED.length} mechanisms`);
  }
}

/* --------------------------------------------------------- one chrome, one --- */

/**
 * ⚠️ `sticky`/`fixed` AT ONE VIEWPORT EDGE, WHICH IS WHAT MAKES A THING CHROME.
 * `top-0` and `bottom-0` leave the page visible past them, so content arrives at
 * the surface's own edge and is cut by it — that is the fault, and it is why the
 * hem exists.
 *
 * ⚠️ A FULL-VIEWPORT COVER IS NOT ONE OF THESE, and the first version of this
 * check said it was. `fixed inset-0` is the opening, the curtain, a modal
 * backdrop: it covers everything, so nothing passes its edge and there is no
 * collision to dissolve. Reading it as chrome would have made the guard's first
 * finding a component that is doing exactly the right thing — which is how a
 * check gets waived rather than obeyed.
 *
 * ⚠️ AND A `sticky top-16` SECTION HEADING INSIDE A LIST IS NOT ONE EITHER: it
 * pins to a scroller, not to the screen.
 */
const PINNED = /\b(?:sticky|fixed)\b[^"'`]*\b(?:top-0|bottom-0)\b/;

{
  const rogue = [];
  for (const file of OUTSIDE) {
    const src = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
    for (const tag of src.matchAll(/<[a-zA-Z][^<>]*?>/gs)) {
      if (PINNED.test(tag[0])) {
        rogue.push(`${rel(file)}: <${/^<(\w+)/.exec(tag[0])?.[1] ?? "?"}>`);
      }
    }
  }
  if (!OUTSIDE.length) {
    fail("chrome: no files outside the frame — this guard is reading nothing.");
  } else if (rogue.length) {
    fail(`chrome: ${rogue.length} surface(s) pinned to a viewport edge outside `
      + `\`${FRAME}\`:\n       ${rogue.join("\n       ")}\n`
      + `       A second thing stuck to an edge is a second chrome, whatever it is called —\n`
      + `       and it will not wear the hem, so the page is sliced by its edge. The frame\n`
      + `       declares three (\`Crown\`, \`Docked\`, \`Island\`); compose one of those.`);
  } else {
    ok(`chrome: ${OUTSIDE.length} file(s) outside the frame, none pinning its own edge`);
  }
}

/* ------------------------------------------------------- the head is a crown --- */

/**
 * ⚠️ ONE `<header>` IN THE PRODUCT, AND IT IS THE CROWN'S. This is the element a
 * hand-rolled chrome reaches for first, and the Shell's own was one for months —
 * a face, two stacked names and a strip of buttons, assembled where nothing could
 * compare it to the component it was duplicating.
 */
{
  const heads = [];
  for (const file of [...OUTSIDE, ...filesIn(FRAME)]) {
    /* ⚠️ COMMENTS FIRST. Two files explain the hand-rolled `<header>` this rule
       exists to prevent, and prose about a fault is not the fault. */
    const src = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
    for (const tag of src.matchAll(/<header[\s>]/g)) {
      heads.push(rel(file));
      void tag;
    }
  }
  const stray = heads.filter((f) => f !== `${FRAME}/crown.tsx`);
  if (!heads.length) {
    fail("head: no `<header>` anywhere — the crown is what this guard is about.");
  } else if (stray.length) {
    fail(`head: ${stray.length} \`<header>\` outside the crown: ${[...new Set(stray)].join(", ")}\n`
      + `       The crown carries the slots a screen may fill — a way out, a search, two\n`
      + `       actions, the one act. A second header answers the same question with a\n`
      + `       different set, and the two drift the day either gets a new slot.`);
  } else {
    ok(`head: ${heads.length} header in the product, and it is the crown`);
  }
}

/* -------------------------------------------------- the foot is one or other --- */

/**
 * ⚠️ A SCREEN HAS A NAVIGATION OR AN ACT AT ITS FOOT, NEVER BOTH. They pin to the
 * same place. Overridden for one day, the result was 180px of an 844px phone in
 * two objects with a gap between them, and a content column reserving room for
 * one of them — so the last row sat under the other permanently.
 *
 * ⚠️ THE CHECK IS THAT THE DOCK IS CONDITIONAL, not that the words are present.
 * `Screen` may only draw a `Docked` where nothing above it has taken the act, and
 * that condition is the whole mechanism: without it the two are independent and
 * both appear on any screen that has a nav and an action.
 */
{
  const at = join(ENGINE, FRAME, "screen.tsx");
  const src = readFileSync(at, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const draws = [...src.matchAll(/<Docked\b/g)].length;
  /* The dock is reached only through a test on where the act belongs. */
  const gated = /\bsocketed\b[\s\S]{0,80}?<Docked|\bfoot\b[\s\S]{0,80}?<Docked/.test(src);
  if (!draws) {
    fail(`foot: ${FRAME}/screen.tsx draws no dock — this guard is reading the wrong file.`);
  } else if (!gated) {
    fail(`foot: ${FRAME}/screen.tsx draws a dock without asking what is already there.\n`
      + `       A nav and an act pin to the same place, so a screen with both puts 180px of\n`
      + `       a phone into two objects with a gap between them — and the column reserves\n`
      + `       room for one, so the last row sits under the other at every scroll position.`);
  } else {
    ok(`foot: the dock is drawn only where nothing above it has taken the act`);
  }
}

/* ----------------------------------------------------- and the slots are two --- */

/**
 * ⚠️ THE CROWN'S TRAIL IS TWO, AND THE SLICE HAPPENS ONCE. A screen may declare
 * any number of actions; two is what the row holds. Sliced at the call site it is
 * sliced differently per caller, and the crown silently drops the third — which is
 * a control somebody put there on purpose, gone with nothing said.
 */
{
  const at = join(ENGINE, FRAME, "screen.tsx");
  const src = readFileSync(at, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  if (!/\[\s*also\[0\]\s*,\s*also\[1\]\s*\]/.test(src)) {
    fail(`slots: ${FRAME}/screen.tsx no longer caps the crown's trail at two.\n`
      + `       The row holds two. Uncapped, a third action is dropped by whichever\n`
      + `       component runs out of room first, which is not a decision anybody made.`);
  } else {
    ok("slots: a screen's actions are capped where the crown's row is, once");
  }
}

console.log(bad
  ? `\nchrome: ${bad} finding(s) — a second answer to where the chrome is.`
  : `\nchrome: one crown, one foot, and nothing else stuck to an edge.`);

process.exit(bad ? 1 : 0);
