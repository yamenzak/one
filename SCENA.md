# SCENA.md

**Scena** — cloud digital signage. The third app on this repo's shared platform,
imported from its own repository and rewired onto the `@4dl/*` packages.

This file is the product and technical spec, and **Part III is the screen index**
— every surface, per door, mapped to `file:line`. Grepping for a screen's name
usually fails: several routes render different files depending on the persona,
and most sub-surfaces live inside their parent's file. **Update Part III in the
same commit as any screen you add or move.**

Two neighbours to read first:
[docs/SCENA-REWRITE.md](docs/SCENA-REWRITE.md) is the migration plan — what was
kept, what was rewired, the six decisions and their rationale.
[docs/SCENA-UI-INVENTORY.md](docs/SCENA-UI-INVENTORY.md) is the record of the UI
rewrite, one section per sub-stage, each naming the defects it closed.
[apps/scena/DEPLOY.md](apps/scena/DEPLOY.md) is how it ships.

---

# Part I — The product

## 1. The idea, in one line

```
position(t) = (t − T0) mod cycleLength
```

The server never says "show slide 3 now". Playout is a **pure function of a
synced clock**, which is why multi-screen sync, offline playback and live
updates are one mechanism rather than three features:

- **Sync** falls out for free. Two screens with the same manifest and the same
  clock compute the same slide, with no coordination between them at all.
  Measured cross-screen skew: **0.3 ms**.
- **Offline** falls out for free. A screen with a cached manifest and a
  wall-clock bridge keeps playing correctly with no server, for as long as its
  lease allows.
- **Live updates** are a nudge, not a push of content. The server says "refetch";
  the screen fetches the pointed manifest snapshot and recomputes.

`packages/scena-timeline` is that function, and it is **pure — zero
dependencies, no I/O, no DOM, no platform APIs.** The compiler, the player and
the tests all run byte-identical code. Nothing in the migration touched it and
nothing should.

## 2. What a customer buys

A **workspace** on its own subdomain, some number of **screens**, and the tools
to decide what those screens show:

- **Displays** — a screen and the channel bound to it. A newly paired device is
  auto-wired its own editable display (a channel composing a fresh slide
  playlist, music playlist and widget profile), so an operator adds content in
  one place instead of assembling and binding a graph across five pages.
- **Building blocks** — slide playlists, music playlists, widget profiles, the
  media library, data sources and ad profiles. Reusable, shared across channels.
  You compose these when you scale; you do not start here.
- **Live boards** — queue, room-status and scoreboard boards. Each issues its own
  logins and is bound to a screen through a widget.
- **Insights** — proof-of-play analytics, and health alerts driven by each
  screen's dead-man's switch.

## 3. The five doors

**The host IS the tenancy.** `@4dl/tenancy`'s `classifyHost` sorts every hostname
into a door, and the route guard, the auth context and the app's entry routing
all read that classification rather than a path prefix. Read
`packages/tenancy/README.md` before touching anything routing-shaped.

| Host | Door | What answers there |
|---|---|---|
| `scena.4dl.app` | root | A signpost. Not an app; refuses to send a sign-in code. |
| `setup.scena.4dl.app` | setup | The **only** place a workspace is created. |
| `admin.scena.4dl.app` | admin | The operator console. `/api/admin/*` answers here and nowhere else. |
| `<slug>.scena.4dl.app` | tenant | A workspace. The tenancy is pinned by this host. |
| a workspace's own domain | custom | The same workspace, on a domain it owns. |
| `play.scena.4dl.app` | **device** | Pairing, manifests and assets. **No session.** |

**The device door is Scena's, and it is why the door model has six entries
rather than five.** A screen is a DEVICE: one pinned URL, Service-Worker-cached,
running for months offline. It resolves no tenant from its host — the tenant
arrives from the pairing claim. The route guard skips the whole member/standing
engine for it. Everywhere else those routes answer `{"error":"wrong_door"}`,
which the player surfaces as *"offline — no cached channel yet"*, two steps
removed from its cause.

The door is **opt-in per app** (`play` is a slug a Kova studio could hold today),
and `DEFAULT_DEVICE_LABEL` is `"play"`.

## 4. The player is a separate worker, on a separate origin

`apps/scena-player` has its own `wrangler.jsonc`, its own origin, and binds no
D1 or R2 of its own. That is the design, not a convenience:

- A screen has **one pinned URL**. A tenant subdomain would give every
  workspace's screens a different address, so re-pairing would orphan the
  Service Worker cache, and custom domains would multiply certificates by the
  size of the fleet.
- **It is dependency-free on purpose.** Its `package.json` lists only workspace
  packages. It is a TV render loop plus a Service Worker and it needs full
  control of both; a well-meaning `@4dl/app-kit` import for its fetch layer would
  put React-shaped weight on a device with 512 MB of RAM.

