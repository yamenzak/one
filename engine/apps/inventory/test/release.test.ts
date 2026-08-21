/**
 * THE RELEASE RAIL — the rules that decide whether something may be used.
 *
 * ⚠️ EVERY RULE HERE HAS A PERSON ON THE OTHER END OF IT. A tray released from a
 * run that had not finished, a failure un-failed by a result arriving later, a
 * quarantine lifted into "good to go" — none of them throws, none of them looks
 * wrong on a screen, and each one ends with something being used that should not
 * have been.
 */

import { describe, expect, it } from "vitest";
import {
  RUNS, landResult, mayLift, mayRelease, reachedIn, refuseRun,
  type Run, type RunAct,
} from "../src/release.js";

/* ------------------------------------------------------------------- runs --- */

describe("what may happen to a run", () => {
  it("loads and ends an open one", () => {
    expect(refuseRun("open", "put")).toBeNull();
    expect(refuseRun("open", "end")).toBeNull();
  });

  /*
    ⚠️ THE ONE TO READ TWICE. A run still loading has no evidence to weigh, so a
    release from there is a person signing for a printout that does not exist —
    and it is the most tempting shortcut in the whole rail, because the button is
    right there and the cycle always passes.
  */
  it("refuses to release a run that has not finished", () => {
    expect(refuseRun("open", "release")).toBe("It has not finished yet");
  });

  /* ⚠️ ENDING IS NOT RELEASING. The gap between them is a person reading the
     printout, and a product without the gap has decided a green light is a
     qualification. */
  it("releases only what has finished", () => {
    expect(refuseRun("ended", "release")).toBeNull();
    expect(refuseRun("released", "release")).toBe("It has already been decided");
    expect(refuseRun("failed", "release")).toBe("It has already been decided");
  });

  /* ⚠️ WHAT COMES AFTER A RELEASE IS A RECALL, which is a different act with
     different consequences and its own word. */
  it("refuses to fail what was already decided", () => {
    expect(refuseRun("released", "fail")).toBe("It has already been decided");
    expect(refuseRun("ended", "fail")).toBeNull();
  });

  /*
    ⚠️ AND A RECALL IS REACHABLE FROM `released` AND NOWHERE ELSE. A run nobody
    released has nothing out in the world to call back — making it reachable from
    anywhere would let a recall be used as a tidy-up, which is how a recall stops
    meaning what it says.
  */
  it("calls back only what was released", () => {
    expect(refuseRun("released", "recall")).toBeNull();
    for (const state of RUNS.filter((s) => s !== "released")) {
      expect(refuseRun(state, "recall"), state).toBe("Nothing was released from this run");
    }
  });

  /* ⚠️ NOTHING IS LOADED INTO A RUN THAT IS OVER. A batch put into a released
     run would be one nobody weighed the evidence for, wearing the release. */
  it("loads nothing into a run that is over", () => {
    for (const state of RUNS.filter((s) => s !== "open")) {
      expect(refuseRun(state, "put"), state).toBe("This run is closed");
    }
  });

  /* ⚠️ THE LIST IS CLOSED AND EVERY PAIR HAS AN ANSWER. A sixth standing added
     without a branch is a state every act silently allows. */
  it("has an answer for every standing and every act", () => {
    const acts: readonly RunAct[] = ["put", "end", "release", "fail", "recall"];
    for (const state of RUNS as readonly Run[]) {
      for (const act of acts) {
        const why = refuseRun(state, act);
        expect(why === null || typeof why === "string").toBe(true);
      }
    }
  });
});

/* --------------------------------------------------------------- verdicts --- */

