# Screens — the index

**Why this exists.** Kova's UI is being reviewed screen by screen with a real
client. Feedback arrives as *"the X screen — change Y"*, so this maps every
surface a person can reach to the file that draws it. Keep it current: if you
add, move, or delete a screen, edit this file in the same commit.

Three things make the map non-obvious, and they're why a grep for the screen
name often fails:

1. **One app, four personas.** `Shell.tsx` swaps nav and screens by
   persona + mode. `/today` is two different files depending on who you are.
2. **Most surfaces aren't routes.** The sheets, drawers, and editors in §E are
   where the real work happens, and they live *inside* their parent screen's
   file, not in one of their own.
3. **Settings are index → detail, keyed by a search param**, not by a route
   (§G). `/settings?s=messaging&m=templates` is three levels deep in one file.

Persona shorthand: **C** client · **T** trainer · **O** owner · **A** platform admin.

---

## A. Before the Shell — chosen by host, in `main.tsx`

The door decides the screen before any router runs. See CLAUDE.md, "The host IS
the tenancy".

| Trigger | Who | File | What it is |
| --- | --- | --- | --- |
| session resolving | all | `main.tsx:35` `BootSplash` | Branded boot splash |
| host = root | anon | `screens/Doors.tsx:73` `RootSignpost` | Signpost to setup / admin / a studio |
| host = tenant, no such tenant | anon | `screens/Doors.tsx:164` `NoStudio` | "No studio at this address" |
| host = invalid | anon | `screens/Doors.tsx:192` `WrongDoor` | Unrecognised hostname |
| no session | all | `screens/Login.tsx:47` | OTP + passkey sign-in, tenant-branded |
| host = admin, signed in | A | `screens/AdminDoor.tsx:25` | Operator console door |
| `/studio/setup` | O | `screens/Start.tsx:18` → `onboarding/StudioOnboarding.tsx:88` | 3-step studio creation |
| `/studio/sign-in` | O | `screens/Login.tsx:47` | Owner sign-in on the setup door |
| `/accept-invitation/:id` | T O | `main.tsx:134` → `screens/AcceptInvite.tsx:25` | Staff invite + OTP (pre-session) |
| client not onboarded | C | `Shell.tsx:82` → `client/Onboarding.tsx:13` | 5-step intake wizard |
| `lockedToStorefront` | C | `Shell.tsx:107` → `client/Shop.tsx:30` | Must buy access before entering |

## B. Full-screen routes (no tab chrome)

| Path | Who | File | What it is |
| --- | --- | --- | --- |
| `/settings` | O | `screens/Settings.tsx:85` (`view="studio"`) | Studio settings index → §G2 |
| `/profile` | C T O | `screens/Settings.tsx:85` (`view="profile"`) | Personal settings index → §G1 |
| `/preferences` | C T O | `screens/Settings.tsx:85` | Deep link → training & nutrition |
| `/appearance` | C T O | `screens/Settings.tsx:85` | Legacy alias → preferences |
| `/notification-settings` | C T O | `screens/Settings.tsx:85` | Deep link → notification channels |
| `/passkeys` | C T O | `screens/Settings.tsx:85` | Deep link → security |
| `/inbox` | C T O | `screens/Inbox.tsx:25` | Notification inbox |
| `/media` | C T O | `screens/MediaLibrary.tsx:62` | Uploaded media browser |
| `/shop` | C (+staff in Train mode) | `client/Shop.tsx:30` | Storefront: packages, plans, access |
| `/explore` | C (+staff in Train mode) | `client/Explore.tsx:20` | Coach-published articles |
| `/accept-invitation/:id` | T O | `screens/AcceptInvite.tsx:25` | Staff invite, in-session |
| `/clients/:id/plans/:kind/:planId` | T O | `coach/WorkoutBuilder.tsx:266` · `coach/MealBuilder.tsx:32` | Plan builders |

Routes declared in `Shell.tsx:123-142`.

## C. Tabbed routes (`TabLayout`, `Shell.tsx:170`)

| Path | Who | File | What it is |
| --- | --- | --- | --- |
| `/` | all | `Shell.tsx:146` | Redirect → `/today` |
| `/today` | C | `client/Today.tsx:116` | Widgets, agenda, coach note |
| `/today` | T O (coach mode) | `coach/CoachToday.tsx:41` | Attention feed + widgets |
| `/train` | C (+staff) | `client/Train.tsx:35` | Plan overview + activity logging |
| `/train/session`, `/train/session/:day` | C | `client/WorkoutPlayer.tsx:31` | The player |
| `/eat` | C | `client/Eat.tsx:39` | Diary, macros, meal plan |
| `/progress` | C | `client/Progress.tsx:50` | Charts, 4 lenses via `?tab=` |
| `/wellness` | C | `client/Wellness.tsx:75` | Score, check-ins, labs, supplements |
| `/clients` | T O | `coach/Clients.tsx:26` | Roster + invite |
| `/clients/:id`, `/clients/:id/:subtab` | T O | `coach/Clients.tsx:380` | Client detail → §D |
| `/library`, `/library/:tab` | T O | `coach/Library.tsx:21` | Exercises, foods, templates, content |
| `/sessions` | T O (feature `frontDesk`) | `coach/Sessions.tsx:38` | Scheduling + add-on types |
| `/business` | O (tab); T by deep link | `coach/Business.tsx:78` | Revenue, packages, staff |
| `*` | all | `Shell.tsx:161` | Redirect → `/today` |

