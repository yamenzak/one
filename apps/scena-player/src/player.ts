/**
 * The playout engine (BLUEPRINT §1, §17-runtime).
 *
 * Every animation frame it asks the synced clock for `t`, resolves the timeline
 * to (slide, seek offset), and reflects that into the DOM. Nothing is pushed
 * from the server — playout is a pure function of the clock, so two screens
 * running this loop against the same manifest + synced clock show the same
 * frame at the same moment.
 *
 * Authoring happens on the profile's base canvas (design space); the runtime
 * scales the whole scene by viewport/design, so one layout maps to any panel.
 */

import { resolveAt, mediaTargetSec, type Timeline } from "@scena/timeline";
import { slideTimeline, slideDocument, type Manifest, type Widget } from "@scena/manifest";
import { createWidgetEl, updateWidget, type WidgetHandle } from "./widgets.js";
import { contentH } from "@scena/widgets";
import { SyncedMedia } from "./media-sync.js";
import { BoardSubscription } from "./board-widget.js";
import type { Announcer } from "./announcer.js";
import { TickerFeed } from "./ticker.js";
import { WeatherWidget, type WeatherVariant } from "./weather-widget.js";
import { SourceBinder } from "./source-binder.js";
import { NowPlaying } from "./nowplaying.js";
import { diagClear } from "./diag.js";

/** A proof-of-play event (§22). `eventId` is stable per occurrence so replays
 *  of buffered offline events dedupe on the server (§29.5). */
export interface PlayoutEvent {
  eventId: string;
  contentId: string;
  kind: "slide" | "ad" | "widget" | "queue_call";
  ts: number;
  durationMs?: number;
}

export interface PlayoutHooks {
  /** Called when the active slide changes — used to report proof-of-play. */
  onSlideChange?: (slideId: string) => void;
  /** A proof-of-play event to buffer + flush to the edge (§22). */
  onPlayoutEvent?: (event: PlayoutEvent) => void;
  /** Per-frame debug snapshot for the HUD. */
  onFrame?: (info: FrameInfo) => void;
  /** Persistent board announcer (chime + ducked voice clip). Lives above the
   *  per-scene widgets so a slide advance can't cut a call mid-sentence. */
  announcer?: Announcer;
}

export interface FrameInfo {
  slideId: string;
  index: number;
  offsetMs: number;
  cycleIndex: number;
  syncedNow: number;
  /** Cycle length (ms) — the loop's period. */
  cycleMs: number;
  /** Rendered frames per second (smoothed) — a health signal. */
  fps: number;
  /** Which channel + manifest version this frame belongs to. */
  channelId: string;
  version: number;
}

/** Transition states — a slide's look before it enters (`enter`), on screen
 * (`shown`), and after it leaves (`exit`). Keyed by transition name; the swap
 * animates enter→shown for the incoming slide and shown→exit for the outgoing.
 * Everything is a compositor-friendly opacity + transform, so it stays smooth
 * on cheap player hardware. */
type Pose = { opacity: string; transform: string };
const TRANSITION_MS = 620;
const ENTER: Record<string, Pose> = {
  none: { opacity: "1", transform: "none" },
  fade: { opacity: "0", transform: "none" },
  slide: { opacity: "1", transform: "translateX(100%)" },
  zoom: { opacity: "0", transform: "scale(1.08)" },
  flip: { opacity: "0", transform: "perspective(1600px) rotateY(90deg)" },
};
const EXIT: Record<string, Pose> = {
  none: { opacity: "0", transform: "none" },
  fade: { opacity: "0", transform: "none" },
  slide: { opacity: "1", transform: "translateX(-100%)" },
  zoom: { opacity: "0", transform: "scale(0.94)" },
  flip: { opacity: "0", transform: "perspective(1600px) rotateY(-90deg)" },
};
const SHOWN: Pose = { opacity: "1", transform: "none" };

