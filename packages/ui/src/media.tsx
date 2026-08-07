/**
 * IMAGES — `Thumb`, the photo grid, and the full-screen lightbox.
 *
 * ── The rule this file exists to hold ───────────────────────────────────────
 *
 * **A PHOTO FILLS ITS FRAME. A MARK IS CONTAINED INSIDE ONE.**
 *
 * Forty-seven image slots had been hand-rolled across the product, split about
 * two-to-one between `object-cover` and `object-contain` with nothing naming
 * which was which — so the two most-seen thumbnails in the app landed on the
 * wrong side. A library of exercise photos, some shot portrait and some
 * landscape, rendered as letterboxed rectangles floating in a tinted plate:
 * every tile a different amount of coloured background, and the grid reading as
 * broken rather than as a grid.
 *
 * The distinction is not a preference, it is what the image IS:
 *
 *   A PHOTO — an exercise demo, a plate of food, a face, a progress shot, an
 *   article cover — is an IDENTIFIER at thumbnail size. Nobody studies it; they
 *   recognise it. It fills the frame, centred, and the edges crop. Consistent
 *   tiles, no bars, and the subject is in the middle of a photograph anyway.
 *
 *   A MARK — a logo, a wordmark, a generated app icon — carries its own padding
 *   and its own transparency, and cropping it destroys the thing itself. It is
 *   contained, and the space around it is deliberate.
 *
 *   A DOCUMENT — an image being examined rather than recognised: the lightbox,
 *   and the HERO of a detail surface, which someone opened in order to look at
 *   it — is contained. That is where cropping loses the information the reader
 *   came for.
 *
 * `Thumb` is the first case, `Media` the third. Marks stay hand-placed, because
 * a mark's frame is always bespoke (a bar, a splash, a settings preview) and
 * there is no second decision to share.
 */

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "./lib/utils.js";
import { Spinner, toneSoft, type Tone } from "./primitives.js";
import { ChevronLeft, ChevronRight, X, ImageIcon, type LucideIcon } from "./lib/icons.js";

export type ThumbRatio = "square" | "photo" | "wide";
/** Literal class names, never interpolated — Tailwind's scanner reads source
 *  text, so `rounded-${radius}` compiles to a class that does not exist. */
const THUMB_RADIUS = {
  lg: "rounded-lg", xl: "rounded-xl", "2xl": "rounded-2xl", full: "rounded-full", none: "",
} as const;

const RATIO: Record<ThumbRatio, string> = {
  square: "aspect-square",
  /** 4:3 — the shape most cameras produce, so it crops the least. */
  photo: "aspect-[4/3]",
  wide: "aspect-[16/9]",
};

export interface ThumbProps {
  /** The image. `null`/`undefined` renders the fallback. */
  src?: string | null;
  /**
   * A second frame. Two frames CROSS-FADE on a shared tick — an exercise's
   * start and end position, animated without a video.
   */
  src2?: string | null;
  /** The glyph shown when there is no image, or when the URL fails to load. */
  fallback?: LucideIcon;
  /** Tints the fallback plate. Only ever visible in the fallback state — with a
   *  photo present there is nothing behind it to see. */
  tone?: Tone;
  /** Fixed pixel box, for a row's leading slot. Omit and it fills its parent. */
  size?: number;
  /** The shape when `size` is omitted. Ignored when `size` is set (square). */
  ratio?: ThumbRatio;
  /** Rounding. `lg` for a row's leading slot, `xl`/`2xl` for a tile. */
  radius?: keyof typeof THUMB_RADIUS;
  alt?: string;
  className?: string;
  /** Cross-fade tick for two-frame thumbs — supplied by the app so every thumb
   *  on a screen flips together instead of each running its own timer. */
  frame?: number;
}

/**
 * ONE photo frame, filled.
 *
 * Everything here is a decision that was being made forty-seven times:
 *
 *  • `object-cover`, always — see the header.
 *  • The plate is `bg-surface-2` with a photo and a TONE-tinted soft fill only
 *    when the fallback glyph is showing. The thumbnails this replaces kept the
 *    tint underneath the image, which is exactly what made the letterbox bars
 *    brand-coloured instead of merely present.
 *  • A URL that 404s falls back to the glyph. The old ones rendered the
 *    browser's broken-image chrome inside a rounded tinted box.
 *  • `loading="lazy"` and `decoding="async"`, because a library grid is thirty
 *    images and none of them is above the fold after the first row.
 */
