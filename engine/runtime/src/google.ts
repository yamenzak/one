/**
 * WHAT GOOGLE HAS, AND WHAT IT COSTS.
 *
 * ⚠️ CLOUDFLARE'S CATALOGUE IS WORKERS AI AND ONLY WORKERS AI, which is the
 * whole reason this exists. `/ai/models/search` answers for the models
 * Cloudflare hosts; Gemini reaches us through the same gateway and is not in it.
 * So a deployment with a Google key configured, a gateway that would route the
 * call and an operator who had done everything right had no Gemini row to switch
 * on — and nothing anywhere said why, because from the catalogue's side nothing
 * was missing.
 *
 * ⚠️ GOOGLE PUBLISHES THE MODELS AND NOT THE PRICES. Its list endpoint carries
 * names, token limits and what each one can do; the rates are on a pricing page
 * meant for people. That is the awkward fact this file is shaped around, and the
 * shape is: discover from the API, price from a table WE hold, and store nothing
 * we cannot price.
 *
 * ⚠️ AN UNPRICED ROW IS NOT STORED, AND THAT IS NOT TIDINESS. A reserve is a
 * ceiling on revenue — the charge can come in under an estimate and never over
 * it — so a row at zero settles free on every call while the invoice arrives
 * anyway. Refusing to store it costs a model nobody can sell; storing it costs
 * money on every call, silently, until an operator notices a bill.
 *
 * ⚠️ AND THE RATE TABLE IS DATED IN PUBLIC, because a price we hold is the one
 * number in the metering chain nobody is checking. `ai-costs` reads the
 * gateway's own log nightly and reports a workspace sold under cost, which is
 * what catches this table going stale — the answer to "how do we know these are
 * right" is a job, not a promise.
 *
 * vocabulary-exempt-file(studio): `google-ai-studio` is Cloudflare's own provider
 * id, and it is what `/compat` addresses a Gemini model by. Spelling it our way
 * would make every Google call resolve to nothing.
 */

import type { Discovered } from "./models.js";

/** ⚠️ Cloudflare's name for the lane, because `/compat` is what addresses it. */
const PROVIDER = "google-ai-studio";

const ROOT = "https://generativelanguage.googleapis.com/v1beta/models";

/** ⚠️ Google's list is paged, and one page is not the catalogue. */
const A_PAGE = 200;

/** ⚠️ The same ceiling `cloudflare.ts` holds — an unbounded walk is not one. */
const MOST_PAGES = 10;

interface Listed {
  readonly name?: string;
  readonly displayName?: string;
  readonly description?: string;
  readonly inputTokenLimit?: number;
  readonly outputTokenLimit?: number;
  readonly supportedGenerationMethods?: readonly string[];
}

/**
 * WHAT A FAMILY COSTS, IN USD PER MILLION TOKENS.
 *
 * ⚠️ MATCHED BY PREFIX, LONGEST FIRST, because Google ships a model and four
 * dated snapshots of it — `gemini-2.5-flash`, `gemini-2.5-flash-preview-05-20`,
 * `-latest`, `-001`. A table keyed by exact id prices the family and leaves
 * every snapshot of it unpriced, which is the same as not having the family.
 *
 * ⚠️ THE ORDER OF THIS LIST IS LOAD-BEARING. `gemini-2.5-flash-lite` is a
 * cheaper model than `gemini-2.5-flash` and its id starts with that one's, so a
 * shortest-first match would sell it at four times its cost — in our favour,
 * which is exactly the kind of error nothing complains about.
 *
 * Published rates, read 2026-08-19. Standard context; the long-context tiers
 * above 200k tokens cost more and are not modelled, so a very long prompt is
 * under-estimated — which the nightly cost check is what catches.
 */
export const GEMINI_RATES: readonly (readonly [string, number, number])[] = [
  ["gemini-2.5-pro", 1.25, 10],
  ["gemini-2.5-flash-lite", 0.1, 0.4],
  ["gemini-2.5-flash", 0.3, 2.5],
  ["gemini-2.0-flash-lite", 0.075, 0.3],
  ["gemini-2.0-flash", 0.1, 0.4],
  ["gemini-1.5-pro", 1.25, 5],
  ["gemini-1.5-flash-8b", 0.0375, 0.15],
  ["gemini-1.5-flash", 0.075, 0.3],
  ["text-embedding-004", 0.0, 0.0],
  ["gemini-embedding", 0.15, 0.15],
];

