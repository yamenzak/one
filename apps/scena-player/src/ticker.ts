/**
 * Ticker widget runtime (BLUEPRINT §19). Binds to a feed by id, polls its items,
 * and presents them in one of four variants (§17 widget overhaul):
 *   scroll   — a continuous marquee crawl (Web Animations API)
 *   ribbon   — the same crawl, but each item is a rounded chip
 *   headline — one item at a time, cross-faded on a dwell timer
 *   list     — a vertical stack of the latest items
 * Container chrome, badge, separator (glyph / custom / image), spacing, direction,
 * and speed all come from the shared `@scena/widgets` core so the builder preview
 * matches. The crawl animates by measured pixels (not a percentage), so it loops
 * seamlessly and runs at a true px/s speed on any screen.
 */

import type { Widget } from "@scena/manifest";
import {
  type TickerVariant,
  type SourceDataset,
  tickerVariant,
  tickerTitles,
  tickerContainerCss,
  tickerBadge,
  tickerSeparator,
  tickerSeparatorImage,
  tickerDirection,
  tickerGapEm,
  tickerSpeed,
  tickerDwellMs,
} from "@scena/widgets";
import { API_BASE } from "./config.js";
import { diagReport } from "./diag.js";

const POLL_MS = 60_000;

export class TickerFeed {
  private readonly variant: TickerVariant;
  private readonly style: Record<string, unknown>;
  private readonly config: Record<string, unknown>;
  private track: HTMLElement; // the moving/fading content host (after the badge)
  private anim: Animation | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private rotate: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private titles: string[] = [];
  private headlineIdx = 0;
  private lastKey = "";

  constructor(
    private readonly el: HTMLElement,
    private readonly feedId: string,
    node: Widget,
  ) {
    this.style = node.style as Record<string, unknown>;
    this.config = node.config as Record<string, unknown>;
    this.variant = tickerVariant(this.config);

    // Container chrome from the shared core. The frame is already sized to the
    // rect, so drop the shared width/height:100% (they'd resolve against the stage).
    const { width: _w, height: _h, ...chrome } = tickerContainerCss(this.style, node.rect[3]);
    Object.assign(this.el.style, chrome as Partial<CSSStyleDeclaration>);
    this.el.style.display = "flex";
    this.el.style.alignItems = "center";
    this.el.innerHTML = "";

    // Optional leading badge (e.g. BREAKING).
    const badge = tickerBadge(this.config);
    if (badge) {
      const pill = document.createElement("div");
      pill.textContent = badge.text;
      pill.style.cssText = `flex:0 0 auto;align-self:stretch;display:flex;align-items:center;padding:0 1.1em;background:${badge.color};color:${badge.textColor};font-weight:800;letter-spacing:0.06em;text-transform:uppercase`;
      this.el.appendChild(pill);
    }

    const crawl = this.variant === "scroll" || this.variant === "ribbon";
    this.track = document.createElement("div");
    this.track.style.cssText =
      this.variant === "list"
        ? "flex:1 1 auto;height:100%;display:flex;flex-direction:column;justify-content:center;gap:0.35em;padding:0 1em;overflow:hidden"
        : this.variant === "headline"
          ? "flex:1 1 auto;display:flex;align-items:center;padding:0 1em;white-space:nowrap;overflow:hidden"
          // Crawl window: needs an explicit height — its only child is the
          // absolutely-positioned lane (out of flow), so without this it collapses
          // to 0px (the frame centers, not stretches) and nothing shows.
          : "flex:1 1 auto;height:100%;overflow:hidden;position:relative";
    // A crawl needs an overflow window (the track) with a nowrap moving lane inside.
    this.el.appendChild(this.track);
    if (crawl) {
      const lane = document.createElement("div");
      lane.style.cssText = "display:inline-flex;align-items:center;white-space:nowrap;will-change:transform;position:absolute;left:0;top:0;height:100%";
      this.track.appendChild(lane);
      this.track = lane;
    }
  }

  start(): void {
    void this.refresh();
    this.poll = setInterval(() => void this.refresh(), POLL_MS);
    if (this.variant === "headline") this.rotate = setInterval(() => this.tickHeadline(), tickerDwellMs(this.config));
  }

  close(): void {
    this.closed = true;
    if (this.poll) clearInterval(this.poll);
    if (this.rotate) clearInterval(this.rotate);
    this.anim?.cancel();
  }

  private async refresh(): Promise<void> {
    if (this.closed) return;
    try {
      // The unified dataset endpoint works for every source: RSS/manual expose a
      // `title` column; API/Sheet sources expose any column the operator picked.
      const res = await fetch(`${API_BASE}/api/feeds/${this.feedId}/data`);
      if (!res.ok) { diagReport(`ticker:${this.feedId}`, { kind: "ticker", label: `ticker · ${this.feedId}`, ok: false, detail: `http ${res.status}` }); return; }
      const { dataset } = (await res.json()) as { dataset: SourceDataset };
      this.titles = tickerTitles(dataset, this.config);
      diagReport(`ticker:${this.feedId}`, { kind: "ticker", label: `ticker · ${this.feedId}`, ok: this.titles.length > 0, detail: this.titles.length ? `${this.titles.length} items` : "empty" });
      this.render();
    } catch {
      diagReport(`ticker:${this.feedId}`, { kind: "ticker", label: `ticker · ${this.feedId}`, ok: false, detail: "offline" });
      /* keep last content on a transient failure */
    }
  }

