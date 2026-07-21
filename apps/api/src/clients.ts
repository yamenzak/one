/**
 * Clients & roster (SPEC §2, §8.1) — the client record store plus THE
 * row-level access check every coaching route goes through:
 *
 *   requireClientAccess(c, clientId):
 *     owner / assistant → tenant match
 *     trainer           → client_trainers must link them (the ByShujaa fix)
 *     client            → clients.user_id must be them
 */

import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, type AppContext, requireTenant } from "./auth-context.js";
import { withinQuota } from "./billing-store.js";
import { notify } from "./notify.js";
import { newId, nowIso } from "./ids.js";
import { recordAudit } from "./audit.js";
import { parseJson, j } from "./db.js";
import { type ClientPreferences, calculateBMI, calculateBMR, classifyBMI, ageFromDob, goalStaleness, profileGaps, rangeStatus, auditLabel, canAccessClient, seesWholeRoster } from "@mossa/domain";

export interface ClientRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  display_name: string;
  email: string | null;
  status: string;
  gender: string | null;
  date_of_birth: string | null;
  height_cm: number | null;
  timezone: string | null;
  weight_unit: string;
  length_unit: string;
  volume_unit: string;
  intake_json: string | null;
  dashboard_prefs_json: string | null;
  onboarding_complete: number;
  avatar_url: string | null;
  avatar_seed: string | null;
  blood_type: string | null;
  phone: string | null;
  preferences_json: string | null;
  current_variant_id: string | null;
  default_lane_label: string | null;
  created_at: string;
  archived_at: string | null;
}

export async function getClient(db: D1Database, tenantId: string, clientId: string): Promise<ClientRow | null> {
  return db
    .prepare("SELECT * FROM clients WHERE id = ? AND tenant_id = ?")
    .bind(clientId, tenantId)
    .first<ClientRow>();
}

/** The client record linked to a user in a tenant (their "Train" persona). */
export async function clientForUser(db: D1Database, tenantId: string, userId: string): Promise<ClientRow | null> {
  return db
    .prepare("SELECT * FROM clients WHERE tenant_id = ? AND user_id = ? AND status != 'archived'")
    .bind(tenantId, userId)
    .first<ClientRow>();
}

export async function isAssignedTrainer(
  db: D1Database,
  tenantId: string,
  clientId: string,
  trainerUserId: string,
): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS x FROM client_trainers WHERE tenant_id = ? AND client_id = ? AND trainer_user_id = ?")
    .bind(tenantId, clientId, trainerUserId)
    .first<{ x: number }>();
  return Boolean(row);
}

/**
 * THE row-level guard. Returns the client row when the caller may act on it,
 * or a Response (401/403/404) to short-circuit with.
 */
export async function requireClientAccess(
  c: AppContext,
  clientId: string,
): Promise<{ client: ClientRow } | { response: Response }> {
  const who = requireTenant(c);
  if (!who) return { response: c.json({ error: "unauthenticated" }, 401) };
  const client = await getClient(c.env.DB, who.tenantId, clientId);
  if (!client) return { response: c.json({ error: "not found" }, 404) };

  const role = c.get("role") ?? "";
  // Resolve the two facts the multi-coach rule needs, then let the domain decide.
  // Only a coach needs the (targeted) assignment lookup; everyone else's decision
  // is settled by role + own-record.
  const isOwnRecord = client.user_id === who.userId;
  const isAssignedCoach =
    role === "trainer" && !isOwnRecord
      ? await isAssignedTrainer(c.env.DB, who.tenantId, clientId, who.userId)
      : false;
  if (canAccessClient(role, { isAssignedCoach, isOwnRecord })) return { client };
  return { response: c.json({ error: "forbidden" }, 403) };
}

/** Roster scope: which client ids the caller may see. */
export async function visibleClientIds(c: AppContext): Promise<string[] | "all"> {
  const who = requireTenant(c);
  if (!who) return [];
  const role = c.get("role");
  if (seesWholeRoster(role ?? "")) return "all";
  if (role === "trainer") {
    const rows = await c.env.DB.prepare(
      "SELECT client_id FROM client_trainers WHERE tenant_id = ? AND trainer_user_id = ?",
    )
      .bind(who.tenantId, who.userId)
      .all<{ client_id: string }>();
    const ids = (rows.results ?? []).map((r) => r.client_id);
    const own = await clientForUser(c.env.DB, who.tenantId, who.userId);
    if (own && !ids.includes(own.id)) ids.push(own.id);
    return ids;
  }
  const own = await clientForUser(c.env.DB, who.tenantId, who.userId);
  return own ? [own.id] : [];
}

