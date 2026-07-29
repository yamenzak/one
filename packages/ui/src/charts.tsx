/**
 * Rich analytics charts for the Progress surfaces — responsive, theme-tokened,
 * animated SVG. Bigger and more capable than the compact metrics.tsx set:
 *
 *  - AreaChart      time series with gridlines, target line, an optional
 *                   moving-average trend, and a touch/mouse crosshair readout.
 *  - BarChart       labelled vertical bars with an optional target line.
 *  - RadarChart     a spider/polygon chart for multi-axis snapshots (wellness).
 *  - CalendarHeatmap a GitHub-style contribution grid keyed by local date.
 *
 * Everything scales to its container width (ResizeObserver) and colours from a
 * single `tone`, so it re-skins with the tenant theme like the rest of the app.
 */

import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { toneVar, toneSoft, type Tone } from "./primitives.js";
import { NoData } from "./metrics.js";
import { cn } from "./lib/utils.js";
import { SPRING_SOFT , DUR} from "./lib/animation.js";

/** Measure a container's width so an SVG viewBox can fill it responsively. */
function useWidth<T extends HTMLElement>(fallback = 320): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(el.clientWidth || fallback);
    set();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, w];
}

const mix = (color: string, pct: number, base = "transparent") => `color-mix(in oklch, ${color} ${pct}%, ${base})`;

// ── AreaChart ────────────────────────────────────────────────────────────────

interface AreaChartProps {
  /** One point per slot; null = a gap (no data that day). */
  values: (number | null)[];
  tone?: Tone;
  height?: number;
  target?: number;
  /** Per-slot target line (stepped) — for a target that changed over time, e.g.
   *  a calorie goal that was superseded. Takes precedence over `target`. */
  targetSeries?: (number | null)[];
  /** Overlay a centred moving-average line (window auto-sized). */
  trend?: boolean;
  /** Number of horizontal gridlines (incl. top/bottom). */
  grid?: number;
  /** Format a y value for axis + crosshair (e.g. units). */
  format?: (v: number) => string;
  /** Label for slot i, shown in the crosshair readout (e.g. a date). */
  label?: (i: number) => string;
  className?: string;
}

/** Centred moving average over present points, preserving null gaps. */
function movingAverage(vals: (number | null)[], win: number): (number | null)[] {
  const half = Math.floor(win / 2);
  return vals.map((v, i) => {
    if (v == null) return null;
    let sum = 0, n = 0;
    for (let j = i - half; j <= i + half; j++) { const x = vals[j]; if (x != null) { sum += x; n++; } }
    return n ? sum / n : null;
  });
}

