/**
 * WHAT A REFUSAL SAYS, AND THE WAYS IT SAYS SOMETHING ELSE.
 *
 * ⚠️ EVERY CASE HERE IS A SENTENCE A PERSON READS AND ACTS ON. None of them
 * throws; each produces a plausible-looking string that is wrong, which is why
 * they survived — a refusal that rendered `undefined` would have been fixed the
 * first afternoon.
 */

import { describe, expect, it } from "vitest";
import { PLATFORM_PROBLEMS, problem, say, unknownProblems } from "../src/problem.js";

describe("saying it", () => {
  it("substitutes what it was given", () => {
    expect(say("{n} of {of} seats", { n: 5, of: 5 })).toBe("5 of 5 seats");
  });

  it("leaves an unknown token VISIBLE rather than printing undefined", () => {
    /* Visibly wrong beats plausibly wrong, because the second one ships. */
    expect(say("Quote {ref}")).toBe("Quote {ref}");
  });
});

describe("a problem", () => {
  it("interpolates the reference into the sentence that asks for it", () => {
    /* ⚠️ THE REF ARRIVED IN `extra` AND THE SENTENCE READS IT FROM `values`, so
       `platform.unavailable` — the problem a person is most likely to see —
       told them to quote a literal brace. Nothing failed over it: `say` leaves
       an unknown token visible on purpose, and that correct behaviour is
       exactly what let this ship. */
    const p = problem(PLATFORM_PROBLEMS, "platform.unavailable", {}, { ref: "req_8f21c04" });
    expect(p.detail).toContain("req_8f21c04");
    expect(p.detail).not.toContain("{ref}");
  });

  it("keeps a value the caller passed over one it did not", () => {
    const p = problem(PLATFORM_PROBLEMS, "platform.no_credits", { cost: 12, balance: 3 });
    expect(p.detail).toBe("This costs 12 and there are 3 left.");
  });

  it("carries the tone and the retry decision from the catalogue, not the caller", () => {
    expect(problem(PLATFORM_PROBLEMS, "platform.forbidden").retryable).toBe(false);
    expect(problem(PLATFORM_PROBLEMS, "platform.unavailable").retryable).toBe(true);
  });

  it("degrades an unknown code rather than throwing inside the error path", () => {
    /* A thrown error inside the error path turns a refusal somebody could have
       acted on into a stack trace nobody sees. */
    const p = problem(PLATFORM_PROBLEMS, "kova.nonexistent");
    expect(p.code).toBe("platform.unavailable");
    expect(p.status).toBe(503);
  });

  it("names a code an operation claims to raise and no catalogue has", () => {
    expect(unknownProblems(PLATFORM_PROBLEMS, ["platform.forbidden", "nope.missing"]))
      .toEqual(["nope.missing"]);
  });
});
