/**
 * Ads & interrupts store (BLUEPRINT §21).
 *
 * An ad is a scheduled interrupt that belongs to a reusable **ad profile** (a
 * named rotation). A channel binds a profile (`channels.ad_profile_id`), so many
 * channels can share one rotation. The pure `scheduleAds` decides which ads are
 * due at a given instant and when the ChannelDO should wake next; the DB helpers
 * are the usual ensureSchema-first CRUD. Keeping the scheduler pure means it is
 * unit-tested in isolation, exactly like the daypart resolver.
 */

import { ensureSchema, DEMO_TENANT } from "./db.js";

export type AdKind = "audio" | "video" | "command";

export interface AdRow {
  id: string;
  tenant_id: string;
  profile_id: string | null;
  name: string;
  kind: string;
  audio_url: string | null;
  video_url: string | null;
  html: string | null;
  duration_ms: number;
  every_min: number;
  mode: string; // immediate | after_slide (after_slide reserved for a later pass)
  enabled: number;
  created_at: number;
  hide_badge: number; // audio ads: 1 = no on-screen badge (silent overlay)
  companion_url: string | null; // audio ads: optional still creative shown full-bleed during the window
}

/** A reusable ad rotation, owned by the tenant and bound by channels. */
export interface AdProfileRow {
  id: string;
  tenant_id: string;
  name: string;
  created_at: number;
  tags: string | null;
}

/* ------------------------------ pure scheduler --------------------------- */

export interface AdSchedule {
  id: string;
  everyMin: number;
  /** Next time this ad is due to fire (ms epoch). */
  nextDueAt: number;
}

export interface ScheduleResult {
  /** Ad ids due to fire now. */
  fire: string[];
  /** Updated schedule (advanced nextDueAt for anything that fired). */
  schedule: AdSchedule[];
  /** When the ChannelDO should next wake, or null if nothing is scheduled. */
  nextAlarm: number | null;
}

/**
 * Decide which ads fire at `now` and advance their cadence. An ad with no prior
 * `nextDueAt` is seeded one interval out (it does not fire the instant it is
 * enabled). Pure — no I/O, no Date.now().
 */
export function scheduleAds(ads: AdSchedule[], now: number): ScheduleResult {
  const fire: string[] = [];
  const schedule: AdSchedule[] = ads.map((a) => {
    const every = Math.max(1, a.everyMin) * 60_000;
    let next = a.nextDueAt || now + every;
    if (next <= now) {
      fire.push(a.id);
      next = now + every;
    }
    return { id: a.id, everyMin: a.everyMin, nextDueAt: next };
  });
  const times = schedule.map((s) => s.nextDueAt);
  return { fire, schedule, nextAlarm: times.length ? Math.min(...times) : null };
}

/* ----------------------------- ad profiles ------------------------------- */

export interface AdProfileSummary extends AdProfileRow {
  adCount: number;
  channelCount: number;
}

export async function listAdProfiles(db: D1Database, tenantId = DEMO_TENANT): Promise<AdProfileSummary[]> {
  await ensureSchema(db);
  const res = await db.prepare("SELECT * FROM ad_profiles WHERE tenant_id = ? ORDER BY created_at DESC").bind(tenantId).all<AdProfileRow>();
  const profiles = res.results ?? [];
  return Promise.all(
    profiles.map(async (p) => {
      const ad = await db.prepare("SELECT COUNT(*) AS n FROM ads WHERE profile_id = ?").bind(p.id).first<{ n: number }>();
      const ch = await db.prepare("SELECT COUNT(*) AS n FROM channels WHERE ad_profile_id = ?").bind(p.id).first<{ n: number }>();
      return { ...p, adCount: ad?.n ?? 0, channelCount: ch?.n ?? 0 };
    }),
  );
}

export async function createAdProfile(db: D1Database, name: string, tenantId = DEMO_TENANT): Promise<string> {
  await ensureSchema(db);
  const id = `adp_${randomHex(6)}`;
  await db.prepare("INSERT INTO ad_profiles (id, tenant_id, name, created_at, tags) VALUES (?, ?, ?, ?, NULL)").bind(id, tenantId, name || "Ad profile", Date.now()).run();
  return id;
}

export async function getAdProfile(db: D1Database, id: string): Promise<AdProfileRow | null> {
  await ensureSchema(db);
  return db.prepare("SELECT * FROM ad_profiles WHERE id = ?").bind(id).first<AdProfileRow>();
}

