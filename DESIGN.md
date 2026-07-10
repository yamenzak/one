# MOSSA DESIGN.md — UI System

> Source of truth for Mossa's interface. Derived from the Google Health redesign
> (reference screenshots in `docs/google-health-ui/`), rebuilt on **shadcn/ui + Tailwind v4 +
> Radix**. One design system, one app, three roles (client / trainer / owner+admin) — §5.
>
> The bar: *"a 70-year-old can use it."* Every screen decision below serves that.

---

## 1. Design Language (extracted from the screenshots)

### Surfaces & depth
- **Dark-first.** App background near-black (`#0B0C0E`), cards one step lighter
  (`#16181B`), nested sub-cards one more step (`#1E2126`). **Separation comes from
  surface tone only — zero borders, zero shadows.** Light theme mirrors the same 3-step
  tonal ladder (Google does `#F8FAFD → #FFFFFF → #EEF1F6`).
- **Everything is very round.** Cards ~24–28 px radius, buttons/chips/pills fully
  rounded, hero metric pills are stadium-shaped, icon containers are squircles. Nothing
  has a sharp corner.
- Generous whitespace; one idea per card; screens are long and scroll — never dense.

### Color = meaning
- **Each data domain owns an accent**, used as a *tonal pair* (Material 3 style:
  `container` background + `on-container` content):
  - Activity/training → teal, Nutrition → amber-orange (Mossa; GH uses teal for cals),
    Sleep/recovery → purple, Cardio/heart → blue/green, Hydration → cyan.
- **Status is always a tonal chip with text**, never color alone: green `In range`,
  amber `Fair` / `Goal not met`, red `Out of range`. (Colorblind-safe by redundancy.)
- Actions are one consistent primary (GH: muted blue tonal pills). Destructive = red.

### Typography
- One friendly geometric sans (GH uses Google Sans; we use **Figtree** or Inter),
  sentence case everywhere, no all-caps labels.
- **Huge numerals carry the story**: metric values at 40–56 px semibold with
  `tabular-nums`; labels are small (13–14 px) and muted, sitting *above* the number.
  Units rendered smaller than the value (`4.483 cal`).

### Signature patterns (what makes it feel like this app)
1. **Hero ring + metric pills** — left: one big progress ring (value, goal, curved label
   on the arc); right: a stack of 3 stadium pills (squircle icon + label + value), each
   domain-tinted, some with a *two-tone fill showing progress inside the pill* (Exercise
   days "3 of 5"). The hero is a **swipeable carousel** (dot indicators) — page 2 holds
   the weekly view (target ring "213 of 360", `+79` delta badge).
2. **Action row under the hero** — `+ Log` and `▶ Start` as large tonal pills, plus a
   small circular **pencil = customize this dashboard**.
3. **Timeline feed** — the rest of Today is a reverse-chronological feed of *events*:
   sparkle icon (✦ = auto/AI), timestamp, plain-language title ("Sleep tracked"), a
   big-value sub-card, **👍/👎 feedback buttons**, overflow menu. Days separated by a
   **wavy squiggle divider** with the day label — whimsy, not chrome.
4. **Stat card** — label, huge value+unit, status chip bottom-left, **mini chart
   right** (dot-line sparkline, rounded bars, or S-M-T-W-T-F-S day strip; dotted
   target line where a goal exists; tiny award badges on goal-met bars).
5. **Detail page grammar** — duo stat cards up top (score + duration, each with status
   chip), one rich visualization (the **hypnogram**: per-stage horizontal rounded
   tracks with a shared time axis), feedback row, then a full-width outline `History`
   button. Every metric detail follows this.
6. **Library grid** — 2–3 col grid of tall rounded cards with flat illustrations and a
   single word label (Strength, Cardio, Yoga…). Quick-start chips above it.
7. **Form pattern** — full-screen sheet: × close + title; **outlined Material text
   fields** (label notched into the border) with leading icons; a **"Probable
   activities" suggestion-chip row** (selected = filled + check); "Optional
   information" section with helper text ("If left empty, energy burned is
   auto-calculated"); one giant pill **Save** pinned to the bottom.
