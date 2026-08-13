/**
 * THE LAST RUNG, AND THE ONLY ONE PAYING CANNOT UNDO.
 *
 * ⚠️ THE LADDER HAD A DESTRUCTIVE END WITH NOTHING WALKING IT. `standingOf` has
 * reported `blocked` since the account rail landed and `dueForErasure` was a pure
 * function nobody called — so a workspace that stopped paying stayed withheld
 * forever, its records kept indefinitely, and the deployment paid to store them.
 * That is the mechanism-with-no-surface failure with the surface being a SWEEP,
 * which is the version nobody notices because there is no screen to be missing.
 *
 * ⚠️ AND A WORKSPACE CLOSED BY ITS OWNER WALKS THE SAME PATH. Somebody deciding
 * to leave and somebody who stopped paying are different reasons and identical
 * work — two erasure branches disagree eventually, and the disagreement is about
 * whether somebody's records still exist.
 *
 * ⚠️ IT IS THE PLATFORM'S JOB, NOT AN APP'S, and that is the whole point of the
 * ownership rule beside it. An app deciding when a workspace has been unpaid long
 * enough would be an app with an opinion about our billing relationship — and
 * three apps would have three opinions, one of which would be wrong about the
 * only step that cannot be taken back.
 */

import type { Instant, JobSpec, SchemaModule, SqlHandle, TenantId } from "@one/kernel";
import { dueForErasure } from "@one/kernel";
import { eraseTenant, erasurePlan, mustLeaveWith, type Keeping } from "./data.js";
import { subscriptionForTenant } from "./account-billing.js";
import type { ObjectHandle } from "@one/kernel";

export interface ArrearsDeps {
  readonly global: SqlHandle;
  /** ⚠️ The objects go with the rows, or the bucket keeps somebody's photographs. */
  objectsFor(region: string): ObjectHandle | null;
  readonly modules: readonly SchemaModule[];
  readonly keeping: readonly Keeping[];
}

/**
 * ⚠️ THE SWEEP RE-ASKS RATHER THAN TRUSTING A STANDING. `ctx.standing` says
 * `blocked`, which is every workspace from the tenth day onwards — erasing on
 * that would take a workspace three weeks before the ladder says it may. The
 * dates are what decide, and they are read here from the row the gate reads.
 */
export const arrearsJob = (deps: () => ArrearsDeps): JobSpec => ({
  id: "platform.arrears",
  summary: "Erase a workspace whose subscription has been unpaid past the last rung.",
  every: "daily",
  scope: "tenant",
  /*
    ⚠️ ONE AT A TIME. This is the only sweep in the platform that destroys
    anything, and a batch that erased fifty workspaces on a bad clock is a
    different order of accident from one that deleted fifty rows.
  */
  batch: 1,
  async handler(ctx) {
    const d = deps();
    const sub = await subscriptionForTenant(d.global, ctx.tenantId as TenantId).catch(() => null);
    /*
      ⚠️ NO SUBSCRIPTION IS NEVER ERASED. A workspace made before this rail
      existed, or by an operator, has no row — and reading that absence as
      "unpaid forever" would delete exactly the workspaces nobody ever charged.
    */
    if (!sub) return { done: 0, more: false, idle: 1 };

    const at = ctx.now();
    /*
      ⚠️ A WORKSPACE THE OWNER CLOSED IS ERASED ON ITS OWN DATE, which is the
      seven days `exit.close` scheduled rather than the arrears ladder's sixty.
      Somebody who decided to leave is not in arrears and must not wait two
      months for a decision they already made.
    */
    const closed = sub.closingAt !== null && sub.closingAt <= at;
    if (!closed && !dueForErasure(sub, at)) return { done: 0, more: false, idle: 1 };

    const objects = d.objectsFor(ctx.region);
    /*
      ⚠️ THE SAME PLAN THE OPERATOR'S OWN ERASE USES, derived from every module's
      declaration. A second list here is the hand-written one that named seven
      tables against a declaration of twenty-five — and this is the path with
      nobody watching it run.
    */
    await eraseTenant(
      ctx.bind.db as SqlHandle, erasurePlan(d.modules), ctx.tenantId as string,
      objects, mustLeaveWith(d.keeping), at,
    );
    /*
      ⚠️ AND THE SUBSCRIPTION GOES WITH IT, or the next run finds a workspace
      with no rows, erases nothing, and reports success every day forever.
    */
    await d.global.run(`DELETE FROM account_subscription WHERE tenant_id = ?`, ctx.tenantId).catch(() => undefined);
    await d.global.run(`DELETE FROM tenant_directory WHERE tenant_id = ?`, ctx.tenantId).catch(() => undefined);
    return { done: 1, more: true };
  },
});

/** ⚠️ Exported so the runtime can name the instant a test needs to control. */
export const erasesAt = (from: Instant, days: number): Instant =>
  new Date(Date.parse(from) + days * 86_400_000).toISOString() as Instant;
