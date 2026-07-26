# CLAUDE.md

Guidance for Claude Code working in this repository.

## Project

**Mossa** — a multi-tenant, multi-trainer platform for personal-training
businesses. Product + technical spec in [SPEC.md](SPEC.md); UI design system in
[DESIGN.md](DESIGN.md); the ByShujaa feature inventory Mossa is modeled on is in
[docs/BY-SHUJAA-FEATURES.md](docs/BY-SHUJAA-FEATURES.md).

## Stack

Cloudflare Workers + Hono + Durable Objects + D1 + KV + R2 + Workers AI ·
Better Auth (**100% passwordless: email OTP + passkeys**) · Vite + React 19 PWA
(**one app for all roles**) · shadcn-style UI + Tailwind v4 · Stripe (platform
rail + Connect tenant rail). Package manager: **pnpm** (Node ≥22).

## Layout

```
apps/
  api/   # THE worker — Hono router + TenantBillingDO; serves the app SPA
  app/   # ONE role-adaptive PWA (client / trainer / owner / platform admin)
  www/   # marketing site (dependency-free static generator)
packages/
  domain/    # pure logic (no I/O): credits, entitlements, perms, budgets,
             # nutrition/TDEE, body-fat, activity/workout math, progress. Tested.
  protocol/  # zod wire schemas shared api <-> app (plan bodies, log payloads, context)
  ui/        # the design system (tokens + identity components)
  brand/     # (reserved) logos, illustrations
```

## Commands

- `pnpm dev` — turbo: api (`wrangler dev` on :8787) + app (vite on :5173, proxies /api)
- `pnpm typecheck` / `pnpm test` — across the workspace
- `pnpm --filter @mossa/api test` — the Miniflare integration suite. **Build the
  SPA first** (`pnpm --filter @mossa/app build`) — the worker's `assets` dir is
  `apps/app/dist`, and Miniflare aborts (reporting "no tests") without it. The
  root `pnpm test` handles this automatically (turbo builds the app first).
- `pnpm --filter @mossa/app build` — build the SPA (the api worker serves `apps/app/dist`)

**Local dev needs no Cloudflare account** — but it needs one file. Copy
`apps/api/.dev.vars.example` → `apps/api/.dev.vars` before your first `pnpm dev`.
D1/KV/R2 are Miniflare-simulated, and `ENVIRONMENT=development` in that file is
what unlocks the mock lanes: the AI mock (`ai.ts` gates it on
`ENVIRONMENT === "development"`, so **without `.dev.vars` every AI call returns
"AI provider not configured" / "unavailable"** — not a bug, missing config) and
the mock mailer that logs OTP codes to the `wrangler dev` console (sign-in OTP
also has a localhost-Origin fallback; invites/notifications/action codes do not).
It also enables the `isPlatformAdmin` dev convenience.

⚠️ **`ENVIRONMENT` must never be added to `wrangler.jsonc`'s top-level `vars`** —
that block is the *deployed* config. In production the dev lane would put
sign-in OTPs in retained logs, accept the repo-public auth-secret fallback
(forgeable sessions), and turn on the AI mock — which fabricates output,
including clinical lab values from `lab-extract`, **and still bills the tenant
credits for it**. See DEPLOY.md §8.

The `ai` binding is enabled in `wrangler.jsonc`; for a fully credential-free
`wrangler dev` you can re-comment it.

## Architecture notes (read before changing these)

- **Auth**: `apps/api/src/auth.ts` — Better Auth, org = tenant, OTP + passkey
  plugins only (no password provider). `auth-context.ts` resolves the session;
  `route-guard.ts` is the three-lane boundary (public / platform-admin / member).
- **Row-level scope**: every coaching route goes through
  `requireClientAccess(c, clientId)` in `clients.ts` — owner/assistant = tenant
  match, trainer = `client_trainers` assignment, client = own record. This is
  the security invariant; never bypass it.
- **Credits**: `TenantBillingDO` (`billing-do.ts`) is the authoritative balance;
  AI goes through `ai.ts` `generate()` = reserve → run (Workers AI | mock) →
  settle. Metering math is pure in `@mossa/domain` credits.ts.
