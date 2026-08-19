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
import { actionsOf, bindingsOf, running, wordingOf } from "./ai-actions.js";
import { modelsOf } from "./models.js";
import {
  generate, generateStream, type AiDeps, type AiRefusal, type StreamDeps,
} from "./services.js";
import type { Db } from "./sql.js";

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
) => Promise<{ readonly text: string; readonly credits: number } | AiRefusal>) | undefined {
  const action = actionsOf(at.app).find((a) => a.id === at.operation);
  if (!action) return undefined;

  return async (values) => {
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
    });

    if (typeof out === "string") return out;
    return { text: out.text, credits: out.charged };
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
) => Promise<Response | AiRefusal>) | undefined {
  const action = actionsOf(at.app).find((a) => a.id === at.operation);
  if (!action) return undefined;

  return async (values) => {
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
