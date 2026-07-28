# Deploying Kova

One worker (`kova`) serves the API **and** the app SPA; a second worker
(`kova-www`) serves the marketing site. CI/CD is wired: every push to `main`
runs typecheck + tests, builds the SPA, and deploys both
(`.github/workflows/deploy.yml`). Pull requests are validated by
`.github/workflows/ci.yml` and deploy nothing.

Follow the steps **in order**. Several of them are ordered the way they are
because the step before it creates something the next one needs.

---

## 0. Prerequisites

**Cloudflare account** — the following must all be available on it:

| Requirement | Why | Notes |
| --- | --- | --- |
| **Workers Paid plan** | Durable Objects (`TenantBillingDO`, `InboxDO`) are not on the free plan | Hard requirement; the worker will not deploy without DO support |
| **D1** | all relational data | generally available |
| **KV** | external food/exercise API cache | generally available |
| **R2** | media, progress photos, lab uploads | must be enabled once per account |
| **Workers AI** | the `ai` binding in `wrangler.jsonc` | required by the config as shipped |
| **Email Sending** (`send_email` binding) | OTP codes — the ONLY way in | you must onboard + verify a sender address/domain under **Email → Email Sending**. This is the step most likely to gate your launch; start it first, it is not instant |
| **A zone you control** | the worker's `routes` entry | see step 2 |
| **Cloudflare for SaaS** on that zone | tenant custom domains (optional) | see the Custom domains section |

**Local tooling** — Node ≥22, `pnpm` (see `packageManager` in `package.json`),
and the `gh` CLI if you want to set repo secrets from the terminal.

**Stripe account** — needed before you can sell anything (section 6). Not needed
to reach a first sign-in.

---

## 1. Authenticate wrangler locally

**Do this before any `wrangler` command in this document.** Nothing below works
without it, and the failure mode is a confusing "unauthorized"/interactive
prompt in the middle of a step.

Either log in interactively:

```sh
pnpm exec wrangler login          # opens a browser, stores an OAuth token
pnpm exec wrangler whoami         # confirm the account you expect
```

…or export a scoped API token (also the token CI uses — step 3):

```sh
export CLOUDFLARE_API_TOKEN=…     # the token from step 3
export CLOUDFLARE_ACCOUNT_ID=…    # Dashboard → Workers → Account ID
pnpm exec wrangler whoami
```

---

## 2. Fix `apps/api/wrangler.jsonc` for YOUR account

`apps/api/wrangler.jsonc` in this repo is **not** a template of placeholders —
it is the live configuration of one specific Cloudflare account (Four Degree
Labs). If you are deploying anywhere else, these four things are wrong for you
and must be changed:

| Line | Field | What is there now | What you need |
| --- | --- | --- | --- |
| ~25 | `routes[0].pattern` | `kova.4dl.app` (a `custom_domain` route) | a hostname on a zone **you** control. The deploy fails if the zone isn't on your account |
| ~34 | `vars.ADMIN_EMAILS` | `zakhouryamen@gmail.com` | your platform-admin email(s), comma-separated. This is the platform super-admin allowlist — get it right before the first sign-in |
| ~36 | `vars.BETTER_AUTH_URL` | `https://kova.4dl.app` | `https://<your route hostname>` |
| ~58 / ~64 | `kv_namespaces[0].id`, `d1_databases[0].database_id` | **real live ids** belonging to the original account | your own ids, from step 4 |

Also review `apps/www/wrangler.jsonc` (`routes[0].pattern` =
`getkova.4dl.app`).

`ENVIRONMENT` must **not** appear in the `vars` block — see step 8.

---

## 3. Create a Cloudflare API token + store the repo secrets

Dashboard → My Profile → API Tokens → Create Token → **Edit Cloudflare Workers**
template, then add: **D1 Edit**, **Workers KV Storage Edit**, **Workers R2
Storage Edit**. Scope it to your account.

```sh
# NB: the GitHub REPOSITORY is still `mossa` — the product rename did not move it.
gh secret set CLOUDFLARE_API_TOKEN  --repo <owner>/mossa
gh secret set CLOUDFLARE_ACCOUNT_ID --repo <owner>/mossa
```

**Exactly two repo secrets.** `BETTER_AUTH_SECRET` is deliberately *not* a repo
secret — it is a worker secret you set once by hand in step 5. Setting it as a
third GitHub secret does nothing.

---

## 4. Provision D1 / KV / R2 and paste the ids

> **The D1 database is named `mossa`, and that is intentional.** The binding
> resolves by `database_id`, so the name only matters to the `wrangler d1` CLI —
> and D1 has no rename, so every `wrangler d1 …` command below uses `mossa`. The
> R2 bucket IS `kova-media`: R2 binds by NAME, so it had to be created fresh.

GitHub → **Actions → "Provision Cloudflare resources" → Run workflow** (or run
the same three commands locally):

```sh
cd apps/api
pnpm exec wrangler d1 create mossa
pnpm exec wrangler kv namespace create CACHE
pnpm exec wrangler r2 bucket create kova-media
```

Paste `database_id` and the KV `id` into `apps/api/wrangler.jsonc`, commit, push.

