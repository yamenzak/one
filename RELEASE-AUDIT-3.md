# Mossa — Pre-Release Audit (Round 3)

The final whole-app pass before the intended launch, run as six specialist
auditors (security/tenancy/auth · money paths · AI suite + data integrity ·
frontend/PWA/a11y · feature completeness vs SPEC · ops/release readiness), then a
verification pass in which every High was independently re-traced before any code
was touched.

Round 3 had a different job from rounds 1–2. Round 2's fixes landed in commits
`79c265d`, `16d5c1a`, `6c74d53`, `d462704`, and `16d5c1a`'s own message admits it
was committed **unverified**. So each auditor first re-traced the round-2 fixes in
its area and ruled each HELD / PARTIAL / MISSING / REGRESSED, then hunted fresh.
Most held. Two did not, and both were launch blockers.

---

## Verdict

**Round 3 opened NO-GO. The blockers below are now fixed and verified, so the
code is releasable; the remaining gate is operational, not code.**

Before deploying you still must, in this order:

1. **Verify Cloudflare Email Sending end to end against the live binding.** It is
   the only authentication channel, has never once executed successfully anywhere,
   and has zero test coverage. Sender-domain onboarding is not instant — check it
   first.
2. **Set `email.provider` / `email.from`** in D1 (DEPLOY.md §6). Nothing works
   before this.
3. **Create both Stripe webhook endpoints** with the nine events and both signing
   secrets (DEPLOY.md §10), or turn Stripe off at launch. Taking money and
   granting nothing is worse than not selling.
4. **Set `google.gemini_key`**, or the vision suite is unavailable and the UI will
   say so.

Sequence matters: nothing else in the product is reachable until step 1 works.

---

## The two blockers

### B1. Nobody could sign in, and the app said the code was sent

`apps/api/src/auth.ts` · `apps/api/src/mailer.ts` · Better Auth
`runInBackgroundOrAwait`

On a fresh deploy `email.provider` defaults to `mock`, which fails closed outside
dev. Round 2 surfaced that by throwing from `sendVerificationOTP`. **That is a
no-op.** Better Auth invokes the callback through `runInBackgroundOrAwait`, whose
body is `try { await promise } catch (e) { logger.error(...) }` — it does not
rethrow — so the endpoint still answers `200 {"success":true}` and the login UI
advances to the code-entry screen for a code that was never sent. Confirmed twice:
by reading the vendored source, and by probing the running worker.

The documented escape was a dead end too: `POST /api/admin/email` exists, has a
test, and has **no UI**, and it requires a platform-admin session — which requires
an OTP you cannot receive.

**Fixed.** Deliverability is pre-flighted in `otpSendGuard` *before* handing off to
Better Auth — the only layer that can still set a status — returning
`503 email_not_configured`. The login screen states plainly that this is our
problem, not the user's. DEPLOY.md now carries a working manual bootstrap, and the
two false "read your code from `wrangler tail`" claims are gone (the mock provider
returns *before* its `console.log`, so nothing was ever logged either).

### B2. Every client was locked out of the app

`apps/api/src/route-guard.ts` · `packages/domain/src/perms.ts` ·
`apps/api/src/access.ts`

`PATCH /api/clients/:id` demanded `client:["update"]`, a resource the `client` role
preset deliberately does not carry, and `intersectGrant` caps custom grants at the
preset — so a client could never satisfy it. Onboarding's `finish()` is exactly
that call, with no catch and no alternative route, so **no client could enter the
product.**

Wider than one line: the preset also lacked `supplement`, `lab`, `package`,
`session` and `goal` reads. The Wellness tab and Plans & access fan those out
inside an uncaught `Promise.all`, so both were **permanent loading skeletons** —
and a studio with `requireActiveAccess` pins a new client to the Plans screen,
i.e. bricked with no way forward.

**Fixed** in the gate (self-service writes ride `tracking:["update"]`, the idiom
already used for supplement logs, with `requireClientAccess` doing the own-record
check) and in both presets. A client still cannot create, archive or reassign
anyone. As a small hardening, the client persona can no longer rewrite its own
record's `email` — the identity field the sign-in auto-link matches on.

