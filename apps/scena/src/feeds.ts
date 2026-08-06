/**
 * Feeds (BLUEPRINT §19). A feed is a collection of items with a provider —
 * manual, or RSS (fetched + parsed on a Cron/refresh). Ticker/text widgets bind
 * to a feed by id and render its current items. Live boards (§20) are the
 * stateful cousin; feeds are fetched, not controller-driven.
 */

import { ensureSchema, DEMO_TENANT } from "./db.js";

/** The source providers. `manual`/`rss` keep their `{title,link}` items; `api`
 *  and `gsheet` fetch + normalize to a cached {columns,rows} dataset. */
export type SourceProvider = "manual" | "rss" | "api" | "gsheet";

export interface FeedRow {
  id: string;
  tenant_id: string;
  name: string;
  provider: string; // SourceProvider
  config_json: string;
  refresh_sec: number;
  updated_at: number;
  data_json?: string | null; // cached normalized dataset (api/gsheet)
  data_at?: number | null; // when the dataset was last fetched
}
export interface FeedItem {
  id: string;
  title: string;
  link: string | null;
}

/** The one shape every source normalizes to: a header row + string cells. */
export interface SourceDataset {
  columns: string[];
  rows: string[][];
}

export async function createFeed(
  db: D1Database,
  input: { name: string; provider: SourceProvider; config?: unknown; refreshSec?: number; minRefreshSec?: number; tenantId?: string },
): Promise<string> {
  await ensureSchema(db);
  const id = `fd_${randomHex(6)}`;
  await db
    .prepare("INSERT INTO feeds (id, tenant_id, name, provider, config_json, refresh_sec, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, input.tenantId ?? DEMO_TENANT, input.name || "Source", input.provider, JSON.stringify(input.config ?? {}), clampRefresh(input.refreshSec, input.minRefreshSec), Date.now())
    .run();
  return id;
}

/** Edit a source's name / config / frequency. Clears the cache so the next
 *  fetch reflects the new config immediately. */
export async function updateFeed(
  db: D1Database,
  id: string,
  patch: { name?: string; config?: unknown; refreshSec?: number; minRefreshSec?: number },
): Promise<void> {
  await ensureSchema(db);
  const cur = await getFeed(db, id);
  if (!cur) return;
  const name = patch.name != null ? patch.name : cur.name;
  const config = patch.config != null ? JSON.stringify(patch.config) : cur.config_json;
  const refresh = patch.refreshSec != null ? clampRefresh(patch.refreshSec, patch.minRefreshSec) : cur.refresh_sec;
  await db
    .prepare("UPDATE feeds SET name = ?, config_json = ?, refresh_sec = ?, data_json = NULL, data_at = NULL, updated_at = ? WHERE id = ?")
    .bind(name, config, refresh, Date.now(), id)
    .run();
}

/** Clamp the refresh interval to the plan's floor (never faster than 30s, to
 *  protect upstreams + our worker budget). `minSec` is the tenant's
 *  `feedRefreshMinSec` quota, so a fast interval can't beat the plan. */
function clampRefresh(sec?: number, minSec = 30): number {
  const floor = Math.max(30, Math.floor(Number.isFinite(minSec) ? minSec : 30));
  const n = Number(sec);
  return Number.isFinite(n) ? Math.max(floor, Math.floor(n)) : Math.max(floor, 900);
}

export async function listFeeds(db: D1Database, tenantId = DEMO_TENANT): Promise<FeedRow[]> {
  await ensureSchema(db);
  return (await db.prepare("SELECT * FROM feeds WHERE tenant_id = ? ORDER BY updated_at DESC").bind(tenantId).all<FeedRow>()).results ?? [];
}

export async function getFeed(db: D1Database, id: string): Promise<FeedRow | null> {
  await ensureSchema(db);
  return db.prepare("SELECT * FROM feeds WHERE id = ?").bind(id).first<FeedRow>();
}

export async function deleteFeed(db: D1Database, id: string): Promise<void> {
  await db.batch([db.prepare("DELETE FROM feeds WHERE id = ?").bind(id), db.prepare("DELETE FROM feed_items WHERE feed_id = ?").bind(id)]);
}

export async function listItems(db: D1Database, feedId: string): Promise<FeedItem[]> {
  await ensureSchema(db);
  const res = await db.prepare("SELECT id, title, link FROM feed_items WHERE feed_id = ? ORDER BY ord").bind(feedId).all<FeedItem>();
  return res.results ?? [];
}

/** Replace all items of a feed (used by manual reorder and RSS refresh). */
export async function setItems(db: D1Database, feedId: string, items: { title: string; link?: string }[]): Promise<void> {
  const now = Date.now();
  const stmts = [db.prepare("DELETE FROM feed_items WHERE feed_id = ?").bind(feedId)];
  items.forEach((it, i) =>
    stmts.push(
      db.prepare("INSERT INTO feed_items (id, feed_id, ord, title, link, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(`fi_${randomHex(6)}`, feedId, i, it.title, it.link ?? null, now),
    ),
  );
  await db.batch(stmts);
  await db.prepare("UPDATE feeds SET updated_at = ? WHERE id = ?").bind(now, feedId).run();
}

export async function addItem(db: D1Database, feedId: string, title: string, link?: string): Promise<void> {
  const items = await listItems(db, feedId);
  await setItems(db, feedId, [...items.map((i) => ({ title: i.title, link: i.link ?? undefined })), { title, link }]);
}

export async function deleteItem(db: D1Database, feedId: string, itemId: string): Promise<void> {
  await db.prepare("DELETE FROM feed_items WHERE id = ? AND feed_id = ?").bind(itemId, feedId).run();
}

/**
 * Refresh an RSS feed: fetch the XML and extract item titles + links. Uses a
 * tolerant regex rather than a DOM parser (Workers has no DOMParser); feeds are
 * low-stakes text so this is adequate and dependency-free.
 */
export async function refreshRss(db: D1Database, feed: FeedRow): Promise<number> {
  const cfg = safeJson(feed.config_json) as { url?: string; count?: number };
  if (!cfg.url) return 0;
  const res = await fetch(cfg.url, { headers: { "user-agent": "Scena/1.0 (+signage)" } });
  if (!res.ok) throw new Error(`rss fetch ${res.status}`);
  const xml = await res.text();
  const items = parseRss(xml).slice(0, clampCount(cfg.count));
  await setItems(db, feed.id, items);
  // Stamp the fetch time so refresh-on-read (getDataset) can rate-limit to the
  // source's refresh interval instead of re-fetching on every device poll.
  await db.prepare("UPDATE feeds SET data_at = ? WHERE id = ?").bind(Date.now(), feed.id).run();
  return items.length;
}

/** How many RSS entries to keep: caller-configured, default 30, capped at 100. */
function clampCount(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) && v >= 1 ? Math.min(100, Math.floor(v)) : 30;
}

export function parseRss(xml: string): { title: string; link: string }[] {
  const items: { title: string; link: string }[] = [];
  // Handle both RSS <item> and Atom <entry>.
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/(item|entry)>/gi) ?? [];
  for (const block of blocks) {
    const title = decodeXml(firstMatch(block, /<title\b[^>]*>([\s\S]*?)<\/title>/i));
    let link = firstMatch(block, /<link\b[^>]*>([\s\S]*?)<\/link>/i);
    if (!link) link = firstMatch(block, /<link\b[^>]*href=["']([^"']+)["']/i); // Atom
    if (title) items.push({ title: title.trim(), link: link.trim() });
  }
  return items;
}

