/**
 * Live-board widgets on the screen (BLUEPRINT §20).
 *
 * Queue Caller and Room Status Board widgets bind to a board by id and subscribe
 * to its DO over a socket — receiving state broadcasts, not clock-derived
 * playout. This is the deliberate real-time exception: when the socket drops,
 * the widget holds last-known state and shows a subtle "not live" badge rather
 * than presenting a stale number as current.
 *
 * A queue call is epoch-stamped, so a new number flashes in phase on every
 * screen in the room — the same stamping the ad-interrupt sync uses (§21).
 */

import { decodeBoardState, type BoardStateMsg, type QueueState, type RoomState, type ScoreState } from "@scena/protocol";
import { queueBodyHtml, roomBodyHtml, roomStatusBodyHtml, scoreBodyHtml } from "@scena/widgets";
import { API_BASE } from "./config.js";
import type { Announcer } from "./announcer.js";

/** A brief pulse used when a room flips or a score changes. */
function pulse(el: HTMLElement): void {
  el.animate(
    [{ transform: "scale(1)", filter: "brightness(2.1)" }, { transform: "scale(1.06)" }, { transform: "scale(1)", filter: "brightness(1)" }],
    { duration: 650, easing: "ease-out" },
  );
}

function boardWsUrl(boardId: string): string {
  const base = API_BASE.replace(/^http/, "ws");
  return `${base}/api/boards/${boardId}/subscribe`;
}

export class BoardSubscription {
  private ws: WebSocket | null = null;
  private closed = false;
  private last: BoardStateMsg | null = null;
  private lastEpoch = 0;
  private body: HTMLElement;
  private badge: HTMLElement;
  /** Announce mode + repeat, loaded from the board (silent / chime / voice). */
  private announceMode: "silent" | "chime" | "voice" = "silent";
  private announceRepeat = 1;
  private retries = 0;

  /** Per-room last-seen change stamp (for the room flash) + last scores. */
  private lastSince = new Map<string, number>();
  private lastScores = new Map<string, number>();

  constructor(
    private readonly el: HTMLElement,
    private readonly boardId: string,
    private readonly variant: string = "solo",
    private readonly h: number = 400,
    /** When set, a room board renders as a single-room "door" panel (§boards). */
    private readonly roomId: string | null = null,
    /** Persistent, scene-rebuild-proof audio (chime + ducked voice clip). */
    private readonly announcer: Announcer | null = null,
  ) {
    this.el.style.position = this.el.style.position || "absolute";
    this.el.style.display = "block";
    this.el.style.overflow = "hidden";

    this.body = document.createElement("div");
    this.body.style.cssText = "width:100%;height:100%;";
    this.badge = document.createElement("div");
    this.badge.textContent = "not live";
    this.badge.style.cssText =
      "position:absolute;top:10px;right:12px;font:600 13px 'JetBrains Mono',monospace;" +
      "color:#fff;background:oklch(0.55 0.18 25 / 0.85);padding:4px 10px;border-radius:20px;display:none;";
    this.el.appendChild(this.body);
    this.el.appendChild(this.badge);
    this.renderWaiting();
  }

  connect(): void {
    if (this.closed) return;
    void this.loadAnnounce();
    const ws = new WebSocket(boardWsUrl(this.boardId));
    this.ws = ws;
    ws.addEventListener("message", (ev) => {
      try {
        this.render(decodeBoardState(typeof ev.data === "string" ? ev.data : ""));
        this.setLive(true);
        this.retries = 0; // a good frame means we're connected — reset backoff
      } catch {
        /* ignore malformed */
      }
    });
    ws.addEventListener("close", () => {
      this.setLive(false);
      if (this.closed) return;
      // Exponential backoff with jitter so a fleet of screens doesn't reconnect
      // in lockstep and hammer the DO when the edge blips.
      const delay = Math.min(30_000, 1000 * 2 ** this.retries) * (0.75 + Math.random() * 0.5);
      this.retries++;
      setTimeout(() => this.connect(), delay);
    });
    ws.addEventListener("error", () => ws.close());
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
    // Audio lives in the persistent Announcer (not here), so a scene rebuild
    // tearing this subscription down never cuts a chime or a spoken call.
  }

  private setLive(live: boolean): void {
    this.badge.style.display = live ? "none" : "block";
  }

  private render(msg: BoardStateMsg): void {
    this.last = msg;
    if (msg.kind === "queue" && msg.queue) this.renderQueue(msg.queue);
    else if (msg.kind === "room" && msg.room) this.renderRoom(msg.room);
    else if (msg.kind === "score" && msg.score) this.renderScore(msg.score);
  }

  private renderWaiting(): void {
    // Shown only before the first state arrives — kept board-kind-neutral since a
    // queue, room and scoreboard all share this subscription.
    this.body.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;
      color:#fff;opacity:0.55;font:600 min(4vw,34px) 'Hanken Grotesk',sans-serif;">Connecting…</div>`;
  }

