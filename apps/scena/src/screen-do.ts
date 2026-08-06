/**
 * ScreenDO — one Durable Object per physical screen (BLUEPRINT §3, §6, §7).
 *
 * Holds the hibernatable WebSocket to the screen's browser. Hibernation is the
 * key win: a signage screen keeps its socket open for months while idle and is
 * not billed for wall-time while hibernated, yet wakes instantly to deliver a
 * manifest nudge or command.
 *
 * For the slice it covers the load-bearing runtime paths:
 *   - pairing state machine (pairing → claimed → assigned)
 *   - the NTP-style clock-sync echo (§7) — the thing that must be synchronized
 *   - manifest nudge fan-out to the socket (§9)
 *   - heartbeat → dead-man's-switch alarm (§23)
 */

import { DurableObject } from "cloudflare:workers";
import {
  decodeClient,
  encode,
  PROTOCOL_VERSION,
  type PairingState,
  type ServerMessage,
  type InterruptMsg,
} from "@scena/protocol";
import { DEMO_CHANNEL_ID } from "./demo.js";
import { recordEvents } from "./analytics.js";
import { addScreenToChannel, removeScreenFromChannel } from "./channels.js";
import { setDeviceDimensions } from "./db.js";
import { currentVersion } from "./versions.js";
import { resolveDeviceSchedule } from "./device-schedule-store.js";
import { raiseAlert, resolveAlert } from "./alerts.js";
import type { Env } from "./env.js";

/** No heartbeat within this window ⇒ the screen is marked offline (§23). */
const HEARTBEAT_TIMEOUT_MS = 90_000;

interface Override {
  id: string;
  title: string;
  body: string;
  /** Visual treatment on-screen (alarm | warning | info | neutral | success). */
  tone: "alarm" | "warning" | "info" | "neutral" | "success";
  epoch: number;
}

type CommandAction = "mute" | "unmute" | "refresh" | "screensaver.on" | "screensaver.off" | "switch_channel" | "debug.on" | "debug.off";

interface ScheduledCommand {
  id: string;
  action: CommandAction;
  at: number;
  channelId?: string;
}

/** A stamped interrupt held in state (the wire message minus its `type` tag). */
type StoredInterrupt = Omit<InterruptMsg, "type">;

interface ScreenState {
  state: PairingState;
  code?: string;
  screenId?: string;
  channelId?: string;
  manifestVersion?: number;
  lastSeen?: number;
  online: boolean;
  /** Active emergency override held until cleared (§12). */
  override?: Override | null;
  /** Active ad interrupt (§21), held only for its stamped window so a screen
   *  that reconnects mid-ad picks it up in-phase. */
  interrupt?: StoredInterrupt | null;
  /** Runtime toggles (§3): audio muted, screen-saver active, debug overlay on. */
  muted?: boolean;
  saverActive?: boolean;
  debugActive?: boolean;
  /** Commands queued to fire via alarm() (§11) — nightly mute, saver hours, … */
  scheduled?: ScheduledCommand[];
  /** Fallback channel when no schedule rule matches (§13). */
  defaultChannelId?: string;
  /** Next dayparting boundary (wall-clock ms) to re-evaluate the schedule (§13). */
  nextBoundary?: number | null;
}

export class ScreenDO extends DurableObject<Env> {
  /** Reserve this DO for a pairing attempt: store the code, enter `pairing`. */
  async init(code: string): Promise<void> {
    await this.patch({ state: "pairing", code, online: false });
  }

  /** WebSocket upgrade. Accepts a hibernatable socket and greets it. */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    // Hibernatable: the runtime, not this isolate, holds the socket open.
    this.ctx.acceptWebSocket(server);
    await this.goOnline(); // a live socket ⇒ online (and resolve any offline alert)

    const st = await this.load();
    this.keepPairCodeAlive(st); // an unclaimed screen that stays connected keeps its code claimable
    this.sendTo(server, {
      type: "pairing",
      state: st.state,
      code: st.state === "pairing" ? st.code : undefined,
      screenId: st.screenId,
    });
    if (st.state === "assigned" && st.channelId) {
      this.sendTo(server, this.manifestNudge(st));
    }
    // A screen reconnecting mid-event picks up the active override at once (§12).
    if (st.override) this.sendTo(server, { type: "emergency", ...st.override });
    const live = liveInterrupt(st.interrupt);
    if (live) this.sendTo(server, { type: "interrupt", ...live });
    this.restoreToggles(server, st); // re-apply mute / screen-saver (§11)

    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
    let msg;
    try {
      msg = decodeClient(raw);
    } catch {
      return; // ignore malformed frames from an untrusted client
    }

