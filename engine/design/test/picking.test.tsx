/**
 * WHAT A FILE PICKER TAKES, AND WHAT IT SAYS WHEN IT WILL NOT.
 *
 * ⚠️ THIS EXISTS BECAUSE THE CONTROL REFUSED EVERY PHOTOGRAPH A CAMERA PRODUCED.
 * `accept={["image/*"]}` is what makes a phone offer the camera at all, and the
 * refusal was an exact-match `accept.includes(file.type)` — so a JPEG straight
 * off the lens came back "that kind of file will not work", and the sentence
 * under it read "It has to be a *." Both halves of that were the control's own
 * careful refusal path, working perfectly, on a file that was always fine.
 *
 * ⚠️ AND NEITHER HALF NEEDED A BROWSER TO FIND. Every fault this control has ever
 * had has been in the DECISION rather than in the markup, which is why the
 * decision is `sift` and lives outside the component. Nothing here mounts
 * anything.
 */

import { describe, expect, it } from "vitest";
import { saysKind, sift, takes } from "../src/parts/pick-file.js";

const MB = 1024 * 1024;

/** ⚠️ A real `File`, because `type` and `size` are what is being judged. */
const fileOf = (name: string, type: string, size = 8) =>
  new File([new Uint8Array(size)], name, { type });

describe("what an accept list takes", () => {
  /*
    ⚠️ THE ONE THAT WAS BROKEN, AND IT IS THE COMMONEST `accept` IN THE WORLD.
    Every camera control is written `image/*`; an exact-match test against it
    refuses `image/jpeg`, which is every photograph.
  */
  it("takes a photograph when the list is a wildcard", () => {
    expect(takes(["image/*"], "image/jpeg")).toBe(true);
    expect(takes(["image/*"], "image/png")).toBe(true);
    expect(takes(["image/*"], "image/heic")).toBe(true);
  });

  /* ⚠️ AND STILL REFUSES ANOTHER FAMILY. A test proving only the first half
     would pass over an `accept` that had come to take everything. */
  it("refuses a family the wildcard does not name", () => {
    expect(takes(["image/*"], "video/mp4")).toBe(false);
    expect(takes(["image/*"], "application/pdf")).toBe(false);
  });

  /* ⚠️ AN EXACT LIST IS UNCHANGED — the wildcard is an addition, not a loosening.
     A prefix test written carelessly makes `image/png` take `image/png-xyz`. */
  it("keeps matching an exact type exactly", () => {
    expect(takes(["image/png"], "image/png")).toBe(true);
    expect(takes(["image/png"], "image/jpeg")).toBe(false);
    expect(takes(["image/png", "image/jpeg"], "image/jpeg")).toBe(true);
  });
});

describe("what the refusal calls it", () => {
  /*
    ⚠️ "IT HAS TO BE A *." IS THE SENTENCE THIS PINS. Split on `/` and
    upper-cased, `image/*` names no file anybody could produce — in a control
    whose whole argument is that the refusal is the hard part.
  */
  it("says a wildcard as its family", () => {
    expect(saysKind(["image/*"])).toBe("a picture");
    expect(saysKind(["image/*"])).not.toContain("*");
  });

  it("still names an exact type by its extension", () => {
    expect(saysKind(["image/png"])).toBe("a PNG");
    expect(saysKind(["image/png", "image/jpeg"])).toBe("a PNG or a JPEG");
  });
});

describe("how many at once", () => {
  const shots = [
    fileOf("front.jpg", "image/jpeg"),
    fileOf("back.jpg", "image/jpeg"),
    fileOf("label.jpg", "image/jpeg"),
  ];

  /*
    ⚠️ SIX ADJACENT PHOTOGRAPHS ARE ONE TRIP THROUGH THE PICKER. Written for one
    file, this made somebody fetch six adjacent files from their camera roll six
    times — a limit nobody had decided, enforced on the person.
  */
  it("takes several when the caller allows several", () => {
    const { taking, why } = sift(shots, ["image/*"], MB, 6);
    expect(taking.map((f) => f.name)).toEqual(["front.jpg", "back.jpg", "label.jpg"]);
    expect(why).toBeNull();
  });

  /* ⚠️ THE CEILING IS APPLIED BEFORE THE JUDGING, so nothing past it is read. */
  it("stops at the ceiling", () => {
    expect(sift(shots, ["image/*"], MB, 2).taking.map((f) => f.name))
      .toEqual(["front.jpg", "back.jpg"]);
  });

  /* ⚠️ A CEILING OF NONE IS STILL ONE. `MOST − held` reaches zero the moment a
     caller is full, and a zero that took nothing would be a picker that opens,
     accepts a file and silently drops it. */
  it("never falls below one", () => {
    expect(sift(shots, ["image/*"], MB, 0).taking).toHaveLength(1);
  });

  /*
    ⚠️ ONE BAD FILE DOES NOT THROW THE GOOD ONES AWAY, which is the shape a loop
    that stopped at the first refusal would have: somebody who picked five
    photographs and a video gets nothing, plus a sentence about the video, and no
    way to tell which of the six it meant.
  */
  it("takes the good ones and reports the first refusal", () => {
    const { taking, why } = sift(
      [shots[0]!, fileOf("clip.mp4", "video/mp4"), shots[1]!], ["image/*"], MB, 6,
    );
    expect(taking.map((f) => f.name)).toEqual(["front.jpg", "back.jpg"]);
    expect(why?.detail ?? "").toContain("a picture");
  });

  /* ⚠️ THE SIZE CEILING IS PER FILE AND SURVIVES THE BATCH. A multi-pick that
     checked only the first would send a ten-megabyte photograph to a route that
     refuses it, after the upload. */
  it("refuses one that is too large without losing the rest", () => {
    const { taking, why } = sift(
      [shots[0]!, fileOf("huge.jpg", "image/jpeg", 4 * MB)], ["image/*"], MB, 6,
    );
    expect(taking.map((f) => f.name)).toEqual(["front.jpg"]);
    expect(why?.title ?? "").toBeTruthy();
  });
});
