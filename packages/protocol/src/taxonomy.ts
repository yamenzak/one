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

// ── Tolerant normalization ───────────────────────────────────────────────────
// The AI (and provider imports) return anatomical or plural/synonym names that
// don't match our slugs exactly ("quadriceps", "gluteus maximus", "pecs",
// "delts"). Without this the strict vocab filter drops them all and the editor
// fills nothing. These maps + fuzzy fallback fold common variants onto a slug.
const MUSCLE_ALIASES: Record<string, MuscleGroup> = {
  quadriceps: "quads", quad: "quads",
  hamstring: "hamstrings", hams: "hamstrings", ham: "hamstrings",
  glute: "glutes", gluteus: "glutes", "gluteus maximus": "glutes", gluteals: "glutes", buttocks: "glutes", butt: "glutes",
  pec: "chest", pecs: "chest", pectoral: "chest", pectorals: "chest", "pectoralis major": "chest", pectoralis: "chest",
  delt: "shoulders", delts: "shoulders", deltoid: "shoulders", deltoids: "shoulders", "front delts": "shoulders", "anterior deltoid": "shoulders", "side delts": "shoulders", "medial deltoid": "shoulders", "lateral deltoid": "shoulders",
  "rear delt": "rear delts", "rear deltoid": "rear delts", "rear deltoids": "rear delts", "posterior deltoid": "rear delts",
  lat: "lats", latissimus: "lats", "latissimus dorsi": "lats",
  trap: "traps", trapezius: "traps",
  core: "abs", abdominals: "abs", abdominal: "abs", "rectus abdominis": "abs", stomach: "abs",
  oblique: "obliques",
  bicep: "biceps", "biceps brachii": "biceps",
  tricep: "triceps", "triceps brachii": "triceps",
  forearm: "forearms", grip: "forearms",
  calf: "calves", gastrocnemius: "calves", soleus: "calves",
  rhomboid: "upper back", rhomboids: "upper back", "mid back": "upper back", "middle back": "upper back", "upper-back": "upper back",
  "erector spinae": "lower back", "spinal erectors": "lower back", lumbar: "lower back", "lower-back": "lower back",
  adductor: "adductors", "inner thigh": "adductors", "inner thighs": "adductors",
  abductor: "abductors", "outer thigh": "abductors", "gluteus medius": "abductors", "hip abductors": "abductors",
  "hip flexor": "hip flexors", iliopsoas: "hip flexors", psoas: "hip flexors",
  "neck flexors": "neck",
};

const EQUIPMENT_ALIASES: Record<string, EquipmentType> = {
  "body weight": "bodyweight", "body-weight": "bodyweight", none: "bodyweight", "no equipment": "bodyweight",
  "resistance bands": "resistance band", band: "resistance band", bands: "resistance band", "mini band": "resistance band", "loop band": "resistance band",
  "ez-bar": "ez bar", "ez curl bar": "ez bar", "ez-curl bar": "ez bar",
  smith: "smith machine",
  "pull up bar": "pull-up bar", "pullup bar": "pull-up bar", "chin up bar": "pull-up bar", "chin-up bar": "pull-up bar",
  "dip bar": "dip bars", "parallel bars": "dip bars", parallettes: "dip bars",
  "med ball": "medicine ball",
  "swiss ball": "stability ball", "exercise ball": "stability ball", "physio ball": "stability ball", "yoga ball": "stability ball",
  cables: "cable", machines: "machine", dumbbells: "dumbbell", db: "dumbbell", barbells: "barbell", bb: "barbell",
  kettlebells: "kettlebell", kb: "kettlebell", plates: "plate", "weight plate": "plate", benches: "bench", "flat bench": "bench",
  "hex bar": "trap bar", "suspension trainer": "trx",
};

function normalize<T extends string>(raw: string, vocab: readonly T[], aliases: Record<string, T>): T | null {
  const k = raw.toLowerCase().trim();
  if (!k) return null;
  if ((vocab as readonly string[]).includes(k)) return k as T;
  if (aliases[k]) return aliases[k];
  // Plural/singular tolerance.
  if ((vocab as readonly string[]).includes(`${k}s`)) return `${k}s` as T;
  if (k.endsWith("s") && (vocab as readonly string[]).includes(k.slice(0, -1))) return k.slice(0, -1) as T;
  // Multi-word answers ("left quadriceps", "front deltoid muscle") — fold on a
  // contained alias key or vocab term (longer terms first to avoid partials).
  const aliasKeys = Object.keys(aliases).sort((a, b) => b.length - a.length);
  for (const a of aliasKeys) if (k.includes(a)) return aliases[a]!;
  const terms = [...vocab].sort((a, b) => b.length - a.length);
  for (const term of terms) if (k.includes(term)) return term;
  return null;
}

/** Fold a raw muscle name onto a canonical slug, or null if unrecognizable. */
export const normalizeMuscle = (raw: string): MuscleGroup | null => normalize(raw, MUSCLE_GROUPS, MUSCLE_ALIASES);
/** Fold a raw equipment name onto a canonical slug, or null if unrecognizable. */
export const normalizeEquipment = (raw: string): EquipmentType | null => normalize(raw, EQUIPMENT_TYPES, EQUIPMENT_ALIASES);