> **There is no `wrangler d1 migrations apply` step.** The schema is applied
> lazily and idempotently by the worker itself (`apps/api/src/db.ts`,
> `ensureSchema` — `CREATE TABLE IF NOT EXISTS` + `ALTER`s, guarded by a
> `schema_version` marker row). First request after a deploy pays for it.

---

## 5. First deploy, then set `BETTER_AUTH_SECRET`

Order matters: `wrangler secret put` targets a worker that **must already
exist**, so the first deploy comes first.

```sh
# 5a. Deploy (or just push to main and let the Deploy workflow do it)
pnpm --filter @kova/app build
cd apps/api && pnpm exec wrangler deploy
```

```sh
# 5b. Set the auth secret ONCE. Better Auth signs session cookies with it.
cd apps/api
openssl rand -base64 32 | pnpm exec wrangler secret put BETTER_AUTH_SECRET
```

Worker secrets persist across `wrangler deploy`, which is why the deploy
workflow deliberately never writes it — re-putting it every deploy would rotate
the cookie-signing key and log everybody out. Re-run 5b only to rotate
(intentionally logging everyone out).

Until 5b is done, **every authenticated request throws** — in production
`createAuth` refuses to boot on the insecure dev fallback key
(`apps/api/src/auth.ts`). So do not attempt a sign-in between 5a and 5b.

Sanity check: `curl https://<your host>/health` (liveness only — it does not
touch D1, so a 200 here does not prove the database binding works).

---

## 6. Bootstrap email delivery — REQUIRED, and manual

Read this before trying to sign in. Passwordless OTP is the only way into the
app, and **a fresh deploy cannot deliver email**:

- `email.provider` defaults to `mock`.
- Outside the dev lane the mock provider **fails closed**: it sends nothing and
  logs nothing (`apps/api/src/mailer.ts`). `wrangler tail` will show you no
  code — earlier versions of this document said it would; that was wrong.
- The only UI for changing it (`POST /api/admin/email`) requires a
  **platform-admin session**, which requires an OTP you cannot receive. There is
  no admin email screen in the app yet. That is a bootstrap deadlock.

So configure it directly against remote D1 **before the first sign-in
attempt**. `app_config` is created by `ensureSchema`, but the `CREATE TABLE IF
NOT EXISTS` below makes this safe to run even on a database the worker has
never touched:

```sh
cd apps/api
pnpm exec wrangler d1 execute mossa --remote --command "
CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT);
INSERT INTO app_config (key, value) VALUES
  ('email.provider', 'cloudflare'),
  ('email.from', 'Kova <noreply@yourdomain.com>'),
  ('email.platform_from', 'Kova <billing@yourdomain.com>')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
"
```

Replace both addresses with senders you have **onboarded and verified** in
Cloudflare → Email → Email Sending. The defaults are useless in production:
`email.from` defaults to `Kova <noreply@kova.local>` (an invalid domain) and
`email.platform_from` to `Kova <noreply@fourdegreelabs.com>` (a domain you
almost certainly do not own).

Verify:

```sh
pnpm exec wrangler d1 execute mossa --remote \
  --command "SELECT key, value FROM app_config WHERE key LIKE 'email.%';"
```

Then request a code on `https://<your host>`. If delivery is misconfigured the
login now returns a real error instead of a silent "code sent".

---

## 7. First sign-in and seeding

1. Sign in with an address listed in `vars.ADMIN_EMAILS` → you are the platform
   admin.
2. Create your studio (tenant).
3. Account menu → **Platform admin → Seed demo data** for sample
   clients/plans/exercises (optional).
4. Configure the runtime keys you need from the platform-admin console — see
   the reference table in section 9. At minimum, set `google.gemini_key`
   (**AI** tab) or the entire vision suite is dead.

---

## 8. Never set `ENVIRONMENT` in `wrangler.jsonc`

`ENVIRONMENT=development` belongs in `apps/api/.dev.vars` **only** (see
`apps/api/.dev.vars.example`). `wrangler.jsonc`'s top-level `vars` block is the
**deployed** config; putting `ENVIRONMENT` there ships the dev lane to
production and re-opens four fail-closed guards at once:

- the mock mailer starts writing sign-in OTPs into retained Workers logs;
- the BETTER_AUTH_SECRET fallback accepts a repo-public constant → forgeable
  sessions;
- `isPlatformAdmin` grants its dev convenience;
- **the AI mock lane activates.** With no `google.gemini_key`, Snap-a-Meal,
  Label Reader, body-scan voice packs and `lab-extract` then return
  deterministic *fabricated* output — including invented clinical lab values a
  coach can save into a real client's chart — and the tenant is **metered and
  charged credits** for it. Nothing in the UI surfaces `mocked: true`.

---

## 8b. The AI model catalog, and proving AI works

Two controls on **Platform admin → AI**, both worth running on a fresh deploy.

### Sync from the pricing docs

Re-reads Cloudflare's and Google's official pricing pages (their `.md`
versions). Per provider, **independently**:

