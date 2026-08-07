/**
 * DevicePreview — a live, zero-stream view of what a device is showing *right
 * now*. Playout is a pure function of a synced clock (§1), so the dashboard just
 * fetches the channel's compiled manifest and evaluates the same timeline the
 * player runs: `resolveAt(slideTimeline(manifest), now)` → the active slide +
 * seek offset. It ticks locally; no socket, no video stream. The only skew from
 * the real screen is the clock-sync offset (sub-100ms), invisible at slide grain.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { MonitorOff, Radio, ImageOff } from "lucide-react";
import { slideTimeline, type Manifest, type Slide } from "@scena/manifest";
import { resolveAt, cyclePositionAt, type Timeline } from "@scena/timeline";
import { getManifest } from "../api.js";
import { cn } from "@4dl/ui";

type Props = {
  channelId?: string | null;
  online?: boolean;
  /** Show the slide counter + cycle progress chrome (detail view). */
  chrome?: boolean;
  className?: string;
};

function useContainerWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(e.contentRect.width));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

export function DevicePreview({ channelId, online = true, chrome = false, className }: Props) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [failed, setFailed] = useState(false);
  const timeline = useRef<Timeline | null>(null);
  const [tick, setTick] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const width = useContainerWidth(boxRef);

  useEffect(() => {
    let alive = true;
    setManifest(null);
    setFailed(false);
    timeline.current = null;
    if (!channelId) return;
    getManifest(channelId)
      .then((m) => {
        if (!alive) return;
        setManifest(m);
        timeline.current = slideTimeline(m);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [channelId]);

  // Advance the local clock. 4fps is plenty to track slide swaps + progress.
  useEffect(() => {
    if (!manifest) return;
    const t = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [manifest]);

  const dims = manifest?.dimensions ?? { w: 16, h: 9 };
  const scale = width && manifest ? width / dims.w : 0;

  const { slide, url, count, index, progress } = useMemo(() => {
    const tl = timeline.current;
    if (!tl || !manifest) return { slide: null as Slide | null, url: undefined as string | undefined, count: 0, index: 0, progress: 0 };
    const st = resolveAt(tl, Date.now());
    const s = manifest.slides.items.find((x) => x.id === st.item.id) ?? null;
    const u = s?.hash ? manifest.assets.find((a) => a.hash === s.hash)?.url : undefined;
    const prog = tl.cycleMs > 0 ? cyclePositionAt(tl, Date.now()) / tl.cycleMs : 0;
    return { slide: s, url: u, count: manifest.slides.items.length, index: st.index, progress: prog };
    // re-evaluate each tick (Date.now advances the timeline)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, tick, width]);

  return (
    <div
      ref={boxRef}
      className={cn("relative overflow-hidden rounded-lg bg-black ring-1 ring-black/10", className)}
      style={{ aspectRatio: `${dims.w} / ${dims.h}` }}
    >
      {/* States: no channel / failed / loading / live frame */}
      {!channelId ? (
        <Center icon={<Radio />} label="No channel" />
      ) : failed ? (
        <Center icon={<ImageOff />} label="No manifest" />
      ) : !manifest ? (
        <div className="absolute inset-0 animate-pulse bg-white/5" />
      ) : slide ? (
        <SlideFrame slide={slide} url={url} dims={dims} scale={scale} />
      ) : (
        <Center icon={<ImageOff />} label="Empty" />
      )}

      {/* Offline veil — the frame is what it *should* show; dim it when dark. */}
      {channelId && !online && (
        <div className="absolute inset-0 grid place-items-center bg-black/70 text-white/60 backdrop-grayscale">
          <div className="flex items-center gap-1.5 text-caption font-medium">
            <MonitorOff className="size-4" /> Offline
          </div>
        </div>
      )}

      {/* Cycle progress + counter chrome (detail view) */}
      {chrome && manifest && slide && (
        <>
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
            <div className="h-full bg-primary/80 transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <div className="absolute right-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 font-mono text-caption font-medium text-white/90">
            {index + 1}/{count}
          </div>
        </>
      )}
    </div>
  );
}

function SlideFrame({ slide, url, dims, scale }: { slide: Slide; url?: string; dims: { w: number; h: number }; scale: number }) {
  if (slide.type === "html") {
    // Render the authored HTML at design size, scaled into the box. Sandboxed
    // with no same-origin, non-interactive (this is a preview).
    return (
      <iframe
        title="slide"
        srcDoc={slide.htmlBody ?? ""}
        sandbox="allow-scripts"
        scrolling="no"
        className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
        style={{ width: dims.w, height: dims.h, transform: `scale(${scale || 0.0001})` }}
      />
    );
  }
  if (!url) return <Center icon={<ImageOff />} label={slide.type} />;
  if (slide.type === "video") {
    return <video src={url} muted loop autoPlay playsInline className="absolute inset-0 size-full object-contain" />;
  }
  return <img src={url} alt="" className="absolute inset-0 size-full object-contain" />;
}

function Center({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center text-white/50">
      <div className="flex flex-col items-center gap-1.5 text-caption font-medium capitalize">
        {icon}
        {label}
      </div>
    </div>
  );
}
