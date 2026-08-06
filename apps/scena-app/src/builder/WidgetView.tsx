/**
 * Renders a widget node's *visual* (filling its parent frame) — the same result
 * the player produces from the manifest scene graph (§17), by drawing from the
 * shared `@scena/widgets` core, so the canvas is a true preview. The builder
 * frame owns position/rotation; this owns looks. Data-bound widgets (feed/board/
 * weather) show a representative placeholder since the builder has no live feed.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { slideDocument } from "@scena/manifest";
import {
  type Css,
  type SourceDataset,
  contentH,
  applyBindings,
  boundSourceIds,
  shapeCss,
  lineCss,
  textCss,
  imageCss,
  textDisplay,
  stackItems,
  stackResolve,
  stackDwellMs,
  stackShuffle,
  stackTransition,
  tickerContainerCss,
  tickerBadge,
  tickerVariant,
  tickerTitles,
  tickerSeparator,
  tickerSeparatorImage,
  tickerDirection,
  tickerGapEm,
  tickerSpeed,
  nowPlayingVariant,
  nowPlayingAccent,
  nowPlayingContainerCss,
  nowPlayingBodyHtml,
  queueVariant,
  boardContainerCss,
  queueBodyHtml,
  roomBodyHtml,
  roomStatusBodyHtml,
  scoreBodyHtml,
  weatherContainerCss,
  weatherBodyHtml,
  applyWeatherUnits,
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
  type QueueData,
  type RoomData,
  type ScoreData,
  type WeatherData,
  type WeatherVariant,
  type IconCode,
  scalerFit,
  resolveScaleMode,
  intrinsicSize,
  clockIsAnalog,
  clockBodyHtml,
  hasRadius,
  radiusValue,
  str,
  num,
  bool,
} from "@scena/widgets";
import type { WNode } from "./types.js";
import { useLiveData } from "./live-data.js";
import type { QueueState, RoomState, ScoreState } from "@scena/protocol";

const cx = (c: Css): CSSProperties => c as CSSProperties;

/** A representative forecast for the builder when no location is bound (or to
 *  fill the hourly/daily rows the dashboard has no live data for). */
const SAMPLE_WEATHER: WeatherData = {
  label: "City Center", units: "metric",
  current: { temp: 21, feelsLike: 20, hi: 24, lo: 15, condition: "Partly cloudy", icon: "partly-day", humidity: 58, wind: 3, pop: 0.1 },
  hourly: [9, 12, 15, 18, 21, 0, 3, 6].map((hh, i) => ({ dt: hh * 3600, temp: 21 - (i % 4), icon: (["clear-day", "partly-day", "cloudy", "rain"][i % 4]) as IconCode, pop: (i % 4) * 0.15 })),
  daily: [0, 1, 2, 3, 4, 5, 6].map((dd) => ({ dt: 1704067200 + dd * 86400, hi: 24 - (dd % 3), lo: 14 + (dd % 2), icon: (["clear-day", "partly-day", "rain", "cloudy"][dd % 4]) as IconCode, pop: (dd % 4) * 0.15 })),
};

/**
 * Renders a node's content applying its scale mode (§17). "uniform" authors the
 * content at its intrinsic size and scales the whole thing to fit the box (never
 * crops, type/radius scale together); "reflow" fills the box directly. This is
 * the exact behaviour the player produces, so the preview stays WYSIWYG.
 */
export function WidgetContent({ node }: { node: WNode }) {
  // Analog clocks self-fit (the SVG centres + keeps aspect) and a clock with a
  // date line has a column layout — both render reflow even though a clock
  // defaults to uniform, so the face stays round / the date isn't clipped.
  const clockReflow = node.type === "clock" && (clockIsAnalog(node.config) || bool(node.config.showDate));
  const mode = clockReflow ? "reflow" : resolveScaleMode(node.type, node.scaleMode);
  if (mode !== "uniform") return <WidgetVisual node={node} />;
  const [iw, ih] = intrinsicSize(node.type);
  const fit = scalerFit(iw, ih, node.w, node.h);
  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: "50%", top: "50%", width: iw, height: ih, transform: `translate(-50%, -50%) scale(${fit})`, transformOrigin: "center center" }}>
        <WidgetVisual node={{ ...node, w: iw, h: ih }} />
      </div>
    </div>
  );
}

