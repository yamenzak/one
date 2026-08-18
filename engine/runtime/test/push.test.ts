/**
 * A DEVICE IS SUBSCRIBED, TOLD, AND PRUNED — against a real database.
 *
 * ⚠️ THE DOOR A SUBSCRIPTION WAS MADE AT IS THE FACT THIS FILE EXISTS FOR. A
 * service worker belongs to ONE origin and every workspace here has its own, so
 * a subscription filed under one workspace can only ever show that workspace's
 * icon and open its links. Delivering across them produces a notification
 * wearing the wrong business's logo, pointing at a link that resolves nowhere —
 * and it is invisible to every other kind of test, because the send SUCCEEDS.
 *
 * ⚠️ AND `gone` IS PRUNED WHERE THE ANSWER IS. Sending is the only moment the
 * platform learns a subscription is dead; a sender that did not delete grows a
 * table of endpoints it retries for ever, and nothing anywhere reports it.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { applySchema } from "../src/schema.js";
import {
  PUSH_SCHEMA, dropSubscription, makePushKeys, pusherOver, subscribeDevice, subscriptionsOf,
  unsubscribeDevice, vapidOf,
} from "../src/push.js";
import { b64urlOf } from "../src/webpush.js";
import type { AccountId, TenantId } from "@engine/kernel";
import type { Db } from "../src/sql.js";

const db = () => env.SHARD_GLOBAL_1 as unknown as Db;

const SAM = "acc_sam" as AccountId;
const ALEX = "acc_alex" as AccountId;
const NORTHWIND = "tnt_northwind" as TenantId;
const SOUTHBY = "tnt_southby" as TenantId;

/**
 * ⚠️ A REAL P-256 POINT AND A REAL AUTH SECRET, because `subscribeDevice`
 * refuses an incomplete one and `send` would throw importing a fake key. What is
 * fake here is the push SERVICE, which is a `fetch` this test owns.
 */
async function aDevice(at: string): Promise<{ endpoint: string; p256dh: string; auth: string }> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return {
    endpoint: `https://push.example.com/x/${at}`,
    p256dh: b64urlOf(raw),
    auth: b64urlOf(crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)))),
  };
}

/*
  ⚠️ EVERY TEST BUILDS ITS OWN WORLD. The Workers pool rolls storage back between
  tests, so a fixture written in a `beforeAll` is one the next test cannot see —
  and an assertion against it passes for the wrong reason, which is how a
  mutation that broke the code under test survived here once.
*/
beforeEach(async () => {
  await applySchema(db(), [PUSH_SCHEMA]);
});

describe("the keypair", () => {
  it("is generated, and a second call refuses rather than replacing it", async () => {
    const first = await makePushKeys(db(), "https://one.example", false);
    expect(typeof first === "object" && first.publicKey.length).toBeGreaterThan(80);
    expect(await makePushKeys(db(), "https://one.example", false)).toBe("already_have_one");

    const held = await vapidOf(db());
    expect(held?.publicKey).toBe((first as { publicKey: string }).publicKey);
    expect(held?.subject).toBe("https://one.example");
  });

  /*
    ⚠️ A NEW KEYPAIR MAKES EVERY EXISTING SUBSCRIPTION UNDELIVERABLE — a browser
    subscribed TO the old public key — so the rows have to go with it. Left
    behind they are devices reported as reachable that answer 403 for ever, and
    the count on the console screen would be a lie about the fleet.
  */
  it("takes every subscription with it when it is replaced", async () => {
    await makePushKeys(db(), "https://one.example", false);
    await subscribeDevice(db(), SAM, NORTHWIND, await aDevice("phone"));
    expect(await subscriptionsOf(db(), SAM, NORTHWIND)).toHaveLength(1);

    await makePushKeys(db(), "https://one.example", true);
    expect(await subscriptionsOf(db(), SAM, NORTHWIND)).toHaveLength(0);
  });

  it("has no keypair before one is made, and says so rather than throwing", async () => {
    expect(await vapidOf(db())).toBeNull();
  });
});

describe("a subscription", () => {
  it("refuses one that arrives without its keys", async () => {
    const device = await aDevice("phone");
    expect(await subscribeDevice(db(), SAM, null, { ...device, p256dh: "" })).toBe("incomplete");
    expect(await subscribeDevice(db(), SAM, null, { ...device, auth: "" })).toBe("incomplete");
    expect(await subscribeDevice(db(), SAM, null, { ...device, endpoint: "not a url" }))
      .toBe("incomplete");
    /* ⚠️ AND ONE THAT IS NOT HTTPS. A push endpoint is always https; anything
       else is a row that can never be sent to. */
    expect(await subscribeDevice(db(), SAM, null, { ...device, endpoint: "http://push.example.com/x" }))
      .toBe("incomplete");
  });

  /* ⚠️ ONE ROW PER ENDPOINT. A browser hands back the same endpoint when it
     re-subscribes, and a page that does that on every load would otherwise leave
     another copy each time — one person told five times. */
  it("re-subscribing the same device updates in place", async () => {
    const device = await aDevice("phone");
    await subscribeDevice(db(), SAM, NORTHWIND, device);
    await subscribeDevice(db(), SAM, NORTHWIND, { ...device, auth: b64urlOf(new Uint8Array(16)) });

    const held = await subscriptionsOf(db(), SAM, NORTHWIND);
    expect(held).toHaveLength(1);
    expect(held[0]!.auth).toBe(b64urlOf(new Uint8Array(16)));
  });

  it("belongs to one person, and turning it off is scoped to them", async () => {
    const mine = await aDevice("mine");
    const theirs = await aDevice("theirs");
    await subscribeDevice(db(), SAM, NORTHWIND, mine);
    await subscribeDevice(db(), ALEX, NORTHWIND, theirs);

    /* ⚠️ Somebody else's endpoint, offered by the wrong account. */
    await unsubscribeDevice(db(), SAM, theirs.endpoint);
    expect(await subscriptionsOf(db(), ALEX, NORTHWIND)).toHaveLength(1);

    await unsubscribeDevice(db(), SAM, mine.endpoint);
    expect(await subscriptionsOf(db(), SAM, NORTHWIND)).toHaveLength(0);
  });
});

