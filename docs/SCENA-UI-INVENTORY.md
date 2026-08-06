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
| `MusicPlaylists.tsx` | 832 | Same shape as Playlists, duplicated — the two should share one collection surface with a different item renderer. |
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
| **7h** | Shots suite + the design review | the images are the deliverable. **Merged into Stage 8 — see the §7h/8 section below for why they are not separable.** |

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


---

## 7c — the collection screens became one collection

**Four screens, one grammar.** `Channels`, `MediaLibrary`, `Playlists` and
`MusicPlaylists` each hand-rolled the same five-state machine and got a
different subset of it right. `@4dl/ui`'s `Collection` owns all five —
LOADING / EMPTY / NO RESULTS / FAILED / FULL — plus the search field, the facet
button and the list⇄grid toggle.

| file | before | after | what it lost |
|---|---:|---:|---|
| `MediaLibrary.tsx` | 357 | 381 | the six kind chips + the tag dropdown (now facets), a grid-only view |
| `Channels.tsx` | 596 | 577 | its own `PageHeader`, search box and tag filter |
| `Playlists.tsx` | 899 | 764 | a five-column `<Table>` and three dialogs |
| `MusicPlaylists.tsx` | 832 | 707 | a five-column `<Table>` and three dialogs |

**The net is roughly flat, and that is the honest number**: 2,684 lines across
the four became 2,429 plus a 271-line `playlist-library.tsx`. Two of the four
files still hold their whole detail view — 7c is the LIST half — and the prose
that explains why each state is the state it is costs more lines than the
branches it replaced. What went down is the number of ways these screens can
behave: four hand-rolled state machines became one, and the defects below are
what the other three were getting wrong.

**Four real defects went with them**, one per screen, and each was the kind that
only shows up on a bad day:

1. **`String(e)` in a dashed card.** Slide playlists, channels and the media
   library all rendered `Couldn't reach the API: [object Object]` — an `Error`
   stringified through the wrong door — with nothing to press. `Collection`'s
   FAILED state is `LoadError`: the message the server actually sent, and a
   retry.
2. **A no-results line that named the wrong control.** Channels said
   `No channels match ""` when you narrowed by TAG to nothing; slide playlists
   said "No playlists match your filters" whichever control you had touched.
   `Collection` is told `narrowed` separately from `query`, so it offers to
   clear the one you actually set.
3. **A failed load rendered as an empty library.** The music list's catch wrote
   `[]` into the state its EMPTY branch reads, so an unreachable server drew
   `LoadError` **and** "No music playlists yet" stacked. The media library's
   `catch(() => setItems([]))` did the same thing without even the error.
4. **A create button that fired twice.** Of the four name dialogs across the two
   playlist files, one kept its button disabled while the write was in flight.
   The other three created two playlists on a double-tap.

**`PlaylistLibrary` is the second extraction, and it is the app's, not the
package's.** Slide playlists and music playlists were the same screen written
twice — same table, same search, same tag filter, and the same three dialogs
(create / rename / tags) with different API functions inside them. What is
shared is the *plumbing*: which verbs create and rename one of these, where a
row navigates, the ⋮ menu, the delete confirmation. What is NOT shared is the
row — a slide playlist's second line is its timing and transition, a music
playlist's is its length and genres — so `row` is a parameter and there is no
`kind` prop with two branches inside it. It sits in `apps/scena-app/src/components/`
because "playlist" is product vocabulary and `@4dl/ui`'s ALLOW list is empty.

**A `<Table>` for four short facts was the wrong container.** Both playlist
lists were spreadsheets: Name / Slides / Default / Transition / ⋮ and
Name / Tracks / Length / Genres / ⋮. On a phone the last columns were the first
to be squeezed out, which is to say the facts were hidden exactly where there
was least room to go and look them up. They are a `Row`'s `sub` line now, in one
sentence, in the order you would say them.

**Two things were deliberately dropped:**

- **The mascot on these four empty states.** `Collection.empty` takes a Lucide
  icon, because UI-LANGUAGE §7 fixes the shape of an empty state and a design
  system cannot carry a product's mascot. `components/empty.tsx` still wraps
  `EmptyState` with the mood for every screen that renders one directly — the
  detail views, `Screens`, `Studio` — so the mascot did not leave the app, it
  left the four collections.
