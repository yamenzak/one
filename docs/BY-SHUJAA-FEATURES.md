# ByShujaa — Complete Feature & Implementation Reference

> Full-app scan of https://github.com/yamenzak/by-shujaa (2026-07-10). Every subsystem below
> was read at source level. This is the feature blueprint / raw material for **Kova**.
>
> **What it is:** a personal-trainer ↔ client SaaS. Trainers manage clients, build workout &
> meal plans, prescribe supplements, request lab tests, and review check-ins. Clients log
> food (incl. barcode scanning), workouts, water/sleep/mood, fasting, and buy access through
> a package marketplace. Admins run billing, users, and platform settings.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, React 19) |
| Backend/CMS | Payload CMS 3.81 (Local API + custom REST routes in `(payload)/api/*`) |
| Database | PostgreSQL (`@payloadcms/db-postgres`) |
| UI | HeroUI v3 (beta, compound components) + Tailwind v4; Recharts for charts |
| Media | Cloudflare R2 via `@payloadcms/storage-s3` (`disableLocalStorage`, public read) |
| Payments | Stripe (checkout, webhooks, billing portal, coupons/promotion codes) |
| Security | Cloudflare Turnstile, DB-backed rate limiting, OTP passwordless login |
| On-device ML | MediaPipe Tasks Vision (pose landmarker + selfie segmenter) for camera body-fat |
| Misc | html5-qrcode (barcode), DiceBear (avatars), react-markdown + remark-gfm |
| Tests | Vitest + Playwright (scaffold-level only) |
| Deploy | Multi-stage Dockerfile (Next standalone, node:22-alpine) |

34 collections + 3 globals. Conventions: pnpm, `pnpm generate:types` after schema changes,
`tsc --noEmit` pre-commit, custom design-lint script, Prettier (no semis, single quotes).

---

## 1. Architecture

- **Two route-group shells**: `src/app/(frontend)/` (three role portals + auth flows) and
  `src/app/(payload)/` (Payload admin at `/admin`, all custom REST endpoints as `route.ts`).
