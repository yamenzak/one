# What it costs to run

kind: guide

**Read this before optimising anything for money, and before fearing a bill.**
Every number here is from Cloudflare's published pricing, checked 2026-08-19,
with the arithmetic shown so it can be re-run rather than believed.

---

## 1. The short answer

**This deployment costs $5 a month until it is genuinely busy, and the busy
threshold is around sixteen thousand active people.** Nothing in the
architecture bills by time, by connection, or by capacity.

And the specific fear that prompted this: **the slowness was not costing
anything.** Workers bills CPU, not wall-clock — a request waiting on a database
is free — and D1 bills *rows*, not queries. The thirty sequential round trips a
cold start used to make read about thirty rows between them, against an
allowance of twenty-five **billion**. That was three seconds of somebody's life
and approximately zero money. Fixing it bought speed and changed the bill by
nothing.

---

## 2. What is actually bound

The whole cost surface, from `engine/one/wrangler.jsonc`:

| Bound | Billed on | Why it is cheap here |
|---|---|---|
| **D1** (directory + one shard) | rows read, rows written, storage | reads are effectively free; writes are the one to watch |
| **Workers** | requests, CPU-ms | no duration charge, so waiting costs nothing |
| **AI** | per call, through the gateway | metered and charged onward — see §5 |
| **send_email** | per message | transactional only |
| **assets** | free | the SPA is static |
| **observability** | log events | see §4 |

**What is NOT bound, and each is a classic surprise:**

- **No Durable Objects.** A DO bills for *duration*, so one held open per signed-in
  person — the usual shape for presence, or a live inbox — is a meter that runs
  while nobody is doing anything. This deployment has none.
- **No polling.** There is not one `setInterval` in the browser code. A five-second
  poll is 17,280 requests per person per month; a thousand people on one is
  17 million requests, which alone is twice the included allowance.
- **One cron, hourly.** 720 invocations a month.

---

## 3. The arithmetic

Cloudflare Workers Paid, $5/month, includes 10M requests and 30M CPU-ms.
D1 includes 25B rows read, 50M rows written, 5 GB stored.

Take a thousand active people, twenty sessions each a month, thirty API calls a
session:

| | Used | Included | Share |
|---|---|---|---|
| Requests | 600,000 | 10,000,000 | 6% |
| Rows read (~20/request) | 12,000,000 | 25,000,000,000 | 0.05% |
| Rows written (20% are writes, ~2 rows each) | 240,000 | 50,000,000 | 0.5% |

**Total: $5.** The same shape a hundred times over — a hundred thousand people,
60M requests — is $5 + $15 = **$20 a month**, and rows written are *still*
inside the free allowance.

⚠️ **The first ceiling is requests, not the database.** That is worth knowing
because it inverts the usual instinct: the thing to be careful with here is how
many times the browser asks, not how much work each ask does.

---

## 4. What to actually watch, in order

1. **Rows written — $1.00 per million, a thousand times the price of a read.**
   The systemic one is the audit row every WRITE operation records. Reads write
   nothing (`entryFor` answers `null` for anything that is not a write), which is
   why an ordinary session of reading costs nothing at all. Adding a second
   ledger row per write is the change that would move this number.
2. **Log events — 20M a month included, then $0.60 per million.** Every
   `console.log` on a request path is one. The boot logs a handful per cold
   isolate, which is fine; a line per request would not be.
3. **Storage — 5 GB included, then $0.75/GB-month.** Held down by erasure
   actually working (`@engine/purge`'s derived cascade), not by anything here.
4. **A Durable Object, if one is ever added.** It is the only product in this
   stack that bills for a thing being *open*. Adding one is a cost decision as
   well as an architectural one.

---

## 5. AI is not a hosting cost, it is the business

The one genuinely large number is model usage, and it is not a leak — it is the
product. Every generation goes reserve → run → settle against the workspace's
own wallet at the row's multiplier (five times cost by default), and
`ai-costs` reads the gateway's own bill nightly and reports any workspace sold
under cost.

⚠️ **So the risk on this line is a MISPRICED row, not a busy one.** A rate parsed
wrongly, a reserve that under-counts, or a model priced at zero costs real money
on every call while every meter reads healthy — which is why the price parser
refuses a quote it cannot read rather than storing a plausible number. See D28,
D32 and D34.

---

## 6. What is guarded, and where

Three files, asking two different questions.

| | Asks | Fails when |
|---|---|---|
| `apps/hello/test/request-cost.test.ts` | how many round trips a request costs, and how many WAIT | a chain grows — depth 7 for a list read, 4 for `me.who` |
| `apps/hello/test/boot-cost.test.ts` | what a cold isolate pays before the first byte | the schema is asked per module again |
| `scripts/runaway.test.mjs` | is anything UNBOUNDED | a poll, a retry with no ceiling, a paged walk with no ceiling, a cron finer than a quarter hour, a log per request, a query per row |

⚠️ **The split is the useful part.** Something that costs twice as much is a
performance question and belongs in the budget tests, where a number moves and
somebody has to justify raising it. Something that costs *until it is stopped*
belongs in `runaway`, where the answer is never a bigger number.

⚠️ **And the budgets are ceilings, not targets.** A change that makes a request
cheaper tightens them in the same commit; one that makes it dearer has to raise
a number somebody will read in review.

---

## 7. When to re-question the architecture

Not yet, and here is the test rather than an opinion. Re-open this when any of
the following is true:

- **requests pass 10M a month** — then look at what the browser asks for on a
  screen, before looking at anything else;
- **rows written pass 50M a month** — then look at what each write records;
- **something wants a Durable Object** — then price the open connection, not the
  code;
- **a shard is added** — storage and the boot both scale with it.

Until one of those is true, the honest answer to "should we redesign this to
save money" is that there is no money to save.
