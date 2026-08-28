# The business suite — how apps share money, parties and documents

kind: plan

**OneEngine is meant to become a modular business suite: OneInventory, OneBooks,
OneCRM, OneHR and the rest, each installable on its own, each adding to a shared
picture without any of them knowing the others exist.**

This is the plan for the seam that makes that possible. It is written before any
of it is built so the shape can be argued with cheaply, and it opens with an
audit of ERPNext — read from source — because ERPNext is the largest open
implementation of exactly this ambition, and the places it went wrong are more
useful than the places it went right.

The audit is not a survey of features. [../apps/inventory/ERPNEXT.md](../apps/inventory/ERPNEXT.md)
already does that for Stock. This one asks six questions about **structure**:

1. How does a module contribute to accounting?
2. Is a party one record or several?
3. When is a document numbered, and can the numbering be trusted?
4. Is "paid / partly paid / unpaid" stored or derived?
5. How is a second country supported?
6. How does a business extend the model without forking?

**Read from:** `github.com/frappe/erpnext` at `0223223` and
`github.com/frappe/frappe` at `6437803`, both 2026-08-28, shallow clones.

---

## Part I — the audit

### 1. Accounting is reached by inheritance, not by an event

This is the finding that matters most, and it is not close.

Every document that posts to the general ledger does so by **inheriting a base
class and calling a method on itself**:

```
Document → TransactionBase → AccountsController → StockController → SellingController
                                    │                    │                  │
                              Journal Entry        Purchase Receipt     Sales Order
                              Payment Entry        Delivery Note        Quotation
                              Asset                Stock Entry          Sales Invoice
```

`erpnext/controllers/stock_controller.py:40` is literally
`class StockController(AccountsController)`. So a **Sales Order is-a accounting
document**, structurally, whether or not the business wants accounting. There is
no seam to leave out.

The consequences are measurable in the source:

- **`erpnext/stock/` imports `erpnext.accounts` 42 times.** Stock cannot be
  installed without Accounts, and never could be.
- **28 files call `make_gl_entries`** across `stock/`, `assets/`,
  `subcontracting/`, `controllers/` and `accounts/`. Each is a separate place
  that knows the chart of accounts.
- `accounts` is the largest module in the system by a wide margin — **195
  doctypes** against Stock's 82 and Selling's 22 — partly because everything
  else drains into it.

⚠️ **AND THE STRIKING PART IS THAT FRAPPE HAS AN EVENT BUS AND ERPNEXT DOES NOT
USE IT FOR THIS.** `hooks.py` declares `doc_events` — a real subscription
mechanism, `{doctype: {event: handler}}`, with a `"*"` wildcard. It is used for
service-level agreements, company restriction, contact upkeep, and keeping
`Material Request`'s completed quantity in step. It is used for **validation and
denormalisation**. The one thing that most needed decoupling went through
inheritance instead.

That is the whole lesson. The bus existing is not enough; **the accounting seam
has to be the thing it carries**, or inheritance fills the gap and the modules
weld together.

### 2. A party is three tables, plus a table apologising for it

`Customer` lives in `selling/`, `Supplier` in `buying/`, `Employee` in `setup/`.
Three doctypes, three modules, three sets of address and contact wiring.

The same company being both a customer and a supplier is completely ordinary, so
ERPNext added **`Party Link`** (`accounts/doctype/party_link/`) — a table whose
entire purpose is to record that two rows are the same organisation:

```
primary_role, primary_party, secondary_role, secondary_party
```

with a validation that the primary role must be `Customer` or `Supplier`. It is a
join table for an identity that should never have been split. Everything
downstream then carries a **`party_type` + `party`** pair — a polymorphic
reference — because the ledger needs one column that can point at any of them.
`Party Type` is itself a doctype, and `Party Account` is another table mapping
(party, company) to a receivable or payable account.

So the cost of three tables is: one link table, one polymorphic pair on every
financial row, one type registry, one account-mapping table, and a permanent
data-entry question — *is this new supplier already a customer?* — that nobody
answers.

### 3. Numbering is allocated at insert, and the gaps are patched afterwards

Frappe's `frappe/model/naming.py` allocates the document number in
`set_new_name(doc)` — at **insert**, before the document is submitted. Since
draft documents are inserted, drafts consume numbers.

