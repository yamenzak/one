# Deploying Tessa

Kova's `DEPLOY.md` is the long version and most of it transfers, because both
apps sit on the same platform. This is what is *different*, plus the two things
that are genuinely blocking.

**Tessa has never been deployed.** Nothing below has been executed against a real
Cloudflare account — it is derived from Kova's deployment, which has, and from
`wrangler.jsonc`. Treat the ordering as sound and every id as unverified.

---

## 0. The two blockers, up front

### 0.1 Every resource id is a placeholder

`apps/tessa/wrangler.jsonc` ships ids that are deliberately fake so
`wrangler dev` works with no account at all:

```
"kv_namespaces":  [{ "binding": "CACHE", "id": "0000000000000000000000000000cafe" }]
"d1_databases":   [{ "binding": "DB",    "database_id": "00000000-0000-0000-0000-0000000000d1" }]
"r2_buckets":     [{ "binding": "MEDIA", "bucket_name": "tessa-media" }]
```

Miniflare simulates all three locally and ignores the ids entirely, which is why
the whole test suite and `pnpm dev` run on a machine that has never seen
`wrangler login`. A real deploy needs real ones:

```sh
wrangler kv namespace create tessa-cache
wrangler d1 create tessa
wrangler r2 bucket create tessa-media
```

Paste the returned ids over the placeholders. ⚠️ **A deploy with the placeholders
in place does not fail loudly** — wrangler will create or bind *something* — so
check the ids before the first `wrangler deploy`, not after.

### 0.2 A fresh deployment cannot send email

Identical to Kova, and it is a genuine bootstrap deadlock rather than an
oversight: the mock mailer fails closed outside development, so the first sign-in
needs `email.provider` and `email.from` seeded **directly in D1**. No UI can fix
this, because reaching the operator console needs a session, which needs an OTP,
which needs email.

See Kova's DEPLOY.md §6 for the exact rows. Everything after the first seed is a
form (`@4dl/admin` → Email delivery).

---

## 1. Order

1. Create the three resources above and paste the ids in.
2. `wrangler secret put BETTER_AUTH_SECRET` — `openssl rand -base64 32`.
   ⚠️ Without it the app falls back to a **repo-public** default, and a forgeable
   session is a total compromise of every centre on the deployment.
3. Build the SPA: `pnpm --filter @tessa/app build`. The worker serves
   `apps/tessa-app/dist` through its `assets` binding, so **a deploy without this
   ships the previous build, or none**.
4. `pnpm --filter @4dl/tessa exec wrangler deploy`.
5. Seed the email rows (§0.2), then sign in on `setup.<root>`.
6. Add the two routes in the dashboard — see §2.

## 2. Routes are a dashboard step, not a config one

`wrangler.jsonc` declares **no `routes`**, and that is load-bearing for local
development rather than an omission: declaring them makes `wrangler dev` rewrite
the incoming `Host` to the route's hostname, which collapses all five doors onto
the root. Every host test in the suite would then pass while testing nothing.

In the dashboard, add:

```
<root>/*        the root, setup., admin. and every centre's subdomain
*.<root>/*
```

Both are needed. `<root>/*` alone does not match subdomains.

## 3. `ENVIRONMENT` must never appear in `vars`

The same trap as Kova, with the same consequences. `wrangler.jsonc`'s `vars` is
the *deployed* config; `ENVIRONMENT=development` there would put sign-in OTPs in
retained logs, accept the repo-public auth-secret fallback, and enable the dev
platform-admin convenience. It belongs in `.dev.vars`, which is gitignored.

## 4. What Tessa does NOT need that Kova does

- **No Stripe.** Tessa has no billing rail wired: no plans, no catalog sync, no
  webhook. `@4dl/billing`'s entitlement engine is present through the template
  scaffolding and every tenant sits on the default. Charging for Tessa is a
  future piece of work, and it is worth knowing it is *absent* rather than
  *configured and free* — see `entitlements.ts`.
- **No Gemini key.** No AI surface exists yet (TESSA.md §5 Phase 4). The `ai`
  binding is declared and unused.

## 5. Data residency — read before promising anything

TESSA.md §7.1. German clinics will ask where the data lives, and Cloudflare's
jurisdictional options for D1 and Durable Objects need verifying **against
current capability, by someone who can read the contract**, before any claim is
made in writing. This is the one item on this page that could change the
architecture rather than the configuration, and nothing here should be read as
having settled it.
