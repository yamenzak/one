/**
 * SOMETHING TAKES A CARD.
 *
 * ⚠️ THE SIGNATURE IS THE WHOLE SECURITY OF THIS LANE. The endpoint is public by
 * construction — Stripe carries no session — so every property asserted here is
 * about what happens to a request that is NOT from Stripe: a forged one, a
 * replayed one, and one arriving at a deployment that cannot check.
 *
 * ⚠️ AND THE SECOND HALF IS THE MONEY. An event applied twice is a month granted
 * twice, and one that cannot be attributed is a payment captured against nothing
 * — both of which look like success from every angle except the ledger.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { TenantId } from "@engine/kernel";
import {
  BILLING_SCHEMA, CONFIG_SCHEMA, MEMBERSHIP, STRIPE_SCHEMA, applyEvent, applySchema, noteCustomer,
  parkedEvents, subscriptionFor, verifySignature, type Db, type Ladder,
} from "../src/index.js";

const db = () => env.DIRECTORY as unknown as Db;
const SECRET = "whsec_test";
const NOW = new Date("2026-08-17T12:00:00.000Z");

/** ⚠️ Signed the way Stripe signs, so the verifier is tested against the format
    rather than against itself. */
async function sign(raw: string, at: Date, secret = SECRET): Promise<string> {
  const t = Math.floor(at.getTime() / 1000);
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`));
  const v1 = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${t},v1=${v1}`;
}

/** What the ladder was asked to do, so the assertion is about the effect. */
const spy = () => {
  const did: string[] = [];
  const ladder: Ladder = {
    subscribe: async (t, a, p) => { did.push(`subscribe:${t}:${a}:${p}`); },
    paid: async (t, a) => { did.push(`paid:${t}:${a}`); },
    pastDue: async (t, a) => { did.push(`pastDue:${t}:${a}`); },
    cancelled: async (t, a) => { did.push(`cancelled:${t}:${a}`); },
    bought: async (t, pack, ref) => { did.push(`bought:${t}:${pack}:${ref}`); },
    becameBusiness: async (t, name) => { did.push(`business:${t}:${name}`); },
  };
  return { did, ladder };
};

const event = (id: string, type: string, object: Record<string, unknown>) =>
  ({ id, type, data: { object } });

beforeEach(async () => {
  await applySchema(db(), [CONFIG_SCHEMA, BILLING_SCHEMA, STRIPE_SCHEMA]);
  for (const t of ["stripe_event", "billing_account", "subscription"]) {
    await db().exec(`DELETE FROM ${t};`);
  }
});

describe("the signature", () => {
  it("accepts what Stripe actually signed", async () => {
    const raw = JSON.stringify({ id: "evt_1" });
    expect(await verifySignature(SECRET, await sign(raw, NOW), raw, NOW)).toBe(null);
  });

  /*
    ⚠️ A DEPLOYMENT THAT CANNOT VERIFY MUST NOT ACCEPT. Without this the endpoint
    is a way for a stranger to mark any workspace paid, and the only thing
    standing between the two is a row somebody may not have filled in yet.
  */
  it("refuses everything where no secret is stored", async () => {
    const raw = JSON.stringify({ id: "evt_1" });
    expect(await verifySignature(null, await sign(raw, NOW), raw, NOW)).toBe("no_secret");
  });

  it("refuses a forgery", async () => {
    const raw = JSON.stringify({ id: "evt_1" });
    expect(await verifySignature(SECRET, await sign(raw, NOW, "whsec_other"), raw, NOW))
      .toBe("wrong");
  });

  /*
    ⚠️ THE BODY IS COVERED, NOT JUST THE TIMESTAMP. A signature that verified
    against the header alone would let anybody replay one captured request with a
    different amount, a different customer, or a different workspace in it.
  */
  it("refuses a body that was edited after signing", async () => {
    const raw = JSON.stringify({ id: "evt_1", amount: 500 });
    const header = await sign(raw, NOW);
    const tampered = JSON.stringify({ id: "evt_1", amount: 50000 });
    expect(await verifySignature(SECRET, header, tampered, NOW)).toBe("wrong");
  });

  /* ⚠️ A CAPTURED REQUEST IS NOT VALID FOR EVER. Without the window, one
     intercepted webhook can be replayed for as long as the secret lives. */
  it("refuses one signed an hour ago", async () => {
    const raw = JSON.stringify({ id: "evt_1" });
    const old = new Date(NOW.getTime() - 60 * 60 * 1000);
    expect(await verifySignature(SECRET, await sign(raw, old), raw, NOW)).toBe("too_old");
  });

  it("refuses a header that is not one", async () => {
    const raw = JSON.stringify({ id: "evt_1" });
    expect(await verifySignature(SECRET, null, raw, NOW)).toBe("malformed");
    expect(await verifySignature(SECRET, "nonsense", raw, NOW)).toBe("malformed");
  });
});

