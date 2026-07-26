# Deploying Mossa

One worker (`mossa`) serves the API **and** the app SPA; a second worker
(`mossa-www`) serves the marketing site. CI/CD is wired: every push to `main`
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
| ~25 | `routes[0].pattern` | `mossa.4dl.app` (a `custom_domain` route) | a hostname on a zone **you** control. The deploy fails if the zone isn't on your account |
| ~34 | `vars.ADMIN_EMAILS` | `zakhouryamen@gmail.com` | your platform-admin email(s), comma-separated. This is the platform super-admin allowlist — get it right before the first sign-in |
| ~36 | `vars.BETTER_AUTH_URL` | `https://mossa.4dl.app` | `https://<your route hostname>` |
| ~58 / ~64 | `kv_namespaces[0].id`, `d1_databases[0].database_id` | **real live ids** belonging to the original account | your own ids, from step 4 |

Also review `apps/www/wrangler.jsonc` (`routes[0].pattern` =
`getmossa.4dl.app`).

`ENVIRONMENT` must **not** appear in the `vars` block — see step 8.

---

## 3. Create a Cloudflare API token + store the repo secrets

Dashboard → My Profile → API Tokens → Create Token → **Edit Cloudflare Workers**
template, then add: **D1 Edit**, **Workers KV Storage Edit**, **Workers R2
Storage Edit**. Scope it to your account.

```sh
gh secret set CLOUDFLARE_API_TOKEN  --repo <owner>/mossa
gh secret set CLOUDFLARE_ACCOUNT_ID --repo <owner>/mossa
```

**Exactly two repo secrets.** `BETTER_AUTH_SECRET` is deliberately *not* a repo
secret — it is a worker secret you set once by hand in step 5. Setting it as a
third GitHub secret does nothing.

---

## 4. Provision D1 / KV / R2 and paste the ids

GitHub → **Actions → "Provision Cloudflare resources" → Run workflow** (or run
the same three commands locally):

```sh
cd apps/api
pnpm exec wrangler d1 create mossa
pnpm exec wrangler kv namespace create CACHE
pnpm exec wrangler r2 bucket create mossa-media
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
pnpm --filter @mossa/app build
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
  ('email.from', 'Mossa <noreply@yourdomain.com>'),
  ('email.platform_from', 'Mossa <billing@yourdomain.com>')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
"
```

Replace both addresses with senders you have **onboarded and verified** in
Cloudflare → Email → Email Sending. The defaults are useless in production:
`email.from` defaults to `Mossa <noreply@mossa.local>` (an invalid domain) and
`email.platform_from` to `Mossa <noreply@fourdegreelabs.com>` (a domain you
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

## 9. Runtime configuration reference (`app_config` in D1)

Everything here is admin-editable at runtime and lives in the `app_config` D1
table — never in the bundle. Most of it has a platform-admin UI; the ones that
do not are marked, and are set with `wrangler d1 execute --remote` exactly as in
section 6.

| Key | Default | If unset | Where to set it |
| --- | --- | --- | --- |
| `email.provider` | `mock` | **Nobody can sign in.** Mock fails closed outside dev: no send, no log | ⚠️ no UI — D1 (section 6) |
| `email.from` | `Mossa <noreply@mossa.local>` | Sends from an invalid domain → bounces/rejects | ⚠️ no UI — D1 |
| `email.platform_from` | `Mossa <noreply@fourdegreelabs.com>` | Platform/billing email sends from a domain you don't own | ⚠️ no UI — D1 |
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

**1. Platform rail** — Mossa's own revenue (tenant subscriptions, credit packs).

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

---

## 11. Custom domains (Cloudflare for SaaS) — tenant white-label

Tenants can run the app on **their own domain** (e.g. `train.byshujaa.com`).
Auth is per-domain (Model A, SPEC §14.1): each domain is its own WebAuthn RP and
cookie jar, the `Host` header pins the tenant, and only members of that tenant
get scope on it. The platform host stays the neutral entry + `/t/<slug>`
fallback + platform admin. No code change is needed to add a tenant — it is all
runtime config + DNS.

**One-time platform setup:**

1. **Enable Cloudflare for SaaS** on your zone (Dashboard → the zone → SSL/TLS →
   Custom Hostnames → *Enable*). Set a **Fallback Origin** to a proxied record
   resolving to the `mossa` worker (e.g. `ssl.<host>` → CNAME `<host>`,
   orange-cloud on). That hostname is what tenants CNAME to.
2. **Create a scoped API token** — permission **Zone · SSL and Certificates ·
   Edit** on that zone.
3. **Enter the credentials in-app** — Platform admin → **Domains**: the API
   token, the **Zone id**, and the **CNAME target**. Stored in `app_config`
   (`cf.saas.*`).

**Per-tenant flow (self-serve):** owner → Settings → **Custom domain** → enter
hostname → the app registers a CF custom hostname and shows the **CNAME** +
**DCV TXT** records → owner adds them at their DNS → "Check now" polls until the
cert issues → status flips to **Live**. Removing the domain deregisters it.

Notes: the worker is host-agnostic (`host-context.ts` reads `Host`), so no
per-domain route is needed. `BETTER_AUTH_URL` stays the platform origin; the
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
  first: `pnpm exec wrangler d1 export mossa --remote --output mossa.sql`.
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
