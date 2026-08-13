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

import type { AiSpec, AnyOperation, AppSpec, BindingSpec, Catalogue, InferenceHandle, Instant, OperationSpec, SqlHandle } from "@one/kernel";
import { chooseModel, modelsFor, operation, s } from "@one/kernel";
import { FILES, type FilesCarrier } from "./files-ops.js";
import { fetchMedia, storeMedia } from "./files.js";
import { generate, judge, spending, NO_CHOICE, type Choice, type Generated } from "./generate.js";
import { balanceFor } from "./account-billing.js";
import { CREDITS } from "./generate.js";

/** ⚠️ A symbol, so an app cannot reach the model runner by writing a property name. */
export const GENERATION = Symbol.for("one.runtime.generation");

export interface GenerationDeps {
  readonly db: SqlHandle;
  readonly inference: InferenceHandle | null;
  /**
   * ⚠️ THE DEPLOYMENT'S WHOLE CATALOGUE. Read lazily: only a request that
   * actually generates pays for the query.
   */
  catalogue(): Promise<Catalogue>;
  /**
   * ⚠️ WHAT THIS WORKSPACE DECIDED — its model per action and the words it puts
   * in front of every request. Read lazily for the same reason, and read
   * TOGETHER, because two lookups is two chances to run one workspace's model
   * against another's words.
   */
  chosen(): Promise<Readonly<Record<string, Choice>>>;
  readonly tenantId: string;
  /** ⚠️ The global store and the paying account — the balance is not the workspace's. */
  readonly global: SqlHandle;
  readonly accountId: string;
  readonly productId: string;
  readonly actorId: string;
}

export interface GenerationCarrier { readonly [GENERATION]: GenerationDeps }

const deps = (ctx: unknown): GenerationDeps => (ctx as GenerationCarrier)[GENERATION];

/**
 * ⚠️ ONE PLACE THE WORKSPACE'S TWO DECISIONS BECOME ARGUMENTS. Spread by hand at
 * each call site, one of them eventually gets the model and not the preamble —
 * and a preamble silently dropped is a workspace whose configuration does
 * nothing, on a screen that saved successfully.
 */
/**
 * ⚠️ A CEILING ON THE PREAMBLE, because it is measured into every reserve. Left
 * unbounded, a workspace that pasted a document into the box would pay for it on
 * every call — which is correct, and is also a bill nobody would connect to a
 * settings screen they filled in once.
 */
export const PROMPT_MAX = 2_000;

/**
 * ⚠️ ONE WRITER FOR BOTH HALVES OF A CHOICE, so setting the prompt cannot clear
 * the model. Two `INSERT … ON CONFLICT` statements, each naming its own column,
 * is the shape where the second one's defaults quietly overwrite the first.
 */
async function upsertChoice(
  db: SqlHandle, tenantId: string, action: string,
  patch: { readonly model_id?: string; readonly prompt?: string }, at: Instant,
): Promise<void> {
  if (patch.model_id !== undefined) {
    await db.run(
      `INSERT INTO ai_choice (tenant_id, feature, model_id, prompt, at) VALUES (?, ?, ?, '', ?)
       ON CONFLICT(tenant_id, feature) DO UPDATE SET model_id = excluded.model_id, at = excluded.at`,
      tenantId, action, patch.model_id, at,
    );
  }
  if (patch.prompt !== undefined) {
    await db.run(
      `INSERT INTO ai_choice (tenant_id, feature, model_id, prompt, at) VALUES (?, ?, '', ?, ?)
       ON CONFLICT(tenant_id, feature) DO UPDATE SET prompt = excluded.prompt, at = excluded.at`,
      tenantId, action, patch.prompt, at,
    );
  }
}

