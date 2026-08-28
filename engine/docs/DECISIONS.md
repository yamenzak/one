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
attempt needed a switcher to paper over the seam. One tenancy, many apps, one place is
the thing being built — the infrastructure savings follow from it and are not the
reason for it.

**Therefore never:** a table keyed `(tenant, app)` where `app` decides identity;
a tenant id that only means something inside one product; an address that names a
product rather than a tenant.

---

## D2 — The framework is OneEngine; the deployment is One; packages are `@engine/*`

**Why.** Two names for two audiences. **One** is what a customer types — the
deployment, its doors, its address. **OneEngine** is what a contributor imports —
the framework the deployment is built out of. A single name would have to mean
both, and the day there is a second deployment the split is what makes that
cheap. Named 2026-08-14 (as Quad), renamed 2026-08-16 once `one/` was the
deployment and the framework needed a name of its own.

**Therefore never:** a variable, type or field named `engine` inside `@engine/*` —
the framework's own name is reserved vocabulary there, exactly as door labels are.
It is the word most at risk: `@engine/design` alone holds a scene engine, a frame
engine and a rendered engine, so a bare `engine` would name whichever one its
author happened to be writing and the name would stop naming the thing.

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
`@engine/design`; a hand-built control HeroUI already ships; a colour literal outside
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

The island is COMPACT: every destination is its icon, and the one somebody is on
expands to say its name. Five icon-and-label columns do not fit a phone — equal
columns squeeze every label to a fifth of the screen, so a two-word destination
truncates and a five-item nav becomes five abbreviations. The label that is
showing is the only one anybody needs; nobody reads a nav to find out where they
are not.

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

---

## D13 — The agent surface is derived: every operation is an MCP tool unless it says why not

`/mcp` answers on a tenant's own address, stateless, and its catalogue is a
projection of the operations the caller could already reach over `/api/*` —
`tool: { why }` is the stated opt-out, and an opted-out operation is neither
listed nor callable there, answering exactly as a tool that never existed.
A tool call enters `performOperation`, the same path the HTTP door ends in, so
the replay, all seven gates and the audit apply to agents identically. Decided
2026-08-14, after MCP dropped its session handshake and became a stateless
protocol a manifest can serve without a Durable Object.

**Why.** A hand-registered tool list drifts three ways at once: a renamed
operation keeps its old tool, a new operation ships without one, and an
operation that opted out for a stated reason is re-added by somebody who cannot
see the reason. And an agent path with its own gate wiring is a second place a
concern can be forgotten — invisibly, for agents only, with every suite green
(D12). Deriving both from the declaration makes all five states unreachable.

**Therefore never:** a tool registered by hand; an MCP handler that runs an
operation or applies a gate itself rather than through `performOperation`; a
distinct refusal for an opted-out tool (it confirms the name); a tool listed
that the caller's permissions cannot call; an agent identity resolved anywhere
but the deployment's own `identify` seam. Remote-client OAuth (pre-registered
clients, CIMD) is deliberately absent until a real client needs it — the lanes
are the session cookie (a browser agent acting as the signed-in member) and a
bearer token minted at the account centre, shown once, stored hashed, expiring
in ninety days, revocable now because it is a row.

---

## D14 — Provider AI calls go through the unified AI binding and its gateway, never direct fetch

When One's AI lane is wired to real providers, every call — Workers AI, Gemini,
any third party — goes through the platform `AI` binding with a gateway
(`env.AI.run(model, params, { gateway: { id } })`). Decided 2026-08-14, when
Cloudflare unified Workers AI and AI Gateway behind one binding with per-request
logging, token counts and cost attribution.

**Why.** The COST half of metering — what we pay a provider — previously came
from parsing public pricing pages, a mechanism that has already priced a model
wrong once (flash-tier rates bound to a Pro model, a reserve that under-counted
and a platform that ate the difference silently on every call). The gateway
reports actual token counts and cost per request from the same place the call
was made. The REVENUE half — the reserve as a ceiling, markup, tenant credits —
stays ours; it is a product fact no gateway can know.

**Therefore never:** a direct `fetch` to a provider's API from the AI lane; a
model price parsed from a pricing page where the gateway can report the cost of
the actual call; the reserve-and-settle arithmetic delegated to the gateway.

---

## D15 — One membership, two authorities: a platform role for the workspace, a role per app inside it