/**
 * Slide-clock smoothing (§7 playhead). The timeline is resolved against a
 * *playhead* that advances at real wall-clock rate and slews toward the synced
 * server clock, instead of stepping straight to it. A clock correction — the
 * offset EWMA converging over the first second, a bridge→live handoff on
 * reconnect, ordinary network jitter — therefore bleeds in over a fraction of a
 * second rather than jumping the resolved position across a slide boundary and
 * kicking a slide that only just entered (the "shows for ~1s then goes" glitch).
 * The playhead is monotonic (never runs backward) except on a genuine gap, where
 * it snaps. Media stays smooth independently via SyncedMedia's own ±2% slew.
 */
const SLIDE_DEADBAND_MS = 45; // drift under this = in sync, hold (matches sync jitter)
const SLIDE_SNAP_MS = 1500; // beyond this it's a real gap (reconnect/offline/manifest) → snap
const SLIDE_SLEW_FRAC = 0.5; // catch up at up to ±50% of real time (invisible on seconds-long slides)

export class Playout {
  private stage: HTMLElement;
  private scene: HTMLElement;
  private slideEls = new Map<string, HTMLElement>();
  /** Per-slide transition to run when it enters (slide.transition || playlist default). */
  private slideTrans = new Map<string, string>();
  /** HTML slides' iframe + document, so each replays its animation on re-entry. */
  private slideHtml = new Map<string, { frame: HTMLIFrameElement; doc: string }>();
  /** Clock-synced video slides, keyed by slide id (only the active one plays).
   *  `windowMs` is the authored slide duration — a clip-length fallback used
   *  until the real `video.duration` metadata loads, so sync never stalls. */
  private videos = new Map<string, { media: SyncedMedia; el: HTMLVideoElement; clipStartMs: number; loop: boolean; windowMs: number }>();
  private widgetHandles: WidgetHandle[] = [];
  /** Teardown fns for every live poller wired this scene (board/ticker/weather/
   *  nowplaying/source binder), incl. those a stack starts for its current child. */
  private runtimeCleanups: Array<() => void> = [];
  private manifest: Manifest | null = null;
  /** Content signature of the last manifest actually built, so a duplicate nudge
   *  (same version, or a re-publish with no real change) doesn't tear down and
   *  rebuild the whole scene — which would flash a transition and reconnect every
   *  poller for nothing. */
  private lastManifestSig = "";
  private timeline: Timeline | null = null;
  private raf = 0;
  private activeSlideId = "";
  /** Smoothed playout clock (see SLIDE_* constants): advances at wall-clock rate,
   *  slews toward the synced clock. `smoothInit` seeds it on the first frame. */
  private smoothT = 0;
  private smoothInit = false;
  private lastWallT = 0;
  private lastFrameAt = 0;
  private fps = 0;
  private lastHudAt = 0;
  /** Single-screen mode: seek video once per slide, then let it free-run (§7). */
  private solo = false;
  /** Adaptive quality (§perf): drop the most expensive GPU effects (backdrop
   *  blur) when a weak screen can't hold framerate, and restore them when it can.
   *  Hysteresis + timers avoid flapping. `perfLow` is the current state. */
  private perfLow = false;
  private perfSinceLow = 0;
  private perfSinceHigh = 0;

  constructor(
    stage: HTMLElement,
    private readonly clock: () => number,
    private readonly hooks: PlayoutHooks = {},
  ) {
    this.stage = stage;
    this.scene = document.createElement("div");
    Object.assign(this.scene.style, {
      position: "absolute",
      top: "50%",
      left: "50%",
      transformOrigin: "center center",
      background: "#000",
      overflow: "hidden",
    } satisfies Partial<CSSStyleDeclaration>);
    window.addEventListener("resize", () => this.fit());
    injectPerfStyle();
  }

  /**
   * Watch framerate and shed the heaviest GPU effect (backdrop blur) when a weak
   * screen sustains a low framerate — then restore it once it recovers, so
   * capable screens keep the full frosted-glass look. Hysteresis (2s to drop,
   * 8s of healthy fps to restore) prevents flapping around the threshold.
   */
  private adaptQuality(now: number): void {
    const dt = this.perfLastAt ? now - this.perfLastAt : 16;
    this.perfLastAt = now;
    if (this.fps < 22) { this.perfSinceLow += dt; this.perfSinceHigh = 0; }
    else if (this.fps > 45) { this.perfSinceHigh += dt; this.perfSinceLow = 0; }
    else { this.perfSinceLow = 0; this.perfSinceHigh = 0; }
    if (!this.perfLow && this.perfSinceLow > 2000) {
      this.perfLow = true;
      document.documentElement.dataset.perf = "low";
    } else if (this.perfLow && this.perfSinceHigh > 8000) {
      this.perfLow = false;
      delete document.documentElement.dataset.perf;
    }
  }
  private perfLastAt = 0;

