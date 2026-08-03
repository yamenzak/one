/**
 * A PRICING PAGE IS A BILLING DOCUMENT, NOT AN AVAILABILITY ONE.
 *
 * The sync's only signal for "stop offering this model" used to be "it vanished
 * from the page". Google does not work that way: a shut-down model keeps its
 * full rate tables under a deprecation banner, indefinitely. On the day this was
 * found, `gemini-2.0-flash` and `gemini-2.0-flash-lite` had been shut down for
 * two months and were still priced — so the sync parsed them, enabled them
 * (both are in runnable lanes), and, because both are the CHEAPEST rows in
 * theirs and the sync elects the cheapest enabled model per lane, would have
 * crowned two dead models the text and text-small defaults.
 *
 * The snippets below are the real page's shapes, both tenses of the banner.
 */

import { describe, expect, it } from "vitest";
import { parseGeminiCatalog } from "../src/pricing.js";
import { disableRetiredModels } from "../src/catalog-sync.js";

const AUG_2026 = Date.parse("2026-08-03T00:00:00Z");

const MD = `
## Gemini 3.5 Flash

*\`gemini-3.5-flash\`*

|   | Free Tier | Paid Tier, per 1M tokens in USD |
| Input price | Free of charge | $1.50 |
| Output price | Free of charge | $9.00 |

## Gemini 2.0 Flash

*\`gemini-2.0-flash\`*

> [!WARNING]
> **Warning:** Gemini 2.0 Flash is [deprecated](https://ai.google.dev/gemini-api/docs/deprecations) and has been shut down June 1, 2026. Migrate to [a newer model](https://ai.google.dev/gemini-api/docs/models) to avoid service disruption.

|   | Free Tier | Paid Tier, per 1M tokens in USD |
| Input price | Free of charge | $0.10 (text / image / video) $0.70 (audio) |
| Output price | Free of charge | $0.40 |

## Gemini 2.9 Pro

*\`gemini-2.9-pro\`*

> [!WARNING]
> **Warning:** Gemini 2.9 Pro is [deprecated](https://ai.google.dev/gemini-api/docs/deprecations) and will be shut down on December 30, 2026; migrate to a newer model to avoid service disruption.

|   | Free Tier | Paid Tier, per 1M tokens in USD |
| Input price | Free of charge | $2.00 |
| Output price | Free of charge | $12.00 |
`;

describe("parseGeminiCatalog and the deprecation banner", () => {
  it("refuses a model the provider has already shut down", () => {
    const { models, retired } = parseGeminiCatalog(MD, AUG_2026);
    expect(models.map((m) => m.id)).not.toContain("gemini-2.0-flash");
    expect(retired.map((r) => r.id)).toEqual(["gemini-2.0-flash"]);
    expect(retired[0]!.reason).toContain("2026-06-01");
  });

  /** Still priced, still answering, and the operator gets notice. */
  it("keeps a model whose shutdown is still ahead, and carries the date", () => {
    const { models } = parseGeminiCatalog(MD, AUG_2026);
    const m = models.find((x) => x.id === "gemini-2.9-pro");
    expect(m).toBeDefined();
    expect(m!.retiresAt).toBe("2026-12-30");
  });

  it("leaves a model with no banner alone", () => {
    const m = parseGeminiCatalog(MD, AUG_2026).models.find((x) => x.id === "gemini-3.5-flash");
    expect(m?.retiresAt).toBeNull();
  });

  /**
   * The same page, read before and after the announced date. Nothing about the
   * MARKUP changes — only the clock — which is the property that makes storing
   * the date worth anything.
   */
  it("treats the same page differently on either side of the date", () => {
    const before = parseGeminiCatalog(MD, Date.parse("2026-12-01T00:00:00Z"));
    const after = parseGeminiCatalog(MD, Date.parse("2027-01-01T00:00:00Z"));
    expect(before.models.map((m) => m.id)).toContain("gemini-2.9-pro");
    expect(after.models.map((m) => m.id)).not.toContain("gemini-2.9-pro");
    expect(after.retired.map((r) => r.id)).toContain("gemini-2.9-pro");
  });

  /** A model retiring TODAY still works today — the provider's cutover happens
   *  at an hour we do not know, and switching it off early is the worse error. */
  it("keeps a model on the day it retires", () => {
    const { models } = parseGeminiCatalog(MD, Date.parse("2026-12-30T12:00:00Z"));
    expect(models.map((m) => m.id)).toContain("gemini-2.9-pro");
  });

  /**
   * A banner we cannot parse a date out of must not empty the catalog. A
   * doc-format change silently disabling every model is the failure this file's
   * other guards exist to prevent, and this one must not reintroduce it.
   */
  it("leaves a model alone when the banner carries no readable date", () => {
    const md = MD.replace("has been shut down June 1, 2026", "has been shut down at some point");
    const { models, retired } = parseGeminiCatalog(md, AUG_2026);
    expect(models.map((m) => m.id)).toContain("gemini-2.0-flash");
    expect(retired).toHaveLength(0);
  });
});

/** A tiny D1 over one table, understanding the two statements this path issues. */
function fakeDb(rows: { id: string; retires_at: string | null; enabled: number; is_default: number }[]) {
  return {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        all: async () => ({
          results: /SELECT id FROM ai_models/.test(sql)
            ? rows.filter((r) => r.retires_at !== null && r.retires_at < String(args[0]) && (r.enabled === 1 || r.is_default === 1)).map((r) => ({ id: r.id }))
            : [],
        }),
        run: async () => {
          if (/UPDATE ai_models SET enabled = 0/.test(sql)) {
            for (const r of rows) if (args.includes(r.id)) { r.enabled = 0; r.is_default = 0; }
          }
          return { success: true };
        },
      }),
    }),
  } as unknown as D1Database;
}

describe("disableRetiredModels", () => {
  /**
   * The date is learned when the page is read and comes true months later, so
   * without this the model stays enabled — and possibly a lane default — until
   * somebody happens to press Sync.
   */
  it("switches off a model whose date has passed, and clears its default", async () => {
    const rows = [
      { id: "dead", retires_at: "2026-06-01", enabled: 1, is_default: 1 },
      { id: "alive", retires_at: "2026-12-30", enabled: 1, is_default: 0 },
      { id: "undated", retires_at: null, enabled: 1, is_default: 1 },
    ];
    const gone = await disableRetiredModels(fakeDb(rows), AUG_2026);
    expect(gone).toEqual(["dead"]);
    expect(rows[0]).toMatchObject({ enabled: 0, is_default: 0 });
    expect(rows[1]).toMatchObject({ enabled: 1 });
    expect(rows[2]).toMatchObject({ enabled: 1, is_default: 1 });
  });

  it("does nothing when there is nothing to retire", async () => {
    expect(await disableRetiredModels(fakeDb([{ id: "a", retires_at: null, enabled: 1, is_default: 0 }]), AUG_2026)).toEqual([]);
  });
});
