/**
 * THE WORK THAT LEAVES THE REQUEST PATH (D3).
 *
 * ⚠️ `generate` IS THE ONLY CALL THAT REACHES A PROVIDER, and every bound on the
 * money is inside it — the reserve, the release, the charge and the row. An
 * operation reaches it through `ctx.generate`, which the platform supplies only
 * for an operation that DECLARED an action: a handler cannot name a model,
 * cannot skip the hold, and cannot generate something its manifest never said
 * it would. `scripts/metering.test.mjs` is what keeps that structural.
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
import {
  askLane, askModel, askModelStream,
  type Answered, type Fetcher, type GatewayAt, type GatewayRefusal, type Streamed,
} from "./gateway.js";
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
   * ⚠️ PICTURES TO LOOK AT, AS `data:` URLs. They are what the vision lane is
   * FOR, and each is larger than every other input a request carries — so the
   * reserve counts ALL of them (`TOKENS_PER_IMAGE` × the length) rather than
   * budgeting for the sentence wrapped around them.
   */
  readonly images?: readonly string[];
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
  /**
   * ⚠️ WHAT A LANE THAT DOES NOT ANSWER IN WORDS PRODUCED (D79), CARRIED ALL THE
   * WAY OUT. Dropped here, an image or a spoken sentence would run, hold, charge
   * and settle correctly — and return an empty string. The whole lane would be
   * billed and useless with every meter reading healthy, which is the exact
   * shape stage 87 exists to close.
   */
  readonly bytes?: Uint8Array;
  readonly mime?: string;
  readonly vector?: readonly number[];
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
  /** ⚠️ Where a reply goes, which is not where the letter came from — see `Letter`. */
  readonly replyTo?: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

/* ------------------------------------------------------------------- lanes --- */

export type AiRefusal =
  | "no_model" | "not_enough_credits" | "provider_failed" | "mock_in_production" | "no_key"
  /* ⚠️ ITS OWN REASON, because "provider_failed" would send an operator looking
     at a provider that is working. This is a model whose vendor we have no route
     to FOR THIS LANE — a decision of ours, fixed by a dialect rather than by a
     key — and the header above is explicit that one message for every failure is
     the thing this union exists to avoid. */
  | "no_route";

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
  /**
   * ⚠️ THE PICTURES ARE A PARAMETER RATHER THAN PART OF `Planned`, because
   * `Planned` is the words and what they were budgeted at. An image folded in
   * there would travel through the reserve arithmetic as text, which is exactly
   * the count it is not.
   *
   * ⚠️ AND THE LANE IS A PARAMETER BECAUSE THE ENDPOINT DEPENDS ON IT (D79).
   * `/compat` is chat completions and nothing else, so an embedding, a picture
   * and a spoken sentence each reach the provider's own path through the
   * gateway's passthrough. What does NOT change is everything around the call:
   * same headers, same tag, same custom cost, same reserve → settle.
   */
  run(
    model: ModelRow, planned: Planned, maxOutput: number, images?: readonly string[],
    lane?: Lane,
  ): Promise<Answered | GatewayRefusal | "no_route">;
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
  run: (model, planned, maxOutput, images, lane) => {
    const ask = {
      model, system: planned.system, prompt: planned.prompt, maxOutput, tag,
      ...(images?.length ? { images } : {}),
    };
    /* ⚠️ TEXT AND VISION ARE A CONVERSATION AND KEEP `/compat`, which is one
       client for fourteen providers and works. Moving them onto the passthrough
       would be a rewrite bought with nothing. */
    return lane && lane !== "text" && lane !== "vision"
      ? askLane(at, lane, ask, fetcher ?? fetch)
      : askModel(at, ask, fetcher ?? fetch);
  },
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
    {
      ...(ask.units ? { units: ask.units } : {}),
      ...(model.thinks ? { thinks: true } : {}),
      /* ⚠️ EVERY PICTURE IS IN THE RESERVE, and each is larger than the whole
         sentence around them. Budgeting for the words and not for them is a
         hold that covers a fraction of the call — which `settle`'s cap then
         turns into tokens the platform pays for and the workspace does not.
         ⚠️ AND IT IS THE COUNT, NOT WHETHER THERE ARE ANY. `images: 1` for six
         photographs is the same under-count wearing a plural seam's clothes:
         five sixths of the largest input in the request, unbudgeted, on a call
         that cannot report it. */
      ...(ask.images?.length ? { images: ask.images.length } : {}),
    });

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
  const out = await deps.provider.run(model, planned, ceiling, ask.images, ask.lane)
    .catch((why: unknown) => String(why instanceof Error ? why.message : why));

  /* ⚠️ AND A FAILURE STILL WRITES A ROW. A failure with no row is a button that
     did nothing and left no trace anybody in support can find. */
  if (typeof out === "string") {
    await release(deps.directory, ask.tenantId, held);
    await record({ chargedMilli: 0, source: "reserve", ok: false, detail: out });
    return out === "no_key" ? "no_key" : out === "no_route" ? "no_route" : "provider_failed";
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

  return {
    text: out.text,
    ...(out.bytes ? { bytes: out.bytes } : {}),
    ...(out.mime ? { mime: out.mime } : {}),
    ...(out.vector ? { vector: out.vector } : {}),
    model: model.id, charged: paid.credits, milli: paid.milli, runId,
  };
}

