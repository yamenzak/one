# Kova — Single-Source-of-Truth Registry Architecture

The app-wide passthrough: one record per feature that rules everything about it —
feature flags, permissions, notifications, metrics/charts/widgets, units, colour
& icon, AI & credits, multi-coach behaviour, settings, privacy, and the strings
users read. Screens and routes **read from the registry**; the registry is the app.

Approved decisions (see below) and rollout are tracked here as the migration
proceeds. This doc is the reference the work is checked against.

## The diagnosis

The app already had **six** partial registries with disjoint key spaces and no
join: `entitlements`, `clientFlags`, `perms`, `notifications`, `metric-coding`,
`ai-features`. A single feature ("food logging") was addressed as `canLogOwnFood`
(client-flag) · `tracking` (perm) · `activity` (notif) · `calories/protein/…`
(metrics) · `parse-food/snap-meal` (AI) — five names nothing connected. So
enforcement got copy-pasted (the `aiSuite` gate ~24×) and presentation drifted.

## The architecture — atoms & spine

**Layer A — atoms** (deduplicated vocabulary, one keyspace each):
`roles`, `entitlements`, `clientFlags`, `permissions`, `tones` (collapsing
Tone+Domain+MetricKey), `units`, `metrics`, plus new `notifTypes`, `auditActions`,
`strings`. Pure logic in `packages/domain`; presentation atoms in `packages/ui`.

**Layer B — the spine**: one `*.feature.ts` per feature under
`packages/domain/src/features/`, each a `FeatureSpec` that references atoms by key
and adds the facets no atom owns (notification templates, log/done strings,
privacy copy, audit actions, AI cost, per-persona surfaces). A `FEATURES` index
composes them; a conformance test validates every entry.

Enforcement **derives** from the record: one `gateFeature()` middleware
(entitlement + permission + client-flag + multiCoach) replaces the scattered
checks; `notify(type)` resolves category/title/link/template; `generate()` reads
gate + task + cost + prompt; colour/icon/unit resolve through `metrics`/`tones`.

## Approved decisions

1. **Persona vocabulary** — keep `trainer` as the internal role id (no rename);
   standardise the UI term to **"Coach"**; make the badge role-aware
   (Owner / Coach / Assistant / You).
2. **Custom permission grants** — **bounded by role**: a custom grant may narrow
   within a role's preset but never exceed it; owner is the one unbounded role.
   (Implemented in `perms.ts resolvePermissions` via `intersectGrant`.)
3. **Legal & privacy** — scaffold the registry facet + storage now; implement the
   two-level (Kova→tenant, tenant→client) consent flows in Phase 3.
4. **Granularity** — one `*.feature.ts` per feature composing shared atoms.
5. **Rollout** — phased, per-slice shippable PRs; each merges with tests green.
6. **Home** — logic/specs in `packages/domain`, presentation atoms in
   `packages/ui`; `protocol` re-exports types.

## Phases

- **P0 — consolidate the atoms** (behaviour-preserving unless noted):
  - **P0a** Permissions SSOT: `perms.ts` is the source; `access.ts` + `route-guard`
    are guarded by a conformance test; bounded custom grants (decision 2).
  - **P0b** Tones/Domain collapse; absorb the 8 inline body metrics into `METRICS`;
    de-dupe fasting zones / posture-tone / streak; resolve colour/icon splits.
  - **P0c** `notifTypes` + `strings` atoms; rewire `notify()` call sites; digest
    honours the owner email policy.
  - **P0d** Units symmetry + `noConvert`; single `hasFeature` gate helper; wire or
    retire the 3 unenforced entitlements; derive budget-gate lists from META.
- **P1 — the spine**: `FeatureSpec`, `FEATURES` index, `gateFeature`, conformance
  tests; swap copy-pasted gates for derived ones.
- **P2 — rewire features** to their records, in parallel vertical slices
  (Training · Nutrition · Body & Wellness · Supplements & Labs · Commerce &
  Billing · Content & Sessions · Staff & Settings).
- **P3 — new facets**: coach-action audit log; two-level legal/privacy consent;
  fully-populated done-message / activity-feed string registry.

## Status (shipped)

The refactor landed as seven squash-merged PRs, each green:

- **P0a** (#65) — `perms.ts` is the RBAC source of truth; `access.ts` guarded by a
  conformance test; bounded custom grants (`intersectGrant`).
- **P0b** (#66) — `METRICS` absorbs the 8 inline body metrics + `unitDimension`/
  `noConvert`; `FASTING_ZONES` + `POSTURE_SEVERITY_TONE` de-duped.
- **P0c** (#67) — `NOTIF_TYPES` atom; `notify()` derives category from type; the
  weekly digest honours the owner email policy.
- **P0d** (#68) — `requireFeature` gate helper; budget gating derives from
  `CLIENT_FLAG_META.budgetGate`; distance unit symmetry; `RESERVED_FEATURES`.
- **P1** (#69) — `FEATURES` spine + `gateSpecOf`/`gateFeature`; conformance test;
  the four AI flag-paired gates collapsed onto the record.
- **P2** (#70) — body-scan gates from its record via `gateFeature` (closing an
  unenforced `canUseBodyScan` gap); cross-package metric conformance in the app.
- **P3** (#71) — `AUDIT_ACTIONS` + `recordAudit()` wired into the key coach
  mutations; `GET /clients/:id/audit`.

Then the completion pass, closing the gaps P1/P2 had only proof-of-concepted:

- **Slice A** (#73) — **every** feature-level gate now derives from its record:
  ~30 sites across all routes converted to `gateFeature(c, key, clientId?)`; a
  base `aiSuite` feature added for the coach AI tools. Before: 5 sites on the
  record; after: all of them.
- **Slice B** (#74) — each notification's default **title + link live on its
  `NOTIF_TYPES` record**; `notify()` renders them, call sites pass only what
  varies (message; name-interpolating titles / client-scoped links stay inline).
- **Slice C** (#77) — `STUDIO_SETTINGS_SECTIONS`: the studio-settings tabs + their
  entitlement gating come from a registry (concern #8), not inline `show` flags.
- **Slice D** (#76) — `coaching.ts` facet: the multi-coach access rule
  (`canAccessClient`, `primaryCoach`) is one tested pure function; `requireClientAccess`
  applies it instead of inline role branches (concern #9).
- **Slice E** (#75) — `persona` atom: the `trainer` role always renders as
  **"Coach"** (with a "You" self variant + role-aware badge), from one place
  (concern #12).

**Still deferred (needs product/design input, not a registry):** the two-level
legal/privacy **consent flows** (decision 3) — versioned TOS + per-tenant +
per-client consent capture and UI. The platform-level Terms + Privacy Policy
were drafted (`docs/legal/`); the in-app consent flows are the remaining work.
The done-message/activity-feed string registry stays folded into the notif-type
vocabulary (P0c/Slice B) — the app has no toast layer and the remaining feed
titles are single-use.

## Guardrails

Every phase merges only with the workspace suite green. A registry-conformance
test runs in CI so no feature can reference a missing atom or drift from
`access.ts`. Row-level scope (`requireClientAccess`) and the entitlement∩client-flag
intersection are preserved as first-class, tested contracts.
