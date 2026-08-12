---
kind: contract
verified: 2026-08-09
---

# What a manifest declares

> The specification stage 0 implements. [PLAN.md](PLAN.md) is why the platform
> exists; this is what an app actually writes. [STANDARDS.md](STANDARDS.md) is
> how we write while building it.
>
> ⚠️ **§9 is the section to read if you read one.** It splits every field into
> *must exist on day zero* and *can be added later*, by one test: would adding it
> later require changing an existing declaration or migrating data? Everything in
> the first list implies a column, a table or an audited behaviour, and is
> therefore a migration if it arrives late.

---

## 1. The shape

TypeScript, composed from several files, one `defineApp`:

```
platform/kova/manifest/
  app.ts            defineApp({ ... }) — composes the rest
  bindings.ts       what the runtime provides
  collections/      one file per collection
  operations/       one file per feature area
  access.ts         roles, permissions, plans, entitlements, flags
  notify.ts         notification types
  problems.ts       this app's error codes
  nav.ts            shell, routes, surfaces
  legal.ts          documents and consent
  brand.ts          whitelabel defaults
```

Typed, not JSON: `tsc` gives autocomplete, refactor-safety, exhaustiveness and
cross-reference checking for free, and re-implementing those in a JSON linter is
work with its own bugs. A JSON-serialisable projection is emitted for anything
crossing a wire — the operator console, the tenant changelog, the help index.

---

## 2. Outcomes — the app declares what happened, the platform decides how it looks

An operation declares its result. It does **not** call a toast.

```ts
export const publishPlan = operation({
  id: "training.plan.publish",
  // …input, permission, entitlement, scope…
  outcome: {
    success: { message: "Plan published", tone: "success", sound: "commit" },
    invalidates: ["plan", "client.plans"],
    optimistic: true,
  },
  emits: ["plan.published"],
});
```

⚠️ **The presentation is the platform's, and that is the whole point.** An app
that picks its own surface produces the inconsistency this project exists to
end. The policy, once, for everyone:

| situation | surface |
|---|---|
| a field saved in place | inline, on the control |
| a result the user cannot see happen | toast |
| destructive, or irreversible | dialog, confirmed before |
| tenant-wide state (standing, maintenance, region move) | banner |
| **something visibly happened already** | ⚠️ **nothing** — a row appearing is its own feedback |
| N results from one action | one summary, never N toasts |

**Bulk collapses by construction.** "23 updated, 2 skipped, 1 failed — review" is
built into the runner, because every app that hand-rolls this gets it wrong at
the point where it matters most.

---

## 3. Failure — a `Problem`, never a provider's words

⚠️ **A provider error may never reach a client.** Not because it is ugly:
because it leaks. Model names, quota internals, account ids, request fragments,
sometimes a slice of the prompt. Stripe, Gemini, Workers AI, a mailer and a
payment gateway all return prose written for us, not for a customer.

Every failure crossing the boundary is:

```ts
interface Problem {
  code: string;         // stable, namespaced — "billing.quota_exceeded"
  status: number;       // HTTP
  title: string;        // short, from the registry, translatable
  detail?: string;      // OURS. Composed from safe, structured meta
  fields?: Record<string, string>;   // per-field, for forms
  meta?: Record<string, string | number>;  // { limit: 25, used: 25 }
  retryable: boolean;
  help?: HelpId;        // cross-link — the article carries the depth
  ref: string;          // ⚠️ correlation id, e.g. ONE-7F3A2B
}
```

RFC 9457-shaped on purpose; there is no reason to invent an error envelope.

**`ref` is the piece that makes secrecy usable.** The customer gets something
they can quote to support; the raw provider error is logged against the same id
and never sent. Without it, hiding the detail is hostile rather than careful.

**Codes are declared, not invented at a throw site.**

```ts
export const problems = declareProblems({
  "training.plan.not_publishable": {
    status: 409, title: "This plan can't be published yet",
    detail: (m) => `It has ${m.emptyDays} day(s) with no exercises.`,
    retryable: false, help: "plans.publishing",
  },
});
```

**Every external call goes through an adapter that maps to a `Problem`.** The
mapper is the only code that ever sees the provider's shape, and it is where
retryability, rate-limit backoff and "is this our fault or theirs" get decided
once per provider rather than once per call site.