8. **Log sheet** — bottom sheet (grabber handle) titled "Log manually" containing a
   wrapped **chip grid** of loggable things. Two taps from anywhere to any log form.
9. **Week dots** — 7 circles S-M-T-W-T-F-S, filled+icon on active days, today
   highlighted. Used for streaks/recent activity everywhere.
10. **Settings = flat list** — colored section headers (Your account / App settings /
    Preferences), icon + label rows, no cards at all.
11. **App bar** — context chip left (GH: battery), page title center, avatar right
    (avatar opens account/profile switcher). Bottom: **4-tab bar**, active tab = filled
    pill around the icon.

---

## 2. Rebuild with shadcn/ui + Tailwind v4

Stack: shadcn/ui (Radix primitives) + Tailwind v4 `@theme` tokens + Recharts (charts) +
vaul (bottom sheets) + custom SVG for rings/hypnogram. Lives in `packages/ui`.

### 2.1 Tokens (Tailwind v4 `@theme`, CSS-first)

```css
@theme {
  /* Tonal surface ladder (dark) — light theme flips via [data-theme] */
  --color-bg: #0b0c0e;            /* app background   */
  --color-surface-1: #16181b;     /* card             */
  --color-surface-2: #1e2126;     /* nested card      */
  --color-surface-3: #262a30;     /* pressed/hover    */
  --color-fg: #e8eaed;  --color-fg-muted: #9aa0a6;

  /* Primary action (tonal, not saturated) */
  --color-primary: #a8c7fa;  --color-primary-container: #1b3a57;
  --color-on-primary-container: #d6e3ff;

  /* Domain accents — each is a container/on-container tonal pair */
  --color-activity: #6dd3c2;   --color-activity-container: #0f3d36;
  --color-nutrition: #ffb870;  --color-nutrition-container: #4a2e0e;
  --color-sleep: #c5a8ff;      --color-sleep-container: #372a54;
  --color-cardio: #8ab4f8;     --color-cardio-container: #1e3a5f;
  --color-hydration: #7fd8e8;  --color-hydration-container: #103d46;

  /* Status chips */
  --color-good: #6dd58c;   --color-good-container: #123f26;
  --color-warn: #fdd663;   --color-warn-container: #4a3a08;
  --color-bad:  #f28b82;   --color-bad-container:  #4e1512;

  --radius-card: 1.75rem;  --radius-field: 1rem;  /* radius-full for pills/chips */
  --font-sans: "Figtree", system-ui;
}
```

Rules: components never use raw palette colors — only these roles. `tabular-nums` on
every numeral. shadcn's `--radius` mapped to `--radius-card` so Card/Sheet/Dialog round
correctly by default.

### 2.2 Component inventory

**Restyled shadcn (keep the primitive, reskin):**

| Component | shadcn base | Restyle |
|---|---|---|
| `Button` | Button | `rounded-full h-14 px-8`; variants: `tonal` (primary-container), `filled`, `outline` (1px fg-muted/30, used for History), `ghost-circle` (pencil) |
| `Chip` | Badge / Toggle | Status chip = Badge in tonal pair; **SuggestionChip** = Toggle (selected → filled + check icon); chip grid = ToggleGroup wrap |
| `Card` | Card | `bg-surface-1 rounded-[--radius-card] border-0 shadow-none p-5`; `SubCard` = surface-2 |
| `Sheet` (bottom) | Drawer (vaul) | grabber bar, `rounded-t-[2rem]`, chip-grid content = the **LogSheet** |
| `FormDialog` | Dialog | full-screen on mobile (× + title + pinned Save pill), centered `max-w-lg` on desktop |
| `Field` | Input + Form | **Outlined-notch variant**: wrap in `fieldset` with `legend` carrying the label (pure CSS, no JS), leading icon slot, helper text below |
| `Select`, `DatePicker`, `Switch`, `Slider`, `Tabs`, `DropdownMenu`, `Toast`, `Skeleton`, `Avatar` | as-is | token reskin only |
| `SegmentedControl` | Tabs | pill segments for range pickers (7d/30d/90d) |

