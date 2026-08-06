/**
 * Reusable widget profiles (§17) — a scene graph authored at a design resolution
 * and scaled to each device. A profile is tenant-owned and referenced by any
 * number of channels, so one edit updates every channel that uses it. Replaces
 * the old per-channel widget layer stored in KV.
 */
import { ensureSchema, DEMO_TENANT } from "./db.js";
import { Widget, type Widget as WidgetT } from "@scena/manifest";

function rid(prefix: string): string {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return `${prefix}_${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Canonicalize a profile's scene graph to manifest `Widget` shape. The
 * WidgetBuilder authors nodes with a flat `{x,y,w,h}`, but the manifest (and the
 * player) require a `rect` tuple — so a profile saved by the builder can't be
 * compiled as-is. Accept both shapes, convert flat → rect, and validate each
 * node against the schema (dropping anything invalid rather than failing the
 * whole publish). Applied on both read and write so existing profiles are
 * repaired at compile time without needing a re-save.
 */
export function normalizeWidgets(raw: unknown): WidgetT[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: WidgetT[] = [];
  for (const w of arr) {
    const o: Record<string, unknown> = { ...((w as Record<string, unknown>) ?? {}) };
    if (!Array.isArray(o.rect) && ["x", "y", "w", "h"].every((k) => typeof o[k] === "number")) {
      o.rect = [Math.round(o.x as number), Math.round(o.y as number), Math.round(o.w as number), Math.round(o.h as number)];
      delete o.x; delete o.y; delete o.w; delete o.h;
    }
    const parsed = Widget.safeParse(o);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export interface WidgetProfileRow {
  id: string;
  tenant_id: string;
  name: string;
  design_w: number | null;
  design_h: number | null;
  widgets_json: string | null;
  created_at: number;
}

export async function createWidgetProfile(
  db: D1Database,
  name: string,
  opts: { tenantId?: string; designW?: number; designH?: number; widgets?: unknown } = {},
): Promise<string> {
  await ensureSchema(db);
  const id = rid("wp");
  await db
    .prepare("INSERT INTO widget_profiles (id, tenant_id, name, design_w, design_h, widgets_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, opts.tenantId ?? DEMO_TENANT, name || "Widget profile", opts.designW ?? 1920, opts.designH ?? 1080, JSON.stringify(normalizeWidgets(opts.widgets ?? [])), Date.now())
    .run();
  return id;
}

export async function listWidgetProfiles(db: D1Database, tenantId = DEMO_TENANT): Promise<WidgetProfileRow[]> {
  await ensureSchema(db);
  const r = await db.prepare("SELECT * FROM widget_profiles WHERE tenant_id = ? ORDER BY created_at DESC").bind(tenantId).all<WidgetProfileRow>();
  return r.results ?? [];
}

export async function getWidgetProfile(db: D1Database, id: string): Promise<WidgetProfileRow | null> {
  await ensureSchema(db);
  return db.prepare("SELECT * FROM widget_profiles WHERE id = ?").bind(id).first<WidgetProfileRow>();
}

/** Canonical manifest-shape scene graph for a profile (empty if unset/invalid). */
export async function getProfileWidgets(db: D1Database, id: string): Promise<WidgetT[]> {
  const row = await getWidgetProfile(db, id);
  if (!row?.widgets_json) return [];
  try {
    return normalizeWidgets(JSON.parse(row.widgets_json));
  } catch {
    return [];
  }
}

export async function saveProfileWidgets(db: D1Database, id: string, widgets: unknown): Promise<void> {
  await ensureSchema(db);
  // Store canonical manifest shape (rect tuples), so the compiler and the
  // builder (which hydrates either shape) both read it back cleanly.
  await db.prepare("UPDATE widget_profiles SET widgets_json = ? WHERE id = ?").bind(JSON.stringify(normalizeWidgets(widgets)), id).run();
}

export async function updateWidgetProfile(db: D1Database, id: string, patch: { name?: string; designW?: number; designH?: number }): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.name !== undefined) { sets.push("name = ?"); vals.push(patch.name); }
  if (patch.designW !== undefined) { sets.push("design_w = ?"); vals.push(patch.designW); }
  if (patch.designH !== undefined) { sets.push("design_h = ?"); vals.push(patch.designH); }
  if (!sets.length) return;
  vals.push(id);
  await db.prepare(`UPDATE widget_profiles SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
}

export async function deleteWidgetProfile(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM widget_profiles WHERE id = ?").bind(id).run();
  await db.prepare("UPDATE channels SET widget_profile_id = NULL WHERE widget_profile_id = ?").bind(id).run();
}
