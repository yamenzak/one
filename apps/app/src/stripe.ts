/**
 * Stripe.js loader — injects js.stripe.com/v3 once and hands back a configured
 * Stripe instance. We avoid the @stripe/stripe-js npm wrapper so there's no
 * build-time dependency on Stripe's CDN; the script loads at runtime in the
 * browser only when a checkout actually starts.
 *
 * `stripeAccount` lets the SAME publishable (platform) key drive INLINE Elements
 * for a direct charge on a connected Standard account — this is how the tenant
 * rail (Slice 3) does inline without collecting each tenant's publishable key.
 */

// Minimal structural types for the slice of Stripe.js we use (no npm types).
export interface StripeElements {
  create(type: "payment", options?: Record<string, unknown>): StripeElement;
  submit(): Promise<{ error?: { message?: string } }>;
}
export interface StripeElement {
  mount(target: HTMLElement): void;
  unmount(): void;
  destroy(): void;
}
export interface StripeInstance {
  elements(options: Record<string, unknown>): StripeElements;
  confirmPayment(opts: {
    elements: StripeElements;
    clientSecret?: string;
    confirmParams?: Record<string, unknown>;
    redirect?: "if_required" | "always";
  }): Promise<{ error?: { message?: string }; paymentIntent?: { status?: string } }>;
  /** Trials collect a card without charging it: a trialing subscription's first
   *  invoice is $0 and auto-paid, so Stripe issues a SetupIntent rather than a
   *  PaymentIntent. Confirming a setup client secret with `confirmPayment` is a
   *  Stripe.js integration error, so the sheet must branch on the intent mode. */
  confirmSetup(opts: {
    elements: StripeElements;
    clientSecret?: string;
    confirmParams?: Record<string, unknown>;
    redirect?: "if_required" | "always";
  }): Promise<{ error?: { message?: string }; setupIntent?: { status?: string } }>;
}
type StripeCtor = (publishableKey: string, options?: { stripeAccount?: string }) => StripeInstance;

let scriptPromise: Promise<StripeCtor | null> | null = null;

function loadScript(): Promise<StripeCtor | null> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve) => {
    const w = window as unknown as { Stripe?: StripeCtor };
    if (w.Stripe) return resolve(w.Stripe);
    const el = document.createElement("script");
    el.src = "https://js.stripe.com/v3";
    el.async = true;
    el.onload = () => resolve((window as unknown as { Stripe?: StripeCtor }).Stripe ?? null);
    el.onerror = () => { scriptPromise = null; resolve(null); }; // let a later attempt retry
    document.head.appendChild(el);
  });
  return scriptPromise;
}

/** Resolve a Stripe instance for `publishableKey` (optionally scoped to a
 *  connected account). Returns null if Stripe.js couldn't load. */
export async function loadStripe(publishableKey: string, opts?: { stripeAccount?: string }): Promise<StripeInstance | null> {
  const ctor = await loadScript();
  if (!ctor || !publishableKey) return null;
  return ctor(publishableKey, opts);
}