- **Tag chips in a row.** A `Row`'s secondary line truncates, and a chip cut in
  half reads as a rendering fault where truncated text reads as truncated text.
  Tags ride the end of the `sub` line as `#tag`, and the way to see everything
  carrying one is the facet.

**`Screens.tsx` is the fifth collection and is NOT in this sub-stage.** Its
empty state is `GetStarted` — a 110-line first-run panel with a mascot, two
choice cards and a three-step explainer — which is not a `Collection.empty` and
should not be flattened into one. It also carries the fleet `StatTile` row above
the grid. It moves in **7e** with `ScreenDetail`, and `components/tag-filter.tsx`
stays alive until then as its last consumer.


---

## 7d — Settings, Team, Alerts and Billing

### `Settings.tsx` — three tabs became an index and a page per section

581 → 741 lines, and the growth is the point: what was added is the INDEX, and
what an index costs is one sub-line per row saying the current value.

The old shape was three tabs over one page — Account (one card), Brand kit (four
stacked cards, the last a 30-row token grid), AI (two cards). Two things were
wrong with it beyond the tabs:

- **Three save semantics in three adjacent cards, and nothing said which.** The
  brand form had "Save brand". The palette generator wrote into that same
  unsaved form and its only Save was a card away, so a generated palette got
  previewed and abandoned. The asset uploader saved immediately. Each of the
  four is its own sub-page now and each says how it saves; the palette page has
  its own Save on the same row as Generate.
- **The index could not have been written from the old page.** "Is multi-screen
  sync on" was a question you answered by opening the control that changes it.
  Every row now states its value — `Multi-screen sync on`, `4 custom tokens · 2
  logos`, `3 of 4 generators pinned`, the sign-in address — which is the whole
  trick the settings grammar turns on.

**`?s=brand&sub=palette`.** The open section is in the URL, over the router this
app already has. `useState` compiles and means every section shares one address:
Back leaves Settings from three levels deep, nothing is linkable, and a reload
lands on the index.

**Two writes stopped lying.** `toggleSync` and `pickDefault` both set state,
awaited, and never put the control back on a refusal — so a plan that refused
the change left the switch showing "on". Both snapshot and roll back now. And
`freeRun` is `null` until known rather than `false`, because a settings index
that renders "Screens free-run" during the first round trip has told somebody
their video wall is out of sync when it is not.

### `Team.tsx` — one rendering, not two

477 → 467. It shipped a desktop `<Table>` **and** a duplicated stack of mobile
cards: the same four facts written twice, which is how two renderings drift.
It is one `Collection` of `Row`s now, searchable, at every width.

- **The role moved into the ⋮ menu.** It was an always-armed 150px `<Select>` on
  every row — a mis-tap away from demoting a colleague, and the first thing to
  be cramped on a phone. It is a `Badge` you read and a menu item you choose.
- **The `LoadError` placeholder is gone.** 7a left this screen (and two others)
  passing a hardcoded "We couldn't reach the server.", which is honest about a
  dropped connection and a lie about a 403 — the two cases an owner most needs
  told apart. It carries the server's message now.
- Pending invitations stay a separate group above the roster, because each one
  holds a seat and because nothing you can do to a member applies to one.

### `Alerts.tsx` — two unguarded writes

217 → 230. `await addAlertRule(…)` and `await deleteAlertRule(…)` had no catch
at all, so a refused rule rejected into the app-wide "Something didn't load"
toast — which names neither the control nor the reason — and the form kept the
text it had failed to submit with no sign anything was wrong. Both go through
`@4dl/ui`'s `useAction` now, which cannot leave a rejection unhandled or a
button stuck busy, and the refusal renders **on the control that was refused**.
The target field is cleared only after the server takes it.

The four boxed stat cards became one `GlanceStrip` — they are a comparison, and
four half-empty boxes stacked on a phone is not one — and the values are `null`
rather than `0` while the first poll is in flight.

### `Billing.tsx` — the money screen had the unguarded write

525 → 525. `purchase()` had a `finally` and no `catch`: a refused credit-pack
checkout rejected into the generic toast, on the one screen where "we could not
take your money" has to be said out loud, with "you have not been charged".

The failed-load card asserted "We couldn't reach the API" whatever the server
answered — now `LoadError` with the real message. The three hand-rolled progress
bars are `@4dl/ui`'s `Meter`, which is where the "a real zero draws nothing, a
non-zero always draws something" rule lives. The ledger's five-column `<Table>`
is a `Row` list: Reference and Balance were the first columns squeezed out on a
phone, and Balance is the column somebody opens a ledger to read.

