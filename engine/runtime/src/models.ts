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
import { laneOf, lanesFor, milliFromUsd } from "@engine/kernel";
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

export type SyncRefusal = "no_rows" | "no_priced_row";

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
 */
export function refuseDiscovered(rows: readonly Discovered[]): readonly SyncRefusal[] {
  const out: SyncRefusal[] = [];
  if (!rows.length) out.push("no_rows");
  else if (!rows.some((r) => (r.usdPerMillionIn ?? 0) > 0 || (r.usdPerMillionOut ?? 0) > 0)) {
    out.push("no_priced_row");
  }
  return out;
}

export interface Synced {
  readonly added: number;
  readonly priced: number;
  readonly retired: number;
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
  if (refused.length) return { added: 0, priced: 0, retired: 0, refused };

  const at = now.toISOString();
  const have = new Map((await modelsOf(db)).map((m) => [m.id, m]));
  let added = 0;
  let priced = 0;

  for (const it of found) {
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
  const providers = [...new Set(found.map((f) => f.provider).filter(Boolean))] as string[];
  const seenIds = found.map((f) => f.id);
  let retired = 0;
  if (providers.length && seenIds.length) {
    const done = await db.prepare(
      `UPDATE ai_model SET retired = 1, at = ? WHERE provider IN (${providers.map(() => "?").join(",")})`
      + ` AND id NOT IN (${seenIds.map(() => "?").join(",")})`)
      .bind(at, ...providers, ...seenIds).run();
    retired = done?.meta?.changes ?? 0;
  }

  return { added, priced, retired, refused: [] };
}

/* ------------------------------------------------------- reading a catalogue --- */

const propOf = (row: CatalogueRow, id: string): string | null => {
  const hit = row.properties?.find((p) => p.property_id === id);
  return hit && hit.value != null ? String(hit.value) : null;
};

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

const taskOf = (row: CatalogueRow): string =>
  (typeof row.task === "string" ? row.task : row.task?.name ?? "").toLowerCase();

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

const pricing = (row: CatalogueRow): Partial<Discovered> => {
  const inp = usdPerMillion(propOf(row, "price_in") ?? propOf(row, "input_price"));
  const out = usdPerMillion(propOf(row, "price_out") ?? propOf(row, "output_price"));
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
    .filter((row): row is CatalogueRow & { id: string } => !!row.id)
    .map((row) => {
      const task = taskOf(row);
      return {
        id: row.id,
        ...(row.name ? { name: row.name } : {}),
        ...(row.description ? { description: row.description } : {}),
        task,
        /* ⚠️ THE PREFIX `/compat` NEEDS, and Cloudflare's own rows do not carry
           one because from its side they are simply its models. */
        provider: row.id.startsWith("@cf/") ? "workers-ai" : providerOf(row.id),
        meter: meterOf(task),
        ...pricing(row),
        ...(propOf(row, "reasoning") ? { thinks: true } : {}),
      } satisfies Discovered;
    });
