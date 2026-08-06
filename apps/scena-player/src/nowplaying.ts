/**
 * Now Playing widget runtime (§16). Resolves the current track from the same
 * clock-synced music timeline the MusicPlayer uses, so the card always matches
 * what's actually playing, in phase across every screen. Renders one of four
 * variants (bar / card / full / minimal) with cover art (if present), a live
 * progress bar, and — in the full variant — an animated equalizer.
 */

import type { Manifest } from "@scena/manifest";
import { musicTimeline, type Manifest as M } from "@scena/manifest";
import { resolveAt, type Timeline } from "@scena/timeline";
import {
  type NowPlayingVariant,
  type NowPlayingMeta,
  nowPlayingVariant,
  nowPlayingContainerCss,
  nowPlayingAccent,
  nowPlayingBodyHtml,
  progressFraction,
  contentH,
} from "@scena/widgets";

const TICK_MS = 500;

export class NowPlaying {
  private timeline: Timeline | null;
  private byId = new Map<string, NowPlayingMeta>();
  private variant: NowPlayingVariant;
  private accent: string;
  private readonly h: number;
  private timer: ReturnType<typeof setInterval> | 0 = 0;
  private lastKey = "";

  constructor(
    private readonly el: HTMLElement,
    node: { style: Record<string, unknown>; config: Record<string, unknown>; rect?: number[] },
    manifest: Manifest,
    private readonly clock: () => number,
  ) {
    this.timeline = musicTimeline(manifest as M);
    const assetUrl = new Map(manifest.assets.map((a) => [a.hash, a.url]));
    for (const t of manifest.music.items) {
      this.byId.set(t.id, {
        title: t.title ?? "Untitled",
        artist: t.artist ?? "",
        artUrl: t.art ? assetUrl.get(t.art) ?? null : null,
        durationMs: t.durationMs,
      });
    }
    this.variant = nowPlayingVariant(node.config);
    this.accent = nowPlayingAccent(node.style);
    this.h = contentH(node.style as Record<string, unknown>, node.rect?.[3] ?? 200);
    Object.assign(this.el.style, nowPlayingContainerCss(node.style) as Partial<CSSStyleDeclaration>);
    this.el.style.display = "block";
    this.ensureEq();
  }

  start(): void {
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = 0;
  }

  private tick(): void {
    if (!this.timeline) {
      if (this.lastKey !== "idle") { this.lastKey = "idle"; this.el.innerHTML = this.idle(); }
      return;
    }
    const state = resolveAt(this.timeline, this.clock());
    const meta = this.byId.get(state.item.id);
    if (!meta) return;
    const frac = progressFraction(state.offsetMs, meta.durationMs);
    // Re-render only when the track or ~1% progress changes (keeps it cheap).
    const key = `${state.item.id}:${Math.round(frac * 100)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    // Shared, design-px body → byte-identical to the builder preview (§16).
    this.el.innerHTML = nowPlayingBodyHtml(meta, this.variant, this.accent, state.offsetMs, meta.durationMs, this.h);
  }

  private idle(): string {
    return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;opacity:0.55;font-size:${Math.round(this.h * 0.09)}px">No music playing</div>`;
  }

  private ensureEq(): void {
    // Module-level guard (keyed by id) so the keyframes aren't re-appended to
    // <head> on every scene rebuild — a per-instance flag leaks a <style> each.
    const doc = this.el.ownerDocument;
    if (eqInjected || doc.getElementById("kf-wxeq")) { eqInjected = true; return; }
    eqInjected = true;
    const s = doc.createElement("style");
    s.id = "kf-wxeq";
    s.textContent = "@keyframes wxeq{0%,100%{transform:scaleY(0.35)}50%{transform:scaleY(1)}}";
    doc.head.appendChild(s);
  }
}

let eqInjected = false;
