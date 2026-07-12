/**
 * Shared exercise taxonomies (SPEC §8.3) — the fixed vocabularies used by the
 * exercise editor's multi-selects AND the AI auto-fill prompt, so the model
 * only ever returns values the UI can render. Lowercase, stable slugs.
 */

export const MUSCLE_GROUPS = [
  "chest", "upper back", "lats", "lower back", "traps", "shoulders", "rear delts",
  "biceps", "triceps", "forearms", "abs", "obliques",
  "quads", "hamstrings", "glutes", "calves", "adductors", "abductors", "hip flexors", "neck",
] as const;

export const EQUIPMENT_TYPES = [
  "barbell", "dumbbell", "kettlebell", "cable", "machine", "smith machine",
  "bodyweight", "resistance band", "ez bar", "trap bar", "medicine ball",
  "stability ball", "trx", "plate", "bench", "pull-up bar", "dip bars",
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
export type EquipmentType = (typeof EQUIPMENT_TYPES)[number];