| It does | Detail |
| --- | --- |
| **Discover** | Any model on the page that is not in the catalog is added. Generation lanes (text / text-small / vision / image / speech) arrive **enabled**; embedding / transcription / TTS / classifier models arrive **disabled** — they are priced and listed, but nothing in Kova can call one |
| **Re-price** | Existing rows get the page's current rates and label. Your **task routing, enable/default and markup are preserved** — a sync never re-routes a lane behind you |
| **Reconcile** | A model that has **disappeared** from its provider's page is switched **off** (`enabled = 0`, and it loses any default flag). It is never deleted: a studio's saved per-feature model may still name it, and the `ai_generations` history has to stay readable. Re-enable it by hand if it comes back |
| **Report** | Per provider: parsed / new / re-priced / switched-off counts, the ids switched off, and every row on the page it **could not** price, with the reason |

Failure is isolated. If Cloudflare's page 404s and Google's is fine, **only**
Gemini is reconciled; not one Workers AI row is touched. A page that fetches but
parses to **zero** models is treated as a doc-format change — nothing is written
and nothing is disabled — so a Cloudflare docs rewrite cannot empty your catalog
in one click. The console prints the per-provider line, so `Gemini: 0 parsed`
reads as itself rather than as a generic "sync failed".

What it still **cannot** discover, and will tell you so:

- **Workers AI image models** (flux, lucid-origin, phoenix). They are priced per
  512×512 tile *plus* per step (or in per-megapixel tiers); the catalog holds one
  unit rate, so any single figure would undercharge. They are also unreachable —
  image generation is Gemini-only.
- **Gemini's newer image models** (`gemini-3.1-flash-image`, `gemini-3-pro-image`)
  — priced per resolution tier (0.5K / 1K / 2K / 4K), not per image.
- **Imagen / Veo / Lyria** — a different Google API surface (`predict` /
  long-running operations) that the app's `generateContent` path cannot drive.
- **Live API / native-audio** models — a bidirectional streaming protocol
  nothing here speaks.
- Workers AI rows whose Model cell is a pricing variant rather than an id
  (`@cf/deepgram/nova-3 (WebSocket)`).

### Live self-test

Runs six of the product's **real** prompts — a workout-plan draft, a
natural-language food parse, a check-in summary, an exercise auto-fill, a food
nutrition estimate and a Snap-a-Meal vision call — through the normal metered
path, then validates each answer with the same parser the feature uses. A model
that returns prose instead of JSON is reported as a **failure**, which is the
usual meaning of "the AI isn't working".

- **It spends real credits** from the studio you are switched into. The plan and
  its upper-bound cost are shown before the button, and the button says what it
  will spend. Nothing is refunded.
- Scopes: *As shipped* (what each feature would use right now), *Compare*
  (the default Workers AI model and the default Gemini model on the same prompt,
  shown adjacent), one provider, or one model.
- Each row reports the model, provider, pass/fail, latency, credits spent, the
  reason on failure (verbatim provider error where there is one) and an excerpt
  of what the model actually said.
- A row that came from the **canned mock** is labelled as such. On the dev lane
  that is everything, and it proves the plumbing and the billing, not the model.
- A vision check on a Workers AI model reports **"not supported on this
  provider"**, not a failure. That refusal is deliberate: the image was
  previously dropped silently and the fabricated answer billed anyway.

---

## 9. Runtime configuration reference (`app_config` in D1)

Everything here is admin-editable at runtime and lives in the `app_config` D1
table — never in the bundle. Most of it has a platform-admin UI; the ones that
do not are marked, and are set with `wrangler d1 execute --remote` exactly as in
section 6.

| Key | Default | If unset | Where to set it |
| --- | --- | --- | --- |
| `email.provider` | `mock` | **Nobody can sign in.** Mock fails closed outside dev: no send, no log | ⚠️ no UI — D1 (section 6) |
| `email.from` | `Kova <noreply@kova.local>` | Sends from an invalid domain → bounces/rejects | ⚠️ no UI — D1 |
| `email.platform_from` | `Kova <noreply@fourdegreelabs.com>` | Platform/billing email sends from a domain you don't own | ⚠️ no UI — D1 |
| `email.credits_per_email` | `1` | Tenants are charged 1 credit per metered email — fine, but set it deliberately | ⚠️ no UI — D1 |
| `google.gemini_key` | *(empty)* | **The whole vision suite is unavailable**: Snap-a-Meal, Label Reader, lab-extract, image generation, body-scan voice. Every `task: "vision"` model in the seed catalog is provider `google` | Platform admin → **AI** |
| `ai.mock` | `auto` | `auto` only falls back to the mock on the dev lane; `on` forces the mock (and bills for it) — never set `on` in production | Platform admin → **AI** |
| `ai.markup` | `3` | **This is the multiplier tenants are billed at** for AI. Valid 1–100. Review before selling credits | Platform admin → **AI** |
| `stripe.mode` | `disabled` | No payments at all. `test` / `live` also **select the credential lane** (below) | Platform admin → **Stripe** |
| `stripe.<lane>.secret_key` | *(empty)* | No payments in that lane (`<lane>` = `test` or `live`) | Platform admin → **Stripe** |
| `stripe.<lane>.publishable_key` | *(empty)* | Payment Element can't mount | Platform admin → **Stripe** |
| `stripe.<lane>.webhook_secret` | *(empty)* | **Platform-rail webhooks rejected 400** → subscriptions and credit packs are paid for and never granted | Platform admin → **Stripe** |
| `stripe.<lane>.connect_webhook_secret` | *(empty)* | Falls back to that lane's `webhook_secret`; if that's also unset, **Connect webhooks rejected** → clients pay and get nothing | Platform admin → **Stripe** |
| `stripe.secret_key`, `stripe.publishable_key`, `stripe.webhook_secret`, `stripe.connect_webhook_secret` | *(empty)* | **Legacy, pre-lane slots.** Still read as a per-credential fallback when the active lane has no value, so an existing deployment keeps working; a lane-scoped write takes precedence | Platform admin → **Stripe** (writes go to a lane) |
| `stripe.<lane>.catalog_ids` | *(empty)* | Written by the product, not by hand: the Stripe product/price ids parked for a lane across a mode flip (section 10a) | — |
| `stripe.platform_fee_bps` | `0` | Zero application fee on tenant→client payments (the advertised "zero markup") | Platform admin → **Stripe** |
| `turnstile.site_key` | *(empty)* | Login shows no bot check | Platform admin → **Security** |
| `turnstile.secret` | *(empty)* | **Turnstile is off** — OTP send is unthrottled per-IP | Platform admin → **Security** |
| `cf.saas.api_token` | *(empty)* | Tenant custom domains can't be registered | Platform admin → **Domains** |
| `cf.saas.zone_id` | *(empty)* | Same | Platform admin → **Domains** |
| `cf.saas.cname_target` | *(empty)* | Tenants get no CNAME to point at | Platform admin → **Domains** |
| `cf.saas.worker_name` | `kova` | Per-hostname routes point at a missing script | Only if the worker is renamed |

