/**
 * BUYING ACCESS — version 0.7, and the design decision the whole thing rests on:
 * this platform is NEVER in the money path.
 *
 * ⚠️ THE STUDIO IS PAID ON THEIR OWN PROVIDER, IN THEIR OWN COUNTRY. What is
 * recorded here is that somebody said they wanted to buy something, and
 * separately that somebody with authority said it was paid for. Storing a
 * payment would be storing a claim nobody here can check.
 *
 * ⚠️ AND `manual` IS THE DEFAULT RATHER THAN THE FALLBACK. It works everywhere on
 * day one, needs no account anywhere, and every automated provider degrades to
 * it — which is why both lanes settle through ONE path. Two routes to "they
 * paid" disagree eventually, and the disagreement is always about money.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";

const SLUG = "thwaite";
const STUDIO = `https://${SLUG}.kova.4dl.app`;

const as = (cookie: string) => async (path: string, body?: unknown) => {
  const res = await worker.fetch(
    new Request(`${STUDIO}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

/** The workspace's own provider posting a signed notification. No session. */
const notify = async (body: string, signature: string) => {
  const res = await worker.fetch(
    new Request(`${STUDIO}/api/webhook.customer`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-provider-signature": signature },
      body,
    }),
    env as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

const SECRET = "whsec_studio_signing_secret";

const sign = async (body: string, at = Math.floor(Date.now() / 1000)) => {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${at}.${body}`)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${at},v1=${mac}`;
};

type Runway = { runway: { byScope: Record<string, number> } };

let coach: ReturnType<typeof as>;
let ro = "";
let client: ReturnType<typeof as>;

beforeAll(async () => {
  const founding = await signIn(`${SLUG}@example.test`, SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: SLUG }, founding);
  coach = as(await signIn(`${SLUG}@example.test`, STUDIO));

  ro = (await coach("/api/client.create", { name: "Ro" })).body.id as unknown as string;
  await coach("/api/member.invite", { email: "ro@thwaite.example.test", role: "client", subjectId: ro });
  client = as(await signIn("ro@thwaite.example.test", STUDIO));

  await coach("/api/commerce.package.save", {
    id: "month", name: "A month", price: { minor: 9_900, currency: "USD" },
    flags: { training: true }, budgets: { coaching: 30 }, oncePerCustomer: false,
  });
});

/* ---------------------------------------------------------- the default --- */

describe("a studio that has configured nothing can still be paid", () => {
  /*
    ⚠️ THIS IS THE STATE MOST STUDIOS ARE IN, and it has to be a working product
    rather than a setup screen. Nothing is configured, so the client is told to
    arrange it with their coach and the coach confirms it by hand.
  */
  it("starts on the manual lane", async () => {
    const setup = (await coach("/api/commerce.payments")).body;
    expect(setup).toMatchObject({ provider: "manual", checkoutUrl: "", verifies: false });
  });

  it("opens an intent and grants nothing at all", async () => {
    const out = await client("/api/commerce.checkout", { subjectId: ro, packageId: "month" });
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ settlement: "confirmed_by_the_workspace" });
    expect(out.body.amount).toEqual({ minor: 9_900, currency: "USD" });

    /* ⚠️ Saying you will pay is not paying. */
    const caps = (await coach(`/api/commerce.capabilities?subjectId=${ro}`)).body as unknown as Runway;
    expect(caps.runway.byScope.coaching ?? 0).toBe(0);
    expect((await client("/api/workout.create", { client: ro, day: "2026-08-01" })).status).toBe(403);
  });

  it("applies what was bought when the studio says it was paid", async () => {
    const open = ((await coach("/api/commerce.purchases")).body as unknown as
      { purchases: { id: string; status: string }[] }).purchases.find((p) => p.status === "open")!;

    const done = await coach("/api/commerce.confirm", { purchaseId: open.id, ref: "Bank transfer 4412" });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ daysAdded: 30, alreadySettled: false });

    const caps = (await coach(`/api/commerce.capabilities?subjectId=${ro}`)).body as unknown as Runway;
    expect(caps.runway.byScope.coaching).toBe(30);
    expect((await client("/api/workout.create", { client: ro, day: "2026-08-01" })).status).toBe(200);
  });

  /*
    ⚠️ CONFIRMING TWICE MUST NOT BUY IT TWICE. A coach pressing the button again
    because the first press looked slow is the ordinary case, and the money moved
    once. The conditional write is the lock, not a check-then-write.
  */
  it("does not grant it again when confirmed twice", async () => {
    const settled = ((await coach("/api/commerce.purchases")).body as unknown as
      { purchases: { id: string; status: string }[] }).purchases.find((p) => p.status === "settled")!;

    const again = await coach("/api/commerce.confirm", { purchaseId: settled.id });
    expect(again.body).toMatchObject({ daysAdded: 0, alreadySettled: true });

    const caps = (await coach(`/api/commerce.capabilities?subjectId=${ro}`)).body as unknown as Runway;
    expect(caps.runway.byScope.coaching).toBe(30);
  });
});

