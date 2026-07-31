/**
 * `app_config` — the platform's own runtime-tunable settings.
 *
 * One flat key/value table, read whole. It holds the things an operator must be
 * able to change on a running deployment without a redeploy: API credentials for
 * third parties, the schema markers, catalog version stamps. NOT a tenant's
 * settings (those are per-tenant rows) and NOT a place for anything a package
 * could hold in code.
 *
 * Keys are namespaced by the package that owns them — `stripe.*`, `cf.saas.*`,
 * `google.*`, `schema:*` — so `getConfig` can be read once per request and
 * dereferenced by several packages without each one paying its own query.
 *
 * Owned by core because core creates the table: the schema runner bootstraps
 * `app_config` before it can read a single marker, so anything else claiming it
 * would be claiming a table it did not create.
 */

const READ_ALL = "SELECT key, value FROM app_config";
const UPSERT =
  "INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value";

/** Every setting, as one object. Cheap enough to read per request. */
export async function getConfig(db: D1Database): Promise<Record<string, string>> {
  const r = await db.prepare(READ_ALL).all<{ key: string; value: string }>();
  return Object.fromEntries((r.results ?? []).map((row) => [row.key, row.value]));
}

export async function setConfig(db: D1Database, key: string, value: string): Promise<void> {
  await db.prepare(UPSERT).bind(key, value).run();
}
