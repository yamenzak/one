/**
 * Shared exercise UI bits — the workout-side analog of the food row polish:
 * a thumbnail (real image when the exercise has one, muscle-tinted fallback
 * otherwise) plus muscle/equipment helpers. Reused by the player, the plan
 * builder's picker, and the swap drawer so exercises read consistently
 * everywhere (SPEC §8.3, KOVA.md Part II metric-coding).
 */

import { useEffect, useState, type ReactNode } from "react";
import { Dumbbell, Info, cn } from "@4dl/ui";

// ── Shared frame ticker ──────────────────────────────────────────────────────
// One global interval drives every animated thumbnail in sync, so a whole
// library grid of exercises cross-fades between their start/end frames without
// spawning dozens of timers.
const tickers = new Set<() => void>();
let tickTimer: ReturnType<typeof setInterval> | null = null;

/**
 * ⚠️ This ticker re-renders EVERY animated thumbnail on screen, so its cost is
 * `mounted thumbnails × renders/second` and both halves get large fast: the
 * exercise picker fetches up to 100 rows, and a library grid mounts all of
 * them. At 1.1s that was ~90 component renders a second, forever, on a phone —
 * continuing while the app sat in the background, and never stopping as long as
 * one thumbnail stayed mounted. Coaches reported the exercise screens lagging
 * and needing a refresh.
 *
 * Two bounds, both cheap:
 *
 *   VISIBILITY — a backgrounded tab animates nothing anyone can see. The
 *                interval is torn down on `hidden` and restarted on `visible`,
 *                so a phone with the app in the background does no work at all.
 *   MOTION     — `prefers-reduced-motion` means don't animate. The frames still
 *                render; they just stop cross-fading, which is the correct
 *                reading of the preference and free performance besides.
 *
 * The frame index is module-level rather than per-component state so every
 * thumbnail stays in sync (that was always the point) — but a subscriber that
 * is already showing the current frame does not re-render.
 */
let frame = 0;

function startTicker() {
  if (tickTimer || tickers.size === 0) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  tickTimer = setInterval(() => { frame++; tickers.forEach((f) => f()); }, 1100);
}
function stopTicker() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
}
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") stopTicker();
    else startTicker();
  });
}

function useFrameTick(): number {
  const [i, setI] = useState(frame);
  useEffect(() => {
    // Respect the OS setting: no animation, no timer, no re-renders.
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const bump = () => setI(frame);
    tickers.add(bump);
    startTicker();
    return () => {
      tickers.delete(bump);
      if (tickers.size === 0) stopTicker();
    };
  }, []);
  return i;
}