/* -------------------------------------------------------------- the link --- */

describe("a studio with its own checkout page", () => {
  it("refuses a lane with nowhere to send anybody", async () => {
    const bad = await coach("/api/commerce.payments.set", { provider: "link" });
    expect(bad.status).toBe(400);
    expect(bad.body.meta).toMatchObject({ field: "checkoutUrl" });
  });

  /*
    ⚠️ A STORED CREDENTIAL MAY VERIFY, NEVER ACT. A signing secret checks that a
    notification came from the studio's own provider; an API key would let this
    platform CHARGE their customers, which is a liability nothing here needs.
  */
  it("refuses a credential that could charge somebody", async () => {
    const bad = await coach("/api/commerce.payments.set", {
      provider: "link", checkoutUrl: "https://pay.thwaite.example/month", verifySecret: "sk_live_abc123",
    });
    expect(bad.status).toBe(400);
    expect(bad.body.meta).toMatchObject({ field: "verifySecret" });
  });

  it("takes an https address and a signing secret, and never gives the secret back", async () => {
    const saved = await coach("/api/commerce.payments.set", {
      provider: "link", checkoutUrl: "https://pay.thwaite.example/month", verifySecret: SECRET,
    });
    expect(saved.status).toBe(200);

    const setup = (await coach("/api/commerce.payments")).body;
    expect(setup).toMatchObject({ provider: "link", checkoutUrl: "https://pay.thwaite.example/month", verifies: true });
    expect(JSON.stringify(setup)).not.toContain(SECRET);
  });

  it("sends the customer to the studio's own page, and promises the right thing", async () => {
    const out = await client("/api/commerce.checkout", { subjectId: ro, packageId: "month" });
    expect(out.body).toMatchObject({
      payAt: "https://pay.thwaite.example/month",
      settlement: "automatic",
    });
  });
});

/* ----------------------------------------------------------- the notice --- */

describe("the provider's notification", () => {
  const openOne = async () => {
    const out = await client("/api/commerce.checkout", { subjectId: ro, packageId: "month" });
    return out.body.purchaseId as unknown as string;
  };

  it("applies the package when the signature checks out", async () => {
    const id = await openOne();
    const before = ((await coach(`/api/commerce.capabilities?subjectId=${ro}`)).body as unknown as Runway).runway.byScope.coaching!;

    const body = JSON.stringify({ purchaseId: id, ref: "ch_9912" });
    const out = await notify(body, await sign(body));
    expect(out.status).toBe(200);
    expect(out.body.outcome).toBe("settled");

    const after = ((await coach(`/api/commerce.capabilities?subjectId=${ro}`)).body as unknown as Runway).runway.byScope.coaching!;
    expect(after).toBe(before + 30);
  });

  /*
    ⚠️ A REDELIVERY IS ORDINARY, AND IT MUST NOT BUY ANYTHING. Providers retry on
    a timeout they saw and we did not — so the second delivery of a success is
    the common case rather than the strange one.
  */
  it("answers a redelivery without granting again", async () => {
    const id = await openOne();
    const body = JSON.stringify({ purchaseId: id });
    const signature = await sign(body);
    await notify(body, signature);

    const before = ((await coach(`/api/commerce.capabilities?subjectId=${ro}`)).body as unknown as Runway).runway.byScope.coaching!;
    const again = await notify(body, signature);
    expect(again.body.outcome).toBe("already_settled");
    expect(((await coach(`/api/commerce.capabilities?subjectId=${ro}`)).body as unknown as Runway).runway.byScope.coaching).toBe(before);
  });

  /* ⚠️ The signature is the whole of the authentication — there is no session. */
  it("refuses an unsigned or wrongly signed notice", async () => {
    const id = await openOne();
    const body = JSON.stringify({ purchaseId: id });
    expect((await notify(body, "")).status).toBe(403);
    expect((await notify(body, "t=1,v1=deadbeef")).status).toBe(403);
    expect((await notify(body, await sign(body, 1))).status).toBe(403);
  });

  /*
    ⚠️ A STUDIO THAT HAS CONFIGURED NO VERIFICATION IS REFUSED, NOT TRUSTED. Most
    studios are on the manual lane and have no secret — answering them 200 would
    make this endpoint a way to grant paid access to anybody who can guess a
    purchase id, for the majority of workspaces on the deployment.
  */
  it("refuses a workspace with no verification configured", async () => {
    const other = "https://gunnerside.kova.4dl.app";
    const founding = await signIn("gunnerside@example.test", SETUP);
    await post(SETUP, "/api/identity.workspace.create", { slug: "gunnerside" }, founding);

    const body = JSON.stringify({ purchaseId: "pur_whatever" });
    const res = await worker.fetch(
      new Request(`${other}/api/webhook.customer`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-provider-signature": await sign(body) },
        body,
      }),
      env as never,
    );
    expect(res.status).toBe(403);
  });
});

