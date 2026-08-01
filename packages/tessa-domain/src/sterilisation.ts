/**
 * WHEN MAY A LOAD BE RELEASED — and what happens when the evidence changes
 * afterwards.
 *
 * This is the module the product is built around. Everything else in Tessa is
 * inventory; this is the part that answers the question a clinic actually gets
 * asked, which is never "how many trays do we have" and always "load 47 failed
 * on Thursday — where did it go".
 *
 * ── The lag is the whole design ─────────────────────────────────────────────
 *
 * A sterilisation load produces three kinds of evidence, and they do NOT arrive
 * together:
 *
 *   PHYSICAL    the machine's own printout — temperature, pressure, hold time.
 *               Available the moment the door opens.
 *   CHEMICAL    the indicator strip in the load. Read by eye, same moment.
 *   BIOLOGICAL  a spore vial that has to be INCUBATED. Comes back a day or two
 *               later, by which time the trays are on shelves and some of them
 *               have been opened over patients.
 *
 * A single `passed` boolean would collapse that into a lie. Keeping the three
 * separate is what lets the system say "released on Tuesday's evidence, failed
 * on Thursday's" — and that sentence is the recall.
 *
 * ── What this module does NOT do ────────────────────────────────────────────
 *
 * It does not release anything. `releaseCheck` reports whether the evidence
 * permits a release; a named, qualified person performs it (**Freigabe** —
 * TESSA.md §2.2 and Rule 2). The distinction is not pedantry: software that
 * *computes* a release decision argues to be a regulated medical device, while
 * software that *records a human's* decision is administrative. The whole
 * product sits on the right side of that line, and it sits there because of
 * functions like this one refusing to be the decider.
 *
 * Pure, total, no clock. `now` is never read here — a cycle's dates come from
 * the caller, so the boundaries can be tested.
 */

/** Null = not read yet. The three arrive at different times; see the header. */
export type Indicator = boolean | null;

export interface CycleEvidence {
  status: CycleStatus;
  physicalOk: Indicator;
  chemicalOk: Indicator;
  biologicalOk: Indicator;
}

/**
 * `running` the door is shut · `ended` the load is out and the fast indicators
 * are in · `released` a person signed for it · `failed` it will not be used.
 *
 * `ended` and `released` are separate states rather than one, because the gap
 * between them is where a qualified person looks at the evidence. Collapsing
 * them would make the machine the releaser.
 */
export type CycleStatus = "running" | "ended" | "released" | "failed";

export type ReleaseVerdict =
  | { ok: true; biologicalPending: boolean }
  | { ok: false; reason: ReleaseBlock };

export type ReleaseBlock =
  | "not_ended"
  | "already_released"
  | "cycle_failed"
  | "missing_physical"
  | "missing_chemical"
  | "indicator_failed"
  | "biological_pending";

/**
 * Does the evidence permit a release?
 *
 * ── Why a pending biological indicator does NOT block by default ────────────
 *
 * It is tempting to require all three, and it is wrong for routine loads: no
 * clinic holds every tray for 48 hours waiting on an incubator, so an app that
 * demands it is an app whose release step gets bypassed on paper. Releasing on
 * the physical and chemical evidence with the biological still out is normal,
 * documented practice — and the reason the recall path in this module exists.
 *
 * It is *not* universal. Implant loads and some house rules require the
 * biological result first, so `requireBiological` is a parameter with no
 * default: the caller must state which regime it is in, because silently
 * picking either one for them is a safety decision this function has no
 * standing to make.
 *
 * A FAILED biological blocks regardless, in both regimes. There is no policy
 * under which "the spores survived" is releasable.
 */
