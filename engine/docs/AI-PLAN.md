# The AI suite

kind: plan

**Everything One does with a model: where the catalogue comes from, what a run
costs, who chooses, and what any app gets without asking.** This is the plan for
stage 27 and the stages it turned out to need. Nothing here is built yet except
where it says so.

---

## 1. What the state actually is

**The AI suite is declared end to end and reaches nothing.** That is not a
surprise — `DEFER(engine-27)` says so in three files — but the shape is worth
being precise about, because most of the design is already right and the gap is
narrow and specific.

| Piece | Where | State |
|---|---|---|
| Lanes, aliases, model rows, election | `kernel/src/ai.ts` | **built**, tested |
| An action declares a lane + letterhead (D19) | `kernel/src/operation.ts:162` | **built**, guarded by `ai-action.test.mjs` |
| Reserve → run → settle arithmetic | `kernel/src/credit.ts` | **built**, and correct |
| Operator binds a model, workspace rewords | `runtime/src/ai-actions.ts` | **built**, both write paths live |
| The console screen | `one-space/src/console/Actions.tsx` | **built** |
| `generate()` — reserve, run, settle | `runtime/src/services.ts:134` | **built**, called by nothing |
| A `Provider` that reaches a real model | — | **does not exist** |
| The model catalogue — rows, prices, capabilities | — | **does not exist** |
| An `AI` binding in `one/wrangler.jsonc` | — | **not bound** |
| An `ai` lane in `CREDENTIALS` | — | **does not exist** |
| Embeddings, vectors, search | — | **does not exist** |

`operatorOps` takes `models` as an **optional** dep defaulting to `[]`
(`runtime/src/operator.ts:120,169`) and `one/src/index.ts` never passes it. So
the catalogue is empty, `defaultIn` elects nothing, and the AI actions screen
correctly draws two red lines saying so. It is the only thing on the deployment
that would have told you.

⚠️ **THE HOLE IS THE CATALOGUE, NOT THE PLUMBING.** Everything downstream of "a
`ModelRow[]` exists" is finished. That is why this plan starts with where rows
come from.

---

## 2. What the docs changed about the design

Six findings. Each one removes work we would otherwise have had to write.

**1 · One endpoint answers for every provider.**
`https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/compat/chat/completions`
is OpenAI-shaped and takes `"model": "{provider}/{model}"` —
`workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast`,
`google-ai-studio/gemini-2.5-flash`, anything. So `Provider` has **one
implementation**, not one per vendor. The per-provider adapter layer a previous
platform carried does not need to be written here at all.

**2 · There is a model-discovery API, and it can speak a pricing format.**
`GET /accounts/{id}/ai/models/search` takes `task`, `search`, `author`,
`hide_experimental`, `include_deprecated`, and — the interesting one —
`format=openrouter`, which returns the marketplace shape rather than
Cloudflare's own. That is the machine-readable source for ids, tasks,
modalities, context windows and rates that the docs page does not otherwise
publish. ⚠️ **This is the one assumption in this plan that has not been
verified against a live call**, and stage 27a is a spike that does exactly that
before anything is built on it.

**3 · The gateway knows what every call cost, and will not tell the caller.**
There is no `cf-aig-cost` or `cf-aig-tokens` response header — the full header
glossary has neither. Cost and token counts land in the **log**, reachable
afterwards by `cf-aig-log-id` (returned) via `env.AI.gateway(id).getLog(id)`.
So the gateway's cost is a **reconciliation signal, never the settle path**. We
settle from the `usage` object in the response body, where it arrives
synchronously and cannot be late.

**4 · BYOK avoids a 5% fee, and the fee is on top-ups rather than inference.**
Unified Billing passes provider rates through "with no markup" and charges 5%
on credit purchases. Credential precedence is: key on the request → stored BYOK
key → Unified Billing. So holding our own Google key means we are never in that
5%, which is what you asked for and is worth about $50 per $1,000 of Gemini
spend.

