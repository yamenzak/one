/**
 * THE ONE DOOR OUT TO A MODEL, AND THE ONE PLACE A RUN'S COST COMES FROM.
 *
 * ⚠️ ONE ENDPOINT FOR EVERY PROVIDER. AI Gateway's `/compat/chat/completions` is
 * OpenAI-shaped and takes `{provider}/{model}` — Workers AI, Google, anything —
 * so there is one client here rather than one per vendor. A per-provider adapter
 * layer is a place for twelve subtly different ideas of what a token is.
 *
 * ⚠️ AND THE GATEWAY KNOWS WHAT A CALL COST WHILE THE RESPONSE DOES NOT SAY. No
 * `cf-aig-cost` header exists — cost lands in the LOG, reachable by the
 * `cf-aig-log-id` the response does carry. So a settle reads the usage in the
 * body, and the log is the INDEPENDENT check over it: the only number in this
 * system that is not our own arithmetic agreeing with itself.
 *
 * ⚠️ THE METADATA IS WHAT MAKES THAT CHECK POSSIBLE AND IT COSTS ONE HEADER.
 * Five keys are allowed; three are used. Without them the gateway's own billing
 * is one undifferentiated number for the deployment and cannot be compared to
 * anything a workspace was charged.
 *
 * ⚠️ AND `cf-aig-custom-cost` CARRIES OUR RAW COST, NEVER OUR PRICE. It exists so
 * the gateway's figures are right for a key we hold ourselves. Sending the
 * marked-up number would make the reconciliation compare a value against itself
 * and report perfect health for ever.
 *
 * vocabulary-exempt-file(studio): `google-ai-studio` is Cloudflare's own provider
 * id, and it is what the gateway addresses a Gemini model by. Spelling it our way
 * would make every Google call resolve to nothing.
 */

import type { Lane, Meter, ModelRow } from "@engine/kernel";
import { CREDIT_USD, MILLI, type Usage } from "@engine/kernel";
import type { Discovered } from "./models.js";

/* ------------------------------------------------------------------ shapes --- */

export interface GatewayAt {
  readonly accountId: string;
  readonly gateway: string;
  /** ⚠️ The gateway's own token. Absent, every call through it is refused. */
  readonly token: string;
  /** A provider key we hold ourselves, by provider id. BYOK — see the header. */
  readonly keys?: Readonly<Record<string, string>>;
}

export interface RunAsk {
  readonly model: ModelRow;
  readonly system: string;
  readonly prompt: string;
  readonly maxOutput: number;
  /** ⚠️ Three, and the gateway allows five. See the header. */
  readonly tag: { readonly t: string; readonly a: string; readonly o: string };
  /**
   * ⚠️ PICTURES TO LOOK AT, AS `data:` URLs, and they are what make the vision
   * lane more than a name. Without them an app could declare `lane: "vision"`,
   * compose, price a meter and pass every guard — and the model would receive
   * the words alone and answer confidently about an image nobody sent it.
   *
   * ⚠️ A LIST RATHER THAN ONE, BECAUSE ONE IS A SHAPE AN APP CANNOT ESCAPE. A
   * single photograph of a bottle is a bottle; the front, the back and the cap
   * together are a product. An app holding six and a seam holding one has two
   * ways out and both are wrong: six calls, which is six reserves for one
   * question, or five pictures dropped in silence.
   */
  readonly images?: readonly string[];
}

/**
 * ⚠️ THE USER TURN IS A STRING UNTIL THERE IS SOMETHING TO SEE, and that is not
 * tidiness. Providers accept a bare string for text and a list of parts for
 * anything else; sending the list shape for every call would put an app's
 * ordinary text through the path that exists for pictures, on every provider,
 * including the ones that read it less well.
 *
 * ⚠️ THE WORDS COME FIRST AND THE PICTURES FOLLOW IN THE ORDER THEY WERE GIVEN.
 * The order is the app's to mean something by — "front, back, cap" is a
 * sentence — and a seam that sorted or deduplicated them would silently
 * rewrite it.
 */
const said = (prompt: string, images?: readonly string[]): unknown =>
  (images?.length
    ? [{ type: "text", text: prompt },
      ...images.map((url) => ({ type: "image_url", image_url: { url } }))]
    : prompt);

