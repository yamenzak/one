/**
 * D1 schema (SPEC §9) — applied lazily + idempotently (CREATE TABLE IF NOT
 * EXISTS, once per isolate) so local `wrangler dev` is frictionless.
 *
 * Conventions: text ids (time-sortable, see ids.ts); ISO-8601 UTC instants in
 * TEXT columns; day-bucketed rows carry the CLIENT'S local date as
 * `date_local` (YYYY-MM-DD — the app computes it device-side, SPEC §8.6);
 * deep structures (plan bodies, budgets, targets) are JSON columns validated
 * by @mossa/protocol schemas at the route boundary.
 *
 * Better Auth's tables are mirrored 1:1 from its SQLite schema (string→TEXT,
 * boolean→INTEGER, date→DATE) so its adapter reads/writes them natively. An
 * `organization` IS a Mossa tenant.
 */

let schemaReady: Promise<void> | null = null;

export function ensureSchema(db: D1Database): Promise<void> {
  if (!schemaReady) {
    schemaReady = db
      .exec(
        [
          // ── Better Auth (org = tenant; 100% passwordless: OTP + passkey) ──
          'CREATE TABLE IF NOT EXISTS "user" (id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, emailVerified INTEGER, image TEXT, createdAt DATE, updatedAt DATE);',
          'CREATE TABLE IF NOT EXISTS "session" (id TEXT PRIMARY KEY, expiresAt DATE, token TEXT UNIQUE, createdAt DATE, updatedAt DATE, ipAddress TEXT, userAgent TEXT, userId TEXT, activeOrganizationId TEXT);',
          'CREATE TABLE IF NOT EXISTS "account" (id TEXT PRIMARY KEY, accountId TEXT, providerId TEXT, userId TEXT, accessToken TEXT, refreshToken TEXT, idToken TEXT, accessTokenExpiresAt DATE, refreshTokenExpiresAt DATE, scope TEXT, password TEXT, createdAt DATE, updatedAt DATE);',
          'CREATE TABLE IF NOT EXISTS "verification" (id TEXT PRIMARY KEY, identifier TEXT, value TEXT, expiresAt DATE, createdAt DATE, updatedAt DATE);',
          'CREATE TABLE IF NOT EXISTS "organization" (id TEXT PRIMARY KEY, name TEXT, slug TEXT UNIQUE, logo TEXT, createdAt DATE, metadata TEXT);',
          'CREATE TABLE IF NOT EXISTS "member" (id TEXT PRIMARY KEY, organizationId TEXT, userId TEXT, role TEXT, permissions_json TEXT, createdAt DATE);',
          // Resolved on EVERY authenticated request (role + permissions lookup) —
          // without this the member table is full-scanned per request.
          'CREATE INDEX IF NOT EXISTS idx_member_org_user ON "member"(organizationId, userId);',
          'CREATE TABLE IF NOT EXISTS "invitation" (id TEXT PRIMARY KEY, organizationId TEXT, email TEXT, role TEXT, status TEXT, expiresAt DATE, inviterId TEXT, createdAt DATE);',
          // Passkey plugin (WebAuthn credentials; multiple per user).
          'CREATE TABLE IF NOT EXISTS "passkey" (id TEXT PRIMARY KEY, name TEXT, publicKey TEXT, userId TEXT, credentialID TEXT, counter INTEGER, deviceType TEXT, backedUp INTEGER, transports TEXT, createdAt DATE, aaguid TEXT);',

          // ── Platform billing (SPEC §5, §6) ─────────────────────────────────
          "CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, name TEXT, price_usd_month REAL, entitlements_json TEXT, stripe_product_id TEXT, stripe_price_id TEXT, ord INTEGER, active INTEGER DEFAULT 1);",
          "CREATE TABLE IF NOT EXISTS subscriptions (tenant_id TEXT PRIMARY KEY, plan_id TEXT, status TEXT, comp INTEGER DEFAULT 0, stripe_customer_id TEXT, stripe_sub_id TEXT, pending_plan_id TEXT, current_period_end TEXT, past_due_at TEXT, suspend_at TEXT, delete_at TEXT, overrides_json TEXT, updated_at TEXT);",
          // dailySweep scans by status (grant to active/trialing tenants).
          "CREATE INDEX IF NOT EXISTS idx_subs_status ON subscriptions(status);",
          "CREATE INDEX IF NOT EXISTS idx_subs_customer ON subscriptions(stripe_customer_id);",
          "CREATE TABLE IF NOT EXISTS credit_packs (id TEXT PRIMARY KEY, name TEXT, credits INTEGER, price_usd REAL, stripe_product_id TEXT, stripe_price_id TEXT, ord INTEGER, active INTEGER DEFAULT 1);",
          "CREATE TABLE IF NOT EXISTS credit_ledger (id TEXT PRIMARY KEY, tenant_id TEXT, delta INTEGER, balance INTEGER, reason TEXT, ref TEXT, at INTEGER);",
          "CREATE INDEX IF NOT EXISTS idx_ledger_tenant ON credit_ledger(tenant_id, at);",
          "CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT);",
          // Webhook idempotency — first insert of a Stripe event id wins; a
          // redelivery is a no-op (changes = 0), so no handler double-applies.
          "CREATE TABLE IF NOT EXISTS stripe_events (id TEXT PRIMARY KEY, at INTEGER);",

          // ── AI suite (SPEC §6) ─────────────────────────────────────────────
          "CREATE TABLE IF NOT EXISTS ai_models (id TEXT PRIMARY KEY, task TEXT, label TEXT, provider TEXT, input_rate REAL, output_rate REAL, unit_rate REAL, unit_kind TEXT, markup REAL, enabled INTEGER DEFAULT 1, is_default INTEGER DEFAULT 0);",
          "CREATE TABLE IF NOT EXISTS ai_generations (id TEXT PRIMARY KEY, tenant_id TEXT, actor_user_id TEXT, client_id TEXT, feature TEXT, model TEXT, neurons REAL, credits INTEGER, ok INTEGER, error TEXT, at INTEGER);",
          "CREATE INDEX IF NOT EXISTS idx_aigen_tenant ON ai_generations(tenant_id, at);",
          "CREATE TABLE IF NOT EXISTS ai_cache (prompt_hash TEXT PRIMARY KEY, feature TEXT, output_json TEXT, at INTEGER);",
          "CREATE TABLE IF NOT EXISTS insight_feedback (id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, insight_type TEXT, insight_ref TEXT, vote INTEGER, at INTEGER);",

          // ── Auth security (SPEC §4) ────────────────────────────────────────
          "CREATE TABLE IF NOT EXISTS auth_logs (id TEXT PRIMARY KEY, event TEXT, email TEXT, ip TEXT, user_agent TEXT, success INTEGER, at INTEGER);",
          "CREATE INDEX IF NOT EXISTS idx_authlogs_email ON auth_logs(email, at);",

          // ── Tenancy domain: clients & staff scoping (SPEC §2) ──────────────
          "CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, display_name TEXT, email TEXT, status TEXT DEFAULT 'active', gender TEXT, date_of_birth TEXT, height_cm REAL, timezone TEXT, weight_unit TEXT DEFAULT 'kg', length_unit TEXT DEFAULT 'cm', volume_unit TEXT DEFAULT 'ml', intake_json TEXT, dashboard_prefs_json TEXT, onboarding_complete INTEGER DEFAULT 0, avatar_url TEXT, avatar_seed TEXT, created_at TEXT, archived_at TEXT);",
          "CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients(tenant_id, status);",
          "CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(user_id);",
          // /api/context auto-links an unclaimed client by lowercased email on
          // every boot; an expression index makes that a lookup, not a full scan.
          "CREATE INDEX IF NOT EXISTS idx_clients_email_lower ON clients(LOWER(email));",
          "CREATE TABLE IF NOT EXISTS client_trainers (client_id TEXT, trainer_user_id TEXT, tenant_id TEXT, is_primary INTEGER DEFAULT 0, created_at TEXT, PRIMARY KEY (client_id, trainer_user_id));",
          "CREATE INDEX IF NOT EXISTS idx_ct_trainer ON client_trainers(tenant_id, trainer_user_id);",

          // ── Goals (SPEC §8.2) ──────────────────────────────────────────────
          "CREATE TABLE IF NOT EXISTS client_goals (id TEXT PRIMARY KEY, tenant_id TEXT, client_id TEXT, label TEXT, status TEXT DEFAULT 'active', start_date TEXT, end_date TEXT, targets_json TEXT, ranges_json TEXT, derivation_json TEXT, weekly_load_target INTEGER, notes TEXT, created_by TEXT, created_at TEXT);",
          "CREATE INDEX IF NOT EXISTS idx_goals_client ON client_goals(client_id, status);",

          // ── Workout system (SPEC §8.3) ─────────────────────────────────────
          "CREATE TABLE IF NOT EXISTS exercises (id TEXT PRIMARY KEY, tenant_id TEXT, visibility TEXT DEFAULT 'tenant', name TEXT, slug TEXT, muscle_groups TEXT, secondary_muscle_groups TEXT, equipment TEXT, difficulty TEXT, force TEXT, mechanic TEXT, category TEXT, instructions_md TEXT, thumb_url TEXT, thumb2_url TEXT, video_url TEXT, source TEXT, source_id TEXT, active INTEGER DEFAULT 1, created_by TEXT, created_at TEXT);",
          "CREATE INDEX IF NOT EXISTS idx_exercises_tenant ON exercises(tenant_id, active);",
          // Dedup is PER TENANT (+ shared globals), so the uniqueness must include
          // tenant_id — a global (source, source_id) unique index made per-tenant
          // copies impossible and forced imports to share one tenant's row. DROP
          // the old global index and recreate scoped. (The new index is strictly
          // more permissive, so this can't fail on existing data.)
          "DROP INDEX IF EXISTS idx_exercises_source;",
          "CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_source ON exercises(tenant_id, source, source_id) WHERE source_id IS NOT NULL;",
          "CREATE TABLE IF NOT EXISTS exercise_alternatives (exercise_a TEXT, exercise_b TEXT, PRIMARY KEY (exercise_a, exercise_b));",
          "CREATE TABLE IF NOT EXISTS workout_plans (id TEXT PRIMARY KEY, tenant_id TEXT, client_id TEXT, name TEXT, description TEXT, status TEXT DEFAULT 'draft', published_at TEXT, target_goal_json TEXT, body_json TEXT, created_by TEXT, created_at TEXT, updated_at TEXT);",
          "CREATE INDEX IF NOT EXISTS idx_wplans_client ON workout_plans(client_id, status);",
          "CREATE TABLE IF NOT EXISTS workout_templates (id TEXT PRIMARY KEY, tenant_id TEXT, visibility TEXT DEFAULT 'private', name TEXT, description TEXT, body_json TEXT, created_by TEXT, created_at TEXT, updated_at TEXT);",
          "CREATE TABLE IF NOT EXISTS swap_requests (id TEXT PRIMARY KEY, tenant_id TEXT, client_id TEXT, workout_plan_id TEXT, day_index INTEGER, block_index INTEGER, slot_index INTEGER, current_exercise_id TEXT, suggested_exercise_id TEXT, reason TEXT, status TEXT DEFAULT 'pending', trainer_note TEXT, resolved_by TEXT, created_at TEXT, resolved_at TEXT);",

          // ── Nutrition system (SPEC §8.4) ───────────────────────────────────
          "CREATE TABLE IF NOT EXISTS foods (id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, brand TEXT, barcode TEXT, serving_size REAL DEFAULT 100, serving_unit TEXT DEFAULT 'g', calories REAL DEFAULT 0, protein_g REAL DEFAULT 0, carbs_g REAL DEFAULT 0, fat_g REAL DEFAULT 0, fiber_g REAL DEFAULT 0, sugar_g REAL DEFAULT 0, sodium_mg REAL DEFAULT 0, saturated_fat_g REAL DEFAULT 0, cholesterol_mg REAL DEFAULT 0, potassium_mg REAL DEFAULT 0, calcium_mg REAL DEFAULT 0, iron_mg REAL DEFAULT 0, description TEXT, image_url TEXT, visibility TEXT DEFAULT 'tenant', source TEXT DEFAULT 'custom', source_id TEXT, verified INTEGER DEFAULT 0, active INTEGER DEFAULT 1, created_by TEXT, created_at TEXT);",
          "CREATE INDEX IF NOT EXISTS idx_foods_tenant ON foods(tenant_id, active);",
          "CREATE INDEX IF NOT EXISTS idx_foods_barcode ON foods(barcode);",
          "CREATE TABLE IF NOT EXISTS meal_plans (id TEXT PRIMARY KEY, tenant_id TEXT, client_id TEXT, name TEXT, description TEXT, status TEXT DEFAULT 'draft', published_at TEXT, target_goal_json TEXT, body_json TEXT, created_by TEXT, created_at TEXT, updated_at TEXT);",
          "CREATE INDEX IF NOT EXISTS idx_mplans_client ON meal_plans(client_id, status);",
          "CREATE TABLE IF NOT EXISTS meal_templates (id TEXT PRIMARY KEY, tenant_id TEXT, visibility TEXT DEFAULT 'private', name TEXT, description TEXT, body_json TEXT, created_by TEXT, created_at TEXT, updated_at TEXT);",
          "CREATE TABLE IF NOT EXISTS meal_arrangements (client_id TEXT, meal_plan_id TEXT, tenant_id TEXT, slots_json TEXT, updated_at TEXT, PRIMARY KEY (client_id, meal_plan_id));",

          // ── Logging & tracking (SPEC §8.6) ─────────────────────────────────
          "CREATE TABLE IF NOT EXISTS exercise_logs (id TEXT PRIMARY KEY, tenant_id TEXT, client_id TEXT, date_local TEXT, workout_plan_id TEXT, plan_day_index INTEGER, entries_json TEXT, session_calories INTEGER, created_at TEXT, updated_at TEXT);",
          "CREATE UNIQUE INDEX IF NOT EXISTS idx_elogs_session ON exercise_logs(client_id, workout_plan_id, plan_day_index, date_local);",
          "CREATE INDEX IF NOT EXISTS idx_elogs_client ON exercise_logs(client_id, date_local);",
          "CREATE TABLE IF NOT EXISTS activity_logs (id TEXT PRIMARY KEY, tenant_id TEXT, client_id TEXT, date_local TEXT, activity_key TEXT, label TEXT, start_time TEXT, duration_min INTEGER, avg_hr_bpm INTEGER, calories INTEGER, calories_locked INTEGER DEFAULT 0, created_at TEXT);",
          "CREATE INDEX IF NOT EXISTS idx_alogs_client ON activity_logs(client_id, date_local);",
          "CREATE TABLE IF NOT EXISTS food_entries (id TEXT PRIMARY KEY, tenant_id TEXT, client_id TEXT, date_local TEXT, meal_type TEXT, food_id TEXT, label TEXT, quantity REAL, unit TEXT, calories REAL DEFAULT 0, protein_g REAL DEFAULT 0, carbs_g REAL DEFAULT 0, fat_g REAL DEFAULT 0, source TEXT DEFAULT 'self_logged', meal_plan_id TEXT, meal_option_index INTEGER, image_url TEXT, created_at TEXT);",
          "CREATE INDEX IF NOT EXISTS idx_fentries_client ON food_entries(client_id, date_local);",
          "CREATE TABLE IF NOT EXISTS water_logs (client_id TEXT, date_local TEXT, tenant_id TEXT, total_ml INTEGER DEFAULT 0, entries_json TEXT, updated_at TEXT, PRIMARY KEY (client_id, date_local));",
          "CREATE TABLE IF NOT EXISTS sleep_logs (client_id TEXT, date_local TEXT, tenant_id TEXT, duration_minutes INTEGER, quality INTEGER, notes TEXT, updated_at TEXT, PRIMARY KEY (client_id, date_local));",
          "CREATE TABLE IF NOT EXISTS mood_logs (client_id TEXT, date_local TEXT, tenant_id TEXT, mood INTEGER, energy INTEGER, stress INTEGER, notes TEXT, updated_at TEXT, PRIMARY KEY (client_id, date_local));",
          "CREATE TABLE IF NOT EXISTS measurements (id TEXT PRIMARY KEY, tenant_id TEXT, client_id TEXT, date_local TEXT, weight_kg REAL, body_fat_percent REAL, neck_cm REAL, waist_cm REAL, hips_cm REAL, chest_cm REAL, notes TEXT, created_at TEXT);",
          "CREATE UNIQUE INDEX IF NOT EXISTS idx_meas_day ON measurements(client_id, date_local);",
          // Camera body-scan history (SPEC §8.5). Circumferences + the ensemble
          // result + confidence; contour_*_json are de-identified outlines kept
          // only on consent (for the progress morph). One scan per client-day.
          "CREATE TABLE IF NOT EXISTS body_scans (id TEXT PRIMARY KEY, tenant_id TEXT, client_id TEXT, date_local TEXT, body_fat_percent REAL, low REAL, high REAL, confidence TEXT, neck_cm REAL, waist_cm REAL, hips_cm REAL, chest_cm REAL, weight_kg REAL, height_cm REAL, methods_json TEXT, contour_front_json TEXT, contour_side_json TEXT, posture_cva_deg REAL, posture_tilt_deg REAL, posture_severity TEXT, somatotype TEXT, created_at TEXT);",
          "CREATE UNIQUE INDEX IF NOT EXISTS idx_body_scans_day ON body_scans(client_id, date_local);",
          // Tenant-cached TTS cue audio (generate once via Gemini, reuse forever).
          // Key = (tenant, voice, lang, phrase id, version) → an R2 media key.
          "CREATE TABLE IF NOT EXISTS tts_cues (tenant_id TEXT, voice TEXT, lang TEXT, phrase_id TEXT, version INTEGER DEFAULT 1, media_key TEXT, created_at TEXT, PRIMARY KEY (tenant_id, voice, lang, phrase_id, version));",
          "CREATE TABLE IF NOT EXISTS check_ins (id TEXT PRIMARY KEY, tenant_id TEXT, client_id TEXT, date_local TEXT, weight_kg REAL, mood INTEGER, energy INTEGER, stress INTEGER, sleep_quality INTEGER, sleep_hours REAL, water_ml INTEGER, steps_count INTEGER, notes TEXT, photos_json TEXT, trainer_feedback TEXT, feedback_by TEXT, feedback_at TEXT, created_at TEXT, updated_at TEXT);",
          "CREATE UNIQUE INDEX IF NOT EXISTS idx_checkins_day ON check_ins(client_id, date_local);",
          "CREATE TABLE IF NOT EXISTS fasting_sessions (id TEXT PRIMARY KEY, tenant_id TEXT, client_id TEXT, started_at TEXT, ended_at TEXT, duration_minutes INTEGER, target_hours INTEGER DEFAULT 16, created_at TEXT);",
          "CREATE INDEX IF NOT EXISTS idx_fasting_client ON fasting_sessions(client_id, started_at);",

          // ── Supplements & labs (SPEC §8.8) ─────────────────────────────────
          "CREATE TABLE IF NOT EXISTS supplements (id TEXT PRIMARY KEY, tenant_id TEXT, client_id TEXT, prescribed_by TEXT, name TEXT, brand TEXT, kind TEXT, dose TEXT, schedule_json TEXT, notes TEXT, linked_lab_id TEXT, start_date TEXT, end_date TEXT, status TEXT DEFAULT 'active', created_at TEXT);",
          "CREATE TABLE IF NOT EXISTS supplement_logs (client_id TEXT, supplement_id TEXT, date_local TEXT, slot TEXT, tenant_id TEXT, taken_at TEXT, PRIMARY KEY (client_id, supplement_id, date_local, slot));",
          "CREATE TABLE IF NOT EXISTS lab_tests (id TEXT PRIMARY KEY, tenant_id TEXT, client_id TEXT, requested_by TEXT, type TEXT, custom_type TEXT, display_name TEXT, instructions TEXT, due_by TEXT, status TEXT DEFAULT 'requested', file_key TEXT, uploaded_at TEXT, values_json TEXT, client_notes TEXT, trainer_feedback TEXT, reviewed_at TEXT, created_at TEXT);",

          // ── Commerce: the access economy (SPEC §7) ─────────────────────────
          "CREATE TABLE IF NOT EXISTS packages (id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, description TEXT, one_time_price_cents INTEGER, monthly_price_cents INTEGER, installment_months INTEGER, currency TEXT DEFAULT 'usd', budgets_json TEXT, addons_json TEXT, flags_json TEXT, visibility TEXT DEFAULT 'private', restricted_client_id TEXT, once_per_customer INTEGER DEFAULT 0, stripe_product_id TEXT, stripe_price_id TEXT, stripe_monthly_price_id TEXT, active INTEGER DEFAULT 1, created_at TEXT);",
          "CREATE INDEX IF NOT EXISTS idx_packages_tenant ON packages(tenant_id, active);",
          "CREATE TABLE IF NOT EXISTS client_subscriptions (id TEXT PRIMARY KEY, tenant_id TEXT, client_id TEXT, package_id TEXT, status TEXT DEFAULT 'active', payment_status TEXT DEFAULT 'none', budgets_json TEXT, addons_json TEXT, flags_json TEXT, source TEXT DEFAULT 'admin', installments_paid INTEGER, installments_total INTEGER, stripe_sub_id TEXT, stripe_checkout_id TEXT, started_at TEXT, updated_at TEXT, notes TEXT);",
          "CREATE INDEX IF NOT EXISTS idx_csubs_client ON client_subscriptions(client_id, status);",
          // reminderSweep scans active subs platform-wide; renew/cancel resolve by
          // the Stripe subscription id.
          "CREATE INDEX IF NOT EXISTS idx_csubs_status ON client_subscriptions(status);",
          "CREATE INDEX IF NOT EXISTS idx_csubs_stripe_sub ON client_subscriptions(stripe_sub_id);",
          "CREATE TABLE IF NOT EXISTS redemption_codes (id TEXT PRIMARY KEY, tenant_id TEXT, code TEXT, days_to_add INTEGER, target_feature TEXT DEFAULT 'all', max_uses INTEGER DEFAULT 1, used_count INTEGER DEFAULT 0, used_by_json TEXT, expires_at TEXT, active INTEGER DEFAULT 1, restricted_package_id TEXT, restricted_client_id TEXT, created_by TEXT, created_at TEXT);",
          "CREATE UNIQUE INDEX IF NOT EXISTS idx_redemption_code ON redemption_codes(tenant_id, code);",
          // Per-(code,client) redemption claim — the UNIQUE PK is what atomically
          // dedupes a client's second redemption (see /redeem), replacing the
          // lost-update-prone used_by_json array check.
          "CREATE TABLE IF NOT EXISTS redemption_uses (code_id TEXT, client_id TEXT, at TEXT, PRIMARY KEY (code_id, client_id));",
          // Promo codes = Stripe checkout discounts (distinct from redemption day top-ups).
          "CREATE TABLE IF NOT EXISTS promo_codes (id TEXT PRIMARY KEY, tenant_id TEXT, code TEXT, discount_type TEXT DEFAULT 'percent', percent_off INTEGER, amount_off_cents INTEGER, restricted_package_id TEXT, restricted_client_id TEXT, scope TEXT DEFAULT 'tenant', max_redemptions INTEGER, redemption_count INTEGER DEFAULT 0, expires_at TEXT, active INTEGER DEFAULT 1, stripe_coupon_id TEXT, stripe_promo_id TEXT, created_by TEXT, created_at TEXT);",
          "CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_code ON promo_codes(tenant_id, code);",
          // Personal unit preferences, per user (cross-tenant).
          "CREATE TABLE IF NOT EXISTS user_prefs (user_id TEXT PRIMARY KEY, units_json TEXT, updated_at TEXT);",
          "CREATE TABLE IF NOT EXISTS addon_types (id TEXT PRIMARY KEY, tenant_id TEXT, slug TEXT, label TEXT, kind TEXT DEFAULT 'consultation', duration_minutes INTEGER, standalone_price_cents INTEGER, active INTEGER DEFAULT 1);",
          "CREATE TABLE IF NOT EXISTS trainer_sessions (id TEXT PRIMARY KEY, tenant_id TEXT, client_id TEXT, trainer_user_id TEXT, subscription_id TEXT, addon_type_id TEXT, scheduled_at TEXT, duration_minutes INTEGER, status TEXT DEFAULT 'scheduled', completed_at TEXT, notes TEXT, created_at TEXT);",

          // ── Content hub + notifications (SPEC §8.10) ───────────────────────
          "CREATE TABLE IF NOT EXISTS resources (id TEXT PRIMARY KEY, tenant_id TEXT, type TEXT DEFAULT 'article', title TEXT, summary TEXT, body_md TEXT, cover_url TEXT, topics TEXT, muscle_groups TEXT, duration_minutes INTEGER, audience TEXT DEFAULT 'clients', assigned_json TEXT, status TEXT DEFAULT 'draft', author_user_id TEXT, published_at TEXT, created_at TEXT, updated_at TEXT);",
          "CREATE INDEX IF NOT EXISTS idx_resources_tenant ON resources(tenant_id, status);",
          "CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, tenant_id TEXT, recipient_user_id TEXT, type TEXT, title TEXT, message TEXT, link TEXT, read INTEGER DEFAULT 0, created_at TEXT);",
          "CREATE INDEX IF NOT EXISTS idx_notif_recipient ON notifications(recipient_user_id, read);",
          // The bell lists a recipient's notifications ORDER BY created_at DESC.
          "CREATE INDEX IF NOT EXISTS idx_notif_recipient_time ON notifications(recipient_user_id, created_at);",
          // Weekly-digest idempotency: one row per (user, week, role) gates the
          // send, so an at-least-once cron redelivery can't re-email — and a run
          // that timed out mid-sweep resumes on the next fire (already-sent users
          // are skipped) instead of starting over.
          "CREATE TABLE IF NOT EXISTS digest_sent (user_id TEXT, period TEXT, kind TEXT, at TEXT, PRIMARY KEY (user_id, period, kind));",

          // ── Tenant settings (branding, AI toggles, marketplace, Connect) ───
          "CREATE TABLE IF NOT EXISTS tenant_settings (tenant_id TEXT PRIMARY KEY, branding_json TEXT, ai_toggles_json TEXT, marketplace_json TEXT, integrations_json TEXT, stripe_account_id TEXT, updated_at TEXT);",

          // ── Custom domains (SPEC §14.1) — Cloudflare for SaaS white-label.
          // Keyed by hostname for the Host→tenant lookup on every request. One
          // row per tenant hostname; status/ssl mirror the CF custom hostname.
          "CREATE TABLE IF NOT EXISTS tenant_domains (hostname TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, cf_hostname_id TEXT, status TEXT DEFAULT 'pending', ssl_status TEXT, verify_name TEXT, verify_value TEXT, cname_target TEXT, created_by TEXT, created_at TEXT, updated_at TEXT);",
          "CREATE INDEX IF NOT EXISTS idx_tenant_domains_tenant ON tenant_domains(tenant_id);",

          // ── Coach-action audit log (SPEC §9; REGISTRY-PLAN Phase 3) ────────
          // Durable, queryable record of STAFF actions on a client's record. The
          // action id keys into @mossa/domain AUDIT_ACTIONS; summary is a short
          // human line; ref points at the affected row. Listed newest-first per
          // client, so the index is (client_id, at DESC).
          "CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY, tenant_id TEXT, client_id TEXT, actor_user_id TEXT, action TEXT, summary TEXT, ref TEXT, at INTEGER);",
          "CREATE INDEX IF NOT EXISTS idx_audit_client ON audit_log(client_id, at);",
        ].join(" "),
      )
      .then(async () => {
        // Best-effort column migrations for tables that predate a column.
        // Each is harmless (and errors ignored) once the column exists.
        const alters = [
          "ALTER TABLE clients ADD COLUMN avatar_url TEXT",
          "ALTER TABLE clients ADD COLUMN avatar_seed TEXT",
          // Rich micronutrients on foods (ByShujaa parity).
          "ALTER TABLE foods ADD COLUMN saturated_fat_g REAL DEFAULT 0",
          "ALTER TABLE foods ADD COLUMN cholesterol_mg REAL DEFAULT 0",
          "ALTER TABLE foods ADD COLUMN potassium_mg REAL DEFAULT 0",
          "ALTER TABLE foods ADD COLUMN calcium_mg REAL DEFAULT 0",
          "ALTER TABLE foods ADD COLUMN iron_mg REAL DEFAULT 0",
          "ALTER TABLE foods ADD COLUMN description TEXT",
          "ALTER TABLE food_entries ADD COLUMN image_url TEXT",
          // Exercise alternatives are per-tenant (a studio's own swap map).
          "ALTER TABLE exercise_alternatives ADD COLUMN tenant_id TEXT",
          // Food ownership visibility (SPEC §8): tenant (shared) | private
          // (creator only). Platform-seed rows stay tenant_id NULL = global.
          "ALTER TABLE foods ADD COLUMN visibility TEXT DEFAULT 'tenant'",
          // Tenant integration settings (provider enable + API keys).
          "ALTER TABLE tenant_settings ADD COLUMN integrations_json TEXT",
          // Per-user home-screen widget layout (client + coach surfaces).
          "ALTER TABLE user_prefs ADD COLUMN widgets_json TEXT",
          // Tenant AI config: per-feature model/prompt/enable + house tone.
          "ALTER TABLE tenant_settings ADD COLUMN ai_config_json TEXT",
          // Client profile: blood type + contact number.
          "ALTER TABLE clients ADD COLUMN blood_type TEXT",
          "ALTER TABLE clients ADD COLUMN phone TEXT",
          // Content: a single category + a URL slug for headless/public fetch.
          "ALTER TABLE resources ADD COLUMN category TEXT",
          "ALTER TABLE resources ADD COLUMN slug TEXT",
          // Client preferences (settings-managed profile: target weight, goal,
          // activity, workouts/week, meals/day, workout location, dietary).
          "ALTER TABLE clients ADD COLUMN preferences_json TEXT",
          // Body composition recomputed on every weight/body-fat entry.
          "ALTER TABLE measurements ADD COLUMN bmi REAL",
          "ALTER TABLE measurements ADD COLUMN bmr REAL",
          // Stripe Connect account status (synced from account.updated + a live
          // refresh). `charges_enabled` is the truth gate for selling — a row's
          // mere existence no longer means the account can accept payments.
          "ALTER TABLE tenant_settings ADD COLUMN charges_enabled INTEGER DEFAULT 0",
          "ALTER TABLE tenant_settings ADD COLUMN payouts_enabled INTEGER DEFAULT 0",
          "ALTER TABLE tenant_settings ADD COLUMN details_submitted INTEGER DEFAULT 0",
          // Per-tenant email provider (platform-metered | brevo | off).
          "ALTER TABLE tenant_settings ADD COLUMN email_config_json TEXT",
          // Notification category → channel preferences (per user).
          "ALTER TABLE user_prefs ADD COLUMN notif_json TEXT",
          // Notification category (check-ins | plans-goals | billing | …).
          "ALTER TABLE notifications ADD COLUMN category TEXT",
          // Owner-set tenant policy: which categories members may be EMAILED.
          "ALTER TABLE tenant_settings ADD COLUMN notif_policy_json TEXT",
          // Body scan: sagittal posture screen (from the side view) + somatotype.
          "ALTER TABLE body_scans ADD COLUMN posture_cva_deg REAL",
          "ALTER TABLE body_scans ADD COLUMN posture_tilt_deg REAL",
          "ALTER TABLE body_scans ADD COLUMN posture_severity TEXT",
          "ALTER TABLE body_scans ADD COLUMN somatotype TEXT",
          // Promo codes (billing centralization): per-client exclusivity + a
          // rail discriminator ('tenant' = tenant→client, 'platform' = Mossa→tenant).
          "ALTER TABLE promo_codes ADD COLUMN restricted_client_id TEXT",
          "ALTER TABLE promo_codes ADD COLUMN scope TEXT DEFAULT 'tenant'",
          // Redemption codes: optional per-package + per-client scoping.
          "ALTER TABLE redemption_codes ADD COLUMN restricted_package_id TEXT",
          "ALTER TABLE redemption_codes ADD COLUMN restricted_client_id TEXT",
        ];
        for (const sql of alters) await db.exec(sql).catch(() => undefined);
        // Backfill: older body scans mirrored only weight + body-fat into
        // measurements, so the Body progress "latest" showed empty waist/neck/
        // hips/chest. Carry the circumferences across for any day that has a
        // scan but a measurement row still missing them. The WHERE guard makes
        // this a no-op once every scan-day is filled.
        await db
          .prepare(
            `UPDATE measurements SET
               neck_cm  = COALESCE(neck_cm,  (SELECT bs.neck_cm  FROM body_scans bs WHERE bs.client_id=measurements.client_id AND bs.date_local=measurements.date_local)),
               waist_cm = COALESCE(waist_cm, (SELECT bs.waist_cm FROM body_scans bs WHERE bs.client_id=measurements.client_id AND bs.date_local=measurements.date_local)),
               hips_cm  = COALESCE(hips_cm,  (SELECT bs.hips_cm  FROM body_scans bs WHERE bs.client_id=measurements.client_id AND bs.date_local=measurements.date_local)),
               chest_cm = COALESCE(chest_cm, (SELECT bs.chest_cm FROM body_scans bs WHERE bs.client_id=measurements.client_id AND bs.date_local=measurements.date_local))
             WHERE (measurements.neck_cm IS NULL OR measurements.waist_cm IS NULL OR measurements.hips_cm IS NULL OR measurements.chest_cm IS NULL)
               AND EXISTS (SELECT 1 FROM body_scans bs WHERE bs.client_id=measurements.client_id AND bs.date_local=measurements.date_local
                            AND (bs.neck_cm IS NOT NULL OR bs.waist_cm IS NOT NULL OR bs.hips_cm IS NOT NULL OR bs.chest_cm IS NOT NULL))`,
          )
          .run()
          .catch(() => undefined);
      })
      .catch((err) => {
        schemaReady = null; // allow retry on next request
        throw err;
      });
  }
  return schemaReady;
}

/** Small helpers shared by stores. */
export const j = (v: unknown): string => JSON.stringify(v);
export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
