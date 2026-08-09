/**
 * THE CHOREOGRAPHER, AND THE MOMENT THAT SITS ON TOP OF IT.
 *
 * ⚠️ A MOMENT IS A SCENE WITH A HOLD, not a second animation system. That is the
 * whole reason it is in this file: anything with its own timeline drifts from
 * everything else, and the reduced-motion pass would have to be written twice.
 */

import { describe, expect, it } from "vitest";
import { MOMENT_HOLD, moment, scene, supersede } from "../src/motion.js";

/*
  ⚠️ THE VOCABULARY IS THE KERNEL'S AND THE TIMING IS THIS PACKAGE'S, and the two
  do not import one another. So the list is transcribed — and a transcription
  nobody checks is right until somebody adds a moment. A hold for a moment nobody
  can declare is dead; a moment with no hold plays for zero milliseconds, which
  is invisible rather than wrong, and therefore never reported.
*/
const DECLARED = ["acknowledge", "welcome", "farewell", "celebrate"] as const;

describe("every moment the kernel declares has a timing here", () => {
  it("holds each one, and holds nothing else", () => {
    expect(Object.keys(MOMENT_HOLD).sort()).toEqual([...DECLARED].sort());
  });

  it("holds a celebration longest and an acknowledgement shortest", () => {
    expect(MOMENT_HOLD.celebrate).toBeGreaterThan(MOMENT_HOLD.welcome);
    expect(MOMENT_HOLD.acknowledge).toBeLessThan(MOMENT_HOLD.farewell);
  });
});

describe("a moment plays on the one clock", () => {
  it("is an overlay in a scene, not a timeline of its own", () => {
    const played = moment("acknowledge", "commit", { audible: true, gesture: true });
    expect(played.steps).toEqual(scene(["overlay"]));
  });

  /*
    ⚠️ REDUCED MOTION REMOVES THE TRANSFORM AND NOT THE MESSAGE — and it does not
    shorten the hold. Reduced motion is about movement, not about reading speed;
    cutting the time somebody has to read the words is the one adaptation that
    makes the setting worse for the people who turn it on.
  */
  it("drops the transform under reduced motion and keeps the hold", () => {
    const played = moment("celebrate", "earn", { reduced: true });
    expect(played.steps[0]!.from).toEqual({ opacity: 0 });
    expect(played.hold).toBe(MOMENT_HOLD.celebrate);
  });
});

describe("a sound needs a gesture and a surface that asked for one", () => {
  /*
    ⚠️ EVERY BROWSER REFUSES AUDIO NO GESTURE ASKED FOR. A design that ignores
    that produces silence in production and a chime in every demo — and it is
    simply correct besides: a sound nobody's action caused arrives out of nowhere.
  */
  it("plays only when the surface is audible and somebody just acted", () => {
    expect(moment("welcome", "arrive", { audible: true, gesture: true }).sound).toBe("arrive");
    expect(moment("welcome", "arrive", { audible: true }).sound).toBeNull();
    expect(moment("welcome", "arrive", { gesture: true }).sound).toBeNull();
  });

  /* ⚠️ SILENT IS THE DEFAULT. An app that declared no sounds makes no noise. */
  it("is silent when nothing was said either way", () => {
    expect(moment("celebrate", "earn").sound).toBeNull();
  });
});

describe("one moment on screen", () => {
  /*
    ⚠️ A SECOND REPLACES RATHER THAN QUEUES. A queue is how a batch of writes
    produces four celebrations in a row, each meaning less than the last, long
    after the thing that caused them.
  */
  it("replaces what was showing", () => {
    expect(supersede("acknowledge", "celebrate")).toBe("celebrate");
  });

  it("keeps what is showing when nothing new arrived", () => {
    expect(supersede("celebrate", null)).toBe("celebrate");
  });
});
