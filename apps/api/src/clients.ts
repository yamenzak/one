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
import type { Env } from "./env.js";
import { withinQuota } from "./billing-store.js";
import { purgeClient } from "./purge.js";
import { notify, tenantBrandKit } from "./notify.js";
import { sendTenantEmail, explainSendError } from "./email-provider.js";
import { emailShell, emailButton, escapeHtml } from "./mailer.js";
import { newId, nowIso } from "./ids.js";
import { recordAudit } from "./audit.js";
import { canonicalHost, shapeOf } from "./host-context.js";
import { parseJson, j } from "./db.js";
import { type ClientPreferences, calculateBMI, calculateBMR, classifyBMI, ageFromDob, goalStaleness, profileGaps, rangeStatus, auditLabel, canAccessClient, seesWholeRoster } from "@kova/domain";
import { tenantStandingOf } from "@4dl/tenancy";
import { resolveStanding } from "@4dl/tenancy";

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
  current_meal_variant_id: string | null;
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
/**
 * This user's client record in this tenancy — ARCHIVED INCLUDED.
 *
 * If the data is on the tenancy, the person it is about can read it. Archiving
 * is the studio's filing decision (off my roster, stop billing me a seat's worth
 * of attention); it is not a reason to lock someone out of their own logs,
 * measurements, photos and plan history. So this returns the archived record and
 * the caller decides what that means — see `requireClientAccess`, which makes an
 * archived client's own persona READ-ONLY rather than absent.
 *
 * It used to filter archived out, which meant an archived client signed in to a
 * shell: role `client`, `clientId: null`, every screen empty, and no explanation.
 */
export async function clientForUser(db: D1Database, tenantId: string, userId: string): Promise<ClientRow | null> {
  return db
    .prepare("SELECT * FROM clients WHERE tenant_id = ? AND user_id = ? ORDER BY (status != 'archived') DESC LIMIT 1")
    .bind(tenantId, userId)
    .first<ClientRow>();
}

/**
 * The status of a self-signup RESERVATION: an email that asked for a code at a
 * `selfRegister` studio and has not yet proved it owns that address.
 *
 * It is not a client. Nobody has signed in, there is no data, and the studio did
 * not choose them — a stranger typed an address into a public form. So it costs
 * no seat and stays off the roster until it is CLAIMED, which happens on the
 * first authenticated context read (see the auto-link in `context-routes.ts`),
 * where the capacity check actually belongs.
 *
 * This is the difference between the two ways an unclaimed row can exist:
 *
 *   coach-invited  → `active`. The studio deliberately added this person and
 *                    expects to see them on the roster and to be billed for them
 *                    even before they sign in.
 *   self-signed-up → `pending`. Free and invisible until a real person arrives.
 *
 * Reservations used to be created as `active` at OTP-SEND, so every stranger who
 * requested a code and never finished held a seat forever — and since archiving
 * stopped freeing seats, nothing reclaimed them. At the limit that is a
 * denial-of-capacity: request codes for invented addresses at a studio's public
 * door until its plan is full and real clients are refused.
 */
export const PENDING_SIGNUP = "pending_signup";

/**
 * Seats consumed against the `activeClients` quota.
 *
 * Counts EVERY client record the studio holds, archived included. Archiving
 * takes a client off the roster; it does not hand the seat back. The record and
 * everything on it — logs, check-ins, photos, lab files — is still stored on the
 * tenancy and the client can still sign in and read it, so the studio is still
 * using the capacity it is paying for. The only thing that frees a seat is
 * `POST /clients/:id/delete`, which actually erases the data.
 *
 * Three sites used to count this three different ways: the create gate and the
 * signup gate said `status != 'archived'`, the number shown to the owner in
 * Billing said `status = 'active'`, and nothing said "all of them". So archiving
 * was an unlimited-storage loophole on a 30-seat plan, AND the figure the owner
 * read did not match the one being enforced against them. One function now, used
 * everywhere the quota is counted.
 */
