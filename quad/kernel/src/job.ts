/**
 * WORK THAT HAPPENS WITH NOBODY WATCHING.
 *
 * ⚠️ A JOB THAT FAILS QUIETLY IS THE WHOLE PROBLEM. Nothing is waiting for its
 * answer, so a throw at 03:00 has no user, no request, no 500 and no red test —
 * the dunning ladder simply stops climbing, or the sweep stops sweeping, and it
 * is discovered weeks later by somebody wondering why nobody was ever charged.
 * Every job therefore declares what happens when it fails, and "nothing" is not
 * one of the options.
 *
 * ⚠️ AND A JOB IS RUN AGAIN, ALWAYS. A retry, a redeploy mid-run, a schedule
 * that fires twice at a clock change — the question is never whether it happens
 * twice, only whether that is safe. So a job says it is safe to repeat, or says
 * what it does about it.
 *
 * ⚠️ ANYTHING THAT DELETES CARRIES A FLOOR. A sweep whose retention is misread
 * as zero shreds a customer's records on its first run, correctly, at speed, and
 * reports success. The floor is the difference between a bad configuration and a
 * catastrophe.
 *
 * Layer 2. Imports primitives.
 */

/* ------------------------------------------------------------------ shape --- */

/**
 * ⚠️ SCOPE DECIDES WHERE THE LIST OF WORK COMES FROM, AND THERE IS ONLY ONE
 * ANSWER (D5): the directory. A per-tenant job that discovered its own work by
 * asking every shard gets slower with every shard until it times out — and it
 * times out at the size where it matters most.
 */
export type JobScope = "deployment" | "per-tenant";

/** What to do when a run throws. `nothing` is deliberately absent. */
export type OnFail =
  | { readonly then: "retry"; readonly times: number }
  | { readonly then: "park" }
  | { readonly then: "tell"; readonly notification: string };

export interface JobDef {
  readonly id: string;
  readonly label: string;
  /** What it is for, in a sentence. It is the console row. */
  readonly why: string;
  /** Five-field cron, UTC. The one timezone nothing argues about. */
  readonly schedule: string;
  readonly scope: JobScope;
  readonly onFail: OnFail;
  /**
   * ⚠️ SAFE TO RUN TWICE, OR A SENTENCE SAYING WHY IT WILL NOT BE. See the
   * header: it is going to happen either way.
   */
  readonly rerunnable: true | { readonly why: string };
  /**
   * ⚠️ WHETHER IT DELETES, AND THE FLOOR IF SO. Days below which it refuses to
   * act however it is configured.
   */
  readonly destroys?: { readonly floorDays: number };
  /** Seconds. A run that would exceed it stops and continues next time. */
  readonly budgetSeconds?: number;
  /** ⚠️ Whether a second run may start while one is going. Default is no. */
  readonly overlap?: boolean;
}

export type JobBook = Readonly<Record<string, JobDef>>;

export const job = (def: JobDef): JobDef => def;

/* ---------------------------------------------------------------- schedule --- */

const FIELD = /^(\*|[0-9,\-/*]+)$/;

/**
 * ⚠️ CHECKED AT COMPOSITION BECAUSE A BAD CRON DOES NOT THROW — IT NEVER FIRES.
 * A schedule the platform cannot parse is a job that silently never runs, which
 * looks identical to a job that runs and finds nothing to do.
 */
export const scheduleOk = (cron: string): boolean => {
  const parts = cron.trim().split(/\s+/);
  return parts.length === 5 && parts.every((p) => FIELD.test(p));
};

/* ------------------------------------------------------------------ rules --- */

export type JobRefusal =
  | "unparseable_schedule" | "no_reason" | "destroys_without_a_floor"
  | "unknown_failure_notification" | "retries_forever";

export interface JobProblem { readonly job: string; readonly why: JobRefusal; readonly detail: string }

export function refuseJob(def: JobDef, notifications: readonly string[]): readonly JobProblem[] {
  const out: JobProblem[] = [];
  const at = (why: JobRefusal, detail: string) => out.push({ job: def.id, why, detail });

  if (!scheduleOk(def.schedule)) at("unparseable_schedule", `"${def.schedule}" would never fire`);
  if (!def.why.trim()) at("no_reason", "runs on a schedule and does not say what for");
  if (def.destroys && def.destroys.floorDays <= 0) {
    at("destroys_without_a_floor", "deletes with no floor, so a misconfiguration shreds on the first run");
  }
  if (def.onFail.then === "tell" && !notifications.includes(def.onFail.notification)) {
    at("unknown_failure_notification",
      `tells "${def.onFail.notification}" on failure, which is not a notification`);
  }
  if (def.onFail.then === "retry" && def.onFail.times > 10) {
    at("retries_forever", `${def.onFail.times} retries of something nobody is waiting for`);
  }
  return out;
}

export const refuseJobs = (book: JobBook, notifications: readonly string[]): readonly JobProblem[] =>
  Object.values(book).flatMap((j) => refuseJob(j, notifications));

/**
 * ⚠️ WHAT THE CONSOLE SHOWS, AND WHY IT SHOWS THE LAST RUN RATHER THAN THE NEXT.
 * A job with a next run is a job that is scheduled; a job whose last run is
 * three days old is a job that has stopped, and only the second is worth a
 * screen.
 */
export interface Run {
  readonly job: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly ok: boolean;
  readonly detail?: string;
}

export const stalled = (book: JobBook, runs: readonly Run[], now: number, missedMs: number): readonly string[] =>
  Object.keys(book).filter((id) => {
    const last = runs.filter((r) => r.job === id).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
    return !last || now - Date.parse(last.startedAt) > missedMs;
  });