/**
 * ⚠️ LONGEST PREFIX WINS, DERIVED RATHER THAN TRUSTED TO THE ORDER ABOVE. The
 * comment there says the order matters and a comment is not a mechanism: sorting
 * by length here means a row inserted in the wrong place is still priced
 * correctly, and the note stays as the explanation rather than as the guard.
 */
const rated = [...GEMINI_RATES].sort((a, b) => b[0].length - a[0].length);

export const rateForModel = (id: string): readonly [number, number] | null => {
  const hit = rated.find(([prefix]) => id.startsWith(prefix));
  return hit ? [hit[1], hit[2]] : null;
};

/**
 * ⚠️ WHAT A MODEL DOES, READ FROM WHAT IT ANSWERS TO. Google does not publish a
 * task, so the generation methods are the only statement of it — `embedContent`
 * is an embedder and `generateContent` is a text model, whatever the name says.
 */
const taskOf = (it: Listed): string => {
  const can = it.supportedGenerationMethods ?? [];
  if (can.includes("embedContent") || can.includes("batchEmbedContents")) return "text-embeddings";
  if (can.includes("predictLongRunning")) return "text-to-video";
  return "text-generation";
};

/**
 * ⚠️ A THINKING MODEL BILLS FOR TOKENS NOBODY REQUESTED, which is why the
 * reserve widens for one. Every 2.5 model reasons by default.
 */
const thinks = (id: string): boolean => /^gemini-2\.5/.test(id);

export interface Answer<T> { readonly ok: boolean; readonly value?: T; readonly why: string }

/**
 * EVERY GEMINI MODEL THIS KEY CAN REACH, PRICED.
 *
 * ⚠️ THE KEY GOES IN A HEADER, NEVER THE QUERY STRING. Google accepts `?key=`
 * and it is what every example uses — and a URL is what gets logged, retained,
 * and put in an error message somebody pastes into a chat. `x-goog-api-key` is
 * the same request with the credential somewhere it cannot leak by being
 * quoted.
 */
export async function listGeminiModels(key: string): Promise<Answer<readonly Discovered[]>> {
  const out: Discovered[] = [];
  let page: string | undefined;

  for (let n = 0; n < MOST_PAGES; n++) {
    const url = `${ROOT}?pageSize=${A_PAGE}${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { "x-goog-api-key": key } });
    } catch {
      /* ⚠️ A NETWORK FAULT IS NOT AN EMPTY CATALOGUE. Reported as `ok` with no
         rows it would retire every Gemini model this deployment sells, at
         03:00, over a dropped connection. */
      return { ok: false, why: "could not reach Google" };
    }
    if (!res.ok) {
      return { ok: false, why: `Google answered ${res.status} — check the AI Studio key` };
    }

    const body = await res.json() as {
      models?: readonly Listed[]; nextPageToken?: string;
    };
    for (const it of body.models ?? []) {
      /* ⚠️ `models/gemini-2.5-flash` is the resource name; the id `/compat`
         addresses is the segment after it. */
      const id = (it.name ?? "").replace(/^models\//, "");
      if (!id) continue;
      const rate = rateForModel(id);
      /* ⚠️ Unpriced is not stored — see the header. */
      if (!rate) continue;

      out.push({
        id,
        name: it.displayName ?? id,
        ...(it.description ? { description: it.description } : {}),
        task: taskOf(it),
        provider: PROVIDER,
        meter: "token",
        usdPerMillionIn: rate[0],
        usdPerMillionOut: rate[1],
        ...(it.outputTokenLimit ? { maxOutput: it.outputTokenLimit } : {}),
        ...(thinks(id) ? { thinks: true } : {}),
      });
    }

    page = body.nextPageToken;
    if (!page) break;
  }

  /* ⚠️ AN EMPTY ANSWER IS A FAILED FETCH WEARING A SUCCESS — `refuseDiscovered`
     makes the same argument about the whole catalogue. A key that reaches Google
     and matches nothing in the rate table is a table that has gone stale, which
     is a thing to say rather than a silent retirement of every Gemini row. */
  return out.length
    ? { ok: true, value: out, why: "" }
    : { ok: false, why: "Google listed no model this deployment has a rate for" };
}
