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

import type { AiSpec, AnyOperation, AppSpec, BindingSpec, InferenceHandle, Instant, OperationSpec, Rates, SqlHandle } from "@one/kernel";
import { chooseModel, modelsFor, operation, s } from "@one/kernel";
import { FILES, type FilesCarrier } from "./files-ops.js";
import { fetchMedia, storeMedia } from "./files.js";
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
  /**
   * ⚠️ THE TWO LAYERS BETWEEN THE MANIFEST'S DEFAULT AND THE REGION'S REFUSAL,
   * and both are read lazily for the same reason the rates are.
   *
   * `chosen` is this workspace's own pick per feature; `disabled` is what the
   * operator turned off across the deployment. Neither is a fallback for the
   * other — they are two different people's decisions, and `chooseModel` is
   * where the four of them meet.
   */
  chosen(): Promise<Readonly<Record<string, string>>>;
  disabled(): Promise<readonly string[]>;
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
    chosenModel: (await d.chosen())[feature] ?? null, disabledModels: await d.disabled(),
    tenantId: d.tenantId, actorId: d.actorId,
    feature, prompt, at: ctx.now(),
  });
}

/**
 * Ask for a generation ABOUT A PICTURE the workspace already holds.
 *
 * ⚠️ THE IMAGE IS NAMED BY ITS MEDIA ID, NEVER SENT AS BYTES. A lane that took
 * raw bytes here would be a second way into a model's input with nothing
 * counting the storage, nothing stripping the metadata a phone attaches, and
 * nothing erasing it when the workspace goes. Going through the upload the
 * platform already has means a photograph in a request is a photograph in the
 * media ledger, with one answer to "what does this workspace hold".
 *
 * ⚠️ AND IT IS SCOPED. `fetchMedia` binds the tenant, so a caller naming
 * another workspace's file gets the same answer as one naming a file that does
 * not exist — which is the only answer that tells them nothing.
 */
export async function generateAbout(
  ctx: { now(): Instant },
  ai: AiSpec,
  feature: string,
  prompt: string,
  mediaId: string,
): Promise<Generated> {
  const d = deps(ctx);
  const f = (ctx as unknown as FilesCarrier)[FILES];
  const found = await fetchMedia(f.db, f.objects, f.tenantId, mediaId);
  /*
    ⚠️ A MISSING PICTURE IS REFUSED BEFORE ANYTHING IS HELD. Holding first and
    discovering afterwards means a refund on every mistyped id, and a refund
    that fails is credits taken for a call nobody made.
  */
  if (!found) return { ok: false, why: "unconfigured", meta: { reason: "that picture is not in this workspace" } };
  return generate({
    db: d.db, ai, inference: d.inference, rates: await d.rates(),
    chosenModel: (await d.chosen())[feature] ?? null, disabledModels: await d.disabled(),
    tenantId: d.tenantId, actorId: d.actorId,
    feature, prompt, image: { bytes: found.body, contentType: found.row.contentType }, at: ctx.now(),
  });
}

/** What a generated picture came back as, once it is in the workspace's own store. */
export type Drawn =
  | { readonly ok: true; readonly id: string; readonly mediaId: string; readonly charged: number; readonly balance: number }
  | Extract<Generated, { ok: false }>
  | { readonly ok: false; readonly why: "provider"; readonly meta: Readonly<Record<string, string>> };

/**
 * Ask for a picture, and keep it.
 *
 * ⚠️ WHAT COMES BACK IS BYTES, AND BYTES HAVE TO LAND SOMEWHERE ACCOUNTED FOR.
 * A generated image returned as a data URL for the browser to deal with is an
 * object nothing counts against the workspace's storage, nothing erases when it
 * closes, and nothing can serve again tomorrow — so the only way to keep it is
 * to generate it a second time and pay again.
 *
 * ⚠️ THE STORAGE CEILING IS CHECKED AFTER THE MODEL RAN AND THE CHARGE STANDS.
 * That is the honest order rather than the flattering one: the provider did the
 * work and invoices us for it whether or not we found room. Refunding here would
 * make a full workspace a free image generator.
 */
