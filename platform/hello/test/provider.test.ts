/**
 * THE PAYMENT PROVIDER'S ENDPOINT — the one surface where every failure is
 * silent and every silent failure is money.
 *
 * ⚠️ THE DEFECT THIS FILE IS ARRANGED AROUND: a handler that could not work out
 * whose event it was, answering `200 {received: true}` with the id already
 * claimed. The provider marks it delivered and never retries. Money captured,
 * nothing granted, no error anywhere — and the only trace is a customer asking
 * why they were charged for something they do not have.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { accountIds, post, SETUP, signIn } from "./session.js";
import { bindingsFor } from "@one/runtime";
import { sql, type ResolvedRegion } from "@one/kernel";

const ORIGIN = "https://rail.hello.4dl.app";
const SECRET = "whsec_test";
/**
 * ⚠️ THE DEAD LETTER IS READ ON THE OPERATOR DOOR AND NOWHERE ELSE. Every row in
 * it carries a provider's raw payload for an event nobody could attribute — which
 * means it may belong to any workspace on the deployment. A workspace owner
 * holding the key to it is a cross-tenant disclosure with a screen in front of
 * it, and this suite read it as one until the key moved.
 */
const ADMIN = "https://admin.hello.4dl.app";
let member = "";
let operator = "";
let tenantId = "";

const handle = (binding: string) =>
  bindingsFor({ db: sql() }, { DB: (env as Record<string, unknown>)[binding] }, { defaultRegion: "auto" })("auto" as ResolvedRegion).db;

const global_ = () => handle("DIRECTORY");

/** ⚠️ The operator door: the only place `platform:operate` is ever held. */
const asOperator = async (path: string, body?: unknown) => {
  const res = await worker.fetch(
    new Request(`${ADMIN}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", cookie: operator },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

const call = async (path: string, body?: unknown, cookie = member) => {
  const res = await worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

/** Exactly what a provider does: sign `t.body` and send the same bytes. */
const sign = async (body: string, atSeconds: number, secret = SECRET) => {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${atSeconds}.${body}`));
  return `t=${atSeconds},v1=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
};

const deliver = async (event: unknown, over: { signature?: string; secret?: string; skewSeconds?: number } = {}) => {
  const body = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000) + (over.skewSeconds ?? 0);
  const res = await worker.fetch(
    new Request(`${ORIGIN}/api/webhook.provider`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-provider-signature": over.signature ?? (await sign(body, t, over.secret)),
      },
      body,
    }),
    env as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

const paid = (id: string, meta: Record<string, string>, customer: string | null = null) => ({
  id,
  type: "invoice.paid",
  data: { object: { customer, amount_paid: 900, metadata: meta } },
});

beforeAll(async () => {
  const staff = await signIn("rail@example.test", SETUP);
  const made = await post(SETUP, "/api/identity.workspace.create", { slug: "rail" }, staff);
  tenantId = made.body.tenantId as string;
  member = await signIn("rail@example.test", ORIGIN);
  operator = await signIn("op@rail.example.test", ADMIN);
  expect(accountIds.get("rail@example.test")).toBeTruthy();
});

/* ---------------------------------------------------------- verification --- */

describe("the signature is the whole of the authentication", () => {
  /*
    ⚠️ PUBLIC BY CONSTRUCTION — a provider cannot hold a session — so an endpoint
    with nothing to verify against is an open door that grants paid access to
    anybody who finds it.
  */
  it("refuses a body with no signature at all", async () => {
    const res = await deliver(paid("evt_nosig", { app: "hello", tenant: tenantId }), { signature: "" });
    expect(res.status).toBe(403);
  });

  it("refuses one signed with the wrong secret", async () => {
    const res = await deliver(paid("evt_wrong", { app: "hello", tenant: tenantId }), { secret: "whsec_not_ours" });
    expect(res.status).toBe(403);
  });

  /*
    ⚠️ THE TIMESTAMP IS PART OF WHAT IS SIGNED. Verifying the body alone makes a
    captured request replayable forever — the signature stays valid, so a
    recording of one successful payment can be posted back as often as somebody
    likes, against as many event ids as they can mint.
  */
  it("refuses a correctly signed body that is old", async () => {
    const res = await deliver(paid("evt_stale", { app: "hello", tenant: tenantId }), { skewSeconds: -3600 });
    expect(res.status).toBe(403);
  });

  it("refuses a signature whose body has been changed after signing", async () => {
    const original = JSON.stringify(paid("evt_tamper", { app: "hello", tenant: tenantId }));
    const header = await sign(original, Math.floor(Date.now() / 1000));
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/webhook.provider`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-provider-signature": header },
        body: original.replace("900", "90000"),
      }),
      env as never,
    );
    expect(res.status).toBe(403);
  });

  /*
    ⚠️ REFUSED, NOT PARKED. Parking an unverified body would let anybody fill an
    operator's dead letter with whatever they liked — and there is nothing to
    recover from a body that is not evidence of anything.
  */
  it("parks nothing it refused", async () => {
    const before = (await asOperator("/api/billing.parked")).body.events as unknown as { eventId: string }[];
    expect(before.map((e) => e.eventId)).not.toContain("evt_nosig");
  });
});

