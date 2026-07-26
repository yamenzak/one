# Mossa — Guide for Coaches and Studio Owners

Everything in this guide describes features that work today. Anything not yet
usable is listed honestly at the end rather than quietly implied.

---

## 1. Getting started

Go to your studio's web address and enter your email. **There are no passwords,
ever.** We email you a six-digit code; type it in and you're through. Codes last
10 minutes, work once, and you get three attempts before you need a fresh one.

On your first sign-in the app offers to add a **passkey** — Face ID, a
fingerprint, or your device PIN. Accept it and signing in becomes one tap. The
emailed code stays available as a backup, so a lost phone never locks you out.
Manage passkeys any time under your avatar → **Passkeys & security**.

If you're setting the business up, you'll be asked to name your studio; that
creates your workspace and makes you the owner. If someone invited you as a
coach, use the link in your invitation email — or simply sign in with the same
address they invited, and your studio appears automatically.

**If a code doesn't arrive:** check junk first. You can request a new one every 30
seconds and up to six an hour per address. If you're on a shared office or gym
network, that network has an hourly limit for everyone on it. If several minutes
pass with nothing, contact support rather than retrying — we'll tell you plainly
when a code couldn't be sent, so if the screen said it was sent, it was.

---

## 2. Finding your way

One app, and the tabs change with your role. Every staff member sees **Today**,
**Clients** and **Library**. On Pro and Max you also get **Sessions**. Owners
get **Business**. Your avatar menu holds personal settings, the media library,
appearance and units, notifications, and — for owners — **Studio settings**.

There's also a **Train mode** switch in the avatar menu. It turns the app into the
client experience for your own training, using the same login. Switch back with
**Switch to Coach mode**. Your role changes what you can see and do — it never
changes which screens exist.

**Install it like an app.** Open your studio's link on your phone and choose Add
to Home Screen (iPhone: Share button; Android: menu → Install app). It then opens
full-screen with your studio's icon and colours.

---

## 3. Today — your triage screen

Rather than a dashboard you have to interpret, Today lists what actually needs
you: clients who've gone quiet, check-ins waiting for a reply, pending
exercise-swap requests, lab results to review, and access about to expire.
Alongside it: roster numbers for the last two weeks and a live feed of what your
clients have been logging. Tap any card to go straight to that client. You can
rearrange the tiles.

---

## 4. Clients

**Clients** is your roster — everything for owners, assigned clients for coaches.
Attention badges mark who needs you. The roster is fully keyboard-navigable (Tab
to move, Enter or Space to open).

**Adding someone:** use the add-client action and enter their name and email. The
studio emails them a branded sign-in link, and the app also shows you the link so
you can send it yourself. When they sign in with that address their record links
to their login automatically — nothing else for you to do. *Keep that link:* once
you dismiss the panel it isn't shown again, and there's no resend button yet.

Open a client and you get six tabs: **Today** (their home screen as they see it),
**Plans**, **Goals**, **Progress**, **Report** and **Manage**. It's the same
client app, scoped to them, with your editing powers on top. **Manage** holds
their profile and preferences, supplements and lab requests, and their access and
billing status.

---

## 5. Goals and targets

In **Goals**, set a goal phase: body goal, nutrition targets, exercise goals. The
app runs a full TDEE calculation — Katch-McArdle when body-fat percentage is
known, Mifflin-St Jeor otherwise — applies an activity multiplier and goal
adjustment, splits macros by dietary approach, and derives water and fibre floors.
Every number shows its derivation so you can explain it to a client. Setting a new
phase supersedes the old one, and publishing a plan snapshots the goal that was
active.

You can also set a weekly training-load target here.

---

## 6. Building workout plans

From a client's **Plans** tab, create a plan and open the builder. You work
days → blocks → slots → sets. A block can be a single exercise, a superset, a
circuit, or HIIT with its own rest structure.

Each set supports seven weight modes — absolute load, client-picks, bodyweight,
previous-plus, previous-times, percentage of 1RM, and dropset — plus RPE/RIR and
tempo. Notes are editable at block and slot level. The exercise picker searches
your whole library and filters by muscle and equipment. Rest values you enter
become the client's rest timers. A per-day muscle map shows what you're actually
hitting, and a client-context sidebar keeps their intake and goals in view.

