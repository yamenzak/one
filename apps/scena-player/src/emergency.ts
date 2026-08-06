/**
 * Screen-takeover overlay (BLUEPRINT §12).
 *
 * A high-priority interrupt that trumps the normal timeline, dayparting, screen
 * saver, and ads. It renders a built-in full-screen template above everything
 * (including the diagnostics HUD) and holds until an all-clear lifts it, at
 * which point normal playout resumes from the clock. The `tone` chooses the
 * visual treatment — a takeover isn't always an emergency (it may be a "closed"
 * or "welcome" notice), so alarm-red is one option among several.
 */

export type OverrideTone = "alarm" | "warning" | "info" | "neutral" | "success";

interface ToneStyle {
  background: string;
  /** Inline SVG icon mark (stroke/fill use currentColor via #fff). */
  icon: string;
}

const ALERT_ICON = `<path d="M10 3 3 16h14L10 3z"/><line x1="10" y1="8" x2="10" y2="11.6"/><circle cx="10" cy="13.7" r="0.5" fill="#fff"/>`;
const INFO_ICON = `<circle cx="10" cy="10" r="7.5"/><line x1="10" y1="9" x2="10" y2="14"/><circle cx="10" cy="6.4" r="0.6" fill="#fff"/>`;
const CHECK_ICON = `<circle cx="10" cy="10" r="7.5"/><path d="M6.5 10.2 9 12.6l4.5-5"/>`;
const CLOCK_ICON = `<circle cx="10" cy="10" r="7.5"/><path d="M10 5.6V10l3 1.8"/>`;

const TONES: Record<OverrideTone, ToneStyle> = {
  alarm: { background: "radial-gradient(circle at 50% 40%, oklch(0.62 0.2 25), oklch(0.42 0.17 25))", icon: ALERT_ICON },
  warning: { background: "radial-gradient(circle at 50% 40%, oklch(0.72 0.16 70), oklch(0.5 0.14 62))", icon: ALERT_ICON },
  info: { background: "radial-gradient(circle at 50% 40%, oklch(0.6 0.13 250), oklch(0.4 0.12 255))", icon: INFO_ICON },
  neutral: { background: "radial-gradient(circle at 50% 40%, oklch(0.34 0.02 260), oklch(0.2 0.02 260))", icon: CLOCK_ICON },
  success: { background: "radial-gradient(circle at 50% 40%, oklch(0.62 0.15 150), oklch(0.42 0.13 152))", icon: CHECK_ICON },
};

export class EmergencyOverlay {
  private el: HTMLElement | null = null;
  private currentId: string | null = null;

  /** Show (or replace) the takeover. Highest z-index so nothing composites over it. */
  show(id: string, title: string, body: string, tone: OverrideTone = "alarm"): void {
    this.currentId = id;
    const style = TONES[tone] ?? TONES.alarm;
    if (!this.el) {
      this.el = document.createElement("div");
      Object.assign(this.el.style, {
        position: "fixed",
        inset: "0",
        zIndex: "100000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "6vw",
        color: "#fff",
        fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
      } satisfies Partial<CSSStyleDeclaration>);
      document.body.appendChild(this.el);
    }
    this.el.style.background = style.background;
    this.el.innerHTML = `
      <svg width="88" height="88" viewBox="0 0 20 20" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:3vh;opacity:0.95;">
        ${style.icon}
      </svg>
      <div style="font-size:6vw;font-weight:800;letter-spacing:-0.02em;line-height:1.05;max-width:80%;">${escapeHtml(title)}</div>
      ${body ? `<div style="font-size:2.6vw;font-weight:500;opacity:0.92;margin-top:2.5vh;max-width:70%;line-height:1.35;">${escapeHtml(body)}</div>` : ""}`;
    this.el.style.display = "flex";
  }

  /** Lift the override if the id matches (or unconditionally when no id given). */
  clear(id?: string): void {
    if (id && id !== this.currentId) return;
    this.currentId = null;
    if (this.el) this.el.style.display = "none";
  }

  get active(): boolean {
    return this.currentId !== null;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[<>&"]/g, (c) => (c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : "&quot;"));
}