/* ---------------------------------------------------------- attribution --- */

describe("an event this worker cannot place is parked, never answered clean", () => {
  it("applies one that names this app and a workspace", async () => {
    const res = await deliver(paid("evt_1", { app: "hello", tenant: tenantId, plan: "keeper" }));
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("applied:paid");

    const standing = await call("/api/billing.standing");
    expect(standing.body.planId).toBe("keeper");
  });

  /*
    ⚠️ A REDELIVERED EVENT IS A SUCCESS THAT APPLIED NOTHING. Answering an error
    would make the provider retry forever; applying it again grants the package
    twice, free, with a correct-looking 200 each time.
  */
  it("applies a redelivery exactly zero more times, and says so", async () => {
    const res = await deliver(paid("evt_1", { app: "hello", tenant: tenantId, plan: "keeper" }));
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("already_applied");
  });

  it("parks an event belonging to a different product", async () => {
    const res = await deliver(paid("evt_other", { app: "somewhere-else", tenant: tenantId }));
    expect(res.body.outcome).toBe("parked:other_app");
    const parked = (await asOperator("/api/billing.parked")).body.events as unknown as { eventId: string; why: string }[];
    expect(parked.find((e) => e.eventId === "evt_other")?.why).toBe("other_app");
  });

  it("parks one with no metadata and no customer to look up", async () => {
    const res = await deliver(paid("evt_bare", {}));
    expect(res.body.outcome).toBe("parked:no_tenant");
  });

  /*
    ⚠️ A CLAIM RESOLVES SILENCE, NEVER A CONTRADICTION. A renewal carries the
    fields the PROVIDER thinks are interesting and none of ours, so the customer
    reference is how it is placed — but only when nothing already said whose it
    was.
  */
  it("claims one that carries only a customer reference, once that customer is known", async () => {
    expect((await deliver(paid("evt_claim_early", {}, "cus_1"))).body.outcome).toBe("parked:unclaimed");

    await global_().run(
      `INSERT INTO provider_customer (customer_ref, tenant_id, app_id, at) VALUES (?, ?, ?, ?)`,
      "cus_1", tenantId, "hello", new Date().toISOString(),
    );
    expect((await deliver(paid("evt_claim", {}, "cus_1"))).body.outcome).toBe("applied:paid");
  });

  /*
    ⚠️ THE FIRST EVENT TEACHES THE PLATFORM THE CUSTOMER; THE SECOND RELIES ON IT.
    A checkout carries the metadata we wrote, and the renewal a month later
    carries none of it — so without recording the customer the first time, every
    routine renewal parks and every workspace's plan quietly lapses.
  */
  it("remembers a customer it placed by metadata, so the renewal after it is claimed", async () => {
    expect((await deliver(paid("evt_first", { app: "hello", tenant: tenantId, plan: "keeper" }, "cus_renew"))).body.outcome).toBe("applied:paid");
    expect((await deliver(paid("evt_renewal", {}, "cus_renew"))).body.outcome).toBe("applied:paid");
  });

  it("refuses to let a claim override metadata that named another product", async () => {
    const res = await deliver(paid("evt_conflict", { app: "somewhere-else" }, "cus_1"));
    expect(res.body.outcome).toBe("parked:other_app");
  });

  /*
    ⚠️ A CUSTOMER REFERENCE THAT BELONGS TO ANOTHER PRODUCT IS NOT OURS TO
    CLAIM. One provider account serves every product here, so a reference
    resolving to a workspace in a different app must park rather than apply —
    otherwise one product settles another's payment, and both look fine.
  */
  it("parks a customer claimed by another product", async () => {
    await global_().run(
      `INSERT INTO provider_customer (customer_ref, tenant_id, app_id, at) VALUES (?, ?, ?, ?)`,
      "cus_theirs", tenantId, "somewhere-else", new Date().toISOString(),
    );
    expect((await deliver(paid("evt_theirs", {}, "cus_theirs"))).body.outcome).toBe("parked:other_app");
  });

  /*
    ⚠️ AN UNKNOWN TYPE IS APPLIED AS A NO-OP AND RECORDED, not refused. A
    provider ships new event types without asking, and a webhook that errors on
    one it does not recognise starts retrying forever the day that happens.
  */
  it("accepts a type it does not recognise without changing anything", async () => {
    const res = await deliver({ id: "evt_unknown", type: "invoice.upcoming", data: { object: { metadata: { app: "hello", tenant: tenantId } } } });
    expect(res.body.outcome).toBe("applied:other");
    expect((await call("/api/billing.standing")).body.planId).toBe("keeper");
  });
});

/* --------------------------------------------------------------- ladder --- */

