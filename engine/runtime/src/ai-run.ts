/**
 * THE SEAM AN OPERATION GENERATES THROUGH.
 *
 * ⚠️ THE HANDLER SUPPLIES VALUES AND NOTHING ELSE, WHICH IS THE WHOLE DESIGN
 * (D19). Which model, whose words, what it costs and what it is recorded as are
 * resolved here from three declarations — the app's action, the operator's
 * binding, the workspace's own choice — so a handler cannot name a model, cannot
 * skip the reserve, and cannot send a workspace instructions it never agreed to.
 *
 * ⚠️ AND THE PROMPT IS FILLED HERE RATHER THAN BY THE CALLER. A handler building
 * its own string is a handler that can send a variable the action never declared
 * — which does not fail, it renders `{coach}` into a model's instructions and
 * comes back subtly wrong with nobody the wiser.
 *
 * ⚠️ THE RESERVE IS COMPUTED FROM THE FILLED TEXT, not the template. A prompt
 * budgeted before its variables are substituted under-counts by exactly the size
 * of the values — which on a summarisation action is the whole document.
 */

import type { AppSpec, TenantId } from "@engine/kernel";
import { sayPrompt } from "@engine/kernel";
import { actionsOf, bindingsOf, running, switchedOff, wordingOf } from "./ai-actions.js";
import { modelsOf } from "./models.js";
import {
  generate, generateStream, type AiDeps, type AiRefusal, type StreamDeps,
} from "./services.js";
import type { Db } from "./sql.js";

/**
 * WHAT A GENERATION HANDS BACK TO THE HANDLER THAT ASKED FOR IT.
 *
 * ⚠️ THE BYTES REACH THE APP AND THE PLATFORM STORES NOTHING. A picture or a
 * spoken sentence is an ANSWER, and where an answer belongs is the app's
 * decision: a cover image goes in the media library under a purpose, a
 * one-off preview is thrown away unshown, a label is rendered and never kept.
 * Writing every generation to the bucket would bill storage for the ones nobody
 * keeps and put files in a library nobody asked to fill.
 *
 * ⚠️ SO A HANDLER THAT WANTS IT KEPT WRITES IT ITSELF, through `ctx.bucket` and
 * the media ledger like any other file — which is what makes it show up in the
 * storage meter, in the quota, and in erasure. A path that wrote to R2 from here
 * would be a second way objects arrive in a bucket, and `storage-chokepoint`
 * exists because the first one is the only one that is accounted for.
 *
 * ⚠️ AND `text` IS EMPTY RATHER THAN ABSENT FOR A LANE THAT ANSWERS IN BYTES, so
 * a caller reading it gets "" instead of `undefined` — the same shape every text
 * lane already returns.
 */
export interface Made {
  readonly text: string;
  /** ⚠️ An image or audio lane's answer, with the type it arrived as. */
  readonly bytes?: Uint8Array;
  readonly mime?: string;
  /** ⚠️ An embedding's answer: a vector, which is neither words nor bytes. */
  readonly vector?: readonly number[];
  readonly credits: number;
}

export interface RunAt {
  readonly directory: Db;
  readonly db: Db;
  readonly tenantId: TenantId;
  readonly app: AppSpec;
  readonly operation: string;
  /** ⚠️ How a model is actually asked — injected, so a test drives it. */
  readonly provider: AiDeps["provider"];
  readonly environment: string;
}

/**
 * ⚠️ ABSENT FOR AN OPERATION THAT DECLARED NO ACTION, and that is the refusal
 * rather than an oversight: an operation generating text it never said it would
 * puts a cost on a bill against an action nobody can find.
 */
export function generatorFor(at: RunAt): ((
  values: Readonly<Record<string, string>>,
  /**
   * ⚠️ PICTURES, SEPARATE FROM THE VALUES, AND THE SPLIT IS THE POINT. Values
   * fill declared `{placeholders}`; an image is not a placeholder and folding it
   * in would put a megabyte of base64 into the prompt text — where the reserve
   * would count it as characters, at the wrong rate, in the wrong direction.
   *
   * ⚠️ AND A LIST, BECAUSE SEVERAL PHOTOGRAPHS OF ONE THING ARE ONE QUESTION.
   * The front, the back and the cap identify a product that no one of them
   * does; a seam carrying one would make an app ask three times and pay three
   * reserves for an answer it has to reconcile itself.
   */
  look?: { readonly images?: readonly string[] },
) => Promise<Made | AiRefusal>) | undefined {
  const action = actionsOf(at.app).find((a) => a.id === at.operation);
  if (!action) return undefined;

  return async (values, look) => {
    /*
      ⚠️ THE SWITCH IS ASKED HERE, WHICH IS THE ONLY PLACE IT CANNOT BE SKIPPED
      (D81). A screen that merely hides the button leaves the operation answering
      on the HTTP door, through MCP, and to a queued write replaying after a day
      offline — so the workspace's decision would hold in the one place nobody
      was trying to get around and nowhere else.

      ⚠️ AND IT REFUSES RATHER THAN BEING ABSENT, unlike an operation that
      declared no action at all. Absence says "this does not generate"; what is
      true here is "this generates and your workspace turned it off", and only
      the second sends somebody to the control that changes it.

      ⚠️ ASKED BEFORE THE RESERVE, so nothing is held for a call that will not
      happen.
    */
    if (action.ai.optional
      && (await switchedOff(at.db, at.tenantId, at.app.id)).has(action.id)) {
      return "switched_off";
    }

    const rows = await modelsOf(at.directory);
    const bound = (await bindingsOf(at.directory, at.app.id)).find((b) => b.action === action.id);
    const theirs = await wordingOf(at.db, at.tenantId, at.app.id);

    /* ⚠️ ONE RESOLUTION FOR THE MODEL AND THE WORDS TOGETHER — the same call
       every screen reads, so what runs and what is reported cannot differ. */
    const now = running(action.ai, rows, bound, theirs[action.id], theirs[`${action.id}:model`]);

    const out = await generate({
      directory: at.directory,
      models: async () => rows,
      provider: at.provider,
      environment: at.environment,
    }, {
      tenantId: at.tenantId,
      appId: at.app.id as never,
      action: action.id,
      lane: action.ai.lane,
      system: now.prompt,
      /* ⚠️ FILLED HERE, FROM THE DECLARED VARIABLES ONLY. An unsupplied one
         resolves to the empty string rather than to a literal brace — a brace
         reaching a model is an instruction nobody wrote. */
      prompt: sayPrompt(placeholders(action.ai.variables), values),
      maxOutput: action.ai.maxOutput,
      ...(look?.images?.length ? { images: look.images } : {}),
    });

    if (typeof out === "string") return out;
    /* ⚠️ EVERYTHING THE RUN PRODUCED, NOT JUST THE WORDS. Dropped here, an image
       or a spoken sentence runs, holds, charges and settles correctly and the
       handler receives an empty string — billed and useless, with every meter
       reading healthy. That is the same defect the gateway seam had one layer
       down, and carrying it only that far is how it survived. */
    return {
      text: out.text,
      ...(out.bytes ? { bytes: out.bytes } : {}),
      ...(out.mime ? { mime: out.mime } : {}),
      ...(out.vector ? { vector: out.vector } : {}),
      credits: out.charged,
    };
  };
}

