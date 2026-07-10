/** Owner Business tab: plan + credits balance + packs (Stripe rails next). */

import { useEffect, useState } from "react";
import { Card, Chip, Skeleton, StatCard } from "@mossa/ui";
import { api } from "../../api.js";

interface Billing {
  subscription: { planId: string; planName: string; status: string; comp: boolean };
  balance: { balance: number; available: number };
  plans: { id: string; name: string; priceUsdMonth: number }[];
  packs: { id: string; name: string; credits: number; price_usd: number }[];
  ledger: { delta: number; reason: string; at: number }[];
}

interface AiUsage {
  usage: { feature: string; calls: number; credits: number }[];
}

export function Business() {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [aiUsage, setAiUsage] = useState<AiUsage["usage"]>([]);

  useEffect(() => {
    void api.get<Billing>("/api/billing").then(setBilling);
    void api.get<AiUsage>("/api/settings/ai-usage").then((r) => setAiUsage(r.usage)).catch(() => undefined);
  }, []);

  if (!billing) return <Skeleton className="m-4 h-64" />;

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <h1 className="text-2xl font-bold">Business</h1>

      <StatCard
        label="Plan"
        value={billing.subscription.planName}
        chip={
          <Chip tone={billing.subscription.status === "active" ? "good" : "warn"}>
            {billing.subscription.comp ? "Comped" : billing.subscription.status}
          </Chip>
        }
      />

      <StatCard
        label="AI credits"
        value={billing.balance.available.toLocaleString()}
        unit="available"
        chip={<Chip tone="neutral">1 credit = $0.001</Chip>}
      />

      {aiUsage.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-muted">AI usage — last 30 days</h2>
          <div className="space-y-2 text-sm">
            {aiUsage.map((u) => (
              <div key={u.feature} className="flex items-center justify-between">
                <span className="text-fg-muted">{u.feature.replace(/-/g, " ")}</span>
                <span className="numeral">
                  {u.credits.toLocaleString()} cr <span className="text-fg-muted">· {u.calls}×</span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-muted">Credit packs</h2>
        <div className="space-y-2">
          {billing.packs.map((p) => (
            <div key={p.id} className="flex items-center justify-between">
              <span>{p.name}</span>
              <Chip tone="primary">${p.price_usd}</Chip>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-fg-muted">Purchasing arrives with the Stripe phase — ask the platform admin for a top-up meanwhile.</p>
      </Card>

      {billing.ledger.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-muted">Recent credit activity</h2>
          <div className="space-y-2 text-sm">
            {billing.ledger.slice(-8).reverse().map((e, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-fg-muted">{e.reason}</span>
                <span className={e.delta >= 0 ? "numeral text-good" : "numeral text-bad"}>
                  {e.delta >= 0 ? "+" : ""}
                  {e.delta.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