export async function countClientSeats(db: D1Database, tenantId: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM clients WHERE tenant_id = ? AND status != '${PENDING_SIGNUP}'`)
    .bind(tenantId)
    .first<{ n: number }>()
    .catch(() => null);
  return row?.n ?? 0;
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
  if (!canAccessClient(role, { isAssignedCoach, isOwnRecord })) {
    return { response: c.json({ error: "forbidden" }, 403) };
  }
  /**
   * An archived client keeps READ access to their own record and loses write.
   *
   * The data is theirs — logs, measurements, photos, plan history — and it is
   * still on the tenancy, so locking them out of reading it would be wrong. But
   * they are off the roster: no coach is watching, so accepting new logs would
   * quietly collect data nobody will ever look at, and let someone keep
   * "training" at a studio that has ended the relationship.
   *
   * Staff are unaffected — a coach or owner can still open and edit an archived
   * record (that is how you'd correct or restore one).
   */
  //
  // Decided by `resolveStanding` (@kova/domain), the ONE definition of what a
  // person may do in a tenancy — the same function the Shell renders from, so the
  // gate and the UI cannot disagree about who is read-only.
  if (role === "client") {
    const standing = resolveStanding({
      membership: client.status === "archived" ? "archived" : client.status === PENDING_SIGNUP ? "pending_signup" : "active",
      // Access is enforced by its own gate (client-flags, entitlements); this call
      // is only about the membership half, so those axes are passed as satisfied
      // and cannot mask an archived record.
      accessActive: true,
      accessRequired: false,
      // The studio's REAL standing, resolved from the host. This used to be a
      // hardcoded "ok" here and in the Shell — the only two callers — which meant
      // the studio axis existed in the type and was dead in practice. The host gate
      // in route-guard.ts is the outer wall for a suspended studio; passing the
      // truth here keeps the two answers consistent, so a client's own persona
      // reports "tenant_suspended" rather than claiming everything is fine.
      tenant: tenantStandingOf(c.get("host").tenant?.subscriptionStatus),
    });
    const writing = c.req.method !== "GET";
    if (writing && !standing.canWrite) {
      // Two different reasons reach here and they are not interchangeable: one is
      // about this person's place on the roster, the other about the studio's bill.
      // Telling an archived client "the studio needs to renew" would send them to
      // their coach about the wrong thing entirely.
      const message =
        standing.reason === "tenant_suspended"
          ? "This studio is paused, so nothing new can be saved right now. You can still read everything on your record."
          : "Your record at this studio is archived — you can still read your history, but not add to it. Ask the studio to reactivate you.";
      // 402 for a billing state, 403 for a membership one — the app branches on it.
      return { response: c.json({ error: standing.reason, message }, standing.reason === "tenant_suspended" ? 402 : 403) };
    }
    if (!writing && !standing.canRead) return { response: c.json({ error: standing.reason }, 403) };
  }
  return { client };
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

/** URL-safe base64 of bytes (no padding) — for the opaque invite token. */
function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * A tamper-evident, opaque invite token the app renders as a QR (SPEC §4). It
 * carries the client + tenant + email so the branded login can prefill the
 * address; it's HMAC-signed so the QR payload can't be forged. It is NOT a bearer
 * credential — activation still requires the invitee to receive an OTP at that
 * email (the /api/context auto-link binds the record only after an authenticated
 * sign-in), so the token is a convenience hint, not an authorization.
 */
async function signInviteToken(env: Env, payload: { c: string; t: string; e: string }): Promise<string> {
  const enc = new TextEncoder();
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const secret = env.BETTER_AUTH_SECRET || "kova-dev-insecure-secret-change-me";
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

/**
 * The tenant's canonical branded login URL — its own domain if one is live,
 * otherwise its `<slug>.<root>` subdomain (SPEC §14.1).
 *
 * `canonicalHost` owns the preference order. This used to fall back to the shared
 * platform host's `/t/<slug>` path, which is now a dead end that serves nothing —
 * so every invite email sent by a studio without a custom domain would have landed
 * its clients on a signpost instead of a login.
 */
async function tenantLoginUrl(env: Env, tenantId: string, from?: string): Promise<string> {
  // `from` is the request URL when there is one. It supplies three things the
  // configured root cannot: the root this request was actually classified against
  // (`localhost` on loopback), the protocol, and the PORT. Without it a link emailed
  // from `pnpm dev` pointed at `https://<slug>.kova.4dl.app` — a live external
  // domain, from a machine that cannot reach it.
  const here = from ? new URL(from) : null;
  const shape = here ? shapeOf(here.hostname, env) : null;
  const host = await canonicalHost(env, env.DB, tenantId, shape?.root);
  // A CUSTOM domain is already absolute and always https; only a subdomain of our
  // own root inherits the request's protocol and port.
  const ours = shape ? host.endsWith(`.${shape.root}`) : false;
  if (!here || !ours) return `https://${host}`;
  return `${here.protocol}//${host}${here.port ? `:${here.port}` : ""}`;
}