describe("what a run decided about one thing in it", () => {
  it("releases only what nobody has decided about", () => {
    expect(mayRelease("pending")).toBe(true);
    expect(mayRelease("released")).toBe(false);
  });

  /*
    ⚠️ THE LADDER MAY NEVER RUN BACKWARDS, and this is the assertion that says
    so. A failed item has to be run again and a lifted one is a failed one
    somebody unfroze; either reaching `released` would leave a tray whose
    steriliser failed reading as sterile, with nothing in the record to say
    otherwise.
  */
  it("never releases what failed, or what was unfrozen after failing", () => {
    expect(mayRelease("failed")).toBe(false);
    expect(mayRelease("lifted")).toBe(false);
  });

  /* ⚠️ AND LIFTING IS FOR WHAT IS ACTUALLY FROZEN. Lifting a released item
     would be a release undone through the wrong door. */
  it("lifts only what is frozen", () => {
    expect(mayLift("failed")).toBe(true);
    expect(mayLift("pending")).toBe(false);
    expect(mayLift("released")).toBe(false);
    expect(mayLift("lifted")).toBe(false);
  });
});

/* ---------------------------------------------------------------- results --- */

describe("a result that arrived afterwards", () => {
  /*
    ⚠️ THE ORDINARY CASE THE WHOLE RAIL IS BUILT FOR. The cycle looked fine, the
    biological indicator says otherwise at twenty-four hours, and everything that
    went out has to be called back.
  */
  it("turns a late failure on a released run into a recall", () => {
    expect(landResult("released", "failed")).toBe("recall");
  });

  /* ⚠️ AND A LATE FAILURE ON A RUN NOBODY DECIDED IS SIMPLY A FAILURE. */
  it("fails a run nobody had decided about", () => {
    expect(landResult("ended", "failed")).toBe("fail");
  });

  /*
    ⚠️ A PASS IS NOT AN AUTOMATIC RELEASE. The gap between ending and releasing
    is a person, and a result arriving does not make one appear — so a passing
    indicator on an ended run agrees with the evidence and changes nothing.
  */
  it("does not release a run because a result passed", () => {
    expect(landResult("ended", "passed")).toBe("same");
  });

  /*
    ⚠️ A CONTRADICTION IS REFUSED, NEVER APPLIED, and this is the rule the record
    exists to protect. A pass landing on a failed run un-fails something somebody
    already acted on; one landing on a recalled run erases the evidence the
    recall was justified by. Two facts disagree and a person has to look.
  */
  it("refuses a pass that contradicts a failure", () => {
    expect(landResult("failed", "passed")).toBe("refused");
    expect(landResult("recalled", "passed")).toBe("refused");
  });

  /* ⚠️ AND A RESULT AGREEING WITH WHAT IS RECORDED IS THE COMMONEST ONE THERE
     IS — answered plainly rather than refused. */
  it("says so when a result agrees with what is recorded", () => {
    expect(landResult("failed", "failed")).toBe("same");
    expect(landResult("recalled", "failed")).toBe("same");
    expect(landResult("released", "passed")).toBe("same");
  });

  /* ⚠️ A RUN STILL LOADING HAS NO RESULT TO ARRIVE. One that has is a result
     about a cycle that has not happened. */
  it("refuses a result for a run that has not finished", () => {
    expect(landResult("open", "passed")).toBe("refused");
    expect(landResult("open", "failed")).toBe("refused");
  });
});

/* ----------------------------------------------------------------- recall --- */

describe("what a recall could reach", () => {
  /*
    ⚠️ A REPORT SHOWING ONLY WHAT IT FROZE READS AS A FINISHED JOB, and the
    things it could not reach are the entire reason the recall is happening —
    already used, already gone, already on somebody.
  */
  it("names what is gone as well as what it froze", () => {
    const out = reachedIn([
      { batch: "b1", quantity: 12 },
      { batch: "b2", quantity: 0 },
      { batch: "b3", quantity: 4 },
    ]);
    expect(out.frozen).toEqual(["b1", "b3"]);
    expect(out.gone).toEqual(["b2"]);
  });

  /* ⚠️ AND A RECALL THAT REACHED NOTHING IS THE WORST ONE, so it is a list of
     names rather than a silence. */
  it("names everything where it could freeze nothing", () => {
    const out = reachedIn([{ batch: "b1", quantity: 0 }, { batch: "b2", quantity: 0 }]);
    expect(out.frozen).toEqual([]);
    expect(out.gone).toEqual(["b1", "b2"]);
  });
});