const SAMPLE_TITLES = ["Breaking: markets rally into the close", "Weather: clear skies through the weekend", "Sports: home side wins in extra time"];

export function WidgetVisual({ node }: { node: WNode }) {
  const live = useLiveData();
  const style = node.style;
  const t = node.type;
  // Overlay any dynamic-source bindings onto the config so the preview shows
  // real cells (byte-identical to what the player resolves). Unbound widgets
  // pass through unchanged; a not-yet-loaded source keeps the authored value.
  const config = useMemo(() => {
    const ids = boundSourceIds(node.config);
    if (ids.length === 0) return node.config;
    const ds: Record<string, SourceDataset | undefined> = {};
    for (const id of ids) ds[id] = live.sourceData(id) ?? undefined;
    return applyBindings(node.config, ds);
  }, [node.config, live]);

  if (t === "box" || t === "circle" || t === "triangle") {
    return <div style={cx(shapeCss(t, style))} />;
  }

  if (t === "line") {
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={cx(lineCss(style))} />
      </div>
    );
  }

  if (t === "image") {
    const url = str(config.url);
    // Shared renderer (fit, per-side radius/border, tint, filters) → byte-identical.
    const base = cx(imageCss(style, config, url || undefined));
    if (url) return <div style={base} />;
    return (
      <div style={{ ...base, border: "2px dashed oklch(0.5 0.02 300)", color: "oklch(0.7 0.02 300)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>image</div>
    );
  }

  if (t === "logo") {
    const url = str(config.url);
    const base = cx(imageCss({ ...style, tint: undefined }, { ...config, fit: str(config.fit, "contain") }, url || undefined));
    if (url) return <div style={base} />;
    return (
      <div style={{ ...base, background: "transparent", border: "2px dashed oklch(0.5 0.02 300)", color: "oklch(0.7 0.02 300)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>logo</div>
    );
  }

  if (t === "ticker") return <TickerPreview node={node} />;
  if (t === "stack") return <StackPreview node={node} />;
  if (t === "weather") return <WeatherPreview node={node} />;
  if (t === "nowplaying") return <NowPlayingPreview node={node} />;
  if (t === "queue_caller") return <QueuePreview node={node} />;

  if (t === "room_board") return <RoomBoardPreview node={node} />;
  if (t === "room_status") return <RoomStatusPreview node={node} />;
  if (t === "scoreboard") return <ScoreboardPreview node={node} />;

  if (t === "clock") return <ClockWidget node={node} />;
  if (t === "countdown") return <CountdownWidget node={node} />;
  if (t === "metric") return <div style={cx(metricContainerCss(style))} dangerouslySetInnerHTML={{ __html: metricBodyHtml(style, config, contentH(style, node.h)) }} />;
  if (t === "menu") return <div style={cx(menuContainerCss(style))} dangerouslySetInnerHTML={{ __html: menuBodyHtml(style, config, contentH(style, node.h)) }} />;
  if (t === "qr") return <div style={cx(qrContainerCss(style))} dangerouslySetInnerHTML={{ __html: qrBodyHtml(style, config, node.h) }} />;
  if (t === "cta") return <div style={cx(ctaContainerCss(style))} dangerouslySetInnerHTML={{ __html: ctaBodyHtml(style, config, node.h) }} />;

  if (t === "html") {
    const html = str(config.html);
    const radius = num(style.radius, 0);
    if (!html) {
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: radius, border: "2px dashed var(--w-border, oklch(0.5 0.02 300))", background: "var(--w-surface, oklch(0.2 0.02 300 / 0.4))", color: "var(--w-fg-muted, oklch(0.75 0.02 300))", fontSize: 22, fontWeight: 600 }}>
          HTML embed
        </div>
      );
    }
    // Static (no-scripts) preview on the canvas — safe + cheap; the player runs
    // it with allow-scripts. slideDocument injects the bundled fonts.
    return <iframe title="html widget" sandbox="" srcDoc={slideDocument(html)} style={{ width: "100%", height: "100%", border: 0, borderRadius: radius, background: "transparent" }} />;
  }

  // text / date
  return (
    <div style={cx(textCss(t, style, config, node.h))}>
      <LiveText type={t} config={config} />
    </div>
  );
}

