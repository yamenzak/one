/**
 * Shared exercise UI bits — the workout-side analog of the food row polish:
 * a thumbnail (real image when the exercise has one, muscle-tinted fallback
 * otherwise) plus muscle/equipment helpers. Reused by the player, the plan
 * builder's picker, and the swap drawer so exercises read consistently
 * everywhere (SPEC §8.3, DESIGN.md metric-coding).
 */

import { Dumbbell } from "@mossa/ui";

export interface ExerciseInfo {
  id: string;
  name: string;
  thumb_url?: string | null;
  thumb2_url?: string | null;
  muscle_groups?: string | null;
  secondary_muscle_groups?: string | null;
  equipment?: string | null;
  difficulty?: string | null;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Comma list → trimmed, non-empty parts. */
export const splitList = (s?: string | null): string[] => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
/** Human label for a taxonomy token (e.g. "lower_back" → "Lower back"). */
export const pretty = (m: string): string => cap(m.replace(/_/g, " "));
export const firstMuscle = (e: ExerciseInfo): string | undefined => splitList(e.muscle_groups)[0];

/** Square exercise thumbnail: image if present, else a muscle-tinted glyph. */
export function ExerciseThumb({ thumb, size = 40, className = "" }: { thumb?: string | null; size?: number; className?: string }) {
  return (
    <div className={`grid shrink-0 place-items-center overflow-hidden rounded-lg bg-activity-soft text-activity ${className}`} style={{ width: size, height: size }}>
      {thumb ? <img src={thumb} alt="" className="size-full object-cover" /> : <Dumbbell className="size-1/2" />}
    </div>
  );
}

/** Small muscle + equipment sub-label ("Chest · Barbell"). */
export function ExerciseMeta({ ex, className = "" }: { ex: ExerciseInfo; className?: string }) {
  const bits = [firstMuscle(ex), splitList(ex.equipment)[0]].filter(Boolean).map((b) => pretty(b!));
  if (bits.length === 0) return null;
  return <span className={className}>{bits.join(" · ")}</span>;
}
