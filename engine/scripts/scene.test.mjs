/**
 * THE SCENE ENGINE'S FOUR PROMISES.
 *
 * ⚠️ EACH ONE IS A THING THAT CANNOT BE SEEN IN A SCREENSHOT AND CANNOT BE
 * CAUGHT AT RUNTIME. A world seeded from a clock looks perfect until somebody
 * reloads; a layer animated on the wrong property looks identical and costs a
 * repaint of the whole viewport every frame; a wash over a ground looks fine on
 * the screen that added it and makes every workspace's brand grey; a count where
 * a rate belongs is right on one device.
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
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "");

const filesIn = (dir, ext = /\.tsx?$/) => {
  const at = join(ENGINE, dir);
  if (!existsSync(at)) return [];
  const out = [];
  const walk = (path) => {
    for (const e of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, e.name);
      if (e.isDirectory()) walk(full);
      else if (ext.test(e.name)) out.push(full);
    }
  };
  walk(at);
  return out;
};

/*
  ⚠️ THE PATH IS ASSERTED, NOT ASSUMED. The first version of this pointed at
  `engine/scene` — the engine is at `design/src/scene` — so every check ran over an
  empty list and the guard reported four cheerful passes. A check that finds
  nothing and says so in green is worse than no check, because it is also a
  claim.
*/
const SCENE = filesIn("design/src/scene");
if (!SCENE.length) {
  fail("design/src/scene: the engine is not where this guard looks.\n" +
       "       Every check below would pass over an empty list, which is a green run " +
       "asserting nothing.");
}
const DRAWN = [...filesIn("design/src"), ...filesIn("one-space/src")];

