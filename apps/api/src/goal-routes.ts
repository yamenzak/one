/**
 * Goal phases (SPEC §8.2) — trainer-set targets + healthy ranges. Creating a
 * new active goal supersedes the previous one. The TDEE calculator runs
 * server-side here so targets always persist with their derivation.
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  calculateNutritionTargets,
  validateCalculatorInputs,
  resolveWeeklyLoadTarget,
  type ActivityLevel,
  type DietaryApproach,
  type Gender,
  type PrimaryGoal,
} from "@mossa/domain";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { requireClientAccess } from "./clients.js";
import { notify } from "./notify.js";
import { recordAudit } from "./audit.js";
import { newId, nowIso } from "./ids.js";
import { parseJson, j } from "./db.js";

/** YYYY-MM-DD — the goal timeline orders by string comparison on start_date, so
 *  a non-LocalDate start silently corrupts per-day goal resolution. */
const LocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

/** Strict, numeric goal targets (mirrors the GoalTargets interface in goals.ts).
 *  Bounded + finite so junk can never reach targets_json — a non-numeric or NaN
 *  target would otherwise 500 every subsequent food log that binds the snapshot
 *  and poison adherence math downstream. */
const GoalTargetsSchema = z
  .object({
    targetCalories: z.number().min(0).max(20000).optional(),
    targetProteinG: z.number().min(0).max(2000).optional(),
    targetCarbsG: z.number().min(0).max(3000).optional(),
    targetFatG: z.number().min(0).max(2000).optional(),
    targetFiberG: z.number().min(0).max(500).optional(),
    targetWaterMl: z.number().min(0).max(30000).optional(),
    // Weekly training-load target (SPEC §8.11) — the coach GoalManager writes it
    // into targets_json alongside the nutrition targets.
    weeklyTrainingLoad: z.number().int().min(0).max(2000).nullish(),
  })
  .strict();

const CreateGoal = z.object({
  clientId: z.string().min(1),
  label: z.string().min(1).max(120),
  startDate: LocalDate.nullish(),
  endDate: LocalDate.nullish(),
  /** Legacy body-level alias for `targets.weeklyTrainingLoad`. NO default: it
   *  used to default to 300, which is how the `weekly_load_target` column ended
   *  up pinned at 300 for every goal (no client has ever sent this field) while
   *  the coach's real value lived in targets_json. Absent now means absent. */
  weeklyLoadTarget: z.number().int().min(0).max(2000).optional(),
  /** Explicit targets, or `calculator` inputs to derive them server-side. */
  targets: GoalTargetsSchema.nullish(),
  calculator: z
    .object({
      gender: z.enum(["male", "female"]),
      ageYears: z.number().int().min(13).max(120),
      heightCm: z.number().positive(),
      weightKg: z.number().positive(),
      bodyFatPercent: z.number().positive().nullish(),
      activityLevel: z.enum(["sedentary", "light", "moderate", "very_active"]),
      primaryGoal: z.enum(["lose_weight", "build_muscle", "maintain", "improve_fitness"]),
      dietaryApproach: z.enum(["balanced", "high_protein", "low_carb", "keto", "vegan", "vegetarian"]),
    })
    .nullish(),
  /** Healthy ranges per metric → In range / Off track chips (SPEC §8.11). */
  ranges: z.record(z.string(), z.object({ min: z.number().nullish(), max: z.number().nullish() })).nullish(),
  notes: z.string().max(2000).nullish(),
});