/** Build the invite deep-link + opaque token, and send the branded invite email
 *  (SPEC §4, §8.1). Best-effort: a mail failure never fails client creation, and
 *  the returned QR data still lets the coach show the in-gym invite. */
async function buildClientInvite(env: Env, tenantId: string, clientId: string, email: string, from?: string): Promise<{ url: string; token: string; email: string; delivery: InviteDelivery }> {
  const loginUrl = await tenantLoginUrl(env, tenantId, from);
  const token = await signInviteToken(env, { c: clientId, t: tenantId, e: email });
  const url = `${loginUrl}${loginUrl.includes("?") ? "&" : "?"}invite=${encodeURIComponent(token)}`;
  const brand = await tenantBrandKit(env.DB, tenantId).catch(() => null);
  let delivery: InviteDelivery = { sent: false, reason: "This studio has no branding set up yet, so no invite email was sent." };
  if (brand) {
    const html = emailShell(
      `Welcome to ${escapeHtml(brand.name)}`,
      `<p style="margin:0 0 4px">Your coach set up your space on <strong>${escapeHtml(brand.name)}</strong>.</p>
       <p style="margin:0">Open it and sign in with this email — a one-time code lands in your inbox, no password to create.</p>
       ${emailButton(`Open ${brand.name}`, url, brand)}
       <p style="margin:18px 0 0;color:#8b9099;font-size:13px;line-height:1.6">If this wasn't meant for you, you can safely ignore this email.</p>`,
      { brand, preheader: `Your ${brand.name} space is ready`, eyebrow: "You're invited" },
    );
    const text = `Your coach set up your space on ${brand.name}. Open it and sign in with this email: ${url}`;
    const sent = await sendTenantEmail(env, tenantId, { to: email, subject: `Your ${brand.name} space is ready`, html, text, brandName: brand.name })
      .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
    delivery = describeDelivery(sent);
  }
  return { url, token, email, delivery };
}

/** Whether the invite email actually went out, and if not, why — in words a
 *  coach can act on. */
export interface InviteDelivery { sent: boolean; reason: string | null }

/**
 * Translate a send result into something the coach is told.
 *
 * This used to be `.catch(() => undefined)`: the email result was thrown away and
 * the route reported success either way. A studio with email switched off, out of
 * credits, or on an unconfigured Brevo account — and a FRESH DEPLOY cannot send
 * at all until the platform sender is configured — added a client, saw "invited",
 * and the client never heard anything. Nobody could tell, because the failure had
 * no representation anywhere.
 *
 * The recovery already exists and is good: the same response carries the invite
 * link and its QR token, so a coach who is TOLD can hand the client the link or
 * show the code in the gym. They just have to be told.
 */