/* =============================== sources (§sources) ====================== */

/** Coerce any JSON scalar/obj to a table cell string. */
function cellStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

/** Follow a dot/bracket path (e.g. `data.items[0].value`) into a JSON value. */
export function getPath(root: unknown, path: string): unknown {
  const p = (path ?? "").trim();
  if (!p) return root;
  const parts = p.replace(/\[(\d+)\]/g, ".$1").split(".").filter((s) => s !== "");
  let cur: unknown = root;
  for (const key of parts) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) cur = cur[Number(key)];
    else if (typeof cur === "object") cur = (cur as Record<string, unknown>)[key];
    else return undefined;
  }
  return cur;
}

/** Normalize any JSON value into a {columns,rows} table. */
export function jsonToDataset(value: unknown): SourceDataset {
  if (Array.isArray(value)) {
    if (value.length === 0) return { columns: [], rows: [] };
    const first = value[0];
    if (first && typeof first === "object" && !Array.isArray(first)) {
      // Array of objects → union of keys as columns (order from the first row,
      // then any extras), each object a row.
      const cols: string[] = [];
      for (const row of value) if (row && typeof row === "object") for (const k of Object.keys(row)) if (!cols.includes(k)) cols.push(k);
      const rows = value.map((row) => cols.map((c) => cellStr((row as Record<string, unknown>)?.[c])));
      return { columns: cols, rows };
    }
    if (Array.isArray(first)) {
      const width = Math.max(...value.map((r) => (Array.isArray(r) ? r.length : 0)));
      const cols = Array.from({ length: width }, (_, i) => `col${i + 1}`);
      return { columns: cols, rows: value.map((r) => cols.map((_, i) => cellStr((r as unknown[])?.[i]))) };
    }
    // Array of scalars → single "value" column.
    return { columns: ["value"], rows: value.map((v) => [cellStr(v)]) };
  }
  if (value && typeof value === "object") {
    // Object → key/value rows (a bag of named scalars, ideal for metrics).
    return { columns: ["key", "value"], rows: Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, cellStr(v)]) };
  }
  return { columns: ["value"], rows: [[cellStr(value)]] };
}

