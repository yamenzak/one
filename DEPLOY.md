# Deploying Mossa

CI/CD is wired: **every push to `main` runs typecheck + tests, builds the app,
and deploys the api worker + www to Cloudflare** (`.github/workflows/deploy.yml`).
It won't work until the one-time setup below is done, because `wrangler.jsonc`
ships with placeholder resource ids.

## One-time setup (~15 min)

### 1. Create a Cloudflare API token
Dashboard → My Profile → API Tokens → Create Token → **Edit Cloudflare Workers**
template, then add permissions: **D1 Edit**, **Workers KV Storage Edit**,
**Workers R2 Storage Edit**. Scope it to your account (FOURDEGREE LABS).

### 2. Store the two repo secrets (for the deploy workflow)
```sh
gh secret set CLOUDFLARE_API_TOKEN  --repo yamenzak/mossa    # paste the token
gh secret set CLOUDFLARE_ACCOUNT_ID --repo yamenzak/mossa    # your account id
```
(Each prompts for the value on stdin. Or add `--body "<value>"`.)

### 2b. Set the auth secret ONCE on the worker (not per-deploy)
Better Auth signs session cookies with this; **the deploy workflow deliberately
does not touch it**, because re-putting it every deploy would invalidate all
sessions and force everyone to re-auth. Set it once — it persists across
deploys:
```sh
cd apps/api && openssl rand -base64 32 | pnpm exec wrangler secret put BETTER_AUTH_SECRET
```
(Already done for the current `mossa` worker. Only re-run to rotate the key —
which intentionally logs everyone out.)

### 3. Provision the D1 / KV / R2 resources
GitHub → **Actions → "Provision Cloudflare resources" → Run workflow**. It
creates the D1 database (`mossa`), KV namespace (`CACHE`), and R2 bucket
(`mossa-media`), then prints their ids in the run summary.

### 4. Paste the ids into `apps/api/wrangler.jsonc`
Replace the placeholders:
- `d1_databases[0].database_id` → the D1 uuid
- `kv_namespaces[0].id` → the KV id

Commit + push. The **Deploy** workflow runs and publishes to `mossa.4dl.app`
(the app + api) and `getmossa.4dl.app` (www). The `4dl.app` zone must be on the
account (it is — same account as scena).

## Testing after deploy

**OTP email:** until the sender domain is onboarded in Cloudflare Email Sending,
codes don't get delivered — but they're logged. Read yours with:
```sh
cd apps/api && pnpm exec wrangler tail mossa
```
Then sign in, create your studio, open the account menu → **Platform admin →
Seed demo data** for instant sample clients/plans. (Your email is already in
`ADMIN_EMAILS`, so you're the platform admin.)

To deliver OTP to real users: onboard a sender domain under Cloudflare → Email →
Email Sending, then set `email.provider = cloudflare` and `email.from` in the
`app_config` table (admin console Stripe tab is the pattern; a small config UI
can be added).

## Notes
- The Workers AI binding is commented out in `wrangler.jsonc` for
  credential-free local dev; the Deploy workflow uncomments it automatically.
- Stripe stays disabled until you set keys via the platform-admin console
  (Stripe tab) and run **Sync catalog**.
- Rollback: `cd apps/api && pnpm exec wrangler rollback` (or redeploy an older
  commit).
