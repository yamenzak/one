/**
 * Shared status primitives (§design-system). These replace the ~4 hand-rolled
 * `StatusDot`s, 2 `StatTile`s and the scattered emerald/amber status pills that
 * used to hardcode palette colours — everything here is token-driven, so it
 * follows the tenant's brand + light/dark automatically.
 */
import type { ReactNode } from "react";
import { Card, cn } from "@4dl/ui";

/** Semantic tones, mapped to the theme's status tokens. */
export type Tone = "success" | "warning" | "info" | "destructive" | "muted" | "primary";

const DOT: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  destructive: "bg-destructive",
  primary: "bg-primary",
  muted: "bg-muted-foreground/50",
};

/** Solid pills — bold, always-readable (token bg + token foreground). */
const PILL_SOLID: Record<Tone, string> = {
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  info: "bg-info text-info-foreground",
  // The comment above says "token bg + token foreground"; this row said `white`.
  destructive: "bg-destructive text-destructive-foreground",
  primary: "bg-primary text-primary-foreground",
  muted: "bg-muted text-muted-foreground",
};

/** Soft pills — subtle tinted surface + coloured text (the default status look). */
const PILL_SOFT: Record<Tone, string> = {
  success: "bg-success/12 text-success",
  warning: "bg-warning/15 text-warning",
  info: "bg-info/12 text-info",
  destructive: "bg-destructive/12 text-destructive",
  primary: "bg-primary/12 text-primary",
  muted: "bg-muted text-muted-foreground",
};

/** A small status dot, optionally pinging (live/online). */
export function StatusDot({ tone = "muted", ping = false, className }: { tone?: Tone; ping?: boolean; className?: string }) {
  return (
    <span className={cn("relative inline-flex size-2 shrink-0 rounded-full", DOT[tone], className)}>
      {ping && <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60", DOT[tone])} aria-hidden />}
    </span>
  );
}

/** A rounded status pill. Soft (tinted) by default; `solid` for bold emphasis. */
export function Pill({ tone = "muted", solid = false, children, className }: { tone?: Tone; solid?: boolean; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-medium whitespace-nowrap",
        (solid ? PILL_SOLID : PILL_SOFT)[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A labelled metric card (KPI tile) — the shared version of the per-page copies. */
export function StatTile({
  label,
  value,
  dot,
  valueClassName,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  dot?: ReactNode;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <div className="flex items-center gap-1.5 text-micro uppercase text-muted-foreground">
        {dot}
        {label}
      </div>
      <div className={cn("mt-1.5 font-mono text-title-2 font-semibold tabular-nums", valueClassName)}>{value}</div>
    </Card>
  );
}
