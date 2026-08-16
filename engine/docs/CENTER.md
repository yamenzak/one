# The Centre

kind: plan

**The platform UI, rebuilt on OneEngine: one tenant centre for every app a workspace
holds, one account centre for a person, one operator console for the
deployment — and by the end, an app ships screens for its own logic and
NOTHING else.** This is the plan for the stages after 11. Read
[PLAN.md](PLAN.md) §1–§3 and [PROGRESS.md](PROGRESS.md) first; every mechanism
this plan leans on is named there, and this document only adds what does not
exist yet.

---

## 0. What this plan is answering

Three questions, asked in one breath, and they are the right three:

1. **Does user management — roles, permissions, the roster — move to the
   centre?** A tenancy now holds every app, and each app's users are under it.
2. **For B2B2C apps: should a sellable package BE a role bound to a
   plan, instead of a second feature-flag system?** And what is the lifecycle
   when the customer stops paying — grace, lapse, deletion?
3. **What else unifies in the centre?** Vault, legal, personal details and
   preferences, app settings for the operator and for the team, admin
   management, AI model selection per action per app with prompt
   customisation, notification channels for operator and end user per action —
   until apps only handle their logic.

The answers below are grounded in what the kernel already holds, because most
of the machinery exists and the failure to avoid is building it twice.

---

## 1. What already exists, and what is honestly missing

**Exists, and this plan only puts a surface on it:**

- **The roster is already tenant-level, not app-level.** One `membership` row
  per person per workspace, in the tenant's shard, indexed in the directory.
  The roster operations (`member.list/invite/role/remove`) are the platform's
  and every app gets them without declaring them. Custom roles exist, bounded
  by the grant algebra (nobody grants what they do not hold).
- **The per-member grant algebra exists.** A membership carries `grants`
  (keys beyond the role) and `revoked` (keys withheld), resolved in one
  place: role ∪ grants − revoked. This is the seam §3 builds the package rail
  on.
- **Entitlements are the tenant←platform rail and they are done**: plan →
  grandfathered → adjusted → clamped, one walk, every reader uses it.
- **Flags are ours**, three levels with an absorbing off. **Settings** have
  three authorities (person/tenant/operator) and the screens are generated.
  **Notifications** have audience-by-permission, the two-level policy, and
  tenant-editable letterheads with declared variables. **Vault and legal**
  are workspace-scoped surfaces with consent, the who-looked record, export
  and erasure.
- **The gate order already composes the two rails.** `standing → permission →
  proof → entitlement → flag → quota → credits`: what a PERSON may do
  (permission — membership + grants) and what the TENANT bought (entitlement
  — their plan) are two different gates on the same operation. §3 is built on
  noticing that this means B2B2C needs no third gate.

**Honestly missing, in the order it bites:**

1. **Multi-app permission resolution is wrong today.** A membership holds ONE
   role name, and the deployment resolves it against the FIRST enabled app's
   registry (`located.apps[0]`). A tenant with two apps has members whose role
   means something in one app and nothing in the other. This is the real gap
   under "does user management move to the centre" — the data model must
   answer it before any screen can.
2. **There is no package rail.** Nothing in the kernel models a tenant-defined
   sellable bundle, a purchase, a timed grant or a lapse ladder.
3. **There is no per-action AI binding.** The catalogue and lanes exist; an
   operation that uses AI names credits, but which model answers which
   operation — and what the prompt says — is not declared or operable.