⚠️ **`API_BASE` is baked in at BUILD time** from `VITE_API_BASE`, a variable set
nowhere in this repo — so `apps/scena-player/src/config.ts`'s fallback is what
actually ships to televisions. It must be the **device door**. It was
`http://localhost:8787` once, which is unreachable from a TV and, in this
monorepo, *Kova's* port. `scripts/player-api-base.test.mjs` (in `pnpm gate`)
now asserts the fallback is https, is not a local address, starts with `play.`
and names Scena — each a mistake this repo has made or come one edit from making.

## 5. Pairing, and what a screen is allowed to do

1. The player POSTs `/api/screen/new` on the **device door**. The response
   reserves a `ScreenDO` and returns a pairing **code** and a WebSocket path.
   The reservation is persisted in `localStorage` under `scena.screen`.
2. The player draws the code and opens the socket.
3. An operator submits the code from the dashboard: `POST /api/pair/claim`.
   A **new** device counts against `quotas.pairedDevices`; a **re-pair** (a
   device already on this tenant, e.g. one that was unpaired) does not —
   otherwise an unpaired screen could not be paired again without deleting it.
4. A new device is auto-wired its own display, optionally seeded with the sample
   scene. A re-pair keeps whatever the device was already showing.

⚠️ **The reservation POST is a SIMPLE cross-origin request** — no custom headers,
so no preflight. The worker's CORS allows `content-type` and nothing else, so
adding any header turns it into a preflighted request the worker refuses, and
the player then renders "offline — no cached channel yet" with nothing in the
log that looks like a failure. (This is documented in
`apps/scena-e2e/src/screen.ts`, where a test helper hit it.)

**The server is authoritative about whether a screen may play.** If the DO
reports anything other than `assigned` while the player is already playing, the
player wipes its cached channel and assets and reloads to pairing. An
`OFFLINE_LEASE_MS` of 14 days bounds how long a disconnected screen keeps
playing — long enough for any real outage, short enough that unplugging a device
cannot dodge the paid-screen limit forever.

## 6. Manifests, versions and publishing

A **channel** composes a slide playlist, a music playlist and a widget profile.
Publishing snapshots a **manifest version** into `manifest_versions` and moves a
KV pointer; screens run the pointed snapshot, so rollback is a repoint rather
than a recompile.

- `POST /api/channels/:id/publish` → `{ version, hash, nudged }`.
- The nudge fans out to every screen subscribed to the channel; each refetches
  the pointed snapshot. **Always refetch on a nudge** — a publish may change the
  widget layer without bumping the version the nudge carries.
- The first fetch of a never-published channel **lazily publishes v1**, so
  history always exists. (This is worth knowing: it means a channel can already
  have a manifest before anyone pressed Publish.)
- A **suspended** workspace's screens get a holding-card manifest instead. The
  manifest route is device-facing with no session, so the owning tenant is
  resolved from the channel row.

⚠️ **The R2 key is the CONTENT HASH, and that is not a detail to tidy.** The
compiled manifest references an asset by hash, the player caches
`/api/assets/<hash>` immutably for months offline, and `library_tracks` is a
platform-wide catalog every workspace draws from — a tenant-prefixed key would
break all three. `@4dl/storage`'s ledger row is qualified instead
(`PutMediaInput.ledgerKey` = `<tenantId>:<hash>`): one row per tenant per object,
one copy in the bucket. The bucket deduplicates; the accounting does not.

`apps/scena/src/storage.ts` is the ONE module that may touch `MEDIA`, and
`scripts/storage-chokepoint.test.mjs` (in `pnpm gate`) fails on a bare
`MEDIA.put` anywhere else — an object written behind the ledger is invisible to
the quota and to erasure, forever, and nothing else would notice.

## 7. Plans and entitlements

Four rows, seeded by `apps/scena/src/billing-seed.ts`, but only **three are for
sale**: `starter`, `pro`, `business`.

**There is no free tier, and `free` is not a plan.** It is the PARKING STATE
every brand-new workspace is stamped with (and where a deleted Stripe
subscription lands), carried as `active: 0` so no picker can offer it.
`statusOf` reports `incomplete` for a workspace with no paid plan and
`resolveHostGate` turns that into READ-ONLY — gate reason `setup`, deliberately
not `suspended`: nothing was taken from them and there is no arrears to settle.

⚠️ **Its entitlements below are deliberately NOT zeroed**, and that is not an
oversight to tidy. They are what a deployment with **no payment rail** serves —
a self-host, anything before `apps/scena/DEPLOY.md`'s Stripe step, the whole E2E
suite — where `statusOf` correctly fails OPEN rather than stranding every
workspace over our misconfiguration. Crippling them would brick exactly the
configuration the gate stands down for. On a charging deployment the row is
unreachable, because the gate fires first.

