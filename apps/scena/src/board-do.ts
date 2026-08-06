/**
 * Live-board Durable Objects (BLUEPRINT §20).
 *
 * Both boards follow the same pattern: a stateful DO that is the authority for
 * live state, accepts updates from authorized Stations (via the API), and
 * broadcasts state to subscribed screens over hibernatable WebSockets. This is
 * the deliberate real-time exception to the clock-synced model — screens reflect
 * events, not the clock, so they degrade to "not live" when disconnected.
 */

import { DurableObject } from "cloudflare:workers";
import {
  type BoardStateMsg,
  type QueueState,
  type QueueCategory,
  type IssuedTicket,
  type RoomState,
  type ScoreState,
  type ScoreSide,
} from "@scena/protocol";
import type { Env } from "./env.js";

const RECENT_CAP = 4;
const DEFAULT_KEY = "_default";

/**
 * `QueueDO` — one per queue board. Authority for the ticket queue. Supports
 * multiple service categories (each its own prefix + independent ticket series);
 * an uncategorized board is just the single default series.
 */
export class QueueDO extends DurableObject<Env> {
  /** Configure the board (default prefix + categories). Idempotent seed. */
  async init(config: { prefix?: string; categories?: QueueCategory[] }): Promise<void> {
    const existing = await this.ctx.storage.get<string>("prefix");
    if (existing === undefined) {
      await this.ctx.storage.put("prefix", config.prefix ?? "A");
      await this.ctx.storage.put("categories", config.categories ?? []);
      await this.ctx.storage.put("recent", []);
    }
    await this.ensureRollover();
  }

  /**
   * Manual reset — clears every series' issued/served counters and the current
   * call, so the queue starts fresh (a new day, a new session). Config (prefix +
   * categories) is kept. This is the "true queue management" reset (§boards).
   */
  async reset(): Promise<QueueState> {
    const all = await this.ctx.storage.list<unknown>();
    const drop: string[] = [];
    for (const k of all.keys()) if (k.startsWith("srv:") || k.startsWith("iss:")) drop.push(k);
    if (drop.length) await this.ctx.storage.delete(drop);
    const now = Date.now();
    await this.ctx.storage.put({ serving: null, counter: null, label: null, recent: [], resetAt: now, epoch: now });
    await this.ensureRollover();
    await this.broadcast();
    return this.load();
  }

  /** Ensure a daily-rollover alarm is pending (fires at the next UTC midnight,
   *  auto-resetting the queue). Idempotent — a no-op if one is already set. */
  private async ensureRollover(): Promise<void> {
    if ((await this.ctx.storage.getAlarm()) != null) return;
    const next = new Date(Date.now());
    next.setUTCHours(24, 0, 0, 0); // roll to the next midnight UTC
    await this.ctx.storage.setAlarm(next.getTime());
  }

  /** Daily rollover: reset the queue, then reschedule for the next midnight
   *  (reset()'s ensureRollover sees the consumed alarm and sets the next one). */
  override async alarm(): Promise<void> {
    await this.reset();
  }