export interface Answered {
  readonly text: string;
  /**
   * WHAT A LANE THAT DOES NOT ANSWER IN WORDS PRODUCED (D79).
   *
   * ⚠️ SEPARATE FROM `text` RATHER THAN ENCODED INTO IT. A picture base64'd into
   * a string is a picture every downstream reader has to know is not text — the
   * audit, the cache, anything that logs an answer — and the first one that
   * forgets writes a megabyte of base64 where a sentence was expected.
   *
   * ⚠️ AND `mime` TRAVELS WITH THE BYTES, because bytes with no type are bytes
   * nobody can store or serve. Deriving it from the lane is wrong the first time
   * a provider answers `webp` where the last one answered `png`.
   */
  readonly bytes?: Uint8Array;
  readonly mime?: string;
  /** ⚠️ The embedding lane's answer: a vector, which is neither words nor bytes. */
  readonly vector?: readonly number[];
  readonly usage: Usage | null;
  /**
   * ⚠️ THE HANDLE ON THE COST, NOT THE COST. What the gateway billed is behind
   * this id and arrives later; a run that settles on it synchronously would be a
   * run that waits for a log write on the request path.
   */
  readonly logId: string | null;
  readonly cached: boolean;
}

export const gatewayUrl = (at: GatewayAt): string =>
  `https://gateway.ai.cloudflare.com/v1/${at.accountId}/${at.gateway}`;

/* ------------------------------------------------------------- dialects --- */

/**
 * WHICH REQUEST A LANE MAKES, AND IT IS PER LANE RATHER THAN PER PROVIDER (D79).
 *
 * ⚠️ `/compat` IS CHAT COMPLETIONS AND NOTHING ELSE. That is a fact about
 * Cloudflare's endpoint rather than a preference: there is no
 * `/compat/embeddings`, no `/compat/images/generations`, no
 * `/compat/audio/speech`. So the three lanes that are not a conversation cannot
 * be expressed there at all, and the gateway's own passthrough —
 * `{gateway}/{provider}/{the provider's own path}` — is the only way to reach
 * them. The header above argues for one client and the argument still holds: the
 * thing it refuses is twelve ideas of what a TOKEN is, and a lane speaking two
 * dialects is not that.
 *
 * ⚠️ A PROVIDER WHOSE DIALECT WE DO NOT KNOW FOR A LANE IS REFUSED, NEVER
 * GUESSED. `GATEWAY` already takes this position for the slug — a vendor absent
 * from it is a row that is not stored rather than an invented address — and the
 * same reasoning is sharper here: an invented path returns 404 on a model an
 * operator has switched on and a workspace has chosen, and the reason reaches
 * nobody.
 */
export type Dialect = "openai" | "workers-ai" | "google";

/**
 * ⚠️ READ OFF THE GATEWAY SLUG, WHICH IS THE NAME THE REQUEST ACTUALLY USES.
 * Keying this on the catalogue's vendor name would be a second spelling of a
 * thing that already has one, and the two differ (`xai` against `grok`).
 */
const DIALECT: Readonly<Record<string, Dialect>> = {
  "workers-ai": "workers-ai",
  "google-ai-studio": "google",
  openai: "openai",
  /* ⚠️ These publish an OpenAI-shaped `/v1`, which is what the name means here —
     it is the SHAPE of the request, not the company. */
  groq: "openai",
  deepseek: "openai",
  mistral: "openai",
  cerebras: "openai",
  "perplexity-ai": "openai",
};

export const dialectOf = (model: ModelRow): Dialect | null =>
  DIALECT[model.provider] ?? null;

/**
 * ⚠️ THE MODEL'S OWN PATH, WITHOUT THE VENDOR PREFIX THE COMPAT NAME CARRIES.
 * `compatName` composes `{provider}/{model}` because `/compat` addresses it that
 * way; a passthrough request is already AT the provider, so sending it again
 * asks for a model called `openai/openai/...`.
 */
const bare = (model: ModelRow): string => model.id;

/** What each lane asks of each dialect, or `null` where we do not know. */
const routeFor = (lane: Lane, model: ModelRow): string | null => {
  const d = dialectOf(model);
  if (!d) return null;
  if (d === "workers-ai") {
    /* ⚠️ Workers AI answers every task at the model's own path — one shape for
       the whole vendor, which is why it is the lane's most reliable route. */
    return `/workers-ai/${bare(model)}`;
  }
  if (d === "openai") {
    return lane === "embed" ? "/openai/v1/embeddings"
      : lane === "image" ? "/openai/v1/images/generations"
        : lane === "speech" ? "/openai/v1/audio/speech"
          : null;
  }
  /* google */
  return lane === "embed"
    ? `/google-ai-studio/v1/models/${bare(model)}:embedContent`
    : lane === "image"
      ? `/google-ai-studio/v1/models/${bare(model)}:generateContent`
      : null;
};