What replaced the free tier is a **trial**: `starter` and `pro` open with 30 days
free, collected as a card up front through Stripe Checkout
(`subscription_data.trial_period_days`) so nothing is charged until it ends.

The lengths below are the SEED. They are edited in the operator console —
`@4dl/admin`'s plan panel, on `@4dl/billing`'s contract — which is new: Scena's
own editor could change a price and a credit grant and not the trial, and it
wrote a tightened tier straight through to every workspace already on it with
no grandfathering. Lowering a limit now holds each of them at what they bought.

| | free (parking) | starter | pro | business |
|---|---|---|---|---|
| price / month | — | $19 | $49 | $149 |
| free trial | — | 30 days | 30 days | — |
| paired devices | 1 | 3 | 15 | 60 |
| seats | 1 | 3 | 10 | ∞ |
| widget profiles | 1 | 1 | 3 | 10 |
| channels per profile | 1 | 3 | 4 | 8 |
| slides per playlist | 10 | 30 | 60 | — |
| data sources | 0 | 2 | 8 | 25 |
| live boards | 0 | 0 | 3 | 20 |
| storage | 100 MB | 2 GB | 20 GB | 100 GB |
| AI credits / month | 0 | 250 | 1,000 | 5,000 |

Two consequences worth stating because they surprised a test harness into
thinking the product was broken:

- **Each display provisions its own widget profile**, named after it. Three
  displays on `pro` therefore use all three profiles, and a fourth is refused.
  That is the quota working.
- **An owner cannot issue or call a queue ticket.** A board provisions its own
  coordinator and station USERS, and `canControlBoard` admits one of those or a
  board-scoped token. The people who press those buttons are a receptionist at a
  desk and a tablet bolted to a wall, not whoever pays the bill. Mint the kiosk
  or station token instead.

`business` sells `customDomain`; the rest of the feature flags gate widgets
(`ticker`, `clockAnalog`, `weather`, `widgetStack`, `htmlSandbox`), scheduling
(`dayparting`), boards (`roomQueueManagement`), reporting (`proofOfPlay`),
alerting (`alertsWebhook`, `alertsEmail`), `aiGeneration`, `ads`, `musicLibrary`
and `multiScreenSync`. `screenSaver` and `emergencyOverride` are on for
everyone, deliberately: neither is a thing to withhold from a screen in a lobby.

## 8. Roles

`apps/scena/src/access.ts`. Six roles, four of them invitable:

- **owner** — everything, including billing and closing the workspace.
- **operator** — the day-to-day content and fleet role.
- **receptionist** — the front-desk role.
- **viewer** — read.
- **board_coordinator** / **board_station** — **provisioned, not invited.** A
  board creates them, and they are **seat-free**: a queue needs a station login
  per counter before a single person is hired, so charging a staff seat for a
  tablet would price the feature out of the use case it exists for.

---

# Part II — How it is built

## 9. Layout

```
apps/
  scena/         # THE worker — Hono + seven DOs; serves the dashboard SPA
  scena-app/     # the operator dashboard (React 19 SPA)
  scena-player/  # the SCREEN. Its own worker and its own origin (§4)
  scena-www/     # marketing
  scena-e2e/     # Playwright — the gate, the wall, and the screenshot suite
packages/
  scena-timeline/  # @scena/timeline — the pure clock engine. ZERO deps.
  scena-manifest/  # @scena/manifest — Zod schema + canonical JSON + SHA-256
  scena-widgets/   # @scena/widgets — the pure widget core, shared by the
                   # player's DOM renderer and the builder's React preview
  scena-protocol/  # @scena/protocol — screen⇄DO + board WS message types
  scena-brand/     # @scena/brand — mascot + marks (the player uses it)
```

## 10. Durable Objects

Seven bindings, in `apps/scena/wrangler.jsonc`.

| Binding | Class | What it is |
|---|---|---|
| `SCREEN` | `ScreenDO` | One per screen: pairing state, the live socket, the dead-man's switch. |
| `CHANNEL` | `ChannelDO` | Per-channel coordination. |
| `QUEUE` | `QueueDO` | A queue board's live state. |
| `ROOM` | `RoomBoardDO` | A room-status board. |
| `SCORE` | `ScoreDO` | A scoreboard. |
| `BILLING` | `TenantBillingDO` | The authoritative credit balance (`@4dl/billing` subclass). |
| `INBOX` | `InboxDO` | **One DO per USER, not per tenant** — it holds that person's open sockets. |

⚠️ **Every class name above is PERMANENT.** A migration binds each to durable
storage, so renaming one orphans every workspace's balance or every user's
inbox — the DO comes up empty and nothing says why.

