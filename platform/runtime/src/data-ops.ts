/**
 * THE WAY OUT — and the rule it exists to keep.
 *
 * ⚠️ LEAVING IS ALWAYS ALLOWED. Paying must be a way out, never the only one — a
 * workspace that cannot be closed while suspended is a trap, and a suspended
 * workspace whose exit route is itself suspended has no route at all. Everything
 * here is on the `exit` lane, which survives every rung of the standing ladder
 * by construction.
 *
 * ⚠️ AND CLOSING IS REVERSED BY CANCELLING, NOT BY PAYING. It is the owner's
 * decision rather than a consequence of one, so the thing that undoes it is
 * changing their mind. A close that could only be undone by settling an invoice
 * would be a collection tactic wearing an off-boarding flow's clothes.
 */

import type { AnyOperation, AppSpec, BindingSpec, Instant, ObjectHandle, SchemaModule, SqlHandle } from "@one/kernel";
import { operation, s } from "@one/kernel";
import { markClosing } from "./account-billing.js";
import { OPERATE } from "./operator-ops.js";
import { erasurePlan, eraseSubject, exportScoped, subjectPlan, eraseTenant, mustLeaveWith, type Forgotten, type Keeping } from "./data.js";
import { jobHistory } from "./jobs.js";
import { auditTrail } from "./audit.js";

/** ⚠️ A symbol, so an app cannot reach the plan by writing a property name. */
export const DATA = Symbol.for("one.runtime.data");

export interface DataDeps {
  readonly db: SqlHandle;
  /** The global store, where a job's run record lives. */
  readonly global: SqlHandle;
  /**
   * ⚠️ NULL ONLY WHERE A DEPLOYMENT GENUINELY HAS NO OBJECT STORE. Erasure
   * refuses rather than proceeding when there are files it cannot reach, so a
   * missing binding surfaces as a workspace that will not erase — which is the
   * loud failure. Passing one that is not the store the files are in is the
   * quiet one, and nothing here can tell.
   */
  readonly objects: ObjectHandle | null;
  readonly tenantId: string;
  readonly modules: readonly SchemaModule[];
  /**
   * ⚠️ WHAT EACH COLLECTION SAID ABOUT KEEPING ITS OWN ROWS. Derived from the
   * manifest rather than from the schema, because `retention` is a product
   * decision about a collection and a schema module knows only about tables.
   */
  readonly keeping: readonly Keeping[];
  /** ⚠️ How long the audit is kept. Declared by every app, read by nothing. */
  readonly auditRetentionDays: number;
  /** Whether this caller may act for the whole deployment rather than one workspace. */
  readonly isOperator: boolean;
}

export interface DataCarrier { readonly [DATA]: DataDeps }

const deps = (ctx: unknown): DataDeps => (ctx as DataCarrier)[DATA];

/** Seven days. Long enough to change your mind, short enough to mean something. */
export const CLOSING_DAYS = 7;

