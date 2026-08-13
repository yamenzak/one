/**
 * THE PRICE LISTS, READ.
 *
 * Layer 2. Imports the generation contract and nothing else.
 *
 * ⚠️ A CATALOGUE TYPED BY HAND IS A CATALOGUE THAT IS WRONG BY THE END OF THE
 * QUARTER, and being wrong here is a transfer rather than a bug: the reserve is
 * the ceiling on revenue, so every unit an out-of-date rate fails to count is
 * one the platform pays for and nobody is billed. Providers publish the numbers;
 * reading them is one job a day rather than a standing errand nobody owns.
 *
 * ⚠️ AND THE RETIREMENT IS THE HALF THAT HAS A DEADLINE. Google's pricing page
 * carries the shut-down date AND the model to move to — "migrate to Gemini 2.5
 * Flash Image" is in the document — so the close alternative is a fact to read
 * rather than a judgement somebody has to make under time pressure. Every call
 * to a shut-down model fails, for every workspace pinned to it, on a date
 * nobody was watching.
 *
 * ⚠️ THESE ARE PURE FUNCTIONS OVER TEXT, and that is what makes them testable
 * against the real documents rather than against a fixture somebody invented.
 * Both pages are prose with no stability contract and both WILL change shape;
 * the defence is not a cleverer parser, it is that a parse yielding nothing is
 * treated as a failure rather than as an empty catalogue — see `runtime`.
 *
 * ⚠️ AND A PARSED ROW IS NEVER ENABLED. What a deployment offers is an operator
 * decision about which companies read its customers' data, and a document that
 * grew a row overnight is not that decision. Everything here arrives switched
 * off, priced and ready.
 */

import type { Lane, ModelSpec } from "./generation.js";
import { LANES } from "./generation.js";

/** The two documents. ⚠️ Stated once, so a test reads what the sync reads. */
export const SOURCES = {
  "workers-ai": "https://developers.cloudflare.com/workers-ai/platform/pricing/index.md",
  gemini: "https://ai.google.dev/gemini-api/docs/pricing.md.txt",
} as const;

export type Provider = keyof typeof SOURCES;

/**
 * One row as a document describes it.
 *
 * ⚠️ IT IS NOT A `ModelSpec`. A parsed row carries no markup and no `enabled` —
 * those are the operator's and a sync must never touch them — so a type that
 * could be mistaken for a catalogue entry is a type somebody will write straight
 * into the store.
 */
export interface PricedRow {
  readonly id: string;
  readonly provider: Provider;
  readonly lanes: readonly Lane[];
  readonly rate: { readonly input: number; readonly output: number };
  readonly perOutput?: number;
  readonly attachmentUnits?: number;
  readonly retiresAt?: string;
  readonly replacedBy?: string;
}

/**
 * ⚠️ CREDITS PER UNIT, FROM DOLLARS PER MILLION TOKENS. One credit is one US
 * cent of provider cost, chosen because it makes a rate readable at a glance and
 * a balance countable in whole numbers — and stated HERE, once, because two
 * files converting differently is a catalogue where a Cloudflare model and a
 * Gemini model are priced on different scales and the cheaper-looking one is
 * whichever was converted wrong.
 */
export const CENTS_PER_DOLLAR = 100;
export const creditsPerUnit = (usdPerMillion: number): number =>
  (usdPerMillion * CENTS_PER_DOLLAR) / 1_000_000;

/* ------------------------------------------------------------ cloudflare --- */

/**
 * ⚠️ THE SECTION IS THE LANE, and it is the only signal the page carries. There
 * is no capability column: what a model does is which table it is in.
 */
const CF_SECTIONS: Readonly<Record<string, readonly Lane[]>> = {
  "LLM model pricing": ["text"],
  "Image model pricing": ["image"],
  "Audio model pricing": ["speech", "transcribe"],
};

/**
 * ⚠️ AND WITHIN THE AUDIO TABLE, THE UNIT IS THE DIRECTION. A model priced per
 * CHARACTER is given words and produces sound; one priced per audio MINUTE is
 * given sound. Guessing from the name would put `melotts` — text to speech,
 * priced per minute of what it produces — on the wrong side.
 */
const audioLanes = (priceText: string): readonly Lane[] =>
  /per 1k characters/i.test(priceText) ? ["speech"] : ["transcribe"];

/** ⚠️ A vision model is named as one. The page has no other way to say it. */
const CF_VISION = /vision|moondream|llava/i;

