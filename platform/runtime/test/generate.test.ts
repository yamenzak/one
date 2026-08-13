/**
 * METERED GENERATION — the order, the two ceilings, and the refund.
 *
 * ⚠️ THERE IS NO PATH TO A MODEL THAT DOES NOT HOLD CREDITS FIRST, and that is
 * what these assertions are about. A shipping product had three ways to generate
 * without metering — a console switch, a missing binding, and a provider failure
 * falling back — and all three typechecked, passed every test, and fabricated
 * output in production while charging for it.
 */

import { describe, expect, it } from "vitest";
import { CREDITS, dayOf, generate, judge, spending, spentToday, usageOf } from "../src/generate.js";
import { balanceFor, grantCredits } from "../src/account-billing.js";
import type { AiSpec, Catalogue, InferenceHandle, Instant, SqlHandle } from "@one/kernel";

const AT = "2026-01-10T09:00:00.000Z" as Instant;
const LATER = "2026-01-10T18:00:00.000Z" as Instant;
const TOMORROW = "2026-01-11T09:00:00.000Z" as Instant;

const ai: AiSpec = {
  actions: {
    draft: { summary: "Draft", lane: "text", system: "You draft things.", maxOutput: 100, dailyPerPerson: 2 },
  },
};

/*
  ⚠️ THE CATALOGUE IS THE DEPLOYMENT'S NOW, so every call here hands one over
  rather than reading it off the manifest. `markup: 1` is at cost, which keeps
  the arithmetic in these tests readable — the markup has its own tests in the
  kernel, where the multiplication happens.
*/
const CATALOGUE: Catalogue = [
  { id: "gemini-2.5-flash", provider: "google", lanes: ["text"], rate: { input: 1, output: 2 }, markup: 1, enabled: true },
];

/* -------------------------------------------------------------- fixtures --- */

/**
 * Enough of a store to answer the credit ledger's statements and the audit row.
 *
 * ⚠️ THE CONDITIONAL DEBIT IS MODELLED AS ONE STATEMENT, which is what it is in
 * the store. A fake that read a balance and then pushed would make the racing
 * test pass against an implementation that does not — and overspending is the
 * one failure here that costs real money.
 */
function world() {
  const credits: { id: string; kind: string; amount: number; expires: string | null; ref: string | null }[] = [];
  const gens: Record<string, unknown>[] = [];
  const live = (now: string) =>
    credits.filter((e) => e.kind === "purchased" || (e.expires !== null && e.expires > now)).reduce((n, e) => n + e.amount, 0);
  const db = {
    async first<T>(sql: string, ...p: readonly unknown[]) {
      if (sql.includes("SUM(amount) AS total FROM account_credit")) {
        return { total: credits.filter((e) => e.kind === "purchased").reduce((n, e) => n + e.amount, 0) } as T;
      }
      if (sql.includes("COUNT(*) AS n FROM account_credit")) return { n: credits.length } as T;
      if (sql.includes("SELECT id FROM account_credit")) return (credits.find((e) => e.id === p[0]) ?? null) as T | null;
      if (sql.includes("FROM generation") && sql.includes("COUNT(*)")) {
        const [, actor, feature, since] = p as [string, string, string, string];
        return { n: gens.filter((g) => g.actor_id === actor && g.feature === feature && String(g.at) >= since).length } as T;
      }
      if (sql.includes("FROM generation")) return (gens.find((g) => g.id === p[1]) ?? null) as T | null;
      return null as T | null;
    },
    async all<T>(sql: string, ...p: readonly unknown[]) {
      if (sql.includes("GROUP BY expires_at")) {
        const byDate = new Map<string | null, number>();
        for (const e of credits.filter((c) => c.kind === "granted")) byDate.set(e.expires, (byDate.get(e.expires) ?? 0) + e.amount);
        return [...byDate].map(([expires_at, left]) => ({ expires_at, left })) as T[];
      }
      if (sql.includes("FROM generation")) return [...gens].reverse().slice(0, p[1] as number) as T[];
      return [] as T[];
    },
    async run(sql: string, ...p: readonly unknown[]) {
      if (sql.includes("INSERT OR IGNORE INTO account_credit")) {
        const ref = (p[6] ?? null) as string | null;
        if (ref === null || !credits.some((e) => e.ref === ref)) {
          credits.push({ id: p[0] as string, kind: p[2] as string, amount: p[3] as number, expires: (p[4] ?? null) as string | null, ref });
        }
      } else if (sql.includes("INSERT INTO account_credit") && sql.includes("WHERE (SELECT")) {
        const now = p[10] as string;
        if (live(now) >= (p[11] as number)) {
          credits.push({ id: p[0] as string, kind: p[2] as string, amount: p[3] as number, expires: (p[4] ?? null) as string | null, ref: null });
        }
      } else if (sql.includes("INSERT INTO account_credit")) {
        credits.push({ id: p[0] as string, kind: p[2] as string, amount: p[3] as number, expires: (p[4] ?? null) as string | null, ref: null });
      }
      if (sql.startsWith("INSERT INTO generation")) {
        gens.push({ id: p[0], tenant_id: p[1], feature: p[2], model: p[3], actor_id: p[4], held: p[5], charged: p[6], verdict: null, at: p[7] });
      }
      if (sql.startsWith("UPDATE generation")) {
        const row = gens.find((g) => g.id === p[3]);
        if (row) { row.verdict = p[0]; row.note = p[1]; }
      }
    },
  } as unknown as SqlHandle;
  return { db, credits, gens };
}

