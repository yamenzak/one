/**
 * Photo viewer — a tappable thumbnail grid + a full-screen lightbox with fluid
 * scroll-snap swiping between images. Used for check-in progress photos and lab
 * uploads. Theme-driven, animated, no external image deps.
 */

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "./lib/utils.js";
import { ChevronLeft, ChevronRight, X, ImageIcon } from "./lib/icons.js";

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
            className="group relative aspect-square overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-border/60"
          >
            <img src={p.url} alt={p.label ?? `Photo ${i + 1}`} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
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
  return <div className={cn("grid aspect-square place-items-center rounded-2xl bg-surface-2 text-muted-foreground [&_svg]:size-6", className)}><ImageIcon /></div>;
}
