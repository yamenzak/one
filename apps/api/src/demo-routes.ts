/**
 * Demo seeding (SPEC §12) — a platform-admin action that fills the caller's
 * active tenant with sample clients, a published plan, a goal, and a package,
 * so a fresh install demos instantly. Idempotent-ish (skips if clients exist).
 */

import { Hono } from "hono";
import { buildBudgetsForPurchase, calculateNutritionTargets } from "@mossa/domain";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { seedExercises } from "./exercise-seed.js";
import { newId, nowIso } from "./ids.js";
import { j } from "./db.js";

/** Sample clients. The "(demo)" suffix is load-bearing: this seeds into a real
 *  studio's roster, there is no un-seed route, and these records count against the
 *  plan's activeClients quota — so they must be obvious at a glance and trivially
 *  filterable when the owner comes to archive them. Realistic-looking names with
 *  no marker are indistinguishable from real clients. */
const SAMPLE_CLIENTS = [
  { name: "Sara Nadir (demo)", gender: "female", ageYears: 29, heightCm: 166, weightKg: 64, goal: "lose_weight" },
  { name: "Omar Haddad (demo)", gender: "male", ageYears: 34, heightCm: 181, weightKg: 88, goal: "build_muscle" },
  { name: "Lina Farah (demo)", gender: "female", ageYears: 41, heightCm: 159, weightKg: 71, goal: "improve_fitness" },
];

export const demoRoutes = new Hono<AppEnv>().post("/admin/seed-demo", async (c) => {
  const who = requireTenant(c);
  if (!who) return c.json({ error: "unauthenticated" }, 401);
  const db = c.env.DB;
  await seedExercises(db);

  const existing = await db.prepare("SELECT COUNT(*) AS n FROM clients WHERE tenant_id = ?").bind(who.tenantId).first<{ n: number }>();
  if ((existing?.n ?? 0) > 0) return c.json({ ok: true, skipped: "clients already exist" });

  const now = nowIso();
  const exerciseIds = (
    await db.prepare("SELECT id FROM exercises WHERE tenant_id IS NULL LIMIT 6").all<{ id: string }>()
  ).results?.map((r) => r.id) ?? [];

  // A sample package — deliberately `private`, NOT `marketplace`.
  //
  // This seeder writes into the CALLER'S OWN tenant, which on a production
  // deployment is a real studio. A `marketplace` package is live in every one of
  // that studio's clients' Shop and genuinely purchasable, so seeding demo data
  // used to put a $249 "12-Week Transformation" on sale to real people. `private`
  // keeps it visible to staff (so the demo still shows a package) while making it
  // grant-only, so nobody can buy it by accident.
  await db
    .prepare(
      "INSERT INTO packages (id, tenant_id, name, description, one_time_price_cents, budgets_json, visibility, active, created_at) VALUES (?, ?, '12-Week Transformation (demo)', 'Sample package created by demo seeding — safe to archive.', 24900, ?, 'private', 1, ?)",
    )
    .bind(newId("pkg"), who.tenantId, j([{ feature: "all", days: 84 }]), now)
    .run();

  for (const s of SAMPLE_CLIENTS) {
    const clientId = newId("cli");
    await db
      .prepare(
        "INSERT INTO clients (id, tenant_id, display_name, gender, height_cm, onboarding_complete, intake_json, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
      )
      .bind(clientId, who.tenantId, s.name, s.gender, s.heightCm, j({ primaryGoal: s.goal, experienceLevel: "intermediate", activityLevel: "moderate", dietaryApproach: "balanced", availableDays: ["Mon", "Wed", "Fri"] }), now)
      .run();
    await db.prepare("INSERT INTO client_trainers (client_id, trainer_user_id, tenant_id, is_primary, created_at) VALUES (?, ?, ?, 1, ?)").bind(clientId, who.userId, who.tenantId, now).run();

    // A starting measurement.
    await db.prepare("INSERT INTO measurements (id, tenant_id, client_id, date_local, weight_kg, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(newId("mea"), who.tenantId, clientId, now.slice(0, 10), s.weightKg, now).run();

    // A goal with real TDEE targets.
    const targets = calculateNutritionTargets({
      gender: s.gender as "male" | "female",
      ageYears: s.ageYears,
      heightCm: s.heightCm,
      weightKg: s.weightKg,
      activityLevel: "moderate",
      primaryGoal: s.goal as "lose_weight" | "build_muscle" | "improve_fitness",
      dietaryApproach: "balanced",
    });
    await db
      .prepare("INSERT INTO client_goals (id, tenant_id, client_id, label, status, start_date, targets_json, derivation_json, weekly_load_target, created_by, created_at) VALUES (?, ?, ?, 'Starting phase', 'active', ?, ?, ?, 300, ?, ?)")
      .bind(newId("goal"), who.tenantId, clientId, now.slice(0, 10), j(targets), j(targets.derivation), who.userId, now)
      .run();

    // A published workout plan (3 days, from the seed library).
    if (exerciseIds.length >= 4) {
      const body = {
        days: [0, 1, 2].map((di) => ({
          name: ["Full Body A", "Full Body B", "Full Body C"][di],
          isRestDay: false,
          blocks: [
            {
              type: "single",
              slots: exerciseIds.slice(di, di + 3).map((exId) => ({
                exerciseId: exId,
                measurementMode: "reps",
                sets: [
                  { setType: "working", reps: 8, weightMode: "unspecified", restAfterSec: 90 },
                  { setType: "working", reps: 8, weightMode: "unspecified", restAfterSec: 90 },
                  { setType: "working", reps: 10, weightMode: "unspecified", restAfterSec: 90 },
                ],
              })),
            },
          ],
        })),
      };
      await db
        .prepare("INSERT INTO workout_plans (id, tenant_id, client_id, name, status, published_at, body_json, created_by, created_at, updated_at) VALUES (?, ?, ?, 'Foundation', 'published', ?, ?, ?, ?, ?)")
        .bind(newId("wpl"), who.tenantId, clientId, now, j(body), who.userId, now, now)
        .run();
    }
  }

  return c.json({ ok: true, seeded: SAMPLE_CLIENTS.length });
});
