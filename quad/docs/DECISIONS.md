# Decisions

kind: decisions

**Append-only. A decision is never edited in place — it is superseded by a later
one that says so.**

⚠️ **EVERY ENTRY CARRIES WHAT IT FORBIDS, AND THAT IS THE FIELD THAT MATTERS.** A
decision recorded as a preference ("we use X") is one the next session weighs
against a fresh idea and sometimes loses. A decision recorded as a prohibition
("therefore never Y") is one that can be *checked* — by a guard, by a reviewer,
by a reader with no memory of the argument.

Cite them by number in code comments and in the guard registry: `D7`.

---

## D1 — The tenant is primary; an app is a capability switched on for it

A tenant is a business. It holds one or more apps. `tenant_app` is the enablement
row.

**Why.** A customer using two products had two workspaces, two addresses, two
rosters and two bills. That is a worse product, and it is the reason the previous
attempt needed a hub to paper over the seam. One tenancy, many apps, one place is
the thing being built — the infrastructure savings follow from it and are not the
reason for it.

**Therefore never:** a table keyed `(tenant, app)` where `app` decides identity;
a tenant id that only means something inside one product; an address that names a
product rather than a tenant.

---

## D2 — The name is Quad; packages are `@quad/*`

**Why.** The courtyard a building's rooms open onto, and four, for 4° Labs. Four
letters. Chosen 2026-08-14 over Cardinal, Atrium, Trellis.

**Therefore never:** a variable, type or field named `quad` inside `@quad/*` —
the framework's own name is reserved vocabulary there, exactly as door labels are,
so the name cannot become ambiguous inside the thing it names.

---

## D3 — One worker on the request path; heavy work splits over RPC service bindings

The hot path is one worker. `ai` and `notify` are separate workers reached
through **service bindings with RPC** (`WorkerEntrypoint`), not fetch-over-HTTP.

**Why.** The limit that bites a manifest-driven monolith first is **startup CPU**
— top-level module evaluation on every cold start — not the compressed script
size, which SPAs do not count against because they ship as assets. So the reason
to split is to keep big, rarely-hot code off the cold-start path, and the reason
to use RPC is that types survive the seam; over HTTP a wrong payload becomes a
production error where it was a compile error.

**Therefore never:** a split justified by "separation of concerns" alone — module
boundaries and the boundary guard already give that, at compile time; a
service-to-service call made with `fetch` where a service binding exists.

---

## D4 — Composition is lazy: a request composes the app it is for, and no other

**Why.** Follows directly from D3's finding. Composing every registered app's
manifest at module scope makes cold start grow linearly with the catalogue, and
the catalogue is meant to grow.

**Therefore never:** a module-scope call that walks every app; a registry
imported eagerly for its side effects.

---

## D5 — Storage is placed, not owned. The directory carries every cross-tenant fact

A tenant has a **placement** — a shard set. Records live there. The global
directory holds identity, routing, money, and every column a cross-tenant
question filters on.

**Why.** Per-app databases cannot be balanced and cannot be moved. Placement lets
a hot product and a quiet one share a shard, and lets a tenant be moved off a hot
one. The directory rule is the price: once tenants are spread, the operator
console, the dunning sweep, analytics and purge cannot fan out over N shards to
ask a question, so the answer has to be somewhere singular.

**Therefore never:** a cross-tenant query that fans out over shards; a filterable
operator or sweep column that exists only in a shard; a tenant placed on a shard
whose schema does not cover that tenant's apps.

---

## D6 — Jurisdiction is a workspace fact, derived from the business's country

A tenant declares its country at signup. That maps to a placement. Personal
nationality is never asked and never used.

**Why.** GDPR applies based on where a person *is* and whether you offer services
into the EU — not on nationality, which is also self-reported and unverifiable.
And residency is not a GDPR requirement at all: lawful basis, a ROPA,
sub-processor agreements, deletion and export are. Residency is a **promise we
sell**, which makes it a business fact about the tenant.