Enforced:

- an operation may only fail with a code it or the platform declares
- a route or tool may not return a non-`Problem` body on failure
- ⚠️ no `catch` may re-throw or serialise a provider error object
- every code has copy; a code with no title cannot ship

**Unmapped is not a category.** An unrecognised provider failure becomes
`platform.unavailable` with a `ref`, and the raw text goes to the log. A "we
don't know" that shows the customer a Google stack trace is the failure this
whole section exists to prevent.

---

## 4. Notifications — emitted by operations, never dispatched by hand

```ts
export const notifications = declareNotifications({
  "plan.published": {
    category: "coaching",              // groups the preference UI
    audience: subjectOf("client"),     // or role("owner"), staff(), actor()
    channels: { inbox: true, email: "immediate", push: true },
    priority: "normal",                // "urgent" bypasses digesting
    copy: { title: "New plan", body: (m) => `${m.coach} published ${m.plan}.` },
    link: route("client.plans", (m) => ({ planId: m.planId })),
    dedupe: (m) => `plan:${m.planId}`,
  },
});
```

**An operation's `emits` is the only dispatcher.** Hand-written dispatch sites
are how a product ends up with events nobody can find and events nobody sends;
deriving them from the operation registry makes both impossible.

⚠️ **`link` is a route reference, not a string.** A typed reference is
link-checked against the manifest's nav, so a notification cannot point
somewhere that does not exist — a class of defect that stays invisible for
exactly as long as nothing renders a notification.

Platform-owned, so no app decides them again: the channel matrix (role ×
category → defaults), per-user preferences, the owner's email veto, digesting
and its windows, **quiet hours in the user's timezone**, unsubscribe, and the
delivery ledger. Push is a channel like any other — declaring it is one boolean.

---

## 5. Sound — yes, and small

**Recommendation: build it, semantic, off by default except where a surface asks
for it.**

Two of three products have a genuine case: a counter tablet and a kiosk that
nobody is looking at, and a sterile-supply floor where hands are busy and gloved.
That is enough to justify it, and it is cheap if declared as *intent* rather than
as files.

```ts
sounds: { pack: "one/default", surfaces: { station: "on", kiosk: "on", dashboard: "off" } }
```

- A small **semantic** set — `commit`, `error`, `alert`, `arrive`, `scan` — and
  the platform owns the audio, exactly as it owns colour tokens. An app names
  intent; it never ships a `.mp3`.
- Registered **per surface**, not per action. A dashboard is silent; a station
  is not.
- The user's setting always wins, and the platform handles the browser's
  autoplay unlock on first interaction so no app ever meets it.
- ⚠️ **Never the only channel.** A sound accompanies a visible outcome and never
  replaces one — a deaf user must lose nothing, which also means a muted tab
  loses nothing.

---

## 6. The full declaration surface

Grouped by what it governs. **Bold** entries have day-zero consequences (§9).

### Runtime and data

| declaration | what it decides |
|---|---|
| **`bindings`** | logical stores; the framework resolves the regional instance. No handler sees a raw binding |
| **`regions`** | which homes exist; a tenant lives in one |
| **`collections`** | table, fields, **versioning**, docstatus, naming series, soft delete, activity, search, offline, views, per-field permissions |
| **`retention`** | per collection: how long, and what happens on tenant close |
| **`media`** | per field: accepted types, size ceiling, **EXIF stripping**, scanning, thumbnails |
| **`migrations`** | per version, reconcile-before-compose, verified |

### Surface

| declaration | what it decides |
|---|---|
| **`operations`** | input, output, permission, entitlement, row scope, **idempotency**, meter, audit, outcome, emits — one declaration, N transports |
| `webhooks` | which emitted events a tenant may subscribe to; signing and retry are the platform's |
| `apiKeys` | tenant-issued keys, their scopes, their ceilings |
| **`rateLimits`** | per operation, per actor, per tenant, per IP |
| `realtime` | which collections push live; the platform owns the socket |
| `importExport` | per collection: shape, mapping, validation. **The GDPR export falls out of this** |

### Access