**Copy week** duplicates a week and can progress it as it goes — add one or two
reps, or add 2.5 kg / 5 kg to absolute loads and percentages — so a progression is
one action per week.

Plans move draft → published → superseded → archived. **Publish** when you want
the client to see it; wait for the confirmation before leaving the screen. If a
publish fails you'll now be told explicitly that the client hasn't received it,
rather than being left to assume it worked.

You can run several plan **lanes** per client when someone is on more than one
schedule.

**Templates:** save a workout plan as a template from the builder, then apply it
to any client — appending to or replacing specific days. Exporting a template
strips absolute weights back to client-picks while keeping progression rules.

---

## 7. Meal plans

A meal plan is a **bank of options**, not a rigid menu. For each meal type you add
options, and for each option the foods, with live macro totals. You can allow free
meals with a calorie cap. Options respect the client's meals-per-day preference,
and you can add your own meal types. Publish and supersede works as for workouts.

---

## 8. Libraries

**Library** has four tabs. **Exercises** and **Foods** hold platform content plus
anything you add, tenant-wide or private to you. Exercises carry the full taxonomy
(muscles, equipment, difficulty, force, mechanic), instructions, start/end media
and two-way alternatives. Foods carry thirteen macro and micro fields and are
barcode-indexed. Web search pulls exercises and foods from external databases with
de-duplication. **Templates** lists your saved workout templates. **Content** is
your content hub.

---

## 9. The AI tools

Everything AI is metered against your studio's credit balance, and **every output
is a draft you approve** — the AI never silently changes a client's plan. Owners
control which features are on, can tune each feature's prompt, and can cap
per-client daily spend, in **Studio settings → AI**.

What works today: generate a workout plan from a client's intake · generate a meal
plan honouring their targets and allergies · summarise check-ins with a suggested
reply · client summary · read a lab report into a structured value table · suggest
supplements · write exercise instructions · auto-fill exercise details · estimate
a food's nutrition · read a nutrition label from a photo · estimate activity
calories · write an article and generate cover/food/exercise/meal images · coach
voice for body scans.

### The limits — please read

- Everything is a **draft and an estimate**. It is not medical advice and must not
  be treated as a diagnosis or prescription.
- **Always read extracted lab values against the original report before saving.**
  The reader can misread a smudged, rotated or low-contrast scan, and a wrong
  number then flows into the client's chart and every later suggestion.
- **Supplement suggestions are a starting point.** Check interactions and
  contraindications yourself, confirm nothing duplicates their current stack, and
  remove anything you wouldn't personally prescribe.
- **A client's own words reach the AI.** They can write their profile, their
  limitations/injuries field and their check-in notes, and the AI reads all of it.
  If a recommendation looks out of character — an unusual supplement, an odd dose,
  an oddly confident claim — discard it.
- Drafted plans drop exercises or foods that aren't in your library. Check the
  dropped list.
- Generated images are original illustrations, not photos of real people or food.

---

## 10. Content hub

Under Library → **Content**, write articles, warmup and stretch routines, recipes
and FAQs in Markdown with a cover image, tags and topics. Choose the audience:
everyone in the studio, or specific clients. Publish now or schedule a date —
scheduled items stay hidden until then. Client-visible content appears on their
Today screen in an Explore rail and in a full Explore list.

---

## 11. Packages and payments

Owners on Light and above: **Business → Packages**. First connect Stripe from
**Business → Overview** — checkouts are created on **your** Stripe account, with
your statement descriptor, your payouts and your tax. Mossa takes no cut. Until
Stripe onboarding is complete, clients see "checkout isn't available yet."

A package has a one-time price and/or instalments, feature budgets (workout, meal,
or all — each with a number of days), included add-ons like consultations, a
visibility setting, an optional once-per-customer rule, and per-package client
feature flags deciding which parts of the app that client gets.

