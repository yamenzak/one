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
import { carrySessionTo } from "./app.js";
import { ADMIN_URL, ROOT_DOMAIN, SETUP_URL } from "./env.js";

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

/**
 * Two goal phases, in order — most client screens key off the live one, and the
 * Goals screen keys off having MORE THAN ONE.
 *
 * A single goal is the state every seeded world had, and it is the state where
 * the phase chart correctly refuses to draw: one bar is not a comparison. So the
 * demo world carries a superseded phase as well, which is also the honest shape
 * of a real client — nobody is on their first eight weeks forever.
 */
export async function setTargets(studio: Studio, client: Client): Promise<void> {
  // GoalTargetsSchema is `.strict()` — an unknown key 400s the whole call.
  await call(studio.page, studio.base, "/api/goals", {
    clientId: client.id,
    label: "Base build",
    startDate: dayBefore(90),
    notes: "Eat at maintenance, get the lifts moving, no deficit yet.",
    targets: {
      targetCalories: 2450,
      targetProteinG: 150,
      targetCarbsG: 275,
      targetFatG: 78,
      targetWaterMl: 2800,
      weeklyTrainingLoad: 340,
    },
  });
  await call(studio.page, studio.base, "/api/goals", {
    clientId: client.id,
    label: "Lean out for summer",
    startDate: dayBefore(30),
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
    const email = rosterEmail(displayName, i);
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

/**
 * A plausible address for a seeded client — because the roster SHOWS it.
 *
 * It used to be `e2e-roster-3-pitr6d@kova.test`, which was fine while these
 * rows were only ever asserted on. They are now photographed (UI-LANGUAGE §16),
 * and a screenshot with a placeholder in it teaches the reader that the product
 * is a demo. Derived from the name, so it is also the right LENGTH — the thing
 * a roster row actually has to survive.
 *
 * `@example.com` is reserved by RFC 2606 and can never be delivered to, which
 * matters because these are real invitations on a real send path.
 */
function rosterEmail(displayName: string, i: number): string {
  const local = displayName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]+/g, ".")
    .replace(/^\.|\.$/g, "");
  // A suffix, because the suite runs repeatedly against one dev database and an
  // address that already exists is a different (and correct) refusal.
  return `${local}.${Math.random().toString(36).slice(2, 5)}@example.com`;
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

/**
 * A small, real food library — enough that the meal builder photographs as a
 * plan rather than as a set of empty slots, and enough VARIETY that the macro
 * bars differ from row to row.
 */
const DEMO_FOODS = [
  { name: "Rolled oats", servingSize: 40, calories: 150, proteinG: 5, carbsG: 27, fatG: 3, fiberG: 4 },
  { name: "Greek yoghurt, 2%", servingSize: 170, calories: 145, proteinG: 17, carbsG: 8, fatG: 4 },
  { name: "Blueberries", servingSize: 80, calories: 46, proteinG: 1, carbsG: 11, fatG: 0, fiberG: 2 },
  { name: "Chicken breast", servingSize: 150, calories: 248, proteinG: 46, carbsG: 0, fatG: 5 },
  { name: "Basmati rice, cooked", servingSize: 180, calories: 234, proteinG: 5, carbsG: 51, fatG: 1 },
  { name: "Broccoli", servingSize: 120, calories: 41, proteinG: 3, carbsG: 8, fatG: 0, fiberG: 3 },
  { name: "Salmon fillet", servingSize: 140, calories: 291, proteinG: 32, carbsG: 0, fatG: 18 },
  { name: "Sweet potato", servingSize: 200, calories: 172, proteinG: 3, carbsG: 40, fatG: 0, fiberG: 6 },
  { name: "Whey isolate", servingSize: 30, calories: 113, proteinG: 25, carbsG: 2, fatG: 1 },
  { name: "Almonds", servingSize: 30, calories: 174, proteinG: 6, carbsG: 6, fatG: 15, fiberG: 4 },
] as const;

/** Create the demo food library. Returns ids in the order above. */
export async function seedFoods(studio: Studio): Promise<string[]> {
  const ids: string[] = [];
  for (const f of DEMO_FOODS) {
    const r = await callJson<{ id: string }>(studio.page, studio.base, "/api/foods", {
      ...f, servingUnit: "g", visibility: "tenant", source: "custom", sourceId: `demo-${f.name.toLowerCase().replace(/[^a-z]+/g, "-")}`,
    });
    ids.push(r.id);
  }
  return ids;
}

/**
 * A published meal plan: a BANK OF OPTIONS, two or three per meal, which is the
 * shape the builder is designed around and the shape a one-option seed cannot
 * show. Free-meal and per-meal-range affordances both need more than one.
 */
export async function publishMealPlan(studio: Studio, client: Client, foodIds: string[], name = "Lean phase — options"): Promise<string> {
  const f = (i: number) => foodIds[i % foodIds.length]!;
  const food = (i: number, quantity: number) => ({ foodId: f(i), quantity, unit: "g" });
  const created = await callJson<{ plan: { id: string } }>(studio.page, studio.base, "/api/meal-plans", { clientId: client.id, name });
  const planId = created.plan.id;
  await callPatch(studio.page, studio.base, `/api/meal-plans/${planId}`, {
    body: {
      customMealTypes: [],
      hiddenMealTypes: ["pre_workout", "post_workout"],
      mealOptions: [
        { mealType: "breakfast", mealName: "Oats, yoghurt & berries", isFree: false, foods: [food(0, 60), food(1, 170), food(2, 80)] },
        { mealType: "breakfast", mealName: "Protein shake & almonds", isFree: false, foods: [food(8, 30), food(9, 30), food(2, 60)] },
        { mealType: "lunch", mealName: "Chicken, rice & broccoli", isFree: false, foods: [food(3, 150), food(4, 180), food(5, 120)] },
        { mealType: "lunch", mealName: "Salmon & sweet potato", isFree: false, foods: [food(6, 140), food(7, 200), food(5, 120)] },
        { mealType: "dinner", mealName: "Salmon, rice & greens", isFree: false, foods: [food(6, 120), food(4, 150), food(5, 150)] },
        { mealType: "dinner", mealName: "Eat out", isFree: true, foods: [], freeMealMaxCalories: 800 },
        { mealType: "snack", mealName: "Yoghurt & almonds", isFree: false, foods: [food(1, 170), food(9, 20)] },
      ],
    },
  });
  await callJson(studio.page, studio.base, `/api/meal-plans/${planId}/publish`, {});
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

/**
 * Put a studio on bigger entitlements for a review run.
 *
 * Uses the real operator route — `PATCH /api/admin/tenants/:id/overrides`,
 * which answers on the `admin.` door and grants quotas/features exactly as the
 * platform console does. **Requires `E2E_DEV_ADMIN=1`** so that
 * `isPlatformAdmin` falls back to its development lane; see the note in
 * playwright.config.ts for why that is opt-in.
 *
 * This exists because whole surfaces are invisible on the free baseline —
 * Sessions and Packages render a FeatureLock card, and the roster stops at
 * three — so they had never been looked at with anything in them. It grants;
 * it does not fake. Every screen still resolves its own entitlements the
 * normal way.
 */
export async function grantEntitlements(
  studio: Studio,
  grants: { quotas?: Record<string, number>; features?: Record<string, boolean> },
): Promise<void> {
  await carrySessionTo(studio.context, SETUP_URL, `admin.${ROOT_DOMAIN}`);
  const page = await studio.context.newPage();
  try {
    await page.goto(`${ADMIN_URL}/health`);
    const out = await page.evaluate(
      async ([path, body]: [string, string]) => {
        const res = await fetch(path, { method: "PATCH", headers: { "content-type": "application/json" }, body });
        return { ok: res.ok, status: res.status, text: await res.text() };
      },
      [`/api/admin/tenants/${studio.tenantId}/overrides`, JSON.stringify({ grants })] as [string, string],
    );
    if (!out.ok) {
      throw new Error(
        `PATCH overrides -> ${out.status} ${out.text}` +
          (out.status === 403 ? " (run with E2E_DEV_ADMIN=1)" : ""),
      );
    }
  } finally {
    await page.close();
  }
}

/**
 * Put a studio on a real PLAN, comped — no Stripe, no card, the same row the
 * webhook would have written.
 *
 * Distinct from `grantEntitlements` above, and the difference matters for a
 * screenshot run: an override raises the ceilings but leaves the studio with no
 * SUBSCRIPTION, so every screen keeps its "No subscription — choose a plan"
 * banner. That banner is honest and it is also in every image, which makes the
 * product look permanently unfinished. Comping puts the studio in the state a
 * paying customer is actually in, and the entitlements then come from the plan
 * the way they do for that customer, rather than from a grant nobody bought.
 */
export async function compOntoPlan(studio: Studio, planId: string): Promise<void> {
  await carrySessionTo(studio.context, SETUP_URL, `admin.${ROOT_DOMAIN}`);
  const page = await studio.context.newPage();
  try {
    await page.goto(`${ADMIN_URL}/health`);
    const out = await page.evaluate(
      async ([path, body]: [string, string]) => {
        const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body });
        return { ok: res.ok, status: res.status, text: await res.text() };
      },
      [`/api/admin/tenants/${studio.tenantId}/plan`, JSON.stringify({ planId, comp: true })] as [string, string],
    );
    if (!out.ok) {
      throw new Error(`POST comp plan -> ${out.status} ${out.text}` + (out.status === 403 ? " (run with E2E_DEV_ADMIN=1)" : ""));
    }
  } finally {
    await page.close();
  }
}

/**
 * A front desk with something in it: two session types and a booking.
 *
 * The Sessions screen has two states worth reviewing and they look nothing
 * alike — first-run (no types, no bookings, which is what a real new studio
 * sees) and running (a booked card with its complete / no-show / cancel row,
 * and the "what you offer" list). Seeding the second one is the only way to
 * see the first one is not the only design that matters.
 */
export async function seedFrontDesk(studio: Studio, clientId: string): Promise<void> {
  const types = [
    { label: "Nutrition consultation", durationMinutes: 45, standalonePriceCents: 6000 },
    { label: "InBody scan & review", durationMinutes: 20 },
  ];
  const created: string[] = [];
  for (const t of types) {
    const r = await callJson<{ id: string }>(studio.page, studio.base, "/api/addon-types", t);
    created.push(r.id);
  }
  // Booking is refused without an unspent prepaid session, and that balance
  // comes from a PACKAGE SUBSCRIPTION — which needs the Connect rail, i.e. real
  // Stripe. So on a seeded studio this call usually 409s and the shot shows the
  // "types defined, nothing booked yet" state. That is a real state (it is what
  // every studio sees between setting up and taking its first booking), so the
  // capture is still worth having; the booked-card state is only reachable with
  // Stripe configured, and is reviewed from the Packages rail instead.
  const when = new Date(Date.now() + 2 * 86_400_000);
  when.setHours(16, 30, 0, 0);
  try {
    await callJson(studio.page, studio.base, "/api/sessions", {
      clientId,
      addOnTypeId: created[0],
      scheduledAt: when.toISOString(),
      durationMinutes: 45,
      notes: "Bring the last two weeks of food logs.",
    });
  } catch (e) {
    // No balance on this client's package — the empty upcoming list is still a
    // legitimate shot, so say so rather than failing the whole capture.
    console.warn(`[seedFrontDesk] booking skipped: ${String(e).slice(0, 200)}`);
  }
}
