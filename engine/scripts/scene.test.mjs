/**
 * THE SCENE ENGINE'S FOUR PROMISES.
 *
 * @design seeded, compositor-only, masked rather than washed, sized by area, bound rather than built.
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
import { appDirs } from "./lib/trees.mjs";

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
  /* ⚠️ AND THE CORPUS IS EVERYWHERE A SURFACE IS DRAWN, NOT THE DESIGN PACKAGE
     ALONE. `chrome.test.mjs` refuses a pinned surface outside the frame, so in
     a healthy tree this finds them all in one place — but a check whose corpus
     is narrower than the rule it enforces reports green over whatever moved out
     of it, which is the failure `lib/trees.mjs` exists for. */
  const EDGE = /sticky\s+(?:[\w:-]+\s+)*?(top|bottom)-0/;
  let pinned = 0;
  for (const file of [
    ...filesIn("design/src", /\.tsx$/),
    ...filesIn("one-space/src", /\.tsx$/),
    ...appDirs().flatMap((d) => filesIn(d, /\.tsx$/)),
  ]) {
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
 * THING THAT CAN ASK. `Page` is `min-h-dvh`; the ground fills it, is
 * `position: absolute` inside it, and only `overflow-x: clip` sits above — so a
 * ground measured in `vh` stands taller than the frame by exactly the height of
 * a phone's browser chrome, hangs past the bottom, and makes EVERY page in the
 * product scrollable by that much with nothing to scroll to.
 *
 * ⚠️ AND NO RENDERED TEST COULD SEE IT. Headless Chromium has no chrome, so
 * `100vh === 100dvh` there and the overflow is exactly zero — the fault exists
 * only on the devices nothing in this repository runs on. Which is why this
 * asks about the UNIT rather than about pixels.
 */
{
  const src = readFileSync(join(ENGINE, "design/src/tokens/ambience.ts"), "utf8");
  const reach = /export const REACH = "([^"]+)"/.exec(src);
  const frame = readFileSync(join(ENGINE, "design/src/frame/page.tsx"), "utf8");
  const sized = /min-h-(dvh|screen|\[[^\]]+\])/.exec(code(frame));
  if (!reach || !sized) {
    fail("scene: cannot find the ground's reach or the frame's height — one of them moved.");
  } else if (!reach[1].endsWith("dvh")) {
    fail(`design/src/tokens/ambience.ts: REACH is "${reach[1]}" and the frame is `
      + `min-h-${sized[1]}.\n`
      + `       A ground in \`vh\` inside a frame in \`dvh\` overhangs by the height of a `
      + `phone's browser chrome, and every page scrolls by that much over nothing.`);
  } else if (sized[1] !== "dvh") {
    fail(`design/src/frame/page.tsx: the frame is min-h-${sized[1]} while the ground reaches `
      + `${reach[1]} — the two have to be one unit.`);
  } else {
    ok(`reach: the ground (${reach[1]}) and the frame (min-h-${sized[1]}) are one unit`);
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
 * is wrong: the host is `min-h-dvh` and grows with its content, so nothing but
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

/* ---------------------------------------------------- built once, not per render --- */

/**
 * ⚠️ A GROUND IS COMPOSED, AND COMPOSING IT ON EVERY RENDER IS THE MOST
 * EXPENSIVE THING IN THE PRODUCT. `worldCss` places up to `MARKS` marks and
 * builds the markup around them; it ran unmemoised inside `useScenery`, so a
 * poll landing, a toast opening or a crown republishing rebuilt several hundred
 * marks into a fresh string and handed React a new element to reconcile — under
 * a page that was often also changing. That is what made moving between screens
 * read as the app reloading rather than as a page sliding over a world.
 *
 * ⚠️ AND THE KEY HAS TO BE THE CONTENTS. Every caller builds its scene inline,
 * so a dependency on the OBJECT changes identity every render and the memo never
 * hits once — a memo that is present and does nothing, which is worse than an
 * absent one because it reads as solved.
 */
{
  const SCENERY = "design/src/frame/page.tsx";
  const src = readFileSync(join(ENGINE, SCENERY), "utf8");
  const calls = [...src.matchAll(/worldCss\(/g)];
  if (!calls.length) {
    fail(`${SCENERY}: composes no world — this guard is reading the wrong file, `
      + `and would report green over a page that rebuilds its ground per render.`);
  } else {
    /* ⚠️ EVERY CALL, because one memoised and one not is the same fault with a
       green check over it. The window is the line and what precedes it. */
    const loose = calls.filter((m) => {
      const before = src.slice(Math.max(0, m.index - 400), m.index);
      return !/useMemo\(/.test(before);
    });
    if (loose.length) {
      fail(`${SCENERY}: composes a world outside a \`useMemo\` (${loose.length} call(s)).\n` +
           `       A ground is hundreds of marks and a string; built per render it is the\n` +
           `       largest thing on the page, replaced under a page that is also changing.`);
    } else if (!/scene\?\.(?:family|seed)/.test(src)) {
      fail(`${SCENERY}: memoises on something other than the scene's contents.\n` +
           `       Callers build their scene inline, so a dependency on the object never\n` +
           `       hits — a memo that is present and does nothing.`);
    } else {
      ok(`ground: composed once per scene, not once per render (${calls.length} call(s))`);
    }
  }
}

/* ------------------- the wash reaches every tier, through its own alias --- */
{
  /*
    ⚠️ A WASH THAT NAMES SELECTORS IS A WASH THAT IS ALWAYS INCOMPLETE. It named
    `.card` and two attributes, and everything else the library paints stayed
    grey on a lit page — the circle behind a quick action, a progress track, a
    switch, a field, a chip. What is finite is not the list of components, it is
    the list of TOKENS they are made of, and washing those is complete by
    construction: a component the library adds next year is lit the day it ships.

    ⚠️ AND THE SOURCE IS NEVER THE TOKEN BEING WRITTEN. A custom property defined
    in terms of itself is a cycle at any depth, so
    `--surface-secondary: color-mix(…, var(--surface-secondary))` computes to
    NOTHING — no error, no fallback, the page still renders and the surface is
    simply unpainted. `--tier-*` in `ground.ts` is the unwashed value the mix has
    to come from.

    ⚠️ AND THE SHARE RISES WITH THE TIER. A card must still read as raised
    against a surface and a control against a card; washing them all by the same
    amount from one colour collapses the stack into a flat field, which is the
    failure that looks most like success.
  */
  const gsrc = readFileSync(join(ENGINE, "design/src/tokens/ground.ts"), "utf8");
  const asrc = readFileSync(join(ENGINE, "design/src/tokens/ambience.ts"), "utf8");

  /* ⚠️ IN TIER ORDER, and the order is what the share is checked against. */
  const WASHED = [
    "--surface", "--surface-secondary", "--surface-tertiary",
    "--overlay", "--field-background", "--default",
  ];

  const block = /\[data-wash="true"\] \{`,([\s\S]*?)`\}`,/.exec(asrc)?.[1];
  let broke = 0;
  if (!block) {
    broke++;
    fail("design/src/tokens/ambience.ts: no `[data-wash]` token block — the wash reaches nothing.\n" +
         "       A family publishing `wash` would then set an attribute that styles nothing at all.");
  } else {
    const shares = [];
    for (const token of WASHED) {
      const alias = new RegExp(`\`${token}: var\\(--tier-(\\w+)\\);\``).exec(gsrc)?.[1];
      if (!alias) {
        broke++;
        fail(`design/src/tokens/ground.ts: \`${token}\` is not aliased to a \`--tier-*\`.\n` +
             `       The wash has nothing to mix FROM, and mixing from the token itself is a\n` +
             `       cycle that computes to nothing with the page still rendering.`);
        continue;
      }
      const mix = new RegExp(
        `${token}: color-mix\\(in oklab, var\\(--scene-wash\\) (\\d+)%, var\\(--tier-(\\w+)\\)\\)`,
      ).exec(block);
      if (!mix) {
        broke++;
        fail(`design/src/tokens/ambience.ts: \`${token}\` is not washed.\n` +
             `       Every control in the library resolves to \`--default\` and every surface to\n` +
             `       one of the tiers, so a token left out is a whole class of component that\n` +
             `       stays grey in a lit room.`);
        continue;
      }
      if (mix[2] !== alias) {
        broke++;
        fail(`design/src/tokens/ambience.ts: \`${token}\` is washed from \`--tier-${mix[2]}\`\n` +
             `       while \`ground.ts\` says it is \`--tier-${alias}\`. The washed value would be\n` +
             `       a different tier's colour, so the stack reorders under a lit page only.`);
        continue;
      }
      shares.push([token, Number(mix[1])]);
    }
    for (let i = 1; i < shares.length; i++) {
      if (shares[i][1] < shares[i - 1][1]) {
        broke++;
        fail(`design/src/tokens/ambience.ts: \`${shares[i][0]}\` takes ${shares[i][1]}% of the wash\n` +
             `       against \`${shares[i - 1][0]}\`'s ${shares[i - 1][1]}%, so the higher tier is the\n` +
             `       flatter one. A control has to read as raised against the card under it.`);
      }
    }
    /* ⚠️ AND THE PAGE IS NOT ONE OF THEM. The scene is painted ON `--background`,
       so washing it is washing the light with its own colour. */
    if (/--background: color-mix/.test(block)) {
      broke++;
      fail("design/src/tokens/ambience.ts: the wash paints `--background`.\n" +
           "       That is the ground the scene itself is drawn on — tinting it washes the\n" +
           "       light with its own colour and the world loses its depth.");
    }
    if (!broke) ok(`wash: ${WASHED.length} token(s), each mixed from its own tier, share rising`);
  }
}