A membership row carries one PLATFORM role — `owner`, `manager`, `staff`,
`customer`, identical keys in every product, not editable, never an app's to
declare — and one APP role per enabled app, in that app's own vocabulary,
`founding` naming the one a workspace's creator gets. `permissionsFor(member,
appId)` is the one resolver every reader uses — the gate resolves the set for
the app the operation belongs to, the audience test for the app that raised the
event, the tool catalogue per app it lists. Every assignment is bounded per
authority: the granter's platform keys bound the platform role, their keys IN
EACH APP bound that app's role. Custom roles compose ONE app's declared keys;
the platform's offices are not composable, and an app that declares or bundles
a platform key does not boot. Decided 2026-08-14, with the tenant centre
as the driving surface.

**Why.** A single flat role cannot serve two products: "trainer" names one
product's keys and names nothing in the next app, and the failure is silent 403s in the
second product for everybody — the deployment's identity seam was resolving
roles against `located.apps[0]`, which is exactly that bug. Per-app
MEMBERSHIPS are the other wrong answer: two rosters, two invitations, two
seats for one person. And bounding only one authority is a two-step
escalation with a shorter first step — a previous platform shipped the
bounding function with no caller at all.

**Therefore never:** a flat permission set on a caller; a role registry
resolved against whichever app is first; an app declaring `member:*`,
`tenant:*` or `billing:*` as its own; a seat ceiling counted on app roles or
charged to a `customer`; a stranding check asked of anything but the platform
authority; a second implementation of "what can this person do".

---

## D16 — A package is a role with a clock: timed grants on the membership, resolved by the same resolver

What a tenant sells its own customers is expressed as GRANTS on the buyer's
membership row — `{ key, app?, until?, source }` — applied by a purchase,
extended by a renewal (never stacked), and dropped by the one resolver the
moment `until` passes. `source` ties a package's grants together so they can be
found, extended and removed as one thing. Bare grants (no clock) remain a
person's deliberate exception. Decided 2026-08-14; the package rail itself is
stage 13.

**Why.** The alternative is double feature-flagging — package flags resolved
beside role permissions, two systems answering "may they?" that drift until a
screen promises what a route refuses. A grant that expires in the resolver
needs no sweep, no lapse flag and no per-app enforcement: an expired grant is
simply not held, everywhere, at the next request.

**Therefore never:** a second capability system beside the resolver; a lapse
implemented as a job that edits roles; a renewal that stacks time onto an
unexpired grant twice; a package that grants a key its app never declared.

---

## D17 — The tenant centre is one bundle for every product, and declarations reach the page as data

A workspace's own address opens the centre: five fixed areas (Home, People,
Money, Settings, Data & Trust) and every enabled product's declared screens
inside the same shell, under `/<app>/…`, with the switcher in the crown. The
page holds no manifest — `centre.view` sends the declarative slices (screens,
settings, notification types, documents, processors, the caller's resolved
permissions per app) and the page draws exactly what the gate would allow.
A product's own screen content is registered through `mountScreen`, keyed by
app and declared route; an unregistered screen renders an honest notice.
Decided 2026-08-14, with stage 14.

**Why.** A bundle per product is the previous platform's four SPAs wearing one
URL — every shared surface fixed N times, every divergence invisible. And a
page that imported a manifest would ship every product's declarations to every
tenant, grow with the catalogue, and hold a second copy of what the deployment
already knows. Data over the wire keeps one bundle honest: the same
`permissionsFor` sets gate the route and shape the page.

**Therefore never:** an app-specific SPA; a page importing `@engine/<app>`; a
people, billing, settings, consent or notification screen inside a product; a
screen drawn in an app's frame except through `mountScreen`; a centre area
rendered for somebody whose platform keys cannot open it.

---

## D18 — The operator stands outside every workspace, and the console is a door rather than a role

Operator operations are personal operations restricted to the `admin.` door,
each asking one further question the deployment answers: is this address an
operator? Who counts is injected configuration — `OPERATOR_EMAILS`, with a
development fallback and nobody at all when a live deployment leaves it
unset. Maintenance is the host gate one level up: `readonly` refuses writes
and serves reads, `full` withholds both, and it is asked once inside
`performOperation` so both doors obey it — while the operator door, `/health`
and the personal lane are never reached by that check, which is the exemption
list by construction. The switch fails open. Decided 2026-08-14, with stage 15.

**Why.** A role cannot express "operator": roles are held inside workspaces
and the operator is outside all of them, so an operator role would have to
exist in every workspace and be granted by somebody in it. And maintenance
asked at the HTTP route is the D12 failure in its purest form — the agent
door serves right through a closed deployment, invisibly, with every suite
green.

**Therefore never:** an operator role in a roster; an operator operation on a
tenant's door; a console that decides for itself who may open it; maintenance
enforced anywhere but the one operation path; a maintenance mode that blocks
signing out, leaving, or the operator door itself; a read of the switch that
fails closed.

---

## D19 — An AI action declares a lane and a letterhead; the operator binds the model, and words narrow downward

An operation that generates says `ai: { lane, prompt, variables, maxOutput,
brandable? }` — the same shape every other cross-cutting concern has (D12). It
never names a model: the operator binds a row from that lane's enabled
catalogue, and the lane's election answers when nobody has, including when a
binding no longer resolves. The prompt is a letterhead whose variables are
declared, refused at composition if it names one it does not offer. Wording
narrows in one direction — app → operator → tenant — and a tenant may reword
only actions the app marked `brandable`, asked by the kernel at the write.
One resolver (`running`) answers for the run and for both screens. Decided
2026-08-14, with stage 16.

**Why.** A model id in a manifest is a deployment decision shipped through a
product release: unchangeable without one, wrong the day the provider retires
the row, and separately wrong in every app — none of which fails anything,
because a stale-but-live model answers perfectly well. And an unbounded prompt
edit is the notification-letterhead bug with the volume up: a template naming
`{coach}` renders a brace to a person, who reports it; a PROMPT naming it
sends the brace into a model's instructions, and the answer is subtly wrong
rather than visibly broken.

**Therefore never:** a model id in an app's source; a prompt stored without
asking the kernel; a tenant rewording an action the app did not mark
brandable; a generating action with no output ceiling (the reserve is a
ceiling on revenue); a run that resolves a different model or different words
than the screens report; a read that generates.

## D20 — OneSpace is one surface presented over the product, reachable from every door, and it is a route

Who you are, everywhere you belong, and — for the few who hold it — the
deployment itself are ONE surface, opened over whatever somebody was doing and
dismissed back onto it. It is not an app: no nav bar, no tabs, no shell of its
own. Its screens are ADDRESSES under a `/space` prefix reserved on every door, so
a person can link to one, land on one and reload one; `where.ts` parses the
location and decides what is above each screen, and leaving is never a choice a
screen's author makes. A workspace is managed at its OWN origin — opening one
from anywhere else is a full page load that arrives with OneSpace already open on
it. A workspace's own address is the PRODUCT and nothing else. Decided
2026-08-15.

**Why.** The first build gave the tenant centre five permanent tabs (people,
money, settings, trust, a cross-app home) and the operator console five more,
each on its own hostname with its own shell — so the thing somebody signed in to
use sat one level below four surfaces they visit twice a year, their account
lived at a third address, and three shells drifted apart the week they existed.
None of that fails a test: every screen renders, every call answers, and the
product is chaos. Those five are things you go and do once and then leave, which
is a presented surface, not a bar that never goes away.

**Therefore never:** a nav bar over the account, the workspace or the console; a
second shell for the operator; a OneSpace screen held in component state rather than
at an address; a workspace's records answered from another door; a product path
under `/space`; a `Title` under a `PageCrown` that repeats it; a dismiss control on
a door with nothing underneath.

---

## D21 — A workspace is personal or commercial, and that is what it IS rather than what it bought

Every workspace carries a `kind`. A PERSONAL one is somebody's — it shares a
database with others, it wears our mark, and it has no brand. A COMMERCIAL one is
a business: it declares a legal name, it may put its own identity on every app
under it, and its records may be placed on a shard of its own. The transition
costs a one-time payment or an operator's allowance, it demands the legal name
before it demands the money, and it is ONE WAY. Decided 2026-08-16.

**Why.** Pricing, legal exposure, data isolation and branding are four questions
with one answer, and it is not "which tier". A plan is what a workspace bought
this month and it moves both ways with a card; whether a business is trading
under its own name does not lapse when an invoice fails. Modelling it as an
entitlement would also make it purchasable — and a personal workspace that could
buy branding is one that installs on somebody's phone under a name nobody is
accountable for.

The one-way rule is the part that would otherwise be argued down. Rolling back
means withdrawing a brand a business's own customers have seen, moving records
off a shard they were promised, and un-selling a capability that was paid for
once. `mayBecome` is asked at the write even though the statement could only ever
go one way, because "it can only write commercial" is exactly the reasoning that
would let somebody add the other direction beside it.

The gate gained a position of its own — standing → permission → **kind** → proof
→ entitlement — above entitlement because no plan a personal workspace can buy
unlocks a commercial-only capability, so an upgrade offer would send somebody to
a price list where nothing helps; and below permission because a refusal about
the workspace tells a stranger it exists.

**Therefore never:** `commercial` written by anything but the one transition; an
operation that reads `kind === "commercial"` at its own call site instead of
asking `mayBrand`/`mayIsolate`; a commercial-only capability sold as an
entitlement or refused with `payment_required`; a missing `kind` treated as a
pass at the gate; a workspace created commercial in a wizard; a branding row on a
personal workspace; a dedicated shard holding a second workspace; an allowance
stored as a decrementing counter rather than counted from the rows.

---

## D22 — Branding and the installable app belong to the workspace, never to one app inside it

One workspace, one identity: one theme, one logo, one icon, one installed tile,
carried across every app it has switched on. An app declares only which SURFACES
it has — a shell, email, documents — because only it knows whether it sends mail
at all. The manifest and the icon are served from the workspace's own origin with
`start_url` and `scope` at the root, and both answer with no session.
Decided 2026-08-16.

**Why.** `whitelabel` was a field on the app manifest with an entitlement of its
own, so a business running three of our products would have had three branding
switches, three places to change them, and two of them stale the week after the
first edit. It also put the answer to "may this business use its own logo" in
each product separately, which is a question about the workspace.

An icon per PRODUCT is the same mistake one level out: three tiles on a phone for
one place to work, and every app switch leaving the installed window. The tile is
DRAWN from a colour and a glyph by default — waiting for an upload pipeline would
mean every workspace installing as a browser default until somebody built one —
and a commercial workspace may upload its own over it. A personal one may not:
its tile is ours, because it is not trading under anybody's name.

⚠️ **AND A PUSH NOTIFICATION WEARS THE SAME TILE, WHICH IS WHY A SUBSCRIPTION IS
FILED UNDER A DOOR.** A service worker belongs to one origin and every workspace
here has its own, so the worker asks its own origin for `/icon.png` and gets
exactly that workspace's icon — uploaded or drawn — with nothing having to send a
picture. The alternative is an icon URL in the payload, which is a second answer
to "whose logo is this" and disagrees with the first the day somebody uploads a
new one. So `push_subscription` carries the workspace whose door it was made at,
and a note travels only on devices subscribed there or at ours.

⚠️ **AND AN APP MAY NOT DECLARE A BRAND SCREEN EITHER**, which is the half that
was got wrong within a day of writing this: the reference app grew a `/brand`
route of its own, and it was the same mistake one level up. Where a workspace's
identity is EDITED is as much a workspace question as what it contains. An app's
commercial-only screens are about the app's own capabilities — a list of what it
has published under that brand, not the brand.

**Therefore never:** a theme read from an app manifest; a brand screen in an app;
a brand row in a shard
(the sign-in page and the manifest are read before a workspace is located); a
surface a workspace can switch on that no app offers; an installable per product;
a manifest or icon behind a session; a personal workspace's tile left blank
rather than wearing ours; a push subscription reused across workspaces, or an
icon URL sent in a notification payload.

---

## D23 — A stranger joins a workspace as a `customer`, and only ever as a `customer`

There are two ways into a workspace today: founding it, or an invitation claimed
by signing in as the address it was sent to. Neither scales to a business's own
customers — nobody invites a hundred thousand consumers by hand, and a business
that has to type in each of its suppliers has a spreadsheet, not a product.

Self-service joining is a third way and the shape is fixed here before an app
asks for it, because every part of it that is decided in a hurry is decided
against somebody who is not in the room. Designed 2026-08-18, unbuilt: stage 49.

**The workspace opens the door; the platform never does, and it is shut.** A
per-app setting on the workspace, `closed` by default, in three states:

- `closed` — nobody joins. Invitations still work.
- `code` — a per-workspace secret carried in the link, rotatable and revocable.
  This is what a business puts on its website or sends to its suppliers. It names
  the workspace's willingness and no person, which is exactly what separates it
  from an invitation.
- `open` — anybody who can sign in. For a consumer product where the sign-up IS
  the product.

**The app names the role; the workspace cannot choose it.** `access.joining`,
beside `access.founding`. Three refusals at composition, and the third is the one
the whole design rests on:

1. a joining role that is not a declared app role;
2. a joining role whose platform role is anything but `customer` — a stranger
   admitted as `manager` is privilege escalation with a form on it;
3. **a joining role holding any permission that reads a `tenant`-scoped
   collection.**

The third works because `scopeOf` already filters a `subject`-scoped
collection's generated verbs by whoever is asking: a person's own records are
theirs by construction rather than by a handler remembering a `WHERE`. A
tenant-scoped collection is the whole workspace's, so a joining role holding a
key to one would show every stranger every other stranger's records — with
nothing failing anywhere, on a door the business opened on purpose. Seeing
somebody else's records stays what it is today: a different operation the app
declares, with a permission a customer does not hold.

**The door says which workspace.** `me.join` on the personal lane, needing a
session, resolving the tenant from the host exactly as `acceptanceScope` does. A
tenant id in a request body is a tenant id somebody can change.

**The ceiling is an entitlement, never a seat.** Customers cost no seat — that is
refused at composition already, because they are the product rather than the
staff — so hanging the ceiling there would make the two rules contradict. It is a
`customers` number the plan sells, checked at the door, refused with a sentence
that names the upgrade. Beside it, the same per-address and per-IP ceiling the
sign-in code carries: an open door with no rate ceiling is a way to manufacture
accounts.

**Nothing about identity, legal or leaving changes, and that is the point.** One
account across every workspace; the terms and the privacy notice bind the person
and are asked at their first sign-in whatever door they arrive at; the
data-processing agreement binds the business and `owedBy` asks it only of
somebody who can bind it, so a customer is never shown a contract for a company
they do not run. `me.leave`, `me.export` and `me.forget` already work for them.
Joining is one new verb, not a second kind of person.

**Therefore never:** a join that takes its tenant from the body; a joining role
that is not `customer`, or that can read a tenant-scoped collection; a workspace
joinable by default; a ceiling enforced through seats; a join code that
identifies a person, which is an invitation and already exists; a joined customer
who cannot leave without asking the business.

---

## D24 — A model's PRICE is discovered nightly; whether it is sold, and at what margin, never is

Which models exist and what a provider charges are facts about the world that
change without asking us, so `models.sync` reads Cloudflare's own catalogue every
day and writes ids, tasks, modalities and rates. Which of them this deployment
SELLS, which one a lane elects, and what margin each carries are decisions
somebody made — and the sync's `UPDATE` does not name those three columns.

**The boundary is the column list, not a comment.** A nightly job that overwrote
a decision would undo an operator silently, on a schedule, for ever, and the
symptom is a model they switched off answering again the next morning.

**A model that disappears is RETIRED, never deleted.** It is still bound to
actions and still named on runs that already happened; deleting the row breaks
the binding and orphans the history. Retired, it stops being offered and
`boundModel` degrades to the lane's election — which is exactly what "nobody has
chosen" already means.

**And an empty answer is refused outright.** A catalogue API answering `200 []` —
wrong token, changed path, a filter matching nothing — would retire every model
this deployment has, in one pass, at 03:00. `refuseDiscovered` also refuses a
catalogue in which nothing is priced, because a shape change that stops parsing
lands every row at zero cost and every call after that settles free.

**Therefore never:** a sync that writes `enabled`, `is_default` or `multiplier`;
a delete where a retirement belongs; a partial catalogue applied; a rate table
maintained by hand beside one that is synced.

---

## D25 — A workspace picks its own model, because it pays for it — and that is only safe above cost

The model binding was the operator's alone, on the argument that a workspace
choosing would be a workspace choosing what WE pay. That stopped being true when
every run began settling against that workspace's own wallet at the row's own
multiplier. They are choosing what THEY pay, and the whole model list is the
product: cheap and fast, or slow and clever, on their credits.

**The condition is a floor under the margin.** A reserve is a ceiling on revenue
— the charge can come in under an estimate and never over it — so a row at one
times cost breaks even at best, and a workspace is free to choose it as often as
it likes. `MIN_MULTIPLIER` is checked at the write and reported by
`refuseCatalogue`; a rule that is drawn and not enforced is a rule with a screen.

**The price travels and the margin does not.** `priceFor` applies the multiplier
and answers one number. A screen handed both the cost and the multiplier can
compute the margin, and one that renders both by accident publishes it.

**The operator's binding becomes the default rather than the ceiling.** Choosing
nothing is the ordinary case; it resolves to whatever the deployment picked.

**Therefore never:** a model id from a request body honoured without checking the
lane offers it; a row sold at or below cost; a workspace-facing payload carrying
`input`/`output` before the multiplier, or carrying the multiplier at all.

---

## D26 — A workspace ADDS to our instructions; it never replaces them, and it is never sent the base

The tenant's wording used to substitute for ours. A substitution has to be seeded
with the current text to be editable at all — so every prompt the deployment had
was shipped to the browser of anybody who could open the screen. An addendum
needs no seed: the box starts empty, what is typed is appended, and the
instructions above it never leave the worker.

**Ours first, theirs last, and the order is the feature.** A model follows the
later instruction when two conflict, so a workspace asking for a shorter answer
gets one. Put first, an addendum would be silently overridden and the setting
would save and change nothing.

**Hidden is not secret, and saying otherwise would be the lie.** A model can be
asked to repeat its own instructions and no arrangement of prompts prevents that.
What this stops is the base being PUBLISHED — read out of a network tab by
anybody with the screen open. A prompt that must not be known to a customer is
not a prompt.

**Therefore never:** an operation outside the operator's door answering with a
resolved prompt; a tenant addendum that replaces rather than appends; an
addendum on an action the app did not mark `brandable`.

---

## D27 — The charge is built on what the call cost, and something outside our arithmetic checks it

Every number in the metering chain is ours — the estimate, the rate table, the
multiplier, the settle — and all four are derived from each other, so they would
go on agreeing perfectly through a mistake they share. Cloudflare bills us from
its own figures. That makes the gateway's cost the one independent authority on
whether a run was sold above cost, and `ai-costs` is the job that asks it.

**The cost is in the LOG, not the response.** There is no `cf-aig-cost` header;
what comes back is a log id. So a run settles from the usage the provider
reported and is TRUED UP against the gateway's own figure minutes later. The
true-up only ever refunds — allowing it to charge more would re-open a settled
call and move a balance for work somebody finished with hours ago.

**Which is why the settle errs high on reasoning tokens.** Providers report them
within `completion_tokens` or beside it and the payload is identical either way.
Summing is safe because the reserve caps it and the true-up corrects it; reading
only the plain figure is a permanent loss on every call to every reasoning model.

**And a workspace sold under cost FAILS the job.** A green run with the bad news
inside its detail is the shape every guard in this tree exists against.

**The tag is what makes any of it answerable.** `cf-aig-metadata` carries the
workspace, the product and the action, and it is attached in the one place a
provider is constructed — so it cannot be forgotten. Without it the gateway's
billing is one number for the deployment and comparable to nothing.

**Therefore never:** settling from a rate table where a real cost is available; a
true-up that charges; a call that goes out untagged; a margin check built from
our own numbers on both sides.

---

## D28 — A charge is milli-credits; the balance is whole ones, and the remainder carries

A credit is a cent and a small classification costs a fraction of one. Rounding
each call up is a several-hundred-fold overcharge that also makes every call,
trivial or enormous, read as "1 credit" on a statement — which breaks the price a
workspace was shown before choosing a model. Rounding down makes every cheap call
free while the meter reports perfect health.

**So whole credits come off the balance and the remainder is carried**, drawn the
moment it fills. This is the pattern the storage meter already had; one carry
column serves both, because two would each sit under a whole credit indefinitely
and a workspace running both would be charged for neither. WHAT it was spent on
is the `ai_run` row's job.

**And that row holds what it COST, never what was said.** No prompt, no output. A
generation log carrying both is a permanent record of everything every workspace
has ever typed, read by nothing and deleted by nobody — a liability the moment
anybody copies the database. A failed run is recorded too, charged nothing: a
failure with no row is a button that did nothing and left no trace.

**Therefore never:** a per-call `Math.ceil` onto the balance; a second carry
column; a prompt, an output or any input text on a spend row; a successful run
with no row behind it.

---

## D29 — A collection says which fields are findable, and everything else follows

Retrieval written per app is a scope filter written per app, and one of them will
be written wrong — with no error, because a wrong filter returns MORE results
rather than fewer. So `searchable: ["title", "body"]` on a `CollectionSpec` is the
whole declaration, and the ledger, the index pass, the removal on delete, the
removal on erasure and the `<collection>.search` operation are all derived from
it.

**It names fields rather than saying `true`, because indexing is a disclosure.**
The text leaves this database for a service that chunks and embeds it, and a
chunk cannot be un-said. What leaves is therefore listed one field at a time, in
review — and three declarations are refused outright: a field that does not
exist, a field that is not prose, and a **vault-backed** field. That last is the
sharp one: a special category lives encrypted behind a recorded grant and dies by
shredding one key (D11), and indexing it would copy the fact somewhere with no
consent, no record of who looked and nothing to shred — leaving the whole
protection intact and bypassed.

**The write marks and a pass carries, which is three problems solved by one
split.** A save never waits on a retrieval service, a save cannot fail because
one is down, and the account token — which is what the items API takes, the
credential that can rewrite this deployment's bindings — never reaches a tenant
request path. The cost is that the index is a pass behind, which is why a result
is a record ID read back out of the database rather than the indexed copy.

**`gone` is a state, not a delete.** The ledger row is the only handle on the
remote item, so dropping it when the record goes would leave a deleted record
findable, by meaning, with nothing anywhere pointing at it. `erase` marks; the
pass removes and forgets. And the marking lives INSIDE `erase` rather than at its
four call sites, because a caller that forgot it would report a clean erasure
over records that are still searchable.

**One instance per app, not per workspace**, and the boundary is the folder in
the item's key. Every account here gets a personal workspace, so per-workspace is
a design with a customer ceiling in it; the filter is composed in one function
that owns the boundary, exactly as every other row-level scope here is written by
the platform rather than by a handler.

**Therefore never:** an index built from a whole row; a vault-backed field in
`searchable`; a filter composed by a caller; a ledger row holding the indexed
text; an erasure that deletes the ledger row instead of marking it.

---

## D30 — A stream is the same metered run, and the charge rides the last token

A paragraph takes seconds to generate, and a spinner over those seconds reads as
something stuck. So a caller may ask for the words as they arrive — and the whole
design question is where the money goes, because the response is handed back
while the run is still going.

**The four bounds stay in one function with the non-streamed path.** A streaming
lane that kept its own copy of the hold, the release, the charge and the row is a
lane that produces perfect output, arriving beautifully, and bills nobody — which
nothing downstream can catch, because the settle caps the charge and a missing
settle is not an error. `generateStream` sits beside `generate` in the same file
and `scripts/metering.test.mjs` asks both the same questions.

**`stream_options: { include_usage: true }` is not optional.** Without it a
streamed response carries no usage at all, every streamed run settles at the
reserve, and nothing fails — the estimate quietly becomes the price for the
longest and dearest calls this platform makes. Safe for the customer, invisible
to us, and therefore never reported.

**A cancelled stream settles at the reserve and is left OPEN for the true-up.**
Somebody closing a tab leaves an unknown amount generated and no usage report,
and both obvious answers are wrong: charging nothing is free generation for
anybody who cancels, and counting the characters we saw is an estimate, which
under the settle cap can only ever lose money (D27). So it charges what was held,
keeps the log id, and the nightly check corrects it downward against the
gateway's own bill. Erring high on a number that is later replaced by the truth
costs the customer nothing.

**And it needed no second lane through the platform.** An operation may already
answer with a `Response` — a file read does — so the gates, the replay and the
audit apply unchanged. What the audit records is that the run was STARTED: whether
it finished is not known when the response is handed back, and a record claiming
otherwise would be stating something nobody checked.

**Therefore never:** a streaming path with its own reserve or its own settle; a
streamed call without `include_usage` or without the metadata tag; a settle
before the last part; a cancelled stream that charges nothing; a cached response
on a body somebody paid for.

---

## D31 — Two capabilities assessed and not adopted, with the trigger that reopens each

Both were read in full, weighed against what this tree already has, and left out.
Recording them as decisions rather than as silence is the point: an unwritten
"we looked at that" is indistinguishable from an oversight, and the next person
re-derives it.

**Vectorize is not exposed.** AI Search is Vectorize with the ingestion pipeline
attached and the storage included, so offering both is two answers to "how do I
find something" — the thing D29's single declaration exists to prevent. **The
trigger:** the first app that needs to supply its OWN vectors, or to search over
something that is not text — an image embedding, a recommendation vector, a
signal computed elsewhere. Neither is expressible through `searchable`, and
neither is a stretch of it.

⚠️ **The embedding model is NOT one of those triggers, and this paragraph said it
was.** AI Search takes `--embedding-model` per instance, so choosing one is a
setting rather than a reason to expose the layer underneath. A trigger that names
something already supported is a trigger somebody satisfies and then builds the
wrong thing.

**The Agents SDK is not adopted, and D30 is why.** It was under consideration for
streaming, and a plain Worker streams: a `ReadableStream` body and SSE is all a
streamed answer needs. What the SDK genuinely adds is durable multi-turn agent
sessions — recoverable execution, per-agent SQL, scheduled continuations,
human-in-the-loop approval — and what it costs is a Durable Object namespace
whose class name is load-bearing for ever, a second state model beside D1, and a
second routing model beside the doors. **The trigger:** the first product that
needs a conversation to survive a disconnect and resume where it stopped. Until
then it is weight for a capability nothing has asked for.

---

## D32 — The catalogue has two sources, and one is priced from a table we hold

Cloudflare's `/ai/models/search` answers for the models Cloudflare HOSTS. Gemini
reaches this deployment through the same gateway, over the same `/compat`
endpoint, and appears in none of it — so a deployment with a Google key set, a
gateway that would route the call and an operator who had done everything right
had no Gemini row to switch on. Nothing failed and nothing said why, because from
the catalogue's own side nothing was missing.

**So the sync reads Google too, and prices it from a table in `google.ts`.**
Google publishes what its models ARE — names, token limits, what each answers to
— and not what they cost; the rates are on a page written for people. That
asymmetry is the awkward fact the file is shaped around, and the shape is:
discover from the API, price from a table we hold, dated in public, and **store
nothing we cannot price**. A row at zero settles free on every call while the
provider's invoice arrives anyway — a reserve is a ceiling on revenue, so the
error only ever runs one way.

**A table we hold is the one number in the metering chain nobody else checks**,
which is the real cost of this decision. The answer is not a promise to keep it
current: `ai-costs` reads the gateway's own log nightly and reports any workspace
sold under cost, so a stale rate surfaces as a margin fault rather than as a
quiet loss. **The trigger to revisit:** a published rates API from Google, or a
second vendor needing the same treatment — two hand-held rate tables is a
pattern, and a pattern belongs in the store rather than in a file each.

⚠️ **And a partial answer is not applied.** Retiring is scoped by provider, so a
pass that reaches Cloudflare and not Google would retire every Gemini model this
deployment sells — at 03:00, over a rotated key. The job refuses instead, and
says which vendor did not answer.

---

## D33 — A lane is an address, and a model we do not sell is not a fault

Two failures on one screen, both of which made a working catalogue read as a
broken one.

**The lanes were empty because a display name is not a key.** The alias table is
hyphenated (`text-generation`) and Cloudflare publishes `Text Generation`, so the
lanes whose published name happened to be one hyphenated word resolved and the
rest silently did not — four of six empty on a catalogue holding models for all
six. `taskKey` normalises once and every reader goes through it, **including the
write**: `laneOf` and `inLane` can normalise on read, but `decideModel` clears a
lane's other defaults in SQL, where nothing can. That last one is why the column
itself has to be canonical, and it was found by mutating the parser rather than
by reading it.

**And the catalogue's own breadth was reported as sixty problems.** A provider
ships classifiers, translators, rerankers and detectors; this deployment offers
six lanes and none of them is those. Reported per row as `unknown_task` they were
fifty red cards stacked above the list, so the one entry that mattered — a lane
an app asks for with nothing enabled — was somewhere inside them. A model we do
not sell is a fact and takes one row; **switched ON into no lane it is a
contradiction**, and that is the fault.

**A lane is now a real address** (`/console/ai/models/<lane>`), because the
question somebody opens this screen with is always about a lane. Six rows that
descend answer "does anything answer text, and which one wins" at a glance; flat,
it was one scroll of sixty rows each carrying the vendor's marketing paragraph.
Held as component state a lane could not be linked to, landed on, or gone back
from — so the crown's arrow would leave the whole catalogue from inside one of
its lanes.

⚠️ **The docs were checked as a price source and they are not one.** Cloudflare
publishes a unified catalogue at `/ai/models/` — 228 models, 84 it hosts and 144
third-party — and each has a page carrying the context window, the request
format, the licence and a description. The **price** on a third-party page is a
LINK to the dashboard, not a number; the hosted models' pages carry real rates,
which is where the `price` property the sync already reads comes from. So the
docs improve discovery and answer nothing about what a partner model costs. The
rate table stands until a priced source exists.

⚠️ **And the same look found a live defect.** That unified catalogue names the
vendor in the ID — `google/gemini-3.7-flash`, `openai/gpt-5` — while the vendor
was being GUESSED from the model's spelling (`^gemini`), which tests a string
beginning `google/` and matches nothing. Every third-party row the API returns
would have resolved no provider and been dropped as unaddressable, silently, by
the refusal added one commit earlier. `addressIn` reads the segment, maps it to
the gateway's own slug — `google` is the company, `google-ai-studio` is the lane
— and moves it OUT of the id, because `/compat` is addressed `{provider}/{model}`
and it would otherwise be there twice. The useful consequence: Cloudflare's
`google/gemini-3.7-flash` and Google's own `gemini-3.7-flash` become ONE row
rather than two that disagree about what the same model costs.

---

## D34 — The prices are parsed from Google's own page, and a modality is a set

D32 held Gemini's rates in a table in `google.ts` and said the trigger to
revisit was a published rates API. There is no API, but there IS a published
page — `ai.google.dev/gemini-api/docs/pricing.md.txt`, in markdown, listing
every model and every rate. The table went stale in a week: it priced ten
families from the 2.5 generation while the page lists thirty, most of them
newer. So the price is a fact about the world again, which is the same argument
the model catalogue itself already rests on.

**The catalogue is the INTERSECTION of two reads.** The API says which models
this key can reach; the page says what each costs. A model in only the first
cannot be sold because we do not know what it charges us, and one in only the
second cannot be called. Intersecting them is also what retires a generation:
when Google drops a model from the API the sync stops seeing it and the retire
pass marks the row — so "which are retired" needs no separate source.

**Four ways a cell can be misread, and three of them cost money.**
- **Standard, not the cheapest tier on the page.** Every model quotes Standard,
  Batch, Flex and Priority; Batch is half price and is a different request we do
  not make. Metering an ordinary call at the batch rate under-charges by half.
- **The date.** "$0.75 through December 31, 2026. $1.50 starting January 1,
  2027" is one cell holding two rates and the day the first stops being true.
  Reading the first number sells at half cost from New Year's Day.
- **The modality, which is a SET.** "$0.30 (text / image / video) $1.00 (audio)"
  is one rate for three kinds of input and another for the fourth. Taking the
  largest quotes a text prompt at three times cost; taking the first quotes an
  image model's output at a twentieth of it. Asking which single modality a
  quote IS matched `image` inside "(text / image / video)" and silently lost
  nine of twenty-nine models.
- **The unit.** The column says "per 1M tokens" and one row under it says
  "$0.039 per image" anyway — a millionth of the real rate, which is the
  settles-for-nothing failure walking straight past the check built to catch it.
  A quote in another unit is REFUSED rather than converted: the conversion needs
  a token count per picture that nobody publishes.

**And the two ends of a model are in different modalities.** A voice model is
prompted in text and answers in audio; an image model is prompted in text and
answers in pictures. One modality across both rows priced a voice model's speech
at the rate for the sentence that asked for it.

⚠️ **An output row that could not be priced is a refusal, and it must not share
a branch with a model that HAS no output row.** The second is an embedder, which
genuinely has one rate; falling back to the input rate for the first priced
pictures at the rate for the prompt.

---

## D35 — A model answers more than one lane, and one task column could not say so

Every Gemini model from 2.0 on reads a picture in the same request as the
prompt. With one `task` per row they all sat in `text`, so the vision lane
reported "an app asks for this lane and no enabled model answers" while eight
models that could answer it were switched on one lane over — a screen describing
our schema rather than the world.

`ModelRow.also` is the lanes a row answers BESIDE its own, and it is **additive,
never a replacement**: `task` stays what the model is FOR — what it is elected to
do by default, and what its price is quoted against. It is reconciled as a column
rather than altered in, because a `CREATE TABLE IF NOT EXISTS` cannot add one to
a database that has already booted.

⚠️ **And it is not claimed for every model.** An embedder takes text and a voice
model speaks it; claiming vision for those would elect one to read a photograph.

---

## D36 — The latency budget: how many round trips a screen costs

The product was slow everywhere at once — seven seconds to open, a wait on every
navigation, and a save that looked like a page reload — on a runtime whose whole
selling point is that it is not. Nothing was broken. Four separate things were
each individually reasonable and the total was unusable, which is the shape a
performance fault takes when no single line is wrong.

**A cold isolate spent about thirty sequential round trips before the first
byte.** `applySchema` asked one SELECT per module to learn whether that module
had changed — seventeen on the directory, eleven more on each shard — then two
reads of the resource ledger, then two upserts to re-register a shard that was
already registered. Every one is cheap near the database and none of them is
near the database: at a hundred milliseconds each that is three seconds, and an
isolate is evicted after seconds of quiet, so most visits paid it. Now: every
stamp in ONE read per database, one read of the ledger instead of two, and the
registration writes only when something actually changed.

**Every request rebuilt the handler, and the handler awaited two reads to do
it** — the gateway's configuration and the effective plan catalogue, one after
the other, before the request had been looked at. They are read together now and
held for two seconds. The window is short because what it holds includes a
PRICE: a burst of requests from one screen opening lands inside two seconds and
an operator's next action never does.

**And the client showed nothing while it waited.** `useLoad` kept no answer, so
every navigation — going back included — drew the skeleton and waited on a round
trip to redraw what the browser had just painted; and `again`, which is what a
save calls, reset to `waiting`, so the list under the control somebody had just
used vanished and came back a round trip later from the top. It now shows what
it has and catches up, and a failed refresh over data we hold is not a refusal
screen — the same rule every polling surface here already follows.

⚠️ **The count is the thing no behavioural test can see.** Each of those reads is
correct, covered, and cheap in isolation; what was wrong was how many there were.
`ground/test/boot-cost.test.ts` measures it, because the alternative is
noticing in production, which is what happened.

---

## D37 — Depth is the number, and unbounded is a different question from expensive

D36 fixed a cold start. Measuring what a WARM request costs found the same shape
one layer in: a list read was **eleven round trips, every one waiting on the
last**, and `me.who` — the read the app makes before it can draw anything — was
seven. Nothing was slow. Nine correct questions were asked in a row.

**What the count came down to, and how.** The locator asked five things about one
tenant in series when four of them feed nothing; the gate phase asked what a
person owes, whether the deployment is closed and what they may do, in turn, when
none is an input to another; `whoIs` read a session and then the account it had
just named; `me.who` read one account row twice, once for a name and once for a
presentation. Now: 11 → 7 for a list, 7 → 4 for `me.who`.

⚠️ **`await` READS THE SAME WHETHER OR NOT IT HAD TO WAIT**, which is why none of
this was visible in review and why the guard measures DEPTH rather than counting
queries. Four awaited together cost one wait; four awaited in turn cost four, and
the source is nearly identical.

⚠️ **And the log is the tool, not the number.** When a budget fails, printing the
wave-numbered statements shows the chain that grew in one read — every fix above
was found that way rather than by reasoning about the code.

**The second guard asks a different question.** `runaway.test.mjs` is not about
cost, it is about BOUNDS: a poll, a retry with no ceiling, a paged walk whose
exit condition belongs to somebody else, a cron finer than a quarter hour, a log
per request, a query per row. Every one is correct in isolation and becomes a
fault only in the presence of something else — a component that remounts, an
error that persists, a workspace with five hundred members — which is exactly
what a unit test does not have.

It found two real ones on its first run: an insert per recipient when telling a
workspace something, and an insert per product when creating one. The first is
the shape that matters, because the number of people in a workspace is not ours
to assume.

⚠️ **A guard that cannot be mutated into failing is not a guard.** The first
version of the per-row check required a `{`, and a brace-less
`for (const x of xs) await db.prepare(…)` walked straight through it. The
false positive was as instructive: a query STARTED in a loop and awaited
afterwards is the FIX, and reads almost identically to the fault.


---

## D38 — Nothing that reads no table waits for a schema

**A cold isolate served no HTML at all until every schema module had been applied
to the directory and to each shard.** `boot` was awaited at the top of `fetch`, in
front of every request — the page, its bundle, its stylesheet, its fonts and the
health probe included. So the first thing a person saw after a deploy was several
seconds of blank screen, and the request they were actually waiting on
(`/health`, which is four fields read off the hostname) was behind a migration it
has nothing to do with.

**The split is by what a path READS, and it is `isPlatformPath` rather than a
second list.** Everything the platform answers reaches D1 — the operations, the
webhook, the icons, the manifest — because the plan catalogue is resolved before
a request is even dispatched. The SPA's own files reach none of it. `/health` is
the one exception in the other direction: `healthOf` is the runtime's own
classifier, exported so the deployment can answer before booting, and `serve`
calls the same function, so there is still one idea of what a door is.

⚠️ **The cold start is paid while the browser is busy.** A static path hands the
boot to `ctx.waitUntil` and answers immediately, so the migration runs during the
several hundred kilobytes of bundle the browser is downloading anyway. By the
time the app makes its first operation the work is usually done.

⚠️ **AND THE TEST HAD TO BE ABOUT A COLD ISOLATE, WHICH NO OTHER SUITE HERE CAN
SEE.** `boot` is memoised, so after the second request "did that wait?" has no
observable answer. `one/test/cold.test.ts` resets the module registry and
hands the worker a database that never settles: a path that waits hangs, a path
that does not answers, and there is nothing in between to be ambiguous about. The
other direction — that an operation still waits — is an ORDER assertion, because
against a hanging database an operation stalls whichever way the code is written.

## D39 — `locate` answers twice from one read

**Where a door is comes back one query in; what the workspace holds is three or
four.** The plan catalogue, the wallet, the standing and every quota count are
resolved before `locate` returns — and the IDENTITY needs none of them. Resolving
who is asking needs a session and this workspace's roster, and the roster is on
the shard, which is known from the first row. Handing the identity the full answer
put three round trips in front of a lookup that needed one of them.

**So the seam is `Locating`: a `where` and a `located`, both derived from one
tenant promise.** Two functions would be two reads of the same row and, worse, two
places that could disagree about whether a closed workspace is a workspace.
`serve` starts the identity and the maintenance switch beside the lookup and
awaits each where it is used. Measured on a list read: **depth 7 → 3**, with the
trip count unchanged at ten. The remaining three are the ones that genuinely feed
each other — which workspace this is, then what it holds and who is on its roster,
then the answer.

⚠️ **A REFUSAL STILL SETTLES WHAT IT STARTED.** Four paths return before either
promise is awaited — an unknown workspace, an unknown operation, the wrong method,
an unreadable body — and a query abandoned in flight is a rejection nobody handles
and, in the Workers test runtime, a storage frame that cannot be popped. Both have
been travelling for as long as the lookup took already, so waiting costs a refusal
nothing it had not spent.

⚠️ **And the helper for a hand-written lookup lives with the tests, not in the
runtime.** `asLocating` adapts a one-answer wiring, one wait slower; nothing
shipped uses it, and `capability.test.mjs` was right to call it out as an export
with no caller. It is `ground/test/wiring.ts`.

## D40 — The weight of the first screen is a number somebody has to raise

**Three things were being downloaded by every visitor to every door that no
visitor needed.** A megabyte of compiled JSON-schema validator inside
`@dicebear/core`, checking two style files we vendor and an options object we
write by hand — an answer fixed at build time, paid for at runtime, by everybody.
The thirteen screens of the operator console. And the workspace-detail screen
behind them.

**The validator is answered once, where the answer is fixed.**
`@engine/design/vite` stubs the two modules in the browser build;
`design/test/faces.test.tsx` runs the REAL validators over every option this
product actually passes, so an upgrade that genuinely invalidates a style file
fails a test rather than somebody's avatar. Deleting the check would have been the
cheap version of this. The plugin REFUSES rather than skips if the modules move —
otherwise the bundle silently regains a megabyte and the only symptom is a slower
first paint months later.

**Measured, both changes together: 1,493.8 → 1,297.5 kB raw, 415.7 → 385.5 kB
gzipped.** Splitting `space/` and `centre/` as well was considered and rejected:
both are on the critical path of their own door, so it would move a wait rather
than remove one.

⚠️ **`entryUnder` is the mechanism, not the numbers.** The entry chunk reached
four hundred kilobytes without any one commit being at fault, which is how weight
always arrives — a screen here, a dependency there, and nothing in the review of
any of them saying what it cost. A ceiling in the build makes the next one a
decision.

## D41 — The page asks before the bundle arrives

**Which door this is and who is here decide the first screen, and both were asked
after several hundred kilobytes of JavaScript had been downloaded, parsed and
run.** Two full waits, one after the other, for answers that could have been
travelling the whole time.

**An inline script in `index.html` starts both as the parser reaches it** — a
module script is deferred by definition, so nothing in the application can run
this early — and leaves the promises on `window.__one`. `api.ts` picks them up
instead of asking again.

⚠️ **Consumed once, because a `Response` reads once.** The answer was taken before
anybody signed in, so reusing it after `me.session` would leave somebody who has
just signed in looking at the signed-out screen, permanently, with the session
cookie already set.

⚠️ **A head start, never a dependency.** Every failure resolves to `null` and the
caller asks again for real, so a page served without the script behaves exactly as
it did before this existed.

⚠️ **AND BOTH HALVES ARE CHECKED TOGETHER.** A page that asks with nothing
collecting is two wasted requests; a collector with nothing to collect is a branch
that never runs. `space/test/preflight.test.ts` reads the real `index.html`.

## D42 — The route decides the direction, the world decides the gesture

**A page changed instantly and a screen appeared, which is what a router does and
not what a product does.** The fix a transition system usually gets is a prop on
every screen, and that is the fix that decays: twenty screens, each able to
declare the wrong one or forget, and no way to tell from the outside which.

**Both answers already exist as facts.** Which way somebody is going is a fact
about the two addresses — descending slides the screen away to the left, going up
mirrors it — and whether they are still in the same WORLD is a fact about the
ground the page mounted, read off `data-sky` before the swap and again after it.
Nothing is declared, so there is nothing to forget.

⚠️ **The direction cannot come from the history stack**, because the crown's back
arrow is a `pushState` like any other. The phone's own gesture is answered from a
step number kept in `history.state`: a `popstate` says the address changed and
never says which way.

⚠️ **A new family does not slide.** Sliding says "the next one along"; going from
a workspace's woven ground to the console's ruled one is somewhere else. It opens,
on a scale, with no direction at all.

⚠️ **It is the browser's own view transition, and `flushSync` is load-bearing.**
Nothing else can show the page somebody is LEAVING — React has replaced it before
any animation could run, and keeping the old tree mounted is a second copy of a
screen, its scene and its requests on the device least able to afford it. The
browser captures the "after" picture the moment the callback returns, so a queued
update is a transition between two identical frames.

## D43 — The skeleton is the screen somebody saw last time

**A placeholder chosen by SHAPE is a placeholder for a different page.** Eight
presets covered twenty-odd screens, so a console page of three headed cards
holding one, two and no rows waited behind one un-headed card of four rows — the
exact fault a skeleton exists to prevent, wearing the fix's clothes.

**So it is measured, not declared and not generated.** Declaring one per screen is
twenty declarations that go stale the first time a card is added; generating them
from source needs a script that can predict how a component composes. Reading the
real DOM after the real render is exact by construction — heading height, row
count, block height, kept under the address.

⚠️ **The first visit is the honest limit**, and it falls back to the shape's own
placeholder. ⚠️ **And the outer box is fixed rather than composed**: everything
inside a skeleton is an approximation, and approximations add up to a column
sixty pixels short, which is the jump again.

---

## D44 — The sender is the deployment's, the reply and the words are the workspace's

Mail is delivered on the strength of a domain that has been set up to send it, so
every letter leaves from the deployment's one verified address and no workspace is
ever the `From:`. What a workspace owns is the other three halves of a letter: the
`Reply-To:`, the subject, and the words — where the notification declares itself
`theirs` and the workspace's brand actually reaches its mail. Decided 2026-08-21.

**Why.** A business tells its own people things through our product, and a letter
that arrives from us, in our words, with replies going to a mailbox nobody reads,
is three separate failures wearing one envelope. But the first of them cannot be
fixed: sending as `harbour.example` means holding their DNS, and the alternative
— sending as them without it — is what makes mail bounce.

**The reply address is the WORKSPACE's, not an app's**, for the reason the accent
is (D22): a business running three of our products has one address it wants
answers at, and one per product would be three with two of them stale. So no app
declares a `reply_to` setting; `Branding.replyTo` is the one field, on the one
screen a business already edits its identity on.

**A letter is used only where all three conditions hold, asked at the SEND.** The
app has to offer the `email` surface, the workspace has to have switched it on,
and it has to be the kind that may brand anything at all — and every one of those
can change after a letter was written. Asked at the read, a stored letter stops
applying the day one of them stops; trusted from the store, it goes on wearing a
business's name after they stopped being a business.

**And the editor says so before anybody types.** `notify.wording` answers `used`
from the same predicate the dispatch asks (`mayWordMail`), so a workspace whose
mail is still ours is told that on the screen rather than after the send. A
screen collecting words the dispatch silently drops is this repository's
signature failure and it does not get a new instance here.

**Therefore never:** a `From:` that is not the deployment's verified sender; a
reply address declared per app; a letter applied because it is in the table,
without asking whether the workspace may still have one; a wording editor that
does not say whether its words will be used; a template variable the notification
never declares reaching the send — it is refused where the template is SAVED,
which is the last moment it is somebody's mistake rather than somebody's mail; a
failed send that takes the rest of the audience down with it, or that is logged
with the letter's body in it.

---

## D45 — A membership is narrowed to part of a workspace, and one filter applies everywhere

A workspace is not always one place. A membership may be narrowed to some of its
places — for OneInventory, to locations — and the narrowing applies to every read
and every write of every collection that says where its records are. `null` is
the whole workspace and stays the default; an empty list is nowhere.
Decided 2026-08-21.

**Why.** The goods-in person at the second site could see, move and count the
first site's stock. Nothing refused, nothing logged, and the product looked like
it was working — which is the class this framework exists to make impossible, not
a feature request. A business with four branches is the ordinary customer for an
inventory product, and a roster that cannot say "you work here" sells them one
branch's software four times.

**Reach is not a permission and the two must not be merged.** A permission says
WHAT somebody may do and applies wherever they are; reach says WHERE, and applies
to everything they may do. Folded into one set, "count stock at Site B" becomes a
key per site per verb — and adding a fifth site becomes a code change.

**ONE DIMENSION PER PRODUCT.** A business is narrowed by one thing — a site, a
branch, a clinic — and two would make every question about somebody's access a
matrix nobody can answer at a roster screen. A product that needs a second is a
product whose second dimension is a role, which it already has.

**The grant names a NODE and the filter covers its subtree.** A grant to a
warehouse reaches every aisle and bin under it, including the ones added next
week — so narrowing somebody is one press rather than four hundred, and the walk
happens at the read rather than being frozen into the stored grant.

**And the guard is the load-bearing half.** The generated CRUD narrows itself;
the forty statements an app writes by hand do not, and that asymmetry is the
whole risk. `scripts/reach.test.mjs` fails on any statement over a narrowed table
that neither carries the filter nor sits in a declaration that asks — with an
exemption written as a sentence beside the query, never as a list in the guard.

**Therefore never:** a reach folded into the permission set; a second dimension;
a grant stored as the flat set of leaves it covered on the day it was made; an
empty grant read as "no narrowing"; a collection that carries a place and does
not declare it (composition refuses one); a handwritten statement over a narrowed
table with neither the filter nor a stated reason; and a screen that narrows a
list while the route under it answers for the whole workspace.

## D46 — Five is what a phone's bar holds, not what an app may have

**A phone has two edges and an app has as many destinations as it has.** The
ceiling on the nav (D10) is a fact about thumbs: past five items a bottom bar
stops being tappable. It was read for a long time as a fact about PRODUCTS —
which it never was, and the difference was invisible because the desktop rail
drew everything and nobody looked at the other half.

**An app declaring twelve screens offered five of them to a phone.** `secondary`
was rendered in the rail and by nothing above it, so seven of OneInventory's
destinations — the reorder list, the label sheet, the reports, the question box,
the importer, the suppliers, the guide — had no gesture at all on the device the
product is used on. Every suite green. A rail that is correct and a bar that is
correct, and between them a third of the product unreachable.

**The fifth slot holds everywhere else, and it is a destination rather than a
menu.** It wears the app's own mark; when somebody is inside one of the places it
holds it OPENS and says which — so the bar still answers "where am I" from every
screen in the app. A button called More cannot do that, and reads as an admission
the nav ran out of room.

**It costs the fifth primary rather than adding a sixth item.** Five is the
ceiling, so the way to seven more destinations has to come out of it. The
displaced primary is in the sheet at the head of the list, before the second
tier, because that is the rail's order and one product must not read as two.

**And an app that fits is untouched.** The slot is spent only where there is
something to spend it on, so a product with four destinations keeps four and a
product with five and no second tier keeps five.

**The vignette is the other half of the same complaint.** `--hem-bottom` was
written by nobody and fell to its default of 1, so the foot of every screen was a
fully opaque strip with the world's marks stopping dead at its top edge — a bar,
by the definition the TOP hem's own paragraphs give. The top one had been fixed
by asking whether anything is behind it; the bottom one was left because the
question was thought unanswerable from a scroll position. It is one subtraction:
what is still below the fold is on its way under the nav.

**Therefore never:** a destination an app declares that a phone cannot reach; a
sixth item in the bar; a fifth slot labelled "More"; a hem that is opaque with
nothing behind it; or a hem that eases its very first answer, which is an
interface visibly undoing itself in front of somebody who has just arrived.

## D47 — One screen draws every moment One cannot show you a screen

**A deployment has four ways of having nothing to render, and they were four
screens.** One is starting; one stopped starting; the host is not a workspace;
the route is not a screen. The first was the curtain — the wordmark, the turning
O, a line that changes — and the other three were plain centred text, each with
its own spacing, its own weight, its own idea of where the message sits. Nobody
ever saw two of them together, which is why they drifted for as long as they did.

**They are one component with a `stopped`, and the difference is the ring.** While
One is starting the ring turns and the line rotates through what is being done;
when it has stopped the ring COMPLETES and the line is replaced by the statement.
Same gradient, same grain, same wordmark, same place on the page — so the four
moments read as one product having four things to say rather than four screens
built by four people.

**The completed ring is the whole of the state change, and that is deliberate.**
An error page that arrives with an alarm on it makes somebody's ordinary
mistyped URL feel like a fault they caused. The curtain stops, says the thing in
one line, and offers the one action there is — try again, go to the signpost, or
nothing at all when there is nothing to offer.

**And a stopped curtain is `role="alert"` rather than `role="status"`**, because
it is the end of the wait rather than a report on it.

**Therefore never:** a standard page with its own layout; an error state that
keeps a spinner turning behind it, which says the wait is continuing when it has
ended; an apology or a fault code on a page a person reached by typing; a
"contact support" with no address behind it; or a third component that means
"a centred panel" — that is a `Group` inside a `Center`, which is why `Sheet` is
gone.

## D48 — A gift is a row about a person, not a state on a workspace

**Every way of handing something out already existed, one workspace at a time.**
An operator could comp a plan with no Stripe in the path, put credits in a
wallet, and grant an address a count of businesses. Each of the three began by
knowing a WORKSPACE — so giving a friend a top tier meant finding one of theirs
first, and giving one to somebody who had none meant waiting for them to make it
and coming back. The decision itself was recorded nowhere: the money did not move
through us, so the only trace was whatever somebody typed in a support thread.

**So the gift is written before it is applied.** A row names an address, what
(a plan × N workspaces, or credits), until when, why, and which operator. The
plan on the workspace and the credits in the wallet are what it PRODUCES. The
other order — change the workspace and remember why — cannot answer "what has
this person been given" from anywhere, which is the question that brings somebody
to the console.

**It is made to an ADDRESS, and that is the common case rather than an edge.** A
demo account, a friend and a customer who paid cash last week have no account row
to point at; the id is stamped when they first ask for a code. A ledger keyed on
the account would answer nothing for exactly the people the feature exists for.

**A plan gift confers the right to found, counted with the bare allowance rather
than beside it.** Two numbers would mean an operator giving somebody a workspace
at a commercial tier ALSO having to remember to raise their commercial count —
and forgetting is a person refused the thing they were just given, silently, as
"no allowance left".

**The term binds the PLAN, not only the gift.** A year of cash buys a year, so
the gift's date travels onto the subscription and the nightly pass returns a
lapsed one to the lobby. Bounding only when the gift may be SPENT would give a
cash customer the tier for ever, which makes the date a control that does
nothing.

**And the workspace can tell.** A comped workspace read its tier's catalogue
price and was offered a button to manage a subscription that does not exist — so
the customer most in need of knowing the terms was shown a bill describing
somebody else's arrangement. `given` travels on the workspace's own read now, and
the shelf says "Given, and free until the first of December" where it printed
€99.

**Therefore never:** a gift applied with nothing recording who decided or why; a
gift that can only reach a workspace founded after it; a plan comped under an app
id, when one plan covers every product; a spend that reads before it writes, which
hands out one extra exactly when somebody double-presses; a commercial tier put
on a personal workspace, where the kind gates refuse what the plan grants; a
console that can change what a person holds and cannot list the people; or a
priced row over a workspace with no card behind it.

## D49 — A browser test does not gate a deploy

**Nothing that opens a browser can tell you whether the deployment boots.** A
`.seen.` suite renders the shipped stylesheet in real Chromium and asks about
pixels — where a row wraps, how tall a control is, whether the world actually
moves. Every one of those questions is worth asking and none of them is the
question a deploy is waiting on, which is whether the thing answers at all.

**And they are the whole cost.** Measured on this repository: the design
package's suite ran 97 seconds, 96 of which were one file; the CI job also
downloaded ~400 MB of browser and its system libraries to get there. Everything
else — every guard, every typecheck, every runtime suite — was minutes short of
that combined.

**So there are two lanes and the filename decides.** `*.seen.test.*` is excluded
from every `test` config and runs in `pnpm engine:seen`, which nothing in CI
calls. The cost is paid by whoever is changing a screen, which is the person
looking at the screen anyway; the deploy pays for the questions a deploy is
asking. Design's own fast lane went 97s → 8s.

**The split is a filename, so it is guarded.** `scripts/seen.test.mjs` fails on a
suite that launches a browser without the suffix, on a suffixed suite that
launches none, on a package holding one with no `seen` script to run it, on a
`test` config whose own globs still pick one up — evaluated, not read for the
word — and on a workflow that installs a browser again. `docs/guards.json` gained
a `lane` field for the same reason: a registry that goes on claiming CI runs a
guard it no longer runs is worse than no registry.

**Therefore never:** a browser suite in the lane a deploy waits for; a `.seen.`
file in a package with no command that runs it, which is a deleted test wearing a
filename; a suffix applied to a suite that needs no browser, which quietly takes
a real check out of CI; or a guard registered as CI-run when it is not.

## D50 — Ambient motion is earned; essential motion is assumed

**Two kinds of motion, and only one of them is free.** A screen arriving, a page
travelling, a mark playing its character under a finger: each is a few hundred
milliseconds of `transform` and `opacity` on a handful of elements, run by the
compositor on its own thread, and each CARRIES MEANING — where a screen came
from, that a press registered. The world's marks are the other kind: endless,
full-screen, and never composited. They beat in SMIL inside a `<pattern>`, which
is the only thing that repaints in one, and a repaint inside a paint server
invalidates the whole fill — so every frame re-rasterises a tile and repaints a
viewport-sized rect on the main thread, for as long as the screen is open,
competing with the scroll.

**So `motionFor` is the one decision, and it answers in two tiers.** Essential is
assumed unless motion is refused; ambient is earned. A fine pointer is the entry
condition, because a mid-range phone reports eight cores and cannot report a
mouse; memory and cores only VETO, and their silence is not a refusal — a rule
that turns into a browser test is a rule about the wrong thing. Nothing overrides
an operating system that asked for less motion, because for some people that is
not a preference.

**A budget binds whether anything moves.** A still field is still a string the
browser parses and a tree it rasterises, on the first paint of every screen. The
TILE shrinks rather than the cell: growing the cell changes the drawing, while a
smaller tile is the same picture repeating sooner. What a repeat costs is a
symmetry somebody might find on a wide screen.

**And the switch is reachable.** Every keyframe answered `data-reduce-motion` and
nothing set it; `applyAppearance` read a value nothing wrote. Both are on one
screen now, kept on the device rather than the account — the same person wants a
different answer on a phone in sun and a desktop at night — and it says which
fact about the hardware decided, because a still world under a control saying
"Automatic" teaches nobody anything.

**Therefore never:** a permanent full-screen repaint nobody asked for; a second
implementation of "may this move"; a field whose cost is bounded only by a motion
setting, which is the half that setting cannot reach; a device rule that fails
open; or a preference honoured everywhere and reachable nowhere.

## D51 — A workspace is founded with the products somebody chose

**One hardcoded id decided every workspace ever made.** Founding took
`deps.appId` — the string `"hello"` — so a person who came for one product
founded a workspace holding a different one, and the only way to change it was to
ask an operator to do it in the console. A deployment that serves several
products and can only hand out the first is one product with the others built.

**What is SERVED and what is SOLD are different lists.** The registry holds what
this deployment can run; `sells` holds what anybody may switch on for themselves.
A product still being built stays mounted, reachable and answering for the
workspaces an operator put it in, and comes out of the second list in one line
rather than by an unmounting that breaks them.

**At least one, always.** A workspace with no product is a name and an address
with nothing to open — reachable, payable and empty for ever, because the screen
that would add one is inside it. The same rule at the other end: the last product
cannot be switched off, and off is never gone. What ends is reachability; the
records stay and the schema stays applied, because erasing on a toggle would make
an accidental tap the most destructive control in the product.

**And the first name for those operations deleted a real one.** Platform
operations are merged OVER an app's generated CRUD, deliberately, so an app
cannot redeclare "invite a colleague" — which means a platform id equal to a
generated one replaces it, silently, and the route goes on answering the wrong
thing at the right address. `product.list` took over a workspace's list of things
on shelves. `compose` refuses a shadowing id now rather than resolving it.

**Therefore never:** a default nobody chose standing in for a decision; a
catalogue written beside a wizard instead of read from the manifests; a workspace
founded with nothing in it, or emptied down to nothing; a toggle that erases; or
a platform operation that wins a name collision quietly.

## D52 — The proving ground is a fixture, and the deployment serves no fixture

**It was a product because of where it lived.** The smallest complete app on the
engine — one notebook, sample content, every cross-cutting concern declared so
the framework's claims are asserted against something real — sat in `engine/apps`
beside the products. So it was in the deployment's `APPS`, in its `SELLS`, and in
the browser's product loader, and a person who came for one product founded a
workspace holding a demo they never asked for, with somebody else's notes in it.
Only an operator could take it away. Nobody decided any of that.

**The rule is a path, not an exemption.** `engine/apps/*` is the product
catalogue and everything in it is served; `engine/ground` is not among them. So
the question a guard asks is "does anything the deployment serves come from
outside the catalogue" rather than "is this one app special" — the second is an
excuse list, and an excuse list is what a rename quietly empties.

**A fixture with a live browser half is a product nobody sold.** Its `live`
entry — the module that drew its screens over a workspace's OWN records rather
than over the sample world — is deleted, and `package.json` exports no `./live`
for a loader to reach. The dev-only ground PAGE stays: it is behind
`import.meta.env.DEV`, folded out of the production bundle, and that is what
`bundle.test.mjs` already holds.

**A fixture is still asked every question a product is.** It declares the widest
manifest in the repository and draws most of the design system, so it is the
corpus these checks are most worth running against. Being outside the catalogue
is about what a CUSTOMER can reach, never about what a GUARD may read — and
twenty guards enumerated `engine/apps/*` by hand, so the move narrowed all of
them at once, silently, each going on printing `ok` over a corpus one app
smaller. `lib/trees.mjs` is the one walk they read now.

**Therefore never:** a fixture inside the product catalogue; a manifest the
deployment composes that nobody decided to sell; a sample world reachable over a
customer's own records; or a guard that names a tree by hand when a move can take
it out of the corpus without taking it out of the check.

## D53 — The navigation is five destinations, and the chrome carries the rest

**A second tier is what an app reaches for instead of deciding.** `ScreenSpec`
carried `nav: "primary" | "secondary"`. The rail drew the secondary tier as a
list; the phone spent the fifth of its five slots on an item that opened a sheet
of everything else. So a product with thirteen screens had thirteen places to
look, the bar could not answer "where am I" from eight of them, and the same
product read differently either side of the breakpoint. The ceiling was never the
problem — the OVERFLOW was, and a ceiling with an overflow behind it is not a
ceiling.

**A screen is a destination or it belongs to a subject.** `nav` is
`"primary" | "none"` now: one list, everything in the navigation is in it, and it
fits. The first destination is the app's own root, because Home is where somebody
lands and a product whose first bar item is not where it opens has two answers to
where it starts.

**The chrome has two named slots and the app declares which screen fills them.**
`chrome: "search"` is the crown's middle — the widest slot on a working screen,
which used to hold the workspace's name, a question nobody was asking. The door
already says which workspace and the person chose it a moment ago.
`chrome: "assistant"` is a button beside the notifications, because asking is
something somebody does FROM a screen about what is on it; a destination for it
means going somewhere first and saying what you wanted second. A screen claiming
either and ALSO claiming a bar slot is refused: the chrome already offers it.

**Where a screen's one action goes is decided by what the screen is.** A
destination's foot is the navigation, so its act rides up into the crown. A
screen somebody WENT to — receiving a delivery, counting a shelf, reading one
record — has no bar at its foot, so the act takes that room instead: the widest,
nearest thing a thumb can reach. Never both, which was `Docked`'s own rule before
it was overridden for a day and produced 180px of an 844px phone in two objects
with a gap between them.

**Neither end of the chrome is a bar.** Both are the page's own ground with a
hem — a gradient that dissolves content passing under them — so the world runs
through the crown and the five destinations stand on it. The rail was the last
plate: a column of filled buttons on a desktop against ink on a phone, which is
one product with two designs. It wears the bar's own `data-island` treatment now
rather than a second set of colours, and pins under the crown.

**A screen off the bar is reached from what it is about, and that is checked.**
The route is declared, the container is mounted, the screen renders at its
address — and if no control leads there it is reachable only by typing, which
nobody does, and every other lane reports green. Taking six screens out of a bar
in one commit is exactly when it happens, and it did. `reached.test.mjs` matches
the router handoff rather than the route's NAME: every container carries the
mount table, so a check on the string passes over an app whose every control has
been unwired.

**Therefore never:** a navigation tier that overflows into a menu; a screen that
is a destination and a chrome slot at once; a product whose first bar item is not
its root; an act drawn twice at both ends of one screen; a chrome plate that
stops the world at its edge; or a screen off the bar that nothing leads to.

## D54 — Half a getting-started list is the workspace's and half is the person's

**A checklist ticked from one tally is wrong for whoever arrives second.** The
guide was derived entirely from `tenant_event` — what this workspace has ever
done — which is right for setup and wrong for everything a pair of hands has to
learn. Somebody invited into a workspace that has been running opens a checklist
already complete: every box crossed off by their employer, nothing taught, and
no test anywhere failing, because the list simply renders empty and reads as
success. Ticked the other way round it fails in the mirror image — whoever
arrives second is told to name a place that was named a year ago.

**So a step declares which it is, and the default is the meaning it already
had.** `who: "workspace"` (absent) is done once, by anybody, for everybody;
`who: "person"` is done by each pair of hands and ticks only for the one that
did it. `Raised` carries both lists and a step is looked up on the axis it
declares — never a union, which is the merge that ticks the wrong box.

**The personal record is a yes, not a tally.** `tenant_event` counts, because a
milestone needs to know how many; `person_event` holds one row per person per
event, written the first time and never again. The distinction is the whole
disclosure: what is kept about a member is which of their own first steps they
have taken, never how often they do anything or how they are getting on. It is
narrowed at the write to the events some step actually names, derived from the
book, so a product that declares no person step keeps no personal row at all.

**And `needs` was already the other half of the answer.** Setup steps are mostly
gated on a permission an invited counter does not hold, so they were never that
person's to see. The axis is what the permission cannot say: that two people who
both hold `stock:write` still have their own first count to record.

**Therefore never:** a checklist that credits somebody with work they were not
there for; a newcomer asked to repeat what the workspace has already done; a
per-person tally of how often a member does a thing; or a personal row written
for an event no step asks about.

## D55 — A product's colour is the product's, and one family commits

**A design is a set of relationships somebody chose.** The light against the
ground, the wash against the card, the one coloured thing on a screen — all of it
was decided by whoever spent ten seconds in a workspace's colour picker, which
meant no screen could be designed because no screen knew what it would be made
of. `AppSpec.hue` is one value a PRODUCT declares; `Page` sets it as `--brand` on
the element the ground is painted on, and every family reads its `lit` slot from
there. A workspace keeps its name and its mark.

**Every world was quiet, and that is why none of them could open an app.** A
ground is behind the page; the controls on top of it stay the grey the palette
made them, so what somebody sees is a working interface with a picture behind it.
`neon` is a hard bright SOURCE on black — a ring far larger than the frame, so
what lands is an arc, or a beam — with an almost-white core and the hue living in
the falloff, because turning a hue up gives more of that hue and turning a real
source up goes toward white.

**And `Family.wash` is the half the others leave out.** A second, louder colour
that SURFACES are made of, published once and mixed into the tiers by one rule —
never a prop, so nothing writes a colour and the mono rule holds. Seven of the
eight families decline; the share rises with the tier, because washing a page, a
card and a control equally collapses three tiers into one flat field; and the hue
goes in whole, because amber mixed toward black is brown and a card washed in
brown reads as dirty rather than as lit.

**The motion rule was "not under the blend", not "nothing moves".** The grain is
`mix-blend-mode`, and a blended layer cannot be composited apart from what it
blends with — so the ground's old drift dragged a viewport-sized stack onto the
main thread sixty times a second. That is a property of WHERE A LAYER SITS.
`Ground.flare` splits a family's own result: the shallow bloom stays under the
dither, which is what stops it banding, and the steep band goes above it on its
own layer, where a rotation of a degree and a half over ninety seconds is
compositor-only and costs one promoted layer. Earned, and off both ways.

**Therefore never:** a workspace's colour deciding what a product is made of; a
world that reaches the page and not the things standing on it; a wash that treats
every tier the same; a hue pre-mixed toward black before it reaches a surface; a
band at full alpha where a heading is; or an animated layer under the dither.

---

## D56 — A tab is told its build was replaced, and reloads when its reader says so

**A single-page app left open never learns that it was replaced.** Nothing about
a deploy reaches a browser that is already running: the bundle it fetched is the
bundle it keeps, for as long as the tab lives, which on a phone is weeks. Every
fix and every corrected number ships to somebody who will not see it until they
happen to reload — and the ones who do not are the people reporting bugs that
were fixed a fortnight ago.

**The version is the entry bundle's own name, so it cannot be wrong.** A build
stamp handed to both halves is two facts that have to agree, and they disagree
the first time somebody deploys one without the other. The worker reads
`index.html` back through the SAME assets binding a browser would be served
from, so the question and the answer are one thing. It is asked once per isolate
— assets are immutable per deploy, and a new deploy is a new isolate.

**It rides on an answer the browser is already waiting for.** A poll would be a
request per tab per interval to learn something that only matters to somebody
who is USING the product, and somebody who is using it is making requests
already. The header goes on every platform answer; the door remembers the first
value it was told and reports a change once.

**And the page never reloads by itself.** A tab that replaced itself mid-sentence
would take an unsaved form with it. What ships is a bar that says a new version
is available, and a reload that happens when the reader presses it.

**Therefore never:** a build stamp two halves have to keep in step; a poll for a
version; a version read per request; a header set by mutating a `Response` that
`fetch` produced; or a reload nobody asked for.

---

## D57 — A total is one ask, and a collection nobody may read is absent from it

**A screen that leads with three numbers made three requests for them.** A list
read answers its collection's whole count whatever page it hands back, so the
only way to learn a total was to ask for one row and throw it away — three round
trips, each carrying identity, workspace, membership and standing, to run three
`SELECT COUNT(*)`. That is not a screen written badly; it was the only thing the
surface offered, and it is a large part of what "opening it is slow" was made of.

**`totals.read` is derived, like the five verbs beside it.** Every app with a
collection has it, the counts go together rather than one after the other, and
the filters are `list`'s own — so a hero saying four hundred over a screen
showing twelve is not a thing that can happen. A person-scoped collection is
counted against the PERSON: one id for a mixed list would show everybody
everybody's total, and it would look like nothing but a larger number.

**Its permission is `PUBLIC` because no fixed key could be right.** The answer
differs per caller — somebody who may read products and not stock must get the
products count rather than a refusal — so the gate admits any member and the
caller's own keys decide the contents, collection by collection.

**A collection they may not read is ABSENT, never nought.** "You have none" and
"this is not yours to see" are different answers, and a screen handed the first
cannot tell them apart; what it draws is a confident zero about somebody else's
records.

**Therefore never:** a total fetched by asking a list for one row; a count whose
scope or reach is written separately from the list it is a count of; one scope id
for a mixed list of collections; or a permission-filtered answer that reports a
withheld collection as empty.

---

## D58 — An expensive component has one home, and it is reached lazily

**A phone spent twelve seconds on the opening curtain, and the cause was one
import list.** `rendered/field.tsx` answers "a declared field becomes a control"
for any kind, so it named every kind it could draw — and because the design
system has ONE barrel, a calendar and a colour picker were downloaded, parsed and
compiled before the curtain could be painted, on every visit to every app on this
engine, including screens with no form on them at all. Attributed through the
source map by emitted bytes, HeroUI's calendar alone was the largest single
module in a 1,354 KB entry chunk, and the table was the largest one after it.

**Splitting one at a time saves nothing, which is the part worth writing down.**
`Listing`'s table was moved into a module of its own and the entry did not shrink
by a kilobyte — because the sub-processor register and the plan comparison were
still naming `Table` two directories away, and a bundler keeps what any reachable
module names. A heavy component has to have EXACTLY ONE static importer or it
effectively has none, and that one importer has to be reached by `import()`
rather than by a plain import. Both halves are the rule; either alone is a file
move. `scripts/weight.test.mjs` checks both, and found a third date surface in
`forms.tsx` on its first run.

**The list is named rather than measured.** A byte threshold read from a built
bundle needs a build to run, answers differently per app, and moves whenever the
library does. These are the components a source map showed to be worth their own
round trip; adding one is a decision somebody makes in review.

**The boundary is per control, never per form.** One `Suspense` around a form
blanks every control on it — including the ones already rendered — for as long as
one chunk takes to arrive, and the fallback is the control's own shape rather
than a spinner, so nothing under it jumps when the chunk lands.

**And a string render cannot see past a lazy boundary.** `renderToStaticMarkup`
answers a suspended boundary with its fallback rather than starting the import,
so a suite that asserts on rendered markup reads the skeleton and fails on the
fix. `react-dom/static`'s `prerender` waits; a second pass with a tick between
does not, and passes every assertion about LENGTH while asserting nothing.

**Therefore never:** a generic renderer that statically names every variant it
can draw; a second static importer of a component that has a lazy home; a home
reached by a plain import; one suspense boundary standing for a whole form; or a
markup assertion taken from a renderer that cannot resolve the component under
test.

---

## D59 — A content-hashed asset is kept; the document that names it is not

**Eighteen conditional round trips, on every visit, all answered "still the
same".** Cloudflare's static assets default to `public, max-age=0,
must-revalidate` for everything they serve, and this deployment took the
default — so a phone opening the product asked the server about every hashed
file in `/assets/` before it could run any of them: the entry bundle, the
stylesheet, five Geist weights, three Onest, and every lazily-loaded chunk.
Measured on the live deployment.

**It is the failure that survives every other fix, which is why it is written
down rather than merely corrected.** Twenty-five per cent came off the entry
chunk (D58) and the person watching noticed nothing, because what they were
paying was not the bundle's SIZE — it was a round trip per file before any of it
could start. A smaller bundle does not remove a request. Only telling the browser
to keep the answer does.

**The hash in the name is the whole argument.** Vite writes the content's
fingerprint into the filename, so `index-Bf05fZYn.js` cannot change meaning: a
new build is a new NAME, referenced from a fresh `index.html`. A file that cannot
change is a file there is nothing to ask about. `immutable` is how a browser is
told not to ask even on a RELOAD, which `max-age` alone does not cover — and a
reload is exactly what somebody does when a page feels slow.

**And the document is the one thing that must never be kept.** `index.html`
names which hashed files this deploy uses, so caching it pins a browser to the
previous build's names — a deploy that then reaches nobody, which is worse than
the slowness and far harder to see. It is also what `renewal.ts` reads to report
the version being served (D56). One revalidated round trip on a 5 KB file is the
whole mechanism by which anybody ever gets a new build.

**Therefore never:** a content-hashed asset served with the platform's default
cache headers; a long `max-age` without `immutable` beside it; a rule that keeps
`index.html`, `/` or `/*`; or a performance conclusion drawn from bundle size
without checking what a browser is asked to fetch before it can start.

---

## D60 — A worker's one thread is a shared resource, and drawing is what spends it

**Three seconds of CPU, on a public path, on the thread every other request in
the isolate is queued behind.** `/icon.png` and `/apple-touch-icon.png` measured
at `cpuTimeMs` 3,137 and 3,278 on the live deployment, and the same trace caught
an unrelated `/api/me.who` running out its ten-second wall limit beside them. A
Worker isolate has one thread: a request that computes for seconds does not
merely answer slowly, it stops everything sharing that isolate from answering at
all. The symptom is on somebody's phone and the cause is on a route nobody
suspects, because an icon is not a thing anyone profiles.

**The cost was nowhere anybody could see it.** The rasteriser supersamples 4×4,
chosen against a 32px tile and documented as costing "nothing anybody will
measure on an icon". The tile size is 512, set in a different file for a
different reason. Neither number is wrong; their product is 4,194,304
evaluations of the mark's geometry per picture, and there was no place in the
code where that product was a number. So `fitting()` now returns the plan and the
`cost` of it from one call, and a test holds that cost to a budget against the
size the deployment actually serves — the `planRun` shape, applied to pixels.

**Three independent halves, and each is a different kind of waste.** The rate is
now derived from the size, because antialiasing is about the finest feature and
at 512px the pixel grid is already finer than anything being drawn (tiles up to
180px come out byte-identical). Pixels outside the fitted ink box are ground by
construction and are no longer asked about — four in five of them. And the shape
is resolved once per picture instead of once per sample: `inkAt` took a `MarkOf`
and called `partsOf` itself, which is right for the SVG where it happens once and
was several million array allocations here. Measured together in the Workers
runtime: 362 ms → 21 ms for the served tile.

**Then it is not drawn twice.** The bytes are a pure function of mark, ground,
ink and size, so an isolate that has drawn a tile answers with the same bytes
after, and the response carries an `ETag` so the deliberate five-minute freshness
costs a 304 rather than the whole picture. Neither replaces making the drawing
cheap: a cold isolate still pays the first one, and that is the request that was
timing out.

**Therefore never:** a per-request computation on a public path whose cost is not
a number somewhere a test can read; a sampling rate held constant while the thing
being sampled changes size; a deterministic picture recomputed per request; or a
resolution step inside a loop that is invariant across it. And when a page is
slow, look at what the server spends before looking again at what it sends.

---

## D61 — A cold isolate is the ordinary case, so its boot is a latency budget

**Seven requests, 2.2 to 2.7 seconds each, 9 to 13 milliseconds of CPU between
them.** With the icon fixed (D60) the live trace shows no computation anywhere:
99% of the wall time is waiting, and the durations are nearly identical across
requests that do completely different work. Uniform latency over varied work is
the signature of a fixed cost, and the fixed cost is `boot`.

**An isolate is evicted after seconds of quiet, so "cold" is not the first visit
— it is most of them.** A burst of requests from one screen opening is spread
across several isolates, each paying `boot` in full, and every `/api/*` request
waits for it. What it pays for is learning that nothing has changed: the schema
modules are stamped and already applied, the resource ledger is settled. The
work is right; the number of times it goes to a database in sequence is the
whole cost.

**Measured on a settled database it was five sequential waves and ten
statements, and four of them bought nothing:**

- `CREATE TABLE IF NOT EXISTS _schema` stood in front of a read that already
  tolerated the table being absent — a whole round trip, on every cold isolate
  for the life of a version, to make a table that is there. Reading first and
  creating in the `catch` costs a never-booted database one extra trip, once.
- The directory and the shards this deployment ships with were migrated one
  after the other. Neither waits for the other and neither ever did. The shards
  the reconciler has *grown* genuinely cannot join them — finding out which
  exist is a read of the directory — but those are the exception, not the rule.
- `SELECT * FROM resource ORDER BY name` went out twice: once to find grown
  shards and again inside `settleBindings`, which read it for itself. That
  function's own comment says "one read of the ledger"; it was true inside the
  function and false across the boot.
- `settings` — the deployment's keys and its price catalogue — is the very next
  thing every request asks for, and it was read after the boot rather than
  beside it. It holds its answer for a moment, so starting it during the boot
  costs nothing and removes a wave from the request that follows.

**Two waves and seven statements now, and it is a budget rather than a
measurement.** `engine/one/test/cold-cost.test.ts` boots a fresh module registry
against an already-settled database — which is exactly what a deployment's
second and every later isolate meets — and counts what crosses the wire and how
much of it waits. Each of the four savings fails it on its own if reverted.

**Therefore never:** a boot step that blocks a request and could have run beside
another; a table read twice in one request because each caller reads for itself;
a `CREATE TABLE IF NOT EXISTS` in front of a read that already handles the table
being absent; or a latency conclusion drawn from what a request computes rather
than from how many times it waits.

---

## D62 — The centre is asked for before the bundle, not after the session

**Three round trips deep, and the middle one was waiting for an answer it does
not need.** With the icon fixed (D60) and the boot flattened (D61), the live
trace and a screen recording line up frame for frame: `/health` and `me.who`
leave together and `me.who` takes 4.1s; `centre.view` and `inbox.list` leave
only then and take 2.2s; the screen's own seven reads leave only then and take
2.7s. Nine seconds, of which four are a blank curtain and two and a half are
skeletons — over twelve requests that spent nine milliseconds of CPU between
them.

**The barrier was structural, not deliberate.** `Product` is the only thing that
reads the centre, and `pickScreen` does not render it until `me.who` has said
somebody is here. So the request carrying every manifest in the deployment could
not leave the browser until a whole round trip had already been spent — and the
screen behind it could not start until that one landed. Nothing in the code says
"wait"; the wait is a consequence of where a hook is mounted, which is exactly
the kind of cost no assertion about a value can see.

**The centre wants nothing from the session and nothing from the door.** It is a
read of the deployment's own manifests, authorised by the cookie the browser
already holds. So it joins the preflight in `index.html` (D-preflight, task 177)
rather than the render: an inline script that runs as the parser reaches it,
before the browser has finished fetching the bundle. Three questions now leave
in one wave, and the round trip overlaps the download instead of following it.

**It is asked on every door, including the ones with no centre to read.** Which
door this is comes from `/health`, and waiting to find out would put back the
wave this removes — the browser must never classify its own hostname (D17). The
signpost and the setup door pay one refused request beside two they were making
anyway, and it costs them no wait at all.

**And a sign-in throws every preflight away, which this change made necessary.**
`me.who`'s preflight is read at boot and never outlives anything. The centre's
is read by the first screen that wants it — which on a workspace door is AFTER
somebody has signed in. Kept, its answer is the 401 the page got while nobody
was here, and `call` reads a 401 outside `NOT_AN_EXPIRY` as an expired session:
somebody would sign in and be signed straight back out, once, with the cookie
already set. What makes a preflight stale is not which operation it is, it is
that it was asked before the session existed — so the whole store goes, and
naming the exception would be how the next key added to the page inherits the
bug.

**Therefore never:** a read placed where it happens to be mounted rather than
where its dependencies actually are; a preflight answer kept across a change of
who is asking; or a page whose first wave is smaller than the set of questions
every visit starts with. And the pairing is checked, not assumed — the page's
keys and the door's collector are read out of the real `index.html`, because
either half works alone and disagreeing is silent.

---

## D63 — What a request waits for is measured, per operation, and budgeted

**Nine seconds became five, and then the per-request cost was the whole story.**
With the icon fixed (D60), the boot flattened (D61) and the centre preflighted
(D62), the opening is two waves rather than three — and each of them was still
taking well over two seconds against nine milliseconds of CPU. Depth, not work.

**`me.who` was the deepest request in the product, at ten sequential waves.** It
is also the one the blank curtain waits for: no door, no screen and no shell can
be chosen until it answers. Four things made it ten:

- **The wall was resolved last.** What somebody still owes an agreement to needs
  their account and the hostname they are standing at, and neither is a fact in
  any read above it — but it was asked after the whole walk over every workspace
  they belong to, so its own three round trips began six waves in.
- **The workspace was looked up by slug and then read back by id.** The row was
  in the caller's hand; only its shard was wanted from it, and that is on the row.
- **The membership and the live apps were awaited one after the other**, and the
  live-apps read sat alone in front of the per-workspace group it belongs in.
- **The two acceptance reads were serial.** What a person has agreed to and what
  a workspace has agreed to are keyed by different things and neither answers the
  other; `canBind` — the only reason to ask the second — is the caller's, known
  before either.

**Four round trips now, from ten.** Confirmed against the live deployment: it
was 4,123 ms and is 1,038 ms.

**And an ordinary read went from eleven round trips to five**, on two findings
that are about the platform rather than any product:

- **The notification channels cost two sequential round trips on every request,
  and one operation in the deployment reads them.** Answering "what can this
  deployment deliver on" reads the mail configuration and then the push keypair;
  it was resolved while BUILDING the context, so every list, every screen and
  every save paid for it. It is asked now, not handed over.
- **The wall re-read the roster row the identity had just resolved permissions
  from, and the app list `Located` was already carrying.** `platformRole` is one
  column of a row every request has in hand — the same argument the identity
  already makes, in writing, about `reach`.

**The shape a request should have, and the reason the budget is per operation:**
everything the door needs at once, then the wall, then the operation's own work.
`engine/one/test/request-cost.test.ts` holds the ceilings against the real worker
with a real workspace behind the real legal wall, and asserts a floor beside them
— a budget is met perfectly by a request that reads nothing.

**⚠️ AND THE FIRST VERSION OF THAT HARNESS MEASURED THE WRONG THING.** It counted
"a new wave begins when nothing else is in flight", which reports two chains
running beside each other as one wave however long each is — so it flattered
exactly the code it exists to catch, and reported `me.who` at two waves while the
live deployment spent four round trips on it. It holds every query for the same
lag and reads the wall clock now: total ÷ lag is the critical path, and it agrees
with production to within a few per cent. A latency metric that cannot be checked
against the thing it claims to measure is a number, not a measurement.

**Therefore never:** a value resolved while building a context that most callers
never read; a fact re-queried because it was passed as an id instead of as the
row it came from; a step ordered after work it does not depend on; or a
latency conclusion drawn from what a request computes rather than from how many
times it waits.

---

## D64 — Where a database goes is declared once, and both paths that make one read it

**Two paths create a database and only one of them knew the rule.** The
reconciler that GROWS a shard sets `jurisdiction` from the residency, and says in
writing that Cloudflare fixes it at creation — no edit, no migration, no ticket.
The workflow that makes the FIRST databases called `wrangler d1 create` bare, so
they landed wherever the runner happened to be, which for CI is another
continent.

**Measured, that is the whole of what is left of "slow".** With the icon (D60),
the boot (D61), the preflight (D62) and the request depth (D63) all fixed, every
operation is four to six sequential round trips at roughly 260 ms each against a
worker spending nine milliseconds of CPU. Nothing computes; it is distance.

**And the second consequence is not latency.** The deployment's own documents
say, twice: records are stored in the region the workspace was created for, and
stay there. A shard promised `eu` and created with no jurisdiction is a sentence
somebody agreed to that nothing enforces.

**Read replication is the wrong fix here, and that is worth writing down.** It
would put replicas near the request and remove the distance — but D1's automatic
mode places them across the whole network and takes no residency constraint, so
turning it on for an EU shard would move EU records out of the EU and contradict
the promise. Putting the PRIMARY in the right place is better on every axis:
the same latency win, no replicas, no bookmarks, no stale reads, and the promise
kept rather than worked around.

**So placement is derived from one declaration and both paths read it.** `HOME`
is where this deployment's records sit when nothing narrower was promised — a
fact about where the people who use it are, declared beside `SHARDS` rather than
defaulted inside a shell script, because a default nobody can see is one nothing
can check. `bind-ids.mjs --place` answers with the flags for a given database:
`--jurisdiction eu` for a shard promised EU residency, `--location <home>` for
the directory, which is cross-region by nature — accounts, sessions, and which
shard a workspace is on. Never both: Cloudflare ignores the hint when a
jurisdiction is set, so sending the pair is a promise that reads as kept in the
command and is not.

**⚠️ AND IT DOES NOT MOVE WHAT ALREADY EXISTS.** The databases this deployment
is running on were made before any of this. A wrongly-placed SHARD is already
solved — `op.tenant.move` carries a workspace to a correctly-placed one, one at a
time, with nobody else affected. The DIRECTORY is the one that cannot be moved
that way, and D65 is how it is.

**Therefore never:** a `d1 create` without a placement; a placement written into
a workflow rather than derived from the deployment's declaration; a jurisdiction
and a location sent together; or a residency promise that lives only in a
document.

---

## D65 — A copy is verified by counting rows, and the window it needs is read, not asserted

**The directory cannot be moved the way a shard is.** There is one of it, every
door reads it, and nothing can move a workspace off it — so relocating it is an
export, an import and a rebind, taken while nothing is writing.

**A copy taken from a live database is silently short.** Every row written after
a table was read is absent, with no error anywhere, discovered weeks later as
records that went missing. So the window is the maintenance switch — and the
workflow REFUSES to proceed unless it reads `readonly` or `full` out of the live
directory itself. An input saying maintenance is on is a claim by whoever typed
it; the switch is the fact. This is the same shape as every other guard here:
ask the system, never the operator.

**And the import reports the wrong thing.** `d1 execute --file` prints the
statements it ran, not the rows that landed — a truncated file, a failed
`CREATE`, and every silent `INSERT` after it all exit 0. So the copy is verified
by counting rows per table on both sides (`copied.mjs`), the table list comes
from the SOURCE so a table missing entirely is a refusal rather than a silence,
and `copied.test.mjs` feeds it each class of difference and requires the refusal.
An exit code from a tool that does not measure the thing you care about is not
verification.

**The order is the safety, and it is: rehearse, copy, verify, bind, deploy,
probe, THEN commit.** Rehearsing with nothing bound is what turns "how long will
the deployment be down" from a guess into a measurement, on the real data, before
anybody is waiting. Committing the id only after the deploy has answered `/health`
is what stops the next ordinary push re-pointing the deployment at a database
nobody has checked. **Nothing is ever deleted** — the source database untouched
is the rollback, and a revert is the whole of it.

**⚠️ AND A TOOL THAT PUTS ITS ERRORS WHERE ITS ANSWERS GO MAKES EVERY CALLER
SILENT.** `wrangler d1 execute --json` writes refusals to stdout, and every
caller captures that stream — into a shell variable, into a file, through a
pipe. So the first rehearsal exported, imported and then failed the VERIFICATION
step with exit 1 and an empty log: the reason had been captured into the file it
was meant to fill. A failure nobody can read is worse than no check at all,
because it reads as "something went wrong somewhere" and invites a re-run.
`d1.mjs` is the one asker; it reads both streams and prints the refusal with the
query that caused it.

**The query it refused was one that cannot succeed anywhere.** Every D1 database
carries internal tables under `_cf_`; `sqlite_master` lists them like any other
and every query against one is refused — so a table list built without excluding
them is broken on every database, always. That exclusion now lives in exactly one
place, and `d1.test.mjs` fails on a workflow that writes its own list beside it.

**And the counts are separate statements, never one `UNION ALL`.** SQLite caps
the terms in a compound SELECT and D1's ceiling is under the table count of a
real deployment: 36 tables were refused outright. Statements carry no such limit
— the import beside this one runs 365 — and `--json` answers one result per
statement, which is the shape already read. A union there is a verification that
stops working as the schema grows, which is precisely when it matters most.

**⚠️ AND A REHEARSAL THAT REHEARSES THE EASY HALF IS NOT A REHEARSAL.** The
relocation copied, verified, wrote the id — and then `wrangler deploy` failed on
a missing `one-space/dist`, at the end of a maintenance window, over something
with no connection to the database at all. An `assets.directory` is a filesystem
path rather than a package dependency, so nothing in the workspace graph connects
a deploy to the build it needs; the workflow simply never built it. Copying is
the step with a rollback behind it. Deploying is the step with nobody able to
work until it lands — so it is built first, in both phases, before anything
touches Cloudflare, and the rehearsal now runs `deploy --dry-run` so every way
the last step can fail is found while nothing is bound and nobody is held.
`shipping.test.mjs` fails on a workflow that deploys the worker without building
what it serves, and on a rehearsal that stops proving the deploy.

**⚠️ AND A RELOCATION IS ADDRESSED BY BINDING, WRITES BOTH HALVES, AND NAMES ITS
OWN TARGET.** Three faults, all of them the same fault:

- **The name is what this invalidates**, so it cannot be what identifies the
  subject. `DIRECTORY` and `SHARD_EU_1` are what the worker reads and never
  change; the database's name changes every time. A copy taken from the
  *configured name* is taken from whichever database that name still resolves to
  — which after one relocation is the superseded one. The source is the bound
  **id**.
- **A rebind writes the name AND the id.** Writing only the id left the config
  saying `one-directory` while the live database was `one-directory-eu`, and
  `wrangler d1 <anything> <name>` resolves against the account — so every command
  typed from that config reached a database that had been out of service since
  the window, with no error anywhere.
- **The operator does not choose the name.** Asked for one, a person picks
  something meaningful, and the first pick was `one-directory-eu` — which reads
  as a jurisdiction the directory deliberately does not have. Cloudflare's
  documentation is explicit that a location hint "does not set a jurisdiction",
  so the name claimed a regime the database was never created under and the
  dashboard correctly disagreed with it. `-g2` says the only true thing: which
  copy this is. The generation is stripped before placement, because
  `one-shard-eu-1-g2` is the same shard and a placement rule reading the name
  whole would refuse the very copy being made to correct a placement.

**Several databases go in one window, and none is bound until all are verified.**
A rebind per database with a deploy each would leave the deployment briefly
reading a new directory and an old shard, which is a state nothing is designed
for and nothing tests.

**Therefore never:** a copy trusted because a command exited 0; a maintenance
window taken on an operator's word; a new id committed before the deployment it
points at has answered; a source deleted in the same operation that replaced it;
a tool's output redirected somewhere a failure cannot be read from; a rehearsal
that leaves the step with a person waiting on it untried; a database addressed by
a name this operation changes; or a name that claims a regime nothing created it
under.

---

## D66 — The first paint has a weight, and nothing joins the first wait unbudgeted

**Today's arc ended at two seconds from fourteen, and every fix left a
measurement behind except two.** The icon has a drawing budget, the cold boot a
trip budget, the cache headers a guard, the preflight a test, the placement a
guard. Two things were fixed and then left free to come back:

**Nothing weighed the bundle.** `bundle.test.mjs` is structural — no page imports
a product, each product is a chunk of its own — and every word of that stays true
of a build that has since gained half a megabyte in the entry. A megabyte of
schema validator came out of that exact chunk (D58) and the person watching
noticed nothing, because nothing said what it had cost or what it may cost again.
`weight.test.ts` budgets what `index.html` itself blocks on: one module, one
stylesheet, **gzipped and raw**. They are different costs — gzip is the wait on a
slow connection, raw is what a phone parses before the first frame and it does
not compress.

**And the budget follows the build down.** A ceiling left far above what is
actually shipped stops being a ceiling: it absorbs the next regression in silence
and only bites long after the commit that caused it. Slack is capped, so making
the bundle smaller and NOT tightening the number is itself a failure.

**Nothing tied the depth budgets to the preflight.** Five operations are measured
against a real worker (D63), hand-listed. The preflight is the critical path *by
definition* — those requests leave before a byte of JavaScript has run and nothing
can be drawn until they answer (D62) — so a fourth question added tomorrow would
join the wait with no ceiling at all. That is the exact state `me.who` was found
in at ten round trips deep, with every suite green. `awaited.test.mjs` reads both
lists from the files that actually ship and actually run, and fails on a question
nobody budgeted. It measures nothing itself; it asks whether a measurement
exists, which is the question a list of five cannot ask about a sixth.

**`health` is the one exemption and it states its reason** — it answers from the
request's own hostname and touches no database, so a round-trip budget over it
would measure nothing. The exemption is re-checked against the page every run, so
it cannot be inherited by whatever takes the name next.

**Therefore never:** a performance fix without a number that fails when it comes
back; a structural check standing in for a weight; a ceiling left so far above
the build that it absorbs a regression instead of reporting it; or a request on
the first-paint path whose depth nobody stated.

---

## D67 — The tab's store is bounded, and stops being trusted when it stops being datable

**The question this settles is whether to add a query library, and the answer is
no.** Keeping an answer, coalescing two callers who want it at once, invalidating
it when a write makes it untrue, and revalidating it when it gets old are the
four things one would be for. Three were already the door's, and one of them is
better than the library's: **invalidation is DECLARED by the operation**
(`outcome.invalidates`), so a write says what it made untrue and the door forgets
it. A library would move that to every mutation call site, where forgetting one
is silent — which is the failure this repository is a catalogue of.

**And a second store is a real cost, not a hypothetical one.** `data.tsx` used to
keep a `Map` keyed exactly the way the door keys a request: two caches for one
question, reachable only from the screens that imported that page, so a product
mounted beside them got neither and paid for every answer again on every
navigation. Adding a library either puts a third store in or means rewriting the
door onto it, and neither buys anything that is not already there.

**What WAS missing is the fourth thing, and it is small.**

**The store only ever grew.** `forget` runs when a write says an answer is
untrue; nothing ran when an answer was merely old and unwanted. A long session
across workspaces, lists and narrowings held every payload for the life of the
tab — on a phone, memory a background tab is killed for, with nothing reporting
it. It is capped at 64 now, oldest out, which a `Map` gives for free: insertion
order is iteration order. Recency is kept by the FETCH rather than by the read,
deliberately — `known` is called during render, where reordering a store is a
side effect nobody expects, and it costs nothing because a revisit re-asks and
re-remembers on the way in.

**And a tab left open came back confident.** A phone locked in a pocket, a laptop
shut, a tab behind eleven others: it returned showing what was true when it was
last looked at, with nothing saying how old that was. The answers are now DROPPED
on returning after 90 seconds away, and on reconnecting.

**Dropped, never refetched, and that distinction is the whole design.**
Refetching on focus would fire every held key at once at the moment a tab wakes —
a thundering herd on the thing that just came back, mostly for screens nobody is
looking at. Dropping costs nothing: the mounted screen re-asks on its next
render and everything else is fetched if and when it is wanted.

**⚠️ AND NINETY SECONDS IS THE POINT, NOT A DETAIL.** Every tab switch is a
`visibilitychange`, so dropping on each one turns a glance at another window into
a refetch of the visible screen — a round trip a person watches, for an answer
that was seconds old. Watched, never polled, exactly as `online` is: the browser
says when this changed.

**Therefore never:** a client cache added beside the door's rather than in it;
invalidation moved from the operation to the call site; a store with no bound; a
revalidation that fires every held key at once; or a wake-up rule that cannot
tell being away from looking away.

---

## D68 — A tab switch is not a journey, and only the journey still running may land

**Reported as: navigation takes several taps, then goes stubborn, and the bar
behaves oddly.** Two lines caused all of it, and they made each other worse.

**Every tap on the bar ran a hierarchical push.** `wayTo` had no answer for a
sibling — `/inventory/stock` → `/inventory/scan` is neither a prefix of the other
and both are two deep — so it fell through to `forward`: a full
`startViewTransition` at `DURATION.page`, on the move somebody makes dozens of
times an hour, to say something they already know. They pressed the thing that is
now lit.

**And the duration is not the worst of it.** The tree is swapped inside the
transition's callback while the browser goes on showing a picture of the screen
being left — so for the whole animation a tap lands on the NEW screen's controls
under the OLD screen's image. Speeding the animation up would not fix that: the
mismatch is the mechanism, not the pace.

**The second tap corrupted the first journey.** Every call registered its own
tidy-up on its own `finished`, and an interrupted transition REJECTS — so
pressing again made the abandoned promise settle immediately and the tidy-up ran
in the middle of the journey that replaced it: the direction stripped off the
root mid-animation, every held animation finished early. The more somebody
pressed, the worse it got, which is precisely how it was described.

**So a lateral move has an answer of its own, and it is instant.** A push earns
its transition — it says where a record came from and how to get back. A move
between two addresses under one parent has nothing to say, so it says it
immediately. It takes the same lane as a browser with no view transitions and a
person who asked for less motion: one path for "change the screen, now", so the
fast case cannot rot while the decorated one is maintained.

**⚠️ THE SAME PARENT, NOT MERELY THE SAME DEPTH.** `/space/console/keys` and
`/space/w/acme` are both two segments deep and are not siblings. Giving that a
tab switch's silence would take the one move that genuinely changes place and
make it invisible.

**And the back gesture agrees with the tap.** The addresses decide laterality;
the history step decides direction. Answered from the step alone, the same move
was silent one way and animated the other.

**Therefore never:** a repeated move paced like a rare one; a screen swapped
under a picture of the screen it replaced, for longer than a frame; a
cleanup registered per attempt rather than per current attempt; a second caller
of `startViewTransition`; or a second place that decides which way a move goes.

---

## D69 — Nothing reads the camera with the thread a person is waiting on

**D68 fixed the transition and the navigation was still stubborn**, which is the
useful part of this entry: a diagnosis that is right about one cause can be
completely wrong about the cause somebody is actually feeling. The recording that
proved it was taken three minutes after the fix shipped — the tab even reloaded
onto the new build on camera — and the Scan screen still held for four and a half
seconds through five presses.

**The scanner read as fast as the phone could manage, for as long as the screen
was open.** The loop awaited its previous decode — which is what stopped it
queueing up, and is exactly why it read as careful — and then asked for the next
animation frame immediately. A decode of a full-resolution frame is tens of
milliseconds on a phone; back to back, that is the main thread.

**And the symptom was never a slow scanner.** It was everything else queueing
behind it. A tap on the nav paints its ripple from the compositor and then sits
there, because the handler that would answer it cannot run. On the recording the
press marks are visible on the bar, one after another, while the screen does not
change — and the camera indicator in the status bar goes out at the exact moment
the next screen finally appears.

**So a decode has a cadence somebody chose: eight a second.** That is not a
compromise. A person points a phone at a label and holds it there; the code is in
frame for a second at least, which is eight chances. Sixty was never about
reading sooner — it was about nobody having chosen a number.

**And the frame handed to the decoder has a size.** Unasked, a phone gives the
sensor's full picture: four times the pixels and four times the work per read,
for a barcode legible at a fraction of it. The cadence caps how OFTEN; the size
caps how MUCH, and a decode that overruns its own gap makes the cadence a wish.

**⚠️ THIS IS D60 ONE THREAD OVER.** Drawing is what spends a worker's only
thread; decoding is what spends a phone's. That one was found because the CPU
figure was in a log somebody could read. This one had nowhere to show up at all —
no metric, no error, no failing test — which is why the rule is a guard rather
than a paragraph, and why it asks of EVERY decode loop rather than the one that
was wrong.

**Therefore never:** a loop that runs as fast as the device allows; a cadence
declared and not compared against; a decoder handed a frame whose size the device
chose; or a diagnosis closed on the first cause found when the person reporting
it can still reproduce the symptom.

---

## D70 — A design rule is a guard or it is not a rule

**A skill file was read end to end** — seven prompt documents, ~340 KB, that
constrain an agent generating premium UI. Its results are good and its structure
is worth naming: read the reference, extract the signals, build against the
extraction, diff the output. What it cannot do is hold. Its own README carries a
table headed *"Agents drift back toward the mean over long conversations"* whose
remedy is to reply *"you ignored the skill file."* That is the whole argument for
the shape this repository already has: a rule that lives in a context window is a
rule for as long as somebody keeps saying it.

**Four of its rules were true, checkable, and absent here**, and each is a guard
now rather than a paragraph:

- `transition: all` names no properties, so it animates paint as well as
  composite — and, worse, nobody can say what it covers, so it outlives the
  feature it was written for. It had, by six weeks.
- A hand-written `:hover` outside `@media (hover: hover)` is a state a touch
  screen enters on tap and never leaves.
- A timing function that is a CSS keyword is the curve nobody chose.
- The size a chart sets is type, in a coordinate system the type guard could not
  see. Seven sizes, three jobs.

**Four of them were rejected, and the reasons are recorded so they are not
re-argued.** An *animation coverage mandate* — "every visible element gets
motion; a static element in an animated page is a dead pixel" — is the exact
inverse of D-still-by-default, and the reader it serves is somebody browsing a
hero rather than somebody working. A prescribed palette of warm off-whites and
named display faces is one year's taste stated as law, and it produces the
sameness it claims to fight. A quality gate the model fills in about its own work
is not a gate. And nothing in it addresses an empty state, a refusal, a wait, or
a second theme — which is most of what a working product is.

**The one thing worth taking was not a rule at all: measure, then compare.** The
type-scale reading exists because of it, and the first thing it measured found a
package setting seven sizes for three jobs, in four files, every one of them
defensible where it was written.

**Therefore never:** a design rule stated only in prose when it could be checked;
a quality gate whose verdict is self-reported; a palette or a typeface prescribed
as a rule rather than chosen as a decision; a coverage mandate that spends motion
on a screen somebody uses all day; or a guard scoped to the file the fault was
found in.

---

## D71 — Every write says what happened, or says why it does not

**`outcome` was optional, and optional meant fifteen of fifty writes said
nothing at all.** Not because anybody chose silence for them — because a field
nobody has to fill is a field that stays empty. Somebody pressed a button, waited
for a round trip, and the product's answer was that the screen looked the same.

**The confirmation belongs to the DECLARATION, not to the screen that pressed
it.** The page holds no manifest (D17), so a sentence written where the button
lives is a sentence the declaration cannot see — and two screens calling one
operation are then two answers to what just happened. `outcomeBook` hands the
whole map to the browser at boot; `whenWritten` routes it to the notice channel
by tone and forgets whatever the operation said it made stale. That half was
already built. What was missing was that anybody had to use it.

**And silence is often right, which is why the escape is a sentence rather than a
flag.** An operation whose whole answer is the thing it returns has already
reported itself — an AI lane, an import preview, a draft that lands in the
editor. A tally pressed once per item on a shelf is forty toasts a minute. Each
of those is a decision somebody should make on purpose and write down; what is
never right is the third state, an operation nobody decided about.

**It is the same shape `audit` and `tool` already use**, for the same reason, and
that is most of the argument for it: `A | { why }` was chosen years earlier
because a previous platform made audit opt-in and twenty of its own writes were
recorded nowhere with every suite green. This is that lesson applied to the half
a person can actually see.

**`refuseOperation` is where it bites**, beside `unrecorded_write`, so a manifest
that composes is a manifest where every write reports — and a `why` shorter than
twenty characters is refused too, because "n/a" is how a required field becomes
optional again.

**Therefore never:** a write with no `outcome`; a confirmation written in the
screen that pressed the button; a silence that is a blank field rather than a
stated reason; or a reason that is a label.

## D72 — A duplicate is refused on a fact and asked about on a resemblance

**A catalogue fills with duplicates one careful person at a time.** Somebody
searches "gloves nitrile" in a hurry, finds nothing, and adds a second row; from
then on half the stock lives under one and half under the other, every report is
wrong, and neither row is obviously the mistake. Nothing failed. Nobody was
careless.

**So the check has two halves, and they are not the same kind of thing.** A
barcode names one product — a second owner makes every future scan of that string
ambiguous, and the resolver answers with whichever row it read first, wrongly, for
ever. That is a FACT, so it is refused, and no "register anyway" may wave it
through: a person may not press past a fact. A name that looks like another name
is a QUESTION, and "yes, two brands make this" is a real answer, so it is put in
front of somebody while they are still typing rather than after they have filled
in a form.

**`product.resembling` is a READ for exactly that reason.** Refusing the write
instead would be a form somebody fills in completely and is then told to throw
away, which is how people learn to press past a warning without reading it. It is
cheap enough for a keystroke, debounced to the letter that matters, and it
separates "same name and brand" from "similar name" — conflating them makes the
strong signal weak, and a false match tells somebody their new product already
exists when it does not.

**The write keeps a backstop, and only for the certain half.** A queued write
replaying after a day offline, an agent, a second tab: none of them saw the list.
`inventory.resembles` is retryable, because the retry is the same request with
the answer in it.

**The normaliser is deliberately blunt.** An EAN-13 and the `(01)` of the
DataMatrix on the same box differ by a leading zero, so codes are padded before
they are compared or stored; names are lowercased and stripped to words, and
nothing cleverer. An edit distance starts calling different products the same
one, and this check exists to be believed.

**Therefore never:** a barcode learned for a second product; a resemblance
reported only after a form is complete; one sentence covering both halves; or a
matcher clever enough to be wrong about things that are genuinely different.

---

## D73 — A form that scrolls is a page, and a prop does not fix it

**A drawer is sized by what it contains, and that is the whole problem.** The
library's bottom drawer is `max-h-[85vh]` with AUTO height: it grows as fields
appear, crosses the ceiling and comes back as somebody works, and its container
tracks the VISUAL viewport, so on a phone it also moves when the URL bar
collapses under the thumb. Nothing is broken — the component is behaving as
specified, over content it was never the shape for.

**So a tray holds a question the size of what it asks** — a confirmation, one
field, a supplier's three — and anything that scrolls is a page. Registering a
product is seven sections, six photographs and a model's reading of them; it is
not a question, it is work.

**A fixed height was tried first and it is the wrong fix.** It stops the resize
and keeps everything else: no address, no back, no way to link to it, a footer
competing with the keyboard, and a surface that is a page in every respect
except the one that would let a reader treat it like one. It also lands as a
prop on a shared component, so the next long form gets a supported way to be the
wrong shape.

**The test is whether it deserves an address.** A form somebody spends a minute
on can be linked to, reloaded, shared and returned from — and everything that
wants to send somebody there (a checklist step, an empty state, a scan that
found nothing) wants a destination rather than a flag threaded down through the
screens between. If more than one surface would open it, it is a page.

**Therefore never:** a prop that makes a tray tolerate being too big; a form in
a drawer that scrolls; or a surface more than one place wants to open that has
no route of its own.

## D74 — "On" is not "the action", and one token was doing both

**The mono rule says the interface is values SO THAT colour becomes information.**
Obeyed to the letter it produced the opposite: HeroUI paints a checked switch, a
ticked box, a chosen radio, an open tab and a slider's travelled part from
`--accent`, which is also the primary button — and our `--accent` is monochrome
on purpose, because the near-white button at the foot of a screen is the one call
to action. So every state inherited the mono rule and a person could not tell a
switch's state at a glance, which is the exact failure the rule exists to prevent.

**So `--on` is the product's hue and `--accent` stays the action.** "This is on"
is information in the most literal sense the product has. The library hardcodes
its accent inside its own component rules, so the seven places are bound by
selector; where it exposes a token on a component root, the token is set instead.

**The focused field is the same decision one step quieter.** `--input-bg-focus`
is `var(--default)` — byte-identical to a resting field — so typing changed
nothing but the ring. `--on-lit` is a fifth of the hue over the field tier: a
lift, not a fill, because a fill here is a text field the colour of a button.

**What this forbids:** binding `--accent` to a hue to fix a state. It colours
every state AND the primary button, and a screen whose loudest thing is no longer
the thing to press is worse than the fault being fixed.

## D75 — A refusal that reaches nobody is a control that does nothing

**`if (!got.ok) return;` passes every check in this repository.** The types are
right, the `Problem` is handled — it is checked, which is what `ok` is for — and
the branch that drops it is one line that reads like caution. Nine of them were
in one file. What a person sees is a button pressed, a spinner stopped, and the
same screen back.

**So every mutation reaches somebody on both outcomes**, through one channel
(`telling.tsx`) mounted by `Shell` so an app gets it without wiring anything.
Four products each growing their own toast is four rhythms, four placements and
four ideas of what a failure looks like, and the one that skips it is the one
where a five-minute form ends in silence.

**`failed` takes a `Problem`, never a string.** The sentence is the one the
runtime already wrote where the refusal was made; a caller composing its own is
inventing wording for a refusal it did not make, and the two drift.

**Four doors count as reaching somebody**: the channel, a `Loaded` trouble state,
handing the whole problem on, and RETURNING an answer by value — a function that
answers `"refused"` is reporting to the caller that has a screen to say it on.
What is silent is a bare `return`, which ends the work and tells nobody.

**What this forbids:** a bare return in a refusal branch. `spoken` fails on it.

## D76 — A packaging level is a named multiplier, never a product

**A box of thirty tablets is one product, not two.** Declaring each rung of a
packaging ladder as its own record — carton parent of box parent of sheet parent
of tablet — is the intuitive model and the wrong one. It splits the balance
across levels, so "how many are there" stops being a sum and becomes a tree walk
that every reader has to get right; it multiplies `batch`, `code`, `stock`,
`ledger`, `item` and `kit` by the depth of the ladder; and it forces the lot
number printed on a box to belong either to the box, so a tablet cannot be
recalled, or to the tablet, so the box row bought nothing.

**So stock is only ever counted in one base unit, and a level is a name with a
multiplier.** `product.levels` is an ordered list; `per` is per the rung BELOW,
because "a box holds 3 sheets" is what the person entering it knows and "a box
holds 30 tablets" is a multiplication they should not be doing. A shelf holds 600
tablets however they arrived, so there is nothing to break open, no
partial-carton state, and no second balance to disagree with the first.

**It exists because the blister sheet had nowhere to live.** A sheet inside a box
carries no barcode, so it can never be a `code` — the only carrier the model had.
Anybody issuing by the sheet typed 10 every time and hoped.

**The multiplication happens exactly once, on the server.** A client sends a rung
NAME and never a number: a stale screen holding last week's ladder would
otherwise move a different amount than the one printed on it. And a rung the
product does not declare is REFUSED rather than read as one — falling back to a
single receives a carton as one tablet, which is a wrong number nothing
downstream can detect, because one is what a real entry looks like.

**Nesting is right where a level has its own identity and lifecycle** — a
serialised pallet, a returnable keg, a surgery tray. That is `item` and `kit`,
which already exist, and the line between them is clean: a pack is N of the same
thing and is a unit of measure with no identity; a kit is a group of different
things that has one.

**What this forbids:** a `parent` column on `product`, and any second balance
keyed on a level.

## D77 — Moving stock is a verb of its own

**A transfer is not a consumption.** Carrying a carton from the back store to a
ward shelf as a take plus a receive puts the whole carton into the usage report,
so "we used 600 tablets this month" becomes a sentence about a trolley — and the
one measure that says how fast stock actually goes is made partly of stock that
went nowhere.

**It is two rows sharing one cause, not one row naming both ends.** A transfer
genuinely changes two balances and `stockMove` is the one function allowed to
change one: it checks the shelf this person may touch, the batch's quarantine,
the shortfall and the compare-and-set. A single-row transfer would be a second
implementation of all four, and a second implementation is where they drift. The
pair share a transfer id in `against`, which is the question that column already
answers — what caused this.

**The source is debited first**, because "there is not that much there" is the
ordinary way a transfer fails and failing it before anything is written means the
common refusal touches no rows. The rare far-half failure compensates the source
before re-throwing the original problem; there is no transaction across these
statements, and the alternative is stock that simply stopped existing.

**An undo reverses the whole movement.** Undoing one half puts the stock back
where it left AND leaves it where it arrived — the same boxes counted twice, from
a button whose entire promise is that nothing happened.

**What this forbids:** recording a shelf-to-shelf move as `taken` plus
`received`, and an undo that reaches one half of a pair.

## D78 — Some fields are set once, and the write is what says so

**A product's unit is what every other number is counted in.** Edited from "box"
to "sheet" it rewrites the meaning of every balance, every movement and every
report — twenty boxes on a shelf become twenty sheets — without one write going
anywhere near a quantity. The generated update is a column setter and has no way
to know that; it did exactly this, and nothing anywhere said a word.

**So the declaration carries it and `patch` refuses.** `FieldSpec.settled` marks
a field that may be given a value at create and never changed by the generated
update. Not "the screen does not offer it" — a screen's rule is a courtesy, and
these fields are reachable from an agent through MCP, from the API, and from a
queued write replaying after a day offline.

**`records.ts` is the only place it can hold.** The door's own input check skips
generated operations by design, so dropping the field from the generated update's
declared input hides it without refusing it. The generated update does drop it —
an agent offered a key that is always refused will keep sending it — but that is
politeness, not enforcement.

**Refused, never silently dropped.** Ignoring the key answers 200 over a change
that did not happen, which is D75 one table over. The refusal carries the field
names so the sentence lands under the control the caller touched.

**Changing one is a real thing to want, so it gets an operation that knows what
else has to be true.** In OneInventory that is `product.recount`: the unit is
refused once any stock OR any movement exists — an empty shelf still has a ledger
full of numbers in the old unit — and the rung may only go DEEPER, which is
`promotes`, a function that was written, tested, and called by nothing until this.

**Converting instead of refusing was considered and rejected.** The factor is a
guess only the person has, a wrong one is undetectable afterwards, and there is no
undo. Before anything is counted the change is free, which is when somebody who
mistyped it actually notices.

**What this forbids:** a settled field in a patch, and a generated update that
advertises one. `settled` fails on both.

## D79 — A design guard that spares the apps is a guard about the wrong tree

**`metrics` swept `design/src` and nothing else.** That is the package where the
rule is least likely to be broken: it is where the scale lives, and everybody
editing it can see the file. The screens that actually get written are in
`apps/`, and there a hand-picked `gap-3` was invisible.

Widened, it found seven — including two strips in one screen that had
**re-implemented `Rail`** by copying its bleed, snap, gutter and gap out by hand,
and both wrote `-mx-4 … px-4`: right on a phone and eight pixels short from `md`
up, where the page gutter is 24. Nothing failed. A horizontal scroller simply
stopped short of the edge it exists to run off, on desktop only.

**The fix was not a token, it was a prop.** `Rail` had one fixed item width, so a
screen wanting a narrower card rebuilt the component instead of using it — and
`Band` had no vertical padding at all, so two screens wrapped their child in a
`py-2` div and agreed on the number. A primitive that cannot express the second
case is a primitive people copy. `Rail` takes `wide` from a closed set; `Band`
takes `inset`.

**And a widened guard finds bugs in itself first.** Two of the first nine
findings were `{ id: "p-1" }` in a screen's own sample data — a record id that
looks like padding. The pattern now only reads inside `class`/`className`.

**What this forbids:** a guard over the shared tree that does not also read
`appDirs()`. The rule it enforces is about screens, and the screens are in the
apps.

## D80 — A multi-step flow asks questions and says the answers back

**The cost a wizard usually imposes is training, and it never appears in a diff.**
OneInventory's register sheet was four steps, each a HEADING over a group of
fields: "What it is", "Barcodes", "Counting", "Keeping". Under the third of them
sat `Tracked as: [Listed] [Counted] [Batched] [Itemised]` — the most
consequential field on the product record, offered as four words nobody can
choose between without being taught. Taught is an induction, a wiki page, and a
person in the warehouse who knows. All three are paid for per customer, per new
employee, forever.

**So a step is a question, and the answer is repeated in the same words.** "How
closely do you follow it?" — and the moment somebody chooses, *"Each delivery is
kept apart, so you can expire one or recall one"*. That is not help text: help
text sits under a field explaining a word. This is the app restating the decision
in the language the decision was made in, which is the only explanation nobody
has to be told to read.

**One string does both jobs, and that is the mechanism rather than a
convenience.** `says` is the live echo under the control AND the line in the
recap of everything answered so far. Written twice they drift the first time
somebody edits one — and a recap that disagrees with the screen it summarises is
worse than none, because it is the half people trust.

**The recap is also the navigation, which is what makes a model's answer
checkable.** Six photographs come back as a name, a brand, a unit, a rung, a
shelf life and four filing words: twenty fields over nine screens, which nobody
audits. As eight short sentences, each one press from the step that owns it,
checking becomes reading.

**A step that does not apply is skipped, never disabled.** `when: false` takes it
out of the flow entirely — out of the count, out of the dots, out of the recap. A
greyed-out step is a question somebody has to work out they are not being asked.

**And the flow owns the phone's back gesture, once.** Forward pushes an entry,
`popstate` steps back, the first step pushes nothing so the Nth Back leaves.
Written per flow that is four subtle rules and most flows get one wrong; the
failure is somebody on step five making the gesture that means "undo the last
thing" and losing five screens of typing. The entries carry a marker rather than
a URL, because the steps are ONE screen — a URL each would make every step
shareable, bookmarkable and reloadable into a form with nothing in it.

**The existing history guard could not see any of this.** `travel.test.mjs`
derives its files from `engine/<dir>/src/main.tsx` — the browser halves with a
router of their own — and an app under `engine/apps/*` has none, because it is
loaded BY one. Every screen in every product was outside it, and the register
sheet wrote raw `pushState` calls with the whole gate green.

**What this forbids:** a step headed rather than asked; a step with no clause; a
screen that hand-rolls the dock's Back; and history written anywhere but the
router and the flow.


## D81 — A flow is declared in the manifest and drawn in a screen

**Two hand-typed strings in two files, with nothing checking they matched.** A
screen declares `permission: "product:write"`; the flow inside it declares
`op: "product.register"`. Nothing proved the second demands the first — so a
wizard could take somebody through ten questions, past a gate that said yes, and
be refused by the write at the end. That is the offer-and-refuse failure the
whole `op` mechanism exists to prevent, reproduced one level up.

**So `ScreenSpec.story` declares the SHAPE and never the controls.** What a flow
asks, in what order, to reach which write — every one of those is a fact about
the product worth knowing outside the browser. The controls cannot be declared
and should not be: a camera, a barcode viewfinder and a packing editor are not
fields, and a manifest that could express them would be a second React.

**What it buys is agreement, not generation.** The screen still draws itself;
`scripts/story.test.mjs` proves it draws exactly what was declared, that `writes`
names a real operation, and that a step puts its id directly above its question
so the comparison can be made at all.

**And the declaration is READ, which is what stops it being ceremony.** The agent
door appends the questions to that operation's tool description: `product.register`
takes twenty fields, and what the screen does is ask ten plain ones in an order,
half of which vanish on a single answer. An agent given only the field names is
guessing at exactly the reasoning the flow already encodes — including which
fields nobody would ever be asked for.

**What this forbids:** a story declared and not drawn, drawn and not declared,
pointing at an operation the app does not have, or a step whose id is written
somewhere the guard cannot read it.


## D82 — A manifest is built when something asks for it, not when the module loads

**Composition was lazy and construction was not, and the check that caught the
one could not see the other.** D4 put `compose` behind a request, so a deployment
serving several products pays for the one it is answering. But the manifest
itself was a top-level `const`, so `defineApp` built the literal and ran the
whole refusal suite — the collections walk, reachability, the roles walk, the
ladder — on every cold isolate, over declarations that cannot have changed since
the deploy. Measured at 0.43 ms for one product; the shape is what matters,
because it is per app and cold is the ordinary case (D61).

**The literal moved inside the thunk the deployment already calls**, and the
thunk memoises: lazy so a product nobody opens is never built, once so the four
browser modules that ask for one product's manifest build one between them.

**The trade is when a mistake surfaces, and it is a real one.** A broken manifest
used to fail at boot; it now fails on the first request that composes that app.
That is the better side because nothing here waits for a person to notice —
`refuseApp` runs over every app's real manifest in its own suite, and every
deploy probes `/health` before it is called done — but it is a change, not a free
win, and it is the reason this decision has a number.

**What this forbids:** a manifest declared as a top-level `const`, in any app.
`scripts/apps.test.mjs` fails on a `defineApp` at column zero, beside the check
that already fails on a `compose` there.


## D83 — The split D3 describes has not been taken, and the trigger is startup CPU

**D3 is written in the present tense about something that does not exist.** "`ai`
and `notify` are separate workers reached through service bindings with RPC" —
`one/wrangler.jsonc` declares no `services` block, `Env` carries no service
binding, and it is the only wrangler config in the tree. Generation and mail run
in-process, in the one worker, today.

**The reasoning in D3 is right and the seam is built.** `runtime/src/services.ts`
is written for exactly that boundary, so taking the split is a wiring change
rather than a rewrite. What was wrong is only the tense — and the tense is what
makes it the worst kind of stale entry, because D3 is the decision somebody
consults to answer "have we already split, and when should we?" and it answers
the first half wrongly.

**So the trigger is recorded here rather than left to judgement.** Split when the
AI catalogue, the provider clients, the MIME builder and the push encryption start
showing up in the cold isolate's parse — the number `one/test/cold-cost.test.ts`
and `one-space/test/weight.test.ts` between them already measure. **Never for
size**, which SPAs do not count against a worker because they ship as assets, and
**never for separation of concerns**, which the module boundaries and the boundary
guard already give at compile time and for free.

**Therefore never:** a service split argued from anything but a measured
startup-CPU number; a service-to-service call made with `fetch` where a binding
exists; and D3 read as a description of what this deployment runs.


## D84 — A clause reads back to somebody who has left the step, not to somebody standing on it

D80 gave `says` two jobs: the line in the review, and a live echo under the
step's own controls. The second one was wrong and shipped.

**A restatement an inch below the control still showing it is a screen talking
about itself.** On a step with one field the sentence is longer than the answer
it repeats; beside it a tick reads as a verdict on something nobody has finished
doing; and it appears on every step of every flow, so the pattern is not one
screen's mistake but the frame's.

**The clause is unchanged and so is the reason for writing it once.** It is the
review's line, built from the step that owns it, which is what stops a summary
disagreeing with the screen it summarises. What is removed is the second drawing
of it — and the test of whether an answer should be visible while it is being
given is now direction rather than repetition.

**Where a step does want the answer in front of somebody, it ASKS with it.**
`Fills` is a sentence with one blank — *we have twelve **boxes** of nitrile
gloves* — and the blank is the live answer. Same words, opposite direction: one
confirms a decision already made, the other is the question, and the question is
what makes the right answer obvious before anybody has to be taught the field.

**Therefore never:** a step that states its own answer above or below the control
that sets it; a tick against a question in progress; a review line written
anywhere but on the step it belongs to.


## D85 — The interface is a warm material with one hot mark on it

Three people shown this product named the same fintech without being asked. They
were right, and the reason is three defaults nobody here ever chose: a
zero-chroma neutral ladder, the library's blue as the deployment's colour, and a
0.5rem corner. None of the three was a decision — each was what the framework
shipped, kept because changing it would have changed something visible during a
refactor that was meant not to.

**So the direction is named, and it is three claims a screenshot can be held
against.**

**The interface is a warm material.** Every neutral in the ladder carries one
hue at 0.010 chroma — below the threshold at which anybody would call a surface
brown, above the one at which a screen feels made of glass rather than of
something. It fades out at the top so a light card stays paper while the page
behind it stays warm, and the difference between them is what makes a card read
as laid ON something rather than cut out of it. Zero chroma is not neutrality; it
is the specific choice every dashboard of the last five years made together.

**One thing on a screen is hot, and it is never a control.** The interface is
values — a button, a field, a focus ring is a lightness, not a hue (D7's mono
rule, unchanged). What carries colour is the ground, the state of a control that
is ON, and the data. The deployment's own default moved from the library's blue
to a warm orange at the identical lightness, so every contrast relationship
measured against `L=0.6204` still stands and only the hue moved.

**The corner is generous, from one number.** `--radius` is 0.75rem, and the
library derives its entire ladder from it — so every card, field, modal, drawer,
tab and table in the product follows, including the ones no screen here draws.
0.75 is the largest value that keeps the ladder a ladder: HeroUI clamps its own
surfaces at 32px, so at 1rem three ranks of surface collapse onto one number and
the product gets flatter as it gets rounder.

**And the type ladder is 32 / 20 / 16 with the top rank a weight heavier.** At
28px semibold a screen title was one step from a section heading in size and no
steps in weight, so a screen with two sections read as three pages stacked.

**Therefore never:** a neutral with no hue in it; a hue on a control, a button or
a focus ring; a `rounded-*` class set on a component to correct its shape, which
is the theme being edited from the outside and takes a workspace's branding with
it; and a colour claim checked with HSV saturation, which divides by lightness
and so reports the identical cast as six times stronger on a dark surface than on
a light one.


## D86 — The dock is a plate again, and it is dark in both themes

The nav lost its plate for a measured reason and the reason was only half
right. A capsule the width of its own content left the page's next row visible
in the gaps either side, sliced by the capsule's rounded ends — a face cut in
half down the gutter, a heading reappearing beside the bar. What fixed that was
the HEM: full width, on the `nav` rather than on the bar inside it, dissolving
the content before it arrives anywhere. Removing the plate as well was one
change past the fix, and what it left was four grey glyphs and a white one
standing on the page, which is honest and reads as unfinished.

**So the plate is back and the hem stays.** The collision is solved by the thing
that solved it; the object is solved by the object.

**And it is dark in both themes, which is the property worth having.** A step
lighter than a near-black ground so it separates, a long way darker than a cream
one so it reads as hardware laid on the page rather than as another card. Both
readings are the same reading — a floating surface goes AWAY from the page —
and because the plate is dark either way its ink is near-white either way. The
dock is one object, not two that share a shape. Three things fall out of that
for free: the halo under the active destination is one strength instead of two;
a destination can be a CIRCLE, because on a plate a round item is a hole in a
surface rather than the ring around a glyph that D7 refuses; and the four ink
channels on it are four numbers instead of eight.

**It is off the elevation ladder on purpose.** Every tier in `GROUND` is a step
in one stack — a card over a page, a control over a card. The dock is over all
of it, always, on every screen, and giving it a rung would mean choosing which
content it is one step above. The answer is all of it.

**The act moved out of the plate, and that gave the bar its word back.** Inside,
the two shared one label's worth of width, so `open = isHere && !act` blanked the
answer to "where am I" on every screen with something to do — which is most of
them. Beside it they are two objects with two jobs and neither has to yield.

**Therefore never:** a fill on the crown or the hem, which ARE welded to an edge
and where a plate draws the hard line the vignette exists to avoid; a dock
painted from a card tier, which is a white slab in the light theme; a dock that
states a fill and no ink, which is a near-black glyph on a near-black plate that
every contrast check in this repository would pass, because they all measure
against the page; and a pill inside the plate, which is a plate on a plate.


## D87 — Two data marks the vocabulary was missing: a position, and a texture

**`Ring` answers "how much of the limit", and nothing answered "where in the
range".** Those are different questions and only one of them has a zero. A cold
room runs between 2°C and 8°C; a ring of that is "65% of 8", which is arithmetic
nobody performs and which a reader would then have to undo. `Arc` is the open
form: a value between two stated bounds, the bounds printed under its own ends,
the number in the middle, and a knob where the value landed.

**The opening is the whole argument.** A closed track says "there is a whole here
and this is a part of it". An open one says "this is a scale and it has two
ends", which is what a floor that is not zero requires. The gap goes at the
BOTTOM — an arc opening at the top is a ring with a bite out of its crown and
reads as damage — and it is 0.28 of a turn, which is wide enough that the ends
read as ends and narrow enough that the mark still reads as round.

**It is `Arc` rather than `Dial` because `Dial` is a control.** The slider in
`forms.tsx` has that name and has had it longer. `Ring` and `Arc` also say the
difference on their own: closed is a ratio, open is a position.

**And the meter's fill is ruled rather than flat.** A meter said one thing with
colour, and colour is the channel that fails first — colour-blind readers, a
printout, a phone in sunlight, a forced-colours mode. Ruled ink says "this part
is spoken for" with geometry, which survives all four, and the hue still carries
severity on top of it for everybody else. Two pixels of ink in every five, which
is bounded on both sides: finer and a phone's rounding drops whole strokes, so
the same bar is ruled on one device and grey on another; coarser and the bar
reads as a row of ticks rather than as a filled length.

**Therefore never:** an `Arc` where the floor genuinely is zero, which is a
`Ring` with a gap in it; an `Arc` with unlabelled ends, which is an angle with no
scale to put it on and is the whole failure mode of a gauge; a knob that can be
dragged, which is a control and needs a `slider` role, a step and a commit; and a
hatch fading toward `transparent`, which is transparent BLACK and puts a grey
haze over the ruled part of a light card.

---

## D88 — Magnitude carries the brand, identity never does

**A single series is magnitude, and magnitude is `--data`, and `--data` is the
workspace's own colour.**

`palette.ts` has always said this: identity is the platform's and magnitude is
the brand's. The categorical eight are eight fixed hues in a fixed order,
validated to stay separable under protanopia and deuteranopia — a workspace that
recoloured them would be a workspace whose charts a colourblind reader cannot
use, and nothing would report it. Magnitude has no such requirement, because
there is nothing to tell apart.

**It stopped being true when the accent went monochrome.** `--data` was
`--accent`, and a grey magnitude ramp and a grey de-emphasis are the same
language on one plot — so it was cut loose to a fixed hue and left there.
`--brand` is where the accent's colour went; this is where the data belongs.

**And a lone series was still asking the identity question.** A plot with one
line on it does not ask "which of these is which", but it was handed slot 1
anyway — so every single-series chart in the product was painted the first fixed
hue: a colour chosen for its distance from seven others rather than for anything
about the page it is on. Measured on the reports screen, a lone trend and a lone
ranked bar both came out in a hue the rest of the interface does not contain.
`seriesOf` is the rule, and the legend cannot disagree with it because there is
never a legend below one series.

**The brand is somebody else's choice, so the contrast is not left to it.** Pale
yellow on a near-white page and deep navy on a near-black one are both a chart
line nobody can see, and neither is a state a workspace can be expected to
notice. A fixed share of the ground's opposite end guarantees the DIRECTION of
the contrast without hand-picking a value per theme — which is the half a
selected pair could not do once the hue stopped being ours.

**Therefore never:** a branded categorical slot; a validated palette re-picked
for taste; a lone series in an identity colour; or a `--data` taken from
`--brand` raw, which is a chart that disappears on some workspaces and on no
deployment anybody tests.

## D89 — One ladder, and a rung has to reach the page

**Every size in the product is `1 × 1.25ⁿ`, named by a rank, and no file outside
`type.ts` may write one.**

The roles were right and their sizes were ten literals in six mechanisms —
`text-sm`, `text-base`, `text-xl`, `text-2xl`, `text-6xl` and four bracketed
rems. Naming the role moved the decision to one file; it did not make the file a
system. Measured, `section` at 20 and `group` at 16 read as one rank while
`title` at 32 sat two steps above `section` with nothing between them: every
number defensible where it was written, none of them in a relationship with any
other. A rank is an index on a ladder and the ladder is arithmetic, so a size
that is not derivable is a literal wearing a token's clothes.

**An icon is on the same ladder, because it is a mark at a text's weight.**
`ICON` held 20, 20, 22, 24, 26 and 28 — six numbers with no relationship to the
type they stand beside or to each other. A ladder that stops at the edge of the
DOM has a second, undeclared ladder next to it.

**And the arithmetic being right is not the same as it reaching anybody.** Two
drafts of `at(rank)` were perfect and shipped a product rendered entirely at
16px, with TypeScript green and every guard green. The first built the class at
runtime — `text-[${step(n)}]` — and Tailwind reads SOURCE text and never runs
it, so no rule was emitted at all. The second wrote the class out in full as
`text-[var(--rank-page)]`, and Tailwind emitted it as an INK, because a bare
variable could be either and colour is what it guesses; the rule that shipped was
`color: 1.953rem`, which every browser discards without a word. So the ladder
goes out as custom properties, the class names are literal, and the `length:`
hint is what makes each one a size.

**Which is why the enforcement is measured rather than read.** Both failures were
invisible to every static check by construction, so `ladder.seen.test.tsx` renders
each role in Chromium and asserts its computed size is the rung it asked for —
with the two dead drafts kept beside it as negative controls, because a check
that has only ever seen a working page is a check nobody knows is looking.

**Leading is part of the rung, and the ladder dropping it was its own
regression.** A named Tailwind size carries a line-height; an arbitrary one
carries none — so the moment the roles moved onto the ladder, every one of them
began inheriting its leading from whatever it was dropped into. Measured: the
same `label` came out 22.86px tall inside a pressable row, whose button sets
1.4286, and 24px inside an identical row that was not pressable and took the
page's 1.5 — and the placeholder standing in for those rows was suddenly the
wrong height. `lead(n)` tightens as the rung grows, no role names its own, and
the guard refuses one that does.

**The library's own sizes point at the same ladder, and the variable is
redefined rather than the component.** HeroUI sets type from Tailwind's named
scale, so a screen made of our roles and its controls served two ladders — 31,
25, 20, 16 and 13 from here, 14 and 12 from there, none of the last four
derivable from anything. Pointing each `--text-*` at a rung leaves every library
rule exactly as the library wrote it and changes only what its numbers resolve
to, which is the one door D7 leaves open: a `className` on a library component
is a restyle, a custom property is not.

**And the icon half of the ladder was inert from the day it was written.** The
rule was `[style*="--icon"] > svg` and `glyphOf` returns its mark inside a span,
so the child combinator matched no element in the product: six published sizes
reached none of them, and every glyph on every screen drew at the library's own
20px while the box around it carried a correct value from a derived ladder.
Nothing static could see it — the variable is set, the number is a rung — and it
is now measured, with the dead selector kept beside it as the control.

**A heading also states whether it has a line under it, and its peers must
agree.** The fault is never one heading — it is three cards in a stack where one
carries a subheading and two do not, which reads as "this is the important one"
for a reason nobody chose. No component can catch it: a `Group` knows what it was
handed and nothing about the card beside it. `Geometry.heads` asks it of the
whole rendered screen, keyed on rank and container, and at three or more, because
two blocks set differently are two kinds of thing and a reader parses that
correctly.

**Therefore never:** a size, a weight or a leading written outside `type.ts`; an
icon dimension that is not `pixels(RANK.…)`; a rung class assembled at runtime or
without its `length:` hint; a second scale left pointing at its own numbers; or a
column of peer headings where some carry a line and some do not.

## D90 — A screen composes the vocabulary; it does not re-derive it

**The failure this is about is not a wrong colour — it is a screen quietly
growing its own copy of a component the library already ships.**

Every other guard in this tree asks whether something was drawn correctly. None
of them can ask whether it should have been drawn at all, because a hand-rolled
copy is made of the same primitives as the real thing: it uses the tokens, it
passes the restyle check, it clears the contrast floor. It is a fault only when
you put it beside the one it duplicates.

**Measured across the two products before the rule existed:** three filter rows
at three heights and two gaps, with "All" meaning *no filter* on one screen and a
real value on the next; two byte formatters that each said `0KB` for anything
under half a kilobyte; and a facepile whose overlap was a number somebody typed,
so its left edge sat a third of a plate right of every heading above it. Nothing
reported any of it.

**So the check is a TABLE OF SHAPES, not a list of names.** "Do not write a
filter row" is advice; `aria-pressed` on a control outside `design/src` is a
string a script can find. Each entry names the shape, the component that already
exists, and what the copy costs — because a finding whose fix is not obvious is a
finding somebody argues with rather than acts on.

**And the table has to reach the package.** Every component it names is checked
against the package's own generated index, so a rename turns the rule into a
failure rather than into a rule about nothing.

**The blocks that came with it, and each is a shape screens were assembling by
hand:** `Banner` (a message that is true until something changes, which is not a
toast), `Faces` (several people as ONE object, overlapped, with the overflow
counted rather than drawn), `Filters` + `Found` (narrowing, where nothing chosen
IS everything and the count disappears when nothing is narrowed), `FileRow`,
`Compare` (two values and the move between them, which is a different fact from
a delta), `Score` (a countable number drawn as marks rather than as a length),
and `Agenda` (moments grouped by a day the caller names, never a date this
package parsed back out of a string).

**Two of them were argued into a different shape by guards that already
existed**, which is the mechanism working: `Banner` wanted its own `Card` and the
card guard sent it to `Group` — where it gained the heading, the inset, the world
and the foot slot for nothing; and `Filters` wanted a pressable `Chip`, which is
24px, against a 44px floor a browser sweep enforces. A chip is what a value
WEARS; a control is what a person HITS.

**A list and a table are two renderings of one list, so what a row can DO is
stated once.** `Listing` grew `acts` (a menu at the end of the row, and the last
column on a desk) and `chosen`/`onChoose`/`bulk` (a box per row, and `Chosen`
above them). The fault this closes is invisible from either side: the list is
`md:hidden` and the table is `hidden md:block`, so a screenshot at any width
shows one of them looking perfectly correct — and every screen that hand-rolled
row actions put them in the `aside` and forgot the columns.

**Three things about the selection are decisions rather than defaults.** The
chosen ids are the SCREEN's, because a list holding its own keeps somebody
chosen after a filter removed them and the act then runs over a row nobody can
see. There is no "choose all", because a header checkbox chooses the rows on
*this page* — which is not what anybody reads it as, and the honest version is
the one that loses data. And `Chosen` sits in the flow above the rows rather
than pinned to the foot, where the island already stands with the screen's one
action: what makes that work is that a listing PAGES, so the bar is never more
than a page of rows away.

**A rail is a carousel on a phone and was nothing on a desk.** Swiping is the
whole interaction and a desk has no swipe — a mouse user could not reach the
second card at all. The steppers are `md:` and up; the dots are everywhere,
because what a thumb needs is not a button but to know there is more and how
much. The position is read off `scrollLeft` rather than held beside it: a rail
with its own `at` disagrees with itself the moment somebody swipes.

**Therefore never:** a filter row, a facepile, a byte size, a rating, a
before-and-after or a standing message written inside a screen; a row capability
declared per shape; a selection a list remembers for itself; or a rail with
paging controls a mouse cannot use. If the shape is genuinely new, it is a
component in `@engine/design` with its own entry here — not a private copy in
the one screen that needed it first.


## D91 — A night is deep and lit, and the ladder's numbers are the ones that ship

The dark theme read as grey, and two mechanisms were responsible. Neither was a
taste question; both were a declared value the code did not deliver, and neither
was visible to any check in the repository — the ambience had guards over its
motion and its declarations and none over its LIGHT.

**A mix moves all three channels, so the surface ladder was never the ladder.**
Every tier was `color-mix(in oklab, grey(l) (100−pct)%, var(--brand))`, which
takes the brand's LIGHTNESS along with its hue. A page declared at `0.055` and
mixed four percent toward an amber at `0.79` ships at `0.084`: the dark floor was
half again as high as the number written down for it, and every tier above it was
lifted too. Worse, the lift is `pct × the brand's own lightness` — so a workspace
with a pale brand got a visibly lighter dark theme than one with a deep brand,
from the same declaration. A palette is a set of relationships, and one that
moves with somebody's logo colour is not one.

**So each channel is stated by whoever owns it.** `hued()` gives the LIGHTNESS to
the ladder, exactly as written; the HUE to the workspace; the CHROMA to the
ladder's own warmth plus the declared share of the brand's. That is what D85
already claimed the material was — "every neutral carries one hue at 0.010
chroma" — and it is a sentence `color-mix` cannot express, because a mix has no
way to hold one channel still. `chosen` keeps the mix: it is 78–88% brand, its
own note says the number is an anchor rather than a value, and it wants the
brand's lightness.

**And the grounds were flat, which "dark" alone does not fix.** Measured across
all nine families in OKLab L over a whole screen, the night grounds spanned
0.064–0.151 from their first percentile to their ninety-ninth, with the median
almost exactly halfway between — the histogram of a wash. A lit scene is
bottom-weighted with a tail into the highlights: most of the frame near the
floor, a small region much brighter, a smooth ramp between. The families already
drew the tail; none of them drew enough floor for the source to be brighter than.

**The depth is one stage in the composer, not nine family edits.** How dark the
dark goes is a property of the system rather than of a world, and nine families
each tuning their own floor is nine answers that agree until somebody edits one.
It is seeded, so it is a placement rather than a filter; it is `rgb(0 0 0 / …)`
rather than a mix, because the absence of light is the same in every world and a
tinted crush is a coloured shadow — the most reliable tell of a synthetic render;
and DAY is untouched, because on paper the light is the absence of tint and a
crush over white is a grey ring.

**Therefore never:** a tier whose lightness is decided by a mix; a claim about a
ground checked in relative luminance, which is nearly linear near black and
compresses exactly the range a dark theme lives in (the same error as checking a
colour claim with HSV saturation); or an ambience layer whose effect is not
measured, since `background-image` reads topmost first and a crush appended after
an opaque base is present in the string, applied to nothing, and reports numbers
identical to four decimal places.

## D92 — A screen is a body or a story, and what a body binds through is closed

A product's screens are the last large place a capability can be declared in one
place and drawn in another. Eleven surfaces are already drawn from declarations
no app writes a line of; what stayed hand-written was a product's own screens,
and the line between the two was never a principle — it is where the work
stopped. Every UI defect this framework has had is the same shape, and 10,130
lines of hand-written screens is the surface that shape lives on.

**A body is READ and a story is CAPTURE, and nothing is both.** A body names
blocks and binds them to what the app declares; the engine draws it. A story is a
flow of questions holding answers nobody has saved yet, whose controls are a
camera, a viewfinder and a packing editor — things a manifest could only express
by becoming a second React. Measured across OneInventory: twelve screens hold no
state at all and eleven capture. A screen declaring both has two answers to what
it is, and a renderer would pick one silently, by whichever it checked first.

**The vocabulary a body binds through is closed, and there is no operator in it.**
A value is read from one of five places, wears one of seven named formatters, and
is tested for presence or for membership in a declared set. A comparison, a sum
or a threshold is not expressible: it becomes a query on the collection, where it
is typed, tested, and read the same way by everything else. That is an escape
VALVE rather than a hatch — a hatch takes the logic somewhere nothing can see it,
and the valve pushes it into the data layer where the kernel already refuses a
field that is not there. A dispatch may only be asked of an `enum` for the same
reason: the field has declared its values, so a branch on one it can never hold
is refused rather than being a card nobody ever sees.

**The four outcomes are the frame's, and what a block owes is the shape of its
own absence.** Building waiting, nothing, trouble and denied into forty
components would be thirty-nine copies of one decision — the shape this whole
arc exists to remove. A block declares its skeleton; the frame draws the rest.

**Therefore never:** a comparison operator in a manifest; a screen that is both a
body and a story; a block index that lets an unknown name through, since the
failure is then a blank region in production rather than a refusal at
composition; a slot coordinate a block can read, because a block that knows it is
"in a 2×1" breaks in the first layout that does not use that vocabulary; or a
group inside a group, which is a tree, and a tree in a declaration is the
template language this design exists without.

---

## D93 — A screen reaches one hop, counts what points back, and never asks for what it already knows

D92 said the vocabulary a body binds through is closed. Porting OneInventory
onto it found three things missing from it, and the shape of all three is the
same: what a reading screen needs is not only its own rows.

**A path may cross one reference, and only one.** `product.name` on a stock
listing is the ordinary case rather than an exception — twelve of that product's
reading screens hold a `ref` and want a name, and a declaration that cannot say
so is a declaration those screens cannot be written in. `product.supplier.name`
is where a manifest stops being a declaration and starts needing a query planner,
which is the same line D92 draws at the first comparison operator. The join is
resolved on the SERVER and written onto the row under the path itself, so the
renderer reads `row["product.name"]` as a plain key and the browser half of this
is zero lines.

**A view may count what points back at it.** "Lines on this shelf", "products
from this supplier", "items in this run" — measured across one product, a per-row
count appears on five surfaces, and every one of them had built it in a browser
out of a whole second collection fetched in full. It is on the VIEW rather than
on the collection because a column would imply a writer and a drift: a counter
maintained by every operation that adds or removes a row is wrong the first time
one of them forgets. This is computed on read, beside the rows it belongs to, and
a view that does not ask does not pay.

**And what the screen is standing on is not a question.** Every write in a real
product takes the thing it acts on and the day it happened. Drawn from the
operation's `input` alone, the first form a declared screen opens asks for a row
id somebody would have to copy out of a URL, and for today's date. A block's act
may therefore say which of the operation's inputs the screen FILLS, from two
sources and no third: the record it is about, and the DEVICE'S calendar day —
because a shelf life is counted where the shelf is, and a server's own calendar
would call a box expired the evening before it is. An act whose every input is
filled runs on the press, because a sheet holding one button to confirm a press
somebody already made is a second press for nothing.

**Every one of these is a query per SCREEN, never per row.** One statement per
reference and one `GROUP BY` per tally, with the ids collected and deduplicated
first. Fifty stock lines are two statements, not a hundred — asking per row is
the same answer at fifty times the price on a warehouse phone, and it is
invisible in every assertion about the values.

**And a hop is a TOUCH.** A joined column is a field of another collection's row,
so the permission that governs it is that collection's. `collectionsFor` listed
the screen's own and its views' and stopped there, which meant a screen declaring
`location:read` and showing `product.name` handed out catalogue rows to a caller
holding no `product:read`. A tally is the same leak with the detail removed. The
permission check and the fetch read one resolution of the paths, because two
walks of one question is how they come to disagree.

**Therefore never:** a second hop; a count kept as a column; an identity filled
in by the browser, since a value the caller supplied would be them naming
somebody else; a form that draws a field the screen supplies; a join or a count
issued once per row; or a collection reached through a path and left out of the
permission check that decides whether the screen may be drawn at all.

---

## D94 — A view may be answered by a declared operation, and that is the only escape from the closed vocabulary

D92 says a body binds through a closed vocabulary and that a view carries no
operator. Both hold. What porting the last twelve OneInventory screens found is
that a whole class of screen is not a filter at all: its subject is ARITHMETIC.
"What runs out" is four expiry clocks composed against a threshold the workspace
sets; "how much left the shelves this month" is a sum over a period. Neither is a
`Match` and neither should become one — the first comparison operator in a
manifest is the one that makes it a language, and the second is free.

**So the valve pushes DOWN rather than out.** A view may name one of the app's
own READ operations instead of a `where`. The product already has a place to put
logic that is typed, gated, audited and readable by an agent, and it is a
declared operation; the alternative was a query grammar growing a clause per
screen until nobody could say what a view was.

**And it reuses the pipe rather than opening a second one.** What comes back is a
`Viewed` like any other view's, so `Listing` binds it unchanged, `count` counts
it, the screen door fetches it in the same round trip, and `collectionsFor` still
demands the read permission of the collection the rows are ABOUT before any of it
runs. It goes through `performOperation` — D12's one path — so its own
permission, entitlement, flag and audit row are the ones every other caller gets.
A block-level escape hatch would have been a second kind of source that the
renderer, every guard and every document had to learn.

**The row shape is the operation's and is NOT checked.** That is the honest
limit, stated here rather than discovered: `output` says the answer carries
`items`; what is inside them is a handler's business, so a `shows` column or a
`first` field over an asked view is unverified and draws blank when it is wrong.
What IS checked is everything a declaration can be held to — the operation
exists, it is a `read`, `take` names a field it answers with, and no `where`,
`sort`, `limit` or `tally` sits beside it pretending to apply.

**A `read`, never a write, and it is refused rather than remembered.** A body is
drawn on arrival, so a write here fires on every navigation, on every re-read
after an act, and twice in a browser that mounts a tree twice. An idempotency key
would not save it: each is a different request.

**Two smaller things came with it, and both are about a figure or a row that had
nowhere to come from.** `first` takes a named field off a view's first row —
which is how an aggregate reaches a `Stat` without a second fetch, and equally
how `sort` plus `limit: 1` says "the latest count" over an ordinary collection.
And `goes` may name which field carries the address: `id` was the default and is
wrong whenever a row is about one thing and leads to another, which left the
choice between opening the wrong record and not linking the row at all.

**Therefore never:** a comparison operator in a `Match`; an asked view answered
by a write, or by an operation whose answer the manifest cannot name; a clause
beside `asked` that nothing applies; a runner for screen-time operations separate
from the one every other door uses; or the browser computing what a view could
not say.

---

## D95 — A reference is a question about which row, and a form has to be able to ask it

An operation taking a `ref` is asking "which one". The declared form drew a text
box: `stock.move`'s "To" meant typing a location id somebody would have to go and
find first, and whatever they typed came back refused at the door rather than at
the control. Every detail screen in every product has this shape, so the port
stopped at the first screen whose act named a row.

**A collection says which of its fields names a row to a person.** `label.one` is
what the COLLECTION is called and a field is what one ROW is called — two
different questions, and only the first was ever answered. Absent is a real
answer: a ledger entry, a movement, a session are rows nobody refers to by name,
and the fallback is the identifier, which is the honest thing to show and visibly
wrong in a way a guess assembled out of columns is not.

**The rows travel with the screen, and that is about where these forms are used.**
A press on a warehouse phone must open a filled form, not a spinner — so the
picker's options are one more statement in a batch the screen already runs rather
than a round trip on the gesture. Bounded at two hundred: past that the right
control is a search, and shipping ten thousand rows to populate a dropdown is the
failure this layer exists to avoid.

**And the collection behind a picker is a TOUCH.** A form listing every supplier
by name is a read of the supplier collection whatever it is drawn as, so it is in
the permission check with the screen's own and its views' and everything they
reach into. This is D93's uncounted hop, one control over: without it a caller
holding no `supplier:read` gets the whole list through a dropdown.

**Two more fill sources came with it, and both are about a value the screen has
and the person does not.** `record` is the id of the thing somebody opened; a
write often wants something ON that row instead — carrying stock takes the
product and the shelf, and a stock line holds both as columns. And a literal:
`capture: "typed"` is what tells a movement somebody keyed from one a camera
read, which is exactly the question asked when a count looks wrong. It is
required input, it is never a question, and the alternatives were a form asking
"Recorded by" or a default that made the two indistinguishable in the ledger.

**Neither is an escape hatch.** A `field` fill is checked against the screen's
subject at composition exactly as a binding is, and a literal is a constant in a
manifest rather than a value from anywhere a caller can reach. There is still no
`me` — an identity taken from the browser is the caller naming somebody else.

**Therefore never:** a `ref` input drawn as free text where the rows are known; a
picker whose options are ids because nobody said what names a row; a collection
offered in a dropdown and left out of the permission check; a form that asks for
something the screen is standing on; or a fill from a column the subject has not
got.

---

## D96 — A screen is read, walked or worked in, and a flow's declaration is checked

D92 said a screen is a body or a story: one is READ and drawn by the engine, the
other is CAPTURE and keeps its controls. Porting the last screens found a third
shape that is neither, and calling it either would have been a lie a guard can
catch.

**A story is NARRATED and a session is INHABITED.** The engine's flow frame draws
a story — one question to a screen, a dock, a review at the end — so a screen
that is a chooser, a mapping and a preview on one page is not a flow however much
it reads like one in prose. Receiving is the other end of the same distinction: a
shelf that survives between scans, a row cleared after each, twenty minutes and
forty writes. It never ends, so it was never a walk.

**A session declares three things and draws itself.** How a thing gets INTO it —
a camera, a code, a file, by hand — which decides what the screen is and is the
first question anybody asks about one they cannot see. Every write it may make,
which is what lets the grants be checked. And what SURVIVES between the writes
and what does not, which is the whole shape of the work and was written nowhere:
get it backwards and a delivery books everything to one shelf, or asks for the
shelf forty times.

**The bargain is the story's, unchanged.** A camera, a viewfinder and a trigger
are not fields, and a manifest that could express them would be a second React.
What the declaration buys is agreement, not generation.

**And the claim a story had been making is finally true.** `StorySpec`'s header
has said since it was written that a guard proves `writes` is a real operation
and that the screen's `permission` is the one that operation demands. Nothing
did. Pointed at the first product it had, it found `/import` offered on
`product:write` while `product.import` demands `stock:adjust` — choose a file,
agree a mapping, look at a preview of eight hundred rows, and be refused at the
last press. The screen moved to the stronger grant; the operation is right, and
weakening it would let anybody who may add a product decide what is on the
shelves.

**A session is NOT held to that rule, and both real cases say why.** Scanning is
a READING screen that can also teach a code, so it is offered on `product:read`
while its one write asks for more; the label sheet is `location:read` because
anybody may look at it and minting is what the writes behind it ask for. The
story's rule would refuse both — correct declarations, refused for being
generous. A flow exists to reach one write and ends there; a session does not.

**Therefore never:** a session declared as a story or the reverse; a flow whose
`writes` names nothing, names a read, or names an operation the app does not
declare; a story offered on a grant its write does not demand; a session that
keeps something and will not say what it is; or a third kind invented for a
screen that is really one of these three.

## D97 — A screen may be narrowed, may draw marks, and may place the app's own book

**A reading screen does three things a binding could not say, and each of them
was one of the last five hand-written screens.** It is narrowed to a period or a
place somebody chooses. It draws figures as marks rather than as rows. And it
places the checklist the manifest already declares. Every one of those was
missing from the vocabulary and present in the product, which is why the port
stalled with five files left.

**A narrowing is one control per body, and it reaches exactly one place.** A
`pick` is fed into the `fills` of an asked view and can do nothing else — it is
not state a block binds, not a value an act is given, and not a condition a
`when` branches on, because each of those would make a body a program, which is
the line D92 draws. Held in the browser it would move a control and leave the
figures under it exactly where they were, so changing it is a refetch; and it is
not in the address, because narrowing a list is a filter rather than a
destination and a back gesture that undid a filter one step at a time before it
left the screen would be worse than no history at all.

**One per body, not one per block.** Two narrowings of one screen disagreeing
about what is being looked at is the shape a filter panel exists to avoid — and
on the report screen it would have been five panels each with a period of its
own, which is five readings of five periods that all look like one report.

**A chart's data is not recoverable from a view's rows, and `blocks.ts` was
right to refuse to guess.** It dropped eleven charts for exactly this reason: a
heatmap needs two categorical axes, a dumbbell needs pairs, and a declaration
naming one and binding `series` would have passed every check in the repository
and drawn an empty box. `plots` says which column is the measure and which one
names each mark, and the ENTRY says which of the two shapes a block takes — a
line draws a run of points and no x labels at all, so requiring a name there
would be a field declared and read by nothing.

**Two blocks are fed by the app rather than by a binding, and that is not an
escape hatch.** The checklist and the milestones are already declared on every
manifest and are what a workspace's events tick. A slot binding them would be a
screen restating steps the manifest holds, and the restatement is the copy that
goes stale silently: progress is measured against the manifest, so the second
list is the one nobody's progress ever reaches. What has been DONE is the
platform's own read — one question with one answer for every product — and an
app cannot declare a view over another app's tables.

**And a row of shortcuts names screens, never words.** A tile carrying its own
label is a second name for a place the manifest already named, and the two say
different things the first time one is renamed — a bar item and a tile for one
screen reading as two places. Each tile wears the screen's own label and mark,
and a screen this person may not open is dropped rather than led to.

**The platform's own reads are named in the kernel for the same reason
`SCREEN_PATH` is.** Both ends speak them and no manifest holds them, so a body
asking for `totals.read` was refused as naming an operation that does not
exist — which pushed the one screen that wanted a total back into asking three
lists for one row each. The fields are named rather than waived: a `take` the
answer does not carry is still a refusal, because an unchecked one is a blank
region on a page in production.

**Therefore never:** a narrowing no view fills from, or a fill naming no
narrowing; a `plots` on a block that draws no marks, or a chart with no `plots`;
a bar chart whose marks have no names; a row of shortcuts naming nothing, or
naming a screen the app does not declare; a second copy of a guide's steps
anywhere; or a platform read added to `SHARED_READS` without its answer's fields
beside it.

## D98 — A block takes the whole row or one cell, and a count of cells was a request the browser could not refuse

`Span { cells?: number }` is gone. A block that wants more room than one cell
says `wide: true` and takes the row; there is no number, no `CELLS_MOST`
ceiling, and no `span_too_wide`.

**The count did not clamp, and the code carried a comment saying it did.**
`spanning` emitted `grid-column: span N` under the claim that "`auto-fit` has no
fixed count, so a span of three in a grid that fits two takes the two — the
browser's answer, and the right one at every width including the ones nobody
anticipated". That is not the browser's answer. A grid item asking for three
tracks gets three, invented if the template does not supply them, and the
invented ones are `auto`-sized. Measured: a list under three tiles on a 390px
phone reached **407px**, so the page scrolled sideways at the one width every
screen in this repository is checked at.

**The claim survived because the only screen that could show it was measured by
nothing.** `span` had exactly one use in the tree — written the same afternoon
this was found — and the ground's geometry sweep mounted `GroundScreen`, which
hands every route to a hand-WRITTEN component. A declared body is drawn by the
renderer instead, so its layout was measured by no sweep at all: sixty green
assertions about files that share a screen's name. The sweep mounts the board
now, which is the same mount the photographs use, so a declared screen and the
chrome around it are measured together.

**`1 / -1` is the only span expression that cannot create a track.** It names no
count, so it means "every column that exists" at every width — the same promise
`auto-fit` and `Cell` already make, and the one a number cannot keep. Anything
between one cell and the whole row would have to know how many columns there
are, and nothing does: that is the property `least: "tile" | "panel" | "card"`
was chosen for one stage earlier.

**And a count is not coming back without a screen behind it.** "Two of four on a
desk" is a real thing to want and nothing in this repository wanted it. The
feature was declared, bounded at three, refused above it, tested three ways, and
used once — by the screen that then overflowed. That is the eleven charts and the
six list shapes again: a capability sized by what the layout could express rather
than by what a product draws.

**Therefore never:** a grid item given a track count a declaration chose; a
comment asserting a browser behaviour that no test reproduces; or a measuring
sweep pointed at the components a product used to be made of.

---

## D99 — The dark ground is a room with the lights down, and a crush is a share of whatever is under it

`GROUND.dark` is `0.19 / 0.265 / 0.325 / 0.38`. The dock is `0.115` — below the
page in both themes. `DEEP`, the depth crush's alpha, is `0.68–0.86`.
`depth.seen`'s floor is stated as `GROUND.dark.background - 0.02` rather than as
a number.

**Why.** oklch lightness compresses hard at the bottom of its range: the step
from `0.055` to `0.135` that separated a page from a card was eight sRGB values,
and the same step taken through the middle is twenty-five. So the ladder was
even in the number it was written in, every pair cleared `MIN_DELTA`, the guard
reported the palette sound, and the screen was one black rectangle — measured at
1.03:1 page-to-card. It is 1.23:1 now, from steps that did not change. What
changed is where the bottom is.

**A near-black page is bought with the whole elevation language.** An emissive
panel will draw one and it costs nothing to ask for; what it costs is that there
is nowhere under a card for the page to be. Two things this file already claimed
started holding only after the floor moved: the dock is the same plate in both
themes — dark on a cream page and dark on a dark one — which a floor with
nothing beneath it cannot do, so the plate went up instead and became a raised
tier wearing a dock's name; and a night casts shadow, which needs the ground to
have somewhere to fall to.

**A crush is an alpha, so what it REACHES depends on the ground.** The same
share removed from a near-black page is a few sRGB values and from a lifted one
is twenty-five. That is why `DEEP` is tuned against `GROUND.dark.background` and
not chosen once: a constant here is a copy of where the ground happened to be.

**And a threshold calibrated against a value is a copy of that value.**
`depth.seen`'s floor was `0.11`, which was `0.055` plus room. Restated as a
relationship it asks what it always meant — that the darkest tenth of a night is
genuinely below the ground it is drawn on, which an inert crush cannot produce —
and it survives the ground moving again. Lifting the floor did not break `tint`
and `space`; it stopped hiding them, and they are named in `SHORT`, each
asserted to FAIL so the list can only shrink.

**Therefore never:** a surface ladder judged by its steps without the floor they
start from; a dark theme whose page has nothing under it for a dock or a shadow
to occupy; a crush whose alpha is chosen once for every ground; or a threshold
written as a constant when it is a claim about a relationship.

---

## D100 — A step names what it asks for, so a flow is a declaration and not a file

`StepSpec` names `takes` (inputs of the write) or `block` (an id in `ASKS`), plus
`says`, `under`, `when: Match` and `always`. `StorySpec` adds `fills: { by, with }`.
`Create` turns that into `Story`, once, for every flow in every product, and
`scripts/story.test.mjs` fails on a second caller.

**Why.** The wizard was ORPHANED rather than deleted. `Story` was 554 lines and
imported by nothing; `StorySpec` was declared by nothing. The reason was one gap:
a step named a QUESTION but not what it asked FOR, so the controls had to come
from somewhere, and the somewhere was a React file per flow inside a product. The
surface rewrite deleted those files, and what survived was a declaration nothing
could draw beside a frame nothing imported — both green, both fully tested, both
inert. **A capability with a hand-written half is a capability with a deletable
half.**

**The controls come from the write, and that is what closed it.** An operation
already declares its input as `FieldSpec`s — kind, label, required, the closed set
and its words, the bounds, the collection a `ref` points at — which is everything
a control needs. So the shape of the QUESTION is the product's decision and the
shape of the CONTROL is not a decision at all. What a field cannot be — a camera,
a viewfinder — is `ASKS`, a second registry because a step's block is ASKED where
a body's block is FED; the first draft checked against `BLOCKS`, which typechecks
and hands a camera the props of a table.

**A model fills the RECORD; the flow then confirms instead of asking.** `fills`
names an operation and maps its inputs from the write's own names, so what a model
is GIVEN and what it may WRITE are both facts in the manifest rather than lines
inside a screen. `askedOf` keeps "does not apply" and "arrived filled" strictly
apart: the first leaves the flow entirely, the second moves into the review where
a press on its clause opens it. One flow, two entrances.

**Every hole found while wiring it was silent.** A `when` written as a bare string
was uninterpretable by any renderer; printed to the agent door as a `Match` it was
`[object Object]`, which reads as a question always asked — so `saidWhen` puts it
in words. A block step's row in the review said "Nothing set" over six
photographs, so `AskEntry.said` counts them. A picker handler closing over the
render's list kept one of six files chosen at once, and only when more than one
was chosen, which is the case nobody tries by hand.

**And re-founding the guard is part of the work that removes its subject.**
`story.test.mjs` compared the manifest against the screen that drew it. There is
no such screen now, so the comparison found nothing and PASSED. **A guard whose
premise has been deleted does not fail; it succeeds vacuously.** Its two word
rules moved onto the declaration, and what replaced the comparison is the two
things composition cannot see: the kernel draws nothing, so it cannot ask whether
a registered block has a COMPONENT; and nothing but a guard can say the frame has
exactly one caller.

**Therefore never:** a declared capability whose only renderer is inside one
product; a step that names a question and not what it asks for; a value a model
may write that is decided in a component rather than in the manifest; a condition
interpolated into prose without being put into words; or a guard left pointing at
a subject the work deleted.

---

## D101 — A string with two jobs is two strings, and a recap is read rather than scanned

`StepSpec.under` is the line beneath a question. The recap's connective is
`SaysSpec.per.lead`, or nothing at all — an `as` sentence carries its own
("counted in {unit}"). The recap wears `TYPE.lead` and capitalises only its first
character. An unanswered blank stays a blank inside its sentence.

**Why.** The review said "…, Counted in **tin**". `under` was "Counted in" and
the sentence was "{unit}", so the connective was a heading's capital dropped into
the middle of a paragraph — and the app could not fix it, because the same string
was also the line under the question, where the capital is correct. **A string
serving two jobs is decided by whichever caller was written second.**

**The `as` variant needed no lead at all,** which is what made the split cheap:
the connective belongs in the sentence, where the app already controls every
word. Only `per` needs one, because its five sentences would otherwise each
repeat it.

**And the fix has a cost that was invisible until it shipped.** With the
connective outside, an unanswered blank could withhold the clause and `lead` kept
it legible — "Low below ……". Inside, withholding takes the words with it and
leaves a bare "……" floating between two commas: an omission nobody can name. So
the blank stays in the sentence and carries `waiting`, which is what styles it as
unfinished. **Moving a value into a template moves its failure case too.**

**The rank was the other half.** The recap wore `title` — the page's own rank,
bold, `text-balance`. Thirty words set that way is a headline that happens to be
long, competing with the screen's actual title one element above it; and
`text-balance` is capped by every engine past about four lines, so it had already
stopped applying. `lead` is a rank between a heading and body, a weight under a
heading's, and `text-pretty`.

**Therefore never:** one string used both as a label and as a clause inside a
sentence; a connective in two places; a value moved into a template without its
unanswered case moving with it; or a paragraph set at a heading's rank because it
is the most important thing on the screen.

---

## D102 — A file has five states and a picker knows one of them

`Attach` holds a queue of `Attached`, each at `held | sending | settling | done |
refused`, with a bar, per-file refusals, retry, stop, an aggregate ceiling and
paste. `PickFile` stays the door. The design package still sends nothing.

**Why.** `PickFile` answers one question well — may this file in — and its whole
account of what happens next is `busy?: boolean`, which draws "Uploading…" on a
button. Every screen that needed more wrote the rest itself and no two matched:
one drew a spinner and no percentage; one a bar that hit 100% and sat there
through a server round trip; one reported a failure by REMOVING the row, which
reads as success. None offered a retry, because a retry needs the bytes and the
bytes had been handed to a fetch and dropped.

**`settling` is the state every one of them left out.** Between the last byte
leaving and the server answering there are seconds on a real connection, and a
determinate bar has nothing left to say in that gap. Sat at 100% it reads as a
hang, which is the moment somebody presses the button again.

**The control at the end of the row is decided by the state**, and a single
always-present "Remove" is wrong in exactly the two states that are not about
removing: somebody whose upload failed presses it and loses the file, and
somebody mid-upload presses it expecting to stop.

**The queue is the caller's and the reading is ours.** Decoding, rotating,
downscaling and refusing are pure browser work with no network in them, so they
happen once, here. Sending needs a door, a session and an operation, and a design
package that fetched anything could only ever be used one way.

**And the aggregate ceiling is the one `PickFile` structurally cannot enforce.**
It judges one file against `most` and cannot see the five already held, so six
four-megabyte photographs each pass a four-megabyte check and arrive as
twenty-four at a door that refuses eight. The per-file cap had been tightened to
compensate, which refused every photograph a modern phone takes — the cap was
never the problem.

**`shrunk` was the proof that this was the missing half.** It handles the EXIF
rotation a canvas ignores and the 4000-pixel edge nothing downstream can use; it
was exported, tested, and called by NOTHING, while a manifest one directory over
said "the screen shrinks each one before it asks". A portrait photograph arrived
sideways, at full size, and a model reading a label was silently worse at it.

**Therefore never:** an upload whose only state is a boolean; a failure reported
by removing the thing that failed; a retry that is a picker; a per-file limit
standing in for a limit on the total; or bytes discarded at the moment they are
sent.

---

## D103 — The camera is the switch, and the switch has to say what it costs

There is no setting for whether a flow's AI fill runs. There is a sentence on the
step that feeds it: *Reading this spends credits.* `meteredIds` derives which
operations spend, `StorySpec.fills` names which one a flow calls, and `Create`
works out which step's answers set it running.

**Why not a switch.** A workspace-level "use AI: on/off" is a row on a settings
page that the person adding a product is not looking at, set by somebody who is
not them, months earlier. It fails the rule the settings book is founded on — a
setting no code reads is a switch that changes nothing, and a setting nobody
visits is one step worse, because it looks like a control.

**And the decision is already in the flow, per product, where it belongs.** The
fill is fed by one step; skipping that step is the off switch. `given` returns
null on an empty list, no run happens, and the remaining questions are simply
asked. That is a per-product choice made by the person holding the box, which is
strictly better than a per-workspace one made by somebody else in advance.

**What was actually missing was the sentence.** The flow spent the workspace's
money and said nothing: somebody photographs a box, seconds pass, five questions
turn into one review, and the first anybody hears of the charge is a smaller
balance on a screen they were not on. Every rule this repository has about
runaway cost is about a loop; this is the quieter case — a cost that is correct,
authorised by nobody, and repeated once per product.

**It goes on ONE step and it is the step that feeds the reader.** A fill has no
button: it runs by itself the moment `fills.with` is complete. Told to the flow
as a whole the sentence would appear on all five screens, which is how a warning
becomes furniture; put on the wrong step it warns about a press that costs
nothing while the one that costs stays silent. `Create` matches the VALUES of
`fills.with` — what the flow holds — not its keys, which are what the reader
calls them.

**It is a boolean, not a figure.** What a run costs is known after the tokens are
counted. A number before the press would be a guess printed as a price, and the
reserve is a ceiling rather than an estimate (D-reserve). *That* it costs is the
honest fact available at the moment somebody is deciding, and it is enough.

**And it stops once the answers are in.** After the fill has run, a sentence
saying it will spend credits is a warning about the past.

**Therefore never:** a control that spends money and says nothing before it is
pressed; a per-workspace switch standing in for a per-use decision the flow
already offers; a cost warning on every screen of a flow; or a price quoted
before the thing that determines it has happened.

## D104 — Delete does not destroy, and the sentence is the feature

**Delete stopped being true.** A record leaves the lists, is recoverable for
thirty days and is then destroyed; a second column and a filter in one file
(`records.ts`) is the whole mechanism, and it is thirty lines. What makes the
trash worth having is not the mechanism. It is somebody reading "you can put it
back" and pressing the button, instead of leaving a catalogue full of things
nobody dares remove.

**So a dialog still saying "this cannot be undone" is a defect, and it is the
expensive direction of wrong.** Somebody who believes a delete is permanent
hesitates over every one of them, asks a colleague, and works around the product
— which is exactly the state the trash was built to end. The copy is asserted
against `BIN_DAYS` and never against "30", so the promise cannot go on being made
after the sweep changes.

**`frozen` and `binned` are not degrees of the same thing.** A binned record is
on its way out and is destroyed on a schedule. A frozen one is staying and is out
of the way — a product a workshop stopped buying, whose deliveries, counts and
label history all still point at it and must go on resolving. Collapsed into one
flag, either the trash never empties or a discontinued product takes its own
history with it in a month.

**A column, not a second table, and the cost is stated.** A separate table would
make every existing read correct by construction; a column means a list that
forgets the filter shows deleted records. The column wins on the other three:
restoring is one `UPDATE` rather than a re-insert that can collide, a reference
into the record still resolves for the thirty days that make restoring worth
anything, and erasure is unchanged because the row never left the table erasure
already walks.

**The alternative is offered from inside the confirmation, not beside it.** Two
buttons on a record's page — Delete and Freeze — ask somebody to know the
difference before they have a reason to care about it. The moment they care is
the moment they have pressed Delete: half the time what they meant was "stop
showing me this". Pressing it replaces the title, both sentences and the button
in place, and the way back to the destructive option is then gone — a
confirmation must never talk somebody INTO it.

**And the whole thing is derived rather than declared.** Every detail screen in
every product has the same two ways out, so a manifest saying so per screen would
be the same three lines on forty of them, thirty-nine right and one forgotten.
The door answers what the collection is called, what the record is called, and
whether there is a delete verb at all.

**Therefore never:** a confirmation describing a permanence the product no longer
has; one flag for "on its way out" and "staying"; a sweep reading
`aside IS NOT NULL`; a per-screen declaration of a way out every screen has; or a
"30 days" typed into copy.

## D105 — A fact is changed where it is read, and a flow ends where it says

**Two halves of one rule: a screen must not send somebody somewhere else to do
the obvious next thing.**

**A row that shows a fact carries the way to change it.** The alternative is a
second screen drawing the whole record as a form — the same things in a different
order, drifting from the first the day a field is added. `BlockSpec.edits` names
a field; the write is DERIVED (`<collection>.update`), so a row's pencil can only
ever change the field the row is about, and the browser holds no second spelling
of a name the kernel owns.

**Four refusals at composition, and each is otherwise a pencil over a Save that
cannot land:** a block with nowhere to put the control, a screen about no record,
a field the collection has not got, and a `settled` field the generated update
deliberately does not advertise. None of them fails anywhere else — React drops a
prop a component does not take, and the door refuses long after the screen
offered the change. The expensive shape is the last one: somebody presses, reads,
types the correction, presses Save, and is told nothing happened.

**The door sends the field's whole declaration, not a flag.** The sheet is drawn
from it — the control, the help, the option names, the bounds. And it sends
nothing at all to somebody whose role cannot write, so no pencil is drawn: not a
disabled one, which invites somebody to go looking for how to enable it.

**A flow ends where it declares, on the thing it just made.** `Declared.tsx`
finished every flow in every app with `go("/products")` — one product's route,
written into the one file that draws every product's screens. The second app's
flow would have ended by moving somebody to a route it does not have: no error,
no failing test, a blank page after the one press that mattered. `StorySpec.lands`
names a screen; the guard is that the two files which draw any app may name no
path at all.

**And it is the thing, not the list it joins.** Landing on a list of eight
hundred rows asks somebody to find what they were holding a second ago — and only
the record's own page can say what is still missing, which for a new product is
that it is not on a shelf yet. That is the next step, and a list cannot offer it.

**Therefore never:** a second screen whose only job is to edit what the first one
shows; a route belonging to one product written into the platform; a flow that
ends on a list of what it just added to; or an affordance offered by a screen and
refused by the door.

## D106 — A screen about one thing is named by that thing, and leaving it is derived

**A page about the clear casting resin was headed "Product".** That is
`ScreenSpec.label`, and it is the right word in the three other places it is
read — the nav item, the shortcut tile, the sentence in a permission refusal —
because none of those is about a particular row. On the page itself it is a
heading answering a question nobody asked, with the biggest type on the screen
spent on the category of the thing somebody is already looking at.

**The name has to come from the door, on the screen's own answer.** The engine
already resolved it (`namesIn`) — inside `aside`, the payload for DELETING one,
sent only where the caller holds the update grant. So a member who may read a
product and not change it opened a page with no name available at all, and the
"fix" would have been to widen a delete sheet's gate. A fact about the record
belongs on the record's answer; `Drawn.name` is that, and the kind moves UNDER
the name where it is a fact rather than a title.

**A screen somebody WENT to leads back, and the manifest already said which.**
`nav: "primary"` is one of the five the bar navigates between; everything else is
somewhere they arrived. So the way out is `upFrom` — the listing for the screen's
own collection, or the product's root — and it is deliberately NOT the browser's
history, which is right when there is any and leaves the product entirely when a
link was opened cold, with nothing inside the page able to tell those apart. It
is the same answer as where a record's screen goes when the record is put away:
one walk, because two let the arrow and the disappearing record disagree.

**And the crown then takes the name on scroll, replacing the workspace and the
product.** That pair is what a DESTINATION's crown says, and it is worth saying
there; on a page about one particular thing it is answering a question nobody is
asking, and both cannot have the middle slot. The heading is read on arrival,
scrolls away, and the crown picks it up small — which is what `PageCrown` has
always done outside a shell, and what a socketed screen could not do because the
name and the row are in different files. The row travels down through the crown
socket and the crossing travels back up in the claim, through one
`useHandedOver`.

**The hand-off had a browser suite and it measured the wrong composition.**
`handover.mount.tsx` drives `PageCrown`, which nothing a customer opens goes
through: every declared screen in every product is socketed under a Shell.
A second mount was the whole fix, and it caught both halves — a `carried` left
out of the claim's signature (the crown is never told, so the name disappears at
the top of the page) and a heading condition that draws nothing on a sub-page.

**Therefore never:** a page titled by the kind of thing it is about; a fact about
a record travelling inside the payload for deleting it; a way back written as a
route rather than derived from the manifest; a `collapses` set without checking
whether the content draws the heading; or a browser harness that exercises a
composition the product does not ship.

## D107 — Five readings of one period is one question, and what the control says has to be what was asked

A report is not four features. Consumption, shrinkage, how much of it anybody
actually wrote down and what to buy are four readings of the SAME movements over
the SAME period, which is why `stock.report` answers all four in one round trip —
four operations could be given four different periods, and a screen showing a
month's usage beside a fortnight's losses would say nothing anywhere about
disagreeing.

**A view is a list, so one such answer reaches a screen as several views naming
several of its output fields — and each of them was its own call.** The screen
that leads with the recorded share and carries what to buy under it ran the whole
report five times over the same ledger, on every load. That is the argument the
operation's own header makes, one layer down: not four operations reading the
ledger four times, but one operation read four times. `runViews` holds one answer
per question for the length of one read — the PROMISE, not the result, because
the views run together and a result cache is filled by the first call to return,
by which time the other four have gone out. It is safe because an asked view must
name a `read`, which composition already refuses otherwise.

**The period is a control, and this is the first `PickSpec` any manifest uses.**
Everything built and reached by nothing has this shape, and mounting it found two
faults in the mechanism. The container's held narrowing started EMPTY, so the
first read carried no `pick.*` at all while the control under it drew its first
option as chosen: a report showing "7 days" over a month of movements, both
halves internally correct. And four options or fewer are drawn as a segmented
control — a row of words read left to right — so the ORDER is what somebody reads
and the DEFAULT is a separate decision, and one slot for both forces either a
period list running 30 · 7 · 90 or a report that opens on the wrong period.
`PickSpec.opens` separates them, `opensOn` is the one reading of it, and the
container and the renderer both go through it because two answers to "what does
this open on" is exactly the disagreement above.

**And the control itself drew as a vertical stack outside the page gutter, which
only a browser could say.** The markup was right, the classes were right, every
unit test drew the correct segment as chosen, and the manifest composed. Every
control the renderer places above a body fills its box below its own breakpoint —
`w-full` on the inside — and `w-full` contributes NOTHING to a max-content
measurement, so as a bare flex item the wrapper's base size resolved to ZERO: the
segments overflowed a zero-width box, wrapped one per line, and the library's own
`justify-center` centred each of them on its left edge. A basis on the row fixes
it, and `narrowing.seen.test.tsx` reads where the segments LANDED rather than
what class they were given — reading back `flex-basis` would be reading back what
the component was told.

**The same walk found the collection-backed case, which cannot be fixed the same
way.** Its rows arrive from the door AFTER the first read has gone out, so there
is nothing at composition to open on — a value named there could not be checked
against anything, and the control would draw its first row as chosen over a
screen that was asked for every one of them. `PickSpec.any` was already the way
back to "not narrowed"; it is now REQUIRED of a pick over rows, which makes the
honest start the drawn one.

**And the sentence under a figure needs a branch for the good answer.** "The rest
went unscanned" was said whenever anything had moved at all, so a workspace that
scanned every single movement was told, at 100 %, that a count had found the rest
missing. There is no rest. A figure that exists to be pushed up has to be able to
say when somebody got there.

**Therefore never:** several views over one operation without one answer behind
them; a control whose drawn value was not the one sent; a reading order and a
default sharing one slot; a narrowing over rows with no way back to all of them;
a self-sizing control dropped into a flex row with no basis; or a conditional
sentence missing the branch where nothing is wrong.

## D108 — A list says where its rows go, and that is where "back" is

`upFrom` looked for the list screen declaring the same `of` as the detail screen
above it. `of` means "the record this screen is ABOUT", which is false of a
catalogue — so no list screen in any manifest has ever declared one, the arm was
reached by nothing, and every sub-page in every product went back to home
whatever it was a sub-page OF. Its test was green the whole time, because the
FIXTURE gave a list screen an `of`: a fixture shaped unlike the thing it stands
for is a test that proves the test.

**`goes` is the link itself and it is already written down.** A list declares
which screen its rows open, which is the edge somebody actually travelled, so
"where back leads" is the inverse of a relationship the manifest holds rather
than a second spelling of one. Several lists may lead to one screen — a product
is opened from the catalogue, from a shelf line, from what ran out and from what
is going out of date — and the first DECLARED wins, which is the order somebody
wrote the product in.

**The year is the same day's, and that is a fill rather than a clock.** Four of
OneInventory's operations take the device's calendar year as required input,
because a six-digit expiry has its century inferred from a window around now and
a server in another year reads a label differently from the phone looking at it.
None of them could be offered by a declared body: `today` is a date string, the
input is a number, and a manifest cannot hold a year without being edited every
January. `Fill: "year"` is derived from `today` at both ends rather than read off
a second clock, because two clock reads one second before midnight on the
thirty-first of December are two different years — a box's expiry inferred around
one while the movement is dated in the other.

**And resolving a fill is now one function.** The worker resolved five sources
for an asked view and the browser resolved the same five for an act, in two
files, at two ends of a wire — so nothing would ever have compared them. Adding
the year to one and not the other is a defect nothing in the tree could see, and
that is the general case: `fillWith` is the kernel's reading and both ends go
through it, exactly as `opensOn` is for a narrowing's default.

**And a record can only be put aside where there is something to put it aside
WITH.** The door asked whether the caller MAY update, which for a collection that
declares `without: ["update"]` is a different question with the same answer for
everybody: yes. So a count session — opened and closed by its own operations,
never edited — drew "put aside" on the one screen it is reached from, and the
press would have gone to an operation the app does not declare. `bin` was already
asked the right way one line down; the difference is that a missing delete merely
hid a button and a missing update drew one.

⚠️ **THE FIXTURE SAID `bin: true` FOR EVERYTHING, WHICH IS HOW THE PHOTOGRAPH
STILL LOOKED FINE.** A board more permissive than the deployment photographs
affordances no customer is given — the same fault as the fixture that kept
`upFrom`'s dead arm alive, in the same round, in a different file.

**Therefore never:** a branch whose only caller is a fixture; a fixture more
permissive than the door; a way back written from anything but the link that was
followed; two device facts where one derives from the other; or one contract read
in two places.

## D109 — A way back belongs beside the act, and an operation reached by nothing has no way to be offered

**`stock.undo` shipped rule-complete and reachable from nothing.** It refuses a
movement that is not yours, one that is no longer the last on its line, and one
made more than an hour ago; it reverses both halves of a transfer, far shelf
first, so a failure lands before the near half moves; it is one-shot, because the
row it writes names what it cancels. All of that was built, tested end to end and
correct — and no screen named it, no outcome offered it, and every suite in the
repository was green. The engine's own `capability.test.mjs` could not see it:
that guard asks whether a PACKAGE's exports are imported, and this is an APP's
operation, which is a different question nothing was asking.

**The reason it had no surface is that there was nowhere to put one.** A history
screen is the obvious place and it is the wrong one twice over. It answers to
`ledger:read`, which the person who mis-scans does not hold — a `user` has
`stock:move` and neither of the reading keys — so the one role that needs the way
back cannot open the screen it would be on. And a reversal is not a thing
somebody goes looking for: they know within a second, they are holding the phone
that did it, and three taps into a log is not where the mistake is.

**So an outcome may carry one control, and that is the whole feature.**
`Outcome.back` names a reversing operation, what the button says, and where its
input comes from. It is a declaration for the same reason `goes` is: an id the
kernel checks, the permission gate reads and the agent surface already exposes,
rather than a handler in a manifest. The press posts through the door, so the
reversal's own rules answer it — refusing an hour-old movement is `stock.undo`'s
business and never the button's, and a browser that reversed optimistically would
draw a balance the server never agreed to, on the one press where being wrong
costs a recount.

**`Given` is deliberately not `Fill`.** A screen's fill reads what the screen is
standing on — the record, a column of it, the day, the year, a narrowing. A
reversal reads what the write just ANSWERED, which is none of those five and is a
value that did not exist a moment ago. Reusing `Fill` would mean adding a sixth
source meaningless to every view and refusing the other five here: two
vocabularies wearing one name. Two sources is the whole of it — a field of the
answer, and the device's day.

**And the answer had to be carried through the seam to make any of it possible.**
`whenWritten` was handed the sentence alone, so a handler could draw the button
and have nothing to press it with. `stock.receive` answers with the ledger row it
wrote, which is why `moveOutput` carries a `movement` at all; the browser fills
from that and posts.

⚠️ **EIGHT REFUSALS, AND EVERY ONE OF THEM IS INVISIBLE UNTIL SOMEBODY MAKES A
MISTAKE.** A fill naming a field the operation does not answer, a required input
left empty, a reversal the app does not declare, one that is a read: each draws
the button, composes, passes every suite, and fails at the door on the one press
it exists for — which is the moment somebody has already decided they were wrong.
The sharpest is not a wiring fault at all: a gated write whose reversal is public
is a door around the gate the write stands behind.

**The correction is the one movement with no way back, deliberately.** Receiving,
taking, carrying and scanning are things a thumb does — the wrong shelf, the
wrong number, a scan that fired twice. An adjustment demanded a written reason,
so it is a sentence somebody composed about what was wrong; undoing it would take
that out of the ledger along with the number, and leave a shrinkage report that
cannot explain itself. Correcting a correction is another correction.

**Therefore never:** a capability whose only address is an operation id; a way
back that reverses in the browser; a control whose input is resolved from
anything but the answer that produced it; or an absence that nothing asserts —
"no undo here" is a decision, and a decision no test pins is indistinguishable
from an oversight.

## D110 — A verb of a subject the app has drawn is called from somewhere, and the remainder is a countdown

**Two guards asked about reach and neither asked this.**
`capability.test.mjs` asks whether a PACKAGE's exports are imported;
`unreachable` in the kernel asks whether an operation's permission is one some
role can hold. Between them, nobody was asking whether an APP's operation has an
address anybody could reach it at — which is how `stock.undo` shipped
rule-complete and callable by nothing for a month with every lane green (D109).
`reached.test.mjs` already asks the same question one level up, of screens; the
operation half belongs beside it rather than in a third file.

⚠️ **AND IT IS ASKED ONLY OF A SUBJECT THAT ALREADY HAS A SCREEN, which is the
whole of what makes it answerable.** Every screen in OneInventory was emptied on
purpose (RW-0) and they are returning one at a time; asked of everything, the
check reports thirty-odd verbs whose surfaces are not written yet — a guard
nobody can act on, which is a guard everybody learns to scroll past. A collection
the app HAS drawn is one whose verbs it has already decided about, so what is
left is the sharp case: **a screen ships, wires two of its subject's three verbs,
and leaves the third addressable by nobody.**

**It found exactly that the day it was written.** `/count` wired `count.tally`
and `count.close`, `/counts` listed the sessions — and `count.open` was called
from nothing. The product had a way to work a count, a way to settle one, and no
way to begin one, under a list whose own empty state read "Open a count on a
shelf". Its `location` was also the one shelf field in the product declared as
bare text rather than a `ref`, so the form generated over it would have asked
somebody to type a location id.

**`WAITING` IS A COUNTDOWN, NOT AN EXEMPTION, AND THE DIFFERENCE IS MECHANICAL.**
`capability.test.mjs` argues a list inside a guard is a waiver, and it is right
about the case it governs: an unplanned gap should be marked at the site, where
whoever touches the code sees it. This list is the visible remainder of a
deliberate teardown, so it is a work item rather than an excuse — and it is held
to that by failing three ways. A name that becomes reached fails until it is
deleted; a name for an operation that is no longer there fails; and a corpus that
found nothing to ask about fails rather than reporting a clean sweep. A waiver is
permanent by construction; this stops being true the moment the tree moves.

**The summary says the number out loud.** It reported "every one of them called"
over a corpus with seven waiting before that was fixed — a line that reads better
than the tree does, which is the failure every guard in this directory exists to
refuse.

**Therefore never:** a capability whose only address is an operation id; a check
whose corpus can quietly go to nought; a list in a guard that cannot fail; or a
summary that counts the ones that passed and not the ones that were skipped.

## D111 — A page about one thing can call a write that works on many, and a condition inside a card is a condition

**Status:** shipped · **Date:** 2026-08-27

**`Fill` GAINS `each`, AND IT IS ARITY RATHER THAN A SIXTH SOURCE.** An operation
that labels rows takes a list, because a workspace labels forty shelves in a
sitting — and the place a person actually asks for a label is the page about the
one shelf they are standing at. There was no fill that produced a list, so the
only routes to a labelling control were an operation taking a single id beside
the one taking many (two implementations of one act, therefore two places for the
scoping loop to be wrong) or no control at all. `{ each: <source> }` wraps
whatever the source resolves to in a list of one; `fillOf` returns `every`
alongside the same `of` it always did, so every caller asking WHERE a value comes
from is unchanged and only the two resolvers read it.

**IT WRAPS AND IT DOES NOT COLLECT.** `each` says what shape the input wants, not
that a screen may gather several records. A body has no selection and this does
not give it one; bulk labelling is a different surface with a different question.
It cannot nest, by type — a list of lists is a shape nothing here takes and
nobody could read at either end of the wire.

**AND `[]` IS NEVER SENT.** A list-taking operation reads an empty list as "you
named no rows" and refuses saying so, which is a worse answer than the
required-field refusal a missing key gives — and a wrong one when the truth is
that the screen has not resolved its record yet. The same rule the other five
sources already follow, for the same reason.

**`fill_each_not_a_list` IS THE REFUSAL THAT COMES WITH IT.** Every field kind in
this vocabulary except `json` is a scalar the door validates as one, so an array
arriving at a `text` is a refusal on the press with the field marked and nothing
a person can do about it. Same class as `fills_field_unknown`, one type down: the
input is real and the shape going into it is not.

**AND A `when` INSIDE A GROUP WAS INERT, WHICH IS WHERE NEARLY ALL OF THEM ARE.**
The renderer read the condition only where a group or a top-level block is
wrapped; a row within a group was drawn unconditionally. What that produced is
the failure this vocabulary is most careful about everywhere else — an empty
labelled row presented as a fact, and a control offered against a state it had
already been used on. Every test of the feature passed, because every one of them
placed the block at the top level; every photograph looked right, because each was
taken of a record that happened to have the field.

**A GROUP WITH NOTHING LEFT IN IT IS NOT DRAWN.** `silent` could not answer that
— it asks whether a checklist has anything left and knows nothing about
conditions — so the fix carries its own second half. A card with a heading and no
rows is the same empty promise as the row it was there to hold.

**Therefore never:** an operation duplicated to change the arity of its input; a
one-element list sent where a scalar is taken; an empty list standing in for a
value the screen does not have; a condition evaluated at one nesting depth and
not another; or a card drawn around nothing.

## D112 — A flow shows what it is about to do, and holds what nobody should be asked

**Status:** shipped · **Date:** 2026-08-27

**A REVIEW OF THE ANSWERS IS NOT A REVIEW OF THE CONSEQUENCES.** For a flow that
makes a thing, the two are the same: registering a product recaps four facts
about a box, and reading them back IS the check. For a flow that applies a
change they are nowhere near each other — an import recaps "a spreadsheet,
today", which is true and says nothing about the four hundred and twelve rows
about to be created and the eleven about to be refused. `StorySpec.shows` names
an operation run when every answer is in, whose report is drawn on the review,
above the press.

**IT IS `fills` AT THE OTHER END OF THE FLOW, AND THE MIRROR IS EXACT.** A fill
runs before anybody is asked and arrives as ANSWERS; this runs when the asking is
done and arrives as a REPORT. Neither is a hook: both name an operation, so what
a flow will do before it commits is a fact about the product — the docs list it,
an agent can be told, and its credits meter on the same rail.

**COUNTS, NOT ROWS.** Eight hundred lines of what-would-happen is a screen of its
own that nobody scrolls; three numbers are weighed in a second. `take` names the
output field holding them and it is `Record<string, number>`, because anything
richer is a surface rather than a summary. The detail is not lost — the write
answers with its refusals — but the DECISION is made against the shape.

**AND SHOWING THE OPERATION IT WRITES IS REFUSED.** A flow that runs its own
write to find out what the write would do has already done it, and the first time
is the one nobody asked for. Four more refusals go with it, and every one of them
fails on the review, quietly: an unknown operation, an output field it does not
answer with, an input it does not take, and a source no step answers — which for
an import reads as "nothing will happen" over a sheet about to be applied.

**`StorySpec.holds` IS THE SECOND HALF, AND IT WAS A HOLE.** A body has supplied
the device's day to every act since `Fill` was written; a story had `starts`,
which reads a SETTING, and nothing else — so a write taking a required `day`
could not be reached by a flow at all. The import found it by being refused at
composition, which is the guard working. It is the same `Fill` a body uses, on
purpose: a second vocabulary for "a value nobody types" is how the two come to
disagree about what the device's day is, and the day a flow sends is the day a
shelf life is counted from.

**`StorySpec.does` IS THE THIRD, AND IT IS THE SAME SHAPE AS `lands`.** The word
on the last press was `"Add it"`, in the platform, for every flow in every app —
one product's sentence about one product, written where every product reads it.
It said "Add it" over a button that applies eight hundred rows of somebody else's
spreadsheet. Absent it still says "Add it", because most flows do make a thing;
what a flow may not do is be unable to say otherwise.

**AND THE FIXTURE HELD ITS OWN COPY, WHICH IS WHY THE PHOTOGRAPH MATTERED.** The
board hardcoded the same string, so the picture of the fixed product still showed
the bug. A fixture that answers a question its own way is a fixture nothing can
be checked from — the third time this exact class has been found by looking at an
image rather than at a test.

**Therefore never:** a review that recaps the answers to a press whose subject is
a change; a preview computed by running the write; a flow that cannot supply a
fact about the device; a product's word on a platform's button; or a fixture
holding a second answer to a question the declaration already answers.

## D113 — A standing decides which acts a screen offers, and a date is never drawn as the string it is stored as

**Date:** 2026-08-27 · **Status:** shipped

**The release rail is two grants and five words, and the screen is built out of
the same five.** `refuseRun` is the whole model — `open → ended → released`, with
`failed` and `recalled` off the end and `lifted` per delivery — and `/run` gates
every act group on `state` with a `when` that mirrors it rather than restating
it. The handler refuses regardless: releasing from `open` is the most tempting
shortcut in the rail and it fails at the door. What the condition buys is that
nobody is offered a control whose only outcome is a refusal.

**AND THE STANDING IS SAID IN PROSE BECAUSE EVERY ACT GROUP IS CONDITIONAL.** A
released run draws none of them, so a page that stated where it stood only
through which controls it happened to offer would say nothing at all about the
runs an auditor opens two years later. The `Standing` row is the one thing on
that screen that is always drawn.

**`process:run` OPENS A RUN AND `process:release` SIGNS FOR IT**, and that is
the design rather than two similar grants: the person at the machine must not be
the person who decides the machine was right. Both entitle on `processes`, which
`solo` does not buy and `plus` does — a single-chair clinic that sterilises is
exactly the customer a Studio-only gate would exclude.

**THE TWO SUITES ASSERTING THAT WERE BOTH VACUOUS, AND ONE WAS GREEN ON A CLAIM
IT WAS NOT MAKING.** They derived "what is withheld" from `flag`, which is OUR
switch; a plan is `features`, which is THEIRS. OneInventory has never used a
flag, so both walked an empty list — the free tier's suite passed by asserting
nothing, and the paid tier's by asserting nothing twice. Both now resolve
`features` against the tier's own `includes`, read out of `PLANS` rather than
restated, and both fail if the count of gated screens is zero.

**A DATE DRAWN PLAIN IS A REFUSAL NOW, AND IT SHIPPED ON THREE SCREENS ACROSS TWO
APPS.** The formatter check only ever ran when a declaration SAID `as`, so the
wrong pair was caught and the ABSENT one was waved through — `String(v)` on a
`day` put `2026-08-27` under a big number in the one slot on a hero whose entire
job is how old something is, and down a list column headed "Started". There is no
case for the raw value: `when` says "Today", "Yesterday", and then the date, so
past two days it draws what the stored string was going to say anyway, in the
reader's own locale and zone.

**AND THE HERO WAS NEVER ASKED AT ALL, WHICH IS THE PART WORTH REMEMBERING.**
The format checks lived inline in the block loop; the hero had its own shorter
loop for slots and kinds and nothing else. So the slot at the top of a detail
screen, in the biggest type on the page, was the one slot no check reached. It is
one walk called from both now — two implementations of "is this drawn right" is
how the one that matters ends up being the one nobody wrote.

**Therefore never:** a control offered against a standing that can only refuse
it; a page whose standing is inferable only from which acts it happens to draw;
one grant covering both doing the work and signing for it; a plan-gating suite
that asks about our switches and calls that the customer's plan; a date drawn as
its stored text; or a check written inline in one loop when a second loop asks
the same question.

## D114 — A subject with no screen is a failure, and a table two schemas create is a 503

**Date:** 2026-08-27 · **Status:** shipped

**THE GUARD WRITTEN TO CATCH AN UNREACHED CAPABILITY EXCUSED THE WORST CASE OF
ONE.** `reached.test.mjs` asked about "verbs of a REACHED subject", so a
collection with no screen and no wired verb was not a finding — it was not a
question. `unit` (five verbs), `kit` (six) and `job` (three) were built, gated,
audited, tested at the door and callable by nobody, and the guard reported
`27 of 28 verb(s) of a reached subject called`. Every word of that was true.

**THE NARROWING HAD A GOOD REASON AND IT EXPIRED.** It was written during RW-0,
when every screen in the product had been emptied on purpose and they were
coming back one at a time; the wide question then would have reported thirty-odd
surfaces nobody had written yet, which is a guard everybody learns to ignore. The
rebuild finished. Nothing expired with it, because nothing was watching the
reason rather than the rule.

**A COLLECTION IS REACHED THREE WAYS AND BEING WRITTEN IS NOT ONE OF THEM.** A
screen draws it, a view reads it, or a control calls a verb of it. There is
deliberately no fourth: "another table refs it" would excuse every join table in
the repository, which is exactly where this hides. The sharp finding is that
`product.register` asks "Can you photograph it?" and writes `shot`, asks who
supplies it and writes `sourcing`, and nothing in the product ever showed either
back — so the honest description of those steps was that they asked somebody to
do work and discarded it politely. A rule counting a write as a reach would have
called both wired.

**AND THE TABLE NAME COLLISION IS A 503 ON EVERY DOOR.** The purchasing rail was
written as `purchase` first, which is what the runtime calls the package rail's
ledger — both land on a shard, `CREATE TABLE IF NOT EXISTS` is won by whichever
module runs first, the loser's indexes then name columns that are not there,
`ensureSchema` throws, and every route that touches D1 answers 500 including
`/health`. The kernel refuses a reserved SQL WORD and knows nothing about the
platform's own tables, because it is the pure contracts layer and has never seen
one. `shadow.test.mjs` is the check, and it is PER DATABASE: OneInventory's
`code` and the platform's `code` have never collided, because the platform's is
a directory module and an app's collections only ever reach a shard. A guard
matching every platform table would report that pair for ever, which is how a
check earns an exemption list and then earns being ignored.

**THE ORDER RAIL ITSELF NEVER MOVES STOCK.** Receiving against a line goes
through the same chokepoint `stock.receive` does, writes the same ledger row,
counts against the same quota and carries the order in `against`. A purchasing
feature with its own way of putting things on a shelf is two histories that will
disagree about the same carton. What it adds is which promise a movement
answered.

**AND MORE THAN WAS ORDERED IS ALLOWED.** Suppliers over-ship; refusing a case of
12 against an order for 10 would mean the shelf could not be told what is
physically on it — a product making its own paperwork more important than the
stock it exists to count. The shelf is the fact and the order is the promise;
where they disagree, the promise was what was wrong. `closed` means "nothing more
is coming" rather than "everything arrived", and cancelling is reached only while
nothing has, because cancelling an order half of which is on the shelf would
erase the record of why that stock is there.

**Therefore never:** a guard that excuses a whole noun for having no surface; a
rule that counts a write as a reach; an app table sharing a name with one the
platform puts on the same database; a second path that changes a number on a
shelf; or an end state that can only mean "everything arrived".

## D115 — A name that is announced and not drawn is not a name

**Date:** 2026-08-27 · **Status:** shipped

**A `Listing`'S `label` REACHES A SCREEN READER AND NOBODY LOOKING.** It is the
table's accessible name, which is correct and is the whole of what it does — so
a page carrying two lists drew two sets of rows in the same ink with nothing
between them saying which was which. Every static check in the kernel read the
declaration, found a real slot correctly filled, and reported green. It was
found in a photograph, on five screens at once.

**AND THE WORST OF THE FIVE INVERTED A FACT.** A kit page draws what is IN the
tray and what is MISSING from it, one under the other. Unheaded, "Towel clamp ·
2" sat directly beneath two instruments that are in the tray, in the same type,
so the tray read as holding the clamp it is waiting for. The order page had the
same shape one register down: the outstanding count as a bare `5` in the row's
end slot, beside a sentence already ending "5 to come".

**ONE LIST IS NAMED BY THE PAGE IT IS ON; TWO ARE NOT.** That is why
`lists_unheaded` counts per screen rather than refusing per block — heading a
single list would restate the screen's own title one line down. Where one of a
pair is headed and the other is not, the bare one is still reported: a fix
applied to one of two slots with a comment claiming both is this repository's
signature failure and the check is not allowed to fall silent for it.

**A CHART IS EXEMPT BECAUSE IT WAS FIXED, NOT BECAUSE IT WAS SPARED.** Its
`describes` had lived in `<title>` and `aria-label` alone for the life of the
chart vocabulary — read aloud to anybody listening, invisible to everybody
looking, while the file's own header called it "the thing meant to be read
first". It is a `<figcaption>` now, so a chart arrives on the page already
named and a group around it would head it twice.

**Therefore never:** a screen carrying two lists neither of which says what it
is; a value drawn twice in one row with only one of the two saying what it
counts; or an accessible name treated as though it were a heading.

## D116 — A sold capability with no door, and a vocabulary nobody can see

**Date:** 2026-08-27 · **Status:** shipped

**THE ANSWER TO "BUILD IT OR DELETE IT" WAS BUILD, FOR BOTH, AND THE REASONS ARE
DIFFERENT.** `job` had three verbs, a trace that reads the ledger backwards, and
a PRICED entitlement — `jobs` is a gate every tier that carries it names — so a
workspace could pay for it and never see a door. That is sharper than an
unreached verb: somebody was charged. `tag` had no verbs at all, which is why
the verb pass could never have found it; what it had was a register flow minting
words into it since OI-18a and no screen anywhere showing one back.

**A JOB HAS NO LINE TABLE AND THAT IS WHY THE SCREEN LEADS WITH DOUBT.** What it
consumed is already in the ledger against its id, so the trace is a query — a job
correct on Tuesday acquires a concern on Thursday when a recall lands on a lot it
used, and a status written at close time can never learn that. How many lines it
took is a number nobody opens a job to read.

**AND TAKING STOCK IS OFFERED FROM THE JOB, NOT THE JOB FROM THE SHELF.**
`against` is free text, so a take screen offering it would ask somebody to type
an id. From the job it is the record, filled, and cannot be the wrong one. The
movement itself is unchanged: same chokepoint, same ledger row, same quota. What
the job adds is which promise the movement answered.

**`tag.rename` EXISTS BECAUSE `tagging`'S OWN HEADER PROMISED IT.** "So a tag can
be renamed in one place" was written when the join was declared and nothing could
— the argument for a table over a string on each product was a comment. Renaming
onto a word that already exists is REFUSED, which is the match-before-mint rule
read backwards: registration matches before it mints, so a rename that ignored
the match would put the duplicate back and undo it, on the one table whose value
is that it holds each word once. `tag` lost its generic create/update/delete in
the same change, because two ways to rename — one that checks and one that does
not — is the second answer this repository keeps finding.

**REACHED FROM RUNS AND FROM PRODUCTS RATHER THAN FROM THE BAR.** A nav built to
look deliberate at three to five does not get a sixth and a seventh destination
for second-order nouns. Jobs uses `leads`, which is resolved through the manifest
and DROPPED where the person may not open it — the one shape that is right both
on a plan carrying `jobs` and on one that does not; a `goes` there would
dead-end. Tags uses a plain row, because every plan has them.

**Therefore never:** an entitlement that is priced and gated with no surface
behind it; a table a flow writes and nothing reads; a promise about a mechanism
in a comment with no verb under it; or a second way to change a value where one
of the two checks a rule and the other does not.

## D117 — A workspace has one currency, and it re-labels rather than converts

**Date:** 2026-08-28 · **Status:** shipped

**THE FAULT THIS CLOSES WAS A BLANK COLUMN, NOT AN ERROR.** `Has.currency` had
been declared on the renderer since the surface was founded, with a paragraph
saying why a declaration cannot guess which currency's minor units a `money`
field holds. `Declared` accepted it and spread it into `Has`. Nothing ever passed
one. So `DRAWN.money` took the branch that draws NOTHING — correctly, because the
alternative is one workspace's prices in another's symbol — and every price on
every app screen would have been an empty cell. Nothing failed: not the compiler
(absent is a legitimate state, since the account door has no workspace), not a
test, not a photograph, because no screen had yet shipped a money field. It was
found by asking what SV-3 would need before writing it.

**SO THE CURRENCY IS A WORKSPACE FACT, BESIDE THE COUNTRY, IN THE DIRECTORY.** Not
a setting a product declares: two products in one workspace would each declare
their own, and a business would have two currencies with nothing saying which a
figure was in. It travels on `centre.view` — the read every screen already waits
on — because asked separately it would be a round trip before any price could be
drawn at all.

**AND IT IS NOT WHAT WE BILL THEM IN.** `billing_account` carries the deployment's
own currency, which is a fact about our catalogue. This is what THEIR books are
in. The two sit on one screen precisely so they cannot be confused: a business in
Cairo invoicing in dollars is the ordinary case rather than the corner.

**THE DEFAULT COMES FROM THE COUNTRY, WHICH IS AGAINST `present.ts`'S OWN GRAIN.**
`minorPer` asks `Intl` how many decimals a currency has, so no list can go stale.
There is no equivalent to ask for country → currency: no shipping runtime maps a
region to one. The alternative is asking at founding for something most people do
not care about at that moment. So it is a table, and it is a DEFAULT — and the
fallback for a code the table does not hold is a currency rather than nothing,
because a wrong default is visible and one control away while a blank column is
neither.

**AND CHANGING IT RE-LABELS EVERY FIGURE ALREADY RECORDED.** A conversion needs a
rate on a date, and inventing one prints a guess as a fact. The screen says so
above the button: right on the first day, wrong once there is real money in the
books, and the person decides. What is stored is stored — deriving the currency
on every read would let a correction to the table silently redenominate every
amount a customer had entered, with nothing on any screen changing.

**THE GUARD IS DERIVED FROM WHAT `DRAWN` ACTUALLY READS.** Every `has.<name>`
inside that table is a fact the browser must supply or that format draws blank,
so a second one added tomorrow is asked the same three questions — the server
sends it, the view declares it, every mount passes it — with no edit to the
guard. A hand-kept list of "things that must be threaded" is exactly the artefact
that was already missing an entry.

**AND A BOARD BUILDS A `Has` TOO, WHICH A PHOTOGRAPH FOUND AND THE GUARD DID
NOT.** The three questions above follow the DEPLOYMENT's path — server, view,
mount. A screenshot board is a fourth constructor of the same object: it hands
the renderer a `Has` assembled by hand. The first pictures of the value surfaces
had a heading, a mark, a sentence and no number, on both the figure and the
column, with every test green — the deployment's exact bug, reproduced in an
image. That matters more than an ordinary miss, because a screenshot is
evidence: a blank figure filed under the screen's own name reads as the design
somebody chose. The guard now walks every `: Has = {` and asks the same question
of each, so a board added tomorrow is covered; widening it found a second one
(the proving ground's) that had the same hole.

**AND `present.ts`'S FILE EXEMPTION BECAME A RULE ABOUT THE CALL.**
`countries.ts` was waived wholesale so it could build an `Intl.DisplayNames`;
`currencies.ts` wanted the same waiver, which is how a list that can only shrink
grows. The real rule is that `DisplayNames` NAMES a thing rather than formatting
a value, and only where it is handed the reader's own locale — so
`new Intl.DisplayNames(undefined, …)` passes anywhere and a hardcoded locale
fails, in `countries.ts` too, which the file exemption never checked.

---

## D118 — Carriage is spread by value, derived on read, and fixed once anything arrives

**Date:** 2026-08-28 · **Status:** shipped

Freight, duty and handling are a real part of what stock cost. An order that
recorded only what the goods cost values the shelf below what the business paid,
by the one component that is never small on a small order — so `buying` carries a
`carriage` and `buying_line` carries `cost`, the whole line as it appears on the
quote rather than a per-unit price nobody has to hand.

**Spread by value, not by count.** A pallet of paper and a box of scalpels on one
van did not consume the same share of the freight. Splitting per line puts most of
a delivery's carriage on whatever happened to be cheapest, which is a number that
looks defensible and is wrong on every order with a range of prices in it. The
last line takes the remainder so the shares sum to the carriage exactly; rounding
each independently loses or invents a penny, and a penny from nowhere on a value
report is the whole report's credibility.

**A line with no price takes no share**, because a share of an unknown is a number
nobody can defend. The consequence falls out rather than being coded: the freight
cannot reach a receipt without the goods, so an unpriced delivery stays unknown
instead of becoming the carriage alone.

**And the share is DERIVED, never stamped.** `spread` runs over what the order
says at the moment a delivery is priced. A stored share would be a third number
that has to stay in step with the carriage and the line prices, and the moment one
of the three is edited the other two are a ledger nobody can reconcile — the same
accumulated-beside-the-derivation shape `costing.ts`'s header refuses for a
shelf's value.

### What that costs, said out loud

**The carriage stops being editable the moment anything arrives.** A receipt
already on a shelf holds the share that stood when it landed; moving the divisor
afterwards would leave the posted shares adding up to a figure that was never
charged, with no rung between them saying which was right. Making that work is a
reposting subsystem — a job runner, concurrency gates, and the reports that exist
only to find ledgers that have gone wrong, which is precisely the machinery the
moving average was chosen to do without. So the refusal IS the design, `refuseOrder(state, "carriage")` is where
it lives, and `part` — "something has arrived" — is already a rung of the state
machine, so nothing new had to be invented to express it.

It stays editable while the order is `placed`, and that rung is what makes the
field usable at all: freight is quoted on the invoice that travels with the goods,
not on the order that went out a fortnight earlier. A draft-only carriage would be
a field nobody could ever fill in truthfully.

**What is refused with it:** a per-delivery carriage. Freight is a fact about a
van, and one order delivered in three vans is three charges — but a receipt here
is one line at a time, so a per-delivery figure would need a multi-line receipt
the declared surface has no shape for. An order-level carriage answers the case
that actually happens (one order, one consignment) exactly, and the case it does
not is a second order.

---

## D119 — One valuation method, and back-dating is refused in writing

**Date:** 2026-08-28 · **Status:** shipped

Stock is valued at a **moving average rate per (product × place × batch)**, held
in thousandths of a minor unit, derived fresh on every read. The other three
methods a mature stock system offers are refused, and so is the one capability
that would make them workable.

### Why not FIFO or LIFO

Both need a **queue per key** — a list of `[quantity, rate]` bins that has to be
replayed from the beginning whenever anything lands out of order. That queue is
not an implementation detail; it is the reason a mature stock ledger grows a
**reposting subsystem**: ERPNext's is a job runner, a set of concurrency gates, a
repost-item-valuation doctype with its own queue and error states, and six
reports whose only job is to find ledgers that have gone wrong. A moving average
holds one number per key and needs none of it.

**The price is said out loud:** a moving average cannot tell you which delivery a
unit came from, so it cannot value a recall by lot. Where that matters the
product already has **batches**, and the rate is per batch — which is FIFO's
answer to the only question FIFO is better at, arrived at from the other
direction and without the queue.

Standard cost is refused for a different reason: it needs a variance account and
a periodic revaluation run, which is an accounting workflow rather than a stock
one, and this product does not have a ledger to post the variance to.

### And back-dating is refused, which is what makes the choice hold

**A movement is priced at the rate that stood when it landed, and there is no way
to insert one behind that.** Every write goes through the chokepoint with the
server's own clock; `day` is what a person says about the world, and it never
reorders the ledger. A correction to a past figure is a **new movement today**
with its own reason, which is what `product.recount` and the undo already are.

That refusal is the whole of the alternative to reposting. Allowing an
out-of-order insert means every rate after it is wrong until something replays
them — and replaying them means the queue, the job runner, the gates, and the
reports that exist because those three do not always agree. Nothing here can
disagree with anything, because there is nothing accumulated to disagree with: a
shelf's value is `quantity × rate` computed at the moment it is asked, and the
ledger's `value` column is a separate fact about what each movement cost, which a
repricing must never rewrite.

**What this costs, plainly:** a workspace that discovers in March that a January
delivery was invoiced at a different price cannot make January's reports change.
They can correct the shelf today, with a reason, and the correction is visible as
a movement. For a business that needs January restated, this is the wrong
product, and that is a better answer than a subsystem nobody asked for.

The same refusal governs an order's **carriage** — D118 is that case in detail.

---

## D120 — One record, one owner: apps share rather than each keep a copy

**Date:** 2026-08-28 · **Status:** shipped

A deployment serves several products to one workspace, and they have facts in
common: a supplier OneInventory buys from is a customer OneBook invoices and a
person OneHR pays. **Each of those is one record with an owner, not three tables
that agree most of the time.** The seam is three declarations and no imports:
`shared: true` on the owning collection, `borrows: ["party"]` on the app that
references it, and `hears` for the event that makes one app's write another
app's consequence.

### Why not the obvious alternatives

**Not a shared package.** A package of common tables is a package every product
must depend on, deploy with, and migrate in step — and the day one product needs
a column the others do not, the package grows a flag. What is actually wanted is
one product OWNING the record and the others naming it, which is what a manifest
can express and an import cannot.

**Not an import between apps.** It typechecks and it is wrong in a way nothing
else would catch: a workspace that installed OneInventory would carry OneBook's
whole surface, and one product's deploy would be the other's. `apps.test.mjs`
refuses the package name and the relative path out of a tree, and refuses both
against the proving ground too.

**Not "whoever declares it first wins".** Every app in a deployment applies its
schema to the same shard, so two apps declaring `party` is a
`CREATE TABLE IF NOT EXISTS` won by whichever runs first: the loser's columns
never exist, its inserts fail on a field it declared, and every manifest is
correct when asked on its own. That is D114's outage between an app and the
platform, one layer out — and it is why the check is structural rather than
behavioural.

### The reserved concepts, and why a list rather than a discovery

`shadow.test.mjs` refuses a duplicate collection id across apps, which fires once
BOTH apps exist. That is a year too late: the moment worth catching is the FIRST
one, when the name is being chosen and changing it is free. So a short list names
the concepts that are spoken for — `party`, `contact`, `customer`, `supplier`,
`vendor`, `employee` for OneParty; `account`, `journal`, `posting`, `fiscal`,
`tax` for OneBook — and any other app declaring one is refused.

The list is deliberately short. A concept earns a line when a second product
would otherwise need its own copy of it. **`ledger` is not on it**: a stock
ledger and a general ledger are two different things that share a word, and
reserving the noun would be reserving English.

**The exemptions can only shrink.** `MIGRATING` names a collection that already
exists under a reserved name and the stage that moves it — today only
OneInventory's `supplier`, which BS-9 moves. An entry whose app has STOPPED
declaring the name fails the guard until the line is deleted, so an exemption
cannot outlive its reason.

### What an event may and may not do

`hears` is delivered AFTER the emitting operation's write, and it cannot undo it.
An accounting entry is a consequence of a goods receipt, not a precondition of
one: refusing the receipt because a chart of accounts is misconfigured would make
one product's setup another product's outage. A handler that throws is logged and
swallowed.

The asymmetry in `refuseHears` follows from that. An event nothing hears is
quiet — a workspace without OneBook installed is the ordinary case. A handler for
an event NO app raises is dead code that looks live, and refuses.

---

## D121 — One membership buys every product, and a workspace starts with all of them

**Date:** 2026-08-28 · **Status:** shipped

There is **one price for the whole deployment**, not one per product. `PLANS` is
the deployment's; `entitlementKeys` is the UNION of the platform's keys and every
app's; `refuseCatalog` fails the build if any plan is silent about any of them.
Solo's own line is *"One person, everything we make."*

**So a new workspace starts with every product switched on.** What a plan sells
is SIZE — seats, storage, products, locations, parties — never which products you
are allowed to open.

### What a workspace still chooses

Switching a product OFF, at founding or later (`app.add` / `app.remove`, and the
last one cannot be removed — a workspace with nothing on has no screens,
including the one that would switch something back on). That is a decision about
what is in the navigation bar, not about what was bought. A business that will
never keep stock should not carry a Stock destination; it is not being sold
anything less by turning it off.

### The defect this replaces, and why it was invisible

`NewWorkspace.tsx` seeded the founding form with `items.slice(0, 1)` — the FIRST
product. With one product in the catalogue that is the same list as all of them,
and the card offering the choice stands down entirely, so the narrowing was
indistinguishable from correct for as long as OneInventory was alone. Registering
OneParty made founding start asking a question and pre-answering it with half the
catalogue: the new workspace came up missing a destination, on a plan that
included it, with nothing failing and no screen saying why.

**`space.test.mjs` is what stops it recurring**, and it checks the SHAPE rather
than the value: `slice`, `filter`, `at`, an index, and a hardcoded id are each a
way to write the same defect and each reads as ordinary code. All five are
mutation-tested.

### What this settles about OneBook

BUSINESS.md asked whether OneBook is installable or an always-present engine
service. It is neither: it is **a product like the others** — included in the
membership, on by default, and switchable off by a workspace that does not want
a chart of accounts. The worry that motivated the question (a workshop counting
stock being handed accounting it never asked for) is answered by the switch, not
by the price.

---

## D122 — A borrowed record gives its name and nothing else

**Date:** 2026-08-28 · **Status:** shipped

`AppSpec.borrows` has said since BS-1 that naming another app's collection "lets
this app point at one and **draw its name**". Nothing enforced the second half,
because until a borrowed hop resolved at all there was nothing to enforce: the
ref composed and the PATH through it did not, so `supplier.name` was refused as
`path_target_unknown` and no product could use the seam it was given.

**`reachFor` now resolves a borrowed hop, for the field `name` and no other.**
Everything else through a borrowed ref is `borrowed_beyond_the_name`.

### Why the literal field name, rather than the owner's `names`

The kernel cannot see the owner. An app composes ALONE — that is the point of the
seam, and the alternative is that OneInventory cannot be typechecked without
OneParty in the room — so `collections` holds this app's own and no other's, and
there is no declaration to ask which field labels a borrowed row.

So the owner's answer is made the literal name instead: `refuseCollection` refuses
`shared` unless `names` is the field called `name`. Both ends then agree without
either importing the other, and BS-1's decorative `shared_without_a_name` becomes
load-bearing. A collection may still name itself by `label` or `title` — it may
not also be shared.

### And why not in `deploymentFaults`

That is where cross-app knowledge legitimately lives, and it is the wrong place
for this one: `deploymentFaults` REPORTS rather than throws, so a check that ran
there would let one product read another's tax identifiers behind a line in a log.
A rule about what may cross an app boundary has to refuse at composition.

### The three consequences, each written where it bites

- **`shared` must be tenant-scoped.** The borrower's join is built without the
  owner's spec, so there is no `eraseBy` to ask and the workspace clause has to be
  knowable from the id alone. A subject-scoped shared row would be one person's
  record read across a product boundary; a global one has no clause at all, which
  is a picker reading every workspace's parties.
- **The join reads two columns and the STATEMENT says so.** `SELECT id, name`,
  never `SELECT *` — a whole record in the worker's memory is one key lookup from
  a screen, and the defence must not be the loop that happens to pick a field out
  of it. A borrowed picker (`choicesOf`) is the same statement for the same reason.
- **A borrowed hop demands no permission.** `collectionsFor` subtracts `borrows`
  before the grant check. The opposite failure is the sharper one: a warehouse
  worker with no OneParty grant refused a screen that shows a supplier's name and
  nothing else, which would make the mechanism dead on arrival.

Every rule here is mutation-tested — the two refusals in `kernel/test/manifest.test.ts`,
the name-only reach and both halves of the statement in `runtime/test/joined.test.ts`.

### And the half no declaration can reach: `borrowed.test.mjs`

Everything above is about a DECLARED path. A `SELECT * FROM party` inside a
handler never goes near the kernel, appears in no manifest, and would put another
product's tax numbers, terms and contact rows in this one's memory with nothing
anywhere saying a word. So an app may name a borrowed table **exactly once** in
its source, in **exactly** `SELECT id, name FROM <table> WHERE tenant_id = ?`,
and everything else in the app reads that one answer.

⚠️ **ONE STATEMENT RATHER THAN A PARSED SELECT LIST, AND THAT IS THE WHOLE
DESIGN.** Reading the columns out of arbitrary SQL is a parser, and a parser is a
thing that quietly fails to understand an alias — `SELECT p.taxId FROM party p`
is two characters from the shape a naive matcher waves through. A count and a
literal cannot be talked past. It is `storage-chokepoint.test.mjs` one boundary
over, for the same reason: a write behind the ledger is invisible for ever, and
nothing else would notice.

Five mutations, all firing: a `*`, an alias reaching for a private column, the
scope clause dropped, a second statement beside the canonical one, and the seam
removed entirely — the last because a guard that asks nothing prints exactly like
a guard that passed.

---

## D123 — One address book, and OneInventory reads it rather than keeping a second

**Date:** 2026-08-28 · **Status:** shipped

OneInventory declared a `supplier` table with a name, a contact, an email and a
phone number on it. That is an address book — so a workspace running it beside
OneParty had two, with the same company typed into each and nothing keeping them
in step. `shadow.test.mjs` has named it as a collision since BS-3, with one
`MIGRATING` entry excusing it until OneParty existed. **That entry is now deleted,
which is the check paying itself off rather than rotting into an exemption.**

Every ref that named a supplier — on `product`, on `sourcing`, on `buying` —
points at `party`, and OneInventory declares `borrows: ["party"]`. No import, no
shared module.

### What OneInventory keeps, and why it is not nothing

`supplying`: one row per party this workspace buys from, holding **our account
number with them** and **how long they take**. Both are facts about BUYING and
are meaningless on a customer or a worker, which is exactly why OneParty must not
hold them — a shared record that every product adds a column to is the junk
drawer this split exists to prevent.

**Its id IS the party's id.** There can only be one "how we buy from Harbour
Supplies", so the party is the key rather than a column beside one, a second row
is impossible by construction, and this app's own lists — what they supply, orders
with them — are narrowed by the record the screen is about with no translation
step. The `party` field beside it is one fact in two places on purpose: the id is
the key, and a `ref` field is the only thing a path can travel through to reach
the name. It is `settled`, and one operation writes both.

### The two things that got smaller, deliberately

- **The supplier page lost its contact details.** Who to ask for, an email and a
  telephone number are on the party's page in OneParty, held once for every
  product that deals with that company. What stayed is what this product knows.
- **The import can no longer create a supplier.** It matched a spreadsheet column
  against its own table and inserted what it did not find. It now reports the
  unrecognised names once and leaves the product's supplier blank; the products
  still land. A column has no duplicate check and `party.register` does — creating
  parties from a sheet is how one company becomes "Acme Ltd", "ACME" and "Acme
  Limited" in a book nobody can then reconcile.

### Two defects the migration found, both by RUNNING something

- **`party.register` had never been executed.** It wrote `tax_id`, `pays_within`
  and `paid_within`; the schema spells a column exactly as the field is spelled,
  so all three threw `no such column` on the first real call. The manifest
  composed, ninety-six guards were green, and nothing had ever pressed it.
- **The engine does not check that a `ref` names a row that exists.** The deep
  suite read `id` off an operation that answers with `party`, got the string
  `"undefined"`, and raised six purchase orders against a supplier that is not
  there — passing. That is pre-existing and is not what this stage changed; it is
  recorded here because it is the reason a whole suite could be green over
  references to nothing.

## D124

**A record somebody commits to is a DOCUMENT, and the ladder is the engine's.**
`document: { series, amendable, cancel, posts }` on a collection, and everything
follows: three standings, three operations, four columns, a numbered series and
a table to count it in. No app writes a submit.

### Why the engine rather than each app

Every product in a business suite has documents, they all need the same three
transitions and the same numbering, and an app that implements its own gets one
of them subtly wrong. The framework this round was read against — Frappe, under
ERPNext — settles it the same way: `docstatus` and `naming_series` are the
FRAMEWORK's, and every module inherits them. Reaching feature parity with an ERP
means owning this seam; re-deriving it per product means "cancel" coming to mean
four different things inside one deployment.

### Three standings, not four

`draft → submitted → cancelled`. "Amended" is not a state a document is in — it
is a fact about a CANCELLED document that another one points at, through
`amends`. A fourth standing would be a second place the same truth lived, and
the two would disagree the first time an amendment was itself cancelled.

### What is deliberately not copied

- **Per-field "allow on submit".** A hole with a checkbox on it: every field so
  marked changes after the number was issued and after the ledger moved, with the
  document still reading as evidence. A submitted document is closed, whole, and
  the way to change one is to cancel and amend.
- **Nine naming strategies.** Set-by-user, autoincrement, by-fieldname, series,
  expression, a deprecated second expression, random, UUID and a scripting hook.
  Each is a way for two documents to end up differently named. One grammar:
  literal text and braced placeholders — `{YYYY}` `{YY}` `{MM}` `{DD}`,
  `{#####}` for the counter, `{field:x}` for one of the document's own.
- **A dot-delimited placeholder.** `.YEAR.` is a token nobody implements and a
  dot-delimited grammar cannot tell it from literal text — so a typo prints
  itself on every invoice for the life of the deployment and is found by a
  customer. Braces make an unknown token a refusal at composition.
- **Amending under a suffixed number.** Their amendment takes `…-1` and the
  cancelled document keeps the clean number. Most jurisdictions want a gapless
  sequential run, and several forbid withdrawing a tax invoice at all. That is
  what `cancel: { by: "refusing", instead, why }` is for: the lawful correction
  is a different document, and naming it lets a screen offer the right thing
  rather than nothing.

### What is new rather than copied

**A document declares what it POSTS, so the reversal is derived.** ERPNext
hand-writes `on_submit` and `on_cancel` per module, and cancel is where its bugs
live — read it off their own settings screen, which carries
`unlink_payment_on_cancellation_of_invoice`, `delete_linked_ledger_entries` and
`enable_immutable_ledger`. Those are switches that exist because nobody could
settle what cancel means. Here the engine knows what submitting wrote, so it can
work out what cancelling must write. Same move `purge` made for erasure.

### The three that would have been silent

- **The number is taken in the statement that advances the counter.** One
  `INSERT … ON CONFLICT … RETURNING`. Read-then-write is the shape every
  numbering bug has: two requests read 41, both write 42, and one workspace has
  two invoices with one number — invisible until an auditor sorts by it, and
  unrepairable because both have been sent.
- **The counter's key carries the period.** A series with `{YYYY}` restarts each
  year because that is what a business means by it; keyed on the collection
  alone, `INV-2026-0412` is followed on the first of January by `INV-2027-0413`
  and the year in the number is decoration.
- **The draft clause is in the `WHERE`.** Checking the standing and then updating
  leaves a window a concurrent submit fits between, so the edit lands on evidence
  having passed a check that was true when it was asked. One statement cannot be
  raced.

### What it cost elsewhere, and what that says

`movesFor` is separate from `operationsFor` because two callers of that one cast
the tail of an id back to a `CrudVerb` — folding three non-CRUD ids in would not
fail to compile, it would produce a `CrudVerb` holding "submit". And a screen
must be able to read a standing, so `readableFields` is what a surface binds
against: a collection's own fields plus the rail's, which is strictly wider on a
document and identical on everything else. Both were found by the composer
refusing the ground's first document, which is the whole argument for declaring
one there.

### The floor

`stands` is NULL for a draft, which is the same trick `aside` uses: every row
written before the columns existed reads as the draft it was, so a live database
gains the rail on its next boot with nothing migrated. A global-scoped document
is refused — its counter would be one every tenant increments, so one business's
numbers would skip wherever another raised a document, leaking how busy the
neighbours are and handing an auditor a gapped run.

## D125

**A workspace's numbering format is its own, and changing it is never a deploy.**
`series.list` and `series.set`, two routes for the whole app rather than two per
document, over a `series` table the workspace writes.

### Why it is not a setting

The settings rail resolves one declared key to one value. A numbering format is
per COLLECTION — a product with six document types has six of them — so as
settings it would be six declarations an app has to remember to write, one per
document, with nothing checking that it did. Derived from `document.series`
instead, it exists the moment a collection declares one.

### The bug this stage found in the last one

`MoveAt.series` was declared in AC-1 and no caller supplied it: the
workspace-editable half of the rail was inert — a capability built, guarded and
reachable by nothing, which is the failure class this repository has the most
history with. And the reason it could not be
supplied is worth keeping: **the pattern was stored on the counter row.** A
counter is keyed by its PERIOD — `invoice:2026` — which is derived from the
pattern, so a read that begins "what is this workspace's pattern" cannot use
that key, because it does not have the pattern yet. Two facts, conflated:

- `numbering.pattern` is the record of what a counter COUNTED, and is the answer
  to a question asked of an old count.
- `series.pattern` is what the workspace CHOSE, and is read before a number is
  issued.

### The three rules

- **Absent means the app's, for ever.** No row is written at founding. Seeding
  one would freeze every workspace against the declaration as it stood on the
  day they signed up, so a later change to the default would reach new
  workspaces and no existing one.
- **The way back is deleting the row, never copying the default into it.** Same
  reason, one step later: a workspace that undid its own format by having the
  app's written in would be frozen against a declaration that afterwards moved.
- **Changing the format does not restart the count.** A workspace fourteen
  documents in still has fourteen behind it. Where the new pattern implies a
  different PERIOD the restart happens by itself, because the period is part of
  the counter's key — which is the same mechanism, doing the right thing without
  a second rule.

### And the screen shows the result, not the pattern

`INV-{YYYY}-{#####}` is not what an accountant recognises; `INV-2026-00042` is,
and it is the only form in which a wrong answer is obvious before a document has
gone out carrying it. `numberingIn` works it out from where the count actually
stands rather than describing what would happen.

## D126

**A ledger without periods is a ledger nobody can finish.** OneBook gains a
`year` and an optional `period`, one chokepoint asks whether a day may be posted
to, and closing a year posts an entry rather than setting a flag.

### The fiscal year is not January to December

The United Kingdom's companies commonly run to March or April, Australia's to
June, Japan's to March, and a business may pick its own. A calendar year assumed
anywhere would put a chunk of every profit-and-loss in the wrong one for most of
the world, by exactly the amount that fell on the wrong side of a date.

### Periods are optional, and that is the point

A business whose accountant does the books once a year never makes one; a
business closing monthly makes twelve. Requiring them would put eleven rows of
ceremony in front of somebody who wanted to record a sale. `monthsIn` offers the
twelve so nobody types twelve date ranges — every one of which is a chance to
leave a gap, and a gap is a week belonging to no period, which nothing refuses.

### Three refusals, and one of them is the surprising one

- **A closed year** refuses, because its profit has already been moved.
- **A shut month** refuses, because somebody signed it off and a correction
  typed afterwards silently changes a figure already filed.
- **No year at all refuses too**, and that is the one worth stating. Treating
  "outside every declared year" as permission makes the whole check useless in
  the case it exists for: a mistyped date lands in 2062, in no year, and posts
  happily — into a profit-and-loss no report will ever show it in, because every
  report is bounded by a year.

**Overlapping years are refused at the declaration** for the same class of
reason: a day in two years belongs to two profit-and-loss statements, so the
same sale appears in both — and the pair reconcile perfectly against the ledger
while disagreeing with each other. There is no figure downstream that looks
wrong.

### Closing posts something

A year that is only a flag is hidden rather than closed. What makes next year's
report start at zero is that this year's income and expense were emptied into
reserves in one entry; without it every "this year" figure is really "since the
books began", wrong by more each year. **Only income and expense move** —
sweeping the balance sheet would empty it, and the arithmetic looks identical,
which is why it is named. The entry is dated the year's last day, which is the
one day it can be: dated today it would land in the next year and take the
profit with it.

**Reopening reverses the entry rather than deleting it.** What happened is that
the year was closed and then reopened, and both are facts; a ledger that forgets
is a ledger nobody can audit.

### Two callers, two answers to a refusal

`writeEntry` returns the refusal rather than throwing, because its callers want
different things from one. A person typing an entry is told which month is shut
and can reopen it or move the date. An **event** arriving from another product
has nobody to tell — so that path throws, `heard()` logs which app heard what,
and the goods stay on the shelf while an operator is told the accounting behind
them has stopped. Deciding inside `writeEntry` would have picked one of those
for both, and the automatic path is the one that would quietly go on posting
into a month somebody has already filed a return for.

### And `year:write` is its own key

Closing a year is not posting to it and is not shaping the chart. It moves a
year's profit and stops anybody adding to what was filed — the one act in this
product that reaches backwards over everything already recorded. Whoever enters
the week's invoices should not be able to do it by accident.

## D127

**One workspace is one company, and a branch is a column rather than a second
workspace.** OneBook gains a `centre` tree, every posting line may name one, a
workspace can require one on the profit and loss, and the engine refuses a tree
bent into a ring for every app at once.

### The chart answers "what" and nothing in it answers "where"

Rent is rent whether it was the shop's or the workshop's; wages are wages
whichever department earned them. A business with two branches, three departments
or a dozen projects needs both figures out of one ledger — what it spent, and
which part of itself spent it. An account per branch is the answer that looks
obvious and is wrong: it multiplies the chart by the branches, so a new branch is
thirty new accounts and every report has to be re-summed by hand.

### Which settles the branch question

ERPNext supports many companies in one installation. We do not, and this is why
we do not have to: **a workspace is a company** — one chart, one year end, one
return — and its branches are cost centres inside it. Giving each branch its own
workspace would give one legal entity several ledgers that can never be added up,
while the return it files is about all of them. A group of separate legal
entities is a different question, and the answer to that one is a consolidator
reading several workspaces, which is not built and is not needed until somebody
has two companies rather than two shops.

### One axis, and the second one is deferred with its shape written down

A posting carries one optional `centre`. A second dimension is a join table on
`posting` — the largest table this product holds — so a row per posting per
dimension, and every report would pay the join whether or not anybody had ever
used a second axis. The shape it would take when something needs it: a
`dimension` collection naming the axes a workspace declares, a `posting_tag`
table of `(posting, dimension, value)`, and every report gaining an optional
`GROUP BY` over it. Nothing about the column below is in the way of that; the
column becomes the first row of it.

### And it goes on the line, not on the entry

A purchase covering two departments is one entry with two lines. A centre on the
header would make that impossible to record without splitting the invoice, which
is the workaround every system that made this mistake documents as a feature.

### The requirement only bites on the profit and loss

That is the industry's rule rather than a convenience. Cash is not the shop's
cash — it is the company's, sitting in one account — and neither is a debt owed
to a supplier. Asking which department a bank balance belongs to is a question
with no answer, so a workspace that switched the requirement on would otherwise
be unable to record a payment. It is **off by default**: most businesses have one
place and no departments, and a compulsory field with one answer in front of
every entry is ceremony.

### Narrowing to a parent means the parent and everything under it

Filtering the ledger to the one row called Retail answers with whatever was
posted directly to it, which in a business that posts to its shops is nothing at
all — a report that is empty, correct, and reads as broken. `within` is that
walk and `rollUp` is the same idea for the totals: nothing is posted to Retail,
and Retail's figure is the only one anybody wanted.

### A tree bent into a ring is the engine's problem, not the app's

`refuseParent` was written in OneBook and then deleted, because the rule is not
about accounting. **A `ref` pointing at its own collection is a tree**
(`treeFieldsOf`), and moving a record under one of its own descendants is refused
by nothing a database can express: both ids are real, both rows are the caller's,
and the update lands. What it produces is a shape with no root, so every walk
over it runs until something times out, and the person who did it saw a save that
worked. `patch` now climbs the tree in one recursive statement — `UNION` rather
than `UNION ALL`, which is what makes it terminate over rows that are already
bent — and refuses both the ring and a chain past `DEEPEST_TREE`. OneInventory's
places had the same hole and are closed by the same diff, which is the argument
for putting it there.

### And an optional field can finally be cleared

Every checker describes what a VALUE looks like — a ref is a non-empty id, a
colour is six hex digits, a day is a date — so emptying one was refused as a
malformed value. A record moved into a tree could never be pulled back out of it,
a supplier could never be un-assigned, an accent could never be taken off, and
the refusal arrived at the form as "Expected >=1 but received 0" under a control
somebody had deliberately emptied. `checkSome` now takes `""` or `null` on an
optional field and stores `null` for both — one kind of empty in the column,
because two would make every reader test for both and the first one testing only
for `IS NULL` would quietly miss half the rows. `text` and `long` keep `""`,
where an empty string is a value somebody typed nothing into. **And the same
change closes the opposite hole**: `required` was read by the create path alone,
so a patch could take a record's name away and answer 200.

## D128

**The books are kept in one currency and a posting may record another.** A
workspace's own currency reaches an app through `Ctx.currency`; an account may
name a currency of its own; a posting line carries what actually moved, at what
rate, beside the base figure the ledger adds up; and `book.revalue` restates the
foreign accounts at a date's rates.

### `amount` is still the only figure that balances

Every balance, report and check adds up the base column, so an entry balances
however many currencies it touches. The other two columns are not decoration:
without them a business cannot say how many dollars are in the dollar account —
the base figure has moved with every rate since — cannot reconcile against a
foreign bank statement, and cannot show a supplier what it owes in their money.

### A rate is an integer of millionths, never a float

`0.1 + 0.2` is famously not `0.3`, and a rate multiplied into every line of every
entry is the worst place for it: the error is small, different per line, and
surfaces as a trial balance out by pennies with nothing to point at. Six places
is what banks and central banks publish.

**The bounds on a rate are for typos, not economics.** Real rates span from a
millionth of a bitcoin to fourteen hundred won, so the floor and ceiling are wide
enough that no real quote meets them. What they catch is a rate typed into the
amount box.

### The conversion is minor-unit aware, and that is the trap

A hundred yen and a hundred cents are the same integer and a hundredfold apart.
A conversion assuming two decimal places is right for most of the world and wrong
by 100 for Japan, Korea and Iceland — in a figure that looks entirely plausible.
`minorDigitsOf` is exported from the kernel (it was already there, private,
behind `sayMoney`) and asked about **both** currencies. A second copy of that
fact anywhere is a second place to be wrong about the yen.

### And the arithmetic is `BigInt`, for a reason worth stating precisely

A billion in cents times a rate in millionths is 1e17, past what a double holds
exactly — and the error is usually absorbed by the division that follows, so most
large figures come out right with floats and a few do not. Finding a case that
actually differs took several attempts, and that is the argument: reasoning about
where the boundary sits is something somebody has to re-check on every edit, over
an arithmetic whose failure is money. Exact is cheaper than
correct-if-you-think-about-it. The result is then checked to fit inside an exact
integer before it leaves, because `field.money` is a JavaScript number.

### The base figure is recomputed, never trusted

A caller sending a foreign amount, a rate and a base figure is a caller who can
send two numbers that do not agree — and a ledger that adds up one of them while
a bank statement reconciles against the other is a set of books that balances and
cannot be reconciled. `journal.post` recomputes and refuses a mismatch, which is
the same shape as `planRun` returning its prompt and its reserve from one call.

### Rates are typed, not fetched

A rate a business files a return on is one it can point at a source for — a
central bank's published figure, or the rate its own bank actually gave it — and
those two differ. Pulling a third number off an API and posting it would be
inventing a figure the business cannot defend. `rate` is dated, and the lookup
takes the latest on or before the day, which is what an accountant does.

### Revaluation posts an entry, and names what it could not do

A balance sheet is as at a date, and a foreign balance has to be shown at that
date's rate; a dollar account filled at 3.60 and still reported at 3.60 a year
later states a figure that was true once. **It posts rather than displaying** —
`year.close`'s argument — because a revaluation nobody posted is a number the
next report disagrees with. **An account whose currency has no rate is left out
and the currency is named**: guessing a rate is inventing a figure and posting
it, and skipping silently would be a report that ran, claimed success, and left
the one account somebody was asking about exactly as wrong as it was.

### What is deferred, and why it could not be built yet

**Exchange gain or loss on settlement** — a receivable booked at one rate and
paid at another — needs a payment allocated against an invoice, and neither
exists yet. Building the arithmetic now would be an export nothing imports, which
this repository's capability guard refuses on purpose. Revaluation is the half
that needs no allocation, and it is complete.

### One reserved word, found by the composer

`foreign` is a word SQL means something by, and the kernel refuses a field named
one — so the column is `original`, which is the standard phrase anyway ("the
amount in the original currency"). The refusal arrived at composition rather than
as a `CREATE TABLE` that would not parse on a deployment.

## D129

**A document that posts is a declaration with a handler behind it.** The rail set
a standing and issued a number, and neither of those is what an invoice is for.
`AppSpec.postings` is where a `DocumentSpec.posts` rule lives; OneBook gains a
tax code, a sales invoice on that rail, its lines, and the entry submitting it
writes.

### The declaration had nothing behind it

`posts` shipped in D124 and the composer checked that a rule was NAMED. Nothing
checked that anything ran — so an invoice could submit, take its number, become
evidence, and leave the ledger untouched with every screen green. The refusal is
now two-way: a rule no handler declares, and a handler no document names. Both
are the shape every other guard in the manifest exists to catch.

### Two halves, and the split is the order of operations

`may` is asked **before** a number is taken and holds every refusal — a shut
month, a closed account, an entry that will not balance. `post` runs once the
document stands and by then the answer has to be yes. An issued number cannot be
given back, so a document that took one and then failed is evidence with no entry
behind it and no way to undo either half. The seam is two functions rather than
one for exactly that reason, and the runtime test asserts the ORDER rather than
that both ran: a test that only checked "both happened" would pass on the
arrangement this exists to prevent.

### A sales invoice cannot be cancelled

The customer holds the paper, the number is issued, and a return may be made of
it. `cancel: { by: "refusing" }` is the kernel's word for that and it names the
credit note as the way out, so nobody is left holding a wrong invoice with no
route. **Amendable follows rather than being a second decision** — an amendment
is a cancellation and a fresh draft, so a document refusing the first cannot
offer the second. The kernel refuses the pair, which is how that came to be
written down rather than shipped as a control that is always refused.

### Tax is a row, and it is rounded once per code

A rate typed on a line makes "how much did we charge at the standard rate" a
query over distinct values, and a mistyped 4% a rate that quietly exists. And
rounding each line's tax and adding up gives a figure that differs by a penny
from the tax on the total — so the invoice disagrees with itself and the
customer's own addition is the right one. Jurisdictions differ on per-line versus
per-code; what is not optional is picking one.

**A line with no tax code is untaxed, not zero-rated.** The two look identical on
a total and are different on a return in most of the world, so an untaxed line
appears in no tax group and a workspace that means zero-rated makes a code for it.

### The line names an account, not a product

What was sold is OneInventory's or OneTrade's to know; what the books need is
which income account it lands in. "Consulting, 2.5 hours at 90" against the
consulting account is a complete invoice for a business with no stock at all, and
the field a product-shaped document fills in when there is one. **A quantity is
thousandths**, because half an hour is a real invoice line.

### What the gate found, and it was all real

Five findings on the first run, and none of them was noise:

- **A NUL byte** in a template literal, written by the tool that generated the
  file. The invisible-character guard is the only thing in the repository that
  could have seen it, and the block is a map of maps now — nesting cannot be
  split wrongly, and any separator is a character an id could one day contain.
- **Two destinations wearing one mark.** A journal is a running count and an
  invoice is a piece of paper; they read differently once they are not identical.
- **`postings` declared and rendered by nothing**, which is D12 asked of the
  field I had just added. Its surface is the entry an invoice posted, shown on
  the invoice — B2's "why is this account moving" asked from the other end.
- **A borrowed party with its name unresolved**, which would have put an
  identifier on a document and in a journal entry.
- **A price read as a packing factor.** That one was the guard's own fault: it
  captured the first word after the operator, so `item.quantity * item.price`
  reported `item` — an object in no vocabulary it has. It captures the last
  segment of a path now, which is what makes its own `PRICES` list work at all,
  and it still fires on the fault it was written for.