const runner = (answer: unknown, permitted: readonly string[] = []): InferenceHandle => ({
  permitted,
  async run() {
    if (answer instanceof Error) throw answer;
    return answer;
  },
});

/** Counts what the provider was actually asked to do — which is what a bill counts. */
const counting = (answer: unknown, delayTicks = 3) => {
  const calls: string[] = [];
  return {
    calls,
    handle: {
      permitted: [] as readonly string[],
      async run(model: string) {
        calls.push(model);
        for (let i = 0; i < delayTicks; i++) await Promise.resolve();
        return answer;
      },
    } as InferenceHandle,
  };
};

const fund = async (w: ReturnType<typeof world>, amount: number) =>
  grantCredits(w.db, "acc", { kind: "purchased", amount, reason: "bought" }, AT);

const ask = (w: ReturnType<typeof world>, inference: InferenceHandle | null, over: Partial<Parameters<typeof generate>[0]> = {}) =>
  generate({ db: w.db, global: w.db, accountId: "acc", productId: "hello", ai, catalogue: CATALOGUE, inference, tenantId: "t", actorId: "u", feature: "draft", prompt: "four weeks", at: AT, ...over });

/* ---------------------------------------------------------------- happy --- */

describe("one metered generation", () => {
  it("holds, runs, settles at what was reported, and hands back the output", async () => {
    const w = world();
    await fund(w, 10_000);
    const out = await ask(w, runner({ output: "a plan", usage: { input: 10, output: 20 } }));
    expect(out.ok).toBe(true);
    /* 10 × 1 + 20 × 2 = 50 */
    expect((out as { charged: number }).charged).toBe(50);
    expect((await balanceFor(w.db, "acc", AT)).total).toBe(10_000 - 50);
    expect((out as { output: unknown }).output).toBe("a plan");
  });

  /*
    ⚠️ A MISSING USAGE REPORT SETTLES AT THE RESERVE, NEVER AT A RECOUNT. A
    recount can only ever come in low — the cap catches the other direction — so
    it would turn every unreported call into a discount.
  */
  it("charges the whole reserve when the provider says nothing about usage", async () => {
    const w = world();
    await fund(w, 10_000);
    const out = await ask(w, runner({ output: "a plan" }));
    const held = w.gens[0]!.held as number;
    expect((out as { charged: number }).charged).toBe(held);
    expect((await balanceFor(w.db, "acc", AT)).total).toBe(10_000 - held);
  });

  /*
    ⚠️ THE CAP IS THE WHOLE ASYMMETRY. Charging more than was held would let a
    runaway call empty a balance nobody authorised — so a report above the
    reserve settles at the reserve, and the difference is the platform's.
  */
  it("never charges more than it held, whatever the provider reports", async () => {
    const w = world();
    await fund(w, 10_000);
    const out = await ask(w, runner({ output: "x", usage: { input: 1_000_000, output: 1_000_000 } }));
    expect((out as { charged: number }).charged).toBe(w.gens[0]!.held);
  });
});

/* -------------------------------------------------------------- ceilings --- */