describe("an event", () => {
  const TENANT = "ten_1" as TenantId;
  /**
   * ⚠️ THE MEMBERSHIP, AND IT IS WHAT EVERY EVENT DRIVES. The plan, the wallet
   * and the ladder are the workspace's, so there is nothing else an event could
   * be about — the `app` an event carries is ignored, deliberately, and the test
   * below pins that.
   */
  const APP = MEMBERSHIP;

  it("moves the workspace onto the plan it paid for", async () => {
    const { did, ladder } = spy();
    const out = await applyEvent(db(), event("evt_1", "checkout.session.completed", {
      customer: "cus_1", currency: "usd",
      metadata: { tenant: TENANT, plan: "team" },
    }), ladder, NOW);

    expect(out).toMatchObject({ did: "applied" });
    expect(did).toEqual([`subscribe:${TENANT}:${APP}:team`, `paid:${TENANT}:${APP}`]);
  });

  /*
    ⚠️ AND AN EVENT THAT NAMES A PRODUCT IS STILL THE WORKSPACE'S. `MEMBERSHIP`
    is the empty string, so when this parked on a missing `app` every plan
    checkout arrived carrying `app=""`, was read as absent, and was parked
    instead of granting the month somebody had just paid for. There is one
    membership; a product name on an event is noise, not attribution.
  */
  it("ignores whatever product an event claims to be about", async () => {
    const { did, ladder } = spy();
    const out = await applyEvent(db(), event("evt_app", "invoice.paid", {
      metadata: { tenant: TENANT, app: "beacon", plan: "team" },
    }), ladder, NOW);

    expect(out).toMatchObject({ did: "applied", appId: MEMBERSHIP });
    expect(did).toEqual([`paid:${TENANT}:${MEMBERSHIP}`]);
  });

  /*
    ⚠️ A PACK TAKES THE WHOLE BRANCH. Falling through to `paid` would mark a
    lapsed workspace up to date because somebody bought fifty credits — the
    ladder would clear the arrears and nothing would have been paid.
  */
  it("tops up for a pack, and does not call it a payment", async () => {
    const { did, ladder } = spy();
    const out = await applyEvent(db(), event("evt_pack", "checkout.session.completed", {
      customer: "cus_p", currency: "usd",
      metadata: { tenant: TENANT, pack: "p5" },
    }), ladder, NOW);

    expect(out).toMatchObject({ did: "applied" });
    expect(did).toEqual([`bought:${TENANT}:p5:evt_pack`]);
  });

  /*
    ⚠️ AND BECOMING A BUSINESS COMES THROUGH THE SAME CHECKOUT. The legal name
    travelled with the session, so the workspace's kind and its plan land from
    one signed event — two would be a window in which somebody has paid for a
    business and does not have one.
  */
  it("opens the one-way door on the payment that bought a commercial tier", async () => {
    const { did, ladder } = spy();
    await applyEvent(db(), event("evt_biz", "checkout.session.completed", {
      customer: "cus_b", currency: "usd",
      metadata: { tenant: TENANT, plan: "studio", legalName: "Eastwind GmbH" },
    }), ladder, NOW);

    expect(did).toEqual([
      `subscribe:${TENANT}:${APP}:studio`,
      `business:${TENANT}:Eastwind GmbH`,
      `paid:${TENANT}:${APP}`,
    ]);
  });

  /*
    ⚠️ STRIPE RETRIES BY DESIGN — that is what makes delivery reliable — so an
    event applied twice is a month granted twice, every time a delivery is slow.
  */
  it("is applied once, however many times it arrives", async () => {
    const it_ = event("evt_1", "invoice.paid", {
      customer: "cus_1", metadata: { tenant: TENANT, app: APP },
    });
    const { did, ladder } = spy();
    expect(await applyEvent(db(), it_, ladder, NOW)).toMatchObject({ did: "applied" });
    expect(await applyEvent(db(), it_, ladder, NOW)).toEqual({ did: "already" });
    expect(did).toEqual([`paid:${TENANT}:${APP}`]);
  });

  /*
    ⚠️ A RENEWAL CARRIES NO METADATA OF OURS. It was made by Stripe from a
    subscription months later, so without the customer lookup every month after
    the first is unattributable — the workspace pays and goes past due anyway.
  */
  it("is attributed by its customer when it carries nothing else", async () => {
    await noteCustomer(db(), TENANT, "cus_1", "usd", NOW);
    const { did, ladder } = spy();
    const out = await applyEvent(db(), event("evt_2", "invoice.paid", {
      customer: "cus_1", metadata: {},
    }), ladder, NOW);

    expect(out).toMatchObject({ did: "applied", tenantId: TENANT });
    expect(did).toEqual([`paid:${TENANT}:${APP}`]);
  });

  /*
    ⚠️ WHAT CANNOT BE PLACED IS RECORDED, AND THE ROW IS READABLE. Answered
    `200 {received: true}` with its id claimed, an unattributable event is money
    captured, nothing granted, and no trace anywhere — which is the failure this
    table exists for, not a hypothetical.
  */
  it("parks what it cannot place, where somebody can read it", async () => {
    const { did, ladder } = spy();
    const out = await applyEvent(db(), event("evt_3", "invoice.paid", {
      customer: "cus_unknown",
    }), ladder, NOW);

    expect(out).toEqual({ did: "parked", why: "no_tenant" });
    expect(did).toEqual([]);

    const parked = await parkedEvents(db());
    expect(parked.map((p) => [p.id, p.why])).toEqual([["evt_3", "no_tenant"]]);
  });

  /* ⚠️ A type we do not act on is recorded and NOT parked — a dead letter full
     of events nobody ever meant to handle is one nobody reads. */
  it("records what it ignores without calling it a fault", async () => {
    const { ladder } = spy();
    expect(await applyEvent(db(), event("evt_4", "customer.updated", {}), ladder, NOW))
      .toEqual({ did: "ignored" });
    expect(await parkedEvents(db())).toHaveLength(0);
  });

  it("marks a failed payment past due, and a cancellation cancelled", async () => {
    const { did, ladder } = spy();
    await applyEvent(db(), event("evt_5", "invoice.payment_failed", {
      metadata: { tenant: TENANT, app: APP },
    }), ladder, NOW);
    await applyEvent(db(), event("evt_6", "customer.subscription.deleted", {
      metadata: { tenant: TENANT, app: APP },
    }), ladder, NOW);
    expect(did).toEqual([`pastDue:${TENANT}:${APP}`, `cancelled:${TENANT}:${APP}`]);
  });

  /*
    ⚠️ AND THE LADDER REALLY MOVES THE ROW. Every test above watches a spy, which
    proves the routing and nothing about the effect — so one goes all the way
    through the real writes.
  */
  it("moves the real subscription row, end to end", async () => {
    const { subscribe, markPaid, markPastDue, markCancelled } =
      await import("../src/billing.js");
    const real: Ladder = {
      subscribe: (t, a, p) => subscribe(db(), t, a, p, "active", NOW),
      paid: (t, a) => markPaid(db(), t, a),
      pastDue: (t, a) => markPastDue(db(), t, a, NOW),
      cancelled: (t, a) => markCancelled(db(), t, a),
      bought: async () => undefined,
      becameBusiness: async () => undefined,
    };

    await applyEvent(db(), event("evt_7", "checkout.session.completed", {
      customer: "cus_2", currency: "usd",
      metadata: { tenant: TENANT, app: APP, plan: "team" },
    }), real, NOW);
    expect(await subscriptionFor(db(), TENANT, APP))
      .toMatchObject({ planId: "team", status: "active" });

    await applyEvent(db(), event("evt_8", "invoice.payment_failed", {
      metadata: { tenant: TENANT, app: APP },
    }), real, NOW);
    expect(await subscriptionFor(db(), TENANT, APP))
      .toMatchObject({ status: "past_due", pastDueAt: NOW.toISOString() });

    /* ⚠️ CANCELLING CLEARS THE ANCHOR. A workspace that chose to stop has no
       arrears, and leaving the date on would start a countdown to erasure over
       a decision nobody disputed. */
    await applyEvent(db(), event("evt_9", "customer.subscription.deleted", {
      metadata: { tenant: TENANT, app: APP },
    }), real, NOW);
    expect(await subscriptionFor(db(), TENANT, APP))
      .toMatchObject({ status: "cancelled", pastDueAt: null });
  });

  /*
    ⚠️ AND THE MONEY REALLY REACHES THE WALLET. Every pack assertion above
    watches a spy; this one carries a signed event all the way to a balance,
    because the routing being right and the credits never arriving is exactly
    the failure a spy cannot see.
  */
  it("puts the credits in the wallet, end to end", async () => {
    const { openAccount, topUp, walletOf } = await import("../src/wallet.js");
    const PACK = { id: "p5", name: "5,000 credits", credits: 5_000, price: 4500, currency: "USD", order: 1 };
    await openAccount(db(), TENANT, "USD", NOW);

    const real: Ladder = {
      subscribe: async () => undefined,
      paid: async () => undefined,
      pastDue: async () => undefined,
      cancelled: async () => undefined,
      /* ⚠️ THE PACK IS LOOKED UP, NEVER READ OFF THE EVENT — a credit count in
         the metadata is a number that made a round trip through the browser. */
      bought: async (t, packId, ref) => {
        if (packId !== PACK.id) return;
        await topUp(db(), t, PACK.credits, PACK.name, { ref }, NOW);
      },
      becameBusiness: async () => undefined,
    };

    await applyEvent(db(), event("evt_10", "checkout.session.completed", {
      customer: "cus_3", currency: "usd",
      metadata: { tenant: TENANT, pack: "p5" },
    }), real, NOW);

    /* ⚠️ IN `bought`, NEVER IN `granted`. A pack that landed in the allowance
       would be swept away by the next renewal — a monthly confiscation of
       something bought with a card. */
    expect(await walletOf(db(), TENANT)).toMatchObject({ bought: 5_000, granted: 0 });

    /* ⚠️ AND A SECOND DELIVERY OF THE SAME EVENT BUYS NOTHING. Stripe retries by
       design, so without the event row this is 5,000 credits per retry. */
    await applyEvent(db(), event("evt_10", "checkout.session.completed", {
      customer: "cus_3", currency: "usd",
      metadata: { tenant: TENANT, pack: "p5" },
    }), real, NOW);
    expect(await walletOf(db(), TENANT)).toMatchObject({ bought: 5_000 });
  });
});
