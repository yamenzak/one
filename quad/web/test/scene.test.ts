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
    for (const [id, family] of skies()) {
      expect(drawn(family, "atlas").field, `${id} is not stable for one seed`)
        .toBe(drawn(family, "atlas").field);
      expect(drawn(family, "atlas").field, `${id} draws one world for every seed`)
        .not.toBe(drawn(family, "northwind").field);
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
