# Mossa — Full Application Audit

A whole-app audit across security, domain correctness, API/data-integrity,
frontend/accessibility, performance/scalability, and testing/quality, followed
by the fixes landed for each finding. Verdict up front: the foundations were
strong — multi-tenant row-level isolation held, no SQL injection, Stripe
signatures verified, typecheck clean with no `any`/`@ts-ignore`, domain math
largely correct. The issues clustered in **money-path robustness under
failure/concurrency**, **RBAC over-grant**, and **operations that don't scale**.

Status legend: **✅ fixed** · **◑ hardened (residual noted)** · **⊘ accepted (documented)**

---

## Critical

| ID | Area | Finding | Resolution |
|----|------|---------|-----------|
| C1 | Stripe webhooks | Event marked "seen" (`firstSeen`) *before* the handler ran; a transient handler failure left it deduped, so Stripe's retry was dropped → money captured, credits/plan/package never granted. | ✅ Mark-after-process: handler wrapped in try/catch that calls `unmarkSeen` (deletes the `stripe_events` row) and rethrows (500) so Stripe redelivers. Both platform + connect webhooks. `stripe-routes.ts`. |

## High

| ID | Area | Finding | Resolution |
|----|------|---------|-----------|
| H1 | Credits DO | `settle()` charged the real `actual` unbounded by the reservation; combined with a vision estimate that never counted image tokens, a call could overspend the reserve. | ✅ `settle` charge = `min(hold.credits, actual)` (overspend invariant restored); vision estimate adds a worst-case `IMAGE_TOKEN_EST`. `billing-do.ts`, `ai.ts`. |
| H2 | Credits DO | `settle()` not idempotent — a retried/replayed settle double-charged. | ✅ `settle` early-returns when the hold is absent. `billing-do.ts`. |
| H3 | Workout logging | Find-or-create + read-modify-write of `entries_json` lost sets under concurrent logging / 500'd on the unique-session index. | ✅ `INSERT OR IGNORE` create + optimistic-concurrency CAS retry loop (`UPDATE … WHERE entries_json IS <prev>`). `log-routes.ts`. |
| H4 | Water logging | `ON CONFLICT DO UPDATE SET total_ml = ?` wrote an absolute precomputed value → concurrent increments lost. | ✅ Atomic `total_ml = total_ml + excluded.total_ml`, entries appended via `json_insert`, new total via `RETURNING`. `log-routes.ts`. |
| H5 | Redemption codes | Read-count-check-then-increment let two concurrent redemptions pass a `max_uses=1` gate; `used_by_json` rewrite lost a client. | ✅ Atomic per-client claim table `redemption_uses` (UNIQUE PK) + guarded `UPDATE … used_count+1 WHERE used_count < max_uses` (checks `changes`); `used_by_json` appended via `json_insert`. `commerce-routes.ts`, `db.ts`. New test. |
| H6 | Recurring subs | Second purchase extended the single active row and `COALESCE`'d away the new `stripe_sub_id` → charged monthly, no top-up; renewals read the wrong package. | ✅ Each Stripe subscription is its own `client_subscriptions` row keyed by `stripe_sub_id`; one-time purchases fold only into non-recurring rows. `stripe-routes.ts`. |
| H7 | RBAC | Trainer role spread `...adminAc.statements`, granting Better-Auth member/invitation management via `/api/auth/organization/*` — a trainer could remove/re-role/invite staff. | ✅ Removed the spread; trainer carries only coaching statements. `access.ts`. |
| H8 | Platform admin | `isPlatformAdmin` failed **open** when `ADMIN_EMAILS` was empty → any signed-in user = super-admin. | ✅ Fails closed; the dev convenience is gated on explicit `ENVIRONMENT=development`. `auth-context.ts`, `env.ts`, test config. |
| H9 | Perf | `member` table full-scanned on every authenticated request (no index). | ✅ `idx_member_org_user`. `db.ts`. |
| H10 | Perf | `/api/context` full-scanned `clients` by `LOWER(email)` on every boot. | ✅ Expression index `idx_clients_email_lower`. `db.ts`. |
| H11 | Perf | Weekly digest scanned all tenants × users sequentially with no per-week idempotency (at-least-once redelivery re-sent every email). | ✅ Per-(user, week, role) `digest_sent` marker gates each send — also lets a timed-out run resume next fire. `digest.ts`, `db.ts`. |
| H12 | a11y | The two most-used surfaces (Workout player, Meal plan) were raw `div` overlays — no dialog semantics, focus trap, or Escape. | ✅ New `useModalOverlay` (focus-in, focus trap, scroll-lock, Escape) applied to both; `role="dialog" aria-modal`. `overlays.tsx`, `WorkoutPlayer.tsx`, `MealPlanDrawer.tsx`. |
| H13 | Frontend | No global 401 handling — an expired cookie silently produced blank screens and failed saves. | ✅ `setUnauthorizedHandler`/`onUnauthorized` in `api.ts`; `SessionProvider` clears session → Login. |
| H14 | a11y | `Field` derived input `id` from label text → duplicate DOM ids in superset/circuit rounds. | ✅ Fallback id from `useId()`. `primitives.tsx`. |
| H15 | Tests | The trainer/client lanes of `requireClientAccess` (the security invariant) had zero integration coverage. | ✅ New test: trainer assigned→200, unassigned same-tenant→403, roster scope. `api.test.ts`. |
| H16 | Tests | The API Miniflare suite silently ran 0 tests without a prior SPA build. | ✅ `@mossa/api#test` turbo-depends on `@mossa/app#build`; prerequisite documented in CLAUDE.md. |

## Medium

