/**
 * CONFIGURATION, STORED — two layers, and the app's own wins.
 *
 * ⚠️ THE SHARED STORE IS SHARED, AND NO APP WRITES ANOTHER APP'S DATABASE. One
 * Stripe account, one Google account, one Turnstile widget sit behind every
 * product; holding a copy per app means a rotated key is re-pasted per app, or
 * one app quietly keeps the old one and fails in a way nobody attributes to the
 * rotation. So a key resolves from this app's own store and falls through to a
 * store every app binds by the same id.
 *
 * The alternative — a central service that PUSHES configuration into each
 * product — is a privileged config-write endpoint in every app, authenticated by
 * a machine token, accepting secret keys. Strictly worse than a human session on
 * one door.
 *
 * ⚠️ UNBOUND CHANGES NOTHING. A deployment with no shared store resolves its own
 * values and nothing else, which is what a self-host and every test run are.
 */

import type { Catalogue, ConfigRegistry, Instant, ModelSpec, SchemaModule, SqlHandle } from "@one/kernel";
import { modelProblems } from "@one/kernel";
import { redactConfig, resolveConfig, writableToShared } from "@one/kernel";

/**
 * ⚠️ ONE TABLE, IN BOTH STORES, WITH THE SAME SHAPE. The shared store is another
 * database with this table in it — not a different schema, because the two are
 * read by one resolver and a second shape would be a second reader.
 *
 * ⚠️ AND THE APP IS PART OF THE KEY, which it was not. "This app's own store" is
 * the directory, and the directory is bound with the same id into every worker —
 * so every product's `email.from` was one row, and `email.from` is declared
 * `shared: false` precisely because it is per-app. The two-layer resolution the
 * whole module is about collapsed: the local layer WAS the shared layer, and
 * every product silently agreed about keys they were each meant to own.
 *
 * In the SHARED store the app id is the empty string, because a shared key
 * belongs to the deployment rather than to a product. That is a value rather
 * than a second table, so one resolver still reads both — see the header.
 */
export const CONFIG_SCHEMA: SchemaModule = {
  /** ⚠️ Global: one Stripe account, one mail sender, one Turnstile widget behind every product. */
  global: "deployment",
  id: "config",
  ddl: [`CREATE TABLE IF NOT EXISTS app_config (app_id TEXT NOT NULL DEFAULT '', key TEXT NOT NULL, value TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (app_id, key));`],
};

/** ⚠️ What the SHARED store's rows are filed under: the deployment, not a product. */
export const DEPLOYMENT_SCOPE = "";

export type Values = Readonly<Record<string, string>>;

/**
 * ⚠️ THE APP IS A PARAMETER RATHER THAN A DEFAULT, and that is deliberate. A
 * default would be one call site away from reading the deployment's rows and
 * calling them a product's — which is the defect this signature exists to make
 * unwritable. The shared store is read with `DEPLOYMENT_SCOPE`.
 */
