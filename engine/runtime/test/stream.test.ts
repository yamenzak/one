/**
 * A STREAMED RUN IS STILL A METERED ONE — and this is where that stops being a
 * claim.
 *
 * ⚠️ THE HOLD IS TAKEN BEFORE THE FIRST TOKEN AND THE CHARGE LANDS AFTER THE
 * LAST, so everything between them is a window where the four bounds can quietly
 * come apart. A stream that never settles is a balance that shrank for nothing; a
 * stream that settles twice is a customer charged twice for one paragraph; a
 * cancelled stream that settles nothing is free generation for anybody who closes
 * a tab. None of the three throws, and the words arrive perfectly in all of them.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppId, ModelRow, TenantId } from "@engine/kernel";
import { MILLI } from "@engine/kernel";
import { BILLING_SCHEMA, applySchema, type Db } from "../src/index.js";
import { MODEL_SCHEMA } from "../src/models.js";
import { SPEND_SCHEMA, spendOf } from "../src/spend.js";
import { partsOf, type Part, type Streamed } from "../src/gateway.js";
import { generateStream, type Ask, type Streamer } from "../src/services.js";
import { openAccount, topUp, walletOf } from "../src/wallet.js";

const db = () => env.DIRECTORY as unknown as Db;
const TENANT = "ten_stream" as TenantId;
const NOW = new Date("2026-08-19T10:00:00.000Z");

/** ⚠️ Priced so a token is worth something a milli-charge can be read from. */
const MODEL: ModelRow = {
  id: "gemini-2.5-flash", provider: "google", task: "text", label: "Flash",
  meter: "token", input: 100, output: 400, multiplier: 5,
  enabled: true, isDefault: true, thinks: false, maxOutput: 8_000, retired: false,
} as ModelRow;

const ASK: Ask = {
  tenantId: TENANT, appId: "beacon" as AppId, action: "note.draft", lane: "text",
  system: "Write a note.", prompt: "about a thing", maxOutput: 800,
};

/** ⚠️ Real SSE bytes, because the split-across-chunks case is the whole risk. */
const sse = (chunks: readonly string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(out) {
      if (i >= chunks.length) { out.close(); return; }
      out.enqueue(encoder.encode(chunks[i++]!));
    },
  });
};

const streamerOf = (parts: ReadableStream<Part>): Streamer => ({
  async runStream(): Promise<Streamed> { return { parts, logId: "log_1" }; },
});

const deps = (streamer: Streamer) => ({
  directory: db(),
  models: async () => [MODEL],
  provider: { async run() { return "refused" as const; } },
  streamer,
  environment: "test",
});

const drain = async (body: ReadableStream<Uint8Array>): Promise<string> => {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
};

beforeEach(async () => {
  await applySchema(db(), [BILLING_SCHEMA, MODEL_SCHEMA, SPEND_SCHEMA]);
  await db().exec(`DELETE FROM billing_account;`);
  await db().exec(`DELETE FROM credit_ledger;`);
  await db().exec(`DELETE FROM ai_run;`);
  await openAccount(db(), TENANT, "USD", NOW);
  await topUp(db(), TENANT, 1_000, "test", {}, NOW);
});

/* ------------------------------------------------------------------ parsing --- */

describe("reading server-sent events", () => {
  /*
    ⚠️ A CHUNK IS NOT A LINE. The transport splits wherever it likes, so a naive
    per-chunk parse drops whatever straddles a boundary — usually a fragment of
    text, occasionally the usage event, which is the one that decides the price.
  */
  it("reassembles an event split across two chunks", async () => {
    const parts = partsOf(sse([
      `data: {"choices":[{"delta":{"con`,
      `tent":"Hello"}}]}\n`,
      `data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":4}}\n`,
      "data: [DONE]\n",
    ]));

    const seen: Part[] = [];
    const reader = parts.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      seen.push(value);
    }

    expect(seen[0]).toEqual({ text: "Hello" });
    expect(seen[1]).toEqual({ end: { usage: { input: 10, output: 4 } } });
  });

  /*
    ⚠️ THE END IS EMITTED EXACTLY ONCE, WHETHER THE USAGE ARRIVED OR NOT. A
    stream that finished with no end part leaves the hold outstanding for ever.
  */
  it("ends even when no usage was ever sent", async () => {
    const parts = partsOf(sse([`data: {"choices":[{"delta":{"content":"hi"}}]}\n`]));
    const seen: Part[] = [];
    const reader = parts.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      seen.push(value);
    }
    expect(seen.at(-1)).toEqual({ end: { usage: null } });
  });

  /* ⚠️ Reasoning tokens are billed and are reported two ways — see `usageOf`. */
  it("counts reasoning tokens that arrive beside the completion", async () => {
    const parts = partsOf(sse([
      `data: {"usage":{"prompt_tokens":5,"completion_tokens":10,`
      + `"completion_tokens_details":{"reasoning_tokens":40}}}\n`,
    ]));
    const reader = parts.getReader();
    const { value } = await reader.read();
    expect(value).toEqual({ end: { usage: { input: 5, output: 50 } } });
  });
});

/* ------------------------------------------------------------------- money --- */