/** The body each dialect expects for the lane. */
const bodyFor = (
  lane: Lane, model: ModelRow, planned: { system: string; prompt: string }, maxOutput: number,
): unknown => {
  const d = dialectOf(model);
  const said = planned.system ? `${planned.system}\n\n${planned.prompt}` : planned.prompt;
  if (d === "workers-ai") {
    return lane === "embed" ? { text: [planned.prompt] }
      : lane === "image" ? { prompt: said, num_steps: 8 }
        : { prompt: said };
  }
  if (d === "openai") {
    return lane === "embed" ? { model: bare(model), input: planned.prompt }
      : lane === "image" ? { model: bare(model), prompt: said, n: Math.max(1, maxOutput) }
        : { model: bare(model), input: said, voice: "alloy" };
  }
  return lane === "embed"
    ? { content: { parts: [{ text: planned.prompt }] } }
    : { contents: [{ parts: [{ text: said }] }] };
};

/**
 * ⚠️ THE PROVIDER PREFIX IS PART OF THE MODEL NAME AT THIS ENDPOINT, and the row
 * already holds both halves. Composing it here rather than storing it composed
 * keeps `ai_model.id` the provider's own path, which is what makes a row
 * traceable to the catalogue it came from.
 */
export const compatName = (model: ModelRow): string => `${model.provider}/${model.id}`;

/**
 * ⚠️ THE HEADER TAKES DOLLARS PER TOKEN AND THE ROW HOLDS MILLI-CREDITS PER
 * THOUSAND. Handing it either number unconverted is a cost report out by three
 * or five orders of magnitude — which does not fail, it just makes every
 * reconciliation meaningless in a direction nobody checks.
 */
export const perTokenUsd = (ratePerThousandMilli: number): number =>
  (ratePerThousandMilli / MILLI) * CREDIT_USD / 1000;

/* --------------------------------------------------------------------- run --- */

export type GatewayRefusal = "no_gateway" | "no_key" | "refused" | "unreadable";

interface Compat {
  readonly choices?: readonly { readonly message?: { readonly content?: string } }[];
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly completion_tokens_details?: { readonly reasoning_tokens?: number };
  };
}

/**
 * ⚠️ REASONING TOKENS ARE BILLED AND THE TWO CONVENTIONS ARE INDISTINGUISHABLE.
 * Some providers report them WITHIN `completion_tokens` and some BESIDE it, and
 * the payload looks identical either way — so a settle reading only
 * `completion_tokens` pays for the thinking on every call to every reasoning
 * model, which is the expensive half of the catalogue.
 *
 * ⚠️ SO IT SUMS, AND TWO THINGS MAKE THAT SAFE RATHER THAN GREEDY. The reserve
 * caps it, so a double-count can never exceed what was already justified and
 * shown; and this figure is the FALLBACK — when the gateway's own cost arrives,
 * the true-up settles at that and corrects the difference back to the workspace.
 * Erring high on a number that is later replaced by the truth costs a customer
 * nothing and costs us nothing; erring low is permanent and ours.
 */
export function usageOf(body: Compat): Usage | null {
  const u = body.usage;
  if (!u) return null;
  return {
    input: u.prompt_tokens ?? 0,
    output: (u.completion_tokens ?? 0) + (u.completion_tokens_details?.reasoning_tokens ?? 0),
  };
}

export interface Fetcher {
  (url: string, init: RequestInit): Promise<Response>;
}

/**
 * THE HEADERS EVERY CALL CARRIES, WHICHEVER ENDPOINT IT REACHES.
 *
 * ⚠️ SHARED BY THE COMPAT PATH AND THE PASSTHROUGH ON PURPOSE, because these are
 * the money. The metadata is what lets the gateway's own bill be compared to what
 * a workspace was charged, and `cf-aig-custom-cost` is what makes that bill right
 * for a key we hold ourselves — a lane that assembled its own headers would be a
 * lane whose spending is invisible to the nightly reconciliation, which is the
 * only number in this system that is not our own arithmetic agreeing with itself.
 */
