/**
 * AI model pricing sync (SPEC §6) — parse the official Cloudflare Workers AI
 * and Google Gemini pricing docs (their .md versions) into a single catalog of
 * neuron-equivalent rates, so every model — whichever provider — bills through
 * the SAME credit math and stays profitable at the configured markup.
 *
 * Unified unit: NEURONS. Cloudflare already prices in neurons. Gemini prices in
 * USD, which we convert to neuron-equivalents via Cloudflare's neuron price
 * ($0.011 / 1000 neurons) — so a credit charge always equals markup × the real
 * provider cost, no matter the provider.
 */

import { NEURON_COST_USD } from "@mossa/domain";

export interface ModelSeed {
  id: string;
  label: string;
  provider: "workers-ai" | "google";
  task: "text" | "text-small" | "vision" | "image";
  inputRate: number | null; // neurons per 1M input tokens
  outputRate: number | null; // neurons per 1M output tokens
  unitRate: number | null; // neurons per unit (e.g. per generated image)
  unitKind: "image" | null;
}

/** USD → neuron-equivalents (so Gemini meters identically to Workers AI). */
export const usdPerMToNeurons = (usdPerM: number): number => Math.round(usdPerM / 1_000_000 / NEURON_COST_USD * 1_000_000);
export const usdToNeurons = (usd: number): number => Math.round(usd / NEURON_COST_USD);

const prettyId = (id: string): string =>
  id.split("/").pop()!.replace(/[-_]/g, " ").replace(/\bfp8\b|\bawq\b|\bit\b|\binstruct\b/gi, "").replace(/\s+/g, " ").trim().replace(/\b\w/g, (m) => m.toUpperCase());

/** Small/cheap text models get task "text-small" so there's always a cheap
 *  default; larger ones "text". Vision by name. */
function workersTask(id: string): ModelSeed["task"] {
  if (/vision/i.test(id)) return "vision";
  if (/-(1b|2b|3b|micro)\b|flash|lite|mini|small|7b|8b/i.test(id)) return "text-small";
  return "text";
}

/**
 * Parse the Cloudflare Workers AI pricing markdown. Reads the neuron column of
 * the text-generation table (rows with BOTH input and output token rates);
 * skips embeddings (input only) and image/tile-priced models.
 */
export function parseWorkersAiPricing(md: string): ModelSeed[] {
  const out: ModelSeed[] = [];
  const seen = new Set<string>();
  for (const line of md.split("\n")) {
    if (!line.startsWith("| @cf/")) continue;
    const cols = line.split("|").map((c) => c.trim());
    const id = cols[1];
    if (!id || seen.has(id)) continue;
    const neuronCol = cols[3] ?? "";
    const inp = /(\d[\d,]*)\s*neurons per M input tokens/i.exec(neuronCol);
    const outp = /(\d[\d,]*)\s*neurons per M output tokens/i.exec(neuronCol);
    if (!inp || !outp) continue; // text-generation rows only
    const inputRate = Number(inp[1]!.replace(/,/g, ""));
    const outputRate = Number(outp[1]!.replace(/,/g, ""));
    if (!(inputRate > 0) || !(outputRate > 0)) continue;
    seen.add(id);
    out.push({ id, label: prettyId(id), provider: "workers-ai", task: workersTask(id), inputRate, outputRate, unitRate: null, unitKind: null });
  }
  return out;
}

const firstUsd = (s: string): number | null => { const m = /\$([0-9]+(?:\.[0-9]+)?)/.exec(s); return m ? Number(m[1]) : null; };

/**
 * Parse the Gemini pricing markdown. Each model is a `## Heading` followed by
 * an italic `*` + backticked id, then a table with `Input price` / `Output
 * price` rows (paid-tier USD per 1M tokens; image models price output per
 * image). Preview/TTS/audio/embedding models are skipped.
 */
export function parseGeminiPricing(md: string): ModelSeed[] {
  const out: ModelSeed[] = [];
  const seen = new Set<string>();
  // Split into per-model blocks on the italic-backtick id line.
  const idRe = /^\*`([a-z0-9.\-]+)`\*/gim;
  const marks: { id: string; start: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = idRe.exec(md))) marks.push({ id: m[1]!, start: m.index });
  for (let i = 0; i < marks.length; i++) {
    const { id, start } = marks[i]!;
    if (seen.has(id)) continue;
    const block = md.slice(start, marks[i + 1]?.start ?? md.length);
    if (/-tts\b|-audio|preview-tts|native-audio|embedding|\blive\b/i.test(id)) continue; // skip non text/image
    const inputLine = /\|\s*Input price\s*\|[^\n]*/i.exec(block)?.[0] ?? "";
    const outputLine = /\|\s*Output price[^\n|]*\|[^\n]*/i.exec(block)?.[0] ?? "";
    const isImage = /image/i.test(id);
    const inUsd = firstUsd(inputLine);
    if (isImage) {
      // Output priced per image (or per 1M image-output tokens — take per image).
      const perImage = /\$([0-9.]+)\s*per image/i.exec(outputLine)?.[1];
      const unitRate = perImage ? usdToNeurons(Number(perImage)) : null;
      if (unitRate == null) continue;
      seen.add(id);
      out.push({ id, label: prettyId(id), provider: "google", task: "image", inputRate: inUsd != null ? usdPerMToNeurons(inUsd) : null, outputRate: null, unitRate, unitKind: "image" });
    } else {
      const outUsd = firstUsd(outputLine);
      if (inUsd == null || outUsd == null) continue;
      const task: ModelSeed["task"] = /flash-lite|flash|lite/i.test(id) ? "text-small" : "text";
      seen.add(id);
      out.push({ id, label: prettyId(id), provider: "google", task, inputRate: usdPerMToNeurons(inUsd), outputRate: usdPerMToNeurons(outUsd), unitRate: null, unitKind: null });
    }
  }
  return out;
}