### Still outstanding after 7d

`components/status.js`'s `StatTile` now has one caller (`Screens.tsx`) and
should go with it in 7e — `GlanceStrip` is the shape. `page-header` and
`page-chrome` are still the app's own; they are the largest remaining sweep
(17 and 18 importers) and are not per-screen work, so they get their own pass.


---

## 7e — the core surfaces: Screens, ScreenDetail, Studio, LiveBoards

These are the screens somebody has open all day, and between them they held
**seven swallowed failures**. Every one produced a confident wrong answer
rather than an error, and four of them did it on a POLL — so the wrong answer
appeared and disappeared on a timer, which is how a fault becomes a shrug.

### The seven

| where | the swallow | what it rendered |
|---|---|---|
| `LiveBoards` | `listBoards().catch(() => [])`, every 2s | the first-run panel — mascot, "Create your first live board" — over a workspace with five |
| `Studio` | `getScreen().catch(() => null)` | "Screen not found. It may have been removed." for a dropped connection |
| `Studio` | `getSlidePlaylist().catch(() => [])` | "This display has no slides yet", with an Add button, over a display with twelve |
| `Studio` | `getChannelPublishState()` **uncaught** | the whole `load` rejected, `setLoading(false)` never ran, the page sat on its skeleton forever |
| `ScreenDetail` | `getDeviceSchedule().catch(() => ({tz:"UTC",rules:[],channels:[]}))` | three tracks saying "No dayparts yet" — on the screen that decides when a device is muted and when it sleeps |
| `ScreenDetail` | `saveTags` optimistic, no rollback | tag chips the device does not have, silently swapped out by the next 4s poll |
| `ScreenDetail` | `setDeviceScheduleTz(…).then(reload).then(toast)` | a rejected IANA name left in the field, nothing said, the rejection in the app-wide toast |

Plus two bare `await`s with no catch at all (`deleteDeviceScheduleRule`,
`addDeviceScheduleRule`) and one `String(e)` rendering `[object Object]`.

**The polling rule that came out of it, applied on all three polling screens:**
a failed poll is only shown while there is nothing to show. Once the list is
populated it stays, and the next tick either refreshes it or leaves it alone.
Replacing a working page with an error because one request in nine hundred
dropped is worse than the stale second it prevents.

### `Screens.tsx` — the fifth collection, and the facet it was missing

234 → 260. Onto `Collection` with both views, and `components/tag-filter.tsx`
is **deleted** — this was its last consumer.

**Online/offline is a facet now.** The fleet summary said "3 offline" and the
only way to find which three was to read every card — on a wall of forty
screens, which is the size at which somebody installs digital signage.

`GetStarted` stays a hard branch above `Collection` rather than becoming a
`Collection.empty`: it is a 110-line first-run panel with two choice cards and
a three-step explainer, which is a different thing from "nothing matched".
The four stat cards became a `GlanceStrip`.

### `LiveBoards.tsx` — an index and a page per board

904 → 848, and the shape is the point. The grid rendered `BoardBody` — the
counters editor, the categories editor, the announcement config, the
credentials panel — for **every board at once**. Five boards was five full
management surfaces stacked on one page: the 61,541px shape `@4dl/admin`
exists to prevent, and none of them could be linked to.

It is `SettingsIndex` + `SettingsPage` now, with the open board in the URL
(`?board=<id>`), so "open the front desk queue" is an address and Back closes
the board rather than leaving the screen. Each index row states what the board
is doing right now (`queue · Now serving A017 · 4 waiting`), which is the
current-value rule the settings grammar turns on. `BoardCard` and `BoardsList`
— a grid card and an accordion `<Table>` rendering the same editors two
different ways — are both gone.

### `ScreenDetail.tsx` and `Studio.tsx`

731 → 792 and 364 → 391; the growth is the error handling and the prose about
why it is there. The schedule rules moved off a seven-span flex row (which put
the days and the priority off the right edge of a phone, on a rule whose whole
meaning is *when*) onto `Row`: the window is the title, everything qualifying
it is the sub-line.

The preview-hero layout on both is **kept unchanged**. It is Scena's best
screen and the reason the product reads as a signage tool rather than a CMS.

### Still outstanding

