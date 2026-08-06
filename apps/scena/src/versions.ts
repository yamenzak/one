/**
 * Versioning & rollback (BLUEPRINT §10).
 *
 * Every manifest is immutable, content-hashed, and versioned — so history and
 * rollback come almost for free. **Publish** compiles the current draft, appends
 * it as version N (a full manifest snapshot in D1), and moves the KV "current"
 * pointer to it. Screens fetch whatever the pointer names. **Rollback** is just
 * repointing to an earlier version and firing the same nudge (§9) — no recompile,
 * and often instant on screens because assets are content-addressed and the older
 * version's media is usually still cached.
 *
 * Publish and serve run on the same Worker origin, so the absolute asset URLs the
 * compiler bakes are correct for whoever fetches the snapshot.
 */

import { parseManifest, hashManifest, type Manifest } from "@scena/manifest";
import { ensureSchema } from "./db.js";
import { compileManifest } from "./content.js";
import { tenantEntitlements } from "./billing-store.js";
import type { Env } from "./env.js";

export interface VersionRow {
  id: string;
  channel_id: string;
  version: number;
  hash: string;
  note: string | null;
  published_by: string | null;
  created_at: number;
}

const curKey = (channelId: string) => `manifest:cur:${channelId}`;

async function maxVersion(db: D1Database, channelId: string): Promise<number> {
  await ensureSchema(db);
  const row = await db.prepare("SELECT COALESCE(MAX(version), 0) AS v FROM manifest_versions WHERE channel_id = ?").bind(channelId).first<{ v: number }>();
  return row?.v ?? 0;
}

/**
 * Compile the current draft and append it as the next version, then point the
 * channel at it. Returns the new version + content hash. Retention pruning keeps
 * the plan's `historyVersions` newest snapshots (never dropping the live one).
 */
