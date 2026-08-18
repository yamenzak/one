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