The patch for that is `revert_series_if_last(key, name, doc)` (line 446): when a
document is deleted, if its number happened to be the last one issued, the
counter is rolled back. It is best-effort by construction — it only works for the
*last* number, and two people abandoning drafts concurrently leave a hole that
nothing recovers.

For jurisdictions that require gapless sequential invoice numbering — Italy,
Spain, Portugal, Poland, and a growing list under e-invoicing mandates — that is
not a tidiness problem. **Numbering at insert is the design error**, and every
mitigation after it is a partial one.

### 4. Payment status is stored, then repaired by two subsystems

`Sales Invoice` carries all of these as **columns**:

```
outstanding_amount, paid_amount, total_advance, write_off_amount, status,
update_outstanding_for_self, write_off_outstanding_amount_automatically
```

`outstanding_amount` is decremented in place as payments are allocated
(`accounts/utils.py:558`: `referenced_row.outstanding_amount -= flt(entry.allocated_amount)`).

Then, because a stored balance drifts from the entries that should imply it,
ERPNext added a **second, derived ledger**: `Payment Ledger Entry`, carrying
`voucher_no` / `against_voucher_no` / `amount` per allocation. And because *that*
can also fall out of step, there are **repair subsystems for both**:

- `Repost Payment Ledger` + `Repost Payment Ledger Items`
- `Repost Accounting Ledger` + `Repost Accounting Ledger Items`
- `Repost Allowed Types`

This is the same shape as the Stock module's `Repost Item Valuation`, one domain
over: **a number accumulated beside the entries that derive it, plus machinery to
find the two disagreeing.** It is the exact fault OneInventory's
`costing.ts` header refuses for stock value, arriving in accounts receivable.

### 5. A second country is a monkey-patch table

`hooks.py:648` declares `regional_overrides` — a map from country name to a dict
of `{function path: replacement function path}`:

```python
"United Arab Emirates": {
  "erpnext.controllers.taxes_and_totals.update_itemised_tax_data":
      "erpnext.regional.united_arab_emirates.utils.update_itemised_tax_data",
  "erpnext.accounts.doctype.purchase_invoice.purchase_invoice.make_regional_gl_entries":
      "erpnext.regional.united_arab_emirates.utils.make_regional_gl_entries",
},
```

Five countries have code today (France, UAE, Saudi Arabia, Italy, and a test
hook). `erpnext/regional/` holds directories for Australia, Italy, South Africa,
Turkey, UAE and the United States.

The honest reading is a split, and ERPNext got **one half right**:

- **76 verified chart-of-accounts templates** ship as JSON data. That is correct
  and worth copying — a chart of accounts is data, and a template per country is
  the right amount of help.
- **Tax and posting behaviour is code, swapped by string path at runtime.** Every
  new country is a pull request against the core, and the override is invisible
  at the call site: the function you are reading may not be the function that
  runs.

### 6. Extension is a column added to a live table

`Accounting Dimension` is how a business adds its own axis — a project, a
department, a branch — to the ledger. Adding one calls
`make_dimension_in_accounting_doctypes`, which calls
`create_custom_field(doctype, df)` **for every doctype in a hardcoded list of
about 40** (`hooks.py:575`, `accounting_dimension_doctypes`), enqueued to a long
worker because it is DDL against live tables.

So the extensibility story is: *run ALTER TABLE across forty tables in a
background job.* It works, and it is the thing a schema-first design should be
able to do without touching a table at all.

---

## Part II — what we do instead

Six decisions, each answering one of the six questions, each stated so the
opposite is a visible choice rather than an accident.

### B1. An app may never import another app

> **Apps share the engine and the event bus. Nothing else. Ever.**

This is the rule ERPNext does not have, and the absence is why `stock/` imports
`accounts/` forty-two times. It costs nothing to state now and is unenforceable
later.

It gets a guard on day one: **no `import` between `engine/apps/*`.** That check
is four lines and it is the difference between a framework and a monolith with a
plugin story.

Note what the rule does *not* forbid. All apps in a deployment already share one
shard database (`one/src/index.ts` applies every app's `SchemaModule` to the same
D1), so the constraint is **declarative, not physical**. Apps stay separate
because the manifest keeps them separate, which is the same mechanism that
already refuses a view no screen reads.

### B2. Apps emit. OneBooks hears. The posting rule is workspace data

OneInventory already emits `buying.received`. It should keep doing exactly that
and know nothing more.

OneBooks declares that it **hears** that event, and holds a **posting rule** —
data the workspace owns, editable in its own screen:

> on `buying.received` → debit *Inventory*, credit *Goods received not invoiced*,
> for the event's `landed` amount.

What falls out:

- A workspace without OneBooks: the event is simply unheard. The engine already
  documents that state — *"an event no notification listens to is simply quiet."*
- The chart of accounts, the tax treatment, the country's rules: all inside
  OneBooks. No other app has a line about any of them.
- OneHR added in a year posts payroll through the same door, and nothing changes
  anywhere else.
- The posting rule is inspectable. "Why is this account moving" is answerable by
  a person, on a screen, rather than by reading `make_gl_entries` in 28 files.

⚠️ **AND THE JOURNAL IS THE PRIMITIVE, NOT A WALLET.** A wallet is a *balance*;
accounting needs a *journal* — balanced entries, with balances derived by `SUM`.
Making wallets the primitive gives you balances nobody can explain, no P&L or
balance sheet (both are groupings of journal *lines*), no accrual-versus-cash
switch, and ERPNext's repost subsystems arriving on schedule. It is the same
decision D119 already took for stock: **derived, never accumulated.**

OneWallet keeps its job — prepaid balance held on behalf of a party. That is
**one account in the chart** (a liability: we owe them), not the model.

**The one new engine primitive this needs:** an app declares `hears: [...]`, the
runtime delivers, and `eventsOf` widens from one app's spec to the deployment's
union. Everything else in this document is app design.

### B3. A party is one record with roles

One `party` collection. `customer`, `supplier`, `employee` are **roles it holds**,
each carrying its own fields — a credit limit, a payment term, a start date.

This is the shape OneInventory already uses for `product`, where `batched` and
`itemised` are promotions rather than separate tables. It makes `Party Link`
unnecessary, makes `party_type` unnecessary, and makes *"is this supplier already
a customer"* a question the product answers instead of asks.

OneInventory's `supplier` collection collapses into it.

### B4. A number is allocated on issue, and an issued document is immutable

Two identifiers, always:

- **The record id** — internal, opaque, never the document's public identity.
  OneInventory already does this (`newId("ord", …)`).
- **The document number** — human, per (series × period), **allocated at the
  moment the document is issued**, never at draft. A draft has no number and the
  screen says so.

Numbering on issue is what makes gapless numbering *possible* rather than
best-effort. There is no `revert_series_if_last` because there is nothing to
revert.

And **an issued document is never edited.** A wrong invoice is answered by a
credit note. This is why ERPNext needs amendment chains; refusing the edit from
the start means never building them. Same shape as D119's refusal of back-dating,
and it should be argued the same way — the cost said out loud rather than
discovered.

### B5. Sales and purchase are one rail with a direction

| | offer | commitment | goods | claim | money |
|---|---|---|---|---|---|
| **out** | Quotation | Sales order | Delivery | Invoice | Receipt |
| **in** | Request for quotation | Purchase order | Goods received | Bill | Payment |

The same five stages, mirrored. One `document` collection with
`direction: in | out` — quotation and RFQ are the *same stage*, not two features.

This is the same move as OneInventory's chokepoint, where `received` and `taken`
are one path with a sign rather than two implementations that drift. It is the
single largest anti-duplication lever in the whole suite: ERPNext builds Selling
(22 doctypes) and Buying (20 doctypes) as parallel trees.

OneInventory's `buying` / `buying-line` collapses into it — which also means the
carriage arithmetic from D118 generalises to outbound freight for nothing.

### B6. Payment state is derived from allocations, and never stored

`paid | partly paid | unpaid` is `SUM(allocations) vs total`, computed on read.

The allocation is its own row — `allocation(payment, document, amount)` — and
that one table makes **partial payment**, **one payment across three invoices**
and **one invoice paid by two payments** the same thing rather than three
features.

There is no `outstanding_amount` column. There is therefore no `Payment Ledger
Entry` to reconcile it against, and no `Repost Payment Ledger` to repair that.
Three tables and two subsystems, not built, because of one rule already written
down for stock.

### B7. A country is data. Double-entry is the code

The only genuinely universal thing in accounting is **double-entry itself**. A
sale credits revenue and debits receivable in every jurisdiction on earth. That
is precisely why it is the right thing to hard-code and the only thing.

**Data, per workspace:** chart of accounts (seed a template — copy ERPNext's 76,
they are good), tax rules, fiscal year start, numbering series and format,
rounding rule, document copy.