  private renderQueue(q: QueueState): void {
    // Shared, design-px body → byte-identical to the builder preview (§17).
    this.body.innerHTML = queueBodyHtml(q, this.variant, this.h);
    // Epoch-stamped flash + announce: fire in phase across screens (§21).
    if (q.epoch !== this.lastEpoch && q.serving !== null) {
      const first = this.lastEpoch !== 0; // don't announce the initial state on load
      this.lastEpoch = q.epoch;
      const numEl = this.body.querySelector("#qnum") as HTMLElement | null;
      if (numEl) {
        numEl.animate(
          [{ transform: "scale(1)", filter: "brightness(2.2)" }, { transform: "scale(1.12)" }, { transform: "scale(1)", filter: "brightness(1)" }],
          { duration: 700, easing: "ease-out" },
        );
      }
      if (first) this.announce(q);
    }
  }

  private async loadAnnounce(): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}/api/boards/${this.boardId}/announce`);
      if (!res.ok) return;
      const data = (await res.json()) as { config?: { mode?: string; repeat?: number } };
      const m = data.config?.mode;
      this.announceMode = m === "chime" || m === "voice" ? m : "silent";
      this.announceRepeat = Math.min(3, Math.max(1, Math.round(data.config?.repeat ?? 1)));
    } catch {
      /* announcements stay off if we can't load them */
    }
  }

  /**
   * Announce a call via the persistent Announcer: a short chime, then — in voice
   * mode — the board's CURRENT call spoken as ONE natural clip (Gemini TTS,
   * server-composed + cached), with the music bed ducked for the whole thing.
   * The Announcer outlives this subscription, so a slide advance can't cut it.
   */
  private announce(_q: QueueState): void {
    if (this.announceMode === "silent" || !this.announcer) return;
    if (this.announceMode !== "voice") {
      this.announcer.chime();
      return;
    }
    this.announcer.announce(() => this.fetchClip());
  }

  /** Fetch the spoken clip for the board's current call (voice mode). Returns
   *  null when voice is off / nothing is serving, degrading to chime-only. */
  private async fetchClip(): Promise<{ url: string; repeat: number } | null> {
    try {
      const res = await fetch(`${API_BASE}/api/boards/${this.boardId}/announce/clip`);
      if (!res.ok) return null; // 409 = voice off / nothing serving
      const data = (await res.json()) as { url?: string; repeat?: number };
      if (!data.url) return null;
      const url = data.url.startsWith("http") ? data.url : `${API_BASE}${data.url}`;
      return { url, repeat: Math.min(3, Math.max(1, data.repeat ?? this.announceRepeat)) };
    } catch {
      return null;
    }
  }

  private renderRoom(r: RoomState): void {
    // A door widget shows one room full-bleed; otherwise the multi-room grid.
    this.body.innerHTML = this.roomId ? roomStatusBodyHtml(r, this.roomId, this.h) : roomBodyHtml(r, this.h);
    // Flash any room whose status changed since the last frame (skip first paint).
    const primed = this.lastSince.size > 0;
    let changed = false;
    for (const room of r.rooms) {
      const since = room.since ?? 0;
      const prev = this.lastSince.get(room.id);
      this.lastSince.set(room.id, since);
      if (!primed || prev === undefined || since <= prev) continue;
      const target = this.roomId
        ? (this.body.querySelector("#doorpanel") as HTMLElement | null)
        : (this.body.querySelector(`[data-room="${cssEscape(room.id)}"]`) as HTMLElement | null);
      const relevant = !this.roomId || room.id === this.roomId;
      if (target && relevant) pulse(target);
      if (relevant) changed = true;
    }
    // A door flip chimes when the board opts in (announce mode chime/voice).
    if (changed && this.announceMode !== "silent") this.announcer?.chime();
  }

  private renderScore(s: ScoreState): void {
    this.body.innerHTML = scoreBodyHtml(s, this.variant, this.h);
    const primed = this.lastScores.size > 0;
    let changed = false;
    for (const side of s.sides) {
      const prev = this.lastScores.get(side.id);
      this.lastScores.set(side.id, side.score);
      if (!primed || prev === undefined || side.score === prev) continue;
      const target = this.body.querySelector(`[data-side="${cssEscape(side.id)}"]`) as HTMLElement | null;
      if (target) pulse(target);
      changed = true;
    }
    // A score change chimes when the board opts in (announce mode chime/voice).
    if (changed && this.announceMode !== "silent") this.announcer?.chime();
  }
}

/** Escape an id for use inside a CSS attribute selector (ids are slug-like, but
 *  be safe against quotes/backslashes). */
function cssEscape(id: string): string {
  return id.replace(/["\\]/g, "\\$&");
}