## 11. The schema, and why its order matters

`SCHEMA_MODULES` in `apps/scena/src/db.ts` is the migration's progress bar. Seven
entries today: `AUTH_SCHEMA`, `TENANCY_SCHEMA`, `BILLING_RAIL_SCHEMA`,
`STORAGE_SCHEMA`, `NOTIFY_SCHEMA`, `AI_SCHEMA`, `SCENA_SCHEMA`. **The diff that
removes a table from Scena's own module is the same diff that adds its package
here.**

⚠️ **Order in that list IS dependency order, and a wrong order does not fail.**
`NOTIFY_SCHEMA` ALTERs `tenant_settings`, which `@4dl/tenancy` creates. Run
first, the ALTER hits a table that does not exist, the composed runner swallows
it, and an owner's email veto silently never persists.

`AI_SCHEMA` sits before `SCENA_SCHEMA` for the mirror-image reason. Scena's own
module used to declare `ai_models`, `ai_cache` and `ai_generations` with
DIFFERENT columns from the shared ones, and a `CREATE TABLE IF NOT EXISTS` is won
by whichever module runs first — the loser's columns then silently never exist,
which is exactly how a fresh Stage 1 deployment ended up unable to save any
setting (`app_config.updated_at`). The local declarations are gone, which is what
makes the order safe rather than merely conventional;
`apps/scena/test/schema-module.test.ts` fails if any of the three comes back.

**One module is deliberately still Scena's**, and the plan names it so nobody
"fixes" it casually: the billing STORE (`BILLING_SCHEMA`). Its `plans`,
`subscriptions`, `credit_packs` and `credit_ledger` share a NAME with Scena's and
differ in COLUMNS — `price_cents` + `currency` + `interval` against
`price_usd_month`, `at` against `created_at`, TEXT timestamps against INTEGER.
Adopting it means reconciling the shapes first — a data change, not a wiring one.

### The AI catalog, and what adopting it took

`ai_models.id` **IS the provider path** now (`@cf/deepgram/aura-1`,
`gemini-2.5-flash`), with `provider` naming the lane. Scena keyed on a short slug
(`aura-1`) with the path in a `cf_model` column, and that single difference is
what kept it off the shared catalog — along with everything that catalog has
grown since: the live pricing-page sync, the retirement sweep, the shared
publication a new app seeds from, the cross-app selection broadcast. In their
place was a ~200-line local syncer behind a button that once reported
"17 updated" having fetched nothing at all.

Three things in `@4dl/ai` made the adoption possible, and each is worth knowing:

| | |
|---|---|
| `configureAiFloor` | The package's own floor is eleven rows chosen for Kova, with no Workers AI voice, poster or music model in it. Seeding Scena from it would leave three of its four lanes with nothing pickable on a fresh database, so the app hands over its forty curated rows and keeps the whole mechanism. |
| `configureAiLanes` | Which lanes the app can EXECUTE. The default was Kova's five — no `music`, and Cloudflare's `tts` absent — so every voice Scena sells arrived priced, listed and switched OFF. |
| `lanesFor` | A catalog with both providers holds text-to-speech under TWO names: `tts` from Cloudflare's page, `speech` from Google's. `WHERE task = 'tts'` therefore cannot see a single Gemini voice, which reads as "the model I chose in settings is being ignored". Every selection path goes through it. |

`ai_cache` gained `asset_hash` + `neurons` as alters on the shared module — a
cached generation may be an OBJECT in R2 with a cost, which is true of any app
generating images or audio. `ai_generations` LOST Scena's `prompt` and
`output_ref`: nothing ever read either column, so what they amounted to was a
permanent record of what every workspace typed.

Two latent defects went with the migration. `lyria-3-clip` was an id Google has
never answered to — the slug and the `cf_model` were the same invented string, and
`cf_model` is what went into the request URL, so every music generation on that
row 404'd and surfaced as "generation failed". And `syncGeminiFromGoogle` priced
each newly-discovered model BY LANE (flash-tier rates for a Pro model), so the
reserve under-estimated and the platform ate the difference at settle time.

## 12. Erasure is DERIVED

`apps/scena/src/purge.ts` reads `tenantCascade(SCHEMA_MODULES)`;
`apps/scena/test/purge-cascade.test.ts` fails on a table that carries a scope
column and declares none.

The hand-written list it replaced named **seven** tables against a declaration
of **twenty-five**, so a deleted workspace kept its media library, playlists,
ads, tracks, manifest history and AI history — while the sweep reported success
and emailed the owner to say otherwise. A purge swallows every delete error by
construction (an old database may legitimately lack a table), which is why the
check is structural rather than behavioural.