describe("which devices a note may travel on", () => {
  /*
    ⚠️ THIS IS THE ONE. A subscription made at Southby's door must not carry a
    note about Northwind: the service worker draws its OWN origin's `/icon.png`,
    so the notification would wear Southby's logo, and the link would open
    Southby. Both are wrong in a way that reads as a bug in the product.
  */
  it("never carries another workspace's door", async () => {
    await subscribeDevice(db(), SAM, NORTHWIND, await aDevice("north"));
    await subscribeDevice(db(), SAM, SOUTHBY, await aDevice("south"));

    const forNorth = await subscriptionsOf(db(), SAM, NORTHWIND);
    expect(forNorth).toHaveLength(1);
    expect(forNorth[0]!.endpoint).toContain("north");
  });

  /* ⚠️ THE ACCOUNT DOOR IS INCLUDED ON PURPOSE — it is OUR door, so it wears our
     mark and links into the person's own space, which is what a note reaching
     them there should look like. */
  it("carries the account door as well as the workspace's own", async () => {
    await subscribeDevice(db(), SAM, null, await aDevice("account"));
    await subscribeDevice(db(), SAM, NORTHWIND, await aDevice("north"));

    expect(await subscriptionsOf(db(), SAM, NORTHWIND)).toHaveLength(2);
    /* ⚠️ And a workspace with no device of its own still reaches the account. */
    expect(await subscriptionsOf(db(), SAM, SOUTHBY)).toHaveLength(1);
  });
});

describe("sending", () => {
  const answering = async (status: number, run: () => Promise<void>): Promise<string[]> => {
    const original = globalThis.fetch;
    const to: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      to.push(typeof input === "string" ? input : String(input));
      return new Response(null, { status });
    }) as typeof fetch;
    try { await run(); } finally { globalThis.fetch = original; }
    return to;
  };

  it("is not offered at all until there is a keypair", async () => {
    await subscribeDevice(db(), SAM, NORTHWIND, await aDevice("phone"));
    const pusher = pusherOver(db());
    expect(await pusher.live()).toBe(false);

    /* ⚠️ AND IT SENDS NOTHING RATHER THAN THROWING. A deployment that binds the
       lane before an operator has generated a keypair must lose push, not the
       write the note was a consequence of. */
    const tried = await answering(201, async () => {
      await pusher.push(SAM, { tenantId: NORTHWIND, title: "A note", link: "/space/inbox" });
    });
    expect(tried).toHaveLength(0);
  });

  it("reaches every device the workspace's door has", async () => {
    await makePushKeys(db(), "https://one.example", false);
    await subscribeDevice(db(), SAM, NORTHWIND, await aDevice("phone"));
    await subscribeDevice(db(), SAM, NORTHWIND, await aDevice("laptop"));
    await subscribeDevice(db(), SAM, SOUTHBY, await aDevice("other"));

    const pusher = pusherOver(db());
    expect(await pusher.live()).toBe(true);

    const sent = await answering(201, async () => {
      await pusher.push(SAM, { tenantId: NORTHWIND, title: "A note", link: "/space/inbox" });
    });
    expect(sent).toHaveLength(2);
    expect(sent.join(" ")).not.toContain("other");
  });

  /*
    ⚠️ A 410 IS A ROW TO DELETE AND IT IS DELETED HERE, because sending is the
    only moment the platform learns a subscription is dead. Anything else keeps
    retrying an uninstalled browser until somebody notices the bill.
  */
  it("prunes a device the push service says is gone", async () => {
    await makePushKeys(db(), "https://one.example", false);
    await subscribeDevice(db(), SAM, NORTHWIND, await aDevice("phone"));

    await answering(410, async () => {
      await pusherOver(db()).push(SAM, { tenantId: NORTHWIND, title: "A note", link: null });
    });
    expect(await subscriptionsOf(db(), SAM, NORTHWIND)).toHaveLength(0);
  });

  /* ⚠️ AND A FAILURE THAT IS NOT `gone` KEEPS THE ROW. Deleting on a 500 would
     unsubscribe somebody because a push service had a bad minute. */
  it("keeps a device the push service merely refused", async () => {
    await makePushKeys(db(), "https://one.example", false);
    await subscribeDevice(db(), SAM, NORTHWIND, await aDevice("phone"));

    await answering(500, async () => {
      await pusherOver(db()).push(SAM, { tenantId: NORTHWIND, title: "A note", link: null });
    });
    expect(await subscriptionsOf(db(), SAM, NORTHWIND)).toHaveLength(1);
  });

  it("drops a device by endpoint when it is pruned directly", async () => {
    const device = await aDevice("phone");
    await subscribeDevice(db(), SAM, NORTHWIND, device);
    await dropSubscription(db(), device.endpoint);
    expect(await subscriptionsOf(db(), SAM, NORTHWIND)).toHaveLength(0);
  });
});
