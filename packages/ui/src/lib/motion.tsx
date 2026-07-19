/**
 * Motion primitives — shared variants + small wrappers so every screen gets
 * the same tasteful entrance, stagger, and press feedback. Built on `motion`.
 */

import { motion, type Variants, type HTMLMotionProps } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Count a number up from 0 on mount (eased), the way the app animates hero
 *  values. Respects reduced-motion. Re-animates when `value` changes. */
export function CountUp({ value, decimals = 0, prefix = "", suffix = "", durationMs = 850, className }: {
  value: number; decimals?: number; prefix?: string; suffix?: string; durationMs?: number; className?: string;
}) {
  const [n, setN] = useState(value);
  const raf = useRef(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setN(value); return; }
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

/** Fade + rise, used for page/section entrances. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};

/** Container that staggers its children in. */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.02 } },
};

/** Springy scale-in, for cards/tiles. */
export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 320, damping: 26 } },
};

/** A page wrapper: fades its content up on mount. */
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

/** Tap/press feedback wrapper — subtle scale on press. */
export function Pressable({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <motion.div whileTap={{ scale: 0.97 }} className={className} onClick={onClick}>
      {children}
    </motion.div>
  );
}

export { motion };
export type { Variants };
