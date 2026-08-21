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

/**
 * WHAT A RUN IS HANDED.
 *
 * ⚠️ THE SHARD IS THE SCOPE MADE CONCRETE. A `deployment` job is given the
 * directory and no tenant; a `per-tenant` job is called once per workspace with
 * THAT workspace's database and id. The runner decides which — a job that
 * resolved its own would be a job discovering its work by asking every shard,
 * which is the walk D5 exists to forbid.
 *
 * ⚠️ AND `deadline` IS WHY `budgetSeconds` IS NOT DECORATION. A job that fans
 * out over workspaces has to be able to stop in the middle and say so, or the
 * budget is a number in a manifest that nothing can act on.
 */
export interface JobCtx {
  readonly db: unknown;
  readonly tenantId?: string;
  /** Epoch ms after which the run should stop and report what it did. */
  readonly deadline: number;
  readonly now: string;
  /**
   * TELL SOMEBODY WHAT THE NIGHT FOUND.
   *
   * ⚠️ A FACT NOBODY IS TOLD ABOUT IS MOST OF THE REASON NOBODY RECORDS ONE. A
   * sweep that works out which stock expires on Thursday and writes the number
   * into a run record has produced a report for an operator about a customer's
   * shelf — the person who has to move the stock is not reading the nightly
   * console, and the whole point of knowing an expiry early is that somebody
   * acts before it.
   *
   * ⚠️ IT RAISES AN EVENT; IT DOES NOT ADDRESS A PERSON. Who is told is the
   * notification's `to`, resolved against permissions like every other note —
   * a job that picked its own audience would be a second answer to "who should
   * know", diverging from the one the manifest checked.
   *
   * ⚠️ AND THE EVENT MUST BE ONE THIS JOB DECLARES (`emits`). The runner
   * refuses anything else rather than filing it, because a job raising an
   * undeclared event is a notification the manifest could not have checked —
   * unaddressed, unlinked, and silently reaching nobody.
   *
   * ⚠️ ABSENT MEANS THIS DEPLOYMENT CANNOT TELL ANYBODY — no inbox wired, a
   * test harness calling the body directly. That is a state rather than a
   * fault, and it is why a body reads `ctx.tell?.(…)`.
   */
  readonly tell?: (event: string, values: Record<string, unknown>) => Promise<void>;
  /**
   * WHAT THIS WORKSPACE SWITCHED ON — the same resolution a handler reads.
   *
   * ⚠️ A NIGHT'S WORK IS GOVERNED BY THE SAME NUMBERS THE DAY'S IS. "How many
   * days counts as soon" is a decision about a business — three for a kitchen,
   * ninety for a pharmacy — and a sweep that could not read it would either
   * hard-code one or query the settings table by hand, which is a second
   * implementation of a resolution with a declared fallback under it.
   *
   * ⚠️ TENANT LEVEL ONLY, BECAUSE A JOB HAS NO PERSON. A personal preference
   * asked for with no account resolves to its fallback rather than to somebody
   * else's answer, which is what the runner passes and why this cannot quietly
   * read the wrong row.
   *
   * ⚠️ ABSENT WHERE THE RUNNER HAS NO APP TO RESOLVE AGAINST — a platform job,
   * a test harness. A body reads `ctx.setting?.(…)` and falls back in the open.
   */
  readonly setting?: (id: string) => Promise<unknown>;
}