**Pricing options:** one-time (a single charge for a fixed run of days) · monthly
(auto-renews; each successful renewal adds another period) · pay over N months
(the total split across N charges, each unlocking its share; if a payment fails
the client keeps what they've already paid for).

**Visibility:** *Public* appears in the client's Shop. *Private* is grant-only.
*One client* is bespoke.

**How access adds up:** days **stack, they never reset**. A client with 20 days
left who buys 30 more has 50 — the new package starts when the current one ends,
so nothing is wasted. Capabilities are the overlap of what the package includes
and what your studio plan includes. When days run out, access lapses on its own
and the client is prompted to renew. Clients within 3 days get an automatic
reminder, and another when they lapse.

**Access codes** add days directly — you choose the days, which access they apply
to, how many uses, an expiry, and optionally lock them to one client or to owners
of a specific package. **Discount codes** are different: they reduce the price at
checkout, as a percentage or fixed amount, on one-time purchases, pay-over-time
plans, and the first month of a subscription.

**Assigning access for free:** use Assign package for comps, migrations or trials.
It behaves exactly like a purchase, minus the charge.

**Archiving** a package hides it and stops new sales; clients who bought it keep
every day they paid for.

### Refunds, disputes, cancellations

Refunds are issued from your own Stripe dashboard. Mossa does **not**
automatically remove access days when you refund — partial refunds and time
already used make that guesswork, so you're notified and you decide. Same for
chargebacks. A client can cancel auto-renew themselves; it stops future charges
only and their current access runs to its natural end. If a renewal card fails
they're marked past due and nudged, and access keeps running until their days
lapse — a deliberate grace period.

---

## 12. Sessions and the front desk

Pro and Max. **Sessions** lets an owner define add-on types (a consultation,
with a duration and optional standalone price), and any staff member schedule one
for a client, then mark it completed, no-show or cancelled. The client is notified
when you book.

Three things to know today: the list shows scheduled sessions only, so completed
and cancelled ones disappear rather than becoming history; add-on types can't be
edited after creation; and the balance a package includes **isn't enforced**, so
track consumption yourself for now.

---

## 13. Reports

A client's **Report** tab gives compliance bars, tonnage trends, volume by muscle
group and an Epley-based PR table over a range you choose. **Progress** shows
their charts. Today's roster analytics cover the studio level. Everything is
timezone-aware, using each client's own local days.

---

## 14. Staff and who can see what

- **Owner** — everything: every client, billing, staff, studio settings, email
  templates, Stripe, and the danger-zone actions.
- **Coach (trainer)** — full coaching powers, but **only for assigned clients**.
  An unassigned coach cannot open another coach's client. No access to studio
  settings, billing, AI configuration or staff.
- **Front desk (assistant)** — sees the client list and runs the schedule; cannot
  edit plans, prescribe supplements or labs, or touch settings.

Invite staff from **Business → Staff** by email and pick a role. They get a
branded email with an accept link; either the link or simply signing in with that
address puts them in your studio. Your plan sets how many staff seats you have.
You can also narrow an individual member's permissions below their role default.

Each client has an activity history showing which staff member changed what and
when — visible to staff, never to the client.

**Assigning clients to a coach.** Open a client → **Manage** → **Coaches** to add
or remove a coach and set which one is primary (the primary coach is who
notifications route to). A coach only sees the clients assigned to them, so this is
what hands a client over — and if nobody is assigned, only owners can see them.
Owners only.

---

## 15. Branding and your own domain

Pro and Max. **Studio settings → Brand** sets your logo, app icon and accent
colour, applied throughout the app including the boot screen. **Sign-in**
customises your login page — tagline, headline, body copy, background image — with
a live preview, and gives you your `/t/your-slug` link. **Marketplace** is where
you add your own domain: enter the hostname, copy the two DNS records, add them at
your registrar, then verify. Once live, your studio runs entirely on your domain
with its own certificate, staff and clients enrol a passkey specific to it, and
the studio switcher is hidden.

That address only ever shows your studio: someone belonging to a different studio
can sign in there but will see nothing, and nobody can switch away from it.

**Messaging** holds your email sender configuration, per-category notification
policy, and editable email templates.

---

## 16. Your plan and credits

**The plans.** Four tiers, and you can move between them whenever you like:

| | Coaches | Clients | Media | AI credits / mo | |
|---|---|---|---|---|---|
| **Solo** $4.99 | 1 | 1 | 250 MB | 500 | 30 days free |
| **Light** $24.99 | 1 | 30 | 1 GB | 3,000 | 30 days free |
| **Pro** $49.99 | 5 | 100 | 10 GB | 6,000 | |
| **Max** $119.99 | unlimited | unlimited | 100 GB | 15,000 | |

Solo and Light start with a **30-day free trial**. A trial does collect a card, but
nothing is charged until it ends, and we email you three days before that happens.
Cancel any time before then and you pay nothing. The coach count includes you.

**Business → Overview** shows your plan and status, AI credit balance,
client-billing health (lapsed, expiring within seven days), what your plan
includes and each quota. From here you change plan and buy credit packs, paid
inline with no redirect.

**Moving up is instant. Moving down asks you to fit first** — if you're over the
smaller plan's limits, you'll get a checklist of exactly what to clear (clients,
coaches, plan templates) with a link straight to each. Storage is only a warning,
not a blocker: we won't make you delete a client's progress photos to pay less,
though new uploads stop once you're over. Nothing you're already using breaks when
you downgrade — you simply can't add more until you're inside the new limits.

**Freeing a client slot.** Two ways, and they're different on purpose. **Archive**
keeps everything — their logs, photos and history stay, they just leave your roster
and stop counting against your limit. **Delete** erases them permanently: logs,
measurements, check-ins, photos, uploaded files, all of it, and reclaims the
storage. Delete asks you to type the client's name, because it cannot be undone.

**Credits come in two kinds.** *Monthly credits* come with your plan, refresh each
month and **do not roll over**. *Purchased credits* from credit packs **never
expire**. AI always spends monthly credits first, so you never lose what you paid
for. Credits refresh at the start of each calendar month, which may not be your
billing date. When you run out, AI stops with a clear message — nothing else is
affected — and buying a pack resumes it instantly. A failed AI request isn't
charged.

**Protect your balance from one enthusiastic client:** in AI settings, set a daily
credit allowance per client. By default only a request-count safety limit applies,
which still allows a lot of expensive AI in a day. Your own coaching AI is never
limited by a client's allowance.

Changing plans takes effect right away. Note that upgrading or downgrading starts
a fresh monthly charge and ends the old one, so time already paid on the old plan
isn't credited back — change close to your renewal date if that matters.

If a payment to Mossa fails you get a notice and a grace period. If it stays
unpaid, paid features pause for you *and* your clients; longer and your studio
drops to free. Your coaching data stays put throughout, and updating your card
restores everything.

**Close studio** cancels billing, holds your data seven days, then wipes it —
confirmed by a code emailed to you, and cancellable within the window.

---

## 17. Privacy and irreversible actions

Progress photos, lab documents and scans are never on a public link — every view
is checked against who you are and whether that client is yours. Only your logo
and app icon are public, because the sign-in screen and home-screen icon need
them. Body-scan photos never leave the client's device; only measurements and,
with their consent, an anonymous outline are stored.

Photos and reports are sent to the AI provider only at the moment you use a
feature needing them, and are not used to train anything.

Deleting a client removes their record, logs, photos and files. It cannot be
undone. Irreversible actions ask for a code emailed to you.

---

## 18. Not available yet

Deliberately listed so you don't plan around them: a public storefront or blog
page for your studio · client self-booking · exporting your data · any API or
webhooks · trainer↔client chat · natural-language and voice food logging for
clients · periodization assistant, meal swap, menu scout, business-digest
narrative · wearable and health-app import · QR-code client invites · resending a
client invite · un-archiving a client (archiving is one-way for now) · hard-deleting
a package (you can archive it, which takes it off sale while existing buyers keep
what they paid for) · saving a meal-plan template · the client weekly
meal-arrangement grid and grocery list.

Exercise thumbnails are sparse in the shipped library, and the client-facing
exercise browser currently shows two categories with no favourites.