**Two things the derivation cannot see, and both are handled by hand.**
`app_config` keys a per-workspace setting as `<setting>:<tenantId>` — the
tenancy is in the KEY, so there is no column for `tenantCascade` to match on and
every one of those rows outlived an erasure that reported success.
`purgeConfigRows` sweeps the SHAPE (`LIKE '%:' || ?`, exact suffix) rather than a
list, so the next setting keyed that way is covered without anyone remembering.
And `purgeUser` is a different cascade entirely — a PERSON, not a workspace; see
§12a.

## 12a. Leaving is always allowed

The route guard has said since it was written that paying must be A way out and
not the ONLY way out. It exempted billing and auth and nothing else, because
`/api/tenant/close` **did not exist** — so a workspace Scena suspended over an
unpaid invoice had every write refused, a holding card on every screen, copy
telling it to settle up, and no mechanism for the other answer. The exemption
protected nothing.

`apps/scena/src/exit-routes.ts` binds `@4dl/tenancy`'s `tenantCloseRoutes` and
`@4dl/auth`'s `accountRoutes`. Four things about it are load-bearing:

- **`closing` is a rung of its own, not a reuse of `suspended`.** Suspension is
  something Scena did and paying reverses it; closing is something the OWNER did
  and only CANCELLING reverses it, inside seven days. `@4dl/tenancy`'s standing
  model already distinguishes them, so the gate and its copy come free.
- **Both rungs end at the same erasure**, in one branch of `lifecycleSweep`. A
  second purge path is a second place for the cascade, the R2 release and the DO
  wipe to drift apart, and this app has already had that bug. Only the final
  email differs — "after the suspension window elapsed" sent to somebody who
  closed their own workspace reads as an accusation about an invoice.
- **The read-only exemption is a PREFIX.** `/api/tenant/close` schedules,
  `/close/request-otp` mints the confirmation code, `/close/cancel` undoes it.
  Exempting only the first lets a suspended workspace ASK to close and then
  refuses the code that confirms it — which the integration suite now fails on.
- **A station is not a person.** `purgeUser` NULLS `board_users.user_id` instead
  of deleting the row: a station is a login that belongs to a BOARD, shared by
  whoever is at the counter, and deleting it would take a working desk offline
  because whoever provisioned it left.

## 13. The theme is an ATTRIBUTE, not a class

`@4dl/ui`'s tokens are **dark-first**: `:root` is the dark palette and the light
one lives under `:root[data-theme="light"]`. `apps/scena-app/src/theme.tsx`
stamps `data-theme` on `<html>`; there is no `.dark` class.

Two silent regressions came out of that move and `apps/scena-app` has a test
suite whose whole job is that neither can come back:

- `className="dark"` became **inert**, so the kiosk and the counter tablet
  stopped being dark. `useForcedDark()` is the replacement, and it restores the
  previous attribute on unmount.
- `brandCss` kept emitting `:root { …light… }` / `.dark { …dark… }`, so **a
  tenant's dark tokens applied nowhere and their light tokens were injected into
  the dark theme.** Both halves compiled and rendered; only the colours
  disagreed.

That second one is gone at the root now: **`brandCss` no longer exists.**
Applying a workspace's palette is `@4dl/ui`'s `applyBranding`, on the same
`<style id="scena-brand">` element, with the same selectors — see §13a.

## 13a. The brand kit is `@4dl/ui`'s `Branding`, stored where the platform keeps it

Scena's kit predates the platform and was the last thing in the app still
answering to its own vocabulary. Two changes, and both are the same idea:

**The SHAPE.** `theme` with bare token names (`primary`) and a radius in PIXELS
became **`tokens` with prefixed names (`--primary`) and a radius in REM** —
`@4dl/ui`'s `Branding`, field for field, plus four that are genuinely Scena's
(`brandName`, `headingFont`, `bodyFont`, `logos`). Three generations of stored
blob are converted on read by `migrate()` in `branding-store.ts`; nothing has to
be republished, because `@scena/manifest`'s `resolveTokens` accepts **both** key
conventions. The px→rem conversion discriminates on the value (`> 4` is pixels),
which is safe with room to spare: no legitimate rem is above 4 and no legitimate
pixel radius is below it.

**The PLACE.** The kit moved out of `app_config['brand.json:<tenantId>']` — a
global key-value table with the tenancy glued onto the key, which is how it once
leaked between tenants — and into **`tenant_settings.branding_json`**, which
`@4dl/tenancy` owns and `/api/host` already ships to the pre-auth client. That is
not tidiness: it is what removes the flash of shipped violet on every cold start.
`host.ts` paints the brand the moment the door resolves and remembers it against
the hostname, so the visit after the first paints before the request is sent.

