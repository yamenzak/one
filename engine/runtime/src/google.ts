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

import { alsoLanes } from "@engine/kernel";
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
 * WHAT EACH MODEL COSTS, READ FROM THE PAGE GOOGLE PUBLISHES IT ON.
 *
 * ⚠️ THIS WAS A TABLE IN THIS FILE AND THE TABLE WENT STALE IMMEDIATELY. It was
 * written from the 2.5 generation and priced ten families; Google's own page
 * lists thirty, most of them newer, and a rate we hold by hand is the one number
 * in the metering chain nobody is checking. Parsing the published page makes the
 * price a fact about the world again — the same argument the model catalogue
 * itself already rests on.
 *
 * ⚠️ AND IT IS THE STANDARD TIER, NOT THE CHEAPEST ONE ON THE PAGE. Every model
 * quotes Standard, Batch, Flex and Priority; Batch is half price and is a
 * different request that this deployment does not make. Metering an ordinary
 * call at the batch rate would under-charge by half, which the settle cap turns
 * into a permanent loss rather than an error anybody sees.
 */
const PRICING = "https://ai.google.dev/gemini-api/docs/pricing.md.txt";

/**
 * ONE CELL, SEVERAL PRICES, AND THEY ARE NOT ALTERNATIVES TO EACH OTHER.
 *
 * ⚠️ A CELL CARRIES A DATE, AND THE PRICE IN IT CHANGES ON THAT DATE. "$0.75
 * through December 31, 2026. $1.50 starting January 1, 2027" is one cell holding
 * two rates and the day the first stops being true. Reading the first number
 * would sell at half cost from New Year's Day, silently, for as long as nobody
 * looked.
 *
 * ⚠️ AND IT CARRIES A MODALITY, WHICH IS THE ONE THAT NEARLY COST REAL MONEY IN
 * BOTH DIRECTIONS. "$0.10 (text / image / video) $0.70 (audio)" is one input
 * price for four kinds of input; taking the largest quotes every text prompt at
 * seven times its cost, and taking the first quotes an image model's output at
 * the text rate. Neither is a rounding error — the row is what a workspace is
 * charged from. So the modality is read, and the one that matches what the model
 * is FOR is the one taken.
 *
 * ⚠️ AND A PRICE PER PICTURE IS NOT A PRICE PER MILLION TOKENS. The column says
 * "per 1M tokens" and one row under it says "$0.039 per image" anyway. Read as
 * the column's unit that is a millionth of the real rate — a model that settles
 * to nothing on every call, which is the exact failure `refuseDiscovered`
 * exists to catch and this would have walked straight past it. A quote in
 * another unit is refused rather than converted: the conversion needs a token
 * count per image that nobody publishes.
 */
type Modality = "text" | "image" | "audio" | "video";

interface Quote {
  readonly amount: number;
  readonly from?: number;
  readonly until?: number;
  /**
   * ⚠️ A SET, NOT ONE. "$0.30 (text / image / video)" is a single rate for three
   * kinds of input, and asking which one it IS matched `image` and lost every
   * multimodal text model on the page — nine of twenty-nine, silently, because a
   * model that cannot be priced is simply not stored.
   */
  readonly of: ReadonlySet<Modality>;
  /** ⚠️ Set when the quote is per something that is not a token. */
  readonly per: boolean;
}

const DATED = /\b(through|starting)\s+([A-Z][a-z]+\s+\d{1,2},\s*\d{4})/;
/* ⚠️ "per 1,000,000 tokens" is the column's own unit restated, not another one. */
const PER_OTHER = /\bper\s+(?!1M\b|1,000,000\s+tokens|M\s+tokens)[\d.,]*\s*[A-Za-z]/;

export function quotesIn(cell: string): readonly Quote[] {
  const out: Quote[] = [];
  /* ⚠️ SEGMENTED AT EACH `$`, because what qualifies a number is the words
     AFTER it and before the next one. */
  for (const part of cell.split(/(?=\$)/)) {
    const hit = /^\$\s*([\d.]+)/.exec(part.trim());
    if (!hit) continue;
    const amount = Number(hit[1]);
    if (!Number.isFinite(amount)) continue;

    const said = part.toLowerCase();
    const when = DATED.exec(part);
    const at = when ? Date.parse(when[2]!) : NaN;
    out.push({
      amount,
      ...(Number.isFinite(at) && when![1] === "through" ? { until: at } : {}),
      ...(Number.isFinite(at) && when![1] === "starting" ? { from: at } : {}),
      of: new Set<Modality>([
        ...(/\baudio\b/.test(said) ? ["audio" as const] : []),
        ...(/\bimages?\b/.test(said) ? ["image" as const] : []),
        ...(/\bvideo\b/.test(said) ? ["video" as const] : []),
        ...(/\btext\b/.test(said) ? ["text" as const] : []),
      ]),
      per: PER_OTHER.test(said),
    });
  }
  return out;
}