**Therefore never:** a field asking a person their nationality or citizenship; a
residency claim that the sub-processor chain does not actually keep — if an EU
placement's AI provider processes outside the EU, the feature is refused with a
stated reason or the transfer is disclosed. Never both promised and breached.

---

## D7 — HeroUI v3 is the component layer, and its components are not restyled

**Why.** Consistency that is *enforced* beats consistency that is *maintained*.
The library ships the states, the accessibility and the dark mode; theming
through tokens means a tenant's whitelabel changes every component at once, with
no screen knowing. React Aria underneath keeps the accessibility floor the
previous attempt had with Radix.

**Therefore never:** a `className` that restyles a HeroUI component in
`@quad/web`; a hand-built control HeroUI already ships; a colour literal outside
the theme tokens. Build sequence is always: decide → ask the HeroUI MCP what fits
→ build with it.

---

## D8 — Declarations are typed object literals; not decorators, not a custom format

**Why.** Guards *walk* the declarations to prove things about them — that every
write says what to record, that every entitlement is named by a gate, that every
notification's permission is one a role can hold. A decorator runs at definition
time and leaves nothing to enumerate; a custom file format costs a parser, a
language server and syntax highlighting, and loses autocomplete, refactoring and
go-to-definition. The literal *is* the decorator, and it is inspectable.

**Therefore never:** a TS decorator on a declaration; a bespoke file extension; a
declaration assembled at runtime from something a script cannot read statically.

---

## D9 — Libraries encode decisions; we write invariants

Take the library where the world has already settled the answer (`Intl`, MIME,
crypto primitives, auth ceremonies). Write it where the rule is ours (the gate
order, entitlement resolution, the notification audience, credit reserves).

**Why.** No library enforces our invariants, so adopting one for them means
writing them anyway on top of it — strictly more code, plus a dependency between
us and the behaviour. And reinventing a solved, high-detail problem is waste that
we then have to test ourselves.

**Therefore never:** a hand-written date, number or currency formatter; a generic
RBAC or permissions package standing in for the entitlement walk; bitwise
permission masks (a 64-key ceiling and audit rows nobody can read).

---

## D10 — Five primary destinations, maximum

Mobile is a bottom navigation island of at most five. Desktop is a sidebar with
the same five primary. Depth happens *inside* a destination, as sub-areas.

**Why.** Five is where a bottom bar stops being tappable and starts being a menu.
Beyond it, people stop navigating and start hunting.

**Therefore never:** a sixth bottom-nav destination; a nav item added because a
feature had nowhere else to go — that is a sign the feature belongs inside an
existing destination.

---

## D11 — The vault is encrypted rows in the shard, keyed by a destroyable salt

Vault facts are D1 rows, envelope-encrypted. The data key is derived from a
deployment root secret plus a **per-subject salt**; destroying the salt
crypto-shreds that person's facts.

**Why.** The alternatives lose more than they gain. A Durable Object per subject
gives strong isolation and an EU jurisdiction constraint — but erasure and export
must be *provable*, and both are derived from schema declarations that only work
over queryable rows; enumerating DOs to prove a person is gone is exactly the
kind of claim that cannot be checked. Encryption gives the confidentiality the DO
was wanted for, and the salt gives a destruction that is verifiable in one row.

**Therefore never:** a vault fact stored in an app's own table (the shadow guard
refuses it); a plaintext vault column; an erasure that deletes rows without
destroying the salt; a vault field readable without a recorded grant.

---

## D12 — Every cross-cutting concern is a field on a declaration, never a call site

If a new concern cannot be expressed as a field on a manifest, collection,
operation or screen, that is a design problem to solve — not a call to add inside
handlers.

**Why.** This is the property the whole framework exists to have. The moment a
concern is something an app *calls*, it becomes a concern an app can *forget*,
and a forgotten one is invisible: no error, no test failure, just a capability
that silently does not apply.

**Therefore never:** a handler that raises its own notification, writes its own
audit entry, checks its own entitlement, or meters its own credits.