| declaration | what it decides |
|---|---|
| `roles` + `permissions` | the vocabulary the tenant's role builder composes from |
| `plans` + `entitlements` | what is sold; quotas, features, trials, grandfathering |
| `flags` | resolution layers, and the gate shape shared by route, tool and UI |
| **`seats`** | the seat model, and what counts against it |
| **`impersonation`** | operator access to a tenant: time-boxed, audited, announced |

### Money

| declaration | what it decides |
|---|---|
| **`money`** | ⚠️ minor units + currency, per tenant. Today every product is USD/month; the first EUR price or VAT line is a schema change if this is not here |
| `catalog` | plans, packs, the customer-facing rail if the app has one |
| `metering` | what is billable, and the ledger it writes |

### People and presentation

| declaration | what it decides |
|---|---|
| `nav` | shell, routes, surfaces — **the screen index is generated from this** |
| `outcomes` / `problems` | §2, §3 |
| `notifications` | §4 |
| `sounds` | §5 |
| `shortcuts` | keyboard registry — one place, so two features cannot claim `⌘K` |
| `brand` | whitelabel slots, including auth screens, emails, errors and the PWA. ⚠️ The slot list is closed and every value in range is provably safe — [UI.md](UI.md) §1.1 |
| **`locale`** | per-user language, **per-tenant timezone**, week start, date and number format |
| **`units`** | metric/imperial, per user, stored canonical |
| `help` + `changes` | §6 and §7 of STANDARDS.md |
| `print` | per collection: a print/PDF view. Labels and reports are not screenshots |

### Governance

| declaration | what it decides |
|---|---|
| **`legal`** | documents, versions, and ⚠️ **who must accept which version, recorded**. `terms` is owed always; `privacy` and `dpa` become owed the moment a collection holds somebody's data — §7a |
| **`holding`** | per collection: what it holds, whose it is, why, and on what lawful basis. ⚠️ Required with an explicit `{ kind: "none", why }` — §7a |
| **`protection`** | the controller, the contact, the sub-processor list, and whether an impact assessment is owed. ⚠️ Checked against what the manifest REACHES — §7a |
| **`vault`** | what this app ASKS to see of somebody's own facts, why, and at what rung. ⚠️ It does not HOLD any of it — the account does. Declaring a want is also what makes the fact unavailable any other way: a collection field that shadows one is refused. [VAULT.md](VAULT.md) |
| **`audit`** | what is recorded, retention, who may read it |
| `jobs` | scheduled work: per-tenant, idempotent, with a visible failure surface |
| `onboarding` | the wizard's steps; the tenant is created between them so Back is lossless |
| `analytics` | events, and a per-region sub-processor allow-list |
| `health` | what "up" means for this app |

---

## 6a. ⚠️ What the vault takes off the table

A product asking somebody their height has, until now, had exactly one option:
a column. The consequence is that the person has no relationship with the fact —
they cannot see who reads it, take it back, carry it to the next product, or find
out it existed once they have stopped using the app.

**A sensitive fact belongs to the account and is stored once.** An app declares
what it wants to SEE, in the words it would have to justify to whoever is
deciding, and is granted a view at a rung that person chose:

```ts
vault: {
  wants: [
    { fact: "goal.training", need: "raw", recommend: "staff",
      why: "Your coach writes your programme against this." },
    { fact: "body.mass", need: "derived", readings: ["body.mass.trend"],
      why: "So a direction can be shown without a weight." },
    { fact: "body.height", need: "compute",
      why: "Used in a calculation whose answer is shown." },
  ],
}
```

Three things fall out of that, and each is a refusal rather than a convention:

- **The registry is the PLATFORM's and it is closed.** An app that could declare
  its own facts is one that declares `height` a second time — and then one person
  has two heights, two grants and two erasure paths, which is the situation this
  replaces. Adding a fact is one entry, reviewed once, available to every product.
- **A collection may not shadow a fact.** Asking politely and quietly keeping a
  column is exactly what an app would do, because a column is easier than a grant.
- **The record of processing includes it.** A fact the app never stores appears in
  no collection, so without this an app reading health data through a grant would
  produce an Article 30 record saying it holds none.

[VAULT.md](VAULT.md) is the whole argument, including why `compute` is a rung of
the ladder rather than a property of the ask.