Worker-level config that is **not** in `app_config`: `BETTER_AUTH_SECRET`
(wrangler secret, step 5b), `ADMIN_EMAILS` and `BETTER_AUTH_URL`
(`wrangler.jsonc` `vars`, step 2).

---

## 10. Stripe

Both rails are off until configured, and **misconfiguring the webhooks means
money is captured and nothing is ever granted** — the customer is charged, the
subscription/credit pack/client package never activates, and there is no
reconciliation job that will notice.

### 10a. Keys — two lanes, one switch

Every credential is stored **per lane**: `stripe.test.*` and `stripe.live.*`,
with `stripe.mode` (`test` | `live` | `disabled`) selecting the lane that is
actually in force. Test mode and live mode are different objects in Stripe —
different keys *and* different webhook endpoints with different signing secrets —
so this is what makes switching a one-click change instead of a five-value
re-paste, and what stops a half-swap (live secret key + test webhook secret) in
which every webhook fails signature verification and clients pay for nothing.

Platform admin → **Stripe**:

1. Fill in the **Test lane** and the **Live lane** independently (four fields
   each: secret key, publishable key, platform webhook secret, Connect webhook
   secret). Both can be stored before either is active. Fields are write-only —
   blank keeps what is saved.
2. **Switch to test / Switch to live** is one action and changes nothing but the
   active lane.
3. Run **Sync catalog** after a switch. Stripe products/prices are per-lane
   objects, so ids are parked per lane (`stripe.<lane>.catalog_ids`) on a flip and
   restored when you flip back; a lane that has never been synced needs one.

**Existing deployments need no migration.** The pre-lane unscoped keys
(`stripe.secret_key`, `stripe.publishable_key`, `stripe.webhook_secret`,
`stripe.connect_webhook_secret`) are still read as a **per-credential fallback**
for whichever lane is active, so a studio configured before lanes existed keeps
taking payments untouched. The first lane-scoped value you save takes precedence
over the legacy key of the same name; the legacy key is never rewritten or
deleted.

**`stripe.mode` is now honest.** The lane genuinely selects the credentials, and
the write path **refuses** (400, nothing written) to store an `sk_live_`/`pk_live_`
key in the test lane or the reverse, and refuses a mode whose resulting active
keys belong to the other lane. A mismatch that already exists in the legacy keys
(live keys stored while the mode says `test` — real money under a test label) is
**not** silently corrected and does not fail closed at runtime, because that would
take a paying deployment offline on deploy: instead `/api/admin/stripe/status`
reports the key's real lane as a separate fact and the admin screen shows a red
alert until it is resolved.

**Not lane-scoped (know this before flipping a live deployment):** Stripe
customer ids (`subscriptions.stripe_customer_id`), platform/client subscription
ids, and connected-account ids (`tenant_settings.stripe_account_id`) are also
per-lane objects in Stripe, and they are deliberately left alone — clearing a
live connected-account mapping would break the Connect webhook's account→tenant
resolution for real, paying tenants. So a flip into a lane those ids were not
created in produces loud API failures ("No such customer") on the affected paths,
not silent damage. Treat lane flips as a setup/staging action, not a routine
toggle on a live studio.

### 10b. Create TWO webhook endpoints

Stripe Dashboard → Developers → Webhooks → **Add endpoint**, twice.

**1. Platform rail** — Kova's own revenue (tenant subscriptions, credit packs).