  /** Swap in a new manifest and (re)build the scene. Playout continues. A nudge
   *  that carries identical content is a no-op (the loop keeps running), so
   *  repeated/duplicate publishes don't flash a rebuild. */
  setManifest(manifest: Manifest): void {
    const sig = JSON.stringify(manifest);
    if (this.timeline && sig === this.lastManifestSig) return; // nothing changed — keep playing
    this.lastManifestSig = sig;
    this.manifest = manifest;
    this.solo = manifest.soloScreen === true;
    this.timeline = slideTimeline(manifest);
    this.buildScene();
    this.fit();
    if (!this.raf) this.loop();
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private buildScene(): void {
    const m = this.manifest!;
    this.stage.innerHTML = "";
    this.scene.innerHTML = "";
    this.slideEls.clear();
    this.slideTrans.clear();
    this.slideHtml.clear();
    diagClear();
    for (const v of this.videos.values()) v.media.setActive(false);
    this.videos.clear();
    this.activeSlideId = "";
    const transitionDefault = m.slides.transitionDefault || "fade";
    this.widgetHandles = [];
    for (const c of this.runtimeCleanups) c(); // stop old pollers (board/ticker/weather/…)
    this.runtimeCleanups = [];

    this.scene.style.width = `${m.dimensions.w}px`;
    this.scene.style.height = `${m.dimensions.h}px`;

    const assetUrl = new Map(m.assets.map((a) => [a.hash, a.url]));

    for (const slide of m.slides.items) {
      const el = document.createElement("div");
      // fit → how the media fills the frame. contain (letterbox, whole image),
      // cover (crop to fill), fill (stretch). Default contain: never crop by surprise.
      const fit = slide.fit ?? "contain";
      Object.assign(el.style, {
        position: "absolute",
        inset: "0",
        opacity: "0",
        transformOrigin: "center center",
        backgroundSize: fit === "fill" ? "100% 100%" : fit,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
      } satisfies Partial<CSSStyleDeclaration>);
      this.slideTrans.set(slide.id, slide.transition || transitionDefault);
      if (slide.type === "html" && slide.htmlBody) {
        // HTML slide (§15): render in a locked-down iframe (§18). srcdoc +
        // sandbox is the baseline; the cross-origin isolation of §18 hardens it
        // further before AI-authored slides ship to production.
        const frame = document.createElement("iframe");
        frame.setAttribute("sandbox", "allow-scripts");
        // Wrap with bundled fonts + a full-viewport reset so slides get real
        // typography (incl. Arabic/CJK) and JS/animation run in isolation.
        const doc = slideDocument(slide.htmlBody);
        // Lazy: leave the iframe blank at build. showSlide materializes it on
        // entry and blanks it on exit, so an HTML-heavy channel keeps ~one live
        // document in RAM (not N documents each with fonts + JS) on a weak TV.
        Object.assign(frame.style, { width: "100%", height: "100%", border: "0" } satisfies Partial<CSSStyleDeclaration>);
        el.appendChild(frame);
        this.slideHtml.set(slide.id, { frame, doc });
      } else if (slide.type === "video") {
        // Video slide: a muted <video> driven by the synced clock. We *own* the
        // playhead (seek to the timeline offset, slew to hold phase, wrap the
        // loop deterministically) rather than leaning on native `loop`, so every
        // screen shows the same frame and a video replays on every cycle — not
        // just the first. Only the active slide's video plays (the rest are
        // paused), so N clips don't decode at once.
        const url = slide.hash ? assetUrl.get(slide.hash) : undefined;
        const v = document.createElement("video");
        // Solo mode free-runs → native loop; synced mode → we own the loop.
        // preload="none": only the *active* slide's video buffers/decodes (the
        // engine plays it on entry and pauses it on exit), so a channel with
        // several clips never has N videos decoding at once on a weak TV. Assets
        // are already warm in Cache Storage, so the on-entry load is fast.
        v.muted = true; v.loop = this.solo && slide.loop !== false; v.autoplay = false; v.playsInline = true; v.preload = "none";
        if (url) v.src = url;
        Object.assign(v.style, {
          width: "100%", height: "100%",
          objectFit: fit === "fill" ? "fill" : (fit as "contain" | "cover"),
          // Own compositor layer so a slide opacity/transform transition composites
          // the decoded video instead of repainting it into the parent each frame.
          transform: "translateZ(0)",
          backfaceVisibility: "hidden",
        } satisfies Partial<CSSStyleDeclaration>);
        el.appendChild(v);
        const windowMs = slide.durationMs ?? m.slides.durationDefaultMs;
        this.videos.set(slide.id, { media: new SyncedMedia(v), el: v, clipStartMs: slide.clipStartMs ?? 0, loop: slide.loop !== false, windowMs });
      } else {
        // image / gif — a background-image (gifs animate natively).
        const url = slide.hash ? assetUrl.get(slide.hash) : undefined;
        if (url) el.style.backgroundImage = `url("${url}")`;
      }
      this.scene.appendChild(el);
      this.slideEls.set(slide.id, el);
    }

    // Widget layer composites over the slides (§17): each node drawn by type.
    // Each widget is isolated — a single malformed node must never take down the
    // whole scene (this runs unattended for weeks; one bad config = one skipped
    // widget, not a black screen).
    for (const node of [...m.widgets].sort((a, b) => (a.z ?? 0) - (b.z ?? 0))) {
      let handle;
      try {
        handle = createWidgetEl(node, assetUrl);
      } catch (err) {
        console.warn("widget failed to mount, skipping", node.id, err);
        continue;
      }
      this.scene.appendChild(handle.el);
      this.widgetHandles.push(handle);
      this.runtimeCleanups.push(this.wireRuntime(handle, node));
    }

    this.stage.appendChild(this.scene);
  }

  /**
   * Start the live pollers a widget handle needs (board / ticker / weather /
   * now-playing / source bindings) and return a cleanup that stops them. Used for
   * top-level widgets and — via `stack.onMountItem` — for the child a stack has
   * currently mounted, so a weather/ticker/board *inside a stack* actually goes
   * live instead of rendering an empty frame. A stack child skips the source
   * binder (the parent stack hoists + forwards those datasets itself).
   */
  private wireRuntime(handle: WidgetHandle, node: Widget, stackChild = false): () => void {
    const teardown: Array<() => void> = [];
    const h = node.style as Record<string, unknown>;
    if (handle.boardId) {
      const sub = new BoardSubscription(handle.el, handle.boardId, handle.queueVariant, contentH(h, node.rect[3]), handle.boardRoomId, this.hooks.announcer ?? null);
      sub.connect();
      teardown.push(() => sub.close());
    }
    if (handle.feedId) {
      const ticker = new TickerFeed(handle.el, handle.feedId, node);
      ticker.start();
      teardown.push(() => ticker.close());
    }
    if (handle.weatherSourceId) {
      const w = new WeatherWidget(handle.el, handle.weatherSourceId, (handle.weatherVariant ?? "current") as WeatherVariant, contentH(h, node.rect[3]), String((node.config as { units?: unknown }).units ?? ""));
      w.start();
      teardown.push(() => w.close());
    }
    if (handle.nowplaying && this.manifest) {
      const np = new NowPlaying(handle.el, node, this.manifest, this.clock);
      np.start();
      teardown.push(() => np.close());
    }
    if (!stackChild && handle.boundSourceIds?.length && handle.rebind) {
      const binder = new SourceBinder(handle.boundSourceIds, handle.rebind);
      binder.start();
      teardown.push(() => binder.close());
    }
    // A stack drives its own children: wire whichever item it currently shows,
    // and re-wire on each swap (mountStackItem calls onMountItem + itemCleanup).
    if (handle.stack) {
      handle.stack.onMountItem = (childHandle, childNode) => this.wireRuntime(childHandle, childNode, true);
      teardown.push(() => handle.stack?.itemCleanup?.());
    }
    return () => { for (const t of teardown) t(); };
  }

  /** Animate the incoming slide in (and the outgoing slide out) using the
   * incoming slide's transition. Poses are set with the CSS transition disabled,
   * then a reflow + enable makes the browser animate to the on-screen pose. */
  private showSlide(id: string): void {
    const cur = this.slideEls.get(id);
    const prev = this.activeSlideId ? this.slideEls.get(this.activeSlideId) : undefined;
    const name = this.slideTrans.get(id) || "fade";
    const ms = name === "none" ? 0 : TRANSITION_MS;
    const ease = `opacity ${ms}ms ease, transform ${ms}ms ease`;

    const fallback: Pose = { opacity: "0", transform: "none" };
    // Promote both slides to their own compositor layers for the duration of the
    // transition (then release, so we don't hold a layer per slide forever). This
    // keeps the fade/slide/zoom fully on the GPU instead of repainting each frame.
    if (ms > 0) {
      for (const s of [prev, cur]) if (s) s.style.willChange = "opacity, transform";
      window.setTimeout(() => { for (const s of [prev, cur]) if (s) s.style.willChange = "auto"; }, ms + 60);
    }
    if (prev && prev !== cur) {
      const e = EXIT[name] ?? fallback;
      prev.style.transition = ease;
      prev.style.zIndex = "0";
      prev.style.opacity = e.opacity;
      prev.style.transform = e.transform;
    }
    if (cur) {
      const s = ENTER[name] ?? fallback;
      cur.style.transition = "none";
      cur.style.zIndex = "1";
      cur.style.opacity = s.opacity;
      cur.style.transform = s.transform;
      void cur.offsetWidth; // force reflow so the enter pose is the animation start
      cur.style.transition = ease;
      cur.style.opacity = SHOWN.opacity;
      cur.style.transform = SHOWN.transform;
      // Replay an HTML slide's animation on every entry: reloading the iframe
      // restarts its CSS/JS from the top, so it isn't frozen after the first cycle.
      const h = this.slideHtml.get(id);
      if (h) { h.frame.srcdoc = ""; requestAnimationFrame(() => { if (this.slideHtml.get(id) === h) h.frame.srcdoc = h.doc; }); }
    }

    // Lazy window: once the OUTGOING HTML slide has faded off screen, blank its
    // iframe to free that document — so at most the active slide (plus the one
    // mid-transition) holds a live document. `prevId` is still the active id here
    // (the caller advances activeSlideId only after showSlide returns).
    const prevId = this.activeSlideId;
    if (prevId && prevId !== id) {
      const ph = this.slideHtml.get(prevId);
      if (ph) {
        window.setTimeout(() => {
          if (this.activeSlideId !== prevId && this.slideHtml.get(prevId) === ph) ph.frame.srcdoc = "";
        }, ms + 150);
      }
    }
  }

  /** Scale the design-space scene to fit the viewport (contain). */
  private fit(): void {
    const m = this.manifest;
    if (!m) return;
    const k = Math.min(window.innerWidth / m.dimensions.w, window.innerHeight / m.dimensions.h);
    this.scene.style.transform = `translate(-50%, -50%) scale(${k})`;
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.timeline) return;
    const now = performance.now();
    const target = this.clock(); // raw synced server clock (the correction target)

    // Drive a smoothed playhead toward the synced clock: advance at real
    // wall-clock rate, then slew the drift in (bounded, never backward) so a
    // clock step can't jump the resolved position across a slide boundary. On a
    // genuine gap (reconnect/offline/manifest) snap — media hard-seeks anyway.
    if (!this.smoothInit) {
      this.smoothT = target;
      this.smoothInit = true;
    } else {
      const dWall = Math.max(0, now - this.lastWallT);
      let s = this.smoothT + dWall;
      const err = target - s;
      const abs = Math.abs(err);
      if (abs >= SLIDE_SNAP_MS) s = target;
      else if (abs > SLIDE_DEADBAND_MS) s += Math.sign(err) * Math.min(abs, dWall * SLIDE_SLEW_FRAC);
      this.smoothT = s;
    }
    this.lastWallT = now;
    const t = this.smoothT;
    const state = resolveAt(this.timeline, t);

    // Smoothed fps from wall-clock frame deltas (a health signal for the HUD).
    if (this.lastFrameAt) {
      const dt = now - this.lastFrameAt;
      if (dt > 0) this.fps += ((1000 / dt) - this.fps) * 0.1;
    }
    this.lastFrameAt = now;
    this.adaptQuality(now);

    if (state.item.id !== this.activeSlideId) {
      // Hand the playing role to the incoming slide's video; pause the outgoing.
      this.videos.get(this.activeSlideId)?.media.setActive(false);
      const incoming = this.videos.get(state.item.id);
      incoming?.media.setActive(true);
      // Solo mode: seek once to phase on entry, then free-run (native loop).
      if (this.solo && incoming) {
        const dur = incoming.el.duration;
        const clipLenMs = Number.isFinite(dur) && dur > 0 ? Math.max(0, dur * 1000 - incoming.clipStartMs) : incoming.windowMs;
        incoming.media.reseek(mediaTargetSec(state.offsetMs, incoming.clipStartMs, clipLenMs, incoming.loop));
      }
      this.showSlide(state.item.id);
      this.activeSlideId = state.item.id;
      this.hooks.onSlideChange?.(state.item.id);
      // Proof-of-play: one event per slide occurrence. The id folds in the
      // cycle + slot, so the same slide in a later cycle is a distinct play,
      // but a replayed buffered event is identical → deduped (§22, §29.5).
      this.hooks.onPlayoutEvent?.({
        eventId: `slide:${state.cycleIndex}:${state.index}`,
        contentId: state.item.id,
        kind: "slide",
        ts: Math.round(target),
        durationMs: state.item.durationMs,
      });
    }

    // Drive the active video toward the clock every frame (seek/slew/loop-wrap).
    // Skipped in solo mode — it free-runs after the one seek on entry.
    const vid = this.solo ? undefined : this.videos.get(state.item.id);
    if (vid) {
      const dur = vid.el.duration;
      // Real clip length once metadata loads; the authored window until then, so
      // sync never stalls waiting for the video element to report its duration.
      const clipLenMs = Number.isFinite(dur) && dur > 0 ? Math.max(0, dur * 1000 - vid.clipStartMs) : vid.windowMs;
      const target = mediaTargetSec(state.offsetMs, vid.clipStartMs, clipLenMs, vid.loop);
      // A play-once clip past its window holds its last frame (don't restart it).
      const spent = !vid.loop && clipLenMs > 0 && state.offsetMs >= clipLenMs;
      vid.media.sync(target, !spent);
    }

    for (const handle of this.widgetHandles) {
      try {
        updateWidget(handle, t);
      } catch (err) {
        // A bad per-frame update must not throw out of the RAF loop and freeze
        // every later widget — isolate it and keep the scene ticking.
        console.warn("widget update failed, skipping this frame", err);
      }
    }

    // The onFrame hook only feeds the (usually hidden) diagnostic HUD, so build
    // its info object + touch the overlay ~5×/sec instead of every frame — no
    // point allocating and rendering 60×/sec for a debug readout.
    if (this.hooks.onFrame && now - this.lastHudAt >= 200) {
      this.lastHudAt = now;
      this.hooks.onFrame({
        slideId: state.item.id,
        index: state.index,
        offsetMs: state.offsetMs,
        cycleIndex: state.cycleIndex,
        syncedNow: t,
        cycleMs: this.timeline.cycleMs,
        fps: this.fps,
        channelId: this.manifest?.channelId ?? "—",
        version: this.manifest?.version ?? 0,
      });
    }
  };
}

/** Inject the adaptive-quality stylesheet once. When the root carries
 *  `data-perf="low"`, the heaviest GPU effect — a widget's backdrop blur, which
 *  re-blurs every frame over a playing video — is dropped so a weak screen holds
 *  framerate. The look degrades to a plain translucent panel, not a broken one. */
let perfStyleInjected = false;
function injectPerfStyle(): void {
  if (perfStyleInjected || typeof document === "undefined") return;
  perfStyleInjected = true;
  const s = document.createElement("style");
  s.textContent = `:root[data-perf="low"] .wx{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}`;
  document.head.appendChild(s);
}