---

## 7. Two fields that are easy to miss and expensive to add

**`idempotency`.** Which operations may be safely retried, and on what key. A
payment webhook, a credit grant, a package application and every mutating tool
call need it. Adding it later means auditing every write in the product for
double-application, which is the same review as looking for the bug.

**`version` on every document.** Optimistic concurrency: two people editing the
same record must not silently overwrite each other, and a tool call racing a
human is the same problem with worse timing. It is one integer per table, and
adding it later is a migration across every table in the platform.

---

## 7a. Data protection is declared once and derived after that

⚠️ **The goal is that nobody visits this per feature.** A compliance posture that
needs somebody to remember something on every commit is correct on the day it is
written and wrong by the end of the quarter — and the gap is invisible, because a
processing activity missing from a record looks exactly like one that does not
happen.

So exactly one thing is declared and everything else is read off it.

**Declared.** `holding` on every collection: `{ kind: "none", why }` or what it
holds, whose it is, what for, and on what Article 6 basis. No schema implies
"this is health information"; a person has to say so, once.

⚠️ **And it is required WITH an explicit nothing.** An optional field is one that
is absent on the collection somebody added in a hurry, and absent is
indistinguishable from "nothing personal here" — the exact claim that needs a
person behind it.

**Derived, and refused at composition when it disagrees:**

| what | from | what a wrong answer would be |
|---|---|---|
| the Article 30 record | every `holding`, the retention, the regions | a spreadsheet describing the product as it was when somebody last had time |
| the sub-processor list | the model catalogue, `services`, the mail lane, whether anything has a price | the list every product has: right when written, silently wrong after the next feature |
| the privacy notice and the DPA | whether anything is personal at all | two documents owed at a moment nothing anywhere marks |
| whether an impact assessment is owed | whether any category is special | `required: false`, typed without thinking about it, on a product storing health data |

**The anti-trick half is the reason any of it is worth anything.**
`{ kind: "none" }` is one line, and one line is exactly what somebody writes to
make a check go away — so a collection carrying `email` may not claim to hold
nothing, and one whose own field names are `weight` and `sleep` may not declare
only `usage`. The word list is deliberately short: `name`, `photo` and `note` are
NOT on it, because a food has a name and a movement has a demonstration image,
and a check that refuses an honest declaration teaches people to weaken it.

**Both directions, on the sub-processor list.** A company reached and not
disclosed is somebody's data going somewhere no notice names. A company disclosed
and not reached is a false disclosure in the direction that looks careful — and it
is the entry nobody ever removes, because removing it feels like claiming less.
The check found one the first time it ran.

**Residency is a store, not a column.** `tenancy.regions` lists the homes that
exist; `physicalName` resolves `db` to the bare `DB` in the default region and to
`DB_EU` beside it in a second, so a record written in one region is in another
database rather than tagged in the same one. ⚠️ Additive, never a rename — adding
a second region must not change a live worker's existing bindings. A region a
workspace asks for and the deployment does not have is REFUSED rather than
defaulted, because quietly placing a workspace elsewhere is the one failure
residency cannot have.

⚠️ **And it is offered rather than granted on request.** Residency that has to be
asked for is residency most people who needed it never got, because they did not
know it was a question.

**The mail lane is the one recipient the manifest cannot see.** The provider is
deployment configuration rather than a declaration, so the pair that drifts is
`MAIL_HANDED_TO` in the runtime and `MAIL_LANES` in the kernel — a provider added
in a file about HTTP, a recipient declared in a file about the law. They are
asserted equal in both directions, and `MAIL_LANES` is what `disclosureProblems`
makes every manifest name.

**Consent is enforced, not merely recorded.** Two ledgers, and conflating them
is the mistake the second exists to prevent. A LEGAL DOCUMENT is accepted per
account per version — being told what happens — and until the documents a role
owes are accepted, every write is refused with 451 while reads are served.
ARTICLE 9 EXPLICIT CONSENT is per SUBJECT, given by the person the data is about,
and it carries a property no document acceptance has: it can be withdrawn, as
easily as it was given, and new records stop immediately. Withdrawal is a column,
never a delete — removing the row destroys exactly the evidence that the
processing which already happened was lawful.

