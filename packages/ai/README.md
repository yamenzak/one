# @4dl/ai

The metered generation path. Every call takes the same route:

```
resolve model → RESERVE a worst-case hold → run (Workers AI | Gemini | mock)
              → SETTLE the exact credits from real usage → audit
```

| Module | What it is |
|---|---|
| `generate.ts` | The path above, for text, images and speech. Plus the per-actor daily budget. |
| `pricing.ts` | Provider catalog + price-list parsers, so a model's rate is imported rather than typed. |
| `mock-lane.ts` | The development-only mock decision. |
| `registry.ts` | What the APP declares: its features and its tones. |
| `media.ts` | Where a generated image goes. |
| `schema.ts` | `ai_models`, `ai_generations`, `ai_cache`, `insight_feedback`. |

## The catalog is the platform's; the selection is the app's

`ai_models` holds two different kinds of thing, and only one of them is any
single app's:

| columns | what it is | whose |
|---|---|---|
| `id`, `label`, `provider`, `input_rate`, `output_rate`, `unit_rate`, `unit_kind` | parsed from Cloudflare's and Google's **public pricing pages** | the platform's |
| `enabled`, `is_default` | which models this product turns on, and its default per lane | the app's |

Every app used to fetch the same two URLs, run the same parsers and write the
same numbers — and a brand-new app lived on `DEFAULT_MODELS`, twelve hardcoded
rows, until somebody remembered to press Sync.

So a successful sync now **publishes** what it parsed to `@4dl/core`'s shared
platform store (`shared-catalog.ts`), and two things follow:

- **A new app seeds the whole priced catalog on first boot.** Opening its AI
  panel populates `ai_models` from the published catalog, no Sync, no operator
  action. `DEFAULT_MODELS` goes back to being what it was always meant to be: a
  floor so an app can meter *something*, not a catalog.
- **A total parse failure is survivable.** When both pricing pages fail — a doc
  format change, a bad day at a provider — the sync falls back to the last
  published catalog instead of reporting failure and applying nothing.

`enabled` and `is_default` never cross by default. One product reads food
photos, another reads sterilisation labels, and a third has no use for the
speech lane at all.

### "Apply to every app" is a broadcast, not a shared default

But there is one operator, and turning a new model on meant finding it on every
console. So the AI panel has a switch, and `shared-selection.ts` is what stands
behind it.

A shared DEFAULT would be the wrong shape. It is a standing rule, so every later
divergence becomes an override — and an operator who turns a model off on one
app then wonders, months later, why it is off, with the answer living in a
precedence rule rather than in anything they did. Worse: `ai_models` is what the
credit math reads, and a second invisible layer under the column that decides
what a tenant is charged is a bug class nobody wants.

A BROADCAST is an event. "Turn this on everywhere" happens once, each app
applies it once, and after that every app owns its row again — exactly what
would have happened had somebody clicked through each console by hand.

A worker cannot write another worker's D1, so this cannot push. Each app PULLS:
a cursor in its own `app_config`, applied from two places — its AI console (so
an operator who looks sees it at once) and its daily sweep (so an app nobody
opens still converges within a day). Sequence numbers rather than timestamps,
because a tie on a clock means an op silently never applied, which looks exactly
like the feature not working.

`markup` is never broadcast: it is this app's price for this model, and pushing
one product's pricing onto another is a different decision from "we all want
this model available".

### Why publish a blob, when config is read-through

`getConfig`'s shared layer merges per key on every request, because that is how
config is used. This is the opposite shape: `ai_models` is joined, ordered and
filtered on the hot path, several times inside one `generate()`. So the shared
store is the **source** and the local table is the **applied result** — the same
relationship a package's schema has to a database. Publishing is best-effort and
can never fail a sync that already worked.

### `ai.markup` is a default, not the authority

Metering reads `ai_models.markup`, a per-row column. The `ai.markup` config key
is what the sync binds into every INSERT — so setting it in the shared store
decides what **new** models cost across the platform, while a per-model price an
operator set on one app's AI panel is never overwritten. Existing rows keep what
they hold.


## The operator console's endpoints are here too

`aiCatalogAdminRoutes({ isPlatformAdmin })` serves `/admin/ai/config`,
`/admin/ai/models`, `/admin/ai/models/:id` and `/admin/ai/models/sync`, and
`catalog-sync.ts` is the reconciliation behind the last one — it reads the two
official pricing pages, parses them with this package's parsers, and writes this
package's table.

All of it was Kova's until a second app needed it. The cost of leaving it there
was not theoretical: Tessa shipped `GET /admin/ai` and `POST /admin/ai` — two
endpoints against eight — so its console could show a key field and a read-only
model list and nothing else. Not because anyone decided that, but because
reimplementing eight endpoints is a project and writing two is an afternoon.

What stays in an app is what genuinely is the app's: a self-test that runs the
product's own prompts through its own parsers, and whatever it does with user
feedback on generated output. `onFirstProviderKey` is the one hook, for an app
that caches something a keyless mock lane produced.

