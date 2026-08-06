/**
 * Music playout on the screen (BLUEPRINT §16).
 *
 * Music is a pure function of the synced clock, exactly like slides: the
 * channel's tracks are concatenated into the music timeline (§1) and every
 * screen resolves the same track at the same seek offset from the shared epoch,
 * so audio stays in phase across a room.
 *
 * The correction is a *slew*, not a seek: drift (the sound card's clock always
 * creeps against wall-clock) is absorbed by a sub-percent `playbackRate` nudge
 * via `SyncedMedia`, so the bed never stutters. A hard seek happens only on a
 * track change or a large gap (e.g. a backgrounded tab), where a jump is
 * expected anyway.
 *
 * Muting is driven by remote commands (§11); ducking/pausing by audio ads (§21).
 * Browser autoplay policy may block sound until the first user gesture — on a
 * kiosk that is a non-issue; here we also retry playback on the first pointer/key.
 */

import { resolveAt, type Timeline } from "@scena/timeline";
import { musicTimeline, type Manifest } from "@scena/manifest";
import { SyncedMedia } from "./media-sync.js";

const SYNC_INTERVAL_MS = 500;
const DUCK_VOLUME = 0.15;

export class MusicPlayer {
  private audio: HTMLAudioElement;
  private media: SyncedMedia;
  private timeline: Timeline | null = null;
  private urlByHash = new Map<string, string>();
  private trackById = new Map<string, { hash: string; durationMs: number }>();
  private currentTrackId = "";
  private lastSig = "";
  private muted = false;
  private ducked = false;
  private solo = false;
  private timer: ReturnType<typeof setInterval> | 0 = 0;

  constructor(private readonly clock: () => number) {
    this.audio = document.createElement("audio");
    this.audio.preload = "auto";
    this.audio.style.display = "none";
    document.body.appendChild(this.audio); // in the DOM so playout is inspectable
    this.media = new SyncedMedia(this.audio);
    const unlock = () => this.sync();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }

  /** Load the manifest's music timeline; playout follows the clock from here. A
   *  nudge whose music content is unchanged is a no-op — otherwise every
   *  duplicate publish would reset the current track and hard-seek the bed. */
  setManifest(m: Manifest): void {
    const sig = JSON.stringify({ music: m.music, assets: m.assets, solo: m.soloScreen === true });
    if (this.timeline && sig === this.lastSig) return; // music unchanged — keep playing in phase
    this.lastSig = sig;
    this.timeline = musicTimeline(m);
    this.solo = m.soloScreen === true;
    this.urlByHash = new Map(m.assets.map((a) => [a.hash, a.url]));
    this.trackById = new Map(m.music.items.map((t) => [t.id, { hash: t.hash, durationMs: t.durationMs }]));
    this.currentTrackId = "";
    if (!this.timeline) {
      this.stop();
      return;
    }
    if (!this.timer) this.timer = setInterval(() => this.sync(), SYNC_INTERVAL_MS);
    this.sync();
  }

  /** Remote mute/unmute (§11): mute pauses audio; unmute resumes in phase. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) { this.media.setActive(false); }
    else this.sync();
  }

  /** Duck under an audio ad (§21): drop the bed volume, don't stop it. */
  setDucked(ducked: boolean): void {
    this.ducked = ducked;
    this.audio.volume = ducked ? DUCK_VOLUME : 1;
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = 0;
    this.media.setActive(false);
    this.audio.removeAttribute("src");
    this.currentTrackId = "";
  }

  private sync(): void {
    if (!this.timeline || this.muted) return;
    const state = resolveAt(this.timeline, this.clock());
    const track = this.trackById.get(state.item.id);
    if (!track) return;
    const url = this.urlByHash.get(track.hash);
    if (!url) return;
    const targetSec = state.offsetMs / 1000;

    if (state.item.id !== this.currentTrackId) {
      // Track change — load, then hard-seek to phase and start (an expected jump).
      this.currentTrackId = state.item.id;
      this.media.setActive(false);
      this.audio.src = url;
      this.audio.volume = this.ducked ? DUCK_VOLUME : 1;
      const onReady = () => {
        this.audio.removeEventListener("loadedmetadata", onReady);
        this.media.setActive(true);
        this.media.reseek(targetSec);
      };
      this.audio.addEventListener("loadedmetadata", onReady);
      this.audio.load();
      return;
    }
    // Same track. Synced mode glides back into phase with a tiny tempo nudge;
    // solo mode free-runs (no correction) and just keeps it playing.
    this.media.setActive(true);
    if (this.solo) { if (this.audio.paused) void this.audio.play().catch(() => {}); }
    else this.media.sync(targetSec);
  }

  /** Diagnostics snapshot (used by the HUD / verification). */
  get info(): { trackId: string; muted: boolean; ducked: boolean; paused: boolean; currentTime: number; volume: number; rate: number } {
    return {
      trackId: this.currentTrackId,
      muted: this.muted,
      ducked: this.ducked,
      paused: this.audio.paused,
      currentTime: this.audio.currentTime,
      volume: this.audio.volume,
      rate: this.audio.playbackRate,
    };
  }
}