export function AreaChart({ values, tone = "activity", height = 180, target, targetSeries, trend, grid = 4, format = (v) => `${Math.round(v)}`, label, className }: AreaChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const color = toneVar[tone];
  const padX = 10, padTop = 14, padBot = 22;
  const pts = values.map((v, i) => ({ i, v })).filter((p): p is { i: number; v: number } => p.v != null);

  if (pts.length < 2) return <div ref={ref} className={cn("grid place-items-center rounded-2xl bg-surface-2 text-xs text-muted-foreground", className)} style={{ height }}>Not enough data yet</div>;

  const tPts = targetSeries ? targetSeries.map((v, i) => ({ i, v })).filter((p): p is { i: number; v: number } => p.v != null) : [];
  const present = pts.map((p) => p.v);
  const targetVals = tPts.length ? tPts.map((p) => p.v) : target != null ? [target] : [];
  const lo = Math.min(...present, ...targetVals);
  const hi = Math.max(...present, ...targetVals);
  const span = hi - lo || 1;
  const yLo = lo - span * 0.12, yHi = hi + span * 0.12, yspan = yHi - yLo;
  const n = values.length;
  const x = (i: number) => padX + (n <= 1 ? 0 : (i / (n - 1)) * (width - padX * 2));
  const y = (v: number) => padTop + (1 - (v - yLo) / yspan) * (height - padTop - padBot);

  const linePath = pts.map((p, k) => `${k === 0 ? "M" : "L"} ${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${x(pts[pts.length - 1]!.i).toFixed(1)} ${(height - padBot).toFixed(1)} L ${x(pts[0]!.i).toFixed(1)} ${(height - padBot).toFixed(1)} Z`;
  const trendPts = trend ? movingAverage(values, Math.max(3, Math.round(n / 6))).map((v, i) => ({ i, v })).filter((p): p is { i: number; v: number } => p.v != null) : [];
  const trendPath = trendPts.map((p, k) => `${k === 0 ? "M" : "L"} ${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");

  // Stepped target line: horizontal at the previous target until the goal
  // changes, then a vertical step to the new one.
  const stepPath = tPts.reduce((d, p, k) => {
    if (k === 0) return `M ${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`;
    return `${d} L ${x(p.i).toFixed(1)} ${y(tPts[k - 1]!.v).toFixed(1)} L ${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`;
  }, "");

  const gid = `ac-${tone}`;
  const gridYs = Array.from({ length: grid }, (_, k) => yLo + (yspan * k) / (grid - 1));
  const last = pts[pts.length - 1]!;
  const activePt = active != null ? pts.reduce((best, p) => (Math.abs(p.i - active) < Math.abs(best.i - active) ? p : best), pts[0]!) : last;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * width;
    setActive(Math.round(((rel - padX) / Math.max(1, width - padX * 2)) * (n - 1)));
  };

  return (
    <div ref={ref} className={cn("relative w-full select-none", className)}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onPointerMove={onMove}
        onPointerLeave={() => setActive(null)}
        className="touch-none"
        role="img"
        aria-label={`Trend chart of ${pts.length} points, latest ${format(last.v)}, range ${format(lo)} to ${format(hi)}${target != null ? `, target ${format(target)}` : ""}`}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {gridYs.map((gv, k) => (
          <g key={k}>
            <line x1={padX} x2={width - padX} y1={y(gv)} y2={y(gv)} stroke="var(--border)" strokeWidth={1} opacity={k === 0 ? 0 : 0.5} />
            <text x={0} y={y(gv) - 3} className="fill-muted-foreground" style={{ fontSize: 11 }}>{format(gv)}</text>
          </g>
        ))}
        {stepPath ? (
          <path d={stepPath} fill="none" stroke={color} strokeDasharray="2 5" strokeWidth={1.5} opacity={0.7} strokeLinejoin="round" />
        ) : target != null ? (
          <line x1={padX} x2={width - padX} y1={y(target)} y2={y(target)} stroke={color} strokeDasharray="2 5" strokeWidth={1.5} opacity={0.7} />
        ) : null}
        <path d={areaPath} fill={`url(#${gid})`} />
        <motion.path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: DUR.draw, ease: [0.22, 1, 0.36, 1] }} />
        {trendPath && <path d={trendPath} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="4 4" opacity={0.55} strokeLinecap="round" />}
        {/* crosshair */}
        <line x1={x(activePt.i)} x2={x(activePt.i)} y1={padTop} y2={height - padBot} stroke={color} strokeWidth={1} opacity={active != null ? 0.4 : 0} />
        <circle cx={x(activePt.i)} cy={y(activePt.v)} r={4.5} fill="var(--card)" stroke={color} strokeWidth={2.5} />
      </svg>
      {/* readout — only while the user is scrubbing (header shows the value at rest) */}
      <div className="pointer-events-none absolute left-0 top-0 flex items-center gap-1.5 rounded-lg bg-card/90 px-2 py-1 text-xs shadow-sm backdrop-blur-sm transition-opacity duration-150" style={{ opacity: active != null ? 1 : 0, transform: `translateX(${Math.min(Math.max(0, x(activePt.i) - 30), Math.max(0, width - 92))}px)` }}>
        <span className="numeral font-bold" style={{ color }}>{format(activePt.v)}</span>
        {label && <span className="text-xs text-muted-foreground">{label(activePt.i)}</span>}
      </div>
    </div>
  );
}

// ── BarChart ─────────────────────────────────────────────────────────────────

interface BarChartProps {
  values: number[];
  labels?: string[];
  tone?: Tone;
  height?: number;
  target?: number;
  format?: (v: number) => string;
  className?: string;
}

export function BarChart({ values, labels, tone = "activity", height = 160, target, format = (v) => `${Math.round(v)}`, className }: BarChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const color = toneVar[tone];
  const padBot = labels ? 18 : 6, padTop = 12;
  const max = Math.max(...values, target ?? 0, 1);
  const gap = values.length > 20 ? 2 : 5;
  const bw = (width - gap * (values.length - 1)) / Math.max(1, values.length);
  const barH = (v: number) => (v / max) * (height - padTop - padBot);
  const shown = active != null ? active : values.length - 1;

  return (
    <div ref={ref} className={cn("relative w-full select-none", className)}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="touch-none"
        role="img"
        aria-label={`Bar chart of ${values.length} bars, latest ${format(values[values.length - 1] ?? 0)}, peak ${format(Math.max(...values, 0))}${target != null ? `, target ${format(target)}` : ""}`}
      >
        {target != null && target <= max && <line x1={0} x2={width} y1={padTop + (1 - target / max) * (height - padTop - padBot)} y2={padTop + (1 - target / max) * (height - padTop - padBot)} stroke={color} strokeDasharray="2 5" strokeWidth={1.5} opacity={0.6} />}
        {values.map((v, i) => {
          const h = Math.max(v > 0 ? 3 : 0, barH(v));
          const bx = i * (bw + gap);
          return (
            <motion.rect key={i} x={bx} width={bw} rx={Math.min(bw / 2, 5)} fill={color}
              onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)}
              initial={{ height: 0, y: height - padBot }} animate={{ height: h, y: height - padBot - h }}
              transition={{ delay: Math.min(i * 0.02, 0.3), duration: DUR.slow, ease: [0.22, 1, 0.36, 1] }}
              opacity={i === shown ? 1 : 0.42 + 0.4 * (v / max)} />
          );
        })}
        {labels && labels.map((l, i) => ((values.length <= 8 || i % Math.ceil(values.length / 6) === 0) ? (
          <text key={i} x={i * (bw + gap) + bw / 2} y={height - 5} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 11 }}>{l}</text>
        ) : null))}
      </svg>
      {values.length > 0 && (
        <div className="pointer-events-none absolute right-0 top-0 flex items-baseline gap-1 rounded-lg bg-card/90 px-2 py-1 shadow-sm backdrop-blur-sm transition-opacity duration-150" style={{ opacity: active != null ? 1 : 0 }}>
          <span className="numeral text-xs font-bold" style={{ color }}>{format(values[shown]!)}</span>
          {labels?.[shown] && <span className="text-xs text-muted-foreground">{labels[shown]}</span>}
        </div>
      )}
    </div>
  );
}