export function Thumb({
  src, src2, fallback: Fallback = ImageIcon, tone, size, ratio = "square",
  radius = "lg", alt = "", className, frame = 0,
}: ThumbProps) {
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const frames = [src, src2].filter((f): f is string => Boolean(f) && !failed[f!]);
  const shown = frames.length > 1 ? frames[frame % frames.length]! : frames[0];
  const box: CSSProperties | undefined = size ? { width: size, height: size } : undefined;

  return (
    <div
      style={box}
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden",
        THUMB_RADIUS[radius],
        // The tint belongs to the FALLBACK, not to the frame.
        shown ? "bg-surface-2" : tone ? toneSoft[tone] : "bg-surface-2 text-muted-foreground",
        !size && RATIO[ratio],
        !size && "w-full",
        className,
      )}
    >
      {frames.length > 1 ? (
        // Both frames stay mounted and cross-fade, so the swap has nothing to
        // decode and cannot flash.
        frames.map((f, i) => (
          <img
            key={f}
            src={f}
            alt={i === 0 ? alt : ""}
            loading="lazy"
            decoding="async"
            onError={() => setFailed((m) => ({ ...m, [f]: true }))}
            className={cn(
              "absolute inset-0 size-full object-cover transition-opacity duration-700",
              i === frame % frames.length ? "opacity-100" : "opacity-0",
            )}
          />
        ))
      ) : shown ? (
        <img
          src={shown}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed((m) => ({ ...m, [shown]: true }))}
          className="size-full object-cover"
        />
      ) : (
        <Fallback aria-hidden className="size-1/2 max-h-8 max-w-8" />
      )}
    </div>
  );
}

/**
 * THE HERO OF A DETAIL SURFACE — a photo you opened something to LOOK at.
 *
 * `Thumb`'s rule (fill, crop) is right for recognition and wrong here. Someone
 * who taps a row to read the how-to wants the whole image, so a hero belongs
 * with the lightbox: it is CONTAINED. Which lands straight back on the problem
 * `Thumb` exists to avoid — a portrait photo in a wide hero is a narrow strip
 * between two slabs of flat colour.
 *
 * Cropping instead is worse, and this is not hypothetical: an exercise hero
 * showed the gym's ceiling lights and the top of the model's head, with the
 * dumbbells — the entire subject, the reason the photo exists — cropped away.
 *
 * So the surround is THE IMAGE ITSELF: the same source, scaled up, blurred and
 * dimmed behind the contained foreground. Nothing is cropped, nothing is a
 * coloured bar, and the frame takes its colour from the photograph rather than
 * from the brand. Every orientation lands in the same rectangle, so a column of
 * them keeps one rhythm.
 *
 * A video needs none of it — it letterboxes itself against black, which is what
 * a video player is supposed to look like — so `video` renders a player and the
 * backdrop stays out of the way.
 */
export interface MediaProps {
  src?: string | null;
  /** A second frame. The two cross-fade on `frame` — start/end, before/after. */
  src2?: string | null;
  /** An attached video. Takes the frame over; `src` then only seeds the poster. */
  video?: string | null;
  fallback?: LucideIcon;
  tone?: Tone;
  ratio?: ThumbRatio;
  radius?: keyof typeof THUMB_RADIUS;
  alt?: string;
  className?: string;
  frame?: number;
  /** A corner label — "Start"/"End", a duration, a count. */
  badge?: ReactNode;
}

