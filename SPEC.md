# MOSSA — Product & Technical Specification

> **Mossa** is a multi-tenant, multi-trainer platform for personal-training businesses:
> studios, gyms, and independent coaches ("tenants") manage their clients, run staff
> trainers with scoped client assignments, sell training packages through their own Stripe,
> and use an AI suite (Workers AI + Google Gemini) metered against tenant credits.
>
> Mossa is the clean rebuild of ByShujaa (feature inventory: `docs/BY-SHUJAA-FEATURES.md`) on
> the Scena platform stack. Scena proved the platform patterns; ByShujaa proved the domain.
> Mossa = Scena's architecture × ByShujaa's domain, both improved.
>
> Status: SPEC v1 — 2026-07-10. **Implementation: foundation → AI suite,
> commerce, content, reports, and media all built and tested (64 tests green);
> see CLAUDE.md "Status" and the git history for what's live vs. pending.**

---

## 1. Vision & Positioning

- **Who buys it:** the training business (tenant) — a solo PT, a coaching team, or a studio.
- **Who uses it:** tenant **owners** (run the business), **trainers** (coach an assigned
  roster), and **clients** (train, eat, log, check in — mobile-first PWA).
- **How money flows:**
  1. **Platform rail** — tenants pay Mossa a plan subscription + buy AI credit packs.
  2. **Tenant rail** — tenants sell packages to *their* clients via **Stripe Connect** on
     the tenant's own Stripe account. **Mossa takes no markup/application fee** on this rail.
  3. **AI rail** — AI usage by anyone inside a tenancy (trainer or client) consumes the
     **tenancy's credit balance**. Billing relationship is strictly Mossa ↔ tenant.
- **What's different from ByShujaa:** true multi-tenancy, scoped trainer permissions,
  a real security model, platform plans + feature flags, an AI suite, email that actually
  sends, and a serverless edge stack with no Node server to babysit.

---

## 2. Tenancy Model & Personas

### Tenant