  /** Update the default prefix / categories after creation (from the dashboard). */
  async configure(config: { prefix?: string; categories?: QueueCategory[] }): Promise<QueueState> {
    if (config.prefix) await this.ctx.storage.put("defaultPrefix", config.prefix);
    if (config.categories) await this.ctx.storage.put("categories", config.categories);
    await this.broadcast();
    return this.load();
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    this.sendTo(server, await this.message());
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close();
    } catch {
      /* already closing */
    }
  }

  private async categories(): Promise<QueueCategory[]> {
    return (await this.ctx.storage.get<QueueCategory[]>("categories")) ?? [];
  }

  private async prefixFor(cats: QueueCategory[], categoryId: string | null): Promise<{ key: string; prefix: string; label: string | null }> {
    if (categoryId) {
      const cat = cats.find((c) => c.id === categoryId);
      if (cat) return { key: `s:${cat.id}`, prefix: cat.prefix, label: cat.name };
    }
    const prefix = (await this.ctx.storage.get<string>("defaultPrefix")) ?? (await this.ctx.storage.get<string>("prefix")) ?? "A";
    return { key: DEFAULT_KEY, prefix, label: null };
  }

  /**
   * Call the next number in a category to a counter. Single-threaded, so
   * concurrent presses serialize (no double-calls, §20). Epoch-stamped so every
   * screen fires the number + chime + announcement in phase (§21).
   */
  async call(counter: number, categoryId: string | null = null): Promise<QueueState> {
    await this.ensureRollover(); // active queues self-arm the daily rollover
    const cats = await this.categories();
    const { key, prefix, label } = await this.prefixFor(cats, categoryId);
    const srv = ((await this.ctx.storage.get<number>(`srv:${key}`)) ?? 0) + 1;
    const iss = (await this.ctx.storage.get<number>(`iss:${key}`)) ?? 0;
    await this.ctx.storage.put(`srv:${key}`, srv);
    if (srv > iss) await this.ctx.storage.put(`iss:${key}`, srv); // auto-issue on demand
    const recent = ((await this.ctx.storage.get<QueueState["recent"]>("recent")) ?? []);
    await this.ctx.storage.put({
      prefix,
      serving: srv,
      counter,
      label,
      epoch: Date.now(),
      recent: [{ number: srv, counter, prefix, label: label ?? undefined }, ...recent].slice(0, RECENT_CAP),
    });
    await this.broadcast();
    return this.load();
  }

  /** Call a SPECIFIC token number to a counter (call-by-token). Epoch-stamped
   *  like call(), so screens fire number + chime + announcement in phase. */
  async callNumber(counter: number, number: number, categoryId: string | null = null): Promise<QueueState> {
    await this.ensureRollover(); // active queues self-arm the daily rollover
    const cats = await this.categories();
    const { key, prefix, label } = await this.prefixFor(cats, categoryId);
    const srv = Math.max(1, Math.floor(number));
    const iss = (await this.ctx.storage.get<number>(`iss:${key}`)) ?? 0;
    await this.ctx.storage.put(`srv:${key}`, srv);
    if (srv > iss) await this.ctx.storage.put(`iss:${key}`, srv);
    const recent = (await this.ctx.storage.get<QueueState["recent"]>("recent")) ?? [];
    await this.ctx.storage.put({
      prefix,
      serving: srv,
      counter,
      label,
      epoch: Date.now(),
      recent: [{ number: srv, counter, prefix, label: label ?? undefined }, ...recent].slice(0, RECENT_CAP),
    });
    await this.broadcast();
    return this.load();
  }

  /** Re-announce the current number (fresh epoch → screens re-chime). */
  async recall(): Promise<QueueState> {
    const s = await this.load();
    if (s.serving === null) return s;
    await this.ctx.storage.put("epoch", Date.now());
    await this.broadcast();
    return this.load();
  }

  /** Issue a ticket in a category (raises the waiting count). Returns the ticket. */
  async issueTicket(categoryId: string | null = null): Promise<IssuedTicket> {
    await this.ensureRollover(); // active queues self-arm the daily rollover
    const cats = await this.categories();
    const { key, prefix, label } = await this.prefixFor(cats, categoryId);
    const number = ((await this.ctx.storage.get<number>(`iss:${key}`)) ?? 0) + 1;
    await this.ctx.storage.put(`iss:${key}`, number);
    const srv = (await this.ctx.storage.get<number>(`srv:${key}`)) ?? 0;
    await this.broadcast();
    return { prefix, number, categoryId: categoryId ?? null, label, ahead: Math.max(0, number - srv - 1) };
  }

  async state(): Promise<QueueState> {
    return this.load();
  }

  private async load(): Promise<QueueState> {
    const cats = await this.categories();
    // Prefer the operator-updated default prefix (configure writes `defaultPrefix`);
    // fall back to the seed `prefix` so the displayed series matches what's issued.
    const prefix = (await this.ctx.storage.get<string>("defaultPrefix")) ?? (await this.ctx.storage.get<string>("prefix")) ?? "A";
    const curKey = DEFAULT_KEY; // top-level issued reflects the default series

    // Per-series counters (waiting = issued − served), for the pending view.
    const seriesDefs = cats.length
      ? cats.map((c) => ({ categoryId: c.id as string | null, name: c.name as string | null, prefix: c.prefix, key: `s:${c.id}` }))
      : [{ categoryId: null, name: null, prefix, key: DEFAULT_KEY }];
    const series = await Promise.all(
      seriesDefs.map(async (sd) => {
        const issued = (await this.ctx.storage.get<number>(`iss:${sd.key}`)) ?? 0;
        const srv = (await this.ctx.storage.get<number>(`srv:${sd.key}`)) ?? 0;
        return { categoryId: sd.categoryId, name: sd.name, prefix: sd.prefix, issued, serving: srv || null, waiting: Math.max(0, issued - srv) };
      }),
    );

    return {
      prefix,
      issued: (await this.ctx.storage.get<number>(`iss:${curKey}`)) ?? 0,
      serving: (await this.ctx.storage.get<number | null>("serving")) ?? null,
      counter: (await this.ctx.storage.get<number | null>("counter")) ?? null,
      label: (await this.ctx.storage.get<string | null>("label")) ?? null,
      epoch: (await this.ctx.storage.get<number>("epoch")) ?? 0,
      resetAt: (await this.ctx.storage.get<number>("resetAt")) ?? 0,
      recent: (await this.ctx.storage.get<QueueState["recent"]>("recent")) ?? [],
      categories: cats,
      series,
    };
  }

  private async message(): Promise<BoardStateMsg> {
    return { type: "board", boardId: this.ctx.id.toString(), kind: "queue", queue: await this.load() };
  }

  private async broadcast(): Promise<void> {
    const msg = await this.message();
    for (const ws of this.ctx.getWebSockets()) this.sendTo(ws, msg);
  }

  private sendTo(ws: WebSocket, msg: BoardStateMsg): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket gone */
    }
  }
}

