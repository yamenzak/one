/**
 * Sample data for the interactive tour. While the tour runs, the api layer is
 * intercepted (see api.ts `setApiInterceptor`) so every client screen renders
 * populated with this demo content — a believable "Alex" who's a few weeks in —
 * and every write is swallowed so tapping around never touches real data.
 */

import { todayLocal } from "./api.js";

// ── date helpers (relative to the device's local today) ─────────────────────
const TODAY = todayLocal();
const dayISO = (back: number): string => {
  const d = new Date(`${TODAY}T00:00:00`);
  d.setDate(d.getDate() - back);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const at = (back: number, hh: number, mm = 0): string => {
  const d = new Date(`${dayISO(back)}T00:00:00`);
  d.setHours(hh, mm);
  return d.toISOString();
};
const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
const wave = (i: number, base: number, amp: number, period = 7): number => Math.round(base + amp * Math.sin((i / period) * Math.PI * 2));

const GOAL_TARGETS = { targetCalories: 2400, targetProteinG: 180, targetCarbsG: 240, targetFatG: 70, targetWaterMl: 3000, targetFiberG: 34 };

// ── Today ────────────────────────────────────────────────────────────────
const today = {
  date: TODAY,
  nutrition: { calories: 1680, proteinG: 132, carbsG: 158, fatG: 52 },
  waterMl: 1800,
  burnedKcal: 420,
  workout: { loggedSets: 12, sessions: [] },
  checkedIn: true,
  goal: { targets: GOAL_TARGETS, weeklyLoadTarget: 3500 },
  publishedWorkoutPlan: {
    id: "demo-plan",
    name: "Upper / Lower Split",
    body: { days: [{ name: "Upper A" }, { name: "Lower A" }, { name: "Rest", isRestDay: true }, { name: "Upper B" }, { name: "Lower B" }] },
  },
  checkInDates: [dayISO(0), dayISO(1), dayISO(2), dayISO(4), dayISO(5)],
  pendingLabs: 1,
  weightSeries: range(14).map((i) => ({ kg: Math.round((82 - i * 0.12) * 10) / 10, date: dayISO(13 - i) })).reverse(),
  widgets: null,
  profile: { complete: true, gaps: [] },
};

const feed = {
  events: [
    { id: "f1", kind: "food:breakfast", date: TODAY, at: at(0, 8, 15), title: "Oats, berries & whey", subtitle: "Breakfast", metric: { unit: "energy" as const, value: 520 } },
    { id: "f2", kind: "workout", date: TODAY, at: at(0, 12, 30), title: "Upper A", subtitle: "12 sets · 8,400 kg", metric: { unit: "weight" as const, value: 8400 } },
    { id: "f3", kind: "water", date: TODAY, at: at(0, 14, 0), title: "Water", subtitle: "+500 ml", metric: { unit: "volume" as const, value: 500 } },
    { id: "f4", kind: "checkin", date: TODAY, at: at(0, 7, 40), title: "Morning check-in", subtitle: "82.0 kg · mood 4/5", ref: "demo-checkin" },
    { id: "f5", kind: "supplement", date: TODAY, at: at(0, 8, 30), title: "Creatine", subtitle: "5 g" },
  ],
};

// ── Agenda (supplements / meal plan / food entries) ─────────────────────────
const supplements = {
  supplements: [
    { id: "s1", name: "Creatine monohydrate", dose: "5 g", kind: "performance", schedule: [{ slot: "morning" }] },
    { id: "s2", name: "Vitamin D3", dose: "2000 IU", kind: "vitamin", schedule: [{ slot: "morning" }] },
    { id: "s3", name: "Omega-3", dose: "2 g", kind: "vitamin", schedule: [{ slot: "evening" }] },
  ],
};
const suppLogs = { taken: [{ supplement_id: "s1", slot: "morning" }] };

// Food library the meal plan resolves names/macros/images from.
const FOODS = [
  { id: "fd0", name: "Rolled oats", brand: null, serving_size: 40, serving_unit: "g", calories: 150, protein_g: 5, carbs_g: 27, fat_g: 3, fiber_g: 4, sugar_g: 1, image_url: null },
  { id: "fd1", name: "Whey protein", brand: "Optimum", serving_size: 30, serving_unit: "g", calories: 120, protein_g: 24, carbs_g: 3, fat_g: 2, fiber_g: 0, sugar_g: 2, image_url: null },
  { id: "fd2", name: "Chicken breast", brand: null, serving_size: 100, serving_unit: "g", calories: 165, protein_g: 31, carbs_g: 0, fat_g: 4, fiber_g: 0, sugar_g: 0, image_url: null },
  { id: "fd3", name: "White rice, cooked", brand: null, serving_size: 100, serving_unit: "g", calories: 130, protein_g: 3, carbs_g: 28, fat_g: 0, fiber_g: 0, sugar_g: 0, image_url: null },
  { id: "fd4", name: "Broccoli", brand: null, serving_size: 100, serving_unit: "g", calories: 34, protein_g: 3, carbs_g: 7, fat_g: 0, fiber_g: 3, sugar_g: 2, image_url: null },
  { id: "fd5", name: "Greek yogurt", brand: null, serving_size: 100, serving_unit: "g", calories: 59, protein_g: 10, carbs_g: 4, fat_g: 0, fiber_g: 0, sugar_g: 4, image_url: null },
  { id: "fd6", name: "Almonds", brand: null, serving_size: 28, serving_unit: "g", calories: 164, protein_g: 6, carbs_g: 6, fat_g: 14, fiber_g: 4, sugar_g: 1, image_url: null },
  { id: "fd7", name: "Salmon fillet", brand: null, serving_size: 100, serving_unit: "g", calories: 208, protein_g: 20, carbs_g: 0, fat_g: 13, fiber_g: 0, sugar_g: 0, image_url: null },
  { id: "fd8", name: "Sweet potato", brand: null, serving_size: 100, serving_unit: "g", calories: 86, protein_g: 2, carbs_g: 20, fat_g: 0, fiber_g: 3, sugar_g: 4, image_url: null },
];
const foods = { foods: FOODS };
const mealPlans = {
  plans: [
    {
      id: "demo-meal",
      name: "Lean bulk — 2,400 kcal",
      status: "published",
      publishedAt: at(20, 9),
      body: {
        mealOptions: [
          { mealType: "breakfast", mealName: "Oats & whey", foods: [{ foodId: "fd0", quantity: 80, unit: "g" }, { foodId: "fd1", quantity: 30, unit: "g" }] },
          { mealType: "breakfast", mealName: "Greek yogurt bowl", foods: [{ foodId: "fd5", quantity: 200, unit: "g" }, { foodId: "fd6", quantity: 30, unit: "g" }] },
          { mealType: "lunch", mealName: "Chicken, rice & greens", foods: [{ foodId: "fd2", quantity: 200, unit: "g" }, { foodId: "fd3", quantity: 150, unit: "g" }, { foodId: "fd4", quantity: 100, unit: "g" }] },
          { mealType: "dinner", mealName: "Salmon & sweet potato", foods: [{ foodId: "fd7", quantity: 180, unit: "g" }, { foodId: "fd8", quantity: 200, unit: "g" }] },
          { mealType: "snack", mealName: "Yogurt & almonds", foods: [{ foodId: "fd5", quantity: 150, unit: "g" }, { foodId: "fd6", quantity: 20, unit: "g" }] },
        ],
      },
    },
  ],
};
const foodLog = {
  entries: [
    { id: "e1", meal_type: "breakfast", label: "Oats, berries & whey", calories: 520, protein_g: 38, carbs_g: 62, fat_g: 12, quantity: 1, unit: "bowl", image_url: null },
    { id: "e2", meal_type: "lunch", label: "Chicken, rice & greens", calories: 640, protein_g: 55, carbs_g: 70, fat_g: 16, quantity: 1, unit: "plate", image_url: null },
    { id: "e3", meal_type: "snack", label: "Greek yogurt & almonds", calories: 320, protein_g: 24, carbs_g: 18, fat_g: 16, quantity: 1, unit: "cup", image_url: null },
    { id: "e4", meal_type: "dinner", label: "Salmon & sweet potato", calories: 200, protein_g: 15, carbs_g: 8, fat_g: 8, quantity: 1, unit: "portion", image_url: null },
  ],
};

// ── Wellness ────────────────────────────────────────────────────────────────
const wellnessScore = {
  score: 78,
  band: "strong",
  pillars: [
    { key: "training", label: "Training", score: 86, weight: 1, available: true },
    { key: "nutrition", label: "Nutrition", score: 74, weight: 1, available: true },
    { key: "sleep", label: "Sleep", score: 71, weight: 1, available: true },
    { key: "consistency", label: "Consistency", score: 88, weight: 1, available: true },
    { key: "hydration", label: "Hydration", score: 65, weight: 1, available: true },
    { key: "mood", label: "Mood", score: 80, weight: 1, available: true },
  ],
};
const fasting = { activeFast: null, recentFasts: [{ duration_minutes: 16 * 60, target_hours: 16 }, { duration_minutes: 18 * 60, target_hours: 16 }] };
const sessions = { sessions: [{ id: "sess1", scheduled_at: at(-3, 17, 0), duration_minutes: 45, status: "scheduled" }, { id: "sess2", scheduled_at: at(6, 17, 0), duration_minutes: 45, status: "completed" }] };
const checkIns = {
  checkIns: range(6).map((i) => ({
    id: `c${i}`, date_local: dayISO(i), weight_kg: Math.round((82 - i * 0.1) * 10) / 10,
    mood: wave(i, 4, 1), energy: wave(i, 4, 1), stress: wave(i, 2, 1), sleep_quality: wave(i, 4, 1), sleep_hours: 7 + (i % 3) * 0.5,
    water_ml: 2200, steps_count: 8500 - i * 200, notes: i === 0 ? "Feeling strong today" : null,
    photos_json: null, trainer_feedback: i === 1 ? "Great consistency — keep it up!" : null, feedback_at: i === 1 ? at(1, 9) : null,
  })),
};
const labs = { labs: [{ id: "l1", display_name: "Full blood panel", status: "reviewed", values: [{ marker: "Vitamin D", value: "42", unit: "ng/mL", flag: "normal" }, { marker: "Ferritin", value: "38", unit: "ng/mL", flag: "low" }], reviewed_at: at(10, 12) }] };

// ── Train ────────────────────────────────────────────────────────────────
// Exercise library the session player resolves names/thumbs/how-to from.
const EX = [
  { id: "ex0", name: "Barbell Bench Press", muscle_groups: "chest", secondary_muscle_groups: "triceps,shoulders", equipment: "barbell", difficulty: "intermediate", force: "push", mechanic: "compound", category: "strength", instructions_md: "Lie flat, grip just outside shoulder width. Lower the bar to mid-chest, then press up until arms lock out.", thumb_url: null, thumb2_url: null, video_url: null, active: 1 },
  { id: "ex1", name: "Bent-over Row", muscle_groups: "back", secondary_muscle_groups: "biceps", equipment: "barbell", difficulty: "intermediate", force: "pull", mechanic: "compound", category: "strength", instructions_md: "Hinge at the hips, back flat. Row the bar to your lower ribs, squeezing the shoulder blades.", thumb_url: null, thumb2_url: null, video_url: null, active: 1 },
  { id: "ex2", name: "Overhead Press", muscle_groups: "shoulders", secondary_muscle_groups: "triceps", equipment: "barbell", difficulty: "intermediate", force: "push", mechanic: "compound", category: "strength", instructions_md: "Brace your core and press the bar overhead until your arms lock out, then lower under control.", thumb_url: null, thumb2_url: null, video_url: null, active: 1 },
  { id: "ex3", name: "Lat Pulldown", muscle_groups: "back", secondary_muscle_groups: "biceps", equipment: "cable", difficulty: "beginner", force: "pull", mechanic: "compound", category: "strength", instructions_md: "Pull the bar to your upper chest, driving the elbows down and back. Control the return.", thumb_url: null, thumb2_url: null, video_url: null, active: 1 },
  { id: "ex4", name: "Dumbbell Curl", muscle_groups: "biceps", secondary_muscle_groups: "forearms", equipment: "dumbbell", difficulty: "beginner", force: "pull", mechanic: "isolation", category: "strength", instructions_md: "Curl the dumbbells without swinging, squeeze at the top, lower slowly.", thumb_url: null, thumb2_url: null, video_url: null, active: 1 },
];
const exercises = { exercises: EX };

// A block whose slots each carry a rich `sets` array — matching WorkoutBody so
// the session player renders dots, targets, rest clocks and modifiers.
const wset = (i: number) => ({ setType: "working", weightMode: "absolute", weightValue: 40 + i * 10, reps: 8, restAfterSec: 90, rpe: 8 });
const blk = (slots: number, sets = 3) => ({ type: "single", slots: range(slots).map((s) => ({ exerciseId: `ex${s}`, measurementMode: "reps", sets: range(sets).map(() => wset(s)) })) });
const workoutPlans = {
  plans: [
    {
      id: "demo-plan", name: "Upper / Lower Split", status: "published",
      body: {
        days: [
          { name: "Upper A", blocks: [blk(5), blk(1)] },
          { name: "Lower A", blocks: [blk(5)] },
          { name: "Rest", isRestDay: true, blocks: [] },
          { name: "Upper B", blocks: [blk(5)] },
          { name: "Lower B", blocks: [blk(5)] },
        ],
      },
    },
  ],
};
const workoutSessions = {
  sessions: range(6).map((i) => ({
    id: `ws${i}`, date_local: dayISO(i * 2),
    entries: range(4).map((e) => ({ exerciseId: `ex${e}`, sets: range(3).map(() => ({ reps: 8, weightKg: 60 + e * 10, effortLabel: "perfect" as const, completed: true })) })),
  })),
};
const activityLogs = { activities: [{ id: "a1", date_local: dayISO(1), activity_key: "running", label: "Morning run", duration_min: 32, calories: 340 }, { id: "a2", date_local: dayISO(3), activity_key: "cycling", label: "Commute", duration_min: 25, calories: 210 }] };

// ── Eat week strip ────────────────────────────────────────────────────────
const nutritionWeek = {
  days: range(7).map((i) => ({ date: dayISO(6 - i), calories: 2100 + wave(i, 200, 250), proteinG: 150 + wave(i, 20, 25), waterMl: 2000 + wave(i, 400, 500), logged: true })),
  targets: { calories: 2400, proteinG: 180, waterMl: 3000 },
};

// ── Progress ────────────────────────────────────────────────────────────────
function progress(rangeKey: string) {
  const n = rangeKey === "7d" ? 7 : rangeKey === "90d" ? 90 : 30;
  const days = range(n).map((i) => dayISO(n - 1 - i));
  const wk = Math.ceil(n / 7);
  return {
    range: { start: days[0], end: days[days.length - 1], days },
    today: TODAY,
    body: {
      weight: range(Math.min(n, 12)).map((i) => ({ date: days[Math.floor((i / 12) * (n - 1))]!, v: Math.round((83 - i * 0.15) * 10) / 10 })),
      bodyFat: range(6).map((i) => ({ date: days[Math.floor((i / 6) * (n - 1))]!, v: Math.round((19 - i * 0.3) * 10) / 10 })),
      waist: range(6).map((i) => ({ date: days[Math.floor((i / 6) * (n - 1))]!, v: Math.round((84 - i * 0.4) * 10) / 10 })),
      latest: { weightKg: 81.2, bodyFatPct: 17.2, waistCm: 81.5, neckCm: 39, hipsCm: 98, chestCm: 104 },
      deltas: { weight: { delta: -1.8 }, bodyFat: { delta: -1.8 }, waist: { delta: -2.5 } },
    },
    nutrition: {
      perDay: days.map((date, i) => ({ date, calories: 2100 + wave(i, 200, 250), protein: 150 + wave(i, 20, 25), carbs: 220, fat: 68, logged: i % 5 !== 4 })),
      targets: { targetCalories: 2400, targetProteinG: 180 },
      adherencePct: 86, loggedDays: Math.round(n * 0.8),
    },
    training: {
      perDay: days.map((date, i) => ({ date, tonnage: i % 2 === 0 ? 7000 + wave(i, 1000, 1200) : 0, load: i % 2 === 0 ? 480 : 0, sets: i % 2 === 0 ? 18 : 0 })),
      weekly: range(wk).map((w) => ({ week: `W${w + 1}`, tonnage: 34000 + wave(w, 3000, 4000), load: 1900 + wave(w, 150, 200), sets: 78 + wave(w, 6, 8) })),
      totalTonnage: 168000, totalSets: 320, workoutDays: Math.round(n * 0.42),
      prs: [
        { exerciseId: "ex1", name: "Barbell bench press", thumb: null, e1rm: 108, weight: 95, reps: 5 },
        { exerciseId: "ex2", name: "Back squat", thumb: null, e1rm: 145, weight: 130, reps: 4 },
        { exerciseId: "ex3", name: "Deadlift", thumb: null, e1rm: 178, weight: 160, reps: 3 },
        { exerciseId: "ex4", name: "Overhead press", thumb: null, e1rm: 64, weight: 55, reps: 6 },
      ],
    },
    wellness: {
      perDay: days.map((date, i) => ({ date, mood: wave(i, 4, 1), energy: wave(i, 4, 1), stress: wave(i, 2, 1), sleepQuality: wave(i, 4, 1), sleepHours: 7 + (i % 3) * 0.5 })),
      averages: { mood: 4.1, energy: 3.9, stress: 2.2, sleepQuality: 3.8, sleepHours: 7.3 },
      radar: { mood: 82, energy: 78, sleep: 74, calm: 70, consistency: 88 },
      index: 4.1,
    },
    consistency: {
      heatmap: Object.fromEntries(days.map((d, i) => [d, i % 5 === 4 ? 0 : (i % 2) + 1])),
      checkInDays: Math.round(n * 0.7), streak: 5, longestStreak: 12, consistencyPct: 82,
      weekFlags: [true, true, false, true, true, true, false],
    },
  };
}

// ── Resolver ────────────────────────────────────────────────────────────────
/** Match a request to mock data. Returns the payload, or `undefined` to fall
 *  through to the network (unknown GETs); swallows every write. */
export function tourInterceptor(method: string, path: string): unknown | undefined {
  const p = path.split("?")[0] ?? path;
  if (method !== "GET") {
    // Swallow writes so tapping around during the tour never persists.
    return { ok: true };
  }
  if (p === "/api/today") return today;
  if (p === "/api/activity-history") return feed;
  if (p === "/api/supplements/logs") return suppLogs;
  if (p === "/api/supplements") return supplements;
  if (p === "/api/meal-plans") return mealPlans;
  if (p === "/api/logs/food") return foodLog;
  if (p === "/api/logs/nutrition/week") return nutritionWeek;
  if (p === "/api/fasting") return fasting;
  if (p === "/api/wellness/score") return wellnessScore;
  if (p === "/api/workout-plans") return workoutPlans;
  if (p === "/api/exercises") return exercises;
  if (p === "/api/foods") return foods;
  if (p === "/api/logs/workout-sessions") return workoutSessions;
  if (p === "/api/logs/activities") return activityLogs;
  if (p === "/api/sessions") return sessions;
  if (p === "/api/check-ins") return checkIns;
  if (p === "/api/labs") return labs;
  if (p.startsWith("/api/progress/")) {
    const rk = new URLSearchParams(path.split("?")[1] ?? "").get("range") ?? "30d";
    return progress(rk);
  }
  if (p === "/api/ai/coach-note") return { message: "Strong week, Alex — training load is up and your protein's on point. Let's keep hydration a touch higher heading into the weekend." };
  return undefined; // /api/context, /api/me, media, etc. → real network
}