export async function readAll(db: SqlHandle | null, appId: string): Promise<Values> {
  if (!db) return {};
  const rows = await db.all<{ key: string; value: string }>(
    `SELECT key, value FROM app_config WHERE app_id = ?`, appId,
  ).catch(() => []);
  const out: Record<string, string> = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

/**
 * SEED A VALUE ONLY WHERE THERE IS NONE.
 *
 * ⚠️ IT IS NOT `writeOne` WITH A DIFFERENT NAME, and the difference is what a
 * deployment's first day depends on. Provisioning seeds a mail sender so the
 * bootstrap deadlock can be broken — reaching the console needs a session, which
 * needs a code, which needs mail — and it runs again on every re-provision. An
 * upsert there would reset a live deployment's configured sender each time,
 * silently, back to whatever the automation shipped with.
 */
export async function seedOne(db: SqlHandle, appId: string, key: string, value: string, at: Instant): Promise<void> {
  await db.run(
    `INSERT INTO app_config (app_id, key, value, at) VALUES (?, ?, ?, ?) ON CONFLICT(app_id, key) DO NOTHING`,
    appId, key, value, at,
  );
}

export async function writeOne(db: SqlHandle, appId: string, key: string, value: string, at: Instant): Promise<void> {
  await db.run(
    `INSERT INTO app_config (app_id, key, value, at) VALUES (?, ?, ?, ?)
     ON CONFLICT(app_id, key) DO UPDATE SET value = excluded.value, at = excluded.at`,
    appId, key, value, at,
  );
}

/* -------------------------------------------------------------- the read --- */

export interface Line {
  readonly key: string;
  /** ⚠️ A secret's VALUE never travels; `true` means it is set. */
  readonly value: string | boolean;
  readonly secret: boolean;
  readonly shared: boolean;
  /**
   * ⚠️ WHERE THE LIVE VALUE CAME FROM, because "it is set" and "it is set HERE"
   * are different answers with different fixes. An operator looking at a key
   * that resolves from the shared store and typing a local value has just
   * pinned this app to a copy that will not follow the next rotation — and
   * nothing would tell them, without this.
   */
  readonly source: "app" | "shared" | "unset";
}

export function lines(local: Values, shared: Values, registry: ConfigRegistry): readonly Line[] {
  const resolved = resolveConfig(local, shared, registry);
  const shown = redactConfig(resolved, registry);
  return Object.entries(registry).map(([key, spec]) => ({
    key,
    value: shown[key] ?? "",
    secret: spec.secret,
    shared: spec.shared,
    source: (local[key] ?? "") !== "" ? "app" : (resolved[key] ?? "") !== "" ? "shared" : "unset",
  }));
}

/* ------------------------------------------------------------- the write --- */

export type ConfigRefusal = "unknown_key" | "not_shareable";

/**
 * Whether this write may happen, before anything is written.
 *
 * ⚠️ CHECKED ON WRITE, NOT ONLY ON READ. An unshared key written into the shared
 * store is invisible until a second app resolves it, and by then it is another
 * product's problem with no trace of where it came from. Refusing at the door
 * keeps the blast radius at one bad request.
 */
export function refuseWrite(key: string, scope: "app" | "shared", registry: ConfigRegistry): ConfigRefusal | null {
  if (!(key in registry)) return "unknown_key";
  if (scope === "shared" && !writableToShared(key, registry)) return "not_shareable";
  return null;
}

/* ------------------------------------------------------------ chargeable --- */

/**
 * Whether this deployment can actually take money.
 *
 * ⚠️ DERIVED, NEVER DECLARED. It was a boolean an app passed in, which means the
 * gate that holds an unpaid workspace to setup could say "we can charge" while
 * the payment provider had no key at all — and the failure is not a 500, it is
 * every workspace on a self-host stranded in setup over OUR misconfiguration.
 * Reading the same rows the payment lane reads is the only version that cannot
 * drift.
 *
 * ⚠️ AND THE MODE PICKS THE LANE. Test and live keys are stored separately and
 * both at once, so going live is a mode change rather than a re-paste — and a
 * deployment in live mode with only a test key configured is NOT chargeable,
 * which is the honest answer rather than a checkout that fails at the till.
 */
export function chargeableFrom(values: Values): boolean {
  const mode = values["stripe.mode"] === "live" ? "live" : "test";
  return (values[`stripe.${mode}.secret_key`] ?? "") !== "";
}

/* ------------------------------------------------------------- the models --- */

/**
 * The model catalogue, shared.
 *
 * ⚠️ IT LIVES IN THE SHARED STORE BECAUSE A RATE IS THE SAME EVERYWHERE. One
 * Google account, one price list; holding a copy per app means a price change is
 * a deploy per app, or one app quietly keeps the old number — and the old number
 * is not a cosmetic error. The reserve is the cap on what may be charged, so
 * every unit an out-of-date rate fails to count is a unit the platform pays for
 * and nobody is billed, silently, on every call.
 *
 * ⚠️ WHAT IS NOT HERE: which models a product turns ON, what it asks them for,
 * and how often one person may ask. Those are the app's, and a platform holding
 * them would be a platform every product had to be edited into.
 */
export const MODEL_SCHEMA: SchemaModule = {
  /** ⚠️ Global: what a model costs is the same behind every product, so a rate is one row rather than a deploy per app. */
  global: "deployment",
  id: "ai_model",
  ddl: [
    `CREATE TABLE IF NOT EXISTS ai_model (id TEXT PRIMARY KEY, provider TEXT NOT NULL, lanes TEXT NOT NULL DEFAULT 'text', rate_input REAL NOT NULL, rate_output REAL NOT NULL, per_output REAL, attachment_units REAL, markup REAL NOT NULL DEFAULT 1, thinking INTEGER, enabled INTEGER NOT NULL DEFAULT 1, retires_at TEXT, replaced_by TEXT, at TEXT NOT NULL);`,
  ],
};

/**
 * The whole catalogue, as every product behind this deployment sees it.
 *
 * ⚠️ NOT FILTERED BY APP, and that is the change. It used to answer with rates
 * for models an app had already declared, so an operator adding one reached
 * nobody until every manifest was edited and redeployed. An app declares
 * ACTIONS; which models can serve them is this table.
 */
export async function readCatalogue(db: SqlHandle | null): Promise<Catalogue> {
  if (!db) return [];
  const rows = await db.all<{
    id: string; provider: string; lanes: string; rate_input: number; rate_output: number;
    per_output: number | null; attachment_units: number | null; markup: number; thinking: number | null;
    enabled: number; retires_at: string | null; replaced_by: string | null;
  }>(
    /* unbounded-read: a deployment's model catalogue — tens of rows, synced from
       two price lists, and there is no per-workspace growth behind it. */
    `SELECT id, provider, lanes, rate_input, rate_output, per_output, attachment_units, markup, thinking, enabled, retires_at, replaced_by FROM ai_model ORDER BY lanes, id`,
  ).catch(() => []);
  return rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    /* ⚠️ A LIST, because one model serves several modalities — a Gemini text
       model is priced for pictures on the same row. */
    lanes: r.lanes.split(",").map((l) => l.trim()).filter(Boolean) as ModelSpec["lanes"],
    rate: { input: r.rate_input, output: r.rate_output },
    ...(r.per_output === null ? {} : { perOutput: r.per_output }),
    ...(r.attachment_units === null ? {} : { attachmentUnits: r.attachment_units }),
    markup: r.markup,
    /* ⚠️ Null is "not a reasoning model", which is also what absent means. */
    ...(r.thinking === null ? {} : { thinking: r.thinking === 1 }),
    enabled: r.enabled === 1,
    ...(r.retires_at === null ? {} : { retiresAt: r.retires_at }),
    ...(r.replaced_by === null ? {} : { replacedBy: r.replaced_by }),
  }));
}

