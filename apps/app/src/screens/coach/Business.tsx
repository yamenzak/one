/** Owner Business — tabbed: overview (plan + credits + AI usage), packages, staff. */

import { useEffect, useState } from "react";
import { Button, Card, Badge, StatCard, SegmentedControl, Page, Stagger, ChartCard, SectionHeader, IconBadge, cn, toneVar, Reveal, SkeletonStatGrid, SkeletonChart, SkeletonList, Sparkles, CreditCard, History, Plus, Minus, Store, AlertTriangle, ArrowRight, CheckCheck } from "@mossa/ui";
import { api } from "../../api.js";
import { useSession } from "../../session.js";
import { Staff } from "./Staff.js";
import { Packages } from "./Packages.js";

interface Billing {
  subscription: { planId: string; planName: string; status: string; comp: boolean; currentPeriodEnd?: string | null };
  balance: { balance: number; available: number };
  packs: { id: string; name: string; credits: number; price_usd: number }[];
  ledger: { delta: number; reason: string; at: number }[];
  stripeEnabled?: boolean;
  connect?: { connected: boolean; chargesEnabled: boolean; detailsSubmitted: boolean };
  clientBilling?: { lapsed: number; expiringSoon: number; active: number };
}

/** Owner dunning copy per delinquency state (comped tenants never see this). */
const DUNNING: Record<string, { title: string; body: string }> = {
  past_due: { title: "Payment failed", body: "We couldn't charge your card. Update it now to keep your studio running — your features stay on during the grace period." },
  suspended: { title: "Studio suspended", body: "Your subscription lapsed, so paid features are paused for you and your clients. Update payment to restore everything instantly." },
  unpaid: { title: "Payment overdue", body: "Your invoice is unpaid and features are limited. Update payment to restore full access." },
  canceled: { title: "Subscription canceled", body: "You're on the free plan. Resubscribe to bring back paid features for you and your clients." },
};
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
  const { ctx } = useSession();
  const isOwner = ctx?.active?.role === "owner";
  const canSell = !!ctx?.entitlements?.features?.commerce;
  const [billing, setBilling] = useState<Billing | null>(null);
  const [aiUsage, setAiUsage] = useState<AiUsage["usage"]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    void api.get<Billing>("/api/billing").then(setBilling);
    void api.get<AiUsage>("/api/settings/ai-usage").then((r) => setAiUsage(r.usage)).catch(() => undefined);
  }, []);
  // Hosted-redirect flows — Stripe returns the user right back to this page.
  const redirectTo = async (path: string, key: string) => {
    setBusy(key);
    try {
      const r = await api.post<{ url: string }>(path, { returnUrl: location.href });
      if (r.url) location.href = r.url;
    } catch { setBusy(null); }
  };
  const top = [...aiUsage].sort((a, b) => b.credits - a.credits).slice(0, 7);
  const maxCr = Math.max(...top.map((u) => u.credits), 1);
  const totalCr = aiUsage.reduce((n, u) => n + u.credits, 0);
  const totalCalls = aiUsage.reduce((n, u) => n + u.calls, 0);

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <h1 className="text-2xl font-bold tracking-tight">Business</h1>

      <Reveal loading={!billing} className="space-y-4" skeleton={
        <>
          <SkeletonStatGrid count={2} foot />
          <SkeletonChart height={140} />
          <SkeletonList card rows={4} thumb={0} />
          <SkeletonList card rows={5} thumb={32} />
        </>
      }>
        {billing && (
        <>
          {/* Dunning banner — the visible half of the me→tenant lifecycle. */}
          {!billing.subscription.comp && DUNNING[billing.subscription.status] && (
            <Stagger>
              <Card className="relative overflow-hidden border border-danger/30">
                <div className="pointer-events-none absolute -right-12 -top-14 size-44 rounded-full blur-3xl" style={{ backgroundColor: `color-mix(in oklch, ${toneVar.danger} 18%, transparent)` }} />
                <div className="relative flex items-start gap-3.5">
                  <div className="grid size-11 shrink-0 place-items-center rounded-2xl [&_svg]:size-[1.35rem]" style={{ backgroundColor: `color-mix(in oklch, ${toneVar.danger} 15%, transparent)`, color: toneVar.danger }}><AlertTriangle /></div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold tracking-tight" style={{ color: toneVar.danger }}>{DUNNING[billing.subscription.status]!.title}</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">{DUNNING[billing.subscription.status]!.body}</p>
                    {isOwner && billing.stripeEnabled && (
                      <Button size="sm" className="mt-3" style={{ backgroundColor: toneVar.danger }} disabled={busy === "portal"} onClick={() => void redirectTo("/api/billing/portal", "portal")}>
                        {busy === "portal" ? "Opening…" : "Update payment"} <ArrowRight />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            </Stagger>
          )}

          <Stagger className="grid grid-cols-2 gap-3">
            <StatCard stack label="Plan" value={billing.subscription.planName} icon={CreditCard} tone="primary"
              badge={<Badge tone={billing.subscription.status === "active" || billing.subscription.status === "trialing" ? "success" : billing.subscription.comp ? "neutral" : "danger"}>{billing.subscription.comp ? "Comped" : billing.subscription.status}</Badge>} />
            <StatCard stack label="AI credits" value={billing.balance.available.toLocaleString()} unit="left" icon={Sparkles} tone="warning"
              badge={<Badge tone="neutral">1 cr = $0.001</Badge>} />
          </Stagger>

          {/* Stripe Connect — sell packages to clients. */}
          {canSell && billing.connect && (
            <Stagger>
              <Card className="flex items-center gap-3.5">
                <div className="grid size-11 shrink-0 place-items-center rounded-2xl [&_svg]:size-[1.35rem]" style={{ backgroundColor: `color-mix(in oklch, ${toneVar.nutrition} 15%, transparent)`, color: toneVar.nutrition }}><Store /></div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold tracking-tight">Sell with Stripe</div>
                  <p className="text-sm text-muted-foreground">
                    {billing.connect.chargesEnabled ? "Connected — you can charge clients for packages." : billing.connect.connected ? "Finish onboarding to start accepting payments." : "Connect Stripe to sell packages to your clients."}
                  </p>
                </div>
                {billing.connect.chargesEnabled ? (
                  <Badge tone="success"><CheckCheck className="size-3.5" /> Live</Badge>
                ) : isOwner && billing.stripeEnabled ? (
                  <Button size="sm" variant="tonal" disabled={busy === "connect"} onClick={() => void redirectTo("/api/connect/onboard", "connect")}>{busy === "connect" ? "Opening…" : billing.connect.connected ? "Finish setup" : "Connect"}</Button>
                ) : (
                  <Badge tone="warning">Setup</Badge>
                )}
              </Card>
            </Stagger>
          )}

          {/* Client delinquency roll-up. */}
          {canSell && billing.clientBilling && (billing.clientBilling.lapsed > 0 || billing.clientBilling.expiringSoon > 0) && (
            <Stagger className="grid grid-cols-2 gap-3">
              <StatCard stack label="Lapsed access" value={String(billing.clientBilling.lapsed)} unit="clients" icon={AlertTriangle} tone="danger" />
              <StatCard stack label="Expiring ≤7d" value={String(billing.clientBilling.expiringSoon)} unit="clients" icon={History} tone="warning" />
            </Stagger>
          )}

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
        </>
        )}
      </Reveal>
    </Page>
  );
}
