/** Client Shop — marketplace packages, Stripe Connect buy, redeem codes. */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Badge, Field, Page, Stagger, IconBadge, ConfirmDialog, ArrowLeft, Ticket, Store, Reveal, SkeletonLine, SkeletonList } from "@mossa/ui";
import { api } from "../../api.js";

interface Pkg { id: string; name: string; description: string | null; one_time_price_cents: number | null; monthly_price_cents?: number | null; budgets: { feature: string; days: number }[]; visibility: string }
interface Sub { status: string; daysRemaining: number; autoRenew?: boolean }

export function Shop({ clientId, onBack }: { clientId: string; onBack: () => void }) {
  const [packages, setPackages] = useState<Pkg[] | null>(null);
  const [sub, setSub] = useState<Sub | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([api.get<{ packages: Pkg[] }>("/api/packages"), api.get<{ subscriptions: Sub[] }>(`/api/subscriptions?clientId=${clientId}`)]);
    setPackages(p.packages.filter((x) => x.visibility === "marketplace"));
    setSub(s.subscriptions.find((x) => x.status === "active") ?? null);
  }, [clientId]);
  useEffect(() => void load(), [load]);

  const redeem = async () => {
    setBusy(true); setMsg(null);
    try { const r = await api.post<{ daysAdded: number; feature: string }>("/api/redeem", { clientId, code }); setMsg(`${r.daysAdded} days of ${r.feature} access added.`); setCode(""); await load(); }
    catch (e) { setMsg(e instanceof Error && e.message.includes("not found") ? "That code isn't valid." : "Couldn't redeem that code."); }
    finally { setBusy(false); }
  };
  const buy = async (packageId: string) => {
    try { const r = await api.post<{ url: string }>("/api/connect/checkout", { clientId, packageId, returnUrl: location.href }); location.href = r.url; }
    catch { setMsg("Checkout isn't available yet — ask your coach to finish Stripe setup."); }
  };
  const cancelRenew = async () => {
    setBusy(true); setMsg(null);
    try { await api.post("/api/connect/cancel-subscription", { clientId }); setMsg("Auto-renew canceled — your access continues until it runs out."); await load(); }
    catch { setMsg("Couldn't cancel auto-renew."); }
    finally { setBusy(false); }
  };

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="secondary" onClick={onBack} aria-label="Back"><ArrowLeft /></Button>
        <h1 className="text-xl font-bold tracking-tight">Plans &amp; access</h1>
      </div>

      <Reveal loading={!packages} className="space-y-4" skeleton={
        <>
          <SkeletonList card rows={1} />
          <SkeletonList card rows={2} thumb={36} />
          <div className="space-y-3">
            <SkeletonLine w="6rem" h="xs" className="ml-1" />
            <SkeletonList card rows={3} thumb={44} />
          </div>
        </>
      }>
        {packages && (
        <>
      {sub && (
        <Card className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-sm text-muted-foreground">Current access</span>
            {sub.autoRenew && <div className="text-xs font-medium text-primary">Auto-renews monthly</div>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge tone={sub.daysRemaining <= 7 ? "warning" : "success"}>{sub.daysRemaining} days left</Badge>
            {sub.autoRenew && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmCancel(true)}>Cancel</Button>}
          </div>
        </Card>
      )}

      <Stagger>
        <Card className="space-y-3">
          <div className="flex items-center gap-2.5"><IconBadge icon={Ticket} tone="primary" size="sm" /><h2 className="font-semibold">Have a code?</h2></div>
          <div className="flex items-end gap-2">
            <Field label="Redeem code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="flex-1" />
            <Button disabled={code.length < 4 || busy} onClick={() => void redeem()}>Redeem</Button>
          </div>
          {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
        </Card>
      </Stagger>

      {packages.length > 0 && (
        <div className="space-y-3">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Packages</h3>
          {packages.map((p) => (
            <Stagger key={p.id}>
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><Store className="size-4 text-primary" /><span className="font-semibold">{p.name}</span></div>
                    {p.description && <div className="mt-0.5 text-sm text-muted-foreground">{p.description}</div>}
                    <div className="mt-2 flex flex-wrap gap-1">{p.budgets.map((b, i) => <Badge key={i} tone="activity">{b.days}d {b.feature}</Badge>)}</div>
                  </div>
                  <div className="numeral shrink-0 text-xl font-bold">{p.monthly_price_cents ? <span>${(p.monthly_price_cents / 100).toFixed(0)}<span className="text-sm font-medium text-muted-foreground">/mo</span></span> : p.one_time_price_cents ? `$${(p.one_time_price_cents / 100).toFixed(0)}` : <Badge tone="success">Free</Badge>}</div>
                </div>
                {p.monthly_price_cents ? (
                  <Button className="mt-4 w-full" onClick={() => void buy(p.id)}>Subscribe</Button>
                ) : p.one_time_price_cents ? (
                  <Button className="mt-4 w-full" onClick={() => void buy(p.id)}>Buy</Button>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">Ask your coach to add this to your account.</p>
                )}
              </Card>
            </Stagger>
          ))}
        </div>
      )}
        </>
        )}
      </Reveal>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel auto-renew?"
        description="Your access stays active until the current period runs out, then it won't renew. You can resubscribe anytime."
        confirmLabel="Cancel auto-renew"
        cancelLabel="Keep it"
        destructive
        onConfirm={() => void cancelRenew()}
      />
    </Page>
  );
}
