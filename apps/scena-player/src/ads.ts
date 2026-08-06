/**
 * Ad interrupt overlay on the screen (BLUEPRINT §21).
 *
 * An ad is an *event*, not a function of time: the ChannelDO stamps a
 * start-epoch + duration and every screen renders the interrupt from that
 * stamped epoch, so a room full of screens fires it together and stays locked
 * through it. Three kinds:
 *   - audio:   plays over the running slides (ducks music); a subtle badge.
 *   - video:   takes over the slide area for the duration, returns to cue.
 *   - command: forces a self-contained HTML slide (sandboxed) for the window.
 *
 * The overlay computes start/stop from the synced clock, so a screen that
 * reconnects mid-ad joins in-phase and lifts it at exactly the right moment.
 */

import type { InterruptMsg } from "@scena/protocol";
import type { PlayoutEvent } from "./player.js";
import { resolveApiUrl } from "./config.js";

export class AdInterruptOverlay {
  private el: HTMLElement | null = null;
  private audio: HTMLAudioElement | null = null;
  private currentId: string | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(
    private readonly emit?: (e: PlayoutEvent) => void,
    /** Duck the music bed while an audio ad plays (§16/§21). */
    private readonly onDuck?: (ducked: boolean) => void,
    /** The screen's current mute state, so an ad on a muted screen stays silent. */
    private readonly isMuted?: () => boolean,
  ) {}

  /** Schedule an interrupt against the synced clock. */
  show(msg: InterruptMsg, syncedNow: () => number): void {
    if (msg.role !== "ad" || !msg.ad) return;
    if (msg.id === this.currentId) return; // already handling this one
    const now = syncedNow();
    const startAt = Math.max(0, msg.startEpoch - now);
    const remaining = msg.startEpoch + msg.durationMs - now;
    if (remaining <= 0) return; // window already elapsed
    this.reset();
    this.currentId = msg.id;

    this.timers.push(
      setTimeout(() => {
        this.render(msg);
        this.emit?.({
          eventId: `ad:${msg.id}`,
          contentId: `ad:${msg.ad?.name ?? msg.id}`,
          kind: "ad",
          ts: msg.startEpoch,
          durationMs: msg.durationMs,
        });
      }, startAt),
    );
    // Lift at the end of the stamped window (from whenever we joined it).
    this.timers.push(setTimeout(() => this.clear(msg.id), Math.max(0, remaining)));
  }

  private render(msg: InterruptMsg): void {
    const ad = msg.ad!;
    if (ad.kind === "audio") {
      if (ad.duck) this.onDuck?.(true);
      this.audio = new Audio(ad.audioUrl ? resolveApiUrl(ad.audioUrl) : ad.audioUrl);
      this.audio.muted = this.isMuted?.() ?? false; // respect a muted screen
      this.audio.play().catch(() => {
        /* autoplay may be blocked until a user gesture; badge still shows */
      });
      // An optional companion still shows full-bleed for the window, so a visual
      // pairs with the voiceover; without one, the scene keeps playing beneath
      // and (unless a badge is shown) the audio ad is a silent overlay (§21).
      if (ad.companionUrl) {
        this.el = document.createElement("div");
        Object.assign(this.el.style, fullscreen);
        Object.assign(this.el.style, {
          backgroundImage: `url("${resolveApiUrl(ad.companionUrl)}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        } satisfies Partial<CSSStyleDeclaration>);
        if (!ad.hideBadge) this.el.appendChild(badge(ad.name ?? "Advertisement", true));
        document.body.appendChild(this.el);
      } else if (!ad.hideBadge) {
        this.el = badge(ad.name ?? "Advertisement");
        document.body.appendChild(this.el);
      }
      return;
    }
    // video / command take over the slide area.
    this.el = document.createElement("div");
    Object.assign(this.el.style, fullscreen);
    if (ad.kind === "video" && ad.videoUrl) {
      const v = document.createElement("video");
      v.src = resolveApiUrl(ad.videoUrl);
      v.autoplay = true;
      v.muted = this.isMuted?.() ?? false;
      v.playsInline = true;
      Object.assign(v.style, { width: "100%", height: "100%", objectFit: "cover" } satisfies Partial<CSSStyleDeclaration>);
      // Autoplay-with-sound is blocked without a user gesture on a fresh kiosk;
      // if it rejects, retry muted so the creative still plays (not a black box).
      v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
      this.el.appendChild(v);
    } else {
      // command: sandboxed HTML, same lockdown as HTML slides (§18). Wrap it so
      // an operator's fragment fills the viewport regardless of its own sizing.
      const frame = document.createElement("iframe");
      frame.setAttribute("sandbox", "allow-scripts");
      frame.srcdoc = `<!doctype html><html style="height:100%"><body style="height:100%;margin:0;overflow:hidden">${ad.html ?? ""}</body></html>`;
      Object.assign(frame.style, { width: "100%", height: "100%", border: "none" } satisfies Partial<CSSStyleDeclaration>);
      this.el.appendChild(frame);
    }
    this.el.appendChild(badge(ad.name ?? "Advertisement", true));
    document.body.appendChild(this.el);
  }

  /** Lift the interrupt if the id matches (or unconditionally). */
  clear(id?: string): void {
    if (id && id !== this.currentId) return;
    this.currentId = null;
    this.reset();
  }

  private reset(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
      this.onDuck?.(false); // lift the music duck when an audio ad ends
    }
    if (this.el) {
      this.el.remove();
      this.el = null;
    }
  }

  get active(): boolean {
    return this.currentId !== null;
  }
}

const fullscreen: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  inset: "0",
  zIndex: "90000", // above playout, below the emergency override (100000)
  background: "#000",
  overflow: "hidden",
};

/** A small corner "AD" chip so audio/video interrupts read as advertising. */
function badge(text: string, corner = false): HTMLElement {
  const el = document.createElement("div");
  Object.assign(el.style, {
    position: "fixed",
    bottom: corner ? "3vh" : "3vh",
    right: "3vw",
    zIndex: "95000",
    padding: "0.8vh 1.4vw",
    borderRadius: "999px",
    background: "rgba(0,0,0,0.55)",
    color: "#fff",
    font: "600 1.6vh 'Hanken Grotesk', system-ui, sans-serif",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    backdropFilter: "blur(6px)",
  } satisfies Partial<CSSStyleDeclaration>);
  el.textContent = `● ${text}`;
  return el;
}
