/**
 * MetricPill, StatCard, Sparkline, MiniBars, WeekDots — the fitness viz set.
 * Theme-driven, animated, icon-based (no emoji).
 */

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "./lib/utils.js";
import { Badge, toneSoft, toneText, toneVar, type Tone } from "./primitives.js";
import { Check, Minus, TrendingDown, TrendingUp, type LucideIcon } from "./lib/icons.js";
import { SPRING_SNAP , DUR} from "./lib/animation.js";

interface MetricPillProps {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  /**
   * The unit, rendered subordinate to the value (§5).
   *
   * It exists because the alternative was being used: widgets were putting the
   * unit in the LABEL — `label="Weight 7d kg"` with `value="-0.5"` — which is
   * §5 exactly backwards, and it made the label the longest text on a 1×1 card.
   */
  unit?: string;
  tone?: Tone;
  progress?: number; // 0..1 two-tone fill
  onClick?: () => void;
  className?: string;
}

/**
 * "There is nothing to show here yet." UI-LANGUAGE §5.
 *
 * **Never render a dash as a value.** An em-dash set at a numeral size — 26px
 * bold in a `StatCard`, 40px in a ring — stops reading as punctuation and starts
 * reading as a horizontal RULE, so a card with no data looks like a card with a
 * divider stuck in the middle of it. Four of them in a grid look like a broken
 * layout. Words at a subordinate size say the same thing, and they are the only
 * version a screen reader can convey at all.
 *
 * Every value-bearing component here renders this automatically when its `value`
 * is `null`/`undefined`, so the correct call is to pass `null` rather than a
 * placeholder string. `0` is a real number and is never treated as absent.
 */
export function NoData({ children = "No data yet", className }: { children?: ReactNode; className?: string }) {
  return <span className={cn("text-sm font-medium text-muted-foreground", className)}>{children}</span>;
}

/** True when a value slot should render `NoData` rather than a numeral. */
export const isBlank = (v: ReactNode): boolean => v === null || v === undefined || v === "";

/**
 * A CHANGE — its size, its direction, and whether that direction is good.
 *
 * Every screen that shows two versions of a number ends up hand-rolling this,
 * and the hand-rolled ones disagree on all three decisions at once: some print
 * `+300` and some `↑ 300`; some colour every rise green even when the number is
 * body-fat; and every one of them renders `+0` when nothing moved, which is a
 * badge saying "look at this" attached to the news that there is nothing to
 * look at.
 *
 * So the direction is an ICON (a sign glyph at caption size is one pixel wide
 * and disappears next to a numeral), the tone comes from `goodWhen` rather than
 * from the sign, and zero says so in words.
 *
 * `goodWhen` DEFAULTS to "any" — neutral. Most changes a product shows are not
 * an improvement or a regression, they are just different, and a component that
 * guessed would be confidently wrong half the time. Pass it only where the
 * product genuinely knows.
 */
export function Delta({ value, format = (v) => String(Math.round(v)), unit, goodWhen = "any", zeroLabel = "No change", className }: {
  value: number;
  /** Receives the ABSOLUTE change — the sign is the component's to draw. */
  format?: (abs: number) => string;
  unit?: string;
  goodWhen?: "up" | "down" | "any";
  zeroLabel?: string;
  className?: string;
}) {
  if (!Number.isFinite(value) || Math.round(value) === 0) {
    return <Badge tone="neutral" className={className}><Minus aria-hidden className="size-3" />{zeroLabel}</Badge>;
  }
  const up = value > 0;
  const tone: Tone = goodWhen === "any" ? "neutral" : up === (goodWhen === "up") ? "success" : "warning";
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <Badge tone={tone} className={cn("numeral", className)}>
      <Icon aria-hidden className="size-3" />
      <span className="sr-only">{up ? "up by" : "down by"} </span>
      {format(Math.abs(value))}{unit ? ` ${unit}` : ""}
    </Badge>
  );
}

