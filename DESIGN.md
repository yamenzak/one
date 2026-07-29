# KOVA DESIGN.md — product mapping

> **The interface language lives in [UI-LANGUAGE.md](UI-LANGUAGE.md).** Tokens,
> hierarchy, layout, motion, copy rules and the component grammar are defined
> there, product-agnostically, because they are the extraction target for the
> shared UI package that Scena and Bocca will also consume.
>
> **This file is Kova's mapping onto that language**: which surface is the anchor
> on each screen, what the domain tones mean here, and how one app serves three
> roles. When the two disagree, UI-LANGUAGE.md wins.
>
> The bar: *premium, alive, and a 70-year-old can use it.*

## What is implemented today

`packages/ui` ships a working system that predates the language above:
oklch tokens (dark-first + light theme, tenant-themeable primary/radius/border),
a lucide icon registry with zero emoji, motion variants (`fadeUp`/`stagger`/
`popIn`, spring layout indicators), CVA primitives, radix+vaul overlays, the viz
set (`ProgressRing`, `TargetRing`, `MetricPill`, `StatCard`, `Sparkline`,
`MiniBars`, `WeekDots`) and shell components (`AppBar`, `BottomTabs`, `NavRail`,
`InsightCard`, `SettingsList`, `EmptyState`).

It is **not yet conformant** with UI-LANGUAGE.md. The known deltas, which are the
work list for the rewrite:

| Delta | Where |
|---|---|
| No `Atmosphere` — the brand gradient that carries identity does not exist | UI-LANGUAGE §3 |
| No canonical `Row` / `Group` — the most-repeated element in the product is re-implemented per screen | §2, §7 |
| No `Anchor` — screens have no single largest thing; hero treatments vary | §1 |
| No type scale — sizes are chosen per screen | §5 |
| Radius base (0.95rem) contradicts the documented card radius | §6 |
| `popIn` scales **up**; the language requires settling **down** | §8 |
| Entrance has no tier ordering — chrome animates with content | §8 |
| Desktop is "rail + max-w-3xl", not the three shapes | §11 |

**Closed so far:** tokens (type scale, radius ladder, motion, atmosphere
opacity), `lib/animation.ts`, the spine components, `Choice`, wizard chrome,
overlay keyframes and radii, shell chrome + scroll-away wash + content column +
compact billing banner. See UI-LANGUAGE §13 for the component registry.

**Screens on the spine:** the four doorways · sign-in · the three-step studio
wizard · client Today · client Eat · client Train · client Progress (per-lens) ·
client Wellness · client Shop · coach Today · coach Clients.

**Screens still to do**, with what each one's anchor should be — the question is
always "what is this screen about, in one noun":

| Screen | Candidate anchor | Note |
|---|---|---|
| `client/WorkoutPlayer` | the set you are on | Full-bleed; likely opts out of the content column. |
| `coach/Business` | this month's revenue, or credits left | Tabbed — one anchor per tab (§1). |
| `coach/Library` | items in the library | List-shaped: `Group` of `Row`s. |
| `coach/ClientManage` | the client | Tabbed. |
| `coach/Packages`, `coach/Staff`, `coach/Sessions` | count of each | All list-shaped. |
| `Settings`, `AdminConsole` | — | Settings surfaces are lists, not anchored screens: `SettingsList` / `Group` of `Row`s, no display numeral. |

**`client/Wellness` — resolved.** It looked like four subjects on one surface
(sleep + mood + water + fasting) and so like a §1 violation waiting for a product
decision. It isn't: those four are the *inputs*, and the **wellness score** is
the one noun they add up to — the tour has said exactly that since it was
written ("one number for how you're really doing"), it just wasn't the largest
thing on the screen. The score is now the anchor, `WellnessScoreCard` became
`WellnessPillars` (T3, and no longer restates the number), and the quick-log
chip row became the action cluster. A brand-new client scores `0`, which the
anchor renders as the band's words rather than a giant zero — see §5.

**Still not conformant:** the overlay family (`Sheet`, `FixedDrawer`, `Dialog`,
`DropdownMenu`, `SegmentedControl`, `Select`, `Tooltip`) — they take the radius,
type and motion tokens now, but their internals have not been read against §7.
Everything else in the registry is `✅`.

**Card-stack → `Group`/`Row` done on:** Clients · Staff · Packages (archived,
redemption codes, promo codes) · Sessions (add-on types) · Library (templates).
Remaining stacks are the ones whose items are genuinely browsable cards
(exercise/food tiles with media) rather than scannable rows — those stay cards
by design (§7 `Tile` vs `Row`).

Follow the order in UI-LANGUAGE.md §14: tokens → `Row`/`Group` → `Atmosphere`/
`Anchor` → motion → screen by screen.

## Four enforcement layers

The language is only worth what a screen cannot quietly opt out of. Four things
are now checked rather than agreed:

| Guard | Lives in | Catches |
|---|---|---|
| Contrast | `packages/ui/test/contrast.test.ts` | any token pair below WCAG AA, in both themes, with the oklch→sRGB maths pinned against known ratios |
| Radius · elevation · hairlines | `apps/app/src/design-tokens.conformance.test.ts` | a hard-coded visual value that cannot follow a tenant's brand |
| Type scale | `apps/app/src/type-scale.conformance.test.ts` | a hand-rolled spelling of a role the scale already names |
| Empty values | `apps/app/src/no-data.conformance.test.ts` | a dash reaching a value slot, where at numeral sizes it reads as a horizontal rule (§5) |

All four scan `packages/ui` as well as the app — the design system is where a
bypass does the most damage, and each of these found real violations there.
Each has an escape hatch that requires a written reason.

---

## Kova's domain tones

The language ships the tone **mechanism** (a foreground tone + a `-soft`
container, theme-aware, AA-validated). Kova ships the list:

| Tone | Meaning |
|---|---|
| `activity` | training, workouts, load |
| `nutrition` | food, meals, macros |
| `sleep` | sleep and recovery |
| `cardio` | heart, conditioning |
| `hydration` | water |
| `supplement` | supplements |
| `lab` | body tests / lab work |
| `calories` `protein` `carbs` `fat` | the macro set, used only in nutrition viz |

Status (`success` / `warning` / `danger`) is the language's, not Kova's, and is
always paired with a word (In range · Off track · Out of range).

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

## 4. Desktop

See UI-LANGUAGE.md §11 for the three shapes (Focus / Two-pane / Board) and the
rules that make them work. Kova's mapping:

- **Focus** — the client persona. One column; the same screens as mobile.
- **Two-pane** — the coach personas. List pane = roster or library; detail pane
  is *literally the client screen* (§5 below is what makes that possible).
- **Board** — owner + platform admin. Detail column plus a right column of
  secondary cards (credits, at-risk counts, recent activity).

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
