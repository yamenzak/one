# Kova

Kova is a multi-tenant platform for personal-training businesses: studios, gyms
and independent coaches manage clients, run staff trainers on scoped rosters,
sell training packages through their own payment provider (no markup, no middleman),
and use an AI suite metered against tenant credits.

It is **one app on the One platform** — the shared `@4dl/*` packages in this
repository. What is Kova's and what is the platform's is decided by one rule,
and that rule is in [PLATFORM.md](PLATFORM.md). This file is everything that is
Kova's: what it does, how its screens map onto the interface language, where each
surface lives, and the one feature with a design of its own.

> **The interface language is [UI-LANGUAGE.md](UI-LANGUAGE.md).** Tokens,
> hierarchy, layout, motion, copy rules and the component grammar are defined
> there, product-agnostically, because they are what the shared UI package
> exposes. Part II below is Kova's *mapping* onto that language.
> **When the two disagree, UI-LANGUAGE.md wins.**

| | |
|---|---|
| **Part I** | [Product & technical spec](#part-i--product--technical-spec) — what Kova is and how it works |
| **Part II** | [Design mapping](#part-ii--design-mapping) — Kova's screens in the shared interface language |
| **Part III** | [Screen index](#part-iii--screen-index) — every surface → the file that draws it |
| **Part IV** | [Camera body-fat scan](#part-iv--camera-body-fat-scan) — the one feature with its own design doc |

---

## Part I — Product & technical spec

> **Kova** is a multi-tenant, multi-trainer platform for personal-training businesses:
> studios, gyms, and independent coaches ("tenants") manage their clients, run staff
> trainers with scoped client assignments, sell training packages through their own Stripe,
> and use an AI suite (Workers AI + Google Gemini) metered against tenant credits.
>
> Kova is the clean rebuild of ByShujaa (feature inventory: the ByShujaa inventory (in git history — `docs/BY-SHUJAA-FEATURES.md`, removed once Kova stopped tracking it)) on
> the Scena platform stack. Scena proved the platform patterns; ByShujaa proved the domain.
> Kova = Scena's architecture × ByShujaa's domain, both improved.
>
> Status: SPEC v1 — 2026-07-10. **Implementation: foundation → AI suite,
> commerce, content, reports, and media all built and tested (64 tests green);
> see CLAUDE.md "Status" and the git history for what's live vs. pending.**

---

### 1. Vision & Positioning

- **Who buys it:** the training business (tenant) — a solo PT, a coaching team, or a studio.
- **Who uses it:** tenant **owners** (run the business), **trainers** (coach an assigned
  roster), and **clients** (train, eat, log, check in — mobile-first PWA).
- **How money flows:**
  1. **Platform rail** — tenants pay Kova a plan subscription + buy AI credit packs.
  2. **Tenant rail** — tenants sell packages to *their* clients on their OWN provider, via
     the tenant's own Stripe account. **Kova takes no markup/application fee** on this rail.
  3. **AI rail** — AI usage by anyone inside a tenancy (trainer or client) consumes the
     **tenancy's credit balance**. Billing relationship is strictly Kova ↔ tenant.
- **What's different from ByShujaa:** true multi-tenancy, scoped trainer permissions,
  a real security model, platform plans + feature flags, an AI suite, email that actually
  sends, and a serverless edge stack with no Node server to babysit.

---

### 2. Tenancy Model & Personas

#### Tenant

A **Better Auth organization = one Kova tenant** (Scena pattern). All domain data lives
in D1 keyed by `tenant_id` with per-tenant indexes. One `TenantBillingDO` per tenant is
the authoritative credit balance. No per-tenant databases in v1 (D1 10 GB budget is ample;
revisit sharding only if a tenant's row counts demand it).

#### Personas (the ByShujaa "profiles" idea, re-grounded)

**Decision: memberships + roles, not Netflix profiles.** ByShujaa's Profiles collection
conflated identity, role, and body data. Kova splits them:

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

#### Staff roles & client scoping (the "assigned level of clients")

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

#### Platform admin

Separate axis from tenant RBAC (Scena pattern): `ADMIN_EMAILS` allowlist → `/api/admin/*`
lane — plan/model/config editing, tenant support tools, comps, impersonation with audit.

---

### 3. Architecture

#### Monorepo (pnpm workspaces + Turborepo, mirrors `~/scena`)

```
kova/
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

#### Cloudflare runtime (apps/api `wrangler.jsonc`)

- **Worker**: Hono + Zod. `run_worker_first: ["/api/*", "/health"]`, SPA fallback for
  the app. Route `kova.4dl.app` (custom_domain, single-level for Universal SSL) —
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

#### Frontend — one app, one design system, three roles

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
- **Owner**: + Business tab (packages, subscriptions, credits/AI usage, getting paid, staff).
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

### 4. Identity, Auth & Permissions

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
  point* is skinned: the studio's own subdomain (`<slug>.kova.4dl.app`) renders the OTP screen with the
  tenant's logo/accent/welcome copy (`branding` entitlement; neutral Kova styling
  below Studio). Invites and gym QRs always deep-link to the branded page, so clients
  effectively never see a generic screen. The neutral `/login` remains; after OTP,
  membership lookup routes anyone to the right tenant regardless of which door they
  used — branding is cosmetic, never functional. Per-tenant PWA manifest (branded
  install icon/name) is a parked enhancement. **Superseded for custom domains
  (§14.1, shipped):** a tenant on its own domain runs a per-domain auth origin
  (Model A) — the Host pins the tenant and passkeys enroll per domain. The
  single-origin story above still describes the root and every `<slug>.` subdomain
  under it, which is what a tenant without a custom domain uses.
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

### 5. Platform Plans, Entitlements & Feature Flags

Scena's `entitlements.ts` model verbatim: **quotas + feature gates + AI monthly grant**,
stored as `entitlements_json` per plan row (admin-editable at runtime), deep-merged over a
FREE baseline, per-tenant `overrides_json` for comps/gifts, `checkDowngrade()` compliance
gate on downgrades.

**Kova ships 4 paid plans, and it is a B2B product.** Tier names are generic on
purpose — "Studio" is business-side vocabulary for a tenant, never a plan name.
There is **no free tier**; the two 30-day trials replaced it.

Starter is deliberately a *trainer's first few clients*, not a self-coaching
plan. It carried one client until v3, which no real trainer has — and the
unsubscribed `free` row carried three, so not paying bought you more than the
cheapest tier did. A studio that never chooses a plan now sits read-only on that
row (gate reason `setup`) until it does; it is a parking state, not a product.
Its plan id is still `solo`, because Stripe metadata carries it.

The gate stands down where **Stripe is not configured** — a deployment that
cannot take a payment must not withhold the product over one. There, `free`'s
entitlements are what is actually served, which is why they are left usable
rather than zeroed.

| | **Starter** $4.99/mo | **Light** $24.99/mo | **Pro** $49.99/mo | **Max** $119.99/mo |
|---|---|---|---|---|
| Free trial | 30 days | 30 days | — | — |
| Coaches (`staffSeats`, incl. owner) | 1 | 1 | 5 | unlimited |
| Active clients | 3 | 30 | 100 | unlimited |
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
1. **Platform entitlements** — what the *tenant* bought from Kova (above).
2. **Package feature flags** — what a *client* bought from the tenant (§7). Client-side
   capability = `entitlements ∩ resolveClientFlags(subscription)`.

---

### 6. Credits & the AI Suite

#### Credit system (transplant Scena wholesale)

- `packages/platform/credits.ts` — pure math: **1 credit = $0.001**; neurons are the
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

#### Providers & models

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

#### AI feature catalog (the Kova AI Suite)

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

### 7. Tenant Commerce (the tenant's own payment rail + Access Economy)

#### Two rails, cleanly separated — and only ONE of them is Kova's Stripe

- **Platform rail** (Kova ↔ tenant): Scena's SDK-less `stripe.ts` — raw fetch + Web
  Crypto webhook verification; config in `app_config` (mode/keys, admin UI); catalog sync
  (plan products + recurring prices, pack products + one-time prices); checkout for plan
  changes and packs; webhooks drive activation, monthly grants, and the **dunning
  lifecycle** `active → past_due (7d grace) → suspended → data-wipe (30d)` via daily cron.
  Comped tenants exempt. Suspension gates the coaching surfaces, never the billing page.
- **Tenant rail** (tenant ↔ client): **the tenant's OWN provider. Kova is not in the
  money path at all.** Stripe Connect was removed in full — a Connect platform accepts
  liability for seller fraud and negative balances, may only onboard sellers its own
  platform country allows (the UAE is absent from Stripe's platform-country lists, so
  EEA coaches were unreachable), and forces one processor on a world that does not all
  use it.

  Kova instead: writes a `purchase_intents` row, sends the customer to a URL the studio
  owns (`packages.pay_link`), and learns the outcome from a **signed notification** at
  `/api/pay/webhook/:tenantId` **or** from the studio confirming by hand. Both settle
  through one path, so `manual` is the DEFAULT rather than a fallback: it needs no
  setup, works in every country immediately, and every automated provider degrades to
  it. `stripe_link` is the first adapter (the studio's own Payment Link + the webhook
  SIGNING SECRET — a credential that can verify a message and nothing else).

  **Not supported on this rail, deliberately**: instalment plans (nothing can count to N
  and cancel on a link we do not own), cancelling a client's recurring charge (the
  studio does it in their provider), tenant-scope promo codes (the discount belongs to
  whoever owns the checkout page).

#### Packages & the access economy (ByShujaa's best idea, kept intact)

Tenants build **Packages**: one-time price and/or installments (Stripe subscription with
fixed payment count), **feature budgets** (`workout | meal | all` + days), included
add-ons (e.g. consultation sessions), visibility (`private | marketplace |
client_specific`), once-per-customer, per-package client feature flags.

- **ClientSubscriptions** carry `budgets[]` with individual `expires_at` — **days are
  derived at read time; zero cron**. Lazy `reconcileSubscriptionStatus()` on read flips
  expired states (+ best-effort Stripe cancel).
- **Repeat purchases queue, never sum** (`computeBudgetStart` = current expiry).
- **$0 packages bypass Stripe** entirely.
- **Redemption codes** (day top-ups, feature-targeted, max-uses) are unaffected by the
  rail change — they grant DAYS rather than reduce a price, so they need no processor.
  Tenant-scope **promo codes** are retired; Kova's own platform-scope promos on plans
  and credit packs still work, on Kova's own Stripe.
- **Client flags resolved through one function** — `resolveClientFlags()`: package
  defaults → subscription overrides → budget-gating → **∩ tenant plan entitlements**.
  UI and API only ever consume the resolved shape.
- Tenant **marketplace page**: a public, tenant-branded package storefront
  (the studio's `<slug>.` subdomain or its custom domain) — doubles as client
  self-registration entry. **Not built** — see the NOT-built list in CLAUDE.md.

---

### 8. Domain Feature Catalog (redesigned ByShujaa)

Everything below is per-tenant. Libraries have three visibility levels: **platform seed**
(global read-only content Kova ships), **tenant** (shared inside the tenant), **private**
(the authoring trainer). That replaces ByShujaa's flat `isPublic`.

#### 8.1 Client management
Roster (owner: all; trainer: assigned), invite/activation flow, intake wizard (client
5-step / trainer 2-step, ByShujaa's exact field set: personal + starting point + training
context + nutrition prefs, age/height validation, timezone auto-detect), client detail
workspace (intake, goals, plans, check-ins, supplements, labs, sessions, reports, billing
status), archive/offboard (soft-delete + delete guards). Avatars per persona: DiceBear
generated (style per role, shuffle + reset, cached in R2) or custom upload — ByShujaa's
system, kept.

#### 8.2 Goals & targets
Trainer-set **goal phases** (active/superseded lifecycle): body goals, nutrition goals,
exercise goals. **TDEE calculator** (in `packages/domain`): Katch-McArdle when BF% known
else Mifflin-St Jeor; activity multipliers; goal adjustment (−20% / +15% / 0); macro
splits by dietary approach; water 35 ml/kg; fiber 14 g/1000 kcal; phase-target
projections; full `derivation` object so the UI explains every number. Published plans
snapshot the active goal.

#### 8.3 Workout system
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

#### 8.4 Nutrition system
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

#### 8.5 Body-fat estimation
Direct entry, tape (US Navy), or **camera** — ByShujaa's on-device MediaPipe pipeline
transplanted into `packages/domain` + client PWA: pose landmarker (guidance + rows) +
selfie segmenter (silhouette), per-photo px/cm calibration from known height (0.86
nose→ankle factor), narrowest-span widths, ellipse circumference `π(a+b)`, Navy formula,
ACE category bands, hands-free voice-guided capture, ±5–8% honesty copy, photos on-device
unless opted into progress photos. Results → measurements. Gated by `bfCamera`.

#### 8.6 Tracking & wellness
Check-ins (flag-composed fields; one per device-local day; 7-day backfill; progress
photos with per-photo consent; trainer feedback loop with notifications; tag-matched
dynamic done-messages), water/sleep/mood upserts, fasting timer with metabolic zones,
free-form activity logging (24 MET activities, HR-factor formula), workout burn
estimation from logged sets, wearable session-calorie override. Home rings: today = live
percentages, past days = binary logged flags.

#### 8.7 Progress & reports
Client progress page (flag-gated tabs; streaks with one-day grace; consistency %; calorie
adherence ±10%; wellness index; weight/BF/circumference charts; heatmap). Trainer
per-client report (compliance bars, tonnage trends, volume by muscle, Epley PR table)
**plus the roster-level trainer/owner dashboard ByShujaa never built**: at-risk clients
(no logs N days), expiring subscriptions, pending swaps/labs/check-ins queue. All math in
`packages/domain/progress.ts`, tz-aware everywhere.

#### 8.8 Supplements & labs (`supplementsLabs`, Studio+)
Prescribed supplement regimens (kind/dose/slots, lab linkage, status), tap-to-log slot
grid with read-time adherence, lab request → upload → review lifecycle with due dates and
R2 files behind authed proxy.

#### 8.9 Sessions & front desk (`frontDesk`, Studio+)
Add-on types (consultations), session scheduling against add-on balances
(complete/no-show consume; cancel refunds), assistant role surface. Calendar view; later:
client self-booking.

#### 8.10 Content system (the blog, upgraded), notifications, help
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

#### 8.11 Experience layer (adopted from the Google Health UI study — DESIGN.md §6)
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

### 9. Data Model (D1 sketch)

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

### 10. API Surface (shape, not exhaustive)

`/api/*` on the api worker, Hono + Zod, all through the route guard:

- `auth/*` (Better Auth), `me`, `context` (tenant + persona + entitlements + flags bundle)
- `clients`, `clients/:id/{goals,plans,checkins,reports,supplements,labs,sessions}`
- `plans`, `templates`, `exercises` (+`/search-external`), `foods` (+`/search-external`,
  `/barcode`), `logs/{workout,food,water,sleep,mood,fasting}`, `arrangements`, `swaps`
- `packages`, `marketplace/:slug`, `subscriptions`, `redeem`, `purchases`, `payments/settings`, `pay/webhook/:tenantId`, `connect/{onboard,checkout,
  webhook,portal}`
- `billing` (platform: plan/entitlements/balance/packs/ledger), `billing/{change-plan,
  pack-checkout}`, `stripe/webhook` (platform rail)
- `ai/{draft-plan,draft-meal,snap-meal,parse-food,summarize-checkins,narrative,chat,
  exercise-author,resource-writer}` — all reserve→settle
- `members` (staff CRUD, roles, grants), `settings`, `notifications`
- `admin/*` (platform: tenants, plans, models, config, comps)

---

### 11. Security & Privacy (explicit, because ByShujaa wasn't)

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

### 12. Testing, Observability, Ops

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

### 13. Build Phases

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

### 14. Open Questions (decide before the relevant phase)

1. ~~Single origin `kova.4dl.app` serves all roles; custom tenant domains
   need SaaS-for-domains; defer.~~ **Decided + shipped (Model A, white-label per
   domain):** tenants bring their own domain via **Cloudflare for SaaS** custom
   hostnames (owner self-serves in Settings; CNAME + DCV TXT; auto-provisioned
   cert). On a custom domain the **Host pins the tenant** (`host-context.ts`),
   auth is per-domain (each domain its own WebAuthn RP + cookie jar), and only
   members of that tenant get scope on it. The root stays the neutral host:
   a signpost, `setup.` for studio creation and `admin.` for the operator
   console — the five doors in `@4dl/tenancy`'s `hosts.ts`.
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


---

## Part II — Design mapping

> **The interface language lives in [UI-LANGUAGE.md](UI-LANGUAGE.md).** Tokens,
> hierarchy, layout, motion, copy rules and the component grammar are defined
> there, product-agnostically, because they are the extraction target for the
> shared UI package that Scena and Bocca will also consume.
>
> **This file is Kova's mapping onto that language**: which surface is the anchor
> on each screen, what the domain tones mean here, and how one app serves three
> roles. When the two disagree, UI-LANGUAGE.md wins.
>
> The bar: *premium, alive, and a 70-year-old can use it.*

### What is implemented today

`packages/ui` ships a working system that predates the language above:
oklch tokens (dark-first + light theme, tenant-themeable primary/radius/border),
a lucide icon registry with zero emoji, motion variants (`fadeUp`/`stagger`/
`popIn`, spring layout indicators), CVA primitives, radix+vaul overlays, the viz
set (`ProgressRing`, `TargetRing`, `MetricPill`, `StatCard`, `Sparkline`,
`MiniBars`, `WeekDots`) and shell components (`AppBar`, `BottomTabs`, `NavRail`,
`InsightCard`, `SettingsList`, `EmptyState`).

It is **not yet conformant** with UI-LANGUAGE.md. The known deltas, which are the
work list for the rewrite:

| Delta | Where |
|---|---|
| No `Atmosphere` — the brand gradient that carries identity does not exist | UI-LANGUAGE §3 |
| No canonical `Row` / `Group` — the most-repeated element in the product is re-implemented per screen | §2, §7 |
| No `Anchor` — screens have no single largest thing; hero treatments vary | §1 |
| No type scale — sizes are chosen per screen | §5 |
| Radius base (0.95rem) contradicts the documented card radius | §6 |
| `popIn` scales **up**; the language requires settling **down** | §8 |
| Entrance has no tier ordering — chrome animates with content | §8 |
| Desktop is "rail + max-w-3xl", not the three shapes | §11 |

**Closed so far:** tokens (type scale, radius ladder, motion, atmosphere
opacity), `lib/animation.ts`, the spine components, `Choice`, wizard chrome,
overlay keyframes and radii, shell chrome + scroll-away wash + content column +
compact billing banner. See UI-LANGUAGE §13 for the component registry.

**Screens on the spine:** the four doorways · sign-in · the three-step studio
wizard · client Today · client Eat · client Train · client Progress (per-lens) ·
client Wellness · client Shop · client WorkoutPlayer (day picker) · client
MealPlanDrawer · coach Today · coach Clients · coach Business · coach Staff ·
coach ClientManage.

**Every screen is done.** The builders were the last two, and as predicted they
are task surfaces (§1) with no anchor to find — what they needed was chrome:
the workout builder's day cards set their subtitle in `--tone-foreground`, the
ink for a tone-COLOURED surface, over a `from-black/75` scrim. On a
light-primary theme that is dark text at 70% opacity on black, so the set count
was invisible. Its twins in Train and the player both had it right.

**Resolved, and the resolutions are the useful part.** The ledger used to say
"anchor = count of each" for the list-shaped coach screens. That was wrong, and
working through them is what produced §1's no-anchor rule:

| Screen | Outcome |
|---|---|
| `client/WorkoutPlayer` | Day picker = browse surface → anchor (plan name as eyebrow, training days as the number). Session view = **task surface, no anchor**; progress stays in the sticky header where it remains visible. |
| `client/MealPlanDrawer` | The player's twin, same anchor shape: plan name, meals a day, daily targets beneath as context. |
| `coach/ClientManage` | Anchor = **days of access left** — the one number a coach acts on here — with "No access" in words when there is none. The 20-field preferences form moved behind a `Row` → `Sheet`; the tab went from 7,245px tall to 4,313px. |
| `coach/Staff` | Anchor = **seats used of the plan's ceiling**. Both halves were already in hand (roster + `ctx.entitlements.quotas`), so it costs no request — and it fixed a real gap: the ceiling used to be invisible until an invite bounced off it. |
| `coach/Library`, `coach/Packages` | **List surfaces — no anchor, deliberately.** A coach opening the exercise library came to find an exercise, not to learn there are 42. A display numeral there counts something nobody came to count. |
| `coach/Sessions` | **Reversed on review, and the reversal is the interesting part.** It was filed above as a list surface. Looked at with a front desk actually running, it is a *schedule*: the one question on arrival is what is booked, and the answer is a number. It now anchors on **Booked in**, sub-lined with how far out the next one is (relative — the card underneath carries the absolute time). What made the original call look right was the FIRST-RUN state, which genuinely has no anchor — so that state got the no-T1 treatment on its own, and §1 grew the rule that the exemption applies per *state*, not only per surface. |
| `Settings`, `AdminConsole` | Same, as always. |

**`client/Wellness` — resolved.** It looked like four subjects on one surface
(sleep + mood + water + fasting) and so like a §1 violation waiting for a product
decision. It isn't: those four are the *inputs*, and the **wellness score** is
the one noun they add up to — the tour has said exactly that since it was
written ("one number for how you're really doing"), it just wasn't the largest
thing on the screen. The score is now the anchor, `WellnessScoreCard` became
`WellnessPillars` (T3, and no longer restates the number), and the quick-log
chip row became the action cluster. A brand-new client scores `0`, which the
anchor renders as the band's words rather than a giant zero — see §5.

**The overlay family is now conformant.** Reading `overlays.tsx` against §5–§8
and §12 turned up four things the tokens alone could not fix:

- The `Sheet` hard-coded its own scrim string without the animation classes, so
  the dim snapped on and off while the sheet slid. One `overlayCls` now.
- `DropdownMenuItem` styled `hover:` only. Radix drives keyboard navigation
  through `data-[highlighted]`, so arrowing down a menu moved an invisible
  cursor and the menu looked frozen. (`Select` already had this right, which is
  how the inconsistency stayed invisible.)
- Three focusable controls — the dialog close, `TabsTrigger`, the segmented
  buttons — set `outline-none` with nothing in its place. One `FOCUS` constant.
- The segmented pill wrote its own spring inline; it now takes `SPRING`.

**The whole registry is `✅`.**

**Card-stack → `Group`/`Row` done on:** Clients · Staff · Packages (archived,
redemption codes, promo codes) · Sessions (add-on types) · Library (templates).
Remaining stacks are the ones whose items are genuinely browsable cards
(exercise/food tiles with media) rather than scannable rows — those stay cards
by design (§7 `Tile` vs `Row`).

Follow the order in UI-LANGUAGE.md §14: tokens → `Row`/`Group` → `Atmosphere`/
`Anchor` → motion → screen by screen.

### Desktop — one of §11's three shapes is real

Stated plainly, because the language describes three and the app has one.

**Focus (`md` 768) — shipped.** Nav rail, one centred column, sheets as bottom
drawers. This is what every screen renders at every width above 768.

**Two-pane (`lg` 1100) and Board (`xl` 1400) — NOT built.** No list pane, no
right column of secondary cards. Above ~1100 the app is a 720px column with
empty space either side. That is not a defect in the sense of something broken —
§11's first rule is that cards never stretch, so nothing is misshapen — but it is
not the promised desktop experience either, and it should not be described as
one.

What the desktop pass DID fix, both of them §11 violations by its own words:

- **The column had never actually been 640/720.** Every screen wrote
  `mx-auto max-w-xl` (576px) inside a `<main>` that capped at 640/720, so the
  inner cap always won and §2's column table applied nowhere. The app was 576px
  wide on a 1512px display, which is most of why desktop read as a phone in a
  window. There is now one `.column` utility (tokens.css) and 27 files use it,
  so the column is one thing that can be tuned in one place.
- **The billing banner stretched to the full viewport** while every card below it
  stopped at the column — label hard left, button ~900px away hard right. That is
  §11's "a row stretched to 1400px with a value floating in the void", verbatim.
  The paused-studio strip stays full-bleed (it describes the whole surface) but
  its text now sits in the column: a single line across a desktop window is a
  ~180-character measure and §5 caps prose at ~68.

---

### Six enforcement layers

The language is only worth what a screen cannot quietly opt out of. Six things
are now checked rather than agreed:

| Guard | Lives in | Catches |
|---|---|---|
| Contrast | `packages/ui/test/contrast.test.ts` | any token pair below WCAG AA, in both themes, with the oklch→sRGB maths pinned against known ratios |
| Radius · elevation · hairlines | `apps/app/src/design-tokens.conformance.test.ts` | a hard-coded visual value that cannot follow a tenant's brand |
| Type scale | `apps/app/src/type-scale.conformance.test.ts` | a hand-rolled spelling of a role the scale already names |
| Empty values | `apps/app/src/no-data.conformance.test.ts` | a dash reaching a value slot, where at numeral sizes it reads as a horizontal rule (§5) |
| Motion | `apps/app/src/motion.conformance.test.ts` | a spring or a raw duration written at a call site instead of taken from `lib/animation.ts` (§8) |
| Visible focus | `apps/app/src/focus.conformance.test.ts` | a form control that sets `outline-none` and replaces it with nothing (§12) |
| Primitive adoption | `apps/app/src/primitive-adoption.conformance.test.ts` | a screen hand-assembling a composition a component already owns — the anchor's `numeral text-display` slot outside `packages/ui` |

All six scan `packages/ui` as well as the app — the design system is where a
bypass does the most damage, and each of these found real violations there.
Each has an escape hatch that requires a written reason.

---

### What only shows up in a populated account

Every layer above is static. The defects that survived them all needed **data on
the screen** — and, at the end, a studio on a bigger plan than the free baseline,
because Sessions and Packages are entitlement-gated and the roster caps at three.
`apps/e2e/src/populate.ts` exists for that: it seeds a deliberately *uneven*
fortnight (missed days, drifting weight, long names) and `grantEntitlements()`
raises the plan through the real admin route. `E2E_DEV_ADMIN=1` blanks
`ADMIN_EMAILS` for that one run — opt-in per command, never in config, because
the three golden paths must run against the authorization the product ships.

What that found, in rough order of how much it mattered:

- **The stress scale recorded the opposite of the answer.** Mood, Energy and
  Stress all rendered the same ascending five faces, Angry → Laugh. The domain
  scores stress with 5 as the *worst* (`wellness.ts`: `6 - avgStress`). A client
  having a calm day tapped the grinning face on the right, and the app stored
  maximum stress, pushed their wellness score down, and showed the coach the
  reverse of the truth. Nothing on the widget could have told them: five faces,
  no endpoint captions, no words. Now the glyphs run calm→stressed for that
  scale, every scale names both ends and echoes the chosen step in words, and
  the read-back surfaces invert their bar and tone to match. Words in one
  registry — `screens/client/scales.ts` — because three screens render them.
- **A roster of ten put the one client who needed attention last**, because the
  list came back in creation order while the anchor above said "1 needs a look".
  Ordering is now attention → active → never-signed-in, with search above seven
  rows, and the anchor's sub-line admits how much of the count is invitations.
- **Sessions was upside down on first run** — see the ledger above.
- **Business said "No subscription" three times** on one screen (the Shell strip,
  a red card, and a plan row directly under it), told an owner whose plan
  *excludes* the AI suite to "top up" credits they could not spend, and printed
  a half-list of locked features ending in "and 1 more" a few hundred pixels
  above the card that lists all of them.
- **Icons that repeated instead of distinguishing**, and copy carrying the
  billing model's vocabulary ("add-on unit", "add-on balance") into a scheduling
  tool. §7 and §10 now name both.

None of these are visible in a diff, and only the first is visible in a test.
The method is the finding: **build the account, then look at it.**

---

### Kova's domain tones

The language ships the tone **mechanism** (a foreground tone + a `-soft`
container, theme-aware, AA-validated). Kova ships the list:

| Tone | Meaning |
|---|---|
| `activity` | training, workouts, load |
| `nutrition` | food, meals, macros |
| `sleep` | sleep and recovery |
| `cardio` | heart, conditioning |
| `hydration` | water |
| `supplement` | supplements |
| `lab` | body tests / lab work |
| `calories` `protein` `carbs` `fat` | the macro set, used only in nutrition viz |

Status (`success` / `warning` / `danger`) is the language's, not Kova's, and is
always paired with a word (In range · Off track · Out of range).

---

### 3. Mapping Part I's content onto this UI (client persona)

Bottom tabs: **Today · Train · Eat · Progress** (avatar → profile/settings).

#### Today (SPEC §8.6, §8.7, §6)
- **HeroCarousel page 1 — "today"**: ring = **calories** (net consumed vs target);
  pills: Protein (nutrition), Water (hydration, progress-filled), Workout (activity,
  progress-filled from logged/prescribed sets).
- **Page 2 — "this week"**: TargetRing = **weekly Training Load vs trainer-set target**
  (new feature, §6 of this doc); pills: Exercise days "3 of 5" (goal-aware two-tone),
  Active minutes, Check-in streak.
- **ActionRow**: `+ Log` → LogSheet (chip grid: Food · Barcode · Snap-a-Meal ✦ ·
  Voice ✦ · Water · Weight · Body fat · Activity · Sleep · Mood · Fasting · Check-in —
  chips filtered by client feature flags); `▶ Start` → today's recommended workout day;
  pencil → customize hero (§6).
- **Supplements strip** (when prescribed): a horizontal tap-to-log slot row (Morning ·
  Pre-workout · Evening…) — each slot a MetricPill that fills when tapped; adherence
  WeekDots underneath. Lives between hero and feed.
- **TimelineFeed**: check-in reminders, "Workout logged" with PR sub-card, ✦ AI insights
  (Check-in Summarizer output, Snap-a-Meal results), **trainer feedback messages**,
  supplement/lab reminders ("Blood panel due Friday"), subscription nudges ("meal budget
  expires in 3 days"), and **Explore content cards** (assigned articles/recipes from the
  tenant content hub). 👍/👎 on every ✦ card feeds the AI feedback loop. WavyDivider
  between days = the diary day strip, reimagined.

#### Train (SPEC §8.3)
- Quick-start chips: today's plan day · Freestyle workout · Log activity.
- **Workout library grid** (LibraryCards): My Plan, Saved, then platform categories
  (Strength / Cardio / Mobility & recovery / Stretching / Yoga) — illustrations from
  `packages/brand`.
- Recent activities: WeekDots + rows (icon · name · time • duration • kcal · right-side
  **Load** number) + `+ Log activity` tonal button.
- Key metrics: StatCards — Training load (dotted target), Tonnage, e1RM PRs, Active
  minutes.
- Workout player keeps ByShujaa's flow re-skinned: day hero → blocks → set drawers
  (bottom sheets), rest timer as a floating pill, PR toast + haptic.
- **Add-activity form** = the Form pattern verbatim: Activity field with search,
  **Probable-activities SuggestionChips** (recency-ranked, §6), date/start/duration,
  Optional information (Energy burned helper: "If left empty, calculated from MET ×
  your weight"), pinned Save.

#### Eat (SPEC §8.4)
- Hero: **calorie ring segmented by macros** (donut = ring with segment stops) + pills
  Protein/Carbs/Fat; page 2: calorie-adherence week + grocery-list shortcut.
- Meal sections (bank-of-options one-tap logging), quick actions: Barcode · ✦ Snap ·
  ✦ Voice · Search · Quick entry. Barcode miss offers **✦ Label Reader** (photograph the
  nutrition panel). Free-meal cap shown as a warn chip.
- ✦ **Meal Swap** ("what fits my remaining macros?") and **Menu Scout** (restaurant menu
  photo) as secondary actions; **Recipe Builder** reachable from the grocery list.
- Meal detail per entry = StatCard grammar; plan drawer + weekly arrangement keep their
  drawers, restyled as Sheets.

#### Progress (SPEC §8.5, §8.7)
- **Goal status card** (Health-status pattern): "3 of 5 targets on track" + chips per
  target (In range / Off track) — driven by trainer-set goal ranges (§6).
- **Key metrics grid** (2-col StatCards, "Customise" link): Weight (dotted target line),
  Body fat % (ACE zone chip), Measurements, Sleep avg, Wellness index, Adherence %.
- Metric detail = Detail grammar: duo cards (current + goal), big chart (ZoneChart for
  weight-in-range, Hypnogram pattern for sleep stages if wearable data ever lands,
  fasting zones today), `History` outline button → full log list.
- **Body tests (labs)** section: request cards with status chips (Requested / Uploaded /
  Reviewed) and due dates; detail = upload flow + ✦ Lab Extract value table with
  out-of-range rows flagged (bad-container chip) — extraction only, trainer reviews.
- **Supplements** overview: current regimen cards (kind icon + dose + schedule) with
  adherence WeekDots; tap-to-log lives on Today (§ above).
- Check-in flow keeps its form; progress photos gallery; body-fat camera entry lives
  here + in LogSheet.

#### Cross-cutting
- **Explore (content hub / blog)**: LibraryCard rail on Today + full grid ("See all") —
  articles, recipes, routines from the tenant's content hub (SPEC §8.10); article page =
  clean markdown reading view. Public-audience posts render on the tenant marketplace
  page as the SEO blog. Trainers author via Library → Resources (✦ Resource Writer).
- Settings = SettingsList pattern (Account / Preferences (units, theme) / Notifications /
  Subscription).
- Marketplace/paywall surfaces reuse Card + Button tonal styles; PaymentBlocker is a
  full-screen Card with one action.
- All 8 ByShujaa theme variants collapse to **theme accent swapping on the same tonal
  ladder** — tenant branding (Studio+ plan) recolors `--color-primary` + domain accents.

---

### 4. Desktop

See UI-LANGUAGE.md §11 for the three shapes (Focus / Two-pane / Board) and the
rules that make them work. Kova's mapping:

- **Focus** — the client persona. One column; the same screens as mobile.
- **Two-pane** — the coach personas. List pane = roster or library; detail pane
  is *literally the client screen* (§5 below is what makes that possible).
- **Board** — owner + platform admin. Detail column plus a right column of
  secondary cards (credits, at-risk counts, recent activity).

---

### 5. One UI, three roles (the decision)

**One app, one design system, one page grammar — three nav configs.** We do not build a
separate client app, trainer dashboard, and admin panel. `apps/app` is a single
role-adaptive PWA:

| Role | Bottom tabs / rail | What each surface is |
|---|---|---|
| **Client** | Today · Train · Eat · Progress | as §3 |
| **Trainer** | Today · Clients · Library · (Business*) | **Today = triage inbox**: same TimelineFeed pattern, but events are "Sara checked in" (with ✦ AI summary sub-card + quick-reply), "2 swap requests", "lab uploaded — review", ✦ Retention Radar cards ("Omar at risk: no logs 6 days — suggest a check-in nudge"), "Ali's meal budget expires Friday". Hero = roster rings (clients on-track ring + pills: pending check-ins, swaps, expiring subs). **Clients** = roster list (search + WeekDots per row) → client detail. **Library** = LibraryCard grid: Exercises, Foods, Workout templates, Meal templates, Content hub (blog/articles/recipes). |
| **Owner** | + **Business** tab | Packages & marketplace, client subscriptions, the studio's own payment setup, **AI credits** (balance ring + usage-by-feature StatCards + ledger feed), staff & roles, tenant settings/branding. Same StatCard/feed grammar — a credits balance is just another big number with a sparkline. |
| **Platform admin** | hidden section (`ADMIN_EMAILS`) | Tenants, plans, AI models, app config — SettingsList + StatCards again. |

**The keystone: the trainer's client-detail page IS the client app.** Opening a client
renders the same Today/Train/Eat/Progress surfaces scoped to that client, wrapped in
coach chrome (client switcher app-bar, edit powers, feedback composer, plan
publish actions). One implementation of every surface, two consumers:

- Client sees *their own* data with logging powers.
- Trainer sees *the client's* data with coaching powers (edit/prescribe/feedback),
  gated by `requireClientAccess` + resolved flags.

Role differences are **scope + powers + nav**, never new screens. Coach/Train mode
switching (SPEC §2) is just swapping which nav config renders — the trainer's own
Train-mode is literally the client persona pointed at their linked client record.

Monorepo consequence (SPEC §3 updated): `apps/dashboard` + `apps/client` merge into
**`apps/app`** — one Vite + React 19 PWA, served by the api worker's assets binding at
one origin, offline write-queue included. `apps/www` unchanged.

---

### 6. New features this UI adds to Part I

Adopted into SPEC §8.11 (summary here, spec is canonical):

1. **Insight timeline feed with 👍/👎** — Today is a feed of events + AI insights;
   feedback is stored per insight (`insight_feedback`) and becomes the eval/tuning
   signal for AI features (and a mute switch per insight type).
2. **Training Load & weekly target** — a load score per session (from tonnage,
   RPE/effort, MET minutes), summed weekly against a trainer-set target; TargetRing on
   Today page 2, dotted target lines on Train metrics. (Our honest, wearable-free
   answer to "Cardio load".)
3. **Trainer-set metric ranges → status chips** — goals get healthy ranges (weight
   band, water floor, sleep window…) so every metric can say In range / Off track;
   powers the Progress "goal status" card ("3 of 5 on track") and red/green chips.
4. **Customizable dashboards** — pencil-edit the hero (pick ring metric + pills) and
   "Customise" the Progress key-metrics grid; stored per persona
   (`dashboard_prefs` JSON); trainer can push a recommended layout to a client.
5. **Probable-activity suggestions** — recency+habit-ranked chips on the activity form
   (pure heuristic v1, AI later).
6. **Scores** — composite **Recovery/Wellness score** (sleep + mood + energy − stress,
   already spec'd as wellness index) surfaced as ScoreBadge with qualitative chip;
   sleep score placeholder for future wearable data.
7. **Illustrated workout library categories** — platform seed content organized as
   browsable categories (Strength/Cardio/Mobility/Yoga/Stretching) + Saved; feeds
   freestyle workouts for clients whose package has no plan (upsell surface).
8. **History-everywhere** — every metric detail ends in a History button → uniform
   paginated log list with edit/delete.
9. *(Backlog, not v1)* **Wearable import via Health Connect** — the hypnogram/zone
   patterns and sleep score are designed so device data can slot in later without a
   redesign; noted in SPEC §14.


---

## Part III — Screen index

**Why this exists.** Kova's UI is being reviewed screen by screen with a real
client. Feedback arrives as *"the X screen — change Y"*, so this maps every
surface a person can reach to the file that draws it. Keep it current: if you
add, move, or delete a screen, edit this file in the same commit.

Three things make the map non-obvious, and they're why a grep for the screen
name often fails:

1. **One app, four personas.** `Shell.tsx` swaps nav and screens by
   persona + mode. `/today` is two different files depending on who you are.
2. **Most surfaces aren't routes.** The sheets, drawers, and editors in §E are
   where the real work happens, and they live *inside* their parent screen's
   file, not in one of their own.
3. **Settings are index → detail, keyed by a search param**, not by a route
   (§G). `/settings?s=messaging&m=templates` is three levels deep in one file.

Persona shorthand: **C** client · **T** trainer · **O** owner · **A** platform admin.

---

### A. Before the Shell — chosen by host, in `main.tsx`

The door decides the screen before any router runs. See CLAUDE.md, "The host IS
the tenancy".

| Trigger | Who | File | What it is |
| --- | --- | --- | --- |
| session resolving | all | `main.tsx:35` `BootSplash` | Branded boot splash |
| platform maintenance = `full` | all | `screens/Maintenance.tsx:42` | Deployment closed; outranks every door but `admin.` |
| host = root | anon | `screens/Doors.tsx:74` `RootSignpost` | Signpost to setup / admin / a studio |
| host = tenant, no such tenant | anon | `screens/Doors.tsx:172` `NoStudio` | "No studio at this address" |
| host = invalid | anon | `screens/Doors.tsx:207` `WrongDoor` | Unrecognised hostname |
| no session | all | `screens/Login.tsx:48` | OTP + passkey sign-in, tenant-branded |
| host = admin, signed in | A | `screens/AdminDoor.tsx:25` | Operator console door |
| `/studio/setup` | O | `screens/Start.tsx:18` → `onboarding/StudioOnboarding.tsx:88` | 3-step studio creation |
| `/studio/sign-in` | O | `screens/Login.tsx:48` | Owner sign-in on the setup door |
| `/accept-invitation/:id` | T O | `main.tsx:134` → `screens/AcceptInvite.tsx:25` | Staff invite + OTP (pre-session) |
| client not onboarded | C | `Shell.tsx:82` → `client/Onboarding.tsx:13` | 5-step intake wizard |
| `lockedToStorefront` | C | `Shell.tsx:107` → `client/Shop.tsx:30` | Must buy access before entering |

### B. Full-screen routes (no tab chrome)

| Path | Who | File | What it is |
| --- | --- | --- | --- |
| `/settings` | O | `screens/Settings.tsx:85` (`view="studio"`) | Studio settings index → §G2 |
| `/profile` | C T O | `screens/Settings.tsx:85` (`view="profile"`) | Personal settings index → §G1 |
| `/preferences` | C T O | `screens/Settings.tsx:85` | Deep link → training & nutrition |
| `/appearance` | C T O | `screens/Settings.tsx:85` | Legacy alias → preferences |
| `/notification-settings` | C T O | `screens/Settings.tsx:85` | Deep link → notification channels |
| `/passkeys` | C T O | `screens/Settings.tsx:85` | Deep link → security |
| `/inbox` | C T O | `screens/Inbox.tsx:25` | Notification inbox |
| `/media` | C T O | `screens/MediaLibrary.tsx:62` | Uploaded media browser |
| `/shop` | C (+staff in Train mode) | `client/Shop.tsx:30` | Storefront: packages, plans, access |
| `/explore` | C (+staff in Train mode) | `client/Explore.tsx:20` | Coach-published articles |
| `/accept-invitation/:id` | T O | `screens/AcceptInvite.tsx:25` | Staff invite, in-session |
| `/clients/:id/plans/:kind/:planId` | T O | `coach/WorkoutBuilder.tsx:266` · `coach/MealBuilder.tsx:32` | Plan builders |

Routes declared in `Shell.tsx:123-142`.

### C. Tabbed routes (`TabLayout`, `Shell.tsx:170`)

| Path | Who | File | What it is |
| --- | --- | --- | --- |
| `/` | all | `Shell.tsx:146` | Redirect → `/today` |
| `/today` | C | `client/Today.tsx:116` | Widgets, agenda, coach note |
| `/today` | T O (coach mode) | `coach/CoachToday.tsx:41` | Attention feed + widgets |
| `/train` | C (+staff) | `client/Train.tsx:35` | Plan overview + activity logging |
| `/train/session`, `/train/session/:day` | C | `client/WorkoutPlayer.tsx:31` | The player |
| `/eat` | C | `client/Eat.tsx:39` | Diary, macros, meal plan |
| `/progress` | C | `client/Progress.tsx:50` | Charts, 4 lenses via `?tab=` |
| `/wellness` | C | `client/Wellness.tsx:75` | Score, check-ins, labs, supplements |
| `/clients` | T O | `coach/Clients.tsx:26` | Roster + invite |
| `/clients/:id`, `/clients/:id/:subtab` | T O | `coach/Clients.tsx:380` | Client detail → §D |
| `/library`, `/library/:tab` | T O | `coach/Library.tsx:44` | Exercises, foods, templates, content |
| `/sessions` | T O (feature `frontDesk`) | `coach/Sessions.tsx:38` | Scheduling + add-on types |
| `/business` | O (tab); T by deep link | `coach/Business.tsx:80` | Revenue, packages, getting paid, staff |
| `/business` → Getting paid | O (write), T (read) | `coach/PaymentSetup.tsx:96` | Choose provider; guided setup for the studio's OWN checkout |
| `/business` → Getting paid | O, T | `coach/PendingPayments.tsx:47` | Purchases waiting on money; "mark as paid" confirms into access |
| `*` | all | `Shell.tsx:161` | Redirect → `/today` |

### D. Sub-tabs

**Client detail** — the same client surfaces, scoped to one client. Role changes
scope and powers, never screens.

| Subtab | File |
| --- | --- |
| `today` | `client/Today.tsx:116` |
| `plans` | `coach/CoachPlans.tsx:61` |
| `goals` | `coach/GoalManager.tsx:129` |
| `progress` | `client/Progress.tsx:51` |
| `report` | `coach/ClientReport.tsx:37` |
| `manage` | `coach/ClientManage.tsx:48` — prefs, supplements, labs, archive/delete |

**Business** (in-component state, not routes): Overview `coach/Business.tsx:96` ·
Packages `coach/Packages.tsx:44` (feature `commerce`) · Staff `coach/Staff.tsx:22`.

**Library**: four tabs at `coach/Library.tsx:57-60` — four `Collection`s of the
same shape (`Exercises:68` · `Foods:308` · `Templates:441` · `Content:555`).
**Progress lenses**: `?tab=overview|body|training|wellness`, `client/Progress.tsx:484`.

### E. Sheets, drawers, editors — where most of the work happens

None of these are routes. They live inside their parent's file.

#### Client

| File:line | What it is |
| --- | --- |
| `client/LogSheet.tsx:99` | The universal logger — weight, food, activity, mood |
| `client/LogDetail.tsx:103` | One log entry, in detail |
| `client/FoodSearchSheet.tsx:86` | Food search, scan, AI describe, log |
| `client/FoodEditor.tsx:66` | Create/edit a food, with AI assist |
| `client/BarcodeScanner.tsx:11` | Camera barcode scan |
| `client/MealPlanDrawer.tsx:42` | Meal plan options, recipes, logging |
| `client/MealPlanDrawer.tsx:494` | One meal option + recipe |
| `client/Eat.tsx:458` | Edit a logged entry |
| `client/Train.tsx:422` | Exercise info from Train |
| `client/WorkoutPlayer.tsx:523` | Preview a day before starting |
| `client/WorkoutPlayer.tsx:549` | Exercise detail, in-player |
| `client/WorkoutPlayer.tsx:633` | Log one set |
| `client/WorkoutPlayer.tsx:754` | Log a circuit round |
| `client/WorkoutPlayer.tsx:857` | Swap an exercise mid-session |
| `client/bodyscan/BodyScanLauncher.tsx:44` | Entry point + consent |
| `client/bodyscan/BodyScanFlow.tsx:57` | Camera capture flow |
| `client/bodyscan/BodyScanHistory.tsx:42` | Past scans, 3D compare |
| `client/BodyScanCard.tsx:46` | Scan summary on Progress |
| `client/WellnessDetails.tsx:108` | Check-in + photos |
| `client/WellnessDetails.tsx:168` | Lab markers |
| `client/SupplementGuide.tsx:18` | Prescribed supplements |
| `client/CoachNote.tsx:20` | The AI/coach insight line |
| `client/LaneSwitcher.tsx:23` | Switch plan lanes (per surface — workout and meal are separate) |
| `screens/widget-kit.tsx:113` | Reorder/toggle home widgets |

#### Coach / owner

| File:line | What it is |
| --- | --- |
| `coach/Clients.tsx:310` | Invite a client, share link |
| `coach/Library.tsx:193` · `coach/ExerciseEditor.tsx:338` | Bind exercise alternatives |
| `coach/Library.tsx:252` | Archive an exercise or food (with its usage count) |
| `coach/Library.tsx:618` | Write/publish an Explore article |
| `coach/Library.tsx:723` | One article's lifecycle actions |
| `coach/ExerciseEditor.tsx:95` | Create/edit exercise, AI media |
| `coach/WorkoutBuilder.tsx:619` | Copy a week with progression |
| `coach/WorkoutBuilder.tsx:692` | Pick an exercise into a slot |
| `coach/WorkoutBuilder.tsx:745` · `coach/MealBuilder.tsx:579` | AI-draft a plan |
| `coach/WorkoutBuilder.tsx:765` · `coach/MealBuilder.tsx:542` | Start from a template |
| `coach/WorkoutBuilder.tsx:802` | Save plan as a template |
| `coach/ClientPrefsStrip.tsx:17` | Client prefs summary — plan builders + the goal composer |
| `coach/CoachPlans.tsx:226` | Pick / rename / archive a client's plan lanes |
| `coach/CoachPlans.tsx:337` | One plan's lifecycle actions |
| `coach/GoalManager.tsx:476` | A past goal phase, in full |
| `coach/GoalManager.tsx:498` | Set a new goal phase (the composer) |
| `coach/ClientManage.tsx:738` | Restore / archive / delete a client |
| `coach/ClientManage.tsx:973` · `:998` | Prescribe a supplement · AI suggestions |
| `coach/ClientManage.tsx:1052` · `:1077` | Request a lab · review results |
| `coach/ClientManage.tsx:1145` | Generate a client report |
| `coach/Sessions.tsx:256` · `:296` | Schedule a session · add-on type (O) |
| `coach/Packages.tsx:279` · `:463` · `:511` | Package · promo · code (O) |
| `coach/Staff.tsx:169` | Staff permissions (O) |
| `coach/Business.tsx:574` | Downgrade blockers checklist (O) |
| `Settings.tsx:1728` | Branding / theme token editor (O) |
| `Settings.tsx:407` | Close-studio OTP confirmation (O) |
| `PreferencesEditor.tsx:23` | Shared training/nutrition prefs form |

#### Platform admin

| File:line | What it is |
| --- | --- |
| `admin/AdminConsole.tsx:301` | Studio detail — plan, credits, standing |
| `admin/AdminConsole.tsx:677` | Edit a plan's entitlements |
| `admin/AdminConsole.tsx:733` | Gift credits |
| `admin/AdminConsole.tsx:1261` | Default AI model per task |
| `admin/AdminConsole.tsx:2675` | Platform-wide promo code |

### F. Dead code

| File | Status |
| --- | --- |
| `client/PlanHistorySheet.tsx` | **Unreachable** — zero importers repo-wide. Delete it or wire it up; don't review it. |

### G. Settings — index → detail

The pattern is in `packages/ui/src/settings.tsx` (`SettingsIndex`, `SettingsPage`,
`SectionDetail`) with the router glue in `screens/SectionSplit.tsx`. Levels nest by
*distinct search params* (`?s=` then `?g=`/`?m=`/`?a=`) so Back steps out one level
at a time rather than closing the whole thing (`SectionSplit.tsx:39-53`).

Two rules from UI-LANGUAGE.md that this family exists to enforce:
- **Index row sub-line = what's inside. Section-page row sub-line = the current value.**
- **Binaries get an inline switch; anything more gets a page.**

#### G1. Personal — `?s=`, `PersonalSettings` at `Settings.tsx:181`

| `?s=` | File:line |
| --- | --- |
| *(none)* | Index — `Settings.tsx:245` |
| `profile` | `Settings.tsx:1161` (client-linked users only) |
| `preferences` | `Settings.tsx:1257` + muted insights `:693` |
| `notifications` | `Settings.tsx:736` |
| `units` | `Settings.tsx:1275` |
| `security` | `Settings.tsx:628` |
| *(always under index)* | Delete account — `Settings.tsx:1096` |

Route aliases (`Settings.tsx:103-108`): `/profile`→index · `/preferences`→`preferences` ·
`/notification-settings`→`notifications` · `/passkeys`→`security`.

#### G2. Studio — `?s=`, `StudioSettings` at `Settings.tsx:275`

Section keys come from `packages/domain/src/settings.ts:33`, which also carries
each section's gate — so a section can't drift from what the tenant bought.

| `?s=` | File:line | Nested |
| --- | --- | --- |
| `brand` | `Settings.tsx:1728` (feature `branding`) | `marks` `colour` `shape` `sections` `advanced` — `:2030-2038`. One shared save: the sub-pages share form state. |
| `signin` | `Settings.tsx:453` | `?g=` — `link` `:493` · `screen` `:528` · `domain` `:1437` |
| `ai` | `AiSettings.tsx:132` | `?a=` — `voice` `models` `actions` (`:274`) |
| `messaging` | `Settings.tsx:927` | `?m=` — `delivery` `:972` · `policy` `:870` · `templates` `:781` |
| `marketplace` | `Settings.tsx:1309` | — |
| `integrations` | `Settings.tsx:1605` | — (entitlement is `reserved` — nothing behind it) |
| `danger` | `Settings.tsx:365` | — |

`signin` / `ai` / `messaging` pass **no shared footer** — their sub-pages save
independently. Only `brand` has one save, because only there do the sub-pages
share state.

#### G3. Admin console — `ADMIN_SECTIONS`, `admin/AdminConsole.tsx:52-74`

Reachable at the `admin.` door and nowhere else. Two sections are **not** in this
file: their panels belong to the shared package that owns the configuration, and
only the row registering them lives here.

| `?s=` | File:line | Nested |
| --- | --- | --- |
| `tenants` | `:159` | opens `:301`, `:733` |
| `plans` | `:571` | `:651`, `:677` |
| `ai` | `:886` | `?a=` — `provider` `pricing` `selftest` `:1467`; also `:1218`, `:1361` |
| `stripe` | `:2187` | — |
| `promos` | `:2546` | `:2641`, `:2675` |
| `domains` | `:1663` | — |
| `content` | `:1976` | — |
| `email` | `packages/admin/src/sections/email.tsx:60` | — |
| `maintenance` | `packages/admin/src/sections/maintenance.tsx:57` | — |
| `security` | `:1826` | `:2032` nuclear reset |

---

### Known gaps to name before treating feedback as a bug

- **Desktop is untouched.** Everything is phone-width by design so far.
- **The exercise library grid is nearly empty** — the platform seed ships zero
  thumbnails and two categories.
- **The vision suite is dead without config** — Snap-a-Meal and Label Reader
  need `google.gemini_key` in D1.
- **Not built at all:** chat, wearable import, data export / tenant API,
  marketplace storefront, blog renderer, and six catalogued AI features. See
  CLAUDE.md "NOT built" before promising any of them.


---

## Part IV — Camera body-fat scan

A privacy-first, fully in-house camera estimate of body-fat %. No third-party
SDK, no licensing, no "go get a DEXA." The user may be undressed, so **the raw
frame never leaves their device** — all image work is on-device; only derived
numbers (and, on consent, a de-identified outline) are stored.

### What it honestly is

A 2D silhouette can't beat **~±3–4% vs DEXA** — the information (visceral fat,
muscle density, hydration) isn't in an outline. So the product promise is:

- **The trend is the hero.** Standardized auto-capture makes test-retest error
  small (~1–2%), so *change over time* is trustworthy.
- **The absolute is a solid estimate** with a **confidence band**, never a false
  decimal. We market a fitness estimate, not a medical measurement.

No per-user calibration is required. (An optional manual anchor — if the user
already has a DEXA/caliper number — can be added later to remove absolute bias.)

### The estimator (`packages/domain/bodyfat.ts`, pure + unit-tested)

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

### On-device pipeline (browser, open-source models)

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

### Privacy model

- The camera frame is processed **only in the browser** and never uploaded.
- Gemini is used **only** to voice the text cues — it never receives an image.
- On submit, the app sends **circumferences** (+ `weightKg`, `date`) and, **only
  if the user consents**, a **de-identified contour** (normalized outline points,
  no pixels). Contours store as `body_scans.contour_*_json`; a stylized
  silhouette can be redrawn from them for the progress morph.
- Any stored asset is per-client-scoped and deletable.

### Server (`apps/api/src/body-scan-routes.ts`)

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

### Gating

`bfCamera` platform entitlement (tenant bought from Kova) ∩ the per-package
`canUseBodyScan` client flag (`requiresFeature: "bfCamera"`, enforced by the
`resolveClientFlags` intersection). Starter has no `bfCamera`; Light/Pro/Max
do.

### Data model

- `body_scans(id, tenant_id, client_id, date_local, body_fat_percent, low, high,
  confidence, neck_cm, waist_cm, hips_cm, chest_cm, weight_kg, height_cm,
  methods_json, contour_front_json, contour_side_json, created_at)` — UNIQUE
  `(client_id, date_local)`.
- `tts_cues(tenant_id, voice, lang, phrase_id, version, media_key, created_at)` —
  the cue-audio cache.

### Not built yet / future

- Optional one-time manual DEXA/caliper anchor to remove absolute bias.
- A slow-360° **visual-hull volume** mode (photographic Bod Pod) — the in-browser
  accuracy upgrade lever, heavier but still private.
- Real-device QA of the capture pipeline (alignment thresholds, low-end perf) is
  required before enabling for clients.
