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

import type { AnyOperation, AppSpec, BindingSpec, Instant, SchemaModule, SqlHandle } from "@one/kernel";
import { operation, s } from "@one/kernel";
import { erasurePlan, eraseTenant, exportTenant } from "./data.js";
import { jobHistory } from "./jobs.js";

/** ⚠️ A symbol, so an app cannot reach the plan by writing a property name. */
export const DATA = Symbol.for("one.runtime.data");

export interface DataDeps {
  readonly db: SqlHandle;
  /** The global store, where a job's run record lives. */
  readonly global: SqlHandle;
  readonly tenantId: string;
  readonly modules: readonly SchemaModule[];
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
      return exportTenant(d.db, erasurePlan(d.modules), d.tenantId, ctx.now());
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
      await d.db.run(
        `INSERT INTO subscription (tenant_id, status, closing_at, updated_at) VALUES (?, 'none', ?, ?)
         ON CONFLICT(tenant_id) DO UPDATE SET closing_at = excluded.closing_at, updated_at = excluded.updated_at`,
        d.tenantId, erasesAt, ctx.now(),
      );
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
      await d.db.run(`UPDATE subscription SET closing_at = NULL, updated_at = ? WHERE tenant_id = ?`, ctx.now(), d.tenantId);
      return { ok: true };
    },
  });

  const erase = operation({
    id: "exit.erase",
    kind: "write",
    summary: "Forget this workspace now, without waiting out the seven days.",
    input: s.object({ confirm: s.text({ max: 120 }) }),
    output: s.object({ tables: s.json(), absent: s.json() }),
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
      return eraseTenant(d.db, erasurePlan(d.modules), d.tenantId);
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
    permission: "billing:operate",
    idempotency: { mode: "none" },
    async handler(ctx, input: { limit?: number }) {
      const d = deps(ctx);
      return { runs: await jobHistory(d.global, Math.min(input.limit ?? 25, 100)) };
    },
  });

  return [takeIt, close, cancel, erase, runs] as unknown as readonly AnyOperation[];
}