- **Middleware** (`src/middleware.ts`) gates everything by cookies alone (`payload-token`,
  `active-profile-id`, `active-profile-type`): unauthenticated → `/login`; no profile →
  `/profiles`; then per-portal gating (admin may enter trainer paths; no other crossover).
  `/api` and `/admin` are excluded (Payload's own auth).
- Collection access is coarse (client-owned collections = `isAuthenticated`); real ownership
  checks live in the API route layer, which runs the Local API as the system
  (`overrideAccess: true`). Shared access helpers in `src/access/` (`isAdmin`,
  `isAdminOrTrainer`, `profileAccess.ts` with per-request-cached DB checks).
- **Delete guards** (`src/collections/hooks/deleteGuards.ts`): generic
  `createDeleteGuard()` blocks hard-deletes of anything still referenced (profiles, users,
  packages, exercises, foods, plans, media) — "deactivate or archive instead".

## 2. Multi-Profile System (Netflix-style)

**One User (auth account) → many Profiles (role personas).** `Users.role` is only
`admin | user`; the real app role lives on `Profiles.type` (`admin | trainer | client`).

- **A trainer IS also a client**: creating a trainer (`/api/admin/create-trainer`) creates
  **both** a client profile and a trainer profile for the user — "every user gets one
  (client profile)". So a trainer can switch to their client persona and plan/log for
  themselves. Every public signup gets a client profile; the first-ever signup is
  bootstrapped with admin + trainer + client profiles.
- **Role changes** (`/api/admin/change-role`): admin can add/remove trainer or admin
  profiles on any user. Client profiles are never removed (delete guards make them
  effectively permanent once they accumulate data).
- **No self-serve profile creation** — adding personas is admin-only. Profile collection
  access: `create/delete: hasAdminAccess`.
- **Switching UX**: `/profiles` dispatcher picks by sticky cookie
  (`byshujaa-last-profile-id`, 1-year) → role priority (client > trainer > admin) → first.
  A server action sets `active-profile-id`/`active-profile-type` session cookies and
  redirects per type (admin → `/admin-portal/dashboard`, trainer → `/trainer/dashboard`,
  client → `/client/diary`). `ProfileSwitcherInline` (hidden with <2 profiles) does a full
  page reload so all server components re-read the active profile.
  `getActiveProfile()` re-auths the JWT and verifies the cookie profile belongs to the
  live user.
- **Per-profile everything**: avatar, theme/mode preference, units, timezone.

### Multi-trainer support

- `Profiles.assignedTrainers` is a **`hasMany` relationship** (filtered to trainer
  profiles) — a client can have **multiple trainers simultaneously**. Flat set, no
  "primary trainer" concept; all assigned trainers see the client identically.
- Trainer scoping everywhere is `assignedTrainers contains activeProfile.id` (clients
  list, dashboard, reports). Admin sees all; "unassigned clients" surfaced on the admin
  dashboard.
- Notifications **fan out to all assigned trainers** (check-ins, swap requests, payment
  failures loop the array).
- `PlatformSettings.defaultTrainer` auto-assigns at **public signup only** (not checkout,
  not admin-created users).
- ⚠️ Gaps found in the original: admin mutation routes (`create-trainer`, `change-role`,
  `assign-trainer`, `unassign-trainer`) have **no auth guard** (middleware skips `/api`);
  and the trainer client-detail page doesn't verify assignment — any trainer can open any
  client by ID. Kova should fix both.

### Onboarding

`OnboardingWizard`: **client = 5 steps** (personal info with age 13–120 + height
validation; starting point: target weight/BF%/primary goal — current weight deferred to
first check-in; training context: location/equipment/available days/experience/activity/
injuries; nutrition: dietary approach/allergies/meals-per-day; confirm). **Trainer = 2
steps** (display name/bio/units; confirm). Timezone auto-detected. Completion PATCHes the
profile with `onboardingComplete: true`; layouts gate on it.

### Avatars

DiceBear HTTP API v9 (`api.dicebear.com/9.x/{style}/svg?seed=…`), style per role:
admin `identicon`, trainer `adventurer-neutral`, client `adventurer`. Seed =
`email[:suffix]`; **shuffle** endpoint generates a new random suffix, fetches the SVG, and
stores it in R2/Media (old media cleaned up); **upload** endpoint accepts custom images
(5 MB, admin profiles blocked from both). Reproducible: suffix persisted on
`profiles.avatarSeed`.

## 3. Auth & Security

- **Methods**: email+password, **email OTP (passwordless)**, forgot-password — each
  toggleable in the AuthSettings global.
- **AuthSettings global drives the entire login page**: enable/disable login with message,
  branding, 3 layouts (centered/split/full-bg), custom HTML/CSS/JS background/foreground
  renderers, background media — plus every security knob (session hours, max attempts,
  lockout minutes, OTP quotas/cooldowns, signups/hour).
- **DB-backed rate limiting** (`src/lib/rateLimiter.ts`): counts recent **AuthLogs** rows
  per email/IP — no in-memory state, multi-instance safe. AuthLogs doubles as the audit
  trail (login/signup/OTP/lockout/turnstile-fail events with IP + UA).
- **Turnstile** verified on auth endpoints; no-op without a secret.
- **Super-admin auto-seeded** on first boot from `SUPER_ADMIN_EMAIL/PASSWORD` (Payload
  `onInit`).
- Email sending is **not implemented** (OTP/reset emails are a known gap).

## 4. Billing / Marketplace — the "Access Economy"

All monetization flows through the marketplace; no manual trainer→client assignment of paid
features.

- **Packages**: one-time price and/or monthly installments (2–24 months), **feature
  budgets** (`workout | meal | all` + days), included add-ons (consultation sessions),
  visibility `private | marketplace | client_specific`, once-per-customer flag,
  per-package feature-flag defaults, synced Stripe product/price IDs.
- **ClientSubscriptions**: `budgets[]` each with own `startedAt`/`expiresAt` — **days
  remaining are derived from `expiresAt` at read time. No counters, no cron.**
  `reconcileSubscriptionStatus()` lazily flips `active → expired` whenever a sub is read
  (plus best-effort Stripe cancel). Also `addOnBalances[]` (total/used), payment status
  incl. installments, per-sub flag overrides.
- **Repeat purchases queue, never sum**: `computeBudgetStart()` starts the new budget at
  the current one's `expiresAt`.
- **$0 packages bypass Stripe** (subscription row created directly). Legacy Frappe
  memberships auto-migrate into $0 client-specific packages.
- **Stripe**: checkout sessions; installments = Stripe Subscriptions with fixed payment
  count (auto-cancelled in the webhook on final `invoice.paid`); **webhooks are the single
  source of truth** for paid subs; `invoice.payment_failed` → pause + notify client & all
  trainers + full-screen `PaymentBlocker`. Catalog sync via collection hooks (Package →
  product+prices, PromoCode → coupon+promotion code) deferred with `setTimeout(0)` to avoid
  hook re-entry deadlocks, with `syncStatus`/`syncError` fields. Keys live in the
  IntegrationSettings global (DB) with env fallback. Billing portal + customer linking
  endpoints; `stripeCustomerId` stored per Profile.
- **RedemptionCodes** (day top-ups: days + target feature, max uses, package restriction)
  are separate from **PromoCodes** (Stripe checkout discounts).
- **AddOnTypes + TrainerSessions**: consultations consumed from add-on balances; an
  afterChange hook decrements/refunds on `scheduled ↔ completed` transitions.

### Feature flags

19-checkbox group (`src/fields/featureFlags.ts`) on Packages (defaults) and
ClientSubscriptions (overrides): nutrition (log own food, edit meal plan, macro breakdown,
nutrition reports), exercise (replace/swap/reorder, log extra workouts), reporting (body
metrics, exercise report), wellness (sleep/mood/water/measurements), check-in composition
(required + includes mood/sleep/measurements/photos). **Always resolved through
`getClientFlags()`**: permissive defaults → sub overrides → **budget-gated** (e.g.
`canEditMealPlan` needs an active `meal` budget; swap/reorder/exercise-report need
`workout`). `canTrackFasting` is the only default-off flag.

## 5. Workout System

### Exercise library & external sources

- **Exercises collection**: name/slug, primary + secondary muscle groups (12-key enum),
  equipment, difficulty, force (push/pull/static), mechanic (compound/isolation), category,
  Lexical rich-text instructions, start/end thumbnails + video (R2), `alternatives[]` kept
  **bidirectionally in sync** by an afterChange hook (deferred `setImmediate` to avoid
  row-lock deadlocks).
- **External search** (`/api/exercises/search-external`), providers queried **in parallel**
  with pagination and fixed precedence (wger < free-exercise-db < ExerciseDB):
  - **wger** (no auth): text search + browse-by-muscle (`wger.de/api/v2`), per-result
    enrichment via `exerciseinfo/{id}` (muscles, equipment, start/end images, English HTML
    description parsed into steps).
  - **free-exercise-db** (no auth): whole static JSON from GitHub raw, runtime-cached,
    filtered locally.
  - **ExerciseDB via RapidAPI** (header key): text + bodyPart browse; GIF images.
  - Raw provider muscle/equipment names collapse through `MUSCLE_MAP`/`EQUIPMENT_MAP` into
    the app's enums; instruction steps → Lexical (`stepsToLexical`).
- **Import** (POST): enum whitelisting, both images cached into R2 in parallel via
  `cacheRemoteMedia()` (fetch → mimetype check → `payload.create` on Media), **dedup by
  `sourceId`** — existing rows are updated + reactivated instead of duplicated.

### Plan structure (shared schema, plans + templates)

`workoutBodyFields.ts`: days → blocks → slots → sets.
- **Block types**: single / superset / circuit / **HIIT** (seeded defaults: rounds, rest
  between exercises/rounds/after block; HIIT seeds a time-mode slot).
- **Slot**: exercise relation + measurement mode (reps / time / distance / reps-in-time).
- **Set**: type (working/warmup/AMRAP), reps/time/distance, **7 weight modes** —
  `absolute`, `unspecified` ("client picks"), `bodyweight`, `previous_plus` (linear
  progression), `previous_times` (multiplier), `percent_1rm`, `dropset` — plus RPE (1–10),
  RIR, %1RM, tempo, rest-after, notes.

### Trainer plan builder (`/trainer/clients/[id]/workout-plans/*`)

- Days rendered as tabs. **Week mode** for client plans (fixed Mon–Sun keyed to the
  client's `availableDays` from intake; unselected days auto-rest) vs **free mode** for
  templates (add/duplicate/delete up to 7 days).
- Per-day: name, collapsible notes, **read-only muscle map** computed from all slot
  exercises (secondary de-duped against primary), client-context sidebar (intake +
  active-goal data).
- Exercise picker: inline search over the preloaded library (name substring, cap 30).
- **Lifecycle**: draft → published → superseded → archived. Publishing snapshots the
  client's active goal, stamps `publishedAt`, and supersedes the previously published plan
  (with a "replace currently published?" confirm). Status rollback/archive/restore via a
  menu; superseded/archived plans are read-only. Clients only ever see published plans.
- **Templates**: apply (pick days → append or replace), export-to-template with an
  `isPublic` "share with other trainers" switch. Export **strips client-specific absolute
  weights** (→ `unspecified`) but keeps portable progression rules (%1RM, previous+,
  previous×, bodyweight).

### Client workout player (`/client/workout`)

- Day-picker grid + weekly activity strip; Netflix-style day hero (muscle map, badges,
  counts, last-done); inline progress bar (logged/prescribed sets); warm-up/stretch
  recommendations pulled from Resources filtered by muscle overlap; URL-persisted day
  selection; auto-resume of an unfinished same-day session.
- **Set logging**: drawer with target + "last time" hints, unit-converted weight input,
  Easy/Perfect/Hard effort picker; **grouped drawer logs an entire round** across a
  superset/circuit/HIIT block at once. Find-or-create one log per
  (client, plan, dayIndex, date) — enforced server-side too.
- **Rest timers** wired from the plan's per-set/per-round/after-block rest values,
  auto-starting when the preceding set/round was logged this session.
- **PR detection**: client-side against loaded history (`buildExerciseHistory`) — best
  weight/reps/duration per exercise + per-session **Epley e1RM = weight × (1 + reps/30)**
  and tonnage. New bests fire a 🏆 toast + success haptic and raise the in-session bar.
  5-second **UndoPill** reverts a log.
- **Swap requests**: client proposes a replacement at exact slot coordinates
  (day/block/slot); swaps to a listed alternative **auto-approve**; approved swaps are
  applied directly into the plan document by a hook; trainers approve/reject the rest.

### "What's today?" resolution

Plans are **recommendations, not calendar assignments**. `workoutSchedule.ts` recommends
the stalest incomplete day (a day counts complete only when all prescribed sets are
logged). `resolvePlansForDate.ts` is **logs-first**: entries logged that day pin the plan
(historically accurate); otherwise heuristic — `pickPlanForDate` selects the plan whose
`publishedAt` window covers the date (superseded plans count for their historical window).
`getPlanFreshness.ts` shows "new"/"updated" chips (7-day window, 60-min grace after
publish).

## 6. Nutrition System

### Foods & external sources

- **Foods collection**: 13 macro/micro fields, barcode (indexed), R2 image, serving
  size/unit, source + sourceId, verified/active flags. Clients may create foods (needed
  for scan auto-import); only trainers/admins update/delete.
- **External search** (`/api/foods/search-external`): all enabled providers queried **in
  parallel** (`Promise.allSettled`), everything normalized to **per-100 g**, merged and
  sorted by fixed precedence OFF < USDA < Nutritionix < FatSecret; `generic=1` filter drops
  branded items:
  - **Open Food Facts** — no key (User-Agent only); full 13-nutrient mapping from
    `nutriments`, g→mg conversions for sodium/cholesterol/potassium/calcium/iron.
  - **USDA FoodData Central** — API key; nutrients looked up by numeric `nutrientId`.
  - **Nutritionix** — app-id/app-key headers; common + branded results, per-serving values
    scaled to 100 g via `serving_weight_grams`.
  - **FatSecret** — **hand-rolled OAuth 1.0 HMAC-SHA1 signing** (nonce, sorted params,
    base string, signature); macros regex-parsed out of the `food_description` text.
- **Import**: caches the remote image into R2, **dedup by sourceId** (update + reactivate,
  else create).
- **Barcode** (`/api/foods/barcode`): local DB first → Open Food Facts product API →
  auto-import on hit (client scan effectively creates the Food). UI: `html5-qrcode` with
  EAN/UPC/Code-128 formats, native BarcodeDetector when available, wide scan box, beep on
  hit, React-19-strict-mode-safe lifecycle.
- API keys resolve **only** from the IntegrationSettings global (admin-editable in-app),
  not env.

### Meal plans — bank-of-options model

- A meal plan is **not a weekly grid** — it's a bank of `mealOptions[]` grouped by meal
  type. Option = type + name + foods (relation, quantity, unit) or a **free meal** with a
  max-calorie cap (cap counts as its calorie contribution). Custom meal types supported
  (each gets its own bank section, weekly slot row, and diary section). Built-ins:
  breakfast/lunch/dinner/snack/pre-workout/post-workout/free; visible built-ins gated by
  the client's `mealsPerDayPreference`.
- **Trainer editor**: per-option **live macro totals** (each food scaled
  `quantity/servingSize` against per-serving calories + P/C/F), inline food picker,
  client-context sidebar showing dietary approach, allergies, and the active goal's
  nutrition targets. Same template apply/export (+`isPublic` share) and
  publish/supersede lifecycle as workouts (meal templates clone verbatim — no stripping).
- **ClientMealArrangements**: the client's **private weekly arrangement** of the options
  bank — (weekday × meal type → option) slots stored per (client, plan), invisible to the
  trainer, edited in a week-navigator drawer with optimistic updates + rollback. A
  week-aggregated **grocery list drawer** hangs off the same view.
- **One-tap logging**: the food-log drawer surfaces "your plan for today" (the arranged
  option) + other plan options; logging an option creates one FoodEntry per food, tagged
  `source:'prescribed'` + `mealPlan` + `mealOptionId` (which is exactly what logs-first
  plan resolution reads back).
- **FoodEntries** (diary rows): date-indexed, food relation or quick-entry label, computed
  macros, provenance `self_logged | prescribed | ai_suggested`.

### Nutrition targets (TDEE calculator)

`nutritionCalculator.ts` runs **trainer-side** (GoalManager/IntakeTab); results are
persisted onto the **ClientGoal** record — never recomputed at consumption time.
- **BMR**: Katch-McArdle `370 + 21.6·LBM` when body-fat is known, else Mifflin-St Jeor
  (`10·kg + 6.25·cm − 5·age + 5♂/−161♀`).
- **TDEE** = BMR × activity multiplier (1.2 / 1.375 / 1.55 / 1.725).
- **Calories** = TDEE × goal adjustment (lose −20%, build muscle +15%, maintain 0).
- **Macros** by dietary-approach splits (balanced 30/40/30, high-protein 40/35/25,
  low-carb 35/25/40, keto 25/5/70, vegan 20/55/25, vegetarian 25/50/25) → grams at 4/4/9.
- **Water** = 35 ml/kg; **fiber** = 14 g/1000 kcal. Plus phase-target weight/BF%
  projections (weekly rate clamped against the ultimate target). Returns a `derivation`
  object so the UI can explain every number.

## 7. Body-Fat Estimation

Three entry paths in one wrapper (`BodyFatEstimator`): direct % entry, tape measurements,
or **camera**.

- **US Navy formula** (`bodyFatCalculator.ts`), all cm:
  - ♂ `BF = 495 / (1.0324 − 0.19077·log10(waist−neck) + 0.15456·log10(height)) − 450`
  - ♀ `BF = 495 / (1.29579 − 0.35004·log10(waist+hips−neck) + 0.22100·log10(height)) − 450`
  - ACE category bands (essential/athletic/fitness/average/above-average, gender-split)
    with color tokens.
- **Camera estimator** (`BodyFatCameraEstimator.tsx`, fully on-device):
  - **Two MediaPipe models** (GPU, CDN-loaded): PoseLandmarker (lite, video mode) for the
    live guidance loop + landmark rows, and SelfieSegmenter (image mode, confidence masks)
    for the silhouette at capture.
  - **Calibration**: nose→ankle pixel height vs known profile height × an anthropometric
    0.86 correction → px/cm scale, **computed per photo** (front and side separately).
  - **Measurement rows**: neck at 55% shoulder→nose, waist at shoulder/hip midpoint, hips
    at hip center; widths = **narrowest silhouette span** in a vertical window (excludes
    hanging arms), mask threshold 180/255.
  - **Circumference**: ellipse approximation from front + side half-widths,
    `C ≈ π·(a + b)` → feed the Navy formula.
  - **Hands-free UX**: setup checklist → front → side; live guidance state machine checks
    visibility, framing, distance, centering, orientation (shoulder/hip spread), arm
    spread, posture — with **voice guidance** (23 pre-recorded clips + SpeechSynthesis
    fallback); auto-captures after 1.5 s of holding still; animated result reveal with
    measurement overlays.
  - Honest accuracy copy: **±5–8% typical error** (camera), ±3–5% (tape/Navy). Photos
    never leave the device unless the user opts into saving them as progress photos.
- **Persistence**: BF% + neck/waist/hips go to the **BodyMeasurements** collection
  (weight there too — separate from casual check-in weights; progress prefers
  measurements, falls back to check-ins).

## 8. Tracking & Wellness

- **Check-ins** (end-to-end): composition driven by feature flags (mood/energy/stress,
  sleep, steps; photos always available, up to 4, each with a per-photo
  **consent-to-feature** switch — private by default). One check-in per device-local day
  (tz cookie), 7-day backfill window, embedded body-fat estimator, separate
  body-measurements write. Notifies all assigned trainers; trainer feedback notifies the
  client back. Dynamic done-screen messages picked from a tag-matched JSON pool
  (mood-high, sleep-short, first-checkin…) with an LRU to avoid repeats.
- **Water / sleep / mood**: per-day upsert routes (device-tz aware), preset water amounts
  with goal progress, 1–5 rating rows; all flag-gated.
- **Fasting**: start/end sessions with target presets (16/18/20/24 h), live elapsed timer,
  **metabolic zone bar** (Fed <4 h, Catabolic <16 h, Fat Burning <24 h, Ketosis <72 h,
  Deep Ketosis), history with "goal met" badges. Default-off feature flag.
- **Activity logging**: 24 activities with Compendium MET values;
  `kcal = MET × kg × hours × HR-factor` (heart-rate bands 0.85–1.45); live estimate
  auto-fills until the user overrides. **Workout burn** estimated from logged sets
  (MET bucket by effort/RPE: 3.5/5.0/6.5, work = duration or reps×3 s, plus bucketed
  rest). **Wearable override**: a session-level calories PATCH that supersedes the
  per-entry sums.
- **Home widgets / rings**: consolidated server fetch — check-in streak, today's macros,
  burned kcal, workout progress (logged/prescribed sets), week strip, PRs this week,
  7-day weight delta, pending labs. Diary day-strip: **today = live percentages** (food/
  water/workout/check-in vs goals), **past days = binary** did-you-log flags.
- **Timezone discipline**: all logging routes bucket by device-local day via a `device-tz`
  cookie (`dayBoundsInTz`), storing the UTC day-start.

## 9. Progress & Reports

- **Client progress page** (flag-gated tabs Overview/Body/Nutrition/Wellness/Workouts,
  7/30/90-day ranges): streaks (with one-day grace for today), consistency %, calorie
  adherence (% of days within ±10% of target), macro averages/trends, weight chart with
  target line, BF category callout, circumference tri-line chart, **wellness index**
  (`(mood+energy+sleep)/3 − (stress−3)·0.25`, clamped 1–5), consistency heatmap, activity
  ring hero. All math centralized in `progressAggregates.ts` (pure functions).
- **Trainer reports** (per client, 30 days): avg mood/sleep/calories + latest weight
  tiles; compliance bars (check-in/food/workout days); weight, calories, mood+energy
  charts; **weekly tonnage trend** (Σ reps×kg); volume by muscle group; **PR table ranked
  by Epley e1RM** (top 15); text activity heatmap.

## 10. Supplements & Labs

- **Supplements**: trainer-prescribed regimens — kind (12 options → icon/tint), dose,
  schedule slots (9 slots/day), optional link to a lab test, start/end/status.
  **SupplementLogs**: one row per (date, supplement, slot) tap; un-tap deletes; adherence
  computed at read time. Tap-to-log grid lives in the client diary.
- **LabTests**: request → schedule → upload → review lifecycle (16 test types + custom),
  auto-stamped status timestamps, due dates, client file upload, trainer feedback.

## 11. Content, Notifications, Help

- **Resources**: trainer-authored warmups/stretches/articles (Markdown, cover image,
  muscle groups/topics, audience public/clients/assigned); surfaced contextually (warmup/
  stretch recs inside the workout player by muscle overlap; article feed on dashboard).
- **Notifications**: typed collection (check-in, swap request, sub expiring/expired,
  feedback, new client, general) via a `createNotification()` helper; bell polls every
  30 s.
- **Self-documenting UX convention**: every form field gets a `FieldInfo` tooltip + a
  `HelpDrawer` entry (in-app help content module).

## 12. Portals

- **Client** (`/client/*`, mobile-first `max-w-xl`, floating pill nav): diary (primary
  surface: calorie donut segmented by macros with net = consumed − burned, day strip, food
  log/meal plan/workout/supplements/activity/session-calories drawers, inline check-in,
  goal card), workout player, dashboard (rings + next action + wins), progress, wellness,
  check-in, labs, marketplace (+ success/cancel), redeem, resources detail, settings.
  Route-level skeletons everywhere; three-tier loading (skeleton → pending bar → branded
  loader); localStorage drafts (7-day expiry); haptics by intent.
- **Trainer** (`/trainer/*`, sidebar): dashboard, clients list + rich client detail
  (intake, goal manager with the TDEE calculator, sessions vs add-on balances,
  supplements, labs, swap approvals, admin section), check-in review (quick-reply
  presets), reports, plan editors, libraries (exercises, foods, workout/meal templates,
  resources).
- **Admin** (`/admin-portal/*`): users (role changes, force logout), trainers (create),
  clients (trainer assignment), packages, promo codes (+ Stripe sync), redemption codes,
  auth logs, reconcile-subscriptions button, tabbed settings editing all three globals.
  Payload's native `/admin` reserved for super-admins.

## 13. Theming & Design System

- **4 themes × light/dark = 8 variants** (monochrome, midnight-gold, electric-emerald,
  arctic-blue) as CSS-variable contracts with derived tokens (surface tints, radius scale,
  rings). Per-profile preference + platform default + admin **forced theme** override;
  anti-flash inline script in the root layout.
- **Identity tokens** (`ui-tokens.ts`): every domain enum (meal types, macros, 24
  activities with METs, muscle groups, equipment, ratings, goals, body-fat categories,
  subscription statuses) maps to icon + color roles + label in one module.
- **Three-layer rule**: pages → primitives (`components/ui/`: SectionCard, ActivityRing,
  StatTile, SwipeRow, AppTabs, DayPicker, ConsistencyHeatmap, UndoPill, drawers…) →
  tokens + theme CSS. Enforced advisorily by `pnpm lint:design` (8 anti-pattern rules).
- Aesthetic: "iOS-Fitness energy" — flat tinted surfaces, shadow-less dark themes,
  aggressive rounding, activity rings, full-bleed fade-mask heroes. Admin/trainer portals
  flagged for a future redesign pass.

## 14. Patterns Worth Stealing for Kova

1. **Cron-free time-based state** — derive from `expiresAt` at read time; reconcile lazily
   on read.
2. **Queue-not-sum repeat purchases** — new budget starts at current expiry.
3. **Entitlements resolved through one function** — defaults → overrides → budget-gating;
   UI never reads raw flags.
4. **Webhook as single source of truth** for paid state.
5. **DB-backed rate limiting** on the audit-log collection — no extra infra.
6. **CMS-driven runtime config** — integration keys, login page, security knobs all
   admin-editable globals.
7. **Shared field schemas** between plans and templates → transfer is a JSON copy; export
   strips client-specific data but keeps portable progression rules.
8. **Logs-first "what plan was active"** resolution — historically accurate reporting.
9. **Deferred side-effects in CMS hooks** (`setTimeout(0)`/`setImmediate`) to dodge
   transaction re-entry deadlocks.
10. **Parallel provider fan-out with normalization + sourceId dedup** for external data.
11. **On-device ML with honest error bars** and privacy-by-default photo handling.
12. **Store metric, convert at display**; unit prefs on the profile; device-tz cookie for
    day bucketing.
13. **Identity tokens + design lint** to keep a large UI coherent.

## 15. Known Gaps / Issues in the Original (avoid or fix in Kova)

- **Security**: admin mutation API routes lack auth guards (create-trainer, change-role,
  assign/unassign-trainer); trainer client-detail page doesn't verify assignment.
- No email sending (OTP/reset/expiry emails), no analytics, no i18n.
- `canReplaceExercises`/`canReorderExercises` flags have no UI; RPE is logged but not
  rendered client-side; `blockNotes`/`slotNotes`/meal-option & food-entry `notes` exist in
  schema with no editor UI; exercise/food pickers filter by name only (no muscle/equipment
  filters); `weeks` is metadata only (no per-week programming, no copy-week).
- `/trainer/reports` aggregate view missing; trainer reports client uses naive date
  parsing (not tz-aware) unlike the rest of the app.
- Tests are scaffold-level; docker-compose is stale (Mongo, app uses Postgres); README is
  the stock template.
