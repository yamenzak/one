/**
 * WHAT A WORKSPACE MAY CHOOSE, AND WHAT IT WILL COST THEM.
 *
 * ⚠️ THE PRICE TRAVELS AND THE MARGIN DOES NOT. A workspace picking its own
 * model is safe because every run is charged to its own wallet at the row's own
 * multiplier — so they are choosing what THEY pay. What they are shown is the
 * product of cost and multiplier, which reveals neither; sending both would put
 * the margin on a screen anybody in the workspace can open.
 *
 * ⚠️ AND THE INSTRUCTIONS STAY HERE. A workspace adds to what an action already
 * says; it never replaces it, and it is never sent the base. That is what makes
 * the box start empty instead of seeded with our own text — see `composePrompt`.
 *
 * ⚠️ THE OPERATOR'S BINDING IS THE DEFAULT, NOT THE CEILING. Choosing nothing is
 * the ordinary case and it resolves to whatever the deployment picked, which is
 * why an empty choice is stored as an absence rather than as a copy of it.
 */

import type { AppSpec, TenantId } from "@engine/kernel";
import { MAX_ADDENDUM, offeredIn, priceFor, refusePrompt } from "@engine/kernel";
import { actionsOf, bindingsOf, running, word, wordingOf } from "./ai-actions.js";
import { modelsOf } from "./models.js";
import type { PlatformCtx } from "./member-ops.js";
import type { Resolved } from "./compose.js";

/**
 * ⚠️ `ai:manage`, WHICH IS A MANAGER'S. Choosing a dearer model spends the
 * workspace's credits faster, and rewording what a model is told changes what
 * every person in the workspace gets back — neither is a thing a reader does.
 */
const NEEDS = "ai:manage";

export function aiOps(app: AppSpec): Readonly<Record<string, Resolved>> {
  /* ⚠️ NO ACTIONS, NO OPERATIONS. A product with nothing generating gets no
     screen rather than an empty one — see `refuseCatalogue`'s own rule about
     lanes nothing asks for. */
  if (!actionsOf(app).length) return {};

  const mine: Resolved = {
    id: `${app.id}.ai.mine`,
    kind: "read",
    method: "GET",
    path: `/api/${app.id}.ai.mine`,
    permission: NEEDS,
    spec: {
      id: `${app.id}.ai.mine`, kind: "read",
      summary: "Which model each action runs on here, and what it costs you.",
      input: {}, output: {},
      permission: NEEDS,
      idempotency: { mode: "none" },
      async handler() { return {} as never; },
    } as Resolved["spec"],
    run: async (bare) => {
      const ctx = bare as PlatformCtx;
      const rows = await modelsOf(ctx.directory);
      const bound = await bindingsOf(ctx.directory, app.id);
      const theirs = await wordingOf(ctx.db, ctx.tenantId as TenantId, app.id);

      return {
        actions: actionsOf(app).map((action) => {
          const binding = bound.find((b) => b.action === action.id);
          const chosen = theirs[`${action.id}:model`] ?? null;
          const now = running(action.ai, rows, binding, theirs[action.id], chosen);
          return {
            id: action.id,
            summary: action.summary,
            lane: action.ai.lane,
            /* ⚠️ WHETHER THEY MAY ADD TO IT AT ALL, from the app's declaration.
               A box that saves and is then ignored is worse than no box. */
            brandable: action.ai.brandable === true,
            /* ⚠️ THEIR OWN WORDS, WHICH ARE THEIRS TO READ BACK. Ours are not
               here, and `wordedBy` is all a screen needs to say whose they are. */
            addendum: now.addendum,
            wordedBy: now.wordedBy,
            variables: action.ai.variables,
            /* ⚠️ What is running: theirs if they picked one, the deployment's
               otherwise, resolved by the one function the run itself uses. */
            model: now.model ? priceFor(now.model, action.ai.lane) : null,
            chosen,
            /* ⚠️ Priced AFTER the multiplier — see the header. */
            choices: offeredIn(rows, action.ai.lane).map((m) => priceFor(m, action.ai.lane)),
          };
        }),
        limit: MAX_ADDENDUM,
      };
    },
  };

  const choose: Resolved = {
    id: `${app.id}.ai.choose`,
    kind: "write",
    method: "POST",
    path: `/api/${app.id}.ai.choose`,
    permission: NEEDS,
    spec: {
      id: `${app.id}.ai.choose`, kind: "write",
      summary: "Pick the model an action runs on, or add your own instructions.",
      input: {}, output: {},
      permission: NEEDS,
      idempotency: { mode: "none" },
      async handler() { return {} as never; },
    } as Resolved["spec"],
    run: async (bare, input) => {
      const ctx = bare as PlatformCtx;
      const actionId = String(input.action ?? "");
      const action = actionsOf(app).find((a) => a.id === actionId);
      if (!action) return ctx.fail("platform.not_found");

      if (input.model !== undefined) {
        const wanted = input.model === null ? null : String(input.model);
        /*
          ⚠️ ONLY A ROW THIS LANE OFFERS. A model id from a request body is a
          model the caller chose — so an id naming a row that is retired,
          disabled, or in another lane entirely is refused rather than stored
          and silently ignored by `boundModel` at run time.
        */
        if (wanted !== null) {
          const rows = await modelsOf(ctx.directory);
          if (!offeredIn(rows, action.ai.lane).some((m) => m.id === wanted)) {
            return ctx.fail("platform.invalid", {}, { fields: {
              model: "That model does not answer this kind of work here.",
            } });
          }
        }
        /* ⚠️ Stored beside the wording, keyed apart — one row per workspace per
           action per thing, so clearing a choice cannot clear the words. */
        await word(ctx.db, ctx.tenantId as TenantId, app.id, `${actionId}:model`, wanted, new Date(ctx.now));
      }

      if (input.addendum !== undefined) {
        const text = input.addendum === null ? null : String(input.addendum);
        if (text !== null) {
          /*
            ⚠️ THE KERNEL DECIDES, NOT THIS HANDLER. `brandable`, the length and
            the variables are one rule asked in one place — a second copy here is
            a second answer the day the first one changes.
          */
          const wrong = refusePrompt(action.ai, text, "tenant");
          if (wrong.length) {
            return ctx.fail("platform.invalid", {}, { fields: { addendum: said(wrong[0]!) } });
          }
        }
        await word(ctx.db, ctx.tenantId as TenantId, app.id, actionId, text, new Date(ctx.now));
      }

      return { ok: true };
    },
  };

  return { [mine.id]: mine, [choose.id]: choose };
}

/**
 * ⚠️ IN WORDS, BESIDE THE SET. A refusal code on a form is the code the branch
 * uses, shown to somebody who has to work out what to type instead.
 */
const said = (why: string): string =>
  why === "not_theirs" ? "This action's instructions are not editable."
    : why === "empty" ? "Write something, or clear it to go back to ours."
      : why === "too_long" ? `Keep it under ${MAX_ADDENDUM} characters.`
        : "Use only the placeholders this action offers.";
