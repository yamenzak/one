/**
 * Wellness Score (SPEC §8.7) — one composite 0-100 number that reflects a
 * client's whole-system commitment: training, nutrition, sleep, hydration,
 * mood/recovery, logging consistency, supplement adherence and body progress.
 *
 * Pure and tz-agnostic: the caller gathers 7-day signals and buckets them to
 * the client's local day BEFORE calling in. Each pillar is scored 0..1 and only
 * counts when its data exists — a client is never penalised for a feature they
 * don't use; the missing pillar's weight is redistributed across the rest. This
 * is what keeps the number realistic for a brand-new client and a power user
 * alike.
 */

import { DEFAULT_WEEKLY_LOAD_TARGET } from "./workout.js";

export interface WellnessInput {
  // Training / activity
  activeDays?: number | null; // 0..7 days with a workout or logged activity
  weeklyLoad?: number | null; // summed training load this week
  weeklyLoadTarget?: number | null; // defaults to DEFAULT_WEEKLY_LOAD_TARGET
  prsThisWeek?: number | null; // fresh PRs this week (small bonus)
  // Nutrition
  calorieAdherence?: number | null; // 0..1
  proteinAdherence?: number | null; // 0..1
  foodLoggedDays?: number | null; // 0..7
  // Hydration
  hydrationRatio?: number | null; // 0..1 (avg daily water / target, capped)
  // Sleep
  avgSleepHours?: number | null;
  // Mood / recovery (1..5 means)
  avgMood?: number | null;
  avgEnergy?: number | null;
  avgStress?: number | null; // higher is worse
  // Consistency
  loggedDays?: number | null; // 0..7 days with ANY log
  checkInDays?: number | null; // 0..7 days with a check-in
  // Supplements
  supplementAdherence?: number | null; // 0..1 (slots taken / slots prescribed)
  // Body progress
  bodyProgress?: number | null; // 0..1 (trend toward goal / favourable change)
}

export type WellnessBand = "start" | "building" | "solid" | "strong" | "peak";

export interface WellnessPillar {
  key: string;
  label: string;
  /** 0..100, or null when the pillar has no data this week. */
  score: number | null;
  /** Effective share of the overall score after redistribution (0..1). */
  weight: number;
  available: boolean;
}

export interface WellnessResult {
  score: number; // 0..100
  band: WellnessBand;
  pillars: WellnessPillar[]; // every pillar, in display order (available or not)
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Sleep hours → 0..1. Ideal band 7–9h scores 1; degrades linearly to 0 at 4h
 *  (deprived) or 11h (over-sleeping). */
export function sleepScore(hours: number): number {
  if (hours >= 7 && hours <= 9) return 1;
  if (hours < 7) return clamp01((hours - 4) / 3);
  return clamp01((11 - hours) / 2);
}

const rating01 = (v: number) => clamp01((v - 1) / 4); // 1..5 → 0..1
const band = (score: number): WellnessBand =>
  score >= 90 ? "peak" : score >= 75 ? "strong" : score >= 60 ? "solid" : score >= 40 ? "building" : "start";

interface PillarDef {
  key: string;
  label: string;
  weight: number;
  compute: (i: WellnessInput) => number | null; // 0..1 or null when unavailable
}

const PILLARS: PillarDef[] = [
  {
    key: "training",
    label: "Training",
    weight: 0.22,
    compute: (i) => {
      const parts: number[] = [];
      if (i.activeDays != null) parts.push(clamp01(i.activeDays / 5));
      if (i.weeklyLoad != null) parts.push(clamp01(i.weeklyLoad / (i.weeklyLoadTarget || DEFAULT_WEEKLY_LOAD_TARGET)));
      if (parts.length === 0) return null;
      const bonus = Math.min(0.12, Math.max(0, i.prsThisWeek ?? 0) * 0.06);
      return clamp01(avg(parts) + bonus);
    },
  },
  {
    key: "nutrition",
    label: "Nutrition",
    weight: 0.2,
    compute: (i) => {
      const parts: number[] = [];
      if (i.calorieAdherence != null) parts.push(clamp01(i.calorieAdherence));
      if (i.proteinAdherence != null) parts.push(clamp01(i.proteinAdherence));
      if (i.foodLoggedDays != null) parts.push(clamp01(i.foodLoggedDays / 7));
      return parts.length ? avg(parts) : null;
    },
  },
  {
    key: "sleep",
    label: "Sleep",
    weight: 0.14,
    compute: (i) => (i.avgSleepHours != null ? sleepScore(i.avgSleepHours) : null),
  },
  {
    key: "consistency",
    label: "Consistency",
    weight: 0.14,
    compute: (i) => {
      const parts: number[] = [];
      if (i.loggedDays != null) parts.push(clamp01(i.loggedDays / 7));
      if (i.checkInDays != null) parts.push(clamp01(i.checkInDays / 7));
      return parts.length ? avg(parts) : null;
    },
  },
  {
    key: "hydration",
    label: "Hydration",
    weight: 0.1,
    compute: (i) => (i.hydrationRatio != null ? clamp01(i.hydrationRatio) : null),
  },
  {
    key: "mood",
    label: "Mood",
    weight: 0.1,
    compute: (i) => {
      const parts: number[] = [];
      if (i.avgMood != null) parts.push(rating01(i.avgMood));
      if (i.avgEnergy != null) parts.push(rating01(i.avgEnergy));
      if (i.avgStress != null) parts.push(rating01(6 - i.avgStress)); // invert: low stress = good
      return parts.length ? avg(parts) : null;
    },
  },
  {
    key: "supplements",
    label: "Supplements",
    weight: 0.05,
    compute: (i) => (i.supplementAdherence != null ? clamp01(i.supplementAdherence) : null),
  },
  {
    key: "body",
    label: "Body",
    weight: 0.05,
    compute: (i) => (i.bodyProgress != null ? clamp01(i.bodyProgress) : null),
  },
];

/**
 * Compute the composite Wellness Score. Weight of any pillar without data this
 * week is redistributed proportionally across the pillars that do have data.
 */
export function wellnessScore(input: WellnessInput): WellnessResult {
  const raw = PILLARS.map((p) => ({ def: p, value: p.compute(input) }));
  const available = raw.filter((r) => r.value != null);
  const totalWeight = available.reduce((s, r) => s + r.def.weight, 0);

  const score =
    totalWeight > 0
      ? Math.round((available.reduce((s, r) => s + r.def.weight * (r.value as number), 0) / totalWeight) * 100)
      : 0;

  const pillars: WellnessPillar[] = raw.map((r) => ({
    key: r.def.key,
    label: r.def.label,
    score: r.value != null ? Math.round(r.value * 100) : null,
    weight: r.value != null && totalWeight > 0 ? Math.round((r.def.weight / totalWeight) * 100) / 100 : 0,
    available: r.value != null,
  }));

  return { score, band: band(score), pillars };
}