// ── RadarChart ───────────────────────────────────────────────────────────────

export interface RadarAxis { label: string; value: number; /** 0..1 */ }

export function RadarChart({ axes, tone = "cardio", size = 220, rings = 3, className }: { axes: RadarAxis[]; tone?: Tone; size?: number; rings?: number; className?: string }) {
  const color = toneVar[tone];
  const cx = size / 2, cy = size / 2;
  const r = size / 2 - 34;
  const N = axes.length;
  const angle = (i: number) => (Math.PI * 2 * i) / N - Math.PI / 2;
  const pt = (i: number, rad: number) => ({ x: cx + Math.cos(angle(i)) * rad, y: cy + Math.sin(angle(i)) * rad });
  const poly = axes.map((a, i) => { const p = pt(i, Math.max(0.04, Math.min(1, a.value)) * r); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(" ");

  // role="img" + a spoken summary: the axis labels inside are 11px SVG text that
  // can't grow without spilling past the chart box, so the accessible reading of
  // the chart has to come from here rather than from the glyphs.
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn("mx-auto", className)}
      role="img" aria-label={`Radar chart: ${axes.map((a) => `${a.label} ${Math.round(Math.max(0, Math.min(1, a.value)) * 100)}%`).join(", ")}`}>
      {Array.from({ length: rings }, (_, k) => {
        const rr = (r * (k + 1)) / rings;
        const ringPoly = axes.map((_, i) => { const p = pt(i, rr); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(" ");
        return <polygon key={k} points={ringPoly} fill="none" stroke="var(--border)" strokeWidth={1} opacity={0.5} />;
      })}
      {axes.map((_, i) => { const p = pt(i, r); return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="var(--border)" strokeWidth={1} opacity={0.4} />; })}
      <motion.polygon points={poly} fill={mix(color, 22)} stroke={color} strokeWidth={2} strokeLinejoin="round"
        initial={{ scale: 0.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING_SOFT} style={{ transformOrigin: "center" }} />
      {axes.map((a, i) => {
        const p = pt(i, r + 16);
        const dot = pt(i, Math.max(0.04, Math.min(1, a.value)) * r);
        return (
          <g key={i}>
            <circle cx={dot.x} cy={dot.y} r={3} fill={color} />
            <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" className="fill-muted-foreground" style={{ fontSize: 11, fontWeight: 600 }}>{a.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── CalendarHeatmap ──────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A Date's LOCAL calendar day as YYYY-MM-DD. */
const localDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** GitHub-style contribution grid. `days` maps YYYY-MM-DD → intensity (0..max);
 *  renders the trailing `weeks` columns ending on `today`. */
export function CalendarHeatmap({ days, today, tone = "activity", weeks = 16, max, legend = true, className }: { days: Record<string, number>; today: string; tone?: Tone; weeks?: number; max?: number; legend?: boolean; className?: string }) {
  const color = toneVar[tone];
  const cell = 13, gap = 3;
  // End on the Sunday of this week so the last column is complete-ish.
  const end = new Date(`${today}T00:00:00`);
  const endCol = new Date(end);
  endCol.setDate(end.getDate() + (6 - ((end.getDay() + 6) % 7))); // this week's Sunday
  const start = new Date(endCol);
  start.setDate(endCol.getDate() - (weeks * 7 - 1));
  const peak = max ?? Math.max(1, ...Object.values(days));
  const level = (v: number) => (v <= 0 ? 0 : Math.min(4, Math.ceil((v / peak) * 4)));
  const fill = (lv: number) => (lv === 0 ? "var(--surface-2)" : mix(color, 22 + lv * 19, "var(--surface-2)"));

  const cols: { date: string; lv: number; future: boolean }[][] = [];
  const monthTicks: { col: number; label: string }[] = [];
  const cur = new Date(start);
  for (let w = 0; w < weeks; w++) {
    const col: { date: string; lv: number; future: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      // Local calendar day, NOT toISOString(): the cursor is local-parsed from
      // `today` (local midnight), which in UTC+3 is 21:00 the PREVIOUS day in
      // UTC — so every cell keyed off the ISO string showed the previous day's
      // count, the tooltip named the wrong date, the "today" ring outlined
      // tomorrow, and tomorrow rendered as a real (non-future) day. Same padding
      // idiom as the app's shiftDay/todayLocal. Never toISOString() for a day key.
      const iso = localDay(cur);
      if (cur.getDate() <= 7 && d === 0) monthTicks.push({ col: w, label: MONTHS[cur.getMonth()]! });
      col.push({ date: iso, lv: level(days[iso] ?? 0), future: iso > today });
      cur.setDate(cur.getDate() + 1);
    }
    cols.push(col);
  }
  const gridW = weeks * (cell + gap);
  const activeDays = cols.reduce((n, col) => n + col.filter((c) => !c.future && c.lv > 0).length, 0);

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <svg width={gridW} height={7 * (cell + gap) + 18} className="min-w-full" role="img" aria-label={`Activity heatmap over ${weeks} weeks, ${activeDays} active days`}>
        {monthTicks.map((m, k) => <text key={k} x={m.col * (cell + gap)} y={9} className="fill-muted-foreground" style={{ fontSize: 10 }}>{m.label}</text>)}
        {cols.map((col, w) => col.map((c, d) => (
          <motion.rect key={c.date} x={w * (cell + gap)} y={14 + d * (cell + gap)} width={cell} height={cell} rx={3}
            fill={c.future ? "transparent" : fill(c.lv)} stroke={c.date === today ? color : "transparent"} strokeWidth={1.5}
            initial={{ opacity: 0 }} animate={{ opacity: c.future ? 0 : 1 }} transition={{ delay: Math.min(w * 0.01, 0.4), duration: DUR.base }}>
            <title>{`${c.date}`}</title>
          </motion.rect>
        )))}
      </svg>
      {legend && (
        <div className="mt-1 flex items-center justify-end gap-1 text-xs text-muted-foreground">
          Less
          {/* design-tokens-exempt: a 10px heatmap legend swatch. Every --radius step is wider than the swatch itself, so a token would render it a circle and destroy the scale it is illustrating. */}
          {[0, 1, 2, 3, 4].map((lv) => <span key={lv} className="inline-block size-2.5 rounded-[3px]" style={{ background: fill(lv) }} />)}
          More
        </div>
      )}
    </div>
  );
}

// ── ChartCard — a titled frame for the charts above ──────────────────────────

export function ChartCard({ title, icon: Icon, tone = "primary", value, unit, delta, action, children, className }: {
  title: string; icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; tone?: Tone;
  /**
   * Three states, deliberately distinct: omit it and the card has no headline
   * number at all; pass `null` and the card says there isn't one yet; pass a
   * value and it's set as a numeral. Never pass a dash — see `NoData` (§5).
   */
  value?: ReactNode; unit?: string; delta?: ReactNode; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <div className={cn("space-y-3 rounded-2xl bg-card p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* Match IconBadge/Badge everywhere else: a pale wash of the tone's OWN
              hue (its `-soft` token), not a mix dominated by the neutral surface —
              that mix let surface-2's hue win, so the wash clashed with the icon. */}
          {Icon && <span className={cn("grid size-8 shrink-0 place-items-center rounded-xl", toneSoft[tone])}><Icon className="size-4" /></span>}
          <div>
            <div className="text-sm font-semibold">{title}</div>
            {value === null && <div className="mt-0.5"><NoData className="text-xs" /></div>}
            {value != null && <div className="numeral text-xl font-bold leading-tight">{value}{unit && <span className="ml-1 text-xs font-medium text-muted-foreground">{unit}</span>}{delta && <span className="ml-2 align-middle text-xs">{delta}</span>}</div>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// Re-export the width hook consumer-side helpers if needed.
export { useWidth as useChartWidth };