export const goalRoutes = new Hono<AppEnv>()
  .get("/goals", async (c) => {
    const clientId = c.req.query("clientId");
    if (!clientId) return c.json({ error: "clientId required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    const rows = await c.env.DB.prepare(
      `SELECT g.*, u.name AS created_by_name
         FROM client_goals g LEFT JOIN "user" u ON u.id = g.created_by
        WHERE g.client_id = ? ORDER BY g.created_at DESC LIMIT 20`,
    )
      .bind(clientId)
      .all();
    return c.json({
      goals: (rows.results ?? []).map((r) => {
        const targets = parseJson(r.targets_json as string | null, null);
        return {
          ...r,
          targets,
          ranges: parseJson(r.ranges_json as string | null, null),
          derivation: parseJson(r.derivation_json as string | null, null),
          // The resolved, single-source-of-truth weekly load target. Callers read
          // THIS, not `targets.weeklyTrainingLoad` and not the raw column — so
          // every surface (Train tab, wellness score, /today, AI prompt) grades
          // against the same number and the default is expressed in one place.
          weeklyLoadTarget: resolveWeeklyLoadTarget(targets, r.weekly_load_target as number | null),
          targets_json: undefined,
          ranges_json: undefined,
          derivation_json: undefined,
        };
      }),
    });
  })

  .post("/goals", async (c) => {
    const who = requireTenant(c)!;
    const parsed = CreateGoal.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body", issues: parsed.error.issues }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    // Goal targets are trainer-set (SPEC §8.2) — a client must not author their
    // own "trainer-set" targets even for their own record.
    if (c.get("role") === "client") return c.json({ error: "forbidden" }, 403);
    const d = parsed.data;

    let targets = d.targets ?? null;
    let derivation: unknown = null;
    if (d.calculator) {
      const errors = validateCalculatorInputs(d.calculator);
      if (errors.length) return c.json({ error: "calculator", errors }, 400);
      const result = calculateNutritionTargets({
        gender: d.calculator.gender as Gender,
        ageYears: d.calculator.ageYears,
        heightCm: d.calculator.heightCm,
        weightKg: d.calculator.weightKg,
        bodyFatPercent: d.calculator.bodyFatPercent ?? null,
        activityLevel: d.calculator.activityLevel as ActivityLevel,
        primaryGoal: d.calculator.primaryGoal as PrimaryGoal,
        dietaryApproach: d.calculator.dietaryApproach as DietaryApproach,
      });
      // Snapshot the body the goal was built for, so staleness detection can
      // later compare it to the client's current weight/BMR.
      derivation = { ...result.derivation, snapshotWeightKg: d.calculator.weightKg, snapshotBodyFatPercent: d.calculator.bodyFatPercent ?? null };
      targets = {
        targetCalories: result.targetCalories,
        targetProteinG: result.targetProteinG,
        targetCarbsG: result.targetCarbsG,
        targetFatG: result.targetFatG,
        targetFiberG: result.targetFiberG,
        targetWaterMl: result.targetWaterMl,
        ...(d.targets ?? {}),
      };
    }

    // ── ONE authoritative weekly training-load target ────────────────────────
    // `targets_json.weeklyTrainingLoad` is the source of truth (it is what the
    // coach's GoalManager writes and what the client's Train tab reads). The
    // `weekly_load_target` COLUMN is kept only as a mirror of it, because three
    // consumers (wellness score, /today, the AI coach-note prompt) read the
    // column — and used to read a hardcoded 300 while the coach saw their own
    // number. Both stores are written from the same value here, so they can
    // never disagree again. The default lives in @mossa/domain, not here.
    const weeklyLoadTarget = resolveWeeklyLoadTarget(targets, d.weeklyLoadTarget);
    // Fold a body-level `weeklyLoadTarget` into the authoritative store so the
    // JSON is complete even for callers using the legacy field.
    if (d.weeklyLoadTarget != null && (targets == null || targets.weeklyTrainingLoad == null)) {
      targets = { ...(targets ?? {}), weeklyTrainingLoad: weeklyLoadTarget };
    }

    const id = newId("goal");
    const now = nowIso();
    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE client_goals SET status = 'superseded' WHERE client_id = ? AND status = 'active'",
      ).bind(access.client.id),
      c.env.DB.prepare(
        `INSERT INTO client_goals (id, tenant_id, client_id, label, status, start_date, end_date, targets_json, ranges_json, derivation_json, weekly_load_target, notes, created_by, created_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        access.client.tenant_id,
        access.client.id,
        d.label,
        d.startDate ?? now.slice(0, 10),
        d.endDate ?? null,
        targets ? j(targets) : null,
        d.ranges ? j(d.ranges) : null,
        derivation ? j(derivation) : null,
        weeklyLoadTarget, // mirror of targets_json.weeklyTrainingLoad — never a separate value
        d.notes ?? null,
        who.userId,
        now,
      ),
    ]);
    if (access.client.user_id) {
      await notify(c.env, { tenantId: access.client.tenant_id, userId: access.client.user_id, type: "goal_set", message: d.label, vars: { coachName: c.get("user")?.name || "Your coach", goalLabel: d.label } });
    }
    await recordAudit(c.env, { tenantId: access.client.tenant_id, clientId: access.client.id, actorUserId: who.userId, action: "goal.set", summary: d.label, ref: id });
    return c.json({ ok: true, id, targets, derivation }, 201);
  });
