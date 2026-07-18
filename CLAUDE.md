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

**Local dev needs no Cloudflare account:** D1/KV/R2 are Miniflare-simulated, the
AI suite falls back to a deterministic mock (`ai.mock` config), and the mailer
logs OTP codes to the `wrangler dev` console. The `ai` binding is enabled in
`wrangler.jsonc`; for a fully credential-free `wrangler dev` you can re-comment
it (the mock lane covers local dev either way).

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

Foundation through AI suite + commerce + content + reports + media are built and
tested (96 domain + 83 API + protocol/pricing/normalizer tests). Recently added: **tenant custom domains** (Cloudflare for
SaaS, white-label per domain — SPEC §14.1), **passkey autofill** on login
(WebAuthn conditional UI), and the **vision suite** (Snap-a-Meal + Label Reader)
on a real Gemini provider path (mock lane in dev), **InboxDO real-time
notification push** (per-user WebSocket DO; the bell keeps a slow poll as a
backstop), and richer **plan-editor affordances** (copy-week with progression,
superset/circuit round-logging in the player), the **workout UI parity pass**
(exercise thumbnails + rich rows + picker filters + edit-a-logged-set), and a
**rebuilt Train tab** (quick-start chips, a real "this week" metrics grid —
Training Load vs target, tonnage, active days, PRs from logged sessions — a
recent-activity feed, and a browsable library grid). Not yet built: wearable
import (Health Connect). See SPEC §13 for the phase map.
