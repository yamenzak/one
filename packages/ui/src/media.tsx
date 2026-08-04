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
 *   A DOCUMENT — an image being examined rather than recognised, i.e. the
 *   lightbox — is contained too. That is the one place cropping loses
 *   information the reader came for.
 *
 * `Thumb` is the first case. Marks stay hand-placed, because a mark's frame is
 * always bespoke (a bar, a splash, a settings preview) and there is no second
 * decision to share.
 */

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "./lib/utils.js";
import { toneSoft, type Tone } from "./primitives.js";
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
            <span className="numeral rounded-full bg-white/15 px-3 py-1 text-sm font-medium">{cur + 1} / {photos.length}</span>
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
            {label && <span className="max-w-[60vw] truncate text-center text-sm text-white/80">{label}</span>}
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
            {p.label && <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-xs font-medium text-white">{p.label}</span>}
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