**5 · AI Search includes the expensive half.** Storage, vector indexing and the
crawler are **bundled** — only Workers AI inference for embedding and generation
is billed separately. Paid limits: **5,000 instances per account**, 1M files per
instance, unlimited queries, 4 MB per file, 5 custom metadata fields, 10
instances per cross-instance search. Its Workers binding is genuinely good:
`search()` and `chatCompletions()` with retrieval type, filters, reranking,
query rewriting and a response cache, all as options rather than as code.

**6 · AI Gateway itself is free**, including analytics, caching, rate limiting
and DLP. Log storage is 10,000,000 per gateway on Workers Paid. Spend limits are
free too — per gateway, scoped by model, provider **or custom metadata**, in
rolling or fixed windows, answering `429` when hit, up to 20 rules.

---

## 3. Your three questions, answered

### "Can we control the system message from here?"

**Yes — and a workspace can too, if the app allows it.** The chain narrows
downward and is already built (D19):

| Who | What they may change | Where |
|---|---|---|
| **The app** | declares the lane and the default prompt, with its variables | the manifest |
| **The operator** | may reword any action, for the whole deployment | AI → Actions |
| **A workspace** | may reword an action the app marked `brandable`, for itself | its own settings |

The thing being reworded is the **system message** — the letterhead. The **user
message** is the runtime input: the note being summarised, the record being
described. That is never edited in a console, because it is not a setting; it
is the thing the person is working on.

### "…and pick the model they want?"

**Not today, deliberately — and I think we should change that, with one
condition.** `ai-actions.ts` says the model binding is the operator's alone,
because "a workspace choosing it would be a workspace choosing what we pay".

That reasoning is now wrong, and the wallet is why. A run is charged to the
**workspace's** credits at the row's own markup. So a workspace choosing a
dearer model spends its own money, at our margin, on purpose. The condition is
the one `refuseCatalogue` already checks: **every enabled row must have a
positive rate and a positive markup.** A row priced at nothing settles free on
every call, and that is the only case where their choice costs us.

Proposal: a workspace picks from the models **its plan allows** — a new
entitlement, `models: "standard" | "any"` — and the operator's binding becomes
the default rather than the ceiling.

### "Is Cloudflare AI Gateway the right proxy?"

Yes, and for a reason beyond convenience: it is the only place that knows what
a call cost **independently of our own arithmetic**. See §5.

---

## 4. The design

### 4a · Where rows come from — `models.sync`, a declared job

A job in the platform's own book (the mechanism shipped last week), hourly-eligible,
daily by default:

1. `GET /accounts/{id}/ai/models/search?format=openrouter&hide_experimental=true`
2. Map each model to a `ModelRow`:
   - `id` — the provider path, unchanged. It is already the primary key.
   - `provider` — the lane prefix `compat` needs (`workers-ai`, `google-ai-studio`).
   - `task` → `laneOf()`. Rows whose task maps to no lane are **kept and
     disabled**, and reported by `refuseCatalogue` as `unknown_task` — the
     screen already draws that.
   - `input` / `output` — **credits per 1,000 tokens**, converted (see §5).
   - `maxOutput`, `thinks`, `context` — from the catalogue's own fields.
   - `enabled` / `isDefault` / `markup` — **never touched by the sync.** Which
     models a deployment turns on and what it charges are decisions, and a sync
     that overwrote them would silently undo an operator every night.
3. A model that **disappears** from the catalogue is marked retired, not
   deleted — a bound action must keep resolving, and `boundModel` already
   degrades a dead binding to the lane's election rather than failing.
4. A **new** model arrives disabled. Nothing starts running on a row nobody
   looked at.

⚠️ **THE PRICE IS SYNCED AND THE MARGIN IS NOT.** A provider cutting its price
should reach us the next morning; a provider raising one must never quietly
raise what a customer pays without the markup being re-decided. So the sync
writes `input`/`output` and the console owns `markup`.