export function Media({
  src, src2, video, fallback: Fallback = ImageIcon, tone, ratio = "photo",
  radius = "2xl", alt = "", className, frame = 0, badge,
}: MediaProps) {
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const frames = [src, src2].filter((f): f is string => Boolean(f) && !failed[f!]);
  const active = frames.length > 1 ? frame % frames.length : 0;
  const shape = cn("relative w-full overflow-hidden", THUMB_RADIUS[radius], RATIO[ratio], className);

  if (video) {
    return (
      <div className={cn(shape, "bg-black")}>
        <video src={video} poster={frames[0]} controls playsInline preload="metadata" className="absolute inset-0 size-full" />
        {badge != null && <MediaBadge>{badge}</MediaBadge>}
      </div>
    );
  }

  if (frames.length === 0) {
    return (
      <div className={cn(shape, "grid place-items-center", tone ? toneSoft[tone] : "bg-surface-2 text-muted-foreground")}>
        <Fallback aria-hidden className="size-10" />
      </div>
    );
  }

  return (
    <div className={cn(shape, "bg-surface-2")}>
      {frames.map((f, i) => (
        <div key={f} className={cn("absolute inset-0 transition-opacity duration-700", i === active ? "opacity-100" : "opacity-0")}>
          {/* The backdrop. `scale-110` pushes the blur's soft edge out of frame,
              and the saturation lift stops a dim photo's surround reading as
              grey mud. */}
          <img src={f} alt="" aria-hidden loading="lazy" decoding="async" className="absolute inset-0 size-full scale-110 object-cover blur-2xl saturate-150" />
          <div className="absolute inset-0 bg-black/25" />
          <img
            src={f}
            alt={i === 0 ? alt : ""}
            loading="lazy"
            decoding="async"
            onError={() => setFailed((m) => ({ ...m, [f]: true }))}
            className="absolute inset-0 size-full object-contain"
          />
        </div>
      ))}
      {badge != null && <MediaBadge>{badge}</MediaBadge>}
    </div>
  );
}

/** The corner label on a `Media` frame — a dark scrim rather than a tone,
 *  because it has to stay legible over an arbitrary photograph. */
function MediaBadge({ children }: { children: ReactNode }) {
  return (
    <span className="absolute left-2.5 top-2.5 z-10 rounded-full bg-black/55 px-2.5 py-1 text-micro text-white backdrop-blur-sm">
      {children}
    </span>
  );
}

export interface Photo {
  url: string;
  label?: string | null;
}

const overlayCls = "fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm data-[state=open]:animate-[overlay-in_0.2s_ease] data-[state=closed]:animate-[overlay-out_0.15s_ease]";

/** Full-screen lightbox: horizontal scroll-snap strip (compositor-driven, so
 *  swiping stays fluid) with a counter, per-photo label, and prev/next. */
