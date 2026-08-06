/**
 * On-screen diagnostics overlay. It makes the invariant that matters — "same
 * clock ⇒ same slide + offset on every screen" — directly observable: put two
 * players side by side and the slide id, seek offset, and cycle index track
 * together. It also surfaces the offline state (§8): whether the screen is
 * connected and whether its clock is a live sync or the cached bridge.
 *
 * Off by default. Toggle locally with the `d` key, or remotely from the
 * dashboard via the debug.on/debug.off command (§11).
 */

import type { FrameInfo } from "./player.js";
import { diagEntries } from "./diag.js";

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;
}

export class Hud {
  private el: HTMLElement;
  private visible = false;
  private offset = 0;
  private rtt = 0;
  private samples = 0;
  private online = false;
  private clockSource = "none";
  private last: FrameInfo | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    Object.assign(this.el.style, {
      position: "fixed",
      left: "16px",
      bottom: "16px",
      minWidth: "260px",
      padding: "12px 14px",
      borderRadius: "12px",
      background: "rgba(11,7,16,0.82)",
      border: "1px solid rgba(180,150,235,0.22)",
      color: "#e6dbff",
      font: "12px/1.55 'JetBrains Mono', ui-monospace, monospace",
      whiteSpace: "pre",
      pointerEvents: "none",
      zIndex: "9999",
      boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
      backdropFilter: "blur(8px)",
      display: "none",
    } satisfies Partial<CSSStyleDeclaration>);
    parent.appendChild(this.el);
    window.addEventListener("keydown", (e) => {
      if (e.key === "d") this.setVisible(!this.visible);
    });
  }

  setSync(offset: number, rtt: number, samples: number, source: string): void {
    this.offset = offset;
    this.rtt = rtt;
    this.samples = samples;
    this.clockSource = source;
    this.render();
  }

  setOnline(online: boolean): void {
    this.online = online;
    this.render();
  }

  /** The live clock source ("live" | "bridge" | "none"), refreshed per frame. */
  setClockSource(source: string): void {
    this.clockSource = source;
  }

  update(info: FrameInfo): void {
    this.last = info;
    this.render();
  }

  /** Show/hide — driven by the `d` key and the debug.on/off remote command. */
  setVisible(v: boolean): void {
    this.visible = v;
    this.el.style.display = v ? "block" : "none";
    if (v) this.render();
  }

  private render(): void {
    if (!this.visible) return;
    const i = this.last;
    const dot = this.online ? "● online" : "○ offline";
    const syncBadge = Math.abs(this.offset) < 100 ? "◎" : "△";
    const rows: string[] = [];
    rows.push(`▍SCENA · debug          ${dot}`);
    if (i) {
      const pct = i.cycleMs > 0 ? Math.min(100, Math.round((i.offsetMs / (i.cycleMs || 1)) * 100)) : 0; // in-slide, not cycle
      const ft = i.fps > 0 ? (1000 / i.fps).toFixed(1) : "—";
      const perf = document.documentElement.dataset.perf === "low" ? "  ⚠ reduced" : "";
      rows.push(`slide   ${i.slideId}  #${i.index}`);
      rows.push(`offset  ${fmtMs(i.offsetMs)}   cycle ${fmtMs(i.cycleMs)} ·${i.cycleIndex}`);
      rows.push(`perf    ${i.fps.toFixed(0)}fps · ${ft}ms/frame${perf}`);
      rows.push(`channel ${i.channelId}  v${i.version}`);
      rows.push(`time    ${new Date(i.syncedNow).toISOString().slice(11, 23)}  ${"▮".repeat(Math.round(pct / 12)).padEnd(8, "▯")}`);
    } else {
      rows.push("slide   —  (no manifest)");
    }
    rows.push(`clock   ${this.clockSource}  ${syncBadge} off ${this.offset.toFixed(1)}ms · rtt ${this.rtt.toFixed(0)}ms · n=${this.samples}`);

    // Source health (§sources): every bound widget's last fetch — the fastest way
    // to tell "the screen is broken" from "the feed is empty / unreachable".
    const sources = diagEntries();
    if (sources.length) {
      rows.push("── sources ──────────────");
      for (const s of sources) rows.push(`${s.ok ? "●" : "○"} ${s.label}  ${s.detail} · ${ago(s.at)}`);
    }
    this.el.textContent = rows.join("\n");
  }
}