⚠️ **AND A FAILED SYNC CHANGES NOTHING.** Applying a partial catalogue is how a
lane loses its only enabled model at 03:00. The job writes all rows or none.

### 4b · One provider, one endpoint

```
POST {gateway}/compat/chat/completions
  cf-aig-authorization: Bearer {token}
  cf-aig-metadata:      {"t": tenantId, "a": appId, "o": operationId}
  cf-aig-custom-cost:   {"per_token_in": …, "per_token_out": …}
  cf-aig-request-timeout / cf-aig-max-attempts
  Authorization | x-goog-api-key: {BYOK, when the row's provider needs one}
  { "model": "{provider}/{id}", "messages": [system, user], "max_tokens": … }
```

- **`cf-aig-metadata` is the whole reconciliation story** and it costs one
  header. Five keys are allowed; we use three. It is what makes the gateway's
  own cost figures answerable per workspace, per product, per action — which is
  §5's alarm and also, free, the operator's usage screen.
- **`cf-aig-custom-cost` carries our RAW cost, never our price.** It exists so
  the gateway's analytics agree with what we actually pay a provider under BYOK.
  Sending our marked-up price would make the drift check compare a number
  against itself.
- **Streaming** sets `stream_options: {include_usage: true}`, so the final chunk
  carries the usage the settle needs. Without it a streamed run has no usage at
  all and every one of them settles at the reserve.

### 4c · BYOK lives in Keys

A third `CREDENTIALS` lane beside `email` and `stripe`:

| Key | Secret | What is true without it |
|---|---|---|
| `ai.gateway` | no | The gateway's name. Absent, no AI runs at all. |
| `ai.gateway_token` | **yes** | The gateway refuses every request. |
| `google.api_key` | **yes** | Gemini rows are unusable; Workers AI rows still run. |

Lane copy, in the shape `LANES` already wants:
- half — *"A gateway with no token is a deployment where every AI call is refused"*
- off — *"Nothing here can generate anything"*
- `needed: false` — a deployment with no AI is a deployment.

⚠️ **OUR CONFIG STORE, NOT THE GATEWAY'S SECRETS STORE.** Gateway BYOK would
hold the Google key for us under an alias, which is genuinely tidier — but it
needs a second API scope, a second place credentials live, and a second thing to
rotate. We already have envelope encryption under `CONFIG_SECRET`, which no
workflow can read, and a console screen that never reads a secret back. One
vault.

### 4d · The console: Operator → **AI**, with sub-pages

`OF_CONSOLE` loses `actions` and gains `ai`, which is an index like a
workspace's own screen rather than a tenth flat row:

| Sub-page | What it answers | New? |
|---|---|---|
| **Models** | what exists, what is on, raw cost, markup, capabilities, the lane's default | **new** |
| **Actions** | per product: which model answers each action, and whose words | exists — moves under AI |
| **Search** | AI Search instances, what is indexed, what failed | **new** |
| **Gateway** | which gateway, spend limits, what it says we spent, and the drift | **new** |

Keys keeps the credentials, because that is where every other credential is and
splitting them by subject is how one ends up set and another forgotten.

⚠️ **"AI actions" WAS A SCREEN CARRYING FOUR SUBJECTS**, which is what you saw:
a deployment-wide catalogue fault, a product picker, a per-action binding and a
prompt editor, stacked. The rename is not cosmetic — each of those is a
different question asked by a different person on a different day.

### 4e · Embeddings and search — one answer, not two

An app declares it on the collection, and everything else follows:

```ts
collection("note", {
  fields: { … },
  searchable: ["title", "body"],   // ← the whole declaration
})
```

From that, without the app writing anything:

- a **write** upserts the record's text as an item in that workspace's AI Search
  instance, under `folder: {appId}/{collectionId}/`;
- an **erase** deletes it — derived from the same `scoped` declaration erasure
  already reads, so a forgotten table is impossible by construction;
