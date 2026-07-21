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
  DEFAULT_WEEKLY_LOAD_TARGET,
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

const CreateGoal = z.object({
  clientId: z.string().min(1),
  label: z.string().min(1).max(120),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  weeklyLoadTarget: z.number().int().min(0).max(2000).default(DEFAULT_WEEKLY_LOAD_TARGET),
  /** Explicit targets, or `calculator` inputs to derive them server-side. */
  targets: z.record(z.string(), z.unknown()).nullish(),
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
      "SELECT * FROM client_goals WHERE client_id = ? ORDER BY created_at DESC LIMIT 20",
    )
      .bind(clientId)
      .all();
    return c.json({
      goals: (rows.results ?? []).map((r) => ({
        ...r,
        targets: parseJson(r.targets_json as string | null, null),
        ranges: parseJson(r.ranges_json as string | null, null),
        derivation: parseJson(r.derivation_json as string | null, null),
        targets_json: undefined,
        ranges_json: undefined,
        derivation_json: undefined,
      })),
    });
  })

  .post("/goals", async (c) => {
    const who = requireTenant(c)!;
    const parsed = CreateGoal.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body", issues: parsed.error.issues }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
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
        d.weeklyLoadTarget,
        d.notes ?? null,
        who.userId,
        now,
      ),
    ]);
    if (access.client.user_id) {
      await notify(c.env, { tenantId: access.client.tenant_id, userId: access.client.user_id, type: "goal_set", message: d.label });
    }
    await recordAudit(c.env, { tenantId: access.client.tenant_id, clientId: access.client.id, actorUserId: who.userId, action: "goal.set", summary: d.label, ref: id });
    return c.json({ ok: true, id, targets, derivation }, 201);
  });
