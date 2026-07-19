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
import { estimateBodyFat, ageFromDob, type Gender } from "@mossa/domain";
import { SubmitBodyScan, TTS_VOICE_IDS } from "@mossa/protocol";
import { type AppEnv, requireTenant } from "./auth-context.js";
import { requireClientAccess } from "./clients.js";
import { hasFeature } from "./billing-store.js";
import { generateSpeech, DEFAULT_TTS_VOICE } from "./ai.js";
import { newId, nowIso } from "./ids.js";
import { parseJson, j } from "./db.js";

/** The fixed cue set. Voiced once per tenant/voice/lang and cached. */
const CUE_PHRASES: { id: string; text: string }[] = [
  { id: "intro", text: "Let's set up your body scan. Step back so your whole body fits in the frame." },
  { id: "step_back", text: "Step back a little." },
  { id: "step_forward", text: "Step a little closer." },
  { id: "center", text: "Move to the center of the frame." },
  { id: "arms", text: "Raise your arms slightly away from your sides." },
  { id: "straighten", text: "Stand up straight and face the camera." },
  { id: "hold", text: "Perfect. Hold still." },
  { id: "captured_front", text: "Front captured. Now turn to your side." },
  { id: "turn_side", text: "Turn so your side faces the camera." },
  { id: "captured_side", text: "All done. Calculating your results now." },
];
const TTS_VERSION = 1;

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
  contour_front_json: string | null; contour_side_json: string | null; created_at: string;
}
const scanView = (r: ScanRow) => ({
  id: r.id, date: r.date_local, bodyFatPercent: r.body_fat_percent, low: r.low, high: r.high, confidence: r.confidence,
  circumferences: { neckCm: r.neck_cm, waistCm: r.waist_cm, hipsCm: r.hips_cm, chestCm: r.chest_cm },
  weightKg: r.weight_kg, heightCm: r.height_cm,
  methods: parseJson(r.methods_json, [] as unknown[]),
  contourFront: parseJson(r.contour_front_json, null), contourSide: parseJson(r.contour_side_json, null),
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
    if (!(await hasFeature(c.env.DB, who.tenantId, "bfCamera"))) return c.json({ error: "body scan not in your plan" }, 403);

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
    await c.env.DB.prepare(
      `INSERT INTO body_scans (id, tenant_id, client_id, date_local, body_fat_percent, low, high, confidence, neck_cm, waist_cm, hips_cm, chest_cm, weight_kg, height_cm, methods_json, contour_front_json, contour_side_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(client_id, date_local) DO UPDATE SET body_fat_percent=excluded.body_fat_percent, low=excluded.low, high=excluded.high, confidence=excluded.confidence, neck_cm=excluded.neck_cm, waist_cm=excluded.waist_cm, hips_cm=excluded.hips_cm, chest_cm=excluded.chest_cm, weight_kg=excluded.weight_kg, height_cm=excluded.height_cm, methods_json=excluded.methods_json, contour_front_json=excluded.contour_front_json, contour_side_json=excluded.contour_side_json`,
    )
      .bind(id, who.tenantId, cl.id, d.date, est.bodyFatPercent, est.low, est.high, est.confidence,
        d.circumferences.neckCm, d.circumferences.waistCm, d.circumferences.hipsCm ?? null, d.circumferences.chestCm ?? null,
        d.weightKg, height, j(est.methods), cf, cs, now)
      .run();

    // Mirror into measurements so the body-fat trend + reports pick it up.
    await c.env.DB.prepare(
      `INSERT INTO measurements (id, tenant_id, client_id, date_local, body_fat_percent, weight_kg, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(client_id, date_local) DO UPDATE SET body_fat_percent=excluded.body_fat_percent, weight_kg=COALESCE(measurements.weight_kg, excluded.weight_kg)`,
    )
      .bind(newId("meas"), who.tenantId, cl.id, d.date, est.bodyFatPercent, d.weightKg, now)
      .run();

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

  // The tenant's cue audio set — cached; missing phrases are generated + stored.
  .get("/body-scan/cues", async (c) => {
    const who = requireTenant(c)!;
    if (!(await hasFeature(c.env.DB, who.tenantId, "bfCamera"))) return c.json({ error: "body scan not in your plan" }, 403);
    const voice = await resolveVoice(c.env.DB, who.tenantId, c.req.query("voice"));
    const lang = (c.req.query("lang") || "en").slice(0, 10).replace(/[^A-Za-z-]/g, "");
    const cues: { id: string; url: string; text: string }[] = [];
    for (const phrase of CUE_PHRASES) {
      const existing = await c.env.DB.prepare("SELECT media_key FROM tts_cues WHERE tenant_id=? AND voice=? AND lang=? AND phrase_id=? AND version=?")
        .bind(who.tenantId, voice, lang, phrase.id, TTS_VERSION)
        .first<{ media_key: string }>();
      let key = existing?.media_key ?? null;
      if (!key) {
        const speech = await generateSpeech(c.env, { tenantId: who.tenantId, feature: "body_scan_cue", text: phrase.text, voice });
        if (speech.ok) {
          key = `t/${who.tenantId}/tts/${voice}-${lang}-${phrase.id}-v${TTS_VERSION}.wav`;
          await c.env.MEDIA.put(key, speech.bytes, { httpMetadata: { contentType: "audio/wav" } });
          await c.env.DB.prepare("INSERT OR IGNORE INTO tts_cues (tenant_id, voice, lang, phrase_id, version, media_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .bind(who.tenantId, voice, lang, phrase.id, TTS_VERSION, key, nowIso())
            .run();
        }
      }
      // `text` lets the client fall back to the browser's speechSynthesis if a
      // cue couldn't be generated (no credits / provider down).
      cues.push({ id: phrase.id, url: key ? `/api/media/${key}` : "", text: phrase.text });
    }
    return c.json({ voice, lang, cues });
  })

  // Owner voice preview for the settings picker — one short sample per voice,
  // cached like a cue (so previewing every voice costs a handful of credits once).
  .get("/body-scan/voice-preview", async (c) => {
    const who = requireTenant(c)!;
    if (!(await hasFeature(c.env.DB, who.tenantId, "bfCamera"))) return c.json({ error: "body scan not in your plan" }, 403);
    const voice = await resolveVoice(c.env.DB, who.tenantId, c.req.query("voice"));
    const existing = await c.env.DB.prepare("SELECT media_key FROM tts_cues WHERE tenant_id=? AND voice=? AND lang='en' AND phrase_id='preview' AND version=?")
      .bind(who.tenantId, voice, TTS_VERSION)
      .first<{ media_key: string }>();
    let key = existing?.media_key ?? null;
    if (!key) {
      const speech = await generateSpeech(c.env, { tenantId: who.tenantId, feature: "voice_preview", text: "Hi, I'm your coach — let's do a quick body scan.", voice });
      if (!speech.ok) return c.json({ error: speech.error }, speech.error === "insufficient_credits" ? 402 : 502);
      key = `t/${who.tenantId}/tts/${voice}-en-preview-v${TTS_VERSION}.wav`;
      await c.env.MEDIA.put(key, speech.bytes, { httpMetadata: { contentType: "audio/wav" } });
      await c.env.DB.prepare("INSERT OR IGNORE INTO tts_cues (tenant_id, voice, lang, phrase_id, version, media_key, created_at) VALUES (?, ?, 'en', 'preview', ?, ?, ?)")
        .bind(who.tenantId, voice, TTS_VERSION, key, nowIso())
        .run();
    }
    return c.json({ voice, url: `/api/media/${key}` });
  });
