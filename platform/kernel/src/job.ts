/**
 * SCHEDULED WORK — declared, like everything else.
 *
 * Layer 2. Imports primitives and bindings.
 *
 * ⚠️ A CRON ENTRY IN A DEPLOYMENT CONFIG IS A CAPABILITY WITH NO SURFACE. It has
 * no test, no audit, no record that it ran and no way to ask. The characteristic
 * failure is not that it breaks — it is that it stops, quietly, and the first
 * anybody knows is a workspace that was never suspended, a budget that never
 * expired, or a digest nobody received for five weeks.
 *
 * A declared job carries its schedule, the lane it runs on, what it emits and a
 * bound on one run, so all four are checkable, and every run is recorded so
 * "did it run" has an answer.
 */

import type { BindingSpec, ResolvedBindings } from "./bindings.js";
import type { Instant, RegionId, TenantId } from "./primitives.js";

/**
 * ⚠️ AN INTERVAL, NOT A CRON EXPRESSION.
 *
 * A cron expression encodes a wall-clock time, which for a platform serving
 * several regions is a question with no single answer — and the failure is
 * subtle: a daily sweep at "02:00" runs at three different moments for three
 * tenants and at none of them for a fourth on the day a clock changes. Every
 * sweep this platform has needed is "roughly this often", so that is what can
 * be said.
 */
export type Cadence = "hourly" | "daily" | "weekly";

export const CADENCE_MS: Readonly<Record<Cadence, number>> = {
  hourly: 3_600_000,
  daily: 86_400_000,
  weekly: 604_800_000,
};

/**
 * ⚠️ PER TENANT OR ONCE, DECLARED — because getting it wrong is invisible.
 *
 * A per-tenant sweep written as a platform one runs against whichever tenant the
 * context happened to carry and quietly ignores every other. A platform sweep
 * written as a per-tenant one runs N times and does the same work N times, which
 * for anything that sends is N times the mail.
 */
export type JobScope = "tenant" | "platform";

/**
 * What a job's handler receives. Note what is absent: an actor, an input, a
 * caller, and any way to raise a `Problem`.
 *
 * ⚠️ A JOB HAS NOBODY TO ANSWER. It cannot 403 and it cannot 404, because there
 * is no request and no one waiting — so it REPORTS, and the report is what a
 * person reads when they ask whether the ladder is still running.
 */
export interface JobCtx<B extends BindingSpec> {
  readonly bind: ResolvedBindings<B>;
  /** Absent for a platform-scoped job, which is the whole difference. */
  readonly tenantId: TenantId | null;
  readonly region: RegionId;
  /** ⚠️ Injected, so a sweep's arithmetic is testable without waiting a day. */
  now(): Instant;
  /** ⚠️ Bounded by the declaration. A handler may not decide to take more. */
  readonly batch: number;
}

/**
 * What one run did.
 *
 * ⚠️ `more` IS HOW A BOUND STAYS HONEST. A sweep that hit its ceiling and said
 * nothing is indistinguishable from one that finished — so a backlog builds at
 * exactly the rate the ceiling truncates it, and the graph of "work done per
 * run" looks perfectly healthy the whole time.
 */
export interface JobResult {
  readonly done: number;
  /** Left for the next run because the ceiling was reached. */
  readonly more: boolean;
  /**
   * Anything left undone because something WENT WRONG. Reported, never swallowed.
   *
   * ⚠️ THIS IS AN ERROR SIGNAL, NOT A COUNT OF WORK NOT NEEDED, and the runner
   * reads it as one: a run where nothing succeeded and something was skipped is
   * recorded as FAILED, because that is a broken job wearing a partial success's
   * clothes. Use `idle` for a tenant that simply had nothing to do.
   */
  readonly skipped?: number;
  /**
   * Tenants that were deliberately not swept — nothing configured, or a rule
   * says not now.
   *
   * ⚠️ REPORTED SEPARATELY BECAUSE MOST TENANTS ARE USUALLY IDLE, and counting
   * them as skipped makes an ordinary deployment a permanently failing job.
   * That is not hypothetical: the first real sweep on this platform reported one
   * skip per workspace that had not configured the feature, and every run went
   * red on a deployment where nothing was wrong at all.
   *
   * It still travels, because "the ladder ran and there was nothing to do" and
   * "the ladder did not run" are different answers to the only question anybody
   * asks about a sweep.
   */
  readonly idle?: number;
}

export interface JobSpec<B extends BindingSpec = BindingSpec> {
  readonly id: string;
  readonly summary: string;
  readonly every: Cadence;
  readonly scope: JobScope;
  /**
   * ⚠️ REQUIRED, AND THERE IS NO WAY TO SAY "ALL OF THEM".
   *
   * An unbounded sweep is one that works on every deployment until the largest
   * tenant crosses whatever the runtime's time limit is — and then it fails, is
   * retried, fails at the same size, and the work never happens again. A ceiling
   * with `more` is a sweep that catches up; no ceiling is a sweep that stops.
   */
  readonly batch: number;
  /** Events this raises. Checked against the notification registry, like an operation's. */
  readonly emits?: readonly string[];
  handler(ctx: JobCtx<B>): Promise<JobResult>;
}

export function job<B extends BindingSpec>(spec: JobSpec<B>): JobSpec<B> {
  return spec;
}

/**
 * Whether a job is due.
 *
 * ⚠️ NEVER RUN IS ALWAYS DUE. A first deployment, a new region and a job added
 * to an existing app all have no last-run — and treating that as "not yet"
 * means the sweep starts one interval late, which for a weekly job is a week
 * during which somebody assumes it is working.
 */
export function isDue(spec: JobSpec, lastRun: Instant | null, now: Instant): boolean {
  if (!lastRun) return true;
  return Date.parse(now) - Date.parse(lastRun) >= CADENCE_MS[spec.every];
}