- URL: `https://<your host>/api/stripe/webhook`
- Events:
  - `checkout.session.completed`
  - `payment_intent.succeeded`
  - `invoice.paid`
  - `invoice.payment_failed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `charge.refunded`
  - `charge.dispute.created`
- Copy the signing secret (`whsec_…`) → platform admin → Stripe → the **platform
  webhook secret of the lane this endpoint belongs to** (`stripe.<lane>.webhook_secret`).

**2. Connect rail** — your tenants' revenue (clients buying packages on the
tenant's own connected account).

- URL: `https://<your host>/api/connect/webhook`
- **You must enable "Listen to events on connected accounts"** on this
  endpoint. Without it the endpoint receives nothing and every client package
  purchase is paid-but-ungranted.
- Events: the same nine as above, **plus `account.updated`** (this is what
  flips a tenant's onboarding status to charges-enabled).
- Copy that endpoint's signing secret → platform admin → Stripe → the **Connect
  webhook secret of that lane** (`stripe.<lane>.connect_webhook_secret`).

**Pin the API version on BOTH endpoints to `2025-02-24.acacia`** (the value of
`STRIPE_API_VERSION` in `apps/api/src/stripe.ts`). This is not cosmetic, and it is
now measured rather than assumed — `apps/api/test/stripe-live.test.ts` observed all
of it against real Stripe:

- A webhook payload is rendered at the **endpoint's** version (or, with none set,
  the **account default**) — never at the version of the requests Kova makes.
  On a sandbox created recently the account default is already `2025-11-17.clover`,
  four+ releases past the pin.
- At that default, `invoice.subscription` **does not exist**. The id lives under
  `parent.subscription_details.subscription`. `invoiceSubscriptionId` reads both,
  so renewals still work — but that fallback is the only thing keeping a Connect
  renewal from being "card charged, budget never topped up, HTTP 200".
- At that default a Subscription payload has **no root `current_period_end`**
  either (it moved onto `items.data[].current_period_end`), which the handlers do
  NOT read — see AGENTS.md §5 for the consequence.

Pinning the endpoints is the cheap fix; leaving them unpinned means the payload
shape changes under you whenever Stripe's default moves.

The two endpoints have **different** signing secrets, and **so does each lane** —
test-mode and live-mode webhook endpoints are separate objects in Stripe. That is
four signing secrets in total if you run both lanes. If you leave a lane's Connect
secret empty the code falls back to that same lane's platform secret, which will
fail signature verification for Connect events — a silent 400 per event. The
admin screen flags a missing Connect secret in red for exactly this reason.

### 10c. Verify

Send a test event from each endpoint in the Stripe dashboard and confirm a 200.
Then do one real end-to-end purchase in test mode and check the grant actually
landed (credit balance / subscription row / client budget). Do not treat "Stripe
says paid" as proof.

### 10d. The live Stripe suite (`apps/api/test/stripe-live.test.ts`)

The only suite in the repo that leaves the machine. It drives a real Stripe
**test-mode** account and asserts our assumptions against what Stripe actually
returns and emits — catalog prices, the trial SetupIntent transition, trial end
under a test clock, credit-pack PaymentIntents, refund/dispute payload shapes, the
Connect rail, the API-version drift above, and real event bodies replayed through
our own `/api/stripe/webhook`. Everything else that touches Stripe uses payloads
we wrote ourselves, which is how the two trial bugs shipped.

Run it:

```sh
export STRIPE_TEST_SECRET_KEY=sk_test_…      # test mode ONLY; never commit it
pnpm --filter @kova/app build               # Miniflare needs apps/app/dist
pnpm --filter @kova/api exec vitest run test/stripe-live.test.ts
```

- **~110 s, 39 tests, and it costs nothing** (test mode). It creates real objects
  in the sandbox: products/prices, customers, subscriptions, charges, refunds and
  one real dispute.
- **Without the variable exported it SKIPS** (38 skipped, 1 lane-guard test
  passes) and makes no network call, so `pnpm test` and CI stay green and offline.
  Note that a key sitting in `apps/api/.dev.vars` is deliberately **not** enough:
  `apps/api/vitest.config.ts` threads the binding from the shell and defaults it
  to `""`, so the live lane is opt-in per run.
- **A non-`sk_test_` key fails the suite rather than running it.** It creates
  charges and disputes; it must never see live money.
- It cleans up test clocks, connected accounts, customers and subscriptions, and
  **archives** (Stripe cannot delete) the products/prices `syncCatalog` created.
  Charges, refunds, disputes, PaymentIntents and Events are permanent in Stripe
  and are left in the sandbox by design.
- **Point it at a sandbox you don't also use by hand.** Because it archives the
  prices it creates, a shared test account would end up with a pile of inactive
  products, and any manual checkout still holding one of those price ids breaks.
- There is no `pnpm test:stripe` alias — adding one means a line in
  `apps/api/package.json`:
  `"test:stripe": "vitest run test/stripe-live.test.ts"`.

Not covered by it, and still manual: **Stripe.js / the Payment Element**
(`confirmSetup` / `confirmPayment` are browser-only — the second trial bug lived
there), a signature Stripe itself delivered (needs a public URL or the Stripe CLI;
the suite constructs signatures per Stripe's documented scheme over real event
bodies instead), and completing Connect onboarding.