### Why the suite never caught either

`apps/api/vitest.config.ts` sets `ADMIN_EMAILS: ""` + `ENVIRONMENT: "development"`,
making **every signed-in test user a platform admin**, and `route-guard.ts`
short-circuits the action gate for platform admins. All 150 integration tests were
structurally blind to RBAC. I found this by writing a test that asserted a client
gets 403 on `POST /api/clients` and watching it fail against a `201`.

New `apps/api/test/route-gate.conformance.test.ts` checks the gate against the real
presets with no session and no bypass, including a typo-trap: a misspelled
resource key typechecks fine (the type is `Record<string, string[]>`) and 403s
everyone forever.

---

## Also fixed

**Money**

- A **partial refund revoked the entire credit pack** — `charge.refunded` fires for
  partial refunds and the handler read `meta.mossa_credits`, so a $5 goodwill
  refund on a $100/130k pack revoked all 130,000. Now proportional and
  incremental, with per-charge cumulative tracking on the existing ledger `ref`.
- **`charge.dispute.created` was dead code.** `event.data.object` is a *Dispute*,
  so `obj.customer` is `undefined` and `tenantByCustomer` bound `undefined` into
  D1 — either a throw that made Stripe retry the dispute forever, or a silent
  no-op. Chargebacks left credits fully spendable with nobody notified.
- **Capability resolution honoured only the newest subscription row**, contradicting
  `BILLING-PLAN.md:202`'s locked "union flags, stack days". A client holding a
  membership *and* a one-time package silently lost what they paid for, while
  `/api/context` summed across all rows — so the banner said "180 days left" while
  routes 403'd. One shared, tenant-scoped, all-rows read; flags union via a pure
  domain helper.
- **Connect renewals resolved the subscription only via the pre-Basil
  `invoice.subscription`.** On a Stripe account defaulting to 2025-03-31+, every
  renewal charged the card and topped up nothing, silently, returning 200.
- A **raced-out CAS on a paid grant was swallowed** (money captured, zero days);
  now throws so Stripe redelivers.
- **`once_per_customer` was enforced only on the free staff grant**, so a
  "first month intro" package could be re-bought indefinitely.
- The **15-minute reminder sweep stamped `expired` with no CAS guard**, clobbering a
  subscription that renewed while it iterated — and no read path flips
  `expired → active`, so a paying client was locked out until their next invoice.
  `reconcile()` twelve files away has had the correct guard all along.

**Row-level security** — all the same defect class: load by `id + tenant_id`, then
write without checking the row's `client_id`.

- `GET /api/swaps` with no `clientId` returned **every pending swap in the tenant to
  any client**, including client-authored injury free-text.
- `PATCH /supplements/:id`, `/labs/:id` and `/sessions/:id` missed
  `requireClientAccess`: an unassigned trainer could change a dose, write
  fabricated lab values into a chart, or burn a consultation the client paid for.
- `POST /media/upload` spliced an unvalidated `purpose` into the R2 key, letting a
  client write to the **public** `brand/` prefix on the studio's white-label
  domain. Now a closed set; `brand` is owner-only.
- **Client-authored text reached every AI prompt unfenced** — including the coach's
  supplement recommender, where instruction-shaped text in a client's own injury
  field could steer what the model recommends for them. Two auditors found this
  independently. `untrusted()` now has one implementation covering the
  `renderKnowledge` path.

**The invite dead-end** — `activeOrganizationId` is stamped at session *create*,
before the client auto-link and invitation auto-accept mint anything, and nothing
wrote it afterwards. So every invited coach and client got a real membership and
still resolved `active: null` forever, landing on "Create workspace"; the only
escape was to sign out and back in. Every pre-existing test worked around it by
POSTing `/context/switch`, which is what hid it. `/api/context` now adopts a sole
membership and persists it — never on a custom domain, where the Host pins the
tenant and a non-member must keep resolving to null. The existing §14.1 isolation
test caught my first attempt doing exactly that.

