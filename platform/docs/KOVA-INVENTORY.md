---
kind: contract
verified: 2026-08-10
---

# Kova — the capability inventory

> **The acceptance contract for stages 7 and 8.** Every line below is something a
> person can accomplish in Kova today; every line has to be true again in the new
> product, and every line is performed against the migrated tenant — by the
> persona named, in a browser — before the migration is finished.
>
> [KOVA.md](KOVA.md) is the strategy this comes out of; §1.1 is the argument for
> why this document exists and what it must not become.

---

## 1. What this is, and what it must never become

⚠️ **IT LISTS OUTCOMES, NOT SCREENS.** "A coach can see how a client's strength
is trending" is a capability. "The Progress tab has four lenses" is an
implementation, and writing it down that way is how a rewrite becomes a port
wearing different colours.

The check enforces that rather than trusting it: `scripts/capabilities.test.mjs`
refuses an outcome containing *tab*, *screen*, *page*, *modal*, *sidebar*,
*endpoint*, *button* or *dropdown*. It caught three of these on its first run,
written by the person arguing for the rule — which is the entire reason it is a
script and not a paragraph.

⚠️ **THIS IS THE ONLY ARTEFACT THAT CROSSES FROM THE OLD CODEBASE.** Nothing else
travels: not a component, not a route, not a domain function. The old repository
was read to answer two questions — *what can a person do*, and *what is stored* —
and anything else it has to say is about a codebase written before the platform
existed.

**It is a registry, not prose**, for the same reason `guards.json` is: a list in a
document is a list somebody has to remember to update, and a registry with a
status per entry is one a script can ask "what is left" of.

`status` is `old` (exists today, not yet rebuilt), `built`, or `dropped` — and a
dropped entry carries a reason, because a removal and an oversight look identical
without one.

---

## 2. The inventory

