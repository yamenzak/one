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
 */

import type { Meter, ModelRow } from "@engine/kernel";
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
}

export interface Answered {
  readonly text: string;
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

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "cf-aig-authorization": `Bearer ${at.token}`,
    "cf-aig-metadata": JSON.stringify(ask.tag),
    /* ⚠️ OUR RAW COST — see the header. Never the multiplier. */
    "cf-aig-custom-cost": JSON.stringify({
      per_token_in: perTokenUsd(ask.model.input),
      per_token_out: perTokenUsd(ask.model.output),
    }),
  };

  /* ⚠️ A KEY WE HOLD BEATS A KEY THE GATEWAY HOLDS, which is the whole reason to
     hold one: a stored key falls through to unified billing and its fee. */
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
        messages: [
          { role: "system", content: ask.system },
          { role: "user", content: ask.prompt },
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