- a **search operation** appears in the composed surface, gated and audited like
  every other operation, answering `search()` for results and
  `chatCompletions()` for an answer with citations;
- the **MCP surface** gets it too, because that is derived from operations.

⚠️ **ONE INSTANCE PER WORKSPACE, AND THE CEILING IS 5,000.** The alternative —
one instance per app with `folder: {$gte: "tenant/", $lt: "tenant0"}` filtering —
scales further and isolates by query rather than by boundary. This tree isolates
tenants by boundary everywhere else (shards, residency, erasure), so it should
here; the ceiling becomes a declared limit with a problem raised at 80%, and
`resources.ts` already provisions per-deployment needs and can learn this
lifecycle. If 5,000 is ever close, folder-filtering is the documented fallback
and the item keys do not change.

**Vectorize is deliberately not exposed.** AI Search is Vectorize with the
pipeline attached and the storage included; offering both is two answers to
"how do I find something", which is the thing this tree refuses. The trigger
that would change it: an app needing its own dimensions, its own embedding
model, or vectors over something that is not text.

### 4f · The Agents SDK — not adopted, and the trigger is written down

**A plain Worker streams.** `return new Response(readable)` with SSE is all a
streaming answer needs, and Workers RPC passes a `ReadableStream` across the
service seam, so `generate()` can stream through the same typed boundary it
already has. The Agents SDK is not required for any of that.

What it genuinely adds is durable multi-turn agent sessions: recoverable
execution, per-agent SQL, scheduled continuations, human-in-the-loop approval.
What it costs is a Durable Object namespace whose class name is load-bearing
for ever, a second state model beside D1, and a second routing model beside
`where.ts`.

**Trigger to revisit:** the first product that needs a conversation to survive a
disconnect and resume where it stopped. Until then it is weight for a capability
nothing has asked for.

---

## 5. The money, exactly

The rule does not change: **a reserve is a ceiling on revenue.** `settle` charges
`min(held, actual)`, so every token the estimate fails to anticipate is one we
pay for and the customer does not. What changes is that the estimate finally has
real numbers, and that something outside our own arithmetic checks it.

### The conversion

**1 credit = $0.01** (1,000 credits for $10). `ModelRow.input`/`output` are
credits per 1,000 tokens, so:

| Source | Path |
|---|---|
| Third-party, USD/M tokens | `credits_per_1k = usd_per_million ÷ 10` |
| Workers AI, neurons/M tokens | `× $0.011 ÷ 1000` → USD/M → `÷ 10` |

Example: $0.29/M input → `0.029` credits per 1k. `estimate()` ends in
`Math.ceil`, so **the smallest possible charge is 1 credit — one cent — and that
rounding is the floor margin** that covers a call whose real cost is a fraction
of it.

### The three ways we lose, and what closes each

**1 · Reasoning tokens billed and not reported.** `THINKING_HEADROOM = 1.4`
already widens the reserve for a thinking model, and the sync will set `thinks`
from the catalogue rather than by hand. At settle, `completion_tokens` must be
checked against `completion_tokens_details.reasoning_tokens` — if a provider
reports them *separately* rather than *within*, adding them is the difference
between charging for the answer and charging for the work. **Verified per
provider in the spike, recorded as a column, never assumed.**

**2 · A non-Latin prompt estimated at Latin density.** `charsPerUnit` defaults
to 4 — an English average. Arabic runs nearer 2, so a whole market is estimated
at half and served at a loss, silently, for ever. Fix: derive it from the text
— a pure function over the non-ASCII share, interpolating 4 → 2 — so nobody has
to remember to pass it.

**3 · A streamed run with no usage.** Closed by `stream_options: {include_usage:
true}` above. Without it every streamed run settles at the reserve, which is the
safe direction but means the estimate becomes the price.

### The alarm — `ai.reconcile`, and this is the part that is new

A daily job that asks the **gateway** what the last day cost, grouped by our own
`cf-aig-metadata`, and compares it against what we charged:

