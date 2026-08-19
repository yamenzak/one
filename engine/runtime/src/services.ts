/**
 * THE WORK THAT LEAVES THE REQUEST PATH (D3).
 *
 * DEFER(engine-27) stage:27 — `generate` IS THE ONLY CALL THAT REACHES A
 * PROVIDER, AND NOTHING CALLS IT. The operator can bind a model to an action and
 * a workspace can reword its prompt — `ai-actions.ts` is mounted and both are
 * live — but the run itself has no route, so an AI action resolves everything it
 * needs and then generates nothing. The metering chain hangs off this call too:
 * `reserve`, `settle` and `release` are reached from here and nowhere else, so
 * no reserve is ever taken and no credit ever spent. Stage 27 is the route.
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

import type { AppId, Channel, Instant, Lane, ModelRow, TenantId, Usage } from "@engine/kernel";
import { boundModel, chargedFor, plan as planRun, type Planned } from "@engine/kernel";
import { askModel, type Fetcher, type GatewayAt, type GatewayRefusal, type Answered } from "./gateway.js";
import { recordRun, type Priced, type Recording } from "./spend.js";
import { release, reserve, settle } from "./wallet.js";
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
  /** ⚠️ Which operation, so a statement can say what the credits went on. */
  readonly action: string;
  readonly lane: Lane;
  readonly system: string;
  readonly prompt: string;
  readonly maxOutput: number;
  /**
   * ⚠️ WHAT A LANE COUNTS WHEN IT IS NOT CHARACTERS — images, seconds of audio.
   * Absent, the density of the actual text decides, which is what `charsPerUnit`
   * used to be told by hand and therefore was not.
   */
  readonly units?: Usage;
  /**
   * ⚠️ THE MODEL FOR THIS RUN, IF ONE WAS CHOSEN (D19). Resolved by the caller
   * through `running`, because the same resolution decides the PROMPT — and a
   * run that resolved the model here while the prompt was resolved there is a
   * run whose reserve is computed from one thing and whose instructions are
   * another.
   */
  readonly model?: string | null;
}

export interface Generated {
  readonly text: string;
  readonly model: string;
  /** Whole credits actually taken off the balance by this run. */
  readonly charged: number;
  /** ⚠️ What it really cost them, which is finer than a credit — see `settle`. */
  readonly milli: number;
  /** The spend row, so a caller can point at it. */
  readonly runId: string;
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

export type AiRefusal =
  | "no_model" | "not_enough_credits" | "provider_failed" | "mock_in_production" | "no_key";

/**
 * ⚠️ WHAT A MODEL IS ASKED THROUGH. Injected rather than imported, because the
 * provider is the one thing that genuinely differs between a deployment with
 * keys and a deployment without — and everything else here should not have to
 * know which it is.
 *
 * ⚠️ AND IT REPORTS A REFUSAL RATHER THAN THROWING. A throw here loses the
 * reason: every failure becomes "provider_failed", so a missing key, a timeout
 * and a model that does not exist are one message an operator cannot act on.
 */
export interface Provider {
  run(model: ModelRow, planned: Planned, maxOutput: number): Promise<Answered | GatewayRefusal>;
}

/**
 * THE ONE PROVIDER, OVER THE GATEWAY.
 *
 * ⚠️ THE TAG IS WHAT MAKES THE MONEY CHECKABLE and it is attached here, once, so
 * no caller can forget it. Without it the gateway's own billing is a single
 * number for the deployment and cannot be compared against what any workspace
 * was charged — which is the only independent check this system has.
 */
export const gatewayProvider = (
  at: GatewayAt | null, tag: { readonly t: string; readonly a: string; readonly o: string },
  fetcher?: Fetcher,
): Provider => ({
  run: (model, planned, maxOutput) =>
    askModel(at, { model, system: planned.system, prompt: planned.prompt, maxOutput, tag },
      fetcher ?? fetch),
});

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

  const rate = {
    meter: model.meter, input: model.input, output: model.output, multiplier: model.multiplier,
  };
  const ceiling = Math.min(ask.maxOutput, model.maxOutput);
  const planned = planRun(`${ask.appId}.${ask.lane}`, ask.system, ask.prompt, rate, ceiling,
    { ...(ask.units ? { units: ask.units } : {}), ...(model.thinks ? { thinks: true } : {}) });

  const held = await reserve(deps.directory, ask.tenantId, planned.reserve.credits, planned.reserve.of);
  if (held === "not_enough") return "not_enough_credits";

  const record = (it: Omit<Recording, "tenantId" | "appId" | "action" | "model" | "lane" | "held">) =>
    recordRun(deps.directory, {
      tenantId: ask.tenantId, appId: ask.appId, action: ask.action,
      model: model.id, lane: ask.lane, held: held.credits, ...it,
    });

