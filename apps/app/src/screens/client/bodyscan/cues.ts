/**
 * Body-scan voice guidance. Cues are fetched once at scan start from
 * `/api/body-scan/cues` (tenant-voiced WAVs, cached server-side). Each cue plays
 * from its `url`; if the url is empty (no credits / provider down / feature
 * off), we fall back to the browser's `speechSynthesis` on the cue `text`. The
 * cue set never contains anything about the frame — only spoken instructions.
 */

import { api } from "../../../api.js";
import type { CueId } from "./pipeline.js";

interface Cue { id: string; url: string; text: string }

/** Local fallback text so guidance still speaks if the cues endpoint 403s. */
const FALLBACK: Record<CueId, string> = {
  intro: "Let's scan your body composition. Stand back so your whole body, head to feet, fits inside the frame.",
  pose_front: "Face the camera. Stand with your feet about shoulder-width apart, both feet inside the frame.",
  pose_side: "Now turn to your side. Keep both feet in the frame and let your arms rest down.",
  step_back: "Step back a little.",
  step_forward: "Step a little closer.",
  center: "Move into the middle of the frame.",
  feet: "Step back until both of your feet are inside the frame.",
  arms_out: "Hold your arms out to the sides, away from your body.",
  arms_down: "Now relax — let your arms hang straight down against your sides.",
  straighten: "Stand up tall, and hold still.",
  hold: "Hold it right there.",
  captured: "Got it.",
  done: "All done. Calculating your results now.",
};

export class CuePlayer {
  private map = new Map<string, Cue>();
  private audio = new Map<string, HTMLAudioElement>();
  private lastId: string | null = null;
  private lastAt = 0;
  private busyUntil = 0; // never start a cue while one is still speaking
  private current: HTMLAudioElement | null = null;
  private muted = false;

  /** Preload the tenant cue set. Never throws — degrades to speechSynthesis. */
  async preload(): Promise<void> {
    try {
      const r = await api.get<{ cues: Cue[] }>("/api/body-scan/cues");
      for (const c of r.cues) {
        this.map.set(c.id, c);
        if (c.url) {
          const a = new Audio(c.url);
          a.preload = "auto";
          this.audio.set(c.id, a);
        }
      }
    } catch {
      /* endpoint unavailable — FALLBACK + speechSynthesis cover it */
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (m) this.stop();
  }

  /**
   * Speak a cue. Two guards stop the "two voices racing" overlap:
   *  - a GLOBAL cooldown (`busyUntil`) — while any cue is still speaking, new
   *    cues are dropped, so rapidly-changing alignment can't stack utterances or
   *    let a late audio.play() promise resume over the next one;
   *  - a per-id debounce — the same cue won't repeat for a few seconds.
   */
  play(id: CueId): void {
    if (this.muted) return;
    const now = Date.now();
    if (now < this.busyUntil) return; // a cue is still playing — don't talk over it
    if (id === this.lastId && now - this.lastAt < 3500) return;
    this.lastId = id;
    this.lastAt = now;
    const audio = this.audio.get(id);
    if (audio) {
      // Reserve a conservative window up front; tighten once the duration is known.
      const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      this.busyUntil = now + (dur ? dur * 1000 + 350 : 2400);
      this.current = audio;
      audio.currentTime = 0;
      audio.onended = () => { this.busyUntil = Date.now() + 300; this.current = null; };
      void audio
        .play()
        .then(() => { if (audio.duration && Number.isFinite(audio.duration)) this.busyUntil = now + audio.duration * 1000 + 350; })
        .catch(() => { this.current = null; this.busyUntil = 0; this.speak(id); });
    } else {
      this.speak(id);
    }
  }

  private speak(id: CueId): void {
    const text = this.map.get(id)?.text ?? FALLBACK[id];
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1;
      // Hold the floor for an estimated speaking time; release on end.
      this.busyUntil = Date.now() + Math.max(1600, text.length * 65);
      u.onend = () => { this.busyUntil = Date.now() + 300; };
      synth.speak(u);
    } catch {
      /* no TTS available — the on-screen message still guides */
    }
  }

  private stop(): void {
    this.busyUntil = 0;
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    const a = this.current;
    this.current = null;
    if (a) { try { a.pause(); a.onended = null; } catch { /* ignore */ } }
  }

  dispose(): void {
    this.stop();
    this.audio.clear();
    this.map.clear();
  }
}
