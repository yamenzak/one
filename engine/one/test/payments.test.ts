/**
 * THE DEPLOYMENT'S OWN WIRING OF THE MONEY PATH.
 *
 * ⚠️ EVERY PIECE OF THIS IS TESTED SOMEWHERE ELSE AND THE ASSEMBLY IS NOT, which
 * is the failure this framework is a catalogue of. `applyEvent` routes; the
 * wallet holds; `becomeCommercial` opens the door. What decides that a paid
 * invoice grants the MONTH'S ALLOWANCE, that a pack id is looked up in THIS
 * deployment's catalogue, and that a legal name reaches the one-way door is
 * twenty lines in `one/src/index.ts` — and until this file existed, deleting any
 * of them left every suite green.
 *
 * ⚠️ AND IT GOES IN THROUGH THE DOOR, with a real signature over real bytes. A
 * test that called the ladder directly would prove the ladder, which is already
 * proved. What is in question is whether a request from Stripe reaches it.
 */

import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addShard, createTenant, noteShardApp, setConfig, subscriptionFor, tenantBySlug, walletOf,
  MEMBERSHIP, type Db,
} from "@engine/runtime";
import worker, { APPS, PACKS, PLANS } from "../src/index.js";

const directory = () => env.DIRECTORY as unknown as Db;

const SECRET = "whsec_one";
/* ⚠️ A SIGNING SECRET IS A CREDENTIAL, so it is stored encrypted and the worker
   needs the same key to read it back — see `config.ts`. A deployment that binds
   none can hold an address and cannot hold a key, which is a state this suite
   would otherwise be testing by accident. */
const CONFIG_SECRET = "config-secret-for-the-suite";
const asDev = {
  ...env, ROOT: "localhost", ENVIRONMENT: "development", AUTH_SECRET: "test", CONFIG_SECRET,
};

