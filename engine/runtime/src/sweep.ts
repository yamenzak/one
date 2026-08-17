/**
 * THE DAILY SWEEP — what happens to a workspace nobody is looking at.
 *
 * ⚠️ THE LADDER CLIMBS BY ITSELF; ERASURE DOES NOT. Standing is DERIVED from
 * `past_due_at` every time it is read, so a workspace slides from serving to
 * read-only to blocked with nothing running — which is the right design and is
 * also why the missing clock was invisible for so long. The rung that needs a
 * clock is the last one: at day 37 the records are destroyed, and a deletion
 * that only happens when somebody visits is a deletion that never happens for
 * exactly the workspaces nobody visits.
 *
 * ⚠️ SO THE ONE THING THIS DOES IS THE IRREVERSIBLE THING, and it is written to
 * be re-runnable rather than clever: erase what is due, and if the same sweep
 * runs twice the second one finds nothing to delete. A scheduler that must not
 * be run twice is a scheduler nobody dares re-run after a failure.
 *
 * ⚠️ AND IT DERIVES ITS WORK FROM THE DIRECTORY (D5). "Which workspaces are past
 * their date" answered by asking every shard is a walk that gets slower with
 * every shard and times out at the size where it starts to matter.
 */

import type { AppSpec, Instant, TenantId } from "@engine/kernel";
import { erase } from "./records.js";
import { closeTenant, forgetBelonging, membersOfTenant, tenantById } from "./directory.js";
import { forgetBranding } from "./branding.js";
import { dueForErasure, run } from "./jobs.js";
import type { Db } from "./sql.js";

export interface SweepDeps {
  readonly directory: Db;
  /** Where a workspace's records are. Null when its shard is not bound here. */
  readonly shardOf: (tenantId: TenantId) => Promise<Db | null>;
  readonly apps: Readonly<Record<string, () => AppSpec>>;
  readonly now?: () => Date;
}

/**
 * Erase every workspace past its erasure date.
 *
 * ⚠️ THE RECORDS FIRST, THE BELONGING LAST. Somebody who is no longer a member
 * cannot be found by the walk that would erase their records, so removing the
 * membership before the rows leaves the rows behind — with nothing pointing at
 * them, which is worse than either order failing loudly.
 */
export async function sweepErasure(deps: SweepDeps): Promise<{ touched: number; detail: string }> {
  const now = (deps.now ?? (() => new Date()))();
  const due = await dueForErasure(deps.directory, now.toISOString() as Instant);

  let erased = 0;
  const missed: string[] = [];
  for (const one of new Map(due.map((d) => [d.tenantId, d])).values()) {
    /* ⚠️ ALREADY DONE IS NOT DUE. Erasure leaves nothing behind to notice, so
       without this the same workspace is past its date again tomorrow and the
       run record claims work every night for the rest of the deployment. */
    const tenant = await tenantById(deps.directory, one.tenantId);
    if (!tenant || tenant.closedAt) continue;

    const db = await deps.shardOf(one.tenantId);
    if (!db) {
      /* ⚠️ REPORTED, NEVER SKIPPED QUIETLY. A workspace whose shard this
         deployment does not bind is one nothing will ever erase, and a sweep
         that returned "0 erased" over it would look like a clean run. */
      missed.push(one.tenantId);
      continue;
    }

    for (const make of Object.values(deps.apps)) {
      await erase(db, make().collections, "tenant", one.tenantId);
    }
    for (const accountId of await membersOfTenant(deps.directory, one.tenantId)) {
      await forgetBelonging(deps.directory, accountId, one.tenantId);
    }
    await forgetBranding(deps.directory, one.tenantId);
    await closeTenant(deps.directory, one.tenantId, now);
    erased++;
  }

  const detail = missed.length
    ? `${erased} erased, ${missed.length} on a shard this deployment does not bind: ${missed.join(", ")}`
    : `${erased} erased`;
  return { touched: erased, detail };
}

/**
 * ⚠️ EVERY RUN IS RECORDED, SUCCESSES AND FAILURES ALIKE. A job that stops
 * running does not fail — nothing is waiting for its answer, so a throw at 03:00
 * has no user, no request, no 500 and no red test. The console reads the LAST
 * run, because a job that is merely scheduled tells you nothing.
 */
export async function sweep(deps: SweepDeps): Promise<void> {
  const now = (deps.now ?? (() => new Date()))();
  await run(deps.directory, "erasure", () => sweepErasure(deps), now);
}
