# Stage 7 — the UI inventory

Every surface in `apps/scena-app`, measured before the rewrite starts rather
than during. §7 of [SCENA-REWRITE.md](SCENA-REWRITE.md) says this should exist
first; this is it.

**Total: 21,910 lines across 91 files** — 24 routes, 22 page components, a
2,708-line builder, a 2,090-line component layer.

---

## 1. What the number actually is

| Layer | Lines | Fate |
|---|---:|---|
| `pages/` (22 files) | 11,552 | rebuilt |
| `builder/` (10 files) | 2,708 | **kept**, restyled only |
| `components/` (17 files) | 2,090 | mostly replaced by `@4dl/ui` |
| `App.tsx` + `nav.tsx` + shell | 799 | rebuilt on the shared shell |
| everything else (icons, theme, lib, legal) | ~4,760 | mostly deleted |

**The builder is not in the rewrite.** 2,708 lines of pointer-driven transform
controller, marquee select, align/distribute, z-order and undo/redo — the thing
that makes Scena competitive. It gets the tokens, the motion registry and the
loading rules; it does **not** get the row grammar or the one-primary-action
rule, per §4.5. Restyle, don't rebuild.

So the honest rewrite target is **~15,000 lines**, not 21,910.

---

## 2. Screen by screen

Ordered by what it costs, not by the nav.

### Tier A — rebuilt from scratch (6 screens, 5,033 lines)

| Screen | Lines | Why it is a rebuild |
|---|---:|---|
| `Admin.tsx` | 1,448 | **Deleted, not rewritten.** `@4dl/admin`'s section registry replaces it wholesale — Stripe, plans, AI models, promo codes, tenants and shared config are all panels the platform already ships. Kova's equivalent is ~200 lines of section declarations. |
| `LiveBoards.tsx` | 904 | Queue + room + score boards, station provisioning, announcement config in one file. Three subjects, one page. Wants an index and a page per board (§7 settings grammar applies to any config-shaped surface). |
| `Playlists.tsx` | 899 | Slide playlist list **and** detail **and** the slide editor. Three screens in one component. |
| `MusicPlaylists.tsx` | 833 | Same shape as Playlists, duplicated — the two should share one collection surface with a different item renderer. |
| `Feeds.tsx` | 755 | Sources list + detail + the per-provider config forms (RSS/api/gsheet/weather). |
| `ScreenDetail.tsx` | 731 | The fleet's most-used screen. Pairing state, channel assignment, schedule rules, remote commands, health. |

### Tier B — restructured, logic mostly survives (7 screens, 3,244 lines)

| Screen | Lines | Work |
|---|---:|---|
| `Settings.tsx` | 596 | → `SettingsIndex` + a page per section. Currently one long page. |
| `Channels.tsx` | 596 | → `Collection` + detail. |
| `Ads.tsx` | 553 | → `Collection` + detail; the TTS/voice-persona config becomes a section page. |
| `Billing.tsx` | 489 | Plan, credits, invoices → the shared billing surfaces where they exist. |
| `Team.tsx` | 450 | → `@4dl/auth`'s staff routes + roster (Stage 2 gives it the server side). |
| `Studio.tsx` | 364 | The Display Studio — keep the *idea*, restyle. It is Scena's best screen. |
| `MediaLibrary.tsx` | 357 | → `Collection`, exactly like Kova's rebuild. Nearly a straight port of that work. |

### Tier C — small, mostly restyle (9 screens, 1,988 lines)

`WidgetBuilder.tsx` (748 — the *page* around the builder, not the canvas),
`Login.tsx` (325), `BoardControlApp.tsx` (259), `Screens.tsx` (234),
`Station.tsx` (228), `Analytics.tsx` (221), `Alerts.tsx` (217),
`WidgetProfiles.tsx` (191), `Kiosk.tsx` (154).

`Station.tsx` and `Kiosk.tsx` are **operator surfaces on shared devices** —
they get the same treatment as Kova's client-facing screens (large targets,
one action, no chrome), not the dashboard grammar.

---

## 3. What `@4dl/ui` replaces outright

Of the 2,090-line component layer, these have a direct equivalent and should
simply go:

| Scena | Lines | Replaced by |
|---|---:|---|
| `toast.tsx` | 87 | `@4dl/ui` toast |
| `confirm.tsx` | 61 | `ConfirmDialog` |
| `page-header.tsx` + `page-chrome.tsx` | 111 | `Page` / `SettingsPage` |
| `status.tsx` | 77 | `Badge` + the tone registry |
| `ErrorBoundary.tsx` | 60 | `@4dl/app-kit` |
| `feature-gate.tsx` | 55 | `FeatureLock` |
| `media-picker.tsx` | 99 | `Collection` + `Thumb` |
| `tag-editor.tsx` | 61 | `@4dl/ui` chips |
| `app-shell.tsx` | 251 | the shared shell (nav stays Scena's — role-adaptive nav is a product decision) |

**~860 lines deleted outright.** `html-editor.tsx`, `device-preview.tsx`,
`PairModal.tsx`, `EmergencyModal.tsx`, `track-meta-dialog.tsx` and
`licensing.tsx` are Scena's own and stay.

---

## 4. The design-language gaps, counted

A scan for the patterns this repo already has rules and components for:

| Pattern | Files | Rule it breaks |
|---|---:|---|
| `animate-spin` hand-rolled | **14** | §7 — a spinner where a skeleton fits; `Spinner` exists |
| `catch(() => set…)` | **11** | §7 — a failed load rendering as empty, or a write that fails silently |
| `opacity-60` on a whole row | 7 | §4 — dims the tone that makes a list scannable |
| literal `Loading…` text | 3 | §7 — text where a skeleton belongs |
| hand-rolled `<h1>` header | 2 | §7 — one header per screen, from `Page` |
| `hover:scale` | 1 | a mouse idiom in a touch surface |

**The 11 `catch(() => set…)` sites are the ones that matter.** That is the exact
failure Kova's media library had — a failed load rendering as "nothing here" —
and it is spread across eleven files. It is also the cheapest fix in the list
and does not need the rewrite: it can land in Stage 2 or 3.

---

## 5. Sequencing Stage 7

Splitting it, because "21,910 lines" is not a task and these are:

| Sub-stage | Content | Est. |
|---|---|---|
| **7a** | `@4dl/ui` swap + delete the 860 lines of duplicated components + the shell | the foundation; everything else depends on it. **Part done — see §7a below.** |
| **7b** | Admin → `@4dl/admin` section registry | **Done — but the 1,448 → ~200 estimate was wrong. See §7b.** |
| **7c** | The four collection screens (Channels, Playlists, MusicPlaylists, Media) onto one `Collection` grammar | they are the same screen four times |
| **7d** | Settings + Billing + Team + Alerts → index-and-page | the settings grammar, wholesale |
| **7e** | ScreenDetail + Studio + LiveBoards — the product's core surfaces | most design judgement, do last when the vocabulary is settled |
| **7f** | Station / Kiosk / BoardControl — the shared-device surfaces | different rules, small |
| **7g** | Builder restyle (tokens + motion + loading only) | explicitly bounded by §4.5 |
| **7h** | Shots suite + the design review | the images are the deliverable |

---

## 6. Two things this inventory changed my mind about

**`Admin.tsx` should move earlier than Stage 7.** It is 1,448 lines that
`@4dl/admin` deletes, it carries no product logic, and it is where Stripe/plans/
AI-model config lives — all of which Stages 4 and 5 touch anyway. Doing it in
Stage 4 means those stages edit ~200 lines of section declarations instead of a
1,448-line page twice.

**The 11 silent-failure sites should not wait for Stage 7.** They are a
correctness bug, not a styling one, and each is a two-line fix. They belong in
whichever stage next touches their file.

---

## 7. Revised estimate

- **Deleted outright:** ~2,300 lines (Admin 1,448 + duplicated components 860)
- **Rebuilt:** ~12,700 lines across 22 screens
- **Restyled only:** ~2,700 lines (the builder)
- **Untouched:** the rest

"Every pixel" is real and it is **~15,000 lines of rebuild**, sequenced into
eight sub-stages of which two (7a, 7b) unlock the rest.


---

## 7a — what has landed, and what has not

**Done.**

- **`@4dl/ui` and `@4dl/app-kit` are dependencies of `@scena/app`.**
- **`packages/scena-ui` is deleted.** Its 302 lines of components had no
  importers left; the only thing anything used was `ScenaMascot`/`ScenaIcon`, a
  React wrapper around `@scena/brand`'s framework-agnostic SVG builders. The
  wrapper moved to `apps/scena-app/src/brand.tsx`, which is where a product's
  own mark belongs — `@scena/brand` stays React-free because the player imports
  it.
- **One token system.** Scena's 284-line `index.css` defined a complete parallel
  palette: its own `:root`, its own dark block, its own `@theme inline`. It is
  now `@import "@4dl/ui/tokens.css"` plus the brand violet and the widget
  keyframes — the two things that are facts about Scena rather than about
  interfaces in general.
- **The theme mechanism was WRONG, not merely different.** `@4dl/ui`'s tokens
  are dark-first (`:root` is dark; light lives under
  `:root[data-theme="light"]`); Scena toggled a `.dark` CLASS. A shared
  component dropped into a Scena screen therefore resolved every surface against
  the wrong mode — it compiled, it rendered, and the colours were simply wrong.
  `theme.tsx` stamps `data-theme` now.
- **`@source` for `packages/ui/src` and `packages/app-kit/src`.** Tailwind v4
  only scans what it is pointed at, and a package resolved through
  `node_modules` is not scanned automatically. Missing one does not fail — the
  components mount and typecheck and render with whichever classes some other
  file happened to use too.
- **`toast`, `Toaster`, `LoadError` and `EmptyState`** are the shared ones
  across 21 files; the three local modules are deleted. `EmptyState` keeps a
  thin app wrapper (`components/empty.tsx`) because the mascot mood is product
  vocabulary a design system may not carry — the same split CLAUDE.md describes
  for Kova's `StudioPausedBanner`.
- **`animate-rise` and `hover-lift` are gone.** Motion is UI-LANGUAGE's, and
  `hover-lift` was a mouse idiom in a touch surface — the same finding as the
  `hover:scale` row in §4.

**Not done, and the app is consistent without it.** The 18 vendored shadcn
primitives in `components/ui/` are still in place and still correct: they are
built on the same CSS variables, so they picked up the platform palette with no
change. Replacing them is what forces every page to change, because the APIs
genuinely differ — `@4dl/ui`'s `Card` is one element where Scena's has six
sub-components, its `Select` is `value`/`onChange`/`options` where Scena's is
the Radix compound, its `Dialog` requires `open`. That is a per-screen rewrite
and it belongs with the screens, in 7c–7e.

Also outstanding from this sub-stage: `page-header`/`page-chrome` (17 and 18
importers) → `Page`/`SettingsPage`, `confirm` → `ConfirmDialog`, `status` →
`Badge` + tones, `feature-gate` → `FeatureLock`, `media-picker` → `Collection` +
`Thumb`, `tag-editor` → chips, and `app-shell` → the shared shell. Each is a
sweep of the same shape as the four above.

⚠️ **Three `LoadError` call sites now pass a placeholder reason.** The pages
track `loadFailed: boolean` and never captured the error, so "We couldn't reach
the server." is the most honest thing available — it is accurate for a failed
fetch and it is actionable. Carrying the real error is per-screen work in
7c–7e, and it is the same fix as the eleven `catch(() => set…)` sites.


---

## 7b — the console moved doors, and the line count did not move much

**The estimate in §5 said 1,448 → ~200, and that was wrong.** It came from
Kova's console, whose seven tabs were all PLATFORM config — Stripe, email,
domains, Turnstile, AI, maintenance, shared config — every one of which
`@4dl/admin` already ships a panel for. Scena's seven are not the same seven.
Five of them (plans, AI model rates, the public track library, promo codes, the
workspace list) manage **Scena's own catalog**, and no shared panel exists or
should: a design system that knew what a licensed track was would not be one.

So `Admin.tsx` went 1,389 → 1,357 lines. What was actually deleted is the ~90
lines of tab shell; what was added is a 239-line `AdminDoor.tsx` that is mostly
a section registry and its prose.

**The win is not line count.** It is three things:

1. **A production 404 is closed.** The console rendered at `/admin` INSIDE the
   studio Shell, on any host, while `/api/admin/*` has been restricted to the
   `admin.` door since Stage 3. In production that route drew the whole console
   and then failed on every call it made. It is the exact failure CLAUDE.md
   records Kova having and removing, and it is invisible in dev, where one root
   means the guard correctly stands down (`isDevRoot`). The sidebar's "Admin"
   item is a full page load to the other origin now, because that is the only
   address the console has.
2. **Six sections that did not exist.** Email delivery, the shared platform
   config store, custom domains, the bot check, maintenance, and the Stripe
   rail's dead letter — the last of which Stage 4b created the table for and
   gave nothing that could read one back. Four route factories had to be mounted
   on the worker for them (`emailAdminRoutes`, `sharedConfigRoutes`,
   `railAdminRoutes`, `maintenanceAdminRoutes`); Scena had none of them, so six
   of the console's thirteen sections would have called routes that were never
   registered. `apps/scena/test/integration.test.ts` now fails if any of the six
   endpoints is unmounted — mutation-verified.
3. **A tab strip became an index and a page per section.** Kova's console
   measured 61,541px in its first tab on a seeded install with the other six
   invisible below it; Scena's "Workspaces" lists every workspace and "Public
   library" every track. The open section is in the URL over the History API, so
   it is linkable, bookmarkable and survives a reload.

**Still Scena's, deliberately:** the `stripe` section. `@4dl/admin`'s
`PlatformStripeSection` calls `/admin/stripe/config` and `/status`; Scena has
`/ping` and keeps its keys in `/api/admin/config`. Reconciling those is the same
shape of work as the `ai_models` catalog Stage 5 deferred, and for the same
reason — it is a data change, not a wiring one.
