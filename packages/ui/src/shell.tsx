/**
 * App shell — AppBar, BottomTabs / NavRail (animated indicator), TimelineFeed /
 * InsightCard, WavyDivider, SettingsList, EmptyState. Icon-based, animated.
 */

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "./lib/utils.js";
import { Sparkles, ThumbsDown, ThumbsUp, type LucideIcon } from "./lib/icons.js";

export interface TabDef {
  key: string;
  label: string;
  icon: LucideIcon;
}

export function AppBar({ leading, title, trailing }: { leading?: ReactNode; title?: ReactNode; trailing?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border/40 bg-background/80 px-4 backdrop-blur-xl">
      <div className="flex min-w-0 flex-1 items-center gap-2">{leading}</div>
      {title && <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-base font-semibold">{title}</div>}
      <div className="flex items-center gap-1.5">{trailing}</div>
    </header>
  );
}

const navSpring = { type: "spring" as const, stiffness: 420, damping: 34 };

export function BottomTabs({ tabs, active, onSelect }: { tabs: TabDef[]; active: string; onSelect: (k: string) => void }) {
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+0.7rem)] md:hidden">
      <div className="pointer-events-auto flex max-w-full items-center gap-0.5 rounded-full border border-border/60 bg-card/75 p-1.5 shadow-[0_10px_30px_-12px_oklch(0_0_0/0.55)] backdrop-blur-2xl">
        {tabs.map((t) => {
          const on = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onSelect(t.key)}
              aria-current={on ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-2 rounded-full px-3.5 py-2.5 transition-colors duration-200",
                on ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {on && <motion.span layoutId="tab-pill" transition={navSpring} className="absolute inset-0 rounded-full bg-primary" />}
              <t.icon className="relative size-[1.25rem]" strokeWidth={on ? 2.4 : 2} />
              {on && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  transition={{ duration: 0.2 }}
                  className="relative overflow-hidden whitespace-nowrap text-sm font-semibold"
                >
                  {t.label}
                </motion.span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function NavRail({ tabs, active, onSelect, footer, brand }: { tabs: TabDef[]; active: string; onSelect: (k: string) => void; footer?: ReactNode; brand?: ReactNode }) {
  return (
    <nav className="fixed inset-y-0 left-0 z-30 hidden w-24 flex-col items-center border-r border-border/40 bg-card/40 py-6 backdrop-blur-xl md:flex">
      <div className="mb-6 grid size-11 place-items-center overflow-hidden rounded-2xl bg-primary text-lg font-black text-primary-foreground">{brand ?? "M"}</div>
      <div className="flex w-full flex-1 flex-col items-center gap-1.5 px-3">
        {tabs.map((t) => {
          const on = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onSelect(t.key)}
              aria-current={on ? "page" : undefined}
              className="group relative flex w-full flex-col items-center gap-1 rounded-2xl py-2.5 transition-colors"
            >
              {on && <motion.span layoutId="rail-pill" transition={navSpring} className="absolute inset-0 rounded-2xl bg-primary/12" />}
              {on && <motion.span layoutId="rail-bar" transition={navSpring} className="absolute -left-3 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-primary" />}
              <t.icon
                className={cn("relative size-[1.35rem] transition-colors", on ? "text-primary" : "text-muted-foreground group-hover:text-foreground")}
                strokeWidth={on ? 2.4 : 2}
              />
              <span className={cn("relative text-[0.66rem] font-medium transition-colors", on ? "text-primary" : "text-muted-foreground group-hover:text-foreground")}>{t.label}</span>
            </button>
          );
        })}
      </div>
      {footer && <div className="mt-auto">{footer}</div>}
    </nav>
  );
}

// ── Timeline feed ────────────────────────────────────────────────────────────
export function InsightCard({ timestamp, title, ai, tone, children, onFeedback }: { timestamp: string; title: string; ai?: boolean; tone?: "default" | "primary"; children?: ReactNode; onFeedback?: (v: 1 | -1) => void }) {
  return (
    <motion.article initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }} className="py-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {ai && <Sparkles className="size-4 text-primary" />}
        <span>{timestamp}</span>
      </div>
      <h3 className={cn("mt-1 text-xl font-semibold tracking-tight", tone === "primary" ? "text-foreground" : "text-foreground")}>{title}</h3>
      {children && <div className="mt-3">{children}</div>}
      {onFeedback && (
        <div className="mt-3 flex items-center gap-1">
          <button onClick={() => onFeedback(1)} className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-success" aria-label="Helpful">
            <ThumbsUp className="size-4" />
          </button>
          <button onClick={() => onFeedback(-1)} className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-danger" aria-label="Not helpful">
            <ThumbsDown className="size-4" />
          </button>
        </div>
      )}
    </motion.article>
  );
}

export function WavyDivider({ label }: { label: string }) {
  const wave = (
    <svg viewBox="0 0 120 8" className="h-2 w-full text-border" preserveAspectRatio="none" aria-hidden>
      <path d="M0 4 Q 7.5 0, 15 4 T 30 4 T 45 4 T 60 4 T 75 4 T 90 4 T 105 4 T 120 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
  return (
    <div className="my-6 flex items-center gap-4">
      <div className="flex-1">{wave}</div>
      <span className="shrink-0 text-sm font-medium text-muted-foreground">{label}</span>
      <div className="flex-1">{wave}</div>
    </div>
  );
}

// ── Settings list ────────────────────────────────────────────────────────────
export interface SettingsRow {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  trailing?: ReactNode;
  destructive?: boolean;
}
export function SettingsList({ sections }: { sections: { header: string; rows: SettingsRow[] }[] }) {
  return (
    <div className="space-y-7">
      {sections.map((s) => (
        <section key={s.header}>
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.header}</h3>
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
            {s.rows.map((r, i) => (
              <button
                key={r.label}
                onClick={r.onClick}
                className={cn("flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-secondary [&_svg]:size-[1.2rem]", i > 0 && "border-t border-border/50", r.destructive ? "text-danger" : "text-foreground")}
              >
                <r.icon className={r.destructive ? "text-danger" : "text-muted-foreground"} />
                <span className="flex-1 font-medium">{r.label}</span>
                {r.trailing}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────
export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-secondary text-muted-foreground [&_svg]:size-7">
        <Icon />
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      {description && <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}
