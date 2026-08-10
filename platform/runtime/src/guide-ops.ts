/**
 * THE CHECKLIST'S SURFACE, AND THE HINT'S ONE WRITE.
 *
 * ⚠️ TWO OPERATIONS, AND ONE OF THEM ONLY EXISTS BECAUSE A HINT IS THE ONE
 * THING HERE THAT IS TRACKED. There is no "mark step done": a step is answered
 * by counting, so a write that could set one would be a way to tell somebody
 * something untrue about their own workspace.
 */

import type { AnyOperation, AppSpec, BindingSpec, Setup, SqlHandle } from "@one/kernel";
import { operation, s } from "@one/kernel";
import { dismissHint, guidanceFor, type PlatformFacts } from "./guide.js";

/** ⚠️ A symbol, so an app cannot reach the store by writing a property name. */
export const GUIDE = Symbol.for("one.runtime.guide");

export interface GuideDeps {
  readonly db: SqlHandle;
  readonly tenantId: string;
  readonly userId: string;
  readonly role: string;
  /** ⚠️ Who they are on the customer rail, for a step that is one person's. */
  readonly subjectId?: string;
  /** ⚠️ Whose setup this door asks about — the deployment's, or a workspace's. */
  readonly setup?: Setup;
  facts(): Promise<PlatformFacts>;
}

export interface GuideCarrier { readonly [GUIDE]: GuideDeps }

const deps = (ctx: unknown): GuideDeps => (ctx as GuideCarrier)[GUIDE];

export function guideOperations<B extends BindingSpec>(app: AppSpec<B>): readonly AnyOperation[] {
  const guide = app.guide ?? { steps: [], hints: [] };
  if (guide.steps.length === 0 && guide.hints.length === 0) return [];

  const read = operation({
    id: "guide.progress",
    kind: "read",
    summary: "What is still worth doing in this workspace, and what is blocking it.",
    input: s.object({}),
    output: s.object({
      steps: s.json(), blocking: s.json(), hints: s.json(),
      /* ⚠️ The wizard is a PROJECTION of the same answers, not a second call. */
      wizard: s.json(),
      of: s.number({ integer: true }), done: s.number({ integer: true }),
    }),
    /*
      ⚠️ THE PERSON'S OWN LIST, SCOPED BY CONSTRUCTION. The role comes from the
      session rather than from the request, so there is no parameter that could
      show somebody another persona's checklist.
    */
    permission: "guide:read",
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      if (!d.userId) {
        return { steps: [], blocking: [], hints: [], wizard: { setup: "workspace", steps: [], at: 0, of: 0, done: true }, of: 0, done: 0 };
      }
      return guidanceFor({
        db: d.db, guide, collections: app.collections,
        tenantId: d.tenantId, userId: d.userId, role: d.role, facts: await d.facts(),
        ...(d.subjectId ? { subjectId: d.subjectId } : {}),
        ...(d.setup ? { setup: d.setup } : {}),
      });
    },
  });

  const dismiss = operation({
    id: "guide.hint.seen",
    kind: "write",
    summary: "Stop showing one hint to this person.",
    input: s.object({ id: s.enum(guide.hints.map((h) => h.id)) }),
    output: s.object({ ok: s.bool() }),
    permission: "guide:read",
    idempotency: { mode: "natural", key: "id" },
    async handler(ctx, input: { id: string }) {
      const d = deps(ctx);
      if (!d.userId) return { ok: false };
      await dismissHint(d.db, d.tenantId, d.userId, input.id, ctx.now());
      return { ok: true };
    },
  });

  return (guide.hints.length ? [read, dismiss] : [read]) as unknown as readonly AnyOperation[];
}
