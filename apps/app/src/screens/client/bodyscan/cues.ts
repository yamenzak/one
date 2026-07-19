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
  intro: "Let's set up your body scan. Step back so your whole body fits in the frame.",
  step_back: "Step back a little.",
  step_forward: "Step a little closer.",
  center: "Move to the center of the frame.",
  arms: "Raise your arms slightly away from your sides.",
  straighten: "Stand up straight and face the camera.",
  hold: "Perfect. Hold still.",
  captured_front: "Front captured. Now turn to your side.",
  turn_side: "Turn so your side faces the camera.",
  captured_side: "All done. Calculating your results now.",
};

export class CuePlayer {
  private map = new Map<string, Cue>();
  private audio = new Map<string, HTMLAudioElement>();
  private lastId: string | null = null;
  private lastAt = 0;
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

  /** Speak a cue. Debounced so the same cue doesn't stutter frame-to-frame. */
  play(id: CueId): void {
    if (this.muted) return;
    const now = Date.now();
    if (id === this.lastId && now - this.lastAt < 2600) return;
    this.lastId = id;
    this.lastAt = now;
    this.stop();
    const audio = this.audio.get(id);
    if (audio) {
      audio.currentTime = 0;
      void audio.play().catch(() => this.speak(id));
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
      synth.speak(u);
    } catch {
      /* no TTS available — the on-screen message still guides */
    }
  }

  private stop(): void {
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    for (const a of this.audio.values()) { try { a.pause(); } catch { /* ignore */ } }
  }

  dispose(): void {
    this.stop();
    this.audio.clear();
    this.map.clear();
  }
}
