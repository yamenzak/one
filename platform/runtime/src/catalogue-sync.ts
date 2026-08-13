/**
 * FETCHING THE PRICE LISTS.
 *
 * ⚠️ THE PARSING IS THE KERNEL'S AND ONLY THE FETCH IS HERE, which is what lets
 * the parsers be proved against the real documents in a suite with no network,
 * no store and no clock. What is left in this file is the part that can fail for
 * reasons that have nothing to do with a price: a page that has moved, a network
 * that is down, a document that rendered half its tables.
 *
 * ⚠️ AND EVERY ONE OF THOSE MUST CHANGE NOTHING. A syncer whose failure mode is
 * an empty catalogue is worse than no syncer: it turns one bad morning at a
 * provider's CDN into a deployment where every AI action refuses, and the
 * catalogue that was correct yesterday is gone. A provider that answers with
 * nothing usable is a provider whose rows are left exactly as they were.
 */

import type { Catalogue, Instant, JobSpec, ModelSpec, PricedRow, Provider, SqlHandle } from "@one/kernel";
import { merged, parseCloudflare, parseGemini, planSync, SOURCES, type CatalogueChange } from "@one/kernel";
import { readCatalogue, writeModel } from "./config.js";

/** ⚠️ Injected, so the one file that reaches the network is the one that fetches. */
export type Fetch = (url: string) => Promise<{ readonly ok: boolean; text(): Promise<string> }>;

const PARSERS: Readonly<Record<Provider, (doc: string) => readonly PricedRow[]>> = {
  "workers-ai": parseCloudflare,
  gemini: parseGemini,
};

/**
 * ⚠️ A FLOOR PER PROVIDER, BECAUSE "PARSED SOMETHING" IS NOT "PARSED THE PAGE".
 *
 * A document that changed shape rarely yields zero rows — it yields three, from
 * whichever table still happens to match. Applying that would leave a catalogue
 * of three models and silently drop the rest, which reads on every screen as a
 * provider that retired most of its range. The number is deliberately far below
 * what either page carries today and far above what a broken parse produces.
 */
export const FLOOR = 10;

export interface ProviderReport {
  readonly provider: Provider;
  readonly ok: boolean;
  readonly found: number;
  readonly changes: readonly CatalogueChange[];
  /** ⚠️ Why nothing was applied, where nothing was. Never an empty success. */
  readonly why: string | null;
}

export interface SyncReport {
  readonly at: string;
  readonly providers: readonly ProviderReport[];
}

/**
 * Read both price lists and apply what they say.
 *
 * ⚠️ PER PROVIDER, INDEPENDENTLY. One page being down is not a reason to leave
 * the other one's rates stale — and a single all-or-nothing apply would mean the
 * flakier of the two documents decides how often either is ever corrected.
 */
export async function syncCatalogue(
  db: SqlHandle, fetcher: Fetch, at: Instant,
): Promise<SyncReport> {
  const have = await readCatalogue(db);
  const providers: ProviderReport[] = [];

  for (const [provider, url] of Object.entries(SOURCES) as [Provider, string][]) {
    const report = await one(db, have, provider, url, fetcher, at);
    providers.push(report);
  }
  return { at, providers };
}

async function one(
  db: SqlHandle, have: Catalogue, provider: Provider, url: string, fetcher: Fetch, at: Instant,
): Promise<ProviderReport> {
  const empty = { provider, found: 0, changes: [] as readonly CatalogueChange[] };
  let doc: string;
  try {
    const answered = await fetcher(url);
    if (!answered.ok) return { ...empty, ok: false, why: "the page did not answer" };
    doc = await answered.text();
  } catch {
    return { ...empty, ok: false, why: "the page could not be reached" };
  }

  let found: readonly PricedRow[];
  try {
    found = PARSERS[provider](doc);
  } catch {
    /* ⚠️ A parser that THREW is a page that changed shape, which is a thing to go
       and look at rather than a reason to empty a catalogue. */
    return { ...empty, ok: false, why: "the page could not be read" };
  }

  if (found.length < FLOOR) {
    return {
      ...empty, ok: false, found: found.length,
      why: `only ${found.length} model(s) came out of a page that should carry many more`,
    };
  }

  const changes = planSync(have, found);
  for (const model of merged(have, found)) await writeModel(db, model, at);
  return { provider, ok: true, found: found.length, changes, why: null };
}

