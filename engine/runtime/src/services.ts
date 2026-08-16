/**
 * THE WORK THAT LEAVES THE REQUEST PATH (D3).
 *
 * ⚠️ ONE WORKER ANSWERS REQUESTS; THE HEAVY THINGS ARE BOUND TO IT. Generation
 * and delivery both bring weight the request path should not pay for — a model
 * catalogue, provider clients, MIME, push encryption — and none of it belongs in
 * the startup CPU budget of a request that is fetching a list of notes.
 *
 * ⚠️ AND THE SEAM IS TYPED, WHICH IS THE WHOLE REASON IT IS RPC AND NOT `fetch`.
 * A service called over HTTP takes a payload nobody checks: rename a field on
 * one side and the other keeps sending the old one, so a wrong payload becomes a
 * production error where it had been a compile error. A `WorkerEntrypoint`
 * method is a function signature both sides share.
 *
 * ⚠️ THE MOCK LANE IS GATED ON THE ENVIRONMENT, STRUCTURALLY. A mock that can be
 * switched on from a console fabricates output in production — including numbers
 * somebody will act on — and bills for it. A previous platform shipped three
 * such paths, all of which typechecked and passed every test, because the suites
 * run where mocking is correct.
 */

import type { AppId, Channel, Instant, Lane, ModelRow, TenantId } from "@engine/kernel";
import { boundModel, plan as planRun, type Planned } from "@engine/kernel";
import { release, reserve, settle } from "./credits.js";
import type { Db } from "./sql.js";

/* ---------------------------------------------------------------- the seam --- */

/**
 * ⚠️ THE CONTRACT IS AN INTERFACE, AND BOTH SIDES IMPORT IT. The caller holds a
 * `Service<Ai>` and the entrypoint implements it; a method renamed on one side
 * fails to compile on the other, which is the property `fetch` cannot have.
 */
export interface AiService {
  generate(ask: Ask): Promise<Generated>;
}

export interface NotifyService {
  tell(dispatch: TellInput): Promise<{ readonly told: number }>;
  send(mail: MailInput): Promise<{ readonly sent: boolean }>;
}

export interface Ask {
  readonly tenantId: TenantId;
  readonly appId: AppId;
  readonly lane: Lane;
  readonly system: string;
  readonly prompt: string;
  readonly maxOutput: number;
  /** ⚠️ Arabic runs nearer two characters per token; English nearer four. */
  readonly charsPerUnit?: number;
  /**
   * ⚠️ THE OPERATOR'S BINDING FOR THIS ACTION, IF THERE IS ONE (D19). Resolved
   * by the caller through `running`, because the binding also decides the
   * PROMPT — and a run that resolved the model here while the prompt was
   * resolved there is a run whose reserve is computed from one thing and whose
   * instructions are another.
   */
  readonly model?: string | null;
}

export interface Generated {
  readonly text: string;
  readonly model: string;
  readonly charged: number;
}

export interface TellInput {
  readonly tenantId: TenantId;
  readonly type: string;
  readonly values: Readonly<Record<string, string>>;
  readonly except?: string | null;
}