`components/status.js`'s `StatTile` still has two callers (`Analytics`,
`Admin`); `GlanceStrip` is the shape for both and they are 7f/console work.
`page-header` and `page-chrome` remain the app's own — 17 and 18 importers,
one sweep, not per-screen work.


---

## 7f — the shared-device surfaces, and a regression 7a caused

### `className="dark"` stopped meaning anything in Stage 7a

The kiosk and the board-control tablet are **customer-facing surfaces on shared
devices**: they hang in a lobby, they are read from across a room, and they are
not somebody's dashboard to have opinions about. Both said "always dark" with
`className="dark …"` — correct while Scena was light-first with a `.dark`
CLASS, and inert from the moment 7a moved the palette to `@4dl/ui`'s dark-first
tokens under a `data-theme` ATTRIBUTE.

Nothing broke loudly. The class is a no-op, the pages render, and they quietly
inherit whatever that tablet's browser — or an operator who once opened the
dashboard on it, same origin, same `localStorage` — last chose.

`useForcedDark()` replaces it: dark is the **absence** of the attribute, so the
hook removes it and puts back exactly what it found on unmount.

### The same 7a break in the brand kit, and this one was worse

`brandCss` emitted `:root { …LIGHT tokens… }` and `.dark { …DARK tokens… }`.
After 7a that means:

- a tenant's **dark tokens applied nowhere at all**, and
- their **light tokens were injected at `:root`, which IS the dark theme** —
  so a configured brand rendered light-on-light in the app's default theme.

It ships fixed: dark tokens on `:root`, light tokens on
`:root[data-theme="light"]`, whose higher specificity is what makes it win in
light mode even though both selectors match there.

**`apps/scena-app` gains a test suite for exactly this** — its first, and the
reason is that neither failure has a symptom a typecheck or a build can see.
`brand-theme.test.ts` asserts the selectors (not the values — the selectors are
the part no screenshot review catches); `theme.conformance.test.ts` reads every
source file and fails on a `dark` class token in any `className`, and on
`useForcedDark` losing either of its two callers.

Both were **mutation-tested**, and the conformance one failed the first attempt
in a way worth recording: its regex used `(?:^|\s)dark` as the left boundary,
and `^` under the `m` flag is the start of a LINE — so `className="dark
min-h-screen …"`, the exact string it exists to catch, sailed straight through.
Found by reverting the fix and watching the test still pass. It also strips
comments first, because `theme.tsx`'s own header quotes the offending string
while explaining why it is wrong, and a guard that fails on the documentation
of its own rule is a guard somebody deletes.

### The kiosk's stuck button

`take()` awaited `issueTicket` bare, with `setBusy(false)` **after** it — so a
dropped request left every service tile disabled, on an unattended tablet at an
entrance, with nobody to reload it and nothing on screen saying why. It is a
`try/finally` with a message now.

### The last of the lying-empty loads

Six more `catch` clauses that answered a failure with a confident fact:

- `media-picker.tsx`: `catch(() => setItems([]))` → "Your library is empty" **in
  a picker**, where what somebody takes away is "I have no media" and what they
  do next is upload a second copy of something they own.
- `Feeds` detail and `Ads` detail: `catch(() => setFeed(null))` wrote into the
  same state a genuinely-deleted record writes, so "Not found." and "we could
  not reach the server" rendered identically — and only one of them has a way
  back.
- `Analytics`, `WidgetProfiles`, `Feeds` list: `String(e)` → `[object Object]`.

`Analytics` polls every three seconds, so it gets the same rule as the other
polling screens: the error only replaces the page while there is nothing to
replace.

### Deliberately NOT in this sub-stage

`Station.tsx` and `Kiosk.tsx`'s large-target layout is already the right shape
for a shared device and was left alone. The `catch(() => {})` calls on
**option lists** (AI model pickers, the widget builder's board/feed/weather
lists, branding) are correct as they stand: a picker that cannot load its
options degrades to a picker with no options, and there is no page-level claim
being made. Only loads whose failure becomes a STATEMENT were changed.


---

## 7g — the builder restyle: tokens, motion, loading. Nothing else.

§4.5's bound held. The 2,708-line transform controller, marquee select,
align/distribute, z-order and undo/redo are **untouched** — this sub-stage
changed colours, one loading state and one error state, and added a guard.

### The builder had two selection colours

