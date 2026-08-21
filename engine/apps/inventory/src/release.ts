/**
 * A RUN, ITS EVIDENCE, AND THE PERSON WHO SAID YES — pure, with no database.
 *
 * ⚠️ ENDING AND RELEASING ARE DIFFERENT ACTS BY DIFFERENT PARTIES, and collapsing
 * them makes the machine the releaser. A steriliser finishing its cycle is a fact
 * about a machine; "this tray may be used on a person" is a judgement somebody
 * puts their name to after reading the printout. The gap between the two states
 * is where that reading happens, and a product without the gap has quietly
 * decided that a green light is a qualification.
 *
 * ⚠️ AND THE SAME SHAPE IS EVERY REGULATED RUN THERE IS: sterilisation,
 * calibration, heat treatment, curing, a QA hold, a cold-chain excursion review,
 * a cleaning validation, a food safety check. One product built it for clinics
 * and could only sell it to clinics.
 */

/* ------------------------------------------------------------------- runs --- */

/**
 * WHERE A RUN STANDS.
 *
 * ⚠️ `ended` IS NOT `released` — see the header. It is the whole design.
 *
 * ⚠️ AND `recalled` IS REACHED FROM `released` AND NOWHERE ELSE. A run nobody
 * released has nothing out in the world to call back; making it reachable from
 * anywhere would let a recall be used as a tidy-up, which is how a recall stops
 * meaning what it says.
 */
export const RUNS = ["open", "ended", "released", "failed", "recalled"] as const;
export type Run = typeof RUNS[number];

/** What can be done to a run. */
export const RUN_ACTS = ["put", "end", "release", "fail", "recall"] as const;
export type RunAct = typeof RUN_ACTS[number];

/**
 * WHY THIS CANNOT HAPPEN TO THIS RUN, or nothing.
 *
 * ⚠️ RELEASING FROM `open` IS THE ONE TO READ TWICE. A run still loading has no
 * evidence to weigh, so a release from there is a person signing for a printout
 * that does not exist yet — and it is the single most tempting shortcut in the
 * whole rail, because the button is right there and the cycle always passes.
 */
export function refuseRun(state: Run, act: RunAct): string | null {
  switch (act) {
    case "put":
      return state === "open" ? null : "This run is closed";
    case "end":
      return state === "open" ? null : "It has already finished";
    case "release":
      return state === "ended" ? null
        : state === "open" ? "It has not finished yet"
          : "It has already been decided";
    case "fail":
      /* ⚠️ A RUN MAY BE FAILED THE MOMENT IT FINISHES OR AFTER SOMEBODY LOOKS,
         and never once it is decided. What comes after a release is a RECALL,
         which is a different act with different consequences and its own word. */
      return state === "ended" ? null
        : state === "open" ? "It has not finished yet"
          : "It has already been decided";
    case "recall":
      return state === "released" ? null : "Nothing was released from this run";
  }
}

/* --------------------------------------------------------------- verdicts --- */

/**
 * WHAT A RUN DECIDED ABOUT ONE OF THE THINGS IN IT.
 *
 * ⚠️ `lifted` IS THE WHOLE POINT OF THIS LIST. A quarantine can always be
 * lifted — holding stock frozen for ever because a form cannot be completed is
 * how a rule gets worked around — and it lifts to "needs work", NEVER to "good
 * to go". The thing is unfrozen and it is still not released, which is the only
 * honest description of a tray whose steriliser failed.
 */
export const VERDICTS = ["pending", "released", "failed", "lifted"] as const;
export type Verdict = typeof VERDICTS[number];

/**
 * ⚠️ THE ONE STATE A VERDICT MAY NEVER BE MOVED INTO, AND FROM WHERE. Only a
 * pending item can be released: a failed one has to be re-run and a lifted one
 * is a failed one somebody unfroze. Written as a function rather than as a
 * condition inside a handler so the rule can be READ, tested, and asserted about
 * without a database.
 */
export const mayRelease = (verdict: Verdict): boolean => verdict === "pending";

/**
 * ⚠️ AND LIFTING IS ALLOWED FROM ANYTHING THAT IS ACTUALLY HELD. A released item
 * is not quarantined and lifting one would be a release being undone by the
 * wrong door.
 */
export const mayLift = (verdict: Verdict): boolean => verdict === "failed";

/* ---------------------------------------------------------------- results --- */

/**
 * A RESULT THAT ARRIVES AFTER THE FACT — a biological indicator read at 24
 * hours, a laboratory report, a calibration certificate.
 *
 * ⚠️ A LATE RESULT THAT CONTRADICTS AN EARLIER ONE IS REFUSED, NEVER APPLIED,
 * and this is the rule the whole record exists to protect. Overwriting a
 * release with a later "pass" erases the evidence a recall was justified by;
 * overwriting a failure with a later "pass" un-fails a run somebody already
 * acted on. What a contradiction means is that two facts disagree and a person
 * has to look — so the app refuses and says which two.
 *
 * ⚠️ A LATE FAILURE ON A RELEASED RUN IS NOT A CONTRADICTION, IT IS A RECALL.
 * That is the ordinary case this rail is built for: the cycle looked fine, the
 * indicator says otherwise, and everything that went out has to be called back.
 */
export type Late = "passed" | "failed";

export type Landing = "recall" | "fail" | "same" | "refused";

export function landResult(state: Run, said: Late): Landing {
  if (state === "open") return "refused";
  if (state === "recalled") return said === "failed" ? "same" : "refused";
  if (state === "released") return said === "failed" ? "recall" : "same";
  if (state === "failed") return said === "failed" ? "same" : "refused";
  /* ⚠️ `ended` — nobody has decided yet, so a late result decides it. A pass is
     NOT an automatic release: the gap between ending and releasing is a person,
     and a result arriving does not make one appear. */
  return said === "failed" ? "fail" : "same";
}

/* ----------------------------------------------------------------- recall --- */

/**
 * WHAT A RECALL COULD AND COULD NOT REACH.
 *
 * ⚠️ A REPORT SHOWING ONLY WHAT IT FROZE READS AS A FINISHED JOB, and it is the
 * opposite: the things it could not reach are the ones already used, already
 * gone, already on somebody. Those are the entire reason a recall is happening,
 * and a screen that lists four frozen boxes and says nothing about the six that
 * were used has told somebody the problem is solved.
 */
export interface Reached {
  readonly frozen: readonly string[];
  /** ⚠️ What is gone — consumed, issued, or never on a shelf to freeze. */
  readonly gone: readonly string[];
}

export const reachedIn = (
  items: readonly { readonly batch: string; readonly quantity: number }[],
): Reached => ({
  frozen: items.filter((i) => i.quantity > 0).map((i) => i.batch),
  gone: items.filter((i) => i.quantity <= 0).map((i) => i.batch),
});
