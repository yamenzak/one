/**
 * A SYNCER'S FAILURES, WHICH ARE THE ONLY PART WORTH TESTING HERE.
 *
 * ⚠️ THE PARSING IS PROVED IN THE KERNEL, against the real documents. What is
 * left is everything that can go wrong for reasons that have nothing to do with
 * a price — a page that has moved, a network that is down, a document that
 * rendered half its tables — and every one of them must change NOTHING.
 *
 * ⚠️ BECAUSE A SYNCER WHOSE FAILURE MODE IS AN EMPTY CATALOGUE IS WORSE THAN NO
 * SYNCER. It turns one bad morning at a provider's CDN into a deployment where
 * every AI action refuses, having thrown away the catalogue that was correct
 * yesterday.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { Instant, SqlHandle } from "@one/kernel";
import { readCatalogue, writeModel, CONFIG_SCHEMA, MODEL_SCHEMA } from "../src/config.js";
import { catalogueJob, FLOOR, retireExpired, retiringWithin, syncCatalogue } from "../src/catalogue-sync.js";

const AT = "2026-08-14T09:00:00.000Z" as Instant;

/**
 * ⚠️ A STORE MADE OF ROWS, not of statements. The sync writes through
 * `writeModel` and reads through `readCatalogue`, so a fake that recorded SQL
 * would prove the strings and nothing about what the catalogue ends up holding —
 * which is the only question here.
 */
function store() {
  const rows = new Map<string, Record<string, unknown>>();
  const db = {
    async all<T>(sql: string, ...p: readonly unknown[]) {
      if (!/FROM ai_model/.test(sql)) return [] as T[];
      const all = [...rows.values()];
      if (/retires_at IS NOT NULL/.test(sql)) {
        const today = p[0] as string;
        return all.filter((r) => r.retires_at && (r.retires_at as string) <= today && r.enabled === 1) as T[];
      }
      return all as T[];
    },
    async first<T>() { return null as T | null; },
    async run(sql: string, ...p: readonly unknown[]) {
      if (/^UPDATE ai_model SET enabled/.test(sql.trim())) {
        const row = rows.get(p[1] as string);
        if (row) row.enabled = 0;
        return;
      }
      if (!/INSERT INTO ai_model/.test(sql)) return;
      const [id, provider, lanes, ri, ro, per, att, markup, thinking, enabled, retires, replaced] =
        p as readonly [string, string, string, number, number, number | null, number | null, number, number | null, number, string | null, string | null];
      rows.set(id, {
        id, provider, lanes, rate_input: ri, rate_output: ro, per_output: per, attachment_units: att,
        markup, thinking, enabled: enabled ? 1 : 0, retires_at: retires ?? null, replaced_by: replaced ?? null,
      });
    },
    async batch() { /* the schema, which this fake does not need */ },
  } as unknown as SqlHandle;
  return { db, rows };
}

const page = (name: string) => readFileSync(`../kernel/test/fixture.${name}.txt`, "utf8");
const answering = (body: string) => async () => ({ ok: true, text: async () => body });

describe("reading the price lists", () => {
  it("applies what both pages say", async () => {
    const w = store();
    const out = await syncCatalogue(w.db, async (url) =>
      ({ ok: true, text: async () => page(url.includes("cloudflare") ? "cloudflare-pricing" : "gemini-pricing") }), AT);

    expect(out.providers.every((p) => p.ok)).toBe(true);
    const have = await readCatalogue(w.db);
    expect(have.length).toBeGreaterThan(50);
    expect(have.some((m) => m.provider === "gemini")).toBe(true);
    expect(have.some((m) => m.provider === "workers-ai")).toBe(true);
  });

  /*
    ⚠️ EVERY ROW ARRIVES SWITCHED OFF. Offering a model the moment a document
    grew one would be the platform choosing a sub-processor on a workspace's
    behalf overnight — which is exactly the decision the whole design says
    belongs to somebody who can be asked.
  */
  it("offers nothing it just read", async () => {
    const w = store();
    await syncCatalogue(w.db, answering(page("gemini-pricing")), AT);
    expect((await readCatalogue(w.db)).every((m) => !m.enabled)).toBe(true);
  });

  /*
    ⚠️ ONE PAGE BEING DOWN IS NOT A REASON TO LEAVE THE OTHER STALE. An
    all-or-nothing apply means the flakier of the two documents decides how often
    either is ever corrected.
  */
  it("applies one provider when the other cannot be reached", async () => {
    const w = store();
    const out = await syncCatalogue(w.db, async (url) => {
      if (url.includes("cloudflare")) throw new Error("no route to host");
      return { ok: true, text: async () => page("gemini-pricing") };
    }, AT);

    expect(out.providers.find((p) => p.provider === "workers-ai")).toMatchObject({ ok: false, found: 0 });
    expect(out.providers.find((p) => p.provider === "gemini")!.ok).toBe(true);
    expect((await readCatalogue(w.db)).length).toBeGreaterThan(20);
  });

  /* ⚠️ And a failure says why. A report that only counted successes is how a
     rate goes six months out of date behind a green screen. */
  it("says why nothing was applied rather than reporting an empty success", async () => {
    const w = store();
    const out = await syncCatalogue(w.db, async () => ({ ok: false, text: async () => "" }), AT);
    for (const p of out.providers) {
      expect(p.ok).toBe(false);
      expect(p.why).toBeTruthy();
    }
  });

  /*
    ⚠️ "PARSED SOMETHING" IS NOT "PARSED THE PAGE", and this is the failure a
    floor exists for. A document that changed shape rarely yields zero rows — it
    yields three, from whichever table still matches — and applying that would
    drop the rest of the catalogue, reading on every screen as a provider that
    retired most of its range.
  */
  it("changes nothing when a page yields far too little", async () => {
    const w = store();
    await writeModel(w.db, {
      id: "keep-me", provider: "gemini", lanes: ["text"],
      rate: { input: 1, output: 4 }, markup: 1.4, enabled: true,
    }, AT);

    const thin = `## LLM model pricing\n| @cf/only/one | $0.1 per M input tokens $0.2 per M output tokens | x |\n`;
    const out = await syncCatalogue(w.db, answering(thin), AT);

    expect(out.providers.every((p) => !p.ok)).toBe(true);
    expect(out.providers[0]!.why).toContain("came out of a page");
    const have = await readCatalogue(w.db);
    expect(have).toHaveLength(1);
    expect(have[0]!.id).toBe("keep-me");
  });

  it("states its own floor rather than leaving it to a magic number", () => {
    expect(FLOOR).toBeGreaterThan(1);
  });
});