export function releaseCheck(cycle: CycleEvidence, opts: { requireBiological: boolean }): ReleaseVerdict {
  if (cycle.status === "released") return { ok: false, reason: "already_released" };
  if (cycle.status === "failed") return { ok: false, reason: "cycle_failed" };
  // A load still in the machine has no evidence to weigh, whatever is recorded.
  if (cycle.status !== "ended") return { ok: false, reason: "not_ended" };

  // Missing and failed are DIFFERENT refusals. "Nobody has read the strip yet"
  // is a task; "the strip says it failed" is a recall in waiting, and a UI that
  // showed the same message for both would train people to treat one as the
  // other.
  if (cycle.physicalOk === null) return { ok: false, reason: "missing_physical" };
  if (cycle.chemicalOk === null) return { ok: false, reason: "missing_chemical" };
  if (cycle.physicalOk === false || cycle.chemicalOk === false || cycle.biologicalOk === false) {
    return { ok: false, reason: "indicator_failed" };
  }
  if (opts.requireBiological && cycle.biologicalOk === null) return { ok: false, reason: "biological_pending" };

  return { ok: true, biologicalPending: cycle.biologicalOk === null };
}

/**
 * What a biological reading MEANS, given where the cycle already is.
 *
 *   `confirmed`      it passed; a released load is now fully evidenced
 *   `cleared`        it passed on a load nobody had released yet — release is
 *                    now unblocked, but still nobody's but a person's to do
 *   `recall`         it FAILED on a load already released. Trays are on shelves
 *                    and some have been opened. This is the scenario the product
 *                    exists for.
 *   `fail`           it failed before anyone released it — bad, but contained
 *   `contradiction`  a second reading disagreeing with the first
 *
 * ── Why a contradiction is refused rather than applied ──────────────────────
 *
 * The obvious behaviour is last-write-wins, and it is the wrong one. Overwriting
 * a recorded indicator quietly rewrites the evidence a release was justified by,
 * which is the one thing an audit trail may never do. A second, different
 * reading is a real event — a mis-keyed result, a mixed-up vial — and it needs a
 * person to say which is true and why, not a silent replacement. Re-recording
 * the SAME value is idempotent and allowed, because that is a retry, not a
 * change of story.
 */
export type BiologicalOutcome = "confirmed" | "cleared" | "recall" | "fail" | "contradiction";

export function biologicalOutcome(cycle: CycleEvidence, reading: boolean): BiologicalOutcome {
  if (cycle.biologicalOk !== null && cycle.biologicalOk !== reading) return "contradiction";
  if (reading) return cycle.status === "released" ? "confirmed" : "cleared";
  return cycle.status === "released" ? "recall" : "fail";
}

/**
 * What can still be DONE about one pack from a failed load.
 *
 *   `quarantine`          on a shelf. Freeze it — this is the reachable half
 *   `already_quarantined` nothing to do
 *   `unreachable`         it was opened. Whatever it was for has happened, and
 *                         no software action can undo it
 *
 * `unreachable` is named rather than filtered out, and that is the point of the
 * whole report. The packs a recall cannot reach are the only ones anybody
 * urgently needs to know about: they are the list a clinic has to act on
 * OUTSIDE the app — informing a clinician, checking on a patient, notifying an
 * authority. A report that quietly showed only what it had successfully frozen
 * would look like a completed job and would be the most dangerous screen in the
 * product.
 */
export type RecallDisposition = "quarantine" | "already_quarantined" | "unreachable";

export function recallDisposition(packStatus: string): RecallDisposition {
  if (packStatus === "quarantined") return "already_quarantined";
  // `opened` is terminal for a pack: it was used. Anything else is still on a
  // shelf, in a cycle, or awaiting release — all of them freezable.
  if (packStatus === "opened") return "unreachable";
  return "quarantine";
}

/** A recall's shape, once every pack in the load has been dispositioned. */
export interface RecallSummary {
  quarantined: number;
  alreadyQuarantined: number;
  /** Opened. Nothing in the app can reach these — see `recallDisposition`. */
  unreachable: number;
}

export function summariseRecall(dispositions: RecallDisposition[]): RecallSummary {
  return {
    quarantined: dispositions.filter((d) => d === "quarantine").length,
    alreadyQuarantined: dispositions.filter((d) => d === "already_quarantined").length,
    unreachable: dispositions.filter((d) => d === "unreachable").length,
  };
}
