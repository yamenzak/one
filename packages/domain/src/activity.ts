/**
 * Activity + calorie math (SPEC §8.6) — pure.
 *
 * Free-form activities: kcal = MET × kg × hours × HR-intensity factor.
 * Resistance-session burn: time-weighted MET buckets from effort/RPE.
 * MET values from the Compendium of Physical Activities (Ainsworth).
 */

/** Grouping for the activity picker (drives sections + a category fallback icon
 *  in the app). Kept coarse so the list stays browsable. */
export type ActivityCategory = "cardio" | "strength" | "sport" | "water" | "studio" | "combat" | "winter" | "other";

export const ACTIVITY_CATEGORY_META: { key: ActivityCategory; label: string }[] = [
  { key: "cardio", label: "Cardio" },
  { key: "strength", label: "Strength & calisthenics" },
  { key: "sport", label: "Sports" },
  { key: "water", label: "Water" },
  { key: "studio", label: "Studio & mind-body" },
  { key: "combat", label: "Combat" },
  { key: "winter", label: "Winter" },
  { key: "other", label: "Other" },
];

export interface ActivityDef {
  key: string;
  label: string;
  met: number;
  category: ActivityCategory;
}

/**
 * The activity catalog — key/label/MET/category. MET values from the Compendium
 * of Physical Activities (Ainsworth). Existing keys are kept stable so already-
 * logged rows still resolve. Bodyweight moves (push-ups, pull-ups…) live here as
 * DURATION-based activities for quick casual logging; the exercise library still
 * holds their rep-based counterparts for structured plans. `other` stays LAST —
 * `activityByKey` falls back to it.
 */