/** A bare, uppercase section label (optional trailing action) — the flow device
 *  that keeps a page from reading as one long stack of cards. Pair with a
 *  `<section className="space-y-2">` wrapper around the grouped content. */
export function Eyebrow({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between px-1", className)}>
      <h2 className="text-micro uppercase text-muted-foreground">{children}</h2>
      {action}
    </div>
  );
}

/**
 * A card-less stat strip: icon + big numeral + label per item, split by hairline
 * dividers. A deliberate break from the boxed-card rhythm — use for a quick "at
 * a glance" row that shouldn't compete with the real cards.
 *
 * **Two or more, and three is the shape it was drawn for.** A strip is a
 * COMPARISON; with one item it is just a 24px/700 value centred on the page,
 * which is a hero — and a second hero on a screen that already has an anchor
 * (§1). One value is a `Row`. Same reasoning as `ActionCluster`'s floor, and it
 * shipped on coach Business before anyone noticed.
 */
export function GlanceStrip({ items, className }: { items: { icon: LucideIcon; tone: Tone; value: ReactNode; label: ReactNode }[]; className?: string }) {
  if (items.length === 1) {
    console.warn("GlanceStrip: 1 item. A strip is a comparison — one value is a `Row`. (UI-LANGUAGE §1)");
  }
  return (
    <div className={cn("flex items-stretch divide-x divide-border/50", className)}>
      {items.map((it, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1.5 px-2 text-center">
          <it.icon className="size-4 shrink-0" style={{ color: toneVar[it.tone] }} />
          {isBlank(it.value)
            ? <NoData className="text-xs leading-none">Not yet</NoData>
            : <span className="numeral text-2xl font-bold leading-none">{it.value}</span>}
          <span className="text-xs font-medium leading-tight text-muted-foreground">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

export function MetricPill({ icon: Icon, label, value, unit, tone = "activity", progress, onClick, className }: MetricPillProps) {
  const pct = progress === undefined ? null : Math.min(1, Math.max(0, progress));
  const Comp = onClick ? motion.button : motion.div;
  return (
    <Comp
      onClick={onClick}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      className={cn("relative flex w-full items-center gap-3 overflow-hidden rounded-2xl p-3 text-left", toneSoft[tone], className)}
    >
      {pct !== null && (
        <motion.span aria-hidden className="absolute inset-y-0 left-0 rounded-2xl bg-current opacity-[0.12]" initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={{ duration: DUR.draw, ease: [0.22, 1, 0.36, 1] }} />
      )}
      <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-current/15 [&_svg]:size-[1.15rem]">
        <Icon style={{ color: toneVar[tone] }} />
      </span>
      <span className="relative min-w-0">
        <span className="block truncate text-xs font-medium opacity-80">{label}</span>
        {isBlank(value)
          ? <NoData className="block text-xs opacity-80" />
          : (
            <span className="numeral block text-lg font-bold leading-tight">
              {value}
              {unit && <span className="ml-0.5 text-[0.72em] font-semibold opacity-70">{unit}</span>}
            </span>
          )}
      </span>
    </Comp>
  );
}

interface StatCardProps {
  label: string;
  /** Pass `null` when there is nothing to show — never a dash (see `NoData`). */
  value: ReactNode;
  /** Overrides the "No data yet" phrase when `value` is blank. */
  emptyText?: string;
  unit?: string;
  badge?: ReactNode;
  chart?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  onClick?: () => void;
  className?: string;
  /** Chart below the value (full card width) instead of beside it — for
   *  narrow / 2-up grid cards where a side chart would collide. */
  stack?: boolean;
}

export function StatCard({ label, value, emptyText, unit, badge, chart, icon: Icon, tone = "primary", onClick, className, stack }: StatCardProps) {
  const Comp = onClick ? motion.button : motion.div;
  const head = (
    <div className="min-w-0">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {Icon && <Icon className="size-4 shrink-0" style={{ color: toneVar[tone] }} />}
        <span className="truncate">{label}</span>
      </div>
      <div className={cn("mt-1.5 leading-none", isBlank(value) ? "pt-1" : cn("numeral", stack ? "text-title-2" : "text-title-1"))}>
        {isBlank(value) ? (
          <NoData>{emptyText}</NoData>
        ) : (
          <>
            {value}
            {unit && <span className="ml-1 text-base font-medium text-muted-foreground">{unit}</span>}
          </>
        )}
      </div>
      {badge && <div className={stack ? "mt-2" : "mt-3"}>{badge}</div>}
    </div>
  );
  if (stack) {
    return (
      <Comp onClick={onClick} whileTap={onClick ? { scale: 0.99 } : undefined} className={cn("flex w-full flex-col gap-3 rounded-2xl bg-card p-4 text-left", className)}>
        {head}
        {chart && <div className="w-full overflow-hidden">{chart}</div>}
      </Comp>
    );
  }
  return (
    <Comp onClick={onClick} whileTap={onClick ? { scale: 0.99 } : undefined} className={cn("flex w-full items-center justify-between gap-4 rounded-2xl bg-card p-5 text-left", className)}>
      {head}
      {chart && <div className="shrink-0">{chart}</div>}
    </Comp>
  );
}

// ── Metric coding: consistent chip + macro breakdown ────────────────────────

/** A small metric chip — icon + value in the metric's canonical color. */
export function Sparkline({ values, width = 120, height = 52, tone = "activity", target, className }: { values: number[]; width?: number; height?: number; tone?: Tone; target?: number; className?: string }) {
  if (values.length < 2) return null;
  const all = target !== undefined ? [...values, target] : values;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const pad = 6;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ");
  const area = `${line} L ${x(values.length - 1)} ${height} L ${x(0)} ${height} Z`;
  const color = toneVar[tone];
  const gid = `sl-${tone}-${width}`;
  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      {target !== undefined && <line x1={pad} x2={width - pad} y1={y(target)} y2={y(target)} stroke={color} strokeDasharray="2 5" strokeWidth={1.5} opacity={0.6} />}
      <motion.path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: DUR.draw, ease: "easeOut" }} />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1]!)} r={3.5} fill={color} />
    </svg>
  );
}