---

## 11. Studio addresses — the wildcard subdomain tier (**REQUIRED**)

Every studio is reachable at `<slug>.kova.4dl.app` from the moment it is created.
This is not optional and it is not the same thing as §11b: without the two pieces
below, **every studio on the platform is unreachable** while the deploy itself
reports success.

Why it can fail silently: the worker route `*.kova.4dl.app/*` is live as soon as
you deploy, but TLS is terminated *before* the worker runs. A missing certificate
means the handshake fails and nothing in your logs, your health check or your
deploy output says a word about it.

**Step A — Advanced Certificate Manager on the `4dl.app` zone.**
Universal SSL covers `4dl.app` and `*.4dl.app` — **one level only**, so it does
NOT cover `acme.kova.4dl.app`. You need an advanced certificate that includes the
second-level wildcard.

- Dashboard → the `4dl.app` zone → **SSL/TLS → Edge Certificates → Order Advanced
  Certificate**.
- Hosts: add **`*.kova.4dl.app`** and **`kova.4dl.app`**.
- Validation: TXT. Certificate authority: leave as offered.
- ~$10/month for the zone. One certificate can carry the wildcards for *every*
  product you later put on this zone (`*.otherapp.4dl.app`, …), so this is a
  one-time cost, not a per-product one.

**Check:** `curl -sI https://anything.kova.4dl.app/health` completes the TLS
handshake (any HTTP status is fine — a certificate error is not). Until the cert
shows **Active** you will get `SSL_ERROR_*` / `curl: (35)`.

**Step B — a proxied wildcard DNS record.**
Dashboard → `4dl.app` → **DNS → Records → Add record**:

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| `AAAA` | `*.kova` | `100::` | **Proxied** (orange cloud) |
| `AAAA` | `kova` | `100::` | **Proxied** (orange cloud) |

`100::` is the IPv6 discard prefix — the standard "originless" target for a
hostname served entirely by a Worker. The record exists only so the name resolves
through Cloudflare and the route can fire; nothing is ever sent to that address.

**Check:** `dig +short AAAA acme.kova.4dl.app` returns Cloudflare anycast
addresses (not `100::` — the proxy replaces it).

> If your plan refuses a **proxied** wildcard record, fall back to creating one
> proxied `AAAA <slug>.kova → 100::` per studio via the Cloudflare API at studio
> creation. `apps/api/src/cloudflare.ts` already holds an authenticated API client
> you can extend; the wildcard is simply the version with no per-tenant work.

**Step C — the two Worker routes.**
Dashboard → **Workers & Pages → kova → Settings → Domains & Routes → Add route**:

| Route | Zone |
| --- | --- |
| `kova.4dl.app/*` | `4dl.app` |
| `*.kova.4dl.app/*` | `4dl.app` |

These are **not** in `wrangler.jsonc`, deliberately — declaring them there makes
`wrangler dev` discard the incoming `Host` and rewrite every request to the route's
hostname, which collapses every door onto the root and makes local development and
the E2E suite unable to reach a studio subdomain at all. The header block in
`apps/api/wrangler.jsonc` explains it in full. `wrangler deploy` never removes
routes it does not declare, so once these exist every deploy keeps them.

Create them **after** Steps A and B. A route without the certificate is worse than
no route: it is live immediately and every studio subdomain then fails the TLS
handshake before the worker runs.

**Check:** `curl -s https://kova.4dl.app/health` returns `{"ok":true,...}`, and so
does `curl -s https://anything.kova.4dl.app/health`.

**Step D — three vars, one of them easy to miss.**
`wrangler.jsonc` sets `ROOT_DOMAIN` and `BETTER_AUTH_URL`. If you serve under a
different apex, change **both**, and change the two `routes` patterns to match.
Getting `ROOT_DOMAIN` wrong does not error — it reclassifies every studio
subdomain as a foreign custom domain, so each one resolves no tenant and answers
404. The symptom is "all studios 404, the root works fine".

**Check, end to end:** create a studio at `https://setup.kova.4dl.app`, then open
`https://<its-slug>.kova.4dl.app` — you should get that studio's branded login.
`https://kova.4dl.app` should show the signpost, and
`https://nothing-here.kova.4dl.app` should say there is no studio at that address.

### What the doors are

| Host | Serves |
| --- | --- |
| `kova.4dl.app` | a signpost. Not an app, and it refuses to send a sign-in code. |
| `setup.kova.4dl.app` | the only place a studio is created. |
| `admin.kova.4dl.app` | the operator console. `/api/admin/*` answers **here only**. |
| `<slug>.kova.4dl.app` | a studio. |
| a tenant's own domain | the same studio (§11b). |
| anything else under the root | nothing — reserved labels and deeper nesting 404. |

Studio slugs become DNS labels, so they are validated server-side against a
reserved-label list (`@kova/domain` `RESERVED_LABELS`). Adding a label to that
list is cheap; removing one later changes a live studio's URL and breaks every
link its clients hold — so it errs toward reserving.

## 11b. Custom domains (Cloudflare for SaaS) — tenant white-label