A **Better Auth organization = one Mossa tenant** (Scena pattern). All domain data lives
in D1 keyed by `tenant_id` with per-tenant indexes. One `TenantBillingDO` per tenant is
the authoritative credit balance. No per-tenant databases in v1 (D1 10 GB budget is ample;
revisit sharding only if a tenant's row counts demand it).

### Personas (the ByShujaa "profiles" idea, re-grounded)

**Decision: memberships + roles, not Netflix profiles.** ByShujaa's Profiles collection
conflated identity, role, and body data. Mossa splits them:

- A **user** is a global Better Auth account (one credential, any number of tenancies).
- A **membership** ties a user to a tenant with a **staff role** (`owner | trainer |
  assistant`) — or with role `client`.
- A **client record** (`clients` table) holds the coaching-domain data (intake, goals,
  units, timezone, measurements…). It links to a user account (`user_id`) once the client
  activates their login; it can exist before that (trainer creates the record first,
  invites later).

This preserves everything people liked about profiles:

- **A trainer can train themself:** every staff member can have a linked client record in
  the same tenant ("Create my client profile" — one tap). The app surface toggles between
  **Coach mode** and **Train mode**; same login, same tenant, two contexts.
- **A user can belong to multiple tenants** (client at one studio, trainer at another):
  the context switcher lists `(tenant, persona)` pairs; switching sets
  `activeOrganizationId` + active persona, sticky per device (long-lived cookie, ByShujaa's
  `last-profile` trick).

### Staff roles & client scoping (the "assigned level of clients")

| Role | Scope |
|---|---|
| **owner** | Everything in the tenant: all clients, staff mgmt, packages, billing (platform plan + credits + Stripe Connect), settings, branding. |
| **trainer** | Only clients where `client_trainers` links them: full coaching surface (plans, check-ins, supplements, labs, sessions, reports) **for assigned clients only**. No billing, no staff mgmt, no tenant settings. Owners can extend a trainer with extra grants (see §4). |
| **assistant** | Front-desk lane: schedule/sessions, client roster read, redemption codes. No plan editing. Optional role, ships disabled on lower plans. |
| **client** | The client PWA only; row-level scope = their own client record. |

- `client_trainers` is many-to-many (**a client can have multiple trainers**, ByShujaa
  semantics preserved), with an optional `is_primary` flag (new: notifications default to
  primary, others opt in — fixes ByShujaa's notify-everyone spam).
- **Fixes over ByShujaa (non-negotiable):** every trainer-facing endpoint verifies
  assignment (`requireClientAccess(clientId)`), not just role. Admin mutations are
  authenticated. Central route-guard (§4), no unguarded `overrideAccess` sprawl.

### Platform admin

Separate axis from tenant RBAC (Scena pattern): `ADMIN_EMAILS` allowlist → `/api/admin/*`
lane — plan/model/config editing, tenant support tools, comps, impersonation with audit.

---

## 3. Architecture

### Monorepo (pnpm workspaces + Turborepo, mirrors `~/scena`)

```
mossa/
  apps/
    api/         # THE worker: Hono router + DOs + D1/KV/R2/AI bindings.
                 # Serves the app SPA via assets binding (same-origin auth).
    app/         # ONE Vite + React 19 PWA for ALL roles — client, trainer, owner,
                 # platform admin. Role-adaptive navigation (see DESIGN.md §5);
                 # Service Worker + offline write queue for gym-basement logging.
    www/         # Marketing site — static generator, assets worker (scena/www pattern).
  packages/
    protocol/    # Zod schemas + API types shared api <-> app.
    domain/      # PURE logic, no I/O: credits.ts, entitlements.ts, nutrition
                 # calculator, body-fat math, progress aggregates, budget math,
                 # workout schedule/PR logic. Unit-testable, transplant-friendly.
    ui/          # The design system (shadcn/ui + Tailwind v4 + custom components
                 # per DESIGN.md §2): rings, metric pills, stat cards, timeline feed.
    brand/       # Logos, illustrations, theme CSS variable contracts.
```

### Cloudflare runtime (apps/api `wrangler.jsonc`)

- **Worker**: Hono + Zod. `run_worker_first: ["/api/*", "/health"]`, SPA fallback for
  the app. Route `mossa.4dl.app` (custom_domain, single-level for Universal SSL) —
  **one origin serves every role** (client PWA, trainer, owner, admin); the Service
  Worker scopes offline caching to the app shell + client surfaces.
- **D1** (`DB`): all authoring + logging data, Better Auth tables, billing mirrors.
  Idempotent lazy `ensureSchema` + versioned migration statements (Scena pattern).
- **Durable Objects**:
  - `TenantBillingDO` — credit authority (transplanted from Scena, §6).
  - `InboxDO` (per user) — real-time notification push + coaching chat threads over
    WebSocket (phase 2; v1 polls like ByShujaa's 30 s bell).
- **R2** (`MEDIA`): media library — exercise media, food images, progress photos, lab
  uploads, avatars, AI-generated assets. Content-addressed keys, tenant-prefixed
  (`t/<tenant>/…`); progress photos and lab files served only through an authed,
  assignment-checked proxy route (private by default — never public-bucket).
- **KV** (`CACHE`): external food/exercise API response cache, client-app pairing codes
  (if we ever do TV/kiosk mode), short-lived tokens.
- **Workers AI** (`AI`) + Google AI Studio via fetch (§6).
- **Analytics Engine** (`USAGE`): high-cardinality product analytics (logs written, AI
  calls, active clients) for platform dashboards.
- **Email Sending** (`EMAIL`): transactional — OTP, invites, check-in nudges, payment
  and dunning notices. Mock mailer fallback in dev. **This closes ByShujaa's biggest gap.**
- **Cron**: `*/15 * * * *` (notification digests, reminder sweeps) and `10 0 * * *`
  (monthly credit grants, platform dunning lifecycle). **No domain cron** — subscription
  expiry stays read-time-derived (§7).

### Frontend — one app, one design system, three roles

**Design system: `DESIGN.md` is canonical.** The UI is modeled on the Google Health
redesign (reference screenshots in `docs/google-health-ui/`): dark-first tonal surfaces (no
borders/shadows), everything rounded, domain-tinted accents, huge numerals, hero
progress-ring + metric-pill carousel, timeline insight feed, stat cards with mini
charts, status chips (In range / Out of range), bottom-sheet chip-grid logging, and
Material-outlined full-screen forms. Built as **shadcn/ui + Tailwind v4** restyles plus
custom identity components (ProgressRing, MetricPill, StatCard, TimelineFeed,
Hypnogram, WeekDots…) in `packages/ui`. Design bar: a 70-year-old can use it.

**We do not build three UIs.** `apps/app` is a single React 19 + React Router PWA whose
navigation adapts to the active persona (DESIGN.md §5):
- **Client**: Today · Train · Eat · Progress.
- **Trainer**: Today (triage inbox — same feed pattern, events are check-ins/swaps/
  at-risk clients) · Clients (roster) · Library.
- **Owner**: + Business tab (packages, subscriptions, credits/AI usage, Connect, staff).
- **Platform admin**: hidden section gated by `ADMIN_EMAILS`.

**Keystone rule**: the trainer's client-detail page *is* the client app — the same
Today/Train/Eat/Progress surfaces rendered for that client with coach chrome and edit
powers (assignment-checked). Role changes scope + powers + nav, never screens. Desktop
(`≥ md`) swaps bottom tabs for a nav rail and goes two-pane for roster/library — same
components, no separate dashboard.

Also: **offline-first logging** (IndexedDB write queue, replay on reconnect), haptics,
skeleton tiers, anti-flash theming (tonal ladder + tenant accent swap on Studio+),
localStorage drafts. Store metric, convert at display; device-tz cookie for day
bucketing — everywhere, including trainer reports (ByShujaa missed that one spot).

---

## 4. Identity, Auth & Permissions

- **100% passwordless. Two methods only: email OTP and passkeys.** No passwords, no
  magic links, no social login — nothing to remember, nothing to phish, nothing to reset.
- **Better Auth on D1**, per-request instance (Scena `createAuth`): organization plugin
  (org = tenant) + **emailOTP plugin** (6-digit, short TTL, via Email Sending) +
  **passkey plugin** (WebAuthn). Session stamps `activeOrganizationId`.
- **The flow, every role**: email → OTP → in. After first sign-in the app prompts
  **"Add a passkey"** (Face ID / fingerprint / device PIN); from then on passkey is the
  one-tap default and OTP is the fallback + new-device bootstrap. Multiple passkeys per
  user (phone + laptop); managed (list/revoke) in Settings.
- **Provisioning** (everyone needs a reachable email — the synthetic-email staff pattern
  from Scena is dropped since it can't receive OTP):
  - **Owners** self-serve sign-up (creates tenant): email → OTP → passkey prompt.
  - **Trainers/assistants**: owner invites by email → invite link → OTP verifies →
    passkey prompt.
  - **Clients**: invited by trainer/owner (email invite, or a QR shown in the gym that
    deep-links to the invite) or self-register via the tenant's marketplace page (tenant
    toggle). Same email → OTP → passkey path.
- This also kills a whole class of surface: no credential stuffing, no password reset
  flows, no forgot-password endpoints, no bcrypt anywhere. Passkeys double as fast
  re-auth for sensitive actions (Stripe Connect changes, member role changes).
- **Tenant-branded sign-in, shared auth origin.** One auth system on one origin —
  passkeys are WebAuthn origin-bound, so a single origin is what lets one passkey work
  across every tenancy a user belongs to (and survives tenant rebrands). But the *entry
  point* is skinned: `/t/<slug>` carries a Sign in that renders the OTP screen with the
  tenant's logo/accent/welcome copy (`branding` entitlement; neutral Mossa styling
  below Studio). Invites and gym QRs always deep-link to the branded page, so clients
  effectively never see a generic screen. The neutral `/login` remains; after OTP,
  membership lookup routes anyone to the right tenant regardless of which door they
  used — branding is cosmetic, never functional. Per-tenant PWA manifest (branded
  install icon/name) is a parked enhancement. **Superseded for custom domains
  (§14.1, shipped):** a tenant on its own domain runs a per-domain auth origin
  (Model A) — the Host pins the tenant and passkeys enroll per domain. The
  single-origin story above still describes `mossa.4dl.app` and the `/t/<slug>`
  fallback, which remain for tenants without a custom domain.
- **RBAC** (`perms.ts`, pure): `{resource: action[]}` grants; `PERMISSION_CATALOG` over
  resources `client, plan, nutrition, tracking, supplement, lab, resource, session,
  package, member, report, billing, settings, ai`. `ROLE_PRESETS` for the four roles;
  owners may attach **per-member custom grants** (`member.permissions_json`) — this is the
  "assigned level" dial beyond roster scoping.
- **Route guard** (single middleware, Scena's three lanes):
  1. **Public**: auth endpoints, `/api/me`, tenant marketplace pages, Stripe webhooks
     (signature-checked), www.
  2. **Platform admin**: `/api/admin/*` via `ADMIN_EMAILS`.
  3. **Everything else**: authed member; `permissionFor(method, path)` + row-level checks
     (`requireClientAccess` for trainers, `own-record-only` for clients).
- **Auth security**: DB-backed rate limiting on an `auth_logs` table (ByShujaa's pattern —
  multi-instance-safe, no extra infra), Turnstile on the public OTP-request form, OTP
  quotas/cooldowns + resend throttles configurable in platform config, WebAuthn
  challenge replay protection via Better Auth's passkey plugin. Losing email access is
  the only recovery case: platform/tenant admin re-keys the member's email (audited).

---

## 5. Platform Plans, Entitlements & Feature Flags

Scena's `entitlements.ts` model verbatim: **quotas + feature gates + AI monthly grant**,
stored as `entitlements_json` per plan row (admin-editable at runtime), deep-merged over a
FREE baseline, per-tenant `overrides_json` for comps/gifts, `checkDowngrade()` compliance
gate on downgrades.

**Mossa ships 4 paid plans.** Tier names are generic on purpose — "Studio" is
business-side vocabulary for a tenant, never a plan name. There is no free tier; the two
30-day trials replaced it.

| | **Solo** $4.99/mo | **Light** $24.99/mo | **Pro** $49.99/mo | **Max** $119.99/mo |
|---|---|---|---|---|
| Free trial | 30 days | 30 days | — | — |
| Coaches (`staffSeats`, incl. owner) | 1 | 1 | 5 | unlimited |
| Active clients | 1 | 30 | 100 | unlimited |
| AI monthly credit grant | 500 | 3,000 | 6,000 | 15,000 |
| Workout/meal templates | 25 | 200 | unlimited | unlimited |
| Media storage | 250 MB | 1 GB | 10 GB | 100 GB |
| **Features** | | | | |
| Core coaching (plans, diary, check-ins, progress) | ✅ | ✅ | ✅ | ✅ |
| External food/exercise search (`externalSearch`) | ✅ | ✅ | ✅ | ✅ |
| AI suite (`aiSuite`) | ✅ | ✅ | ✅ | ✅ |
| Stripe Connect packages (`commerce`) | — | ✅ | ✅ | ✅ |
| Body-fat camera (`bfCamera`) | — | ✅ | ✅ | ✅ |
| Supplements & labs (`supplementsLabs`) | — | — | ✅ | ✅ |
| Assistant role, sessions/booking (`frontDesk`) | — | — | ✅ | ✅ |
| Custom branding/themes (`branding`) | — | — | ✅ | ✅ |

No plan enables a `reserved: true` feature — `integrations` (API/webhooks + exports) and
`chat` (trainer ↔ client messaging) do not exist, so no tier may advertise them. Pro and
Max carry every feature that *does* exist; Max's difference is capacity, not capability.

**Credit grants are derived, not chosen.** 1 credit = $0.001 and markup is 3×, so
1 credit ≈ 30.3 neurons; a workout-plan draft costs ~18 credits, a meal-plan draft ~11, a
meal photo 1 (2 held), an NL food log or check-in summary 1, and a generated library image
118. One standard coached client-month ≈ 91 credits ≈ $0.09. Each grant is that bundle
times the roster the tier is sized for, held to **10–12.5% of the subscription price** so
AI is a feature of the plan and not its substance. The full derivation, with per-action
token counts, is the comment above `DEFAULT_PLANS` in `apps/api/src/billing-store.ts` —
re-derive it there when a provider reprices.

**Retired tiers are grandfathered, never migrated.** `free`, `studio` and `team` remain as
plan rows with `active = 0`: they still resolve for tenants already on them
(`tenantEntitlements` looks up by id) but are never offered to anyone new (`listPlans`
filters `active = 1`, which backs the picker, `check-downgrade` and both checkout paths).
Nobody is moved automatically — `studio` → `pro` would cut storage 25 GB → 10 GB and could
put a live tenant over quota, so a human decides per tenant. `free` also stays the implicit
unsubscribed baseline for a brand-new tenant and the fallback on subscription cancellation.
`quotas` ceilings are only consulted on CREATE, so a tenant left above a lowered ceiling
keeps everything they have and simply cannot add more.

(Numbers are seed defaults in `billing-store.ts`, versioned by `PLAN_CATALOG_VERSION` and
admin-tunable in production.) Quotas enforce at write time; feature gates checked inline in
routes (`if (!ent.features.aiSuite) 403`) and mirrored to the UI via `GET /api/billing`.
`trialDays` rides in `entitlements_json` (no schema change) and is consumed once, at
subscription creation, as Stripe's `trial_period_days`.

**Two flag systems, deliberately distinct (don't merge them):**
1. **Platform entitlements** — what the *tenant* bought from Mossa (above).
2. **Package feature flags** — what a *client* bought from the tenant (§7). Client-side
   capability = `entitlements ∩ resolveClientFlags(subscription)`.

---

## 6. Credits & the AI Suite

### Credit system (transplant Scena wholesale)

- `packages/domain/credits.ts` — pure math: **1 credit = $0.001**; neurons are the
  metering unit; `credits = max(1, ceil(neurons × $0.011/1000-neurons × markup))`,
  **default markup 3×**. Google/Gemini list prices pre-expressed as neuron-equivalents in
  the model rate table so both providers meter identically.
- `TenantBillingDO`: authoritative `balance` + `holds`; **reserve → settle → release**
  around every AI call (worst-case hold, exact-usage settle, 10-min stale-hold reaper);
  `charge()` for fixed-price external calls; `topUp()`; **idempotent `grantMonthly`**
  keyed `YYYY-MM` (floor top-up — purchased credits persist). Append-only mirror to D1
  `credit_ledger` for statements.
- **Credit packs** (Stripe one-time): 1k/$1, 5.5k/$5, 30k/$25, 130k/$100 (Scena seed).
- **Consumption attribution**: every AI call records `tenant_id`, `actor` (member or
  client id), `feature`, model, neurons, credits in `ai_generations` — so owners see
  *which trainer/client/feature* burns credits. Tenant-side controls: per-feature AI
  toggles and an optional per-client daily credit cap (owner setting) to stop one
  enthusiastic client draining the balance.
- When balance hits zero: AI features return a friendly 402 with a top-up CTA in the
  owner surface; clients see "ask your coach" copy. Core (non-AI) product never bricks.

### Providers & models

- **Workers AI** (`AI` binding): default lane for text (Llama 3.3 70B fast default,
  small models for cheap tasks), image (FLUX Schnell), TTS (Aura). Model catalog in D1
  `ai_models` (rates in neurons, per-model markup, enable flags — admin UI + Gemini sync
  button, straight from Scena).
- **Google AI Studio / Gemini** via `generativelanguage.googleapis.com/v1beta`:
  **single platform key** in `app_config` (`google.gemini_key`), **no BYO keys**. Routed
  by model-id prefix. Gemini Flash/Flash-Lite for high-quality text + **vision** (food
  photos, form analysis), Gemini image/TTS models where useful.
- **Mock mode** (`ai.mock = auto|on|off`): deterministic offline outputs with synthetic
  usage so reserve/settle/ledger paths run in local dev without bindings or keys.
- Prompt-hash **response cache** (`ai_cache`) — cache hits are free (release the hold).
- 180 s per-call timeout; SSE streaming for text.

### AI feature catalog (the Mossa AI Suite)

All gated by `aiSuite` + per-feature tenant toggles; all metered reserve→settle; every
output lands as a **draft the human approves** — AI never silently mutates a plan.

**Client-facing:**

| Feature | What it does | Default model lane |
|---|---|---|
| **Snap-a-Meal** | Photo → food recognition → portion + macro estimate → prefilled diary entry for confirmation (flag `canLogOwnFood`) | Gemini Flash (vision) |
| **Label Reader** | Barcode miss? Photo of the nutrition-facts panel → extracted per-serving macros → creates the Food row | Gemini Flash (vision) |
| **Natural-language logging** | "2 eggs, toast and an apple" → parsed food entries | Workers AI small model |
| **Voice logging** | Speak it instead of typing it — speech-to-text → same parser (food, water, weight, activity). The 70-year-old-proof input method | Workers AI Whisper + small text model |
| **Meal Swap** | "No chicken tonight — what fits?" → alternatives from the plan's option bank or food library matching the remaining macro budget | Workers AI text |
| **Menu Scout** | Photo of a restaurant menu → 2–3 best picks for today's remaining targets, with rough macros | Gemini Flash (vision) |
| **Recipe Builder** | Ingredients on hand (or the grocery list) → recipe hitting the macro targets, honoring allergies/approach; saveable as a meal option | Gemini Flash |
| **Coach Assistant chat** | Guardrailed Q&A grounded in *their* plan/logs; tenant-configurable tone; hard-scoped no-medical-advice system prompt | Gemini Flash-Lite |
| **Progress Narrative** | Monthly readable recap of their own data (also trainer-facing) | Workers AI text |

**Trainer/owner-facing:**

| Feature | What it does | Default model lane |
|---|---|---|
| **Plan Draft** | Full workout-plan draft from intake (goals, equipment, available days, injuries, experience) directly into the builder | Workers AI text (70B); Gemini Pro "quality" toggle |
| **Periodization Assistant** | **Performance-aware next phase**: reads the client's logged history — e1RM trends, per-exercise adherence, effort labels, skipped/swapped exercises, session frequency — and proposes the next mesocycle: progressions, deloads for stalled lifts, volume redistribution, exercise substitutions the client actually does. Renders as a diff against the current plan | Gemini Pro (long context over history) |
| **Meal Plan Draft** | Meal options per meal type honoring targets, dietary approach, allergies; foods matched to library or created verified-pending | Gemini Flash |
| **Check-in Summarizer** | Weekly per-client digest: adherence, trends, red flags, suggested reply draft (quick-replies upgraded) | Workers AI text |
| **Lab Extract** | Uploaded lab report (PDF/photo) → structured value table (marker, value, unit, ref range) attached to the LabTest. **Extraction only — no interpretation, no diagnosis**; trainer reviews. Out-of-ref-range rows flagged visually | Gemini Flash (vision) |
| **Retention Radar** | Churn-risk surface for the roster: engagement signals (log gaps, sinking adherence, unanswered feedback, budget expiry) scored by heuristics, with an LLM one-liner "why + suggested touchpoint" per at-risk client. Feeds the trainer triage inbox | heuristics + Workers AI small |
| **Exercise Author** | Generate/clean instructions, translate, cue text (+ optional TTS audio cues) | Workers AI text + TTS |
| **Resource Writer** | Draft blog articles/warmup guides/recipes in the tenant's voice (content hub §8.10) | Workers AI text |
| **Business Digest** | Owner's monthly narrative: revenue by package, new/churned clients, trainer utilization, credit spend by feature | Workers AI text |

Phasing: v1 = Plan Draft, Snap-a-Meal, NL logging, Check-in Summarizer. Fast-follow =
Label Reader, Voice logging, Meal Swap, Periodization Assistant, Resource Writer. Later =
Menu Scout, Recipe Builder, Lab Extract, Retention Radar, Business Digest, chat.
(Deliberately skipped for now: video form-checking — heavy, liability-adjacent; revisit
post-launch with on-device pose only.)

---

## 7. Tenant Commerce (Stripe Connect + Access Economy)

### Two Stripe rails, cleanly separated

- **Platform rail** (Mossa ↔ tenant): Scena's SDK-less `stripe.ts` — raw fetch + Web
  Crypto webhook verification; config in `app_config` (mode/keys, admin UI); catalog sync
  (plan products + recurring prices, pack products + one-time prices); checkout for plan
  changes and packs; webhooks drive activation, monthly grants, and the **dunning
  lifecycle** `active → past_due (7d grace) → suspended → data-wipe (30d)` via daily cron.
  Comped tenants exempt. Suspension gates the coaching surfaces, never the billing page.
- **Tenant rail** (tenant ↔ client): **Stripe Connect, Standard accounts** — the tenant
  owns the Stripe relationship, their statement descriptor, their payouts, their tax.
  Mossa creates Checkout sessions **on the connected account** with **no
  application_fee** (zero markup, as promised). Onboarding = Connect account link from
  tenant settings; `stripe_account_id` on the tenant row. Per-account webhooks
  (`/api/connect/webhook`) with the same event set ByShujaa handled: checkout completed,
  invoice paid (final-installment cancel), payment failed (pause + notify + PaymentBlocker),
  subscription deleted.

### Packages & the access economy (ByShujaa's best idea, kept intact)

Tenants build **Packages**: one-time price and/or installments (Stripe subscription with
fixed payment count), **feature budgets** (`workout | meal | all` + days), included
add-ons (e.g. consultation sessions), visibility (`private | marketplace |
client_specific`), once-per-customer, per-package client feature flags.

- **ClientSubscriptions** carry `budgets[]` with individual `expires_at` — **days are
  derived at read time; zero cron**. Lazy `reconcileSubscriptionStatus()` on read flips
  expired states (+ best-effort Stripe cancel).
- **Repeat purchases queue, never sum** (`computeBudgetStart` = current expiry).
- **$0 packages bypass Stripe** entirely.
- **Redemption codes** (day top-ups, feature-targeted, max-uses) separate from **promo
  codes** (Stripe coupons/promotion codes on the connected account, synced via deferred
  hooks with `syncStatus` observability).
- **Client flags resolved through one function** — `resolveClientFlags()`: package
  defaults → subscription overrides → budget-gating → **∩ tenant plan entitlements**.
  UI and API only ever consume the resolved shape.
- Tenant **marketplace page**: a public, tenant-branded package storefront
  (`mossa.4dl.app/t/<slug>` or tenant custom domain later) — doubles as client
  self-registration entry.

---

## 8. Domain Feature Catalog (redesigned ByShujaa)

Everything below is per-tenant. Libraries have three visibility levels: **platform seed**
(global read-only content Mossa ships), **tenant** (shared inside the tenant), **private**
(the authoring trainer). That replaces ByShujaa's flat `isPublic`.

### 8.1 Client management
Roster (owner: all; trainer: assigned), invite/activation flow, intake wizard (client
5-step / trainer 2-step, ByShujaa's exact field set: personal + starting point + training
context + nutrition prefs, age/height validation, timezone auto-detect), client detail
workspace (intake, goals, plans, check-ins, supplements, labs, sessions, reports, billing
status), archive/offboard (soft-delete + delete guards). Avatars per persona: DiceBear
generated (style per role, shuffle + reset, cached in R2) or custom upload — ByShujaa's
system, kept.

### 8.2 Goals & targets
Trainer-set **goal phases** (active/superseded lifecycle): body goals, nutrition goals,
exercise goals. **TDEE calculator** (in `packages/domain`): Katch-McArdle when BF% known
else Mifflin-St Jeor; activity multipliers; goal adjustment (−20% / +15% / 0); macro
splits by dietary approach; water 35 ml/kg; fiber 14 g/1000 kcal; phase-target
projections; full `derivation` object so the UI explains every number. Published plans
snapshot the active goal.

### 8.3 Workout system
- **Exercise library**: platform seed (imported from wger + free-exercise-db at build
  time — v1 ships ~800 exercises with media cached in R2) + tenant/private custom.
  Muscle/equipment/difficulty/force/mechanic taxonomy, rich-text instructions, start/end
  media, alternatives (bidirectional sync done properly: join table, not a deferred-hook
  array). **External search** (`externalSearch` flag): wger + free-exercise-db (keyless) +
  ExerciseDB (platform RapidAPI key), parallel fan-out, normalization maps, sourceId
  dedup, R2 image caching — ByShujaa's pipeline, now with KV response caching.
- **Plan builder**: days → blocks (single/superset/circuit/HIIT with rest structure) →
  slots (measurement mode) → sets (**7 weight modes**: absolute, client-picks,
  bodyweight, previous+, previous×, %1RM, dropset; RPE/RIR/tempo). Week mode keyed to
  client available days; per-day computed muscle map; client-context sidebar.
  Draft → published → superseded → archived with goal snapshot. **Adds over ByShujaa:**
  muscle/equipment filters in the exercise picker, block/slot notes actually editable,
  copy-week, and AI Plan Draft (§6).
- **Templates**: tenant/private, apply (append/replace by day), export-with-stripping
  (absolute weights → client-picks; portable progression rules kept).
- **Client player**: day picker + recommend-the-stalest-day scheduling (plans are
  recommendations, not calendar locks), Netflix-style day hero, set-logging drawers
  (grouped round logging for supersets/circuits), rest timers from plan rest values,
  target + last-time hints, effort picker, **PR detection** (Epley e1RM, weight/rep PRs,
  haptic + toast, undo pill), swap requests at slot coordinates with auto-approve for
  listed alternatives, warmup/stretch recommendations by muscle overlap. **Offline
  logging** via the PWA write queue.
- **"What was today"**: logs-first plan resolution; heuristic publishedAt-window fallback
  (ByShujaa's `resolvePlansForDate`, kept).

### 8.4 Nutrition system
- **Food library**: platform seed + tenant + client-created (scan auto-import), 13
  macro/micro fields, barcode-indexed. **External search**: OFF (keyless) + USDA +
  Nutritionix + FatSecret (platform keys in `app_config`; per-provider enable), parallel
  fan-out normalized to per-100 g, provider precedence, sourceId dedup, KV-cached.
- **Barcode**: local-first → OFF fallback → auto-import. html5-qrcode with native
  BarcodeDetector when available.
- **Meal plans = bank of options** (kept): options per meal type (built-ins gated by
  client meals/day preference + tenant custom types), foods with live macro totals,
  **free meals with calorie caps**, publish/supersede lifecycle, templates.
- **Client arrangements**: private weekly (weekday × meal type → option) mapping,
  optimistic drawer UI, **grocery list** aggregated per week.
- **Diary**: calorie donut segmented by macros with net = consumed − burned; one-tap
  log-a-meal-option (entries tagged plan+option for logs-first resolution); quick entry;
  Snap-a-Meal and NL logging (AI, §6).

### 8.5 Body-fat estimation
Direct entry, tape (US Navy), or **camera** — ByShujaa's on-device MediaPipe pipeline
transplanted into `packages/domain` + client PWA: pose landmarker (guidance + rows) +
selfie segmenter (silhouette), per-photo px/cm calibration from known height (0.86
nose→ankle factor), narrowest-span widths, ellipse circumference `π(a+b)`, Navy formula,
ACE category bands, hands-free voice-guided capture, ±5–8% honesty copy, photos on-device
unless opted into progress photos. Results → measurements. Gated by `bfCamera`.

### 8.6 Tracking & wellness
Check-ins (flag-composed fields; one per device-local day; 7-day backfill; progress
photos with per-photo consent; trainer feedback loop with notifications; tag-matched
dynamic done-messages), water/sleep/mood upserts, fasting timer with metabolic zones,
free-form activity logging (24 MET activities, HR-factor formula), workout burn
estimation from logged sets, wearable session-calorie override. Home rings: today = live
percentages, past days = binary logged flags.

### 8.7 Progress & reports
Client progress page (flag-gated tabs; streaks with one-day grace; consistency %; calorie
adherence ±10%; wellness index; weight/BF/circumference charts; heatmap). Trainer
per-client report (compliance bars, tonnage trends, volume by muscle, Epley PR table)
**plus the roster-level trainer/owner dashboard ByShujaa never built**: at-risk clients
(no logs N days), expiring subscriptions, pending swaps/labs/check-ins queue. All math in
`packages/domain/progress.ts`, tz-aware everywhere.

### 8.8 Supplements & labs (`supplementsLabs`, Studio+)
Prescribed supplement regimens (kind/dose/slots, lab linkage, status), tap-to-log slot
grid with read-time adherence, lab request → upload → review lifecycle with due dates and
R2 files behind authed proxy.

### 8.9 Sessions & front desk (`frontDesk`, Studio+)
Add-on types (consultations), session scheduling against add-on balances
(complete/no-show consume; cancel refunds), assistant role surface. Calendar view; later:
client self-booking.

### 8.10 Content system (the blog, upgraded), notifications, help
ByShujaa's Resources become a proper **tenant content hub**:
- **Content types**: articles (the blog), warmup/stretch routines, recipes, FAQ/how-tos.
  Markdown body (images/video via R2), cover image, tags/topics, muscle groups for
  routines, reading time.
- **Audience tiers**: `public` (rendered on the tenant's marketplace page as an SEO
  blog — content marketing that feeds client acquisition), `clients` (everyone in the
  tenancy), `assigned` (specific clients — e.g. a rehab protocol).
- **Lifecycle**: draft → published (+ scheduled publish), author attribution, AI
  Resource Writer produces drafts (§6).
- **Surfacing**: client **Explore rail** on Today + contextual injection (warmup/stretch
  recs by muscle overlap in the workout player, recipes in Eat, article cards in the
  insight feed); trainer Library tab manages it all.

Typed in-app notifications (poll v1, InboxDO push phase 2) **+ email delivery** for the
important ones (check-in feedback, payment failed, expiring soon, new assigned content),
self-documenting UX convention (FieldInfo tooltips + help drawer content module).

### 8.11 Experience layer (adopted from the Google Health UI study — DESIGN.md §6)
- **Insight timeline feed** — Today (both personas) is a reverse-chronological feed of
  events + ✦ AI insights with **👍/👎 feedback** stored per insight
  (`insight_feedback`) — the eval/tuning signal for the AI suite, plus per-type mute.
  Trainer variant is a triage inbox (check-ins with AI summaries + quick replies, swap
  requests, at-risk clients, expiring budgets).
- **Training Load & weekly target** — per-session load score derived from tonnage,
  RPE/effort, and MET minutes; summed weekly against a **trainer-set weekly target**
  (TargetRing "213 of 360" pattern, dotted target lines on charts). Wearable-free.
- **Metric ranges → status chips** — goal phases carry healthy ranges (weight band,
  water floor, sleep window…); every metric renders In range / Off track chips and the
  Progress page leads with a "3 of 5 targets on track" goal-status card.
- **Customizable dashboards** — pencil-edit the hero (ring metric + pills) and the
  Progress key-metrics grid; per-persona `dashboard_prefs` JSON; trainers can push a
  recommended layout to clients.
- **Probable-activity suggestion chips** on the activity form (recency/habit-ranked
  heuristic v1; AI later).
- **Scores** — Recovery/Wellness score (the wellness index) as a ScoreBadge with a
  qualitative chip (74 · Fair); sleep score reserved for future wearable data.
- **Illustrated workout library** — platform seed organized into browsable categories
  (Strength/Cardio/Mobility/Yoga/Stretching) + Saved; gives no-plan clients freestyle
  content and doubles as an upsell surface.
- **History-everywhere** — every metric detail ends in a History button → uniform
  paginated, editable log list.

---

## 9. Data Model (D1 sketch)

Better Auth owns: `user, session, account, verification, organization, member, invitation`.

Platform: `plans, subscriptions(tenant) — plan_id/status/comp/stripe ids/pending_plan/
dunning timestamps/overrides_json`, `credit_ledger`, `credit_packs`, `ai_models,
ai_cache, ai_generations`, `app_config`, `auth_logs`, `promos`.

Tenant domain (all with `tenant_id` + index; JSON body columns for deep structures, same
trade-off ByShujaa's arrays and Scena's manifests made):

```
clients                client_trainers          client_goals
packages               client_subscriptions     redemption_codes    promo_codes(connect)
addon_types            trainer_sessions
exercises              exercise_alternatives    workout_plans       workout_templates
exercise_logs          swap_requests
foods                  meal_plans               meal_templates      meal_arrangements
food_entries
check_ins              measurements             water_logs  sleep_logs  mood_logs
fasting_sessions       supplements              supplement_logs     lab_tests
resources              notifications            media
tenant_settings        (branding/theme, AI toggles, marketplace config, stripe_account_id)
```

Conventions: text UUIDv7 PKs; ISO-8601 UTC timestamps; day-bucketed rows store the UTC
start of the client's local day (device-tz cookie); soft-delete + delete guards for
referenced entities; `source`/`source_id` on imported library rows.

---

## 10. API Surface (shape, not exhaustive)

`/api/*` on the api worker, Hono + Zod, all through the route guard:

- `auth/*` (Better Auth), `me`, `context` (tenant + persona + entitlements + flags bundle)
- `clients`, `clients/:id/{goals,plans,checkins,reports,supplements,labs,sessions}`
- `plans`, `templates`, `exercises` (+`/search-external`), `foods` (+`/search-external`,
  `/barcode`), `logs/{workout,food,water,sleep,mood,fasting}`, `arrangements`, `swaps`
- `packages`, `marketplace/:slug`, `subscriptions`, `redeem`, `connect/{onboard,checkout,
  webhook,portal}`
- `billing` (platform: plan/entitlements/balance/packs/ledger), `billing/{change-plan,
  pack-checkout}`, `stripe/webhook` (platform rail)
- `ai/{draft-plan,draft-meal,snap-meal,parse-food,summarize-checkins,narrative,chat,
  exercise-author,resource-writer}` — all reserve→settle
- `members` (staff CRUD, roles, grants), `settings`, `notifications`
- `admin/*` (platform: tenants, plans, models, config, comps)

---

## 11. Security & Privacy (explicit, because ByShujaa wasn't)

- Central route guard; **zero unauthenticated mutation routes**; row-level assignment
  checks on every trainer-scoped read AND write; clients strictly own-record.
- Progress photos, lab files: private R2 + authed proxy + per-photo consent flags;
  camera BF photos never uploaded without explicit opt-in.
- Webhooks signature-verified (both rails); Turnstile on public forms; DB rate limiting;
  audit trail (`auth_logs` + admin action log).
- Tenant data isolation tested (cross-tenant access attempts as CI fixtures).
- Health-adjacent data: AI system prompts hard-scoped away from medical advice; data
  export + tenant offboarding wipe (dunning delete reuses it); document data residency
  (Cloudflare global; D1 primary region).

## 12. Testing, Observability, Ops

- **Pure domain packages get dense unit tests** (credits, entitlements, budgets, TDEE,
  Navy/ellipse math, progress aggregates, plan lifecycle) — cheap and high-value; this is
  where ByShujaa had literally nothing.
- API integration tests on workers-pool vitest (miniflare): auth lanes, tenant isolation,
  reserve/settle, webhook flows (Stripe fixture events), flag resolution.
- **E2E (Playwright): the three golden paths — BUILT** (`apps/e2e`, `pnpm e2e`). Two
  personas in two browser contexts, driving the real worker with the real SPA:
  (1) owner onboards → invites a client → the client signs in with an emailed OTP,
  auto-links and completes intake → the coach sees the profile; (2) coach builds +
  publishes a workout plan → the client logs a set → the coach sees it; (3) client
  logs a meal → the coach sees it. Each spec provisions its own studio/users, so the
  suite is hermetic and re-runnable; the sign-in code is read from the local D1
  `verification` table, never a log. The shipped set deliberately drops the *client
  buys a package* leg (Stripe) and the *AI draft → approve* leg (needs a live model
  or the mock lane, whose output a launch gate shouldn't assert on) — both belong in
  the integration suite, where they already are. Not covered: commerce, the AI suite,
  camera/vision paths, external search, notifications, staff invitations, custom
  domains, offline, desktop widths.
- Observability on (workers logs), Analytics Engine product metrics, `ai_generations` as
  the AI audit trail, ledger mirrors for billing forensics.
- Local dev: `wrangler dev` + mock AI + mock mailer + Stripe test mode. (The
  demo-tenant seeder was **removed**: it wrote sample clients and a purchasable
  package into the caller's own — i.e. a real — studio, with no undo. Create a
  throwaway studio for demos instead. The platform exercise library seeds itself
  on first use, so nothing depends on the seeder.)

## 13. Build Phases

1. **Foundation** — monorepo, api worker skeleton, Better Auth + org/tenant, route guard,
   RBAC, D1 schema core, `packages/ui` design system (DESIGN.md tokens + core
   components), role-adaptive app shell, context switcher.
2. **Platform billing** — plans/entitlements, TenantBillingDO + credits, Stripe platform
   rail, packs, dunning, admin portal basics.
3. **Coaching core** — clients/intake/goals, exercise library + seed import, workout
   builder + player + logging + PRs, check-ins + measurements + progress. *(First usable
   product.)*
4. **Nutrition** — foods + external search + barcode, meal plans/arrangements/diary,
   TDEE targets.
5. **Tenant commerce** — packages/budgets/flags, Stripe Connect, marketplace page,
   redemption/promo codes, PaymentBlocker.
6. **AI suite** — model catalog + Gemini + mock mode, then features per the §6 phasing:
   v1 (Plan Draft, Snap-a-Meal, NL logging, Check-in Summarizer) → fast-follow (Label
   Reader, Voice logging, Meal Swap, Periodization Assistant, Resource Writer) → later
   (Menu Scout, Recipe Builder, Lab Extract, Retention Radar, Business Digest, chat).
7. **Depth** — supplements/labs, sessions/front desk, body-fat camera, resources, email
   nudges, wellness extras (fasting), InboxDO push/chat.
8. **Polish & launch** — theming/branding, www, onboarding tours, exports, load/failure
   drills.

## 14. Open Questions (decide before the relevant phase)

1. ~~Single origin `mossa.4dl.app` serves all roles; custom tenant domains
   need SaaS-for-domains; defer.~~ **Decided + shipped (Model A, white-label per
   domain):** tenants bring their own domain via **Cloudflare for SaaS** custom
   hostnames (owner self-serves in Settings; CNAME + DCV TXT; auto-provisioned
   cert). On a custom domain the **Host pins the tenant** (`host-context.ts`),
   auth is per-domain (each domain its own WebAuthn RP + cookie jar), and only
   members of that tenant get scope on it. `mossa.4dl.app` stays the neutral
   host: generic entry, the `/t/<slug>` subpath fallback, and platform admin.
   **Trade-off accepted:** because passkeys are origin-bound, one user in
   multiple tenancies enrolls a passkey per domain (OTP is the bootstrap); the
   cross-tenant switcher is hidden on custom domains. Setup: DEPLOY.md.
2. Stripe Connect account type — spec says **Standard** (zero liability, tenant-owned);
   Express would give a more embedded feel but adds platform responsibility. Confirm.
3. Do clients ever exist in two tenants with one email? (Spec says yes via memberships —
   confirm the client PWA switcher UX is worth phase-1 scope or defer multi-tenant clients.)
4. Seed exercise/food library licensing pass (wger CC-BY-SA attribution page, OFF ODbL).
5. Chat (trainer ↔ client) — phase 2 flag now, but confirm it's wanted at all.
6. Plan/pack price points above are placeholders — validate against target market before
   catalog sync goes live.
7. **Wearable import (Health Connect / Apple Health)** — backlog, not v1; the DESIGN.md
   patterns (hypnogram, zone charts, sleep score, cardio-style load) are shaped so
   device data can slot in later without a redesign.