describe("what a payment event does to standing", () => {
  const anchorOf = async () =>
    (await handle("DB").first<{ a: string | null }>(`SELECT past_due_at AS a FROM subscription WHERE tenant_id = ?`, tenantId))?.a ?? null;

  /*
    ⚠️ THE LADDER IS ANCHORED ON WHEN THE CHARGE FIRST FAILED. A provider retries
    a failing charge for weeks, and re-stamping the anchor on each attempt means
    a workspace never advances past the first rung however long it stays unpaid —
    the ladder still LOOKS right at every individual moment, and never arrives.
  */
  it("puts a failed charge past due and does not move the anchor on the next one", async () => {
    /*
      ⚠️ A FRESH EVENT ID PER ATTEMPT, because the suite retries once and the
      path under test is IDEMPOTENT. A retry that reuses the id takes the
      already-applied branch, changes nothing, and passes — so the retry
      configured to absorb storage contention silently absorbs a real failure in
      exactly the tests that assert a redelivery is safe. This one survived a
      mutation that way.
    */
    const attempt = crypto.randomUUID();
    await deliver({ id: `evt_fail_1_${attempt}`, type: "invoice.payment_failed", data: { object: { metadata: { app: "hello", tenant: tenantId } } } });
    expect(((await call("/api/billing.standing")).body.standing as unknown as { standing: string }).standing).toBe("grace");
    expect(await anchorOf()).toBeTruthy();

    /*
      Aged deliberately rather than relying on two deliveries landing in
      different milliseconds — they do not, reliably, and a test that depends on
      clock resolution is one that passes for the wrong reason most of the time.
      Six days back also puts the workspace one day from the next rung, which is
      what a re-stamp would silently undo.
    */
    const aged = new Date(Date.now() - 6 * 86_400_000).toISOString();
    await handle("DB").run(`UPDATE subscription SET past_due_at = ? WHERE tenant_id = ?`, aged, tenantId);

    await deliver({ id: `evt_fail_2_${attempt}`, type: "invoice.payment_failed", data: { object: { metadata: { app: "hello", tenant: tenantId } } } });
    expect(await anchorOf(), "a retry must not push the workspace back to day zero").toBe(aged);
  });

  /*
    ⚠️ THE ANCHOR IS CLEARED, NOT JUST THE STATUS. Leaving it behind is invisible
    until the NEXT failure, which then reads as weeks old and jumps the workspace
    straight past every warning rung to blocked.
  */
  it("clears the arrears and the anchor when a charge finally succeeds", async () => {
    await deliver(paid(`evt_recover_${crypto.randomUUID()}`, { app: "hello", tenant: tenantId, plan: "keeper" }));
    expect(((await call("/api/billing.standing")).body.standing as unknown as { standing: string }).standing).toBe("active");
    expect(await anchorOf()).toBeNull();
  });

  /*
    ⚠️ A WEBHOOK SETTLES IN A REGION THE REQUEST DID NOT ARRIVE IN. The event
    reaches whichever origin the provider was configured with; the workspace it
    belongs to may be on another continent. Settling against the handle the HOST
    implied writes the row into the wrong database — where nothing throws, the
    workspace never sees its plan, and the event is recorded as applied.
  */
  it("settles a workspace that lives in another region", async () => {
    const staff = await signIn("rail-eu@example.test", SETUP);
    const made = await post(SETUP, "/api/identity.workspace.create", { slug: "rail-eu", region: "eu" }, staff);
    const far = made.body.tenantId as string;

    expect((await deliver(paid("evt_eu", { app: "hello", tenant: far, plan: "keeper" }))).body.outcome).toBe("applied:paid");

    const there = await handle("DB_EU").first<{ p: string }>(`SELECT plan_id AS p FROM subscription WHERE tenant_id = ?`, far);
    expect(there?.p).toBe("keeper");
    const here = await handle("DB").first<{ p: string }>(`SELECT plan_id AS p FROM subscription WHERE tenant_id = ?`, far);
    expect(here, "the default region must not have been written instead").toBeNull();
  });
});

/* ---------------------------------------------------------- dead letter --- */

describe("a dead letter nobody can read is the same silent success", () => {
  it("is readable, and says what it dropped rather than truncating quietly", async () => {
    const res = await asOperator("/api/billing.parked?limit=1");
    expect(res.status).toBe(200);
    expect((res.body.events as unknown as unknown[]).length).toBe(1);
    expect(res.body.dropped).toBeGreaterThan(0);
  });

  /*
    ⚠️ REPLAY IS WHY PARKING IS A RECOVERY RATHER THAN A RECORD OF A LOSS. The
    row is RESOLVED rather than deleted, because what was parked and later
    replayed is the evidence that a gap in attribution existed at all.
  */
  it("replays a parked event onto the workspace an operator names", async () => {
    const res = await asOperator("/api/billing.parked.replay", { eventId: "evt_bare", tenantId });
    expect(res.status).toBe(200);

    const open = (await asOperator("/api/billing.parked")).body.events as unknown as { eventId: string }[];
    expect(open.map((e) => e.eventId)).not.toContain("evt_bare");
    const row = await global_().first<{ resolved_at: string | null }>(`SELECT resolved_at FROM parked_event WHERE event_id = ?`, "evt_bare");
    expect(row?.resolved_at).toBeTruthy();
  });

  it("refuses to replay an event it never parked", async () => {
    expect((await asOperator("/api/billing.parked.replay", { eventId: "evt_never", tenantId })).status).toBe(404);
  });
});
