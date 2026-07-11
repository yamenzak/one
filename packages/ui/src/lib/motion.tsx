/**
 * Motion primitives — shared variants + small wrappers so every screen gets
 * the same tasteful entrance, stagger, and press feedback. Built on `motion`.
 */

import { motion, type Variants, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

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
