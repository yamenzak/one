/**
 * STRIPE PAYMENT LINKS — the tenant's own Stripe, with no key in our hands.
 *
 * The tenant creates a Payment Link in their own Stripe account, adds our URL as
 * a webhook endpoint there, and pastes us the endpoint's SIGNING SECRET. From
 * then on:
 *
 *   1. the customer is sent to `<their link>?client_reference_id=<our ref>`,
 *   2. Stripe fires `checkout.session.completed` at us with that reference,
 *   3. we verify the signature, match the reference, and grant.
 *
 * ── Why the signing secret is a safe thing to hold, and a key is not ────────
 *
 * A webhook signing secret only lets the holder DECIDE WHETHER A MESSAGE IS
 * GENUINE. It cannot create a charge, issue a refund, read a customer, or change
 * where money is paid out. If this table leaked, the worst an attacker could do
 * is forge a "paid" event for one tenant and give somebody free access to that
 * one studio — recoverable, bounded, and visible in the purchase log.
 *
 * A `sk_live_` key leaking is a different category of event entirely. That is
 * the whole reason this integration is shaped around Payment Links rather than
 * the far easier "paste your API key and we'll do the rest".
 *
 * ── The failure mode to design around ───────────────────────────────────────
 *
 * Stripe SILENTLY DROPS a `client_reference_id` it considers malformed: the
 * payment still succeeds and the event still arrives, just with no reference.
 * The customer has paid and nothing connects them to it. `isValidReference`
 * generates to Stripe's accepted shape so this should not happen — but "should
 * not" is not a guarantee across providers, so an unmatched paid event must
 * always land somewhere a human can see it rather than being dropped. That is
 * why `verify` returns the event with whatever reference it had: reconciliation
 * is the caller's job, and the caller has the tenant's purchase list.
 */

import type { PaymentEvent, PaymentProvider, ProviderConfig } from "./providers.js";

/** Constant-time compare, so a signature check cannot be narrowed by timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify a `Stripe-Signature` header against the raw body.
 *
 * Implemented here rather than pulled from a Stripe SDK because this package
 * must not depend on one: the whole point is that we never call Stripe's API.
 * The scheme is documented and stable — `t=<unix>,v1=<hmac-sha256 of "t.body">`.
 */
async function verifyStripeSignature(secret: string, body: string, header: string | null, nowMs: number): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  ) as Record<string, string>;
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;

  /**
   * Reject a stale signature. Without this, a single captured webhook could be
   * replayed forever to re-grant a package that was refunded years ago. Five
   * minutes matches Stripe's own recommended tolerance.
   */
  const ageSec = Math.abs(nowMs / 1000 - Number(t));
  if (!Number.isFinite(ageSec) || ageSec > 300) return false;

  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
  return timingSafeEqual(hex(mac), v1);
}

interface StripeEventShape {
  type?: string;
  data?: {
    object?: {
      id?: string;
      client_reference_id?: string | null;
      amount_total?: number | null;
      amount_paid?: number | null;
      currency?: string | null;
      subscription?: string | null;
      payment_intent?: string | null;
      metadata?: Record<string, string> | null;
      /** On `invoice.paid`, the line item carries the originating link's ref. */
      subscription_details?: { metadata?: Record<string, string> | null } | null;
    };
  };
}

/**
 * A renewal arrives as `invoice.paid`, which does NOT carry
 * `client_reference_id` — that lives on the Checkout Session, which only exists
 * for the first payment. Stripe copies a subscription's metadata onto its
 * invoices, so the reference is recovered from there. A tenant who set the link
 * up through our own instructions gets this for free; one who did not gets the
 * first payment automated and renewals landing as unmatched, which is exactly
 * the case `manual` exists to absorb.
 */
function referenceOf(o: NonNullable<NonNullable<StripeEventShape["data"]>["object"]>): string | null {
  return (
    o.client_reference_id ??
    o.metadata?.client_reference_id ??
    o.subscription_details?.metadata?.client_reference_id ??
    null
  );
}

export const stripeLinkProvider: PaymentProvider = {
  id: "stripe_link",
  label: "Stripe Payment Link (your own Stripe account)",
  capabilities: { recurring: true, refundEvents: true },

  checkoutUrl(cfg: ProviderConfig, ref: string): string | null {
    const link = cfg.payment_link?.trim();
    if (!link) return null;
    // Preserve any parameters the tenant already put on their link rather than
    // rebuilding the URL — a link may legitimately carry UTM tags or a prefilled
    // email, and clobbering them silently changes what they set up.
    const url = new URL(link);
    url.searchParams.set("client_reference_id", ref);
    return url.toString();
  },

  async verify(cfg: ProviderConfig, req: { body: string; headers: Headers }): Promise<PaymentEvent[]> {
    const secret = cfg.webhook_secret?.trim();
    // No secret configured is a REFUSAL, not an empty result: answering "nothing
    // happened" to an unverifiable request would let anyone who learns the URL
    // grant themselves packages on a half-configured tenant.
    if (!secret) throw new Error("stripe_link: no webhook secret configured");
    const ok = await verifyStripeSignature(secret, req.body, req.headers.get("stripe-signature"), Date.now());
    if (!ok) throw new Error("stripe_link: bad signature");

    const event = JSON.parse(req.body) as StripeEventShape;
    const o = event.data?.object;
    if (!o) return [];
    const externalId = o.id ?? "";
    const currency = (o.currency ?? "usd").toLowerCase();

    switch (event.type) {
      case "checkout.session.completed": {
        const reference = referenceOf(o);
        if (!reference) return [];
        return [{ kind: "paid", reference, amountCents: o.amount_total ?? 0, currency, externalId }];
      }
      case "invoice.paid": {
        const reference = referenceOf(o);
        if (!reference) return [];
        return [{ kind: "renewed", reference, amountCents: o.amount_paid ?? 0, currency, externalId }];
      }
      case "charge.refunded":
        return [{ kind: "refunded", externalId }];
      case "charge.dispute.created":
        return [{ kind: "disputed", externalId }];
      default:
        // Authentic but uninteresting. Explicitly NOT an error — a tenant may
        // point a broad endpoint at us and every unrelated event would 400.
        return [];
    }
  },

  setupSteps: [
    "In your own Stripe dashboard, create a Payment Link for this package at the price you want.",
    "Paste that link below.",
    "In Stripe, go to Developers → Webhooks → Add endpoint, and paste the endpoint URL shown below.",
    "Select the events: checkout.session.completed, invoice.paid, charge.refunded, charge.dispute.created.",
    "Copy the endpoint's Signing secret (it starts with whsec_) and paste it below.",
  ],
};