function describeDelivery(r: { ok: boolean; skipped?: string; error?: string }): InviteDelivery {
  if (r.ok) return { sent: true, reason: null };
  // The three reasons the send path DECLINED before trying. Each is a studio
  // setting, so each is phrased as something the coach can go and change.
  const skipped: Record<string, string> = {
    provider_off: "Email is switched off in your studio settings.",
    no_credits: "Your studio is out of credits, so the email wasn't sent.",
    brevo_unconfigured: "Brevo needs an API key and a verified sender before it can send.",
  };
  if (r.skipped && skipped[r.skipped]) return { sent: false, reason: skipped[r.skipped]! };
  // Everything else is the provider's own failure, explained by the package
  // that owns those strings. This lookup used to be keyed on `error` too, with
  // one entry (`email_not_configured`) that is an HTTP error code from the OTP
  // route and is never returned by a send — so every real send failure landed
  // on the generic fallback and told the coach nothing at all.
  return { sent: false, reason: explainSendError(r.error) };
}

export const clientRoutes = new Hono<AppEnv>()
  // Roster — scoped by role.
  .get("/clients", async (c) => {
    const who = requireTenant(c)!;
    const scope = await visibleClientIds(c);
    if (scope !== "all" && scope.length === 0) return c.json({ clients: [] });
    const where =
      scope === "all"
        ? `tenant_id = ? AND status NOT IN ('archived', '${PENDING_SIGNUP}')`
        : `tenant_id = ? AND status NOT IN ('archived', '${PENDING_SIGNUP}') AND id IN (${scope.map(() => "?").join(",")})`;
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
    const cap = await withinQuota(c.env.DB, who.tenantId, "activeClients", await countClientSeats(c.env.DB, who.tenantId));
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
    // Send the branded invite + build the QR invite data (SPEC §4): the email is
    // the activation channel, and `invite` carries the deep-link + opaque token
    // the coach can show as an in-gym QR. Best-effort — never fails creation.
    let invite: { url: string; token: string; email: string; delivery: InviteDelivery } | null = null;
    if (body.data.email) {
      invite = await buildClientInvite(c.env, who.tenantId, id, body.data.email, c.req.url).catch(() => null);
    }
    const row = await getClient(c.env.DB, who.tenantId, id);
    return c.json({ client: clientView(row!), invite }, 201);
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
    // `email` is the identity field the sign-in auto-link matches on
    // (context-routes links an unlinked clients row to the user with that
    // address), so it stays staff-managed — a client editing their own profile
    // may change their name, phone and preferences but not the address their
    // record is keyed to.
    const email = c.get("role") === "client" ? cur.email : d.email !== undefined ? d.email : cur.email;
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
        email,
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

  /**
   * Take a client off the roster. OWNER ONLY.
   *
   * Ending the studio's relationship with a client is the owner's call, not an
   * employed coach's — the same reasoning as `/delete`, and the offboarding UI
   * already claimed "both are owner-only" while this route enforced nothing but
   * `requireClientAccess`, which the trainer preset satisfies for any client
   * assigned to them. A coach could offboard their own client silently.
   *
   * Archiving no longer frees an `activeClients` seat (see `countClientSeats`):
   * the record and its data stay on the tenancy, so the capacity is still in use.
   * Only `/delete` frees a seat, because only it erases the data.
   */
  .post("/clients/:id/archive", async (c) => {
    const access = await requireClientAccess(c, c.req.param("id"));
    if ("response" in access) return access.response;
    if (c.get("role") !== "owner") return c.json({ error: "forbidden", message: "Only the studio owner can archive a client." }, 403);
    await c.env.DB.prepare("UPDATE clients SET status = 'archived', archived_at = ? WHERE id = ?")
      .bind(nowIso(), access.client.id)
      .run();
    await recordAudit(c.env, { tenantId: access.client.tenant_id, clientId: access.client.id, actorUserId: c.get("user")?.id, action: "client.archive", summary: access.client.display_name });
    return c.json({ ok: true });
  })

  /**
   * Put an archived client back on the roster. OWNER ONLY, like archiving.
   *
   * Archiving was a one-way door for no reason anybody chose: the route existed,
   * the reverse did not, and the only way back was to create the person again —
   * a second record, a second invitation, and their entire history stranded on
   * the first one. A relationship ending and then resuming is ordinary (a client
   * takes a season off, a wrong row gets archived by mistake), so the reverse is
   * a route, not a support ticket.
   *
   * It cannot exceed the plan's ceiling, and that falls out of an earlier
   * decision rather than needing a check here: archiving does NOT free an
   * `activeClients` seat (`countClientSeats` counts archived records too,
   * because their data still sits on the tenancy). The seat was never released,
   * so taking it back cannot overrun anything.
   *
   * `archived_at` is cleared. It is the anchor the studio's own lapse ladder
   * counts from, and leaving it set would leave a restored client permanently
   * N days into a countdown they are no longer in.
   */
  .post("/clients/:id/unarchive", async (c) => {
    const access = await requireClientAccess(c, c.req.param("id"));
    if ("response" in access) return access.response;
    if (c.get("role") !== "owner") return c.json({ error: "forbidden", message: "Only the studio owner can restore a client." }, 403);
    await c.env.DB.prepare("UPDATE clients SET status = 'active', archived_at = NULL WHERE id = ?")
      .bind(access.client.id)
      .run();
    await recordAudit(c.env, { tenantId: access.client.tenant_id, clientId: access.client.id, actorUserId: c.get("user")?.id, action: "client.unarchive", summary: access.client.display_name });
    return c.json({ ok: true });
  })

  /**
   * PERMANENT erasure of one client (SPEC §8.1) — the hard-delete counterpart to
   * `/archive`. Both free an `activeClients` slot (the quota counts
   * `status != 'archived'`); only this one reclaims the database rows and the R2
   * bytes, and it cannot be undone.
   *
   * Reuses `purgeClient` (purge.ts) — the SAME cascade the GDPR self-delete
   * (`purgeUser`) and the studio teardown run. There is deliberately no second
   * deletion path.
   *
   * Two gates beyond `requireClientAccess`:
   *  • OWNER only. The action-level wall for `/api/clients` writes is
   *    `client:["update"]`, which the *trainer* preset also carries
   *    (`route-guard.ts` owns that map and is not this file's to change), so the
   *    owner restriction is asserted in-handler — the same idiom as
   *    `POST /billing/portal` and the studio-close routes.
   *  • A typed confirmation. `confirm` must match the client's display name, so
   *    an accidental (or scripted) single call cannot erase a record — the UI's
   *    two-step sheet is backed by a real server check, not just a dialog.
   *
   * POST, not DELETE, for the same reason `/archive` and `/tenant/close` are: the
   * confirmation travels in a JSON body rather than a query string that lands in
   * request logs (and the app's `api.del` sends no body).
   */
  .post("/clients/:id/delete", async (c) => {
    const access = await requireClientAccess(c, c.req.param("id"));
    if ("response" in access) return access.response;
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    const body = z
      .object({ confirm: z.string().max(120) })
      .safeParse(await c.req.json().catch(() => null));
    const typed = body.success ? body.data.confirm.trim().toLowerCase() : null;
    // `?? ""` guards a legacy row with a NULL name: `expected` is then empty, no
    // typed string can equal it, and the delete fails closed rather than throwing.
    const expected = (access.client.display_name ?? "").trim().toLowerCase();
    if (!expected || typed !== expected) {
      return c.json({ error: "confirm_mismatch", message: "Type the client's name exactly to confirm." }, 400);
    }
    const { id, tenant_id: tenantId, display_name: displayName } = access.client;
    const freed = await purgeClient(c.env, tenantId, id);
    // Post-delete capacity, so the UI can say the seat is actually back.
    const seatsUsed = await countClientSeats(c.env.DB, tenantId);
    const cap = await withinQuota(c.env.DB, tenantId, "activeClients", seatsUsed);
    return c.json({
      ok: true,
      deleted: { id, displayName },
      storage: {
        objectsRemoved: freed.objects,
        bytesFreed: freed.bytesFreed,
        mbFreed: Math.round((freed.bytesFreed / (1024 * 1024)) * 10) / 10,
      },
      activeClients: { used: seatsUsed, max: cap.max },
    });
  })

  /**
   * ── Offboarding requests ─────────────────────────────────────────────────
   *
   * Archive and delete are owner-only: one ends the studio's relationship with
   * a person, the other erases their data irreversibly. But the coach who works
   * with that client every week is the one who knows they should go, and making
   * them chase the owner by other means loses the reason and the audit trail.
   *
   * So: a coach asks with a reason; the owner approves or declines; the APPROVAL
   * is what performs the action. Nothing happens to the client in between, and
   * every step lands in the audit log.
   */
  .post("/clients/:id/offboard-request", async (c) => {
    const access = await requireClientAccess(c, c.req.param("id"));
    if ("response" in access) return access.response;
    const role = c.get("role");
    // An owner doesn't request — they act. Sending them down this path would
    // make them approve their own request, which is theatre.
    if (role === "owner") return c.json({ error: "owner_acts_directly", message: "You can archive or delete directly." }, 400);
    if (role !== "trainer" && role !== "assistant") return c.json({ error: "forbidden" }, 403);
    const body = z
      .object({ kind: z.enum(["archive", "delete"]), reason: z.string().trim().min(1).max(500) })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body", message: "Say which action and why." }, 400);

    const who = requireTenant(c)!;
    const { id: clientId, tenant_id: tenantId, display_name: name } = access.client;
    const existing = await c.env.DB
      .prepare("SELECT id FROM offboard_requests WHERE client_id = ? AND status = 'pending'")
      .bind(clientId)
      .first<{ id: string }>();
    if (existing) return c.json({ error: "already_pending", message: "There's already a request waiting on the owner for this client." }, 409);

    const id = newId("obr");
    await c.env.DB.prepare(
      "INSERT INTO offboard_requests (id, tenant_id, client_id, kind, reason, status, requested_by, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)",
    ).bind(id, tenantId, clientId, body.data.kind, body.data.reason, who.userId, nowIso()).run();

    const actor = c.get("user")?.name || c.get("user")?.email || "A coach";
    await recordAudit(c.env, { tenantId, clientId, actorUserId: who.userId, action: "client.offboard_request", summary: `${body.data.kind}: ${name}` });
    // Every owner hears about it — this is a decision waiting on them.
    const owners = await c.env.DB.prepare('SELECT userId FROM "member" WHERE organizationId = ? AND role = ?').bind(tenantId, "owner").all<{ userId: string | null }>();
    for (const o of owners.results ?? []) {
      if (o.userId) {
        await notify(c.env, {
          tenantId, userId: o.userId, type: "offboard_requested",
          message: `${actor} asked to ${body.data.kind} ${name}. Reason: ${body.data.reason}`,
          link: `/clients/${clientId}`,
        });
      }
    }
    return c.json({ request: { id, kind: body.data.kind, status: "pending" } }, 201);
  })

  /** Requests this caller should see: an owner sees the studio's pending queue,
   *  a coach sees the ones they raised (so they can tell it landed). */
  .get("/offboard-requests", async (c) => {
    const who = requireTenant(c)!;
    const role = c.get("role");
    const isOwner = role === "owner";
    const rows = await c.env.DB.prepare(
      `SELECT r.id, r.client_id, r.kind, r.reason, r.status, r.created_at, r.decision_note, r.decided_at,
              c.display_name, u.name AS requester_name, u.email AS requester_email
         FROM offboard_requests r
         LEFT JOIN clients c ON c.id = r.client_id
         LEFT JOIN "user" u ON u.id = r.requested_by
        WHERE r.tenant_id = ?${isOwner ? "" : " AND r.requested_by = ?"}
        ORDER BY r.status = 'pending' DESC, r.created_at DESC
        LIMIT 100`,
    ).bind(...(isOwner ? [who.tenantId] : [who.tenantId, who.userId])).all<{
      id: string; client_id: string; kind: string; reason: string; status: string; created_at: string;
      decision_note: string | null; decided_at: string | null; display_name: string | null;
      requester_name: string | null; requester_email: string | null;
    }>();
    return c.json({
      requests: (rows.results ?? []).map((r) => ({
        id: r.id, clientId: r.client_id, clientName: r.display_name, kind: r.kind, reason: r.reason,
        status: r.status, createdAt: r.created_at, decidedAt: r.decided_at, decisionNote: r.decision_note,
        requestedBy: r.requester_name || r.requester_email || "A coach",
      })),
      canDecide: isOwner,
    });
  })

  /**
   * The owner's decision. Approving PERFORMS the action, so this route is the
   * only place a coach-initiated archive or delete can actually happen — and it
   * still runs the same owner-only code paths, not a bypass.
   */
  .post("/offboard-requests/:id/decide", async (c) => {
    const who = requireTenant(c)!;
    if (c.get("role") !== "owner") return c.json({ error: "forbidden", message: "Only the studio owner can decide this." }, 403);
    const body = z
      .object({ approve: z.boolean(), note: z.string().trim().max(500).optional() })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid body" }, 400);

    const req = await c.env.DB
      .prepare("SELECT * FROM offboard_requests WHERE id = ? AND tenant_id = ?")
      .bind(c.req.param("id"), who.tenantId)
      .first<{ id: string; client_id: string; kind: string; reason: string; status: string; requested_by: string | null }>();
    if (!req) return c.json({ error: "not found" }, 404);
    if (req.status !== "pending") return c.json({ error: "already_decided", message: `This request was already ${req.status}.` }, 409);

    const client = await getClient(c.env.DB, who.tenantId, req.client_id);
    const name = client?.display_name ?? "the client";
    let freed: { objects: number; bytesFreed: number } | null = null;

    if (body.data.approve) {
      if (!client) return c.json({ error: "client_gone", message: "That client no longer exists." }, 409);
      if (req.kind === "delete") {
        freed = await purgeClient(c.env, who.tenantId, req.client_id);
      } else {
        await c.env.DB.prepare("UPDATE clients SET status = 'archived', archived_at = ? WHERE id = ?").bind(nowIso(), req.client_id).run();
      }
    }

    await c.env.DB.prepare(
      "UPDATE offboard_requests SET status = ?, decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ?",
    ).bind(body.data.approve ? "approved" : "declined", who.userId, nowIso(), body.data.note ?? null, req.id).run();

    await recordAudit(c.env, {
      tenantId: who.tenantId, clientId: req.client_id, actorUserId: who.userId,
      action: body.data.approve ? `client.offboard_approved` : `client.offboard_declined`,
      summary: `${req.kind}: ${name}`,
    });

    // Tell the coach who asked — a request that vanishes silently is worse than
    // no request flow at all.
    if (req.requested_by) {
      await notify(c.env, {
        tenantId: who.tenantId, userId: req.requested_by, type: "offboard_decided",
        title: body.data.approve ? `${name} was ${req.kind === "delete" ? "deleted" : "archived"}` : `Removal of ${name} was declined`,
        message: body.data.note || (body.data.approve ? "The owner approved your request." : "The owner declined your request."),
        link: body.data.approve && req.kind === "delete" ? "/clients" : `/clients/${req.client_id}`,
      });
    }

    const seatsUsed = await countClientSeats(c.env.DB, who.tenantId);
    const cap = await withinQuota(c.env.DB, who.tenantId, "activeClients", seatsUsed);
    return c.json({
      ok: true,
      status: body.data.approve ? "approved" : "declined",
      kind: req.kind,
      storage: freed ? { objectsRemoved: freed.objects, mbFreed: Math.round((freed.bytesFreed / (1024 * 1024)) * 10) / 10 } : null,
      activeClients: { used: seatsUsed, max: cap.max },
    });
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