4. **The tenant centre does not exist.** The Hub is the signpost/sign-in/
   workspace-list; the surface BEHIND a workspace's door — the shell with the
   router, the app switcher, People, Money, Settings, Data — is the missing
   application (PROGRESS outstanding #3).

---

## 2. Access: one roster, a platform role, and a role per app

**Yes — user management, roles and permissions live in the centre.** The data
already agrees (one membership per person per workspace); what must change is
what a membership SAYS.

### 2.1 The shape

A membership resolves to two kinds of authority:

- **A platform role** — what somebody may do to the WORKSPACE: manage members,
  manage settings, see money, close the tenant. These are the platform's own
  permission keys (`member:*`, `tenant:*`, `money:*`…), identical in every
  product, granted once. The people screen, the invitation, the seat count and
  the stranding rule all read this.
- **A role per enabled app** — what somebody may do INSIDE each product, in
  that product's own vocabulary (`client:write`, `note:read`). Declared by the
  app as today; held per `(membership, app)`; absent means "not a user of this
  app", which is a real and common state — the bookkeeper is in the workspace
  for Money and is nobody in Hello.

```
membership
  role_platform      "admin" | "staff" | "customer" | custom
  roles_json         { hello: "writer", atlas: "clerk" }   -- per enabled app
  grants_json        [ { key, app, until?, source? } ]      -- §3 extends this
  revoked_json       [ key ]
```

**Why not one flat role across apps:** a role is a name for a bundle in ONE
vocabulary. "Writer" names Hello keys; against Atlas's registry it names
nothing, and the failure is silent 403s in the second app for everybody. **Why
not per-app memberships:** that is the previous platform's disease — two
rosters, two invitations, two seats for one person — the exact seam D1 exists
to close.

Custom roles gain an `app` column (a custom role composes ONE app's keys, or
the platform's); the grant-bounding rule is unchanged and now asked per app.

### 2.2 What the runtime changes

- `identify` resolves permissions against the app THE REQUEST IS FOR — the
  operation's own app, not `apps[0]` — plus the platform set. One caller, one
  resolution, per request, as now.
- Seats count **platform staff**, not app roles: `seats.counts` moves up a
  level. A `customer` membership costs no seat, which is what every app that
  has customers in it needs and what the platform's own offices already say.
- The audience test for notifications, the settings `needs`, and the screens'
  `permission` all keep working unchanged — they name keys, and keys now
  resolve per app.

### 2.3 What the centre shows

One **People** area for the whole workspace: every person once, their platform
role, and a column per enabled app. Invite once, into a platform role and any
app roles the inviter may grant (the algebra already bounds this). Custom
roles composed per app. This replaces N per-app member screens with one — the
thing the inversion was for.

---

## 3. B2B2C: a package is a ROLE WITH A CLOCK — so it is not a role

The instinct behind "make packages roles bound to a plan" is right, and the
plan adopts its substance: **a tenant composes a bundle of capabilities the
way they compose a custom role, binds a price and a duration to it, and a
purchase applies it to the buyer's membership.** No second feature-flag
system; the ordinary permission gate reads the result.

But it must not literally BE a role, for one reason that decides everything
else: **a role has no clock.** A role is granted by a person and lasts until a
person takes it away; a package is granted by a payment and DIES — expiry,
grace, lapse, the tenant's own retention policy. Modelling a purchase as a
role assignment means hand-building the lifecycle in app code anyway, which is
the double-bookkeeping being escaped, one layer down.

### 3.1 The shape: timed grants on the membership

The kernel's grant algebra is the seam. Today `grants` is a list of bare keys;
it becomes a list of grants **with an optional clock and source**:

```
package                       -- tenant-composed, like a custom role
  id, name, price, currency
  period                      -- days a purchase buys
  grants: [permission keys]   -- what holding it lets the buyer DO
  app                         -- one app's vocabulary, like a custom role

purchase                      -- append-only; the ledger of what was applied
  package_id, membership_id, at, paid_until

membership.grants_json        -- [{ key, app, until, source: "pkg:strength" }]
```

**Resolution stays ONE walk**: role ∪ grants-not-expired − revoked. The gate
does not change; the app does not change; `plan.publish` still says
`permission: "plan:read"` and neither knows nor cares whether the caller
holds it from their role or from a package they bought. That is the collapse
of the double-flagging:

```
BEFORE (legacy):  us --entitlements--> tenant --client flags--> end user
                  two systems, two resolvers, intersection in app code

AFTER (One):      one operation declares   permission + entitlement
                  permission gate reads    role ∪ paid grants   (the person)
                  entitlement gate reads   the tenant's plan    (the business)
                  the intersection is the GATE ORDER, already built
```

The tenant's own plan still caps what they can sell — not by a second flag
walk but naturally: the operation a package unlocks may also name an
entitlement, and if the tenant's plan lacks it, the gate refuses at that step
with "the workspace's plan does not include this", which is the true
sentence. A guard should refuse a package granting keys that only appear on
operations behind entitlements the tenant cannot ever hold — selling what
cannot be delivered — at package-creation time, not at the customer's first
403.

### 3.2 The lifecycle, platform-owned

The clock is the platform's, because every B2B2C app needs the same ladder
and each would otherwise build a different one:

```
active        paid_until in the future. Grants count.
grace         paid_until passed; within the package's graceDays (tenant-set).
              Grants still count; the buyer and the seller are both told.
lapsed        grace exhausted. Grants STOP counting — one rule in the resolver,
              not N checks in apps. The membership remains. The person still
              signs in, still holds their base role, and their OWN records
              are still theirs: subject-scoped collections answer to the
              person by construction, so "a lapsed client can read their own
              logbook" is free, not a feature.
archived /    the tenant's own retention policy, with a platform floor
removed       (never destructive before N days), exactly the legacy lapse
              ladder's lesson. Removal frees nothing seat-wise — customers
              never cost seats.
```

Renewal EXTENDS `paid_until` from its current value (a queue, never a sum, and
never a second overlapping grant — the legacy rail's sharpest lesson,
`once_per_customer` included: the purchase ledger is what answers "did they
already buy this", not the live grant row).

**Payment stays out of scope here** deliberately: the tenant is paid on their
own provider (the legacy design survives — we never touch the customer's
money). A purchase row is opened by whatever confirms payment — a webhook, a
manual confirmation by staff, or a free grant by staff, all landing on the
same `purchase → grant` path so a comped month and a paid month are the same
mechanism.

### 3.3 What the centre shows

In the tenant centre's People area, a customer row shows their base role AND
what they hold: each live package, its state on the ladder, days left — with
staff able to grant, extend or repair (the audited no-price write). The
package composer sits beside the custom-role composer because they are the
same gesture with one extra field: a price and a clock.

---

## 4. The three surfaces, and what lives on each

### 4.1 `id.` — the account centre (exists, stays thin)

Who you are, everywhere: email, sessions ("sign out everywhere" means
something because a session is a row), API tokens (stage 11), the workspaces
you belong to, leaving one, closing your account, account-wide export. It
STAYS thin on purpose — preferences, consent and inboxes are per-workspace
facts and live behind the workspace's own door (PROGRESS explains why).

### 4.2 `<slug>.` — the tenant centre (NEW: this is the Hub rebuilt)

One shell behind a workspace's own address, and the first OneEngine surface that
needs a real router. Five fixed areas (D10), then the apps:

- **Home** — cross-app today: figures from each enabled app, the inbox, the
  onboarding guide. The app switcher lives in the crown; each app's own
  screens (from its manifest) render inside the same shell under
  `/<app>/...`.
- **People** — §2 and §3: the one roster, platform roles, per-app roles,
  custom roles, packages and their lifecycles, invitations, seats.
- **Money** — what the workspace pays US (plan, bill, credits — the one-bill
  promise) and what its customers hold (packages sold, states, revenue view).
  Two directions, one area, clearly separated.
- **Settings** — generated from the declarations: tenant-level settings per
  app, branding, the notification POLICY (the workspace ceiling +
  letterheads), payment provider, retention/lapse policy. A person's own
  preferences (their notification narrowing, their person-level settings)
  render on their sheet here too — same door, their authority.
- **Data & Trust** — the vault surfaces: consent, grants, who-looked, export,
  erasure (what it cannot undo, said plainly), the processing record, legal
  documents.

An app therefore ships: its collections, operations, screens for ITS OWN
LOGIC, and words. It ships no people screen, no billing screen, no settings
screen, no consent screen, no notification screen — those exist once, here.

### 4.3 `admin.` — the operator console (rebuilt on the same shell)

The deployment's own door: tenants (standing, placement, adjustments — the
absolute either-direction column), the plan catalogue, flags with their
retirement dates, jobs (last-run reading), shards and capacity, maintenance,
and the two AI surfaces below.

---

## 5. AI: the model is picked per ACTION, and the prompt is a LETTERHEAD

"Allow models, pick a model for each action for each app, customise the
prompt" becomes two declarations and two screens, both shaped like things
that already exist:

- **An operation that generates declares its lane and its prompt**, the way
  it already declares credits: `ai: { lane, prompt, variables }`. The prompt
  carries `{placeholders}` from a declared variable list — EXACTLY the
  notification letterhead contract (`refuseLetter` generalises: unknown
  variable, empty, too long), because it is the same problem: somebody
  editing text that must keep naming only what exists.
- **The operator binds actions to models**: per app, per action, a model from
  the enabled rows of that action's lane (`defaultIn` stays the election when
  nobody chose). The reserve is computed from the BOUND model's rates — the
  ceiling-on-revenue rule already in the credit kernel.
- **Prompt overrides are two-level like every other text**: the operator may
  override any action's prompt; a TENANT may override only where the app
  declares the action `brandable` (a drafting tone is the tenant's voice; an
  extraction rule is not anybody's to edit). Same
  ceiling-then-narrowing direction as notifications and flags — one
  direction, no widening.

Guards this needs: an AI action whose lane has no enabled model is refused at
composition (exists — `lane_with_no_model`); a prompt override naming an
undeclared variable is refused at write (the letterhead rule); the mock lane
stays structurally dev-only (exists).

## 6. Notifications: already designed — the centre RENDERS it

Nothing new to invent: the workspace ceiling (policy), the person's narrowing
(preference), audience-by-permission (custom-role-proof), `action` types
unmutable, tenant letterheads on `theirs`-authored types only. The centre
gives the policy its screen in Settings, the person their narrowing on their
own sheet, and the operator the deployment-level channel availability. The
per-permission behaviour the question asks for is the existing `needs` field
doing its job.

---

## 7. Stages

| # | Stage | The one-line contract |
|---|---|---|
| 12 | **Access, multi-app** | a platform role + a role per app on one membership; `identify` resolves against the operation's own app; seats count platform staff; custom roles per app. The `apps[0]` bug dies here. |
| 13 | **The package rail** | package = priced bundle of timed grants; purchase ledger; one resolver (role ∪ live grants − revoked); the lifecycle ladder with a destructive floor; guards: a package cannot sell what cannot be delivered, a lapsed grant cannot count, a repeat purchase extends and never stacks. |
| 14 | **The tenant centre** | the shell with the router: five areas + app screens inside; the app switcher; Home/People/Money/Settings/Data & Trust assembled from the existing surface components. The Hub's sign-in/workspace-list becomes the door INTO it. |
| 15 | **The operator console** | the same shell on `admin.`: tenants, catalogue, adjustments, flags, jobs, shards, maintenance. |
| 16 | **AI actions** | `ai:` on operations; model bindings per action; prompt letterheads with the two-level override; reserve from the bound model. |

Order matters: 12 before 14 (the People screen cannot render a data model
that is wrong), 13 before 14's People-with-packages, 15 and 16 independent
after 14.

**Decisions to record when work starts** (numbered then, cited from code):
the two-level role model and what it forbids (no flat cross-app role, no
per-app membership); the package-is-a-timed-grant rule and what it forbids
(no package-as-role, no second flag resolver, no destructive lapse before the
floor); the AI action binding and what it forbids (no hardcoded model id in
an app, no prompt override without a declared variable list).

---

## 8. The end state, stated once

An app is: collections, operations, screens for its own logic, entitlements
and plans, flags, notifications, settings declarations, packages'
VOCABULARY (which permission keys are sellable) — all literals. The platform
is: every door, the roster, roles, grants, packages and their clocks, money
in both directions, the vault, legal, notifications, settings rendering, AI
binding and metering, audit, erasure. If a fifth app needs a screen the
centre does not give it, the answer is a new declaration the centre renders —
never a screen the app hand-builds (D12, applied to UI).
