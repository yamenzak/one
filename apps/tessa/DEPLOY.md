# Deploying Tessa

Kova's `DEPLOY.md` is the long version and most of it transfers, because both
apps sit on the same platform. This is what is *different*.

---

## 1. Deploying is one workflow run

**Actions → "Provision an app on Cloudflare" → `tessa`.**

That is the whole first deploy. The workflow is generic — it reads
[`apps.json`](../../apps.json), so nothing in it is Tessa-specific — and it does
everything the by-hand checklist used to list:

1. creates the D1 database, KV namespace and R2 bucket, if they are missing
2. writes the real ids into `apps/tessa/wrangler.jsonc` and commits them
3. builds the SPA and deploys the worker
4. mints `BETTER_AUTH_SECRET`, but **only** if the worker has none
5. seeds email delivery with the platform sender, `Tessa <noreply@4dl.app>`

It is idempotent — every step is guarded by an existence check — so a re-run on a
provisioned account is a no-op. After it, every push to `main` redeploys Tessa
through `deploy.yml`.

Two things still have to happen outside it, and neither can be automated: §2's
dashboard routes, and verifying `noreply@4dl.app` in Cloudflare → Email → Email
Sending. Verification lives on the zone, and it is done once for the *platform* —
every app shares the address, so if Kova can already send, Tessa can too.

### Why the workflow rather than the three commands

The three creates are easy. The paste afterwards is not: **a deploy against a
placeholder id does not fail loudly** — wrangler binds or creates *something*, and
the worker comes up pointing at an empty database. `deploy.yml` refuses to ship an
app whose config still holds placeholders for exactly that reason, and skips it
with a notice instead.

Those placeholders are deliberate, and worth knowing about: Miniflare simulates
D1/KV/R2 locally and ignores ids entirely, which is why the whole test suite and
`pnpm dev` run on a machine that has never seen `wrangler login`.

### The email deadlock the workflow breaks

The mock mailer fails closed outside development, so the first sign-in needs
`email.provider` and `email.from` seeded **directly in D1**. No UI can fix that,
because reaching the operator console needs a session, which needs an OTP, which
needs email. A workflow with database access can, which is why step 5 exists. It
seeds with `ON CONFLICT DO NOTHING`, so it never overwrites a sender you have
since changed; everything after the first seed is a form (`@4dl/admin` → Email
delivery).

### By hand, if you must

```sh
wrangler d1 create tessa
wrangler kv namespace create CACHE
wrangler r2 bucket create tessa-media
# paste the ids into apps/tessa/wrangler.jsonc, then:
wrangler secret put BETTER_AUTH_SECRET   # openssl rand -base64 32
pnpm --filter @tessa/app build           # the worker serves apps/tessa-app/dist
pnpm --filter @4dl/tessa exec wrangler deploy
```

⚠️ Without `BETTER_AUTH_SECRET` the app falls back to a **repo-public** default,
and a forgeable session is a total compromise of every centre on the deployment.
⚠️ Without the SPA build, the deploy ships the previous build, or none.

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

## 4. Stripe and the Gemini key

Both are configured from the operator console (`admin.<root>`), not from a file.

- **Stripe.** Paste the keys under **Stripe**, then press **Sync catalog** — that
  creates the Stripe product and price for the one plan (`practice`) and the
  three credit packs. Until it runs, `/billing` reports `synced: false` and
  checkout refuses with `409 plan not synced` rather than charging against a
  price that does not exist. Point the Stripe webhook at
  `https://<root>/api/webhooks/stripe`.
  - The webhook is on the SHARED rail: one Stripe account serves every 4DL app,
    and Tessa's events are attributed by `metadata.app = "tessa"`. An event the
    rail cannot attribute is parked in `rail_parked_events`, never answered
    `200` with its id claimed — that shape is money captured and nothing granted,
    because Stripe does not retry a 200.
  - Nothing is gated on Stripe being configured. A deployment with no payment
    rail is a legitimate configuration (a self-host, the test suite): the plan
    picker reports `payable: false` and the app serves the free baseline rather
    than stranding every centre over our misconfiguration.
- **The Gemini key.** Set it under **AI**. Without it the vision model is
  unreachable, so **"Read a label" fails as unavailable** on a deployment that
  otherwise looks completely healthy. The AI panel shows `missing` in red for
  exactly this reason. The other three assistants run on Workers AI and need no
  key.

## 5. Data residency — read before promising anything

TESSA.md §7.1. German clinics will ask where the data lives, and Cloudflare's
jurisdictional options for D1 and Durable Objects need verifying **against
current capability, by someone who can read the contract**, before any claim is
made in writing. This is the one item on this page that could change the
architecture rather than the configuration, and nothing here should be read as
having settled it.