/* ------------------------------------------------------------------ stream --- */

/**
 * ⚠️ THE SAME FOUR BOUNDS, IN THE SAME FILE, AND THAT IS THE WHOLE POINT OF
 * PUTTING IT HERE. A streaming path built beside the metered one is a second
 * place that has to remember the hold, the release, the charge and the row — and
 * the failure is not a bug report, it is a lane that generates perfectly good
 * output and bills nobody. `scripts/metering.test.mjs` asks both functions the
 * same questions for exactly that reason.
 *
 * ⚠️ THE CHARGE HAPPENS AT THE LAST TOKEN, NOT AT THE FIRST. The response is
 * handed back while the run is still going, so the settle rides the END of the
 * stream — which is where the usage arrives — rather than the return of this
 * function.
 */
export interface Streamer {
  /** ⚠️ Pictures, like `Provider.run` — the same reason, the same shape. */
  runStream(
    model: ModelRow, planned: Planned, maxOutput: number, images?: readonly string[],
  ): Promise<Streamed | GatewayRefusal>;
}

/** ⚠️ Built here for the same reason `gatewayProvider` is: the tag, once. */
export const gatewayStreamer = (
  at: GatewayAt | null, tag: { readonly t: string; readonly a: string; readonly o: string },
  fetcher?: Fetcher,
): Streamer => ({
  runStream: (model, planned, maxOutput, images) =>
    askModelStream(at, {
      model, system: planned.system, prompt: planned.prompt, maxOutput, tag,
      ...(images?.length ? { images } : {}),
    },
      fetcher ?? fetch),
});

export interface StreamDeps extends AiDeps {
  readonly streamer: Streamer;
}

/**
 * GENERATE, AND HAND THE WORDS OVER AS THEY ARRIVE.
 *
 * ⚠️ A CANCELLED STREAM SETTLES AT THE RESERVE AND IS LEFT OPEN FOR THE TRUE-UP.
 * Somebody closing the tab half way through leaves us with an unknown amount
 * generated and no usage report — and the two obvious answers are both wrong:
 * charging nothing is free generation for anybody who cancels, and counting the
 * characters we saw is an estimate, which under the settle cap can only ever
 * lose money. So it charges what was held, records the log id, and the nightly
 * check against the gateway's own bill corrects it DOWNWARD. Erring high on a
 * number that is later replaced by the truth costs the customer nothing.
 */