/**
 * THE SAME SEAM, HANDING THE WORDS OVER AS THEY ARRIVE.
 *
 * ⚠️ IT RESOLVES THROUGH THE SAME `running` CALL, so what a streamed run costs,
 * which model answers it and whose words it uses cannot differ from the
 * non-streamed one. Two resolutions is how a screen comes to promise a model
 * that a stream does not use.
 *
 * ⚠️ AND IT ANSWERS WITH A RESPONSE, WHICH `performOperation` ALREADY ALLOWS.
 * The gates, the replay and the audit all run BEFORE the first token — which is
 * the honest place for them: what the audit records is that the run was started
 * and by whom, because whether it finished is not known when the response is
 * handed back.
 */
export function streamerFor(at: StreamAt): ((
  values: Readonly<Record<string, string>>,
  look?: { readonly images?: readonly string[] },
) => Promise<Response | AiRefusal>) | undefined {
  const action = actionsOf(at.app).find((a) => a.id === at.operation);
  if (!action) return undefined;

  return async (values, look) => {
    /*
      ⚠️ THE SWITCH IS ASKED HERE, WHICH IS THE ONLY PLACE IT CANNOT BE SKIPPED
      (D81). A screen that merely hides the button leaves the operation answering
      on the HTTP door, through MCP, and to a queued write replaying after a day
      offline — so the workspace's decision would hold in the one place nobody
      was trying to get around and nowhere else.

      ⚠️ AND IT REFUSES RATHER THAN BEING ABSENT, unlike an operation that
      declared no action at all. Absence says "this does not generate"; what is
      true here is "this generates and your workspace turned it off", and only
      the second sends somebody to the control that changes it.

      ⚠️ ASKED BEFORE THE RESERVE, so nothing is held for a call that will not
      happen.
    */
    if (action.ai.optional
      && (await switchedOff(at.db, at.tenantId, at.app.id)).has(action.id)) {
      return "switched_off";
    }

    const rows = await modelsOf(at.directory);
    const bound = (await bindingsOf(at.directory, at.app.id)).find((b) => b.action === action.id);
    const theirs = await wordingOf(at.db, at.tenantId, at.app.id);
    const now = running(action.ai, rows, bound, theirs[action.id], theirs[`${action.id}:model`]);

    const out = await generateStream({
      directory: at.directory,
      models: async () => rows,
      provider: at.provider,
      streamer: at.streamer,
      environment: at.environment,
    }, {
      tenantId: at.tenantId,
      appId: at.app.id as never,
      action: action.id,
      lane: action.ai.lane,
      system: now.prompt,
      prompt: sayPrompt(placeholders(action.ai.variables), values),
      maxOutput: action.ai.maxOutput,
      ...(look?.images?.length ? { images: look.images } : {}),
    });

    if (typeof out === "string") return out;
    return new Response(out.body, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        /* ⚠️ NOTHING MAY CACHE A METERED STREAM. A cached one is an answer served
           to a second workspace that paid for it and a first that will not see
           its own; `no-store` is the only correct value on a body that costs
           somebody money to produce. */
        "cache-control": "no-store",
      },
    });
  };
}

export interface StreamAt extends RunAt {
  /** ⚠️ How a model is streamed — injected beside the provider, so a test drives it. */
  readonly streamer: StreamDeps["streamer"];
}

/**
 * ⚠️ THE VARIABLES ARE THE USER MESSAGE, AND THE LETTERHEAD IS THE SYSTEM ONE.
 * What the action declares is the instruction; what the caller supplies is the
 * material. Putting the values into the system text would make every run's
 * instructions different and the reserve's system half meaningless.
 */
const placeholders = (variables: readonly string[]): string =>
  variables.map((v) => `${v}: {${v}}`).join("\n");