  /* ⚠️ A PROVIDER MAY REFUSE OR MAY THROW, AND BOTH RELEASE THE HOLD. The
     gateway reports its refusals so an operator can act on the reason; a mock
     outside development throws on purpose, and an unforeseen fault throws by
     accident. Handling only the first leaves the credits held on the second —
     a customer whose balance shrank and who got nothing. */
  const out = await deps.provider.run(model, planned, ceiling)
    .catch((why: unknown) => String(why instanceof Error ? why.message : why));

  /* ⚠️ AND A FAILURE STILL WRITES A ROW. A failure with no row is a button that
     did nothing and left no trace anybody in support can find. */
  if (typeof out === "string") {
    await release(deps.directory, ask.tenantId, held);
    await record({ chargedMilli: 0, source: "reserve", ok: false, detail: out });
    return out === "no_key" ? "no_key" : "provider_failed";
  }

  /*
    ⚠️ THREE PRICES, IN ORDER OF HOW MUCH THEY ARE WORTH BELIEVING.

    A CACHED answer never reached a provider, so it cost nothing and is charged
    nothing — a multiplier over a cost of zero is charging for a lookup.

    A USAGE report is the provider's own count, priced at the rate the reserve
    used, so the two can never disagree about what a token costs.

    NEITHER falls back to the reserve rather than to a recount: because of the
    cap, a recount can only ever charge less than the truth, so a guess is free
    money in exactly one direction.
  */
  const chargedMilli = out.cached ? 0
    : out.usage ? chargedFor(out.usage, rate)
      : null;
  const source: Priced = out.cached ? "cached" : out.usage ? "usage" : "reserve";

  const paid = await settle(deps.directory, ask.tenantId, held, chargedMilli, { appId: ask.appId });
  const runId = await record({
    chargedMilli: paid.milli, source,
    ...(out.usage ? { unitsIn: out.usage.input, unitsOut: out.usage.output } : {}),
    ...(out.logId ? { logId: out.logId } : {}),
    ok: true,
  });

  return { text: out.text, model: model.id, charged: paid.credits, milli: paid.milli, runId };
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
    return {
      text,
      usage: { input: Math.ceil(planned.prompt.length / 4), output: Math.min(40, maxOutput) },
      logId: null,
      cached: false,
    };
  },
});

/* ------------------------------------------------------------------ notify --- */

export interface Mailer {
  send(mail: MailInput): Promise<void>;
}

/**
 * ⚠️ THE NOTE CARRIES THE WORKSPACE, AND IT IS NOT BOOKKEEPING. A push
 * subscription belongs to the ORIGIN it was made at, and every workspace here
 * has its own — so which workspace a note is about decides which devices may
 * carry it, and a sender handed only an account would deliver one business's
 * notification wearing another's logo. See `push.ts`.
 */
export interface PushNote {
  readonly tenantId: string | null;
  readonly title: string;
  readonly link: string | null;
}

export interface Pusher {
  /**
   * ⚠️ WHETHER IT CAN SEND RIGHT NOW, ASKED RATHER THAN INFERRED FROM THE
   * BINDING. Push needs a keypair, the keypair is made from the operator console
   * while the worker is running, and a deployment that binds this lane before
   * one exists must not OFFER the channel — a switch that saves and delivers
   * nothing is worse than an absent one, because somebody then waits.
   *
   * ⚠️ AND ASKING IS WHY IT IS ASYNC. Answered from a constant it would be true
   * from boot, and the operator who generates a keypair would watch the console
   * report push as live while every isolate went on refusing it until the next
   * deploy.
   */
  live(): Promise<boolean>;
  push(accountId: string, note: PushNote): Promise<void>;
}

/**
 * ⚠️ WHAT IS WIRED IS THE WHOLE INPUT. This carried an `available` list beside
 * the two services and nothing read it — so a deployment could name a channel it
 * had nothing to send on, which is what the function below exists to make
 * impossible. A capability is what is BOUND, never what is claimed.
 */
export interface NotifyDeps {
  readonly mailer?: Mailer;
  readonly pusher?: Pusher;
}

/**
 * ⚠️ A CHANNEL THE DEPLOYMENT CANNOT DELIVER IS NOT OFFERED AND NOT ATTEMPTED.
 * A push switch on a deployment with no push keys is a control that does
 * nothing, and a send that throws into a swallowed catch is worse — it looks
 * delivered.
 */
export const availableChannels = async (deps: NotifyDeps): Promise<readonly Channel[]> => {
  const out: Channel[] = ["inbox"];
  if (deps.mailer) out.push("email");
  if (deps.pusher && await deps.pusher.live()) out.push("push");
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
