/**
 * A REFUSAL NEVER SHOWS A PERSON A PLACEHOLDER.
 *
 * ⚠️ THIS WAS PHOTOGRAPHED. A refused upload said "It is not you. Quote {ref} if
 * you tell us about it." — the one refusal a person is most likely to meet,
 * asking them to quote a literal brace. The value was missing because only the
 * unexpected-throw path minted a reference; a deliberate
 * `ctx.fail("platform.unavailable")` supplied none.
 *
 * ⚠️ AND THE RULE THAT LET IT THROUGH WAS A GOOD ONE. `say` leaves an unknown
 * token VISIBLE rather than printing `undefined` — "visibly wrong beats
 * plausibly wrong" — and it works exactly as written. What it does not do is
 * choose WHO it is visible to: being loud in development needs somebody to look,
 * being loud in production needs nothing.
 *
 * ⚠️ SO THE TOKEN STAYS VISIBLE IN `say`, WHERE THIS TEST READS IT, and a
 * `Problem` drops the sentence on its way out. Both halves are asserted here,
 * because either one alone is the bug: a `say` that hid the token would make the
 * next missing value untraceable, and a `problem` that kept it is this report.
 */

import { describe, expect, it } from "vitest";
import { PLATFORM_PROBLEMS, problem, say } from "@engine/kernel";

describe("a value that never arrived", () => {
  /* ⚠️ THE REPORTED CASE, BY CODE. */
  it("does not tell somebody to quote a brace", () => {
    const said = problem(PLATFORM_PROBLEMS, "platform.unavailable");
    expect(said.detail ?? "").not.toContain("{");
    expect(said.title).not.toContain("{");
  });

  /* ⚠️ AND WHAT SURVIVES IS STILL THE POINT OF THE MESSAGE. Dropping the whole
     detail would be a refusal that says less than it knows. */
  it("keeps the sentences it can complete", () => {
    expect(problem(PLATFORM_PROBLEMS, "platform.unavailable").detail).toBe("It is not you.");
  });

  it("keeps the whole thing when the value is there", () => {
    const said = problem(PLATFORM_PROBLEMS, "platform.unavailable", {}, { ref: "err_1a2b" });
    expect(said.detail).toContain("err_1a2b");
    expect(said.detail).toContain("It is not you.");
  });

  /*
    ⚠️ EVERY REFUSAL IN THE PLATFORM CATALOGUE, NOT THE ONE THAT WAS REPORTED. A
    test pinning `platform.unavailable` alone passes the day somebody adds a
    second templated message and forgets its value — which is this bug with a
    different code.
  */
  it("holds for every platform refusal raised with nothing", () => {
    for (const code of Object.keys(PLATFORM_PROBLEMS)) {
      const said = problem(PLATFORM_PROBLEMS, code);
      expect(said.title, `${code}'s title`).not.toMatch(/\{\w+\}/);
      expect(said.detail ?? "", `${code}'s detail`).not.toMatch(/\{\w+\}/);
    }
  });

  /*
    ⚠️ AND `say` ITSELF STILL SHOWS IT. This is the half that makes a missing
    value findable at all — hiding it here would move the fault from a brace on
    somebody's screen to a sentence quietly missing from every one.
  */
  it("leaves the token visible in `say`, which is where it belongs", () => {
    expect(say("Quote {ref} please")).toBe("Quote {ref} please");
    expect(say("Quote {ref} please", { ref: "x" })).toBe("Quote x please");
  });
});