const CreateClient = z.object({
  // Email is the invite — it's what links them the moment they sign in — so the
  // coach's Add-client form requires it. The API stays permissive (email OR name
  // is enough) so other paths keep working: a walk-in with no email, the
  // trainer's own record, demo seeds. Name is optional now (they fill it on the
  // complete-your-profile screen); when omitted we seed it from the address.
  email: z.string().email().nullish(),
  displayName: z.string().max(80).nullish(),
  gender: z.enum(["male", "female"]).nullish(),
  dateOfBirth: z.string().nullish(),
  heightCm: z.number().positive().nullish(),
  timezone: z.string().max(60).nullish(),
  bloodType: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]).nullish(),
  phone: z.string().max(30).nullish(),
});

/** Settings-managed preferences (metric; the app converts for display). */
const ClientPrefs = z
  .object({
    targetWeightKg: z.number().positive().max(600).nullish(),
    workoutsPerWeek: z.number().int().min(0).max(14).nullish(),
    mealsPerDay: z.number().int().min(1).max(12).nullish(),
    workoutLocation: z.enum(["home", "gym", "hybrid", "outdoor"]).nullish(),
    primaryGoal: z.enum(["lose_weight", "build_muscle", "maintain", "improve_fitness"]).nullish(),
    activityLevel: z.enum(["sedentary", "light", "moderate", "very_active"]).nullish(),
    dietaryApproach: z.enum(["balanced", "high_protein", "low_carb", "keto", "vegan", "vegetarian"]).nullish(),
    limitations: z.string().max(500).nullish(),
  })
  .partial();

const UpdateClient = CreateClient.partial().extend({
  weightUnit: z.enum(["kg", "lbs"]).optional(),
  lengthUnit: z.enum(["cm", "in"]).optional(),
  volumeUnit: z.enum(["ml", "oz"]).optional(),
  intake: z.record(z.string(), z.unknown()).optional(),
  dashboardPrefs: z.record(z.string(), z.unknown()).optional(),
  preferences: ClientPrefs.optional(),
  onboardingComplete: z.boolean().optional(),
});

function clientView(row: ClientRow) {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    status: row.status,
    gender: row.gender,
    dateOfBirth: row.date_of_birth,
    heightCm: row.height_cm,
    timezone: row.timezone,
    units: { weight: row.weight_unit, length: row.length_unit, volume: row.volume_unit },
    intake: parseJson<Record<string, unknown>>(row.intake_json, {}),
    dashboardPrefs: parseJson<Record<string, unknown>>(row.dashboard_prefs_json, {}),
    onboardingComplete: Boolean(row.onboarding_complete),
    hasLogin: Boolean(row.user_id),
    avatarUrl: row.avatar_url,
    avatarSeed: row.avatar_seed,
    bloodType: row.blood_type,
    phone: row.phone,
    preferences: parseJson<ClientPreferences>(row.preferences_json, {}),
    profileComplete: profileGaps({ gender: row.gender, dateOfBirth: row.date_of_birth, heightCm: row.height_cm, prefs: parseJson<ClientPreferences>(row.preferences_json, {}) }).length === 0,
    createdAt: row.created_at,
  };
}

/**
 * Live body metrics for a client — the latest logged weight/body-fat with BMI +
 * BMR recomputed from the current profile, plus whether the active goal has gone
 * stale against that body. Drives the coach's goal-setting + planning context.
 */