/**
 * ⚠️ THE MODALITY FIRST, THEN THE DATE. A cell may hold both — the qualified
 * prices are the alternatives and the dated ones are the same price over time —
 * and narrowing to the wrong modality before choosing a date would compare rates
 * for two different things.
 */
export function priceAt(cell: string, now: Date, want: Modality = "text"): number | undefined {
  const all = quotesIn(cell);
  if (!all.length) return undefined;

  /* ⚠️ AN UNLABELLED QUOTE IS THE BASE RATE. Most cells hold one number and say
     nothing about what it is for, which is the ordinary case. */
  const named = all.filter((q) => q.of.has(want));
  const plain = all.filter((q) => q.of.size === 0);
  const chosen = named.length ? named : plain;
  if (!chosen.length) return undefined;

  /* ⚠️ Refused, not converted — see the header. */
  if (chosen.every((q) => q.per)) return undefined;
  const usable = chosen.filter((q) => !q.per);

  const at = now.getTime();
  const dated = usable.filter((q) => q.from !== undefined || q.until !== undefined);
  if (!dated.length) return usable[0]!.amount;

  const live = dated.filter((q) => (q.from ?? -Infinity) <= at && at <= (q.until ?? Infinity));
  if (live.length) return live[0]!.amount;
  /* ⚠️ A gap between windows takes the latest that has STARTED rather than
     nothing — a price does not stop existing because a page phrased its dates
     loosely, and answering `undefined` would drop the model entirely. */
  const begun = dated.filter((q) => (q.from ?? -Infinity) <= at);
  return (begun.length ? begun : dated).at(-1)!.amount;
}

/** ⚠️ The paid column is the LAST cell — the first is the free tier. */
const paidIn = (row: string): string => {
  const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
  return cells[cells.length - 1] ?? "";
};

const IN_ROW = /^\|\s*(?:Text\s+)?Input price/i;
const OUT_ROW = /^\|\s*Output price/i;

/**
 * EVERY MODEL THE PAGE PRICES, BY THE ID A CALL IS ADDRESSED TO.
 *
 * ⚠️ THE ID IS THE BACKTICKED LINE, NOT THE HEADING. The heading is a display
 * name with a version, a nickname and sometimes an emoji — "Gemini 3.1 Flash
 * Image (Nano Banana 2) 🍌" — and the thing an API call names is on the line
 * under it.
 */