function LiveText({ type, config }: { type: WNode["type"]; config: Record<string, unknown> }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (type !== "date") return;
    const iv = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(iv);
  }, [type]);
  return <>{textDisplay(type, config, now)}</>;
}

/** Live clock — digital numerals or an analog face (+ optional date), ticking
 *  once a second. Rendered from the shared `clockBodyHtml` so it's identical to
 *  the player. */
function ClockWidget({ node }: { node: WNode }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  return <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: clockBodyHtml(new Date(now), node.style, node.config, node.h) }} />;
}

/** Live countdown — ticks once a second off the local clock, rendered from the
 *  shared `countdownBodyHtml` so it's identical to the player. */
function CountdownWidget({ node }: { node: WNode }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  return <div style={cx(countdownContainerCss(node.style))} dangerouslySetInnerHTML={{ __html: countdownBodyHtml(node.style, node.config, now, contentH(node.style, node.h)) }} />;
}

function TickerPreview({ node }: { node: WNode }) {
  const live = useLiveData();
  const variant = tickerVariant(node.config);
  const badge = tickerBadge(node.config);
  const feedId = str(node.config.feedId);
  // Real headlines the moment a source is bound (any provider's chosen column),
  // else representative samples.
  const ds = feedId ? live.sourceData(feedId) : null;
  const real = ds ? tickerTitles(ds, node.config) : null;
  // Be honest: once a bound source has loaded with zero items, show that (it's
  // what the screen will show) rather than fake sample headlines that hide an
  // empty/failing feed. Samples are only for the unbound design preview.
  const titles = real && real.length ? real : !feedId ? SAMPLE_TITLES : ds ? ["No items from this source yet"] : SAMPLE_TITLES;
  const container = { ...cx(tickerContainerCss(node.style, node.h)), display: "flex", alignItems: "center" };
  return (
    <div style={container}>
      {badge && (
        <div style={{ alignSelf: "stretch", display: "flex", alignItems: "center", padding: "0 1.1em", background: badge.color, color: badge.textColor, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {badge.text}
        </div>
      )}
      {variant === "list" ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: "0.35em", padding: "0 1em", overflow: "hidden" }}>
          {titles.slice(0, 5).map((s, i) => (
            <div key={i} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.2 }}>{s}</div>
          ))}
        </div>
      ) : variant === "headline" ? (
        <div style={{ flex: 1, padding: "0 1em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {feedId ? titles[0] : "bind a feed →"}
        </div>
      ) : (
        <TickerCrawl node={node} titles={titles} bound={!!feedId} />
      )}
    </div>
  );
}

/** The animated crawl (scroll/ribbon) for the builder — the same measured-pixel,
 *  px/s, direction-aware animation the player runs, so the preview is WYSIWYG. */
function TickerCrawl({ node, titles, bound }: { node: WNode; titles: string[]; bound: boolean }) {
  const laneRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const ribbon = tickerVariant(node.config) === "ribbon";
  const sepText = tickerSeparator(node.config);
  const sepImg = tickerSeparatorImage(node.config);
  const gap = tickerGapEm(node.style);
  const speed = tickerSpeed(node.style);
  const dir = tickerDirection(node.style);
  useEffect(() => {
    const lane = laneRef.current, copy = copyRef.current;
    if (!lane || !copy) return;
    let anim: Animation | null = null;
    const id = requestAnimationFrame(() => {
      const width = copy.getBoundingClientRect().width || copy.scrollWidth || 1;
      const durationMs = Math.max(2000, (width / speed) * 1000);
      const from = "translateX(0)", to = `translateX(${-width}px)`;
      const frames = dir === "right" ? [{ transform: to }, { transform: from }] : [{ transform: from }, { transform: to }];
      anim = lane.animate(frames, { duration: durationMs, iterations: Infinity, easing: "linear" });
    });
    return () => { cancelAnimationFrame(id); anim?.cancel(); };
  }, [titles.join("|"), ribbon, sepText, sepImg, gap, speed, dir]);
  const seq = (key: string, ref?: React.Ref<HTMLDivElement>) => (
    <div key={key} ref={ref} style={{ display: "inline-flex", alignItems: "center", flex: "0 0 auto" }}>
      {titles.map((title, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center" }}>
          <span style={ribbon
            ? { flex: "0 0 auto", display: "inline-flex", alignItems: "center", padding: "0.28em 0.95em", margin: `0 ${0.4 + gap / 2}em`, borderRadius: 999, background: "oklch(1 0 0 / 0.1)", whiteSpace: "nowrap" }
            : { flex: "0 0 auto", whiteSpace: "nowrap", padding: `0 ${gap / 2}em` }}>{title}</span>
          {!ribbon && (
            <span style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", opacity: 0.7 }}>
              {sepImg ? <img src={sepImg} alt="" style={{ height: "0.9em", width: "auto", margin: "0 0.5em", objectFit: "contain" }} /> : sepText}
            </span>
          )}
        </span>
      ))}
    </div>
  );
  if (!bound) return <div style={{ flex: 1, padding: "0 1em", whiteSpace: "nowrap", opacity: 0.7 }}>bind a feed →</div>;
  return (
    <div style={{ flex: 1, overflow: "hidden", position: "relative", height: "100%" }}>
      <div ref={laneRef} style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap", position: "absolute", left: 0, top: 0, height: "100%", willChange: "transform" }}>
        {seq("a", copyRef)}
        {seq("b")}
      </div>
    </div>
  );
}

