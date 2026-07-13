/**
 * Shared building blocks for the create/edit composers (exercise, food). Keeps
 * the "how do you want to make it" cards and the step transitions consistent
 * and premium — theme-token styled, spring-tapped, cross-faded between steps.
 */

import { motion, AnimatePresence } from "motion/react";
import { cn, toneSoft, Check, type Tone } from "@mossa/ui";
import type { ReactNode } from "react";

/**
 * A creation-mode card: an accent-tinted icon tile over a label + hint. Reads
 * as one of the app's premium tone tiles, with a spring tap, a soft lift on
 * hover, and an inset ring + check when it's the active (toggled) choice.
 */
export function ModeCard({ icon: Icon, label, hint, onClick, disabled, active, busy, tone = "primary" }: {
  icon: (p: { className?: string }) => ReactNode;
  label: string; hint: string; onClick: () => void;
  disabled?: boolean; active?: boolean; busy?: boolean; tone?: Tone;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={cn(
        "group relative flex flex-col items-center gap-2 overflow-hidden rounded-2xl border p-3.5 text-center transition-colors disabled:pointer-events-none disabled:opacity-40",
        active
          ? "border-primary bg-primary/[0.06] ring-1 ring-inset ring-primary/35"
          : "border-border/60 bg-card hover:border-border hover:bg-surface-2",
      )}
    >
      {active && (
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 600, damping: 24 }}
          className="absolute right-2 top-2 grid size-4 place-items-center rounded-full bg-primary text-primary-foreground [&_svg]:size-3"
        >
          <Check strokeWidth={3} />
        </motion.span>
      )}
      <span className={cn("grid size-10 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-105 group-active:scale-95 [&_svg]:size-[1.15rem]", toneSoft[tone])}>
        {busy ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon />}
      </span>
      <span className="text-[0.8rem] font-semibold leading-tight text-foreground">{label}</span>
      <span className="text-[0.64rem] leading-tight text-muted-foreground">{hint}</span>
    </motion.button>
  );
}

/** Cross-fade + slide between composer steps. `stepKey` drives the transition. */
export function StepFade({ stepKey, children }: { stepKey: string; children: ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={stepKey}
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -12 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