export async function drawWith(
  ctx: { now(): Instant },
  ai: AiSpec,
  feature: string,
  prompt: string,
  keep: { readonly name: string; readonly purpose: string },
): Promise<Drawn> {
  const d = deps(ctx);
  const made = await generate({
    db: d.db, ai, inference: d.inference, rates: await d.rates(),
    chosenModel: (await d.chosen())[feature] ?? null, disabledModels: await d.disabled(),
    tenantId: d.tenantId, actorId: d.actorId,
    feature, prompt, at: ctx.now(),
  });
  if (!made.ok) return made;

  const drawn = made.output as { bytes?: ArrayBuffer; contentType?: string } | undefined;
  if (!drawn?.bytes) {
    return { ok: false, why: "provider", meta: { reason: "the model answered with no picture" } };
  }

  const f = (ctx as unknown as FilesCarrier)[FILES];
  const stored = await storeMedia({
    db: f.db, objects: f.objects, tenantId: f.tenantId, actorId: f.actorId,
    body: drawn.bytes, contentType: drawn.contentType ?? "image/png",
    name: keep.name, purpose: keep.purpose, allowance: f.allowance,
    maxBytes: MAX_GENERATED_BYTES, at: ctx.now(),
  });
  if (!stored.ok) {
    return { ok: false, why: "provider", meta: { reason: stored.why, charged: String(made.charged) } };
  }
  return { ok: true, id: made.id, mediaId: stored.row.id, charged: made.charged, balance: made.balance };
}

/**
 * ⚠️ A CEILING ON WHAT A MODEL MAY HAND BACK, separate from the upload's. A
 * provider that answers with something enormous would otherwise be a way to
 * fill a workspace's storage that no person ever chose.
 */
export const MAX_GENERATED_BYTES = 12 * 1024 * 1024;

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
  /*
    ⚠️ THE REFUSAL'S OWN WORDS SURVIVE, and `reason` is what carries them. Writing
    the code over that key replaced "that picture is not in this workspace" and
    "this asks for a picture and none was given" with the word `unconfigured` —
    so three different mistakes a caller can fix produced one message nobody can
    act on, and the specific half was computed and thrown away.
  */
  const meta: Record<string, string> = { reason: g.why, ...(g.meta ?? {}) };
  switch (g.why) {
    case "no_credits": return { code: "platform.quota_reached", meta: { limit: meta.have ?? "0", used: meta.need ?? "0", ...meta } };
    case "daily_ceiling": return { code: "platform.too_many", meta: { retryAfter: "tomorrow", ...meta } };
    case "unknown_feature": return { code: "platform.invalid", meta };
    default: return { code: "platform.unavailable", meta };
  }
}

/* --------------------------------------------------------- two factories --- */

/**
 * TWO OPERATIONS EVERY APP WITH A MODEL WRITES, WRITTEN ONCE.
 *
 * ⚠️ NEITHER KNOWS WHAT IT IS READING OR DRAFTING. What varies is the id, the
 * feature, the permission and the words; what does not vary is the shape — a
 * metered write, refused as a declared problem rather than a throw, never a
 * tool, and acknowledging that it happened.
 *
 * ⚠️ AND THE LAST OF THOSE IS WHY THEY ARE HERE. Both shipped in an app without
 * an `outcome`, so five writes that spend a workspace's credits answered with
 * nothing a screen was told to say. One omission became five, and the next app
 * writing its own pair would make it six.
 */

const GENERATION_FAILS = [
  "platform.invalid", "platform.quota_reached", "platform.too_many", "platform.unavailable",
] as const;

export interface GenerationOp {
  readonly id: string;
  /** The manifest's feature — the model, the system text and the ceiling. */
  readonly feature: string;
  readonly summary: string;
  readonly permission: string;
  readonly customerFlag?: string;
  readonly entitlement?: string;
  /** What the audit records this as. */
  readonly verb: string;
  readonly subject: string;
}

