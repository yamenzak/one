/**
 * Metric coding — the single source of truth for how every tracked metric is
 * presented: its label, unit, color (tone) and icon. Screens read from here so
 * calories are always the same amber flame, protein the same rose, carbs amber,
 * fat indigo, water blue, etc. — coherent across the whole app.
 *
 * Colors resolve to the `--calories/--protein/--carbs/--fat` (+ domain accent)
 * tokens, so they re-skin with the tenant theme like everything else.
 */

import type { Tone } from "../primitives.js";
import {
  Flame, Beef, Wheat, Droplets, Droplet, Salad, Weight, Percent, Footprints,
  Moon, Smile, Zap, Activity, Dumbbell, Timer, Ruler, HeartPulse, type LucideIcon,
} from "./icons.js";

export interface MetricDef {
  label: string;
  /** Single-letter/short badge (macros). */
  short?: string;
  unit: string;
  icon: LucideIcon;
  tone: Tone;
}

export const METRICS = {
  calories: { label: "Calories", unit: "kcal", icon: Flame, tone: "calories" },
  protein: { label: "Protein", short: "P", unit: "g", icon: Beef, tone: "protein" },
  carbs: { label: "Carbs", short: "C", unit: "g", icon: Wheat, tone: "carbs" },
  fat: { label: "Fat", short: "F", unit: "g", icon: Droplets, tone: "fat" },
  fiber: { label: "Fiber", short: "Fb", unit: "g", icon: Salad, tone: "activity" },
  water: { label: "Water", unit: "ml", icon: Droplet, tone: "hydration" },
  burned: { label: "Burned", unit: "kcal", icon: Flame, tone: "cardio" },
  weight: { label: "Weight", unit: "kg", icon: Weight, tone: "cardio" },
  bodyFat: { label: "Body fat", unit: "%", icon: Percent, tone: "sleep" },
  waist: { label: "Waist", unit: "cm", icon: Ruler, tone: "nutrition" },
  steps: { label: "Steps", unit: "", icon: Footprints, tone: "activity" },
  sets: { label: "Sets", unit: "", icon: Dumbbell, tone: "activity" },
  sleep: { label: "Sleep", unit: "h", icon: Moon, tone: "sleep" },
  mood: { label: "Mood", unit: "/5", icon: Smile, tone: "nutrition" },
  energy: { label: "Energy", unit: "/5", icon: Zap, tone: "warning" },
  stress: { label: "Stress", unit: "/5", icon: Activity, tone: "danger" },
  streak: { label: "Streak", unit: "d", icon: Flame, tone: "calories" },
  fasting: { label: "Fasting", unit: "h", icon: Timer, tone: "sleep" },
  heartRate: { label: "Heart rate", unit: "bpm", icon: HeartPulse, tone: "cardio" },
} satisfies Record<string, MetricDef>;

export type MetricKey = keyof typeof METRICS;

/** The macro triad, in canonical display order. */
export const MACRO_KEYS = ["protein", "carbs", "fat"] as const;
export type MacroKey = (typeof MACRO_KEYS)[number];