/* -------------------------------------------------------------- refusal --- */

describe("what a customer may open", () => {
  /* ⚠️ Their own, and nobody else's — the same row scope as everything here. */
  it("cannot open a purchase for another client", async () => {
    const somebody = (await coach("/api/client.create", { name: "Somebody" })).body.id as unknown as string;
    expect((await client("/api/commerce.checkout", { subjectId: somebody, packageId: "month" })).status).toBe(403);
  });

  /*
    ⚠️ A ONCE-ONLY PACKAGE IS REFUSED BEFORE THE MONEY MOVES, not after. Somebody
    who can pay and not receive is worse off than somebody who cannot buy: the
    payment happened on a page this platform does not control, and there is
    nothing here that could give it back.
  */
  it("refuses a once-only package before sending anybody to pay", async () => {
    await coach("/api/commerce.package.save", {
      id: "starter", name: "Starter block", price: { minor: 5_000, currency: "USD" },
      flags: { training: true }, budgets: { coaching: 14 }, oncePerCustomer: true,
    });
    expect((await coach("/api/commerce.grant", { subjectId: ro, packageId: "starter" })).status).toBe(200);

    const again = await client("/api/commerce.checkout", { subjectId: ro, packageId: "starter" });
    expect(again.status).toBe(409);
    expect(again.body.meta).toMatchObject({ reason: "already_purchased" });
  });

  /*
    ⚠️ DECIDED FROM THE SESSION, NOT FROM THE REQUEST. An optional filter a
    customer could point at somebody else's id is not a filter — it is the hole
    with a parameter in front of it. A coach opening a purchase on somebody's
    behalf is what makes the difference observable at all.
  */
  it("sees their own purchases and not the studio's other customers'", async () => {
    const roster = ((await coach("/api/client.list")).body as unknown as { rows: { id: string; name: string }[] }).rows;
    const somebody = roster.find((c) => c.name === "Somebody")!.id;
    expect((await coach("/api/commerce.checkout", { subjectId: somebody, packageId: "month" })).status).toBe(200);

    /* The studio sees both people's. */
    const all = ((await coach("/api/commerce.purchases")).body as unknown as
      { purchases: { subjectId: string }[] }).purchases;
    expect(new Set(all.map((p) => p.subjectId)).size).toBe(2);

    /* The client sees only their own, whatever they ask for. */
    for (const asked of ["", `?subjectId=${somebody}`]) {
      const mine = ((await client(`/api/commerce.purchases${asked}`)).body as unknown as
        { purchases: { subjectId: string }[] }).purchases;
      expect(mine.length).toBeGreaterThan(0);
      expect(mine.every((p) => p.subjectId === ro), asked || "no filter").toBe(true);
    }
  });
});
