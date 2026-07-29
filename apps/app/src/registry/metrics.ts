/**
 * Metric coding — the single source of truth for how every tracked metric is
 * presented: its label, unit, color (tone) and icon. Screens read from here so
 * calories are always the same amber flame, protein the same rose, carbs amber,
 * fat indigo, water blue, etc. — coherent across the whole app.
 *
 * Colors resolve to the `--calories/--protein/--carbs/--fat` (+ domain accent)
 * tokens, so they re-skin with the tenant theme like everything else.
 */

import type { Tone } from "@4dl/ui";
import {
  Flame, Beef, Wheat, Droplets, Droplet, Salad, Weight, Percent, Footprints,
  Moon, Smile, Zap, Activity, Dumbbell, Timer, Ruler, HeartPulse, type LucideIcon,
} from "@4dl/ui";

/** The unit dimension a metric is stored/converted in (matches @kova/domain
 *  units). Absent ⇒ the value is dimensionless or a fixed unit (see noConvert). */
export type UnitDimension = "weight" | "height" | "length" | "volume" | "distance" | "energy";

export interface MetricDef {
  label: string;
  /** Single-letter/short badge (macros). */
  short?: string;
  /** The fixed display unit (used when there's no user-convertible dimension). */
  unit: string;
  /** The convertible unit dimension, if the value follows the user's unit prefs. */
  unitDimension?: UnitDimension;
  /** Dimensionless / fixed-unit values (%, /5, °, h, bpm, index) — never converted. */
  noConvert?: boolean;
  icon: LucideIcon;
  tone: Tone;
}

export const METRICS = {
  calories: { label: "Calories", unit: "kcal", unitDimension: "energy", icon: Flame, tone: "calories" },
  protein: { label: "Protein", short: "P", unit: "g", icon: Beef, tone: "protein" },
  carbs: { label: "Carbs", short: "C", unit: "g", icon: Wheat, tone: "carbs" },
  fat: { label: "Fat", short: "F", unit: "g", icon: Droplets, tone: "fat" },
  fiber: { label: "Fiber", short: "Fb", unit: "g", icon: Salad, tone: "activity" },
  water: { label: "Water", unit: "ml", unitDimension: "volume", icon: Droplet, tone: "hydration" },
  burned: { label: "Burned", unit: "kcal", unitDimension: "energy", icon: Flame, tone: "cardio" },
  weight: { label: "Weight", unit: "kg", unitDimension: "weight", icon: Weight, tone: "cardio" },
  bodyFat: { label: "Body fat", unit: "%", noConvert: true, icon: Percent, tone: "sleep" },
  waist: { label: "Waist", unit: "cm", unitDimension: "length", icon: Ruler, tone: "nutrition" },
  chest: { label: "Chest", unit: "cm", unitDimension: "length", icon: Ruler, tone: "nutrition" },
  hips: { label: "Hips", unit: "cm", unitDimension: "length", icon: Ruler, tone: "nutrition" },
  neck: { label: "Neck", unit: "cm", unitDimension: "length", icon: Ruler, tone: "nutrition" },
  leanMass: { label: "Lean mass", unit: "kg", unitDimension: "weight", icon: Weight, tone: "cardio" },
  fatMass: { label: "Fat mass", unit: "kg", unitDimension: "weight", icon: Weight, tone: "sleep" },
  ffmi: { label: "FFMI", unit: "kg/m²", noConvert: true, icon: Weight, tone: "cardio" },
  posture: { label: "Posture", unit: "°", noConvert: true, icon: Activity, tone: "activity" },
  steps: { label: "Steps", unit: "", icon: Footprints, tone: "activity" },
  sets: { label: "Sets", unit: "", icon: Dumbbell, tone: "activity" },
  sleep: { label: "Sleep", unit: "h", noConvert: true, icon: Moon, tone: "sleep" },
  mood: { label: "Mood", unit: "/5", noConvert: true, icon: Smile, tone: "nutrition" },
  energy: { label: "Energy", unit: "/5", noConvert: true, icon: Zap, tone: "warning" },
  stress: { label: "Stress", unit: "/5", noConvert: true, icon: Activity, tone: "danger" },
  streak: { label: "Streak", unit: "d", noConvert: true, icon: Flame, tone: "calories" },
  fasting: { label: "Fasting", unit: "h", noConvert: true, icon: Timer, tone: "sleep" },
  heartRate: { label: "Heart rate", unit: "bpm", noConvert: true, icon: HeartPulse, tone: "cardio" },
} satisfies Record<string, MetricDef>;

export type MetricKey = keyof typeof METRICS;

/** The macro triad, in canonical display order. */
export const MACRO_KEYS = ["protein", "carbs", "fat"] as const;
export type MacroKey = (typeof MACRO_KEYS)[number];

/** Posture-screen severity → tone (SSOT; was duplicated in Progress + Wellness). */
export const POSTURE_SEVERITY_TONE = {
  good: "success", mild: "warning", moderate: "warning", severe: "danger",
} satisfies Record<string, Tone>;

/** Metabolic fasting zones — thresholds in elapsed hours (universal, target-free).
 *  SSOT for the fasting tracker (was duplicated, divergent, in HomeWidgets +
 *  Wellness). `vis` is the segment's visual weight in the zone ring. */
export interface FastingZone { label: string; start: number; max: number; tone: Tone; vis: number }
export const FASTING_ZONES: FastingZone[] = [
  { label: "Fed", start: 0, max: 4, tone: "nutrition", vis: 4 },
  { label: "Catabolic", start: 4, max: 16, tone: "cardio", vis: 12 },
  { label: "Fat burning", start: 16, max: 24, tone: "activity", vis: 8 },
  { label: "Ketosis", start: 24, max: 72, tone: "sleep", vis: 7 },
];