**Custom components (the identity — build once in `packages/ui`):**

| Component | Notes |
|---|---|
| `ProgressRing` | SVG, rounded linecap, thick stroke (~14%), center value + sub-label, optional **curved label on the arc** (`<textPath>`), color prop = domain role |
| `TargetRing` | ProgressRing + "213 of 360" center + floating `+79` delta badge |
| `MetricPill` | stadium pill: squircle icon container + label + value; optional `progress` prop → two-tone fill (the "3 of 5" effect via gradient stop) |
| `HeroCarousel` | swipeable pages + dot indicators (embla), page = ring + pill stack |
| `ActionRow` | Log / Start / pencil layout under hero |
| `StatCard` | label, big value+unit, status chip slot, right-side chart slot |
| `Sparkline` / `MiniBars` / `DayStrip` | Recharts Line/Bar with dots-on-line, rounded bars, dotted target `ReferenceLine`, S-M-T-W-T-F-S axis, award-badge overlay |
| `Hypnogram` | custom SVG: N horizontal stage tracks, rounded segments, connectors, shared time axis — reuse for sleep stages, fasting zones, any staged timeline |
| `ZoneChart` | day line chart with horizontal dotted zone bands + zone chip |
| `TimelineFeed` / `InsightCard` | ✦ icon, timestamp, title, sub-card, 👍/👎, ⋮ menu |
| `WavyDivider` | SVG squiggle + centered day label |
| `WeekDots` | 7 circles, filled/today states |
| `LibraryCard` | tall rounded card, illustration, single-word label |
| `BottomTabs` / `NavRail` | 4 items, active = filled pill; rail variant ≥ `md` |
| `AppBar` | context chip · title · avatar |
| `SettingsList` | section header (accent text) + icon rows |
| `ScoreBadge` | big score + qualitative chip (74 · Fair) |

**Accessibility floor:** min 48px tap targets, text ≥13px, chips always text+color,
visible focus rings, `prefers-reduced-motion` kills carousel autoplay/ring animation.

---

## 3. Mapping SPEC.md content onto this UI (client persona)

Bottom tabs: **Today · Train · Eat · Progress** (avatar → profile/settings).

### Today (SPEC §8.6, §8.7, §6)
- **HeroCarousel page 1 — "today"**: ring = **calories** (net consumed vs target);
  pills: Protein (nutrition), Water (hydration, progress-filled), Workout (activity,
  progress-filled from logged/prescribed sets).
- **Page 2 — "this week"**: TargetRing = **weekly Training Load vs trainer-set target**
  (new feature, §6 of this doc); pills: Exercise days "3 of 5" (goal-aware two-tone),
  Active minutes, Check-in streak.
- **ActionRow**: `+ Log` → LogSheet (chip grid: Food · Barcode · Snap-a-Meal ✦ ·
  Voice ✦ · Water · Weight · Body fat · Activity · Sleep · Mood · Fasting · Check-in —
  chips filtered by client feature flags); `▶ Start` → today's recommended workout day;
  pencil → customize hero (§6).
- **Supplements strip** (when prescribed): a horizontal tap-to-log slot row (Morning ·
  Pre-workout · Evening…) — each slot a MetricPill that fills when tapped; adherence
  WeekDots underneath. Lives between hero and feed.
- **TimelineFeed**: check-in reminders, "Workout logged" with PR sub-card, ✦ AI insights
  (Check-in Summarizer output, Snap-a-Meal results), **trainer feedback messages**,
  supplement/lab reminders ("Blood panel due Friday"), subscription nudges ("meal budget
  expires in 3 days"), and **Explore content cards** (assigned articles/recipes from the
  tenant content hub). 👍/👎 on every ✦ card feeds the AI feedback loop. WavyDivider
  between days = the diary day strip, reimagined.

### Train (SPEC §8.3)
- Quick-start chips: today's plan day · Freestyle workout · Log activity.
- **Workout library grid** (LibraryCards): My Plan, Saved, then platform categories
  (Strength / Cardio / Mobility & recovery / Stretching / Yoga) — illustrations from
  `packages/brand`.