describe("what stops a call before it costs anything", () => {
  /*
    ⚠️ NO RUNNER IS A REFUSAL AND NEVER A FALLBACK. A platform-side mock is
    reachable by getting a binding wrong, which is how a product ends up
    inventing clinical values and billing for them.
  */
  it("refuses when nothing is bound to run a model, and takes no credits", async () => {
    const w = world();
    await fund(w, 10_000);
    const out = await ask(w, null);
    expect(out).toMatchObject({ ok: false, why: "unconfigured" });
    expect((await balanceFor(w.db, "acc", AT)).total).toBe(10_000);
  });

  it("refuses a feature the manifest does not declare", async () => {
    const w = world();
    await fund(w, 10_000);
    expect(await ask(w, runner({ output: "x" }), { feature: "nonesuch" })).toMatchObject({ ok: false, why: "unknown_feature" });
  });

  /*
    ⚠️ RESIDENCY IS NOT ONLY STORAGE. A region carries a sub-processor
    allow-list, and a model outside it is refused rather than quietly run
    somewhere a workspace was promised its data would not go.
  */
  it("refuses a model this region does not permit", async () => {
    const w = world();
    await fund(w, 10_000);
    const out = await ask(w, runner({ output: "x" }, ["some-eu-model"]));
    expect(out).toMatchObject({ ok: false, why: "unconfigured" });
    expect((await balanceFor(w.db, "acc", AT)).total).toBe(10_000);
  });

  /*
    ⚠️ THE BALANCE IS CHECKED BEFORE THE RUN, not after. A run that succeeds
    against a balance nobody checked is a call the platform pays for in full.
  */
  it("refuses a workspace that cannot afford the reserve, and says what it needs", async () => {
    const w = world();
    await fund(w, 5);
    const out = await ask(w, runner({ output: "x" }));
    expect(out).toMatchObject({ ok: false, why: "no_credits" });
    expect((out as { meta: Record<string, string> }).meta.have).toBe("5");
    expect(w.gens).toHaveLength(0);
  });

  /*
    ⚠️ THE PER-PERSON CEILING IS THE ONE THAT MAKES A BALANCE A BUDGET. Without
    it, whoever asks first spends everything and the only signal is a bill.
  */
  it("refuses a person past their own daily ceiling while the workspace has credits", async () => {
    const w = world();
    await fund(w, 100_000);
    expect((await ask(w, runner({ output: "1" }))).ok).toBe(true);
    expect((await ask(w, runner({ output: "2" }), { at: LATER })).ok).toBe(true);
    const third = await ask(w, runner({ output: "3" }), { at: LATER });
    expect(third).toMatchObject({ ok: false, why: "daily_ceiling" });
    expect((third as { meta: Record<string, string> }).meta.limit).toBe("2");
  });

  /*
    ⚠️ AND IT IS PER PERSON, which is the half a workspace-wide counter loses:
    one coach at their limit must not stop the rest of the studio working.
  */
  it("does not spend one person's ceiling on somebody else's behalf", async () => {
    const w = world();
    await fund(w, 100_000);
    await ask(w, runner({ output: "1" }));
    await ask(w, runner({ output: "2" }), { at: LATER });
    expect((await ask(w, runner({ output: "3" }), { actorId: "other" })).ok).toBe(true);
  });

  it("lets them start again the next day", async () => {
    const w = world();
    await fund(w, 100_000);
    await ask(w, runner({ output: "1" }));
    await ask(w, runner({ output: "2" }), { at: LATER });
    expect((await ask(w, runner({ output: "3" }), { at: TOMORROW })).ok).toBe(true);
  });
});

/* ----------------------------------------------------------------- race --- */

describe("two calls at once against one call's worth of credits", () => {
  /*
    ⚠️ THE HOLD IS TAKEN BEFORE THE RUN, AND THE CHECK IS PART OF THE WRITE.
    Reading a balance and then running leaves a window in which both callers see
    enough — and the overspend is not a wrong number on a screen, it is a second
    call to a provider that the platform pays for in full and can never bill.

    ⚠️ WHAT IS COUNTED IS PROVIDER CALLS, not results. A debit taken after the
    run refuses the second caller too — after it has already run — so asserting
    on the answers alone cannot tell the two implementations apart.
  */
  it("runs the model once, not twice", async () => {
    const w = world();
    const reserve = (await (async () => {
      await fund(w, 1_000_000);
      const probe = await ask(w, runner({ output: "x" }));
      return (probe as { charged: number }).charged;
    })());

    const fresh = world();
    await fund(fresh, reserve);
    const provider = counting({ output: "x" });
    const both = await Promise.all([
      generate({ db: fresh.db, global: fresh.db, accountId: "acc", productId: "hello", ai, catalogue: CATALOGUE, inference: provider.handle, tenantId: "t", actorId: "a", feature: "draft", prompt: "four weeks", at: AT }),
      generate({ db: fresh.db, global: fresh.db, accountId: "acc", productId: "hello", ai, catalogue: CATALOGUE, inference: provider.handle, tenantId: "t", actorId: "b", feature: "draft", prompt: "four weeks", at: AT }),
    ]);

    expect(provider.calls).toHaveLength(1);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(both.find((r) => !r.ok)).toMatchObject({ why: "no_credits" });
    expect((await balanceFor(fresh.db, "acc", AT)).total).toBeGreaterThanOrEqual(0);
  });
});