Four traps to design against now, each of which ERPNext hit:

- **Tax is not a percentage on a product.** It is a rule keyed by *(what, to
  whom, from where, to where, when)* returning zero or more
  `{account, rate, basis}` lines. A `vat_rate` column does not survive the second
  country.
- **Rounding differs by jurisdiction** — per line, per invoice, or per tax code.
  A workspace setting with a stated default, decided once.
- **Fiscal years do not start in January.** Store month and day.
- **Regional behaviour must never be a swapped function pointer.** If a country
  genuinely needs different arithmetic, it is a declared rule with a country in
  its key, visible at the call site. `regional_overrides` makes the code you are
  reading not the code that runs.

### B8. Extension is a declared dimension, not an ALTER

A journal entry line carries a small open map of **dimensions** —
`{project, department, branch, …}` — declared by the workspace and stored in one
JSON column, with an index on the ones it filters by.

No `create_custom_field` across forty tables in a background job. The reporting
cost is real and should be stated: a dimension is filterable, and aggregating by
one is the reports' business, not a generated view's.

---

## The chart of accounts, in full — B7 made concrete

B7 says a country is data. This is what that means in rows, and it is written out
here because the chart is the first thing OneBook builds and the decision that is
hardest to walk back.

### The one thing that is hard-coded

**Every journal balances to zero.** A sale credits revenue and debits receivable
in every jurisdiction on earth, and no country has ever legislated otherwise.
That is the whole of what is universal, and it is therefore the whole of what
belongs in code.

### The five roots, which are not a national convention

`asset · liability · equity · income · expense`. A workspace may name them
anything and nest anything under them; it may not invent a sixth, because a
balance sheet and a profit-and-loss statement are made of exactly these and a
sixth root is a figure that appears on neither.

### ⚠️ Roles are the seam, and they are the whole design

**A posting rule never names an account. It names a role.**

> A goods receipt debits `stock` and credits `stock_pending`.
> An invoice against it debits `stock_pending` and `tax_input`, and credits `payable`.

A German workspace has `1400 Forderungen aus L+L` tagged `receivable`; a UK one
has `Trade Debtors`; a workspace that deleted the template and built its own
chart from nothing has whatever *they* tagged. **The posting code is identical in
all three**, and that is what makes a wrong template a cosmetic problem rather
than a structural one.

Sixteen roles, and a template that does not cover every one of them is a
workspace where the first goods receipt has nowhere to post:

| Role | What posts to it |
|---|---|
| `receivable` | what customers owe us |
| `payable` | what we owe suppliers |
| `bank` · `cash` | money in a bank, money in a drawer |
| `stock` | the value of goods on hand |
| `stock_pending` | goods received and not yet invoiced — the liability between the two |
| `cogs` | what those goods cost when they were sold |
| `income` · `expense` | the default revenue and the default cost, where nothing more specific applies |
| `tax_input` · `tax_output` | tax we paid and may reclaim; tax we charged and owe |
| `rounding` | the difference a rounding rule creates, in both directions |
| `discount` | what was given away rather than earned |
| `opening` | where a business's existing balances land when it arrives mid-life |
| `suspense` | where a posting goes when the rule cannot decide |
| `retained` | where the year's profit closes to |

⚠️ **`suspense` IS NOT AN ADMISSION OF DEFEAT, IT IS THE ALTERNATIVE TO A SILENT
WRONG ANSWER.** Every real ledger has one. Without it, a posting that cannot
resolve either refuses the operation that caused it — making one product's
misconfiguration another product's outage, which `hears` exists to prevent — or
it guesses, and a guessed account is a figure nobody can find later.

⚠️ **AND A ROLE CAN BE MOVED, NEVER DELETED.** A workspace may point `income` at a
different account any time; it may not leave the role unassigned, because then
the failure is a receipt that silently does not post.

### The template is data, and it is copied once

A country template is a JSON tree in the repository. Each node:

```
{ code?: string, name: string, type: Root, role?: Role, children?: Node[] }
```

When OneBook is switched on for a workspace it reads the workspace's country
(already stored — `createTenant` takes it), finds the template for it, falls back
to the universal one, and **copies the rows in**. It records `seeded_from` and
`seeded_version`, and from that instant **the rows are the workspace's own and
nothing ever rewrites them**.

