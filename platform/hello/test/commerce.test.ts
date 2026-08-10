/**
 * STAGE 5'S EXIT CRITERION, ASSERTED THROUGH THE REAL WORKER.
 *
 * ⚠️ NOT ONE LINE OF THIS SURFACE IS WRITTEN BY `hello`. The plan list, the
 * standing read, the plan choice and the ceiling on the sixth receipt all come
 * from four lines in the manifest — two entitlement declarations, a plan
 * catalogue, and a `quota` on a collection.
 *
 * The unit tests prove the arithmetic. This proves the WIRING, which is the half
 * that was missing in three shipping products: a resolution that was correct and
 * a route that never asked it.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { hello } from "../src/manifest.js";
import { accountIds, post, SETUP, signIn } from "./session.js";
import { bindingsFor } from "@one/runtime";
import { sql, type ResolvedRegion } from "@one/kernel";

const ORIGIN = "https://money.hello.4dl.app";
let member = "";
let tenantId = "";
let subject = "";

const db = () =>
  bindingsFor({ db: sql() }, { DB: (env as Record<string, unknown>).DB }, { defaultRegion: "auto" })("auto" as ResolvedRegion).db;

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

beforeAll(async () => {
  const staff = await signIn("money@example.test", SETUP);
  const made = await post(SETUP, "/api/identity.workspace.create", { slug: "money" }, staff);
  tenantId = made.body.tenantId as string;
  member = await signIn("owner@example.test", ORIGIN);
  /*
    ⚠️ IN `hello` THE SIGNED-IN PERSON IS THE CUSTOMER, because it has no roster.
    Which record a caller acts as is the app's answer; what that record may do is
    the platform's.
  */
  subject = accountIds.get("owner@example.test") ?? "";
});

/* ------------------------------------------------------------- catalogue --- */

describe("the catalogue is the manifest's", () => {
  /*
    ⚠️ PUBLIC, because a price list is a public fact — a pricing page that cannot
    render until somebody signs in is a pricing page nobody reads.
  */
  it("serves the plans to a caller with no session at all", async () => {
    const res = await call("/api/billing.plans", undefined, "");
    expect(res.status).toBe(200);
    expect((res.body.plans as unknown as { id: string }[]).map((p) => p.id)).toEqual(["free", "keeper"]);
  });

  it("says whether this deployment can take money, rather than pretending", async () => {
    expect((await call("/api/billing.plans", undefined, "")).body.chargeable).toBe(false);
  });
});

/* -------------------------------------------------------------- standing --- */

describe("where a workspace stands", () => {
  /*
    ⚠️ A WORKSPACE THAT NEVER CHOSE A PLAN IS `active` HERE, and that is the
    whole point of `chargeable`. Holding it read-only on a deployment with no
    payment provider would strand every workspace over our misconfiguration
    rather than their non-payment.
  */
  it("is active on a deployment that cannot charge, with no plan chosen", async () => {
    const res = await call("/api/billing.standing");
    expect(res.body.standing).toMatchObject({ standing: "active", reason: "ok" });
    expect(res.body.planId).toBeUndefined();
  });

  it("shows the parking values, and where each came from", async () => {
    const ent = (await call("/api/billing.standing")).body.entitlements as unknown as Record<string, { value: unknown; from: string }>;
    expect(ent.notes).toEqual({ value: true, from: "parked", planValue: true });
    expect(ent.receiptsStored).toEqual({ value: 5, from: "parked", planValue: 5 });
  });

  /*
    ⚠️ CHOOSING NEVER GRANTS. Only a settled payment may write `plan_id`, so the
    signup wizard can complete on a deployment that sells nothing.
  */
  it("records a choice without granting the plan", async () => {
    expect((await call("/api/billing.choose", { planId: "keeper" })).status).toBe(200);
    const after = await call("/api/billing.standing");
    expect(after.body.pendingPlanId).toBe("keeper");
    expect(after.body.planId).toBeUndefined();
    expect((after.body.entitlements as unknown as Record<string, { value: unknown }>).receiptsStored!.value).toBe(5);
  });

  /*
    ⚠️ A CORRUPT OVERRIDE BLOB MUST NOT TAKE THE WORKSPACE DOWN WITH IT. The
    column is JSON text, so anything that ever wrote it badly — a truncated
    write, an older shape, a hand edit during an incident — would otherwise
    throw inside the per-request resolution and 500 every route the workspace
    has, including the billing surface somebody would use to fix it.
  */
  it("falls back to no overrides rather than throwing on a malformed blob", async () => {
    await db().run(`UPDATE subscription SET grandfathered_json = ? WHERE tenant_id = ?`, "{not json", tenantId);
    /*
      ⚠️ READ IT BACK FIRST. A test whose setup silently wrote to the wrong
      database, or matched no row, asserts that a healthy path is healthy — which
      is a pass produced by nothing, and the failure mode this whole suite is
      about.
    */
    const stored = await db().first<{ g: string }>(`SELECT grandfathered_json AS g FROM subscription WHERE tenant_id = ?`, tenantId);
    expect(stored?.g).toBe("{not json");
    const res = await call("/api/billing.standing");
    expect(res.status).toBe(200);
    expect((res.body.entitlements as unknown as Record<string, { value: unknown }>).receiptsStored!.value).toBe(5);
    await db().run(`UPDATE subscription SET grandfathered_json = '{}' WHERE tenant_id = ?`, tenantId);
  });

  it("refuses a plan that is not in the catalogue", async () => {
    const res = await call("/api/billing.choose", { planId: "enterprise" });
    expect(res.status).toBe(404);
  });
});