The surface over these routes is `@4dl/admin`'s `PlatformAiSection`.

## One `task` column, two image capabilities

`ai_models.task` holds ONE lane per model, and a modern multimodal model does
not fit in one. `modelSupportsTask` is the translation, and the two image
capabilities are the part that keeps getting conflated:

| | Who can | Where it is written |
|---|---|---|
| **Read** an image (`vision`) | every Gemini model | [image-understanding](https://ai.google.dev/gemini-api/docs/image-understanding) — "All Gemini model versions are multimodal" |
| **Make** an image (`image`) | Google's image family only | [image-generation](https://ai.google.dev/gemini-api/docs/image-generation) — four models |
| **Speak** (`speech`) | three `*-tts` models | [speech-generation](https://ai.google.dev/gemini-api/docs/speech-generation) |

So a Gemini **text** model is a valid Snap-a-Meal model — Kova depends on it,
because Google's pricing page has no `vision` lane and no Gemini row is ever
tagged one — and is **not** a valid cover-image model: `runGeminiImage` asks for
`responseModalities: ["IMAGE"]` and the API refuses on a model without that
modality.

The image test keys on **`unit_kind === "image"`**, not on the id, because that
is what the sync already derives from the same pricing page (a row only becomes
`task: "image"` when Google prices its output "$X per image"). A new model in the
family therefore works the day it is synced, and a rename cannot reclassify
anything by accident.

It is also a **money** rule. `neuronsForUsage` charges for a generated image only
`if (rate.unitRate)`, so an `image`-tagged row without one bills the prompt and
gives the image away. The parser cannot produce such a row — it refuses the model
rather than guess a price — so it only arrives by hand-edit or restored backup,
which is exactly when a silently free lane goes unnoticed. Requiring the unit
rate closes the capability hole and the billing hole with the same condition.

`modelTasks()` inverts the rule into a list, and both `/api/settings/ai` and
`/api/admin/ai/models` send it. Clients filter their pickers on that rather than
on `task` — two frontends previously guessed with `provider === "google"` and
offered text models for image generation, which failed on every call.

TTS sits outside all of this: it runs through its own call
(`responseModalities: ["AUDIO"]`), never through `generate()`, so
`modelSupportsTask` says nothing about it.

## The mock lane is development-only, in every mode

`shouldUseMockLane` puts the environment check on the **outside**, so a stored
`ai.mock = "on"` — from an operator console, a hand-edited config row, or a
restored backup — cannot make production fabricate output.

That is not fastidiousness. A fabricated extraction gets written to a real
record, flows into the next prompt as context, and **the tenant is billed credits
for it**. In Kova's case that meant invented clinical lab values pre-filling a
client's chart. Whatever your app extracts, the same shape of failure is
available to it.

## Two things the app supplies

**The feature registry** (`configureAi`). Which features exist, their default
system prompts, and whether the house tone applies. Kova has 21 — "snap a meal",
"extract lab markers". An inventory app will have "read this label", "match this
SKU". They are metered, audited and rate-limited identically; only the prompts
differ, which is why the registry is a parameter and the machinery is not.

**Where images go** (`configureAiMedia`). The package takes `putMedia` and
`storageUsage` as functions rather than importing `@4dl/storage`, because the
storage QUOTA lives in a billing table. Importing directly would make the chain
`ai → storage → billing` — and an app that only reads labels would require a
payment provider.

## Reaching the credit authority

```ts
export interface CreditAuthorityNamespace {
  idFromName(name: string): DurableObjectId
  get(id: DurableObjectId): CreditAuthorityStub   // bind/reserve/settle/release
}
```

Deliberately **not** `DurableObjectNamespace<CreditLedgerDO>`. That type is
invariant in its parameter, so an app's subclass — which has strictly *more*
methods — is not assignable to it. Describing only the two calls this package
makes lets any subclass satisfy it structurally, which is the whole point of the
bindings contract.

The stub's methods also return concrete types rather than `unknown`: the Workers
RPC type machinery maps an `unknown` return to `never`, which makes every real
subclass unassignable with an error message that explains none of this.

## Importing this from a browser

Use **`@4dl/ai/model`** — the mock-lane decision and the pricing parsers, both
pure. The root pulls in the generation path, which holds credits against a
Durable Object and writes to R2.

The same rule bit inside this package: `pricing.ts` imported `@4dl/billing`
(root) for one constant, which drags in `credit-do.ts` and therefore
`cloudflare:workers`, and the unit tests died on `Cannot find package`. It now
imports `@4dl/billing/model`, and billing's ledger TYPES live in their own module
so the isomorphic surface can export them — a type-only re-export is not enough,
because TypeScript still typechecks the module it points at.

## Boundary

Empty ALLOW list. Three things left on the way in, and one is worth naming: the
prompt composer said *"The studio has also asked you to follow…"* — a string sent
**to the model**, where an inaccurate noun is an instruction it may repeat back
to an end user. It now says "the operator of this workspace".
