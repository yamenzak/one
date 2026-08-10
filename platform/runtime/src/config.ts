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

import type { Instant, ConfigRegistry, SchemaModule, SqlHandle } from "@one/kernel";
import { redactConfig, resolveConfig, writableToShared } from "@one/kernel";

/**
 * ⚠️ ONE TABLE, IN BOTH STORES, WITH THE SAME SHAPE. The shared store is another
 * database with this table in it — not a different schema, because the two are
 * read by one resolver and a second shape would be a second reader.
 */
export const CONFIG_SCHEMA: SchemaModule = {
  id: "config",
  ddl: [`CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, at TEXT NOT NULL);`],
};

export type Values = Readonly<Record<string, string>>;

export async function readAll(db: SqlHandle | null): Promise<Values> {
  if (!db) return {};
  const rows = await db.all<{ key: string; value: string }>(`SELECT key, value FROM app_config`).catch(() => []);
  const out: Record<string, string> = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

export async function writeOne(db: SqlHandle, key: string, value: string, at: Instant): Promise<void> {
  await db.run(
    `INSERT INTO app_config (key, value, at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, at = excluded.at`,
    key, value, at,
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