/* -------------------------------------------------------------- failures --- */

describe("when the provider fails", () => {
  /*
    ⚠️ REFUNDED IN FULL, because the workspace has no output. A provider that
    failed after doing work is the provider's problem with us, not ours with the
    workspace.
  */
  it("gives the hold back", async () => {
    const w = world();
    await fund(w, 10_000);
    const out = await ask(w, runner(new Error("upstream")));
    expect(out).toMatchObject({ ok: false, why: "provider" });
    expect((await balanceFor(w.db, "acc", AT)).total).toBe(10_000);
  });

  /*
    ⚠️ AND IT STILL RECORDS THE ATTEMPT. A table holding only successes answers
    "why was I charged" and none of "why did this stop working" — and it makes
    the daily ceiling something a failing provider lets somebody loop past for
    free.
  */
  it("records the attempt, so a failing feature is not an unbounded one", async () => {
    const w = world();
    await fund(w, 10_000);
    await ask(w, runner(new Error("upstream")));
    await ask(w, runner(new Error("upstream")), { at: LATER });
    expect(w.gens).toHaveLength(2);
    expect(await ask(w, runner({ output: "x" }), { at: LATER })).toMatchObject({ ok: false, why: "daily_ceiling" });
  });
});

/* ---------------------------------------------------------------- usage --- */

describe("reading what a provider reported", () => {
  const rate = { input: 1, output: 2 };

  it("prices both sides separately", () => {
    expect(usageOf({ usage: { input: 10, output: 20 } }, rate)).toBe(50);
  });

  /*
    ⚠️ A PARTIAL REPORT IS NO REPORT. Counting the half that arrived and assuming
    zero for the other is a guess in the cheap direction, which is the one
    direction the cap does not catch.
  */
  it("says nothing rather than half of something", () => {
    expect(usageOf({ usage: { input: 10 } }, rate)).toBeNull();
    expect(usageOf({ usage: {} }, rate)).toBeNull();
    expect(usageOf({}, rate)).toBeNull();
    expect(usageOf(null, rate)).toBeNull();
  });
});

/* -------------------------------------------------------------- the day --- */

describe("what a day is", () => {
  /*
    ⚠️ ONE CLOCK FOR THE DEPLOYMENT. A ceiling anchored on each caller's own
    timezone resets at a different moment for every person in a workspace, and
    twice a year some of them get an extra hour of allowance.
  */
  it("is the UTC date, whatever hour it is", () => {
    expect(dayOf(AT)).toBe("2026-01-10");
    expect(dayOf(LATER)).toBe("2026-01-10");
    expect(dayOf(TOMORROW)).toBe("2026-01-11");
  });

  it("counts only today, and only this feature", async () => {
    const w = world();
    await fund(w, 100_000);
    await ask(w, runner({ output: "x" }));
    expect(await spentToday(w.db, "t", "u", "draft", AT)).toBe(1);
    expect(await spentToday(w.db, "t", "u", "other", AT)).toBe(0);
    expect(await spentToday(w.db, "t", "u", "draft", TOMORROW)).toBe(0);
  });
});

/* ------------------------------------------------------------- the trail --- */