`TransformBox` drew its outline, rotate handle, stem and group box in a
hardcoded `oklch(0.72 0.19 300)` repeated at six call sites. The marquee
rectangle on the page used `border-primary bg-primary/10`. So marquee-selecting
three widgets drew a **green** rectangle that then sprouted **violet** handles,
and neither value had a name saying it was a decision.

**And the fix is not "make them both a token."** These marks sit on top of the
tenant's design — arbitrary content in arbitrary colours — and `var(--primary)`
is a dark green in the light theme, i.e. a selection outline that disappears the
moment somebody selects a dark widget. Every editor that got this right pins a
fixed high-chroma hue for exactly this reason.

So: one exported constant, one wash, both used by the transform box AND the
marquee, with the reasoning in the header. What DID become tokens is the depth —
the two handle shadows and the stage's `shadow-2xl ring-black/40` are
`--shadow-sm` / `--shadow-lg` / `ring-border`, because a shadow is depth rather
than identity.

**`selection-chrome.conformance.test.ts` holds both halves of that**, and its
first version was wrong in an instructive way: it scanned the whole builder and
failed on three lines in `panel/Panel.tsx` — which were **right**. Those are the
default `style.accent` a metric / pulse / score widget is created with; they end
up in the manifest and are drawn by a TV that is not running this stylesheet.
Coupling a widget's shipped appearance to the colour of a selection outline
would be a worse bug than the one being fixed. The scan is scoped to the
builder's own chrome now, with the content exemptions as an explicit list and a
second assertion that the list has not grown to cover everything.

`Panel.tsx` gains a header saying the same thing, because that file is where a
future "tokenise the literals" sweep would do real damage: writing the string
`var(--primary)` into a manifest makes the player draw nothing.

Three mutations, all caught: the marquee reverted to `border-primary`, `SELECT`
changed to a token, and a second copy of the hue added to a chrome file.

### The loading and error states

- **The canvas loaded behind a centred spinner.** It is a `Skeleton` in the
  stage's own geometry now — the size is known before the widgets arrive, so the
  canvas can be its own shape while it fills rather than jumping into place from
  a one-line spinner.
- **The failed load was a status line reading "Couldn't load this profile —
  refresh to retry"**: an instruction to do by hand the thing a button does, on
  a screen with unsaved-changes guards, where *refresh* is the one word you do
  not want to be saying. The load is a `reload` callback and the failure is a
  `LoadError` with a retry. Save stays disabled either way — saving a failed
  load would overwrite the real stored layout with an empty one, which was
  already handled and is why `loadError` existed at all.

### The hover-lift finally went

7a deleted the `hover-lift` and `animate-rise` CSS utilities and said why: a
lift on hover is a mouse idiom in a touch surface. The inline Tailwind
equivalent survived on three card renderers (`Screens`, `Channels`,
`Playlists`) and a `group-hover:scale-110` on the remote-control tiles — and
7c/7e preserved them, which is the sub-stage's own oversight. All four are the
house press cue now: `transition-all hover:bg-surface-2 active:scale-[0.99]`,
the same string `@4dl/ui`'s `Card interactive` uses, so a press reads on a
finger as well as a pointer.

### Explicitly NOT done, per §4.5

The row grammar, the one-primary-action rule, the toolbar's density, and
`window.confirm` on the unsaved-changes guard. That last one is a real
inconsistency — every other confirmation in the app is `ConfirmDialog` — but
replacing it inside a `<Link onClick>` means making navigation async, which is
a rebuild of the leave path rather than a restyle. It is listed here so the
next person finds it named rather than discovers it.


---

## 7h / Stage 8 — proving it, and what the proof found