/**
 * An operation that sends a picture the workspace already holds to a model, and
 * answers with what it read.
 *
 * ⚠️ NOT A TOOL, AND THAT IS NOT NEGOTIABLE PER APP. A model that can hand
 * another model a photograph out of this workspace's library, on a request
 * nobody made, spends somebody's credits on pictures nobody chose to have read.
 */
export function readsAPicture<B extends BindingSpec>(
  ai: AiSpec, o: GenerationOp,
): OperationSpec<B, { photo: string; note?: string }, { generation: string; read: unknown; charged: number }, typeof GENERATION_FAILS[number]> {
  return operation<B, { photo: string; note?: string }, { generation: string; read: unknown; charged: number }, typeof GENERATION_FAILS[number]>({
    id: o.id,
    kind: "write",
    summary: o.summary,
    input: s.object({ photo: s.text({ max: 40 }), note: s.optional(s.text({ max: 300 })) }),
    output: s.object({ generation: s.text(), read: s.json(), charged: s.number({ integer: true }) }),
    permission: o.permission,
    ...(o.customerFlag ? { customerFlag: o.customerFlag } : {}),
    ...(o.entitlement ? { entitlement: o.entitlement } : {}),
    idempotency: { mode: "none" },
    audit: () => ({ subject: o.subject, verb: o.verb }),
    fails: [...GENERATION_FAILS],
    outcome: { message: "Read", tone: "success", invalidates: ["ai.spending"] },
    tool: false,
    async handler(ctx, input: { photo: string; note?: string }) {
      const out = await generateAbout(ctx, ai, o.feature, input.note ?? "", input.photo);
      if (!out.ok) {
        const problem = refusalProblem(out);
        ctx.fail(problem.code as typeof GENERATION_FAILS[number], problem.meta);
      }
      const done = out as Extract<typeof out, { ok: true }>;
      return { generation: done.id, read: done.output, charged: done.charged };
    },
  });
}

/**
 * An operation that drafts something from a sentence somebody typed.
 *
 * ⚠️ THE CEILING ON THE SENTENCE IS THE APP'S, because the length of a useful
 * brief differs by what is being drafted — and it is an input bound rather than
 * a suggestion, since every character reaches a model that charges by the token.
 */
