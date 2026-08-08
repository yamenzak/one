# Deploying Scena

Kova's [`DEPLOY.md`](../../DEPLOY.md) is the long version and most of it
transfers, because all three apps sit on the same platform. This is what is
*different* — and Scena is different in one structural way the others are not:
**it deploys two workers and a marketing site, not one worker.**

---

## 0. Three deployables, and why

[`apps.json`](../../apps.json) declares three entries for Scena:

| id | what | serves |
|---|---|---|
| `scena` | THE worker — Hono, seven DOs, D1/KV/R2 | the API **and** the dashboard SPA |
| `scena-player` | a static worker, **no `main`** | the SCREEN, on its own origin |
| `scena-www` | marketing | the public site |

The player is separate because **a screen is a device**: one pinned URL,
Service-Worker-cached, running for months offline. Sharing the dashboard's origin
would give every workspace's screens a different address, so re-pairing would
orphan the cache and custom domains would multiply certificates by the size of
the fleet. It resolves no tenant from its host — the tenant arrives from the
pairing claim — and it binds no D1 or R2 of its own.

---

## 1. Deploying is one workflow run

**Actions → "Provision an app on Cloudflare" → `scena`.**

The workflow is generic — it reads [`apps.json`](../../apps.json), so nothing in
it is Scena-specific — and it does everything the by-hand checklist used to list:

1. creates the D1 database (`scena`), the KV namespace (`PAIRING`) and the R2
   bucket (`scena-media`), if they are missing
2. writes the real ids into `apps/scena/wrangler.jsonc` and commits them
3. builds the SPA and deploys the worker
4. mints `BETTER_AUTH_SECRET`, but **only** if the worker has none
5. seeds email delivery with the platform sender, `Scena <noreply@4dl.app>`

It is idempotent — every step is guarded by an existence check — so a re-run on a
provisioned account is a no-op. After it, every push to `main` redeploys Scena
through `deploy.yml`.

⚠️ **Scena's ids in `wrangler.jsonc` are PLACEHOLDERS today** — the old account's
real ids were replaced when the app was imported — so `deploy.yml` currently
**SKIPS** Scena with a notice. That is `scripts/apps.mjs ready` doing its job: a
deploy against a placeholder id does not fail loudly, it binds or creates
*something*, and the worker comes up pointing at an empty database.

Those placeholders are also what let Miniflare simulate D1/KV/R2 locally and
ignore ids entirely, which is why the whole test suite and `pnpm dev` run on a
machine that has never seen `wrangler login`.

### Run it for the player too

`scena-player` is its own registry entry, so provision/deploy it as its own app.
It has no resources to create — it is `assets` and a route — but it still needs
to be deployed, and **it must be built with the right API base** (§3).

### By hand, if you must

```sh
wrangler d1 create scena
wrangler kv namespace create PAIRING
wrangler r2 bucket create scena-media
# paste the ids into apps/scena/wrangler.jsonc, then:
wrangler secret put BETTER_AUTH_SECRET   # openssl rand -base64 32
pnpm --filter @scena/app build           # the worker serves apps/scena-app/dist
pnpm --filter @4dl/scena exec wrangler deploy
pnpm --filter @scena/player build
pnpm --filter @scena/player exec wrangler deploy
```

⚠️ Without `BETTER_AUTH_SECRET` the app falls back to a **repo-public** default,
and a forgeable session is a total compromise of every workspace on the
deployment.
⚠️ Without the SPA build, the deploy ships the previous build, or none.

---

## 2. Routes are a dashboard step, not a config one

`apps/scena/wrangler.jsonc` declares **no `routes`**, and that is load-bearing
for local development rather than an omission: declaring them makes
`wrangler dev` rewrite the incoming `Host` to the route's hostname, which
collapses every door onto one name. Every host test in the suite would then pass
while testing nothing — and it once presented as an invitation email containing a
link to `scena.4dl.app` from a worker running on port 8801.

In the dashboard, add **both**:

```
scena.4dl.app/*        the root — a signpost
*.scena.4dl.app/*      setup., admin., play., and every workspace subdomain
```

`scena.4dl.app/*` alone does not match subdomains, and a workspace **is** a
subdomain, so without the wildcard nothing but the signpost works.

### The player's route is separate, and it is not a Scena subdomain

`apps/scena-player/wrangler.jsonc` declares its own:

```
tv.4dl.app        (custom_domain)
```

⚠️ **`tv.4dl.app` and `play.scena.4dl.app` are two different things and both are
needed.** `tv.4dl.app` is where the PLAYER BUNDLE is served — the URL you pin on
a television. `play.scena.4dl.app` is the **device door** on the API worker,
where that bundle's pairing, manifest and asset requests are answered. Point one
at the other and nothing works.

---

## 3. `VITE_API_BASE` is baked in at BUILD time

The player is a separate origin, so it cannot infer where the API is. `API_BASE`
comes from `import.meta.env.VITE_API_BASE` at **build** time, and that variable
is set **nowhere in this repo** — which means the fallback in
`apps/scena-player/src/config.ts` is what actually ships to televisions.

It must be the **device door**: pairing, manifest and asset routes answer on
`play.` and `{"error":"wrong_door"}` everywhere else, which the player surfaces
as *"offline — no cached channel yet"*, two steps removed from its cause.

It is `https://play.scena.4dl.app`, and `scripts/player-api-base.test.mjs` (in
`pnpm gate`) asserts the fallback is https, is not a local address, starts with
`play.` and names Scena — each a mistake this repo has made or come one edit from
making. It was `http://localhost:8787` once: unreachable from a TV, and in this
monorepo it is *Kova's* port.