  private render(): void {
    const key = this.variant + "|" + this.titles.join("|");
    if (key === this.lastKey && this.variant !== "headline") return;
    this.lastKey = key;
    const titles = this.titles.length ? this.titles : ["No feed items"];

    if (this.variant === "list") {
      this.track.innerHTML = "";
      for (const t of titles.slice(0, 5)) {
        const row = document.createElement("div");
        row.textContent = t;
        row.style.cssText = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2";
        this.track.appendChild(row);
      }
      return;
    }

    if (this.variant === "headline") {
      this.headlineIdx = this.headlineIdx % titles.length;
      this.track.innerHTML = "";
      const span = document.createElement("div");
      span.textContent = titles[this.headlineIdx] ?? "";
      span.style.cssText = "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;animation:wxtickfade 500ms ease";
      this.track.appendChild(span);
      this.ensureFade();
      return;
    }

    // scroll / ribbon: two identical copies of the item sequence so a translate by
    // exactly one copy's width loops seamlessly. We build item + separator elements
    // (rather than one text run) so image separators and ribbon chips work.
    this.track.innerHTML = "";
    const copyA = this.buildSequence(titles);
    const copyB = this.buildSequence(titles);
    this.track.appendChild(copyA);
    this.track.appendChild(copyB);
    this.startCrawl(copyA);
  }

  /** One run of the item sequence as an inline-flex group (items + separators). */
  private buildSequence(titles: string[]): HTMLElement {
    const ribbon = this.variant === "ribbon";
    const sepText = tickerSeparator(this.config);
    const sepImg = tickerSeparatorImage(this.config);
    const gap = tickerGapEm(this.style);
    const group = document.createElement("div");
    group.style.cssText = "display:inline-flex;align-items:center;flex:0 0 auto";
    titles.forEach((title, i) => {
      const item = document.createElement("span");
      item.textContent = title;
      item.style.cssText = ribbon
        ? `flex:0 0 auto;display:inline-flex;align-items:center;padding:0.28em 0.95em;margin:0 ${0.4 + gap / 2}em;border-radius:999px;background:oklch(1 0 0 / 0.1);white-space:nowrap`
        : `flex:0 0 auto;white-space:nowrap;padding:0 ${gap / 2}em`;
      group.appendChild(item);
      if (!ribbon) {
        const sep = document.createElement("span");
        sep.style.cssText = "flex:0 0 auto;display:inline-flex;align-items:center;opacity:0.7";
        if (sepImg) {
          const img = document.createElement("img");
          img.src = sepImg;
          img.style.cssText = "height:0.9em;width:auto;margin:0 0.5em;object-fit:contain";
          sep.appendChild(img);
        } else {
          sep.textContent = sepText;
        }
        group.appendChild(sep);
      } else if (i === titles.length - 1) {
        // ribbon: a trailing margin so the loop seam isn't flush.
        item.style.marginRight = `${0.4 + gap / 2}em`;
      }
    });
    return group;
  }

  /** Animate the lane by exactly one copy's width, in px/s, looping forever. Reads
   *  the measured width after layout so the speed is true and the loop is seamless. */
  private startCrawl(copyA: HTMLElement): void {
    this.anim?.cancel();
    const run = () => {
      if (this.closed) return;
      const width = copyA.getBoundingClientRect().width || copyA.scrollWidth || 1;
      const durationMs = Math.max(2000, (width / tickerSpeed(this.style)) * 1000);
      const from = `translateX(0)`;
      const to = `translateX(${-width}px)`;
      const frames = tickerDirection(this.style) === "right" ? [{ transform: to }, { transform: from }] : [{ transform: from }, { transform: to }];
      this.anim = this.track.animate(frames, { duration: durationMs, iterations: Infinity, easing: "linear" });
    };
    // Measure after the browser has laid out the freshly-inserted content.
    requestAnimationFrame(() => requestAnimationFrame(run));
  }

  private tickHeadline(): void {
    if (this.titles.length <= 1) return;
    this.headlineIdx = (this.headlineIdx + 1) % this.titles.length;
    this.render();
  }

  private ensureFade(): void {
    tickFadeInjected = injectKeyframesOnce(this.el.ownerDocument, "wxtickfade", tickFadeInjected,
      "@keyframes wxtickfade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}");
  }
}

// Module-level once-guard so the keyframe block isn't re-appended to <head> on
// every scene rebuild (a per-instance flag leaks a <style> per ticker).
let tickFadeInjected = false;
function injectKeyframesOnce(doc: Document, marker: string, already: boolean, css: string): boolean {
  if (already || doc.getElementById(`kf-${marker}`)) return true;
  const s = doc.createElement("style");
  s.id = `kf-${marker}`;
  s.textContent = css;
  doc.head.appendChild(s);
  return true;
}