// ── MiniBars ─────────────────────────────────────────────────────────────────
export function MiniBars({ values, width = 130, height = 52, tone = "activity", target }: { values: number[]; width?: number; height?: number; tone?: Tone; target?: number }) {
  const max = Math.max(...values, target ?? 0, 1);
  const gap = 4;
  const bw = (width - gap * (values.length - 1)) / values.length;
  const color = toneVar[tone];
  return (
    <svg width={width} height={height} aria-hidden>
      {values.map((v, i) => {
        const h = (v / max) * (height - 4);
        return <motion.rect key={i} x={i * (bw + gap)} width={bw} rx={bw / 2} fill={color} initial={{ height: 0, y: height }} animate={{ height: Math.max(3, h), y: height - Math.max(3, h) }} transition={{ delay: i * 0.03, duration: DUR.slow }} opacity={0.55 + 0.45 * (v / max)} />;
      })}
    </svg>
  );
}

// ── Meter ────────────────────────────────────────────────────────────────────

/**
 * ONE VALUE'S SHARE OF A WHOLE, AS A HORIZONTAL BAR.
 *
 * The most re-invented shape in the product: seven hand-rolled copies across
 * five screens — the coach's most-active clients, AI spend by feature, personal
 * records in two places, fasting zones, wellness pillars, the storage meter.
 * Every one was the same two divs, and they had already drifted: three
 * transition durations (500 / 700 / none), two heights, two floors (`max(6, …)`
 * on some, a raw percentage on others, so a 1% value was invisible on half of
 * them and a stub on the rest), and one that reached for `bg-danger` classes
 * where its siblings used `toneVar`.
 *
 * Not a `ProgressRing`: a ring is ONE value against its target and earns the
 * space. A meter is a value in a LIST of values, where what is being read is the
 * comparison between the rows, and a column of rings is unreadable.
 *
 * The label line is optional because two of the seven have no room for one —
 * the fasting strip labels below the bar, the PR list labels above it with a
 * thumbnail the bar has to clear. Those pass the bar alone and keep their own
 * heading.
 */
