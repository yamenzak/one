# Moving a database to where it should have been made

kind: guide

**Read this before running the relocation workflow.** It moves live data on a
deployment with real workspaces on it, and the order of the steps is the whole
safety of it.

---

## 1. Why this exists

A D1 database's place is fixed when it is created. Cloudflare offers no edit, no
migration and no support ticket — so "put the directory in Europe" is a new
database, a copy, and a rebind, for ever, not until somebody builds the setting.

The seed databases were made by a bare `wrangler d1 create` in a CI runner, so
they are wherever that runner was. Measured on this deployment: every operation
is four to six **sequential** round trips at roughly 260 ms each, against a
worker spending nine milliseconds of CPU. Nothing computes. It is distance.

Provisioning no longer does that — `bind-ids.mjs --place` answers with the flags
from the deployment's own declaration and both paths that create a database read
it (DECISIONS.md D64). This document is about the databases that already exist.

---

## 2. Shards do not use the relocation workflow

**A workspace moves shard to shard through `op.tenant.move`**, which already
exists and is careful: it holds that one workspace read-only while it copies,
derives the table list from the erasure ledger rather than a list somebody wrote,
and deletes nothing from the source until a later drain. Nobody else is
affected, and it is one workspace at a time.

So for a shard:

1. Add a correctly-placed shard to `SHARDS` in `engine/one/src/index.ts`.
2. Push. Provisioning creates it — with `--jurisdiction eu` where the residency
   says so, because the workflow asks rather than deciding.
3. Move workspaces onto it from the operator console, one at a time.
4. Leave the old shard in place until the drain has run and you are satisfied.

There is no downtime in any of that, and no step below applies to it.

---

## 3. The directory is the one that needs a window

The directory is not a shard. There is one, everything depends on it, and
nothing can move a workspace off it — so the copy has to happen while nothing is
writing to it.

**A copy taken from a live database loses every row written after each table was
read.** Silently. With no error. Discovered weeks later as records that went
missing. The maintenance switch is what closes that window, and the workflow
refuses to proceed without it by *reading the switch* rather than trusting an
input.

### Rehearse first — no maintenance, nothing bound

Actions → **Relocate the directory** → `phase: rehearse`, and a target name that
does not exist yet.

It exports the live directory, creates the new database in the declared place,
imports, and compares every table's row count. It binds nothing.

What the rehearsal is for is **the number at the end**: how long the export and
import actually took on your data. That is the length of the window in step 2,
and it is the only honest way to know it before the deployment is down. It also
proves the export, the import and the comparison work at all — which are the
three things that could fail while everybody is waiting.

Measured on this deployment, first rehearsal: **6.7 seconds** end to end —
101 KB exported, 365 statements imported, 36 tables. The window is short enough
that the slow part of step 2 is a person clicking Maintenance twice.

The copy it leaves behind is a real, verified database in the right place. Delete
it, or keep it and reuse the name.

### Then relocate — maintenance on, and it is checked

1. **Operator console → Maintenance → `readonly`** (or `full`). Reads are still
   served; writes are refused. Nobody is signed out.
2. Actions → **Relocate the directory** → `phase: relocate`, same target name.
   It reads the maintenance switch out of the live directory and stops if the
   deployment is still accepting writes.
3. It exports, creates, imports, and **compares every table row for row**. A
   difference stops it before anything is bound. `d1 execute --file` reports the
   statements it ran, not the rows that landed — a truncated file, a failed
   `CREATE` and the silent `INSERT`s after it all exit 0, which is why the
   comparison exists and why `copied.test.mjs` proves it still refuses.
4. It writes the new id into the binding, deploys, and probes `/health`.
5. It commits the id **only after the deploy answered**. Committing first would
   make the next ordinary push re-point the deployment at a database nobody has
   verified.
6. **You** turn maintenance off.

### If it goes wrong

**The old database is untouched and is the way back.** Revert the commit that
changed the binding, or run `wrangler rollback` in `engine/one`, and the
deployment is on the original database with every row it ever had. That is the
whole reason nothing is deleted.

Delete the old database only when you are satisfied — days later, not minutes.

---

## 4. What to look for afterwards

`wallTimeMs` in the logs, against `cpuTimeMs`. The CPU figure will not move; the
wall figure should fall by roughly the round-trip count per request, which
`engine/one/test/request-cost.test.ts` reports per operation. If it does not
move at all, the new database is not where the declaration says it is — check
what `wrangler d1 info` reports before assuming anything about the code.
