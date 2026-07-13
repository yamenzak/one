/**
 * Shared building blocks for the create/edit composers (exercise, food). Keeps
 * the "how do you want to make it" cards and the step transitions consistent
 * and premium — theme-token styled, spring-tapped, cross-faded between steps.
 */

import { motion, AnimatePresence } from "motion/react";
import { cn } from "@mossa/ui";
import type { ReactNode } from "react";

/** Compact icon + label card for choosing a creation mode. */
export function ModeCard({ icon: Icon, label, hint, onClick, disabled, active, busy }: {
  icon: (p: { className?: string }) => ReactNode;
  label: string; hint: string; onClick: () => void;
  disabled?: boolean; active?: boolean; busy?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={cn(
        "flex flex-col items-center gap-1 rounded-2xl border p-3 text-center transition-colors disabled:pointer-events-none disabled:opacity-40",
        active ? "border-primary bg-primary/10 text-primary" : "border-border/60 bg-card hover:bg-surface-2",
      )}
    >
      {busy ? <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon className="size-5" />}
      <span className="text-xs font-semibold leading-tight">{label}</span>
      <span className="text-[0.6rem] leading-tight text-muted-foreground">{hint}</span>
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