/* ---------------------------------------------------------------- quota --- */

describe("a ceiling refuses, and says which one", () => {
  /*
    ⚠️ THE CEILING IS COUNTED, NOT MERELY REPORTED. `check` is pure so a tool
    catalogue can be filtered without a query, so it returns the obligation —
    and an obligation nothing discharges reads exactly like an enforced limit
    while refusing nothing at all.
  */
  it("allows what the parking plan includes and refuses the next one", async () => {
    for (let i = 0; i < 5; i++) {
      const made = await call("/api/receipt.create", { total: { minor: 100, currency: "EUR" }, issuedOn: "2026-01-10" });
      expect(made.status, `receipt ${i}`).toBe(200);
    }
    const over = await call("/api/receipt.create", { total: { minor: 100, currency: "EUR" }, issuedOn: "2026-01-11" });
    expect(over.status).toBe(402);
    expect(over.body.code).toBe("platform.quota_reached");
  });

  /*
    ⚠️ READING WHAT IS ALREADY STORED IS NEVER REFUSED. A ceiling that withheld
    a workspace's own records the moment it downgraded would be holding them
    hostage rather than withholding a product.
  */
  it("still lists and reads everything already stored", async () => {
    expect((await call("/api/receipt.list")).status).toBe(200);
    expect(((await call("/api/receipt.list")).body.rows as unknown as unknown[]).length).toBe(5);
  });

  it("leaves an ungated collection alone", async () => {
    for (let i = 0; i < 7; i++) {
      expect((await call("/api/note.create", { title: `note ${i}` })).status).toBe(200);
    }
  });
});

/* -------------------------------------------------------------- the exit --- */

describe("paying is a way out, never the only one", () => {
  /*
    ⚠️ THE `billing` LANE SURVIVES EVERY RUNG, and it has to. A workspace held
    read-only over an unpaid charge that cannot reach the surface where it would
    pay has no bottom rung — the only way out is a support conversation, and the
    ladder has quietly become a trap.
  */
  it("serves the billing surface to a workspace the gate has closed", async () => {
    await db().run(
      `UPDATE subscription SET plan_id = 'keeper', status = 'past_due', past_due_at = ? WHERE tenant_id = ?`,
      "2020-01-01T00:00:00.000Z", tenantId,
    );
    const shut = await call("/api/note.create", { title: "while blocked" });
    expect(shut.status, "an ordinary write must be refused, or this proves nothing").toBe(402);

    expect((await call("/api/billing.standing")).status).toBe(200);
    expect((await call("/api/billing.choose", { planId: "free" })).status).toBe(200);
    await db().run(`UPDATE subscription SET plan_id = NULL, status = 'none', past_due_at = NULL WHERE tenant_id = ?`, tenantId);
  });
});

/* --------------------------------------------------------- the other rail --- */

/**
 * WHAT THE WORKSPACE SELLS ITS OWN CUSTOMERS — the second rail, end to end.
 *
 * ⚠️ THE CAPABILITY IS WITHHELD BY A ROUTE, NOT BY A SCREEN. That is the whole
 * point of the rail: hiding a tab is not withholding anything, and a product
 * that only hides it ships a report every customer can fetch by asking for it
 * directly. `notes.digest` refuses before it reads.
 */
