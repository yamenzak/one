/**
 * The screen's link to its ScreenDO: pairing, clock sync (§7), and nudges (§9).
 *
 * The clock is the one thing that must be synchronized. We run the NTP-style
 * handshake over this socket and feed samples into the pure OffsetFilter from
 * @scena/timeline; `syncedNow()` then maps the monotonic clock to server time,
 * which is what the playout loop resolves against. Basing on performance.now()
 * (monotonic) means a wonky device wall-clock can never jump playout.
 */

import { OffsetFilter } from "@scena/timeline";
import {
  decodeServer,
  encode,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
} from "@scena/protocol";
import { wsUrl } from "./config.js";
import { saveClockBridge, loadClockBridge, renewLease } from "./store.js";
import type { PlayoutEvent } from "./player.js";

const SYNC_INTERVAL_MS = 3000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const RECONNECT_DELAY_MS = 2000;

export interface SocketHandlers {
  onPairing?: (state: string, code?: string) => void;
  onManifest?: (msg: Extract<ServerMessage, { type: "manifest" }>) => void;
  onSyncChange?: (offset: number, rttMedian: number, samples: number) => void;
  onEmergency?: (msg: Extract<ServerMessage, { type: "emergency" }>) => void;
  onInterrupt?: (msg: Extract<ServerMessage, { type: "interrupt" }>) => void;
  onClear?: (id: string) => void;
  onCommand?: (msg: Extract<ServerMessage, { type: "cmd" }>) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export class ScreenSocket {
  private ws: WebSocket | null = null;
  private filter = new OffsetFilter();
  private syncTimer?: ReturnType<typeof setInterval>;
  private hbTimer?: ReturnType<typeof setInterval>;
  private burstTimer?: ReturnType<typeof setInterval>;
  private closed = false;
  private reconnectAttempts = 0;
  private contentId = "";
  /** Proof-of-play buffer. Retained until a send succeeds so events survive an
   *  offline gap and replay on reconnect; the server dedupes by eventId (§22). */
  private eventBuffer: PlayoutEvent[] = [];
  private readonly MAX_BUFFER = 5000;

  constructor(
    private path: string,
    private readonly handlers: SocketHandlers,
  ) {}

  /** Set the ScreenDO ws path (known only once a reservation exists). */
  setPath(path: string): void {
    this.path = path;
  }

  /**
   * Current best estimate of server wall-clock time. While a live sync has
   * converged, use the monotonic clock (smooth, no wall-clock jumps). Before it
   * has — e.g. an offline cold-boot — fall back to the persisted wall-clock
   * bridge (§8) so playout can still resolve to the right position.
   */
  syncedNow(): number {
    if (this.synced) return this.filter.syncedTime(performance.now());
    const bridge = loadClockBridge();
    return bridge !== null ? Date.now() + bridge : performance.now();
  }
  get offset(): number {
    return this.filter.offset;
  }
  get synced(): boolean {
    return this.filter.sampleCount >= 2;
  }
  /** True when playout has *some* usable clock — live sync or the offline bridge. */
  get hasClock(): boolean {
    return this.synced || loadClockBridge() !== null;
  }
  /** Where the current time estimate comes from (for diagnostics). */
  get clockSource(): "live" | "bridge" | "none" {
    if (this.synced) return "live";
    return loadClockBridge() !== null ? "bridge" : "none";
  }

  /** Tell the socket what's currently on screen (rides on the heartbeat). */
  setContentId(id: string): void {
    this.contentId = id;
  }

  /** Buffer a proof-of-play event; it flushes on the next tick or reconnect. */
  emit(event: PlayoutEvent): void {
    this.eventBuffer.push(event);
    // Bound the buffer during a long outage — drop oldest, keeping recent plays.
    if (this.eventBuffer.length > this.MAX_BUFFER) this.eventBuffer.splice(0, this.eventBuffer.length - this.MAX_BUFFER);
    this.flushEvents();
  }

  connect(): void {
    this.closed = false;
    const ws = new WebSocket(wsUrl(this.path));
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.reconnectAttempts = 0; // connected — reset backoff
      // Report the device's physical resolution so dimensions auto-detect (§13).
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(window.screen.width * dpr);
      const h = Math.round(window.screen.height * dpr);
      this.send({ type: "hello", protocol: PROTOCOL_VERSION, w: w > 0 ? w : undefined, h: h > 0 ? h : undefined });
      this.heartbeat(); // immediate liveness so the fleet view flips online at once
      this.flushEvents(); // replay anything buffered while offline (§22)
      // Fast convergence: a short burst of pings locks the clock phase within
      // ~1s (so playout doesn't start on a stale offset), then settle to the
      // steady cadence. The EWMA + outlier rejection smooth the burst.
      this.sync();
      let bursts = 0;
      if (this.burstTimer) clearInterval(this.burstTimer);
      this.burstTimer = setInterval(() => {
        this.sync();
        if (++bursts >= 4) { clearInterval(this.burstTimer); this.burstTimer = undefined; }
      }, 250);
      this.syncTimer = setInterval(() => this.sync(), SYNC_INTERVAL_MS);
      this.hbTimer = setInterval(() => {
        this.heartbeat();
        this.flushEvents();
      }, HEARTBEAT_INTERVAL_MS);
      this.handlers.onOpen?.();
    });

