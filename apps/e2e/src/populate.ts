/**
 * Give a client a plausible fortnight of history.
 *
 * Every screenshot taken during the UI rewrite was of a brand-new account, so
 * every review was a review of EMPTY STATES. The widget carousel, the day
 * agenda, the activity feed, the food diary, the weight trend and the check-in
 * history had never once been looked at with data in them — which is exactly
 * where cramming, bad wrapping and confusing copy live.
 *
 * This is deliberately not "one of everything": it is the shape of a real
 * client. Some days are missed, weight drifts down with noise rather than in a
 * straight line, and the calorie log lands near a target rather than on it.
 * Perfectly uniform data hides layout problems — every row the same width, every
 * number the same digit count — and those are precisely the problems worth
 * finding.
 */

import type { Page } from "@playwright/test";
import type { Client, Studio } from "./provision.js";

/** `YYYY-MM-DD`, `n` days before `from` (default today, local). */
export function dayBefore(n: number, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Park the page on the APP, not on `/health`.
 *
 * `/health` is dependency-free JSON served by the worker with no app on it, and
 * a write issued from that document comes back 401 even though the very same
 * page can read `/api/context` fine. Booting the SPA once settles the session's
 * active organization, and every write after that succeeds. Worth an explicit
 * step rather than a mystery.
 */
async function ready(page: Page, base: string): Promise<void> {
  if (page.url().startsWith(`${base}/`) && !page.url().endsWith("/health")) return;
  await page.goto(`${base}/`);
  await page.waitForTimeout(1200);
}

async function call(page: Page, base: string, path: string, body: unknown): Promise<void> {
  await ready(page, base);
  const out = await page.evaluate(
    async ([p, b]: [string, string]) => {
      const res = await fetch(p, { method: "POST", headers: { "content-type": "application/json" }, body: b });
      return { ok: res.ok, status: res.status, text: await res.text() };
    },
    [path, JSON.stringify(body)] as [string, string],
  );
  if (!out.ok) throw new Error(`POST ${base}${path} -> ${out.status} ${out.text}`);
}

const MEALS = [
  { label: "Greek yoghurt, berries & honey", mealType: "breakfast", calories: 410, proteinG: 32, carbsG: 44, fatG: 11 },
  { label: "Chicken, rice & broccoli", mealType: "lunch", calories: 640, proteinG: 52, carbsG: 68, fatG: 14 },
  { label: "Salmon, sweet potato & greens", mealType: "dinner", calories: 720, proteinG: 46, carbsG: 55, fatG: 32 },
  { label: "Whey shake & banana", mealType: "snack", calories: 280, proteinG: 26, carbsG: 34, fatG: 3 },
];

const ACTIVITIES = [
  { activityKey: "walking", label: "Walk", durationMin: 42, distanceM: 3600 },
  { activityKey: "running", label: "Easy run", durationMin: 28, distanceM: 5100, avgHrBpm: 148 },
  { activityKey: "cycling", label: "Commute ride", durationMin: 35, distanceM: 11200 },
];

/**
 * 14 days of logs for one client, written as the CLIENT (so every row lands on
 * the same row-level scope a real one would).
 */
export async function populateClient(client: Client, days = 14): Promise<void> {
  const { page, base, id } = client;
  const post = (path: string, data: unknown) => call(page, base, path, { clientId: id, data });

  let weight = 82.4;
  for (let i = days - 1; i >= 0; i--) {
    const date = dayBefore(i);
    // A missed day every so often — a perfect streak hides how a gap renders.
    const skipped = i === 3 || i === 9;

    if (!skipped) {
      for (const m of MEALS.slice(0, i % 4 === 0 ? 3 : 4)) {
        await post("/api/logs/food", { ...m, date, quantity: 1, unit: "serving" });
      }
      await post("/api/logs/water", { date, amountMl: 1800 + ((i * 137) % 900) });
    }

    // Weight drifts down with real noise, not a straight line.
    weight -= 0.06 + ((i * 7) % 5) / 100;
    if (i % 2 === 0) await post("/api/measurements", { date, weightKg: Math.round(weight * 10) / 10 });

    if (!skipped && i % 3 === 0) {
      const a = ACTIVITIES[i % ACTIVITIES.length]!;
      await post("/api/logs/activity", { ...a, date, startTime: "07:15" });
    }

    if (!skipped) {
      await post("/api/check-ins", {
        date,
        weightKg: Math.round(weight * 10) / 10,
        mood: 3 + (i % 3 === 0 ? 1 : 0),
        energy: 3 + (i % 4 === 0 ? 1 : 0),
        stress: 2 + (i % 5 === 0 ? 1 : 0),
        sleepQuality: 3 + (i % 3 === 0 ? 1 : 0),
        sleepHours: 6.5 + ((i * 3) % 4) * 0.4,
        notes: i === 1 ? "Knee felt better on today's run. Sleep still short midweek." : null,
      });
    }
  }
}

/** A goal with real targets, set by the coach — most client screens key off it. */
export async function setTargets(studio: Studio, client: Client): Promise<void> {
  await call(studio.page, studio.base, "/api/goals", {
    clientId: client.id,
    label: "Lean out for summer",
    startDate: dayBefore(30),
    // GoalTargetsSchema is `.strict()` — an unknown key 400s the whole call.
    targets: {
      targetCalories: 2100,
      targetProteinG: 165,
      targetCarbsG: 210,
      targetFatG: 62,
      targetWaterMl: 3000,
      weeklyTrainingLoad: 420,
    },
  });
}

/**
 * Names for a roster, longest first.
 *
 * One client hides everything a list does — no truncation, no sorting stress,
 * no mixed states side by side — so a review wants several. **How many you
 * actually get is the plan's business:** the free baseline caps a studio at
 * three active clients and the server refuses the fourth, which is correct.
 * `populateRoster` stops at that wall rather than pretending, because the
 * alternative (a fixture reaching for the operator door to raise its own
 * quota) is exactly the kind of thing that makes a test suite lie about what
 * the product does.
 *
 * The first name is deliberately long: a roster row has to survive one.
 */
export const ROSTER_NAMES = [
  "Amara Okonkwo-Fitzgerald",
  "Ben Ho",
  "Carla Ruiz",
  "Dimitri Volkov",
  "Elena Petrova",
  "Farouk Al-Amin",
  "Grace Lindqvist",
  "Hana Kobayashi",
  "Idris Bello",
] as const;

/**
 * Add `names` to the studio's roster, stopping cleanly at the plan's active-
 * client ceiling. Returns the ids actually created.
 */
export async function populateRoster(studio: Studio, names: readonly string[] = ROSTER_NAMES): Promise<string[]> {
  const ids: string[] = [];
  for (const [i, displayName] of names.entries()) {
    const email = `e2e-roster-${i}-${Math.random().toString(36).slice(2, 8)}@kova.test`;
    try {
      const created = await callJson<{ client: { id: string } }>(studio.page, studio.base, "/api/clients", { email, displayName });
      ids.push(created.client.id);
    } catch (e) {
      if (String(e).includes("active client limit")) break;
      throw e;
    }
  }
  return ids;
}

async function callJson<T>(page: Page, base: string, path: string, body: unknown): Promise<T> {
  await ready(page, base);
  const out = await page.evaluate(
    async ([p, b]: [string, string]) => {
      const res = await fetch(p, { method: "POST", headers: { "content-type": "application/json" }, body: b });
      return { ok: res.ok, status: res.status, text: await res.text() };
    },
    [path, JSON.stringify(body)] as [string, string],
  );
  if (!out.ok) throw new Error(`POST ${base}${path} -> ${out.status} ${out.text}`);
  return JSON.parse(out.text) as T;
}


/**
 * A real plan: four days, mixed block types, a rest day.
 *
 * A one-exercise plan is the workout equivalent of an empty account — it hides
 * the day carousel, the superset round-logging, the block rest clocks and every
 * name long enough to wrap. Built through the API because doing it through the
 * builder UI is thirty clicks that test nothing.
 */
export async function publishWorkoutPlan(
  studio: Studio,
  client: Client,
  exerciseIds: string[],
  name = "Upper / Lower Split",
): Promise<string> {
  const ex = (i: number) => exerciseIds[i % exerciseIds.length]!;
  const set = (reps: number, rest = 90) => ({ setType: "working", reps, weightMode: "unspecified", restAfterSec: rest });
  const slot = (i: number, sets: number, reps: number) => ({
    exerciseId: ex(i),
    measurementMode: "reps",
    sets: Array.from({ length: sets }, () => set(reps)),
  });

  const created = await callJson<{ plan: { id: string } }>(studio.page, studio.base, "/api/workout-plans", {
    clientId: client.id,
    name,
  });
  const planId = created.plan.id;

  await callPatch(studio.page, studio.base, `/api/workout-plans/${planId}`, {
    body: {
      days: [
        {
          name: "Upper A — push focus",
          isRestDay: false,
          blocks: [
            { type: "single", slots: [slot(0, 4, 8), slot(1, 3, 10)] },
            { type: "superset", rounds: 3, restBetweenRoundsSec: 120, slots: [slot(2, 1, 12), slot(3, 1, 12)] },
          ],
        },
        {
          name: "Lower A",
          isRestDay: false,
          blocks: [{ type: "single", slots: [slot(1, 5, 5), slot(2, 3, 8)] }],
        },
        { name: "Rest & mobility", isRestDay: true, blocks: [] },
        {
          name: "Upper B — pull focus",
          isRestDay: false,
          blocks: [
            { type: "single", slots: [slot(3, 4, 6)] },
            { type: "circuit", rounds: 4, restBetweenRoundsSec: 60, slots: [slot(0, 1, 15), slot(1, 1, 15), slot(2, 1, 15)] },
          ],
        },
      ],
    },
  });
  await callJson(studio.page, studio.base, `/api/workout-plans/${planId}/publish`, {});
  return planId;
}

async function callPatch(page: Page, base: string, path: string, body: unknown): Promise<void> {
  await ready(page, base);
  const out = await page.evaluate(
    async ([p, b]: [string, string]) => {
      const res = await fetch(p, { method: "PATCH", headers: { "content-type": "application/json" }, body: b });
      return { ok: res.ok, status: res.status, text: await res.text() };
    },
    [path, JSON.stringify(body)] as [string, string],
  );
  if (!out.ok) throw new Error(`PATCH ${base}${path} -> ${out.status} ${out.text}`);
}
