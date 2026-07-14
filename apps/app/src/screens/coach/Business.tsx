/** Owner Business — tabbed: overview (plan + credits + AI usage), packages, staff. */

import { useEffect, useState } from "react";
import { Card, Badge, Skeleton, StatCard, SegmentedControl, Page, Stagger, ChartCard, SectionHeader, IconBadge, cn, toneVar, Sparkles, CreditCard, History, Plus, Minus } from "@mossa/ui";
import { api } from "../../api.js";
import { useSession } from "../../session.js";
import { Staff } from "./Staff.js";
import { Packages } from "./Packages.js";

interface Billing { subscription: { planId: string; planName: string; status: string; comp: boolean }; balance: { balance: number; available: number }; packs: { id: string; name: string; credits: number; price_usd: number }[]; ledger: { delta: number; reason: string; at: number }[] }
interface AiUsage { usage: { feature: string; calls: number; credits: number }[] }
type Tab = "overview" | "packages" | "staff";

const featLabel = (f: string) => f.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

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

  const top = [...aiUsage].sort((a, b) => b.credits - a.credits).slice(0, 7);
  const maxCr = Math.max(...top.map((u) => u.credits), 1);
  const totalCr = aiUsage.reduce((n, u) => n + u.credits, 0);
  const totalCalls = aiUsage.reduce((n, u) => n + u.calls, 0);

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <h1 className="text-2xl font-bold tracking-tight">Business</h1>

      <Stagger className="grid grid-cols-2 gap-3">
        <StatCard stack label="Plan" value={billing.subscription.planName} icon={CreditCard} tone="primary"
          badge={<Badge tone={billing.subscription.status === "active" ? "success" : "warning"}>{billing.subscription.comp ? "Comped" : billing.subscription.status}</Badge>} />
        <StatCard stack label="AI credits" value={billing.balance.available.toLocaleString()} unit="left" icon={Sparkles} tone="warning"
          badge={<Badge tone="neutral">1 cr = $0.001</Badge>} />
      </Stagger>

      {top.length > 0 && (
        <Stagger>
          <ChartCard title="AI usage" icon={Sparkles} tone="warning" value={totalCr.toLocaleString()} unit="cr" delta={<Badge tone="neutral">30 days · {totalCalls} runs</Badge>}>
            <div className="space-y-2.5">
              {top.map((u) => (
                <div key={u.feature} className="min-w-0">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{featLabel(u.feature)}</span>
                    <span className="numeral shrink-0 text-muted-foreground">{u.credits.toLocaleString()} cr <span className="text-muted-foreground/60">· {u.calls}×</span></span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(4, (u.credits / maxCr) * 100)}%`, backgroundColor: toneVar.warning }} />
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>
        </Stagger>
      )}

      <Stagger>
        <Card className="space-y-3">
          <SectionHeader icon={CreditCard} tone="primary" title="Credit packs" />
          <div className="space-y-1.5">
            {billing.packs.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2.5">
                <div><div className="text-sm font-medium">{p.name}</div><div className="numeral text-xs text-muted-foreground">{p.credits.toLocaleString()} credits</div></div>
                <Badge tone="primary">${p.price_usd}</Badge>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Purchasing arrives with the Stripe phase.</p>
        </Card>
      </Stagger>

      {billing.ledger.length > 0 && (
        <Stagger>
          <Card className="space-y-3">
            <SectionHeader icon={History} tone="cardio" title="Recent credit activity" />
            <div className="divide-y divide-border/40">
              {billing.ledger.slice(-8).reverse().map((e, i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <IconBadge icon={e.delta >= 0 ? Plus : Minus} tone={e.delta >= 0 ? "success" : "danger"} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{e.reason}</span>
                  <span className={cn("numeral text-sm font-semibold", e.delta >= 0 ? "text-success" : "text-danger")}>{e.delta >= 0 ? "+" : ""}{e.delta.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </Card>
        </Stagger>
      )}
    </Page>
  );
}