/**
 * Write one catalogue row.
 *
 * ⚠️ EVERY REFUSAL IS CHECKED HERE TOO, AND NOT AS A COPY OF THE COMPOSITION
 * CHECK. That one reads a manifest at boot; this is a live write from a console,
 * and a bad row is wrong for every app behind this store at once — a rate of
 * zero makes a model unmetered everywhere, a markup of zero sells every call at
 * cost, and an attaching lane with no attachment price succeeds while the
 * platform pays for every picture.
 */
export function refuseModel(m: ModelSpec): readonly string[] {
  return modelProblems(m);
}

export async function writeModel(db: SqlHandle, m: ModelSpec, at: Instant): Promise<void> {
  await db.run(
    `INSERT INTO ai_model (id, provider, lanes, rate_input, rate_output, per_output, attachment_units, markup, thinking, enabled, retires_at, replaced_by, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET provider = excluded.provider, lanes = excluded.lanes,
       rate_input = excluded.rate_input, rate_output = excluded.rate_output,
       per_output = excluded.per_output, attachment_units = excluded.attachment_units,
       markup = excluded.markup, thinking = excluded.thinking, enabled = excluded.enabled,
       retires_at = excluded.retires_at, replaced_by = excluded.replaced_by, at = excluded.at`,
    m.id, m.provider, m.lanes.join(","), m.rate.input, m.rate.output,
    m.perOutput ?? null, m.attachmentUnits ?? null, m.markup,
    m.thinking === undefined ? null : m.thinking ? 1 : 0, m.enabled ? 1 : 0,
    m.retiresAt ?? null, m.replacedBy ?? null, at,
  );
}

/**
 * ⚠️ TURNING A MODEL OFF IS NOT DELETING IT. The row carries the rate every past
 * generation was settled against and the history that explains a bill; deleting
 * it makes those unreadable to answer a question that a flag answers.
 */
export async function setModelEnabled(db: SqlHandle, id: string, enabled: boolean, at: Instant): Promise<boolean> {
  const found = await db.first<{ id: string }>(`SELECT id FROM ai_model WHERE id = ?`, id).catch(() => null);
  if (!found) return false;
  await db.run(`UPDATE ai_model SET enabled = ?, at = ? WHERE id = ?`, enabled ? 1 : 0, at, id);
  return true;
}
