/**
 * ONE ADAPTER, AND IT ONLY PARSES.
 *
 * ⚠️ THE PROVIDER'S VOCABULARY STOPS HERE. Everything downstream reads a
 * `ProviderEvent`, so adding a second provider is a second file rather than a
 * second settlement path — and the second provider always arrives, because the
 * first one does not operate in some country a customer is in.
 *
 * vocabulary-exempt-file(invoice): the provider's own event-type strings, which
 * appear here and nowhere else — renaming them would be renaming somebody else's
 * wire protocol.
 *
 * It makes no decisions. Whose event it is, whether it has already been applied
 * and what it does to a subscription are all questions asked after this returns,
 * against a shape that carries no provider's words.
 */

import type { EventKind, ProviderEvent } from "./provider.js";

const KINDS: Readonly<Record<string, EventKind>> = {
  "checkout.session.completed": "paid",
  "invoice.paid": "paid",
  "invoice.payment_succeeded": "paid",
  "invoice.payment_failed": "failed",
  "customer.subscription.deleted": "cancelled",
  "charge.refunded": "refunded",
  "charge.dispute.created": "refunded",
};

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * ⚠️ AN UNKNOWN TYPE IS `other`, NOT A FAILURE. A provider adds event types
 * without asking, and a webhook that errors on one it does not recognise is a
 * webhook that starts retrying forever the day the provider ships a feature.
 * `other` is applied as a no-op and recorded, which is the difference between
 * ignoring something and losing it.
 */
export function parseStripeEvent(body: string, metadataPrefix: string): ProviderEvent | null {
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return null; }
  if (!parsed || typeof parsed !== "object") return null;

  const root = parsed as Record<string, unknown>;
  const id = str(root.id);
  const type = str(root.type);
  if (!id || !type) return null;

  const object = ((root.data as Record<string, unknown> | undefined)?.object ?? {}) as Record<string, unknown>;
  const metadata = (object.metadata ?? {}) as Record<string, unknown>;

  return {
    id,
    kind: KINDS[type] ?? "other",
    /*
      ⚠️ THE PREFIXED KEYS ARE READ AS WELL AS THE PLAIN ONES. A live account
      carries objects created by an older convention, and an event that fails to
      attribute because its metadata predates a rename is money that arrives and
      is parked — recoverable, but only because it was parked.
    */
    appId: str(metadata.app) ?? str(metadata[`${metadataPrefix}_app`]),
    tenantId: str(metadata.tenant) ?? str(metadata[`${metadataPrefix}_tenant`]),
    planId: str(metadata.plan) ?? str(metadata[`${metadataPrefix}_plan`]),
    /*
      ⚠️ THE SUBSCRIPTION IS NAMED WHERE WE MADE THE CHECKOUT, and it is the only
      attribution that survives a workspace not existing yet. Somebody pays and
      then closes the tab: there is no tenant to route by and no customer record
      to look up, so an event carrying only the customer would be parked — money
      taken with nothing granted, recoverable only by hand.
    */
    subscriptionRef: str(metadata.subscription) ?? str(metadata[`${metadataPrefix}_subscription`]),
    /* ⚠️ Which pack, where the payment was for credits rather than for access. */
    packId: str(metadata.pack) ?? str(metadata[`${metadataPrefix}_pack`]),
    customerRef: str(object.customer),
    paidMinor: num(object.amount_paid) || num(object.amount) || num(object.amount_total),
    refundedMinorTotal: num(object.amount_refunded),
  };
}