Tenants can run the app on **their own domain** (e.g. `train.byshujaa.com`).
Auth is per-domain (Model A, SPEC §14.1): each domain is its own WebAuthn RP and
cookie jar, the `Host` header pins the tenant, and only members of that tenant
get scope on it. No code change is needed to add a tenant — it is all runtime
config + DNS.

This tier is **additive**. Every studio already answers at its subdomain (§11), so
a custom domain that is half-provisioned, mis-CNAMEd or stuck behind a CAA record
is an inconvenience rather than an outage — the studio keeps working at
`<slug>.kova.4dl.app` throughout, and `canonicalHost` falls back to it for every
emailed link.

### One-time platform setup — first time through

Do these in order; each step's "check" tells you it worked before you move on.
Budget ~30 minutes, most of it waiting for a status to flip.

**Step 0 — know your zone.** Everything below happens on the zone that serves the
platform host. For `kova.4dl.app` that zone is **`4dl.app`**. Your marketing site
is a different zone and is not involved.

**Step 1 — nothing to do; the routing is automatic.**

Worth understanding, because it is the part that silently breaks otherwise. A
Cloudflare route is matched by hostname, and a tenant's domain is not in your
zone — so the worker's own routes (`kova.4dl.app/*`, `*.kova.4dl.app/*`) never
match `train.byshujaa.com`. Without a route the certificate issues, the DNS resolves,
and every request still dies: the worker never runs, and the fallback origin is
originless by design.

Cloudflare documents a zone-wide `*/*` route for this. **We deliberately do not
use it**: this zone hosts unrelated apps, and `*/*` would route every one of them
into Kova. Excluding them by hand is worse — a new app on the zone starts serving
Kova the day someone forgets an exclusion, and the blast radius is another
product.

Instead Kova creates **one worker route per registered hostname** and deletes it
with the domain (`createWorkerRoute` / `deleteWorkerRoute` in `cloudflare.ts`).
Nothing on the zone is touched that a tenant did not explicitly bring, and the
route's lifetime is exactly the domain's. This is why the token in Step 5 needs a
second permission.

**Step 2 — enable Cloudflare for SaaS.** Dashboard → the zone → **SSL/TLS** →
**Custom Hostnames** → *Enable*.

*Check:* the Custom Hostnames page loads and shows an empty list plus a Fallback
Origin field.

**Step 3 — create the fallback origin as an ORIGINLESS record.**

This is the step the old version of this doc got wrong. Do **not** CNAME the
fallback origin at the worker's hostname. When the origin is a Worker, Cloudflare
documents an originless record — the Worker route from Step 1 is what actually
serves the request, so the record only needs to exist and be proxied:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| AAAA | `saas` | `100::` | **Proxied** (orange cloud) |

`100::` is the IPv6 discard prefix — it deliberately routes nowhere.

Then Custom Hostnames → **Fallback Origin** → enter `saas.4dl.app` → Add.

*Check:* the fallback origin shows **Active**. It sits at "Pending" for a minute
or two first; wait for Active before testing a tenant domain.

**Step 4 — pick the CNAME target you hand to tenants.** This is what a tenant
puts in their DNS. `saas.4dl.app` works. Whatever you choose, it must be a
proxied hostname on this zone — write it down for Step 6.

**Step 5 — create a scoped API token.** Dashboard → **My Profile** → **API
Tokens** → *Create Token* → *Custom token*:

- Permission 1: **Zone · SSL and Certificates · Edit** — registers the hostname
  and issues its certificate.
- Permission 2: **Zone · Workers Routes · Edit** — points that hostname at this
  worker. Without it, `POST /api/domains` fails with a Cloudflare permission error
  and rolls the hostname back rather than leaving one that can never serve
  traffic.
- Zone Resources: **Include · Specific zone ·** your zone

Scope it to the one zone. This token can issue certificates — do not use a global
key, and do not reuse it elsewhere.

*Check:* Cloudflare shows the token once. Copy it now; you cannot read it again.

**Step 6 — enter the three values in Kova.** Platform admin → **Domains**:

| Field | Value | Where it came from |
|-------|-------|--------------------|
| API token | the token from Step 5 | shown once at creation |
| Zone id | the zone's id | zone **Overview** → right sidebar → *Zone ID* |
| CNAME target | e.g. `saas.4dl.app` | your choice in Step 4 |

Optional: `cf.saas.worker_name` overrides which worker script the per-hostname
routes point at. It defaults to `kova`, matching `wrangler.jsonc`'s `name` — set
it only if you rename the worker, otherwise every newly added domain would route
at a script that no longer exists.

Stored in `app_config` as `cf.saas.*`. Until all three are set,
`saasConfig()` returns null and the owner-facing domain UI answers
**503 "custom domains aren't enabled on this platform yet"** — which is the
expected response before setup, not a fault.

*Check:* as a studio owner, Settings → Custom domain no longer 503s.

**Step 7 — prove it with one real domain** before telling any tenant it exists.
Use a domain you control. Follow the per-tenant flow below end to end and confirm
you can sign in on it. Expect the certificate to take a few minutes after the DNS
records resolve.

**Cost:** Cloudflare for SaaS includes a number of custom hostnames on paid plans
and bills per hostname beyond it. Check the current figure on Cloudflare's pricing
page before you promise custom domains on a plan tier — this doc deliberately does
not quote a number that will go stale.

