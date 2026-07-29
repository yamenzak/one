/**
 * Inline checkout — a Sheet that mounts a Stripe Payment Element from a
 * client secret and confirms it in place (no hosted-page redirect). Reused by
 * both rails: the platform rail passes a plan/pack intent; the tenant rail
 * (Slice 3) passes the same shape plus `stripeAccount` for a direct charge on a
 * connected account.
 */

import { useEffect, useRef, useState } from "react";
import { Button, Sheet } from "@4dl/ui";
import { loadStripe, type StripeElements, type StripeInstance } from "./stripe.js";

export interface CheckoutIntent {
  clientSecret: string;
  publishableKey: string;
  /** Set for a direct charge on a connected account (tenant rail). */
  stripeAccount?: string;
  /**
   * `"setup"` when the client secret is a SetupIntent rather than a
   * PaymentIntent — which is what starting a free trial produces: the
   * subscription's first invoice is $0 and auto-paid, so there is nothing to
   * charge and Stripe asks only for a saved card. Confirming a setup secret with
   * `confirmPayment` is a Stripe.js integration error, so this drives the branch
   * below. Defaults to `"payment"` for every existing caller.
   */
  mode?: "payment" | "setup";
}

export function PaymentSheet({
  open,
  onClose,
  title,
  intent,
  submitLabel = "Pay",
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  intent: CheckoutIntent | null;
  submitLabel?: string;
  onSuccess: () => void;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stripeRef = useRef<StripeInstance | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !intent) return;
    let alive = true;
    setReady(false);
    setError(null);
    void (async () => {
      const stripe = await loadStripe(intent.publishableKey, intent.stripeAccount ? { stripeAccount: intent.stripeAccount } : undefined);
      if (!alive) return;
      if (!stripe) {
        setError("Couldn't load the secure payment form. Check your connection and try again.");
        return;
      }
      stripeRef.current = stripe;
      // Kova is dark by DEFAULT and light is the opt-in: applyMode() sets
      // data-theme="light" for light and DELETES the attribute for dark (there is
      // no `dark` class anywhere). Testing for "dark" therefore never matched, so
      // Stripe always got its light `stripe` theme — a white card form flashing
      // into a near-black sheet at the exact moment of payment. Invert the test:
      // anything that isn't explicitly light is dark.
      const dark = document.documentElement.dataset.theme !== "light";
      const elements = stripe.elements({ clientSecret: intent.clientSecret, appearance: { theme: dark ? "night" : "stripe" } });
      elementsRef.current = elements;
      const el = elements.create("payment");
      if (mountRef.current) el.mount(mountRef.current);
      setReady(true);
    })();
    return () => {
      alive = false;
      elementsRef.current = null;
      stripeRef.current = null;
    };
  }, [open, intent]);

  const pay = async () => {
    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripe || !elements || !intent || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Do NOT pass `clientSecret` here. The Elements instance above was created
      // WITH the client secret, and Stripe.js treats "client secret on Elements"
      // and "client secret at confirm time" (the deferred-intent flow) as two
      // different integrations — supplying both is an integration error, which
      // Stripe.js *throws* rather than returning as `{ error }`. That landed in the
      // catch below and reported itself as a connection problem, so a trial signup
      // failed with "check your connection" on a perfectly good connection.
      const args = {
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: "if_required" as const,
      };
      const setup = intent.mode === "setup";
      const res = setup ? await stripe.confirmSetup(args) : await stripe.confirmPayment(args);
      if (res.error) {
        setError(res.error.message ?? (setup ? "Couldn't save that card. Try another." : "Payment failed. Try another card."));
        return;
      }
      onSuccess();
    } catch (e) {
      // A throw here is a Stripe.js integration or transport failure, never a card
      // decline (declines come back as `res.error`). Surface what it actually said:
      // blaming the connection for a misconfiguration sends people to reset their
      // wifi while the real cause is a key or an intent mismatch. Only fall back to
      // the connectivity wording when the browser really is offline.
      const detail = e instanceof Error && e.message ? e.message : null;
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      setError(
        offline || !detail
          ? intent.mode === "setup"
            ? "Couldn't save your card. Check your connection and try again."
            : "Payment couldn't be completed. Check your connection and try again."
          : detail,
      );
      console.error("[PaymentSheet] confirm failed", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={title} footer={<Button size="lg" className="w-full" disabled={!ready || busy} onClick={() => void pay()}>
          {busy ? "Processing…" : submitLabel}
        </Button>}>
      <div className="space-y-4">
        <div ref={mountRef} className="min-h-[180px]" />
        {!ready && !error && <p className="text-sm text-muted-foreground">Loading secure payment form…</p>}
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <p className="text-xs text-muted-foreground">Payments are processed securely by Stripe.</p>
      </div>
    </Sheet>
  );
}
