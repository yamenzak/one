/**
 * EVERY FACE COMES FROM THE ONE RESOLVER.
 *
 * @design one resolver draws every face, and a seed is an identity rather than a label.
 *
 * ⚠️ THE DEFECT THIS CATCHES IS INVISIBLE ON THE SCREEN THAT HAS IT. A roster
 * that draws its own `<Avatar>` looks correct — a plate, an initial, the right
 * size. What is wrong is elsewhere: the same person is a picture in the crown, a
 * letter in the roster and a different letter in a table, because each surface
 * seeded itself from whatever field it happened to hold. Nobody can point at the
 * file that is wrong, which is the definition of drift and the reason this is a
 * static check rather than a review note.
 *
 * ⚠️ AND THE SECOND HALF MATTERS MORE THAN THE FIRST: a seed is an IDENTITY.
 * `whoFace` takes an account, `placeFace` a slug — both stable for the life of
 * the subject. Handing either a NAME or an EMAIL compiles, renders, and gives
 * somebody a new face the day they correct their spelling. So the resolvers are
 * the only way in, and a call site passing something that reads like a label is
 * refused here.
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

const filesIn = (dir) => {
  const at = join(ENGINE, dir);
  if (!existsSync(at)) return [];
  const out = [];
  const walk = (path) => {
    for (const e of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx$/.test(e.name)) out.push(full);
    }
  };
  walk(at);
  return out;
};

const FILES = [
  ...filesIn("design/src"),
  ...filesIn("one-space/src"),
  ...readdirSync(join(ENGINE, "apps"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) => filesIn(join("apps", e.name, "src"))),
];

/**
 * ⚠️ ONE FILE MAY DRAW AN `Avatar`, AND IT IS THE ONE THAT ANSWERS "WHICH
 * PICTURE". Everywhere else asks it. The exemption is by path rather than by a
 * comment, because a comment is something a hurried screen can also write.
 */
const RESOLVER = "design/src/parts/face.tsx";

/**
 * ⚠️ THE PROSE IS WHERE THE RULE IS EXPLAINED, SO THE PROSE IS WHERE THE
 * FORBIDDEN THING IS NAMED. `face.tsx`'s header says why a face is not fetched
 * from `api.dicebear.com`, and the first version of this check read that
 * sentence and failed the file that states the rule. Block comments come out
 * before anything is matched; line comments are left alone, because stripping
 * them means stripping the `//` in every URL this is looking for.
 */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "");

/* --------------------------------------------- the plate has one drawer --- */
{
  let checked = 0;
  for (const file of FILES) {
    const where = rel(file);
    if (where === RESOLVER) continue;
    const src = code(readFileSync(file, "utf8"));
    checked++;
    if (/<Avatar\b/.test(src)) {
      fail(`${where}: draws its own <Avatar>.\n` +
           `       Use <Face of={whoFace(id)} /> — one resolver decides which picture, ` +
           `what stands in when there is none, and whether it moves.`);
    }
  }
  if (!bad) ok(`plate: ${checked} file(s), none drawing a face of its own`);
}

/* ------------------------------------------- a product's mark wears a plate --- */
{
  /*
    ⚠️ `{app.mark}` IS A CHARACTER, NOT A MARK. A manifest's mark is one glyph,
    and dropped straight into JSX it renders as text somebody typed — no ground
    under it, no size of its own, and a different optical weight from every face
    beside it. The crown did exactly that: a product's glyph and a person's face
    sat in the same bar at two different sizes with two different treatments.
    `appFace(id, mark)` puts it on the plate every face wears.

    ⚠️ AND THE SHAPE IS THE CHECK. Only a PROPERTY read rendered as a standalone
    JSX CHILD is refused, and the property is matched by its ENDING — `{app.mark}`
    and `{crown.appMark}` alike. The first version asked for `.mark` exactly and
    passed the crown, which is where the defect actually was; the second caught
    `className={TYPE.wordmark}`, because an attribute value has the same braces
    as a child. What separates them is the character before the brace: an
    attribute has `=`, a child never does. `mark: a.mark` building a payload and
    `appFace(a.id, a.mark)` are how it is meant to travel and neither matches;
    nor does a bare `{mark}`, which is `Crown`'s ReactNode slot for whatever a
    door puts over itself and has nothing to do with a manifest.
  */
  let checked = 0;
  for (const file of FILES) {
    const src = code(readFileSync(file, "utf8"));
    for (const m of src.matchAll(/(?<![=\w])\{\s*[\w?]+(?:[.?]+\w+)*\.\w*[Mm]ark\s*\}/g)) {
      checked++;
      fail(`${rel(file)}: renders ${m[0]} as text.\n` +
           `       A mark is a product's identity — put it on the plate every face wears: ` +
           `<Face of={appFace(id, mark)} />.`);
    }
  }
  if (!checked) ok("mark: no product's glyph rendered as a bare character");
}