describe("what the workspace sells its own customers", () => {
  it("refuses the capability to somebody who holds no package", async () => {
    const res = await call("/api/notes.digest");
    expect(res.status).toBe(403);
  });

  it("refuses to sell a capability the manifest does not declare", async () => {
    const res = await call("/api/commerce.package.save", {
      id: "bogus", name: "Bogus", price: { minor: 100, currency: "EUR" },
      flags: { telepathy: true }, budgets: {}, oncePerCustomer: false,
    });
    expect(res.status).toBe(400);
  });

  /*
    ⚠️ REPORTED, NEVER REFUSED. A capability sold with no days for the scope that
    gates it resolves off anyway; the builder says so and the person decides,
    because a framework cannot know they are not staging a launch.
  */
  it("reports a package that contradicts itself, and still saves it", async () => {
    const res = await call("/api/commerce.package.save", {
      id: "empty", name: "Empty", price: { minor: 100, currency: "EUR" },
      flags: { digest: true }, budgets: {}, oncePerCustomer: false,
    });
    expect(res.status).toBe(200);
    expect((res.body.problems as unknown as { kind: string }[]).map((p) => p.kind)).toEqual(["flag_without_days"]);
  });

  it("grants a package and the capability starts answering", async () => {
    /*
      ⚠️ THE REPEATABLE PACKAGE IS SOLD FIRST, ON PURPOSE. It becomes the package
      that OPENS the row, so the row's own `package_id` is no longer the
      once-only one — which is the exact arrangement that made a shipping
      product's once-only check answer "never bought" forever. A test that grants
      the once-only package first cannot tell the two implementations apart.
    */
    await call("/api/commerce.package.save", {
      id: "topup", name: "Top up", price: { minor: 500, currency: "EUR" },
      flags: { digest: true }, budgets: { reading: 30 }, oncePerCustomer: false,
    });
    await call("/api/commerce.package.save", {
      id: "month", name: "A month", price: { minor: 900, currency: "EUR" },
      flags: { digest: true }, budgets: { reading: 30 }, oncePerCustomer: true,
    });

    const opened = await call("/api/commerce.grant", { subjectId: subject, packageId: "topup" });
    expect(opened.status).toBe(200);
    expect(opened.body.daysAdded).toBe(30);

    const digest = await call("/api/notes.digest");
    expect(digest.status).toBe(200);
  });

  it("queues a repeat purchase onto what is already running", async () => {
    const before = ((await call(`/api/commerce.capabilities?subjectId=${subject}`)).body.runway as unknown as { overall: number }).overall;
    await call("/api/commerce.grant", { subjectId: subject, packageId: "month" });
    const after = ((await call(`/api/commerce.capabilities?subjectId=${subject}`)).body.runway as unknown as { overall: number }).overall;
    expect(after).toBe(before + 30);
  });

  /*
    ⚠️ ANSWERED FROM THE GRANT LEDGER, NEVER FROM THE OPEN ROW. A repeat purchase
    folds into the row already open, so that row's package id is only ever the
    package that OPENED it — asking it answers "never bought" forever for
    everything after the first, and a once-only package stacks without limit.
  */
  it("refuses a second sale of a once-only package bought after the row was opened", async () => {
    const again = await call("/api/commerce.grant", { subjectId: subject, packageId: "month" });
    expect(again.status).toBe(409);
  });

  it("still allows a repeatable package after all of that", async () => {
    expect((await call("/api/commerce.grant", { subjectId: subject, packageId: "topup" })).status).toBe(200);
  });

  it("explains every answer, so a screen cannot promise what the route refuses", async () => {
    const caps = (await call(`/api/commerce.capabilities?subjectId=${subject}`)).body.flags as unknown as Record<string, { value: boolean; from: string }>;
    expect(caps.digest).toEqual({ value: true, from: "snapshot" });
  });

  /*
    ⚠️ THE INTERSECTION. A workspace cannot sell what it did not itself buy — so
    withdrawing the workspace's own entitlement withdraws it from every customer
    who was sold it, and says which entitlement did it.
  */
  it("withholds a sold capability when the workspace itself loses the entitlement", async () => {
    await db().run(`UPDATE subscription SET adjusted_json = ? WHERE tenant_id = ?`, JSON.stringify({ notes: false }), tenantId);
    expect((await call("/api/notes.digest")).status).toBe(403);
    const caps = (await call(`/api/commerce.capabilities?subjectId=${subject}`)).body.flags as unknown as Record<string, { from: string; blockedBy?: string }>;
    expect(caps.digest).toMatchObject({ value: false, from: "not_sold", blockedBy: "notes" });
    await db().run(`UPDATE subscription SET adjusted_json = '{}' WHERE tenant_id = ?`, tenantId);
  });
});

/* ----------------------------------------------------------------- tool --- */

