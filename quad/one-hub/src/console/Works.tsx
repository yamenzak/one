/**
 * WORKS — the jobs nobody watches, and whether they ran.
 *
 * ⚠️ THE LAST RUN IS THE ONLY QUESTION. A job that is scheduled tells you
 * nothing; a job whose last run was three days ago has stopped, and the whole
 * failure mode is that stopping produces no error anywhere. `Jobs` already
 * draws exactly that — this is the console pointing it at the deployment.
 */

import { Jobs, Screen } from "@quad/design";
import type { JobBook } from "@quad/kernel";
import { useLoad } from "../centre/data.js";

interface WorksAnswer {
  readonly book: JobBook;
  readonly runs: readonly {
    readonly jobId: string; readonly startedAt: string; readonly endedAt: string | null;
    readonly ok: boolean | null; readonly detail: string | null; readonly touched: number;
  }[];
}

const A_DAY = 86_400_000;

export function Works() {
  const of = useLoad<WorksAnswer>("op.jobs");

  return (
    /* ⚠️ `list` — a collection somebody scans. Nothing is added here: a job
       exists because a product declared one, so the shape carries no action. */
    <Screen
      shape="list"
      of={of.of}
      again={of.again}
      isNothing={(d) => Object.keys(d.book).length === 0}
      nothing={{ says: "No product here declares a job" }}
      then={(data) => (
        <Jobs book={data.book} runs={data.runs} missedMs={A_DAY} now={Date.now()} />
      )}
    />
  );
}