    ws.addEventListener("message", (ev) => this.onMessage(ev));
    ws.addEventListener("close", () => this.onDisconnect());
    ws.addEventListener("error", () => ws.close());
  }

  close(): void {
    this.closed = true;
    this.clearTimers();
    this.ws?.close();
  }

  private onMessage(ev: MessageEvent): void {
    let msg: ServerMessage;
    try {
      msg = decodeServer(typeof ev.data === "string" ? ev.data : "");
    } catch {
      return;
    }
    switch (msg.type) {
      case "sync.pong": {
        // tSend/tRecv are monotonic; tServer is the edge wall-clock.
        this.filter.push({ tSend: msg.tSend, tServer: msg.tServer, tRecv: performance.now() });
        if (this.synced) {
          // Persist the wall-clock bridge so an offline reload can cold-boot (§8).
          saveClockBridge(this.filter.syncedTime(performance.now()) - Date.now());
        }
        this.handlers.onSyncChange?.(this.filter.offset, this.filter.rttMedian, this.filter.sampleCount);
        break;
      }
      case "pairing":
        this.handlers.onPairing?.(msg.state, msg.code);
        break;
      case "manifest":
        this.handlers.onManifest?.(msg);
        break;
      case "emergency":
        this.handlers.onEmergency?.(msg);
        break;
      case "clear":
        this.handlers.onClear?.(msg.id);
        break;
      case "cmd":
        this.handlers.onCommand?.(msg);
        break;
      case "interrupt":
        this.handlers.onInterrupt?.(msg);
        break;
    }
  }

  private onDisconnect(): void {
    this.clearTimers();
    this.handlers.onClose?.();
    if (this.closed) return;
    // Exponential backoff with jitter so a room of screens doesn't reconnect in
    // lockstep and stampede the edge/DO after a blip.
    const delay = Math.min(30_000, RECONNECT_DELAY_MS * 2 ** this.reconnectAttempts) * (0.75 + Math.random() * 0.5);
    this.reconnectAttempts++;
    setTimeout(() => this.connect(), delay);
  }

  private sync(): void {
    this.send({ type: "sync.ping", tSend: performance.now() });
  }

  private heartbeat(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    // Live server contact renews the offline-play lease (§8): while a screen can
    // reach its DO it stays authorized, so a later disconnected boot may play the
    // cached channel. A device kept offline can't renew, so it eventually stops.
    renewLease(Date.now());
    this.send({
      type: "heartbeat",
      syncedNow: this.syncedNow(),
      contentId: this.contentId || undefined,
      cacheReady: true,
    });
  }

  private flushEvents(): void {
    if (this.eventBuffer.length === 0 || this.ws?.readyState !== WebSocket.OPEN) return;
    const batch = this.eventBuffer;
    this.eventBuffer = [];
    try {
      this.ws.send(encode({ type: "playout.events", events: batch }));
    } catch {
      this.eventBuffer = batch.concat(this.eventBuffer); // send failed — retry later
    }
  }

  private send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encode(msg));
  }

  private clearTimers(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    if (this.hbTimer) clearInterval(this.hbTimer);
    if (this.burstTimer) { clearInterval(this.burstTimer); this.burstTimer = undefined; }
  }
}