export interface ExerciseInfo {
  id: string;
  name: string;
  thumb_url?: string | null;
  thumb2_url?: string | null;
  video_url?: string | null;
  muscle_groups?: string | null;
  secondary_muscle_groups?: string | null;
  equipment?: string | null;
  difficulty?: string | null;
  /** push | pull | static */
  force?: string | null;
  /** compound | isolation */
  mechanic?: string | null;
  category?: string | null;
  instructions_md?: string | null;
  /** 0 = archived (soft-deleted). Present on the resolve lane (scope=all). */
  active?: number;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Comma list → trimmed, non-empty parts. */
export const splitList = (s?: string | null): string[] => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
/** Human label for a taxonomy token (e.g. "lower_back" → "Lower back"). */
export const pretty = (m: string): string => cap(m.replace(/_/g, " "));
export const firstMuscle = (e: ExerciseInfo): string | undefined => splitList(e.muscle_groups)[0];

/** Square exercise thumbnail. With two frames (start + end) it cross-fades
 *  between them to animate the movement; otherwise a still image, or a
 *  muscle-tinted glyph when there's no image at all. */
export function ExerciseThumb({ thumb, thumb2, size = 40, className = "" }: { thumb?: string | null; thumb2?: string | null; size?: number; className?: string }) {
  const frames = [thumb, thumb2].filter(Boolean) as string[];
  return (
    <div className={`relative grid shrink-0 place-items-center overflow-hidden rounded-lg bg-activity-soft text-activity ${className}`} style={{ width: size, height: size }}>
      {frames.length > 1 ? <AnimatedFrames frames={frames} /> : frames.length === 1 ? <img src={frames[0]} alt="" className="size-full object-contain" /> : <Dumbbell className="size-1/2" />}
    </div>
  );
}

/** Two stacked frames that cross-fade on the shared tick. */
function AnimatedFrames({ frames }: { frames: string[] }) {
  const tick = useFrameTick();
  const active = tick % frames.length;
  return (
    <>
      {frames.map((f, i) => (
        <img key={i} src={f} alt="" className={cn("absolute inset-0 size-full object-contain transition-opacity duration-700", i === active ? "opacity-100" : "opacity-0")} />
      ))}
    </>
  );
}

/** The muscle · equipment label as a plain string (for composing sub-lines). */
export const metaText = (ex?: ExerciseInfo): string =>
  ex ? [firstMuscle(ex), splitList(ex.equipment)[0]].filter(Boolean).map((b) => pretty(b!)).join(" · ") : "";

/** Small muscle + equipment sub-label ("Chest · Barbell"). */
export function ExerciseMeta({ ex, className = "" }: { ex: ExerciseInfo; className?: string }) {
  const t = metaText(ex);
  if (!t) return null;
  return <span className={className}>{t}</span>;
}

/**
 * The canonical exercise row: thumbnail, name (with an optional ⓘ affordance),
 * and a sub-line that leads with the muscle · equipment meta and appends
 * whatever `sub` you pass (a prescription like "3 × 10 reps", a "2/3 sets"
 * progress, etc.). The tappable content is thumb+text; `trailing` hangs actions
 * or a difficulty badge off the end. Wrap it in the surface's own container
 * (SubCard, Card, a bare list) — the row is the shared, unified part.
 */
export function ExerciseRow({
  ex, name, sub, trailing, info, meta = true, thumbSize = 44, onClick, className,
}: {
  ex?: ExerciseInfo;
  /** Fallback name when `ex` is absent (e.g. an id-only reference). */
  name?: string;
  /** Extra sub-line text, appended after the muscle · equipment meta. */
  sub?: ReactNode;
  /** Actions/badge pinned to the far right. */
  trailing?: ReactNode;
  /** Show the ⓘ info affordance next to the name. */
  info?: boolean;
  /** Lead the sub-line with muscle · equipment (default true). */
  meta?: boolean;
  thumbSize?: number;
  onClick?: () => void;
  className?: string;
}) {
  const label = ex?.name ?? name ?? "Exercise";
  const m = meta ? metaText(ex) : "";
  const Body = (
    <>
      <ExerciseThumb thumb={ex?.thumb_url} thumb2={ex?.thumb2_url} size={thumbSize} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 font-medium"><span className="truncate">{label}</span>{info && <Info className="size-3.5 shrink-0 text-muted-foreground" />}</div>
        {/*
          The PRESCRIPTION never truncates; the muscle/equipment meta does.

          These were concatenated into one truncating line, so a superset slot
          read "Quadriceps · Barbell · 1 × 12 r…" — the part you need mid-set cut
          off, and the part you already know kept whole. Which of the two you can
          afford to lose is not a close call.
        */}
        {(m || sub != null) && (
          <div className="flex min-w-0 items-baseline gap-1 text-sm text-muted-foreground">
            {m && <span className="min-w-0 truncate">{m}</span>}
            {m && sub != null && <span className="shrink-0 text-muted-foreground/50">·</span>}
            {sub != null && <span className="shrink-0">{sub}</span>}
          </div>
        )}
      </div>
    </>
  );
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {onClick ? (
        <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left transition-opacity active:opacity-80">{Body}</button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{Body}</div>
      )}
      {trailing}
    </div>
  );
}
