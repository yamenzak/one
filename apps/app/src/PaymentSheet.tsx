/**
 * Inline checkout — a Sheet that mounts a Stripe Payment Element from a
 * client secret and confirms it in place (no hosted-page redirect). Reused by
 * both rails: the platform rail passes a plan/pack intent; the tenant rail
 * (Slice 3) passes the same shape plus `stripeAccount` for a direct charge on a
 * connected account.
 */

import { useEffect, useRef, useState } from "react";
import { Button, Sheet } from "@mossa/ui";
import { loadStripe, type StripeElements, type StripeInstance } from "./stripe.js";

export interface CheckoutIntent {
  clientSecret: string;
  publishableKey: string;
  /** Set for a direct charge on a connected account (tenant rail). */
  stripeAccount?: string;
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
      // Mossa is dark by DEFAULT and light is the opt-in: applyMode() sets
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
      const res = await stripe.confirmPayment({
        elements,
        clientSecret: intent.clientSecret,
        confirmParams: { return_url: window.location.href },
        redirect: "if_required",
      });
      if (res.error) {
        setError(res.error.message ?? "Payment failed. Try another card.");
        return;
      }
      onSuccess();
    } catch {
      // A thrown confirmPayment (network/JS error) must never strand the button
      // on "Processing…" — surface a retryable error and fall through to finally.
      setError("Payment couldn't be completed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div ref={mountRef} className="min-h-[180px]" />
        {!ready && !error && <p className="text-sm text-muted-foreground">Loading secure payment form…</p>}
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <Button size="lg" className="w-full" disabled={!ready || busy} onClick={() => void pay()}>
          {busy ? "Processing…" : submitLabel}
        </Button>
        <p className="text-xs text-muted-foreground">Payments are processed securely by Stripe.</p>
      </div>
    </Sheet>
  );
}