⚠️ **The lanes that survive both gates are load-bearing**: identity, because
somebody has to be able to sign in to reach the document; exit, because leaving is
always allowed; and the acceptance itself, or agreeing to the terms would require
having agreed to the terms.

**And the model that runs a generation is four decisions, not one.** The
manifest's default, what the operator left enabled, what the workspace picked, and
what the region permits — resolved once by `chooseModel`, which returns WHO
decided. A workspace's pick is honoured only while it is still eligible, the
manifest's default is subject to the region like everything else, and the reserve
is computed for whatever that resolved to. Whether a model can do what a feature
asks is derived from what it COSTS (`imageUnits`, `perImage`) rather than declared
beside it, because a capability field can disagree with the arithmetic and it
disagrees in the direction the platform pays for.

**And the record is a route, not a file.** `protection.list` is public because
Articles 13 and 14 oblige telling somebody before their data is collected;
`protection.record` sits behind the permission that reads the audit. There is
deliberately no generated markdown copy of either: a second copy of a compliance
claim is one that can differ from the product, which is the whole failure this
section exists to prevent.

---

## 8. How a manifest changes without breaking a tenant

- **Every manifest is versioned and content-hashed.** The diff between two
  versions is an artifact: it drives the tenant changelog and the operator's
  "what changed".
- **A removal that somebody holds fails the build.** Deleting a plan two tenants
  are on, a permission a custom role grants, or an entitlement a subscription
  carries is a migration, not an edit — the guard makes you write the migration.
- **Deprecate, then remove.** A field marked deprecated keeps working and warns;
  removal is a later, separate change.
- **Grandfathering is a platform behaviour, not an app's discipline.** Tightening
  a plan holds existing tenants at what they bought, automatically.

---

## 9. ⚠️ Day zero versus later

The test: **would adding this later require changing an existing declaration or
migrating data?**

### Must exist in the types before the first table

Each implies a column, a table, or a behaviour that cannot be applied
retroactively.

| | why it cannot wait |
|---|---|
| `bindings` + `regions` | every store resolution; retrofitting is every query |
| `collections.version` | an integer on every table |
| `operations.idempotency` | otherwise it is an audit of every write |
| `money` (minor units + currency) | a column, and a rounding rule |
| `locale` + tenant timezone | columns, and every stored timestamp's meaning |
| `units` | what a stored number means |
| `media.exifStrip` | ⚠️ **stripping later does not fix what is already stored** |
| `vault` over a column | ⚠️ **the same shape of mistake as exif.** A fact stored in this app's own table is a copy that outlives every grant over it, and moving it to the vault next year does nothing for the copies already made — or for the person who cannot see who read them. Ask for it; do not hold it. |
| `legal` consent ledger | a table, and a legal record you cannot backfill |
| `audit` | a table, and evidence you cannot reconstruct |
| `retention` | informs the schema and the erasure cascade |
| `seats` | what counts against a ceiling |
| `impersonation` | the audit trail must exist from the first support session |
| `soft delete` | the difference between a row and a gone row |
| `rateLimits` | shapes the request pipeline |

### Safe to add later

Pure additions. Nothing already declared changes.

`sounds` · `shortcuts` · `print` · `analytics` · `webhooks` · `apiKeys` ·
`importExport` · `jobs` · `realtime` · `help` · `changes` · `onboarding` ·
`health` · additional `problems` · additional `notifications` · additional
`plans`

⚠️ **The point of this split is not to build everything now.** It is that the
first list must exist *as types*, even where the implementation is a stub, so
adding the behaviour later is filling something in rather than migrating the
platform. Stage 0's job is that list.

---

## 10. What is deliberately not declarable

Named so nobody re-litigates it in review:

- **Canvas screens.** Scena's playout loop, Kova's body scan and camera
  pipelines, Tessa's cycle timelines. §5 of PLAN.md lists them per app.
- **Product logic.** TDEE, body fat, sterilisation cycles, `position(t)`. Pure
  modules with tests, imported by operations.
- **Provider protocols.** Tokenization, 3DS, SCA. The platform owns
  `checkoutUrl` and `verify` and nothing in between — which is exactly why a
  card number never reaches our infrastructure.
