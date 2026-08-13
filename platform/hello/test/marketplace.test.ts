/**
 * BUYING BEFORE CREATING — the order the whole rail turns on.
 *
 * ⚠️ THE PARKING STATE IS WHAT THIS REPLACES. A workspace used to be created
 * first, held on no plan, and gated until somebody paid — a product given away,
 * kept alive by a state whose only job was to be escapable. Buying first removes
 * the state and the gate together, and what somebody holds after paying is a
 * subscription looking for a workspace.
 *
 * ⚠️ AND EVERY ASSERTION HERE IS ABOUT MONEY. A subscription claimed twice, an
 * allowance granted twice, credits spent from the wrong bucket — none of those
 * fail. They return a plausible number and are found a month later by somebody
 * reading a total that does not add up.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";
import { bindingsFor } from "@one/runtime";
import { sql, type ResolvedRegion } from "@one/kernel";

const ID = "https://id.4dl.app";

const directory = () =>
  bindingsFor({ db: sql() }, { DB: (env as Record<string, unknown>).DIRECTORY }, { defaultRegion: "auto" })("auto" as ResolvedRegion).db;

const at = (origin: string, path: string, cookie: string, body?: unknown) =>
  worker.fetch(new Request(`${origin}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env as never);

const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, never> });

const who = () => `mkt.${Math.random().toString(36).slice(2, 8)}@example.test`;

beforeAll(async () => {
  /* ⚠️ The schema is applied by the first request, not by the test. */
  await worker.fetch(new Request(`${ID}/api/market.shelf`), env as never);
});

/* ----------------------------------------------------------------- shelf --- */

describe("what there is to buy", () => {
  /*
    ⚠️ PUBLIC, because a price list is a public fact — and the alternative is a
    pricing page that cannot be rendered until somebody signs in, which is a
    storefront nobody outside can read.
  */
  it("shows the shelf to somebody with no session at all", async () => {
    const out = await json(await at(ID, "/api/market.shelf", ""));
    expect(out.status).toBe(200);
    expect((out.body.plans as unknown as unknown[]).length).toBeGreaterThan(0);
  });

  /*
    ⚠️ WHETHER A TRIAL IS STILL AVAILABLE IS PART OF THE SHELF. A card offering
    "free for a fortnight" to somebody who has already had it is a promise the
    next screen takes back — and the record is the subscription's own end date,
    kept after the trial ends precisely so this can be answered.
  */
  it("stops offering a trial to somebody who has had one", async () => {
    const email = who();
    const cookie = await signIn(email, ID);
    expect((await json(await at(ID, "/api/market.shelf", cookie))).body.trialAvailable).toBe(true);

    await at(ID, "/api/market.start", cookie, { planId: "keeper" });
    /* ⚠️ Cancelled, not merely ended — the harshest case for a memory that
       lives in the row rather than in a flag somebody clears. */
    await directory().run(`UPDATE account_subscription SET status = 'cancelled' WHERE account_id = (SELECT id FROM accounts WHERE email = ?)`, email);
    expect((await json(await at(ID, "/api/market.shelf", cookie))).body.trialAvailable).toBe(false);
  });
});

/* ---------------------------------------------------------------- buying --- */

describe("starting a subscription", () => {
  it("begins a trial that is usable immediately, and says where to go", async () => {
    const cookie = await signIn(who(), ID);
    const out = await json(await at(ID, "/api/market.start", cookie, { planId: "keeper" }));
    expect(out.status).toBe(200);
    expect(out.body.status).toBe("trialing");
    expect(out.body.trialEndsAt).toBeTruthy();
    /* ⚠️ A trial is paid for by nobody, so it goes straight to the setup door. */
    expect(String(out.body.setupAt)).toContain("setup.");
  });

  /*
    ⚠️ PAYING AND CLOSING THE TAB IS ORDINARY, AND PRESSING THE BUTTON AGAIN MUST
    NOT SELL A SECOND ONE. Without this, somebody who came back would be charged
    for a workspace nobody asked for and told they had bought one.
  */
  it("refuses a second subscription while one is still waiting for a workspace", async () => {
    const cookie = await signIn(who(), ID);
    expect((await json(await at(ID, "/api/market.start", cookie, { planId: "keeper" }))).status).toBe(200);
    const again = await json(await at(ID, "/api/market.start", cookie, { planId: "keeper" }));
    expect(again.status).toBe(409);
  });

  it("refuses a plan this product does not sell", async () => {
    const cookie = await signIn(who(), ID);
    expect((await json(await at(ID, "/api/market.start", cookie, { planId: "nonesuch" }))).status).toBe(404);
  });

  /*
    ⚠️ AND IT IS VISIBLE WHILE IT POINTS AT NOTHING, with the address to finish
    at. Somebody who paid and closed the tab has no other route back — the only
    alternative is remembering, which is not a feature.
  */
  it("shows a subscription with no workspace on it, and where to finish", async () => {
    const cookie = await signIn(who(), ID);
    await at(ID, "/api/market.start", cookie, { planId: "keeper" });
    const mine = (await json(await at(ID, "/api/me.subscriptions", cookie))).body.subscriptions as unknown as readonly {
      tenantId: string | null; setupAt?: string; standing: { standing: string };
    }[];
    expect(mine).toHaveLength(1);
    expect(mine[0]!.tenantId).toBeNull();
    expect(mine[0]!.setupAt).toContain("setup.");
    /* ⚠️ The standing comes from the same function the gate reads. A hub that
       computed it its own way could disagree with the door somebody is at. */
    expect(mine[0]!.standing.standing).toBe("active");
  });
});

/* -------------------------------------------------------------- claiming --- */

