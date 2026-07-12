/**
 * AiAnalyzing — a reassuring "the AI is working" state for vision actions
 * (snap-a-meal, nutrition-label reading). A pulsing coach avatar inside a
 * sweeping scan ring, animated dots, and a shimmering skeleton of the result
 * so an upload + model call never reads as a frozen or failed screen.
 */

import { motion } from "motion/react";
import { AiAvatar } from "./AiAvatar.js";

export function AiAnalyzing({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-5 py-6">
      <div className="relative grid size-24 place-items-center">
        {/* Sweeping scan rings */}
        {[0, 1].map((i) => (
          <motion.span
            key={i}
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-primary/40"
            initial={{ scale: 0.7, opacity: 0.6 }}
            animate={{ scale: 1.25, opacity: 0 }}
            transition={{ duration: 1.6, ease: "easeOut", repeat: Infinity, delay: i * 0.8 }}
          />
        ))}
        {/* Rotating conic glow behind the avatar */}
        <motion.span
          aria-hidden
          className="absolute inset-1 rounded-full opacity-60 blur-md"
          style={{ background: "conic-gradient(from 0deg, transparent, var(--color-primary, #a3e635), transparent)" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 2.4, ease: "linear", repeat: Infinity }}
        />
        <motion.div
          className="relative"
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 1.4, ease: "easeInOut", repeat: Infinity }}
        >
          <AiAvatar className="size-16 ring-2 ring-background" />
        </motion.div>
      </div>

      <div className="text-center">
        <div className="flex items-center justify-center gap-1 text-base font-semibold">
          {label}
          <span className="inline-flex">
            {[0, 1, 2].map((i) => (
              <motion.span key={i} animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}>.</motion.span>
            ))}
          </span>
        </div>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      </div>

      {/* Shimmering placeholder rows — hints that a result is on its way. */}
      <div className="w-full space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
            <div className="size-9 shrink-0 overflow-hidden rounded-lg bg-surface-3">
              <motion.div className="size-full bg-gradient-to-r from-transparent via-white/10 to-transparent" animate={{ x: ["-100%", "100%"] }} transition={{ duration: 1.3, ease: "easeInOut", repeat: Infinity, delay: i * 0.15 }} />
            </div>
            <div className="flex-1 space-y-1.5">
              <div className="h-3 overflow-hidden rounded-full bg-surface-3" style={{ width: `${70 - i * 12}%` }}>
                <motion.div className="size-full bg-gradient-to-r from-transparent via-white/10 to-transparent" animate={{ x: ["-100%", "100%"] }} transition={{ duration: 1.3, ease: "easeInOut", repeat: Infinity, delay: i * 0.15 }} />
              </div>
              <div className="h-2.5 w-1/3 rounded-full bg-surface-3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