function headersFor(
  at: GatewayAt, model: ModelRow, tag: { readonly t: string; readonly a: string; readonly o: string },
): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "cf-aig-authorization": `Bearer ${at.token}`,
    "cf-aig-metadata": JSON.stringify(tag),
    /* ⚠️ OUR RAW COST — see the header. Never the multiplier. */
    "cf-aig-custom-cost": JSON.stringify({
      per_token_in: perTokenUsd(model.input),
      per_token_out: perTokenUsd(model.output),
    }),
  };
  /* ⚠️ A KEY WE HOLD BEATS A KEY THE GATEWAY HOLDS, which is the whole reason to
     hold one: a stored key falls through to unified billing and its fee. */
  const own = at.keys?.[model.provider];
  if (own) headers["authorization"] = `Bearer ${own}`;
  return headers;
}

/**
 * Ask a model, through the gateway, tagged so the answer can be reconciled.
 *
 * ⚠️ IT REFUSES RATHER THAN FALLING BACK. A provider whose key we do not hold is
 * a model this deployment cannot run; reaching for another one would charge a
 * workspace for a model it did not choose, at a price it was not shown.
 */
export async function askModel(
  at: GatewayAt | null, ask: RunAsk, fetcher: Fetcher = fetch,
): Promise<Answered | GatewayRefusal> {
  if (!at?.token || !at.accountId || !at.gateway) return "no_gateway";

  const headers = headersFor(at, ask.model, ask.tag);

  let res: Response;
  try {
    res = await fetcher(`${gatewayUrl(at)}/compat/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: compatName(ask.model),
        max_tokens: ask.maxOutput,
        messages: [
          { role: "system", content: ask.system },
          { role: "user", content: said(ask.prompt, ask.images) },
        ],
      }),
    });
  } catch {
    return "refused";
  }

  if (!res.ok) return res.status === 401 || res.status === 403 ? "no_key" : "refused";

  let body: Compat;
  try {
    body = await res.json() as Compat;
  } catch {
    return "unreadable";
  }

  return {
    text: body.choices?.[0]?.message?.content ?? "",
    usage: usageOf(body),
    logId: res.headers.get("cf-aig-log-id"),
    /* ⚠️ A CACHED ANSWER COST NOTHING AND MUST NOT BE CHARGED AS IF IT DID. The
       gateway serves it without touching a provider, so charging our multiplier
       over a cost of zero is charging for a lookup. */
    cached: (res.headers.get("cf-aig-cache-status") ?? "").toUpperCase() === "HIT",
  };
}

/* ------------------------------------------------------------ other lanes --- */

/** ⚠️ A route we do not know is its own refusal — see `DIALECT`. */
export type LaneRefusal = GatewayRefusal | "no_route";

interface Embedded {
  readonly data?: readonly { readonly embedding?: readonly number[] }[];
  readonly embedding?: { readonly values?: readonly number[] };
  readonly result?: { readonly data?: readonly (readonly number[])[] };
  readonly usage?: { readonly prompt_tokens?: number; readonly total_tokens?: number };
}

interface Pictured {
  readonly data?: readonly { readonly b64_json?: string; readonly url?: string }[];
  readonly result?: { readonly image?: string };
  readonly candidates?: readonly {
    readonly content?: { readonly parts?: readonly {
      readonly inlineData?: { readonly data?: string; readonly mimeType?: string };
    }[] };
  }[];
}

const unb64 = (text: string): Uint8Array => {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
};

/**
 * ASK A MODEL FOR SOMETHING THAT IS NOT A CONVERSATION (D79).
 *
 * ⚠️ THE SAME HEADERS, THE SAME TAG, THE SAME CUSTOM COST — so a run in one of
 * these lanes reconciles exactly like a run in the text lane. Nothing about the
 * money path is different here; only the request and the answer are.
 *
 * ⚠️ AND THE USAGE IS OFTEN ABSENT, WHICH IS ALREADY HANDLED. An image endpoint
 * reports no token count because tokens are not what it billed — `settle` falls
 * back to the RESERVE for exactly this case, and the reserve for these lanes is
 * arithmetic over a known quantity rather than a guess (D80). The nightly
 * reconciliation then corrects it against what the gateway says it really cost.
 */
export async function askLane(
  at: GatewayAt | null, lane: Lane, ask: RunAsk, fetcher: Fetcher = fetch,
): Promise<Answered | LaneRefusal> {
  if (!at?.token || !at.accountId || !at.gateway) return "no_gateway";

  const route = routeFor(lane, ask.model);
  /* ⚠️ REFUSED RATHER THAN GUESSED. An invented path 404s on a model an operator
     switched on and a workspace chose, and the reason reaches nobody. */
  if (!route) return "no_route";

  let res: Response;
  try {
    res = await fetcher(`${gatewayUrl(at)}${route}`, {
      method: "POST",
      headers: headersFor(at, ask.model, ask.tag),
      body: JSON.stringify(bodyFor(lane, ask.model, ask, ask.maxOutput)),
    });
  } catch {
    return "refused";
  }

  if (!res.ok) return res.status === 401 || res.status === 403 ? "no_key" : "refused";

  const logId = res.headers.get("cf-aig-log-id");
  const cached = (res.headers.get("cf-aig-cache-status") ?? "").toUpperCase() === "HIT";
  const type = res.headers.get("content-type") ?? "";

  /*
    ⚠️ A SPEECH ENDPOINT ANSWERS WITH THE AUDIO ITSELF, not with a document
    describing it. Reading that as JSON throws, and the `unreadable` it would
    return is a working call reported as a broken one.
  */
  if (lane === "speech" || (!type.includes("json") && lane === "image")) {
    try {
      const bytes = new Uint8Array(await res.arrayBuffer());
      return {
        text: "", bytes, mime: type || "application/octet-stream",
        usage: null, logId, cached,
      };
    } catch {
      return "unreadable";
    }
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return "unreadable";
  }

  if (lane === "embed") {
    const it = body as Embedded;
    /* ⚠️ THREE SHAPES FOR ONE ANSWER, and every one of them is somebody's
       published contract: OpenAI nests under `data`, Google under `embedding`,
       Workers AI under `result`. */
    const vector = it.data?.[0]?.embedding ?? it.embedding?.values ?? it.result?.data?.[0];
    if (!vector) return "unreadable";
    return {
      text: "", vector,
      /* ⚠️ Embedding bills input only, which is why there is no output here to
         report — see `unitsFor`. */
      usage: it.usage?.prompt_tokens !== undefined
        ? { input: it.usage.prompt_tokens, output: 0 }
        : null,
      logId, cached,
    };
  }

  const it = body as Pictured;
  const inline = it.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  const b64 = it.data?.[0]?.b64_json ?? it.result?.image ?? inline?.data;
  if (!b64) return "unreadable";
  return {
    text: "", bytes: unb64(b64), mime: inline?.mimeType ?? "image/png",
    usage: null, logId, cached,
  };
}

/* ----------------------------------------------------------------- stream --- */

/**
 * ⚠️ ONE PART OR THE OTHER, RATHER THAN A PROMISE READ AFTER THE FACT. The usage
 * arrives as the LAST thing on the wire, so the obvious shape — a stream of text
 * plus a `usage` getter to read afterwards — is a mutable variable somebody can
 * read at the wrong moment and get `null` from. Making the end a part of the
 * stream means the settle happens where the number arrives.
 */
export type Part =
  | { readonly text: string }
  | { readonly end: { readonly usage: Usage | null } };

export interface Streamed {
  readonly parts: ReadableStream<Part>;
  readonly logId: string | null;
}

/**
 * ⚠️ `stream_options: { include_usage: true }` IS NOT OPTIONAL HERE, AND ITS
 * ABSENCE IS SILENT. Without it a streamed response carries no usage at all, so
 * every streamed run settles at the reserve — which is the safe direction and
 * therefore invisible: nothing fails, nobody is overcharged past what they were
 * shown, and the estimate quietly becomes the price for a whole class of calls.
 *
 * ⚠️ AND THE SAME HEADERS GO OUT. A streamed call that skipped the tag would be
 * a call the reconciliation cannot attribute — so the one independent check on
 * the money would have a hole in it exactly where the long generations are.
 */
export async function askModelStream(
  at: GatewayAt | null, ask: RunAsk, fetcher: Fetcher = fetch,
): Promise<Streamed | GatewayRefusal> {
  if (!at?.token || !at.accountId || !at.gateway) return "no_gateway";

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "cf-aig-authorization": `Bearer ${at.token}`,
    "cf-aig-metadata": JSON.stringify(ask.tag),
    "cf-aig-custom-cost": JSON.stringify({
      per_token_in: perTokenUsd(ask.model.input),
      per_token_out: perTokenUsd(ask.model.output),
    }),
  };
  const own = at.keys?.[ask.model.provider];
  if (own) headers["authorization"] = `Bearer ${own}`;

  let res: Response;
  try {
    res = await fetcher(`${gatewayUrl(at)}/compat/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: compatName(ask.model),
        max_tokens: ask.maxOutput,
        stream: true,
        /* ⚠️ See the header. Without this there is no usage on a streamed run. */
        stream_options: { include_usage: true },
        messages: [
          { role: "system", content: ask.system },
          { role: "user", content: said(ask.prompt, ask.images) },
        ],
      }),
    });
  } catch {
    return "refused";
  }

  if (!res.ok) return res.status === 401 || res.status === 403 ? "no_key" : "refused";
  if (!res.body) return "unreadable";

  return { parts: partsOf(res.body), logId: res.headers.get("cf-aig-log-id") };
}