/* ---------------------------------------------- a world is never random --- */
{
  /*
    ⚠️ A SCENE IS AN IDENTITY. The workspace somebody recognises by its sky must
    have that sky on every device and after every deploy — so the engine's only
    source of variation is the seed. `Math.random` here would produce a world
    that is different on every reload, which nobody reports as a bug because
    nobody can hold two of them side by side.
  */
  const loose = SCENE.filter((f) => /Math\.random|Date\.now|new Date\(/.test(code(readFileSync(f, "utf8"))));
  if (loose.length) {
    fail(`${loose.map(rel).join(", ")}: a scene varies by something other than its seed.\n` +
         `       Same seed, same world, forever — a clock or a random makes it a different ` +
         `place on every reload.`);
  } else ok(`seed: ${SCENE.length} engine file(s), nothing varying but the seed`);
}

/* ------------------------------------------- a layer animates cheaply --- */
{
  /*
    ⚠️ OPACITY AND TRANSFORM ARE THE ONLY TWO A COMPOSITOR CAN ANIMATE WITHOUT
    TOUCHING LAYOUT OR PAINT. Anything else on a full-viewport layer is a repaint
    of the whole screen every frame, for ever, on a phone — and it looks exactly
    the same on the laptop it was written on. `background-position` is the one
    everybody reaches for and the most expensive of them.
  */
  const CHEAP = /^(opacity|transform)$/;
  let props = 0;
  for (const file of SCENE) {
    const src = code(readFileSync(file, "utf8"));
    for (const m of src.matchAll(/@keyframes[^{]*\{([\s\S]*?)\}\s*\}/g)) {
      for (const [, prop] of m[1].matchAll(/([a-z-]+)\s*:/g)) {
        props++;
        if (!CHEAP.test(prop)) {
          fail(`${rel(file)}: a keyframe animates \`${prop}\`.\n` +
               `       Only opacity and transform stay on the compositor; anything else repaints ` +
               `the viewport every frame and is invisible on the machine it was written on.`);
        }
      }
    }
  }
  /*
    ⚠️ ZERO IS THE CORRECT ANSWER HERE, AND THE SENTENCE HAS TO SAY WHICH ZERO IT
    IS. A family does not write its own keyframes — the ambience engine emits
    every one of them — so this asks whether any family has started, and finding
    none is the pass. What it does NOT check is whether the engine's own
    keyframes stay on the compositor: those are built in JS, so no regex over the
    source can read them, and `design/test/scene.test.ts` runs the generator and
    reads the CSS instead. This printed `0 animated properties, all
    compositor-only` for as long as the engine's keyframes existed elsewhere.
  */
  if (!bad) {
    ok(`motion: ${SCENE.length} family file(s), ${props} writing keyframes of their own`);
  }
}

/* ------------------------------------- a ground is masked, never washed --- */
{
  /*
    ⚠️ A GROUND THAT HAS TO BE COVERED IS A GROUND THAT IS TOO LOUD, and the
    cover is a grey film over somebody's brand. A scene RECEDES where content
    sits — its own alpha drops, so the page's ground shows through and the world
    is still at full strength at the edges (`MATTE`). A screen that reaches for a
    scrim has taken that decision locally, where nobody can see it from outside
    and every other screen keeps its own.
  */
  const WASH = /\b(?:bg-(?:black|white)\/\d+|backdrop-(?:brightness|contrast|grayscale))\b|rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0?\.\d/;
  let hits = 0;
  for (const file of DRAWN) {
    const src = code(readFileSync(file, "utf8"));
    const m = src.match(WASH);
    if (m) {
      hits++;
      fail(`${rel(file)}: washes its ground — \`${m[0]}\`.\n` +
           `       A scene recedes under content instead of being covered; a scrim dims every ` +
           `workspace's world to fix one screen's contrast.`);
    }
  }
  if (!hits) ok(`wash: ${DRAWN.length} file(s), no scrim over anybody's ground`);
}

/* ---------------------------------------- density is a rate, not a count --- */
{
  /*
    ⚠️ A COUNT IS RIGHT FOR ONE CANVAS AND WRONG FOR EVERY OTHER — the same field
    is sparse on a desktop and crowded on a phone, and whichever one it was tuned
    on is the one that looks correct. A family declares an amount the engine can
    SCALE, never a number of marks.

    ⚠️ TWO PRIMITIVES, ONE RULE, and the second is why this reads for either. A
    SPECK is scattered, so its amount is `per` — elements per megapixel. A TILE is
    laid on a lattice, which has no count at all: it fills what it is given, and
    its only knob is the `cell`. Both survive a change of screen; a literal count
    survives one screen.
  */
  const families = SCENE.filter((f) => /:\s*Family\b/.test(readFileSync(f, "utf8")));
  let marks = 0;
  for (const file of families) {
    const src = readFileSync(file, "utf8");
    for (const [, block] of src.matchAll(/\bid:\s*"[^"]+",\s*([\s\S]{0,200}?)variants:/g)) {
      marks++;
      if (!/\b(?:per|cell):\s*\d/.test(block)) {
        fail(`${rel(file)}: a mark kind declares neither \`per\` nor \`cell\`.\n` +
             `       A scatter is sized per megapixel and a lattice by its cell, so one world ` +
             `is the same world at every size. A count is tuned for whichever screen it was ` +
             `written on.`);
      }
    }
  }
  if (!bad) ok(`density: ${marks} mark kind(s), every one sized by area or by cell`);
}

/* ------------------------------------------ a scene is bound, not built --- */
{
  /*
    ⚠️ A SCENE IS THREE CONSEQUENCES OF ONE DECLARATION, AND A SCREEN THAT
    ASSEMBLES ITS OWN GETS TWO OF THEM. The OneSpace used to derive the ground, the
    hero face and the density from the same slug in three separate expressions:
    `worldOf(where.slug)`, `placeFace(where.slug)` and a ternary on whether the
    first returned anything. All three have to agree and nothing could tell when
    they did not — edit one and the crown wears one workspace's planet over
    another workspace's sky, which is invisible in a screenshot of either.

    ⚠️ SO THE COMPOSER IS THE VOCABULARY'S AND A SCREEN NAMES A SUBJECT.
    `Layout` reads the world from the SAME face it puts in the crown
    (`worldFor`), so there is no second derivation to keep in step. Everything
    outside `design/src` is a screen, and a screen naming any of these is building
    a world by hand.

    ⚠️ AND IT IS NOT ABOUT THESE THREE IDENTIFIERS. It is about the shape: a
    consequence derived twice from one fact is a pair that drifts. The check is
    cheap because the seam is narrow, which is the argument for having the seam.
  */
  const BUILDING = /\b(worldOf|worldCss|worldFor)\s*\(/;
  const SCREENS = [...filesIn("one-space/src"), ...filesIn("apps")];
  let hits = 0;
  for (const file of SCREENS) {
    const src = code(readFileSync(file, "utf8"));
    const m = src.match(BUILDING);
    if (m) {
      hits++;
      fail(`${rel(file)}: assembles a scene itself — \`${m[1]}\`.\n` +
           `       A page names its SUBJECT and the layout derives the ground, the hero and ` +
           `the density from that one face. Derived separately they drift, and the drift is ` +
           `one workspace's planet over another workspace's sky.`);
    }
  }
  if (!SCREENS.length) {
    fail("no screens found to check — this guard would pass over an empty list.");
  } else if (!hits) {
    ok(`binding: ${SCREENS.length} screen file(s), every world bound rather than built`);
  }
}

/* --------------------------------------------- one thing paints a ground --- */
{
  /*
    ⚠️ CHOOSING A WORLD IS A DECISION; PAINTING ONE IS A MECHANISM, AND ONLY THE
    DECISION IS ALLOWED TO BE IN MORE THAN ONE PLACE. `Page` and `Band` mount a
    scene — the custom properties, the field element, the tone stamp, the room
    reserved for a nav — and everything else in the product hands them a `sky` or
    a `subject` and stops there.

    ⚠️ THE SHELL BROKE THIS AND NOTHING NOTICED. It called `worldCss` and rendered
    its own `<svg data-field>`, which is the same picture by a second route — so
    the shell got the ground and would have missed every later thing `Page`
    learns to do. That is not a hypothetical: `NAV_SPACE`, `data-tone` and the
    reduced-motion opt-out all live on `Page` today and none of them reached the
    chrome around every product's screens.

    ⚠️ AND IT IS INVISIBLE IN A SCREENSHOT, which is the whole reason it is here.
    A second painter looks exactly like the first one until the first one gains a
    feature — at which point the difference is a screen that is subtly a version
    behind, with no file that is wrong.
  */
  const PAINTS = /\bworldCss\s*\(|data-field/;
  const MOUNTERS = new Set(["design/src/frame/page.tsx", "design/src/tokens/ambience.ts"]);
  const ALL = [...filesIn("design/src", /\.tsx?$/), ...filesIn("one-space/src")];
  let painters = 0;
  for (const file of ALL) {
    if (MOUNTERS.has(rel(file).split("\\").join("/"))) continue;
    const m = code(readFileSync(file, "utf8")).match(PAINTS);
    if (m) {
      painters++;
      fail(`${rel(file)}: paints a ground itself — \`${m[0]}\`.\n` +
           `       \`Page\` and \`Band\` are what mount a scene. A second painter gets the ` +
           `picture and none of the things the frame learns next, and the two look identical ` +
           `until one of them does.`);
    }
  }
  if (!ALL.length) {
    fail("no surface files found — this guard would pass over an empty list.");
  } else if (!painters) {
    ok(`mount: ${ALL.length} surface file(s), one frame paints every ground`);
  }
}

/* ------------------------------------ everything pinned wears the same hem --- */
{
  /*
    ⚠️ CHROME PINNED TO AN EDGE CUTS THE PAGE UNLESS THE GROUND THICKENS BEHIND
    IT. Content does not stop at a floating bar — it arrives at the control's
    own edge and is SLICED by it, so a face is halved down the gutter and a
    heading reappears in the gaps either side. That is a collision, not a
    contrast problem, so no amount of fill on the bar itself fixes it; the hem
    fades the page into its own ground on the way past (`data-hem`).

    ⚠️ BOTH EDGES, AND SEVEN ELEMENTS BETWEEN THEM, WHICH IS THE WHOLE REASON
    THIS IS A CHECK. A person sees ONE crown and ONE dock; which of the seven
    they happened to land on decides whether their page is cut. Some-of-them is
    the shape every guard in this file exists for, and it is the state this one
    was written in: three docks wore it and four crowns did not.

    ⚠️ THE VALUE HAS TO NAME THE EDGE. `top` and `bottom` are different rules —
    opposite gradient directions and different runs — so `data-hem="true"`
    matches nothing and fails silently, which is exactly what a `true` left over
    from the bottom-only version would do at the top.
  */
  const EDGE = /sticky\s+(?:[\w:-]+\s+)*?(top|bottom)-0/;
  let pinned = 0;
  for (const file of filesIn("design/src", /\.tsx$/)) {
    for (const tag of readFileSync(file, "utf8").matchAll(/<[a-zA-Z][^<>]*?>/gs)) {
      const at = EDGE.exec(tag[0]);
      if (!at) continue;
      pinned++;
      const wears = /data-hem="(top|bottom)"/.exec(tag[0]);
      if (!wears) {
        fail(`${rel(file)}: pins to the ${at[1]} and wears no hem.\n` +
             `       Add \`data-hem="${at[1]}"\`. Without it the page's next row is cut by ` +
             `this control's own edge, which reads as two layers fighting because it is.`);
      } else if (wears[1] !== at[1]) {
        fail(`${rel(file)}: pins to the ${at[1]} and hems the ${wears[1]}.\n` +
             `       The fade would run off the far side of the screen — the opaque end has ` +
             `to be the edge the element is pinned to.`);
      }
    }
  }
  if (!pinned) {
    fail("no pinned chrome found — this guard would pass over an empty list.");
  } else if (!bad) {
    ok(`hem: ${pinned} pinned surface(s), every one dissolving the page behind it`);
  }
}

/* ------------------------------------------------- the ground fits the frame --- */

/**
 * ⚠️ THE GROUND AND THE FRAME ARE MEASURED IN ONE UNIT, AND THIS IS THE ONLY
 * THING THAT CAN ASK. `Page` is `min-h-svh`; the ground fills it, is
 * `position: absolute` inside it, and only `overflow-x: clip` sits above — so a
 * ground measured in `vh` stands taller than the frame by exactly the height of
 * a phone's browser chrome, hangs past the bottom, and makes EVERY page in the
 * product scrollable by that much with nothing to scroll to.
 *
 * ⚠️ AND THE UNIT IS `svh`, WHICH IS THE HALF THIS CHECK USED TO GET WRONG. It
 * pinned `dvh` — the CURRENTLY visible height, which changes as the address bar
 * retracts. On a page whose content lands within one address bar of the
 * viewport that is a loop: the bar hides, the frame grows, the content fits, the
 * scroll clamps to zero, the page is at the top so the bar returns, and it is
 * scrollable again. `svh` is the viewport with the chrome SHOWN and never
 * changes, so the document cannot re-clamp under a finger.
 *
 * ⚠️ AND NO RENDERED TEST COULD SEE EITHER FAULT. Headless Chromium has no
 * chrome, so `100vh === 100dvh === 100svh` there and both are exactly zero
 * pixels wrong — they exist only on the devices nothing in this repository runs
 * on. Which is why this asks about the UNIT rather than about pixels.
 */
{
  const src = readFileSync(join(ENGINE, "design/src/tokens/ambience.ts"), "utf8");
  const reach = /export const REACH = "([^"]+)"/.exec(src);
  const frame = readFileSync(join(ENGINE, "design/src/frame/page.tsx"), "utf8");
  const sized = /min-h-(svh|dvh|lvh|screen|\[[^\]]+\])/.exec(code(frame));
  const unit = reach && /([a-z]+)$/.exec(reach[1]);
  if (!reach || !sized || !unit) {
    fail("scene: cannot find the ground's reach or the frame's height — one of them moved.");
  } else if (unit[1] !== sized[1]) {
    fail(`design/src/frame/page.tsx: the frame is min-h-${sized[1]} while the ground reaches `
      + `${reach[1]} — the two have to be one unit, or the ground overhangs the frame by `
      + `the height of a phone's browser chrome.`);
  } else if (sized[1] !== "svh") {
    fail(`design/src/frame/page.tsx: the frame and the ground are both \`${sized[1]}\`, and `
      + `the unit has to be \`svh\`.\n`
      + `       \`dvh\` and \`lvh\` track the address bar, so the frame changes height while `
      + `somebody is scrolling — and on a page a little over one screen tall that is a loop `
      + `rather than a jump. \`svh\` never changes.`);
  } else {
    ok(`reach: the ground (${reach[1]}) and the frame (min-h-${sized[1]}) are one unit, and it is stable`);
  }
}

