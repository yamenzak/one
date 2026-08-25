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