**Ops** — `/ready` now actually touches D1 and KV (`/health` answers 200 while every
request 500s, which cannot detect a broken deploy); `dailySweep` phases are
isolated so one transient D1 error no longer silently skips every monthly credit
grant; the two Better Auth OTP siblings that bypassed Turnstile and both rate
limits return 404; production sourcemaps (~8.5 MB, the whole frontend source) are
no longer published as public assets.

**Frontend** — offline cold start restores the cached session instead of dropping to
the login screen, which is what made the write queue unreachable in the exact
basement-gym scenario it exists for; queued writes report as *queued*, not failed,
so a retry can't double-log a meal; weigh-ins and body scans joined the offline
queue; `LogSheet` and 17 screen loaders no longer strand a permanent skeleton, and
independent fan-outs degrade one section instead of blanking the screen;
publish/create/send are guarded against double-submit with visible errors (a failed
publish now says the client hasn't received the plan); `CalendarHeatmap` and lab
due dates no longer drift a day.

**Docs and public claims** — DEPLOY.md rewritten so a human can actually follow it
(local wrangler auth, corrected step order, the real account-specific ids, a
Stripe section, an 18-key runtime-config table, a forward-only-schema rollback
section). `apps/www` no longer advertises "API + exports" on the $199 Team plan —
none of it exists and the flag is `reserved: true` — and the retention claim now
matches what ships. `/privacy` and `/terms` are published from `docs/legal/`, with
a build guard that refuses to publish a legal page still carrying a placeholder or
a draft banner. CLAUDE.md's Status section is now truthful about test counts and
what is not built.

---

## Deliberately not fixed

Real, verified, and left with reasons rather than silently dropped.

- **No UI assigns an existing client to a coach** (`clients.ts` trainer routes have
  zero callers). Multi-trainer staffing — the product's premise — can't be operated
  from the app; a coach only sees clients they created. Needs a new screen, not a
  fix. Documented in the trainer guide.
- **No client-archive UI**, so the `activeClients` quota is a one-way ratchet.
- **Packages cannot be edited or deleted** after creation.
- **Session add-on balances are not enforced**; `no_show` consumes nothing.
- **`staffSeats` is bypassable** via the deep-link accept and via role promotion.
- **`ai.mock = "on"` remains an admin switch** that bills for fabricated output,
  including clinical lab values, on any deployment, and no UI surfaces `mocked`.
- **Seed plans sell `chat`** while the flag is `reserved: true`; SPEC still lists
  `chat` and `integrations` as features.
- **The marketplace storefront and public blog have no renderer**, so the storefront
  toggle and `marketplace` visibility currently lead nowhere.
- **`weekly_load_target` split-brain**: the column sits at a hardcoded 300 while the
  coach writes `targets_json`, so the wellness score and the AI prompt grade
  against a different number than the Train tab shows.
- **7 npm advisories**, one on a production dep (`react-router` RSC CSRF). Not
  reachable here — client-only SPA, no RSC, no server actions — but a scanner will
  flag it.
- **No Playwright E2E**, and no integration coverage for sessions, add-on types,
  `staffSeats`, or the per-client AI cap.

---

## Verification

| | Before | After |
|---|---|---|
| `pnpm typecheck` | clean (9/9) | clean (9/9) |
| Domain tests | 188 | **191** |
| API tests | 150 | **219** |
| Protocol / app | 7 / 10 | 7 / **14** |
| **Total** | **355** | **431** |
| SPA build | ok, 8.5 MB sourcemaps published | ok, **0** published |

Every fix in the security and money sections was checked for non-vacuity: with the
source reverted the new tests fail, and with the fix in they pass. That check
matters more than the count — a green suite is not evidence a security fix works,
which is precisely how round 2 shipped a no-op.

---

## The lesson worth keeping

Round 2's two most important fixes were both plausible-looking no-ops. One threw
from a callback whose caller swallows throws; the other tightened a gate whose test
suite cannot observe gates. Both would have been caught by four lines of probe
code.

So: **if a fix depends on a third-party library's behaviour, run it. If a fix
depends on an authorization decision, prove the negative case with a test you have
watched fail.** Reading the call site is not verification. This is written into
[AGENTS.md](AGENTS.md) §10 so the next agent inherits it.