/*
  ⚠️ AND NOWHERE ELSE EITHER. The frame is not the only full-screen surface — a
  door, a signpost and two waiting states each size themselves to the viewport,
  and every one of them was `dvh` for the same reason the frame was: it is the
  unit that reads as "the viewport" and it is the one that moves. Checking two
  files by name would leave the other four, which is how this fault survived the
  first fix.

  ⚠️ AND THE UNIT USUALLY APPEARS WITH NO NUMBER IN FRONT OF IT. `min-h-dvh` is
  the shape every one of those six files was written in; `h-[68dvh]` is the rare
  one. A pattern anchored on a digit or a bracket reads the rare one and passes
  over all six — which is what the first version of this block did, silently,
  against the very files the fix had just touched.
*/
{
  const DIRS = ["design/src", "one-space/src", "apps"];
  /* Line comments as well as block ones: the paragraphs explaining WHY this
     unit is refused are themselves full of the word. */
  const prose = (src) => code(src).replace(/^\s*\/\/.*$/gm, "");
  const hits = [];
  for (const dir of DIRS) {
    for (const file of filesIn(dir, /\.tsx?$/)) {
      if (/\.test\.tsx?$/.test(file)) continue;
      const src = prose(readFileSync(file, "utf8"));
      for (const [whole] of src.matchAll(/[\w[.%-]*(?:dvh|lvh)\b/g)) {
        hits.push(`${rel(file)} — \`${whole.trim()}\``);
      }
    }
  }
  if (hits.length) {
    for (const at of hits) {
      fail(`${at}: sized in a viewport unit that moves.\n`
        + `       \`dvh\` and \`lvh\` follow the address bar, so anything measured in one `
        + `changes height while somebody scrolls. \`svh\` is the viewport with the chrome `
        + `shown, and it is the same unit the frame and the ground use.`);
    }
  } else {
    ok(`viewport: every full-screen surface is sized in \`svh\``);
  }
}

/* ------------------------------------------------ the ornament cannot scroll --- */

/**
 * ⚠️ A DECORATIVE LAYER MAY NEVER GROW THE DOCUMENT, AND IT DID — TWICE, ON
 * DIFFERENT AXES, WITH THE SAME CAUSE. The ground drifts by `scale(1.14)` and a
 * translate, so it hangs past every edge of its host by design. Unclipped, that
 * overhang is scrollable overflow: the page scrolls into nothing, and further
 * every second, because the scroll area tracks the animation.
 *
 * The inline axis was found and clipped. The block axis was left open on purpose
 * — "so the page still scrolls the way it is supposed to" — and that reasoning
 * is wrong: the host is `min-h-svh` and grows with its content, so nothing but
 * the ornament is ever outside it. Measured on the sign-in door at 412×830, the
 * document was 869 tall: 39px of scroll under a screen with nothing below the
 * fold, on every page in the product.
 *
 * ⚠️ AND `clip` RATHER THAN `hidden` IS THE HALF THAT IS FRAGILE. `hidden` makes
 * the host a scroll container and every sticky crown and nav inside it stops
 * sticking — measured at -900 after a 900px scroll, where both `clip` forms hold
 * at 0. So this asks for both: clipped on both axes, and clipped rather than
 * hidden.
 */
{
  const src = readFileSync(join(ENGINE, "design/src/tokens/ambience.ts"), "utf8");
  const host = /`\[data-sky\] \{([^`]*)\}`/.exec(src);
  if (!host) {
    fail("design/src/tokens/ambience.ts: cannot find the `[data-sky]` host rule — it moved.");
  } else if (/overflow\s*:\s*hidden/.test(host[1])) {
    fail("design/src/tokens/ambience.ts: the ground's host uses `overflow: hidden`.\n" +
         "       That makes it a scroll container and every sticky crown and nav inside it " +
         "stops sticking. `clip` clips without scrolling.");
  } else if (!/overflow\s*:\s*clip/.test(host[1])) {
    fail("design/src/tokens/ambience.ts: the ground's host does not clip on both axes.\n" +
         "       The drifting layer is scaled past every edge, and an unclipped overhang is " +
         "scrollable overflow — a page that scrolls into nothing, further every second, " +
         "because the scroll area tracks the animation.");
  } else {
    ok("overscan: the ground is clipped on both axes, and clipped rather than hidden");
  }
}

/* ------------------------------------------------------- one ground per area --- */

/**
 * ⚠️ A SCREEN DOES NOT PICK ITS OWN GROUND, AND ONE DID. `groundOf` says it in
 * its own header — "a screen that chose would be a screen somebody has to
 * remember to update, and the OneSpace has twenty of them" — and one surface
 * named `glow` by hand anyway, so the door into a workspace was the single place
 * that workspace's world was missing. Nothing failed; it just looked like a
 * different product for one screen.
 *
 * ⚠️ THE ADDRESS DECIDES, IN ONE FUNCTION. A screen names its SUBJECT and the
 * layout derives the rest (the guard above), or it names nothing and inherits
 * the area's. Naming a sky is the third way, and there is exactly one file
 * allowed to do it.
 */
{
  const DECIDES = "one-space/src/space/OneSpace.tsx";
  /* ⚠️ A LITERAL, NOT AN EXPRESSION. The decider passes `sky={groundOf(where)}`,
     which is the rule rather than a breach of it; what is forbidden is a screen
     writing the material into itself. */
  const NAMES_A_SKY = /\bsky=(?:"|\{\s*")/;
  let named = 0;
  for (const file of filesIn("one-space/src", /\.tsx$/)) {
    if (rel(file) === DECIDES) continue;
    const m = NAMES_A_SKY.exec(code(readFileSync(file, "utf8")));
    if (!m) continue;
    named++;
    fail(`${rel(file)}: names its own sky.\n` +
         `       Which ground an address wears is decided once, in ${DECIDES}. ` +
         `A screen names its SUBJECT and inherits the rest — one that picks a material ` +
         `is one somebody has to remember when the area's changes.`);
  }
  const decider = readFileSync(join(ENGINE, DECIDES), "utf8");
  if (!/\bsky=\{/.test(decider)) {
    fail(`${DECIDES}: hands no sky to a layout — this guard would pass over a rule `
      + `nothing applies.`);
  } else if (!named) {
    ok("ground: one address, one material — no screen picks its own");
  }
}

console.log(bad
  ? `\nscene: ${bad} finding(s) — a world that is not the same world twice.`
  : `\nscene: seeded, compositor-only, masked rather than washed, sized by area, bound not built.`);
process.exit(bad ? 1 : 0);