function StackPreview({ node }: { node: WNode }) {
  const items = stackItems(node.config);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const { index, item } = stackResolve(items, stackDwellMs(node.config), now, stackShuffle(node.config));
  const transition = stackTransition(node.config);
  const anim = transition === "none" ? undefined
    : transition === "slide" ? "wxslide 480ms cubic-bezier(.22,.61,.36,1)"
    : transition === "zoom" ? "wxzoom 480ms cubic-bezier(.22,.61,.36,1)"
    : transition === "flip" ? "wxflip 520ms cubic-bezier(.22,.61,.36,1)"
    : "wxfade 420ms ease";
  // Each item is a real widget rendered through the shared renderer, filling the box.
  const itemNode: WNode | null = item
    ? { id: item.id, type: item.widget.type as WNode["type"], x: 0, y: 0, w: node.w, h: node.h, rot: 0, z: 0, style: item.widget.style, config: item.widget.config }
    : null;
  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: str(node.style.bg, "oklch(0.2 0.02 300 / 0.5)"), borderRadius: hasRadius(node.style) ? radiusValue(node.style, 0) : 18, overflow: "hidden" }}>
      {itemNode ? (
        <div key={itemNode.id} style={{ position: "absolute", inset: 0, animation: anim }}><WidgetContent node={itemNode} /></div>
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", opacity: 0.6 }}>add stack items →</div>
      )}
      {items.length > 0 && (
        <div style={{ position: "absolute", right: 10, bottom: 8, display: "flex", gap: 5 }}>
          {items.map((_, i) => (
            <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: i === index ? "#fff" : "oklch(1 0 0 / 0.35)" }} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A representative track for the builder Now Playing preview. */
const SAMPLE_TRACK = { title: "Golden Hour", artist: "Aurora Wave", artUrl: null, durationMs: 228_000 };

function NowPlayingPreview({ node }: { node: WNode }) {
  const v = nowPlayingVariant(node.config);
  const accent = nowPlayingAccent(node.style);
  // Shared renderer at ~42% progress → byte-identical to the player (§16).
  const html = nowPlayingBodyHtml(SAMPLE_TRACK, v, accent, SAMPLE_TRACK.durationMs * 0.42, SAMPLE_TRACK.durationMs, contentH(node.style, node.h));
  return <div style={cx(nowPlayingContainerCss(node.style))} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** A representative queue for the builder when no board is bound. */
const SAMPLE_QUEUE: QueueData = {
  prefix: "A", serving: 42, counter: 3,
  recent: [42, 41, 40, 39, 38, 37].map((n, i) => ({ number: n, counter: (i % 3) + 1 })),
};

function QueuePreview({ node }: { node: WNode }) {
  const live = useLiveData();
  const variant = queueVariant(node.config);
  const bound = str(node.config.boardId);
  const board = bound ? live.board(bound) : null;
  const q = board && board.kind === "queue" ? (board.state as QueueState | null) : null;
  const data: QueueData = q
    ? { prefix: q.prefix || "A", serving: q.serving, counter: q.counter, label: q.label, recent: q.recent.map((r) => ({ number: r.number, counter: r.counter, prefix: r.prefix })) }
    : SAMPLE_QUEUE;
  // Shared renderer → byte-identical to the player (§20).
  return <div style={cx(boardContainerCss(node.style))} dangerouslySetInnerHTML={{ __html: queueBodyHtml(data, variant, contentH(node.style, node.h)) }} />;
}

/** A representative room board for the builder when no board is bound. */
const SAMPLE_ROOM: RoomData = {
  statuses: [
    { id: "free", label: "Available", color: "oklch(0.78 0.15 150)" },
    { id: "busy", label: "In use", color: "oklch(0.7 0.18 25)" },
    { id: "soon", label: "Soon", color: "oklch(0.82 0.15 85)" },
  ],
  rooms: [
    { id: "1", name: "Room 1", status: "free" }, { id: "2", name: "Room 2", status: "busy" },
    { id: "3", name: "Room 3", status: "free" }, { id: "4", name: "Room 4", status: "soon" },
    { id: "5", name: "Room 5", status: "busy" }, { id: "6", name: "Room 6", status: "free" },
  ],
};

function RoomBoardPreview({ node }: { node: WNode }) {
  const live = useLiveData();
  const bound = str(node.config.boardId);
  const board = bound ? live.board(bound) : null;
  const room = board && board.kind === "room" ? (board.state as RoomState | null) : null;
  const data: RoomData = room && room.rooms.length ? room : SAMPLE_ROOM;
  // Shared renderer → byte-identical to the player (§20).
  return <div style={cx(boardContainerCss(node.style))} dangerouslySetInnerHTML={{ __html: roomBodyHtml(data, contentH(node.style, node.h)) }} />;
}

function RoomStatusPreview({ node }: { node: WNode }) {
  const live = useLiveData();
  const bound = str(node.config.boardId);
  const board = bound ? live.board(bound) : null;
  const room = board && board.kind === "room" ? (board.state as RoomState | null) : null;
  const data: RoomData = room && room.rooms.length ? room : SAMPLE_ROOM;
  const roomId = str(node.config.roomId) || data.rooms[0]?.id || "";
  // The door panel fills itself with the room's status colour — no board frame.
  return <div style={cx(boardContainerCss(node.style))} dangerouslySetInnerHTML={{ __html: roomStatusBodyHtml(data, roomId, contentH(node.style, node.h)) }} />;
}

/** A representative scoreboard for the builder when no board is bound. */
const SAMPLE_SCORE: ScoreData = {
  title: "Championship Final",
  period: "Q3 · 04:12",
  sides: [
    { id: "home", name: "Home", short: "HOME", score: 68 },
    { id: "away", name: "Away", short: "AWAY", score: 72 },
  ],
};

function ScoreboardPreview({ node }: { node: WNode }) {
  const live = useLiveData();
  const bound = str(node.config.boardId);
  const board = bound ? live.board(bound) : null;
  const score = board && board.kind === "score" ? (board.state as ScoreState | null) : null;
  const data: ScoreData = score && score.sides.length ? score : SAMPLE_SCORE;
  return <div style={cx(boardContainerCss(node.style))} dangerouslySetInnerHTML={{ __html: scoreBodyHtml(data, str(node.config.variant, "classic"), contentH(node.style, node.h)) }} />;
}

function WeatherPreview({ node }: { node: WNode }) {
  const live = useLiveData();
  const variant = str(node.config.variant, "current") as WeatherVariant;
  const sourceId = str(node.config.sourceId);
  const cur = sourceId ? live.weather(sourceId) : null;
  // Real current conditions when a location is bound; sample hourly/daily fill
  // the rows the dashboard has no live forecast for. Shared renderer → WYSIWYG.
  const base: WeatherData = cur
    ? { ...SAMPLE_WEATHER, current: { ...SAMPLE_WEATHER.current, temp: cur.temp, hi: cur.hi, lo: cur.lo, condition: cur.condition, icon: cur.icon as IconCode, pop: cur.pop } }
    : SAMPLE_WEATHER;
  const data = applyWeatherUnits(base, str(node.config.units));
  return <div style={cx(weatherContainerCss(node.style))} dangerouslySetInnerHTML={{ __html: weatherBodyHtml(variant, data, contentH(node.style, node.h)) }} />;
}