export function readGeminiPricing(
  page: string, now: Date,
): ReadonlyMap<string, { input: number; output: number }> {
  const out = new Map<string, { input: number; output: number }>();

  for (const section of page.split(/^## /m).slice(1)) {
    const id = /^\s*\*`([a-z0-9.\-]+)`\*/m.exec(section)?.[1];
    if (!id) continue;

    /* ⚠️ STANDARD ONLY — see `PRICING`. Everything after the next `###` is
       another request mode at another price. */
    const from = section.search(/^### Standard\b/m);
    const block = from < 0 ? section : section.slice(from + 1);
    const standard = block.split(/^### /m)[0] ?? "";

    /*
      ⚠️ THE MODALITY IS THE MODEL'S OWN, AND IT DIFFERS BETWEEN THE TWO ENDS. A
      voice model is prompted in text and answers in audio; an image model is
      prompted in text and answers in pictures. Asking for one modality across
      both rows priced a voice model's speech at the rate for the sentence that
      asked for it — twenty times under, on the expensive half.
    */
    const speaks = /-tts(-|$)/.test(id);
    const draws = /-image(-|$)/.test(id) || /^imagen/.test(id);
    const answers: Modality = speaks ? "audio" : draws ? "image" : "text";

    const rows = standard.split("\n");
    const input = rows.filter((r) => IN_ROW.test(r)).map((r) => priceAt(paidIn(r), now, "text"))
      .find((n) => n !== undefined);
    if (input === undefined) continue;

    /*
      ⚠️ NO OUTPUT ROW IS ONE RATE FOR BOTH — that is how an embedder quotes
      itself, having no output to charge for. AN OUTPUT ROW THAT COULD NOT BE
      PRICED IS A REFUSAL, and the two must not share a branch: falling back to
      the input rate priced an image model's pictures at the rate for the prompt,
      which is the settles-for-nothing failure wearing a plausible number.
    */
    const outRows = rows.filter((r) => OUT_ROW.test(r));
    if (!outRows.length) { out.set(id, { input, output: input }); continue; }
    const output = outRows.map((r) => priceAt(paidIn(r), now, answers))
      .find((n) => n !== undefined);
    if (output === undefined) continue;

    out.set(id, { input, output });
  }
  return out;
}

/**
 * WHAT A MODEL DOES, READ FROM WHAT IT ANSWERS TO AND WHAT IT IS CALLED.
 *
 * ⚠️ GOOGLE PUBLISHES NO TASK, so the generation methods are the only statement
 * of one — `embedContent` is an embedder whatever the name says. Where they do
 * not separate two things the id does: every image model ends `-image` and every
 * voice one `-tts`, and both would otherwise land in the text lane and be
 * elected to answer a chat.
 */
const taskOf = (it: Listed, id: string): string => {
  const can = it.supportedGenerationMethods ?? [];
  if (can.includes("embedContent") || can.includes("batchEmbedContents")) return "text-embeddings";
  if (/-image(-|$)/.test(id) || /^imagen/.test(id)) return "text-to-image";
  if (/-tts(-|$)/.test(id)) return "text-to-speech";
  if (/^veo/.test(id) || can.includes("predictLongRunning")) return "text-to-video";
  return "text-generation";
};

/**
 * ⚠️ A THINKING MODEL BILLS FOR TOKENS NOBODY REQUESTED, which is why the
 * reserve widens for one. Everything from 2.5 on reasons by default, and the
 * families are numbered, so this asks the number rather than listing them —
 * a list would have been right in May and wrong by August.
 */
const thinks = (id: string): boolean => {
  const gen = /^gemini-(\d+(?:\.\d+)?)/.exec(id)?.[1];
  return gen !== undefined && Number(gen) >= 2.5;
};

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
export async function listGeminiModels(
  key: string, now = new Date(),
): Promise<Answer<readonly Discovered[]>> {
  /*
    ⚠️ TWO READS, AND THE CATALOGUE IS THEIR INTERSECTION. The API says which
    models this KEY can reach; the pricing page says what each COSTS. A model in
    only the first cannot be sold because we do not know what it charges us, and
    one in only the second cannot be called. Intersecting them is also what
    retires a generation: when Google drops a model from the API the sync stops
    seeing it, and the retire pass marks the row.
  */
  let priced: ReadonlyMap<string, { input: number; output: number }>;
  try {
    const page = await fetch(PRICING);
    if (!page.ok) return { ok: false, why: `Google's pricing page answered ${page.status}` };
    priced = readGeminiPricing(await page.text(), now);
  } catch {
    return { ok: false, why: "could not read Google's pricing page" };
  }
  /* ⚠️ A PAGE THAT PARSED TO NOTHING IS A CHANGED PAGE, and applying it would
     drop every Gemini model rather than report that the reader is out of date. */
  if (!priced.size) return { ok: false, why: "Google's pricing page parsed to no prices" };

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
      const rate = priced.get(id);
      /* ⚠️ Unpriced is not stored — see the header. */
      if (!rate) continue;
      const task = taskOf(it, id);

      out.push({
        id,
        name: it.displayName ?? id,
        ...(it.description ? { description: it.description } : {}),
        task,
        /* ⚠️ THE KERNEL'S, NOT THIS FILE'S — see `alsoLanes`. A Gemini row read
           from Google's API and the same model resold in Cloudflare's catalogue
           must land in the same lanes, or which vendor answered first decides
           whether the vision lane can see it. */
        also: alsoLanes(id, task),
        provider: PROVIDER,
        /* ⚠️ EVERY GEMINI RATE IS PER TOKEN, image models included — an image is
           charged as output tokens rather than per picture. */
        meter: "token",
        usdPerMillionIn: rate.input,
        usdPerMillionOut: rate.output,
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
    : { ok: false, why: "no model Google lists is on its own pricing page" };
}
