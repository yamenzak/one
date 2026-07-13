/**
 * Shared exercise UI bits — the workout-side analog of the food row polish:
 * a thumbnail (real image when the exercise has one, muscle-tinted fallback
 * otherwise) plus muscle/equipment helpers. Reused by the player, the plan
 * builder's picker, and the swap drawer so exercises read consistently
 * everywhere (SPEC §8.3, DESIGN.md metric-coding).
 */

import { useEffect, useState } from "react";
import { Dumbbell, cn } from "@mossa/ui";

// ── Shared frame ticker ──────────────────────────────────────────────────────
// One global interval drives every animated thumbnail in sync, so a whole
// library grid of exercises cross-fades between their start/end frames without
// spawning dozens of timers.
const tickers = new Set<() => void>();
let tickTimer: ReturnType<typeof setInterval> | null = null;
function useFrameTick(): number {
  const [i, setI] = useState(0);
  useEffect(() => {
    const bump = () => setI((n) => n + 1);
    tickers.add(bump);
    if (!tickTimer) tickTimer = setInterval(() => tickers.forEach((f) => f()), 1100);
    return () => {
      tickers.delete(bump);
      if (tickers.size === 0 && tickTimer) { clearInterval(tickTimer); tickTimer = null; }
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
      {frames.length > 1 ? <AnimatedFrames frames={frames} /> : frames.length === 1 ? <img src={frames[0]} alt="" className="size-full object-cover" /> : <Dumbbell className="size-1/2" />}
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
        <img key={i} src={f} alt="" className={cn("absolute inset-0 size-full object-cover transition-opacity duration-700", i === active ? "opacity-100" : "opacity-0")} />
      ))}
    </>
  );
}

/** Small muscle + equipment sub-label ("Chest · Barbell"). */
export function ExerciseMeta({ ex, className = "" }: { ex: ExerciseInfo; className?: string }) {
  const bits = [firstMuscle(ex), splitList(ex.equipment)[0]].filter(Boolean).map((b) => pretty(b!));
  if (bits.length === 0) return null;
  return <span className={className}>{bits.join(" · ")}</span>;
}