That last clause is the one to hold on to. A template that keeps being "applied"
is a template that can overwrite a chart somebody has been posting to for two
years.

`code` is optional, unique within a workspace when present, and **never read by
any posting rule**. France's Plan Comptable Général prescribes account numbers by
law and Germany's SKR03/04 are conventions everybody follows; the UK and the US
prescribe nothing. Shipping the numbers where they exist is help; depending on
them would make the two halves of the world different code.

### How a workspace changes it

| Lever | Cost |
|---|---|
| Rename anything | Nothing. The role is what the engine reads, the name is what a person reads |
| Add, nest, or **close** an account | Nothing. Closed rather than deleted once anything has posted — a deleted account is a hole in a report |
| Move a role to another account | One row. Every future posting follows |
| Seed from another country's template, or none | The country is a *default*, not a constraint |
| Import the accountant's spreadsheet | What most businesses past year one actually want |

### ⚠️ Why shipping a half-finished template is safe here

This is the question that decides how many countries we ship on day one, and the
answer is a consequence of the role seam rather than of confidence.

**A template we got wrong produces a workspace with badly-named accounts and
correct books.** The names are wrong, the numbering may be unconventional, and a
local accountant will want changes — all of which are renames and additions
somebody makes in an afternoon. What cannot be wrong is the posting, because the
posting reads roles.

In a system where the rules name accounts directly, the same mistake is a
migration. That is the difference this design buys, and it is why the honest
plan is:

1. **One universal template that works anywhere**, in plain English, covering all
   sixteen roles. This is the fallback and it is never wrong, only generic.
2. **Country templates as they are verified**, each a data file and a registry
   line. ERPNext ships 76; we should ship the handful we can actually check,
   because a template nobody has shown to an accountant in that country is worse
   than none — it looks authoritative and is not.
3. **Improve them over time.** A better template reaches NEW workspaces
   immediately and existing ones not at all, which is correct: their chart is
   theirs.

⚠️ **AND `account.topUp` IS WHAT KEEPS THE THIRD POINT FROM BEING A DEAD END.**
An additive-only operation: it adds the accounts a newer template version has
that this workspace lacks, and it renames nothing, moves nothing and deletes
nothing. That is what lets a workspace seeded from a thin early template pick up
the sixteen accounts we later learned their country needs, without any risk to
the chart they have been posting to. Safe by construction, because the only thing
it can do is add.

### What varies by country, ranked by how much it actually costs us

| Varies | Where it lives | If we get it wrong |
|---|---|---|
| Account names and numbering | the template | a rename. Cosmetic |
| Which tax accounts exist | the template | add an account, tag the role |
| Fiscal year start | a setting: month and day | a report covers the wrong twelve months until changed |
| Rounding rule | a setting, with a stated default | pennies, in one direction, findably |
| **Tax rules** | **not the chart at all** | **wrong numbers on a legal document** |

⚠️ **THE CHART IS THE EASY FIFTH OF INTERNATIONALISATION AND SHOULD NOT BE
MISTAKEN FOR THE WHOLE.** Eighty rows of data is not what makes ERPNext need a
regional override per country. Tax is: a rule keyed by *(what, to whom, from
where, to where, when)* returning zero or more `{account, rate, basis}` lines.
A `vat_rate` column on a product does not survive the second country, and no
amount of chart-of-accounts work substitutes for getting that shape right.

### Deliberately out of scope, and stated so it is a choice

- **Multi-currency.** D117 gives a workspace one currency and re-labels rather
  than converts, so there is no `exchange` role and no FX gain-or-loss account. A
  business invoicing in three currencies is not this product yet, and half of one
  would be worse than none.
- **Consolidation across workspaces.** One workspace, one set of books.
- **Statutory statement formats.** The five roots and the roles are enough for a
  trial balance, a plain P&L and a plain balance sheet. A statement laid out the
  way a particular country's filing requires is a report mapping, and it is a
  later thing that needs no schema change — a node can carry a `statement` hint
  when somebody actually needs one filed.

---

## Part III — the plan

Four stages. The order is chosen so each is useful alone and the risky primitive
is proven first with the smallest possible consumer.

### Stage 1 — `hears`: the cross-app subscription

The one new engine primitive.

- `AppSpec.hears: Record<eventName, handler>`; `eventsOf` becomes the
  deployment's union so a rule may listen for another app's event.
