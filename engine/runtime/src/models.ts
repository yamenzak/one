/**
 * THE MODEL CATALOGUE — what exists, what it costs us, and what a workspace pays.
 *
 * ⚠️ THE CATALOGUE IS DISCOVERED AND THE DECISIONS ARE NOT. Which models exist
 * and what a provider charges for them are facts about the world that change
 * without asking us, so they are synced. Which of them this deployment SELLS,
 * and at what multiplier, are decisions somebody made — and a nightly job that
 * overwrote them would undo an operator silently, on a schedule, for ever.
 *
 * ⚠️ A ROW IS RETIRED, NEVER DELETED. A model gone from a provider's catalogue
 * still has actions bound to it and runs recorded against it; deleting the row
 * breaks the binding and orphans the history. Retired, it stops being offered
 * and `boundModel` degrades to the lane's election, which is exactly what
 * "nobody has chosen" already means.
 *
 * ⚠️ AND A PARTIAL SYNC IS WORSE THAN NO SYNC. Half a catalogue applied is a
 * lane whose only enabled model vanished at 03:00 — so the write is all rows or
 * none, and a failed fetch changes nothing at all.
 *
 * vocabulary-exempt-file(studio): `google-ai-studio` is Cloudflare's own provider
 * id, and it is what `/compat` addresses a Gemini model by. Spelling it our way
 * would make every Google call resolve to nothing.
 */

import type { Meter, ModelRow } from "@engine/kernel";
import { laneOf, lanesFor, milliFromUsd, taskKey } from "@engine/kernel";
import type { CatalogueRow } from "./cloudflare.js";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

/* ----------------------------------------------------------------- schema --- */

export const MODEL_SCHEMA: SchemaModule = {
  id: "ai_model",
  statements: [
    /* ⚠️ THE DEPLOYMENT'S, SO IT IS IN THE DIRECTORY. One catalogue, one answer,
       whatever shard a workspace's records are on — a per-shard copy would make
       a model enabled in Frankfurt and absent in Virginia. */
    `CREATE TABLE IF NOT EXISTS ai_model (`
    + `id TEXT PRIMARY KEY, provider TEXT NOT NULL, task TEXT NOT NULL, label TEXT NOT NULL, `
    + `about TEXT, meter TEXT NOT NULL, input REAL NOT NULL, output REAL NOT NULL, `
    + `multiplier REAL NOT NULL, enabled INTEGER NOT NULL, is_default INTEGER, thinks INTEGER, `
    + `max_output INTEGER NOT NULL, retired INTEGER, at TEXT NOT NULL);`,
    `CREATE INDEX IF NOT EXISTS ix_ai_model_task ON ai_model (task, enabled);`,
  ],
};

/* ------------------------------------------------------------------ store --- */

interface Row {
  readonly id: string; readonly provider: string; readonly task: string;
  readonly label: string; readonly about: string | null; readonly meter: string;
  readonly input: number; readonly output: number; readonly multiplier: number;
  readonly enabled: number; readonly is_default: number | null;
  readonly thinks: number | null; readonly max_output: number;
  readonly retired: number | null;
}

const asModel = (r: Row): ModelRow => ({
  id: r.id, provider: r.provider, task: r.task, label: r.label,
  ...(r.about ? { about: r.about } : {}),
  meter: r.meter as Meter,
  input: r.input, output: r.output, multiplier: r.multiplier,
  enabled: !!r.enabled,
  ...(r.is_default ? { isDefault: true } : {}),
  ...(r.thinks ? { thinks: true } : {}),
  maxOutput: r.max_output,
  ...(r.retired ? { retired: true } : {}),
});

export async function modelsOf(db: Db): Promise<readonly ModelRow[]> {
  const rows = await db.prepare(
    `SELECT id, provider, task, label, about, meter, input, output, multiplier,`
    + ` enabled, is_default, thinks, max_output, retired FROM ai_model ORDER BY id`)
    .all<Row>();
  return rows.results.map(asModel);
}

