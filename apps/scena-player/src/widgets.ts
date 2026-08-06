/**
 * Scene-graph widget runtime (BLUEPRINT §17 "Runtime").
 *
 * The screen renderer only *draws* the declarative scene graph — no drag logic
 * ships here. Each node has a rect (in the profile's base-canvas coordinates),
 * rotation, z, style, and per-type config; the builder authors these, the
 * compiler puts them in the manifest, and this module paints them. All the
 * *look* (shapes, text, ticker chrome, stack layout) comes from the shared,
 * unit-tested `@scena/widgets` core, so a widget is byte-identical here and in
 * the builder preview.
 */

import type { Widget } from "@scena/manifest";
import { slideDocument } from "@scena/manifest";
import {
  type Css,
  type WidgetType,
  type StackItem,
  type TickerVariant,
  shapeCss,
  lineCss,
  textCss,
  imageCss,
  textDisplay,
  stackItems,
  stackDwellMs,
  stackResolve,
  stackTransition,
  stackShuffle,
  tickerVariant,
  scalerFit,
  contentH,
  resolveScaleMode,
  intrinsicSize,
  blurValue,
  clockIsAnalog,
  clockBodyHtml,
  boardContainerCss,
  weatherContainerCss,
  countdownBodyHtml,
  countdownContainerCss,
  metricBodyHtml,
  metricContainerCss,
  menuBodyHtml,
  menuContainerCss,
  qrBodyHtml,
  qrContainerCss,
  ctaBodyHtml,
  ctaContainerCss,
  displayVisible,
  displayPose,
  displayEase,
  radiusValue,
  hasRadius,
  type DisplaySchedule,
  type SourceDataset,
  applyBindings,
  boundSourceIds,
  hasBindings,
  bool,
  str,
  num,
} from "@scena/widgets";

export interface WidgetHandle {
  el: HTMLElement;
  node: Widget;
  /** True for widgets that need a per-frame update against the synced clock. */
  dynamic: boolean;
  /** Set for board-bound widgets that need a live subscription (§20). */
  boardId?: string;
  /** Display variant for a queue caller (solo / recent / grid / strip) or a
   *  scoreboard (classic / stacked). */
  queueVariant?: string;
  /** For a room-status door widget: which room of the bound board it shows. */
  boardRoomId?: string;
  /** Set for feed-bound ticker widgets that poll a feed (§19). */
  feedId?: string;
  tickerVariant?: TickerVariant;
  /** Set for a weather widget: the location source + its variant (§17). */
  weatherSourceId?: string;
  weatherVariant?: string;
  /** True for a Now Playing widget, driven by the music timeline (§16). */
  nowplaying?: boolean;
  /** The element that carries live text (clock/date) — the frame in reflow mode,
   *  or the scaled inner content element in uniform mode. */
  textEl?: HTMLElement;
  /** Set for a stack-loop widget: its cycling state. Items are real widgets
   *  mounted via `createWidgetEl` (recursion); `itemHandle` ticks the live one. */
  stack?: {
    items: StackItem[]; dwellMs: number; transition: string; shuffle: boolean;
    inner: HTMLElement; lastIndex: number; w: number; h: number;
    assetUrl: Map<string, string>; itemHandle?: WidgetHandle;
    /** Latest fetched datasets, re-applied to a freshly-mounted bound child. */
    lastDatasets?: Record<string, SourceDataset | undefined>;
    /** Player-injected: start the live pollers for a freshly-mounted child
     *  (weather/ticker/board/nowplaying) and return their teardown. Lets a bound
     *  widget inside the loop actually go live, not just render an empty frame. */
    onMountItem?: (handle: WidgetHandle, node: Widget) => () => void;
    /** Teardown for the *current* child's pollers, called before the next swap. */
    itemCleanup?: () => void;
  };
  /** Set for a widget with dynamic source bindings (§sources): the source ids it
   *  needs, and a closure that redraws it from freshly-fetched datasets. */
  boundSourceIds?: string[];
  rebind?: (datasets: Record<string, SourceDataset | undefined>) => void;
  /** Visibility cycle (§17): when set, the frame animates on/off against the
   *  synced clock. `baseOpacity`/`baseTransform` are the widget's own values,
   *  composed with the entry/exit pose; `displayShown` tracks the last state so
   *  the transition only fires on an edge. */
  display?: DisplaySchedule;
  baseOpacity?: string;
  baseTransform?: string;
  baseFilter?: string;
  displayShown?: boolean;
  /** Perf: wall-clock of the last dynamic re-render, so clock/date/countdown
   *  rebuild a few times a second instead of every animation frame. */
  lastDynAt?: number;
  /** Perf: last rendered body string, so an unchanged value skips the DOM write
   *  (and the HTML/SVG reparse + layout + paint it would trigger). */
  lastRender?: string;
  /** HTML widget: the sandboxed iframe + its document, so it can be reloaded to
   *  replay CSS/JS animations each time the widget re-enters view (§18). */
  htmlFrame?: HTMLIFrameElement;
  htmlDoc?: string;
}

