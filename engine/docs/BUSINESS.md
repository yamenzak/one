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

### Stage 4 — OneBooks

- Chart of accounts, seeded from a country template and editable.
- Posting rules as workspace data, over the `hears` seam from stage 1.
- Journal, with balances derived. Trial balance, P&L, balance sheet as reports.
- Tax rules as lookups.

Only now, when there are events worth posting and documents worth posting them
from.

---

## What has to be decided before stage 1

Three questions this plan does not settle, each of which changes the shape:

1. **Is OneBooks installable, or an always-present engine service?** The
   recommendation is installable — a workshop counting stock should not be handed
   a chart of accounts — but that makes "what is my inventory worth" and "what is
   in my accounts" two different answers in one workspace, and somebody will ask
   why.

2. **Does OneInventory's `buying` really migrate, or does the rail start clean?**
   Migrating is correct and is a schema change on a shipped module with live
   data. Starting clean is cheaper and leaves two purchase-order concepts in one
   deployment, which is the duplication this whole plan exists to prevent.

3. **How does an app reference a party without importing OneParty?** Stage 2
   cannot start until this has an answer, and the answer is probably a kernel
   contract — the same way `field.money` is the kernel's and the currency is the
   workspace's.

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