describe("what the credits were spent on", () => {
  it("lists what was charged, most recent first", async () => {
    const w = world();
    await fund(w, 100_000);
    await ask(w, runner({ output: "1", usage: { input: 1, output: 1 } }));
    await ask(w, runner({ output: "2", usage: { input: 2, output: 2 } }), { at: LATER });
    const out = await spending(w.db, "t", 10);
    expect(out).toHaveLength(2);
    expect(out[0]!.at).toBe(LATER);
    expect(out[0]!.feature).toBe("draft");
    expect(out[0]!.verdict).toBeNull();
  });

  /*
    ⚠️ THE ONLY WAY A MODEL CHOICE IS EVER REVISITED. Without somewhere to say
    "this was wrong", the only signal a catalogue gets is that people quietly
    stop using a feature — which reads, in every metric, as one nobody wanted.
  */
  it("records that a generation was wrong, against the generation", async () => {
    const w = world();
    await fund(w, 100_000);
    const out = await ask(w, runner({ output: "nonsense" }));
    const id = (out as { id: string }).id;
    expect(await judge(w.db, "t", id, "wrong", "invented a movement")).toBe(true);
    expect((await spending(w.db, "t", 10))[0]!.verdict).toBe("wrong");
  });

  it("says nothing was there rather than pretending it recorded one", async () => {
    const w = world();
    expect(await judge(w.db, "t", "gen_nothing", "wrong", "")).toBe(false);
  });
});

/* ---------------------------------------------------- the picture lanes --- */

/**
 * ⚠️ THE DECLARATION AND THE CALL HAVE TO AGREE, IN BOTH DIRECTIONS, and only
 * one of the two mistakes is loud.
 *
 * A feature that declared a picture and was sent none is a request the model
 * cannot answer — it fails visibly, as a provider error somebody retries. The
 * other way round is the expensive one: an image attached to a feature whose
 * reserve was computed for text alone SUCCEEDS, returns a good answer, and
 * leaves the platform paying for the thousand-odd input units the provider
 * billed and nothing held.
 */
describe("a picture and the feature that did or did not ask for one", () => {
  const sees: AiSpec = {
    actions: {
      read: { summary: "Read", lane: "vision", system: "You read pictures.", maxOutput: 100, dailyPerPerson: 5 },
      words: { summary: "Words", lane: "text", system: "You read words.", maxOutput: 100, dailyPerPerson: 5 },
    },
  };
  const seeing: Catalogue = [
    { id: "sees", provider: "p", lanes: ["vision"], rate: { input: 1, output: 2 }, attachmentUnits: 1_000, markup: 1, enabled: true },
    { id: "reads", provider: "p", lanes: ["text"], rate: { input: 1, output: 2 }, markup: 1, enabled: true },
  ];
  const picture = { bytes: new Uint8Array([1, 2, 3]).buffer, contentType: "image/jpeg" };

  const call = async (feature: string, image?: { bytes: ArrayBuffer; contentType: string }) => {
    const w = world();
    await grantCredits(w.db, "acc", { kind: "purchased", amount: 100_000, reason: "test" }, AT);
    const out = await generate({
      db: w.db, global: w.db, accountId: "acc", productId: "hello", ai: sees, catalogue: seeing, inference: runner({ output: "ok" }),
      tenantId: "t_1", actorId: "u_1", feature, prompt: "what is this",
      ...(image ? { image } : {}), at: AT,
    });
    return { out, spent: 100_000 - (await balanceFor(w.db, "acc", AT)).total };
  };

  it("runs a vision feature given a picture", async () => {
    const { out } = await call("read", picture);
    expect(out.ok).toBe(true);
  });

  /* ⚠️ Nothing is held: the refusal is above the debit, so a mistake here costs
     a refund rather than being one. */
  it("refuses a vision feature given none, and holds nothing", async () => {
    const { out, spent } = await call("read");
    expect(out.ok).toBe(false);
    expect(!out.ok && out.meta?.reason).toMatch(/asks for a picture/);
    expect(spent).toBe(0);
  });

  /*
    ⚠️ THIS IS THE EXPENSIVE ONE, AND IT IS THE ONE THAT WOULD SUCCEED. An image
    on a feature that declared none is metered by a reserve computed from the
    text: it answers, it charges a fraction, and the provider bills the picture.
    Nothing throws and nothing logs.
  */
  it("refuses a text feature given a picture, rather than quietly running it", async () => {
    const { out, spent } = await call("words", picture);
    expect(out.ok).toBe(false);
    expect(!out.ok && out.meta?.reason).toMatch(/takes no picture/);
    expect(spent).toBe(0);
  });

  it("holds the picture's own units when it does run", async () => {
    const withPicture = (await call("read", picture)).spent;
    const wordsOnly = (await call("words")).spent;
    /* The two system texts differ by a few characters, so this is a floor. */
    expect(withPicture - wordsOnly).toBeGreaterThanOrEqual(1_000);
  });
});
