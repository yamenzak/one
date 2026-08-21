/**
 * THE HARNESS MEASURES THE DOCUMENT THE DEPLOYMENT MOUNTS, NOT HALF OF IT.
 *
 * ⚠️ HALF IS THE FAILURE THAT LOOKS LIKE A PASS. The built stylesheet carries
 * the utilities Tailwind found written down; the type face, the grounds, the
 * tones and every motion rule are put in at boot because they derive from an
 * accent. A harness reading `dist` alone lays out in the fallback stack, whose
 * metrics are somebody else's — so every height, every wrap and every rhythm
 * assertion in three packages is measured on a document nobody is served, and
 * all of them stay green while doing it.
 *
 * ⚠️ SO THIS ASSERTS BOTH HALVES ARE PRESENT, by a rule from each that nothing
 * else would emit. It is the cheapest check in the repository and it is the one
 * standing between every geometry suite and a silent revert.
 */

import { describe, expect, it } from "vitest";
import { stylesheet } from "../src/measure/index.js";

describe("what the geometry harness puts in the document", () => {
  const css = stylesheet();

  /* ⚠️ The built half: a utility only Tailwind's compiler writes. */
  it("carries the stylesheet that ships", () => {
    expect(css).toMatch(/--tw-|\.flex\{|\.flex\s*\{/);
  });

  /* ⚠️ The injected half, one rule per source, because they are separate
     exports and dropping any one of them is a different wrong document. */
  it("carries the face, so text is measured in the face people read", () => {
    expect(css).toContain("--font-mark:");
    expect(css).toContain(".font-mark {");
  });

  it("carries the ground, the tones and the motion", () => {
    expect(css).toContain("--brand");
    expect(css).toContain('[data-ink="danger"]');
    expect(css).toContain("@keyframes");
  });
});
