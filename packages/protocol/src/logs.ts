/**
 * Logging payloads (SPEC §8.6) — client-app -> api wire schemas. All day
 * bucketing uses the client's local date (YYYY-MM-DD) from the device-tz
 * cookie; the api stores the UTC start of that local day.
 */

import { z } from "zod";

export const LocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

export const LoggedSet = z.object({
  setIndex: z.number().int().min(0),
  reps: z.number().int().positive().nullish(),
  weightKg: z.number().positive().nullish(),
  durationSeconds: z.number().int().positive().nullish(),
  distanceM: z.number().positive().nullish(),
  rpe: z.number().min(1).max(10).nullish(),
  effortLabel: z.enum(["easy", "perfect", "hard"]).nullish(),
  completed: z.boolean().default(true),
});
export type LoggedSet = z.infer<typeof LoggedSet>;

/** Structured session: find-or-create per (client, plan, dayIndex, local day). */
export const LogWorkoutSets = z.object({
  date: LocalDate,
  workoutPlanId: z.string().min(1),
  planDayIndex: z.number().int().min(0),
  blockIndex: z.number().int().min(0),
  slotIndex: z.number().int().min(0),
  exerciseId: z.string().min(1),
  sets: z.array(LoggedSet).min(1),
});
export type LogWorkoutSets = z.infer<typeof LogWorkoutSets>;

/** Freestyle activity (a MET-catalog sport/workout or a custom label). Numeric
 *  fields are meant to be typed straight from a wearable (Whoop / Apple Health /
 *  Fitbit) — or left blank and estimated. */
export const LogActivity = z.object({
  date: LocalDate,
  activityKey: z.string().max(40).nullish(),
  label: z.string().max(80).nullish(),
  startTime: z.string().max(8).nullish(), // HH:MM local
  /** Optional now: rep-based moves (push-ups) may carry a count with no time. */
  durationMin: z.number().int().positive().nullish(),
  avgHrBpm: z.number().int().positive().nullish(),
  /** Distance in metres (stored metric; displayed in the client's length unit). */
  distanceM: z.number().min(0).nullish(),
  /** Rep count for bodyweight moves (push-ups, pull-ups…). */
  reps: z.number().int().positive().nullish(),
  notes: z.string().max(300).nullish(),
  /** Manual override; omitted -> server estimates from MET × weight. */
  caloriesBurned: z.number().int().min(0).nullish(),
});
export type LogActivity = z.infer<typeof LogActivity>;

export const LogFoodEntry = z.object({
  date: LocalDate,
  mealType: z.string().min(1).max(40),
  foodId: z.string().nullish(),
  label: z.string().max(120).nullish(), // quick entry
  quantity: z.number().positive().nullish(),
  unit: z.string().max(20).nullish(),
  calories: z.number().min(0),
  proteinG: z.number().min(0).default(0),
  carbsG: z.number().min(0).default(0),
  fatG: z.number().min(0).default(0),
  source: z.enum(["self_logged", "prescribed", "ai_suggested", "free_meal"]).default("self_logged"),
  mealPlanId: z.string().nullish(),
  mealOptionIndex: z.number().int().min(0).nullish(),
  /** A photo for this entry (e.g. the snap-a-meal image), served via /api/media. */
  imageUrl: z.string().max(500).nullish(),
});
export type LogFoodEntry = z.infer<typeof LogFoodEntry>;

export const LogWater = z.object({
  date: LocalDate,
  amountMl: z.number().int().positive(),
});

export const LogSleep = z.object({
  date: LocalDate,
  durationMinutes: z.number().int().positive(),
  quality: z.number().int().min(1).max(5).nullish(),
  notes: z.string().max(500).nullish(),
});

export const LogMood = z.object({
  date: LocalDate,
  mood: z.number().int().min(1).max(5).nullish(),
  energy: z.number().int().min(1).max(5).nullish(),
  stress: z.number().int().min(1).max(5).nullish(),
  notes: z.string().max(500).nullish(),
});

export const LogMeasurement = z.object({
  date: LocalDate,
  weightKg: z.number().positive().nullish(),
  bodyFatPercent: z.number().min(1).max(75).nullish(),
  neckCm: z.number().positive().nullish(),
  waistCm: z.number().positive().nullish(),
  hipsCm: z.number().positive().nullish(),
  chestCm: z.number().positive().nullish(),
  notes: z.string().max(500).nullish(),
});
export type LogMeasurement = z.infer<typeof LogMeasurement>;

export const ProgressPhoto = z.object({
  key: z.string().max(300), // R2 key
  label: z.string().max(40).nullish(),
  consentToFeature: z.boolean().default(false),
});

export const SubmitCheckIn = z.object({
  date: LocalDate,
  weightKg: z.number().positive().nullish(),
  mood: z.number().int().min(1).max(5).nullish(),
  energy: z.number().int().min(1).max(5).nullish(),
  stress: z.number().int().min(1).max(5).nullish(),
  sleepQuality: z.number().int().min(1).max(5).nullish(),
  sleepHours: z.number().min(0).max(24).nullish(),
  waterMl: z.number().int().min(0).nullish(),
  stepsCount: z.number().int().min(0).nullish(),
  notes: z.string().max(2000).nullish(),
  /** Progress photos (private R2 keys) with per-photo feature consent. */
  progressPhotos: z.array(ProgressPhoto).nullish(),
});
export type SubmitCheckIn = z.infer<typeof SubmitCheckIn>;

export const LogFasting = z.object({
  action: z.enum(["start", "end"]),
  targetHours: z.number().int().min(8).max(72).default(16),
});
