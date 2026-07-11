/**
 * Supplements + lab tests + exercise swap requests (SPEC §8.3, §8.8).
 * Supplement logging is a tap-to-toggle per (date, supplement, slot); lab
 * tests move request → uploaded → reviewed; swaps carry slot coordinates and
 * auto-approve when the suggestion is a listed alternative.
 */

import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { requireClientAccess } from "./clients.js";
import { newId, nowIso } from "./ids.js";
import { parseJson, j } from "./db.js";
import { notifyUser } from "./inbox-do.js";

const staffOnly = (c: { get: (k: "role") => string | null }) =>
  c.get("role") === "owner" || c.get("role") === "trainer";

export const healthRoutes = new Hono<AppEnv>()
  // ── Supplements ────────────────────────────────────────────────────────────
  .get("/supplements", async (c) => {
    const clientId = c.req.query("clientId");
    if (!clientId) return c.json({ error: "clientId required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    const rows = await c.env.DB.prepare(
      "SELECT * FROM supplements WHERE client_id = ? AND status != 'discontinued' ORDER BY created_at DESC",
    )
      .bind(clientId)
      .all();
    return c.json({
      supplements: (rows.results ?? []).map((s) => ({
        ...s,
        schedule: parseJson(s.schedule_json as string | null, []),
        schedule_json: undefined,
      })),
    });
  })

  .post("/supplements", async (c) => {
    const who = requireTenant(c)!;
    if (!staffOnly(c)) return c.json({ error: "forbidden" }, 403);
    const parsed = z
      .object({
        clientId: z.string(),
        name: z.string().min(1).max(120),
        brand: z.string().max(120).nullish(),
        kind: z.string().max(40).default("other"),
        dose: z.string().max(80).nullish(),
        schedule: z.array(z.object({ slot: z.string().max(40), notes: z.string().max(200).nullish() })).default([]),
        notes: z.string().max(1000).nullish(),
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const d = parsed.data;
    const id = newId("sup");
    await c.env.DB.prepare(
      `INSERT INTO supplements (id, tenant_id, client_id, prescribed_by, name, brand, kind, dose, schedule_json, notes, start_date, end_date, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    )
      .bind(id, who.tenantId, access.client.id, who.userId, d.name, d.brand ?? null, d.kind, d.dose ?? null, j(d.schedule), d.notes ?? null, d.startDate ?? null, d.endDate ?? null, nowIso())
      .run();
    return c.json({ ok: true, id }, 201);
  })

  .patch("/supplements/:id", async (c) => {
    const who = requireTenant(c)!;
    if (!staffOnly(c)) return c.json({ error: "forbidden" }, 403);
    const parsed = z
      .object({ status: z.enum(["active", "paused", "discontinued"]).optional(), dose: z.string().max(80).optional(), notes: z.string().max(1000).nullish() })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const d = parsed.data;
    const sets: string[] = [];
    const binds: unknown[] = [];
    if (d.status) (sets.push("status = ?"), binds.push(d.status));
    if (d.dose !== undefined) (sets.push("dose = ?"), binds.push(d.dose));
    if (d.notes !== undefined) (sets.push("notes = ?"), binds.push(d.notes));
    if (!sets.length) return c.json({ ok: true });
    await c.env.DB.prepare(`UPDATE supplements SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`)
      .bind(...binds, c.req.param("id"), who.tenantId)
      .run();
    return c.json({ ok: true });
  })

  // Tap-to-toggle a supplement slot for a day (client action).
  .post("/supplements/:id/log", async (c) => {
    const parsed = z
      .object({ clientId: z.string(), date: z.string(), slot: z.string().max(40) })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const { clientId, date, slot } = parsed.data;
    const supId = c.req.param("id");
    const existing = await c.env.DB.prepare(
      "SELECT 1 AS x FROM supplement_logs WHERE client_id = ? AND supplement_id = ? AND date_local = ? AND slot = ?",
    )
      .bind(clientId, supId, date, slot)
      .first();
    if (existing) {
      await c.env.DB.prepare(
        "DELETE FROM supplement_logs WHERE client_id = ? AND supplement_id = ? AND date_local = ? AND slot = ?",
      )
        .bind(clientId, supId, date, slot)
        .run();
      return c.json({ ok: true, taken: false });
    }
    await c.env.DB.prepare(
      "INSERT INTO supplement_logs (client_id, supplement_id, date_local, slot, tenant_id, taken_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(clientId, supId, date, slot, access.client.tenant_id, nowIso())
      .run();
    return c.json({ ok: true, taken: true });
  })

  .get("/supplements/logs", async (c) => {
    const clientId = c.req.query("clientId");
    const date = c.req.query("date");
    if (!clientId || !date) return c.json({ error: "clientId + date required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    const rows = await c.env.DB.prepare(
      "SELECT supplement_id, slot FROM supplement_logs WHERE client_id = ? AND date_local = ?",
    )
      .bind(clientId, date)
      .all();
    return c.json({ taken: rows.results ?? [] });
  })

  // ── Lab tests ──────────────────────────────────────────────────────────────
  .get("/labs", async (c) => {
    const clientId = c.req.query("clientId");
    if (!clientId) return c.json({ error: "clientId required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    const rows = await c.env.DB.prepare(
      "SELECT * FROM lab_tests WHERE client_id = ? ORDER BY created_at DESC",
    )
      .bind(clientId)
      .all();
    return c.json({
      labs: (rows.results ?? []).map((l) => ({ ...l, values: parseJson(l.values_json as string | null, null), values_json: undefined })),
    });
  })

  .post("/labs", async (c) => {
    const who = requireTenant(c)!;
    if (!staffOnly(c)) return c.json({ error: "forbidden" }, 403);
    const parsed = z
      .object({
        clientId: z.string(),
        type: z.string().max(60),
        customType: z.string().max(120).nullish(),
        displayName: z.string().max(120).nullish(),
        instructions: z.string().max(2000).nullish(),
        dueBy: z.string().nullish(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const d = parsed.data;
    const id = newId("lab");
    await c.env.DB.prepare(
      `INSERT INTO lab_tests (id, tenant_id, client_id, requested_by, type, custom_type, display_name, instructions, due_by, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?)`,
    )
      .bind(id, who.tenantId, access.client.id, who.userId, d.type, d.customType ?? null, d.displayName ?? d.customType ?? d.type, d.instructions ?? null, d.dueBy ?? null, nowIso())
      .run();
    // Notify the client to complete the request.
    if (access.client.user_id) {
      await c.env.DB.prepare(
        "INSERT INTO notifications (id, tenant_id, recipient_user_id, type, title, message, link, created_at) VALUES (?, ?, ?, 'lab_requested', ?, ?, '/progress', ?)",
      )
        .bind(newId("ntf"), who.tenantId, access.client.user_id, "New lab test requested", d.displayName ?? d.type, nowIso())
        .run()
        .catch(() => undefined);
      await notifyUser(c.env, access.client.user_id);
    }
    return c.json({ ok: true, id }, 201);
  })

  // Client flips requested → uploaded (attaches a file key + notes).
  .post("/labs/:id/upload", async (c) => {
    const parsed = z
      .object({ clientId: z.string(), fileKey: z.string().max(200), clientNotes: z.string().max(1000).nullish() })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    await c.env.DB.prepare(
      "UPDATE lab_tests SET status = 'uploaded', file_key = ?, client_notes = ?, uploaded_at = ? WHERE id = ? AND client_id = ?",
    )
      .bind(parsed.data.fileKey, parsed.data.clientNotes ?? null, nowIso(), c.req.param("id"), access.client.id)
      .run();
    // Notify the primary trainer to review.
    const primary = await c.env.DB.prepare(
      "SELECT trainer_user_id FROM client_trainers WHERE client_id = ? ORDER BY is_primary DESC LIMIT 1",
    )
      .bind(access.client.id)
      .first<{ trainer_user_id: string }>();
    if (primary) {
      await c.env.DB.prepare(
        "INSERT INTO notifications (id, tenant_id, recipient_user_id, type, title, message, link, created_at) VALUES (?, ?, ?, 'lab_uploaded', ?, '', ?, ?)",
      )
        .bind(newId("ntf"), access.client.tenant_id, primary.trainer_user_id, `${access.client.display_name} uploaded a lab result`, `/clients/${access.client.id}`, nowIso())
        .run()
        .catch(() => undefined);
      await notifyUser(c.env, primary.trainer_user_id);
    }
    return c.json({ ok: true });
  })

  // Trainer reviews: attach extracted values + feedback.
  .patch("/labs/:id", async (c) => {
    const who = requireTenant(c)!;
    if (!staffOnly(c)) return c.json({ error: "forbidden" }, 403);
    const parsed = z
      .object({
        status: z.enum(["requested", "scheduled", "uploaded", "reviewed", "cancelled"]).optional(),
        values: z.array(z.object({ marker: z.string(), value: z.string(), unit: z.string().nullish(), refRange: z.string().nullish(), flag: z.enum(["low", "normal", "high"]).nullish() })).nullish(),
        trainerFeedback: z.string().max(2000).nullish(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const d = parsed.data;
    const sets: string[] = [];
    const binds: unknown[] = [];
    if (d.status) {
      sets.push("status = ?");
      binds.push(d.status);
      if (d.status === "reviewed") (sets.push("reviewed_at = ?"), binds.push(nowIso()));
    }
    if (d.values !== undefined) (sets.push("values_json = ?"), binds.push(d.values ? j(d.values) : null));
    if (d.trainerFeedback !== undefined) (sets.push("trainer_feedback = ?"), binds.push(d.trainerFeedback));
    if (!sets.length) return c.json({ ok: true });
    await c.env.DB.prepare(`UPDATE lab_tests SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`)
      .bind(...binds, c.req.param("id"), who.tenantId)
      .run();
    return c.json({ ok: true });
  })

  // ── Exercise swap requests ─────────────────────────────────────────────────
  .get("/swaps", async (c) => {
    const who = requireTenant(c)!;
    const clientId = c.req.query("clientId");
    if (clientId) {
      const access = await requireClientAccess(c, clientId);
      if ("response" in access) return access.response;
      const rows = await c.env.DB.prepare(
        "SELECT * FROM swap_requests WHERE client_id = ? ORDER BY created_at DESC",
      )
        .bind(clientId)
        .all();
      return c.json({ swaps: rows.results ?? [] });
    }
    // Trainer view: all pending swaps in the tenant (roster-scoped in UI).
    const rows = await c.env.DB.prepare(
      "SELECT * FROM swap_requests WHERE tenant_id = ? AND status = 'pending' ORDER BY created_at DESC",
    )
      .bind(who.tenantId)
      .all();
    return c.json({ swaps: rows.results ?? [] });
  })

  .post("/swaps", async (c) => {
    const parsed = z
      .object({
        clientId: z.string(),
        workoutPlanId: z.string(),
        dayIndex: z.number().int().min(0),
        blockIndex: z.number().int().min(0),
        slotIndex: z.number().int().min(0),
        currentExerciseId: z.string(),
        // Optional: a bound alternative the client picked (auto-applies). Absent
        // = an open request — the client just asks, the coach picks + approves.
        suggestedExerciseId: z.string().nullish(),
        reason: z.string().max(500).nullish(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    const d = parsed.data;

    // Auto-approve ONLY when the client picked a bound alternative (per tenant).
    const alt = d.suggestedExerciseId
      ? await c.env.DB.prepare(
          "SELECT 1 AS x FROM exercise_alternatives WHERE ((exercise_a = ? AND exercise_b = ?) OR (exercise_a = ? AND exercise_b = ?)) AND (tenant_id = ? OR tenant_id IS NULL)",
        )
          .bind(d.currentExerciseId, d.suggestedExerciseId, d.suggestedExerciseId, d.currentExerciseId, access.client.tenant_id)
          .first()
      : null;
    const id = newId("swap");
    const autoApprove = Boolean(alt);
    await c.env.DB.prepare(
      `INSERT INTO swap_requests (id, tenant_id, client_id, workout_plan_id, day_index, block_index, slot_index, current_exercise_id, suggested_exercise_id, reason, status, created_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, access.client.tenant_id, access.client.id, d.workoutPlanId, d.dayIndex, d.blockIndex, d.slotIndex, d.currentExerciseId, d.suggestedExerciseId ?? null, d.reason ?? null, autoApprove ? "approved" : "pending", nowIso(), autoApprove ? nowIso() : null)
      .run();
    if (autoApprove && d.suggestedExerciseId) await applySwap(c.env.DB, access.client.tenant_id, { ...d, suggestedExerciseId: d.suggestedExerciseId });
    else {
      const primary = await c.env.DB.prepare(
        "SELECT trainer_user_id FROM client_trainers WHERE client_id = ? ORDER BY is_primary DESC LIMIT 1",
      )
        .bind(access.client.id)
        .first<{ trainer_user_id: string }>();
      if (primary) {
        await c.env.DB.prepare(
          "INSERT INTO notifications (id, tenant_id, recipient_user_id, type, title, message, link, created_at) VALUES (?, ?, ?, 'swap_request', ?, '', ?, ?)",
        )
          .bind(newId("ntf"), access.client.tenant_id, primary.trainer_user_id, `${access.client.display_name} requested an exercise swap`, `/clients/${access.client.id}`, nowIso())
          .run()
          .catch(() => undefined);
        await notifyUser(c.env, primary.trainer_user_id);
      }
    }
    return c.json({ ok: true, id, autoApproved: autoApprove }, 201);
  })

  .patch("/swaps/:id", async (c) => {
    const who = requireTenant(c)!;
    if (!staffOnly(c)) return c.json({ error: "forbidden" }, 403);
    const parsed = z
      // `replacementExerciseId` = the coach's chosen replacement for an open
      // request (or an override). Falls back to whatever the client suggested.
      .object({ status: z.enum(["approved", "rejected"]), trainerNote: z.string().max(500).nullish(), replacementExerciseId: z.string().nullish() })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const row = await c.env.DB.prepare("SELECT * FROM swap_requests WHERE id = ? AND tenant_id = ?")
      .bind(c.req.param("id"), who.tenantId)
      .first<{ client_id: string; workout_plan_id: string; day_index: number; block_index: number; slot_index: number; current_exercise_id: string; suggested_exercise_id: string | null }>();
    if (!row) return c.json({ error: "not found" }, 404);
    const replacement = parsed.data.replacementExerciseId ?? row.suggested_exercise_id;
    if (parsed.data.status === "approved" && !replacement) return c.json({ error: "choose a replacement exercise to approve" }, 400);
    await c.env.DB.prepare("UPDATE swap_requests SET status = ?, trainer_note = ?, suggested_exercise_id = ?, resolved_by = ?, resolved_at = ? WHERE id = ?")
      .bind(parsed.data.status, parsed.data.trainerNote ?? null, replacement, who.userId, nowIso(), c.req.param("id"))
      .run();
    if (parsed.data.status === "approved" && replacement) {
      await applySwap(c.env.DB, who.tenantId, {
        workoutPlanId: row.workout_plan_id,
        dayIndex: row.day_index,
        blockIndex: row.block_index,
        slotIndex: row.slot_index,
        suggestedExerciseId: replacement,
      });
      // Notify the client their swap was applied.
      const client = await c.env.DB.prepare("SELECT user_id, display_name FROM clients WHERE id = ?").bind(row.client_id).first<{ user_id: string | null; display_name: string }>();
      if (client?.user_id) {
        await c.env.DB.prepare(
          "INSERT INTO notifications (id, tenant_id, recipient_user_id, type, title, message, link, created_at) VALUES (?, ?, ?, 'swap_approved', 'Your exercise swap was applied', '', '/train', ?)",
        )
          .bind(newId("ntf"), who.tenantId, client.user_id, nowIso())
          .run()
          .catch(() => undefined);
        await notifyUser(c.env, client.user_id);
      }
    }
    return c.json({ ok: true });
  });

/** Apply an approved swap directly into the plan's JSON body. */
async function applySwap(
  db: D1Database,
  tenantId: string,
  d: { workoutPlanId: string; dayIndex: number; blockIndex: number; slotIndex: number; suggestedExerciseId: string },
): Promise<void> {
  const plan = await db
    .prepare("SELECT body_json FROM workout_plans WHERE id = ? AND tenant_id = ?")
    .bind(d.workoutPlanId, tenantId)
    .first<{ body_json: string | null }>();
  if (!plan) return;
  const body = parseJson<{ days: { blocks: { slots: { exerciseId: string }[] }[] }[] }>(plan.body_json, { days: [] });
  const slot = body.days[d.dayIndex]?.blocks[d.blockIndex]?.slots[d.slotIndex];
  if (slot) {
    slot.exerciseId = d.suggestedExerciseId;
    await db
      .prepare("UPDATE workout_plans SET body_json = ?, updated_at = ? WHERE id = ?")
      .bind(j(body), nowIso(), d.workoutPlanId)
      .run();
  }
}