export function Meter({
  value,
  max = 1,
  label,
  valueLabel,
  tone = "activity",
  size = "sm",
  className,
}: {
  /** The filled amount, in the same unit as `max`. */
  value: number;
  /** The whole. Defaults to 1, so a 0..1 fraction can be passed as-is. */
  max?: number;
  /** Left of the label line. Omit for a bare bar. */
  label?: ReactNode;
  /** Right of the label line — the number, already formatted. */
  valueLabel?: ReactNode;
  tone?: Tone;
  /** `sm` 6px (in a list) · `md` 8px (on its own, as a single meter). */
  size?: "sm" | "md";
  className?: string;
}) {
  const frac = max > 0 && Number.isFinite(value) ? Math.min(1, Math.max(0, value / max)) : 0;
  /*
    A NON-ZERO VALUE ALWAYS DRAWS SOMETHING, AND A ZERO NEVER DOES.

    The floor was `Math.max(6, pct)` at four call sites and absent at three, so
    the same 0.4% either showed a stub or nothing depending on the screen. Worse,
    an unconditional floor draws a bar for a REAL zero — "0 credits spent" with a
    visible sliver is a lie about the only value that matters here.
  */
  const pct = frac === 0 ? 0 : Math.max(3, frac * 100);
  const hasLine = label != null || valueLabel != null;
  return (
    <div className={cn("min-w-0", className)}>
      {hasLine && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="min-w-0 truncate">{label}</span>
          {valueLabel != null && <span className="numeral shrink-0 text-muted-foreground">{valueLabel}</span>}
        </div>
      )}
      <div
        role="img"
        aria-label={typeof label === "string" ? `${label}: ${Math.round(frac * 100)}%` : `${Math.round(frac * 100)}%`}
        className={cn("overflow-hidden rounded-full bg-surface-2", size === "md" ? "h-2" : "h-1.5", hasLine && "mt-1")}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: toneVar[tone] }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: DUR.draw, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

// ── WeekDots ─────────────────────────────────────────────────────────────────
const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function WeekDots({ days, todayIndex, tone = "activity", className, fill }: { days: boolean[]; todayIndex?: number; tone?: Tone; className?: string; fill?: boolean }) {
  // Seven duplicated single letters ("M T W T F S S") read out one by one are
  // noise, and the tick/blank dots convey nothing at all to a screen reader — so
  // the group speaks the week as one sentence and the glyphs are hidden. The
  // letters themselves now sit at the 12px floor (UI-LANGUAGE.md §5 — the type scale's floor); they were
  // 8.8–10.4px, the smallest text in the app.
  const doneNames = DAY_NAMES.filter((_, i) => days[i]);
  const groupLabel = `Week: ${doneNames.length ? `${doneNames.join(", ")} complete` : "no days complete yet"}${todayIndex != null && DAY_NAMES[todayIndex] ? `. Today is ${DAY_NAMES[todayIndex]}` : ""}`;
  return (
    <div role="img" aria-label={groupLabel} className={cn(fill ? "flex w-full items-center justify-between" : "flex items-center gap-1.5", className)}>
      {DAY_LETTERS.map((letter, i) => (
        <div key={i} aria-hidden className="flex flex-col items-center gap-1">
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ ...SPRING_SNAP, delay: i * 0.03 }}
            className={cn("grid place-items-center rounded-full [&_svg]:size-3", fill ? "size-[1.15rem]" : "size-7", days[i] ? toneSoft[tone] : "bg-surface-2 text-muted-foreground/40")}
          >
            {days[i] ? <Check strokeWidth={3} /> : ""}
          </motion.span>
          <span className={cn("text-xs leading-none", i === todayIndex ? "font-bold text-foreground" : "text-muted-foreground")}>{letter}</span>
        </div>
      ))}
    </div>
  );
}
