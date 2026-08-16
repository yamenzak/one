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
const QUAD = join(HERE, "..");
let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(QUAD.length + 1);
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "");

const filesIn = (dir, ext = /\.tsx?$/) => {
  const at = join(QUAD, dir);
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
  `quad/scene` — the engine is at `web/src/scene` — so every check ran over an
  empty list and the guard reported four cheerful passes. A check that finds
  nothing and says so in green is worse than no check, because it is also a
  claim.
*/
const ENGINE = filesIn("web/src/scene");
if (!ENGINE.length) {
  fail("web/src/scene: the engine is not where this guard looks.\n" +
       "       Every check below would pass over an empty list, which is a green run " +
       "asserting nothing.");
}
const DRAWN = [...filesIn("web/src"), ...filesIn("one-hub/src")];

/* ---------------------------------------------- a world is never random --- */
{
  /*
    ⚠️ A SCENE IS AN IDENTITY. The workspace somebody recognises by its sky must
    have that sky on every device and after every deploy — so the engine's only
    source of variation is the seed. `Math.random` here would produce a world
    that is different on every reload, which nobody reports as a bug because
    nobody can hold two of them side by side.
  */
  const loose = ENGINE.filter((f) => /Math\.random|Date\.now|new Date\(/.test(code(readFileSync(f, "utf8"))));
  if (loose.length) {
    fail(`${loose.map(rel).join(", ")}: a scene varies by something other than its seed.\n` +
         `       Same seed, same world, forever — a clock or a random makes it a different ` +
         `place on every reload.`);
  } else ok(`seed: ${ENGINE.length} engine file(s), nothing varying but the seed`);
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
  for (const file of ENGINE) {
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
  if (!bad) ok(`motion: ${props} animated propert(ies), all compositor-only`);
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
    on is the one that looks correct. A family declares a rate per area and the
    engine multiplies; the seam is `per`, and a family without one is a family
    that will be re-tuned per device forever.
  */
  const families = ENGINE.filter((f) => /:\s*Family\b/.test(readFileSync(f, "utf8")));
  let specks = 0;
  for (const file of families) {
    const src = readFileSync(file, "utf8");
    for (const [, block] of src.matchAll(/\bid:\s*"[^"]+",\s*([\s\S]{0,200}?)variants:/g)) {
      specks++;
      if (!/\bper:\s*\d/.test(block)) {
        fail(`${rel(file)}: a speck declares no \`per\`.\n` +
             `       Density is elements per megapixel, so one world is the same world at ` +
             `every size. A count is tuned for whichever screen it was written on.`);
      }
    }
  }
  if (!bad) ok(`density: ${specks} speck kind(s), every one a rate per area`);
}

/* ------------------------------------------ a scene is bound, not built --- */
{
  /*
    ⚠️ A SCENE IS THREE CONSEQUENCES OF ONE DECLARATION, AND A SCREEN THAT
    ASSEMBLES ITS OWN GETS TWO OF THEM. The hub used to derive the ground, the
    hero face and the density from the same slug in three separate expressions:
    `worldOf(where.slug)`, `placeFace(where.slug)` and a ternary on whether the
    first returned anything. All three have to agree and nothing could tell when
    they did not — edit one and the crown wears one workspace's planet over
    another workspace's sky, which is invisible in a screenshot of either.

    ⚠️ SO THE COMPOSER IS THE VOCABULARY'S AND A SCREEN NAMES A SUBJECT.
    `Layout` reads the world from the SAME face it puts in the crown
    (`worldFor`), so there is no second derivation to keep in step. Everything
    outside `web/src` is a screen, and a screen naming any of these is building
    a world by hand.

    ⚠️ AND IT IS NOT ABOUT THESE THREE IDENTIFIERS. It is about the shape: a
    consequence derived twice from one fact is a pair that drifts. The check is
    cheap because the seam is narrow, which is the argument for having the seam.
  */
  const BUILDING = /\b(worldOf|worldCss|worldFor)\s*\(/;
  const SCREENS = [...filesIn("one-hub/src"), ...filesIn("apps")];
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

console.log(bad
  ? `\nscene: ${bad} finding(s) — a world that is not the same world twice.`
  : `\nscene: seeded, compositor-only, masked rather than washed, sized by area, bound not built.`);
process.exit(bad ? 1 : 0);