/* ------------------------------ what is pinned to an edge wears no plate --- */
{
  /*
    ⚠️ THE HEM IS THE CONTRAST, SO THE CHROME NEEDS NO FILL — and a fill is not a
    harmless belt-and-braces, it is the thing that ends the effect. A vignette
    works because the ground thickens continuously into the edge; a plate with a
    hard border laid on top of it is a slab, and the page underneath stops
    reading as one surface. The nav rail wore one for exactly as long as the wash
    named `[data-island]` in a rule of its own.

    ⚠️ AND THE RULE IS ABOUT THE ATTRIBUTE, NOT THE COMPONENT. The bar and the
    rail are different elements in different files that ask for one treatment by
    carrying one attribute — so the only place a plate can come back is a rule
    naming that attribute, which is the one place worth guarding.
  */
  const asrc = readFileSync(join(ENGINE, "design/src/tokens/ambience.ts"), "utf8");
  const EDGES = ["data-island", "data-hem", "data-crown"];
  let plated = 0;
  for (const attr of EDGES) {
    /* ⚠️ THE RULE'S OWN BODY, never a descendant's — `[data-island] button { … }`
       is styling what STANDS on the chrome and is none of this check's business.
       The hem's own `::before` IS the vignette and is the mechanism. */
    const rules = [...asrc.matchAll(
      new RegExp(`\\[${attr}[^\\]]*\\]("?,?\\s*)?\\{([^}]*)`, "g"),
    )];
    for (const r of rules) {
      const head = asrc.slice(Math.max(0, r.index - 40), r.index + r[0].length);
      if (/::before|::after|\s[a-z]+\s*\{/.test(head.slice(40, 40 + r[0].indexOf("{")))) continue;
      if (/background(-color)?:/.test(r[2])) {
        plated++;
        fail(`design/src/tokens/ambience.ts: \`[${attr}]\` is given a fill of its own.\n` +
             `       The hem already thickens the ground into that edge. A plate over a\n` +
             `       vignette is a slab, and the page stops reading as one surface.`);
      }
    }
  }
  if (!plated) ok(`plate: ${EDGES.length} pinned surface(s), all of them the ground itself`);
}

/* ------------------- a source is placed where its mask keeps it --- */
{
  /*
    ⚠️ THE FLARE WEARS A STEEP MASK AND A BAND CAN BE PLACED PAST IT. `LIGHT`
    holds to 26% of the viewport and is transparent by 78%, so a beam angled
    downward with its source at 85% of its own axis is drawn in full and removed
    in full — the gradient real, the element boxed, the background-image set,
    every token reading correctly, and the screen black. It shipped exactly that
    way, and the only thing that changed was the seed.
  *
    ⚠️ PINNED AS A NUMBER RATHER THAN AS A PHOTOGRAPH, and that split is the
    finding. Whether a band lands where the mask keeps it is trigonometry over an
    angle, a stop and a viewport; the browser sweep
    (`design/test/sky.seen.test.tsx`) proves a source reaches the screen at all,
    and measured across 24 seeds in both states it does NOT separate a good band
    from a mostly-masked one — a masked band still tints a fifth of the page. So
    the rule lives where it is decidable: the range a family may place a band in.

    ⚠️ AND IT IS THE UPPER BOUND THAT MATTERS. The lower one is free — a band at
    8% is at the top of the ramp, which is where a light belongs.
  */
  const CEILING = 42;
  const src = readFileSync(join(ENGINE, "design/src/scene/neon.ts"), "utf8");

  /* ⚠️ THE NUMBER AND THE SHAPE, and the shape is the half that bit. What
     shipped invisible was a TERNARY offering a second range past the mask, so a
     check reading one bound walked straight past it and reported the good half.
     The band's placement has to be the named constant and nothing else. */
  const named = /const SOURCE_AT = \{ lo: ([\d.]+), hi: ([\d.]+) \}/.exec(src);
  const used = /band\(p, of, between\(r, SOURCE_AT\.lo, SOURCE_AT\.hi\)/.test(src);

  if (!named) {
    fail("design/src/scene/neon.ts: no `SOURCE_AT` — the placement rule has no name,\n" +
         "       so nothing can check it. A band past the flare's mask is a light nobody sees.");
  } else if (!used) {
    fail("design/src/scene/neon.ts: `beam` does not place its band at `SOURCE_AT` alone.\n" +
         "       A second range — a ternary, a branch, another `between` — is how the source\n" +
         "       came to sit past the mask on half its seeds, with every token still correct.");
  } else if (Number(named[2]) > CEILING) {
    fail(`design/src/scene/neon.ts: \`SOURCE_AT.hi\` is ${named[2]}%, past the ${CEILING}% the\n` +
         `       flare's mask keeps. A band past the ramp is drawn in full and masked away in\n` +
         `       full — every token correct, and no light on the screen.`);
  } else {
    ok(`source: a beam is placed at ${named[1]}–${named[2]}% of its axis, inside the mask's ramp`);
  }
}

console.log(bad
  ? `\nscene: ${bad} finding(s) — a world that is not the same world twice.`
  : `\nscene: seeded, compositor-only, masked rather than washed, sized by area, bound not built.`);
process.exit(bad ? 1 : 0);