describe("the assistant sees the same ceiling", () => {
  /*
    ⚠️ THE TOOL SURFACE IS THE ROUTE SURFACE MASKED BY THE CALLER, so a full
    ceiling must remove the operation from the catalogue too — otherwise the
    model is offered something whose first call fails, every time.
  */
  it("keeps offering an operation whose ceiling still has room", async () => {
    const tools = (await call("/api/tools.list")).body.tools as unknown as { name: string }[];
    expect(tools.map((t) => t.name)).toContain("note_create");
  });
});

/* --------------------------------------------------------- the storefront --- */

/**
 * ⚠️ THE SHELF AND THE GATE COUNT THE SAME THING. A preview that estimated usage
 * its own way would promise a downgrade that the very next write then refuses —
 * a surface that is not the mechanism, which is harder to see than a mechanism
 * with no surface, because everything renders.
 */
describe("the storefront is derived from what the gate enforces", () => {
  it("gives every plan a row per declared key, in the reader's words", async () => {
    const res = await call("/api/billing.plans", undefined, "");
    const plans = res.body.plans as unknown as { id: string; includes: { key: string; label: string; unlimited: boolean }[] }[];
    const free = plans.find((p) => p.id === "free")!;

    /* Every declared key, so two plans are columns of one table rather than two lists. */
    expect(free.includes.map((l) => l.key).sort()).toEqual(["notes", "receiptsStored", "storedBytes"]);
    expect(free.includes.find((l) => l.key === "receiptsStored")!.label).toBe("Receipts kept");
  });

  /* ⚠️ `-1` is read once, in the kernel. A renderer never sees it. */
  it("says unlimited rather than handing out a negative one", async () => {
    const plans = (await call("/api/billing.plans", undefined, "")).body.plans as unknown as
      { id: string; includes: { key: string; unlimited: boolean }[] }[];
    const keeper = plans.find((p) => p.id === "keeper")!;
    expect(keeper.includes.find((l) => l.key === "receiptsStored")!.unlimited).toBe(true);
  });

  it("names what moving up would gain", async () => {
    const res = await call("/api/market.preview?planId=keeper");
    const preview = res.body.preview as unknown as { gains: { key: string }[]; losses: unknown[]; strains: unknown[] };
    expect(preview.gains.map((g) => g.key)).toContain("receiptsStored");
    expect(preview.losses).toEqual([]);
  });

  /*
    ⚠️ AND IT NEVER REFUSES A MOVE. A storefront that blocked a downgrade would
    trap somebody on a plan they no longer want, which is the same shape as the
    rule that leaving is always allowed — so a strain is something it SAYS.
    This workspace sits exactly at the free plan's receipt ceiling, which is the
    boundary worth pinning: `at the limit` is not `over` it.
  */
  it("reports no strain at exactly the ceiling, and allows the move regardless", async () => {
    const preview = (await call("/api/market.preview?planId=free")).body.preview as unknown as
      { from: string | null; losses: { key: string }[]; strains: { key: string }[]; usage: Record<string, number> };

    /*
      ⚠️ THE COUNT IS REAL, AND IT IS THE GATE'S. Five receipts were written
      earlier in this file and refused at the sixth; the storefront reads the
      same counter, so a preview cannot promise room the next write denies.
    */
    expect(preview.usage.receiptsStored).toBe(5);

    /*
      ⚠️ `from` IS NULL AND THE COMPARISON IS AGAINST THE PARKING STATE, because
      choosing a plan RECORDS an intention and grants nothing — only the payment
      provider may stamp one. This deployment cannot take money at all, so the
      workspace is still parked, and `free` is exactly the parking values: moving
      there takes nothing away.
    */
    expect(preview.from).toBeNull();
    expect(preview.losses).toEqual([]);
    /* Five receipts against a ceiling of five: at the limit is not over it. */
    expect(preview.strains).toEqual([]);
    expect((await call("/api/billing.choose", { planId: "free" })).status).toBe(200);
  });

  it("404s a plan nobody sells rather than previewing nothing", async () => {
    expect((await call("/api/market.preview?planId=nope")).status).toBe(404);
  });

  /*
    ⚠️ THE OTHER RAIL, THE SAME CARD. A package that turns two things on is not a
    package with two features — it is a package with two of the declared set on,
    and a customer comparing packages has to be able to see the rest.
  */
  it("cards a package against every sellable flag, not only the ones it turns on", async () => {
    const packages = (await call("/api/commerce.packages")).body.packages as unknown as
      { id: string; includes: { key: string; label: string; on: boolean; scope?: string }[] }[];
    const one = packages[0]!;
    expect(one.includes.map((l) => l.key)).toEqual(Object.keys(hello.access.customerFlags));
    expect(one.includes[0]).toMatchObject({ label: "Rolled-up notes", scope: "reading" });
  });
});