export async function publishVersion(
  env: Env,
  channelId: string,
  origin: string,
  opts: { note?: string; publishedBy?: string } = {},
): Promise<{ version: number; hash: string } | null> {
  const compiled = await compileManifest(env, channelId, origin);
  if (!compiled) return null;
  const version = (await maxVersion(env.DB, channelId)) + 1;
  const manifest: Manifest = { ...compiled, version };
  const hash = await hashManifest(manifest);

  await env.DB
    .prepare("INSERT INTO manifest_versions (id, channel_id, version, hash, note, published_by, created_at, manifest_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(`ver_${randomHex(8)}`, channelId, version, hash, opts.note ?? null, opts.publishedBy ?? null, Date.now(), JSON.stringify(manifest))
    .run();
  await env.PAIRING.put(curKey(channelId), String(version));
  await prune(env, channelId, version);
  return { version, hash };
}

/** The live manifest a screen should run: the currently-pointed snapshot. Lazily
 *  publishes v1 the first time a channel is fetched so history always exists. */
export async function currentManifest(env: Env, channelId: string, origin: string): Promise<Manifest | null> {
  const ptr = await env.PAIRING.get(curKey(channelId));
  if (ptr) {
    const row = await env.DB.prepare("SELECT manifest_json FROM manifest_versions WHERE channel_id = ? AND version = ?").bind(channelId, Number(ptr)).first<{ manifest_json: string }>();
    if (row) {
      try {
        return parseManifest(JSON.parse(row.manifest_json));
      } catch {
        /* corrupt snapshot — fall through to republish */
      }
    }
  }
  // No pointer (or a missing snapshot): publish v1 from the live draft.
  const published = await publishVersion(env, channelId, origin, { note: "Initial publish", publishedBy: "system" });
  if (!published) return null;
  const row = await env.DB.prepare("SELECT manifest_json FROM manifest_versions WHERE channel_id = ? AND version = ?").bind(channelId, published.version).first<{ manifest_json: string }>();
  return row ? parseManifest(JSON.parse(row.manifest_json)) : null;
}

/** Repoint the channel at an earlier version (§10). No recompile. */
export async function rollbackTo(env: Env, channelId: string, version: number): Promise<{ ok: boolean; version?: number }> {
  const row = await env.DB.prepare("SELECT version FROM manifest_versions WHERE channel_id = ? AND version = ?").bind(channelId, version).first<{ version: number }>();
  if (!row) return { ok: false };
  await env.PAIRING.put(curKey(channelId), String(version));
  return { ok: true, version };
}

export async function currentVersion(env: Env, channelId: string): Promise<number | null> {
  const ptr = await env.PAIRING.get(curKey(channelId));
  return ptr ? Number(ptr) : null;
}

/**
 * Is there anything to publish? Compile the draft from the current composition
 * and compare its content hash to the live version's. hashManifest ignores the
 * version counter + asset table, so this is a true content diff (§10).
 */
export async function publishState(env: Env, channelId: string, origin: string): Promise<{ dirty: boolean; liveVersion: number | null }> {
  const liveVersion = await currentVersion(env, channelId);
  const draft = await compileManifest(env, channelId, origin);
  if (!draft) return { dirty: false, liveVersion };
  if (liveVersion == null) return { dirty: true, liveVersion: null };
  const row = await env.DB.prepare("SELECT hash FROM manifest_versions WHERE channel_id = ? AND version = ?").bind(channelId, liveVersion).first<{ hash: string }>();
  if (!row) return { dirty: true, liveVersion };
  const draftHash = await hashManifest(draft);
  return { dirty: row.hash !== draftHash, liveVersion };
}

/** Set/clear the human label on a published version (§10). */
export async function setVersionNote(db: D1Database, channelId: string, version: number, note: string): Promise<void> {
  await ensureSchema(db);
  await db.prepare("UPDATE manifest_versions SET note = ? WHERE channel_id = ? AND version = ?").bind(note, channelId, version).run();
}

/** Version metadata (newest first) for the history list — no manifest blobs. */
export async function listVersions(db: D1Database, channelId: string): Promise<VersionRow[]> {
  await ensureSchema(db);
  const res = await db.prepare("SELECT id, channel_id, version, hash, note, published_by, created_at FROM manifest_versions WHERE channel_id = ? ORDER BY version DESC").bind(channelId).all<VersionRow>();
  return res.results ?? [];
}

/** A specific version's full manifest, for preview/diff (§10). */
export async function getVersionManifest(db: D1Database, channelId: string, version: number): Promise<Manifest | null> {
  await ensureSchema(db);
  const row = await db.prepare("SELECT manifest_json FROM manifest_versions WHERE channel_id = ? AND version = ?").bind(channelId, version).first<{ manifest_json: string }>();
  if (!row) return null;
  try {
    return parseManifest(JSON.parse(row.manifest_json));
  } catch {
    return null;
  }
}

/** The most snapshots we ever retain per channel, regardless of plan. Rollback
 *  is only ever used against the last handful of publishes, so keeping more than
 *  this is pure storage cost (each snapshot embeds the full compiled manifest).
 *  A hard cap trims heavy plans immediately, without needing a re-seed. */
const HISTORY_CAP = 20;

/** Keep the plan's `historyVersions` newest snapshots (capped); never drop the
 *  live one. */
async function prune(env: Env, channelId: string, liveVersion: number): Promise<void> {
  const quota = (await tenantEntitlements(env.DB).catch(() => null))?.quotas.historyVersions ?? 10;
  const keep = Math.min(HISTORY_CAP, Math.max(1, quota));
  const rows = await env.DB.prepare("SELECT version FROM manifest_versions WHERE channel_id = ? ORDER BY version DESC").bind(channelId).all<{ version: number }>();
  const versions = (rows.results ?? []).map((r) => r.version);
  const survivors = new Set(versions.slice(0, keep));
  survivors.add(liveVersion);
  const doomed = versions.filter((v) => !survivors.has(v));
  if (doomed.length) {
    const placeholders = doomed.map(() => "?").join(",");
    await env.DB.prepare(`DELETE FROM manifest_versions WHERE channel_id = ? AND version IN (${placeholders})`).bind(channelId, ...doomed).run();
  }
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}