/** A room as stored — `since` is added at runtime, so accept it as optional. */
type StoredRoom = { id: string; name: string; status: string; since?: number };

/** `RoomBoardDO` — one per room-status board. Purely reflective (§20). */
export class RoomBoardDO extends DurableObject<Env> {
  async init(config: { statuses?: RoomState["statuses"]; rooms?: StoredRoom[] }): Promise<void> {
    const existing = await this.ctx.storage.get<StoredRoom[]>("rooms");
    if (existing === undefined) {
      await this.ctx.storage.put("statuses", config.statuses ?? DEFAULT_STATUSES);
      await this.ctx.storage.put("rooms", config.rooms ?? []);
    }
  }

  /** Replace the rooms + status palette after creation (dashboard editor). New
   *  rooms start unstamped; existing ones keep their status where the id matches.
   *  A room whose status no longer exists (its status was deleted) is remapped to
   *  the first status so it never renders a dangling id. */
  async configure(config: { statuses?: RoomState["statuses"]; rooms?: StoredRoom[] }): Promise<RoomState> {
    const statuses = config.statuses ?? (await this.ctx.storage.get<RoomState["statuses"]>("statuses")) ?? DEFAULT_STATUSES;
    if (config.statuses) await this.ctx.storage.put("statuses", config.statuses);
    const valid = new Set(statuses.map((s) => s.id));
    const fallback = statuses[0]?.id ?? "";
    const fix = (status: string) => (valid.has(status) ? status : fallback);
    const prev = (await this.ctx.storage.get<StoredRoom[]>("rooms")) ?? [];
    if (config.rooms) {
      const byId = new Map(prev.map((r) => [r.id, r]));
      const merged = config.rooms.map((r) => {
        const old = byId.get(r.id);
        return { id: r.id, name: r.name, status: fix(old?.status ?? r.status), since: old?.since ?? 0 };
      });
      await this.ctx.storage.put("rooms", merged);
    } else if (config.statuses) {
      // Palette changed but the room set didn't — remap any now-orphaned room.
      await this.ctx.storage.put("rooms", prev.map((r) => ({ ...r, status: fix(r.status) })));
    }
    await this.broadcast();
    return this.load();
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    this.sendTo(server, await this.message());
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close();
    } catch {
      /* already closing */
    }
  }

  /** Flip a room's status, stamp the change time (for the door-tablet flash),
   *  and broadcast the new state (§20). */
  async setStatus(roomId: string, statusId: string): Promise<RoomState> {
    const rooms = (await this.ctx.storage.get<StoredRoom[]>("rooms")) ?? [];
    const statuses = (await this.ctx.storage.get<RoomState["statuses"]>("statuses")) ?? DEFAULT_STATUSES;
    const room = rooms.find((r) => r.id === roomId);
    if (room && statuses.some((st) => st.id === statusId)) {
      const now = Date.now();
      room.status = statusId;
      room.since = now;
      await this.ctx.storage.put("rooms", rooms);
      await this.ctx.storage.put("epoch", now);
      await this.broadcast();
    }
    return this.load();
  }

  async state(): Promise<RoomState> {
    return this.load();
  }

  private async load(): Promise<RoomState> {
    const rooms = (await this.ctx.storage.get<StoredRoom[]>("rooms")) ?? [];
    return {
      statuses: (await this.ctx.storage.get<RoomState["statuses"]>("statuses")) ?? DEFAULT_STATUSES,
      rooms: rooms.map((r) => ({ id: r.id, name: r.name, status: r.status, since: r.since ?? 0 })),
      epoch: (await this.ctx.storage.get<number>("epoch")) ?? 0,
    };
  }

  private async message(): Promise<BoardStateMsg> {
    return { type: "board", boardId: this.ctx.id.toString(), kind: "room", room: await this.load() };
  }

  private async broadcast(): Promise<void> {
    const msg = await this.message();
    for (const ws of this.ctx.getWebSockets()) this.sendTo(ws, msg);
  }

  private sendTo(ws: WebSocket, msg: BoardStateMsg): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket gone */
    }
  }
}