- The runtime delivers after the emitting operation commits, in the same request,
  with the emitting app's answer as the payload. A handler that throws must not
  roll back the operation that raised the event — the accounting entry is a
  consequence, not a precondition — so a failed post is a recorded problem, not a
  refused receipt.
- **Guards, both mutation-tested:** an app that imports another app (B1); a
  `hears` for an event no installed app raises; and an event nothing hears listed
  rather than refused, since silence is legitimate.
- **Proof it works:** the proving ground gains a second app that hears the first.
  No product code moves in this stage.

### Stage 2 — OneParty

- `party` with roles, addresses, contacts, tax identifiers.
- OneInventory's `supplier` migrates onto it, which is the first real test of B1:
  OneInventory must reference a party **without importing OneParty**. Whatever
  makes that work — a kernel-level party contract, or a declared cross-app ref —
  is the stage's actual design question and should be settled here, in public,
  rather than assumed.

### Stage 3 — The document rail

- `document` with `direction`, five stages, lines, and `allocation`.
- Numbering series with allocation on issue; issued documents immutable; credit
  notes as the correction path.
- Payment state derived, with a guard: **no stored payment-status column
  anywhere**, which is `money.test.mjs`'s "derived, never accumulated" one domain
  over.
- OneInventory's `buying` migrates onto it. Carriage from D118 generalises.

### Stage 4 — OneBook

- The chart of accounts — see the full design above. Sixteen roles, five roots,
  a universal template plus whatever country templates are actually verified, and
  `account.topUp` so a thin early template is not a dead end.
- Posting rules as workspace data, over the `hears` seam from stage 1, naming
  **roles** rather than accounts.
- Journal, with balances derived. Trial balance, P&L, balance sheet as reports.
- Tax rules as lookups — the hard half, and the one the chart does not touch.

Only now, when there are events worth posting and documents worth posting them
from.

---

## What has to be decided before stage 1

Three questions this plan did not settle. **Two are now answered**, and the
answers are kept here rather than deleted, because a question that turns out to
have an obvious answer reads as a question nobody asked.

1. ~~**Is OneBook installable, or an always-present engine service?**~~
   **ANSWERED — D121: neither.** It is a product like the others: one membership
   buys every product, so OneBook is included, on by default, and switchable off
   by a workspace that does not want a chart of accounts. The worry behind the
   question — a workshop counting stock being handed accounting it never asked
   for — is answered by the switch, not by the price.

2. **Does OneInventory's `buying` really migrate, or does the rail start clean?**
   Migrating is correct and is a schema change on a shipped module with live
   data. Starting clean is cheaper and leaves two purchase-order concepts in one
   deployment, which is the duplication this whole plan exists to prevent.

3. ~~**How does an app reference a party without importing OneParty?**~~
   **ANSWERED — D120: three declarations and no imports.** `shared: true` on the
   owning collection, `borrows: ["party"]` on the borrower, and `hears` for the
   event. All three are resolved by the deployment rather than by either app, so
   neither product's source ever names the other. `apps.test.mjs` refuses the
   import — by package name and by a relative path out of the tree —
   `shadow.test.mjs` refuses a second app declaring the table, and eleven
   business concepts are reserved to the product that owns them so the collision
   is caught on the FIRST app rather than the second.

   **And D122 says what crosses: the row's `name`, and nothing else.** A borrowed
   hop resolves for the field literally called `name` — which is what a picker and
   a label need — and `borrowed_beyond_the_name` refuses every other path through
   it. The rule is the literal field name because the borrower composes with the
   owner nowhere in the room, so `refuseCollection` makes the owner's `names`
   answer that same literal and the two ends agree without importing each other.
   The join reads two columns and the statement says so; a borrowed hop demands
   no permission, because a name already on the order in front of somebody is not
   the record behind it.

---

## What this plan is not

It is not a plan to reach feature parity with ERPNext. ERPNext Stock alone is 82
doctypes and 51 reports; `accounts` is 195 doctypes. The audit above exists to
make our omissions deliberate, and the largest deliberate omission is the one
D119 already names: **no back-dating, therefore no reposting**, in stock and in
accounts alike.

⚠️ **AND THIS DOCUMENT IS A `plan`, WHICH MEANS IT IS MEANT TO BE DELETED.** When
the four stages ship, what survives is the code, the guards, the decisions they
add and the stage rows — and this goes to `git log` with the rest of the working
out. A finished plan left in the tree is a second, older answer to every question
the code then answers itself.
