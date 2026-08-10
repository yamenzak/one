/**
 * THE GENERATION SURFACE — and the seam that keeps prompts in the app.
 *
 * ⚠️ THE PLATFORM DOES NOT DERIVE AN OPERATION PER FEATURE, and that is the
 * decision worth stating. A derived one would have to guess the input shape, the
 * output shape, the permission and what to do with the answer — and every one of
 * those is the product's. So the app writes its own operation, exactly as it
 * writes any other, and calls `generateWith` inside it. The metering, both
 * ceilings and the record are the platform's, and there is no way to reach a
 * model that goes round them.
 *
 * What IS derived is the pair of surfaces nobody would write and everybody
 * needs: what the credits were spent on, and a way to say a generation was
 * wrong.
 */

import type { AiSpec, AnyOperation, AppSpec, BindingSpec, InferenceHandle, Instant, Rates, SqlHandle } from "@one/kernel";
import { operation, s } from "@one/kernel";
import { generate, judge, spending, type Generated } from "./generate.js";
import { balance } from "./ledger.js";
import { CREDITS } from "./generate.js";

/** ⚠️ A symbol, so an app cannot reach the model runner by writing a property name. */
export const GENERATION = Symbol.for("one.runtime.generation");

export interface GenerationDeps {
  readonly db: SqlHandle;
  readonly inference: InferenceHandle | null;
  /** ⚠️ Read lazily: only a request that actually generates pays for the query. */
  rates(): Promise<Rates>;
  readonly tenantId: string;
  readonly actorId: string;
}

export interface GenerationCarrier { readonly [GENERATION]: GenerationDeps }

const deps = (ctx: unknown): GenerationDeps => (ctx as GenerationCarrier)[GENERATION];

/**
 * Ask for a generation from inside an app's own handler.
 *
 * ⚠️ THE FEATURE IS NAMED, NOT DESCRIBED. Everything about the request that
 * costs money — the model, the system text, the output ceiling, the daily bound
 * — comes from the manifest, so a handler cannot widen any of them and a reserve
 * cannot be computed from a different document than the one sent.
 *
 * ⚠️ IT TAKES THE CATALOGUE RATHER THAN THE APP, and not for tidiness: an
 * operation that reached for the whole manifest would be part of the manifest
 * that contains it, and the type is genuinely circular. Handing over the one
 * thing it needs is what makes an app's own AI operation expressible at all.
 */
export async function generateWith(
  ctx: { now(): Instant },
  ai: AiSpec,
  feature: string,
  prompt: string,
): Promise<Generated> {
  const d = deps(ctx);
  return generate({
    db: d.db, ai, inference: d.inference, rates: await d.rates(),
    tenantId: d.tenantId, actorId: d.actorId,
    feature, prompt, at: ctx.now(),
  });
}

/**
 * ⚠️ EACH REFUSAL BECOMES A DIFFERENT PROBLEM, because each is a different thing
 * to do next: buy credits, wait until tomorrow, tell somebody the deployment is
 * misconfigured, or try again. A handler that mapped all four to one code would
 * produce copy that is wrong for three of them.
 */
export function refusalProblem(g: Extract<Generated, { ok: false }>): {
  readonly code: "platform.quota_reached" | "platform.unavailable" | "platform.invalid" | "platform.too_many";
  readonly meta: Readonly<Record<string, string>>;
} {
  const meta: Record<string, string> = { ...(g.meta ?? {}), reason: g.why };
  switch (g.why) {
    case "no_credits": return { code: "platform.quota_reached", meta: { limit: meta.have ?? "0", used: meta.need ?? "0", ...meta } };
    case "daily_ceiling": return { code: "platform.too_many", meta: { retryAfter: "tomorrow", ...meta } };
    case "unknown_feature": return { code: "platform.invalid", meta };
    default: return { code: "platform.unavailable", meta };
  }
}

/* ------------------------------------------------------------ operations --- */

export function generationOperations<B extends BindingSpec>(app: AppSpec<B>): readonly AnyOperation[] {
  if (!app.ai) return [];

  const spend = operation({
    id: "ai.spending",
    kind: "read",
    summary: "What the workspace's credits were spent on.",
    input: s.object({ limit: s.optional(s.number({ integer: true, min: 1, max: 200 })) }),
    output: s.object({ balance: s.number({ integer: true }), spends: s.json() }),
    permission: "ai:read",
    idempotency: { mode: "none" },
    async handler(ctx, input: { limit?: number }) {
      const d = deps(ctx);
      return {
        balance: await balance(d.db, d.tenantId, CREDITS),
        spends: await spending(d.db, d.tenantId, Math.min(input.limit ?? 50, 200)),
      };
    },
  });

  const wrong = operation({
    id: "ai.feedback",
    kind: "write",
    summary: "Say a generation was wrong, and have that recorded.",
    input: s.object({
      id: s.text({ max: 60 }),
      verdict: s.enum(["good", "wrong", "unusable"]),
      note: s.optional(s.text({ max: 1_000 })),
    }),
    output: s.object({ recorded: s.bool() }),
    permission: "ai:use",
    idempotency: { mode: "natural", key: "id" },
    audit: (i: { id: string }) => ({ subject: i.id, verb: "judge" }),
    outcome: { message: "Thank you — noted", tone: "success", invalidates: ["ai.spending"] },
    fails: ["platform.not_found"],
    /*
      ⚠️ NOT A TOOL. A model judging its own output is not evidence, and the
      whole value of this row is that a person said so.
    */
    tool: false,
    async handler(ctx, input: { id: string; verdict: string; note?: string }) {
      const d = deps(ctx);
      const done = await judge(d.db, d.tenantId, input.id, input.verdict, input.note ?? "");
      if (!done) ctx.fail("platform.not_found");
      return { recorded: true };
    },
  });

  return [spend, wrong] as unknown as readonly AnyOperation[];
}
