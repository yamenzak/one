# Camera body-fat scan (SPEC §8.5)

A privacy-first, fully in-house camera estimate of body-fat %. No third-party
SDK, no licensing, no "go get a DEXA." The user may be undressed, so **the raw
frame never leaves their device** — all image work is on-device; only derived
numbers (and, on consent, a de-identified outline) are stored.

## What it honestly is

A 2D silhouette can't beat **~±3–4% vs DEXA** — the information (visceral fat,
muscle density, hydration) isn't in an outline. So the product promise is:

- **The trend is the hero.** Standardized auto-capture makes test-retest error
  small (~1–2%), so *change over time* is trustworthy.
- **The absolute is a solid estimate** with a **confidence band**, never a false
  decimal. We market a fitness estimate, not a medical measurement.

No per-user calibration is required. (An optional manual anchor — if the user
already has a DEXA/caliper number — can be added later to remove absolute bias.)

## The estimator (`packages/domain/bodyfat.ts`, pure + unit-tested)

Rather than trust one formula, we blend **independent public equations** and use
their **agreement** as the confidence:

| Method | Signal | Weight |
|---|---|---|
| **US Navy** | neck + waist (+ hip) circumference | 0.45 |
| **Relative Fat Mass** (Woolcott–Bergman 2018) | height ÷ waist | 0.40 |
| **Deurenberg** (1991) | BMI + age (shape-blind anchor) | 0.15 |

`estimateBodyFat()` → `{ bodyFatPercent, low, high, confidence, methods[] }`.
Tight method cluster → `high` confidence + narrow band; wide spread → `low` +
wide band. Circumferences come from front+side silhouette widths via
`ellipseCircumference` (Ramanujan-II) scaled by `pixelScaleFromHeight`
(nose→ankle = 0.86·height). All values clamped to a physiological 2–65%.

## On-device pipeline (browser, open-source models)

1. **Capture** — `getUserMedia` + **MediaPipe PoseLandmarker** (33 landmarks) for
   alignment/anatomical heights + **ImageSegmenter** (DeepLab v3, Pascal-VOC
   `person` class) for the body mask — a general person segmenter, far more
   reliable than the selfie model for a whole body at 2–3 m. Models are
   self-hosted (`apps/app/public/models/`) — no runtime CDN. A pose-landmark
   breadth fallback keeps the estimate alive if a frame's mask comes back empty.
2. **Auto-align** — deterministic geometry on landmarks (in frame, facing
   front/side, upright, arms abducted, right distance, stable ~1s) → auto-capture
   front then side. Manual fallback always available.
3. **Measure** — sample front+side widths at neck/waist/hip, px→cm, ellipse
   circumferences; extract a downsampled normalized **contour polygon**. RGB
   frames are discarded immediately.
4. **Estimate** — `estimateBodyFat` runs locally for an instant reveal.

## Privacy model

- The camera frame is processed **only in the browser** and never uploaded.
- Gemini is used **only** to voice the text cues — it never receives an image.
- On submit, the app sends **circumferences** (+ `weightKg`, `date`) and, **only
  if the user consents**, a **de-identified contour** (normalized outline points,
  no pixels). Contours store as `body_scans.contour_*_json`; a stylized
  silhouette can be redrawn from them for the progress morph.
- Any stored asset is per-client-scoped and deletable.

## Server (`apps/api/src/body-scan-routes.ts`)

- `POST /api/body-scans` — `requireClientAccess` + `bfCamera` entitlement gate;
  **recomputes** the estimate server-side from the submitted circumferences +
  the client's sex/DOB/height (never trusts a client-sent %); upserts
  `body_scans` (one per client-day) and mirrors `body_fat_percent` into
  `measurements` so the trend + reports pick it up.
- `GET /api/body-scans?clientId=` — history for the trend + morph.
- `GET /api/body-scan/cues?voice=&lang=` — the cue set. Each phrase is voiced
  **once** via Gemini TTS (`ai.ts` `generateSpeech`, mock lane in dev), stored in
  R2 (`tts_cues` cache), and reused — runtime is a stored-file read. Metered
  pay-as-you-go and refunded on failure. Returns `text` too, so the client falls
  back to the browser's `speechSynthesis` if a cue couldn't be generated.

## Gating

`bfCamera` platform entitlement (tenant bought from Mossa) ∩ the per-package
`canUseBodyScan` client flag (`requiresFeature: "bfCamera"`, enforced by the
`resolveClientFlags` intersection). Free plan has no `bfCamera`; Solo/Studio/Team
do.

## Data model

- `body_scans(id, tenant_id, client_id, date_local, body_fat_percent, low, high,
  confidence, neck_cm, waist_cm, hips_cm, chest_cm, weight_kg, height_cm,
  methods_json, contour_front_json, contour_side_json, created_at)` — UNIQUE
  `(client_id, date_local)`.
- `tts_cues(tenant_id, voice, lang, phrase_id, version, media_key, created_at)` —
  the cue-audio cache.

## Not built yet / future

- Optional one-time manual DEXA/caliper anchor to remove absolute bias.
- A slow-360° **visual-hull volume** mode (photographic Bod Pod) — the in-browser
  accuracy upgrade lever, heavier but still private.
- Real-device QA of the capture pipeline (alignment thresholds, low-end perf) is
  required before enabling for clients.
