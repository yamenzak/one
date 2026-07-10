/**
 * Activity + calorie math (SPEC §8.6) — pure.
 *
 * Free-form activities: kcal = MET × kg × hours × HR-intensity factor.
 * Resistance-session burn: time-weighted MET buckets from effort/RPE.
 * MET values from the Compendium of Physical Activities (Ainsworth).
 */

export interface ActivityDef {
  key: string;
  label: string;
  met: number;
}

export const ACTIVITIES: ActivityDef[] = [
  { key: "walking", label: "Walking", met: 3.5 },
  { key: "running", label: "Running", met: 9.8 },
  { key: "jogging", label: "Jogging", met: 7.0 },
  { key: "cycling", label: "Cycling", met: 7.5 },
  { key: "swimming", label: "Swimming", met: 6.0 },
  { key: "hiking", label: "Hiking", met: 6.0 },
  { key: "yoga", label: "Yoga", met: 2.5 },
  { key: "pilates", label: "Pilates", met: 3.0 },
  { key: "football", label: "Football", met: 7.0 },
  { key: "basketball", label: "Basketball", met: 6.5 },
  { key: "tennis", label: "Tennis", met: 7.3 },
  { key: "padel", label: "Padel", met: 7.0 },
  { key: "badminton", label: "Badminton", met: 5.5 },
  { key: "squash", label: "Squash", met: 7.3 },
  { key: "volleyball", label: "Volleyball", met: 4.0 },
  { key: "dancing", label: "Dancing", met: 5.0 },
  { key: "boxing", label: "Boxing", met: 9.0 },
  { key: "martial_arts", label: "Martial arts", met: 10.3 },
  { key: "rowing", label: "Rowing", met: 7.0 },
  { key: "elliptical", label: "Elliptical", met: 5.0 },
  { key: "hiit", label: "HIIT", met: 8.0 },
  { key: "weightlifting", label: "Weightlifting", met: 3.5 },
  { key: "stretching", label: "Stretching", met: 2.3 },
  { key: "other", label: "Other", met: 4.0 },
];

export const activityByKey = (key: string): ActivityDef =>
  ACTIVITIES.find((a) => a.key === key) ?? ACTIVITIES[ACTIVITIES.length - 1]!;

/** Heart-rate intensity factor bands (avg bpm). */
export function hrFactor(avgHrBpm?: number | null): number {
  if (!avgHrBpm || avgHrBpm <= 0) return 1;
  if (avgHrBpm < 110) return 0.85;
  if (avgHrBpm < 130) return 1.0;
  if (avgHrBpm < 150) return 1.15;
  if (avgHrBpm < 170) return 1.3;
  return 1.45;
}

export function estimateBurnedCalories(input: {
  met: number;
  weightKg: number;
  durationMin: number;
  avgHrBpm?: number | null;
}): number {
  if (!(input.met > 0) || !(input.weightKg > 0) || !(input.durationMin > 0)) return 0;
  return Math.round(input.met * input.weightKg * (input.durationMin / 60) * hrFactor(input.avgHrBpm));
}

/** One logged resistance set, as far as burn/load math cares. */
export interface LoggedSetLike {
  reps?: number | null;
  weightKg?: number | null;
  durationSeconds?: number | null;
  rpe?: number | null;
  effortLabel?: "easy" | "perfect" | "hard" | null;
  completed?: boolean | null;
}

type Bucket = "easy" | "moderate" | "hard";

function bucketForSet(s: LoggedSetLike): Bucket {
  if (s.effortLabel === "easy" || (s.rpe != null && s.rpe <= 6)) return "easy";
  if (s.effortLabel === "hard" || (s.rpe != null && s.rpe >= 9)) return "hard";
  return "moderate";
}

const SET_MET: Record<Bucket, number> = { easy: 3.5, moderate: 5.0, hard: 6.5 };
const SET_REST_SEC: Record<Bucket, number> = { easy: 45, moderate: 75, hard: 120 };

/**
 * Estimate kcal burned across a logged resistance session: per-set work time
 * (duration, else reps×3s) + bucketed rest, time-weighted MET average.
 * Null when there's no bodyweight or no usable sets.
 */
export function estimateWorkoutBurn(
  sets: LoggedSetLike[],
  bodyweightKg?: number | null,
): { kcal: number; minutes: number; setCount: number } | null {
  if (!bodyweightKg || bodyweightKg <= 0) return null;
  let weightedMet = 0;
  let totalSec = 0;
  let setCount = 0;
  for (const s of sets) {
    if (s.completed === false) continue;
    const work = s.durationSeconds && s.durationSeconds > 0 ? s.durationSeconds : (s.reps ?? 0) * 3;
    if (work <= 0) continue;
    const bucket = bucketForSet(s);
    const span = work + SET_REST_SEC[bucket];
    weightedMet += SET_MET[bucket] * span;
    totalSec += span;
    setCount++;
  }
  if (setCount === 0 || totalSec === 0) return null;
  const avgMet = weightedMet / totalSec;
  const kcal = Math.round(avgMet * bodyweightKg * (totalSec / 3600));
  return { kcal, minutes: Math.round(totalSec / 60), setCount };
}