const usd = (text: string): number | null => {
  const m = /\$([0-9]+(?:\.[0-9]+)?)/.exec(text);
  return m ? Number(m[1]) : null;
};

/**
 * Read Cloudflare's pricing page.
 *
 * ⚠️ IT CARRIES NO RETIREMENT NOTICE AT ALL, so a model that disappears from it
 * is the only signal there is — and absence is deliberately NOT treated as a
 * retirement here. A page that failed to render half its tables would otherwise
 * retire half the catalogue, which is the failure a syncer must never have.
 */
export function parseCloudflare(doc: string): readonly PricedRow[] {
  const out: PricedRow[] = [];
  let lanes: readonly Lane[] | null = null;

  for (const line of doc.split("\n")) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) { lanes = CF_SECTIONS[heading[1]!] ?? null; continue; }
    if (!lanes) continue;

    const cells = line.split("|").map((c) => c.trim());
    /* A table row is `| id | tokens | neurons |`, so five cells with empty ends. */
    if (cells.length < 4 || !cells[1]?.startsWith("@cf/")) continue;
    const id = cells[1];
    const price = cells[2] ?? "";

    /* ⚠️ MATCHED ON THE UNIT, not on position in the cell. Both figures live in
       one cell — "$0.293 per M input tokens  $2.253 per M output tokens" — and
       slicing around the word "output" reads whichever number happened to be
       nearer, which is the input rate for every row on the page. */
    const inUsd = usd(/\$[0-9.]+ per M input tokens/.exec(price)?.[0] ?? "");
    const outUsd = usd(/\$[0-9.]+ per M output tokens/.exec(price)?.[0] ?? "");

    const mine = lanes[0] === "speech" ? audioLanes(price) : lanes;
    /*
      ⚠️ A TEXT MODEL THAT IS ALSO A VISION MODEL GETS BOTH LANES. One row per
      lane is not possible — the id is the primary key — and leaving vision off
      would mean a deployment with a vision model in its catalogue and no action
      able to reach it.
    */
    const withVision: readonly Lane[] = mine[0] === "text" && CF_VISION.test(id) ? ["text", "vision"] : mine;

    /*
      ⚠️ A ROW WITH NO TOKEN PRICE IS IMPORTED AT ZERO RATHER THAN SKIPPED, and
      the zero is the feature. This page prices pictures by TILE and by STEP and
      audio by the MINUTE — three units, none of them "one thing produced" — so
      there is no honest conversion to make here. `modelProblems` refuses a rate
      of zero, so the row lands visible, in its lane, offered to nobody, with the
      console saying exactly what is missing. Skipping it instead would hide a
      model an operator could price by hand in ten seconds.
    */
    out.push({
      id, provider: "workers-ai", lanes: withVision,
      rate: {
        input: creditsPerUnit(inUsd ?? 0),
        output: creditsPerUnit(outUsd ?? inUsd ?? 0),
      },
      /*
        ⚠️ A PRODUCING LANE NEEDS A PER-OUTPUT PRICE AND THIS PAGE PRICES BY
        TILE, BY STEP AND BY MINUTE — three units, none of them "one picture".
        Left absent, `modelProblems` refuses the row and the console says why,
        which is a visible gap an operator can price by hand. Inventing a
        conversion would be a number nobody could check that decides a bill.
      */
      ...(withVision.includes("vision") ? { attachmentUnits: 0 } : {}),
    });
  }
  return out;
}

/* ---------------------------------------------------------------- gemini --- */

/**
 * ⚠️ THE LANE COMES FROM THE ID, because the section heading is a marketing name
 * and the id is the address. `-image` draws, `-tts` speaks, `veo-` is video, and
 * everything else is a text model that also takes pictures — which is what
 * "text / image / video / audio" in the input price column actually means.
 */
export function geminiLanes(id: string): readonly Lane[] {
  if (/^veo-/.test(id)) return ["video"];
  if (/-tts/.test(id)) return ["speech"];
  if (/image/.test(id)) return ["image"];
  if (/^imagen-/.test(id)) return ["image"];
  if (/embedding/.test(id)) return [];
  return ["text", "vision"];
}

/** ⚠️ "August 17, 2026" → a date a comparison can order. */
export function dateFrom(text: string): string | undefined {
  const m = /\b([A-Z][a-z]+)\s+([0-9]{1,2}),\s+([0-9]{4})/.exec(text);
  if (!m) return undefined;
  const month = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ].indexOf(m[1]!);
  if (month < 0) return undefined;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
}