describe("a model the provider has shut down", () => {
  const withRetirement = async () => {
    const w = store();
    await writeModel(w.db, {
      id: "gemini-2.0-flash", provider: "gemini", lanes: ["text"], rate: { input: 1, output: 4 },
      markup: 1.4, enabled: true, retiresAt: "2026-06-01", replacedBy: "gemini-2.5-flash",
    }, AT);
    await writeModel(w.db, {
      id: "gemini-2.5-flash", provider: "gemini", lanes: ["text"], rate: { input: 1, output: 4 },
      markup: 1.4, enabled: true,
    }, AT);
    return w;
  };

  /*
    ⚠️ PAST THE DATE, EVERY CALL TO IT FAILS — for every workspace pinned to it,
    on a morning nobody was watching, reported as a provider error. Turning it
    off is what makes that a fallback instead.
  */
  it("takes it out of service on the date the provider gave", async () => {
    const w = await withRetirement();
    expect(await retireExpired(w.db, AT)).toEqual(["gemini-2.0-flash"]);
    const have = await readCatalogue(w.db);
    expect(have.find((m) => m.id === "gemini-2.0-flash")!.enabled).toBe(false);
  });

  /* ⚠️ Before the date, nothing happens. A model retiring in August is a model
     that works in July. */
  it("leaves one whose date has not come", async () => {
    const w = await withRetirement();
    expect(await retireExpired(w.db, "2026-05-31T00:00:00.000Z" as Instant)).toEqual([]);
  });

  /*
    ⚠️ AND NOTHING IS DELETED. The row carries the rate every past generation was
    settled against and the replacement a workspace will be moved to — deleting
    it makes a bill unreadable to answer a question a flag answers, and loses the
    answer to "what should I use instead" on the day people ask.
  */
  it("keeps the row, its rate and its replacement", async () => {
    const w = await withRetirement();
    await retireExpired(w.db, AT);
    const gone = (await readCatalogue(w.db)).find((m) => m.id === "gemini-2.0-flash")!;
    expect(gone.rate.input).toBe(1);
    expect(gone.replacedBy).toBe("gemini-2.5-flash");
  });

  /*
    ⚠️ AND WHAT IS ABOUT TO GO IS ANSWERABLE BEFORE IT DOES. A retirement an
    operator learns about from a failing generation is one they had a month of
    warning about, on a screen that never showed it.
  */
  it("says what is retiring soon, before it goes", async () => {
    const w = await withRetirement();
    const have = await readCatalogue(w.db);
    expect(retiringWithin(have, "2026-05-20T00:00:00.000Z" as Instant, 30).map((m) => m.id))
      .toEqual(["gemini-2.0-flash"]);
    expect(retiringWithin(have, "2026-01-01T00:00:00.000Z" as Instant, 30)).toEqual([]);
  });
});

describe("the daily read", () => {
  const ctx = { now: () => AT } as never;

  /*
    ⚠️ RETIRING NEEDS NO NETWORK, and that ordering is the point. The dates are
    already in the rows, so a deployment that cannot reach a docs site still
    takes a shut-down model out of service — rather than leaving a dead model
    running for a day because somebody else's CDN had a bad morning.
  */
  it("retires even where the pages cannot be reached", async () => {
    const w = store();
    await writeModel(w.db, {
      id: "old", provider: "gemini", lanes: ["text"], rate: { input: 1, output: 4 },
      markup: 1.4, enabled: true, retiresAt: "2026-06-01",
    }, AT);

    const out = await catalogueJob(w.db, null).handler(ctx);
    expect(out.done).toBe(1);
    expect((await readCatalogue(w.db))[0]!.enabled).toBe(false);
  });

  /* ⚠️ Nothing bound is `idle`, not a run that did nothing. */
  it("is idle on a deployment with no shared store", async () => {
    expect(await catalogueJob(null, null).handler(ctx)).toMatchObject({ idle: 1 });
  });

  /* ⚠️ It is the deployment's catalogue, so it sweeps once — not once per
     workspace, which would be the same two documents fetched hundreds of times. */
  it("runs for the deployment rather than for every workspace", () => {
    expect(catalogueJob(null, null).scope).toBe("platform");
  });

  it("declares the schema it writes through", () => {
    expect(MODEL_SCHEMA.ddl.join(" ")).toContain("retires_at");
    expect(CONFIG_SCHEMA.id).toBe("config");
  });
});
