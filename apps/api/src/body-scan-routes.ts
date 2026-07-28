/**
 * Camera body-scan (SPEC §8.5). The app does all image work on-device and
 * submits only circumferences + a de-identified contour; the api recomputes the
 * body-fat estimate server-side (never trusting a client %), stores the scan,
 * and mirrors the % into `measurements` for the progress series.
 *
 * Voice cues are Gemini-TTS, generated ONCE per (tenant, voice, lang, phrase)
 * and cached in R2 — runtime is a stored-file read. Gemini only sees the cue
 * text, never a frame.
 */

import { Hono } from "hono";
import { z } from "zod";
import { estimateBodyFat, ageFromDob, bodyComposition, classifySomatotype, type Gender } from "@kova/domain";
import { SubmitBodyScan, TTS_VOICE_IDS } from "@kova/protocol";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { requireClientAccess } from "./clients.js";
import { gateFeature } from "./client-flags.js";
import { generateSpeech, DEFAULT_TTS_VOICE } from "./ai.js";
import { newId, nowIso } from "./ids.js";
import { parseJson, j } from "./db.js";
import { notify } from "./notify.js";
import { putMedia, deleteMedia, StorageQuotaError } from "./storage.js";

/** The fixed cue set. Voiced once per tenant/voice/lang and cached. */
const CUE_PHRASES: { id: string; text: string }[] = [
  { id: "intro", text: "Let's scan your body composition. Stand back so your whole body, from your head to your feet, fits inside the frame." },
  { id: "pose_front", text: "Face the camera. Stand with your feet about shoulder-width apart, and make sure both feet are inside the frame." },
  { id: "pose_side", text: "Now turn to your side. Keep both feet in the frame and let your arms rest down." },
  { id: "step_back", text: "Step back a little." },
  { id: "step_forward", text: "Step a little closer." },
  { id: "center", text: "Move into the middle of the frame." },
  { id: "feet", text: "Step back until both of your feet are inside the frame." },
  { id: "arms_out", text: "Hold your arms out to the sides, away from your body, so we can measure your torso." },
  { id: "arms_down", text: "Now relax — let your arms hang straight down against your sides." },
  { id: "straighten", text: "Stand up tall, and hold still." },
  { id: "hold", text: "Hold it right there." },
  { id: "captured", text: "Got it." },
  { id: "done", text: "All done. Calculating your results now." },
];
// Bump when the phrase set changes — invalidates cached WAVs so the owner
// regenerates the voice pack against the new script.
const TTS_VERSION = 2;

/** The tenant's configured coach voice (ai_config.ttsVoice), validated against
 *  the allowed set; falls back to the default. An explicit query overrides it. */
async function resolveVoice(db: D1Database, tenantId: string, override?: string | null): Promise<string> {
  const ok = (v: string | null | undefined): v is string => !!v && (TTS_VOICE_IDS as string[]).includes(v);
  if (ok(override)) return override;
  const row = await db.prepare("SELECT ai_config_json FROM tenant_settings WHERE tenant_id = ?").bind(tenantId).first<{ ai_config_json: string | null }>();
  const configured = parseJson<{ ttsVoice?: string | null }>(row?.ai_config_json, {}).ttsVoice;
  return ok(configured) ? configured : DEFAULT_TTS_VOICE;
}

interface ScanRow {
  id: string; date_local: string; body_fat_percent: number | null; low: number | null; high: number | null;
  confidence: string | null; neck_cm: number | null; waist_cm: number | null; hips_cm: number | null;
  chest_cm: number | null; weight_kg: number | null; height_cm: number | null; methods_json: string | null;
  contour_front_json: string | null; contour_side_json: string | null;
  posture_cva_deg: number | null; posture_tilt_deg: number | null; posture_severity: string | null; somatotype: string | null;
  created_at: string;
}
const scanView = (r: ScanRow) => ({
  id: r.id, date: r.date_local, bodyFatPercent: r.body_fat_percent, low: r.low, high: r.high, confidence: r.confidence,
  circumferences: { neckCm: r.neck_cm, waistCm: r.waist_cm, hipsCm: r.hips_cm, chestCm: r.chest_cm },
  weightKg: r.weight_kg, heightCm: r.height_cm,
  methods: parseJson(r.methods_json, [] as unknown[]),
  contourFront: parseJson(r.contour_front_json, null), contourSide: parseJson(r.contour_side_json, null),
  posture: r.posture_severity ? { cvaDeg: r.posture_cva_deg, trunkTiltDeg: r.posture_tilt_deg, severity: r.posture_severity } : null,
  somatotype: r.somatotype,
  createdAt: r.created_at,
});