const decidedFor = (chosen: Readonly<Record<string, Choice>>, action: string) => {
  const c = chosen[action] ?? NO_CHOICE;
  return { chosenModel: c.model || null, preamble: c.prompt };
};

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
    db: d.db, global: d.global, accountId: d.accountId, productId: d.productId, ai, inference: d.inference,
    catalogue: await d.catalogue(), ...decidedFor(await d.chosen(), feature),
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
    db: d.db, global: d.global, accountId: d.accountId, productId: d.productId, ai, inference: d.inference,
    catalogue: await d.catalogue(), ...decidedFor(await d.chosen(), feature),
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
    db: d.db, global: d.global, accountId: d.accountId, productId: d.productId, ai, inference: d.inference,
    catalogue: await d.catalogue(), ...decidedFor(await d.chosen(), feature),
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
        /* ⚠️ THE PAYING ACCOUNT'S BALANCE, which is the number the generations
           beside it actually came out of. Read from the workspace, this screen
           would show a total nothing spends and every row would look unexplained. */
        balance: (await balanceFor(d.global, d.accountId, ctx.now())).total,
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
    summary: "Which model runs each action here, what else this workspace could pick, and what it says first.",
    input: s.object({}),
    output: s.object({ actions: s.json() }),
    permission: "ai:read",
    idempotency: { mode: "none" },
    async handler(ctx) {
      const d = deps(ctx);
      const [chosen, catalogue] = await Promise.all([d.chosen(), d.catalogue()]);
      /*
        ⚠️ EVERY ACTION THE MANIFEST DECLARES, WALKED HERE. This is the whole of
        "the AI settings screen discovers itself": an action added to a product
        appears, one removed stops appearing, and no screen anywhere names one.
      */
      const actions = Object.entries(app.ai!.actions).map(([id, action]) => {
        const where = { ai: app.ai!, catalogue, action: id, permitted: d.inference?.permitted ?? [] };
        const decided = chooseModel({ ...where, chosen: chosen[id]?.model ?? null });
        return {
          action: id,
          summary: action.summary,
          lane: action.lane,
          /*
            ⚠️ WHETHER THE PRODUCT ASKED FOR THE DEAR ONE. Without it, an owner
            looking at an action that costs several times what its neighbours do
            sees a model somebody apparently chose badly — when what happened is
            that the product said this one has to be good, and said why.
          */
          prefer: action.prefer ?? "cheapest",
          /* ⚠️ What is OFFERED, after every layer. A list containing something a
             region refuses is a control that produces a failure on save. */
          options: modelsFor(where).map((m) => ({ id: m.id, provider: m.provider })),
          inEffect: decided.ok ? decided.model.id : null,
          decidedBy: decided.ok ? decided.source : null,
          /* ⚠️ And the refusal travels, because "the operator has added no model
             that can do this" and "no model this region permits can" are
             different things to go and do. */
          why: decided.ok ? null : decided.why,
          /* ⚠️ A pick that is no longer eligible is REPORTED rather than shown
             as though it were running. */
          stale: Boolean(chosen[id]?.model && decided.ok && decided.model.id !== chosen[id]!.model),
          prompt: chosen[id]?.prompt ?? "",
        };
      });
      return { actions };
    },
  });

  const pick = operation({
    id: "ai.models.choose",
    kind: "write",
    summary: "Choose which model runs one action for this workspace.",
    input: s.object({ action: s.text({ max: 60 }), model: s.optional(s.text({ max: 200 })) }),
    output: s.object({ action: s.text(), model: s.text() }),
    /*
      ⚠️ THE SETTINGS PERMISSION, NOT `ai:use`. Choosing which company reads a
      workspace's data is a decision about the workspace, and somebody who may
      run a generation is not therefore somebody who may redirect every future
      one to a different provider.
    */
    permission: "workspace:settings",
    idempotency: { mode: "natural", key: "action" },
    audit: (i: { action: string; model?: string }) => ({ subject: i.action, verb: `model:${i.model ?? "default"}` }),
    outcome: { message: "Saved", tone: "success", invalidates: ["ai.models.list"] },
    fails: ["platform.invalid"],
    async handler(ctx, input: { action: string; model?: string }) {
      const d = deps(ctx);
      if (!app.ai!.actions[input.action]) ctx.fail("platform.invalid", { field: "action", reason: "not an action this product has" });

      /*
        ⚠️ REFUSED AT THE DOOR IF IT IS NOT ELIGIBLE. Storing a pick the region
        does not permit, the operator turned off, or that cannot do what the
        action asks would be a row that resolves to the default forever — a
        setting that appears to have been saved and changes nothing.

        ⚠️ NO MODEL CLEARS THE PICK rather than storing an empty one, so going
        back to the deployment's own choice is expressible at all.
      */
      if (input.model) {
        const offered = modelsFor({
          ai: app.ai!, catalogue: await d.catalogue(), action: input.action,
          permitted: d.inference?.permitted ?? [],
        });
        if (!offered.some((m) => m.id === input.model)) {
          ctx.fail("platform.invalid", { field: "model", reason: "not offered for this action here" });
        }
      }
      await upsertChoice(d.db, d.tenantId, input.action, { model_id: input.model ?? "" }, ctx.now() as Instant);
      return { action: input.action, model: input.model ?? "" };
    },
  });

  /*
    ⚠️ THE WORKSPACE'S OWN WORDS, AND ONLY THE USER HALF.

    The system text is the product's and is editable nowhere: it is what makes an
    action do what the product promises, and a workspace that could rewrite it
    could turn a nutrition assistant into anything at all with the product's name
    still on the answer. What a workspace legitimately wants is to say what it
    emphasises — a house style, a language, something to always mention — and
    that belongs in front of the prompt.

    ⚠️ IT IS MEASURED. `planAction` composes the preamble with the request and
    prices them together, so a long one costs what it costs. Appended after the
    reserve it would be a standing discount on every call, growing with how much
    somebody typed.
  */
  const phrase = operation({
    id: "ai.prompt.set",
    kind: "write",
    summary: "Say what this workspace wants mentioned, in front of every request to one action.",
    input: s.object({ action: s.text({ max: 60 }), prompt: s.text({ max: PROMPT_MAX }) }),
    output: s.object({ action: s.text(), prompt: s.text() }),
    permission: "workspace:settings",
    idempotency: { mode: "natural", key: "action" },
    audit: (i: { action: string }) => ({ subject: i.action, verb: "prompt" }),
    outcome: { message: "Saved", tone: "success", invalidates: ["ai.models.list"] },
    fails: ["platform.invalid"],
    async handler(ctx, input: { action: string; prompt: string }) {
      const d = deps(ctx);
      if (!app.ai!.actions[input.action]) ctx.fail("platform.invalid", { field: "action", reason: "not an action this product has" });
      await upsertChoice(d.db, d.tenantId, input.action, { prompt: input.prompt.trim() }, ctx.now() as Instant);
      return { action: input.action, prompt: input.prompt.trim() };
    },
  });

  return [spend, wrong, models, pick, phrase] as unknown as readonly AnyOperation[];
}
