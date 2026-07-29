/**
 * Motion COMPONENTS. The values live in `animation.ts` — this file only wraps
 * them in React so screens compose choreography instead of hand-rolling it.
 *
 * The split matters: one file owns every duration, curve and variant (so the
 * product is cohesive by construction), and this one owns the ergonomics.
 */

import { motion, type Variants, type HTMLMotionProps } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  anchorIn,
  atmosphereIn,
  chromeIn,
  contentIn,
  contentStagger,
  fadeUp,
  pressProps,
  prefersReducedMotion,
  stagger,
} from "./animation.js";

export * from "./animation.js";

/** Count a number up from 0 on mount (eased), the way the app animates hero
 *  values. Respects reduced-motion. Re-animates when `value` changes. */
export function CountUp({ value, decimals = 0, prefix = "", suffix = "", durationMs = 850, className }: {
  value: number; decimals?: number; prefix?: string; suffix?: string; durationMs?: number; className?: string;
}) {
  const [n, setN] = useState(value);
  const raf = useRef(0);
  useEffect(() => {
    if (prefersReducedMotion()) { setN(value); return; }
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      setN(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    setN(0);
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, durationMs]);
  const sign = prefix === "+" && n < 0 ? "" : prefix; // don't render "+-3"
  return <span className={className}>{sign}{n.toFixed(decimals)}{suffix}</span>;
}

/**
 * A page wrapper: staggers its content in.
 *
 * For a screen on the four-tier spine, prefer `<Screen>` from `layout.tsx`,
 * which runs the full choreography (atmosphere → anchor → content → chrome).
 * This is the plain container for everything else.
 */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className={className}>
      {children}
    </motion.div>
  );
}

/** A staggered child (use inside <Page> or a `stagger` container). */
export function Stagger({ children, className, ...props }: HTMLMotionProps<"div"> & { children: ReactNode }) {
  return (
    <motion.div variants={fadeUp} className={className} {...props}>
      {children}
    </motion.div>
  );
}

/** T0 — the atmosphere tier. Fades in first, moves never. */
export function TierAtmosphere({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.div variants={atmosphereIn} className={className}>{children}</motion.div>;
}

/** T1 — the anchor tier. Settles down from 1.06. One per screen. */
export function TierAnchor({ children, className, ...props }: HTMLMotionProps<"div"> & { children: ReactNode }) {
  return <motion.div variants={anchorIn} className={className} {...props}>{children}</motion.div>;
}

/** T3 — a content block. Use inside a `contentStagger` container. */
export function TierContent({ children, className, ...props }: HTMLMotionProps<"div"> & { children: ReactNode }) {
  return <motion.div variants={contentIn} className={className} {...props}>{children}</motion.div>;
}

/** The container that staggers T3 blocks in after the anchor. */
export function TierContentGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.div variants={contentStagger} className={className}>{children}</motion.div>;
}

/** T4 — chrome. Always last, fade only. */
export function TierChrome({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.div variants={chromeIn} className={className}>{children}</motion.div>;
}

/**
 * Tap/press feedback wrapper — subtle scale on press.
 *
 * Renders a real <button> as soon as it's interactive. A `motion.div` with an
 * `onClick` is a clickable div: no role, not focusable, and dead to Enter/Space,
 * so it's invisible to keyboard and screen-reader users — the exact trap the
 * accessibility pass just removed from the app, sitting exported from the design
 * system waiting to be reintroduced. Mirrors MetricPill/StatCard in metrics.tsx.
 */
export function Pressable({ children, className, onClick, "aria-label": ariaLabel }: { children: ReactNode; className?: string; onClick?: () => void; "aria-label"?: string }) {
  if (onClick) {
    return (
      <motion.button type="button" onClick={onClick} aria-label={ariaLabel} {...pressProps} className={className}>
        {children}
      </motion.button>
    );
  }
  return (
    <motion.div aria-label={ariaLabel} {...pressProps} className={className}>
      {children}
    </motion.div>
  );
}

export { motion };
export type { Variants };
