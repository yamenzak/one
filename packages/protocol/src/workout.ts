/**
 * Workout plan body schema (SPEC §8.3) — the shared field structure for plans
 * AND templates (ByShujaa's shared-schema rule: transfer is a JSON copy).
 * Stored as a JSON column (`body_json`) on workout_plans / workout_templates.
 */

import { z } from "zod";

export const MeasurementMode = z.enum(["reps", "time", "distance", "reps_in_time"]);
export type MeasurementMode = z.infer<typeof MeasurementMode>;

export const WeightMode = z.enum([
  "absolute",
  "unspecified", // "client picks"
  "bodyweight",
  "previous_plus",
  "previous_times",
  "percent_1rm",
  "dropset",
]);
export type WeightMode = z.infer<typeof WeightMode>;

export const SetType = z.enum(["warmup", "working", "amrap"]);
export const BlockType = z.enum(["single", "superset", "circuit", "hiit"]);

export const WorkoutSet = z.object({
  setType: SetType.default("working"),
  reps: z.number().int().positive().nullish(),
  weightMode: WeightMode.default("unspecified"),
  /** Meaning depends on weightMode: absolute kg, +kg, ×multiplier, dropset start kg. */
  weightValue: z.number().nullish(),
  timeSec: z.number().int().positive().nullish(),
  distanceM: z.number().positive().nullish(),
  rpe: z.number().min(1).max(10).nullish(),
  rir: z.number().min(0).max(10).nullish(),
  percent1rm: z.number().min(0).max(100).nullish(),
  tempo: z.string().max(20).nullish(),
  restAfterSec: z.number().int().min(0).nullish(),
  notes: z.string().max(500).nullish(),
});
export type WorkoutSet = z.infer<typeof WorkoutSet>;

export const ExerciseSlot = z.object({
  exerciseId: z.string().min(1),
  measurementMode: MeasurementMode.default("reps"),
  slotNotes: z.string().max(500).nullish(),
  sets: z.array(WorkoutSet).default([]),
});
export type ExerciseSlot = z.infer<typeof ExerciseSlot>;

export const WorkoutBlock = z.object({
  type: BlockType.default("single"),
  rounds: z.number().int().positive().nullish(),
  restBetweenExercisesSec: z.number().int().min(0).nullish(),
  restBetweenRoundsSec: z.number().int().min(0).nullish(),
  restAfterBlockSec: z.number().int().min(0).nullish(),
  blockNotes: z.string().max(500).nullish(),
  slots: z.array(ExerciseSlot).default([]),
});
export type WorkoutBlock = z.infer<typeof WorkoutBlock>;

export const WorkoutDay = z.object({
  name: z.string().max(80).default(""),
  dayNotes: z.string().max(2000).nullish(),
  isRestDay: z.boolean().default(false),
  blocks: z.array(WorkoutBlock).default([]),
});
export type WorkoutDay = z.infer<typeof WorkoutDay>;

export const WorkoutBody = z.object({
  days: z.array(WorkoutDay).max(7).default([]),
});
export type WorkoutBody = z.infer<typeof WorkoutBody>;

export const PlanStatus = z.enum(["draft", "published", "superseded", "archived"]);
export type PlanStatus = z.infer<typeof PlanStatus>;

/** Prescribed sets across a day (for progress bars + scheduling). */
export function prescribedSetsForDay(day: WorkoutDay): number {
  let n = 0;
  for (const block of day.blocks) {
    const rounds = block.type === "single" ? 1 : (block.rounds ?? 1);
    for (const slot of block.slots) n += slot.sets.length * rounds;
  }
  return n;
}

/**
 * Strip client-specific loading for template export (ByShujaa rule): absolute
 * and dropset weights cleared -> "unspecified"; portable progression modes
 * (percent_1rm, previous_plus, previous_times, bodyweight) kept.
 */
export function stripBodyForTemplate(body: WorkoutBody): WorkoutBody {
  return {
    days: body.days.map((day) => ({
      ...day,
      blocks: day.blocks.map((block) => ({
        ...block,
        slots: block.slots.map((slot) => ({
          ...slot,
          sets: slot.sets.map((set) =>
            set.weightMode === "absolute" || set.weightMode === "dropset"
              ? { ...set, weightMode: "unspecified" as const, weightValue: null }
              : set,
          ),
        })),
      })),
    })),
  };
}
