/**
 * THE OUTCOME ON THE WIRE.
 *
 * ⚠️ IT WAS DECLARED EVERYWHERE AND DELIVERED NOWHERE — twelve operations in
 * this runtime carry one and none of them reached a client. That is the failure
 * this platform was started over, inside the platform, invisible because nothing
 * that consumed it existed yet to notice it was missing.
 */

import { describe, expect, it } from "vitest";
import { OUTCOME_HEADER, outcomeHeader, readOutcome } from "../src/outcome.js";
import type { Outcome } from "@one/kernel";

const parse = (value: string | null) => (value === null ? null : (JSON.parse(value) as Record<string, unknown>));
const saved: Outcome = { message: "Saved", tone: "success", moment: "acknowledge", invalidates: ["note"] };

describe("what travels beside the body", () => {
  it("says nothing at all when there is nothing to say", () => {
    expect(outcomeHeader(undefined)).toBeNull();
  });

  it("carries the message, the tone and what it invalidated", () => {
    expect(parse(outcomeHeader(saved))).toMatchObject({
      message: "Saved", tone: "success", moment: "acknowledge", invalidates: ["note"],
    });
  });

  /*
    ⚠️ THE SOUND IS DERIVED FROM THE MOMENT, so the two cannot part. An app that
    chose both could pair a celebration with the error chime, and would, the
    first time somebody copied a declaration and edited half of it.
  */
  it("derives the sound rather than carrying a chosen one", () => {
    expect(parse(outcomeHeader(saved))).toMatchObject({ sound: "commit" });
    expect(parse(outcomeHeader({ message: "Bye", tone: "info", moment: "farewell" }))).toMatchObject({ sound: "depart" });
  });

  it("carries no sound for an outcome with no moment, which is most of them", () => {
    expect(parse(outcomeHeader({ message: "Saved", tone: "success" }))).not.toHaveProperty("sound");
  });
});

describe("a celebration replaces the save that caused it", () => {
  const earned = { moment: "celebrate", message: "Your first plan" } as const;

  /*
    ⚠️ "SAVED" IS NOT NEWS STANDING NEXT TO "YOU EARNED SOMETHING", and the copy
    travels with whichever won. A celebration that kept the word "Saved" shows
    the smaller thing's words with the larger thing's animation, which reads as
    the product having lost track rather than as an award.
  */
  it("wins over an acknowledgement, and brings its own words", () => {
    expect(parse(outcomeHeader(saved, earned))).toMatchObject({
      moment: "celebrate", sound: "earn", message: "Your first plan",
    });
  });

  it("still invalidates what the operation invalidated", () => {
    expect(parse(outcomeHeader(saved, earned))).toMatchObject({ invalidates: ["note"] });
  });

  /*
    ⚠️ A READ CAN EARN ONE TOO. An operation with no outcome of its own that
    happens to complete a milestone still has something worth saying — and
    without this it would be the only place a milestone is earned in silence.
  */
  it("speaks for an operation that declared no outcome at all", () => {
    expect(parse(outcomeHeader(undefined, earned))).toMatchObject({ moment: "celebrate", message: "Your first plan" });
  });
});

describe("a header is bytes", () => {
  /*
    ⚠️ THIS IS THE ONE THAT WOULD HAVE SHIPPED. A header value is a ByteString:
    setting one containing a character above U+00FF THROWS — in the success
    path, after the write already happened, turning a completed operation into a
    503. So "Gespeichert ✓", any Arabic outcome and every emoji a product will
    ever put in a confirmation are decided by copy in a manifest, in a code path
    that has no error of its own.
  */
  it("carries a message no header could hold, by escaping it to ASCII", () => {
    const value = outcomeHeader({ message: "Gespeichert ✓ تم", tone: "success" })!;
    expect(value).toMatch(/^[\u0020-\u007e]*$/);
    expect(() => new Headers().set(OUTCOME_HEADER, value)).not.toThrow();
    expect(readOutcome({ get: () => value })!.message).toBe("Gespeichert ✓ تم");
  });

  /*
    ⚠️ AND THE ONES BETWEEN U+0080 AND U+00FF DO NOT THROW — they are carried as
    latin-1 and come back mangled, which is worse: a 503 is noticed.
  */
  it("escapes the range that would be silently mangled rather than refused", () => {
    expect(outcomeHeader({ message: "Größe", tone: "success" })!).not.toMatch(/ö/);
  });

  it("survives a round trip through real headers", () => {
    const headers = new Headers();
    headers.set(OUTCOME_HEADER, outcomeHeader(saved)!);
    expect(readOutcome(headers)).toMatchObject({ message: "Saved", moment: "acknowledge" });
  });
});

describe("reading one back", () => {
  it("reads an absent header as an ordinary response rather than an error", () => {
    expect(readOutcome(new Headers())).toBeNull();
  });

  /*
    ⚠️ PRESENTATION METADATA MUST NEVER BE THE REASON A SUCCESSFUL CALL FAILS.
    The write already happened and was already answered; throwing here would
    report it as an error and invite a retry that duplicates it.
  */
  it("reads a malformed one as absent", () => {
    expect(readOutcome({ get: () => "{not json" })).toBeNull();
  });
});
