/**
 * THE CHOREOGRAPHER, AND THE MOMENT THAT SITS ON TOP OF IT.
 *
 * ⚠️ A MOMENT IS A SCENE WITH A HOLD, not a second animation system. That is the
 * whole reason it is in this file: anything with its own timeline drifts from
 * everything else, and the reduced-motion pass would have to be written twice.
 */

import { describe, expect, it } from "vitest";
import { CLOCK, CHOREOGRAPHY, MOMENT_HOLD, moment, scene, supersede } from "../src/motion.js";

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

/* ------------------------------------------------------- weight, measured --- */

/*
  ⚠️ THE COMPLAINT THAT PRODUCED THIS SECTION WAS "IT HAS NO WEIGHT", AND EVERY
  NUMBER LOOKED REASONABLE. Filmed, the entrance was over before the first frame
  landed: 320ms with a 10px rise under an expo curve is finished at ~140ms of
  visible motion, which does not read as fast — it reads as nothing happening.

  ⚠️ AND RAISING THE DURATION ALONE WOULD NOT HAVE FIXED IT. Under an expo ease
  the extra time is spent below the perceptual threshold, so the change is
  invisible and the screen still feels cheap. That is the trap this file exists
  to keep shut, and it is arithmetic rather than taste.
*/
describe("the entrance is long enough to be seen", () => {
  /** Progress of a cubic-bezier timing function at a fraction of its window. */
  const at = (p1x: number, p1y: number, p2x: number, p2y: number) => {
    const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
    const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
    const X = (t: number) => ((ax * t + bx) * t + cx) * t;
    const Y = (t: number) => ((ay * t + by) * t + cy) * t;
    return (x: number) => {
      let t = x;
      for (let i = 0; i < 24; i++) {
        const e = X(t) - x;
        if (Math.abs(e) < 1e-6) break;
        const d = (3 * ax * t + 2 * bx) * t + cx;
        if (Math.abs(d) < 1e-9) break;
        t -= e / d;
      }
      return Y(t);
    };
  };

  const numbers = (name: string): number[] => {
    const m = new RegExp(`${name}:\\s*cubic-bezier\\(([^)]+)\\)`).exec(CLOCK);
    if (!m) throw new Error(`${name} is not a cubic-bezier`);
    return m[1]!.split(",").map((n) => Number(n.trim()));
  };
  const ms = (name: string): number => Number(new RegExp(`${name}:\\s*(\\d+)ms`).exec(CLOCK)![1]);

  /*
    ⚠️ MOST OF THE DURATION MUST BE MOTION SOMEBODY CAN WATCH. A curve at 95% of
    its distance after 43% of its time spends the rest going nowhere visible, and
    every millisecond added to the token lands in that dead half.
  */
  it("spends most of its window moving", () => {
    const f = at(...(numbers("--e-out") as [number, number, number, number]));
    let t95 = 1;
    for (let t = 0; t <= 1; t += 0.005) if (f(t) >= 0.95) { t95 = t; break; }
    expect(t95, "the house curve finishes visibly before its duration does").toBeGreaterThanOrEqual(0.55);
  });

  /*
    ⚠️ A SCREEN COMPOSING IS SLOWER THAN AN OBJECT ARRIVING, WHICH IS SLOWER THAN
    ANYTHING LEAVING. One number for the first two makes either the page cheap or
    the sheet slow; symmetry with the third is the commonest reason an interface
    feels sluggish.
  */
  it("orders the durations by what each event is", () => {
    expect(ms("--t-entrance")).toBeGreaterThan(ms("--t-enter"));
    expect(ms("--t-enter")).toBeGreaterThan(ms("--t-exit"));
    expect(ms("--t-move")).toBeGreaterThan(ms("--t-tap"));
  });

  /* ⚠️ And it travels far enough to be a movement rather than a nudge. */
  it("moves far enough to be seen", () => {
    const rise = /one-rise \{ from \{[^}]*translateY\((\d+)px\)/.exec(CHOREOGRAPHY);
    expect(Number(rise![1]), "a short rise is a fade wearing a transform").toBeGreaterThanOrEqual(16);
    expect(ms("--stagger"), "under about 60ms a stagger is a smear rather than an order").toBeGreaterThanOrEqual(60);
  });

  /*
    ⚠️ THE RELEASE SPRINGS AND THE PRESS DOES NOT. A control that overshoots on
    the way down feels loose: the finger is still on it, and nothing physical
    overshoots under a thumb.
  */
  it("presses with a damped curve and releases with the spring", () => {
    /* ⚠️ The RULE, not the first `:active` in a selector list. */
    expect(CHOREOGRAPHY).toMatch(/transform: scale\(0?\.\d+\);\s*transition: transform var\(--t-tap\) var\(--e-in\)/);
    expect(CHOREOGRAPHY).toMatch(/transition: transform var\(--t-move\) var\(--e-spring\)/);
  });
});