export function Lightbox({ photos, index = 0, onClose }: { photos: Photo[]; index?: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState(index);

  // Jump to the opened photo once the strip is laid out.
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTo({ left: index * el.clientWidth });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScroll = () => { const el = ref.current; if (el) setCur(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); };
  const goTo = (i: number) => { const el = ref.current; if (el) el.scrollTo({ left: Math.min(photos.length - 1, Math.max(0, i)) * el.clientWidth, behavior: "smooth" }); };
  const label = photos[cur]?.label;

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlayCls} />
        <DialogPrimitive.Content className="fixed inset-0 z-[60] flex flex-col outline-none data-[state=open]:animate-[content-in_0.2s_cubic-bezier(0.22,1,0.36,1)]">
          <DialogPrimitive.Title className="sr-only">Photo viewer</DialogPrimitive.Title>
          <div className="flex items-center justify-between px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] text-white">
            <span className="numeral rounded-full bg-white/15 px-3 py-1 text-caption font-medium">{cur + 1} / {photos.length}</span>
            <DialogPrimitive.Close className="grid size-10 place-items-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 [&_svg]:size-5"><X /></DialogPrimitive.Close>
          </div>
          <div ref={ref} onScroll={onScroll} className="flex flex-1 snap-x snap-mandatory overflow-x-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {photos.map((p, i) => (
              <div key={i} className="flex w-full shrink-0 snap-center snap-always items-center justify-center p-4">
                <img src={p.url} alt={p.label ?? `Photo ${i + 1}`} className="max-h-full max-w-full rounded-2xl object-contain" />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-4 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-white">
            {photos.length > 1 && <button onClick={() => goTo(cur - 1)} disabled={cur === 0} className="grid size-10 place-items-center rounded-full bg-white/15 transition-colors hover:bg-white/25 disabled:opacity-30 [&_svg]:size-5"><ChevronLeft /></button>}
            {label && <span className="max-w-[60vw] truncate text-center text-caption text-white/80">{label}</span>}
            {photos.length > 1 && <button onClick={() => goTo(cur + 1)} disabled={cur === photos.length - 1} className="grid size-10 place-items-center rounded-full bg-white/15 transition-colors hover:bg-white/25 disabled:opacity-30 [&_svg]:size-5"><ChevronRight /></button>}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** A grid of rounded photo thumbnails; tapping any opens the lightbox. */
export function PhotoGrid({ photos, className, cols = 3 }: { photos: Photo[]; className?: string; cols?: 2 | 3 | 4 }) {
  const [open, setOpen] = useState<number | null>(null);
  if (photos.length === 0) return null;
  const grid = cols === 2 ? "grid-cols-2" : cols === 4 ? "grid-cols-4" : "grid-cols-3";
  return (
    <>
      <div className={cn("grid gap-2", grid, className)}>
        {photos.map((p, i) => (
          <motion.button
            key={i}
            whileTap={{ scale: 0.96 }}
            onClick={() => setOpen(i)}
            className="group relative overflow-hidden rounded-2xl ring-1 ring-border/60"
          >
            <Thumb
              src={p.url}
              alt={p.label ?? `Photo ${i + 1}`}
              radius="none"
              className="transition-transform duration-300 group-hover:scale-105"
            />
            {p.label && <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-caption font-medium text-white">{p.label}</span>}
          </motion.button>
        ))}
      </div>
      {open !== null && <Lightbox photos={photos} index={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** A placeholder tile for when a media key can't render (private/expired). */
export function PhotoFallback({ className }: { className?: string }) {
  return <Thumb radius="2xl" className={className} />;
}

/**
 * AN UPLOAD IN FLIGHT, OVER THE THING BEING UPLOADED.
 *
 * Pairs with `@4dl/app-kit`'s `useUpload`, whose state this renders verbatim —
 * a screen passes the hook's fields straight through rather than deciding what
 * "uploading" should look like for itself.
 *
 * Two shapes, and which one appears is not a style choice:
 *
 *   a RING with a percentage when the browser can report a length, because a
 *   photo on a slow connection needs to be visibly moving, not merely busy;
 *   a SPINNER when it cannot (`lengthComputable: false`) — a made-up percentage
 *   that jumps to 100 and waits is worse than an honest indeterminate.
 *
 * `processing` is its own phase for the same reason: between the last byte
 * leaving and the server answering, a determinate bar has nowhere left to go
 * and sits at 100% looking stuck. It says what it is doing instead.
 *
 * It covers its parent (`absolute inset-0`), so the parent must be `relative`
 * — which every thumbnail frame in this package already is.
 */
export function UploadProgress({
  phase,
  progress,
  onCancel,
  className,
}: {
  phase: "idle" | "sending" | "processing";
  /** 0..1, or null when this upload cannot report a length. */
  progress: number | null;
  /** Omit for an upload that cannot be cancelled. */
  onCancel?: () => void;
  className?: string;
}) {
  if (phase === "idle") return null;
  const pct = progress === null ? null : Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const determinate = phase === "sending" && pct !== null;
  // The ring is drawn as a conic sweep rather than an SVG arc: one element, no
  // viewBox maths, and it inherits the tone tokens like everything else.
  return (
    <div
      className={cn("absolute inset-0 z-10 grid place-items-center gap-1.5 bg-background/80 backdrop-blur-sm", className)}
      role="progressbar"
      aria-label={phase === "processing" ? "Processing upload" : "Uploading"}
      aria-valuenow={determinate ? pct! : undefined}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? 100 : undefined}
    >
      <div className="flex flex-col items-center gap-1.5">
        {determinate ? (
          <div
            className="grid size-11 place-items-center rounded-full"
            style={{ background: `conic-gradient(var(--primary) ${pct! * 3.6}deg, var(--secondary) 0deg)` }}
          >
            <span className="numeral grid size-8 place-items-center rounded-full bg-background text-micro tabular-nums">
              {pct}
            </span>
          </div>
        ) : (
          <Spinner className="size-6" />
        )}
        <span className="text-micro normal-case tracking-normal text-muted-foreground">
          {phase === "processing" ? "Processing…" : "Uploading…"}
        </span>
        {onCancel && phase === "sending" && (
          <button
            type="button"
            onClick={onCancel}
            className="text-micro normal-case tracking-normal text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
