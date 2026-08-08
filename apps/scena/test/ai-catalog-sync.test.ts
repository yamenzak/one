/**
 * THE RATE SYNC — because the button that claimed to do this did not.
 *
 * `POST /api/admin/models/resync` upserted the hardcoded `DEFAULT_MODELS` list
 * and reported "17 updated". No page was fetched. An operator pressed Sync,
 * read a number, and believed Scena's metering had been refreshed from
 * Cloudflare's pricing — while the app went on charging real credits against
 * constants somebody typed once.
 *
 * A test that only asserted "the route returns 200" would have passed happily
 * on the old behaviour, which is precisely why these assert on the DATABASE
 * after the run: a rate that moved, a shut-down model that went off, and — the
 * two that matter most — the things that must NOT happen when the page cannot
 * be read.
 *
 * The pricing pages are injected as Markdown rather than fetched. The parsers
 * are `@4dl/ai`'s and have their own tests; what is under test here is the
 * MATCHING between what a page says and Scena's own row shape, which is the
 * only part this app owns.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { ensureSchema } from "../src/db.js";
import { ensureBilling, getModel, upsertModel } from "../src/billing-store.js";
import { syncScenaModelRates } from "../src/ai-catalog-sync.js";

/**
 * A Workers AI pricing page, in the shape `parseWorkersAiCatalog` reads: the
 * line must START `| @cf/`, so the model id is the FIRST cell, and the neuron
 * rates are the third. Getting this wrong is how the first run of this file
 * failed — the parser matched nothing and every assertion read as a broken
 * sync rather than as a broken fixture, which is worth knowing about a test
 * that exists to catch a sync doing nothing.
 */
const workersPage = (rows: string[]) => ["# Workers AI pricing", "", "| Model | Notes | Price |", "|---|---|---|", ...rows].join("\n");
const wRow = (id: string, input: number, output: number) => `| ${id} | notes | ${input} neurons per M input tokens, ${output} neurons per M output tokens |`;

const fetchBoth = (workers: string | null, google: string | null = null) => async (url: string) =>
  url.includes("cloudflare.com") ? { md: workers, error: workers ? null : "boom" } : { md: google, error: google ? null : "not fetched in this test" };

/** One Scena row, keyed the way Scena keys them: a slug id, the path in `cf_model`. */
async function seedRow(id: string, cfModel: string, input: number, output: number, enabled = 1) {
  await upsertModel(env.DB, {
    id, label: id, task: "text", cf_model: cfModel,
    input_rate: input, output_rate: output, unit_rate: null, unit_kind: null,
    markup: 3, enabled, sort: 0,
  });
}

describe("the AI rate sync", () => {
  beforeEach(async () => {
    await ensureSchema(env.DB);
    await ensureBilling(env.DB);
    await env.DB.prepare("DELETE FROM ai_models").run();
  });

  it("moves a rate the pricing page has changed", async () => {
    await seedRow("llama-x", "@cf/meta/llama-x", 1000, 2000);

    const report = await syncScenaModelRates(env.DB, {
      fetchMd: fetchBoth(workersPage([wRow("@cf/meta/llama-x", 1500, 2500)])),
    });

    const row = await getModel(env.DB, "llama-x");
    expect(row?.input_rate).toBe(1500);
    expect(row?.output_rate).toBe(2500);
    expect(report.providers.find((p) => p.provider === "workers-ai")?.repriced).toBe(1);
  });

  it("leaves the operator's markup and enabled flag alone", async () => {
    // A sync that reset the markup would silently change what every workspace
    // is charged — the opposite of what pressing the button is for.
    await upsertModel(env.DB, {
      id: "llama-x", label: "Renamed by the operator", task: "text", cf_model: "@cf/meta/llama-x",
      input_rate: 1000, output_rate: 2000, unit_rate: null, unit_kind: null, markup: 7, enabled: 1, sort: 3,
    });

    await syncScenaModelRates(env.DB, { fetchMd: fetchBoth(workersPage([wRow("@cf/meta/llama-x", 1500, 2500)])) });

    const row = await getModel(env.DB, "llama-x");
    expect(row?.markup).toBe(7);
    expect(row?.label).toBe("Renamed by the operator");
    expect(row?.enabled).toBe(1);
  });

  it("does not report a row as repriced when nothing moved", async () => {
    // Float round-tripping through REAL makes `!==` re-write every row on every
    // run and report all of them changed, which would make the number useless.
    await seedRow("llama-x", "@cf/meta/llama-x", 1500, 2500);

    const report = await syncScenaModelRates(env.DB, {
      fetchMd: fetchBoth(workersPage([wRow("@cf/meta/llama-x", 1500, 2500)])),
    });

    expect(report.providers.find((p) => p.provider === "workers-ai")?.repriced).toBe(0);
    expect(report.providers.find((p) => p.provider === "workers-ai")?.unchanged).toBe(1);
  });

  it("switches off a model the page no longer lists", async () => {
    // Either the provider dropped it or `cf_model` has a typo. Both mean a call
    // fails, so leaving it enabled sells something that cannot run.
    await seedRow("gone", "@cf/meta/gone", 1000, 2000);

    const report = await syncScenaModelRates(env.DB, {
      fetchMd: fetchBoth(workersPage([wRow("@cf/meta/still-here", 10, 20)])),
    });

    expect((await getModel(env.DB, "gone"))?.enabled).toBe(0);
    expect(report.providers.find((p) => p.provider === "workers-ai")?.delisted).toContain("gone");
  });

  /*
    THE TWO FAIL-OPEN CASES. Treating "I could not read the page" as "the page
    lists nothing" would disable Scena's entire catalog the first time
    Cloudflare had an outage — a self-inflicted outage on top of theirs.
  */
  it("leaves every rate alone when the page will not fetch", async () => {
    await seedRow("llama-x", "@cf/meta/llama-x", 1000, 2000);

    const report = await syncScenaModelRates(env.DB, { fetchMd: fetchBoth(null) });

    const row = await getModel(env.DB, "llama-x");
    expect(row?.input_rate).toBe(1000);
    expect(row?.enabled).toBe(1);
    const w = report.providers.find((p) => p.provider === "workers-ai");
    expect(w?.ok).toBe(false);
    expect(w?.error).toMatch(/couldn't fetch/);
    expect(report.ok).toBe(false);
  });

  it("leaves every rate alone when the page parses to nothing", async () => {
    // The doc format changed. Writing nothing is right; disabling everything
    // because a regex stopped matching is not.
    await seedRow("llama-x", "@cf/meta/llama-x", 1000, 2000);

    const report = await syncScenaModelRates(env.DB, { fetchMd: fetchBoth("# Workers AI pricing\n\nnothing here any more\n") });

    expect((await getModel(env.DB, "llama-x"))?.input_rate).toBe(1000);
    expect((await getModel(env.DB, "llama-x"))?.enabled).toBe(1);
    expect(report.providers.find((p) => p.provider === "workers-ai")?.error).toMatch(/0 models parsed/);
  });

  it("does not touch a lane it holds no models for", async () => {
    // Scena's catalog is mostly Workers AI. A workspace with no Google rows must
    // not fail the whole run because Google's page was unreachable.
    await seedRow("llama-x", "@cf/meta/llama-x", 1500, 2500);

    const report = await syncScenaModelRates(env.DB, { fetchMd: fetchBoth(workersPage([wRow("@cf/meta/llama-x", 1500, 2500)])) });

    expect(report.providers.find((p) => p.provider === "google")?.ok).toBe(true);
    expect(report.ok).toBe(true);
  });
});