<!-- generated: node scripts/capabilities.mjs table -->
| | capability | persona | outcome |
|---|---|---|---|
| | **ai** | | |
| `[ ]` | `ai-article` | trainer | Draft an article and a cover image for it |
| `[x]` | `ai-budget` | owner | Not be surprised by a bill — a ceiling per day, per person |
| `[ ]` | `ai-client-summary` | trainer | Read a summary of a client's month instead of assembling it from four places |
| `[ ]` | `ai-draft-meal` | trainer | Draft a meal plan the same way |
| `[x]` | `ai-draft-plan` | trainer | Draft a training plan from a sentence and edit it, rather than starting blank |
| `[ ]` | `ai-exercise-guide` | trainer | Generate how-to text for a movement in the studio's voice |
| `[x]` | `ai-feedback` | trainer | Say a generation was wrong, and have that recorded |
| `[ ]` | `ai-image` | trainer | Generate an image for the studio's own use |
| `[ ]` | `ai-lab-extract` | trainer | Read a lab report photograph into values a coach can use |
| `[ ]` | `ai-label-reader` | client | Photograph a nutrition label and get the food |
| `[x]` | `ai-parse-food` | client | Describe a meal in words and have it logged |
| `[ ]` | `ai-snap-meal` | client | Photograph a meal and have it logged |
| `[ ]` | `ai-supplement-guide` | trainer | Generate supplement guidance with a stated basis |
| | **billing** | | |
| `[ ]` | `billing-portal` | owner | Change a card, read an invoice, cancel — on the payment provider |
| `[ ]` | `credits-buy` | owner | Buy credits for the generative features |
| `[x]` | `credits-see` | owner | See what credits were spent on |
| `[ ]` | `downgrade-check` | owner | Be told what a smaller plan would cost them, in their own data, before choosing |
| `[x]` | `plan-browse` | owner | See what the platform sells and what each plan includes |
| `[ ]` | `plan-change` | owner | Move up or down, and be told what changes before they commit |
| `[x]` | `plan-choose` | owner | Choose a plan and pay for it |
| `[x]` | `standing` | owner | Know where they stand when a payment fails, and how to fix it |
| | **body** | | |
| `[x]` | `body-report` | client | See how their body has changed over months, not days |
| `[ ]` | `body-scan` | client | Estimate body composition from photographs, guided through the poses |
| `[ ]` | `body-scan-voice` | client | Be talked through a scan hands-free |
| `[x]` | `measurements` | client | Record their weight and measurements and see them move |
| `[x]` | `mood-log` | client | Record how they felt |
| `[ ]` | `progress-photos` | client | Keep progress photographs and compare two of them side by side |
| `[x]` | `sleep-log` | client | Record how they slept |
| `[x]` | `steps-log` | client | Record how much they moved outside training |
| `[ ]` | `today` | client | Open the app and see what today asks of them, in one place |
| `[x]` | `water-log` | client | Record what they drank |
| `[ ]` | `wellness-score` | client | See one honest number for how the week has gone |
| | **checkins** | | |
| `[x]` | `check-in` | client | Report in on a schedule: how it went, how they feel, what changed |
| `[x]` | `check-in-feedback` | trainer | Answer a check-in so the client hears back |
| `[ ]` | `check-in-prefill` | client | Not retype what the app already knows about their week |
| `[x]` | `goal-set` | trainer | Set a goal with a number and a date |
| `[x]` | `goal-track` | client | See how far along a goal is without doing the arithmetic |
| | **commerce** | | |
| `[x]` | `access-capabilities` | client | See what their package actually lets them do |
| `[x]` | `access-override` | owner | Make an exception for one client without changing the package |
| `[x]` | `access-repair` | owner | Correct somebody's remaining days by hand, with a reason, audited |
| `[x]` | `access-runway` | client | See how many days they have left, per thing they hold |
| `[x]` | `lapse-ladder` | owner | Decide what happens to a client whose access ran out, and when |
| `[x]` | `package-build` | owner | Design what they sell: a block of days and what it lets a client do |
| `[x]` | `package-buy` | client | Buy access from their studio and start using it immediately |
| `[x]` | `package-contradictions` | owner | Be told when a package sells something it also switches off |
| `[x]` | `package-grant` | owner | Give somebody access directly, with a reason, recorded |
| `[x]` | `package-manual` | owner | Confirm a payment taken outside the product, without a provider at all |
| `[x]` | `package-sell` | owner | Take payment on their own provider, in their own country |
| `[–]` | `promo-code` | owner | Discount their own prices with a code they control — **dropped:** A discount must be applied by whoever owns the checkout page, and the studio owns it. Kova opens an intent and hands over an address; it never sees the price the customer is charged, so a discount stored here would be a number nothing enforces. Access codes, which grant days rather than reduce a price, are the honest version of this and are not affected. |
| `[x]` | `purchase-history` | client | See what they have bought from this studio |
| `[x]` | `redeem` | client | Redeem a code and see the days arrive |
| `[x]` | `redemption-code` | owner | Issue a code that tops somebody's access up |
| | **content** | | |
| `[x]` | `content-cover` | trainer | Give an article a cover image without leaving the product |
| `[x]` | `content-read` | client | Read what their studio published, in a feed that is theirs |
| `[x]` | `content-write` | trainer | Write an article for clients and publish it |
| `[ ]` | `marketplace-public` | everyone | Find out what a studio offers before signing in, or before having an account at all |
| | **context** | | |
| `[ ]` | `context-switch` | trainer | Move between the studios they belong to without signing in again |
| `[ ]` | `dashboard-arrange` | trainer | Arrange what they see first, so the thing they check hourly is at the top |
| `[ ]` | `offline-log` | client | Log a set in a basement and have it arrive when they surface |
| | **identity** | | |
| `[x]` | `account-delete` | everyone | Delete their own account and understand what that removes |
| `[x]` | `passkey-add` | everyone | Register a passkey and afterwards sign in with a fingerprint or face |
| `[x]` | `passkey-remove` | everyone | See which devices they have registered and remove one they no longer have |
| `[x]` | `session-list` | everyone | See where they are signed in and end a session on a device they no longer hold |
| `[x]` | `sign-in` | everyone | Sign in with a code sent to their email address, with no password anywhere |
| `[ ]` | `units` | everyone | Choose whether they read weights and measures in metric or imperial |
| | **media** | | |
| `[x]` | `avatar` | trainer | Give a client a face, so a roster is people rather than rows |
| `[x]` | `media-library` | trainer | Reuse something they already uploaded rather than uploading it again |
| `[x]` | `media-quota` | owner | See how much storage they are using against what they bought |
| `[x]` | `media-upload` | trainer | Upload an image or a video and watch it arrive |
| | **notifications** | | |
| `[ ]` | `email-templates` | owner | Change the words the studio sends, and sign them |
| `[x]` | `inbox` | everyone | See what happened while they were away, in one list |
| `[x]` | `notification-prefs` | everyone | Decide what interrupts them, by category, without losing the record |
| | **nutrition** | | |
| `[ ]` | `fasting-timer` | client | Run a fast and see which phase they are in |
| `[ ]` | `food-barcode` | client | Scan a barcode and get the food rather than typing it |
| `[x]` | `food-create` | client | Enter a food nobody has entered yet, once, and reuse it |
| `[x]` | `food-library` | trainer | Build a library of foods with the numbers this studio trusts |
| `[x]` | `food-log` | client | Record what they actually ate, by meal, with portions |
| `[x]` | `food-log-edit` | client | Correct something they logged wrongly |
| `[x]` | `food-recent` | client | Reach the things they eat often without searching each time |
| `[ ]` | `food-search-external` | client | Find a food in a public database when the studio has not entered it |
| `[x]` | `macro-breakdown` | client | See how a day adds up against their targets |
| `[ ]` | `meal-option-swap` | client | Choose a different option within a meal their coach allowed |
| `[ ]` | `meal-plan-arrangements` | trainer | Offer alternatives within a meal so a plan survives real life |
| `[x]` | `meal-plan-build` | trainer | Write a meal plan: days, meals, options, portions |
| `[x]` | `meal-plan-follow` | client | See what they are meant to eat today and tick it off |
| `[x]` | `nutrition-report` | trainer | See how a client has been eating, over time, without reading every entry |
| `[x]` | `nutrition-week` | client | See a week of eating rather than one day at a time |
| | **operator** | | |
| `[x]` | `op-adjust` | operator | Adjust one studio's ceilings without editing the plan everybody is on |
| `[x]` | `op-ai` | operator | Choose which models are on, and what they cost |
| `[ ]` | `op-catalog` | operator | Edit what the platform sells: prices, ceilings, features, trials |
| `[x]` | `op-comp` | operator | Put a studio on a plan without a payment, for a reason |
| `[ ]` | `op-domains` | operator | See and troubleshoot studios' custom domains |
| `[x]` | `op-email` | operator | Configure how the deployment sends mail, and prove it works |
| `[x]` | `op-maintenance` | operator | Close the deployment for work, read-only or fully, and say so |
| `[x]` | `op-parked` | operator | Read the payment events nothing could place, and replay them |
| `[x]` | `op-stripe` | operator | Configure the payment provider, in test and live, without re-pasting keys |
| `[x]` | `op-tenants` | operator | See every studio on the deployment and what it is on |
| `[x]` | `op-topup` | operator | Give a studio credits |
| | **reports** | | |
| `[x]` | `attention` | trainer | Be told who needs them today rather than deciding by scrolling |
| `[x]` | `client-report` | trainer | See one client's whole picture: body, training, nutrition, consistency |
| `[x]` | `retention-report` | owner | See who is at risk of leaving before they leave |
| `[x]` | `roster-activity` | owner | See who on the roster is active and who has gone quiet |
| `[ ]` | `roster-analytics` | owner | See how the studio is doing as a business, not as a list of people |
| | **roster** | | |
| `[x]` | `client-add` | trainer | Add somebody they coach, by inviting them or by entering them directly |
| `[x]` | `client-archive` | trainer | Stop coaching somebody without losing what they did |
| `[x]` | `client-assign` | owner | Decide which coach works with which client, and change it |
| `[ ]` | `client-audit` | owner | See what was changed on somebody's record, by whom, and when |
| `[x]` | `client-browse` | trainer | Find one person among many, by name, by state, or by who is falling behind |
| `[x]` | `client-coaches` | client | See who is coaching them, with their faces |
| `[ ]` | `client-delete` | owner | Remove somebody entirely, on request, and have that be final |
| `[x]` | `client-invite-self` | client | Accept an invitation and land in the right studio without being told an address |
| `[ ]` | `client-offboard-request` | trainer | Ask an owner to release a client, and have the owner decide |
| `[x]` | `client-preferences` | trainer | Record how somebody trains and eats now, and see when that was last reviewed |
| `[x]` | `client-profile` | trainer | Record who somebody is: their details, their situation and how they train |
| `[x]` | `client-restore` | trainer | Bring an archived person back |
| `[ ]` | `client-self-register` | client | Register themselves where a studio allows it, and be picked up by a coach |
| | **sessions** | | |
| `[x]` | `session-book` | assistant | Book a client into a session |
| `[x]` | `session-manage` | assistant | Change or cancel a booking and have the client know |
| `[x]` | `session-see` | client | See when they are booked in |
| | **staff** | | |
| `[x]` | `staff-invite` | owner | Invite a colleague and give them a role |
| `[x]` | `staff-permissions` | owner | Narrow what one colleague can do, within their role |
| `[x]` | `staff-remove` | owner | Remove somebody and free the seat |
| `[x]` | `staff-roster` | owner | See who is on the team, including who has not accepted yet |
| `[x]` | `staff-seats` | owner | Know how many seats they have and how many are used |
| | **studio** | | |
| `[ ]` | `studio-brand` | owner | Make the product look like their business — name, logo, colours |
| `[x]` | `studio-close` | owner | Close the studio, change their mind for a week, and export what was theirs |
| `[x]` | `studio-create` | owner | Open a studio at an address of their choosing and be its owner |
| `[ ]` | `studio-domain` | owner | Serve the product from a domain they own, with a certificate that works |
| `[ ]` | `studio-settings` | owner | Set how the studio behaves: what a lapsed client loses, and when |
| | **supplements** | | |
| `[x]` | `lab-request` | trainer | Ask a client for a lab test and record the result |
| `[x]` | `lab-upload` | client | Send in a lab report as a photograph or a file |
| `[x]` | `supplement-log` | client | Record that they took what was prescribed |
| `[x]` | `supplement-prescribe` | trainer | Prescribe supplements with a dose and a reason |
| | **training** | | |
| `[ ]` | `exercise-alternatives` | trainer | Say which movements stand in for which, so a swap is not a guess |
| `[x]` | `exercise-detail` | trainer | Describe a movement well enough that somebody could do it unsupervised |
| `[x]` | `exercise-library` | trainer | Build a library of the movements this studio uses |
| `[ ]` | `exercise-search-external` | trainer | Find a movement in a public catalogue rather than typing it out |
| `[ ]` | `exercise-swap-decide` | trainer | Decide a swap request, with the alternatives already in front of them |
| `[ ]` | `exercise-swap-request` | client | Ask to swap a movement they cannot do, and get an answer |
| `[ ]` | `exercise-usage` | trainer | See where a movement is used before changing or removing it |
| `[ ]` | `extra-workout` | client | Record activity that was not part of the plan |
| `[x]` | `plan-build` | trainer | Write a training plan: weeks, days, movements, sets, targets |
| `[ ]` | `plan-copy-week` | trainer | Repeat a week with progression, rather than retyping it |
| `[x]` | `plan-follow` | client | See what they are meant to do today, and what comes next |
| `[ ]` | `plan-groups` | trainer | Group movements into supersets and circuits, and have them logged as rounds |
| `[x]` | `plan-publish` | trainer | Publish a plan so the client is following it, and know they were told |
| `[x]` | `plan-template` | trainer | Keep a plan as a template and start the next client from it |
| `[x]` | `plan-variants` | trainer | Give one client more than one plan and switch which is current |
| `[x]` | `workout-history` | client | Look back at what they lifted last time, at the moment they need it |
| `[x]` | `workout-log` | client | Record what they actually lifted, including when it differed from the plan |
| `[ ]` | `workout-player` | client | Work through a session set by set, on a phone, in a gym |
| `[x]` | `workout-prs` | client | See their own bests, and know when they set a new one |
| `[x]` | `workout-review` | trainer | See what a client actually did against what was prescribed |
<!-- /generated -->

