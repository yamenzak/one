/**
 * Smooth media actuation (BLUEPRINT §7) — the "last mile" of clock-synced
 * playout for `<audio>` / `<video>`.
 *
 * The clock resolves *where* a track/clip should be; this pulls the element
 * there without a jarring correction. Small drift (the audio/video hardware
 * clock always creeps against wall-clock) is absorbed by a tiny `playbackRate`
 * nudge — inaudible on audio (time-stretch keeps pitch), invisible on muted
 * video. A hard seek is reserved for a genuine gap: a track/clip change, a loop
 * wrap, or a tab that was backgrounded. This is exactly the slew policy the
 * clock engine (`decideSlew`) always defined — now wired to the elements.
 */

import { decideSlew, DEFAULT_SLEW, type SlewConfig } from "@scena/timeline";

/** HTMLMediaElement.readyState: enough buffered to play the next frame smoothly. */
const HAVE_FUTURE_DATA = 3;
/** Minimum gap between hard seeks. `sync()` runs every frame (~16ms); without a
 *  floor, a video that's behind (still buffering, or a big offset) would seek on
 *  every frame — the decoder never leaves "seeking" and the picture FREEZES. We
 *  seek at most this often and slew (playbackRate) in between. */
const MIN_SEEK_INTERVAL_MS = 700;
const nowMs = (): number => (typeof performance !== "undefined" ? performance.now() : 0);

export class SyncedMedia {
  private active = false;
  private lastRate = 1;
  private lastSeekAt = -Infinity;

  constructor(private readonly el: HTMLMediaElement, private readonly cfg: SlewConfig = DEFAULT_SLEW) {
    // Nudge tempo, not pitch, when slewing audio (default true in modern engines).
    try { (el as HTMLMediaElement & { preservesPitch?: boolean }).preservesPitch = true; } catch { /* older engine */ }
  }

  get element(): HTMLMediaElement { return this.el; }
  get isActive(): boolean { return this.active; }

  /** Mark this element as the one that should be playing. Deactivating pauses it
   *  and resets the rate, so only the active clip decodes. Activation itself
   *  doesn't play — the next `sync()` seeks to phase and starts it. */
  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    if (!active) { this.el.pause(); this.setRate(1); }
  }

  /**
   * Pull the element toward `targetSec`. Safe to call every frame while active.
   * `keepPlaying` = false lets a play-once clip hold its final frame instead of
   * being restarted (the caller passes false once the clip window is spent).
   */
  sync(targetSec: number, keepPlaying = true): void {
    if (!this.active) return;
    const el = this.el;

    // Never correct a seek that's still in flight, or an element that hasn't
    // buffered enough to play — doing so restarts the seek every frame and wedges
    // the decoder into a permanent "seeking" freeze. Just keep it playing.
    if (el.seeking || el.readyState < HAVE_FUTURE_DATA || !Number.isFinite(el.duration)) {
      if (keepPlaying && el.paused) this.kick();
      return;
    }

    const errorMs = (targetSec - el.currentTime) * 1000;
    const action = decideSlew(errorMs, targetSec, this.cfg);
    if (action.kind === "seek") {
      // A real gap. Seek at most every MIN_SEEK_INTERVAL_MS; between seeks, slew
      // hard toward the target so we glide in instead of thrashing.
      const t = nowMs();
      if (t - this.lastSeekAt >= MIN_SEEK_INTERVAL_MS) {
        this.lastSeekAt = t;
        this.hardSeek(action.toOffsetMs);
        this.setRate(1);
      } else {
        this.setRate(1 + Math.sign(errorMs) * this.cfg.maxRate);
      }
    } else if (action.kind === "slew") {
      this.setRate(action.playbackRate);
    } else {
      this.setRate(1);
    }
    if (keepPlaying && el.paused) this.kick();
  }

  /** Hard-seek + (re)start immediately — used on a track/clip change where a
   *  jump is expected anyway (not a drift correction). */
  reseek(targetSec: number): void {
    this.lastSeekAt = nowMs();
    this.hardSeek(targetSec);
    this.setRate(1);
    if (this.active) this.kick();
  }

  private kick(): void {
    void this.el.play?.().catch(() => { /* autoplay gated until a user gesture */ });
  }
  private hardSeek(sec: number): void {
    try { this.el.currentTime = sec; } catch { /* not seekable yet */ }
  }
  private setRate(r: number): void {
    if (r === this.lastRate) return;
    this.lastRate = r;
    try { this.el.playbackRate = r; } catch { /* ignore */ }
  }
}