export function dataOperations<B extends BindingSpec>(_app: AppSpec<B>): readonly AnyOperation[] {
  const takeIt = operation({
    id: "exit.export",
    kind: "read",
    summary: "Everything this workspace has, in one document.",
    input: s.object({}),
    output: s.object({ at: s.instant(), tables: s.json(), dropped: s.json() }),
    permission: "workspace:close",
    idempotency: { mode: "none" },
    /*
      ⚠️ NOT A TOOL. An export is every row a workspace has, and a model that can
      request one can be asked to summarise it somewhere it should not go.
    */
    tool: false,
    async handler(ctx) {
      const d = deps(ctx);
      /*
        ⚠️ WITHOUT WHAT THE MANIFEST SAID MUST NOT BE KEPT. A collection
        declaring `onTenantClose: "purge"` is one whose retention refuses to keep
        it — and writing it into a document somebody downloads is exactly the
        thing that declaration forbids, done by the feature meant to honour it.
      */
      return exportScoped(d.db, erasurePlan(d.modules), d.tenantId, ctx.now());
    },
  });

  /**
   * WHAT WAS DONE HERE, AND BY WHOM.
   *
   * ⚠️ THE AUDIT IS THE WORKSPACE'S OWN, not only the operator's. A trail only we
   * can read is one that answers our questions about them and none of theirs
   * about us — and the single most important row in it is a support session,
   * which is us.
   */
  const trail = operation({
    id: "audit.list",
    kind: "read",
    summary: "What was done in this workspace, most recent first.",
    input: s.object({
      limit: s.optional(s.number({ integer: true, min: 1, max: 200 })),
      actorId: s.optional(s.text({ max: 60 })),
    }),
    output: s.object({ entries: s.json(), keptForDays: s.number({ integer: true }) }),
    /* ⚠️ The same permission that closes the workspace. An audit names who did
       what, so reading it is reading about colleagues, not about records. */
    permission: "workspace:close",
    idempotency: { mode: "none" },
    tool: false,
    async handler(ctx, input: { limit?: number; actorId?: string }) {
      const d = deps(ctx);
      return {
        entries: await auditTrail(d.db, d.tenantId, Math.min(input.limit ?? 50, 200), input.actorId),
        /* ⚠️ Said out loud. "Everything we have" and "everything since March"
           are different answers, and only one of them is true. */
        keptForDays: d.auditRetentionDays,
      };
    },
  });

  const close = operation({
    id: "exit.close",
    kind: "write",
    summary: "Close this workspace. Reversible for seven days.",
    input: s.object({ reason: s.optional(s.text({ max: 500 })) }),
    output: s.object({ erasesAt: s.instant() }),
    permission: "workspace:close",
    idempotency: { mode: "natural", key: "reason" },
    audit: () => ({ subject: "workspace", verb: "close" }),
    outcome: { message: "Workspace closing", tone: "warning", invalidates: ["billing.standing"] },
    /*
      ⚠️ NOT A TOOL, and this is the clearest case after the payment endpoint. A
      model that can close a workspace can be talked into it by a sentence in
      something it was asked to read.
    */
    tool: false,
    async handler(ctx) {
      const d = deps(ctx);
      const erasesAt = new Date(Date.parse(ctx.now()) + CLOSING_DAYS * 86_400_000).toISOString() as Instant;
      /*
        ⚠️ A RUNG OF ITS OWN, not `suspended`. Nothing was taken from them and
        there is no arrears to settle, so the copy cannot be shared — and the
        way back is cancelling rather than paying.
      */
      /*
        ⚠️ WRITTEN ON THE ACCOUNT'S SUBSCRIPTION, WHICH IS WHERE THE GATE READS.
        Written to a regional table nothing resolves against, "close this
        workspace" would answer 200, schedule nothing, and leave the product
        running — a destructive intention silently not recorded.
      */
      await markClosing(d.global, d.tenantId, erasesAt, ctx.now());
      return { erasesAt };
    },
  });

  const cancel = operation({
    id: "exit.cancel",
    kind: "write",
    summary: "Change your mind about closing this workspace.",
    input: s.object({}),
    output: s.object({ ok: s.bool() }),
    permission: "workspace:close",
    idempotency: { mode: "none" },
    audit: () => ({ subject: "workspace", verb: "reopen" }),
    /* ⚠️ Somebody changed their mind about leaving. That is worth saying properly. */
    outcome: { message: "Welcome back", tone: "success", moment: "welcome", invalidates: ["billing.standing"] },
    async handler(ctx) {
      const d = deps(ctx);
      await markClosing(d.global, d.tenantId, null, ctx.now());
      return { ok: true };
    },
  });

  const erase = operation({
    id: "exit.erase",
    kind: "write",
    summary: "Forget this workspace now, without waiting out the seven days.",
    input: s.object({ confirm: s.text({ max: 120 }) }),
    output: s.object({ tables: s.json(), absent: s.json(), objects: s.number({ integer: true }), stranded: s.number({ integer: true }), taken: s.optional(s.json()) }),
    permission: "workspace:close",
    idempotency: { mode: "none" },
    audit: () => ({ subject: "workspace", verb: "erase" }),
    fails: ["platform.invalid"],
    tool: false,
    async handler(ctx, input: { confirm: string }) {
      const d = deps(ctx);
      /*
        ⚠️ THE CONFIRMATION IS THE WORKSPACE'S OWN IDENTIFIER, TYPED. A yes/no
        dialog in front of something irreversible is a reflex, not a decision —
        and this is the one operation in the platform with no undo at all.
      */
      if (input.confirm !== d.tenantId) ctx.fail("platform.invalid", { field: "confirm", reason: "type the workspace id to confirm" });
      /*
        ⚠️ THE FILES GO WITH IT, AND A `stranded` ABOVE ZERO MEANS THEY DID NOT.
        The caller is told rather than reassured: erasure is re-runnable, and the
        second attempt starts from whatever is still there.
      */
      /*
        ⚠️ AND WHAT THE MANIFEST SAID MAY NOT BE DESTROYED WITHOUT BEING HANDED
        OVER COMES BACK WITH THE ANSWER. `export-then-purge` is an obligation
        about the ORDER of two operations, so it cannot be honoured by a filter
        on the export or by telling somebody to take one first — an instruction
        attached to the one operation with no undo is a thing that gets skipped.
      */
      return eraseTenant(d.db, erasurePlan(d.modules), d.tenantId, d.objects, mustLeaveWith(d.keeping), ctx.now());
    },
  });

  /**
   * ⚠️ A RUN TABLE NOBODY CAN READ IS THE SAME SILENCE WITH AN EXTRA TABLE.
   *
   * Same argument as the payment dead letter and the same conclusion: the
   * surface is not optional, and it is behind an operator permission. The
   * question it answers — "is the sweep still running" — is one nobody thinks to
   * ask until something that should have happened has not for a month.
   */
  const runs = operation({
    id: "billing.jobs",
    kind: "read",
    summary: "What the scheduler has actually been doing.",
    input: s.object({ limit: s.optional(s.number({ integer: true, min: 1, max: 100 })) }),
    output: s.object({ runs: s.json() }),
    permission: OPERATE,
    idempotency: { mode: "none" },
    async handler(ctx, input: { limit?: number }) {
      const d = deps(ctx);
      return { runs: await jobHistory(d.global, Math.min(input.limit ?? 25, 100)) };
    },
  });

  return [takeIt, trail, close, cancel, erase, runs] as unknown as readonly AnyOperation[];
}

/**
 * Forget one person, from inside an app's own handler.
 *
 * ⚠️ THE PLAN COMES FROM THE RUNTIME'S OWN MODULE LIST, not from the app. An app
 * that assembled it would be assembling the thing this platform derives — and
 * would do it from `worker.ts`, which imports the manifest, so the manifest
 * cannot import it back. Reading it off the context is what makes "forget this
 * client" expressible in the file where the product decides what that means.
 */
export async function forgetSubject(
  ctx: unknown,
  tenantId: string,
  subjectId: string,
): Promise<Forgotten> {
  const d = deps(ctx);
  return eraseSubject(d.db, subjectPlan(d.modules), tenantId, subjectId);
}