export async function updateAdProfile(db: D1Database, id: string, patch: { name?: string; tags?: string[] }): Promise<void> {
  await ensureSchema(db);
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.name !== undefined) { sets.push("name = ?"); vals.push(patch.name.slice(0, 120)); }
  if (patch.tags !== undefined) { sets.push("tags = ?"); vals.push(patch.tags.length ? JSON.stringify(patch.tags) : null); }
  if (!sets.length) return;
  vals.push(id);
  await db.prepare(`UPDATE ad_profiles SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
}

/** Delete a profile: drop its ads and detach it from every channel that bound it. */
export async function deleteAdProfile(db: D1Database, id: string): Promise<void> {
  await ensureSchema(db);
  await db.batch([
    db.prepare("DELETE FROM ads WHERE profile_id = ?").bind(id),
    db.prepare("UPDATE channels SET ad_profile_id = NULL WHERE ad_profile_id = ?").bind(id),
    db.prepare("DELETE FROM ad_profiles WHERE id = ?").bind(id),
  ]);
}

/** Channel ids that currently bind a given ad profile (for re-sync + play-now). */
export async function channelsUsingAdProfile(db: D1Database, profileId: string): Promise<string[]> {
  await ensureSchema(db);
  const r = await db.prepare("SELECT id FROM channels WHERE ad_profile_id = ?").bind(profileId).all<{ id: string }>();
  return (r.results ?? []).map((x) => x.id);
}

/* --------------------------------- ads ----------------------------------- */

export async function createAd(
  db: D1Database,
  ad: { profileId: string; name: string; kind: AdKind; audioUrl?: string; videoUrl?: string; html?: string; durationMs: number; everyMin: number; tenantId?: string; hideBadge?: boolean; companionUrl?: string },
): Promise<string> {
  await ensureSchema(db);
  const id = `ad_${randomHex(8)}`;
  // `mode` is always "immediate" — the "after_slide" variant was never
  // implemented (the ChannelDO fires purely on cadence), so it's not offered.
  await db
    .prepare(
      "INSERT INTO ads (id, tenant_id, profile_id, name, kind, audio_url, video_url, html, duration_ms, every_min, mode, enabled, created_at, hide_badge, companion_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'immediate', 1, ?, ?, ?)",
    )
    .bind(id, ad.tenantId ?? DEMO_TENANT, ad.profileId, ad.name || "Ad", ad.kind, ad.audioUrl ?? null, ad.videoUrl ?? null, ad.html ?? null, Math.max(1000, ad.durationMs), Math.max(1, ad.everyMin), Date.now(), ad.hideBadge ? 1 : 0, (ad.kind === "audio" && ad.companionUrl) ? ad.companionUrl : null)
    .run();
  return id;
}

/** Ads in a profile (the reusable rotation). */
export async function listAds(db: D1Database, profileId: string): Promise<AdRow[]> {
  await ensureSchema(db);
  const res = await db.prepare("SELECT * FROM ads WHERE profile_id = ? ORDER BY created_at").bind(profileId).all<AdRow>();
  return res.results ?? [];
}

export async function getAd(db: D1Database, id: string): Promise<AdRow | null> {
  await ensureSchema(db);
  return db.prepare("SELECT * FROM ads WHERE id = ?").bind(id).first<AdRow>();
}

export async function setAdEnabled(db: D1Database, id: string, enabled: boolean): Promise<void> {
  await ensureSchema(db);
  await db.prepare("UPDATE ads SET enabled = ? WHERE id = ?").bind(enabled ? 1 : 0, id).run();
}

export async function deleteAd(db: D1Database, id: string): Promise<void> {
  await ensureSchema(db);
  await db.prepare("DELETE FROM ads WHERE id = ?").bind(id).run();
}

/**
 * Enabled ads to schedule on a channel, shaped for the ChannelDO. Resolves via
 * the channel's bound ad profile; a channel with no profile has no ads.
 */
export async function enabledAdSchedules(db: D1Database, channelId: string): Promise<AdSchedule[]> {
  await ensureSchema(db);
  const ch = await db.prepare("SELECT ad_profile_id FROM channels WHERE id = ?").bind(channelId).first<{ ad_profile_id: string | null }>();
  if (!ch?.ad_profile_id) return [];
  const res = await db.prepare("SELECT id, every_min FROM ads WHERE profile_id = ? AND enabled = 1").bind(ch.ad_profile_id).all<{ id: string; every_min: number }>();
  return (res.results ?? []).map((a) => ({ id: a.id, everyMin: a.every_min, nextDueAt: 0 }));
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}