/** Assign a shared Css dict onto an element (camelCase keys, unit-ready values). */
function applyCss(el: HTMLElement, css: Css): void {
  Object.assign(el.style, css as Partial<CSSStyleDeclaration>);
}

/** Wire a source-bound body-HTML widget (§sources): record the sources it needs
 *  and a closure that re-renders its body from config with resolved bindings. */
function bindBody(handle: WidgetHandle, config: Record<string, unknown>, draw: (cfg: Record<string, unknown>) => void): void {
  if (!hasBindings(config)) return;
  handle.boundSourceIds = boundSourceIds(config);
  handle.rebind = (ds) => draw(applyBindings(config, ds));
}

/**
 * Apply a shared Css dict to the *outer* widget frame, which is already sized to
 * the node's rect. The shared styles carry `width/height: 100%` (they assume an
 * inner fill element, as in the builder preview), so we drop those here or they
 * would resolve against the stage, not the frame.
 */
function applyToFrame(el: HTMLElement, css: Css): void {
  const { width: _w, height: _h, ...rest } = css;
  Object.assign(el.style, rest as Partial<CSSStyleDeclaration>);
}

/**
 * "uniform" scaling (§17): render content at its intrinsic `iw × ih` box and
 * scale it to fit the frame's `w × h`, centred — so the whole composition
 * scales together and never crops. Returns the content element (fills iw×ih) to
 * which the widget's look is applied. Byte-identical to the builder preview.
 */
function uniformHost(frame: HTMLElement, iw: number, ih: number, w: number, h: number): HTMLElement {
  frame.style.overflow = "hidden";
  const fit = scalerFit(iw, ih, w, h);
  const holder = document.createElement("div");
  Object.assign(holder.style, {
    position: "absolute", left: "50%", top: "50%", width: `${iw}px`, height: `${ih}px`,
    transform: `translate(-50%, -50%) scale(${fit})`, transformOrigin: "center center",
  } satisfies Partial<CSSStyleDeclaration>);
  const content = document.createElement("div");
  content.style.width = "100%";
  content.style.height = "100%";
  holder.appendChild(content);
  frame.appendChild(holder);
  return content;
}

