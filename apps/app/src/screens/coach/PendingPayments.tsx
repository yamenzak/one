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
  Button, Badge, Stagger, EmptyState, ConfirmDialog, Eyebrow, Group, Row, GroupNote,
  SkeletonHeader, SkeletonList, CircleCheck, AlertTriangle, Wallet,
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
  /* A skeleton in the real geometry, never a spinner (§7): a spinner throws the
     page away and rebuilds it, and this list sits above the payment setup, so
     the whole tab jumped when it resolved. */
  if (!rows) return <div className="space-y-2"><SkeletonHeader /><SkeletonList card rows={2} thumb={0} /></div>;

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CircleCheck}
        title="Nothing waiting"
        description="When a client starts a purchase you'll see it here until the money lands. Payments taken online clear on their own."
      />
    );
  }

  /*
    A LIST, NOT A STACK OF CARDS.

    Each purchase was a `Card` holding a three-part flex line and a full-width
    "Mark as paid" button under it — so five people waiting was five 120px boxes,
    each with its own primary-looking button, on a tab that is embedded inside
    another screen's column. As rows: who and what on the left, the amount in the
    value slot, and one verb on the right.

    It also no longer renders its own `Page`. It is a SECTION of the Getting-paid
    tab, which already supplies the column and the padding — the nested `Page`
    was adding a second `pb-28` in the middle of a scroll.
  */
  return (
    <section className="space-y-2">
      <Eyebrow action={<Badge tone="warning">{rows.length}</Badge>}>Waiting on payment</Eyebrow>
      <Stagger className="space-y-2">
        <Group>
          {rows.map((r) => (
            <Row
              key={r.id}
              icon={Wallet}
              iconTone="warning"
              sub={r.package_name ?? "Package"}
              trailing={
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="numeral text-body-lg">{fmtPrice(r.amount_cents)}</span>
                  {canConfirm && (
                    <Button size="sm" variant="tonal" onClick={() => setConfirming(r)}>Mark paid</Button>
                  )}
                </span>
              }
            >
              {r.client_name ?? "A client"}
            </Row>
          ))}
        </Group>
        <GroupNote>Confirm once the money has reached you — their access starts immediately.</GroupNote>
      </Stagger>

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
    </section>
  );
}