/* --------------------------------------- the sky and the planet are one --- */
{
  /*
    ⚠️ A WORKSPACE'S GROUND IS ITS PLANET'S COLOURS, AND THE ONLY WAY THAT STAYS
    TRUE IS BY READING THEM OUT OF THE PICTURE. The tempting shortcut is to hash
    the slug here and index the palette ourselves — which agrees with DiceBear's
    own selection right up until either side is edited, and then the sky is a
    different world from the planet in the row above it with nothing failing
    anywhere. So the resolver holds no colours of its own: it matches the fills
    in the drawn SVG against the STYLE'S declared palette, and a hex literal
    appearing here is the shortcut being taken.

    ⚠️ BLACK, WHITE AND FULLY TRANSPARENT ARE NOT COLOURS HERE, THEY ARE ALPHA.
    The planet is asked for with `#00000000` because that is the only way
    DiceBear's schema accepts "no background" — it wants a colour, and a colour
    with no opacity is one. No planet palette holds any of these, so excluding
    them cannot let a real second palette through.
  */
  const ALPHA = new Set(["#000", "#fff", "#000000", "#ffffff", "#00000000"]);
  const src = code(readFileSync(join(ENGINE, RESOLVER), "utf8"));
  const hexes = [...src.matchAll(/#[0-9a-fA-F]{3,8}\b/g)]
    .map((m) => m[0].toLowerCase())
    .filter((h) => !ALPHA.has(h));
  if (hexes.length) {
    fail(`${RESOLVER}: holds a colour of its own (${hexes.slice(0, 3).join(", ")}).\n` +
         `       A world's palette is read from the picture that was drawn, matched against ` +
         `the style's own values — a literal here is a second source that agrees until one is edited.`);
  } else ok("palette: the sky's colours come from the planet, not from a copy of them");
}

/* ------------------------------------------------- a seed is an identity --- */
{
  /*
    ⚠️ THE ARGUMENT IS MATCHED BY WHAT IT IS CALLED, WHICH IS THE ONLY SIGNAL A
    STATIC CHECK HAS. `whoFace(m.email)` and `placeFace(t.name)` are the two
    mistakes available, both compile, and both are invisible until somebody
    renames themselves. A field ending in `name`, `email`, `label` or `title` is
    a label; anything else is allowed through, because the check is here to
    catch the obvious wrong thing rather than to prove the right one.
  */
  const LABEL = /(^|\.)(\w*(?:name|email|label|title))$/i;
  let calls = 0;
  for (const file of FILES) {
    const src = code(readFileSync(file, "utf8"));
    for (const m of src.matchAll(/\b(whoFace|placeFace)\(\s*([^),]+?)\s*[),]/g)) {
      calls++;
      const arg = m[2].replace(/[?!]/g, "").trim();
      if (LABEL.test(arg)) {
        fail(`${rel(file)}: ${m[1]}(${arg}) — that is a LABEL, not an identity.\n` +
             `       A face seeded on a name changes the day somebody fixes their spelling. ` +
             `       Pass the account id or the slug.`);
      }
    }
  }
  if (!bad) ok(`seed: ${calls} face(s) resolved from an identity, none from a label`);
}

/* ------------------------------------------ the movement has to be asked --- */
{
  /*
    ⚠️ EVERY DICEBEAR STYLE SHIPS ITS ANIMATION VARIANTS AT WEIGHT ZERO, so a
    seed alone never picks one: leave the option off and every face in the
    product is the still variant, silently, for ever, with nothing anywhere
    reporting a problem. It is one word, and it is the whole difference between
    the thing that was asked for and a thing that looks like it.
  */
  const src = code(readFileSync(join(ENGINE, RESOLVER), "utf8"));
  if (!/animationVariant\s*:/.test(src)) {
    fail(`${RESOLVER}: no animationVariant.\n` +
         `       Styles ship their movement at weight 0, so a seed alone never picks one ` +
         `and every face is silently still.`);
  } else ok("movement: asked for by name, not left to the seed");
}

/* ------------------------------------------------------- drawn, not fetched --- */
{
  /*
    ⚠️ `api.dicebear.com` SERVES EXACTLY THESE PICTURES, and reaching for it is
    one line shorter than generating them. What it costs is a third party in the
    request path of every roster, a service that has to be up for a face to
    appear, and a sub-processor the trust screen has to name — none of which
    fails anything, and none of which anybody notices until it is everywhere.
  */
  let hits = 0;
  for (const file of FILES) {
    const src = code(readFileSync(file, "utf8"));
    if (/dicebear\.com/.test(src)) {
      hits++;
      fail(`${rel(file)}: fetches a face from api.dicebear.com.\n` +
           `       Faces are generated here — a third party in the path of every roster ` +
           `is a sub-processor the trust screen would have to name.`);
    }
  }
  if (!hits) ok("origin: every face generated here, none fetched");
}

/* ------------------------------------------------------------------ glyph --- */

/*
  ⚠️ AN ICON IS A STRING IN A MANIFEST, SO NO COMPILER WILL EVER CATCH A TYPO —
  and a name the map does not have draws the NEUTRAL MARK rather than nothing,
  which is a circle sitting quietly in a list where every other row has a shape.
  This has now happened twice to the same map: three of a reference app's own
  screens drew circles, and after that was fixed a settings area named `mail` and
  drew another. The file's header describes the failure in full both times; what
  was missing was anything able to see the two lists disagree.
*/
{
  const shell = readFileSync(join(ENGINE, "design/src/frame/shell.tsx"), "utf8");
  const known = new Set();
  /* ⚠️ A QUOTED KEY IS STILL A KEY. `"bell-ring": <BellRing />` has to be
     quoted because of the hyphen, and the first pattern here could not see it —
     so the guard reported a name the map does have. */
  for (const m of shell.matchAll(/"?([\w-]+)"?:\s*<\w+ ?\/>/g)) known.add(m[1]);

  const used = new Map();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const at = join(dir, entry.name);
      if (entry.isDirectory()) { walk(at); continue; }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      const src = readFileSync(at, "utf8");
      for (const m of src.matchAll(/\bicon:\s*"([\w-]+)"/g)) used.set(m[1], rel(at));
      for (const m of src.matchAll(/glyphOf\("([\w-]+)"\)/g)) used.set(m[1], rel(at));
    }
  };
  for (const root of ["apps/hello/src", "one-space/src", "design/src"]) {
    walk(join(ENGINE, root));
  }

  const strays = [...used].filter(([name]) => !known.has(name));
  if (strays.length) {
    for (const [name, where] of strays) {
      fail(`glyph: ${where} names "${name}", which the shell's map does not have — it draws a neutral circle in a list where every other row has a shape`);
    }
  } else {
    ok(`glyph: all ${used.size} name(s) in use are mapped to a mark`);
  }
}

console.log(bad
  ? `\nface: ${bad} finding(s) — one subject, more than one face.`
  : `\nface: one resolver, one seed per subject, one face everywhere.`);
process.exit(bad ? 1 : 0);