**The EDITOR is `@4dl/ui`'s `BrandingEditor`**, the same one Kova and Tessa use.
Scena's Settings passes two `extras` — the brand **name and font pair**, and the
**logo variant list** — and nothing else: colour, shape, elevation, border weight
and the token grid are the shared editor's. Roughly four hundred lines of
slightly-different reimplementation went with it, and with them the missing
elevation preset, the missing border control, and the three-different-save-
semantics-in-three-adjacent-cards problem.

Two seams this created, both silent if broken, both pinned by
`apps/scena-app/src/brand-theme.test.ts`:

- **`@scena/manifest`'s `THEME_TOKENS` must be a SUPERSET of what the shared
  editor writes.** The server validates against it and drops the rest without a
  word, so a token the grid offers and the list omits is a field a person fills
  in, saves, and watches do nothing.
- **Scena's own CSS lives in a SECOND style element** (`scena-brand-extras`:
  `--font-sans` and the `--w-*` widget block). `applyBranding` rewrites its
  element wholesale on every preview keystroke, so anything appended there
  survives until the next drag.

⚠️ A font family name reaches a CSS rule **on a television** — `--w-font` inside
`manifest.theme`, injected verbatim by the player into a bare document. It is
allowlisted (`[\w \-.]{1,60}`) in three places on purpose: the store, so it never
lands in the database; `widgetTokens`, so it never reaches a screen; and
`brandExtrasCss`, so it never reaches the dashboard. The old filter stripped `"`
and `\` only, which let `;` and `}` close the declaration and then the block.

## 14. A failed poll is only shown while there is nothing to show

The rule the UI rewrite produced, and the one every polling screen now follows.
Roughly twenty swallowed failures went with it, all the same shape: a `catch`
that answers a failure with a confident fact. `catch(() => [])` on a two-second
poll rendered "Create your first live board" over a workspace with five;
`catch(() => setFeed(null))` made a dropped connection indistinguishable from a
deleted record.

## 15. Tests

- **`pnpm test`** — the Miniflare integration suite (`apps/scena/test`) plus
  `apps/scena-app`'s conformance tests. Build the SPA first; `turbo.json`
  declares the `@4dl/scena#test` → `@scena/app#build` edge so anything going
  through turbo does it for you.
- **`scripts/scena-fetch-chokepoint.test.mjs`** (in `pnpm gate`) — no bare
  `fetch` in the SPA outside two stated exceptions. See §16.
- **`pnpm --filter @scena/e2e e2e`** — the launch gate, on :8789 (+ :8790 for the
  player). Runs against **the authorization the product ships**.
- **`pnpm --filter @scena/e2e wall`** — the two-screens spec. Needs a paid plan,
  so it runs the worker with an empty `ADMIN_EMAILS` to reach the development
  platform-admin lane. **The gate must never have that lane**: a gate that hands
  itself platform admin cannot see an authorization bug.
- **`pnpm --filter @scena/e2e shots`** — the screenshot suite, four projects
  (desktop/narrow × light/dark). Same split, same reason, plus a plan big enough
  that the images are of the product being sold rather than of the free tier.

Ports are not taste: Kova owns 8787, Tessa 8788, Scena 8789 + 8790. Sharing one
makes whichever suite runs second drive another product's worker, and it fails
as "element not found" rather than as a conflict. The same is true of wrangler's
default devtools inspector on 9229, so Scena pins 9231 and 9232.

## 16. One door to the API, and it exists because of a 401

`apiFetch` in `apps/scena-app/src/api.ts` is the only way out of the dashboard.
It was 167 bare `fetch` calls — what an app written before the platform looks
like — and the consequence was not style. Kova and Tessa go through
`@4dl/app-kit`'s `api`, which has a hook for an expired session
(`setUnauthorizedHandler`); Scena had none, so **a dead cookie did not look
dead.** `getMe` is read once at boot, so the Shell stayed mounted, every screen
rendered whatever empty state its failed poll produced, and every save failed
into a toast. An expired session was indistinguishable from a deleted workspace —
the same "a confident fact where a failure belongs" shape as §14, in the one
place a screenshot cannot show it.

`apiFetch` is `fetch`-shaped on purpose: adopting it was a rename, and a rename
is reviewable in a way 167 hand-edited calls are not. It does not throw on a
non-2xx — each call site still decides what its failure means — so this was a
change of transport, not of contract. `App.tsx` installs a handler that re-reads
the session, which draws the sign-in screen if the server agrees the cookie is
gone.

Two files may hold a bare `fetch`, and `scripts/scena-fetch-chokepoint.test.mjs`
(in `pnpm gate`) fails on a third: `api.ts`, which defines it, and `host.ts`,
whose `/api/host` probe runs before there is a session and where a 401 is not an
expiry. The guard also asserts the hook is installed and still fired — a
chokepoint whose door does nothing is worse than no chokepoint, because it reads
as done.