/** Create the DOM element for a widget node, positioned in design space. */
export function createWidgetEl(node: Widget, assetUrl: Map<string, string>): WidgetHandle {
  const el = document.createElement("div");
  el.className = "wx"; // marker for adaptive-quality overrides (see player perf CSS)
  const [x, y, w, h] = node.rect;
  const type = node.type as WidgetType;
  const style = node.style as Record<string, unknown>;
  const config = node.config as Record<string, unknown>;

  Object.assign(el.style, {
    position: "absolute",
    left: `${x}px`,
    top: `${y}px`,
    width: `${w}px`,
    height: `${h}px`,
    transform: node.rot ? `rotate(${node.rot}deg)` : "",
    transformOrigin: "center center",
    zIndex: String(node.z ?? 0),
    overflow: "hidden",
    display: "flex",
    boxSizing: "border-box",
  } satisfies Partial<CSSStyleDeclaration>);

  const handle: WidgetHandle = { el, node, dynamic: false, textEl: el };
  const mode = resolveScaleMode(type, (node as { scaleMode?: string }).scaleMode);

  switch (type) {
    case "text":
    case "date": {
      if (mode === "uniform") {
        const [iw, ih] = intrinsicSize(type);
        const host = uniformHost(el, iw, ih, w, h);
        applyCss(host, textCss(type, style, config, ih));
        handle.textEl = host;
      } else {
        applyToFrame(el, textCss(type, style, config, h));
      }
      if (type === "text") {
        (handle.textEl ?? el).textContent = textDisplay("text", config, Date.now());
        // A source-bound text field re-reads its content when the dataset lands.
        if (hasBindings(config)) {
          handle.boundSourceIds = boundSourceIds(config);
          handle.rebind = (ds) => { (handle.textEl ?? el).textContent = textDisplay("text", applyBindings(config, ds), Date.now()); };
        }
      } else handle.dynamic = true;
      break;
    }
    case "clock": {
      // Digital numerals scale (uniform); analog faces / a date line lay out and
      // fill the box (reflow). Either way one shared `clockBodyHtml` draws it.
      const reflow = clockIsAnalog(config) || bool(config.showDate) || mode !== "uniform";
      if (reflow) {
        el.style.display = "block";
        el.innerHTML = clockBodyHtml(new Date(), style, config, h);
      } else {
        const [iw, ih] = intrinsicSize("clock");
        const host = uniformHost(el, iw, ih, w, h);
        host.innerHTML = clockBodyHtml(new Date(), style, config, ih);
        handle.textEl = host;
      }
      handle.dynamic = true;
      break;
    }
    case "box":
    case "circle":
    case "triangle": {
      if (mode === "uniform") {
        const [iw, ih] = intrinsicSize(type);
        applyCss(uniformHost(el, iw, ih, w, h), shapeCss(type, style));
      } else {
        applyToFrame(el, shapeCss(type, style));
      }
      break;
    }
    case "line": {
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      const bar = document.createElement("div");
      applyCss(bar, lineCss(style));
      el.appendChild(bar);
      break;
    }
    case "image": {
      const url = config.url ? str(config.url) : assetUrl.get(str(config.hash));
      applyToFrame(el, imageCss(style, config, url || undefined));
      break;
    }
    case "logo": {
      // A brand logo — an image bound to a brand-logo variant (config.url). An
      // unbound logo renders nothing (transparent), never a placeholder box.
      const url = config.url ? str(config.url) : "";
      if (url) applyToFrame(el, imageCss(style, config, url));
      break;
    }
    case "stack": {
      // A widget that loops child *widgets*; the current item is swapped by the
      // clock-driven updateWidget, so every screen lands on the same one (§17).
      if (style.bg) el.style.background = str(style.bg);
      const inner = document.createElement("div");
      inner.style.cssText = "width:100%;height:100%;position:relative;overflow:hidden";
      // Per-corner radius (radius + radiusTL/TR/BR/BL), not just the uniform value.
      // Apply to the clipping inner too so children round with the frame.
      if (hasRadius(style)) {
        const r = radiusValue(style, 0);
        el.style.borderRadius = r;
        inner.style.borderRadius = r;
      }
      el.appendChild(inner);
      const stackItemList = stackItems(config);
      handle.stack = { items: stackItemList, dwellMs: stackDwellMs(config), transition: stackTransition(config), shuffle: stackShuffle(config), inner, lastIndex: -1, w, h, assetUrl };
      handle.dynamic = true;
      // A bound child (metric/menu with source bindings) inside the loop is dead
      // otherwise: the scene binder only wires top-level handles. Hoist the union
      // of child source ids to the stack and forward fetched datasets to whichever
      // item is currently mounted (and to the next one when it mounts).
      const childSources = [...new Set(stackItemList.flatMap((it) => (hasBindings(it.widget.config) ? boundSourceIds(it.widget.config) : [])))];
      if (childSources.length) {
        handle.boundSourceIds = childSources;
        handle.rebind = (ds) => { if (handle.stack) { handle.stack.lastDatasets = ds; handle.stack.itemHandle?.rebind?.(ds); } };
      }
      break;
    }
    case "ticker": {
      // The scrolling/fading content is driven by a TickerFeed; here we just
      // record the bound feed + variant (§19). Container chrome is set there.
      el.style.display = "block";
      handle.feedId = str(config.feedId) || undefined;
      handle.tickerVariant = tickerVariant(config);
      break;
    }
    case "weather": {
      // Rendered live by a WeatherWidget poller (§17). Frame chrome is shared;
      // the body HTML carries design-px sizes, so it matches the builder preview.
      el.style.display = "block";
      applyToFrame(el, weatherContainerCss(style));
      handle.weatherSourceId = str(config.sourceId) || undefined;
      handle.weatherVariant = str(config.variant, "current");
      break;
    }
    case "nowplaying": {
      // Rendered live by a NowPlaying runtime off the music timeline (§16).
      el.style.display = "block";
      handle.nowplaying = true;
      break;
    }
    case "queue_caller":
    case "room_board":
    case "room_status":
    case "scoreboard": {
      // Rendered live by a BoardSubscription (§20). Frame chrome is shared; the
      // body HTML carries design-px sizes, so it matches the builder preview.
      el.style.display = "block";
      applyToFrame(el, boardContainerCss(style));
      handle.boardId = str(config.boardId) || undefined;
      if (type === "queue_caller") handle.queueVariant = str(config.variant, "solo");
      if (type === "scoreboard") handle.queueVariant = str(config.variant, "classic");
      if (type === "room_status") handle.boardRoomId = str(config.roomId) || undefined;
      break;
    }
    case "countdown": {
      // Clock-synced timer; ticks every frame against the synced clock so every
      // screen agrees. Digital numerals scale (uniform); reflow fills the box.
      if (mode === "uniform") {
        const [iw, ih] = intrinsicSize("countdown");
        const host = uniformHost(el, iw, ih, w, h);
        applyCss(host, countdownContainerCss(style));
        host.innerHTML = countdownBodyHtml(style, config, Date.now(), contentH(style, ih));
        handle.textEl = host;
      } else {
        el.style.display = "block";
        applyToFrame(el, countdownContainerCss(style));
        el.innerHTML = countdownBodyHtml(style, config, Date.now(), contentH(style, h));
      }
      handle.dynamic = true;
      break;
    }
    case "metric": {
      let target: HTMLElement = el, useH = contentH(style, h);
      if (mode === "uniform") {
        const [iw, ih] = intrinsicSize("metric");
        const host = uniformHost(el, iw, ih, w, h);
        applyCss(host, metricContainerCss(style));
        target = host; useH = contentH(style, ih);
      } else {
        el.style.display = "block";
        applyToFrame(el, metricContainerCss(style));
      }
      target.innerHTML = metricBodyHtml(style, config, useH);
      bindBody(handle, config, (cfg) => { target.innerHTML = metricBodyHtml(style, cfg, useH); });
      break;
    }
    case "menu": {
      let target: HTMLElement = el, useH = contentH(style, h);
      if (mode === "uniform") {
        const [iw, ih] = intrinsicSize("menu");
        const host = uniformHost(el, iw, ih, w, h);
        applyCss(host, menuContainerCss(style));
        target = host; useH = contentH(style, ih);
      } else {
        el.style.display = "block";
        applyToFrame(el, menuContainerCss(style));
      }
      target.innerHTML = menuBodyHtml(style, config, useH);
      bindBody(handle, config, (cfg) => { target.innerHTML = menuBodyHtml(style, cfg, useH); });
      break;
    }
    case "qr": {
      if (mode === "uniform") {
        const [iw, ih] = intrinsicSize("qr");
        const host = uniformHost(el, iw, ih, w, h);
        applyCss(host, qrContainerCss(style));
        host.innerHTML = qrBodyHtml(style, config, ih);
      } else {
        el.style.display = "block";
        applyToFrame(el, qrContainerCss(style));
        el.innerHTML = qrBodyHtml(style, config, h);
      }
      break;
    }
    case "cta": {
      // Scan-to-act card (§17) — an animated QR call-to-action. Uniform-scaled
      // like the QR/metric cards; its CSS keyframes run in the page DOM.
      if (mode === "uniform") {
        const [iw, ih] = intrinsicSize("cta");
        const host = uniformHost(el, iw, ih, w, h);
        applyCss(host, ctaContainerCss(style));
        host.innerHTML = ctaBodyHtml(style, config, ih);
      } else {
        el.style.display = "block";
        applyToFrame(el, ctaContainerCss(style));
        el.innerHTML = ctaBodyHtml(style, config, h);
      }
      break;
    }
    case "html": {
      // Sandboxed HTML embed (§18) — hand-written or AI-generated markup in an
      // isolated `allow-scripts`-only iframe (opaque origin), scoped to the box.
      // Same isolation as an HTML slide; slideDocument injects the bundled fonts.
      const html = str(config.html);
      const frame = document.createElement("iframe");
      frame.setAttribute("sandbox", "allow-scripts");
      Object.assign(frame.style, {
        width: "100%", height: "100%", border: "0", display: "block", background: "transparent",
        borderRadius: hasRadius(style) ? radiusValue(style, 0) : "0px",
      } satisfies Partial<CSSStyleDeclaration>);
      const doc = html ? slideDocument(html) : "";
      frame.srcdoc = doc;
      el.appendChild(frame);
      // Keep the frame + doc so a display cycle can reload it (replay animation).
      handle.htmlFrame = frame;
      handle.htmlDoc = doc;
      break;
    }
    default:
      break; // unknown types render as an empty positioned box (forward-compatible)
  }

  // Frame-level backdrop blur (frosted glass) — universal across widget types.
  const blur = blurValue(style);
  if (blur) {
    el.style.backdropFilter = blur;
    (el.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = blur;
  }

  // Timed display (§17): a widget on an on/off cycle animates on/off against the
  // synced clock with an entry/exit pose. Remember its own opacity + transform
  // (composed with the pose) and start from the hidden pose so it animates *in*
  // when its window opens rather than popping on at mount.
  const display = (node as { display?: DisplaySchedule }).display;
  if (display?.mode === "interval") {
    handle.display = display;
    handle.baseOpacity = el.style.opacity || "1";
    handle.baseTransform = el.style.transform || "";
    // Preserve the widget's own filter (e.g. an image's grayscale/brightness) so
    // the pose's blur composes with it instead of wiping it.
    handle.baseFilter = el.style.filter || "";
    handle.displayShown = false;
    applyDisplayPose(handle, false, true);
  }

  return handle;
}

/** Place a timed widget's frame at its shown/hidden pose, easing there unless
 *  `instant` (the mount seed). Opacity toggles between the widget's own value
 *  and 0; the pose's transform/filter compose with any base rotation. */
function applyDisplayPose(handle: WidgetHandle, visible: boolean, instant = false): void {
  const el = handle.el;
  const pose = displayPose(handle.display?.anim, visible);
  const { ms, ease } = displayEase(visible);
  el.style.transition = instant ? "none" : `opacity ${ms}ms ${ease}, transform ${ms}ms ${ease}, filter ${ms}ms ${ease}`;
  el.style.opacity = visible ? (handle.baseOpacity ?? "1") : "0";
  el.style.transform = handle.baseTransform ? `${handle.baseTransform} ${pose.transform}`.trim() : pose.transform;
  el.style.filter = handle.baseFilter ? `${handle.baseFilter} ${pose.filter}`.trim() : pose.filter;
}

/** Reload an HTML widget's iframe so its CSS/JS animation replays from the top.
 *  Blank first, then re-set on the next frame, so an identical document still
 *  triggers a fresh navigation (and the blank frame is hidden by the entry fade). */
function replayHtml(handle: WidgetHandle): void {
  const f = handle.htmlFrame;
  const doc = handle.htmlDoc;
  if (!f || doc == null) return;
  f.srcdoc = "";
  requestAnimationFrame(() => { if (handle.htmlFrame === f) f.srcdoc = doc; });
}

/** Update a clock-driven widget (clock/date text, stack loop) against the synced clock. */
export function updateWidget(handle: WidgetHandle, syncedNow: number): void {
  // Timed display runs for every widget (not just dynamic ones): animate the
  // frame on/off against the synced clock, but only on an edge (so the eased
  // entry/exit plays once, not every frame).
  if (handle.display) {
    const vis = displayVisible(handle.display, syncedNow);
    if (vis !== handle.displayShown) {
      handle.displayShown = vis;
      applyDisplayPose(handle, vis);
      // Replay an HTML widget's animation each time it re-enters view: reloading
      // the iframe restarts its CSS/JS from the top (§18).
      if (vis && handle.htmlFrame && handle.htmlDoc) replayHtml(handle);
    }
  }
  if (!handle.dynamic) return;
  const type = handle.node.type as WidgetType;
  const config = handle.node.config as Record<string, unknown>;

  // Throttle per-value widgets: a clock/date/countdown only changes ~once a
  // second, so rebuilding its DOM every animation frame (~60×/sec) is pure waste
  // that starves video decode + slide transitions. Re-render at most ~4×/sec.
  // Stacks self-gate on their dwell timer, so they stay per-frame.
  if (type === "clock" || type === "date" || type === "countdown") {
    const wallNow = typeof performance !== "undefined" ? performance.now() : syncedNow;
    const elapsed = handle.lastDynAt === undefined ? Infinity : wallNow - handle.lastDynAt;
    if (elapsed >= 0 && elapsed < 250) return; // within the throttle window
    handle.lastDynAt = wallNow;
  }

  if (type === "clock") {
    const target = handle.textEl ?? handle.el;
    const useH = handle.textEl ? intrinsicSize("clock")[1] : handle.node.rect[3];
    const html = clockBodyHtml(new Date(syncedNow), handle.node.style as Record<string, unknown>, config, useH);
    if (html !== handle.lastRender) { handle.lastRender = html; target.innerHTML = html; }
    return;
  }
  if (type === "date") {
    const txt = textDisplay("date", config, syncedNow);
    if (txt !== handle.lastRender) { handle.lastRender = txt; (handle.textEl ?? handle.el).textContent = txt; }
    return;
  }
  if (type === "countdown") {
    const target = handle.textEl ?? handle.el;
    const cstyle = handle.node.style as Record<string, unknown>;
    const useH = contentH(cstyle, handle.textEl ? intrinsicSize("countdown")[1] : handle.node.rect[3]);
    const html = countdownBodyHtml(cstyle, config, syncedNow, useH);
    if (html !== handle.lastRender) { handle.lastRender = html; target.innerHTML = html; }
    return;
  }
  if (type === "stack" && handle.stack) {
    const st = handle.stack;
    const { index, item } = stackResolve(st.items, st.dwellMs, syncedNow, st.shuffle);
    if (index !== st.lastIndex) {
      st.lastIndex = index;
      st.itemHandle = item ? mountStackItem(st, item) : undefined;
      // A freshly-mounted bound child starts from its placeholder — seed it with
      // the latest fetched datasets so it shows real data immediately.
      if (st.itemHandle?.rebind && st.lastDatasets) st.itemHandle.rebind(st.lastDatasets);
    }
    // Tick a live item (e.g. a clock inside the stack).
    if (st.itemHandle?.dynamic) updateWidget(st.itemHandle, syncedNow);
  }
}

/** Mount a stack item's widget filling the stack box (recursion into the shared
 *  renderer), with the stack's transition. Returns its handle so it can tick. */
function mountStackItem(st: NonNullable<WidgetHandle["stack"]>, item: StackItem): WidgetHandle {
  // Stop the previous child's pollers before swapping — else each dwell leaks a
  // WeatherWidget/TickerFeed/BoardSubscription (this loops for weeks).
  st.itemCleanup?.();
  st.itemCleanup = undefined;
  st.inner.innerHTML = "";
  const node: Widget = { id: item.id, type: item.widget.type, rect: [0, 0, st.w, st.h], rot: 0, z: 0, style: item.widget.style, config: item.widget.config };
  const h = createWidgetEl(node, st.assetUrl);
  h.el.style.position = "absolute";
  h.el.style.inset = "0";
  if (st.transition === "fade") h.el.style.animation = "wxfade 480ms ease";
  else if (st.transition === "slide") h.el.style.animation = "wxslide 520ms cubic-bezier(.22,.61,.36,1)";
  else if (st.transition === "zoom") h.el.style.animation = "wxzoom 520ms cubic-bezier(.22,.61,.36,1)";
  else if (st.transition === "flip") h.el.style.animation = "wxflip 560ms cubic-bezier(.22,.61,.36,1)";
  st.inner.appendChild(h.el);
  ensureStackKeyframes(st.inner.ownerDocument);
  // Bring the freshly-mounted child to life (weather/ticker/board/nowplaying).
  if (st.onMountItem) st.itemCleanup = st.onMountItem(h, node);
  return h;
}

let kfInjected = false;
function ensureStackKeyframes(doc: Document): void {
  if (kfInjected) return;
  kfInjected = true;
  const s = doc.createElement("style");
  s.textContent = "@keyframes wxfade{from{opacity:0}to{opacity:1}}@keyframes wxslide{from{opacity:0;transform:translateX(28px)}to{opacity:1;transform:translateX(0)}}@keyframes wxzoom{from{opacity:0;transform:scale(1.08)}to{opacity:1;transform:scale(1)}}@keyframes wxflip{from{opacity:0;transform:perspective(1200px) rotateX(32deg)}to{opacity:1;transform:none}}";
  doc.head.appendChild(s);
}
