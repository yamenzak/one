/**
 * A WORKSPACE'S OWN CHOICES, STORED.
 *
 * ⚠️ THE ROW IS SCOPED AND THE KEY IS DECLARED. Both halves matter: the tenant
 * column is what stops one studio reading another's, and the registry is what
 * stops the table becoming a bag of strings nobody can migrate or render.
 *
 * ⚠️ AND IT IS A REGIONAL TABLE, NOT A DIRECTORY ONE. A setting is about a
 * workspace's own behaviour, so it belongs beside the workspace's own data — the
 * exception being the three branding keys, which the sign-in screen needs before
 * there is a tenancy to resolve. Those are published to the directory as they are
 * written, which is why `publishBranding` exists rather than a second store.
 */

import type { SchemaModule, SettingsSpec, SqlHandle } from "@one/kernel";
import { refuseSetting, settingsOf, type SettingRefusal } from "@one/kernel";

export const SETTINGS_SCHEMA: SchemaModule = {
  id: "settings",
  ddl: [
    `CREATE TABLE IF NOT EXISTS tenant_settings (tenant_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (tenant_id, key));`,
  ],
  scoped: { tenantColumn: "tenant_id", tenantTables: ["tenant_settings"] },
};

/** Every stored value for one workspace, raw. Undeclared keys are dropped. */
export async function storedSettings(db: SqlHandle, tenantId: string): Promise<Readonly<Record<string, string>>> {
  const rows = await db.all<{ key: string; value: string }>(
    `SELECT key, value FROM tenant_settings WHERE tenant_id = ?`, tenantId,
  ).catch(() => []);
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

/**
 * What this workspace has chosen, with the declared fallbacks applied.
 *
 * ⚠️ ONE READER, so an absent row means the same thing everywhere. Three
 * readers each deciding what "no row" means is three decisions, and the one that
 * differs is a lapse policy read as "never" by the sweep and "fourteen days" by
 * the screen that shows it.
 */
export async function readSettings(
  db: SqlHandle,
  spec: SettingsSpec,
  tenantId: string,
): Promise<Readonly<Record<string, string | number | boolean>>> {
  return settingsOf(spec, await storedSettings(db, tenantId));
}

/**
 * Store one.
 *
 * ⚠️ THE REFUSAL IS THE RETURN VALUE, NOT AN EXCEPTION. Every one of them is
 * something the person typing can fix — a colour that is not a colour, a number
 * out of range, a choice that is not on the list — and a caller that had to
 * catch would be a caller that catches everything.
 */
export async function writeSetting(
  db: SqlHandle,
  spec: SettingsSpec,
  tenantId: string,
  key: string,
  value: unknown,
  at: string,
): Promise<SettingRefusal | null> {
  const refused = refuseSetting(spec, key, value);
  if (refused) return refused;
  await db.run(
    `INSERT INTO tenant_settings (tenant_id, key, value, at) VALUES (?, ?, ?, ?)
     ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value, at = excluded.at`,
    tenantId, key, String(value), at,
  );
  return null;
}

/* -------------------------------------------------------------- branding --- */

/**
 * ⚠️ THE THREE BRANDING KEYS TRAVEL TO THE DIRECTORY, and this is the one place
 * a setting is written twice on purpose.
 *
 * The sign-in screen wears a workspace's name and colour, and it renders BEFORE
 * there is a session — so before there is a tenancy whose regional database
 * could be read. Resolving the host already reads the directory, so the branding
 * rides along with it and a cold sign-in shows the right name rather than
 * flashing the product's own and then correcting itself.
 *
 * ⚠️ IT IS A COPY, NOT A SECOND SOURCE. The regional row is authoritative and
 * this is refreshed from it on every write; a read that disagreed would resolve
 * to the workspace's own answer everywhere except the one screen that cannot ask.
 */
export const BRANDING_KEYS = ["brand.name", "brand.mark", "brand.accent"] as const;

export async function publishBranding(
  directory: SqlHandle,
  tenantId: string,
  branding: Readonly<Record<string, string>>,
): Promise<void> {
  await directory.run(
    `UPDATE tenant_directory SET branding = ? WHERE tenant_id = ?`,
    JSON.stringify(branding), tenantId,
  ).catch(() => undefined);
}
