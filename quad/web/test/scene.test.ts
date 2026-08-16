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

/* ⚠️ Two real colours, because `color-mix` with a bad operand is dropped by the
   browser rather than reported, and a slot filled with `undefined` is exactly
   that — see the slots test. */
const PALETTE: Palette = { deep: "#17233f", lit: "#d88a40" };

const skies = (): readonly (readonly [string, Family])[] =>
  Object.entries(FAMILIES).flatMap(([id, pair]) =>
    (["night", "day"] as const).map((when) => [`${id}.${when}`, pair[when]] as const));

const drawn = (family: Family, seed = "northwind") =>
  render({ family, seed, palette: PALETTE, density: 1.8 });

/** ⚠️ The art is a URI-encoded data URL — the marks have to come back out. */
const svgOf = (art: string) => decodeURIComponent(art);

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
      const svg = svgOf(drawn(family).art);
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
      const all = `${svgOf(made.art)}${made.ground}${made.veil}`;
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
    for (const [id, family] of skies()) {
      expect(drawn(family, "atlas").art, `${id} is not stable for one seed`)
        .toBe(drawn(family, "atlas").art);
      expect(drawn(family, "atlas").art, `${id} draws one world for every seed`)
        .not.toBe(drawn(family, "northwind").art);
    }
  });

  it("moves only where it was asked to, and stands still when it is not", () => {
    for (const [id, family] of skies()) {
      const moving = svgOf(drawn(family).art);
      const still = svgOf(render({ family, seed: "northwind", palette: PALETTE, motion: false }).art);
      /*
        ⚠️ THE STILL BAKE IS A DIFFERENT PICTURE, NOT A PAUSED ONE. The animation
        is a `<style>` INSIDE the SVG and nothing outside can reach it, which is
        the property that lets the motion travel with the image — and the reason
        switching it off has to be a second render.
      */
      expect(still, `${id} carries motion into its still bake`).not.toContain("@keyframes");
      if (moving.includes("@keyframes")) {
        /* ⚠️ The picture's own guard, so the operating system's answer is
           honoured without a rule from us. */
        expect(moving, `${id} animates past a reduced-motion preference`)
          .toContain("prefers-reduced-motion: no-preference");
      }
    }
  });
});
