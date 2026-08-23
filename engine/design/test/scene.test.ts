/**
 * EVERY FAMILY, RENDERED, AND THE THINGS THAT GO WRONG WITHOUT A SOUND.
 *
 * ⚠️ THIS IS A TEST RATHER THAN A GUARD BECAUSE THE FAULTS ARE IN THE OUTPUT,
 * NOT IN THE SOURCE. The first version of the id check was a regex over
 * `web/src/scene`, and it reported a cheerful pass over zero files: the ids are
 * built from template literals (`url(#${of})`), so there is nothing for a
 * pattern to match on either side. Rendering the family and reading what it
 * actually emitted is the only way to ask the question — and it is also the only
 * version that covers a family written after today.
 *
 * ⚠️ EVERY ASSERTION HERE IS A SILENT FAILURE. Not one of them throws, warns,
 * or looks wrong in the file that caused it: an unresolvable fill is a valid
 * SVG, an unfilled slot is a valid string, and a family missing a sky is a page
 * that simply has no ground in one theme. All three render.
 */

import { describe, expect, it } from "vitest";
import { FAMILIES, render, type Family, type Palette } from "../src/scene/index.js";
import { BEAT } from "../src/tokens/motion.js";
import { ambienceStylesheet, worldCss } from "../src/tokens/ambience.js";

/* ⚠️ Two real colours, because `color-mix` with a bad operand is dropped by the
   browser rather than reported, and a slot filled with `undefined` is exactly
   that — see the slots test. */
const PALETTE: Palette = { deep: "#17233f", lit: "#d88a40" };

const skies = (): readonly (readonly [string, Family])[] =>
  Object.entries(FAMILIES).flatMap(([id, pair]) =>
    (["night", "day"] as const).map((when) => [`${id}.${when}`, pair[when]] as const));

const drawn = (family: Family, seed = "northwind") =>
  render({ family, seed, palette: PALETTE, density: 1.8 });