/**
 * SERVER-SENT EVENTS INTO PARTS.
 *
 * ⚠️ A CHUNK IS NOT A LINE AND A LINE IS NOT AN EVENT. The transport splits
 * wherever it likes, so a naive per-chunk parse drops whatever straddles a
 * boundary — usually a fragment of text, occasionally the final usage event,
 * which is the one that decides what the call costs. The buffer is what makes
 * that impossible rather than rare.
 *
 * ⚠️ AND THE END IS EMITTED EXACTLY ONCE, whether the usage arrived or not. A
 * stream that finished without an end part would leave the hold outstanding for
 * ever, which is a balance that shrank and never came back.
 */
export function partsOf(body: ReadableStream<Uint8Array>): ReadableStream<Part> {
  const decoder = new TextDecoder();
  let buffer = "";
  let usage: Usage | null = null;
  let ended = false;

  return new ReadableStream<Part>({
    async start(out) {
      const reader = body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let cut = buffer.indexOf("\n");
          for (; cut !== -1; cut = buffer.indexOf("\n")) {
            const line = buffer.slice(0, cut).trim();
            buffer = buffer.slice(cut + 1);
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;

            let event: Compat & { choices?: readonly { delta?: { content?: string } }[] };
            try { event = JSON.parse(payload); } catch { continue; }

            /* ⚠️ THE USAGE EVENT CARRIES NO CHOICES, and both may be true of one
               event on some providers — so this reads them independently rather
               than as a branch. */
            const seen = usageOf(event);
            if (seen) usage = seen;
            const text = event.choices?.[0]?.delta?.content;
            if (text) out.enqueue({ text });
          }
        }
      } catch {
        /* ⚠️ A BROKEN CONNECTION ENDS THE STREAM RATHER THAN THROWING INTO IT.
           A throw here would reject the reader and skip the end part, which is
           the hold never released. */
      } finally {
        reader.releaseLock();
        if (!ended) { ended = true; out.enqueue({ end: { usage } }); }
        out.close();
      }
    },
  });
}