/** ⚠️ Every id a section declares, from its own back-ticked line. */
const idsIn = (block: string): readonly string[] =>
  [...(block.match(/^\*(`[^*]+`)\*\s*$/m)?.[1] ?? "").matchAll(/`([a-z0-9][a-z0-9.\-]*)`/g)].map((m) => m[1]!);

/**
 * Read Google's pricing page.
 *
 * ⚠️ THE WARNING LINE IS THE VALUABLE PART. It carries the shut-down date and
 * the model to move to, both of which a catalogue otherwise has no way to know —
 * and both of which decide what happens to a workspace pinned to the row.
 */
export function parseGemini(doc: string): readonly PricedRow[] {
  const out: PricedRow[] = [];
  const blocks = doc.split(/\n(?=## )/);

  /* ⚠️ A section's FIRST id is its model. Built before the second pass, because
     a replacement may be declared below the row that names it. */
  const sections: { readonly slug: string; readonly id: string }[] = [];
  for (const block of blocks) {
    const name = /^##\s+(.+?)\s*$/m.exec(block)?.[1];
    const ids = idsIn(block);
    if (name && ids[0]) sections.push({ slug: slug(name), id: ids[0] });
  }

  for (const block of blocks) {
    const ids = idsIn(block);
    if (ids.length === 0) continue;

    const warning = /^>.*\bdeprecated\b.*$/m.exec(block)?.[0] ?? "";
    const retiresAt = warning ? dateFrom(warning) : undefined;
    /*
      ⚠️ RESOLVED FROM THE LINK TEXT, NOT FROM THE ANCHOR. The anchor is written
      by hand and is imprecise in the page itself: Imagen's notice says "migrate
      to Gemini 2.5 Flash Image" and links to `#gemini-2.5-flash`, which is a
      DIFFERENT model — a text model, in a different lane, that cannot draw. The
      words are the fact; the anchor is a typo waiting to move a workspace to
      something that cannot do its work.
    */
    const target = /migrate to \[([^\]]+)\]/.exec(warning)?.[1];
    const replacedBy = target ? sectionFor(sections, slug(target)) : undefined;

    const inUsd = usd(row(block, "Input price") ?? "");
    const outUsd = usd(row(block, "Output price") ?? "");
    /* ⚠️ A PER-IMAGE OR PER-SECOND TABLE HAS NO INPUT/OUTPUT ROW AT ALL — Imagen
       prices "Imagen 4 Fast image price" and Veo "Veo 3.1 Standard video with
       audio price (default)". The label is whatever the model is called, so the
       only stable thing about it is the word `price`, anywhere in it. */
    const perOutputUsd = inUsd === null ? firstPaidPrice(block) : null;

    for (const id of ids) {
      const lanes = geminiLanes(id);
      /* ⚠️ A lane the meter cannot price is skipped rather than imported wrong.
         An embedding model has no action that could ever reach it. */
      if (lanes.length === 0 || lanes.some((l) => !LANES.includes(l))) continue;
      if (inUsd === null && perOutputUsd === null) continue;

      out.push({
        id, provider: "gemini", lanes,
        rate: {
          input: creditsPerUnit(inUsd ?? 0),
          output: creditsPerUnit(outUsd ?? inUsd ?? 0),
        },
        ...(perOutputUsd === null ? {} : { perOutput: perOutputUsd * CENTS_PER_DOLLAR }),
        /*
          ⚠️ A GEMINI TEXT MODEL IS PRICED FOR PICTURES ON THE SAME ROW, so its
          attachment units are its input rate applied to what a picture counts
          as. The page states no figure, so it stays absent and the row is
          refused for vision until an operator prices it — a number invented here
          would be one nobody could check, deciding what a photograph costs.
        */
        ...(retiresAt ? { retiresAt } : {}),
        ...(replacedBy && replacedBy !== id ? { replacedBy } : {}),
      });
    }
  }
  return out;
}

/**
 * ⚠️ THE MOST SPECIFIC SECTION THE WORDS COULD MEAN, in either direction. A
 * marketing name is longer than its section heading ("Veo 3.1 Preview" for
 * `## Veo 3.1`) or shorter ("Gemini 2.5 Flash Image" for `## Gemini 2.5 Flash
 * Image (Nano Banana)`), so a match has to allow both — and taking the LONGEST
 * candidate is what stops "Gemini 2.5 Flash Image" resolving to the plain text
 * model whose name is a prefix of it.
 */
const sectionFor = (
  sections: readonly { readonly slug: string; readonly id: string }[], want: string,
): string | undefined =>
  sections
    .filter((s) => s.slug.startsWith(want) || want.startsWith(s.slug))
    .sort((a, b) => b.slug.length - a.slug.length)[0]?.id;

const slug = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * ⚠️ THE FIRST PRICED ROW IN A TABLE THAT PRICES BY THE THING PRODUCED. Matching
 * a fixed label cannot work here: the label is the model's own marketing name
 * with the word `price` on the end of it, and it differs per section.
 */
const firstPaidPrice = (block: string): number | null => {
  for (const line of block.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 4 || !/price/i.test(cells[1] ?? "")) continue;
    /* ⚠️ The PAID column. A free tier read as a price is an unmetered model. */
    const paid = usd(cells[3] ?? "");
    if (paid !== null) return paid;
  }
  return null;
};

