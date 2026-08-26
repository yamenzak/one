/**
 * THE QUEUE, AND THE FOUR STATES A HAPPY PATH NEVER REACHES.
 *
 * ⚠️ WHAT IS ASSERTED HERE IS THAT EVERY STATE HAS ITS OWN SCREEN, which is the
 * whole argument for the component. `PickFile`'s account of an upload in flight
 * is `busy?: boolean`, and every screen that wanted more wrote the rest itself:
 * one drew a spinner and no percentage, one a bar that hit 100% and sat there
 * through a server round trip, one reported a failure by removing the row. The
 * last of those reads as success, which is the worst thing a control can say.
 *
 * ⚠️ AND THE CONTROL AT THE END OF THE ROW IS THE PART THAT COULD SILENTLY BE
 * WRONG. A single always-present "Remove" typechecks, renders, and is the wrong
 * affordance in exactly the two states that are not about removing — so somebody
 * whose upload failed presses it and loses the file, and somebody mid-upload
 * presses it expecting to stop and loses it too.
 *
 * ⚠️ RENDERED STATICALLY, WHICH BOUNDS WHAT THESE CAN ASK — see `create.test`.
 * There is no DOM here, so nothing can put a file through a picker; what a
 * string render sees is the queue and its states, which is what this file is
 * for. The accumulation is `pick-file`'s own tests and the pixels are the seen
 * lane.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PLATFORM_PROBLEMS, problem } from "@engine/kernel";
import { Attach, roomFor, type Attached, type Progress } from "../src/parts/attach.js";

const one = (at: Progress, over: Partial<Attached> = {}): Attached => ({
  id: `f-${at}`,
  name: `${at}.jpg`,
  bytes: 120_000,
  type: "image/jpeg",
  of: new ArrayBuffer(0),
  at,
  ...over,
});

const drawn = (held: readonly Attached[], over: Partial<Parameters<typeof Attach>[0]> = {}) =>
  renderToStaticMarkup(
    <Attach
      held={held}
      onAdd={() => undefined}
      onRemove={() => undefined}
      onRetry={() => undefined}
      onStop={() => undefined}
      accept={["image/*"]}
      most={4 * 1024 * 1024}
      says="Up to 6"
      {...over}
    />,
  );

describe("every state has its own screen", () => {
  it("says where each file has got to, in its own words", () => {
    const out = drawn([one("held"), one("sending"), one("settling"), one("done")]);
    for (const says of ["Ready to send", "Sending", "Finishing", "Sent"]) {
      expect(out).toContain(says);
    }
  });

  /*
    ⚠️ THE GAP BETWEEN THE LAST BYTE AND THE ANSWER IS THE STATE EVERY
    HAND-WRITTEN UPLOADER LEAVES OUT. A determinate bar has nothing left to say
    in it; sat at 100% it reads as a hang, which is the moment somebody presses
    the button again.
  */
  it("keeps a bar up while the server has not answered yet", () => {
    expect(drawn([one("settling")])).toContain('role="progressbar"');
  });

  it("draws no bar for a file that is only waiting", () => {
    expect(drawn([one("held")])).not.toContain('role="progressbar"');
  });

  /* ⚠️ A VALUE WHERE THERE IS ONE, because a bar with no number is a bar that
     could be anywhere — and none where there is not, because a small file
     finishes inside one progress event and a bar for it would go from nothing to
     everything. */
  it("carries the value it has and admits when it has none", () => {
    expect(drawn([one("sending", { along: 0.5 })])).toContain('aria-valuenow="50"');
    expect(drawn([one("sending")])).not.toContain("aria-valuenow");
  });
});

describe("the control at the end is the one the state needs", () => {
  /* ⚠️ A FAILURE NEEDS A WAY BACK, AND THE BYTES ARE KEPT SO IT CAN HAVE ONE.
     Handed straight to a fetch and dropped, "try again" can only be a picker. */
  it("offers a retry on a refusal rather than a remove", () => {
    const out = drawn([one("refused", {
      why: problem(PLATFORM_PROBLEMS, "platform.too_large", { size: 4_980, most: 4_096 }),
    })]);
    expect(out).toContain("Try again");
    expect(out).not.toContain("Remove refused.jpg");
  });

  it("offers a stop while something is in flight rather than a remove", () => {
    const out = drawn([one("sending", { along: 0.2 })]);
    expect(out).toContain("Stop");
    expect(out).not.toContain("Remove sending.jpg");
  });

  it("offers a remove once there is nothing happening", () => {
    expect(drawn([one("done")])).toContain("Remove done.jpg");
  });

  /* ⚠️ AND THE REFUSAL IS THE PLATFORM'S SENTENCE, under the row it is about. A
     control drawing its own is how the same failure reads differently depending
     on which screen somebody is on. */
  it("puts the door's own words under the file they are about", () => {
    const out = drawn([one("refused", {
      why: problem(PLATFORM_PROBLEMS, "platform.too_large", { size: 4_980, most: 4_096 }),
    })]);
    expect(out).toContain("4096");
  });
});

describe("what it shows", () => {
  /* ⚠️ AN EMPTY RAIL READS AS A COMPONENT THAT FAILED TO LOAD — see `Nothing`. */
  it("says there is nothing rather than drawing an empty list", () => {
    expect(drawn([])).toContain("Nothing attached yet");
  });

  /* ⚠️ THE CEILING IS SAID, NOT ENFORCED IN SILENCE. A picker that simply
     disappears is a control somebody looks for and cannot find. */
  it("says why there is no picker once the count is reached", () => {
    const full = Array.from({ length: 3 }, (_, n) => one("done", { id: `x${n}` }));
    expect(drawn(full, { mostFiles: 3 })).toContain("which is the limit");
  });

  /* ⚠️ TILES WHERE THE PICTURE IS THE POINT, ROWS WHERE THE NAME IS. A row list
     of six photographs is six file names nobody can tell apart. */
  it("draws a picture as a tile when that is what is being decided about", () => {
    const out = drawn([one("done", { preview: "data:image/jpeg;base64,AA" })], {
      shows: "tiles",
    });
    expect(out).toContain("size-20");
    expect(out).not.toContain("Ready to send");
  });
});

/*
  ⚠️ THE AGGREGATE CEILING IS THE ONE `PickFile` CANNOT SEE. It judges one file
  against `most` and knows nothing about the five already held, so six
  four-megabyte photographs each pass a four-megabyte check and arrive as
  twenty-four megabytes at a door that refuses eight. The per-file limit was
  tightened to compensate, which refused every photograph a modern phone takes.
*/
describe("room between them", () => {
  const held = [{ bytes: 3_000_000 }, { bytes: 3_000_000 }];

  it("counts what is already held rather than only the new one", () => {
    expect(roomFor(held, 1_000_000, 8_000_000)).toBe(true);
    expect(roomFor(held, 3_000_000, 8_000_000)).toBe(false);
  });

  it("lets a file exactly fill the allowance", () => {
    expect(roomFor(held, 2_000_000, 8_000_000)).toBe(true);
  });

  it("is a question about the total, not about the count", () => {
    expect(roomFor([], 9_000_000, 8_000_000)).toBe(false);
  });
});
