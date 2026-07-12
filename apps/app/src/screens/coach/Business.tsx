/** Owner Business — tabbed: overview (plan + credits + AI usage), packages, staff. */

import { useEffect, useState } from "react";
import { Card, Badge, Skeleton, StatCard, SegmentedControl, Page, Stagger, Sparkles, CreditCard } from "@mossa/ui";
import { api } from "../../api.js";
import { useSession } from "../../session.js";
import { Staff } from "./Staff.js";
import { Packages } from "./Packages.js";

interface Billing { subscription: { planId: string; planName: string; status: string; comp: boolean }; balance: { balance: number; available: number }; packs: { id: string; name: string; credits: number; price_usd: number }[]; ledger: { delta: number; reason: string; at: number }[] }
interface AiUsage { usage: { feature: string; calls: number; credits: number }[] }
type Tab = "overview" | "packages" | "staff";

export function Business() {
  const { ctx } = useSession();
  const canSell = !!ctx?.entitlements?.features?.commerce; // packages = the commerce feature
  const [tab, setTab] = useState<Tab>("overview");
  // If a plan change dropped commerce, don't strand the user on a hidden tab.
  const activeTab = tab === "packages" && !canSell ? "overview" : tab;
  const options: { value: Tab; label: string }[] = [
    { value: "overview", label: "Overview" },
    ...(canSell ? [{ value: "packages" as Tab, label: "Packages" }] : []),
    { value: "staff", label: "Staff" },
  ];
  return (
    <div>
      <div className="mx-auto max-w-xl p-4 pb-0"><SegmentedControl options={options} value={activeTab} onChange={(v) => setTab(v as Tab)} /></div>
      {activeTab === "overview" && <Overview />}
      {activeTab === "packages" && <Packages />}
      {activeTab === "staff" && <Staff />}
    </div>
  );
}

function Overview() {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [aiUsage, setAiUsage] = useState<AiUsage["usage"]>([]);
  useEffect(() => {
    void api.get<Billing>("/api/billing").then(setBilling);
    void api.get<AiUsage>("/api/settings/ai-usage").then((r) => setAiUsage(r.usage)).catch(() => undefined);
  }, []);
  if (!billing) return <Skeleton className="m-4 h-64" />;

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <h1 className="text-2xl font-bold tracking-tight">Business</h1>
      <Stagger><StatCard label="Plan" icon={CreditCard} value={billing.subscription.planName} badge={<Badge tone={billing.subscription.status === "active" ? "success" : "warning"}>{billing.subscription.comp ? "Comped" : billing.subscription.status}</Badge>} /></Stagger>
      <Stagger><StatCard label="AI credits" icon={Sparkles} tone="primary" value={billing.balance.available.toLocaleString()} unit="available" badge={<Badge tone="neutral">1 credit = $0.001</Badge>} /></Stagger>

      {aiUsage.length > 0 && (
        <Stagger>
          <Card><h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI usage — last 30 days</h2>
            <div className="space-y-2 text-sm">{aiUsage.map((u) => <div key={u.feature} className="flex items-center justify-between"><span className="text-muted-foreground">{u.feature.replace(/-/g, " ")}</span><span className="numeral">{u.credits.toLocaleString()} cr <span className="text-muted-foreground">· {u.calls}×</span></span></div>)}</div>
          </Card>
        </Stagger>
      )}

      <Stagger>
        <Card><h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Credit packs</h2>
          <div className="space-y-2">{billing.packs.map((p) => <div key={p.id} className="flex items-center justify-between"><span>{p.name}</span><Badge tone="primary">${p.price_usd}</Badge></div>)}</div>
          <p className="mt-3 text-xs text-muted-foreground">Purchasing arrives with the Stripe phase.</p>
        </Card>
      </Stagger>

      {billing.ledger.length > 0 && (
        <Stagger>
          <Card><h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent credit activity</h2>
            <div className="space-y-2 text-sm">{billing.ledger.slice(-8).reverse().map((e, i) => <div key={i} className="flex items-center justify-between"><span className="text-muted-foreground">{e.reason}</span><span className={`numeral ${e.delta >= 0 ? "text-success" : "text-danger"}`}>{e.delta >= 0 ? "+" : ""}{e.delta.toLocaleString()}</span></div>)}</div>
          </Card>
        </Stagger>
      )}
    </Page>
  );
}