⚠️ **Two exemptions inside `apiFetch`, and the second is not merely defensive.**
`/api/auth/*` because Better Auth self-reports 401 for a wrong OTP, so reporting
it would reload the session on the login screen on every mistyped code. And
**`/api/me`, which is the re-entrancy guard**: the handler's job is to re-read the
session, so it calls that route, which comes back through here. Scena's route
guard makes it public and it answers 200 — so one line in `route-guard.ts` is all
that stands between this and a tab spinning until it is closed.

Moving the rest of the way to the kit's typed `api.get`/`api.post` (and its
`ApiError` with status and body) is mechanical from here and no longer urgent.
`apiError` already carries the status, which was the half callers actually needed.

---

# Part III — The screen index

Every surface, mapped to the file that draws it. Routes are declared in
`apps/scena-app/src/App.tsx:304-327`.

## The workspace door — `<slug>.scena.4dl.app`

| Route | Screen | File |
|---|---|---|
| `/` | Screens (the fleet) | `apps/scena-app/src/pages/Screens.tsx` |
| `/screens/:id` | One screen | `apps/scena-app/src/pages/ScreenDetail.tsx` |
| `/screens/:id/studio` | Studio, screen-scoped | `apps/scena-app/src/pages/Studio.tsx` (`mode="screen"`) |
| `/displays/:channelId` | Studio, display-scoped | `apps/scena-app/src/pages/Studio.tsx` (`mode="display"`) |
| `/widgets` | Widget builder | `apps/scena-app/src/pages/WidgetBuilder.tsx` |
| `/channels` | Channels | `apps/scena-app/src/pages/Channels.tsx` |
| `/channels/:id` | One channel | `apps/scena-app/src/pages/Channels.tsx` (detail half) |
| `/playlists` | Slide playlists | `apps/scena-app/src/pages/Playlists.tsx` |
| `/playlists/:id` | One slide playlist | `apps/scena-app/src/pages/Playlists.tsx` (detail half) |
| `/media` | Media library | `apps/scena-app/src/pages/MediaLibrary.tsx` |
| `/music` | Music playlists | `apps/scena-app/src/pages/MusicPlaylists.tsx` |
| `/music/:id` | One music playlist | `apps/scena-app/src/pages/MusicPlaylists.tsx` (detail half) |
| `/profiles` | Widget profiles | `apps/scena-app/src/pages/WidgetProfiles.tsx` |
| `/boards` | Live boards | `apps/scena-app/src/pages/LiveBoards.tsx` |
| `/feeds` | Sources | `apps/scena-app/src/pages/Feeds.tsx` |
| `/feeds/:id` | One source | `apps/scena-app/src/pages/Feeds.tsx` (detail half) |
| `/ads` | Ad profiles | `apps/scena-app/src/pages/Ads.tsx` |
| `/ads/:id` | One ad profile | `apps/scena-app/src/pages/Ads.tsx` (detail half) |
| `/analytics` | Analytics | `apps/scena-app/src/pages/Analytics.tsx` |
| `/alerts` | Alerts | `apps/scena-app/src/pages/Alerts.tsx` |
| `/billing` | Billing | `apps/scena-app/src/pages/Billing.tsx` |
| `/settings` | Settings — the index | `apps/scena-app/src/pages/Settings.tsx` |
| `/settings?s=brand` | Brand kit — the sub-index | `apps/scena-app/src/pages/Settings.tsx` (`BrandKitSections`) → `@4dl/ui` `BrandingEditor` |
| `/settings?s=brand&sub=identity` | Name & fonts | `apps/scena-app/src/pages/Settings.tsx` (`BrandIdentity`) |
| `/settings?s=brand&sub=assets` | Brand assets | `apps/scena-app/src/pages/Settings.tsx` (`BrandAssets`) |
| `/settings?s=brand&sub=colour` / `shape` / `advanced` | Colour · Shape & depth · Fine-tune tokens | `packages/ui/src/branding-editor.tsx` |
| `/settings?s=playback` / `ai` / `signin` / `security` | Playback · Default AI models · Sign-in · Passkeys | `apps/scena-app/src/pages/Settings.tsx` |
| `/settings?s=danger` | Close this workspace (owner only) | `apps/scena-app/src/pages/Settings.tsx` → `@4dl/app-kit` `CloseTenantCard` |
| `/team` | Team | `apps/scena-app/src/pages/Team.tsx` |
| anything else | Not found | `apps/scena-app/src/App.tsx` (`NotFound`) |