export function draftsFrom<B extends BindingSpec>(
  ai: AiSpec, o: GenerationOp & { readonly max: number },
): OperationSpec<B, { about: string }, { generation: string; draft: unknown; charged: number }, typeof GENERATION_FAILS[number]> {
  return operation<B, { about: string }, { generation: string; draft: unknown; charged: number }, typeof GENERATION_FAILS[number]>({
    id: o.id,
    kind: "write",
    summary: o.summary,
    input: s.object({ about: s.text({ min: 3, max: o.max }) }),
    output: s.object({ generation: s.text(), draft: s.json(), charged: s.number({ integer: true }) }),
    permission: o.permission,
    ...(o.customerFlag ? { customerFlag: o.customerFlag } : {}),
    ...(o.entitlement ? { entitlement: o.entitlement } : {}),
    idempotency: { mode: "none" },
    audit: () => ({ subject: o.subject, verb: o.verb }),
    fails: [...GENERATION_FAILS],
    outcome: { message: "Drafted", tone: "success", invalidates: ["ai.spending"] },
    tool: false,
    async handler(ctx, input: { about: string }) {
      const out = await generateWith(ctx, ai, o.feature, input.about);
      if (!out.ok) {
        const problem = refusalProblem(out);
        ctx.fail(problem.code as typeof GENERATION_FAILS[number], problem.meta);
      }
      const done = out as Extract<typeof out, { ok: true }>;
      return { generation: done.id, draft: done.output, charged: done.charged };
    },
  });
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

  /**
   * ⚠️ WHAT THIS WORKSPACE MAY CHOOSE, WITH ITS WORKING SHOWN.
   *
   * Same grammar as `explainEntitlements`: per feature, the eligible models, the
   * one in effect, and WHO decided it. A screen that showed only the answer
   * cannot tell a workspace that its pick is no longer offered — and that is
   * exactly the state an operator's toggle or a region's allow-list creates,
   * silently, months after the change.
   */
  const models = operation({
    id: "ai.models.list",
    kind: "read",
    summary: "Which model runs each feature here, and what else this workspace could pick.",
    input: s.object({}),
    output: s.object({ features: s.json() }),
    permission: "ai:read",
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      const [chosen, disabled, rates] = await Promise.all([d.chosen(), d.disabled(), d.rates()]);
      const features = Object.entries(app.ai!.features).map(([id, feature]) => {
        const decided = chooseModel({ ai: app.ai!, feature: id, chosen: chosen[id] ?? null, disabled, permitted: d.inference?.permitted ?? [], rates });
        return {
          feature: id,
          summary: feature.summary,
          /* ⚠️ What is OFFERED, after every layer. A list containing something a
             region refuses is a control that produces a failure on save. */
          options: modelsFor({ ai: app.ai!, feature: id, disabled, permitted: d.inference?.permitted ?? [], rates })
            .map((m) => ({ id: m.id, provider: m.provider })),
          inEffect: decided.ok ? decided.model.id : null,
          decidedBy: decided.ok ? decided.source : null,
          /* ⚠️ And the refusal travels, because "none" and "none this region
             permits" are different things to go and do something about. */
          why: decided.ok ? null : decided.why,
          /* ⚠️ A pick that is no longer eligible is REPORTED rather than shown
             as though it were running. */
          stale: Boolean(chosen[id] && decided.ok && decided.model.id !== chosen[id]),
        };
      });
      return { features };
    },
  });

  const pick = operation({
    id: "ai.models.choose",
    kind: "write",
    summary: "Choose which model runs one feature for this workspace.",
    input: s.object({ feature: s.text({ max: 60 }), model: s.optional(s.text({ max: 120 })) }),
    output: s.object({ feature: s.text(), model: s.text() }),
    /*
      ⚠️ THE SETTINGS PERMISSION, NOT `ai:use`. Choosing which company reads a
      workspace's data is a decision about the workspace, and somebody who may
      run a generation is not therefore somebody who may redirect every future
      one to a different provider.
    */
    permission: "workspace:settings",
    idempotency: { mode: "natural", key: "feature" },
    audit: (i: { feature: string; model?: string }) => ({ subject: i.feature, verb: `model:${i.model ?? "default"}` }),
    outcome: { message: "Saved", tone: "success", invalidates: ["ai.models.list"] },
    fails: ["platform.invalid"],
    async handler(ctx, input: { feature: string; model?: string }) {
      const d = deps(ctx);
      if (!app.ai!.features[input.feature]) ctx.fail("platform.invalid", { field: "feature", reason: "not a feature this product has" });

      /* ⚠️ NO MODEL CLEARS THE CHOICE rather than setting an empty one, so
         going back to the product's default is expressible at all. */
      if (!input.model) {
        await d.db.run(`DELETE FROM ai_choice WHERE tenant_id = ? AND feature = ?`, d.tenantId, input.feature);
        return { feature: input.feature, model: "" };
      }

      /*
        ⚠️ REFUSED AT THE DOOR IF IT IS NOT ELIGIBLE. Storing a pick the region
        does not permit, the operator turned off, or that cannot do what the
        feature asks would be a row that resolves to the default forever — a
        setting that appears to have been saved and changes nothing.
      */
      const offered = modelsFor({
        ai: app.ai!, feature: input.feature,
        disabled: await d.disabled(), permitted: d.inference?.permitted ?? [], rates: await d.rates(),
      });
      if (!offered.some((m) => m.id === input.model)) {
        ctx.fail("platform.invalid", { field: "model", reason: "not offered for this feature here" });
      }
      await d.db.run(
        `INSERT INTO ai_choice (tenant_id, feature, model_id, at) VALUES (?, ?, ?, ?)
         ON CONFLICT(tenant_id, feature) DO UPDATE SET model_id = excluded.model_id, at = excluded.at`,
        d.tenantId, input.feature, input.model, ctx.now() as Instant,
      );
      return { feature: input.feature, model: input.model };
    },
  });

  return [spend, wrong, models, pick] as unknown as readonly AnyOperation[];
}