    switch (msg.type) {
      case "hello": {
        const st = await this.load();
        // Persist the device's self-reported resolution so dimensions
        // auto-populate for the operator (§13). Fire-and-forget so a slow/failed
        // D1 write never blocks or affects the live socket. Only once claimed.
        if (msg.w && msg.h && st.screenId) {
          this.ctx.waitUntil(setDeviceDimensions(this.env.DB, st.screenId, { width: msg.w, height: msg.h }).catch(() => {}));
        }
        this.keepPairCodeAlive(st);
        this.sendTo(ws, {
          type: "pairing",
          state: st.state,
          code: st.state === "pairing" ? st.code : undefined,
          screenId: st.screenId,
        });
        if (st.state === "assigned" && st.channelId) this.sendTo(ws, this.manifestNudge(st));
        if (st.override) this.sendTo(ws, { type: "emergency", ...st.override });
        const liveInt = liveInterrupt(st.interrupt);
        if (liveInt) this.sendTo(ws, { type: "interrupt", ...liveInt });
        this.restoreToggles(ws, st);
        break;
      }
      case "sync.ping": {
        // The one synchronized quantity: echo the send stamp + server wall time.
        this.sendTo(ws, { type: "sync.pong", tSend: msg.tSend, tServer: Date.now() });
        break;
      }
      case "heartbeat": {
        await this.patch({ lastSeen: Date.now() });
        await this.goOnline(); // resolves an offline alert on return (§23)
        await this.rearm(); // alarm serves both the dead-man's-switch and scheduled cmds
        this.keepPairCodeAlive(await this.load()); // keep an unclaimed code from expiring on a long-open socket
        break;
      }
      case "playout.events": {
        // Proof-of-play sink (§22): persist deduped for reporting, and mirror
        // to Analytics Engine for high-cardinality telemetry when bound.
        const st = await this.load();
        if (st.screenId && msg.events.length) {
          await recordEvents(this.env.DB, { screenId: st.screenId, channelId: st.channelId ?? null }, msg.events);
          if (this.env.PLAYOUT) {
            for (const e of msg.events) {
              this.env.PLAYOUT.writeDataPoint({
                indexes: [st.screenId],
                blobs: [e.contentId, e.kind, st.channelId ?? ""],
                doubles: [e.durationMs ?? 0],
              });
            }
          }
        }
        break;
      }
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close();
    } catch {
      /* already closing */
    }
    await this.onSocketGone();
  }

  override async webSocketError(): Promise<void> {
    await this.onSocketGone();
  }

  /** A screen dropping its socket is an offline event worth alerting on (§23);
   *  a reconnect resolves it. (The alarm covers a screen that wedges without a
   *  clean close.) */
  private async onSocketGone(): Promise<void> {
    // Only the closing socket remains (or none), so the screen has no live link.
    if (this.ctx.getWebSockets().length > 1) return;
    const st = await this.load();
    await this.patch({ online: false });
    if (st.online && st.screenId) {
      await raiseAlert(this.env, { screenId: st.screenId, type: "offline", message: "Screen disconnected" });
    }
  }

  /**
   * The single alarm serves two jobs (§11, §23): fire any due scheduled
   * commands, and run the heartbeat dead-man's-switch. It re-arms to whichever
   * comes next.
   */
  override async alarm(): Promise<void> {
    const now = Date.now();
    const st = await this.load();

    const scheduled = st.scheduled ?? [];
    const due = scheduled.filter((c) => c.at <= now);
    if (due.length) await this.patch({ scheduled: scheduled.filter((c) => c.at > now) });
    for (const c of due) await this.applyCommand({ id: c.id, action: c.action, channelId: c.channelId });

    const fresh = await this.load();
    if (fresh.lastSeen && now - fresh.lastSeen >= HEARTBEAT_TIMEOUT_MS && fresh.online) {
      await this.patch({ online: false });
      // Dead-man's-switch tripped → raise an offline alert (§23).
      if (fresh.screenId) {
        await raiseAlert(this.env, { screenId: fresh.screenId, type: "offline", message: "Screen stopped responding" });
      }
    }
    // Dayparting boundary (§13): re-resolve the active channel and swap if due.
    await this.applySchedule(false);
    await this.rearm();
  }

  /**
   * Resolve this device's own schedule (§13) across three tracks — channel
   * daypart, mute windows, screensaver windows — and apply each: swap the active
   * channel (re-indexing + nudging the new manifest), and drive mute / saver via
   * the same cmd path as a manual toggle. A track is only owned by the schedule
   * when it has rules (null → leave manual control). `silent` suppresses the
   * manifest nudge (the caller sends it, e.g. right after claim). Records the
   * soonest next boundary across all tracks for the alarm.
   */
  private async applySchedule(silent: boolean): Promise<void> {
    const st = await this.load();
    if (st.state !== "assigned") return;
    const fallback = st.defaultChannelId ?? DEMO_CHANNEL_ID;

    let target = fallback;
    let nextBoundary: number | null = null;
    let muted: boolean | null = null;
    let saver: boolean | null = null;
    try {
      if (st.screenId) {
        const res = await resolveDeviceSchedule(this.env.DB, st.screenId, Date.now());
        target = res.channelId ?? fallback;
        nextBoundary = res.nextBoundaryMs;
        muted = res.muted;
        saver = res.saverActive;
      }
    } catch {
      /* no schedule / DB hiccup — stay on the fallback channel, manual toggles */
    }

    const doId = this.ctx.id.toString();
    const changed = target !== st.channelId;
    // Ensure channel-index membership on every assignment (idempotent), not only
    // when the channel changes — otherwise a screen first assigned to its
    // fallback channel is never indexed, so channel fan-out (nudges, ads §21)
    // can't reach it. Only move it off the old channel when the target changed.
    if (changed && st.channelId) await removeScreenFromChannel(this.env.PAIRING, st.channelId, doId);
    await addScreenToChannel(this.env.PAIRING, target, doId);
    await this.patch({ channelId: target, nextBoundary });
    if (changed && !silent) {
      const merged = await this.load();
      for (const ws of this.ctx.getWebSockets()) this.sendTo(ws, this.manifestNudge(merged));
    }

    // Mute / screensaver windows drive the same runtime toggles as manual
    // commands; only act on a real change so we don't spam the socket each alarm.
    if (muted !== null && muted !== !!st.muted) {
      await this.applyCommand({ id: `sched_${muted ? "mute" : "unmute"}`, action: muted ? "mute" : "unmute" });
    }
    if (saver !== null && saver !== !!st.saverActive) {
      await this.applyCommand({ id: `sched_saver_${saver ? "on" : "off"}`, action: saver ? "screensaver.on" : "screensaver.off" });
    }
  }

  /**
   * Remote command (§11). `at` in the future is persisted and fired via alarm();
   * otherwise it applies immediately. Recurring rules re-arm after each fire (a
   * later refinement); scheduled one-shots survive disconnect and hibernation.
   */
  async command(action: CommandAction, at: number | null, channelId?: string): Promise<{ id: string; scheduled: boolean }> {
    const id = `cmd_${crypto.randomUUID().slice(0, 8)}`;
    if (at && at > Date.now()) {
      const st = await this.load();
      await this.patch({ scheduled: [...(st.scheduled ?? []), { id, action, at, channelId }] });
      await this.rearm();
      return { id, scheduled: true };
    }
    await this.applyCommand({ id, action, channelId });
    return { id, scheduled: false };
  }

  /** Apply a command now: update runtime toggles and push it to the socket. */
  private async applyCommand(cmd: { id: string; action: CommandAction; channelId?: string }): Promise<void> {
    const patch: Partial<ScreenState> = {};
    if (cmd.action === "mute") patch.muted = true;
    else if (cmd.action === "unmute") patch.muted = false;
    else if (cmd.action === "screensaver.on") patch.saverActive = true;
    else if (cmd.action === "screensaver.off") patch.saverActive = false;
    else if (cmd.action === "debug.on") patch.debugActive = true;
    else if (cmd.action === "debug.off") patch.debugActive = false;
    if (Object.keys(patch).length) await this.patch(patch);

    for (const ws of this.ctx.getWebSockets()) {
      this.sendTo(ws, { type: "cmd", id: cmd.id, action: cmd.action, at: null, channelId: cmd.channelId });
    }
  }

  /** Re-send active runtime toggles so a reconnecting screen restores them. */
  private restoreToggles(ws: WebSocket, st: ScreenState): void {
    if (st.muted) this.sendTo(ws, { type: "cmd", id: "restore-mute", action: "mute", at: null });
    if (st.saverActive) this.sendTo(ws, { type: "cmd", id: "restore-saver", action: "screensaver.on", at: null });
    if (st.debugActive) this.sendTo(ws, { type: "cmd", id: "restore-debug", action: "debug.on", at: null });
  }

  /** Arm the alarm for whichever fires next: heartbeat, a command, or a daypart. */
  private async rearm(): Promise<void> {
    const st = await this.load();
    const times: number[] = [];
    if (st.online && st.lastSeen) times.push(st.lastSeen + HEARTBEAT_TIMEOUT_MS);
    for (const c of st.scheduled ?? []) times.push(c.at);
    if (st.nextBoundary) times.push(st.nextBoundary);
    if (times.length) await this.ctx.storage.setAlarm(Math.min(...times));
  }

  /**
   * Operator claims this screen (§6). Binds it to the demo channel and pushes
   * the manifest nudge to the live socket, so the screen transitions straight
   * from "pairing" to "playing".
   */
  async claim(): Promise<{ screenId: string; channelId: string }> {
    const st = await this.load();
    // The screen's identity IS its Durable Object id — the same key D1 uses in
    // `screens` — so proof-of-play (§22) and alert (§23) rows join to the
    // screen's name instead of dangling on a truncated `scr_…` id.
    const screenId = st.screenId ?? this.ctx.id.toString();
    await this.patch({
      state: "assigned",
      screenId,
      channelId: DEMO_CHANNEL_ID,
      defaultChannelId: DEMO_CHANNEL_ID,
      manifestVersion: 1,
    });

    // Resolve the schedule (§13) to pick the active channel, then greet + play.
    await this.applySchedule(true); // silent — we send the nudge just below
    await this.rearm();

    const merged = await this.load();
    for (const ws of this.ctx.getWebSockets()) {
      this.sendTo(ws, { type: "pairing", state: "assigned", screenId });
      this.sendTo(ws, this.manifestNudge(merged));
    }
    return { screenId, channelId: merged.channelId ?? DEMO_CHANNEL_ID };
  }

  /**
   * Operator unpairs this device: it stops playing, drops off its channel, and
   * returns to a fresh pairing code (minted by the caller). We send an `unpair`
   * command — a *deauthorization*, not a plain refresh: the player wipes its
   * cached channel + assets before reloading, so a mere reload can never replay
   * the old channel off cache. On reconnect (same DO id, so the D1 row and code
   * stay in sync with the dashboard) it finds the DO back in `pairing` and shows
   * the new code. The state is fully reset so nothing stale survives re-pairing.
   */
  async unpair(code: string): Promise<void> {
    const st = await this.load();
    const doId = this.ctx.id.toString();
    if (st.channelId) await removeScreenFromChannel(this.env.PAIRING, st.channelId, doId).catch(() => {});
    await this.patch({
      state: "pairing",
      code,
      channelId: undefined,
      defaultChannelId: undefined,
      manifestVersion: undefined,
      override: null,
      interrupt: null,
      muted: false,
      saverActive: false,
      debugActive: false,
      nextBoundary: null,
    });
    for (const ws of this.ctx.getWebSockets()) {
      // `unpair` is the correct signal (the player wipes its cache before
      // reloading). Also send `refresh` for backward-compat: an older player
      // build that predates the `unpair` action drops the unknown frame, but
      // still understands `refresh` and reloads — which lets its Service Worker
      // pick up the new build, after which the server-authority path stops it.
      this.sendTo(ws, { type: "cmd", id: "unpair", action: "unpair", at: null });
      this.sendTo(ws, { type: "cmd", id: "unpair-refresh", action: "refresh", at: null });
    }
  }

  /**
   * Apply an emergency override (§12): a high-priority takeover this screen
   * holds until cleared. Stored so it survives hibernation and is re-delivered
   * on reconnect; pushed to the live socket immediately.
   */
  async override(payload: Override): Promise<void> {
    await this.patch({ override: payload });
    for (const ws of this.ctx.getWebSockets()) this.sendTo(ws, { type: "emergency", ...payload });
  }

  /** Lift the override (all-clear). Screens recompute normal playout (§12). */
  async clearOverride(): Promise<void> {
    const st = await this.load();
    const id = st.override?.id;
    await this.patch({ override: null });
    if (id) for (const ws of this.ctx.getWebSockets()) this.sendTo(ws, { type: "clear", id });
  }

  /**
   * Fire a stamped ad interrupt (§21). Stored for its window only, so a screen
   * that reconnects mid-ad picks it up in-phase; pushed to the live socket now.
   * An emergency override outranks it, so we don't fire while one is active.
   */
  async interrupt(payload: StoredInterrupt): Promise<void> {
    const st = await this.load();
    if (st.override) return; // emergency trumps ads (§12)
    await this.patch({ interrupt: payload });
    for (const ws of this.ctx.getWebSockets()) this.sendTo(ws, { type: "interrupt", ...payload });
  }

  /** Lift an ad interrupt early (all-clear); screens resume the timeline. */
  async clearInterrupt(id: string): Promise<void> {
    await this.patch({ interrupt: null });
    for (const ws of this.ctx.getWebSockets()) this.sendTo(ws, { type: "clear", id });
  }

  /** Mark online, resolving any open offline alert on the transition (§23). */
  private async goOnline(): Promise<void> {
    const st = await this.load();
    if (!st.online && st.screenId) {
      // Best-effort: this runs in the WebSocket-accept path, so a failed alert
      // resolution / notification must never throw and break the 101 upgrade.
      await resolveAlert(this.env, st.screenId, "offline", "Screen back online").catch(() => {});
    }
    await this.patch({ online: true });
  }

  /** Re-evaluate the schedule now (called when rules change, §13). */
  async refreshSchedule(): Promise<void> {
    await this.applySchedule(false);
    await this.rearm();
  }

  /**
   * Operator (re)assigns this screen's channel from the dashboard (§13 default).
   * With no matching schedule rule, applySchedule() resolves to defaultChannelId
   * — so updating it and re-resolving switches the live screen and nudges the
   * new manifest immediately, instead of leaving it on the demo channel bound at
   * claim. Passing null/"" clears back to the demo fallback.
   */
  async setDefaultChannel(channelId: string | null): Promise<{ ok: true; channelId: string }> {
    await this.patch({ defaultChannelId: channelId || DEMO_CHANNEL_ID });
    await this.refreshSchedule();
    const st = await this.load();
    return { ok: true, channelId: st.channelId ?? DEMO_CHANNEL_ID };
  }

  /** Snapshot for the dashboard fleet view (§23). */
  async status(): Promise<ScreenState> {
    const st = await this.load();
    // Report the channel's actual current published version (the KV pointer),
    // not the value stamped at claim — so the dashboard shows real staleness.
    // Best-effort: a KV hiccup just falls back to the stored value.
    if (st.channelId) {
      const v = await currentVersion(this.env, st.channelId).catch(() => null);
      if (typeof v === "number") return { ...st, manifestVersion: v };
    }
    return st;
  }

  /**
   * Re-send the manifest nudge to this screen's sockets (§9). Called on publish
   * so a live screen refetches the recompiled manifest and swaps in the new
   * widget layer without a reload.
   */
  async nudge(): Promise<void> {
    const st = await this.load();
    if (st.state !== "assigned" || !st.channelId) return;
    for (const ws of this.ctx.getWebSockets()) this.sendTo(ws, this.manifestNudge(st));
  }

  /* ------------------------------- internals ------------------------------ */

  /**
   * Keep a reserved-but-unclaimed screen's pairing code claimable. The claim code
   * lives in KV with a TTL; a screen can sit on the pairing screen for days, so
   * re-assert `pair:<code> → this DO` whenever it connects/heartbeats. Without
   * this the code silently expires and the on-screen code fails to pair — with no
   * way for the screen to mint a fresh one on its own. Throttled to ≤ every 6h
   * (the in-memory stamp resets on hibernation, so a woken DO re-asserts anyway).
   */
  private lastPairAssert = 0;
  private keepPairCodeAlive(st: ScreenState): void {
    if (st.state !== "pairing" || !st.code) return;
    const now = Date.now();
    if (now - this.lastPairAssert < 6 * 3_600_000) return;
    this.lastPairAssert = now;
    const code = st.code;
    this.ctx.waitUntil(this.env.PAIRING.put(`pair:${code}`, this.ctx.id.toString(), { expirationTtl: 86_400 }).catch(() => {}));
  }

  private manifestNudge(st: ScreenState): ServerMessage {
    return {
      type: "manifest",
      channelId: st.channelId ?? DEMO_CHANNEL_ID,
      version: st.manifestVersion ?? 1,
      hash: `${st.channelId ?? DEMO_CHANNEL_ID}:${st.manifestVersion ?? 1}`,
      url: `/api/manifest/${st.channelId ?? DEMO_CHANNEL_ID}`,
    };
  }

  private sendTo(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(encode(msg));
    } catch {
      /* socket gone */
    }
  }

  private async load(): Promise<ScreenState> {
    const st = await this.ctx.storage.get<ScreenState>("state");
    return st ?? { state: "pairing", online: false };
  }

  private async patch(p: Partial<ScreenState>): Promise<void> {
    const st = await this.load();
    await this.ctx.storage.put("state", { ...st, ...p });
  }
}

/** An interrupt is still live only within its stamped window; else drop it. */
function liveInterrupt(i: StoredInterrupt | null | undefined): StoredInterrupt | null {
  if (!i) return null;
  return Date.now() < i.startEpoch + i.durationMs ? i : null;
}

export { PROTOCOL_VERSION };
