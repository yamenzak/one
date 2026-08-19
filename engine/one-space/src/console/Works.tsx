/**
 * WORKS — the jobs nobody watches, whether they ran, and what they did.
 *
 * ⚠️ THE LAST RUN IS THE FIRST QUESTION. A job that is scheduled tells you
 * nothing; a job whose last run was three days ago has stopped, and the whole
 * failure mode is that stopping produces no error anywhere.
 *
 * ⚠️ AND THE SECOND QUESTION IS WHAT IT DID, which this screen used to throw
 * away. The payload has always carried the message a failure left, how many
 * things a pass touched and whether somebody started it by hand; the screen
 * rendered a chip and one sentence, so an operator whose nightly pass failed
 * could read THAT it failed and never what it said.
 *
 * ⚠️ THE LIST IS THE PLATFORM'S AND EVERY PRODUCT'S. It used to be built from
 * each app's `jobs` alone — so it showed the one app job nothing executed and
 * omitted the seven this deployment does every night. The book is the same one
 * the runner runs, which is what stops the screen describing a deployment that
 * does not exist.
 */

import { Jobs, Screen, glyphOf, notice } from "@engine/design";
import type { JobRun, JobShown } from "@engine/design";
import { api } from "../api.js";
import { useLoad } from "../centre/data.js";

interface WorksAnswer {
  readonly book: Readonly<Record<string, JobShown>>;
  readonly runs: readonly JobRun[];
}

const A_DAY = 86_400_000;

export function Works() {
  const of = useLoad<WorksAnswer>("op.jobs");

  /*
    ⚠️ A REFUSAL IS SAID, AND SO IS AN EMPTY SUCCESS. "It ran and touched
    nothing" and "it was already running" are different answers, and a button
    that reported neither would be one people press twice.
  */
  const run = async (id: string) => {
    const out = await api.post("op.job.run", { job: id });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    const said = out.value as
      { ran: boolean; ok?: boolean; touched?: number; detail?: string | null };
    if (!said.ran) { notice.fail("It is already running."); return; }
    if (said.ok === false) { notice.fail(said.detail ?? "It failed."); return; }
    notice.ok(said.touched ? `Done — ${said.touched} handled.` : "Done. Nothing needed doing.");
    of.again();
  };

  const schedule = async (id: string, cron: string) => {
    const out = await api.post("op.job.schedule", { job: id, schedule: cron });
    if (!out.ok) { notice.fail(out.problem.title); return; }
    notice.ok(cron.trim() ? "Moved." : "Back to what the code says.");
    of.again();
  };

  return (
    /* ⚠️ `list` — a collection somebody scans. Nothing is added here: a job
       exists because something declared one, so the shape carries no primary. */
    <Screen
      shape="list"
      under="What runs unattended, when each of them last did, and what it found"
      of={of.of}
      again={of.again}
      isNothing={(d) => Object.keys(d.book).length === 0}
      nothing={{ icon: glyphOf("clock"), says: "Nothing here declares a job" }}
      then={(data) => (
        <Jobs
          book={data.book}
          runs={data.runs}
          missedMs={A_DAY}
          now={Date.now()}
          onRun={run}
          onSchedule={schedule}
        />
      )}
    />
  );
}
