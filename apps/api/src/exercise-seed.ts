/**
 * Platform exercise seed (SPEC §8.3) — a curated starter library so a fresh
 * install (and the AI Plan Draft) has real content on day one. tenant_id NULL
 * = platform lane, readable by every tenant, read-only. The full wger /
 * free-exercise-db import (with media) lands with the library phase.
 */

import { nowIso } from "./ids.js";

interface SeedExercise {
  id: string;
  name: string;
  muscles: string;
  secondary: string;
  equipment: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  force: "push" | "pull" | "static";
  mechanic: "compound" | "isolation";
  category: string;
}

const E = (
  id: string,
  name: string,
  muscles: string,
  secondary: string,
  equipment: string,
  difficulty: SeedExercise["difficulty"],
  force: SeedExercise["force"],
  mechanic: SeedExercise["mechanic"],
  category = "strength",
): SeedExercise => ({ id, name, muscles, secondary, equipment, difficulty, force, mechanic, category });

const SEED: SeedExercise[] = [
  // Push
  E("exr_seed_bench", "Barbell Bench Press", "chest", "triceps,shoulders", "barbell", "intermediate", "push", "compound"),
  E("exr_seed_dbbench", "Dumbbell Bench Press", "chest", "triceps,shoulders", "dumbbell", "beginner", "push", "compound"),
  E("exr_seed_incline_db", "Incline Dumbbell Press", "chest", "shoulders,triceps", "dumbbell", "intermediate", "push", "compound"),
  E("exr_seed_pushup", "Push-Up", "chest", "triceps,core", "bodyweight", "beginner", "push", "compound"),
  E("exr_seed_ohp", "Overhead Press", "shoulders", "triceps,core", "barbell", "intermediate", "push", "compound"),
  E("exr_seed_dbshoulder", "Seated Dumbbell Shoulder Press", "shoulders", "triceps", "dumbbell", "beginner", "push", "compound"),
  E("exr_seed_latraise", "Lateral Raise", "shoulders", "", "dumbbell", "beginner", "push", "isolation"),
  E("exr_seed_dips", "Dips", "triceps", "chest,shoulders", "bodyweight", "intermediate", "push", "compound"),
  E("exr_seed_pushdown", "Cable Triceps Pushdown", "triceps", "", "cable", "beginner", "push", "isolation"),
  E("exr_seed_skull", "Skull Crusher", "triceps", "", "barbell", "intermediate", "push", "isolation"),
  // Pull
  E("exr_seed_deadlift", "Conventional Deadlift", "back", "glutes,hamstrings,traps", "barbell", "advanced", "pull", "compound"),
  E("exr_seed_pullup", "Pull-Up", "back", "biceps,forearms", "bodyweight", "intermediate", "pull", "compound"),
  E("exr_seed_latpulldown", "Lat Pulldown", "back", "biceps", "cable", "beginner", "pull", "compound"),
  E("exr_seed_bbrow", "Barbell Row", "back", "biceps,traps", "barbell", "intermediate", "pull", "compound"),
  E("exr_seed_dbrow", "One-Arm Dumbbell Row", "back", "biceps", "dumbbell", "beginner", "pull", "compound"),
  E("exr_seed_seatedrow", "Seated Cable Row", "back", "biceps,traps", "cable", "beginner", "pull", "compound"),
  E("exr_seed_facepull", "Face Pull", "shoulders", "traps,back", "cable", "beginner", "pull", "isolation"),
  E("exr_seed_curl", "Barbell Curl", "biceps", "forearms", "barbell", "beginner", "pull", "isolation"),
  E("exr_seed_dbcurl", "Dumbbell Curl", "biceps", "forearms", "dumbbell", "beginner", "pull", "isolation"),
  E("exr_seed_hammer", "Hammer Curl", "biceps", "forearms", "dumbbell", "beginner", "pull", "isolation"),
  // Legs
  E("exr_seed_squat", "Barbell Back Squat", "quads", "glutes,hamstrings,core", "barbell", "intermediate", "push", "compound"),
  E("exr_seed_goblet", "Goblet Squat", "quads", "glutes,core", "dumbbell", "beginner", "push", "compound"),
  E("exr_seed_frontsquat", "Front Squat", "quads", "glutes,core", "barbell", "advanced", "push", "compound"),
  E("exr_seed_legpress", "Leg Press", "quads", "glutes,hamstrings", "machine", "beginner", "push", "compound"),
  E("exr_seed_rdl", "Romanian Deadlift", "hamstrings", "glutes,back", "barbell", "intermediate", "pull", "compound"),
  E("exr_seed_legcurl", "Lying Leg Curl", "hamstrings", "", "machine", "beginner", "pull", "isolation"),
  E("exr_seed_lunge", "Walking Lunge", "quads", "glutes,hamstrings", "bodyweight", "beginner", "push", "compound"),
  E("exr_seed_split", "Bulgarian Split Squat", "quads", "glutes", "dumbbell", "intermediate", "push", "compound"),
  E("exr_seed_hipthrust", "Barbell Hip Thrust", "glutes", "hamstrings", "barbell", "intermediate", "push", "compound"),
  E("exr_seed_calf", "Standing Calf Raise", "calves", "", "machine", "beginner", "push", "isolation"),
  // Core
  E("exr_seed_plank", "Plank", "core", "shoulders", "bodyweight", "beginner", "static", "isolation"),
  E("exr_seed_sideplank", "Side Plank", "core", "", "bodyweight", "beginner", "static", "isolation"),
  E("exr_seed_deadbug", "Dead Bug", "core", "", "bodyweight", "beginner", "static", "isolation"),
  E("exr_seed_hangingknee", "Hanging Knee Raise", "core", "forearms", "bodyweight", "intermediate", "pull", "isolation"),
  E("exr_seed_cablecrunch", "Cable Crunch", "core", "", "cable", "beginner", "pull", "isolation"),
  // Conditioning
  E("exr_seed_burpee", "Burpee", "full_body", "core", "bodyweight", "intermediate", "push", "compound", "cardio"),
  E("exr_seed_mtclimber", "Mountain Climbers", "core", "quads,shoulders", "bodyweight", "beginner", "push", "compound", "cardio"),
  E("exr_seed_kbswing", "Kettlebell Swing", "glutes", "hamstrings,core,back", "kettlebell", "intermediate", "pull", "compound", "cardio"),
  E("exr_seed_row_erg", "Rowing Machine", "full_body", "back,quads", "machine", "beginner", "pull", "compound", "cardio"),
  E("exr_seed_farmer", "Farmer's Carry", "full_body", "forearms,traps,core", "dumbbell", "beginner", "static", "compound"),
];

