/**
 * Clock sync math (BLUEPRINT §7) — the heart of multi-screen sync.
 *
 * An NTP-style handshake runs periodically over the screen's existing socket:
 *
 *     screen → { tSend }
 *     edge   → { tSend, tServer }
 *     screen:  rtt    = now − tSend
 *              offset = tServer + rtt/2 − now
 *
 * The screen keeps a smoothed offset (EWMA, discarding high-RTT outliers) and
 * corrects drift by *slewing* video playbackRate ±1–2%, not by hard-seeking —
 * so viewers never see a pop. `syncedNow = monotonic() + offset` keeps a wonky
 * device wall-clock from jumping playout.
 *
 * All pure: no timers, no I/O. The caller supplies the timestamps.
 */

export interface SyncSample {
  /** Screen monotonic time when the request was sent (performance.now()). */
  readonly tSend: number;
  /** Server wall-clock echoed back (Date.now() on the edge). */
  readonly tServer: number;
  /** Screen monotonic time when the reply arrived. */
  readonly tRecv: number;
}

export interface SyncResult {
  /** Round-trip time in ms. */
  readonly rtt: number;
  /** Estimated offset to add to monotonic time to get server wall-clock. */
  readonly offset: number;
}

/**
 * Compute a single (rtt, offset) sample. `offset` maps the screen's *monotonic*
 * clock to server wall-clock time: serverTime ≈ tRecv + offset.
 */
export function computeSample(s: SyncSample): SyncResult {
  const rtt = s.tRecv - s.tSend;
  // Assume symmetric latency: the server's timestamp is ~rtt/2 old on arrival.
  const offset = s.tServer + rtt / 2 - s.tRecv;
  return { rtt, offset };
}

export interface OffsetFilterConfig {
  /** EWMA weight for a fresh sample (0..1). Higher = more responsive. */
  readonly alpha: number;
  /** Discard samples whose RTT exceeds `medianRtt * rttRejectFactor`. */
  readonly rttRejectFactor: number;
  /** Warm-up: accept the first N samples unfiltered to seed the estimate. */
  readonly warmup: number;
}

export const DEFAULT_FILTER: OffsetFilterConfig = {
  alpha: 0.2,
  rttRejectFactor: 2.5,
  warmup: 3,
};

/**
 * Stateful EWMA offset filter. Feed it samples; read `.offset` for the current
 * smoothed estimate. Rejects high-RTT outliers once past warm-up, because a
 * spike in latency corrupts the rtt/2 symmetry assumption.
 */
export class OffsetFilter {
  private cfg: OffsetFilterConfig;
  private _offset = 0;
  private _rttMedian = 0;
  private _count = 0;
  private recentRtt: number[] = [];

  constructor(cfg: Partial<OffsetFilterConfig> = {}) {
    this.cfg = { ...DEFAULT_FILTER, ...cfg };
  }

  get offset(): number {
    return this._offset;
  }
  get sampleCount(): number {
    return this._count;
  }
  get rttMedian(): number {
    return this._rttMedian;
  }

  /** Feed a raw sample. Returns true if accepted, false if rejected as outlier. */
  push(sample: SyncSample): boolean {
    const { rtt, offset } = computeSample(sample);

    const warming = this._count < this.cfg.warmup;
    if (!warming && this._rttMedian > 0 && rtt > this._rttMedian * this.cfg.rttRejectFactor) {
      return false; // outlier — latency spike breaks the symmetry assumption
    }

    // Maintain a rolling median of RTT (window of the last ~9 samples).
    this.recentRtt.push(rtt);
    if (this.recentRtt.length > 9) this.recentRtt.shift();
    this._rttMedian = median(this.recentRtt);

    if (this._count === 0) {
      this._offset = offset;
    } else {
      const a = warming ? Math.max(this.cfg.alpha, 0.5) : this.cfg.alpha;
      this._offset = this._offset + a * (offset - this._offset);
    }
    this._count++;
    return true;
  }

  /** serverTime for a given monotonic instant. */
  syncedTime(monotonicNow: number): number {
    return monotonicNow + this._offset;
  }
}

function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

export interface SlewConfig {
  /** Below this |error| (ms) we consider ourselves in sync — no correction. */
  readonly deadbandMs: number;
  /** Above this |error| (ms) we hard-seek instead of slewing (e.g. after a
   *  scene change or a long offline gap). */
  readonly hardSeekMs: number;
  /** Max playbackRate deviation while slewing (e.g. 0.02 = ±2%). */
  readonly maxRate: number;
}

export const DEFAULT_SLEW: SlewConfig = {
  deadbandMs: 15,
  hardSeekMs: 800,
  maxRate: 0.02,
};

export type SlewAction =
  | { readonly kind: "hold"; readonly playbackRate: 1 }
  | { readonly kind: "slew"; readonly playbackRate: number }
  | { readonly kind: "seek"; readonly toOffsetMs: number };

/**
 * Decide how to correct a playout error. `errorMs > 0` means the screen is
 * *behind* the target (needs to speed up); `< 0` means ahead (slow down).
 * `targetOffsetMs` is where the item *should* be seeked to right now, used when
 * we choose to hard-seek.
 */
export function decideSlew(
  errorMs: number,
  targetOffsetMs: number,
  cfg: SlewConfig = DEFAULT_SLEW,
): SlewAction {
  const abs = Math.abs(errorMs);
  if (abs <= cfg.deadbandMs) return { kind: "hold", playbackRate: 1 };
  if (abs >= cfg.hardSeekMs) return { kind: "seek", toOffsetMs: targetOffsetMs };
  // Proportional slew, clamped to ±maxRate. Behind (error>0) → rate > 1.
  const rate = 1 + Math.sign(errorMs) * Math.min(cfg.maxRate, abs / cfg.hardSeekMs * cfg.maxRate);
  return { kind: "slew", playbackRate: rate };
}

/**
 * Where a synced media element (audio/video) should be, in **seconds**, for a
 * given item offset — the actuation target the clock resolves to. A trimmed clip
 * starts at `clipStartMs`; a looping clip wraps the offset within the playable
 * clip length; a play-once clip clamps and holds its last frame. Every screen
 * computes the same target from the same synced offset, so media stays in phase.
 */
export function mediaTargetSec(
  offsetMs: number,
  clipStartMs: number,
  clipLenMs: number,
  loop: boolean,
): number {
  const startSec = Math.max(0, clipStartMs) / 1000;
  if (!(clipLenMs > 0) || !Number.isFinite(clipLenMs)) return startSec;
  const o = Math.max(0, offsetMs) / 1000;
  const lenSec = clipLenMs / 1000;
  const within = loop ? o % lenSec : Math.min(o, lenSec);
  return startSec + within;
}