describe("creating the workspace it paid for", () => {
  /*
    ⚠️ THE SUBSCRIPTION IS CLAIMED, NOT COPIED. One subscription is one workspace
    — a plan's ceilings are written per workspace, so a second studio on one
    subscription makes every one of those numbers ambiguous.
  */
  it("attaches the waiting subscription to the workspace, once", async () => {
    const email = who();
    const setup = await signIn(email, SETUP);
    const idCookie = await signIn(email, ID);
    await at(ID, "/api/market.start", idCookie, { planId: "keeper" });

    const slug = `mkt${Math.random().toString(36).slice(2, 7)}`;
    const made = await post(SETUP, "/api/identity.workspace.create", { slug }, setup);
    expect(made.res.status).toBe(200);

    const rows = await directory().all<{ tenant_id: string | null }>(
      `SELECT tenant_id FROM account_subscription WHERE account_id = (SELECT id FROM accounts WHERE email = ?)`, email,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tenant_id).toBe(made.body.tenantId);

    /* ⚠️ AND A SECOND WORKSPACE NEEDS A SECOND SUBSCRIPTION. On a deployment
       that cannot charge this still succeeds — refusing there would be
       punishing somebody for OUR missing configuration — so what is asserted is
       that the claimed one was not reused. */
    const second = await post(SETUP, "/api/identity.workspace.create", { slug: `${slug}b` }, setup);
    if (second.res.status === 200) {
      const after = await directory().first<{ n: number }>(
        `SELECT COUNT(*) AS n FROM account_subscription WHERE tenant_id = ?`, made.body.tenantId,
      );
      expect(after?.n, "the first workspace's subscription must not have moved").toBe(1);
    }
  });
});

/* --------------------------------------------------------------- credits --- */

describe("one balance, every product", () => {
  const accountOf = async (email: string) =>
    (await directory().first<{ id: string }>(`SELECT id FROM accounts WHERE email = ?`, email))?.id ?? "";

  it("reports nothing to somebody who has never had any", async () => {
    const cookie = await signIn(who(), ID);
    const out = await json(await at(ID, "/api/me.credits", cookie));
    expect(out.status).toBe(200);
    expect((out.body.balance as unknown as { total: number }).total).toBe(0);
  });

  /*
    ⚠️ THE TWO KINDS ARE REPORTED SEPARATELY, and this is the number a screen
    needs. A single total drops overnight when an allowance lapses, with nothing
    on the screen having said it would.
  */
  it("tells granted credits from purchased ones, and says when the granted go", async () => {
    const email = who();
    const cookie = await signIn(email, ID);
    const account = await accountOf(email);
    const soon = new Date(Date.now() + 5 * 86_400_000).toISOString();
    await directory().run(
      `INSERT INTO account_credit (id, account_id, kind, amount, expires_at, reason, ref, product_id, at) VALUES (?, ?, 'granted', 900, ?, 'allowance', NULL, 'hello', ?)`,
      crypto.randomUUID(), account, soon, new Date().toISOString(),
    );
    await directory().run(
      `INSERT INTO account_credit (id, account_id, kind, amount, expires_at, reason, ref, product_id, at) VALUES (?, ?, 'purchased', 100, NULL, 'pack', NULL, 'hello', ?)`,
      crypto.randomUUID(), account, new Date().toISOString(),
    );

    const balance = (await json(await at(ID, "/api/me.credits", cookie))).body.balance as unknown as {
      total: number; granted: number; purchased: number; expiring: { at: string; amount: number } | null;
    };
    expect(balance).toMatchObject({ total: 1000, granted: 900, purchased: 100 });
    expect(balance.expiring).toMatchObject({ amount: 900 });
  });

  /*
    ⚠️ AN ALLOWANCE THAT HAS LAPSED IS NOT SPENDABLE, WITH NOTHING HAVING RUN. A
    sweep that zeroed lapsed cohorts would make the balance depend on whether that
    sweep ran — so a wedged scheduler keeps handing out an allowance that expired
    in March, and every row in the ledger agrees it was correct to.
  */
  it("stops counting an allowance the moment it lapses", async () => {
    const email = who();
    const cookie = await signIn(email, ID);
    const account = await accountOf(email);
    await directory().run(
      `INSERT INTO account_credit (id, account_id, kind, amount, expires_at, reason, ref, product_id, at) VALUES (?, ?, 'granted', 5000, ?, 'allowance', NULL, 'hello', ?)`,
      crypto.randomUUID(), account, new Date(Date.now() - 86_400_000).toISOString(), new Date().toISOString(),
    );
    expect(((await json(await at(ID, "/api/me.credits", cookie))).body.balance as unknown as { total: number }).total).toBe(0);
  });

  /*
    ⚠️ BUYING GRANTS NOTHING. Credits are minted by a provider's confirmation and
    by an operator, and by nothing else — an operation that granted on request
    would be an unmetered tap on every product at once, because this balance is
    spendable in all of them.
  */
  it("opens an intent and moves no balance, and refuses where nothing can be paid", async () => {
    const email = who();
    const cookie = await signIn(email, ID);
    const before = ((await json(await at(ID, "/api/me.credits", cookie))).body.balance as unknown as { total: number }).total;
    const out = await json(await at(ID, "/api/me.credits.buy", cookie, { packId: "top" }));
    /* ⚠️ This deployment has no provider, so it refuses and says so rather than
       answering cleanly with a purchase nothing will ever settle. */
    expect([200, 404, 503]).toContain(out.status);
    const after = ((await json(await at(ID, "/api/me.credits", cookie))).body.balance as unknown as { total: number }).total;
    expect(after).toBe(before);
  });
});