/* ------------------------------------------------------------------- cost --- */

export interface LoggedCost {
  readonly usd: number;
  readonly tokensIn: number;
  readonly tokensOut: number;
}

/** What the binding hands back for one log entry, reduced to what we act on. */
interface LogRow {
  readonly cost?: number;
  readonly tokens_in?: number;
  readonly tokens_out?: number;
}

export interface LogReader {
  getLog(id: string): Promise<LogRow | null>;
}

/**
 * WHAT CLOUDFLARE SAYS ONE CALL COST.
 *
 * ⚠️ THIS IS THE ONLY FIGURE IN THE SYSTEM THAT IS NOT OURS. Every other number
 * in the metering chain is our own arithmetic — the estimate, the rate table,
 * the multiplier — so all of them agree with each other by construction and none
 * of them can catch a mistake shared between them. Cloudflare bills us from
 * this, which makes it the one independent authority on whether a run was sold
 * above cost.
 *
 * ⚠️ AND IT IS ALLOWED TO BE ABSENT. The log is written after the response, so a
 * read moments later legitimately finds nothing; `null` means "ask again later",
 * never "it was free".
 */
export async function costOf(
  reader: LogReader | null, logId: string | null,
): Promise<LoggedCost | null> {
  if (!reader || !logId) return null;
  const row = await reader.getLog(logId).catch(() => null);
  if (!row || typeof row.cost !== "number") return null;
  return { usd: row.cost, tokensIn: row.tokens_in ?? 0, tokensOut: row.tokens_out ?? 0 };
}
