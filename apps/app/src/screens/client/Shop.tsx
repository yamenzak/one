/**
 * Client Shop (SPEC §7) — browse the tenant's marketplace packages, buy via
 * Stripe Connect (when configured), or redeem a code. Shows current access.
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Chip, Field, Skeleton } from "@mossa/ui";
import { api } from "../../api.js";

interface Pkg {
  id: string;
  name: string;
  description: string | null;
  one_time_price_cents: number | null;
  budgets: { feature: string; days: number }[];
  visibility: string;
}
interface Sub {
  status: string;
  daysRemaining: number;
}

export function Shop({ clientId, onBack }: { clientId: string; onBack: () => void }) {
  const [packages, setPackages] = useState<Pkg[] | null>(null);
  const [sub, setSub] = useState<Sub | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([
      api.get<{ packages: Pkg[] }>("/api/packages"),
      api.get<{ subscriptions: Sub[] }>(`/api/subscriptions?clientId=${clientId}`),
    ]);
    setPackages(p.packages.filter((x) => x.visibility === "marketplace"));
    setSub(s.subscriptions.find((x) => x.status === "active") ?? null);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const redeem = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.post<{ daysAdded: number; feature: string }>("/api/redeem", { clientId, code });
      setMsg(`✓ ${r.daysAdded} days of ${r.feature} access added.`);
      setCode("");
      await load();
    } catch (e) {
      setMsg(e instanceof Error && e.message.includes("not found") ? "That code isn't valid." : "Couldn't redeem that code.");
    } finally {
      setBusy(false);
    }
  };

  const buy = async (packageId: string) => {
    try {
      const r = await api.post<{ url: string }>("/api/connect/checkout", { clientId, packageId, returnUrl: location.href });
      location.href = r.url;
    } catch {
      setMsg("Checkout isn't available yet — ask your coach to finish Stripe setup.");
    }
  };

  if (!packages) return <Skeleton className="m-4 h-64" />;

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="grid size-10 place-items-center rounded-full bg-surface-2">←</button>
        <h1 className="text-xl font-bold">Plans &amp; access</h1>
      </div>

      {sub && (
        <Card className="flex items-center justify-between">
          <span className="text-sm text-fg-muted">Current access</span>
          <Chip tone="good">{sub.daysRemaining} days left</Chip>
        </Card>
      )}

      <Card className="space-y-3">
        <h2 className="font-semibold">Have a code?</h2>
        <div className="flex gap-2">
          <Field label="Redeem code" icon="🎟️" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="flex-1" />
          <Button disabled={code.length < 4 || busy} onClick={() => void redeem()}>Redeem</Button>
        </div>
        {msg && <p className="text-sm text-fg-muted">{msg}</p>}
      </Card>

      {packages.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold">Packages</h2>
          {packages.map((p) => (
            <Card key={p.id}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{p.name}</div>
                  {p.description && <div className="text-sm text-fg-muted">{p.description}</div>}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.budgets.map((b, i) => (
                      <Chip key={i} tone="activity">{b.days}d {b.feature}</Chip>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  {p.one_time_price_cents ? (
                    <div className="numeral text-xl font-bold">${(p.one_time_price_cents / 100).toFixed(0)}</div>
                  ) : (
                    <Chip tone="good">Free</Chip>
                  )}
                </div>
              </div>
              {p.one_time_price_cents ? (
                <Button className="mt-3 w-full" onClick={() => void buy(p.id)}>Buy</Button>
              ) : (
                <p className="mt-3 text-xs text-fg-muted">Ask your coach to add this to your account.</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