describe("what a streamed run costs", () => {
  /* ⚠️ `told` DECIDES WHETHER A USAGE EVENT ARRIVES AT ALL — a default argument
     here would make "no usage" indistinguishable from "the default usage", which
     is exactly the case one of these tests is about. */
  const parts = (told = true) =>
    partsOf(sse([
      `data: {"choices":[{"delta":{"content":"one "}}]}\n`,
      `data: {"choices":[{"delta":{"content":"two"}}]}\n`,
      ...(told
        ? [`data: {"choices":[],"usage":{"prompt_tokens":200,"completion_tokens":200}}\n`]
        : []),
    ]));

  it("hands the words over and charges once the last one has arrived", async () => {
    const before = await walletOf(db(), TENANT);
    const out = await generateStream(deps(streamerOf(parts())), ASK);
    expect(typeof out).not.toBe("string");

    const text = await drain((out as { body: ReadableStream<Uint8Array> }).body);
    expect(text).toContain(`data: {"text":"one "}`);
    expect(text).toContain(`data: {"text":"two"}`);
    /* ⚠️ THE LAST THING ON THE WIRE IS WHAT IT COST. A balance that moved with
       nothing saying by how much is the question the ledger exists to answer. */
    expect(text).toContain(`"done":true`);

    /*
      ⚠️ THE BALANCE DOES NOT MOVE AND THAT IS CORRECT (D28). Five hundred
      milli-credits is half a cent; whole credits come off the balance and the
      remainder is carried, so a short run charges a real amount and moves the
      number a person reads by nothing. Asserting a drop here would be asserting
      the several-hundred-fold overcharge that rule exists to prevent.
    */
    const after = await walletOf(db(), TENANT);
    expect(after.balance).toBe(before.balance);
    const carried = await db()
      .prepare(`SELECT spend_milli FROM billing_account WHERE tenant_id = ?`)
      .bind(TENANT).first<{ spend_milli: number }>();
    expect(carried!.spend_milli).toBe(500);

    /* 200 in at 100 milli/1k + 200 out at 400 milli/1k, times a margin of five
       = 500 milli. Deliberately well UNDER the reserve, so this asserts the
       arithmetic rather than the cap — with a usage report above the reserve
       the settle would answer the same number however wrong the sum was. */
    const [run] = await spendOf(db(), TENANT, { since: "" });
    expect(run!.chargedMilli).toBe(500);
    expect(run!.chargedMilli).toBeLessThan(run!.held * MILLI);
    expect(run!.source).toBe("usage");
    expect(run!.ok).toBe(true);
  });

  /*
    ⚠️ A STREAM WITH NO USAGE SETTLES AT THE RESERVE, NEVER AT A RECOUNT. The
    settle caps the charge at what was held, so a guess can only ever charge
    less than the truth — free money in exactly one direction, on every call.
  */
  it("falls back to the reserve when the provider sent no usage", async () => {
    const out = await generateStream(deps(streamerOf(parts(false))), ASK);
    await drain((out as { body: ReadableStream<Uint8Array> }).body);
    const [run] = await spendOf(db(), TENANT, { since: "" });
    expect(run!.source).toBe("reserve");
    expect(run!.chargedMilli).toBe(run!.held * MILLI);
  });

  /*
    ⚠️ SOMEBODY CLOSED THE TAB. The reserve is charged and the row is left OPEN,
    so the nightly check against the gateway's own bill corrects it downward —
    which is the only answer that is neither a guess nor a giveaway.
  */
  it("settles a cancelled stream at the reserve and leaves it open for the true-up", async () => {
    const out = await generateStream(deps(streamerOf(parts())), ASK);
    const body = (out as { body: ReadableStream<Uint8Array> }).body;
    const reader = body.getReader();
    await reader.read();
    await reader.cancel();

    const [run] = await spendOf(db(), TENANT, { since: "" });
    expect(run!.source).toBe("reserve");
    expect(run!.logId).toBe("log_1");
    const open = await db().prepare(`SELECT trued FROM ai_run WHERE id = ?`)
      .bind(run!.id).first<{ trued: number }>();
    expect(open!.trued).toBe(0);
  });

  /*
    ⚠️ ONE CHARGE PER GENERATION, WHATEVER ORDER THE STREAM ENDS IN. `flush` and
    `cancel` can both run for one stream, and charging twice for one paragraph is
    the failure here a customer notices immediately and never forgives.
  */
  it("charges once even when the stream both finishes and is cancelled", async () => {
    const out = await generateStream(deps(streamerOf(parts())), ASK);
    const body = (out as { body: ReadableStream<Uint8Array> }).body;
    await drain(body);
    await body.cancel().catch(() => undefined);
    expect(await spendOf(db(), TENANT, { since: "" })).toHaveLength(1);
  });

  /*
    ⚠️ A REFUSAL BEFORE THE FIRST TOKEN RELEASES THE HOLD AND STILL RECORDS. One
    is a balance that shrank for nothing; the other is a button that did nothing
    and left no trace anybody in support can find.
  */
  it("gives the credits back and still leaves a row when the provider refuses", async () => {
    const before = await walletOf(db(), TENANT);
    const out = await generateStream(deps({
      async runStream() { return "no_key" as const; },
    }), ASK);

    expect(out).toBe("no_key");
    expect((await walletOf(db(), TENANT)).balance).toBe(before.balance);
    const [run] = await spendOf(db(), TENANT, { since: "" });
    expect(run!.ok).toBe(false);
    expect(run!.chargedMilli).toBe(0);
  });

  /* ⚠️ And an empty wallet is refused before anything is asked of a provider. */
  it("refuses a workspace that cannot pay, without opening a stream", async () => {
    await db().prepare(`UPDATE billing_account SET bought = 0, granted = 0 WHERE tenant_id = ?`)
      .bind(TENANT).run();
    let asked = false;
    const out = await generateStream(deps({
      async runStream() { asked = true; return "refused" as const; },
    }), ASK);
    expect(out).toBe("not_enough_credits");
    expect(asked).toBe(false);
  });
});