### What a tenant hits, and what the screen now tells them

Three obstacles account for nearly every domain stuck at "Pending". The app
surfaces Cloudflare's own error text plus a ready-to-add record for the CAA case,
so an owner should not need this section — it is here for when they ask you.

**1. The host field got the full hostname.** Most registrars append the zone, so
`coaching.byshujaa.com` in Namecheap's Host field creates
`coaching.byshujaa.com.byshujaa.com`. The record exists, just not where anyone is
looking. Enter the relative name: `coaching`, `_acme-challenge.coaching`.

**2. Only one `_acme-challenge` TXT was added.** Cloudflare can require TWO — same
name, different values — when it is issuing more than one certificate, and NONE of
them validate until ALL are present. DNS allows multiple TXT records at one name;
they go in as separate rows, not one replacing the other. (The app used to show
only the first — fixed; it now labels them "record 1 of 2".)

**3. A CAA allow-list blocks Cloudflare's CA.** If the tenant's domain has CAA
records naming specific authorities, and Cloudflare's is not among them, issuance
is refused outright:

> CAA records block issuance. Please remove all CAA records or add records for
> this authority (ssl.com)

The fix is a CAA record at the tenant's **domain root**, adding that authority to
the list:

| Type | Host | Flags | Tag | Value |
|------|------|-------|-----|-------|
| CAA | `@` | `0` | `issue` | `ssl.com` (whatever Cloudflare named) |

It **cannot** go on the custom hostname itself: that name is a CNAME, and DNS
forbids other records alongside a CNAME. It has to be the apex.

Do not hardcode the authority — Cloudflare has used Let's Encrypt, Google Trust
Services and SSL.com for different certificate packs at different times. The app
reads it out of Cloudflare's message and renders the exact record, which is why
this stays correct when Cloudflare changes CA.

**Per-tenant flow (self-serve):** owner → Settings → **Custom domain** → enter
hostname → the app registers a CF custom hostname and shows the **CNAME** +
**DCV TXT** records → owner adds them at their DNS → "Check now" polls until the
cert issues → status flips to **Live**. Removing the domain deregisters it.

Notes: the worker is host-agnostic (`host-context.ts` reads `Host`), so no code
changes per tenant — but each hostname DOES need its own worker route, which
Kova creates and removes for you (Step 1). `BETTER_AUTH_URL` stays the platform origin; the
request origin drives auth on custom domains. Because passkeys are origin-bound,
a user in more than one tenancy enrolls a passkey per domain (OTP is always the
bootstrap).

---

## 12. Turnstile (bot check on login) — optional but recommended

Off until configured, so codes send freely before setup — and OTP send has no
per-IP limit while it is off.

1. Dashboard → **Turnstile** → **Add widget**. Under **Hostnames** add your
   platform host and every tenant custom domain (Turnstile validates the
   hostname the widget runs on); a domain-flexible widget saves you editing it
   per new tenant domain.
2. Copy the **Site key** (public) and **Secret key** (server).
3. Platform admin → **Security** → paste both → **Save**.

The site key rides along in `/api/host` so login can render the widget; the
secret stays server-side and `turnstile.ts` accepts a token only when the solved
hostname matches the serving host — which is what makes it work on a tenant's
own domain. Clear the secret to disable.

---

## 13. Rollback

**Code rolls back. Data does not.**

```sh
cd apps/api && pnpm exec wrangler rollback            # previous version of the api worker
cd apps/www && pnpm exec wrangler rollback            # www is a SEPARATE worker — roll back both
```

Or revert the commit on `main` and let the Deploy workflow ship it.

What rollback does **not** undo:

- **The D1 schema is forward-only.** `ensureSchema` has no `down` path; added
  tables/columns stay. Rolling code back is safe *only* while the older code
  tolerates the newer schema (added columns are additive, so usually yes). A
  destructive schema change would need a hand-written repair — take a backup
  first: `pnpm exec wrangler d1 export mossa --remote --output kova.sql`.
- **Durable Object migrations** (`migrations` in `wrangler.jsonc`) do not
  reverse. Never delete a `new_sqlite_classes` tag that has shipped.
- **`app_config` values, R2 objects and Stripe state** are untouched by a
  rollback.
- **Better Auth sessions** survive (the secret is not rewritten) — a rollback
  does not log anybody out.
- The api worker and www worker roll back **independently**; check both are on
  the commit you intend.

---

## 14. Known operational gaps

Be aware of these before launch; none are fixable from this document:

- **No email admin UI.** `email.*` config is D1-only (section 6).
- **The AI mock lane can be forced on in production** via `ai.mock = on` and
  will bill credits for fabricated output. Leave it on `auto`.
- **`/health` is liveness-only** — it never touches D1, so it will report
  healthy with a broken database binding. Monitor a real API route instead.
- **Cron money paths swallow errors**; observability is on, so watch the logs
  for the `*/15`, `10 0 * * *` and `0 8 * * 1` triggers.
- There is no data-export route yet (SPEC §11 promises one) and the
  `integrations` entitlement (API/webhooks/exports) is declared but not
  implemented.