/**
 * ⚠️ THE OPERATOR'S HALF, AND IT IS THE ONLY WRITE THAT TOUCHES THESE COLUMNS.
 * `enabled`, `is_default` and `multiplier` are decisions; everything else on the
 * row is discovered. Keeping the two writes apart is what makes "the sync never
 * undoes you" a property of the code rather than a promise in a comment.
 */
export async function decideModel(
  db: Db, id: string,
  change: {
    readonly enabled?: boolean; readonly isDefault?: boolean; readonly multiplier?: number;
  },
  now = new Date(),
): Promise<boolean> {
  const sets: string[] = [];
  const args: unknown[] = [];
  if (change.enabled !== undefined) { sets.push("enabled = ?"); args.push(change.enabled ? 1 : 0); }
  if (change.multiplier !== undefined) { sets.push("multiplier = ?"); args.push(change.multiplier); }
  if (!sets.length && change.isDefault === undefined) return false;

  /* ⚠️ ONE DEFAULT PER LANE, ENFORCED BY CLEARING THE OTHERS IN THE SAME PASS.
     Two rows claiming it makes which one runs depend on row order — a change in
     behaviour with no change anybody made. */
  if (change.isDefault) {
    const it = await db.prepare(`SELECT task FROM ai_model WHERE id = ?`).bind(id)
      .first<{ task: string }>();
    const lane = it ? laneOf(it.task) : null;
    if (lane) {
      /* ⚠️ THE KERNEL'S OWN ALIAS TABLE, ASKED. A lane has more than one provider
         spelling; a second copy of that list here would be right on the day it
         was written and would silently miss half a lane after the next one is
         added. */
      /* ⚠️ AND THIS IS THE ONE READER THAT CANNOT NORMALISE. `laneOf` and
         `inLane` put a provider's task name through `taskKey` before matching,
         so a stored `Text Generation` still resolves everywhere in TypeScript —
         but SQL compares the column, so a row written unnormalised is invisible
         to this `IN` and its default is never cleared. Two rows then claim the
         lane and which one runs depends on row order. `readCatalogue` is what
         keeps the column canonical; this is why that matters. */
      const names = lanesFor(lane);
      await db.prepare(
        `UPDATE ai_model SET is_default = 0 WHERE task IN (${names.map(() => "?").join(",")})`)
        .bind(...names).run();
    }
    sets.push("is_default = 1");
  } else if (change.isDefault === false) {
    sets.push("is_default = 0");
  }

  sets.push("at = ?"); args.push(now.toISOString());
  const done = await db.prepare(`UPDATE ai_model SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...args, id).run();
  return !!done?.meta?.changes;
}

/* ------------------------------------------------------------------- sync --- */

/**
 * WHAT THE CATALOGUE API HANDS BACK, reduced to what we can act on.
 *
 * ⚠️ EVERY FIELD HERE IS OPTIONAL BECAUSE EVERY FIELD IS SOMEBODY ELSE'S. A
 * catalogue that adds a field is fine; one that renames a field we insisted on
 * would make the whole sync throw and the deployment keep yesterday's prices —
 * which is the correct failure, and it is why `refuseDiscovered` reports rather
 * than the parser exploding.
 */
export interface Discovered {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
  readonly task?: string;
  readonly provider?: string;
  readonly contextLength?: number;
  readonly maxOutput?: number;
  /** USD per million units, as every published catalogue quotes them. */
  readonly usdPerMillionIn?: number;
  readonly usdPerMillionOut?: number;
  readonly meter?: Meter;
  readonly thinks?: boolean;
}

/** ⚠️ Nothing is sold at cost — see `MIN_MULTIPLIER`. Five is the deployment's. */
export const DEFAULT_MULTIPLIER = 5;

/** ⚠️ A ceiling for a row whose catalogue entry did not carry one. */
export const FALLBACK_MAX_OUTPUT = 4_096;

/**
 * ⚠️ MILLI-CREDITS PER THOUSAND UNITS, FROM DOLLARS PER MILLION. Two conversions
 * in one step on purpose: doing it in two leaves an intermediate in a unit
 * nothing else here uses, and somebody stores that.
 */
export const rateFrom = (usdPerMillion: number): number =>
  milliFromUsd(usdPerMillion / 1000);

export type SyncRefusal = "no_rows" | "no_priced_row" | "no_addressable_row";

/**
 * ⚠️ A ROW IS ADDRESSABLE OR IT IS NOT A MODEL. `compatName` is
 * `${provider}/${id}`, so a row whose vendor could not be read addresses `/<id>`
 * — it can be listed, priced, grouped into a lane and switched on, and every
 * call on it fails at the gateway. The provider is therefore not decoration on
 * the row; it is half of the only name the row has.
 */
export const isAddressable = (row: Discovered): boolean => !!row.provider;

/**
 * WHAT A DISCOVERED CATALOGUE MUST BE BEFORE ANY OF IT IS APPLIED.
 *
 * ⚠️ AN EMPTY ANSWER IS A FAILED FETCH WEARING A SUCCESS. A catalogue API that
 * answers `200 []` — wrong token, changed path, a filter that matched nothing —
 * would retire every model this deployment has, in one pass, at 03:00. The check
 * is cheap and the failure it prevents is total.
 *
 * ⚠️ AND A CATALOGUE WITH NO PRICES IS THE SAME FAULT ONE FIELD IN. If the shape
 * changed and nothing parses, every row lands at zero cost and every call after
 * that settles free — which looks like healthy usage until an invoice arrives.
 *
 * ⚠️ AND ONE WHERE NOTHING IS ADDRESSABLE IS THE SAME FAULT AGAIN, one field
 * further over — it is the one that actually happened. Sixty-four rows synced,
 * priced, tasked and reported as a success, every one keyed by an identifier no
 * provider has ever answered to. A catalogue nothing can be called from is not a
 * catalogue, and the sync must say so rather than counting it.
 *
 * ⚠️ ALL THREE ARE REPORTED, NOT THE FIRST. They are different faults with
 * different fixes, and answering with whichever one was checked first sends
 * somebody to look at prices when the shape changed underneath both.
 */
export function refuseDiscovered(rows: readonly Discovered[]): readonly SyncRefusal[] {
  const out: SyncRefusal[] = [];
  if (!rows.length) return ["no_rows"];
  if (!rows.some(isAddressable)) out.push("no_addressable_row");
  if (!rows.some((r) => (r.usdPerMillionIn ?? 0) > 0 || (r.usdPerMillionOut ?? 0) > 0)) {
    out.push("no_priced_row");
  }
  return out;
}

export interface Synced {
  readonly added: number;
  readonly priced: number;
  readonly retired: number;
  /** ⚠️ Rows the catalogue offered that nothing could ever call — see `isAddressable`. */
  readonly skipped: number;
  readonly refused: readonly SyncRefusal[];
}

/**
 * Bring the catalogue up to what the provider says exists.
 *
 * ⚠️ NEW ROWS ARRIVE DISABLED, ALWAYS. A model nobody has looked at starting to
 * answer a lane the moment it appears is a deployment whose behaviour changes
 * because somebody else shipped something.
 *
 * ⚠️ AND THE MULTIPLIER IS BOUND ONCE, AT INSERT. It is the deployment's default
 * for a row that has never been decided; re-applying it on every sync would make
 * every per-model margin an operator set revert overnight.
 */
export async function syncModels(
  db: Db, found: readonly Discovered[], multiplier = DEFAULT_MULTIPLIER, now = new Date(),
): Promise<Synced> {
  const refused = refuseDiscovered(found);
  if (refused.length) return { added: 0, priced: 0, retired: 0, skipped: 0, refused };

  /* ⚠️ ONLY WHAT CAN BE CALLED IS STORED. A row with no provider is half a name
     — see `isAddressable` — and storing it puts a switch on the screen that
     turns on a model the gateway will refuse. It is counted rather than
     dropped in silence, because a vendor we have no prefix for is a catalogue
     that grew, not a fault. */
  const usable = found.filter(isAddressable);
  const skipped = found.length - usable.length;

  /* ⚠️ AND ANY ALREADY STORED IS REMOVED — the one exception to "retired, never
     deleted", and it holds because the rule is about a model that WENT AWAY:
     actions are bound to it and runs are recorded against it, so the row is the
     only thing that can still explain them. A row that was never addressable has
     none of that behind it. `op.ai.bind` refuses to bind anything that is not
     enabled and in a lane, so nothing points at it, and it is not a model that
     went away — it is a row that was never a model. Left behind, it is an
     enable-able switch wired to a call that cannot be made. */
  await db.prepare(`DELETE FROM ai_model WHERE provider = ''`).run();

  const at = now.toISOString();
  const have = new Map((await modelsOf(db)).map((m) => [m.id, m]));
  let added = 0;
  let priced = 0;

  for (const it of usable) {
    const task = it.task ?? "";
    const input = rateFrom(it.usdPerMillionIn ?? 0);
    const output = rateFrom(it.usdPerMillionOut ?? 0);
    const seen = have.get(it.id);

    if (!seen) {
      await db.prepare(
        `INSERT INTO ai_model (id, provider, task, label, about, meter, input, output,`
        + ` multiplier, enabled, is_default, thinks, max_output, retired, at)`
        + ` VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 0, ?)`)
        .bind(it.id, it.provider ?? "", task, it.name ?? it.id, it.description ?? null,
          it.meter ?? "token", input, output, multiplier, it.thinks ? 1 : 0,
          it.maxOutput ?? it.contextLength ?? FALLBACK_MAX_OUTPUT, at).run();
      added++;
      continue;
    }

    /* ⚠️ WHAT IS DISCOVERED IS OVERWRITTEN AND WHAT WAS DECIDED IS NOT. The
       column list here IS the boundary: `enabled`, `is_default` and `multiplier`
       are absent from it on purpose, and adding one is how a sync starts
       undoing an operator. */
    await db.prepare(
      `UPDATE ai_model SET provider = ?, task = ?, label = ?, about = ?, meter = ?,`
      + ` input = ?, output = ?, thinks = ?, max_output = ?, retired = 0, at = ?`
      + ` WHERE id = ?`)
      .bind(it.provider ?? seen.provider, task || seen.task, it.name ?? seen.label,
        it.description ?? seen.about ?? null, it.meter ?? seen.meter, input, output,
        it.thinks ? 1 : 0, it.maxOutput ?? it.contextLength ?? seen.maxOutput, at, it.id).run();
    if (input !== seen.input || output !== seen.output) priced++;
  }

  /* ⚠️ RETIRED RATHER THAN DELETED — see the header. And only rows the sync
     could have seen: a catalogue answering for one provider must not retire
     another's. */
  const providers = [...new Set(usable.map((f) => f.provider).filter(Boolean))] as string[];
  const seenIds = usable.map((f) => f.id);
  let retired = 0;
  if (providers.length && seenIds.length) {
    const done = await db.prepare(
      `UPDATE ai_model SET retired = 1, at = ? WHERE provider IN (${providers.map(() => "?").join(",")})`
      + ` AND id NOT IN (${seenIds.map(() => "?").join(",")})`)
      .bind(at, ...providers, ...seenIds).run();
    retired = done?.meta?.changes ?? 0;
  }

  return { added, priced, retired, skipped, refused: [] };
}

/* ------------------------------------------------------- reading a catalogue --- */

const propOf = (row: CatalogueRow, id: string): string | null => {
  const hit = row.properties?.find((p) => p.property_id === id);
  return hit && hit.value != null ? String(hit.value) : null;
};

/** ⚠️ The raw value, because a price is not always a scalar — see `priceIn`. */
const rawOf = (row: CatalogueRow, id: string): unknown =>
  row.properties?.find((p) => p.property_id === id)?.value ?? null;

/** ⚠️ Every property id on a row, so a refusal can say what it actually saw. */
export const propertyIdsOf = (row: CatalogueRow): readonly string[] =>
  (row.properties ?? []).map((p) => p.property_id ?? "?");

/**
 * A PRICE OUT OF WHATEVER SHAPE THE CATALOGUE QUOTES IT IN.
 *
 * ⚠️ THIS GUESSED AT FIELD NAMES AND WAS WRONG, twice, against a live account —
 * the whole sync refused with `no_priced_row` while the catalogue was right
 * there. The published shape is not in the API docs, so the honest design is to
 * read the SHAPES that are possible rather than one set of names, and to report
 * what was found when none of them fit (see `refuseDiscovered`).
 *
 * ⚠️ THE `price` PROPERTY IS AN ARRAY ON WORKERS AI'S OWN ROWS — one entry per
 * unit, each `{ unit, price, currency }` — so `String(value)` on it yields
 * `[object Object]` and every number parse fails. That is exactly the fault
 * this exists to end.
 */
const KIND = { in: /input|prompt|\bin\b/i, out: /output|completion|\bout\b/i } as const;

export function priceFrom(value: unknown, want: "in" | "out"): number | undefined {
  /* A bare number is already what it says it is. */
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return usdPerMillion(value);

  /* ⚠️ AN ARRAY IS ONE ENTRY PER UNIT, and the unit is what says which half of
     the price it is. Taking the first entry would price every output token at
     the input rate — under-charging on exactly the expensive half. */
  if (Array.isArray(value)) {
    const rows = value as readonly { unit?: unknown; price?: unknown; currency?: unknown }[];
    const hit = rows.find((r) => KIND[want].test(String(r?.unit ?? "")));
    if (hit?.price != null) return priceFrom(hit.price, want);
    /* ⚠️ A SINGLE UNPRICED-BY-DIRECTION ENTRY IS ONE RATE FOR BOTH, which is how
       an embedding or a classifier quotes itself. */
    if (rows.length === 1 && rows[0]?.price != null) return priceFrom(rows[0].price, want);
    return undefined;
  }

  /* An object keyed by direction. */
  if (value && typeof value === "object") {
    const at = value as Record<string, unknown>;
    for (const [key, held] of Object.entries(at)) {
      if (KIND[want].test(key) && held != null) return priceFrom(held, want);
    }
  }
  return undefined;
}

/**
 * ⚠️ A PRICE IS PARSED FROM A SENTENCE, BECAUSE THAT IS HOW IT IS PUBLISHED.
 * "$0.29 per M input tokens" is a string in a properties list, not a number in a
 * field. Parsing is therefore allowed to fail — and when it does the row lands
 * unpriced and DISABLED rather than free, because a zero here is a model that
 * settles at nothing on every call.
 */
export const usdPerMillion = (said: string | null): number | undefined => {
  if (!said) return undefined;
  const hit = /\$?\s*([\d.]+)/.exec(said);
  const n = hit ? Number(hit[1]) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/* ⚠️ `taskKey`, NOT `toLowerCase` — a catalogue publishes DISPLAY names ("Text
   Generation"), and the lane table is hyphenated. See `taskKey`. */
const taskOf = (row: CatalogueRow): string =>
  taskKey(typeof row.task === "string" ? row.task : row.task?.name ?? "");

/**
 * ⚠️ WHAT A LANE COUNTS, DERIVED FROM WHAT THE MODEL DOES. An image model billed
 * per token would be metered at nothing; a transcriber billed per token would be
 * metered by the length of the filename.
 */
const meterOf = (task: string): Meter =>
  /image/.test(task) ? "image"
    : /speech|tts|audio|stt/.test(task) ? "second"
      : "token";

/**
 * ⚠️ THE PROVIDER IS READ OFF THE ID BECAUSE THAT IS WHERE IT IS. `gemini-2.5-*`
 * is Google's, `grok-*` is xAI's — and a model whose vendor cannot be told from
 * its name is one `/compat` could not address anyway, so it is left unprefixed
 * and lands disabled with nothing bound to it.
 */
const PREFIXES: readonly (readonly [RegExp, string])[] = [
  [/^gemini|^gemma|^imagen|^veo|^lyria/, "google-ai-studio"],
  [/^gpt|^o[134]|^dall-e|^whisper|^text-embedding/, "openai"],
  [/^claude/, "anthropic"],
  [/^grok/, "grok"],
  [/^deepseek/, "deepseek"],
  [/^mistral|^magistral|^codestral/, "mistral"],
  [/^llama|^qwen/, "groq"],
];

const providerOf = (id: string): string =>
  PREFIXES.find(([re]) => re.test(id))?.[1] ?? "";

/**
 * WHICH FIELD IS THE MODEL'S NAME, WHICH IS NOT THE FIELD CALLED `id`.
 *
 * ⚠️ CLOUDFLARE'S CATALOGUE ROW CARRIES A UUID IN `id` AND THE ADDRESSABLE PATH
 * IN `name`, and reading the obvious one stored sixty-four models under
 * identifiers no provider has ever answered to. Every one of them was priced,
 * tasked, grouped into a lane and offered with a switch; `compatName` builds
 * `${provider}/${id}`, so every call would have gone to `/<uuid>`. The sync
 * reported a success and there was no way to tell from anywhere that it was not
 * one.
 *
 * ⚠️ SO THE TEST IS THE SHAPE, NOT THE FIELD NAME — the same argument the price
 * parser above already lost once. A model is addressed by a PATH, so whichever
 * field looks like one is the name. That reads a marketplace-format row
 * correctly too, where the roles are the other way round: the path is in `id`
 * and `name` holds a human title.
 */
const PATHED = /\//;

const addressOf = (row: CatalogueRow): string =>
  (row.name && PATHED.test(row.name) ? row.name : row.id) ?? "";

/**
 * ⚠️ AND THE LABEL IS WHAT IS LEFT. A row whose only name is the path is titled
 * by its last segment — `llama-3.1-8b-instruct`, which is what the vendor's own
 * documentation calls it — because a list showing the full path twice, once as
 * the title and once as the id beneath it, is a list of one fact.
 */
const titleOf = (row: CatalogueRow, id: string): string =>
  row.name && !PATHED.test(row.name) ? row.name : id.slice(id.lastIndexOf("/") + 1) || id;

/**
 * ⚠️ THE ONE PROPERTY CLOUDFLARE ACTUALLY PUBLISHES IS `price`, and the aliases
 * beside it are for the partner rows that quote the two halves separately. Every
 * one of them is tried, in the shape-reading way above, because the catalogue is
 * a fact about the world and the world does not tell us before it changes it.
 */
const PRICED: readonly string[] = ["price", "pricing", "price_in", "input_price", "prices"];

const pricing = (row: CatalogueRow): Partial<Discovered> => {
  const found = (want: "in" | "out"): number | undefined => {
    for (const id of PRICED) {
      const got = priceFrom(rawOf(row, id), want);
      if (got !== undefined) return got;
    }
    return priceFrom(rawOf(row, want === "in" ? "price_in" : "price_out"), want);
  };
  const inp = found("in");
  const out = found("out") ?? inp;
  const ceiling = Number(propOf(row, "max_output_tokens") ?? propOf(row, "context_window"));
  return {
    ...(inp === undefined ? {} : { usdPerMillionIn: inp }),
    ...(out === undefined ? {} : { usdPerMillionOut: out }),
    ...(Number.isFinite(ceiling) && ceiling > 0 ? { maxOutput: ceiling } : {}),
  };
};

/**
 * TURN A CATALOGUE INTO ROWS THIS DEPLOYMENT CAN PRICE.
 *
 * ⚠️ THE FETCH IS `cloudflare.ts`'s AND THE READING IS HERE, and the split is the
 * account token: every bound on that credential is written in one file, and a
 * parser that fetched would be a second caller inheriting none of them.
 */
export const readCatalogue = (rows: readonly CatalogueRow[]): readonly Discovered[] =>
  rows
    .map((row) => ({ row, id: addressOf(row) }))
    .filter(({ id }) => !!id)
    .map(({ row, id }) => {
      const task = taskOf(row);
      return {
        id,
        name: titleOf(row, id),
        ...(row.description ? { description: row.description } : {}),
        task,
        /* ⚠️ THE PREFIX `/compat` NEEDS, and Cloudflare's own rows do not carry
           one because from its side they are simply its models. */
        provider: id.startsWith("@cf/") ? "workers-ai" : providerOf(id),
        meter: meterOf(task),
        ...pricing(row),
        ...(propOf(row, "reasoning") ? { thinks: true } : {}),
      } satisfies Discovered;
    });