const row = (block: string, label: string): string | null => {
  const re = new RegExp(`^\\|\\s*${label}[^|]*\\|([^|]*)\\|([^|]*)\\|`, "im");
  const m = re.exec(block);
  /* ⚠️ The PAID column, never the free one. "Free of charge" priced as zero is
     an unmetered model — the reserve holds nothing and the provider invoices. */
  return m ? (m[2] ?? null) : null;
};

/* --------------------------------------------------------------- merging --- */

/**
 * What a sync would change, without changing it.
 *
 * ⚠️ `markup` AND `enabled` ARE NEVER TOUCHED, and that is the whole contract. A
 * sync corrects what a provider charges; what a deployment charges on top and
 * which companies it is willing to send data to are the operator's, and a
 * document that grew a row overnight is not that decision.
 */
export interface CatalogueChange {
  readonly id: string;
  readonly kind: "new" | "repriced" | "retiring" | "unchanged";
  readonly was?: { readonly input: number; readonly output: number };
  readonly now: { readonly input: number; readonly output: number };
  readonly retiresAt?: string;
  readonly replacedBy?: string;
}

export function planSync(have: readonly ModelSpec[], found: readonly PricedRow[]): readonly CatalogueChange[] {
  const known = new Map(have.map((m) => [m.id, m]));
  return found.map((f) => {
    const was = known.get(f.id);
    const kind: CatalogueChange["kind"] =
      !was ? "new"
        : f.retiresAt && f.retiresAt !== was.retiresAt ? "retiring"
          : was.rate.input !== f.rate.input || was.rate.output !== f.rate.output ? "repriced"
            : "unchanged";
    return {
      id: f.id, kind, now: f.rate,
      ...(was ? { was: was.rate } : {}),
      ...(f.retiresAt ? { retiresAt: f.retiresAt } : {}),
      ...(f.replacedBy ? { replacedBy: f.replacedBy } : {}),
    };
  });
}

/**
 * What to write, from what was parsed and what is already there.
 *
 * ⚠️ A NEW ROW ARRIVES DISABLED AND AT COST. It has no markup because nobody has
 * decided one, and `enabled: false` because offering it would be the platform
 * choosing a sub-processor on a workspace's behalf overnight. `modelProblems`
 * refuses a markup of zero, so the row is visible, priced and unusable until an
 * operator says otherwise — which is exactly the state it should be in.
 */
export function merged(have: readonly ModelSpec[], found: readonly PricedRow[]): readonly ModelSpec[] {
  const known = new Map(have.map((m) => [m.id, m]));
  return found.map((f) => {
    const was = known.get(f.id);
    return {
      id: f.id,
      provider: f.provider,
      lanes: f.lanes,
      rate: f.rate,
      ...(f.perOutput === undefined ? {} : { perOutput: f.perOutput }),
      /* ⚠️ An operator's own attachment price survives a resync: the page states
         none, so taking the parsed absence would undo the one number that keeps
         a vision model metered. */
      ...(was?.attachmentUnits !== undefined ? { attachmentUnits: was.attachmentUnits }
        : f.attachmentUnits === undefined ? {} : { attachmentUnits: f.attachmentUnits }),
      markup: was?.markup ?? 0,
      enabled: was?.enabled ?? false,
      ...(f.retiresAt ? { retiresAt: f.retiresAt } : {}),
      ...(f.replacedBy ? { replacedBy: f.replacedBy } : {}),
      ...(was?.thinking === undefined ? {} : { thinking: was.thinking }),
    };
  });
}