## D. Sub-tabs

**Client detail** — the same client surfaces, scoped to one client. Role changes
scope and powers, never screens.

| Subtab | File |
| --- | --- |
| `today` | `client/Today.tsx:116` |
| `plans` | `coach/CoachPlans.tsx:44` |
| `goals` | `coach/GoalManager.tsx:59` |
| `progress` | `client/Progress.tsx:50` |
| `report` | `coach/ClientReport.tsx:35` |
| `manage` | `coach/ClientManage.tsx:43` — prefs, supplements, labs, archive/delete |

**Business** (in-component state, not routes): Overview `coach/Business.tsx:96` ·
Packages `coach/Packages.tsx:44` (feature `commerce`) · Staff `coach/Staff.tsx:22`.

**Library**: four tabs at `coach/Library.tsx:31-34`.
**Progress lenses**: `?tab=overview|body|training|wellness`, `client/Progress.tsx:484`.

## E. Sheets, drawers, editors — where most of the work happens

None of these are routes. They live inside their parent's file.

### Client

| File:line | What it is |
| --- | --- |
| `client/LogSheet.tsx:99` | The universal logger — weight, food, activity, mood |
| `client/LogDetail.tsx:103` | One log entry, in detail |
| `client/FoodSearchSheet.tsx:86` | Food search, scan, AI describe, log |
| `client/FoodEditor.tsx:66` | Create/edit a food, with AI assist |
| `client/BarcodeScanner.tsx:11` | Camera barcode scan |
| `client/MealPlanDrawer.tsx:42` | Meal plan options, recipes, logging |
| `client/MealPlanDrawer.tsx:494` | One meal option + recipe |
| `client/Eat.tsx:458` | Edit a logged entry |
| `client/Train.tsx:422` | Exercise info from Train |
| `client/WorkoutPlayer.tsx:523` | Preview a day before starting |
| `client/WorkoutPlayer.tsx:549` | Exercise detail, in-player |
| `client/WorkoutPlayer.tsx:633` | Log one set |
| `client/WorkoutPlayer.tsx:754` | Log a circuit round |
| `client/WorkoutPlayer.tsx:857` | Swap an exercise mid-session |
| `client/bodyscan/BodyScanLauncher.tsx:44` | Entry point + consent |
| `client/bodyscan/BodyScanFlow.tsx:57` | Camera capture flow |
| `client/bodyscan/BodyScanHistory.tsx:42` | Past scans, 3D compare |
| `client/BodyScanCard.tsx:46` | Scan summary on Progress |
| `client/WellnessDetails.tsx:108` | Check-in + photos |
| `client/WellnessDetails.tsx:168` | Lab markers |
| `client/SupplementGuide.tsx:18` | Prescribed supplements |
| `client/CoachNote.tsx:20` | The AI/coach insight line |
| `client/LaneSwitcher.tsx:14` | Switch plan lanes |
| `screens/widget-kit.tsx:113` | Reorder/toggle home widgets |

### Coach / owner

| File:line | What it is |
| --- | --- |
| `coach/Clients.tsx:310` | Invite a client, share link |
| `coach/Library.tsx:158` · `coach/ExerciseEditor.tsx:338` | AI exercise alternatives |
| `coach/Library.tsx:485` | Write/publish an Explore article |
| `coach/ExerciseEditor.tsx:95` | Create/edit exercise, AI media |
| `coach/WorkoutBuilder.tsx:619` | Copy a week with progression |
| `coach/WorkoutBuilder.tsx:692` | Pick an exercise into a slot |
| `coach/WorkoutBuilder.tsx:745` · `coach/MealBuilder.tsx:579` | AI-draft a plan |
| `coach/WorkoutBuilder.tsx:765` · `coach/MealBuilder.tsx:542` | Start from a template |
| `coach/WorkoutBuilder.tsx:802` | Save plan as a template |
| `coach/ClientPrefsStrip.tsx:17` | Client prefs summary, in builders |
| `coach/ClientManage.tsx:721` | Delete / archive a client |
| `coach/ClientManage.tsx:973` · `:998` | Prescribe a supplement · AI suggestions |
| `coach/ClientManage.tsx:1052` · `:1077` | Request a lab · review results |
| `coach/ClientManage.tsx:1145` | Generate a client report |
| `coach/Sessions.tsx:256` · `:296` | Schedule a session · add-on type (O) |
| `coach/Packages.tsx:279` · `:463` · `:511` | Package · promo · code (O) |
| `coach/Staff.tsx:169` | Staff permissions (O) |
| `coach/Business.tsx:574` | Downgrade blockers checklist (O) |
| `Settings.tsx:1728` | Branding / theme token editor (O) |
| `Settings.tsx:407` | Close-studio OTP confirmation (O) |
| `PreferencesEditor.tsx:23` | Shared training/nutrition prefs form |