**The order in the plan is wrong, and this is the correction.** 7h ("shots
suite + design review") and Stage 8 ("prove it — E2E") were listed as separate
sub-stages, and 7h was first. They are not separable: a screenshot suite is an
E2E suite that photographs instead of asserting, and both need the same
harness — a worker on a port nobody else owns, a `*.localhost` topology, an OTP
read out of Miniflare's D1 file, a session cookie carried across hosts. Building
that twice would be building it wrong once. So the harness landed first, and the
shots suite rides on it.

### What the suite is, and why it is not the integration suite

`apps/scena/test` is 204 tests through Miniflare and covers the schema, the
cascade, the boards, the storage ledger and every refusal. What it structurally
cannot see is the browser — and in a signage product the browser is half the
system:

- a pairing code that renders but never claims,
- a publish that answers `200` while the screen keeps the old manifest,
- two screens that drift apart.

None of those is a route bug and none of them fails a server test.

### Port hygiene, which sounds like trivia and is not

Kova's suite owns 8787 and Tessa's 8788, and each writes into its own
`.wrangler` state — so a shared port makes whichever suite runs second silently
drive **another product's worker**, which fails as a baffling "element not
found". Scena takes 8789 for the dashboard and 8790 for the player.

The inspector ports matter for the same reason and are less obvious: `wrangler
dev` opens a devtools inspector on **9229 by default**, so several workers
booting at once race for it and the loser exits before serving a single request.
Playwright reports that as "Process from config.webServer exited early", which
reads as a broken app. Tessa pinned 9230; Scena takes 9231 and 9232.

### The player is a second worker, and that is the product

A screen is a DEVICE: one pinned URL, Service-Worker-cached, running for months
offline, resolving no tenant from its host. Driving it on the dashboard's origin
would prove a topology Scena deliberately does not have. So the suite boots two
workers and the two-screens spec opens the player on its own.

### ⚠️ The first thing the harness found is a shipping defect

The player cannot say `/api/…` — it is a separate origin — so `API_BASE` is
baked in at build time from `VITE_API_BASE`.

**That variable is set nowhere in this repo.** Not in a `.env`, not in
`deploy.yml`, not in the wrangler config. So the FALLBACK is what ships, and the
fallback was `http://localhost:8787`:

- a loopback address that does not exist on a television, so a deployed screen
  at `tv.4dl.app` could not reach Scena at all; and
- 8787 is **Kova's** worker in this monorepo, so a developer running the player
  locally against Scena was pointing it at another product.

**And the first fix was still wrong.** `https://scena.4dl.app` is the DASHBOARD's
origin; the pairing, manifest and asset routes answer on the **device door**,
`play.`, which Stage 3 gave Scena precisely because a screen is not a user
session. Everywhere else they answer `{"error":"wrong_door"}` — and the way that
surfaced in the player was a screen reporting itself **"offline — no cached
channel yet"**, a symptom two steps removed from its cause, which is exactly why
this needed a browser to find. It is `https://play.scena.4dl.app` now, with
`VITE_API_BASE` still the override for local work and for this suite.

**And the way the suite builds the player is itself a lesson.** The build was in
the `webServer` command first, which looks right and is not: `reuseExistingServer`
is true locally, so a wrangler already listening on the player's port means
Playwright never runs the command — and the suite drove yesterday's bundle,
built against the production origin, which reserved nothing. It is in
`globalSetup` now, which always runs.

### The second thing it found, in the suite rather than the product

A screen's reservation is a cross-origin `POST` with **no custom headers** — a
SIMPLE request, in the CORS sense, which needs no preflight. The suite's
`newParty()` helper adds a `cf-connecting-ip` header so each signing-in PERSON
spends their own OTP budget, and applying it to a device turned that simple
request into a preflighted one. The worker allows `content-type` and nothing
else, so the preflight was refused — and what the player showed for it was
**"offline — no cached channel yet"**, with nothing in the request log shaped
like a failure.

Not a product bug: a screen is not a person and has no OTP budget to protect.
But it is the same lesson as the API base, one level up — in this system the
symptom is always two steps from the cause, which is what a browser-level suite
is for.

### The guard that makes a third mistake impossible

`scripts/player-api-base.test.mjs`, in `pnpm gate`. It reads the `??` arm of
`config.ts` — the override may be anything a developer needs; the FALLBACK is
what ships — and asserts four things, each of which is a mistake this repo has
actually made or came one edit from making:

| assertion | the mistake it catches |
|---|---|
| there is a fallback at all | deleting it and relying on a variable nobody sets |
| it is `https:` and not a local address | `http://localhost:8787` — what shipped |
| its host starts with `play.` | `https://scena.4dl.app` — the first "fix", still the wrong door |
| its host names `scena` | 8787 is Kova's port; the same slip with a real hostname |

Mutation-tested against all three historical values.

**One local footgun the guard does not cover, deliberately:** the E2E's
`globalSetup` rebuilds `apps/scena-player/dist` against `play.localhost`, so a
checkout that has just run the suite holds a player pointed at a test port. CI
builds and deploys in separate jobs from clean checkouts, so production is
unaffected; locally, run the suite and then build again before deploying by
hand. The durable protection is the source fallback, which is what the guard
checks.

### The specs

1. **`01-workspace`** — an owner arrives with nothing: emailed code, workspace
   created, session carried onto `<slug>.localhost`, first-run panel, and the
   workspace genuinely empty rather than a fixture pretending to be. This is the
   path every other spec depends on and the first to break when the door
   classification, the OTP lane, the org-create call or the auto-select moves.
2. **`wall/two-screens`** — `position(t) = (t − T0) mod cycleLength`, in two
   browsers. `@scena/timeline` has 40 unit tests proving the function; none of
   them proves that two BROWSERS, pairing separately against a real worker and
   fetching a real manifest, land on the same slide. The pairing is real UI on
   both sides; binding both screens to one channel and publishing goes through
   the API with the browser's own cookie, because driving those through forms
   would make it a test of forms rather than of the clock.

   It reads the frame through the player's own **debug overlay**, whose header
   says it exists to make exactly this invariant observable by putting two
   players side by side. Using the product's instrument beats reaching into
   internals: an instrument that lies is itself worth failing on.

### ⚠️ And the third thing it found is that a wall costs money

The second `pair/claim` is refused: **`plan limit reached (1 screen)`**. Which
is the product working — `free` allows one screen, because a video wall is what
people pay for — and it means the two-screens spec **cannot run on the plan a
fresh workspace lands on**.

There is exactly one route to a bigger plan without Stripe, and
`billing-routes.ts` states it: *"A paid plan can't be granted for free: without
Stripe configured, only a platform admin may comp a tenant onto a paid plan."*
So the spec needs the development platform-admin lane — and **the launch gate
must never have it**, because a gate that hands itself platform admin cannot see
an authorization bug.

That is a config split, not a workaround, and Kova already draws the same line
between `playwright.config.ts` and `shots.config.ts`. `wall.config.ts` runs the
worker with `--var ADMIN_EMAILS:` — an EMPTY allow-list, which is what makes
`isPlatformAdminFor` fall back to `ENVIRONMENT === "development"` — and the spec
comps itself onto `starter` (3 screens) through the ordinary
`/api/billing/change-plan` endpoint, taking the admin branch the product itself
documents. It never reuses a running worker: one already up is almost certainly
the gate's, whose real `ADMIN_EMAILS` would refuse the comp as a 402 three steps
into a spec about clocks.

    pnpm --filter @scena/e2e e2e     # the gate: real authorization
    pnpm --filter @scena/e2e wall    # the wall: needs an operator

`apps.json` gains `"e2e": "@scena/e2e"` so `ci.yml` picks it up from the
registry rather than from a hardcoded list, and turbo's `e2e` task now declares
all three SPA builds — an `assets.directory` is a filesystem path, not a package
dependency, so nothing else connects them.

### ⚠️ And a fourth: the overlay reported "(no manifest)" when the manifest was there

Getting the wall spec green took three more diagnoses, and all three had the
same shape — a symptom that names the wrong subsystem.

**A stale manifest that satisfied the poll.** The first version waited for each
player's cached manifest to carry the right `channelId`, then compared the two.
It failed on the comparison, which reads as two screens one publish apart. It
was not: the LEFT screen was already on that channel — it is the display it was
auto-wired — and `currentManifest` lazily publishes v1 the first time a player
fetches a channel, so `{ channelId }` was satisfied by a manifest that predated
the seed. Poll for the version the publish RETURNED, and the ambiguity is gone.

**A frozen `requestAnimationFrame` loop.** With the manifests agreeing, both
players' debug overlays still said `slide — (no manifest)` forever. They had the
manifest. Playout is a rAF loop, Chromium does not run rAF in a BACKGROUND page,
and two players in two contexts means one of them is always backgrounded — so
the loop never ticked and `onFrame` never fired. The overlay's null-frame branch
prints "(no manifest)", which is true of its own state and false about the
screen. `page.bringToFront()` before reading is the fix.

**And the stale reading that fix introduces.** Foregrounding restarts the loop,
but the overlay still holds the last frame from before it froze. Parsing that
would compare a live reading on one screen against a stale one on the other —
precisely the mistake the spec exists to catch, arriving through the harness.
So `readFrame` captures the overlay text first, foregrounds, and waits for the
text to MOVE before parsing.

**The sampling window is handled, not tuned away.** Only one page can be
foreground at a time, so the two readings are necessarily a moment apart, and
the seeded slides turn over every 6.5–7 s — short enough that a boundary
sometimes falls inside the window. The spec reads **A, then B, then A again**:
A's two readings bracket B's in time, so whatever A was showing while B was read
is one of them. No boundary crossed → the bracket is one slide and the assertion
is exact equality; one crossed → B must be on the slide A was leaving or the one
it was entering. A clock that genuinely disagreed lands outside the bracket
either way. No retry, and no slide duration lengthened to make a test pass.

---

## The screenshot suite — §16, for Scena

`pnpm --filter @scena/e2e shots`. Four projects (desktop/narrow × light/dark),
21 images each, into `apps/scena-e2e/shots-out/<project>/<id>.png`. A workspace
is created through the sign-up form, two screens are **real players pairing on
the real device door**, and every piece of content is a POST the dashboard
itself makes. There is no fixture layer and no mocked endpoint anywhere in it,
which is the whole point: the images are of the product, so a redesign that
looks wrong photographs wrong.

It is a THIRD config, and the split is the one Kova already draws twice:

    pnpm --filter @scena/e2e e2e      # the gate: real authorization
    pnpm --filter @scena/e2e wall     # the wall: needs an operator
    pnpm --filter @scena/e2e shots    # the images: needs an operator, takes minutes

The demo workspace is comped onto `pro`. Without that the fleet caps at one
screen, boards render a locked card and sources say "not in plan" — **a
screenshot run of a smaller product than the one being sold**, which is the most
flattering possible mistake and the hardest to notice, because every individual
picture looks fine.

### What it found, and the one thing it got wrong itself

Three of the four failures were **the product refusing correctly**, and the
seeder now goes through the paths it actually offers rather than around them:

- **`pro` allows three widget profiles, and each display provisions its own.**
  Three displays use all three; a fourth is refused. The profiles shot points at
  the lobby display's own profile rather than one the suite invents.
- **An owner cannot issue or call a queue ticket.** A board provisions its own
  coordinator and station USERS, and `canControlBoard` admits one of those or a
  board-scoped token. The people who press those buttons are a receptionist at a
  desk and a tablet bolted to a wall, not whoever pays the bill. The world mints
  the kiosk and station tokens the product mints and uses each for what it is
  for.
- **Below `sm` the app-shell collapses every header action into one ⋮ menu**, so
  the "Pair screen" button does not exist at the narrow viewport. Widening the
  viewport or dropping the shot would both have been the wrong fix; both
  affordances are the product, so the step takes whichever one is on screen.

The fourth was the suite's own, and it is the one worth remembering because it
produced a bad IMAGE rather than a failing run — which is worse, because it
looks finished. **A readiness anchor must not be satisfiable by anything except
the screen being photographed.** Two ways it was:

- `getByRole("heading", { name })` is a **substring** match by default. `"Alerts"`
  also matched the "Recent alerts" section heading, and two matches is a
  strict-mode violation that surfaces through `toBeVisible` as an ordinary
  timeout — "the heading never appeared", on a page whose own failure snapshot
  showed the heading, twice, in plain sight. Raising the timeout does not fix it,
  and two runs were spent proving that.
- `page.getByText(...)` reaches the SIDEBAR. It is `hidden md:block`, so at the
  narrow viewport it is still in the DOM with `display: none` and `.first()`
  picks a hidden nav item — and at desktop it is visible, so a loose anchor is
  satisfied *before the screen has loaded anything*. That is how `/widgets` came
  to be photographed as "No widget profile selected": the builder needs
  `?profile=<id>`, the anchor `/widget/i` was satisfied by the sidebar's own
  "Widget profiles" label, and the surface an operator spends the most time in
  shipped as a picture of an empty screen.

Every anchor is `page.getByRole("main")`-scoped now, and every heading anchor is
`exact: true`.

### And two traps in the player, both naming the wrong subsystem

- **Playout is a `requestAnimationFrame` loop, and Chromium does not run rAF in
  a background page.** Two players in two contexts means one is always
  backgrounded, so its loop never ticks — and the debug overlay's null-frame
  branch prints `slide — (no manifest)`, which is true of its own state and
  false about the screen.
- **Foregrounding restarts the loop but the overlay still holds the last frame
  from before it froze.** Parsing that compares a live reading on one screen
  against a stale one on the other, which is precisely the failure the wall spec
  exists to catch, arriving through the harness. `readFrame` captures the
  overlay text first, foregrounds, and waits for the text to MOVE.
