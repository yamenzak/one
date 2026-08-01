/**
 * PAYMENT PROVIDERS — how a tenant gets paid by its own customers.
 *
 * ── The decision this file encodes ──────────────────────────────────────────
 *
 * A tenant collects money from its customers on ITS OWN merchant account, with
 * ITS OWN provider, under its own name. The platform never holds the funds,
 * never holds a credential that can move them, never takes a cut it did not
 * agree, and is not the merchant of record for a single customer payment.
 *
 * That is a deliberate reversal of the obvious design (Stripe Connect), and the
 * reasons are worth stating because they are easy to forget once this looks
 * routine:
 *
 *   LIABILITY   A Connect platform signs up for losses from seller fraud and for
 *               negative balances on connected accounts. Here there is no such
 *               agreement to sign: the tenant's provider relationship is theirs.
 *   GEOGRAPHY   A Connect platform can only onboard sellers in the country set
 *               its own platform country allows. That silently excludes whole
 *               regions — a UAE platform onboarding a German coach is at best
 *               undocumented — and it is not a limit an app can engineer around.
 *               A tenant using their OWN local provider has no such matrix.
 *   CHOICE      Half the world's businesses are not on Stripe. Tap, Telr,
 *               PayTabs, Ziina, Network International, PayPal, a bank transfer,
 *               cash after a session — all are how real studios actually get
 *               paid, and none of them is reachable through one processor's
 *               marketplace product.
 *
 * ── Why this abstraction is small enough to survive ─────────────────────────
 *
 * Multi-gateway layers usually rot because they try to abstract CHARGING —
 * tokenization, 3-D Secure, SCA, retries, refunds — where every provider differs
 * and the union of their models is nobody's model.
 *
 * This one never charges anything. The platform only ever:
 *
 *   1. sends the customer to a URL the tenant owns, carrying OUR reference, and
 *   2. receives a signed notification saying what happened.
 *
 * Everything provider-specific is therefore confined to `verify`. Adding a
 * provider is one file and a registry entry; the grant path never changes.
 *
 * ── `manual` is a real provider, not a fallback ─────────────────────────────
 *
 * It returns no checkout URL and verifies nothing: the tenant confirms by hand.
 * That is what makes cash, bank transfer, and every gateway nobody has written
 * an adapter for work on the SAME code path as the automated ones — and it is
 * why an automated provider may degrade to it without a special case. A webhook
 * is an accelerator here, never the only route by which a customer who paid can
 * be given what they paid for.
 */

/** What a provider can do, so the app never offers what it cannot deliver. */
export interface ProviderCapabilities {
  /**
   * The provider can bill the customer again on its own schedule and tell us.
   * Gating on this is not cosmetic: a recurring package on a link-only provider
   * would take one payment and then silently never renew, which looks to the
   * customer like they were cut off and to the tenant like the app lost a sale.
   */
  recurring: boolean;
  /**
   * The provider reports refunds and disputes. When false the tenant has to
   * notice in their own dashboard, so the app must not imply it is watching.
   */
  refundEvents: boolean;
}

/**
 * What a verified notification MEANS, in the platform's vocabulary rather than
 * any provider's. One inbound request can carry several (a renewal that is also
 * the final instalment), hence the array.
 */
export type PaymentEvent =
  | {
      kind: "paid";
      /** Our own reference, round-tripped by the provider. See `reference`. */
      reference: string;
      /** What was ACTUALLY taken, which is not always what we asked for. */
      amountCents: number;
      currency: string;
      /** The provider's id for this payment — the idempotency key. */
      externalId: string;
    }
  | { kind: "renewed"; reference: string; amountCents: number; currency: string; externalId: string }
  | { kind: "refunded"; externalId: string }
  | { kind: "disputed"; externalId: string };

/** A tenant's stored configuration for one provider. Shapes vary; the registry
 *  entry validates its own. NEVER put a credential that can move money here —
 *  see `SAFE_CREDENTIALS` below. */
export type ProviderConfig = Record<string, string>;

