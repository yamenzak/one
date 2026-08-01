/**
 * PENDING PAYMENTS — the reconciliation list, and the safety net under the
 * whole payment rail.
 *
 * Every purchase opens as a pending row. Most of them settle on their own (the
 * provider tells us) and never appear here for long. What lands here and STAYS
 * is the set of cases the automation cannot close:
 *
 *   - a studio that takes money off-platform, which is every studio by default
 *   - a provider whose webhook was never finished, or was finished wrong
 *   - a payment whose reference the provider dropped, so nothing tied it to the
 *     person who paid
 *
 * That last one is why this screen exists at all rather than being a nicety. It
 * is the difference between "a client paid and the app quietly lost it" and "a
 * client paid and their coach can see it and fix it in one tap".
 */

import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Page,
  Stagger,
  EmptyState,
  Spinner,
  SectionHeader,
  ConfirmDialog,
  CircleCheck,
  AlertTriangle,
  Wallet,
} from "@4dl/ui";
import { api, errorText } from "../../api.js";
import { fmtPrice } from "../../money.js";

interface Pending {
  id: string;
  package_name: string | null;
  client_name: string | null;
  amount_cents: number;
  currency: string;
  provider: string;
  created_at: string;
  checkout_url: string | null;
}

export function PendingPayments({ canConfirm }: { canConfirm: boolean }) {
  const [rows, setRows] = useState<Pending[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r = await api.get<{ purchases: Pending[] }>("/api/purchases?status=pending");
      setRows(r.purchases);
    } catch (e) {
      setErr(errorText(e, "Couldn't load pending payments"));
    }
  };
  useEffect(() => { void load(); }, []);

  const confirm = async () => {
    if (!confirming) return;
    setBusy(true);
    try {
      await api.post(`/api/purchases/${confirming.id}/confirm`, {});
      setConfirming(null);
      await load();
    } catch (e) {
      setErr(errorText(e, "Couldn't confirm that payment"));
    } finally {
      setBusy(false);
    }
  };

  if (err) return <EmptyState icon={AlertTriangle} title="Couldn't load pending payments" description={err} action={<Button onClick={() => { setErr(null); void load(); }}>Try again</Button>} />;
  if (!rows) return <div className="grid place-items-center py-16"><Spinner /></div>;

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CircleCheck}
        title="Nothing waiting"
        description="When a client starts a purchase you'll see it here until the money lands. Payments taken online clear on their own."
      />
    );
  }

  return (
    <Page className="column space-y-4 pb-28">
      <SectionHeader title="Waiting on payment" />
      <p className="-mt-2 text-sm text-muted-foreground">Confirm once the money has reached you — their access starts immediately.</p>
      {rows.map((r) => (
        <Stagger key={r.id}>
          <Card className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-warning/12 text-warning [&_svg]:size-5"><Wallet /></div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold tracking-tight">{r.client_name ?? "A client"}</div>
                <p className="truncate text-sm text-muted-foreground">{r.package_name ?? "Package"}</p>
              </div>
              <div className="shrink-0 text-right font-semibold tabular-nums">{fmtPrice(r.amount_cents)}</div>
            </div>
            {canConfirm && (
              <Button size="sm" variant="tonal" className="w-full" onClick={() => setConfirming(r)}>
                Mark as paid
              </Button>
            )}
          </Card>
        </Stagger>
      ))}

      <ConfirmDialog
        open={!!confirming}
        onOpenChange={(o) => !o && setConfirming(null)}
        title="Confirm you've been paid?"
        // Named plainly because this is an assertion about money that cannot be
        // taken back by the app: the grant is immediate and the days are real.
        description={
          confirming
            ? `This gives ${confirming.client_name ?? "your client"} their access straight away. Only do it once ${fmtPrice(confirming.amount_cents)} has actually reached you.`
            : ""
        }
        confirmLabel={busy ? "Confirming…" : "Yes, I've been paid"}
        cancelLabel="Not yet"
        onConfirm={() => void confirm()}
      />
    </Page>
  );
}