export const bodyScanRoutes = new Hono<AppEnv>()
  // Submit a completed scan. Server recomputes the estimate authoritatively.
  .post("/body-scans", async (c) => {
    const who = requireTenant(c)!;
    const parsed = SubmitBodyScan.extend({ clientId: z.string().min(1) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body", issues: parsed.error.issues }, 400);
    const access = await requireClientAccess(c, parsed.data.clientId);
    if ("response" in access) return access.response;
    // Gate the whole feature from its record: the tenant's bfCamera entitlement
    // AND (for a client submitting their own scan) the canUseBodyScan package
    // flag. The flag was previously unenforced here — a client whose package
    // excluded body scan could still submit; gateFeature closes that.
    { const g = await gateFeature(c, "bodyScan", access.client.id); if (g) return g; }

    const cl = access.client;
    const gender: Gender | null = cl.gender === "male" || cl.gender === "female" ? cl.gender : null;
    const age = cl.date_of_birth ? ageFromDob(cl.date_of_birth) : null;
    const height = cl.height_cm ?? null;
    if (!gender || !age || !height) return c.json({ error: "profile incomplete — needs sex, birth date, and height" }, 422);

    const d = parsed.data;
    const est = estimateBodyFat({
      gender, ageYears: age, heightCm: height, weightKg: d.weightKg,
      neckCm: d.circumferences.neckCm, waistCm: d.circumferences.waistCm, hipsCm: d.circumferences.hipsCm ?? null,
    });
    if (!est) return c.json({ error: "could not compute an estimate from those measurements" }, 422);

    const id = newId("scan");
    const now = nowIso();
    const cf = d.storeSilhouette && d.contourFront ? j(d.contourFront) : null;
    const cs = d.storeSilhouette && d.contourSide ? j(d.contourSide) : null;
    // Somatotype is recomputed server-side (like body-fat) from the estimate +
    // weight + height. Posture is trusted from the device (needs landmarks only
    // the on-device pose has).
    const comp = bodyComposition(d.weightKg, est.bodyFatPercent, height);
    const soma = classifySomatotype({ heightCm: height, weightKg: d.weightKg, bodyFatPercent: est.bodyFatPercent, ffmi: comp?.ffmi ?? null });
    const posture = d.posture ?? null;
    await c.env.DB.prepare(
      `INSERT INTO body_scans (id, tenant_id, client_id, date_local, body_fat_percent, low, high, confidence, neck_cm, waist_cm, hips_cm, chest_cm, weight_kg, height_cm, methods_json, contour_front_json, contour_side_json, posture_cva_deg, posture_tilt_deg, posture_severity, somatotype, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(client_id, date_local) DO UPDATE SET body_fat_percent=excluded.body_fat_percent, low=excluded.low, high=excluded.high, confidence=excluded.confidence, neck_cm=excluded.neck_cm, waist_cm=excluded.waist_cm, hips_cm=excluded.hips_cm, chest_cm=excluded.chest_cm, weight_kg=excluded.weight_kg, height_cm=excluded.height_cm, methods_json=excluded.methods_json, contour_front_json=excluded.contour_front_json, contour_side_json=excluded.contour_side_json, posture_cva_deg=excluded.posture_cva_deg, posture_tilt_deg=excluded.posture_tilt_deg, posture_severity=excluded.posture_severity, somatotype=excluded.somatotype`,
    )
      .bind(id, who.tenantId, cl.id, d.date, est.bodyFatPercent, est.low, est.high, est.confidence,
        d.circumferences.neckCm, d.circumferences.waistCm, d.circumferences.hipsCm ?? null, d.circumferences.chestCm ?? null,
        d.weightKg, height, j(est.methods), cf, cs,
        posture?.cvaDeg ?? null, posture?.trunkTiltDeg ?? null, posture?.severity ?? null, soma?.label ?? null, now)
      .run();

    // Mirror into measurements so the body-fat trend + reports + the Body
    // progress "latest measurements" pick it up. Circumferences are carried
    // across too (the scan is authoritative for them); weight keeps an existing
    // manual entry for the day if one was already logged.
    await c.env.DB.prepare(
      `INSERT INTO measurements (id, tenant_id, client_id, date_local, body_fat_percent, weight_kg, neck_cm, waist_cm, hips_cm, chest_cm, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(client_id, date_local) DO UPDATE SET
         body_fat_percent=excluded.body_fat_percent,
         weight_kg=COALESCE(measurements.weight_kg, excluded.weight_kg),
         neck_cm=COALESCE(excluded.neck_cm, measurements.neck_cm),
         waist_cm=COALESCE(excluded.waist_cm, measurements.waist_cm),
         hips_cm=COALESCE(excluded.hips_cm, measurements.hips_cm),
         chest_cm=COALESCE(excluded.chest_cm, measurements.chest_cm)`,
    )
      .bind(newId("meas"), who.tenantId, cl.id, d.date, est.bodyFatPercent, d.weightKg,
        d.circumferences.neckCm, d.circumferences.waistCm, d.circumferences.hipsCm ?? null, d.circumferences.chestCm ?? null, now)
      .run();

    // A completed scan is coaching signal — notify the client's primary trainer
    // (unless they ran it themselves). The /measurements handler fires the same
    // body_fat_logged type; this path writes measurements directly, so it mirrors
    // that notify here. Deduped per client per day, distinct from the manual key.
    const primary = await c.env.DB
      .prepare("SELECT trainer_user_id FROM client_trainers WHERE client_id = ? ORDER BY is_primary DESC LIMIT 1")
      .bind(cl.id)
      .first<{ trainer_user_id: string }>();
    if (primary?.trainer_user_id && primary.trainer_user_id !== who.userId) {
      await notify(c.env, {
        tenantId: who.tenantId,
        userId: primary.trainer_user_id,
        type: "body_fat_logged",
        title: `${cl.display_name} completed a body scan`,
        message: `${est.bodyFatPercent}% body fat · ${d.weightKg} kg`,
        link: `/clients/${cl.id}/manage`,
        dedupeKey: `bfscan_${cl.id}_${d.date}`,
      });
    }

    return c.json({ ok: true, id, ...est });
  })

  // History for the progress morph + trend.
  .get("/body-scans", async (c) => {
    const clientId = c.req.query("clientId");
    if (!clientId) return c.json({ error: "clientId required" }, 400);
    const access = await requireClientAccess(c, clientId);
    if ("response" in access) return access.response;
    const rows = await c.env.DB.prepare("SELECT * FROM body_scans WHERE client_id = ? ORDER BY date_local DESC LIMIT 200").bind(access.client.id).all<ScanRow>();
    return c.json({ scans: (rows.results ?? []).map(scanView) });
  })

  // The tenant's cue audio set — SERVE-ONLY (never generates here). A client's
  // scan must not silently bill the owner: the owner generates the voice pack
  // explicitly (POST /body-scan/voice-pack). Missing cues come back with an empty
  // url and the client speaks them with the browser's free speechSynthesis.
  .get("/body-scan/cues", async (c) => {
    const who = requireTenant(c)!;
    { const g = await gateFeature(c, "bodyScan"); if (g) return g; }
    const voice = await resolveVoice(c.env.DB, who.tenantId, c.req.query("voice"));
    const lang = "en";
    const rows = await c.env.DB.prepare("SELECT phrase_id, media_key FROM tts_cues WHERE tenant_id=? AND voice=? AND lang=? AND version=?")
      .bind(who.tenantId, voice, lang, TTS_VERSION)
      .all<{ phrase_id: string; media_key: string }>();
    const byId = new Map((rows.results ?? []).map((r) => [r.phrase_id, r.media_key]));
    const cues = CUE_PHRASES.map((p) => ({ id: p.id, url: byId.has(p.id) ? `/api/media/${byId.get(p.id)}` : "", text: p.text }));
    return c.json({ voice, lang, cues });
  })

  // Owner: how many cues are voiced for the current (or ?voice=) voice.
  .get("/body-scan/voice-pack", async (c) => {
    const who = requireTenant(c)!;
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    const voice = await resolveVoice(c.env.DB, who.tenantId, c.req.query("voice"));
    const rows = await c.env.DB.prepare("SELECT phrase_id FROM tts_cues WHERE tenant_id=? AND voice=? AND lang='en' AND version=?")
      .bind(who.tenantId, voice, TTS_VERSION)
      .all<{ phrase_id: string }>();
    const have = new Set((rows.results ?? []).map((r) => r.phrase_id));
    const count = CUE_PHRASES.filter((p) => have.has(p.id)).length;
    // Which voice, if any, is ACTUALLY installed right now — not just how far
    // along the selected one is. Without this the settings card could only ask
    // "generate?" and never say "installed", even with a complete pack sitting
    // in storage under a different voice.
    const installed = await c.env.DB
      .prepare(
        `SELECT voice AS v, COUNT(*) AS n FROM tts_cues
         WHERE tenant_id = ? AND lang = 'en' AND version = ? AND phrase_id != 'preview'
         GROUP BY voice ORDER BY n DESC LIMIT 1`,
      )
      .bind(who.tenantId, TTS_VERSION)
      .first<{ v: string; n: number }>();
    return c.json({
      voice,
      total: CUE_PHRASES.length,
      count,
      ready: count >= CUE_PHRASES.length,
      installedVoice: installed && installed.n >= CUE_PHRASES.length ? installed.v : null,
    });
  })

  // Owner: generate + cache the whole cue pack for a voice. THIS is the billed
  // moment — clear, owner-initiated, one-time. Idempotent (skips cached cues).
  .post("/body-scan/voice-pack", async (c) => {
    const who = requireTenant(c)!;
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    { const g = await gateFeature(c, "bodyScan"); if (g) return g; }
    const body = (await c.req.json().catch(() => ({}))) as { voice?: string; force?: boolean };
    const voice = await resolveVoice(c.env.DB, who.tenantId, body.voice);
    const lang = "en";
    let generated = 0, credits = 0;

    // ── Retire whatever this pack replaces ──────────────────────────────────
    //
    // A studio has ONE voice. Every pack that is not the one being installed is
    // dead weight: ten WAV files per voice, sitting in R2 and counting against
    // the tenant's storage quota forever. Trying four voices used to leave forty
    // orphaned files that nothing would ever play and no screen would ever show.
    //
    // `force` is what the "Regenerate" button sends. Without it that button was a
    // lie — the loop below skips every cue that already exists, so pressing it on
    // a complete pack did nothing at all.
    //
    // Previews (`phrase_id = 'preview'`) are deliberately kept: they are one short
    // sample per voice, and the whole point of caching them is that auditioning a
    // voice a second time does not bill the studio again.
    // `? = 1` is the force flag, bound rather than interpolated so the statement
    // is one shape with one parameter list: forced, EVERY pack goes (including
    // this voice's, which is the whole point of re-voicing); unforced, only the
    // packs that are not the one being installed.
    const stale = await c.env.DB
      .prepare(
        `SELECT voice AS v, lang AS l, phrase_id AS p, version AS ver, media_key AS k FROM tts_cues
         WHERE tenant_id = ? AND phrase_id != 'preview'
           AND (? = 1 OR voice != ? OR version != ?)`,
      )
      .bind(who.tenantId, body.force ? 1 : 0, voice, TTS_VERSION)
      .all<{ v: string; l: string; p: string; ver: number; k: string }>();
    for (const row of stale.results ?? []) {
      // deleteMedia removes the R2 object AND tombstones the media_assets row, so
      // the library and the storage meter both reflect it immediately.
      await deleteMedia(c.env, row.k, who.userId);
      await c.env.DB
        .prepare("DELETE FROM tts_cues WHERE tenant_id=? AND voice=? AND lang=? AND phrase_id=? AND version=?")
        .bind(who.tenantId, row.v, row.l, row.p, row.ver)
        .run()
        .catch(() => undefined);
    }
    const retired = (stale.results ?? []).length;
    for (const phrase of CUE_PHRASES) {
      const existing = await c.env.DB.prepare("SELECT media_key FROM tts_cues WHERE tenant_id=? AND voice=? AND lang=? AND phrase_id=? AND version=?")
        .bind(who.tenantId, voice, lang, phrase.id, TTS_VERSION)
        .first<{ media_key: string }>();
      if (existing) continue;
      const speech = await generateSpeech(c.env, { tenantId: who.tenantId, feature: "body_scan_cue", text: phrase.text, voice });
      if (!speech.ok) {
        if (speech.error === "insufficient_credits") return c.json({ error: "insufficient_credits", generated, credits, needed: speech.needed }, 402);
        continue; // one provider hiccup shouldn't abort the whole pack
      }
      const key = `t/${who.tenantId}/tts/${voice}-${lang}-${phrase.id}-v${TTS_VERSION}.wav`;
      try {
        await putMedia(c.env, { tenantId: who.tenantId, key, bytes: speech.bytes, contentType: "audio/wav", purpose: "tts", ownerUserId: who.userId });
      } catch (e) {
        if (e instanceof StorageQuotaError) return c.json({ error: "storage_full", generated, credits }, 413);
        throw e;
      }
      await c.env.DB.prepare("INSERT OR IGNORE INTO tts_cues (tenant_id, voice, lang, phrase_id, version, media_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(who.tenantId, voice, lang, phrase.id, TTS_VERSION, key, nowIso())
        .run();
      generated++; credits += speech.credits;
    }
    const total = (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM tts_cues WHERE tenant_id=? AND voice=? AND lang='en' AND version=? AND phrase_id != 'preview'").bind(who.tenantId, voice, TTS_VERSION).first<{ n: number }>())?.n ?? 0;
    return c.json({ ok: true, voice, generated, credits, retired, ready: total >= CUE_PHRASES.length });
  })

  // Owner voice preview for the settings picker — one short sample per voice,
  // cached like a cue (so previewing every voice costs a handful of credits once).
  .get("/body-scan/voice-preview", async (c) => {
    const who = requireTenant(c)!;
    // Owner-only: this generates paid TTS on a miss (the settings voice picker).
    // A client must never be able to trigger a billed voice generation.
    if (c.get("role") !== "owner") return c.json({ error: "forbidden" }, 403);
    { const g = await gateFeature(c, "bodyScan"); if (g) return g; }
    const voice = await resolveVoice(c.env.DB, who.tenantId, c.req.query("voice"));
    const existing = await c.env.DB.prepare("SELECT media_key FROM tts_cues WHERE tenant_id=? AND voice=? AND lang='en' AND phrase_id='preview' AND version=?")
      .bind(who.tenantId, voice, TTS_VERSION)
      .first<{ media_key: string }>();
    let key = existing?.media_key ?? null;
    if (!key) {
      const speech = await generateSpeech(c.env, { tenantId: who.tenantId, feature: "voice_preview", text: "Hi, I'm your coach — let's do a quick body scan.", voice });
      if (!speech.ok) return c.json({ error: speech.error }, speech.error === "insufficient_credits" ? 402 : 502);
      key = `t/${who.tenantId}/tts/${voice}-en-preview-v${TTS_VERSION}.wav`;
      try {
        await putMedia(c.env, { tenantId: who.tenantId, key, bytes: speech.bytes, contentType: "audio/wav", purpose: "tts", ownerUserId: who.userId });
      } catch (e) {
        if (e instanceof StorageQuotaError) return c.json({ error: "storage_full" }, 413);
        throw e;
      }
      await c.env.DB.prepare("INSERT OR IGNORE INTO tts_cues (tenant_id, voice, lang, phrase_id, version, media_key, created_at) VALUES (?, ?, 'en', 'preview', ?, ?, ?)")
        .bind(who.tenantId, voice, TTS_VERSION, key, nowIso())
        .run();
    }
    return c.json({ voice, url: `/api/media/${key}` });
  });