/** What a run reports. `touched` is the count the console shows. */
export interface JobResult {
  readonly touched: number;
  readonly detail?: string;
}

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
   * THE WORK ITSELF.
   *
   * ⚠️ THE DECLARATION CARRIES ITS BODY, LIKE AN OPERATION CARRIES ITS HANDLER,
   * AND FOR THE REASON THIS WHOLE FILE EXISTS. Without it a job is a row on a
   * console and a promise to nobody: `tidy` was declared, validated for its
   * cron, its floor and its failure route, listed on the operator's screen —
   * and no code anywhere read the book to run it, so the screen said "Has never
   * run" and always would have. A declaration whose body is somewhere else is a
   * declaration something has to remember to wire up.
   */
  readonly work: (ctx: JobCtx) => Promise<JobResult>;
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
  /**
   * WHAT IT TELLS PEOPLE ABOUT, DECLARED — never discovered from the body.
   *
   * ⚠️ THE SAME RULE AN OPERATION FOLLOWS (D12), AND FOR THE SAME REASON. A
   * notification names the event that raises it, and the manifest refuses one
   * that waits for an event nothing raises. So a job's events have to be
   * readable without running it, or every notification a night's work exists to
   * send would be refused at composition as unraisable.
   *
   * ⚠️ AND THE RUNNER ENFORCES IT BOTH WAYS: an event named here is what
   * `ctx.tell` will accept, and nothing else.
   */
  readonly emits?: readonly string[];
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

/* ------------------------------------------------------------------ due --- */

/**
 * ⚠️ A SCHEDULE NOTHING CAN EVALUATE IS A LABEL, AND THAT IS ALL IT WAS. Every
 * job declared a cron, `scheduleOk` checked it would parse, the console printed
 * it as a cadence — and the deployment ran one hardcoded pass at 03:00 and
 * called everything. "Daily" on the screen was a string being rendered, not a
 * promise anything kept.
 *
 * ⚠️ SO THE FIELDS ARE EXPANDED TO THE MINUTES THEY MEAN. Five sets, and
 * membership is the whole question — which makes a step, a range and a list the
 * same kind of answer instead of three parsers.
 */
const expand = (field: string, min: number, max: number): ReadonlySet<number> => {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const [range, step] = part.split("/");
    const by = step ? Number(step) : 1;
    if (!Number.isFinite(by) || by < 1) continue;
    let from = min;
    let to = max;
    if (range && range !== "*") {
      const [a, b] = range.split("-");
      from = Number(a);
      to = b === undefined ? Number(a) : Number(b);
      /* ⚠️ A step with a single start means "from there on" — `5/10` is 5, 15,
         25… Without this, `5/10` would be the single minute 5, silently. */
      if (b === undefined && step) to = max;
    }
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    for (let n = Math.max(from, min); n <= Math.min(to, max); n += by) out.add(n);
  }
  return out;
};

/**
 * ⚠️ DAY-OF-MONTH AND DAY-OF-WEEK ARE OR-ED WHEN BOTH ARE RESTRICTED, WHICH IS
 * CRON'S OLDEST SURPRISE AND IS NOT A BUG TO FIX. `0 0 1 * 1` is the first of
 * the month AND every Monday, not the first of the month when it is a Monday.
 * Getting this wrong makes a job fire far less often than its author intended,
 * which is the failure this whole file is about.
 */
interface Parsed {
  readonly minutes: ReadonlySet<number>;
  readonly hours: ReadonlySet<number>;
  readonly months: ReadonlySet<number>;
  readonly dom: ReadonlySet<number>;
  readonly dow: ReadonlySet<number>;
  readonly anyDom: boolean;
  readonly anyDow: boolean;
}

const parse = (cron: string): Parsed => {
  const [mi, ho, dom, mo, dow] = cron.trim().split(/\s+/);
  return {
    minutes: expand(mi!, 0, 59),
    hours: expand(ho!, 0, 23),
    months: expand(mo!, 1, 12),
    dom: expand(dom!, 1, 31),
    /* ⚠️ 0 AND 7 ARE BOTH SUNDAY. A schedule written `0 0 * * 7` is somebody's
       Sunday, and read strictly it is a day that does not exist. */
    dow: new Set([...expand(dow!, 0, 7)].map((d) => (d === 7 ? 0 : d))),
    anyDom: dom === "*",
    anyDow: dow === "*",
  };
};

