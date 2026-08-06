# Bringing Scena onto the platform

A rewrite plan. Written after reading Scena at `0cff6c6` (45,556 lines of
TS/TSX across 4 apps and 6 packages) against this repo's fourteen shared
packages.

---

## 1. What Scena is

Cloud digital-signage SaaS on Cloudflare. You pair a browser-based screen, give
it a display, and it plays slides / music / widgets — frame-synced across every
screen, offline-resilient, scheduled by time of day, versioned and
rollback-able, with live queue/room boards, emergency override, proof-of-play
and health alerting.

The architectural idea the whole product rests on is one line:

```
position(t) = (t − T0) mod cycleLength
```

The server never says "show slide 3 now." Playout is a deterministic function
of a synchronised clock, so multi-screen sync, offline playback and live
updates are all the same mechanism rather than three features. Measured
cross-screen skew: 0.3 ms over 148 samples.

**That idea is the asset, and nothing in this plan touches it.**

---

## 2. What is actually there

| Area | Lines | Files |
|---|---:|---:|
| `apps/dashboard` | 21,910 | 91 |
| `apps/api` | 13,291 | 67 |
| `apps/player` | 3,739 | 24 |
| `packages/widgets` | 3,285 | 19 |
| `packages/manifest` | 981 | 9 |
| `packages/timeline` | 900 | 8 |
| `packages/protocol` | 599 | 6 |
| `packages/ui` | 480 | 4 |
| `packages/brand` | 371 | 3 |
| **Total** | **45,556** | **231** |

Six Durable Objects: `ScreenDO`, `ChannelDO`, `QueueDO`, `RoomBoardDO`,
`ScoreDO`, `TenantBillingDO`. 33 D1 tables. 27 test files.

**Three findings that shape the plan:**

1. **The README is stale in one load-bearing place.** It says "tenancy is
   single-user multi-tenancy — each tenant is one owner account (no
   teams/sub-users)". The code disagrees: `auth-context.ts` resolves a Better
   Auth **organization**, a **role** (`owner`/`operator`/`receptionist`/`viewer`)
   and a per-member **permission grant**. Scena already made the move this
   platform made. That is good news — the auth swap is smaller than the doc
   implies — but every other claim in that README now needs verifying before it
   is carried into new docs.

2. **There is no host layer at all.** No hostname handling, no subdomains, no
   custom domains, no maintenance switch. One door, one dashboard origin. This
   is the single biggest capability gap and the one `@4dl/tenancy` closes for
   free.

