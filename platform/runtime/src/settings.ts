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

import type {
  NotificationRegistry, SchemaModule, SettingsSpec, SqlHandle, Wording, WordingBook, WordingRefusal,
} from "@one/kernel";
import { refuseSetting, refuseWording, settingsOf, type SettingRefusal } from "@one/kernel";

export const SETTINGS_SCHEMA: SchemaModule = {
  id: "settings",
  ddl: [
    `CREATE TABLE IF NOT EXISTS tenant_settings (tenant_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (tenant_id, key));`,
    /*
      ⚠️ ITS OWN TABLE RATHER THAN A SETTING PER NOTIFICATION TYPE. A key per
      type would put dozens of entries in a registry that is meant to be read
      whole by a screen, and every notification added later would need a matching
      declaration or silently stop being rephrasable. Here the REGISTRY is
      already the list of what may be reworded, so the table only has to hold
      what somebody typed.
    */
    `CREATE TABLE IF NOT EXISTS tenant_wording (tenant_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', at TEXT NOT NULL, PRIMARY KEY (tenant_id, type));`,
  ],
  scoped: { tenantColumn: "tenant_id", tenantTables: ["tenant_settings", "tenant_wording"] },
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

/* ---------------------------------------------------------------- wording --- */

/**
 * WHAT THIS WORKSPACE SAYS INSTEAD.
 *
 * ⚠️ READ ON EVERY DISPATCH AND EVERY INBOX READ, which is why it is one query
 * for the whole book rather than one per type. A notification going to eleven
 * people is one dispatch; a lookup per person per type would be a workspace's
 * whole copy read eleven times to send eleven copies of one sentence.
 */
export async function wordingFor(db: SqlHandle, tenantId: string): Promise<WordingBook> {
  const rows = await db.all<{ type: string; title: string; body: string }>(
    `SELECT type, title, body FROM tenant_wording WHERE tenant_id = ?`, tenantId,
  ).catch(() => []);
  const out: Record<string, { title?: string; body?: string }> = {};
  for (const r of rows) out[r.type] = { ...(r.title ? { title: r.title } : {}), ...(r.body ? { body: r.body } : {}) };
  return out;
}

/**
 * Store one rephrasing.
 *
 * ⚠️ THE REFUSAL IS THE RETURN VALUE, and every one of them is something the
 * person typing can fix — a type that is not theirs to phrase, a value they
 * reached for that this notification does not carry, a box left empty.
 */
export async function setWording(
  db: SqlHandle,
  registry: NotificationRegistry,
  tenantId: string,
  type: string,
  wording: Wording,
  at: string,
): Promise<WordingRefusal | null> {
  const refused = refuseWording(registry, type, wording);
  if (refused) return refused;
  await db.run(
    `INSERT INTO tenant_wording (tenant_id, type, title, body, at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, type) DO UPDATE SET title = excluded.title, body = excluded.body, at = excluded.at`,
    tenantId, type, (wording.title ?? "").trim(), (wording.body ?? "").trim(), at,
  );
  return null;
}

/**
 * ⚠️ CLEARING IS DELETING THE ROW, NOT SAVING AN EMPTY ONE. `saying` treats a
 * blank as "fall through", so the two would behave identically today — and the
 * day somebody makes a blank mean something, a workspace that pressed Reset
 * three months ago would start sending it.
 */
export const clearWording = (db: SqlHandle, tenantId: string, type: string): Promise<void> =>
  db.run(`DELETE FROM tenant_wording WHERE tenant_id = ? AND type = ?`, tenantId, type);