/**
 * ⚠️ CRON OR-s THE TWO DAY FIELDS WHEN BOTH ARE RESTRICTED, which is its oldest
 * surprise and is not a bug to fix. `0 0 1 * 1` is the first of the month AND
 * every Monday, not the first when it happens to be a Monday. Read as an AND, a
 * job fires far less often than its author intended — which is the failure this
 * whole file is about.
 */
const onDay = (p: Parsed, at: Date): boolean => {
  if (!p.months.has(at.getUTCMonth() + 1)) return false;
  if (p.anyDom && p.anyDow) return true;
  const dom = p.dom.has(at.getUTCDate());
  const dow = p.dow.has(at.getUTCDay());
  if (p.anyDom) return dow;
  if (p.anyDow) return dom;
  return dom || dow;
};

/**
 * THE FIRST MINUTE THIS CRON FIRES STRICTLY AFTER `after`, OR NULL.
 *
 * ⚠️ DAYS FIRST, THEN THE MINUTES INSIDE A DAY THAT QUALIFIES. Walking every
 * minute is the obvious version and it is two million iterations before it can
 * answer "never": measured at 3.9 SECONDS for `0 0 30 2 *`, on a function
 * `refuseJob` calls for every job at composition. Skipping a day whose date
 * cannot match makes the same answer about fifteen hundred cheap comparisons.
 *
 * ⚠️ AND THE SEARCH IS BOUNDED, WHICH IS WHAT MAKES `null` POSSIBLE. The
 * thirtieth of February parses as five valid fields and never happens; a search
 * with no ceiling is an infinite loop inside a scheduler rather than a refusal
 * at composition. Four years covers every real schedule, leap day included.
 */
const DAYS_AHEAD = 4 * 366;