```
for each workspace:  charged_credits × $0.01   vs   gateway_cost_usd
```

- Below cost → a **problem**, named, per workspace, on the Gateway screen.
- Persistently below on one model → the row's markup is wrong, and the sync
  cannot know that.

⚠️ **THIS IS THE ONLY CHECK THAT IS NOT OUR ARITHMETIC CHECKING ITSELF.** Every
under-count listed above was found by reading code; the next one will not be.
Cloudflare bills us from its own numbers, so its numbers are the only
independent authority on whether a month was profitable — and a reserve that is
a ceiling on revenue means an honest estimate is the *only* thing standing
between us and a slow loss.

### And a ceiling that is not ours to blow through

Gateway **spend limits** — free, per gateway, scoped by model, provider or
metadata — as a backstop under the wallet. The wallet stops one workspace; a
spend limit stops the deployment. `429` is a refusal we can render, which is
strictly better than an invoice.

---

## 6. The stages

Each is shippable on its own and leaves the tree green.

| # | Stage | Why it is separate |
|---|---|---|
| **27a** | **The spike.** Call `models/search` both formats against the real account; record what pricing, capabilities and context each returns. Call `/compat/chat/completions` against Workers AI and Gemini; record the exact `usage` shape, whether reasoning tokens are inside or beside, and what streaming reports. **Output: a fixture file, not code.** | Everything below is built on the answer. Guessing it and finding out at settle time is the failure this whole plan is about. |
| **27b** | The catalogue exists — schema, store, `models.sync` as a declared job, conversion, retirement, all-or-nothing write. | The rows are the hole. Nothing else can be tested without them. |
| **27c** | The lane runs — the `compat` provider, the `AI` binding, the `ai` credential lane in Keys, `generate()` reached by a real operation in Hello, reserve → run → settle end to end. | Closes `DEFER(engine-27)`. |
| **27d** | The console becomes AI — the rename, the four sub-pages, Models built, Actions moved. | The surface for everything 27b/27c made real. |
| **27e** | The alarm — `cf-aig-metadata` on every call, `ai.reconcile` as a job, the drift on the Gateway screen, spend limits. | It is the one check that would catch what we have not thought of. |
| **27f** | A workspace chooses — the `models` entitlement, the picker, the markup floor enforced at enable rather than reported. | A pricing decision; wants the catalogue and the alarm already live. |
| **27g** | Search — `searchable` on a collection, per-workspace instances through the reconciler, write/erase/search derived, the Search screen. | The largest, and it depends on none of the above except the credentials. |
| **27h** | Streaming — SSE through the RPC seam, settle in `waitUntil`. | Only worth doing once there is a screen that shows a token arriving. |

**Guards each stage owes** (this tree does not accept a capability without one):

- a **catalogue guard** — every lane an app declares has an enabled model, and
  every enabled row has a positive rate and markup (extends `refuseCatalogue`,
  which exists and is drawn);
- a **metering guard** — every call site of the provider goes through
  `generate()`, structurally, so a second path cannot bypass reserve and settle;
- a **credential guard** — the mock lane stays gated on `ENVIRONMENT` (the shape
  a previous platform shipped three times, each typechecking);
- a **search guard** — every `searchable` collection has an erase path, derived
  the way `purge` already derives its cascade.

---

## 7. What I recommend against

| Not doing | Because |
|---|---|
| Per-provider adapters | `/compat/chat/completions` is one endpoint for all of them. |
| Unified Billing | 5% on top-ups that BYOK does not pay. |
| Exposing Vectorize | AI Search is Vectorize with the pipeline attached and the storage free. A second search answer is the thing this tree refuses. |
| The Agents SDK | A Worker streams. It brings a DO namespace, a second state model and a second router for a capability nothing has asked for yet. |
| Settling from gateway cost | It is not in the response, only in a log that may be late. It is the *check*, not the *charge*. |
| Letting the sync write `enabled` or `markup` | A nightly job that undoes an operator's decision without saying so. |