async function clientMetrics(db: D1Database, row: ClientRow) {
  const meas = await db
    .prepare("SELECT date_local, weight_kg, body_fat_percent, bmi, bmr FROM measurements WHERE client_id = ? AND weight_kg IS NOT NULL ORDER BY date_local DESC LIMIT 1")
    .bind(row.id)
    .first<{ date_local: string; weight_kg: number | null; body_fat_percent: number | null; bmi: number | null; bmr: number | null }>();
  const ageYears = ageFromDob(row.date_of_birth);
  const weightKg = meas?.weight_kg ?? null;
  const bodyFatPercent = meas?.body_fat_percent ?? null;
  const bmi = weightKg != null && row.height_cm ? calculateBMI(weightKg, row.height_cm) : null;
  const bmrCalc = weightKg != null && row.height_cm && ageYears != null && row.gender ? calculateBMR({ weightKg, heightCm: row.height_cm, ageYears, gender: row.gender as "male" | "female", bodyFatPercent }) : null;

  // Staleness vs the active goal's snapshot.
  const goal = await db
    .prepare("SELECT ranges_json, derivation_json FROM client_goals WHERE client_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1")
    .bind(row.id)
    .first<{ ranges_json: string | null; derivation_json: string | null }>();
  const deriv = parseJson<{ snapshotWeightKg?: number; bmr?: number }>(goal?.derivation_json, {});
  const staleness = goal ? goalStaleness({ goalWeightKg: deriv.snapshotWeightKg ?? null, currentWeightKg: weightKg, goalBmr: deriv.bmr ?? null, currentBmr: bmrCalc?.bmr ?? null }) : null;

  // Healthy-range status (SPEC §8.11): the coach-set weight band the client
  // should sit in → In range / below / above.
  const ranges = parseJson<{ weightKg?: { min: number | null; max: number | null } }>(goal?.ranges_json, {});
  const weightStatus = weightKg != null && ranges.weightKg ? rangeStatus(weightKg, ranges.weightKg.min, ranges.weightKg.max) : null;

  return {
    ageYears,
    weightKg,
    bodyFatPercent,
    measuredAt: meas?.date_local ?? null,
    bmi,
    bmiCategory: bmi != null ? classifyBMI(bmi) : null,
    bmr: bmrCalc?.bmr ?? null,
    bmrFormula: bmrCalc?.formula ?? null,
    hasActiveGoal: Boolean(goal),
    staleness,
    ranges,
    weightStatus,
  };
}

