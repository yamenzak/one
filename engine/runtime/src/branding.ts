/**
 * ONE WORKSPACE'S IDENTITY, ACROSS EVERY APP UNDER IT.
 *
 * ⚠️ IT IS THE WORKSPACE'S AND NEVER ONE APP'S. A business running three of our
 * products under one roof has one logo, one colour and one icon on the phone —
 * a brand held per app would give it three of everything, three places to change
 * them, and two of them stale the first time somebody edited one. Which SURFACES
 * exist is still the app's to declare, because only the app knows whether it
 * sends email or produces documents at all.
 *
 * ⚠️ AND IT LIVES IN THE DIRECTORY, NOT IN THE SHARD. The sign-in page and the
 * installable manifest are both read by somebody with no session, before any
 * workspace has been located and before there is a database to ask — so a brand
 * held beside the records would mean a flash of our colours on every cold start
 * of every branded workspace, which is precisely the moment it is meant to work.
 *
 * ⚠️ ONLY A COMMERCIAL WORKSPACE HAS ONE (`mayBrand`). A personal one is not
 * trading under anybody's name, so it wears ours — an honest default rather than
 * a withheld feature to be nagged about.
 */

import type { Branding, Kind, TenantId, Theme } from "@engine/kernel";
import { SURFACES, mayBrand, refuseTheme, type Surface } from "@engine/kernel";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";

/* ----------------------------------------------------------------- schema --- */

export const BRANDING_SCHEMA: SchemaModule = {
  id: "branding",
  statements: [
    `CREATE TABLE IF NOT EXISTS tenant_branding (tenant_id TEXT PRIMARY KEY, theme_json TEXT NOT NULL, surfaces_json TEXT NOT NULL, our_mark INTEGER NOT NULL DEFAULT 1, at TEXT NOT NULL);`,
    /* ⚠️ ADDED RATHER THAN PUT IN THE CREATE, because the table already exists
       on every deployment that has run. A column in a `CREATE TABLE IF NOT
       EXISTS` is a column no live database ever gets. */
    `ALTER TABLE tenant_branding ADD COLUMN reply_to TEXT;`,
  ],
};

/* ------------------------------------------------------------------ store --- */

/**
 * ⚠️ A WORKSPACE WITH NO ROW HAS NO BRAND, AND THAT IS `null` RATHER THAN AN
 * EMPTY THEME. An empty theme is a set of blank tokens every surface would
 * happily apply, which is a page painted in nothing; `null` is the answer every
 * reader already has a fallback for — ours.
 */
export async function brandingOf(db: Db, tenantId: TenantId): Promise<Branding | null> {
  try {
    const row = await db.prepare(
      `SELECT theme_json, surfaces_json, our_mark, reply_to FROM tenant_branding WHERE tenant_id = ?`)
      .bind(tenantId).first<{
        theme_json: string; surfaces_json: string; our_mark: number; reply_to: string | null;
      }>();
    if (!row) return null;
    return {
      theme: JSON.parse(row.theme_json) as Theme,
      surfaces: JSON.parse(row.surfaces_json) as readonly Surface[],
      ourMark: !!row.our_mark,
      ...(row.reply_to ? { replyTo: row.reply_to } : {}),
    };
  } catch {
    /*
      ⚠️ FAILS TO "NO BRAND", NEVER TO A THROW. A deployment that has not applied
      this module, or a row somebody hand-edited into invalid JSON, must cost a
      workspace its colours — not its sign-in page. This is read on the one path
      every cold start takes.
    */
    return null;
  }
}

/* ⚠️ FOUR REFUSALS, FOUR DIFFERENT THINGS TO DO NEXT. A bad reply address and an
   unreadable colour pair are both "invalid" to a route and nothing alike to the
   person holding the screen, so they are never one word. */
export type BrandRefusal =
  | "not_commercial" | "unreadable" | "not_a_surface" | "not_an_address";

/**
 * Set a workspace's brand.
 *
 * ⚠️ THE KIND IS CHECKED HERE AND NOT ONLY AT THE SCREEN. A control that is
 * hidden is not a control that is refused, and this row is read by the public
 * manifest route — so a write that got past a hidden button would put somebody
 * else's logo on an installable icon.
 *
 * ⚠️ AND AN UNREADABLE PAIR IS REFUSED RATHER THAN WARNED ABOUT. The person
 * choosing is not the person who has to read it, and they will never see the
 * problem: they are looking at their own screen, at their own brightness, having
 * already decided.
 */
export async function setBranding(
  db: Db,
  tenantId: TenantId,
  kind: Kind,
  wants: {
    readonly theme: Theme; readonly surfaces: readonly string[];
    readonly ourMark?: boolean; readonly replyTo?: string;
  },
  now = new Date(),
): Promise<Branding | BrandRefusal> {
  if (!mayBrand(kind)) return "not_commercial";
  if (refuseTheme(wants.theme).length) return "unreadable";
  if (wants.surfaces.some((s) => !SURFACES.includes(s as Surface))) return "not_a_surface";

  /* ⚠️ AN ADDRESS OR NOTHING — a reply going somewhere unreachable is worse
     than one going to a mailbox somebody chose not to read, because the sender
     is told it arrived. */
  const replyTo = (wants.replyTo ?? "").trim();
  if (replyTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) return "not_an_address";

  const branding: Branding = {
    theme: wants.theme,
    surfaces: wants.surfaces as readonly Surface[],
    ourMark: wants.ourMark ?? true,
    ...(replyTo ? { replyTo } : {}),
  };
  await db.prepare(
    `INSERT INTO tenant_branding (tenant_id, theme_json, surfaces_json, our_mark, reply_to, at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id) DO UPDATE SET theme_json = excluded.theme_json,
       surfaces_json = excluded.surfaces_json, our_mark = excluded.our_mark,
       reply_to = excluded.reply_to, at = excluded.at`)
    .bind(tenantId, JSON.stringify(branding.theme), JSON.stringify(branding.surfaces),
      branding.ourMark ? 1 : 0, branding.replyTo ?? null, now.toISOString()).run();
  return branding;
}

/**
 * ⚠️ ERASED WITH THE WORKSPACE, and it has to be said out loud here because this
 * table is in the DIRECTORY rather than in a shard — the cascade derived from
 * every app's collections cannot see it, and a logo left behind after a business
 * closed is their mark still on our infrastructure.
 */
export async function forgetBranding(db: Db, tenantId: TenantId): Promise<void> {
  await db.prepare(`DELETE FROM tenant_branding WHERE tenant_id = ?`).bind(tenantId).run();
}
