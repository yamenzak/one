/**
 * WORKS — the jobs nobody watches, and whether they ran.
 *
 * ⚠️ THE LAST RUN IS THE ONLY QUESTION. A job that is scheduled tells you
 * nothing; a job whose last run was three days ago has stopped, and the whole
 * failure mode is that stopping produces no error anywhere. `Jobs` already
 * draws exactly that — this is the console pointing it at the deployment.
 */

import { Await, Jobs, Nothing, RowsWaiting } from "@quad/web";
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
    /* ⚠️ The crown already says "Works" and what they are — see `Hub.tsx`. */
    <Await
        of={of.of}
        waiting={<RowsWaiting rows={3} />}
        again={of.again}
        isNothing={(d) => Object.keys(d.book).length === 0}
        nothing={<Nothing says="No product here declares a job" />}
        then={(data) => (
          <Jobs book={data.book} runs={data.runs} missedMs={A_DAY} now={Date.now()} />
        )}
      />
  );
}