⚠️ **The E2E suite rebuilds `apps/scena-player/dist` against `play.localhost`.**
CI builds and deploys from separate clean checkouts, so production is unaffected
— but a local checkout that has just run the suite holds a player pointed at a
test port. **Build again before deploying by hand.**

---

## 4. `ENVIRONMENT` must never appear in `vars`

The same trap as Kova and Tessa, with one extra consequence that is Scena's own.
`wrangler.jsonc`'s `vars` is the *deployed* config; `ENVIRONMENT=development`
there would put sign-in OTPs in retained logs, accept the repo-public
auth-secret fallback, and enable the dev platform-admin convenience.

**And it would turn on the AI mock**, which fabricates output and still bills the
workspace credits for it. Scena shipped three paths that did exactly that —
`ai.mock = "on"` from the console, a missing `AI` binding, and a provider failure
falling back in `"auto"` — and all three typechecked and passed every test,
because the suites run in development where mocking is correct.
`scripts/storage-chokepoint.test.mjs` now asserts the mock lane is gated on
`ENVIRONMENT` structurally, because no Workers-pool test can change the binding
it would need to observe.

`ENVIRONMENT` belongs in `.dev.vars`, which is gitignored.

---

## 5. Stripe, and the shared rail

Configured from the operator console (`admin.scena.4dl.app`), not from a file.
Paste the keys under **Stripe**, then press **Sync catalog** — that creates the
Stripe products and prices for the four plans and the credit packs. Point the
Stripe webhook at:

```
https://scena.4dl.app/api/stripe/webhook
```

- The webhook is on the **SHARED rail**: one Stripe account serves every 4DL app,
  and Scena's events are attributed by `metadata.app = "scena"`. An event the
  rail cannot attribute is parked in `rail_parked_events`, never answered `200`
  with its id claimed — that shape is money captured and nothing granted, because
  Stripe does not retry a 200.
- ⚠️ **Scena had live Stripe wiring before the migration.** The cutover onto
  `metadata.app` attribution needs the parked-event dead letter *watched* during
  the transition; the operator routes over `rail_parked_events` exist for exactly
  that, because a dead letter nobody can read is the same silent success with an
  extra table.
- Nothing is gated on Stripe being configured. A deployment with no payment rail
  is a legitimate configuration (a self-host, the test suite): the plan picker
  reports it and the app serves the free baseline rather than stranding every
  workspace over our misconfiguration.
- ⚠️ **Sync the catalog before anyone signs up, or the trial is not a trial.**
  Onboarding mints its own Checkout session with
  `subscription_data.trial_period_days` from the plan's entitlements — but only
  once the plan has a `stripe_price_id`. Without one, `/api/me/onboarding/plan`
  degrades to `pending`: the workspace is created, nothing is charged, and the
  owner is told billing is not ready. That is the correct refusal rather than a
  crash, and it is still not what you want the first customer to see. Press
  **Sync catalog** in the operator console's Stripe panel after configuring the
  keys.

---

## 6. Email

A fresh deploy cannot send mail until `email.provider` and `email.from` exist in
D1 — the mock provider fails closed outside development, and a `cloudflare`
provider with no verified sender now **refuses** rather than degrading to the
mock and reporting success for a message that went nowhere.

Provisioning seeds those rows (step 5 above) with `ON CONFLICT DO NOTHING`, which
is what breaks the bootstrap deadlock: reaching the operator screen for it needs
a session, which needs an OTP, which needs email. A workflow with database access
can do what a screen behind a login cannot.

The sender is `noreply@4dl.app`, onboarded **once for the whole platform** at
Cloudflare → Email → Email Sending. Verification lives on the zone, so if Kova
can already send, so can Scena — that is the entire reason the address is shared
rather than per-app.

---

## 7. After the deploy: what to check

`scripts/boot-check.mjs` runs automatically in both workflows and probes
`BETTER_AUTH_URL` + `/health`. A hostname that does not *resolve* is a notice
(DNS is a dashboard step); one that resolves and answers wrongly is a failure.
That check exists because "deployed" is not "working": Tessa once shipped green
for a day while `createAuth` threw in the first middleware, so every route 500'd
including `/health` — and the SPA still loaded, because static assets never reach
the worker.

Then, by hand, the two things only a browser can tell you:

1. **The doors.** `scena.4dl.app` is a signpost — it must NOT render the
   dashboard, and it must make no refused API call; `setup.` signs you in and
   then runs the three-step wizard (name → plan → start); `admin.` is the
   console; a workspace subdomain is the app. If every one of them 404s, the
   wildcard route (§2) is missing. `apps/scena-e2e/tests/02-doors.spec.ts` is the
   automated half of this check.
2. **A screen.** Open `tv.4dl.app` on any device and confirm it draws a pairing
   code rather than *"offline — no cached channel yet"*. That message means the
   bundle's `API_BASE` is not the device door (§3), and it is the single most
   likely thing to be wrong on a first deploy.

---

## 8. Cron

`apps/scena/wrangler.jsonc` declares two triggers, and they fire in production
only:

```
*/15 * * * *   feed refresh, daypart + offline sweeps
10 0 * * *     monthly credit grants + the dunning lifecycle sweep
```

`wrangler dev` does not fire them. To exercise one locally:

```sh
curl "http://localhost:8789/cdn-cgi/handler/scheduled"
```