3. **There is no E2E suite.** 27 unit/integration test files for 45k lines, and
   zero Playwright specs. Kova's E2E golden paths exist because the integration
   suite is structurally blind to a whole class of bug (the client persona's
   first write 403'ing). Scena has a *harder* version of that problem — its
   product is two browsers agreeing on a clock — and no test drives two real
   screens.

---

## 3. The three-way split

### 3a. Keep — Scena's own, and the reason it exists

These are not "legacy code to be modernised". They are the product.

| What | Lines | Why it stays |
|---|---:|---|
| `@scena/timeline` | 900 | The pure clock/timeline engine. Zero deps, byte-identical in compiler, player and tests. Port as-is. |
| `@scena/manifest` | 981 | Zod schema + canonical JSON + SHA-256 content hashing. The compiled-playout contract. |
| `@scena/widgets` | 3,285 | Pure widget core, shared by the player's DOM renderer and the builder's React preview. The reason a widget looks identical in both. |
| `@scena/protocol` | 599 | screen⇄DO and board WS message types. |
| The player | 3,739 | Dependency-free by design (its `package.json` lists only workspace packages). A TV render loop + Service Worker needs full control. **Do not put React or `@4dl/app-kit` in it.** |
| `ScreenDO` / `ChannelDO` / `QueueDO` / `RoomBoardDO` / `ScoreDO` | ~1,050 | Runtime authority. Hibernatable sockets, alarms, epoch stamping. Nothing shared replaces these. |
| The widget builder | ~4,000 | The custom pointer-driven transform controller. Exact geometry at any zoom/rotation, touch-native. Genuinely differentiating. |
| Device pairing / claim | ~200 | Device identity. **Not** user auth — see §4.2. |

**~14,750 lines carried forward**, mostly unchanged.

### 3b. Rewire — infrastructure this platform already owns

| Scena today | Lines | Replaced by |
|---|---:|---|
| `auth.ts`, `auth-context.ts`, `access.ts`, `perms.ts`, `route-guard.ts`, `members.ts` | ~900 | `@4dl/auth` — factory, five-gate guard engine, grant algebra, staff routes + seats |
| `entitlements.ts`, `billing-do.ts`, `billing-store.ts`, `billing-routes.ts`, `billing-seed.ts`, `credits.ts`, `stripe.ts` | ~2,000 | `@4dl/billing` (engine, catalog store, credit DO, dunning) + `@4dl/billing-rail` |
| `ai.ts`, `gemini.ts` | ~1,130 | `@4dl/ai` — model catalog, providers, reserve→run→settle, mock lane, pricing parsers |
| `db.ts` (runner half) | ~200 | `@4dl/core` composed schema runner + `app_config` + shared platform config |
| `media-store.ts` + R2 paths | ~300 | `@4dl/storage` — R2, media ledger, quota gate, the three media routes |
| email plumbing | ~200 | `@4dl/email` |
| alert *delivery* | ~200 | `@4dl/notify` — channel algebra, dispatch, InboxDO |
| `Admin.tsx` | 1,448 | `@4dl/admin` — section registry + the panels for shared config |
| `@scena/ui` | 511 | `@4dl/ui` |

**~6,900 lines deleted**, replaced by packages that are already tested, already
have conformance guards, and are already maintained for two other products.

The swap is unusually clean because Scena and Kova share a lineage: Scena's
`entitlements.ts` header ("quotas / gates / credits, enforced on write") and its
`TenantBillingDO` (`reserve → settle → release`, DO storage mirrored to a D1
ledger) describe the *same design* `@4dl/billing` generalised. Even the DO class
name matches.

### 3c. Gain — capabilities Scena does not have

Free, or nearly, by being on the platform:

- **Five doors** (`@4dl/tenancy`) — signpost / setup / admin / tenant subdomain /
  the tenant's own custom domain, with DNS-safe slug validation and reserved
  labels.
- **Custom domains** — Cloudflare for SaaS, per-domain WebAuthn RP.
- **Maintenance mode** — deployment-wide read-only or full close, with the
  operator-door exemption.
- **The standing ladder** — past_due → 7d read-only → 30d blocked → 37d purged,
  driven by one daily sweep, enforced once in the route guard.
- **Passkeys** — `@4dl/app-kit`'s ceremony + `PasskeysCard`, on every door.
- **The notification inbox** — InboxDO, hibernating WebSockets, the bell, the
  channel algebra. Scena's alerting currently has delivery but no inbox.
- **Derived GDPR purge** (`@4dl/purge`) — erasure derived from each module's
  `scoped` declaration, with the two conformance checks that make a forgotten
  table a test failure.
- **Shared platform config** — one Google key, one Stripe account, one Turnstile
  widget across every 4DL app, set once.
- **The billing rail** — one Stripe account, many apps, with `metadata.app`
  attribution and a dead letter for unattributable events.
- **The design language** — UI-LANGUAGE.md plus the conformance lints that keep
  it honest.
- **CI, deploys and provisioning** — an `apps.json` entry and a workflow run.

---

## 4. Six decisions to make before writing code

These are the places where Scena does not fit the platform's assumptions. Each
needs an answer; my recommendation is given, but they are yours.

### 4.1 The player's origin is not a tenant door — *recommend: a sixth door*

`@4dl/tenancy` resolves a tenant from the **hostname**. A screen cannot work
that way: it is pinned to one URL, Service-Worker-cached, and runs for months
without a network. Its tenant comes from its **pairing**, not its host.

Forcing the player through `resolveHost` would either give every tenant's
screens a different origin (breaking the SW cache on re-pair, and multiplying
custom-domain certificates by the fleet) or resolve nothing.

**Recommendation:** add a `device` door to `@4dl/tenancy` — one fixed origin
(`play.scena.4dl.app`) that resolves *no* tenant and is exempt from the host
gate, with the tenant arriving from the claim. This is the same shape as the
existing `admin.` exemption, and it belongs in the shared package because any
future device-shaped product needs it.

### 4.2 Device identity is a third axis — *recommend: keep it Scena's*

`@4dl/auth` is about people: sessions, orgs, roles, grants. A screen has a claim
token, no session, no person, and must keep playing when nobody is signed in.

**Recommendation:** do not model screens as users. Keep pairing/claim in the
app. What *should* be shared is the small primitive underneath — a scoped,
revocable, non-session bearer token — because **Stations need it too** (§4.3).
Propose `@4dl/auth/tokens`: mint / verify / revoke / scope, with the *meaning*
of a scope left to the app.

### 4.3 Stations are a fourth identity — *recommend: fold into the token primitive*

Scena's `board_users.ts` already moved stations from public tokens to real
board-scoped **users** who sign in. That is defensible (auditable, revocable)
but it puts a receptionist through a full OTP sign-in to press "Next".

**Recommendation:** decide deliberately, and say which in the docs. Either
(a) keep them as users and accept the sign-in, gaining audit and the existing
grant algebra; or (b) move them to the §4.2 token primitive and accept that a
call is attributable to a *station*, not a person. I lean (a) — it is already
built, it is more honest about who did what, and a station signs in once on a
device that stays signed in.

### 4.4 The compile-time entitlement gate must survive — *recommend: keep both*

Scena enforces entitlements **twice**: on write (dashboard quota checks) and at
**manifest compile** (a gated feature never reaches a screen). Our engine is
request-time only.

The compile-time gate is the stronger one and it is not redundant: a manifest is
a cached artifact served to a device that may replay it offline for weeks, so a
plan downgrade must strip the feature *from the artifact*, not merely refuse the
next request.

**Recommendation:** keep it, and wire it to `@4dl/billing`'s resolver so both
gates read one source. Add a conformance test asserting every gated feature is
checked at compile as well as at write — the sibling of
`entitlement-enforcement.test.mjs`.

### 4.5 The builder is exempt from parts of the design language — *say so explicitly*

UI-LANGUAGE.md is written for a phone-first product app: rows, sheets, one
primary action, facets collapsing to one button. A canvas with a transform
controller, marquee select, align/distribute and z-order is a **pro tool**, and
several §7 rules do not apply to it.

**Recommendation:** write the exemption down rather than letting it be argued
per-PR. The builder follows the tokens, the motion registry, the loading rules
and the copy budget; it does *not* follow the row grammar or the one-primary-
action rule. Everything outside the canvas does.

### 4.6 What happens to screens when a tenant stops paying — *recommend: reads never stop*

Kova's rule is "reads are NEVER gated, at any rung — withholding the product is
not the same as holding a client's logbook over their coach's invoice." Scena's
equivalent question is sharper: a suspended tenant's screens are *in a waiting
room*, in public.

Scena today shows a holding card. That is the right answer and it matches the
platform's ladder, but the mapping needs stating: `readOnly` = keep playing,
refuse publishes; `blocked` = holding card; and **emergency override is never
paywalled at any rung** (Scena already got this right).

---

## 5. The staged plan

Ordered so each stage is independently green and independently useful. This
mirrors the ten-stage platform extraction, which worked.

### Stage 0 — Land it, unchanged, and make it green
Bring Scena in as `apps/scena-api`, `apps/scena-dashboard`, `apps/scena-player`,
`apps/scena-www` and `packages/scena-*`, with its own `apps.json` entry. No
rewiring yet. Get `pnpm typecheck` and `pnpm test` passing in *this* workspace,
under this repo's stricter tsconfig.

*Exit:* the whole suite green, CI lanes running, nothing rewired.
*Why first:* every later stage needs a baseline that is known-green here. Doing
this after a rewire means never knowing which change broke what.

### Stage 1 — `@4dl/core`: schema, config, ids
Move Scena's 33 tables onto the composed schema runner as a `SchemaModule`.
Adopt `app_config` and the shared platform config store.

*Exit:* schema-module conformance tests pass; the Google/Stripe/Turnstile keys
resolve from the shared KV.

### Stage 2 — `@4dl/auth` ✅ DONE

Landed: the auth factory (`auth.ts`), the role registry and its DERIVED grant
presets (`access.ts` + `perms.ts`), staff routes + seats + passkeys
(`member-routes.ts`), and `members.ts` reduced to what survives. Better Auth's
seven tables moved to `AUTH_SCHEMA`, which also brought `passkey`, `auth_logs`
and `action_otps`.

**Password sign-in for people is gone**, along with magic links and Google.
Staff are invited by email. Only STATIONS hold a credential — §4.3's option (a),
via `@4dl/auth`'s opt-in `stationCredentials` lane on the non-routable
`@bd.scena` suffix. §4.2's token primitive was NOT built: nothing needs it once
stations stay accounts.

**Two things moved OUT of this stage, both because of a dependency:**

- `auth-context.ts` and `route-guard.ts` stay Scena's own until **Stage 3**.
  `@4dl/auth`'s session middleware and six-gate guard both read
  `c.get("host")` — a `@4dl/tenancy` resolution — so swapping them before the
  host model exists is not possible, and pretending otherwise would mean
  building a fake host to satisfy an import.
- The `routes` block in `wrangler.jsonc` collapses every door onto one hostname
  under `wrangler dev` (CLAUDE.md documents this; Kova removed its own for the
  same reason). Visible already — a dev invitation link points at
  `scena.4dl.app` — and it belongs with the doors in Stage 3.

*Exit met:* sign-in, org create, staff roster, seat ceiling, station credential
and per-member grant all verified over real HTTP against a fresh D1 — see the
integration suite below.

### Stage 2b — the integration harness, pulled forward from Stage 8

Not in the original plan, and it should have been. Scena arrived with 141 unit
tests and no way to run its worker, so Stage 2 was verified by hand against
`wrangler dev` — and that hour found **four defects that every unit test and the
typechecker passed straight through**:

| Defect | Why nothing saw it |
|---|---|
| the station lane also opened Better Auth's PUBLIC `sign-up/email`, so a stranger could register a password account on a routable address | `autoSignIn: false` withholds the token on the sign-up response, so the endpoint reads as though it refused |
| `app_config.updated_at` never existed, so a FRESH deployment could not seed its catalog or save any setting | `@4dl/core` bootstraps the table first, so the app's wider `CREATE … IF NOT EXISTS` is a silent no-op — and an EXISTING database works perfectly |
| `assets.directory` pointed at the old repo's SPA path | `wrangler dev` refuses to start on it; a deploy does not |
| a module cycle resolved `PLATFORM_FROM_DEFAULT` to `undefined` at init | surfaces as `D1_TYPE_ERROR` from the seed, which reads as a database problem |

`apps/scena/test/integration.test.ts` (15 tests, Miniflare, real D1) now covers
all four plus the seat ceiling, the station sign-in, the bounded per-member
grant, and the removed enumeration routes. Every remaining stage moves schema
and routes; none of them should have to be found by hand.

### Stage 3 — `@4dl/tenancy` ✅ DONE
Five doors + the new `device` door (§4.1). Subdomains, custom domains, slug
validation, the standing/host gate, maintenance.
Wire §4.6's screen-behaviour mapping.

Landed: `host-context.ts` (the adapter), `domain-routes.ts` (the host probe, the
slug guards, custom domains), `auth-context.ts` and `route-guard.ts` swapped onto
`@4dl/auth`'s engines, `TENANCY_SCHEMA` in the module list, `ROOT_DOMAIN` set,
and the `routes` block deleted.

**The change that matters is not the packages, it is where the tenant comes
from.** Scena resolved it from `session.activeOrganizationId` — a value Better
Auth stamps ONCE, at session creation, to the user's oldest membership. With one
origin that was the only source available. With a door per workspace it is a
hole: a person in two workspaces could open B's address, see B's brand, and have
every screen, channel and board call scoped to A, with nothing on screen to say
so and no route able to notice. The host pins the tenancy now and the session
only proves identity.

**The SIXTH door.** `@4dl/tenancy` gained an OPT-IN `device` role
(`SlugOptions.deviceLabel`, `DEFAULT_DEVICE_LABEL = "play"`). Opt-in matters:
`play` is not in `RESERVED_LABELS`, so making it universal would silently
reclassify a hostname a Kova studio can hold today. Declaring it also reserves
it, so no workspace can claim the origin the fleet is pinned to. In the guard the
device door resolves no tenant WITHOUT being treated as a failed resolution, and
it skips the standing gate — a screen in a public waiting room going dark because
its owner's card expired is a different act from a dashboard going read-only, and
it is Scena's decision to make where the manifest is compiled.

**Two things found by doing it:**

- `tenantOf(c)` fell back to `DEMO_TENANT` — a single-tenant leftover that turned
  "no tenancy" into "the demo workspace", so an unscoped request did not fail, it
  wrote into a real workspace's data. Forty-one routes call it and none checked.
  It now throws, which is safe because the guard refuses any request without a
  tenant and no public route calls it (checked).
- `/api/host` was not in the public lane, so the one read the app makes before it
  knows anything answered 401 on every door.

*Exit met:* the integration suite drives the REAL topology — sign-in on
`setup.localhost`, workspace behaviour on `<slug>.localhost`, the device door on
`play.localhost` — and covers the probe on each door, an unowned subdomain
serving nothing but the probe, the root refusing a workspace route, reserved
labels being refused as slugs, and a new workspace getting an ADDRESS rather than
just a row. 23 tests.

**Still outstanding here:** a suspended workspace's screens showing a holding
card. The gate is enforced and the device door is exempt from it; what a lapsed
workspace's screens actually DISPLAY is a manifest-compile decision, and the
compile-time entitlement gate is Stage 4's (§4.4). Custom domains are wired but
their capability gate reads a PROXY (the highest tier's unlimited library) rather
than a real `customDomain` flag — Stage 4 owns the catalog and should replace it.

### Stage 4 — `@4dl/billing` + `@4dl/billing-rail` ✅ MOSTLY DONE

Landed: the entitlements ENGINE, the credit DO, and the Stripe RAIL. What is
outstanding is named at the end.

**The engine brought three rules, and Scena had none of them.** Resolution now
coerces by type (an operator typo — `"aiGeneration": 1` — no longer switches on a
paid capability); overrides are GRANT-ONLY (the "gift" blob could previously TAKE
a feature away); and a suspended status CLAMPS to free. The third was a hole
rather than a nicety: `tenantEntitlements` resolved the plan whatever the
subscription said, under a comment claiming "playout is gated elsewhere" — which
describes the HOST gate, and that closes an origin rather than deciding
capability. A comped workspace is exempt, because the point of comping is that
the status does not decide.

**Four list features became six booleans.** `ticker`, `clock`, `weather` and
`alerting` were `string[]` variant allow-lists; the engine coerces a feature to a
boolean, so a list would have resolved `false` on every plan. Looking at what
each actually varied across the four plans showed they carried one real bit each
— plus three non-gates (`clock:digital`, `alerting:dashboard` were on EVERY plan)
and one dead option (`alerting:email`, granted by none). `FeatureKind` and
`options` are gone from `@scena/manifest` with them.

**The credit DO's balance is two buckets now**, and this changed a real number:
Scena's `grantMonthly` was a top-up on a single counter, so an unused monthly
grant ROLLED OVER FOREVER — a top-tier workspace banking 5,000 credits a month
and spending a year's worth in an afternoon. `purchased` persists, `granted` is
reset each period, and spending drains the grant first so nobody loses a credit
they paid for.

**The Stripe webhook had two money bugs**, both closed by the rail:

- **No idempotency at all** — no seen-set, no event-id check. Stripe retries on
  any non-2xx and occasionally redelivers a success, so every redelivery of a
  credit-pack `checkout.session.completed` ran `topUp` again.
- **`metadata.scena_tenant || DEMO_TENANT`** — an event with no Scena metadata
  was applied to a real workspace's plan, balance and dunning state.

*Exit:* 36 integration tests including four on the rail (signature,
grant-exactly-once across three deliveries, park-don't-guess, and the
customer-id `claims` path that stops metadata routing being a regression).
Mutation-tested.

**Still outstanding, and deliberately:**

- **The billing STORE stays Scena's.** `BILLING_SCHEMA`'s `plans`,
  `subscriptions`, `credit_packs` and `credit_ledger` have DIFFERENT COLUMNS
  from Scena's (`price_usd_month REAL` vs `price_cents` + `currency` +
  `interval`; `at` vs `created_at`; TEXT vs INTEGER timestamps). A
  `CREATE TABLE IF NOT EXISTS` is won by whichever module runs first and the
  loser's columns silently never exist — the exact `app_config.updated_at`
  failure this schema already carries a scar from. The store moves when its
  ~1,000 lines of queries do. `stripe_events` was added to Scena's own module
  because idempotency could not wait for that.
- **The DUNNING ladder** is still Scena's `lifecycleSweep`.
- **The compile-time entitlement gate** (§4.4) survives and now reads the clamped
  resolver, so both gates share one source — but the conformance test asserting
  every gated feature is checked at compile as well as at write is not written.

### Stage 5 — `@4dl/ai` + `@4dl/storage` ✅ DONE, and narrower than planned

Landed: the mock-lane gate, the credit meter, and the whole of storage. What did
NOT move is named at the end, with why.

**The mock lane was the reason this stage existed, and it was worse than the
note said.** Scena's `mockMode()` read `app_config["ai.mock"]` and nothing else
— no environment check in the function or at either call site — so THREE paths
fabricated slides, posters, voice clips and music beds on a deployed worker and
billed the workspace at the real model's rate for them:

- `ai.mock = "on"`, offered as an ordinary dropdown value on the Admin screen.
- **A missing `AI` binding.** `!env.AI` mocked unconditionally, and `AI` is
  optional in `env.ts` — so a deploy that dropped the binding did not fail, it
  started answering with stubs and invoicing for them.
- **A provider failure in `"auto"`**, which swallowed the real error and rendered
  a mock instead — precisely when an operator most needs to see it.

`shouldUseMockLane` (`@4dl/ai`) puts `ENVIRONMENT === "development"` outside all
three. The admin write path refuses `"on"` outside development too, because a
setting that reads as on and does nothing is how an operator comes to believe
they turned something on.

**`credits.ts` was a fork, one revision behind.** `@4dl/billing/credits.ts` IS
Scena's file — transplanted during the platform extraction and then hardened
against a non-finite or negative usage figure a provider might report. Scena kept
the unhardened original. Deleting it took 106 lines and 13 duplicate tests and
picked up the guards.

**Storage had no ledger, which means it had no anything.** Every R2 write was a
bare `MEDIA.put(hash, bytes)`, in three places, and R2 has no queryable metadata
— so nothing in the product could answer "how much is this workspace storing?".
The consequences were all live:

- **No quota, on any tier**, and no line in the plan catalog to sell one. A
  signage customer uploads video.
- **No provenance.** An object carried no tenant, no purpose, no uploader — so a
  workspace's erasure could not find its files without walking the bucket, and
  `@4dl/purge` (Stage 6) would have had nothing to derive from.
- **`PUT /api/assets` accepted `image/svg+xml`** and `GET /api/assets/:hash`
  served it back same-origin. An SVG is a document that carries `<script>`:
  stored XSS with a file picker in front of it.
- **No size limit.** `c.req.arrayBuffer()` materialises the whole body in the
  isolate, so a large enough upload was an OOM, not a 413.
- **Two of the three delete paths had no reference check at all** — deleting a
  playlist with `?media=1` removed its slides' objects outright, blanking any
  other playlist reusing one. The third checked, but scoped to the caller's
  tenant, and the key is the content HASH: two workspaces that uploaded the same
  file share one object, so tidying up in one blanked a slide in the other.

**The key space stays content-addressed, and `@4dl/storage` grew one field for
it.** A hash key is load-bearing three times over — the manifest references
assets by it, the player caches `/api/assets/<hash>` immutably for months
offline, and `library_tracks` is a platform-wide catalog every workspace draws
from — so tenant-prefixing the key was not available. `PutMediaInput.ledgerKey`
qualifies the LEDGER row instead (`<tenantId>:<hash>`): one row per tenant per
object, one copy in the bucket. The bucket deduplicates; the accounting does
not, which is the right way round — a workspace pays for what it references, not
for what it happened to be first to upload. `deleteMedia` gained `keepObject`
for the same reason, with the reference question left to the app because only
the app knows its key space.

`storageMb` joins the entitlements shape, the catalog and all four plans
(100 MB free / 2 GB Starter / 20 GB Pro / 100 GB Business), is enforced on every
write, and ships beside the credit balance on `/api/billing` — a quota nobody
can see is a quota that surprises you.

*Exit:* 192 tests (43 integration, up from 36). Six mutations verified
non-vacuous: the hardcoded environment, a reintroduced bare R2 write, the quota
resolver omitted from `putMedia` (the trap `@4dl/storage`'s README names), the
ledger key ignored, the reference check narrowed back to one tenant, and SVG
re-allowed. `scripts/storage-chokepoint.test.mjs` joins `pnpm gate` and asserts
both invariants structurally, which is the only way to assert the second: no
Workers-pool test can change the binding it would need to observe.

**Still outstanding, and deliberately:**

- **`generate()` itself does not move, and probably never will whole.**
  `@4dl/ai`'s runner is text-in/text-out over four tasks
  (`text | text-small | vision | image`); Scena's is media generation over five
  (`text`→HTML, `tts`, `image`, `music`, `layout`). Forcing five into four means
  rewriting the runner 548 Kova tests depend on, for a shape neither product
  wants. What genuinely was shared — the mock decision and the credit meter —
  moved; the prompts, the providers and the task vocabulary are Scena's, exactly
  as the original plan said.
- **The `ai_models` CATALOG stays Scena's**, for the `BILLING_SCHEMA` reason
  again: Scena's table has a `cf_model` column (the provider id, separate from a
  friendly `id`) and a `sort`, where `AI_SCHEMA`'s `id` IS the provider id and it
  carries `provider`/`is_default`. Same `CREATE TABLE IF NOT EXISTS` collision,
  same silent outcome. Adopting it means reconciling the column shapes first, and
  that is a data change, not a wiring one. The cost of waiting is that Scena's
  rates are hand-maintained rather than synced from the two pricing pages.
- **`@4dl/storage`'s `mediaRoutes` are not adopted.** They authenticate the READ,
  and a paired screen fetches its slides with no session at all. Scena's read
  stays public — the hash is the capability, which is the same bargain the
  manifest URL already makes — but it now carries `nosniff`, a
  `default-src 'none'; sandbox` CSP, and `content-disposition: attachment` for
  anything not inline-safe, which is what makes a stored SVG or HTML body inert.
- **Per-test storage isolation is off in Scena's suite** (`vitest.config.ts`).
  The pool asserts every storage file ends in `.sqlite`, and an R2 bucket that
  has been written to leaves a `-shm` sidecar — deterministically, on the second
  test in a file that puts an object. The suite never relied on isolation
  (every test provisions its own workspace under a unique slug), so this costs
  nothing, but it is a pool limitation worth knowing before adding a suite that
  does.

### Stage 6 — `@4dl/email` + `@4dl/notify` + `@4dl/purge`
Transactional mail, the alert inbox + bell, and derived GDPR erasure.

*Exit:* purge conformance passes (no forgotten table); alerts land in an inbox.

### Stage 7 — The UI rewrite
The big one, and deliberately last: it is the only stage that benefits from
everything above being settled.

**[SCENA-UI-INVENTORY.md](SCENA-UI-INVENTORY.md) is the screen-by-screen
breakdown** — 24 routes measured, tiered by cost, split into eight sub-stages
(7a…7h). Read it before starting; "21,910 lines" is not a task and its eight
parts are.

Two things the inventory changed:

- **`Admin.tsx` moves to Stage 4.** 1,448 lines that `@4dl/admin` deletes
  outright, carrying no product logic, holding exactly the Stripe/plans/AI-model
  config Stages 4 and 5 touch anyway. Doing it there means those stages edit
  ~200 lines of section declarations instead of a 1,448-line page, twice.
- **The 11 `catch(() => set…)` sites do not wait.** A failed load rendering as
  "nothing here" is a correctness bug, not a styling one, and each is a two-line
  fix. They land in whichever stage next touches their file.

The real target is **~15,000 lines of rebuild**: ~2,300 deleted outright, the
2,708-line builder restyled only (§4.5), the rest rebuilt.

*Exit:* the design conformance lints pass; every surface photographed in both
themes.

### Stage 8 — Prove it
- An integration suite on the real worker through Miniflare.
- **E2E golden paths**, including the one only a browser can prove: *two
  independently paired screens resolve the same slide at the same seek offset.*
- A shots suite so the design review works from images.

*Exit:* `pnpm test`, `pnpm gate`, `pnpm e2e`, `pnpm shots` all green.

### Stage 9 — Docs, derived from the code
`SCENA.md` (product + technical spec, screen index), a `DEPLOY.md`, and a
CLAUDE.md section. **Verify every claim against the code** — the current README
already drifted on tenancy, and a stale doc is worse than none because agents
read it as ground truth.

---

## 6. What this buys

- **~6,900 lines of infrastructure deleted** and replaced with tested, guarded,
  shared code.
- **Eleven capabilities gained** that Scena would otherwise have to build.
- A third product on the rail, which is where the shared packages start paying
  compound interest: the next fix to dunning, or passkeys, or the inbox, lands
  in three products at once.
- The reverse pressure too — Scena will find gaps in our packages that two
  human-facing apps never could. The device door and the scoped-token primitive
  are already two of them.

## 7. Risks I would watch

1. **The player is the thing most easily broken by helpfulness.** It is
   dependency-free on purpose. A well-meaning `@4dl/app-kit` import for its
   fetch layer would put React-shaped weight on a TV. Guard it with a boundary
   test the way `packages/ui`'s ALLOW list is guarded.
2. **The timeline engine must stay pure.** Same guard.
3. **Stage 7 is where scope runs away.** 21,910 lines of dashboard. It needs its
   own screen-by-screen inventory before it starts, not during.
4. **Doc drift is already present.** Stage 9 must verify, not transcribe.
5. **Two Stripe accounts, one rail.** Scena has live Stripe wiring today. The
   cutover onto `metadata.app` attribution needs the parked-event dead letter
   watched during the transition.

## 8. What I need from you

1. **The six decisions in §4** — or a "your call" on any of them.
2. **Does Scena keep its own repo, or move into this monorepo?** The plan above
   assumes it moves in. Everything shared argues for that; the counter-argument
   is that Scena's `www` and player deploy on a different cadence.
3. **Is there a live Scena deployment with real tenants?** That changes Stage 4
   from "wire it up" to "migrate it", and it changes whether DO class names and
   D1 ids are constraints or free choices.
4. **Scope of the UI rewrite** — every screen, or the ~12 that matter first? I
   would want an inventory before committing to "all".
