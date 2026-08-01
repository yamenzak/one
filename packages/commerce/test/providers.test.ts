/**
 * The payment-provider abstraction, and the two rules that make it safe.
 *
 * This layer replaces Stripe Connect. The platform no longer holds funds, no
 * longer signs a loss-liability agreement, and no longer decides which countries
 * a tenant may operate in — a tenant is paid on their own merchant account, by
 * their own provider. What the platform keeps is the ability to know a payment
 * happened, and that is the whole of what is tested here.
 *
 * Two properties carry the security of the design, so both are attacked rather
 * than merely exercised:
 *
 *   1. A stored credential can VERIFY but never ACT. If this rule slips, the
 *      database becomes a vault of live merchant credentials — a worse liability
 *      than the Connect exposure the design exists to avoid.
 *   2. An unverified request grants nothing. The webhook URL is effectively
 *      public, so a forged body, a wrong secret, a missing secret and a replayed
 *      capture must all fail closed.
 */

import { describe, expect, it } from "vitest";
import {
  assertSafeConfig,
  isValidReference,
  manualProvider,
  ProviderRegistry,
  stripeLinkProvider,
} from "../src/index.js";

const SECRET = "whsec_test_secret_value";

/** Sign a body the way Stripe does, so `verify` is tested against real input. */
async function sign(body: string, secret = SECRET, atMs = Date.now()): Promise<Headers> {
  const t = Math.floor(atMs / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
  const v1 = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return new Headers({ "stripe-signature": `t=${t},v1=${v1}` });
}

const paidBody = (ref: string | null) =>
  JSON.stringify({
    type: "checkout.session.completed",
    data: { object: { id: "cs_test_1", client_reference_id: ref, amount_total: 4999, currency: "USD" } },
  });

describe("a stored credential may verify, never act", () => {
  it("accepts a webhook signing secret — the whole point of the design", () => {
    expect(() => assertSafeConfig({ payment_link: "https://buy.stripe.com/x", webhook_secret: SECRET })).not.toThrow();
  });

  it.each(["secret_key", "api_key", "apikey", "private_key", "access_token", "password"])(
    "refuses to store %s",
    (key) => {
      // Each of these can charge, refund, or move money on the tenant's account.
      // Storing one turns this table into a vault of merchant credentials.
      expect(() => assertSafeConfig({ [key]: "sk_live_whatever" })).toThrow(/VERIFY, never/);
    },
  );

  it("refuses a prefixed or suffixed variant, not just the bare name", () => {
    expect(() => assertSafeConfig({ stripe_secret_key: "x" })).toThrow();
    expect(() => assertSafeConfig({ api_key_live: "x" })).toThrow();
  });
});

describe("the reference must survive a round trip through a third party", () => {
  it("accepts the shape every provider tolerates", () => {
    expect(isValidReference("sub_01HZY9ABC-xyz_2")).toBe(true);
  });

  it.each([
    ["a slash", "sub/1"],
    ["a space", "sub 1"],
    ["an empty string", ""],
    ["over 200 chars", "a".repeat(201)],
  ])("rejects %s", (_why, ref) => {
    // Stripe SILENTLY DROPS a malformed client_reference_id: the payment
    // succeeds and the event arrives with nothing tying it to the buyer. Failing
    // here is how that becomes impossible rather than merely unlikely.
    expect(isValidReference(ref)).toBe(false);
  });
});

describe("stripe_link only believes a genuinely signed request", () => {
  it("reads a correctly signed payment", async () => {
    const body = paidBody("sub_ref_1");
    const events = await stripeLinkProvider.verify({ webhook_secret: SECRET }, { body, headers: await sign(body) });
    expect(events).toEqual([
      { kind: "paid", reference: "sub_ref_1", amountCents: 4999, currency: "usd", externalId: "cs_test_1" },
    ]);
  });

  it("rejects a body that was altered after signing", async () => {
    const headers = await sign(paidBody("sub_ref_1"));
    // The attacker's goal: keep a valid signature, change who gets the package.
    const tampered = paidBody("sub_ref_ATTACKER");
    await expect(stripeLinkProvider.verify({ webhook_secret: SECRET }, { body: tampered, headers })).rejects.toThrow(/signature/);
  });

  it("rejects a signature made with a different tenant's secret", async () => {
    const body = paidBody("sub_ref_1");
    const headers = await sign(body, "whsec_some_other_tenant");
    await expect(stripeLinkProvider.verify({ webhook_secret: SECRET }, { body, headers })).rejects.toThrow(/signature/);
  });

  it("rejects a replayed capture", async () => {
    // Without a timestamp tolerance a single captured webhook could be replayed
    // forever to re-grant a package that was refunded long ago.
    const body = paidBody("sub_ref_1");
    const headers = await sign(body, SECRET, Date.now() - 10 * 60 * 1000);
    await expect(stripeLinkProvider.verify({ webhook_secret: SECRET }, { body, headers })).rejects.toThrow(/signature/);
  });

  it("REFUSES when no secret is configured, rather than reporting nothing happened", async () => {
    // The distinction matters: the webhook URL is effectively public, so a
    // half-configured tenant answering "[]" would let anyone who learns the URL
    // post whatever they liked and be told it was fine.
    const body = paidBody("sub_ref_1");
    await expect(stripeLinkProvider.verify({}, { body, headers: await sign(body) })).rejects.toThrow(/no webhook secret/);
  });

  it("ignores an authentic but unrelated event instead of erroring", async () => {
    // A tenant may point one broad endpoint at us. Erroring would make Stripe
    // retry every unrelated event forever and eventually disable the endpoint.
    const body = JSON.stringify({ type: "customer.created", data: { object: { id: "cus_1" } } });
    await expect(stripeLinkProvider.verify({ webhook_secret: SECRET }, { body, headers: await sign(body) })).resolves.toEqual([]);
  });

  it("drops a paid event carrying no reference, for the caller to reconcile", async () => {
    const body = paidBody(null);
    await expect(stripeLinkProvider.verify({ webhook_secret: SECRET }, { body, headers: await sign(body) })).resolves.toEqual([]);
  });

  it("recovers the reference from subscription metadata on a renewal", async () => {
    // `invoice.paid` has no client_reference_id — that only exists on the
    // Checkout Session for the FIRST payment. Stripe copies subscription
    // metadata onto invoices, which is the only way a renewal is attributable.
    const body = JSON.stringify({
      type: "invoice.paid",
      data: { object: { id: "in_1", amount_paid: 4999, currency: "usd", subscription_details: { metadata: { client_reference_id: "sub_ref_1" } } } },
    });
    const events = await stripeLinkProvider.verify({ webhook_secret: SECRET }, { body, headers: await sign(body) });
    expect(events).toEqual([{ kind: "renewed", reference: "sub_ref_1", amountCents: 4999, currency: "usd", externalId: "in_1" }]);
  });
});

describe("checkout URLs carry our reference without discarding the tenant's", () => {
  it("appends the reference", () => {
    const url = stripeLinkProvider.checkoutUrl({ payment_link: "https://buy.stripe.com/abc" }, "sub_ref_1", { amountCents: 4999, currency: "usd" });
    expect(url).toBe("https://buy.stripe.com/abc?client_reference_id=sub_ref_1");
  });

  it("keeps parameters the tenant already put on their link", () => {
    // A link may legitimately carry UTM tags or a prefilled email. Rebuilding
    // the URL would silently undo what they set up in their own dashboard.
    const url = stripeLinkProvider.checkoutUrl({ payment_link: "https://buy.stripe.com/abc?utm_source=ig" }, "r1", { amountCents: 100, currency: "usd" });
    expect(url).toContain("utm_source=ig");
    expect(url).toContain("client_reference_id=r1");
  });

  it("returns null when the tenant has not pasted a link yet", () => {
    expect(stripeLinkProvider.checkoutUrl({}, "r1", { amountCents: 100, currency: "usd" })).toBeNull();
  });
});

describe("manual is a real provider, not a fallback", () => {
  it("has nowhere to send the customer, and verifies nothing", async () => {
    expect(manualProvider.checkoutUrl({}, "r1", { amountCents: 100, currency: "usd" })).toBeNull();
    await expect(manualProvider.verify({}, { body: "{}", headers: new Headers() })).resolves.toEqual([]);
  });

  it("cannot carry a recurring package", () => {
    // Gating on this is not cosmetic: a subscription package here would take one
    // payment and never renew, which reads to the customer as being cut off.
    expect(manualProvider.capabilities.recurring).toBe(false);
  });
});

describe("the registry", () => {
  it("separates providers that can renew from those that cannot", () => {
    const reg = new ProviderRegistry([manualProvider, stripeLinkProvider]);
    expect(reg.recurring().map((p) => p.id)).toEqual(["stripe_link"]);
    expect(reg.list()).toHaveLength(2);
  });

  it("refuses a duplicate id", () => {
    // Two providers under one id means a purchase row's provider is ambiguous,
    // and the wrong `verify` would run against the other's config.
    const reg = new ProviderRegistry([manualProvider]);
    expect(() => reg.register(manualProvider)).toThrow(/duplicate/);
  });

  it("returns null for an unknown id rather than throwing", () => {
    // A row may name a provider that has since been removed; the caller decides
    // what to do about it, and it must not take down the whole webhook route.
    expect(new ProviderRegistry([]).get("gone")).toBeNull();
  });
});
