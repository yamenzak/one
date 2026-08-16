/**
 * WHICH MODEL AN ACTION RUNS ON, AND IN WHOSE WORDS (D19).
 *
 * ⚠️ TWO LEVELS, ONE DIRECTION. The app declares the action's prompt; the
 * OPERATOR may reword any of them for the whole deployment; a TENANT may
 * reword only what the app marked `brandable`, and only for itself. Narrowing
 * down the chain, never widening — the same shape the notification policy and
 * the flags already have, because it is the same question about the same kind
 * of authority.
 *
 * ⚠️ THE MODEL BINDING IS THE OPERATOR'S ALONE. Which row a lane runs on is a
 * cost and a capability decision about the deployment; a workspace choosing it
 * would be a workspace choosing what we pay. And a binding that no longer
 * resolves falls back to the lane's election rather than failing, or a model
 * retired by its provider takes every bound action down until somebody edits a
 * row.
 */

import type { AiActionSpec, AppSpec, ModelRow, TenantId } from "@engine/kernel";
import { boundModel, refusePrompt } from "@engine/kernel";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

/* ----------------------------------------------------------------- schema --- */

export const AI_ACTION_SCHEMA: SchemaModule = {
  id: "ai_action",
  statements: [
    /* ⚠️ The operator's, so it lives in the DIRECTORY — one deployment, one
       answer, whatever shard a workspace is on. */
    `CREATE TABLE IF NOT EXISTS ai_binding (app TEXT NOT NULL, action TEXT NOT NULL, model TEXT, prompt TEXT, at TEXT NOT NULL, PRIMARY KEY (app, action));`,
    /* ⚠️ And the workspace's own wording, on its own shard beside its records. */
    `CREATE TABLE IF NOT EXISTS ai_wording (tenant_id TEXT NOT NULL, app TEXT NOT NULL, action TEXT NOT NULL, prompt TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (tenant_id, app, action));`,
  ],
};

/* ------------------------------------------------------------------ store --- */

export interface Binding {
  readonly app: string;
  readonly action: string;
  readonly model: string | null;
  readonly prompt: string | null;
}

export async function bindingsOf(db: Db, app: string): Promise<readonly Binding[]> {
  const rows = await db.prepare(
    `SELECT app, action, model, prompt FROM ai_binding WHERE app = ?`).bind(app)
    .all<{ app: string; action: string; model: string | null; prompt: string | null }>();
  return rows.results.map((r) => ({ ...r }));
}

export async function bind(
  db: Db, app: string, action: string,
  change: { readonly model?: string | null; readonly prompt?: string | null },
  now = new Date(),
): Promise<void> {
  const seen = (await bindingsOf(db, app)).find((b) => b.action === action);
  const model = change.model === undefined ? seen?.model ?? null : change.model;
  const prompt = change.prompt === undefined ? seen?.prompt ?? null : change.prompt;
  await db.prepare(
    `INSERT INTO ai_binding (app, action, model, prompt, at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(app, action) DO UPDATE SET model = excluded.model, prompt = excluded.prompt, at = excluded.at`)
    .bind(app, action, model, prompt, now.toISOString()).run();
}

export async function wordingOf(
  db: Db, tenantId: TenantId, app: string,
): Promise<Readonly<Record<string, string>>> {
  const rows = await db.prepare(
    `SELECT action, prompt FROM ai_wording WHERE tenant_id = ? AND app = ?`)
    .bind(tenantId, app).all<{ action: string; prompt: string }>();
  return Object.fromEntries(rows.results.map((r) => [r.action, r.prompt]));
}

export async function word(
  db: Db, tenantId: TenantId, app: string, action: string, prompt: string | null,
  now = new Date(),
): Promise<void> {
  if (prompt === null) {
    await db.prepare(`DELETE FROM ai_wording WHERE tenant_id = ? AND app = ? AND action = ?`)
      .bind(tenantId, app, action).run();
    return;
  }
  await db.prepare(
    `INSERT INTO ai_wording (tenant_id, app, action, prompt, at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, app, action) DO UPDATE SET prompt = excluded.prompt, at = excluded.at`)
    .bind(tenantId, app, action, prompt, now.toISOString()).run();
}

/* ------------------------------------------------------------- resolution --- */

export interface Running {
  readonly model: ModelRow | null;
  readonly prompt: string;
  /** Where the wording came from, so a screen can say so. */
  readonly wordedBy: "app" | "operator" | "tenant";
}

/**
 * ⚠️ ONE RESOLVER, AND EVERY READER USES IT — the run, the operator's screen
 * and the workspace's. The order is app → operator → tenant, and the tenant's
 * only applies where the app said it may: resolving that anywhere else is how
 * a screen comes to promise a wording the run does not use.
 */
export function running(
  def: AiActionSpec,
  rows: readonly ModelRow[],
  binding: Binding | undefined,
  tenantPrompt: string | undefined,
): Running {
  const theirs = def.brandable && tenantPrompt?.trim() ? tenantPrompt : null;
  const ours = binding?.prompt?.trim() ? binding.prompt : null;
  return {
    model: boundModel(rows, def.lane, binding?.model),
    prompt: theirs ?? ours ?? def.prompt,
    wordedBy: theirs ? "tenant" : ours ? "operator" : "app",
  };
}

/** Every generating operation an app declares, with its action spec. */
export const actionsOf = (
  app: AppSpec,
): readonly { readonly id: string; readonly summary: string; readonly ai: AiActionSpec }[] =>
  app.operations
    .filter((o): o is typeof o & { ai: AiActionSpec } => !!o.ai)
    .map((o) => ({ id: o.id, summary: o.summary, ai: o.ai }));

export { refusePrompt };
