/**
 * WHICH MODEL AN ACTION RUNS ON, AND IN WHOSE WORDS (D19).
 *
 * ⚠️ TWO LEVELS, ONE DIRECTION. The app declares the action's prompt; the
 * OPERATOR may reword any of them for the whole deployment; a TENANT may ADD to
 * what the app marked `brandable`, and only for itself. Narrowing down the
 * chain, never widening — the same shape the notification policy and the flags
 * already have, because it is the same question about the same kind of
 * authority.
 *
 * ⚠️ AND THE TENANT'S HALF IS AN ADDENDUM RATHER THAN A REPLACEMENT, which is
 * what keeps the base instructions off the wire entirely. A replacement has to
 * be seeded with the current text to be editable, so every prompt the deployment
 * had would be shipped to the browser of anyone who could open the screen. See
 * `composePrompt`.
 *
 * ⚠️ THE MODEL IS THE WORKSPACE'S CHOICE AND THE OPERATOR'S DEFAULT. It was the
 * operator's alone, on the argument that a workspace choosing would be choosing
 * what we pay — which stopped being true once every run is charged to that
 * workspace's own wallet at the row's own multiplier. They are choosing what
 * THEY pay, and the floor that keeps it safe is `MIN_MULTIPLIER`: a row at cost
 * turns the freedom into a way to spend our money. A binding that no longer
 * resolves falls back to the lane's election rather than failing, or a model
 * retired by its provider takes every action bound to it down.
 */

import type { AiActionSpec, AppSpec, ModelRow, TenantId } from "@engine/kernel";
import { boundModel, composePrompt, refusePrompt } from "@engine/kernel";
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
    /*
      ⚠️ A ROW MEANS OFF, AND AN ABSENCE MEANS ON (D81). The other way round —
      a row per action saying `on` — would need every action written for every
      workspace at the moment it is created, so a product that ships a new action
      would find every existing workspace missing a row and have to decide what
      silence meant. It means what it means here: nobody has turned this off.

      ⚠️ SO THE TABLE IS EMPTY ON EVERY DEPLOYMENT WHERE NOBODY HAS SWITCHED
      ANYTHING OFF, which is most of them, and a workspace that never opens the
      screen behaves exactly as it did before this existed.
    */
    `CREATE TABLE IF NOT EXISTS ai_off (tenant_id TEXT NOT NULL, app TEXT NOT NULL, action TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (tenant_id, app, action));`,
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

/* ---------------------------------------------------------------- the switch --- */

/**
 * WHICH OF A WORKSPACE'S ACTIONS ARE SWITCHED OFF (D81).
 *
 * ⚠️ A SET RATHER THAN A PER-ACTION ASK, because every caller wants more than
 * one: the settings screen draws all of them, and a generation asks about its
 * own while the same round trip could have answered for the rest. One indexed
 * read on the primary key's prefix.
 */
export async function switchedOff(
  db: Db, tenantId: TenantId, app: string,
): Promise<ReadonlySet<string>> {
  const rows = await db.prepare(
    `SELECT action FROM ai_off WHERE tenant_id = ? AND app = ?`)
    .bind(tenantId, app).all<{ action: string }>();
  return new Set(rows.results.map((r) => r.action));
}

/**
 * ⚠️ `on` IS A DELETE, WHICH IS WHAT MAKES ABSENCE MEAN ON. Writing a row that
 * says `on` would be a second way to spell the same state, and the two disagree
 * the first time anything reads only one of them.
 */
export async function switchAction(
  db: Db, tenantId: TenantId, app: string, action: string, on: boolean, now = new Date(),
): Promise<void> {
  if (on) {
    await db.prepare(`DELETE FROM ai_off WHERE tenant_id = ? AND app = ? AND action = ?`)
      .bind(tenantId, app, action).run();
    return;
  }
  await db.prepare(
    `INSERT INTO ai_off (tenant_id, app, action, at) VALUES (?, ?, ?, ?)
     ON CONFLICT(tenant_id, app, action) DO NOTHING`)
    .bind(tenantId, app, action, now.toISOString()).run();
}

/* ------------------------------------------------------------- resolution --- */

export interface Running {
  readonly model: ModelRow | null;
  /**
   * ⚠️ THE COMPOSED INSTRUCTIONS, AND THIS FIELD MUST NOT REACH A BROWSER. It
   * holds the app's or the operator's text, which is exactly what the addendum
   * design exists to keep off the wire. Every reader that answers a screen sends
   * `wordedBy` and `addendum` and never this.
   */
  readonly prompt: string;
  /** ⚠️ The workspace's own words, which ARE theirs to read back. */
  readonly addendum: string | null;
  /** Where the base wording came from, so a screen can say so. */
  readonly wordedBy: "app" | "operator";
}

/**
 * ⚠️ ONE RESOLVER, AND EVERY READER USES IT — the run, the operator's screen
 * and the workspace's. The base is the app's unless the operator replaced it;
 * the workspace's own words are APPENDED, never substituted, and only where the
 * app said they may be. Resolving that anywhere else is how a screen comes to
 * promise a wording the run does not use.
 */
export function running(
  def: AiActionSpec,
  rows: readonly ModelRow[],
  binding: Binding | undefined,
  tenantPrompt: string | undefined,
  /** ⚠️ The workspace's choice, honoured only where the plan allows it. */
  tenantModel?: string | null,
): Running {
  const base = binding?.prompt?.trim() ? binding.prompt : def.prompt;
  const theirs = def.brandable && tenantPrompt?.trim() ? tenantPrompt.trim() : null;
  return {
    /* ⚠️ THEIRS FIRST, OURS SECOND, THE ELECTION LAST. A workspace's pick is a
       pick; the operator's binding is what runs when they have not made one. */
    model: boundModel(rows, def.lane, tenantModel ?? binding?.model),
    prompt: composePrompt(base, theirs),
    addendum: theirs,
    wordedBy: binding?.prompt?.trim() ? "operator" : "app",
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