export const ACTIVITIES: ActivityDef[] = [
  // Cardio
  { key: "walking", label: "Walking", met: 3.5, category: "cardio" },
  { key: "brisk_walking", label: "Brisk walking", met: 4.3, category: "cardio" },
  { key: "running", label: "Running", met: 9.8, category: "cardio" },
  { key: "jogging", label: "Jogging", met: 7.0, category: "cardio" },
  { key: "treadmill", label: "Treadmill", met: 8.0, category: "cardio" },
  { key: "cycling", label: "Cycling", met: 7.5, category: "cardio" },
  { key: "spinning", label: "Spin class", met: 8.5, category: "cardio" },
  { key: "elliptical", label: "Elliptical", met: 5.0, category: "cardio" },
  { key: "rowing", label: "Rowing", met: 7.0, category: "cardio" },
  { key: "stair_climbing", label: "Stair climbing", met: 8.0, category: "cardio" },
  { key: "jump_rope", label: "Jump rope", met: 11.0, category: "cardio" },
  { key: "hiking", label: "Hiking", met: 6.0, category: "cardio" },
  // Strength & calisthenics
  { key: "push_ups", label: "Push-ups", met: 8.0, category: "strength" },
  { key: "pull_ups", label: "Pull-ups", met: 8.0, category: "strength" },
  { key: "dips", label: "Dips", met: 8.0, category: "strength" },
  { key: "burpees", label: "Burpees", met: 8.0, category: "strength" },
  { key: "calisthenics", label: "Calisthenics", met: 5.0, category: "strength" },
  { key: "core_abs", label: "Core & abs", met: 3.8, category: "strength" },
  { key: "kettlebell", label: "Kettlebell", met: 9.8, category: "strength" },
  { key: "crossfit", label: "CrossFit", met: 8.0, category: "strength" },
  { key: "circuit_training", label: "Circuit training", met: 7.0, category: "strength" },
  { key: "hiit", label: "HIIT", met: 8.0, category: "strength" },
  { key: "weightlifting", label: "Weightlifting", met: 3.5, category: "strength" },
  // Sports
  { key: "football", label: "Football", met: 7.0, category: "sport" },
  { key: "basketball", label: "Basketball", met: 6.5, category: "sport" },
  { key: "tennis", label: "Tennis", met: 7.3, category: "sport" },
  { key: "padel", label: "Padel", met: 7.0, category: "sport" },
  { key: "badminton", label: "Badminton", met: 5.5, category: "sport" },
  { key: "squash", label: "Squash", met: 7.3, category: "sport" },
  { key: "volleyball", label: "Volleyball", met: 4.0, category: "sport" },
  { key: "table_tennis", label: "Table tennis", met: 4.0, category: "sport" },
  { key: "golf", label: "Golf", met: 4.8, category: "sport" },
  { key: "cricket", label: "Cricket", met: 5.0, category: "sport" },
  { key: "rugby", label: "Rugby", met: 8.3, category: "sport" },
  { key: "handball", label: "Handball", met: 8.0, category: "sport" },
  { key: "field_hockey", label: "Hockey", met: 7.8, category: "sport" },
  { key: "rock_climbing", label: "Climbing", met: 8.0, category: "sport" },
  { key: "skateboarding", label: "Skateboarding", met: 5.0, category: "sport" },
  // Water
  { key: "swimming", label: "Swimming", met: 6.0, category: "water" },
  { key: "swimming_laps", label: "Swimming (laps)", met: 8.3, category: "water" },
  { key: "water_aerobics", label: "Water aerobics", met: 5.5, category: "water" },
  { key: "surfing", label: "Surfing", met: 5.0, category: "water" },
  { key: "kayaking", label: "Kayaking", met: 5.0, category: "water" },
  { key: "paddleboarding", label: "Paddleboarding", met: 6.0, category: "water" },
  // Studio & mind-body
  { key: "yoga", label: "Yoga", met: 2.5, category: "studio" },
  { key: "pilates", label: "Pilates", met: 3.0, category: "studio" },
  { key: "barre", label: "Barre", met: 3.5, category: "studio" },
  { key: "dancing", label: "Dancing", met: 5.0, category: "studio" },
  { key: "stretching", label: "Stretching", met: 2.3, category: "studio" },
  // Combat
  { key: "boxing", label: "Boxing", met: 9.0, category: "combat" },
  { key: "kickboxing", label: "Kickboxing", met: 10.0, category: "combat" },
  { key: "martial_arts", label: "Martial arts", met: 10.3, category: "combat" },
  { key: "wrestling", label: "Wrestling", met: 6.0, category: "combat" },
  // Winter
  { key: "skiing", label: "Skiing", met: 7.0, category: "winter" },
  { key: "snowboarding", label: "Snowboarding", met: 5.3, category: "winter" },
  { key: "ice_skating", label: "Ice skating", met: 7.0, category: "winter" },
  // Fallback (must stay last)
  { key: "other", label: "Other", met: 4.0, category: "other" },
];

export const activityByKey = (key: string): ActivityDef =>
  ACTIVITIES.find((a) => a.key === key) ?? ACTIVITIES[ACTIVITIES.length - 1]!;

/** What an activity is naturally measured in — drives which input fields the
 *  logger shows. `distance` sports lead with distance, `reps` bodyweight moves
 *  lead with a count (push-ups → reps), everything else with duration. */
export type ActivityTrack = "duration" | "distance" | "reps";

const DISTANCE_ACTIVITIES = new Set([
  "walking", "brisk_walking", "running", "jogging", "treadmill", "cycling", "rowing",
  "hiking", "swimming", "swimming_laps", "kayaking", "paddleboarding", "skiing", "snowboarding",
]);
const REPS_ACTIVITIES = new Set(["push_ups", "pull_ups", "dips", "burpees"]);

export function activityTrack(key: string): ActivityTrack {
  if (REPS_ACTIVITIES.has(key)) return "reps";
  if (DISTANCE_ACTIVITIES.has(key)) return "distance";
  return "duration";
}

/** The catalog grouped into category sections (category order), skipping empties.
 *  Drives the sectioned activity picker. */
export function activitiesByCategory(): { key: ActivityCategory; label: string; activities: ActivityDef[] }[] {
  return ACTIVITY_CATEGORY_META.map((c) => ({ ...c, activities: ACTIVITIES.filter((a) => a.category === c.key) })).filter(
    (g) => g.activities.length > 0,
  );
}

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