- **Access economy**: `commerce-routes.ts` + `@mossa/domain` budgets.ts —
  budgets carry `expiresAt`, days derive at read time, purchases QUEUE not sum,
  status reconciles lazily on read. No domain cron.
- **Two flag systems** (don't merge): platform entitlements (tenant bought from
  Mossa, `entitlements.ts`) vs per-package client flags (client bought from the
  tenant, `clientFlags.ts`). Client capability = the intersection.
- **One UI, three roles**: `apps/app/src/Shell.tsx` swaps nav by persona + mode;
  the trainer's client-detail renders the *same* client surfaces scoped to that
  client. Role changes scope + powers + nav, never screens.

## Conventions

- Store metric, convert at display (`@mossa/domain` units.ts). Day-bucketed
  rows use the client's local date (`date_local`, YYYY-MM-DD) from the device.
- Plan/meal bodies are JSON columns validated by `@mossa/protocol` at the route.
- Pure domain logic gets unit tests; API flows get Miniflare integration tests.
  Run tests with the `wrangler dev` server stopped (they share `.wrangler` state).
- Prettier-ish: no semicolons aren't enforced here — match surrounding style.

## Status

Be conservative here: this section is read as ground truth by future agents, so
an over-claim costs more than an under-claim. Verify before editing it.

**Tests** — recount with `pnpm test` before quoting a figure anywhere; the suite
moves. Measured most recently: **188 domain + ~208 API + 7 protocol + a small
app suite**, four vitest projects total. The pricing and normalizer suites live
in `apps/api/test` and are already *inside* the API count — the older
"protocol/pricing/normalizer" phrasing double-counted them.

**Built and tested:** foundation, auth (OTP + passkeys, incl. autofill /
conditional UI), tenancy + row-level scope, the AI suite (credits reserve →
run → settle), commerce (platform rail + Connect rail), content, reports, media,
tenant custom domains (Cloudflare for SaaS, per-domain WebAuthn RP — SPEC §14.1),
the vision suite (Snap-a-Meal + Label Reader) on a real Gemini path, InboxDO
real-time notification push (WebSocket DO; the bell keeps a slow poll as a
backstop), plan-editor affordances (copy-week with progression, superset/circuit
round-logging), the workout UI parity pass, the rebuilt Train tab, and the
offline-first PWA (app-shell precache + Background-Sync replay of failed
log-write POSTs).

**NOT built** (do not describe any of these as shipped):
- **Wearable import** (Health Connect).
- **Trainer ↔ client chat** — `chat` is `reserved: true` in
  `@mossa/domain/entitlements.ts`, yet the Studio/Team seed plans set it `true`.
- **Tenant API / webhooks / data exports** — the `integrations` entitlement is
  also `reserved: true`: no export route, no CSV serializer, no download UI, no
  tenant API-key issuance, no webhook dispatcher. SPEC §11 promises data export;
  it does not exist. (The www pricing page no longer advertises it.)
- **Tenant marketplace storefront** and the **public blog renderer**.
- **Analytics Engine `USAGE`** — binding referenced, not wired.
- **Playwright E2E golden paths.**
- **Six catalogued AI features**: voice logging, meal swap, menu scout,
  periodization assistant, the retention-radar per-client LLM line, and the
  business-digest narrative. The retention *report endpoint* exists but has no
  UI caller; the coach dashboard only shows a simpler "At risk" count.

**Shipped but thinner than it sounds:**
- The Train tab's "browsable library grid" is nearly empty in practice — the
  platform seed ships zero exercise thumbnails, only two real categories, and no
  favourites.
- "Training Load vs target" doesn't reach the client in production.

**Ops:** deployment is genuinely non-trivial — read DEPLOY.md before touching
anything deploy-shaped. Notably: a fresh deploy **cannot send email** until
`email.provider`/`email.from` are set directly in D1 (there is no admin email UI,
and the mock provider fails closed outside dev), and the whole vision suite is
dead until `google.gemini_key` is set.

See SPEC §13 for the phase map.