---

## 3. The data survey

**Thirty-five tables in the live schema.** The question asked of each is not
"what is its shape" — the new schema is free — but **does a person see it**.
Everything a person can see travels; machine exhaust does not.

### Travels — a person can see it

| | |
|---|---|
| **People** | `clients`, `client_trainers`, `client_goals`, `offboard_requests` |
| **Training** | `exercises`, `exercise_alternatives`, `workout_plans`, `workout_templates`, `plan_variants`, `exercise_logs`, `exercise_prs`, `swap_requests` |
| **Nutrition** | `foods`, `meal_plans`, `meal_templates`, `meal_arrangements`, `food_entries`, `fasting_sessions` |
| **Body & wellness** | `measurements`, `body_scans`, `sleep_logs`, `mood_logs`, `water_logs`, `steps_logs`, `activity_logs` |
| **Supplements & labs** | `supplements`, `supplement_logs`, `lab_tests` |
| **Reporting in** | `check_ins` |
| **Content** | `resources` |
| **Front desk** | `trainer_sessions` |
| **Governance** | `audit_log` |

### Does not travel — machine exhaust

`app_config` is a deployment's own settings and the new deployment has its own.
`tts_cues` is a generated audio cache keyed by text that will not exist. AI
generation logs, response caches and webhook seen-sets are the same class: they
are the residue of how the old product worked, and carrying them across would be
migrating an implementation.

⚠️ **THE ONE PLACE THE NEW SCHEMA IS NOT FREE IS IDENTITY.** A passkey is bound
to a relying party and to a credential id. Accounts and credentials migrate with
their identifiers **exactly**, or "same passkeys, no re-signup" fails at the last
step — so that is checked FIRST in stage 8, against a real authenticator, before
anything else moves. [KOVA.md](KOVA.md) §2.1.

### What the survey cannot say

Row counts. They are a property of the live deployment rather than of the
repository, and a number written here would be wrong the day after it was
written. Stage 8 counts per collection at copy time and again at verify time,
and the reconciliation report is what a person reads before anything flips.

---

## 4. How this list gets shorter

Each version of the new product takes a slice of this inventory, ships it with
its help articles and its release note, and flips those entries to `built`. The
progress bar is derived — `node scripts/capabilities.mjs` — rather than narrated,
which is the same rule every other inventory in this repository follows.

⚠️ **A LINE IS `built` WHEN A PERSON CAN DO IT, not when the code exists.** The
distinction is the whole reason the inventory is written in outcomes: "the route
is there" has never once meant somebody could accomplish the thing.
