/**
 * Skeleton system — structured placeholders that mirror the real components
 * (StatCard, ChartCard, list rows, heroes) so a loading screen reads as the
 * page that's about to arrive, not a wall of grey boxes. Every shape is built
 * from the shimmer-swept <Skeleton> primitive.
 *
 * The premium bit is <Reveal>: it crossfades the skeleton out — fading and
 * softening to blur — as the real content rises into focus, so the swap feels
 * like the page developing rather than a hard cut.
 */

import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "./lib/utils.js";
import { Skeleton } from "./primitives.js";

const EASE = [0.22, 1, 0.36, 1] as const;

// The content wrapper animates via VARIANT LABELS ("hidden"/"show"), not target
// objects. This matters: content commonly holds <Stagger> children that inherit
// their animation state from this parent — an object `animate` propagates no
// label, leaving those children stuck at their hidden variant (invisible). A
// labelled parent propagates "show", and `staggerChildren` cascades them in as
// the blur lifts.
const revealContent: Variants = {
  hidden: { opacity: 0, filter: "blur(8px)" },
  show: { opacity: 1, filter: "blur(0px)", transition: { duration: 0.4, ease: EASE, staggerChildren: 0.05, delayChildren: 0.03 } },
};

// ── Reveal — the skeleton→content transition ────────────────────────────────
/**
 * Swap a skeleton for its content with a premium reveal: the moment data lands,
 * the skeleton gives way to the content, which blurs + rises into focus and (if
 * it holds <Stagger> children) cascades them in.
 *
 * Deliberately a plain conditional, NOT an AnimatePresence crossfade: content
 * visibility must never depend on an exit animation completing, so it can't get
 * stranded hidden. The content owns the whole transition — it enters over the
 * spot the skeleton just vacated, which reads as the page developing.
 */
export function Reveal({ loading, skeleton, children, className }: { loading: boolean; skeleton: ReactNode; children: ReactNode; className?: string }) {
  if (loading) return <div className={className}>{skeleton}</div>;
  return (
    <motion.div variants={revealContent} initial="hidden" animate="show" className={className}>
      {children}
    </motion.div>
  );
}

// ── Primitive shapes ────────────────────────────────────────────────────────

/** A short pill of text. Height maps to a type scale; width defaults to full. */
export function SkeletonLine({ w, h = "text", className }: { w?: string; h?: "xs" | "text" | "title" | "display"; className?: string }) {
  const height = { xs: "h-2.5", text: "h-3.5", title: "h-5", display: "h-8" }[h];
  return <Skeleton className={cn("rounded-full", height, className)} style={w ? { width: w } : undefined} />;
}

/** A stack of text lines — the last one shorter, like a real paragraph. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} w={i === lines - 1 ? "55%" : i % 2 ? "85%" : "95%"} />
      ))}
    </div>
  );
}

/** A round placeholder — avatars, rings, glyphs. */
export function SkeletonCircle({ size = 40, className }: { size?: number; className?: string }) {
  return <Skeleton className={cn("shrink-0 rounded-full", className)} style={{ width: size, height: size }} />;
}

// ── Composite shapes (mirror the real components) ───────────────────────────

/** StatCard placeholder — icon+label line, a big value bar, optional foot. */
export function SkeletonStat({ stack = true, foot, className }: { stack?: boolean; foot?: boolean; className?: string }) {
  return (
    <div className={cn("rounded-2xl bg-card", stack ? "p-4" : "p-5", className)}>
      <div className="flex items-center gap-2">
        <Skeleton className="size-4 rounded" />
        <SkeletonLine w="55%" h="xs" />
      </div>
      <SkeletonLine w={stack ? "60%" : "45%"} h="display" className="mt-2.5" />
      {foot && <SkeletonLine w="40%" h="xs" className="mt-3" />}
    </div>
  );
}

/** A grid of StatCard placeholders. */
export function SkeletonStatGrid({ count = 4, cols = 2, foot, className }: { count?: number; cols?: number; foot?: boolean; className?: string }) {
  return (
    <div className={cn("grid gap-3", className)} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {Array.from({ length: count }).map((_, i) => <SkeletonStat key={i} foot={foot} />)}
    </div>
  );
}

/** ChartCard placeholder — header (glyph + title + value) over a chart-shaped
 *  body. The body is a soft bar cluster so it reads as "a chart loading", not a
 *  blank rectangle. */
export function SkeletonChart({ bars = false, height = 140, className }: { bars?: boolean; height?: number; className?: string }) {
  return (
    <div className={cn("space-y-4 rounded-2xl bg-card p-4", className)}>
      <div className="flex items-center gap-2.5">
        <Skeleton className="size-8 rounded-xl" />
        <div className="flex-1 space-y-1.5">
          <SkeletonLine w="45%" h="text" />
          <SkeletonLine w="30%" h="xs" />
        </div>
      </div>
      {bars ? (
        <div className="flex items-end gap-2" style={{ height }}>
          {[0.5, 0.75, 0.4, 0.9, 0.65, 0.8, 0.55].map((h, i) => (
            <Skeleton key={i} className="flex-1 rounded-lg rounded-b-none" style={{ height: `${h * 100}%` }} />
          ))}
        </div>
      ) : (
        <Skeleton className="w-full rounded-xl" style={{ height }} />
      )}
    </div>
  );
}

/** A list row placeholder — thumbnail + two text lines + trailing pill.
 *  Mirrors the unified ExerciseRow / FoodRow. */
export function SkeletonRow({ thumb = 44, lines = 2, trailing = true, className }: { thumb?: number; lines?: number; trailing?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Skeleton className="shrink-0 rounded-xl" style={{ width: thumb, height: thumb }} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <SkeletonLine w="60%" h="text" />
        {lines > 1 && <SkeletonLine w="40%" h="xs" />}
      </div>
      {trailing && <Skeleton className="h-6 w-12 shrink-0 rounded-full" />}
    </div>
  );
}

/** N list rows, optionally framed in a Card. */
export function SkeletonList({ rows = 4, thumb, card = false, className }: { rows?: number; thumb?: number; card?: boolean; className?: string }) {
  const body = (
    <div className={cn("space-y-3", !card && className)}>
      {Array.from({ length: rows }).map((_, i) => <SkeletonRow key={i} thumb={thumb} />)}
    </div>
  );
  return card ? <div className={cn("rounded-2xl bg-card p-4", className)}>{body}</div> : body;
}

/** A big rounded hero block — for score rings, plan heroes, feature panels.
 *  A soft glyph + title + a couple of stat pills hint at the shape inside. */
export function SkeletonHero({ height = 208, className }: { height?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col justify-between rounded-3xl bg-card p-5", className)} style={{ minHeight: height }}>
      <div className="flex items-center gap-3">
        <SkeletonCircle size={48} />
        <div className="flex-1 space-y-2">
          <SkeletonLine w="45%" h="title" />
          <SkeletonLine w="65%" h="xs" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <SkeletonLine w="70%" h="xs" />
            <SkeletonLine w="50%" h="title" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A section header placeholder — icon badge + title, and an optional action. */
export function SkeletonHeader({ action = false, className }: { action?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <div className="flex items-center gap-2.5">
        <Skeleton className="size-8 rounded-xl" />
        <SkeletonLine w="7rem" h="title" />
      </div>
      {action && <Skeleton className="h-8 w-20 rounded-full" />}
    </div>
  );
}