/**
 * Seed the platform starter library, once.
 *
 * The guard is a cheap existence CHECK, not a module-level flag, and that
 * distinction is load-bearing. A flag lives for the life of the isolate, but the
 * rows it is tracking do not: `purgeEverything` (the platform nuclear reset)
 * runs `DELETE FROM exercises`, which takes the seed with it. If the reset and
 * the next request happened to share an isolate, the flag still said "seeded" and
 * the library came back EMPTY — and stayed empty until that isolate recycled. So
 * a reset produced 40 exercises or 0 depending on nothing the operator could see
 * or control.
 *
 * Empty is the worse outcome, too: the AI plan draft whitelists library ids and
 * grounds its prompt in them, so with no library it has nothing to pick from.
 *
 * `seedAiModels` already solved this the same way — one indexed `LIMIT 1` read
 * skips the 40-row batch on the hot path, and it is correct in every isolate
 * because it asks the database instead of remembering.
 */
export async function seedExercises(db: D1Database): Promise<void> {
  const already = await db
    .prepare("SELECT 1 AS x FROM exercises WHERE source = 'seed' AND tenant_id IS NULL LIMIT 1")
    .first<{ x: number }>()
    .catch(() => null);
  if (already) return;
  const now = nowIso();
  await db
    .batch(
      SEED.map((e) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO exercises (id, tenant_id, visibility, name, slug, muscle_groups, secondary_muscle_groups, equipment, difficulty, force, mechanic, category, source, source_id, active, created_at)
             VALUES (?, NULL, 'tenant', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?, 1, ?)`,
          )
          .bind(
            e.id,
            e.name,
            e.id.replace("exr_seed_", ""),
            e.muscles,
            e.secondary,
            e.equipment,
            e.difficulty,
            e.force,
            e.mechanic,
            e.category,
            e.id,
            now,
          ),
      ),
    )
    // A failed batch simply leaves the table empty, and the check above will try
    // again on the next request rather than latching "seeded" on a failure.
    .catch(() => undefined);
}