export const nextRun = (cron: string, after: Date): Date | null => {
  if (!scheduleOk(cron)) return null;
  const p = parse(cron);
  if (!p.minutes.size || !p.hours.size || !p.months.size) return null;

  /* ⚠️ FROM THE NEXT WHOLE MINUTE. Seconds are not a cron field, so a run that
     started at 03:00:30 must not make 03:00 due again. */
  const from = new Date(after.getTime());
  from.setUTCSeconds(0, 0);
  from.setUTCMinutes(from.getUTCMinutes() + 1);

  const day = new Date(Date.UTC(
    from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 0, 0, 0, 0));

  for (let d = 0; d <= DAYS_AHEAD; d++) {
    if (onDay(p, day)) {
      for (const h of [...p.hours].sort((a, b) => a - b)) {
        for (const m of [...p.minutes].sort((a, b) => a - b)) {
          const at = new Date(day.getTime());
          at.setUTCHours(h, m, 0, 0);
          if (at.getTime() >= from.getTime()) return at;
        }
      }
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return null;
};

/**
 * ⚠️ DUE MEANS "IT SHOULD HAVE FIRED BY NOW", NOT "IT IS FIRING THIS MINUTE".
 * A scheduler wakes on its own clock, and a job asked whether its cron matches
 * the current minute is a job that never runs unless the two clocks agree
 * exactly — so a missed tick, a cold start or a trigger every fifteen minutes
 * would each drop the run silently.
 *
 * ⚠️ AND A JOB THAT HAS NEVER RUN IS DUE. The alternative is a job waiting for a
 * previous run it will never have.
 */
export const dueNow = (cron: string, lastRun: Date | null, now: Date): boolean => {
  if (!scheduleOk(cron)) return false;
  if (!lastRun) return true;
  const next = nextRun(cron, lastRun);
  return next !== null && next.getTime() <= now.getTime();
};

/* ------------------------------------------------------------------ rules --- */

export type JobRefusal =
  | "unparseable_schedule" | "no_reason" | "destroys_without_a_floor"
  | "unknown_failure_notification" | "retries_forever" | "no_work" | "never_fires"
  | "tells_nobody";

export interface JobProblem { readonly job: string; readonly why: JobRefusal; readonly detail: string }

export function refuseJob(def: JobDef, notifications: readonly string[]): readonly JobProblem[] {
  const out: JobProblem[] = [];
  const at = (why: JobRefusal, detail: string) => out.push({ job: def.id, why, detail });

  if (!scheduleOk(def.schedule)) at("unparseable_schedule", `"${def.schedule}" would never fire`);
  /*
    ⚠️ AND A SCHEDULE THAT PARSES CAN STILL NEVER FIRE. "0 0 30 2 *" is five
    valid fields and the thirtieth of February — checked here rather than left
    to the runner, where it is a job that is simply never due and looks exactly
    like one that runs and finds nothing to do.
  */
  else if (nextRun(def.schedule, new Date(0)) === null) {
    at("never_fires", `"${def.schedule}" parses but names no minute that exists`);
  }
  if (!def.why.trim()) at("no_reason", "runs on a schedule and does not say what for");
  /*
    ⚠️ THE WHOLE POINT, AND IT WAS ONCE POSSIBLE TO OMIT. A job with no body is
    a console row and a promise to nobody — see `JobDef.work`.
  */
  if (typeof def.work !== "function") {
    at("no_work", "declares a schedule and has no body, so it can only ever be a row on a screen");
  }
  if (def.destroys && def.destroys.floorDays <= 0) {
    at("destroys_without_a_floor", "deletes with no floor, so a misconfiguration shreds on the first run");
  }
  if (def.onFail.then === "tell" && !notifications.includes(def.onFail.notification)) {
    at("unknown_failure_notification",
      `tells "${def.onFail.notification}" on failure, which is not a notification`);
  }
  /*
    ⚠️ A NOTE IS FILED IN A WORKSPACE, SO A DEPLOYMENT-WIDE JOB CANNOT SEND ONE.
    It has the directory and no tenant, and there is no inbox at that level —
    the audience of every notification is resolved through membership. Left
    unchecked this is a declaration that composes, passes `unraisable` on the
    strength of its own `emits`, and tells nobody for the life of the product.
  */
  if (def.scope === "deployment" && (def.emits?.length ?? 0) > 0) {
    at("tells_nobody",
      `raises ${def.emits!.join(", ")} across the whole deployment, and a note is filed in a workspace`);
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
  /* ⚠️ `jobId`, WHICH IS WHAT THE ROW HOLDS. This was `job` while the runtime
     wrote `jobId` and the operator's screen took `jobId` — two names for one
     fact, and the cost was that the screen worked staleness out for itself
     rather than mapping, which put the same comparison in two places with the
     copy on the screen deciding what an operator is told. */
  readonly jobId: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly ok: boolean;
  readonly detail?: string;
}

/**
 * ⚠️ IT TAKES WHAT IT READS, WHICH IS WHY IT IS NOT `Run[]`. A run in flight has
 * no outcome yet and the screen's row carries fields the record does not, so
 * demanding the whole shape forced the one caller to build a fake one — and a
 * caller that has to reshape its data to ask a question is a caller that works
 * the answer out for itself instead. Two fields is the whole question.
 */
/*
  ⚠️ KEYED BY JOB ID, NOT A `JobBook`, BECAUSE THAT IS ALL IT READS. A definition
  carries a function body, which cannot cross a wire — so the console receives a
  described shape rather than the declaration, and demanding the full type here
  would have forced its one caller to build a fake `JobDef` per row to ask a
  question about the keys.
*/
export const stalled = (
  book: Readonly<Record<string, unknown>>,
  runs: readonly Pick<Run, "jobId" | "startedAt">[],
  now: number,
  missedMs: number,
): readonly string[] =>
  Object.keys(book).filter((id) => {
    const last = runs.filter((r) => r.jobId === id).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
    return !last || now - Date.parse(last.startedAt) > missedMs;
  });
