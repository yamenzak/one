/**
 * Runtime controls applied by remote commands (BLUEPRINT §11, §14).
 *
 * - Screen saver: a dark, dimmed overlay with a subtle clock. In the full model
 *   this is "render the screen-saver channel" (§14); the built-in dimmed overlay
 *   is the stand-in until per-profile saver channels exist.
 * - Mute: mutes any media in the scene and shows a small badge (no audio ships
 *   in the demo channel yet, but the toggle + indicator are real).
 */

export class ScreenSaver {
  private el: HTMLElement | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  show(clock: () => number): void {
    if (!this.el) {
      this.el = document.createElement("div");
      Object.assign(this.el.style, {
        position: "fixed",
        inset: "0",
        zIndex: "90000",
        background: "oklch(0.08 0.01 300)",
        color: "oklch(0.7 0.02 300)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "8vw",
        fontWeight: "600",
        letterSpacing: "0.02em",
      } satisfies Partial<CSSStyleDeclaration>);
      document.body.appendChild(this.el);
    }
    this.el.style.display = "flex";
    const tick = () => {
      if (this.el) {
        const d = new Date(clock());
        const p = (n: number) => String(n).padStart(2, "0");
        this.el.textContent = `${p(d.getHours())}:${p(d.getMinutes())}`;
      }
    };
    tick();
    if (!this.timer) this.timer = setInterval(tick, 1000);
  }

  hide(): void {
    if (this.el) this.el.style.display = "none";
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export class MuteBadge {
  private el: HTMLElement;
  /** The screen's current mute state, so media created *after* a mute command
   *  (e.g. an ad's audio/video) can start muted too. */
  muted = false;
  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    Object.assign(this.el.style, {
      position: "fixed",
      top: "14px",
      left: "14px",
      zIndex: "9998",
      display: "none",
      alignItems: "center",
      gap: "7px",
      padding: "6px 12px",
      borderRadius: "20px",
      background: "oklch(0.15 0.01 300 / 0.7)",
      color: "#fff",
      font: "600 13px 'Hanken Grotesk', sans-serif",
    } satisfies Partial<CSSStyleDeclaration>);
    this.el.textContent = "🔇 Muted";
    parent.appendChild(this.el);
  }

  set(muted: boolean): void {
    this.muted = muted;
    this.el.style.display = muted ? "flex" : "none";
    for (const m of document.querySelectorAll<HTMLMediaElement>("video,audio")) m.muted = muted;
  }
}