describe("every family", () => {
  it("has both skies, and they are not the same picture", () => {
    for (const [id, pair] of Object.entries(FAMILIES)) {
      expect(pair.night, `${id} has no night`).toBeTruthy();
      expect(pair.day, `${id} has no day`).toBeTruthy();
      /*
        ⚠️ A FAMILY WHOSE TWO SKIES ARE THE SAME OBJECT IS THE MADE-UP RULE
        COMING BACK. "Space is dark, so keep it dark in light mode" was three
        failed attempts wearing one decision, and the fix was a second variant.
        Registering the same one twice would pass every other check here.
      */
      expect(pair.night.id, `${id} uses one sky twice`).not.toBe(pair.day.id);
    }
  });

  it("resolves every mark it references", () => {
    for (const [id, family] of skies()) {
      const svg = drawn(family).field;
      const used = new Set([...svg.matchAll(/url\(#([\w-]+)\)/g)].map((m) => m[1]));
      const made = new Set([...svg.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]));
      for (const ref of used) {
        expect(made.has(ref), `${id}: a mark fills with url(#${ref}) and nothing defines it`)
          .toBe(true);
      }
      /* ⚠️ The other direction is the surviving half of a rename — bytes in a
         data URI on every cold load, doing nothing. */
      for (const def of made) {
        expect(used.has(def), `${id}: defines #${def} and no mark uses it`).toBe(true);
      }
    }
  });

  it("fills every slot it declares", () => {
    for (const [id, family] of skies()) {
      const made = drawn(family);
      const all = `${made.field}${made.ground}${made.veil}`;
      /*
        ⚠️ A MISSING SLOT PRINTS `undefined` INTO CSS AND THE BROWSER DROPS THAT
        ONE DECLARATION. Not the rule — the declaration — so a four-layer ground
        silently becomes three, which reads as a slightly plainer background and
        is attributed to taste. A palette is interpolated, never validated, so
        the string is the only place this is visible.
      */
      expect(all, `${id} interpolated an empty slot`).not.toContain("undefined");
      expect(all, `${id} interpolated a null slot`).not.toContain("null");
      for (const slot of family.slots) {
        expect(PALETTE[slot], `${id} declares a slot this test cannot fill: ${slot}`)
          .toBeTruthy();
      }
    }
  });

  it("declares the colour type sits against", () => {
    /*
      ⚠️ WITHOUT A VEIL, TYPE ON THIS GROUND GETS NO HALO AND NOBODY FINDS OUT
      FROM THE CODE. `--on-scene` falls back to `none`, so a hero title over a
      lit subject simply loses its contrast on one side of every stroke — which
      looks like a font-weight problem and is fixed, wrongly, three times.
    */
    for (const [id, family] of skies()) {
      expect(family.veil, `${id} declares no veil`).toBeTruthy();
      expect(drawn(family).veil, `${id} rendered an empty veil`).not.toBe("");
    }
  });

  it("is the same world for the same seed, and a different one for a different seed", () => {
    /*
      ⚠️ THE WHOLE RENDER, NOT THE FIELD. This compared marks only and passed
      four families for the wrong reason: `glow` HAS no marks — it is pure light,
      which is exactly what most screens want behind them — so both seeds gave
      the empty string and "different" was trivially false. A world is its ground
      as much as its marks, and comparing all of it is what makes the seeded
      ground a checked claim rather than a note.
    */
    const all = (family: Family, seed: string) => JSON.stringify(drawn(family, seed));
    for (const [id, family] of skies()) {
      expect(all(family, "atlas"), `${id} is not stable for one seed`)
        .toBe(all(family, "atlas"));
      expect(all(family, "atlas"), `${id} draws one world for every seed`)
        .not.toBe(all(family, "northwind"));
    }
  });

  it("carries its beats as classes, never as a style element of its own", () => {
    for (const [id, family] of skies()) {
      const field = drawn(family).field;
      /*
        ⚠️ THIS IS THE ASSERTION THAT WOULD HAVE CAUGHT A YEAR OF STILL STARS.
        The field used to carry a `<style>` inside its own SVG, which is the
        better design and does not work: Chromium renders an SVG used as
        `background-image` STATICALLY, so nothing declared in there ever ran. The
        field is a live element now and the beats are `ambienceStylesheet`'s, so
        a mark carries a CLASS and the rule reaches it.

        ⚠️ A `<style>` HERE WOULD ALSO LEAK. Inline SVG is part of the page's own
        document, so a rule inside it applies to everything — not to the picture.
      */
      expect(field, `${id} carries a <style> of its own`).not.toContain("<style");
      for (const beat of [...field.matchAll(/class="q-([\w-]+)"/g)].map((m) => m[1]!)) {
        expect(Object.keys(BEAT), `${id} carries a beat nothing defines: ${beat}`)
          .toContain(beat);
      }
    }
  });

  it("keeps a CSS custom property out of any mark that promised to be achromatic", () => {
    /*
      ⚠️ `var(--brand)` INSIDE AN SVG IS A STRING, NOT A COLOUR. Nothing resolves
      it — the mark is painted with nothing and the field is simply absent, with
      a valid document, a valid stylesheet and no error anywhere. It matters
      because a world's two colours come from two places: a workspace and a
      person have a PICTURE to read them out of, and a product and the deployment
      have only the theme. `ink: "fixed"` is the promise that a family's marks
      are achromatic and so may be used from a brand; this is the promise being
      kept.
    */
    const THEME: Palette = { deep: "var(--background)", lit: "var(--brand)" };
    for (const [id, family] of skies()) {
      if (family.ink !== "fixed") continue;
      const made = render({ family, seed: "one", palette: THEME, density: 1 });
      expect(made.field, `${id} bakes a custom property into a mark`).not.toContain("var(");
      /* ⚠️ The ground is CSS, so there it is exactly right — and a `fixed`
         family that put NOTHING of the palette on the ground would be a world
         with no hue at all. */
      expect(made.ground, `${id} takes no colour from its palette`).toContain("var(");
    }
  });

  it("lays a lattice on whole cells, so its own repeat has no seam", () => {
    /*
      ⚠️ A PATTERN REPEATS AT THE TILE SIZE, so a cell that does not divide it
      exactly is a row of half-cells down every seam — a ruled line across the
      page at the one pitch the eye is best at finding, and invisible in the
      source. The engine takes the cell as close to the family's own as a whole
      number of them allows and makes the tile their sum.
    */
    for (const [id, family] of skies()) {
      const lattice = family.tiles?.[0];
      if (!lattice) continue;
      const field = render({ family, seed: "hello", palette: PALETTE, density: 1 }).field;
      const w = Number(/pattern id="[^"]+" width="([\d.]+)"/.exec(field)?.[1]);
      const cells = [...field.matchAll(/scale\(([\d.]+)\)/g)].map((m) => Number(m[1]));
      expect(cells.length, `${id} laid no tiles`).toBeGreaterThan(0);
      const cell = cells[0]!;
      /* ⚠️ Every cell the same, or it is not a lattice. */
      expect(new Set(cells).size, `${id} lays cells of more than one size`).toBe(1);
      expect(Math.abs((w / cell) - Math.round(w / cell)), `${id} repeats mid-cell`)
        .toBeLessThan(1e-6);
    }
  });

  it("scopes the ids it emits, so two fields on one page cannot collide", () => {
    /*
      ⚠️ IDS ARE DOCUMENT-SCOPED NOW, WHICH THEY WERE NOT INSIDE A DATA URI. Two
      worlds on one page both declaring `#l` is the first one winning and the
      second one's marks filling with nothing — silent, and only reachable once
      two screens are open at once.
    */
    const seen = new Set<string>();
    for (const [id, family] of skies()) {
      for (const seed of ["atlas", "northwind"]) {
        for (const m of render({ family, seed, palette: PALETTE }).field.matchAll(/\bid="([^"]+)"/g)) {
          expect(seen.has(m[1]!), `${id}/${seed} re-uses the id ${m[1]}`).toBe(false);
          seen.add(m[1]!);
        }
      }
    }
  });
});

/**
 * WHAT THE AMBIENCE ENGINE ACTUALLY EMITS.
 *
 * ⚠️ THE GUARD CANNOT READ THIS AND SAID IT COULD. `scene.test.mjs` scanned
 * source for `@keyframes` and reported "0 animated properties, all
 * compositor-only" — over a directory holding none, while every keyframe in the
 * product was being BUILT IN JS one file away. CSS assembled from template
 * literals is not readable by a regex over the source; it is readable by running
 * the generator, which is what a test can do and a guard cannot.
 *
 * ⚠️ AND THE RULE IS THE EXPENSIVE ONE. Opacity and transform are the only two a
 * compositor can animate without touching layout or paint. Anything else on a
 * full-viewport layer repaints the whole screen every frame, for ever, on a
 * phone — and looks identical on the laptop it was written on.
 */
describe("the ambience engine's own motion", () => {
  const css = ambienceStylesheet();

  /*
    ⚠️ EXACTLY ONE ANIMATION, AND IT IS THE SOURCE. The sheet carried two
    full-viewport ones once and both were faults of a different kind: a float on
    the FIELD resampled a screen of hairlines at sub-pixel offsets every frame —
    measured off a recording, the background strobed between four brightness
    levels — and a drift on the GROUND sat under the grain, which is
    `mix-blend-mode`, so a wash sliding two percent over twenty-four seconds
    dragged a viewport-sized stack onto the main thread at 60fps.

    ⚠️ THE RULE THAT CAME OUT OF THAT IS "NOT UNDER THE BLEND", NOT "NOTHING
    MOVES", and the difference is the whole of `neon`. A hard bright band on its
    own layer ABOVE the dither composites alone: nothing re-blends, nothing
    resamples a hairline, and the cost is one promoted layer moving by a degree
    and a half over ninety seconds. What is still refused is a second one.
  */
  it("moves one layer, and it is the one above the dither", () => {
    const frames = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
    expect(frames, "one keyframe, and it is the source's").toEqual(["scene-flare"]);
    /* ⚠️ THE GROUND AND THE FIELD STAY STILL — the two that were faults. */
    expect(css).not.toMatch(/\[data-field\][^{]*\{[^}]*animation\s*:/);
    expect(css).not.toMatch(/::before[^{]*\{[^}]*animation\s*:/);
  });

  /*
    ⚠️ COMPOSITOR-ONLY, WHICH IS THE PROPERTY THAT MAKES IT AFFORDABLE. Opacity
    and transform are the only two a compositor can animate without touching
    layout or paint; anything else on a full-viewport layer repaints the whole
    screen every frame, for ever, on a phone — and looks identical on the laptop
    it was written on.
  */
  it("animates nothing a compositor cannot do on its own", () => {
    const block = /@keyframes scene-flare \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(block, "the keyframe moved and this reads nothing").toContain("transform");
    const props = [...block.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
    expect(new Set(props)).toEqual(new Set(["transform", "opacity"]));
  });

  /*
    ⚠️ AND OFF BOTH WAYS, WHICH IS THE HALF EITHER ALONE LEAVES OPEN. The media
    query is the operating system's answer; the ancestor is the switch a person
    can reach inside the app. For some people this is not a preference.
  */
  it("stops for both of the two people who can ask it to", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?data-flare/);
    expect(css).toMatch(/\[data-reduce-motion="true"\] \[data-flare\]/);
  });

  /*
    ⚠️ AND THE DRAWING STANDS DOWN WHEN SOMEBODY HAS ASKED IT TO. For some people
    this is not a preference. SMIL cannot be switched off by CSS — that is the
    price of it being the only thing that works — so the elements are simply not
    emitted, and the check is over the STRING rather than over a rule.
  */
  it("draws no beat at all for somebody who asked for less motion", () => {
    const world = { deep: "#101010", lit: "#b0b0b0", seed: "asked" };
    const moving = worldCss({ family: "loops", ...world }, { night: true, density: "rich" });
    const held = worldCss(
      { family: "loops", ...world }, { night: true, density: "rich", still: true });
    expect(moving.field, "nothing beats at all — the table is gone").toContain("<animate");
    expect(held.field, "a beat survives the one signal that must switch it off")
      .not.toContain("<animate");
    /* ⚠️ The same marks, drawn: it is the motion that goes, not the world. */
    expect(held.field.length).toBeGreaterThan(moving.field.length * 0.5);
  });
});