export const clientRoutes = new Hono<AppEnv>()
  // Roster — scoped by role.
  .get("/clients", async (c) => {
    const who = requireTenant(c)!;
    const scope = await visibleClientIds(c);
    if (scope !== "all" && scope.length === 0) return c.json({ clients: [] });
    const where =
      scope === "all"
        ? "tenant_id = ? AND status != 'archived'"
        : `tenant_id = ? AND status != 'archived' AND id IN (${scope.map(() => "?").join(",")})`;
    const binds = scope === "all" ? [who.tenantId] : [who.tenantId, ...scope];
    const rows = await c.env.DB.prepare(`SELECT * FROM clients WHERE ${where} ORDER BY display_name`)
      .bind(...binds)
      .all<ClientRow>();
    return c.json({ clients: (rows.results ?? []).map(clientView) });
  })

  .post("/clients", async (c) => {
    const who = requireTenant(c)!;
    const body = CreateClient.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    // Active-client capacity gate: block adding past the plan ceiling (gifts
    // and grandfathering raise it automatically; -1 = unlimited).
    const active = await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM clients WHERE tenant_id = ? AND status != 'archived'",
    ).bind(who.tenantId).first<{ n: number }>();
    const cap = await withinQuota(c.env.DB, who.tenantId, "activeClients", active?.n ?? 0);
    if (!cap.ok) return c.json({ error: "active client limit reached", limit: cap.max }, 403);
    const id = newId("cli");
    await c.env.DB.prepare(
      `INSERT INTO clients (id, tenant_id, display_name, email, gender, date_of_birth, height_cm, timezone, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        who.tenantId,
        body.data.displayName?.trim() || body.data.email?.split("@")[0] || "New client",
        body.data.email ?? null,
        body.data.gender ?? null,
        body.data.dateOfBirth ?? null,
        body.data.heightCm ?? null,
        body.data.timezone ?? null,
        nowIso(),
      )
      .run();
    // Creating trainer auto-assigns themself (owner too — they coach by default).
    const role = c.get("role");
    if (role === "trainer" || role === "owner") {
      await c.env.DB.prepare(
        "INSERT OR IGNORE INTO client_trainers (client_id, trainer_user_id, tenant_id, is_primary, created_at) VALUES (?, ?, ?, 1, ?)",
      )
        .bind(id, who.userId, who.tenantId, nowIso())
        .run();
    }
    const row = await getClient(c.env.DB, who.tenantId, id);
    return c.json({ client: clientView(row!) }, 201);
  })

  // "Create my client record" — the trainer-trains-themself tap (SPEC §2).
  .post("/clients/self", async (c) => {
    const who = requireTenant(c)!;
    const existing = await clientForUser(c.env.DB, who.tenantId, who.userId);
    if (existing) return c.json({ client: clientView(existing) });
    const user = c.get("user")!;
    const id = newId("cli");
    await c.env.DB.prepare(
      "INSERT INTO clients (id, tenant_id, user_id, display_name, email, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(id, who.tenantId, who.userId, user.name || user.email.split("@")[0], user.email, nowIso())
      .run();
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO client_trainers (client_id, trainer_user_id, tenant_id, is_primary, created_at) VALUES (?, ?, ?, 1, ?)",
    )
      .bind(id, who.userId, who.tenantId, nowIso())
      .run();
    const row = await getClient(c.env.DB, who.tenantId, id);
    return c.json({ client: clientView(row!) }, 201);
  })

  .get("/clients/:id", async (c) => {
    const access = await requireClientAccess(c, c.req.param("id"));
    if ("response" in access) return access.response;
    const metrics = await clientMetrics(c.env.DB, access.client);
    return c.json({ client: clientView(access.client), metrics });
  })

  // Coach-action audit history for a client — STAFF only (a coach or the owner
  // reviewing what was done to this record). The label renders from the same
  // AUDIT_ACTIONS registry the write path validates against.
  .get("/clients/:id/audit", async (c) => {
    if (c.get("role") === "client") return c.json({ error: "forbidden" }, 403);
    const access = await requireClientAccess(c, c.req.param("id"));
    if ("response" in access) return access.response;
    const rows = await c.env.DB.prepare(
      "SELECT a.id, a.action, a.summary, a.ref, a.at, u.name AS actor_name FROM audit_log a LEFT JOIN \"user\" u ON u.id = a.actor_user_id WHERE a.client_id = ? ORDER BY a.at DESC LIMIT 200",
    ).bind(access.client.id).all<{ id: string; action: string; summary: string | null; ref: string | null; at: number; actor_name: string | null }>();
    const items = (rows.results ?? []).map((r) => ({
      id: r.id, action: r.action, label: auditLabel(r.action), summary: r.summary, ref: r.ref, at: r.at, actor: r.actor_name,
    }));
    return c.json({ items });
  })

  .patch("/clients/:id", async (c) => {
    const access = await requireClientAccess(c, c.req.param("id"));
    if ("response" in access) return access.response;
    const body = UpdateClient.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    const d = body.data;
    const cur = access.client;
    // Preferences merge (partial): updating one field never wipes the others.
    const prefsJson =
      d.preferences !== undefined
        ? j({ ...parseJson<ClientPreferences>(cur.preferences_json, {}), ...d.preferences })
        : cur.preferences_json;
    await c.env.DB.prepare(
      `UPDATE clients SET display_name = ?, email = ?, gender = ?, date_of_birth = ?, height_cm = ?, timezone = ?,
        weight_unit = ?, length_unit = ?, volume_unit = ?, intake_json = ?, dashboard_prefs_json = ?, preferences_json = ?, onboarding_complete = ?,
        blood_type = ?, phone = ?
       WHERE id = ? AND tenant_id = ?`,
    )
      .bind(
        d.displayName ?? cur.display_name,
        d.email !== undefined ? d.email : cur.email,
        d.gender !== undefined ? d.gender : cur.gender,
        d.dateOfBirth !== undefined ? d.dateOfBirth : cur.date_of_birth,
        d.heightCm !== undefined ? d.heightCm : cur.height_cm,
        d.timezone !== undefined ? d.timezone : cur.timezone,
        d.weightUnit ?? cur.weight_unit,
        d.lengthUnit ?? cur.length_unit,
        d.volumeUnit ?? cur.volume_unit,
        d.intake !== undefined ? j(d.intake) : cur.intake_json,
        d.dashboardPrefs !== undefined ? j(d.dashboardPrefs) : cur.dashboard_prefs_json,
        prefsJson,
        d.onboardingComplete !== undefined ? (d.onboardingComplete ? 1 : 0) : cur.onboarding_complete,
        d.bloodType !== undefined ? d.bloodType : cur.blood_type,
        d.phone !== undefined ? d.phone : cur.phone,
        cur.id,
        cur.tenant_id,
      )
      .run();
    const row = await getClient(c.env.DB, cur.tenant_id, cur.id);
    const metrics = await clientMetrics(c.env.DB, row!);
    return c.json({ client: clientView(row!), metrics });
  })

  .post("/clients/:id/archive", async (c) => {
    const access = await requireClientAccess(c, c.req.param("id"));
    if ("response" in access) return access.response;
    await c.env.DB.prepare("UPDATE clients SET status = 'archived', archived_at = ? WHERE id = ?")
      .bind(nowIso(), access.client.id)
      .run();
    await recordAudit(c.env, { tenantId: access.client.tenant_id, clientId: access.client.id, actorUserId: c.get("user")?.id, action: "client.archive", summary: access.client.display_name });
    return c.json({ ok: true });
  })

  // Trainer assignment (many-to-many, is_primary flag).
  .get("/clients/:id/trainers", async (c) => {
    const access = await requireClientAccess(c, c.req.param("id"));
    if ("response" in access) return access.response;
    const rows = await c.env.DB.prepare(
      `SELECT ct.trainer_user_id, ct.is_primary, u.name, u.email FROM client_trainers ct
       LEFT JOIN "user" u ON u.id = ct.trainer_user_id WHERE ct.client_id = ? AND ct.tenant_id = ?`,
    )
      .bind(access.client.id, access.client.tenant_id)
      .all<{ trainer_user_id: string; is_primary: number; name: string | null; email: string | null }>();
    return c.json({
      trainers: (rows.results ?? []).map((r) => ({
        userId: r.trainer_user_id,
        isPrimary: Boolean(r.is_primary),
        name: r.name,
        email: r.email,
      })),
    });
  })

  .post("/clients/:id/trainers", async (c) => {
    const access = await requireClientAccess(c, c.req.param("id"));
    if ("response" in access) return access.response;
    const body = z
      .object({ trainerUserId: z.string().min(1), isPrimary: z.boolean().default(false) })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    // The target must be a staff member of this tenant.
    const member = await c.env.DB.prepare(
      'SELECT role FROM "member" WHERE organizationId = ? AND userId = ?',
    )
      .bind(access.client.tenant_id, body.data.trainerUserId)
      .first<{ role: string }>();
    if (!member || member.role === "client") return c.json({ error: "not a staff member" }, 400);
    if (body.data.isPrimary) {
      await c.env.DB.prepare("UPDATE client_trainers SET is_primary = 0 WHERE client_id = ?")
        .bind(access.client.id)
        .run();
    }
    await c.env.DB.prepare(
      "INSERT OR REPLACE INTO client_trainers (client_id, trainer_user_id, tenant_id, is_primary, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(access.client.id, body.data.trainerUserId, access.client.tenant_id, body.data.isPrimary ? 1 : 0, nowIso())
      .run();
    // Tell the newly-assigned trainer they've got a new client.
    if (body.data.trainerUserId !== c.get("user")?.id) {
      await notify(c.env, { tenantId: access.client.tenant_id, userId: body.data.trainerUserId, type: "client_assigned", message: access.client.display_name, link: `/clients/${access.client.id}` });
    }
    return c.json({ ok: true });
  })

  .delete("/clients/:id/trainers/:trainerUserId", async (c) => {
    const access = await requireClientAccess(c, c.req.param("id"));
    if ("response" in access) return access.response;
    await c.env.DB.prepare(
      "DELETE FROM client_trainers WHERE client_id = ? AND trainer_user_id = ? AND tenant_id = ?",
    )
      .bind(access.client.id, c.req.param("trainerUserId"), access.client.tenant_id)
      .run();
    return c.json({ ok: true });
  })

  // Avatar: shuffle the DiceBear seed, or persist an uploaded avatar (R2 key).
  .post("/clients/:id/avatar", async (c) => {
    const access = await requireClientAccess(c, c.req.param("id"));
    if ("response" in access) return access.response;
    const body = z
      .object({ seed: z.string().max(40).nullish(), avatarUrl: z.string().max(300).nullish() })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);
    if (body.data.avatarUrl !== undefined) {
      await c.env.DB.prepare("UPDATE clients SET avatar_url = ?, avatar_seed = NULL WHERE id = ?").bind(body.data.avatarUrl, access.client.id).run();
    } else {
      const seed = body.data.seed ?? Math.random().toString(36).slice(2, 10);
      await c.env.DB.prepare("UPDATE clients SET avatar_seed = ?, avatar_url = NULL WHERE id = ?").bind(seed, access.client.id).run();
    }
    return c.json({ ok: true });
  });
