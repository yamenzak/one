/**
 * Client context for AI (SPEC §6) — a thin wrapper over the combined Client
 * Knowledge base (`client-knowledge.ts`). Every AI surface builds its prompt
 * context from ONE source of truth: `buildClientContext` loads the full
 * knowledge object and renders the labeled text block, and also hands back the
 * structured `knowledge` so callers that need typed fields (plan grounding,
 * gating) don't re-query. `bodyCompLine` remains for the couple of features that
 * only want the one-line body-composition summary.
 */

import { classifyBodyFat, bodyComposition, type BodyFatCategory, type UnitPrefs } from "@mossa/domain";
import type { Env } from "./env.js";
import { loadClientKnowledge, renderKnowledge, partOfDay, shortHash, type ClientKnowledge, type KnowledgeClient, type KnowledgeSection } from "./client-knowledge.js";

export { partOfDay, shortHash, loadClientKnowledge, renderKnowledge };
export type { ClientKnowledge, KnowledgeClient, KnowledgeSection };

const BF_CAT_LABEL: Record<BodyFatCategory, string> = {
  essential: "very lean", athletic: "athletic", fitness: "fit", average: "average", above_average: "above average",
};

/**
 * A compact body-composition line for AI prompts: the client's most recent
 * body-fat reading (from `measurements` — the canonical table both manual logs
 * and body-scans mirror into), its category, and — when weight + height are
 * known — lean/fat mass and FFMI. Returns null when there's no body-fat on file
 * so callers can omit it cleanly. Shared so every AI surface reads body
 * composition the same way.
 */
export async function bodyCompLine(
  db: Env["DB"],
  client: { id: string; gender: string | null; height_cm: number | null },
): Promise<string | null> {
  const bf = await db
    .prepare("SELECT date_local, body_fat_percent, weight_kg FROM measurements WHERE client_id=? AND body_fat_percent IS NOT NULL ORDER BY date_local DESC LIMIT 1")
    .bind(client.id)
    .first<{ date_local: string; body_fat_percent: number; weight_kg: number | null }>();
  if (!bf?.body_fat_percent) return null;
  const gender = client.gender === "female" ? "female" : "male";
  const cat = classifyBodyFat(bf.body_fat_percent, gender);
  let weightKg = bf.weight_kg;
  if (weightKg == null) {
    const w = await db.prepare("SELECT weight_kg FROM measurements WHERE client_id=? AND weight_kg IS NOT NULL ORDER BY date_local DESC LIMIT 1").bind(client.id).first<{ weight_kg: number }>();
    weightKg = w?.weight_kg ?? null;
  }
  const comp = weightKg != null && client.height_cm != null ? bodyComposition(weightKg, bf.body_fat_percent, client.height_cm) : null;
  const parts = [`${bf.body_fat_percent.toFixed(1)}% body fat${cat ? ` (${BF_CAT_LABEL[cat]})` : ""}`];
  if (comp) parts.push(`lean ${comp.leanMassKg}kg`, `fat ${comp.fatMassKg}kg`, `FFMI ${comp.ffmi}`);
  return `BODY COMPOSITION (as of ${bf.date_local}): ${parts.join(", ")}.`;
}

export interface ClientContext {
  text: string;
  /** Changes when anything material changes → the personalized-message cache key. */
  signalHash: string;
  /** The full structured knowledge base (identity, goal, body, training, …). */
  knowledge: ClientKnowledge;
}

/**
 * Build the AI prompt context for a client from the combined Client Knowledge
 * base. `sections` scopes the rendered text (e.g. a meal feature can drop
 * training detail); the structured `knowledge` always carries everything.
 */
export async function buildClientContext(
  env: Env,
  client: KnowledgeClient,
  opts: { today: string; hour: number; units: UnitPrefs; sections?: KnowledgeSection[] },
): Promise<ClientContext> {
  const knowledge = await loadClientKnowledge(env, client, opts);
  const text = renderKnowledge(knowledge, { units: opts.units, sections: opts.sections });
  return { text, signalHash: knowledge.signalHash, knowledge };
}
