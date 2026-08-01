/**
 * The release decision and the recall.
 *
 * Every test here is about the LAG: the biological indicator comes back a day
 * or two after the trays went on the shelf, so a load can be correctly released
 * on Tuesday's evidence and correctly failed on Thursday's. A model that cannot
 * hold both of those at once cannot describe a recall, which is the one thing
 * this product is for.
 */

import { describe, expect, it } from "vitest";
import { biologicalOutcome, recallDisposition, releaseCheck, summariseRecall, type CycleEvidence } from "../src/index.js";

const cycle = (over: Partial<CycleEvidence> = {}): CycleEvidence => ({
  status: "ended",
  physicalOk: true,
  chemicalOk: true,
  biologicalOk: null,
  ...over,
});

describe("may this load be released", () => {
  it("permits release on the fast evidence, and SAYS the biological is still out", () => {
    // The normal case, and the one that makes recall necessary. No clinic holds
    // every tray for 48 hours; an app that demanded it would have its release
    // step done on paper instead.
    expect(releaseCheck(cycle(), { requireBiological: false })).toEqual({ ok: true, biologicalPending: true });
  });

  it("distinguishes an unread indicator from a FAILED one", () => {
    // Two very different situations: one is a task, the other is a recall in
    // waiting. Sharing a message would train people to treat one as the other.
    expect(releaseCheck(cycle({ chemicalOk: null }), { requireBiological: false })).toEqual({ ok: false, reason: "missing_chemical" });
    expect(releaseCheck(cycle({ chemicalOk: false }), { requireBiological: false })).toEqual({ ok: false, reason: "indicator_failed" });
  });

  it("refuses a load that is still in the machine, whatever is recorded against it", () => {
    expect(releaseCheck(cycle({ status: "running" }), { requireBiological: false })).toEqual({ ok: false, reason: "not_ended" });
  });

  it("refuses to release the same load twice", () => {
    expect(releaseCheck(cycle({ status: "released" }), { requireBiological: false })).toEqual({ ok: false, reason: "already_released" });
  });

  it("waits for the biological ONLY when the caller says this is that kind of load", () => {
    // Implant loads and some house rules require it; routine loads do not.
    // There is no default — picking one silently would be a safety decision this
    // function has no standing to make.
    expect(releaseCheck(cycle(), { requireBiological: true })).toEqual({ ok: false, reason: "biological_pending" });
    expect(releaseCheck(cycle({ biologicalOk: true }), { requireBiological: true })).toEqual({ ok: true, biologicalPending: false });
  });

  it("blocks a FAILED biological under BOTH regimes", () => {
    // There is no policy under which "the spores survived" is releasable.
    for (const requireBiological of [true, false]) {
      expect(releaseCheck(cycle({ biologicalOk: false }), { requireBiological })).toEqual({ ok: false, reason: "indicator_failed" });
    }
  });
});

describe("what a biological reading means", () => {
  it("is a RECALL when it fails on a load somebody already released", () => {
    // Thursday's evidence against Tuesday's decision. The trays are on shelves
    // and some have been opened. This is the scenario the product exists for.
    expect(biologicalOutcome(cycle({ status: "released" }), false)).toBe("recall");
  });

  it("is a contained failure when it fails before anyone released it", () => {
    expect(biologicalOutcome(cycle({ status: "ended" }), false)).toBe("fail");
  });

  it("confirms a released load and unblocks an unreleased one", () => {
    expect(biologicalOutcome(cycle({ status: "released" }), true)).toBe("confirmed");
    expect(biologicalOutcome(cycle({ status: "ended" }), true)).toBe("cleared");
  });

  it("REFUSES a second reading that disagrees, instead of overwriting it", () => {
    // Last-write-wins is the obvious behaviour and the wrong one: it quietly
    // rewrites the evidence a release was justified by. A person has to say
    // which reading is true and why.
    expect(biologicalOutcome(cycle({ biologicalOk: true }), false)).toBe("contradiction");
    expect(biologicalOutcome(cycle({ biologicalOk: false }), true)).toBe("contradiction");
  });

  it("accepts re-recording the SAME reading", () => {
    // A retry is not a change of story.
    expect(biologicalOutcome(cycle({ status: "released", biologicalOk: false }), false)).toBe("recall");
    expect(biologicalOutcome(cycle({ status: "released", biologicalOk: true }), true)).toBe("confirmed");
  });
});

describe("what a recall can and cannot reach", () => {
  it("freezes what is still on a shelf, at every stage before opening", () => {
    for (const status of ["packed", "in_cycle", "awaiting_release", "sterile"]) {
      expect(recallDisposition(status)).toBe("quarantine");
    }
  });

  it("names an OPENED pack as unreachable rather than dropping it", () => {
    // The most important line in the module. The packs a recall cannot reach are
    // the only ones anybody urgently needs to know about — they are the list a
    // clinic acts on outside the app. A report showing only what it froze would
    // look like a finished job.
    expect(recallDisposition("opened")).toBe("unreachable");
  });

  it("does not double-count something already frozen", () => {
    expect(recallDisposition("quarantined")).toBe("already_quarantined");
  });

  it("summarises a load into the three numbers a person has to act on", () => {
    const load = ["sterile", "sterile", "opened", "quarantined", "opened"].map(recallDisposition);
    expect(summariseRecall(load)).toEqual({ quarantined: 2, alreadyQuarantined: 1, unreachable: 2 });
  });
});