### Platform admin

| File:line | What it is |
| --- | --- |
| `admin/AdminConsole.tsx:301` | Studio detail — plan, credits, standing |
| `admin/AdminConsole.tsx:677` | Edit a plan's entitlements |
| `admin/AdminConsole.tsx:733` | Gift credits |
| `admin/AdminConsole.tsx:1261` | Default AI model per task |
| `admin/AdminConsole.tsx:2675` | Platform-wide promo code |

## F. Dead code

| File | Status |
| --- | --- |
| `client/PlanHistorySheet.tsx` | **Unreachable** — zero importers repo-wide. Delete it or wire it up; don't review it. |

## G. Settings — index → detail

The pattern is in `packages/ui/src/settings.tsx` (`SettingsIndex`, `SettingsPage`,
`SectionDetail`) with the router glue in `screens/SectionSplit.tsx`. Levels nest by
*distinct search params* (`?s=` then `?g=`/`?m=`/`?a=`) so Back steps out one level
at a time rather than closing the whole thing (`SectionSplit.tsx:39-53`).

Two rules from UI-LANGUAGE.md that this family exists to enforce:
- **Index row sub-line = what's inside. Section-page row sub-line = the current value.**
- **Binaries get an inline switch; anything more gets a page.**

### G1. Personal — `?s=`, `PersonalSettings` at `Settings.tsx:181`

| `?s=` | File:line |
| --- | --- |
| *(none)* | Index — `Settings.tsx:245` |
| `profile` | `Settings.tsx:1161` (client-linked users only) |
| `preferences` | `Settings.tsx:1257` + muted insights `:693` |
| `notifications` | `Settings.tsx:736` |
| `units` | `Settings.tsx:1275` |
| `security` | `Settings.tsx:628` |
| *(always under index)* | Delete account — `Settings.tsx:1096` |

Route aliases (`Settings.tsx:103-108`): `/profile`→index · `/preferences`→`preferences` ·
`/notification-settings`→`notifications` · `/passkeys`→`security`.

### G2. Studio — `?s=`, `StudioSettings` at `Settings.tsx:275`

Section keys come from `packages/domain/src/settings.ts:33`, which also carries
each section's gate — so a section can't drift from what the tenant bought.

| `?s=` | File:line | Nested |
| --- | --- | --- |
| `brand` | `Settings.tsx:1728` (feature `branding`) | `marks` `colour` `shape` `sections` `advanced` — `:2030-2038`. One shared save: the sub-pages share form state. |
| `signin` | `Settings.tsx:453` | `?g=` — `link` `:493` · `screen` `:528` · `domain` `:1437` |
| `ai` | `AiSettings.tsx:132` | `?a=` — `voice` `models` `actions` (`:274`) |
| `messaging` | `Settings.tsx:927` | `?m=` — `delivery` `:972` · `policy` `:870` · `templates` `:781` |
| `marketplace` | `Settings.tsx:1309` | — |
| `integrations` | `Settings.tsx:1605` | — (entitlement is `reserved` — nothing behind it) |
| `danger` | `Settings.tsx:365` | — |

`signin` / `ai` / `messaging` pass **no shared footer** — their sub-pages save
independently. Only `brand` has one save, because only there do the sub-pages
share state.

### G3. Admin console — `ADMIN_SECTIONS`, `admin/AdminConsole.tsx:60-73`

Reachable at the `admin.` door and nowhere else.

| `?s=` | File:line | Nested |
| --- | --- | --- |
| `tenants` | `:159` | opens `:301`, `:733` |
| `plans` | `:571` | `:651`, `:677` |
| `ai` | `:886` | `?a=` — `provider` `pricing` `selftest` `:1467`; also `:1218`, `:1361` |
| `stripe` | `:2187` | — |
| `promos` | `:2546` | `:2641`, `:2675` |
| `domains` | `:1663` | — |
| `content` | `:1976` | — |
| `security` | `:1826` | `:2032` nuclear reset |

---

## Known gaps to name before treating feedback as a bug

- **Desktop is untouched.** Everything is phone-width by design so far.
- **The exercise library grid is nearly empty** — the platform seed ships zero
  thumbnails and two categories.
- **The vision suite is dead without config** — Snap-a-Meal and Label Reader
  need `google.gemini_key` in D1.
- **Not built at all:** chat, wearable import, data export / tenant API,
  marketplace storefront, blog renderer, and six catalogued AI features. See
  CLAUDE.md "NOT built" before promising any of them.
