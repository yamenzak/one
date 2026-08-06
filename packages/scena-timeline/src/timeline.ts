/**
 * The deterministic playout timeline (BLUEPRINT §1).
 *
 *     position(t) = (t − T0) mod cycleLength
 *
 * A playlist concatenates its item durations into one timeline of length
 * `cycleMs`, anchored at epoch `T0`. Given any wall-clock time `t`, a screen
 * knows exactly which item is active and how far into it to seek — with no
 * coordination message. This is a pure function of the clock, which is the one
 * thing that must be synchronized (§7).
 */

import { shuffledOrder } from "./shuffle.js";

/** A resolved playout item: it always has a concrete, positive duration. */
export interface TimelineItem {
  readonly id: string;
  readonly durationMs: number;
}

export interface TimelineOptions {
  /** When true, each cycle's item order is reshuffled deterministically (§1). */
  readonly shuffle?: boolean;
  /** Stable seed for the shuffle (e.g. the playlist id). Required if shuffle. */
  readonly seed?: string;
}

export interface Timeline {
  /** Epoch anchor in ms since Unix epoch. */
  readonly t0: number;
  /** Total cycle length: the sum of every item's duration. Always > 0. */
  readonly cycleMs: number;
  readonly items: readonly TimelineItem[];
  readonly shuffle: boolean;
  readonly seed: string;
}

/** The resolved playout state at an instant. */
export interface PlayoutState {
  /** The active item. */
  readonly item: TimelineItem;
  /** Index of the active item in the *original* (unshuffled) item list. */
  readonly index: number;
  /** How far into the active item to seek, in ms (0 ≤ offset < item.duration). */
  readonly offsetMs: number;
  /** ms remaining until the next item boundary. */
  readonly remainingMs: number;
  /** Which cycle we are in (0 at/after t0, negative before). */
  readonly cycleIndex: number;
  /** Position within the current cycle, in ms (0 ≤ pos < cycleMs). */
  readonly cyclePositionMs: number;
}

export class EmptyTimelineError extends Error {
  constructor() {
    super("Cannot build a timeline with no positive-duration items");
    this.name = "EmptyTimelineError";
  }
}

/**
 * Build an immutable timeline from items. Items with a non-positive duration
 * are rejected: every item must occupy real time on the cycle, otherwise the
 * boundary math (and seek offsets) become ambiguous.
 */
export function buildTimeline(
  items: readonly TimelineItem[],
  t0: number,
  opts: TimelineOptions = {},
): Timeline {
  if (items.length === 0) throw new EmptyTimelineError();
  let cycleMs = 0;
  for (const it of items) {
    if (!(it.durationMs > 0) || !Number.isFinite(it.durationMs)) {
      throw new RangeError(
        `Item ${it.id} has non-positive/invalid durationMs: ${it.durationMs}`,
      );
    }
    cycleMs += it.durationMs;
  }
  const shuffle = opts.shuffle ?? false;
  if (shuffle && !opts.seed) {
    throw new Error("shuffle requires a stable seed");
  }
  return {
    t0,
    cycleMs,
    items,
    shuffle,
    seed: opts.seed ?? "",
  };
}

/**
 * Which cycle contains time `t`. `floor((t − t0) / cycleMs)`, so times before
 * `t0` yield negative indices and the modulo still lands in [0, cycleMs).
 */
export function cycleIndexAt(tl: Timeline, t: number): number {
  return Math.floor((t - tl.t0) / tl.cycleMs);
}

/**
 * position(t): offset within the current cycle, always in [0, cycleMs).
 * The double-mod keeps it non-negative for t < t0.
 */
export function cyclePositionAt(tl: Timeline, t: number): number {
  const raw = (t - tl.t0) % tl.cycleMs;
  // `+ 0` normalizes JS's negative zero (from a modulo landing exactly on a
  // boundary before t0) to +0, so callers never see -0.
  return raw < 0 ? raw + tl.cycleMs : raw + 0;
}

/**
 * Full resolution: given the wall clock `t`, return the active item, seek
 * offset, boundary countdown, and cycle index — everything a renderer needs.
 *
 * When `shuffle` is on, the per-cycle order is a deterministic permutation of
 * the items (identical on every screen), but `index` always refers back to the
 * original list so callers can address the underlying asset.
 */
export function resolveAt(tl: Timeline, t: number): PlayoutState {
  const cycleIndex = cycleIndexAt(tl, t);
  const cyclePositionMs = cyclePositionAt(tl, t);

  const order = tl.shuffle
    ? shuffledOrder(tl.items.length, tl.seed, cycleIndex)
    : null;

  let acc = 0;
  for (let slot = 0; slot < tl.items.length; slot++) {
    const originalIndex = order ? order[slot]! : slot;
    const item = tl.items[originalIndex]!;
    const end = acc + item.durationMs;
    if (cyclePositionMs < end) {
      const offsetMs = cyclePositionMs - acc;
      return {
        item,
        index: originalIndex,
        offsetMs,
        remainingMs: item.durationMs - offsetMs,
        cycleIndex,
        cyclePositionMs,
      };
    }
    acc = end;
  }

  // Unreachable: cyclePositionMs < cycleMs === sum(durations). Guard anyway so
  // a floating-point edge (position exactly == cycleMs) can't return undefined.
  const lastSlot = tl.items.length - 1;
  const originalIndex = order ? order[lastSlot]! : lastSlot;
  const item = tl.items[originalIndex]!;
  return {
    item,
    index: originalIndex,
    offsetMs: item.durationMs,
    remainingMs: 0,
    cycleIndex,
    cyclePositionMs,
  };
}

/**
 * Wall-clock time of the next item boundary at or after `t`. Useful for
 * arming a timer/alarm to advance exactly on the boundary instead of polling.
 */
export function nextBoundaryAt(tl: Timeline, t: number): number {
  return t + resolveAt(tl, t).remainingMs;
}