/** ⚠️ Signed the way Stripe signs — the bytes, and the timestamp in the mac. */
const signed = async (body: string, at: Date): Promise<string> => {
  const t = Math.floor(at.getTime() / 1000);
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
  const v1 = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${t},v1=${v1}`;
};

/* ⚠️ THE SIGNPOST, WHICH IS THE ONE ADDRESS THAT IS NOT A PLACE. A workspace's
   own hostname would move the endpoint when a workspace is renamed. */
const send = async (event: unknown) => {
  const body = JSON.stringify(event);
  const at = new Date();
  return worker.fetch(new Request("http://localhost:8080/webhook/stripe", {
    method: "POST",
    headers: { "stripe-signature": await signed(body, at) },
    body,
  }), asDev as never);
};

let id = "";

beforeAll(async () => {
  /* The worker applies its own schema on the first request. */
  await worker.fetch(new Request("http://localhost:8080/health"), asDev as never);
  await addShard(directory(), "eu-1", "eu", 100);
  for (const app of Object.keys(APPS)) await noteShardApp(directory(), "eu-1", app);
  /* ⚠️ WITHOUT A SECRET EVERY EVENT IS REFUSED, deliberately — the endpoint is
     public by construction, so an unsigned one is anybody claiming a payment
     landed. This is the deployment being configured, not a test fixture. */
  await setConfig(directory(), CONFIG_SECRET, "stripe.webhook_secret", SECRET);
});

beforeEach(async () => {
  for (const t of ["credit_ledger", "billing_account", "subscription", "stripe_event",
    "belongs", "tenant_app", "tenant"]) {
    await directory().exec(`DELETE FROM ${t};`);
  }
  const made = await createTenant(directory(), {
    slug: "harbour", name: "Harbour", country: "DE", where: "eu",
    apps: Object.keys(APPS) as never,
  });
  if (typeof made === "string") throw new Error(made);
  id = made.tenant.id;
});

describe("a payment reaching this deployment", () => {
  /* ⚠️ AN UNSIGNED EVENT IS ANYBODY CLAIMING A PAYMENT LANDED, and this endpoint
     accepts as many attempts as anybody likes. */
  it("refuses a body that is not signed", async () => {
    const res = await worker.fetch(new Request("http://localhost:8080/webhook/stripe", {
      method: "POST", body: JSON.stringify({ id: "evt_x", type: "invoice.paid", data: { object: {} } }),
    }), asDev as never);
    expect(res.status).toBe(400);
  });

  /*
    ⚠️ A PAID INVOICE IS A PERIOD BEGINNING, and this deployment's `paid` grants
    the month's allowance from the plan the workspace is actually on. Granting at
    checkout instead would give a workspace one month's credits and never a
    second — which nothing else in this repository would notice.
  */
  it("grants the month's allowance from the plan the workspace holds", async () => {
    const plan = PLANS.find((p) => p.id === "solo")!;

    expect((await send({
      id: "evt_1", type: "checkout.session.completed",
      data: { object: { customer: "cus_1", currency: "usd", metadata: { tenant: id, plan: plan.id } } },
    })).status).toBe(200);

    expect(await subscriptionFor(directory(), id as never, MEMBERSHIP))
      .toMatchObject({ planId: plan.id, status: "active" });
    /* ⚠️ In the ALLOWANCE, which is what a month grants — see `renewAllowance`. */
    expect(await walletOf(directory(), id as never))
      .toMatchObject({ granted: plan.credits, bought: 0 });

    /* ⚠️ AND THE SECOND MONTH ARRIVES AS AN INVOICE WITH NO METADATA OF OURS.
       Without the customer lookup every month after the first is unattributable
       — the workspace pays and goes past due anyway. */
    expect((await send({
      id: "evt_2", type: "invoice.paid", data: { object: { customer: "cus_1" } },
    })).status).toBe(200);
    expect(await walletOf(directory(), id as never))
      .toMatchObject({ granted: plan.credits });
  });

  /*
    ⚠️ THE PACK IS LOOKED UP IN THIS DEPLOYMENT'S CATALOGUE. What came back is an
    id; the credits behind it are ours. A count in the metadata would be a number
    that made a round trip through the customer's browser.
  */
  it("puts a bought pack's credits where a renewal cannot sweep them", async () => {
    const pack = PACKS[0]!;
    expect((await send({
      id: "evt_3", type: "checkout.session.completed",
      data: { object: { customer: "cus_2", currency: "usd", metadata: { tenant: id, pack: pack.id } } },
    })).status).toBe(200);

    /* ⚠️ In `bought`, never in the allowance. */
    expect(await walletOf(directory(), id as never))
      .toMatchObject({ bought: pack.credits, granted: 0 });
    /* ⚠️ AND IT IS NOT A PAYMENT. Falling through would mark a lapsed workspace
       up to date because somebody bought a thousand credits. */
    expect(await subscriptionFor(directory(), id as never, MEMBERSHIP)).toBeNull();
  });

  /* ⚠️ A PACK ID THIS DEPLOYMENT DOES NOT SELL GRANTS NOTHING, and answers 200 —
     Stripe cannot fix that by sending the same bytes again. */
  it("grants nothing for a pack it does not sell", async () => {
    expect((await send({
      id: "evt_4", type: "checkout.session.completed",
      data: { object: { customer: "cus_3", currency: "usd", metadata: { tenant: id, pack: "ghost" } } },
    })).status).toBe(200);
    expect(await walletOf(directory(), id as never)).toMatchObject({ bought: 0 });
  });

  /*
    ⚠️ BECOMING A BUSINESS COMES THROUGH THE SAME CHECKOUT, and the one-way door
    is opened by the money rather than by the request that started it. Two events
    would be a window in which somebody has paid for a business and does not have
    one.
  */
  it("makes the workspace a business on the payment that bought a commercial tier", async () => {
    const plan = PLANS.find((p) => p.kind === "commercial")!;
    expect((await send({
      id: "evt_5", type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_4", currency: "usd",
          metadata: { tenant: id, plan: plan.id, legalName: "Harbour GmbH" },
        },
      },
    })).status).toBe(200);

    const after = await tenantBySlug(directory(), "harbour");
    expect(after).toMatchObject({ kind: "commercial", legalName: "Harbour GmbH" });
    expect(await subscriptionFor(directory(), id as never, MEMBERSHIP))
      .toMatchObject({ planId: plan.id });
  });

  /*
    ⚠️ STRIPE RETRIES BY DESIGN, so an event applied twice is a month granted
    twice every time a delivery is slow. The idempotency is the row, and it is
    written before the work.
  */
  it("applies one event once, however many times it arrives", async () => {
    const pack = PACKS[0]!;
    const event = {
      id: "evt_6", type: "checkout.session.completed",
      data: { object: { customer: "cus_5", currency: "usd", metadata: { tenant: id, pack: pack.id } } },
    };
    await send(event);
    await send(event);
    expect(await walletOf(directory(), id as never)).toMatchObject({ bought: pack.credits });
  });

  /* ⚠️ AND AN EVENT NOBODY CAN PLACE IS PARKED, never dropped. Answered 200 with
     its id claimed, it is money captured with no trace that it happened. */
  it("parks an event it cannot attribute, and still answers 200", async () => {
    const res = await send({
      id: "evt_7", type: "invoice.paid", data: { object: { customer: "cus_nobody" } },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ did: "parked", why: "no_tenant" });
  });
});