export interface MailInput {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

/* ------------------------------------------------------------------- lanes --- */

export type AiRefusal = "no_model" | "not_enough_credits" | "provider_failed" | "mock_in_production";

/**
 * ⚠️ WHAT A MODEL IS ASKED THROUGH. Injected rather than imported, because the
 * provider is the one thing that genuinely differs between a deployment with
 * keys and a deployment without — and everything else here should not have to
 * know which it is.
 */
export interface Provider {
  run(model: ModelRow, planned: Planned, maxOutput: number): Promise<{
    readonly text: string;
    readonly usage: { readonly input: number; readonly output: number } | null;
  }>;
}

export interface AiDeps {
  readonly directory: Db;
  readonly models: () => Promise<readonly ModelRow[]>;
  readonly provider: Provider;
  /**
   * ⚠️ THE ONE THING THAT DECIDES WHETHER A MOCK MAY RUN. Read from the
   * environment, never from configuration — a switch an operator can press is a
   * switch that gets pressed in production, and the output is fabricated and
   * billed.
   */
  readonly environment: string;
}

export const MOCK_ALLOWED = (environment: string): boolean => environment === "development";

/**
 * Generate something, and charge for it correctly.
 *
 * ⚠️ RESERVE → RUN → SETTLE, IN THAT ORDER, WITH THE RESERVE COMPUTED FROM THE
 * SAME TEXT THAT IS SENT. `planRun` returns the prompt and the reserve together
 * so a caller cannot budget for one text and send another — a previous platform
 * fixed the four under-counts as separate functions and a later edit restored
 * the defect with every test green, which is what the defect WAS.
 *
 * ⚠️ AND A FAILURE RELEASES THE HOLD. A provider that times out with the credits
 * still held is a customer whose balance shrank and who got nothing.
 */
export async function generate(deps: AiDeps, ask: Ask): Promise<Generated | AiRefusal> {
  const rows = await deps.models();
  /* ⚠️ The bound row when it still resolves, the lane's election otherwise —
     one function, so a retired model degrades rather than fails (D19). */
  const model = boundModel(rows, ask.lane, ask.model);
  if (!model) return "no_model";

  const rate = { input: model.input, output: model.output, markup: model.markup };
  const planned = planRun(`${ask.appId}.${ask.lane}`, ask.system, ask.prompt, rate,
    Math.min(ask.maxOutput, model.maxOutput),
    { charsPerUnit: ask.charsPerUnit, thinks: model.thinks });

  const held = await reserve(deps.directory, ask.tenantId, planned.reserve.credits, planned.reserve.of);
  if (held === "not_enough") return "not_enough_credits";

  try {
    const out = await deps.provider.run(model, planned, Math.min(ask.maxOutput, model.maxOutput));
    /* ⚠️ A missing usage report falls back to the RESERVE, never to a recount —
       the cap means a recount can only ever charge less than the truth. */
    const actual = out.usage
      ? Math.ceil(((out.usage.input / 1000) * rate.input + (out.usage.output / 1000) * rate.output)
        * (1 + rate.markup))
      : null;
    const charged = await settle(deps.directory, ask.tenantId, held, actual, { appId: ask.appId });
    return { text: out.text, model: model.id, charged };
  } catch {
    await release(deps.directory, ask.tenantId, held);
    return "provider_failed";
  }
}

/**
 * ⚠️ THE MOCK IS A PROVIDER LIKE ANY OTHER AND REFUSES OUTSIDE DEVELOPMENT. Made
 * a provider rather than a branch inside `generate` so there is exactly one
 * place the decision is made, and so a deployment that wires it by mistake fails
 * loudly on the first call rather than quietly on every call.
 */
export const mockProvider = (environment: string): Provider => ({
  async run(model, planned, maxOutput) {
    if (!MOCK_ALLOWED(environment)) {
      throw new Error("the mock provider is development-only and this is not development");
    }
    const text = `[mock ${model.id}] ${planned.prompt.slice(0, 120)}`;
    return { text, usage: { input: planned.prompt.length / 4, output: Math.min(40, maxOutput) } };
  },
});

/* ------------------------------------------------------------------ notify --- */

export interface Mailer {
  send(mail: MailInput): Promise<void>;
}

export interface Pusher {
  push(accountId: string, note: { title: string; link: string | null }): Promise<void>;
}

export interface NotifyDeps {
  readonly available: readonly Channel[];
  readonly mailer?: Mailer;
  readonly pusher?: Pusher;
}

/**
 * ⚠️ A CHANNEL THE DEPLOYMENT CANNOT DELIVER IS NOT OFFERED AND NOT ATTEMPTED.
 * A push switch on a deployment with no push keys is a control that does
 * nothing, and a send that throws into a swallowed catch is worse — it looks
 * delivered.
 */
export const availableChannels = (deps: NotifyDeps): readonly Channel[] => {
  const out: Channel[] = ["inbox"];
  if (deps.mailer) out.push("email");
  if (deps.pusher) out.push("push");
  return out;
};

/* ------------------------------------------------------------------ rules --- */

/**
 * ⚠️ A SERVICE THAT IS BOUND BUT NEVER CALLED IS THE SHAPE THIS FRAMEWORK KEEPS
 * FINDING. Reported rather than thrown, because a deployment legitimately runs
 * without an AI provider — what it must not do is run with one bound and
 * nothing reaching it.
 */
export const boundButUnused = (
  bindings: Readonly<Record<string, unknown>>, used: readonly string[],
): readonly string[] =>
  Object.keys(bindings).filter((name) => /^(AI|NOTIFY)$/.test(name) && !used.includes(name));

export type { Planned, Instant };
