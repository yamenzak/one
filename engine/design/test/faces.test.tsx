/**
 * THE FACE GENERATOR, AGAINST DICEBEAR'S OWN CHECKS.
 *
 * ⚠️ THIS IS THE OTHER HALF OF `../vite.ts`. The browser bundle stubs DiceBear's
 * two compiled JSON-schema validators — 1.19 MB of generated AJV, a fifth of the
 * entry chunk, whose only job is to check a style file we vendor and an options
 * object we write by hand. Nothing about either can vary at runtime, so the check
 * belongs where the answer is fixed: here, at build time, once.
 *
 * ⚠️ WHICH MAKES THIS TEST THE THING THAT MAKES THE STUB HONEST. It runs under
 * vitest with no Vite build in front of it, so every `new Style(...)` and `new
 * Avatar(...)` below goes through the REAL validators. An upgrade that genuinely
 * invalidates a style file, an option somebody renamed, or a schema DiceBear
 * tightened fails here — loudly, in CI — instead of drawing nothing in somebody's
 * crown.
 *
 * ⚠️ AND IT DRAWS EVERY SHAPE THE PRODUCT ASKS FOR, not one. The two styles are
 * two files and two validations; the world turns twelve named star options off
 * and passes a colour whose alpha is zero, which is where an OPTIONS schema
 * change would otherwise be silent — a dropped option is ignored, and the picture
 * is still a picture.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ONE_FACE, Orb, appFace, faceUri, placeFace, whoFace, worldFor,
} from "../src/index.js";

/**
 * ⚠️ THROUGH `faceUri` RATHER THAN THROUGH `Face`, and the reason is worth
 * knowing before somebody "fixes" it. HeroUI's `Avatar` swaps a picture in on the
 * CLIENT, so rendered to static markup it is a letter in a circle and the data
 * URI is nowhere in the output — a test reading the markup would assert nothing
 * and pass forever. The generator is what is under test here, so the generator is
 * what is called.
 */

describe("the faces DiceBear draws for us", () => {
  /* ⚠️ BOTH STYLES, ALL THREE SIZES, BOTH MOVEMENTS. `StyleValidator` runs per
     style, so validating one proves nothing about the other; and the moving bake
     is the only one that passes `animationVariant`, which is the option most
     likely to be renamed and the one whose absence is silent (every variant
     ships at weight zero). */
  it("draws a person and a workspace at every size, still and moving", () => {
    for (const of of [whoFace("acc_01H"), placeFace("northwind")]) {
      for (const size of ["chip", "row", "panel"] as const) {
        for (const moving of [false, true]) {
          const uri = faceUri(of, size, moving);
          expect(uri, `${of.kind} at ${size} ${moving ? "moving" : "still"}`)
            .toMatch(/^data:image\/svg\+xml/);
        }
      }
    }
  });

  /* ⚠️ AND THE MOVING ONE IS A DIFFERENT PICTURE, which is the whole reason two
     bakes exist: the animation is a `<style>` inside the SVG, so switching it off
     means serving another file rather than pausing this one. */
  it("bakes movement into the picture rather than onto it", () => {
    expect(faceUri(whoFace("acc_m"), "row", true))
      .not.toBe(faceUri(whoFace("acc_m"), "row", false));
  });

  /* ⚠️ ONE SEED IS ONE PICTURE, which is the whole contract a face makes: one
     person, one face, in every workspace and every product. */
  it("gives one seed one picture and two seeds two", () => {
    expect(faceUri(whoFace("acc_same"))).toBe(faceUri(whoFace("acc_same")));
    expect(faceUri(whoFace("acc_a"))).not.toBe(faceUri(whoFace("acc_b")));
  });

  /* ⚠️ AND THE TWO KINDS WITH NO PICTURE GET NULL RATHER THAN A GUESS. */
  it("draws nothing for a product or for the deployment", () => {
    expect(faceUri(appFace("beacon", "B"))).toBeNull();
    expect(faceUri(ONE_FACE)).toBeNull();
  });

  /*
    ⚠️ THE ORB IS THE OPTIONS SCHEMA'S OTHER TEST. It asks for a colour whose
    alpha is zero and turns twelve named stars off — every one of those an option
    `OptionsValidator` would refuse if it were renamed. With no refusal a dropped
    option draws a picture that is simply wrong, and nothing else here notices.
    It renders as a bare `<img>`, so the markup does carry the URI.
  */
  it("draws a world with its sky turned off", () => {
    const markup = renderToStaticMarkup(<Orb of={placeFace("northwind")} />);
    expect(markup).toMatch(/src="data:image\/svg\+xml/);
  });

  /* ⚠️ AND THE COLOURS ARE READ BACK OUT OF THE GENERATED SVG, so a style whose
     palette moved stops resolving rather than resolving to something else. */
  it("reads two colours out of a workspace's world", () => {
    const world = worldFor(placeFace("northwind"));
    expect(world, "a workspace has a generated world").not.toBeNull();
    expect(world!.deep).toMatch(/^#[0-9a-f]{3,8}$/);
    expect(world!.lit).toMatch(/^#[0-9a-f]{3,8}$/);
  });

  /* ⚠️ THE TWO THAT ARE NOT GENERATED HAVE NOTHING TO READ — a product wears the
     glyph its manifest declared and ONE wears a fixed mark, so both take the
     theme's own two values rather than a picture's. */
  it("hands a product and the deployment the theme instead of a palette", () => {
    for (const of of [appFace("beacon", "B"), ONE_FACE]) {
      expect(worldFor(of)?.deep, of.kind).toMatch(/^var\(--/);
    }
  });
});
