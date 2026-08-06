/**
 * Live-board wire protocol (BLUEPRINT §20).
 *
 * Boards are the one deliberate real-time exception to the clock-synced model:
 * a stateful DO is the authority, Stations push updates, and subscribed screens
 * receive state broadcasts over a socket. A queue *call* carries an epoch so the
 * number + chime + announcement fire identically across every screen in a room
 * (the same stamping trick as ad interrupts, §21).
 *
 * Broadcasts carry full state (a valid, simplest-correct delta) — screens just
 * render whatever they last received, and show "not live" when disconnected.
 */

import { z } from "zod";

export const BoardKind = z.enum(["queue", "room", "score"]);
export type BoardKind = z.infer<typeof BoardKind>;

/* --------------------------------- queue ---------------------------------- */

/** A service category — its own ticket series (prefix + independent counters). */
export const QueueCategory = z.object({ id: z.string(), name: z.string(), prefix: z.string() });
export type QueueCategory = z.infer<typeof QueueCategory>;

export const QueueState = z.object({
  /** Prefix of the *current* call (reflects the last-called category). */
  prefix: z.string(),
  /** Highest ticket number issued so far (across the current series). */
  issued: z.number().int().nonnegative(),
  /** Number currently being served, or null before the first call. */
  serving: z.number().int().nonnegative().nullable(),
  /** Counter/desk the current number was called to. */
  counter: z.number().int().nullable(),
  /** Category name of the current call, for display (null if uncategorized). */
  label: z.string().nullable().default(null),
  /** Epoch (ms) of the current call — screens fire number+chime off this (§21). */
  epoch: z.number().int(),
  /** Epoch (ms) of the last reset (manual or the daily rollover). Screens can
   *  show a "reset" moment; 0 before the first reset. */
  resetAt: z.number().int().default(0),
  /** Recent calls for the "last served" strip. */
  recent: z.array(z.object({ number: z.number().int(), counter: z.number().int(), prefix: z.string().optional(), label: z.string().optional() })),
  /** Service categories, if the board is split into multiple ticket series. */
  categories: z.array(QueueCategory).default([]),
  /** Per-series counters, so the station/kiosk can show pending (waiting) tokens
   *  and the next-up number for each category (or the default series). */
  series: z
    .array(
      z.object({
        categoryId: z.string().nullable(),
        name: z.string().nullable(),
        prefix: z.string(),
        issued: z.number().int().nonnegative(),
        serving: z.number().int().nonnegative().nullable(),
        waiting: z.number().int().nonnegative(),
      }),
    )
    .default([]),
});
export type QueueState = z.infer<typeof QueueState>;

/** A freshly issued ticket handed to a customer at the kiosk. */
export const IssuedTicket = z.object({
  prefix: z.string(),
  number: z.number().int().nonnegative(),
  categoryId: z.string().nullable(),
  label: z.string().nullable(),
  ahead: z.number().int().nonnegative(),
});
export type IssuedTicket = z.infer<typeof IssuedTicket>;

/* ---------------------------------- room ---------------------------------- */

export const RoomStatus = z.object({ id: z.string(), label: z.string(), color: z.string() });
export const Room = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  /** Epoch (ms) the room's status last changed — drives the door-tablet "flash"
   *  when a room flips (a widget flashes for a few seconds after `since`). */
  since: z.number().int().default(0),
});

export const RoomState = z.object({
  statuses: z.array(RoomStatus),
  rooms: z.array(Room),
  /** Epoch (ms) of the most recent status change across all rooms. */
  epoch: z.number().int().default(0),
});
export type RoomState = z.infer<typeof RoomState>;

/* ---------------------------------- score --------------------------------- */

/** One competitor / team on a scoreboard. */
export const ScoreSide = z.object({
  id: z.string(),
  name: z.string(),
  /** Short label (e.g. "HOME"/"AWAY" or a 3-letter code) for compact displays. */
  short: z.string().default(""),
  score: z.number().int().default(0),
  /** Optional accent color for the side (falls back to the widget theme). */
  color: z.string().default(""),
});
export type ScoreSide = z.infer<typeof ScoreSide>;

export const ScoreState = z.object({
  sides: z.array(ScoreSide),
  /** Free-text period/clock label the operator sets (e.g. "Q3 · 04:12", "Set 2"). */
  period: z.string().default(""),
  /** Optional headline (competition / match title). */
  title: z.string().default(""),
  /** Epoch (ms) of the last change — screens flash the changed score off this. */
  epoch: z.number().int().default(0),
});
export type ScoreState = z.infer<typeof ScoreState>;

/* ------------------------------- broadcast -------------------------------- */

/** Full board state pushed to subscribers on connect and on every change. */
export const BoardStateMsg = z.object({
  type: z.literal("board"),
  boardId: z.string(),
  kind: BoardKind,
  queue: QueueState.optional(),
  room: RoomState.optional(),
  score: ScoreState.optional(),
});
export type BoardStateMsg = z.infer<typeof BoardStateMsg>;

export function decodeBoardState(raw: string): BoardStateMsg {
  return BoardStateMsg.parse(JSON.parse(raw));
}