const DEFAULT_STATUSES: RoomState["statuses"] = [
  { id: "ready", label: "Ready", color: "oklch(0.68 0.16 155)" },
  { id: "preparing", label: "Preparing", color: "oklch(0.75 0.15 75)" },
  { id: "occupied", label: "Occupied", color: "oklch(0.6 0.2 25)" },
];

/**
 * `ScoreDO` — one per scoreboard (game scores, §boards). Authority for each
 * side's score plus a free-text period/clock label the operator drives. A
 * referee (coordinator) controls every side; a per-side station user adjusts
 * only its own score. Epoch-stamped so screens flash the changed number.
 */
export class ScoreDO extends DurableObject<Env> {
  async init(config: { sides?: ScoreSide[]; title?: string }): Promise<void> {
    const existing = await this.ctx.storage.get<ScoreSide[]>("sides");
    if (existing === undefined) {
      await this.ctx.storage.put("sides", config.sides ?? DEFAULT_SIDES);
      await this.ctx.storage.put("title", config.title ?? "");
      await this.ctx.storage.put("period", "");
    }
  }

  /** Replace the sides / title after creation (dashboard editor), keeping each
   *  side's live score where the id matches. */
  async configure(config: { sides?: ScoreSide[]; title?: string }): Promise<ScoreState> {
    if (config.title !== undefined) await this.ctx.storage.put("title", config.title);
    if (config.sides) {
      const prev = await this.sides();
      const byId = new Map(prev.map((s) => [s.id, s]));
      const merged = config.sides.map((s) => ({ ...s, score: byId.get(s.id)?.score ?? s.score ?? 0 }));
      await this.ctx.storage.put("sides", merged);
    }
    await this.stamp();
    await this.broadcast();
    return this.load();
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    this.sendTo(server, await this.message());
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close();
    } catch {
      /* already closing */
    }
  }

  private async sides(): Promise<ScoreSide[]> {
    return (await this.ctx.storage.get<ScoreSide[]>("sides")) ?? DEFAULT_SIDES;
  }

  private async stamp(): Promise<void> {
    await this.ctx.storage.put("epoch", Date.now());
  }

  /** Adjust a side's score by a delta (clamped at 0). */
  async addScore(sideId: string, delta: number): Promise<ScoreState> {
    const sides = await this.sides();
    const side = sides.find((s) => s.id === sideId);
    if (side) {
      side.score = Math.max(0, (side.score ?? 0) + Math.trunc(delta));
      await this.ctx.storage.put("sides", sides);
      await this.stamp();
      await this.broadcast();
    }
    return this.load();
  }

  /** Set a side's score to an absolute value (clamped at 0). */
  async setScore(sideId: string, value: number): Promise<ScoreState> {
    const sides = await this.sides();
    const side = sides.find((s) => s.id === sideId);
    if (side) {
      side.score = Math.max(0, Math.trunc(value));
      await this.ctx.storage.put("sides", sides);
      await this.stamp();
      await this.broadcast();
    }
    return this.load();
  }

  /** Set the free-text period/clock label (e.g. "Q3 · 04:12"). */
  async setPeriod(period: string): Promise<ScoreState> {
    await this.ctx.storage.put("period", period);
    await this.stamp();
    await this.broadcast();
    return this.load();
  }

  /** Zero every side's score + clear the period (new game). */
  async reset(): Promise<ScoreState> {
    const sides = (await this.sides()).map((s) => ({ ...s, score: 0 }));
    await this.ctx.storage.put("sides", sides);
    await this.ctx.storage.put("period", "");
    await this.stamp();
    await this.broadcast();
    return this.load();
  }

  async state(): Promise<ScoreState> {
    return this.load();
  }

  private async load(): Promise<ScoreState> {
    const sides = (await this.ctx.storage.get<ScoreSide[]>("sides")) ?? DEFAULT_SIDES;
    return {
      sides: sides.map((s) => ({ id: s.id, name: s.name, short: s.short ?? "", score: s.score ?? 0, color: s.color ?? "" })),
      period: (await this.ctx.storage.get<string>("period")) ?? "",
      title: (await this.ctx.storage.get<string>("title")) ?? "",
      epoch: (await this.ctx.storage.get<number>("epoch")) ?? 0,
    };
  }

  private async message(): Promise<BoardStateMsg> {
    return { type: "board", boardId: this.ctx.id.toString(), kind: "score", score: await this.load() };
  }

  private async broadcast(): Promise<void> {
    const msg = await this.message();
    for (const ws of this.ctx.getWebSockets()) this.sendTo(ws, msg);
  }

  private sendTo(ws: WebSocket, msg: BoardStateMsg): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket gone */
    }
  }
}

const DEFAULT_SIDES: ScoreSide[] = [
  { id: "home", name: "Home", short: "HOME", score: 0, color: "" },
  { id: "away", name: "Away", short: "AWAY", score: 0, color: "" },
];
