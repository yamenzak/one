/**
 * Channel widget layer storage + versioning (BLUEPRINT §9, §17).
 *
 * The builder authors a channel's widget scene graph; we persist it in KV and
 * bump a version counter on each publish. The manifest compiler (demo.ts)
 * merges it in, and a publish nudges connected screens to refetch — the live-
 * update flow of §9, minus the full R2/D1 compile pipeline (that lands later).
 */

import { Widget, type Widget as WidgetT } from "@scena/manifest";

const widgetsKey = (channelId: string) => `channel:${channelId}:widgets`;
const versionKey = (channelId: string) => `channel:${channelId}:version`;
const screensKey = (channelId: string) => `channel:${channelId}:screens`;

/** Validate + store a channel's widget layer, returning the new version. */
export async function saveWidgets(kv: KVNamespace, channelId: string, widgets: unknown): Promise<number> {
  const parsed = Widget.array().parse(widgets); // reject anything not a valid node
  await kv.put(widgetsKey(channelId), JSON.stringify(parsed));
  const version = (await getVersion(kv, channelId)) + 1;
  await kv.put(versionKey(channelId), String(version));
  return version;
}

export async function loadWidgets(kv: KVNamespace, channelId: string): Promise<WidgetT[] | null> {
  const raw = await kv.get(widgetsKey(channelId));
  if (raw === null) return null;
  try {
    return Widget.array().parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function getVersion(kv: KVNamespace, channelId: string): Promise<number> {
  const raw = await kv.get(versionKey(channelId));
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

/** Track which screens are on a channel, so a publish can fan a nudge to them. */
export async function addScreenToChannel(kv: KVNamespace, channelId: string, doId: string): Promise<void> {
  const set = new Set(await listChannelScreens(kv, channelId));
  set.add(doId);
  await kv.put(screensKey(channelId), JSON.stringify([...set]));
}

/** Drop a screen from a channel's set (on a daypart swap, §13). */
export async function removeScreenFromChannel(kv: KVNamespace, channelId: string, doId: string): Promise<void> {
  const set = new Set(await listChannelScreens(kv, channelId));
  if (set.delete(doId)) await kv.put(screensKey(channelId), JSON.stringify([...set]));
}

export async function listChannelScreens(kv: KVNamespace, channelId: string): Promise<string[]> {
  const raw = await kv.get(screensKey(channelId));
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as string[]) : [];
  } catch {
    return [];
  }
}