/* ------------------------------------------------------------- retirement --- */

/**
 * Take out of service anything the provider has already shut down.
 *
 * ⚠️ THE DATE IS THE PROVIDER'S, AND IT IS THE ONE CATALOGUE FACT WITH A
 * DEADLINE. Past it, every call to the model fails — for every workspace pinned
 * to it, on a morning nobody was watching, reported as a provider error. Turning
 * it off is what makes the failure a fallback instead.
 *
 * ⚠️ AND NOTHING IS DELETED. The row carries the rate every past generation was
 * settled against and the replacement a workspace will be moved to; deleting it
 * would make a bill unreadable and lose the answer to "what should I use
 * instead" on the day people ask.
 *
 * ⚠️ NOR IS ANY WORKSPACE MIGRATED. `chooseModel` prefers a retired pick's named
 * replacement at read time, so there is no walk over every region rewriting
 * rows — and therefore no half-completed run that leaves some workspaces behind.
 */
export async function retireExpired(db: SqlHandle, at: Instant): Promise<readonly string[]> {
  const today = at.slice(0, 10);
  const rows = await db.all<{ id: string }>(
    `SELECT id FROM ai_model WHERE retires_at IS NOT NULL AND retires_at <= ? AND enabled = 1`,
    today,
  ).catch(() => []);
  for (const row of rows) {
    await db.run(`UPDATE ai_model SET enabled = 0, at = ? WHERE id = ?`, at, row.id).catch(() => undefined);
  }
  return rows.map((r) => r.id);
}

/**
 * ⚠️ WHAT IS ABOUT TO GO, so a console can say it before it happens rather than
 * after. A retirement an operator learns about from a failing generation is one
 * they had thirty days of warning about and no screen that showed it.
 */
export const retiringWithin = (catalogue: Catalogue, at: Instant, days: number): readonly ModelSpec[] => {
  const by = new Date(`${at.slice(0, 10)}T00:00:00.000Z`);
  by.setUTCDate(by.getUTCDate() + days);
  const limit = by.toISOString().slice(0, 10);
  return catalogue.filter((m) => m.retiresAt && m.retiresAt <= limit && m.enabled);
};

/**
 * The daily read.
 *
 * ⚠️ `platform` SCOPE, because the catalogue is not a workspace's. Swept per
 * tenant it would be the same two documents fetched once per workspace on the
 * deployment — hundreds of requests to somebody's docs site, every morning, to
 * write the same rows.
 *
 * ⚠️ AND IT RETIRES BEFORE IT SYNCS. A shut-down model is dangerous now and the
 * fetch may not answer at all; doing it in the other order would leave a dead
 * model in service for a day whenever a provider's docs site had a bad morning.
 */
export const catalogueJob = (shared: SqlHandle | null, fetcher: Fetch | null): JobSpec => ({
  id: "platform.catalogue",
  summary: "Read both providers' price lists and take retired models out of service.",
  every: "daily",
  scope: "platform",
  batch: 1,
  async handler(ctx) {
    /* ⚠️ THE SHARED STORE ARRIVES AS A PARAMETER, because a job's own handles are
       the REGION's and the catalogue is the deployment's. A deployment that binds
       no shared store has no catalogue to sweep, which is `idle` rather than a
       run that did nothing. */
    if (!shared) return { done: 0, idle: 1, more: false };
    const gone = await retireExpired(shared, ctx.now());
    /* ⚠️ A deployment with no way out to the network still retires. The dates
       are already in the rows, so the dangerous half needs no fetch at all. */
    if (!fetcher) return { done: gone.length, idle: gone.length ? 0 : 1, more: false };
    const report = await syncCatalogue(shared, fetcher, ctx.now());
    /*
      ⚠️ A PROVIDER THAT COULD NOT BE READ IS NOT A FAILED JOB. Nothing was
      applied and nothing was lost — the catalogue that was correct yesterday is
      still there — so reporting a failure here would put a red run against a
      morning where the right thing happened.
    */
    const applied = report.providers.filter((p) => p.ok).length;
    return { done: gone.length + applied, idle: applied ? 0 : 1, more: false };
  },
});