export interface PaymentProvider {
  /** Stable id, stored on the tenant and on every purchase row. */
  id: string;
  /** What the tenant sees when choosing. */
  label: string;
  capabilities: ProviderCapabilities;
  /**
   * Where to send the customer, with our reference attached so the notification
   * can be matched back. `null` means there is nowhere to send them and the
   * tenant settles it out of band (`manual`).
   */
  checkoutUrl(cfg: ProviderConfig, ref: string, opts: { amountCents: number; currency: string }): string | null;
  /**
   * Turn ONE inbound request into zero or more meaning-bearing events.
   *
   * MUST verify authenticity before returning anything. Returning `[]` for an
   * unrecognised-but-authentic event is correct and expected; THROWING is how a
   * provider says "this was not really you", and the route answers 400.
   */
  verify(cfg: ProviderConfig, req: { body: string; headers: Headers }): Promise<PaymentEvent[]>;
  /** Human-readable setup steps, rendered in the tenant's settings screen. */
  setupSteps?: string[];
}

/**
 * The credential rule, enforced by `assertSafeConfig` and by a conformance test.
 *
 * A tenant may store a value that lets the platform VERIFY what their provider
 * says. A tenant may never store a value that lets the platform ACT as them.
 *
 * This is the whole security argument for this design over "paste your API
 * key". A webhook signing secret can confirm an event is genuine and nothing
 * else; a secret key can charge, refund, read every customer and change the
 * payout destination. Storing the second would make this database a vault of
 * live payment credentials for every tenant on the platform — one breach away
 * from every studio's merchant account, which is a strictly worse liability
 * than the Connect exposure this design exists to avoid.
 *
 * So the check is on the KEY NAME, deliberately crude and deliberately loud: it
 * is far better to reject a legitimately-named field and rename it than to let
 * one secret key through because the pattern was clever.
 */
const FORBIDDEN_CONFIG_KEY = /(^|_)(secret_key|api_key|apikey|private_key|token|password|bearer)($|_)/i;

/** Config keys that name a verification-only credential, allowed by exception. */
const SAFE_CREDENTIALS = new Set(["webhook_secret", "signing_secret", "webhook_signing_secret"]);

export function assertSafeConfig(cfg: ProviderConfig): void {
  for (const key of Object.keys(cfg)) {
    if (SAFE_CREDENTIALS.has(key)) continue;
    if (FORBIDDEN_CONFIG_KEY.test(key)) {
      throw new Error(
        `payment provider config may not hold "${key}": the platform stores credentials that VERIFY, never credentials that can ACT on a tenant's merchant account`,
      );
    }
  }
}

/**
 * A reference we can round-trip through a third party.
 *
 * Constrained to what the narrowest provider accepts — Stripe's
 * `client_reference_id` is alphanumerics, dashes and underscores, up to 200
 * chars, and **silently drops** a value it does not like. A silent drop is the
 * dangerous failure here: the customer pays, the notification arrives with no
 * reference, and nothing connects the payment to the person. So the reference
 * is generated to the strictest shape rather than validated per provider.
 */
export function isValidReference(ref: string): boolean {
  return /^[A-Za-z0-9_-]{1,200}$/.test(ref);
}

/** The registry. Apps compose it; the package ships the universal two. */
export class ProviderRegistry {
  private readonly byId = new Map<string, PaymentProvider>();

  constructor(providers: PaymentProvider[] = []) {
    for (const p of providers) this.register(p);
  }

  register(p: PaymentProvider): void {
    if (this.byId.has(p.id)) throw new Error(`duplicate payment provider "${p.id}"`);
    this.byId.set(p.id, p);
  }

  get(id: string): PaymentProvider | null {
    return this.byId.get(id) ?? null;
  }

  list(): PaymentProvider[] {
    return [...this.byId.values()];
  }

  /** Providers that can carry a recurring package. See `ProviderCapabilities`. */
  recurring(): PaymentProvider[] {
    return this.list().filter((p) => p.capabilities.recurring);
  }
}

/**
 * Settle-it-yourself. Cash, bank transfer, a card machine in the studio, or any
 * provider without an adapter yet.
 *
 * Deliberately first in the registry: it is the only provider guaranteed to work
 * in every country on the day a tenant signs up, and every automated provider
 * degrades to it when a notification does not arrive.
 */
export const manualProvider: PaymentProvider = {
  id: "manual",
  label: "Off-platform (cash, transfer, invoice)",
  capabilities: { recurring: false, refundEvents: false },
  checkoutUrl: () => null,
  verify: async () => [],
  setupSteps: [
    "Take payment however you normally do — cash, bank transfer, your own card machine.",
    "Mark the purchase as paid here, and their access starts immediately.",
  ],
};