- Recent activities: WeekDots + rows (icon · name · time • duration • kcal · right-side
  **Load** number) + `+ Log activity` tonal button.
- Key metrics: StatCards — Training load (dotted target), Tonnage, e1RM PRs, Active
  minutes.
- Workout player keeps ByShujaa's flow re-skinned: day hero → blocks → set drawers
  (bottom sheets), rest timer as a floating pill, PR toast + haptic.
- **Add-activity form** = the Form pattern verbatim: Activity field with search,
  **Probable-activities SuggestionChips** (recency-ranked, §6), date/start/duration,
  Optional information (Energy burned helper: "If left empty, calculated from MET ×
  your weight"), pinned Save.

### Eat (SPEC §8.4)
- Hero: **calorie ring segmented by macros** (donut = ring with segment stops) + pills
  Protein/Carbs/Fat; page 2: calorie-adherence week + grocery-list shortcut.
- Meal sections (bank-of-options one-tap logging), quick actions: Barcode · ✦ Snap ·
  ✦ Voice · Search · Quick entry. Barcode miss offers **✦ Label Reader** (photograph the
  nutrition panel). Free-meal cap shown as a warn chip.
- ✦ **Meal Swap** ("what fits my remaining macros?") and **Menu Scout** (restaurant menu
  photo) as secondary actions; **Recipe Builder** reachable from the grocery list.
- Meal detail per entry = StatCard grammar; plan drawer + weekly arrangement keep their
  drawers, restyled as Sheets.

### Progress (SPEC §8.5, §8.7)
- **Goal status card** (Health-status pattern): "3 of 5 targets on track" + chips per
  target (In range / Off track) — driven by trainer-set goal ranges (§6).
- **Key metrics grid** (2-col StatCards, "Customise" link): Weight (dotted target line),
  Body fat % (ACE zone chip), Measurements, Sleep avg, Wellness index, Adherence %.
- Metric detail = Detail grammar: duo cards (current + goal), big chart (ZoneChart for
  weight-in-range, Hypnogram pattern for sleep stages if wearable data ever lands,
  fasting zones today), `History` outline button → full log list.
- **Body tests (labs)** section: request cards with status chips (Requested / Uploaded /
  Reviewed) and due dates; detail = upload flow + ✦ Lab Extract value table with
  out-of-range rows flagged (bad-container chip) — extraction only, trainer reviews.
- **Supplements** overview: current regimen cards (kind icon + dose + schedule) with
  adherence WeekDots; tap-to-log lives on Today (§ above).
- Check-in flow keeps its form; progress photos gallery; body-fat camera entry lives
  here + in LogSheet.

### Cross-cutting
- **Explore (content hub / blog)**: LibraryCard rail on Today + full grid ("See all") —
  articles, recipes, routines from the tenant's content hub (SPEC §8.10); article page =
  clean markdown reading view. Public-audience posts render on the tenant marketplace
  page as the SEO blog. Trainers author via Library → Resources (✦ Resource Writer).
- Settings = SettingsList pattern (Account / Preferences (units, theme) / Notifications /
  Subscription).
- Marketplace/paywall surfaces reuse Card + Button tonal styles; PaymentBlocker is a
  full-screen Card with one action.
- All 8 ByShujaa theme variants collapse to **theme accent swapping on the same tonal
  ladder** — tenant branding (Studio+ plan) recolors `--color-primary` + domain accents.

---

## 4. Desktop behavior (same app, no second UI)

- `< md`: bottom tabs, single column, sheets slide from bottom.
- `≥ md`: BottomTabs → **NavRail** left; content `max-w-3xl` centered; Progress/Key
  metrics become 2–3 col grids; sheets become right-side panels or centered dialogs.
- `≥ lg` (trainer/owner focus): **two-pane** — list pane (roster/library) + detail pane.
  The exact same components render in both panes; nothing is dashboard-specific.

---

## 5. One UI, three roles (the decision)

**One app, one design system, one page grammar — three nav configs.** We do not build a
separate client app, trainer dashboard, and admin panel. `apps/app` is a single
role-adaptive PWA:

| Role | Bottom tabs / rail | What each surface is |
|---|---|---|
| **Client** | Today · Train · Eat · Progress | as §3 |
| **Trainer** | Today · Clients · Library · (Business*) | **Today = triage inbox**: same TimelineFeed pattern, but events are "Sara checked in" (with ✦ AI summary sub-card + quick-reply), "2 swap requests", "lab uploaded — review", ✦ Retention Radar cards ("Omar at risk: no logs 6 days — suggest a check-in nudge"), "Ali's meal budget expires Friday". Hero = roster rings (clients on-track ring + pills: pending check-ins, swaps, expiring subs). **Clients** = roster list (search + WeekDots per row) → client detail. **Library** = LibraryCard grid: Exercises, Foods, Workout templates, Meal templates, Content hub (blog/articles/recipes). |
| **Owner** | + **Business** tab | Packages & marketplace, client subscriptions, Stripe Connect status, **AI credits** (balance ring + usage-by-feature StatCards + ledger feed), staff & roles, tenant settings/branding. Same StatCard/feed grammar — a credits balance is just another big number with a sparkline. |
| **Platform admin** | hidden section (`ADMIN_EMAILS`) | Tenants, plans, AI models, app config — SettingsList + StatCards again. |

**The keystone: the trainer's client-detail page IS the client app.** Opening a client
renders the same Today/Train/Eat/Progress surfaces scoped to that client, wrapped in
coach chrome (client switcher app-bar, edit powers, feedback composer, plan
publish actions). One implementation of every surface, two consumers:

- Client sees *their own* data with logging powers.
- Trainer sees *the client's* data with coaching powers (edit/prescribe/feedback),
  gated by `requireClientAccess` + resolved flags.

Role differences are **scope + powers + nav**, never new screens. Coach/Train mode
switching (SPEC §2) is just swapping which nav config renders — the trainer's own
Train-mode is literally the client persona pointed at their linked client record.

Monorepo consequence (SPEC §3 updated): `apps/dashboard` + `apps/client` merge into
**`apps/app`** — one Vite + React 19 PWA, served by the api worker's assets binding at
one origin, offline write-queue included. `apps/www` unchanged.

---

## 6. New features this UI adds to SPEC.md

Adopted into SPEC §8.11 (summary here, spec is canonical):

1. **Insight timeline feed with 👍/👎** — Today is a feed of events + AI insights;
   feedback is stored per insight (`insight_feedback`) and becomes the eval/tuning
   signal for AI features (and a mute switch per insight type).
2. **Training Load & weekly target** — a load score per session (from tonnage,
   RPE/effort, MET minutes), summed weekly against a trainer-set target; TargetRing on
   Today page 2, dotted target lines on Train metrics. (Our honest, wearable-free
   answer to "Cardio load".)
3. **Trainer-set metric ranges → status chips** — goals get healthy ranges (weight
   band, water floor, sleep window…) so every metric can say In range / Off track;
   powers the Progress "goal status" card ("3 of 5 on track") and red/green chips.
4. **Customizable dashboards** — pencil-edit the hero (pick ring metric + pills) and
   "Customise" the Progress key-metrics grid; stored per persona
   (`dashboard_prefs` JSON); trainer can push a recommended layout to a client.
5. **Probable-activity suggestions** — recency+habit-ranked chips on the activity form
   (pure heuristic v1, AI later).
6. **Scores** — composite **Recovery/Wellness score** (sleep + mood + energy − stress,
   already spec'd as wellness index) surfaced as ScoreBadge with qualitative chip;
   sleep score placeholder for future wearable data.
7. **Illustrated workout library categories** — platform seed content organized as
   browsable categories (Strength/Cardio/Mobility/Yoga/Stretching) + Saved; feeds
   freestyle workouts for clients whose package has no plan (upsell surface).
8. **History-everywhere** — every metric detail ends in a History button → uniform
   paginated log list with edit/delete.
9. *(Backlog, not v1)* **Wearable import via Health Connect** — the hypnogram/zone
   patterns and sleep score are designed so device data can slot in later without a
   redesign; noted in SPEC §14.