/** Parse CSV text (RFC-4180-ish: quotes, escaped quotes, embedded newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/** First non-empty CSV row is the header; the rest are data rows. */
export function csvToDataset(text: string): SourceDataset {
  const all = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (all.length === 0) return { columns: [], rows: [] };
  const [header, ...rest] = all;
  const columns = header!.map((c, i) => c.trim() || `col${i + 1}`);
  const rows = rest.map((r) => columns.map((_, i) => r[i] ?? ""));
  return { columns, rows };
}

/** Items table (rss/manual) → a two-column {title,link} dataset. */
export function itemsToDataset(items: FeedItem[]): SourceDataset {
  return { columns: ["title", "link"], rows: items.map((i) => [i.title, i.link ?? ""]) };
}

/** Build the public-CSV URL for a Google Sheet from a pasted URL or raw id. */
export function sheetCsvUrl(cfg: { sheetId?: string; url?: string; gid?: string }): string | null {
  const raw = str(cfg.url) || str(cfg.sheetId);
  if (!raw) return null;
  const idMatch = raw.match(/\/d\/([a-zA-Z0-9-_]+)/) || raw.match(/^([a-zA-Z0-9-_]{20,})$/);
  const id = idMatch?.[1];
  if (!id) return null;
  const gidMatch = raw.match(/[#&?]gid=(\d+)/);
  const gid = gidMatch?.[1] ?? str(cfg.gid) ?? "0";
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid || "0"}`;
}
function str(v: unknown): string { return typeof v === "string" ? v : ""; }

/** Fetch + normalize an API-JSON source. */
async function fetchApiDataset(cfg: { url?: string; path?: string; headers?: Record<string, string> }): Promise<SourceDataset> {
  const url = str(cfg.url);
  if (!url) return { columns: [], rows: [] };
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "Scena/1.0 (+signage)", ...(cfg.headers ?? {}) } });
  if (!res.ok) throw new Error(`api fetch ${res.status}`);
  const json = await res.json();
  return jsonToDataset(getPath(json, str(cfg.path)));
}

/** Fetch + normalize a public Google Sheet (as CSV). */
async function fetchSheetDataset(cfg: { sheetId?: string; url?: string; gid?: string }): Promise<SourceDataset> {
  const url = sheetCsvUrl(cfg);
  if (!url) return { columns: [], rows: [] };
  const res = await fetch(url, { headers: { "user-agent": "Scena/1.0 (+signage)" } });
  if (!res.ok) throw new Error(`sheet fetch ${res.status}`);
  return csvToDataset(await res.text());
}

/** Compute a source's dataset from its provider (network for api/gsheet). */
export async function computeDataset(db: D1Database, feed: FeedRow): Promise<SourceDataset> {
  const cfg = safeJson(feed.config_json) as Record<string, unknown>;
  if (feed.provider === "api") return fetchApiDataset(cfg);
  if (feed.provider === "gsheet") return fetchSheetDataset(cfg);
  // manual/rss are backed by feed_items.
  return itemsToDataset(await listItems(db, feed.id));
}

/** Fetch + cache a source's dataset. Returns the row count. */
export async function refreshSource(db: D1Database, feed: FeedRow): Promise<number> {
  const ds = await computeDataset(db, feed);
  const now = Date.now();
  await db.prepare("UPDATE feeds SET data_json = ?, data_at = ? WHERE id = ?").bind(JSON.stringify(ds), now, feed.id).run();
  return ds.rows.length;
}

/**
 * The dataset a widget binds to. Reads the cache; refreshes on-demand when the
 * cache is missing or older than the source's refresh interval (so a device
 * poll always sees reasonably fresh data even between cron sweeps). manual/rss
 * are computed live from their items (cheap, no external fetch).
 */
export async function getDataset(db: D1Database, feedId: string): Promise<SourceDataset> {
  await ensureSchema(db);
  const feed = await getFeed(db, feedId);
  if (!feed) return { columns: [], rows: [] };
  if (feed.provider === "manual") return itemsToDataset(await listItems(db, feed.id));
  // RSS: refresh on read when the cache is stale (or was never fetched) so a
  // device poll always gets fresh headlines even between cron sweeps. RSS was
  // previously read-only here, so a screen could show nothing until the next
  // cron sweep even though the dashboard preview looked fine.
  if (feed.provider === "rss") {
    const rssFresh = feed.data_at && Date.now() - feed.data_at < feed.refresh_sec * 1000;
    if (!rssFresh) await refreshRss(db, feed).catch(() => 0);
    return itemsToDataset(await listItems(db, feed.id));
  }
  const fresh = feed.data_at && Date.now() - feed.data_at < feed.refresh_sec * 1000;
  if (fresh && feed.data_json) return safeDataset(feed.data_json);
  try {
    await refreshSource(db, feed);
    const updated = await getFeed(db, feedId);
    return updated?.data_json ? safeDataset(updated.data_json) : { columns: [], rows: [] };
  } catch {
    return feed.data_json ? safeDataset(feed.data_json) : { columns: [], rows: [] }; // last good on failure
  }
}

/** Cron sweep: refresh every api/gsheet source whose cache is stale, across all
 *  tenants (rss is handled by the existing refreshRss pass; manual has nothing
 *  to fetch). Honors each source's refresh_sec. */
export async function refreshStaleSources(db: D1Database): Promise<number> {
  await ensureSchema(db);
  const rows = (await db.prepare("SELECT * FROM feeds WHERE provider IN ('api','gsheet')").all<FeedRow>()).results ?? [];
  const now = Date.now();
  let n = 0;
  for (const feed of rows) {
    if (feed.data_at && now - feed.data_at < feed.refresh_sec * 1000) continue;
    await refreshSource(db, feed).then(() => { n++; }).catch(() => undefined);
  }
  return n;
}

function safeDataset(json: string): SourceDataset {
  const v = safeJson(json) as Partial<SourceDataset>;
  return { columns: Array.isArray(v.columns) ? v.columns : [], rows: Array.isArray(v.rows) ? v.rows : [] };
}

function firstMatch(s: string, re: RegExp): string {
  return s.match(re)?.[1] ?? "";
}
function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}
function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}
