/**
 * ChannelDO — the epoch clock authority for one on-air channel (BLUEPRINT §3).
 *
 * For the vertical slice its whole job is to own T0: the anchor from which
 * every screen derives position(t). Owning a single stable anchor is exactly
 * why two screens on the same channel stay in sync. (§29.5 flags that the DO's
 * *durable* value is interrupt/ad stamping + fan-out; that arrives in a later
 * phase — here it just mints and persists the epoch.)
 */

import { DurableObject } from "cloudflare:workers";
import { DEMO_CYCLE_MS } from "./demo.js";
import { listChannelScreens } from "./channels.js";
import { getAd, scheduleAds, type AdSchedule } from "./ad-store.js";
import type { InterruptMsg } from "@scena/protocol";
import type { Env } from "./env.js";

export interface Epoch {
  t0: number;
  cycleMs: number;
}

/** Small lead so every screen receives the stamped ad before it starts (§21). */
const AD_LEAD_MS = 1200;

export class ChannelDO extends DurableObject<Env> {
  /**
   * Return this channel's epoch, minting T0 on first air. Once set, T0 never
   * moves (until a deliberate re-anchor after a variable-length ad, §21), so
   * the timeline is stable across reconnects, hibernation, and new screens.
   */
  async getEpoch(): Promise<Epoch> {
    let t0 = await this.ctx.storage.get<number>("t0");
    if (t0 === undefined) {
      t0 = Date.now();
      await this.ctx.storage.put("t0", t0);
    }
    return { t0, cycleMs: DEMO_CYCLE_MS };
  }

  /** Re-anchor T0 (used after a variable-length interrupt, §21). */
  async reanchor(t0: number): Promise<void> {
    await this.ctx.storage.put("t0", t0);
  }

  /* --------------------------- ads & interrupts (§21) -------------------- */

  /**
   * (Re)configure the ad rotation for this channel and arm the scheduling
   * alarm. Called on any ad create/delete/toggle. Idempotent — a fresh ad is
   * seeded one interval out so it never fires the instant it is saved.
   */
  async setAds(channelId: string, schedules: AdSchedule[]): Promise<void> {
    await this.ctx.storage.put("adChannelId", channelId);
    const now = Date.now();
    // Preserve each surviving ad's existing next-due time so re-saving the
    // rotation (which happens on every ad create/toggle/delete across all
    // channels on the profile) doesn't reset the cadence and push fires out
    // indefinitely when ads are edited more often than their interval.
    const prev = new Map(((await this.ctx.storage.get<AdSchedule[]>("adSchedule")) ?? []).map((s) => [s.id, s]));
    const carried = schedules.map((s) => {
      const kept = prev.get(s.id)?.nextDueAt;
      return { ...s, nextDueAt: kept && kept > now ? kept : now + Math.max(1, s.everyMin) * 60_000 };
    });
    const seeded = scheduleAds(carried, now); // future due times survive, fires nothing
    await this.ctx.storage.put("adSchedule", seeded.schedule);
    if (seeded.nextAlarm) await this.ctx.storage.setAlarm(seeded.nextAlarm);
    else await this.ctx.storage.deleteAlarm();
  }

  /**
   * Alarm tick: fire any ads that are due, epoch-stamp + fan them out to every
   * screen on the channel, advance their cadence, and re-arm for the next.
   */
  override async alarm(): Promise<void> {
    const channelId = await this.ctx.storage.get<string>("adChannelId");
    const schedule = (await this.ctx.storage.get<AdSchedule[]>("adSchedule")) ?? [];
    if (!channelId || schedule.length === 0) return;
    const now = Date.now();
    const result = scheduleAds(schedule, now);
    await this.ctx.storage.put("adSchedule", result.schedule);
    for (const adId of result.fire) await this.fire(channelId, adId, now);
    if (result.nextAlarm) await this.ctx.storage.setAlarm(result.nextAlarm);
  }

  /** Fire a specific ad immediately (the dashboard "play now" button, §21). */
  async playNow(channelId: string, adId: string): Promise<{ ok: boolean; screens: number }> {
    const screens = await this.fire(channelId, adId, Date.now());
    return { ok: screens >= 0, screens };
  }

  /** Build the stamped interrupt for `adId` and deliver it to the fleet. */
  private async fire(channelId: string, adId: string, now: number): Promise<number> {
    const ad = await getAd(this.env.DB, adId);
    if (!ad || ad.enabled !== 1) return -1;
    const msg: Omit<InterruptMsg, "type"> = {
      id: `int_${rndHex(6)}`,
      role: "ad",
      startEpoch: now + AD_LEAD_MS,
      durationMs: ad.duration_ms,
      priority: 1,
      ad: {
        kind: ad.kind as "audio" | "video" | "command",
        name: ad.name,
        audioUrl: ad.audio_url ?? undefined,
        videoUrl: ad.video_url ?? undefined,
        html: ad.html ?? undefined,
        duck: true,
        hideBadge: ad.hide_badge === 1,
        companionUrl: ad.companion_url ?? undefined,
      },
    };
    const doIds = await listChannelScreens(this.env.PAIRING, channelId);
    await Promise.all(
      doIds.map(async (doId) => {
        try {
          await this.env.SCREEN.get(this.env.SCREEN.idFromString(doId)).interrupt(msg);
        } catch {
          /* screen DO gone — skip */
        }
      }),
    );
    return doIds.length;
  }
}

function rndHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}