export async function generateStream(
  deps: StreamDeps, ask: Ask,
): Promise<{ readonly body: ReadableStream<Uint8Array>; readonly model: string } | AiRefusal> {
  const rows = await deps.models();
  const model = boundModel(rows, ask.lane, ask.model);
  if (!model) return "no_model";

  const rate = {
    meter: model.meter, input: model.input, output: model.output, multiplier: model.multiplier,
  };
  const ceiling = Math.min(ask.maxOutput, model.maxOutput);
  const planned = planRun(`${ask.appId}.${ask.lane}`, ask.system, ask.prompt, rate, ceiling,
    {
      ...(ask.units ? { units: ask.units } : {}),
      ...(model.thinks ? { thinks: true } : {}),
      /* ⚠️ EVERY PICTURE IS IN THE RESERVE, and each is larger than the whole
         sentence around them. Budgeting for the words and not for them is a
         hold that covers a fraction of the call — which `settle`'s cap then
         turns into tokens the platform pays for and the workspace does not.
         ⚠️ AND IT IS THE COUNT, NOT WHETHER THERE ARE ANY. `images: 1` for six
         photographs is the same under-count wearing a plural seam's clothes:
         five sixths of the largest input in the request, unbudgeted, on a call
         that cannot report it. */
      ...(ask.images?.length ? { images: ask.images.length } : {}),
    });

  const held = await reserve(deps.directory, ask.tenantId, planned.reserve.credits, planned.reserve.of);
  if (held === "not_enough") return "not_enough_credits";

  const record = (it: Omit<Recording, "tenantId" | "appId" | "action" | "model" | "lane" | "held">) =>
    recordRun(deps.directory, {
      tenantId: ask.tenantId, appId: ask.appId, action: ask.action,
      model: model.id, lane: ask.lane, held: held.credits, ...it,
    });

  const out = await deps.streamer.runStream(model, planned, ceiling, ask.images)
    .catch((why: unknown) => String(why instanceof Error ? why.message : why));

  /* ⚠️ A REFUSAL BEFORE THE FIRST TOKEN RELEASES AND STILL RECORDS — the same
     two things `generate` does, for the same two reasons. */
  if (typeof out === "string") {
    await release(deps.directory, ask.tenantId, held);
    await record({ chargedMilli: 0, source: "reserve", ok: false, detail: out });
    return out === "no_key" ? "no_key" : "provider_failed";
  }

  const encoder = new TextEncoder();
  let settled = false;
  /*
    ⚠️ SETTLED ONCE, WHATEVER HAPPENS TO THE STREAM. `flush` and `cancel` can
    both run for one stream in some orders; charging twice for one generation is
    the one failure here a customer would notice immediately and never forgive.
  */
  const finish = async (usage: Usage | null): Promise<number> => {
    if (settled) return 0;
    settled = true;
    const chargedMilli = usage ? chargedFor(usage, rate) : null;
    const paid = await settle(deps.directory, ask.tenantId, held, chargedMilli, { appId: ask.appId });
    await record({
      chargedMilli: paid.milli,
      source: usage ? "usage" : "reserve",
      ...(usage ? { unitsIn: usage.input, unitsOut: usage.output } : {}),
      ...(out.logId ? { logId: out.logId } : {}),
      ok: true,
    });
    return paid.credits;
  };

  const reader = out.parts.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) { controller.close(); return; }
      if ("text" in value) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: value.text })}\n\n`));
        return;
      }
      /* ⚠️ THE LAST THING ON THE WIRE IS WHAT IT COST, which is a fact the page
         needs: a balance that moved with nothing saying by how much is the
         question this whole ledger exists to answer. */
      const credits = await finish(value.end.usage);
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, credits })}\n\n`));
      controller.close();
    },
    async cancel() {
      /* ⚠️ SOMEBODY CLOSED THE TAB. See the header: the reserve is charged and
         the row is left open, so the nightly check corrects it downward against
         what the gateway says it really cost. */
      await reader.cancel().catch(() => undefined);
      await finish(null);
    },
  });

  return { body, model: model.id };
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
  /**
   * ⚠️ WHETHER IT CAN SEND RIGHT NOW, ASKED RATHER THAN INFERRED FROM THE
   * BINDING — the same question `Pusher` answers, for the same reason. A
   * deployment can have the binding and have mail switched OFF in its config, or
   * have no sender address configured; offering the switch in that state is a
   * control that does nothing, and a send that throws into a swallowed catch is
   * worse, because it looks delivered.
   *
   * ⚠️ ABSENT MEANS YES. A harness that hands a mailer wants it used, and making
   * every test implement a predicate would be ceremony for one bit.
   */
  live?(): Promise<boolean>;
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
  if (deps.mailer && (await deps.mailer.live?.() ?? true)) out.push("email");
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
