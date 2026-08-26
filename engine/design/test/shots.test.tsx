/**
 * THE ONE STEP THAT IS NOT A FIELD.
 *
 * ⚠️ WHAT IS ASSERTED HERE IS THE ACCUMULATION, and it is the whole reason this
 * file exists. Everything else the strip does is visible — a picture is there or
 * it is not — and one thing is not: `atOnce` lets somebody choose six adjacent
 * photographs in a single trip through the picker, which fires the handler six
 * times before React re-renders once. A handler closing over the render's list
 * appends each of them to the SAME empty array and five are lost. It looks
 * perfect with one picture, which is how anybody tries it.
 *
 * ⚠️ AND THE CEILING IS THE SAME SHAPE OF FAULT. Six is a real limit — a vision
 * run is charged per image — so a seventh that silently joins the list is a
 * charge nobody asked for, and one that silently does not is a control somebody
 * presses twice.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MOST_SHOTS, Shots } from "../src/parts/shots.js";

const A_PICTURE = "data:image/jpeg;base64,AAAA";
const url = (n: number) => `${A_PICTURE}${n}`;

const drawn = (held: readonly string[], over: Partial<Parameters<typeof Shots>[0]> = {}) =>
  renderToStaticMarkup(<Shots held={held} onSet={() => undefined} {...over} />);

describe("what the strip shows", () => {
  /* ⚠️ AN EMPTY RAIL READS AS A COMPONENT THAT FAILED TO LOAD — see `Nothing`. */
  it("says there are none rather than drawing an empty rail", () => {
    expect(drawn([])).toContain("No pictures yet");
  });

  /* ⚠️ THE LABEL IS THE ONE CARRYING THE FACTS, and saying so is the difference
     between six pictures of a bottle and six that answer. */
  it("says which picture matters most", () => {
    expect(drawn([])).toContain("label");
  });

  it("draws one tile per picture, each removable", () => {
    const out = drawn([url(1), url(2)]);
    expect(out).toContain("Remove picture 1");
    expect(out).toContain("Remove picture 2");
    expect(out).not.toContain("Remove picture 3");
  });

  /* ⚠️ THE CEILING IS SAID RATHER THAN ENFORCED IN SILENCE. A picker that simply
     disappears at six is a control somebody looks for and cannot find. */
  it("says why there is no picker once it is full", () => {
    const full = Array.from({ length: MOST_SHOTS }, (_, n) => url(n));
    expect(drawn(full)).toContain(`That is ${MOST_SHOTS}`);
  });
});

describe("six chosen at once are six kept", () => {
  /**
   * ⚠️ READ OFF THE SOURCE, AND THAT IS DELIBERATE RATHER THAN LAZY. This lane
   * renders to a string in Node — there is no DOM, so no test here can put six
   * files through a picker. A fixture that re-implemented the accumulation and
   * asserted ITSELF would pass with the component broken, which is the fault
   * `planRun` is a shape rather than a test for: two halves checked separately
   * both pass while the pairing between them is wrong.
   *
   * ⚠️ SO WHAT IS ASSERTED IS THE PROPERTY THAT MAKES THE BUG IMPOSSIBLE: the
   * handler does not read the render's list. `atOnce` fires it once per file
   * before React re-renders, so a closure over `held` appends all six to the same
   * empty array and five vanish — silently, and only when more than one was
   * chosen, which is the case nobody tries by hand.
   */
  const source = readFileSync(
    new URL("../src/parts/shots.tsx", import.meta.url), "utf8",
  );
  const handler = /onPick=\{(?:async\s*)?\(([\s\S]*?)\n\s*\}\}/.exec(source)?.[1] ?? "";

  it("has a handler to read at all", () => {
    expect(handler).toContain("shrunk");
  });

  /* ⚠️ SHRUNK RATHER THAN RAW — the manifest already claimed this happened and
     nothing did it. A phone's photograph went whole, and a portrait one went
     SIDEWAYS, because a canvas ignores the EXIF rotation tag unless asked. */
  it("downscales on the way in rather than sending the sensor's pixels", () => {
    expect(handler).not.toContain("asDataUrl");
  });

  /* ⚠️ AND AWAITS IT, SO SIX ARRIVE IN THE ORDER THEY WERE CHOSEN. Six decodes
     started at once finish in whatever order the machine decides, and on a set
     that is front / back / label the order is the one thing about them that
     matters. */
  it("waits for each picture, so the order is the order they were chosen", () => {
    expect(handler).toContain("await");
  });

  it("appends to the latest list rather than the render's", () => {
    expect(handler).toContain("latest.current");
  });

  it("never reads the render's own list inside the handler", () => {
    expect(handler).not.toMatch(/\bheld\b/);
  });

  /* ⚠️ AND THE CEILING IS APPLIED WHERE THE APPEND IS, not where the picker is
     drawn — a list that grows past six and is trimmed on the next render is six
     pictures on screen and seven charged for. */
  it("applies the ceiling at the append", () => {
    expect(handler).toContain("MOST_SHOTS");
  });
});