| Area | Finding | Resolution |
|------|---------|-----------|
| Media (XSS) | `image/svg+xml` uploads served same-origin → stored XSS. | ✅ SVG dropped from `ALLOWED`; reads set `nosniff` + CSP `sandbox` + `Content-Disposition: attachment` for non-image types. `media-routes.ts`. |
| Media (IDOR) | Read enforced only the tenant prefix, not per-client assignment. | ✅ Per-client key scoping (`t/<tenant>/c/<clientId>/…`, read gated via `requireClientAccess`); the sensitive client-owned uploads (progress photos, lab files) now pass `clientId`. Existing tenant-prefixed keys still tenant-checked (backward compatible). `media-routes.ts`, `api.ts`, `LogSheet.tsx`, `Wellness.tsx`. |
| Stripe replay | Webhook verification had no timestamp tolerance. | ✅ Rejects `|now − t| > 300s`. `stripe.ts`. |
| Content feed | `/resources/feed` accepted an arbitrary `clientId` without an access check. | ✅ `requireClientAccess` when `clientId` present. `content-routes.ts`. |
| Email | Platform email charged credits before send with no refund on failure. | ✅ Refund (`topUp`) when `sendEmail` fails. `email-provider.ts`. |
| AI settle | `settle`/audit after a successful run were unguarded → a settle failure discarded the output / orphaned the R2 image. | ✅ Settle wrapped in try/catch; output/image always returned (hold self-reaps on TTL). `ai.ts`. |
| Cron | `reminderSweep` used bare `JSON.parse` with no per-row guard → one bad row aborted the sweep. | ✅ `parseJson` + per-row try/catch. `index.ts`. |
| Activity history | Unbounded, fully in-memory range. | ✅ Span clamped server-side (~13 months, anchored on `from`). `log-routes.ts`. |
| Supplements | Tap-to-toggle SELECT-then-INSERT 500'd on double-tap. | ✅ Atomic delete-first / `INSERT OR IGNORE`. `health-routes.ts`. |
| Domain — budgets | An `all` purchase queued behind the single longest runway, stranding shorter-runway features (paid-for-but-no-access gap). | ✅ `all` splits per feature, each queued behind its own runway. `budgets.ts` (+ redemption path). Test updated. |
| Domain — nutrition | `validateCalculatorInputs` skipped activity/goal/diet enums → NaN targets or a thrown destructure. | ✅ Enum membership validated; calculator uses defensive default lookups. `nutrition.ts`. |
| Domain — flags | Intersection hardcoded only `aiSuite`; other `requiresFeature` metadata unenforced. | ✅ Resolver loops `CLIENT_FLAG_META[*].requiresFeature`. `clientFlags.ts`. |
| Perf — seeds | `seedBilling`/`seedAiModels` re-ran write batches on hot paths. | ✅ Cheap storage-scoped existence check skips the batch once populated. `billing-store.ts`, `ai.ts`. |
| Perf — host | Custom-domain resolution did 3 serial uncached D1 reads per request. | ✅ One JOIN + KV cache (60s TTL). `host-context.ts`. |
| Perf — notifications | Bell sort not covered by index. | ✅ `idx_notif_recipient_time`. `db.ts`. |
| Perf — retention | Retention Radar issued one query per client (N+1). | ✅ One grouped query over the roster. `report-routes.ts`. |
| Perf — cron indexes | `subscriptions.status` / `client_subscriptions.status` scanned each tick. | ✅ `idx_subs_status`, `idx_subs_customer`, `idx_csubs_status`, `idx_csubs_stripe_sub`. `db.ts`. |
| Frontend | Silent media-upload failures; camera restart on re-render; out-of-order fetches; theme ignored tenant default; missing destructive confirms; `NaN` from decimal fields; array-index keys; boot flash; bell error state; logout localStorage bleed. | ✅ All addressed (shared `uploadMedia` with `up.ok`; `onDetected` ref; stale-guards; branding sync; `ConfirmDialog`; decimal sanitize + range; stable keys; boot skeleton; error state; key cleanup). `apps/app/*`. |

## Low / hygiene (fixed)

- Notification/digest email HTML escaped (`escapeHtml`) for user-supplied content. `notify.ts`, `digest.ts`, `mailer.ts`.
- `resolveEntitlements` coerces features to strict booleans / quotas to finite numbers (a typo can't enable a paid feature). `entitlements.ts`.
- `creditsForNeurons`/`neuronsForUsage` clamp non-finite/negative usage. `credits.ts`.
- `epley1Rm` docstring corrected (standard Epley, no reps=1 special case). `workout.ts`.
- Emoji removed from AdminConsole (lucide `Gift`). Docs drift fixed (ai-binding note, test count, build-before-test). CLAUDE.md.

## Accepted / residual (documented, not changed)

- **⊘ `once_per_customer` grant TOCTOU** (`commerce-routes.ts`): staff-initiated, negligible concurrency; left as check-then-insert.
- **⊘ Mock mailer logs OTP** (`mailer.ts`): the `mock` provider is dev-only by definition; production uses `cloudflare`/`brevo`. No env in scope to gate further.
- **⊘ `daysRemainingForFeature` across gaps**: documented "runway end" semantics kept.
- **⊘ Gemini key as query param** / provider keys plaintext at rest: by design; noted for a future encryption-at-rest pass.
- **⊘ Digest horizontal fan-out**: idempotency + resume landed; a Cloudflare Queues fan-out is the follow-up for very large tenant counts.

---

*Verification: `pnpm typecheck` clean across the workspace; 96 domain + 83 API
integration tests pass (3 added for the trainer lane, DO settle invariants, and
redemption over-redemption); the app typechecks and builds.*