**Not routes.** The pair-a-screen dialog is opened from the fleet's header
action; below `sm` the app-shell collapses every header action into one ⋮ menu,
so there are two affordances for it and both are the product. The emergency
takeover and the theme toggle live in the sidebar footer
(`apps/scena-app/src/App.tsx`, `SidebarFooter`). **Sign out** and **Delete my
account** are `@4dl/app-kit`'s `AccountExitRows`, below the settings index —
neither navigates, and both are about the person rather than the workspace.

**The sidebar registry is `apps/scena-app/src/nav.tsx`** — five groups
(Displays, Building blocks, Live boards, Insights, Account), with **Admin
appended for platform admins only**. `navForRole` filters by role, entitlements
and grants, and `PAGE_META` carries each key's title and subtitle.

## The other doors

| Door | Screen | File |
|---|---|---|
| root (`scena.4dl.app`) | The signpost — never the app | `apps/scena-app/src/pages/Doors.tsx` (`ScenaRootSignpost`) |
| setup | Sign in (email code) | `apps/scena-app/src/pages/Login.tsx` |
| setup, signed in | The three-step wizard | `apps/scena-app/src/pages/Onboarding.tsx` |
| `<slug>`, unclaimed | No workspace at this address | `apps/scena-app/src/pages/Doors.tsx` (`ScenaNoWorkspace`) |
| admin | The operator console | `apps/scena-app/src/pages/AdminDoor.tsx` → `pages/Admin.tsx` for Scena's own panels, `@4dl/admin`'s `sections/*` for the rest (plans, email, shared config, domains, Turnstile, rail, maintenance) |
| device (`play.`) | The screen itself | `apps/scena-player/src/main.ts` |

⚠️ **A workspace is created in exactly one place, and it is not the sign-in
screen.** `Login.tsx` used to carry a third lane that collected a workspace name,
verified a code and created the organization — offered on **every** host, so
somebody who followed a colleague's link to `acme.scena.4dl.app` was invited, on
Acme's own branded sign-in, to start a second workspace instead of joining the
one they were sent to. Worse, it skipped billing entirely: every workspace it
made landed on the `free` PARKING ROW, which `statusOf` gates READ-ONLY, so the
owner arrived in a product where every write was refused.

The lane is `Onboarding.tsx` now — **name → plan → start**, on `@4dl/ui`'s
`StepHeader`/`StepPanel`/`StepActions`, the same wizard Kova runs. `canCreate` on
`LoginScreen` is all that is left of the distinction, and it changes only the
copy: with a one-time code, signing in and signing up are the same act.

⚠️ **The console is on `admin.` and NOWHERE else.** It used to render at `/admin`
inside the workspace shell on any host, while `/api/admin/*` has answered on the
operator door only since Stage 3 — so in production it drew the whole console and
404'd on every call, exactly as Kova's did before that route was removed. The
sidebar's Admin item is a **full page load** to the other origin, because that is
the console's only address.

## Token-gated surfaces

These are reached with a board-scoped token rather than a session, and they are
**dark by design** — they hang in a lobby or sit on a counter, and they are not
somebody's dashboard to have opinions about.

| Path | Screen | File |
|---|---|---|
| `/kiosk?token=&board=` | Take-a-ticket | `apps/scena-app/src/pages/Kiosk.tsx` |
| `/station?token=&board=` | The counter tablet | `apps/scena-app/src/pages/Station.tsx` |
| (role-routed) | Board control | `apps/scena-app/src/pages/BoardControlApp.tsx` |

## The player

One page, one render loop. `apps/scena-player/src/main.ts` wires it: the socket
(`socket.ts`), playout (`player.ts`), music (`music.ts`), the ad and emergency
overlays, the announcer, the screensaver, and the **debug overlay**
(`hud.ts`, toggled with `d` or the `debug.on` command), which exists to make
"same clock ⇒ same slide" observable by putting two players side by side.

⚠️ Playout is a `requestAnimationFrame` loop, and **Chromium does not run rAF in
a background page.** Any tool that drives two players at once has to foreground
one before reading its frame, or the overlay reports `slide — (no manifest)`
forever — which names the wrong subsystem entirely.

---

## Status

**Stages 0–8 are done.** The E2E harness, the wall spec and the screenshot suite
all run. Stage 9 (this file, `apps/scena/DEPLOY.md`, the CLAUDE.md section) is
the last of the plan.

**Deliberately not adopted yet**, each for a stated reason: the billing STORE
(§11 — a column collision, not a wiring gap) and the
`NotificationBell` / `InboxScreen` surfaces from `@4dl/app-kit` (the server side
of the inbox is wired end to end; until the bell lands, a notification is
reachable at `GET /api/notifications`).

**Resource ids in `apps/scena/wrangler.jsonc` are placeholders** — the old
account's real ids were replaced — so `deploy.yml` SKIPS Scena until the Provision
workflow has run. See [apps/scena/DEPLOY.md](apps/scena/DEPLOY.md).
