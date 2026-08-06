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

### Stage 2 — `@4dl/auth`
Replace `auth.ts`/`auth-context.ts`/`route-guard.ts`/`perms.ts`/`members.ts`.
Bind Scena's four roles into the grant algebra. Adopt staff routes + seats.
Add passkeys.
**Deliver §4.2's token primitive here** if we take that route.

*Exit:* sign-in works on every door; the route-gate conformance suite passes.

### Stage 3 — `@4dl/tenancy` (the biggest gain)
Five doors + the new `device` door (§4.1). Subdomains, custom domains, slug
validation, the standing/host gate, maintenance.
Wire §4.6's screen-behaviour mapping.

*Exit:* a tenant reachable at `<slug>.scena.4dl.app` and at their own domain; a
suspended tenant's screens show the holding card; the player origin is exempt.

### Stage 4 — `@4dl/billing` + `@4dl/billing-rail`
Entitlements engine with Scena's quota/feature registry. `TenantBillingDO`
becomes a `CreditLedgerDO` subclass (**keep the class name** — migrations bind
it). Stripe moves onto the rail with `metadata.app`. Dunning ladder.
**Keep the compile-time gate** (§4.4).

*Exit:* a real test-mode subscription; the compile-gate conformance test passes.

### Stage 5 — `@4dl/ai` + `@4dl/storage`
`ai.ts`/`gemini.ts` onto the shared runner (Workers AI + Gemini + the mock
lane). Media onto `@4dl/storage`'s ledger + quota gate.
Scena's *prompts* stay Scena's; only the metered path moves.

*Exit:* every generator metered through the shared reserve→settle; media quota
enforced.

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
