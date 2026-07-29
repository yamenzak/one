/** Owner Business — tabbed: overview (plan + credits + AI usage), packages, staff. */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Badge, SegmentedControl, Field, Sheet, SubCard, Page, Stagger, ChartCard, SectionHeader, Eyebrow, GlanceStrip, IconBadge, EmptyState, Spinner, cn, toneVar, Reveal, SkeletonStatGrid, SkeletonChart, SkeletonList, Wallet, Gauge, CreditCard, History, Plus, Minus, Store, AlertTriangle, ArrowRight, TrendingDown, CheckCheck, Check, Lock, Tag, TierAnchor, CountUp, Group, Row } from "@kova/ui";
import { FEATURE_KEYS, FEATURE_META, QUOTA_KEYS, QUOTA_META, type Entitlements } from "@kova/domain";
import { api, errorText } from "../../api.js";
import { useSession } from "../../session.js";
import { fmtPrice } from "../../money.js";
import { PaymentSheet, type CheckoutIntent } from "../../PaymentSheet.js";
import { Staff } from "./Staff.js";
import { Packages } from "./Packages.js";

/** `billingState` is the server's one honest answer to "is this studio paying for
 *  anything" — derived in `GET /billing`, never re-inferred here. `status` alone
 *  cannot answer it: a studio that never completed checkout sits at
 *  `plan_id: 'free', status: 'active'`, which reads as perfectly healthy. */
type BillingState = "comp" | "active" | "trialing" | "delinquent" | "pending" | "none";

interface Billing {
  subscription: {
    planId: string; planName: string; status: string; comp: boolean; currentPeriodEnd?: string | null;
    pendingPlanId?: string | null; pendingPlanName?: string | null; paidPlan?: boolean; billingState?: BillingState;
  };
  baseline?: { lockedFeatures: string[]; activeClientLimit: number; monthlyCredits: number };
  balance: { balance: number; purchased: number; granted: number; available: number };
  packs: { id: string; name: string; credits: number; price_usd: number }[];
  plans?: { id: string; name: string; priceUsdMonth: number; trialDays?: number | null }[];
  ledger: { delta: number; reason: string; at: number }[];
  stripeEnabled?: boolean;
  publishableKey?: string | null;
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

/** The plan row's caption. Never `${status} plan`: a studio that never
 *  finished checkout is `status: 'active'` on the free plan, and captioning that
 *  "active plan" is exactly the lie this pass exists to remove. */
const STATE_LABEL: Record<BillingState, string> = {
  comp: "Comped plan",
  active: "Active plan",
  trialing: "Free trial",
  delinquent: "Needs payment",
  pending: "Not activated",
  none: "No subscription",
};
interface AiUsage { usage: { feature: string; calls: number; credits: number }[] }
type Tab = "overview" | "packages" | "staff";

const featLabel = (f: string) => f.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Platform-rail catalog prices are stored in DOLLARS (`price_usd`,
 *  `priceUsdMonth`); everything display-side goes through `fmtPrice`, which takes
 *  cents — so a $24.50 pack renders "$24.50" instead of the raw "$24.5". */
const usdToCents = (usd: number) => Math.round((usd ?? 0) * 100);

/** Friendly copy for a `promo_<reason>` checkout error. */
function promoError(code: string): string {
  const reason = code.replace("promo_", "");
  return {
    not_found: "That promo code isn't valid.",
    inactive: "That promo code is no longer active.",
    expired: "That promo code has expired.",
    exhausted: "That promo code has been fully used.",
    wrong_package: "That code doesn't apply to this item.",
    wrong_client: "That code isn't available on your account.",
  }[reason] ?? "That promo code can't be applied.";
}

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
      <div className="column p-4 pb-0"><SegmentedControl options={options} value={activeTab} onChange={(v) => setTab(v as Tab)} /></div>
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
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(false);
    api.get<Billing>("/api/billing").then((b) => { if (alive) setBilling(b); }).catch(() => { if (alive) setError(true); });
    api.get<AiUsage>("/api/settings/ai-usage").then((r) => { if (alive) setAiUsage(r.usage); }).catch(() => undefined);
    return () => { alive = false; };
  }, [reloadKey]);
  // Hosted-redirect flows — Stripe returns the user right back to this page.
  const [flash, setFlash] = useState<string | null>(null);
  const redirectTo = async (path: string, key: string) => {
    setBusy(key);
    try {
      const r = await api.post<{ url: string }>(path, { returnUrl: location.href });
      if (r.url) location.href = r.url;
      // A 200 with no url should not leave the button spinning forever either.
      else { setBusy(null); setFlash("Stripe didn't return a link. Try again in a moment."); }
    } catch (e) {
      // This used to be `catch { setBusy(null) }` — the spinner stopped and
      // nothing was said, so "Connect" looked like a dead button. Stripe's own
      // message is what the owner needs: connecting fails on an account without
      // Connect enabled, and Stripe says exactly that.
      setBusy(null);
      setFlash(errorText(e, "Couldn't reach Stripe. Please try again."));
    }
  };
  // Inline (Payment Element) flows — no redirect; the Sheet confirms in place.
  const [checkout, setCheckout] = useState<{ intent: CheckoutIntent; title: string; label: string } | null>(null);
  const [packPromo, setPackPromo] = useState("");
  // `label` is a builder, not a string: the server may charge LESS than the list
  // price (a promo code is applied server-side before the PaymentIntent is
  // created), so the submit button has to be labelled from the amount the API
  // returns — never from the catalog price.
  const startInline = async (path: string, body: Record<string, unknown>, title: string, label: (amountCents: number | null) => string, key: string) => {
    setBusy(key);
    try {
      const r = await api.post<{ clientSecret?: string; publishableKey?: string; granted?: boolean; amountCents?: number; mode?: "payment" | "setup"; trialDays?: number | null }>(path, body);
      if (r.granted) { onPaid(); return; } // promo covered it fully — nothing to charge
      // `mode` MUST be forwarded. Starting a trial yields a SetupIntent, not a
      // PaymentIntent (the first invoice is $0), and confirming one with the other
      // is a Stripe.js integration error — so dropping this field makes the plan
      // buttons on every trial-bearing plan fail. When it is a trial the sheet is
      // collecting a card for later, not taking money, so relabel accordingly.
      if (r.clientSecret && r.publishableKey) {
        const setup = r.mode === "setup";
        const days = typeof r.trialDays === "number" ? r.trialDays : null;
        setCheckout({
          intent: { clientSecret: r.clientSecret, publishableKey: r.publishableKey, mode: r.mode ?? "payment" },
          title: setup && days ? `Start your ${days}-day free trial` : title,
          label: setup ? (days ? `Start ${days}-day free trial` : "Save card") : label(typeof r.amountCents === "number" ? r.amountCents : null),
        });
      }
      else setFlash("Couldn't start checkout — Stripe isn't fully configured yet.");
    } catch (e) {
      // Say what the SERVER said. "Please try again" was actively misleading on
      // the two failures that actually happen here — `plan not synced to stripe`
      // and `stripe not configured` — because retrying can never fix either, and
      // the reason was sitting in the response the whole time. Only genuinely
      // unrecognised failures get the generic line.
      const msg = e instanceof Error && e.message.startsWith("promo_")
        ? promoError(e.message)
        : errorText(e, "Couldn't start checkout. Please try again.");
      setFlash(msg);
    } finally { setBusy(null); }
  };
  const onPaid = () => {
    setCheckout(null);
    setFlash("Payment received — your balance updates in a moment.");
    // The webhook grants asynchronously; refetch now and again shortly after.
    setReloadKey((k) => k + 1);
    setTimeout(() => setReloadKey((k) => k + 1), 2500);
  };
  // Up vs down is derived from the CATALOG price, never from a hardcoded tier
  // order — the plan set is admin-editable and is being retuned right now.
  const [downgrade, setDowngrade] = useState<string | null>(null);
  const currentPrice = billing?.plans?.find((p) => p.id === billing.subscription.planId)?.priceUsdMonth ?? 0;
  const others = (billing?.plans ?? []).filter((p) => p.id !== billing?.subscription.planId);
  const upgrades = others.filter((p) => p.priceUsdMonth > currentPrice && p.priceUsdMonth > 0);
  const downgrades = others.filter((p) => p.priceUsdMonth < currentPrice);

  // Billing state, straight from the server (see BillingState). `?? "active"`
  // only covers an old cached response — never a re-derivation.
  const billingState: BillingState = billing?.subscription.billingState ?? "active";
  const isPending = billingState === "pending";
  const noSub = isPending || billingState === "none";
  const pendingPlanId = billing?.subscription.pendingPlanId ?? null;
  const pendingPlan = billing?.plans?.find((p) => p.id === pendingPlanId) ?? null;
  const pendingName = billing?.subscription.pendingPlanName ?? pendingPlan?.name ?? "That plan";
  // What the baseline costs them — from the server's effective entitlements, so
  // it can't drift from what's enforced.
  const baselineText = (() => {
    const b = billing?.baseline;
    if (!b) return null;
    const locked = b.lockedFeatures;
    /*
      NAME THE COUNT, NOT THREE OF THE NAMES.

      This used to read "AI suite, Body-fat camera, Supplements & labs and 1 more
      are locked" — a partial list ending in an opaque number, in a card sitting
      a few hundred pixels above "What's in your plan", which lists every one of
      them with a lock beside it. Half a list is worse than none: it costs three
      clauses and still sends you looking for the rest.
    */
    return [
      b.activeClientLimit >= 0 ? `${b.activeClientLimit} active client${b.activeClientLimit === 1 ? "" : "s"}` : null,
      b.monthlyCredits > 0 ? `${b.monthlyCredits.toLocaleString()} AI credits a month` : "no AI credits",
      locked.length ? `${locked.length} feature${locked.length === 1 ? "" : "s"} locked` : null,
    ].filter(Boolean).join(" · ");
  })();

  const top = [...aiUsage].sort((a, b) => b.credits - a.credits).slice(0, 7);
  const maxCr = Math.max(...top.map((u) => u.credits), 1);
  const totalCr = aiUsage.reduce((n, u) => n + u.credits, 0);
  const totalCalls = aiUsage.reduce((n, u) => n + u.calls, 0);

  return (
    <Page className="column space-y-4 p-4 pb-28">

      {error && !billing ? (
        <EmptyState icon={AlertTriangle} title="Couldn't load your business" description="Something went wrong. Check your connection and try again." action={<Button onClick={() => setReloadKey((k) => k + 1)}>Try again</Button>} />
      ) : (
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
          {/* T1 (§1). Overview's subject is what this studio has to spend. Credits
              are the number an owner checks, and the one that stops the AI suite
              dead when it hits zero — so it is the anchor rather than a tile in a
              grid of four. */}
          <TierAnchor className="flex flex-col items-center gap-1 pb-1 pt-1 text-center">
            <p className="text-caption text-muted-foreground">AI credits left</p>
            <p className="numeral text-display"><CountUp value={billing.balance.available} /></p>
            {/* Zero credits means two completely different things, and the screen
                used to say the actionable one in both cases: a studio whose plan
                doesn't include the AI suite was told to "top up", which would
                have bought credits it still couldn't spend. */}
            <p className="text-caption text-muted-foreground">
              {billing.balance.available > 0
                ? "across monthly and purchased"
                : ctx?.entitlements?.features?.aiSuite
                  ? "The AI suite is paused until you top up"
                  : "The AI suite isn't in your plan"}
            </p>
          </TierAnchor>
          {/* No live subscription. Distinct from dunning: a past-due studio HAS a
              subscription and a card to fix; this one is either sitting on the free
              baseline or holding a plan whose checkout never completed. The Shell
              bar says the same thing on every coach screen — this is where it gets
              resolved, so it carries the actual action. */}
          {noSub && (
            <Stagger>
              <Card className="relative overflow-hidden border border-danger/30">
                <div className="pointer-events-none absolute -right-12 -top-14 size-44 rounded-full blur-3xl" style={{ backgroundColor: `color-mix(in oklch, ${toneVar.danger} 18%, transparent)` }} />
                <div className="relative flex items-start gap-3.5">
                  <div className="grid size-11 shrink-0 place-items-center rounded-2xl [&_svg]:size-[1.35rem]" style={{ backgroundColor: `color-mix(in oklch, ${toneVar.danger} 15%, transparent)`, color: toneVar.danger }}><AlertTriangle /></div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold tracking-tight" style={{ color: toneVar.danger }}>
                      {isPending ? `${pendingName} was never activated` : "No subscription"}
                    </h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {isPending
                        ? `You picked ${pendingName} but the card step never completed, so nothing is being billed.`
                        : "Nothing is being billed for this studio."}
                      {" "}You're on Kova's free baseline{baselineText ? `: ${baselineText}.` : "."}
                    </p>
                    {isOwner && billing.stripeEnabled && isPending && pendingPlanId && (
                      <Button size="sm" className="mt-3" style={{ backgroundColor: toneVar.danger }} disabled={busy === `plan_${pendingPlanId}`} onClick={() => void startInline("/api/billing/plan-intent", { planId: pendingPlanId }, `Activate ${pendingName}`, () => `Subscribe · ${fmtPrice(usdToCents(pendingPlan?.priceUsdMonth ?? 0))}/mo`, `plan_${pendingPlanId}`)}>
                        {busy === `plan_${pendingPlanId}` ? "…" : "Finish setup"} <ArrowRight />
                      </Button>
                    )}
                    {/* "configured on this deployment" is a sentence for whoever
                        runs the servers, shown to whoever runs the gym. */}
                    {!billing.stripeEnabled && <p className="mt-2 text-xs text-muted-foreground">Card payments aren't switched on yet, so there's nothing to subscribe to right now.</p>}
                  </div>
                </div>
              </Card>
            </Stagger>
          )}

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

          {/* Headline glance — the PLAN only. The credit balance used to sit here
              too, which put the same number on screen twice: once as the anchor
              and once as a tile 300px below it. Third time this pattern has
              appeared during the rewrite (Today, Eat, here), and it always looks
              the same — the screen's own subject, restated smaller, reading as a
              second thought about the first one. */}
          {/* …and then this replaced it with a ONE-ITEM GlanceStrip, which is the
              same defect wearing a different component: a strip sets its value at
              24px/700 dead centre, so "Free" under "No subscription" read as a
              second hero on a tab that already has one. A strip is a comparison
              of three things; with one thing it is a hero. This is a row. */}
          {/* …and it only earns its place when nothing else has said it. With no
              subscription the red card directly above already names the plan AND
              its state, so this row made "No subscription" the third statement of
              the same fact on one screen (Shell bar, card, row). */}
          {!noSub && (
            <Stagger>
              <Group>
                <Row icon={CreditCard} sub={STATE_LABEL[billingState]}>
                  {billing.subscription.planName}
                </Row>
              </Group>
            </Stagger>
          )}

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

          {/* Client delinquency roll-up — card-less counts under a section label. */}
          {canSell && billing.clientBilling && (billing.clientBilling.lapsed > 0 || billing.clientBilling.expiringSoon > 0) && (
            <section className="space-y-2">
              <Eyebrow>Client billing</Eyebrow>
              <Stagger>
                <GlanceStrip items={[
                  { icon: AlertTriangle, tone: "danger", value: billing.clientBilling.lapsed, label: "Lapsed access" },
                  { icon: History, tone: "warning", value: billing.clientBilling.expiringSoon, label: "Expiring ≤ 7d" },
                ]} />
              </Stagger>
            </section>
          )}

          {top.length > 0 && (
            <Stagger>
              <ChartCard title="AI usage" icon={Gauge} tone="warning" value={totalCr.toLocaleString()} unit="cr" delta={<Badge tone="neutral">30 days · {totalCalls} runs</Badge>}>
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

          {ctx?.entitlements && (
            <Stagger><PlanFeatures ent={ctx.entitlements} /></Stagger>
          )}

          <section className="space-y-2">
            <Eyebrow>Credit packs</Eyebrow>
            <Stagger>
            <Card className="space-y-3">
              {/*
                Purchased credits never expire; the plan grant resets each period.
                THAT is the fact this line exists to teach, and it used to be
                three fragments — "0 purchased · 0 monthly · resets monthly" —
                where the only word carrying meaning ("resets") sat in a chip
                attached to nothing and repeated the word beside it.
              */}
              {/* Two lines, not one wrapped one: at phone width the inline
                  separator ended up stranded at the end of the first line,
                  pointing at nothing. */}
              <div className="space-y-0.5 text-xs text-muted-foreground">
                <div><span className="numeral font-medium text-foreground">{billing.balance.purchased.toLocaleString()}</span> bought — these never expire</div>
                <div><span className="numeral font-medium text-foreground">{billing.balance.granted.toLocaleString()}</span> from your plan — resets each month</div>
              </div>
              {isOwner && billing.stripeEnabled && (
                <Field label="Promo code (optional)" icon={Tag} value={packPromo} onChange={(e) => setPackPromo(e.target.value.toUpperCase())} placeholder="SUMMER20" />
              )}
              {/* The seeded pack names already read "1,000 credits", so the old
                  sub-line printed the name back at the owner. What's actually
                  worth comparing between packs is the rate, so that is the
                  sub-line — and it falls back to the count for a studio whose
                  packs are named something else.
                  The rate drops the word "credits" for the same reason: under a
                  row titled "1,000 credits", "1,000 credits per $1" reads as the
                  title stuttering rather than as a different number. */}
              <Group>
                {billing.packs.map((p) => {
                  const perDollar = p.price_usd > 0 ? Math.round(p.credits / p.price_usd) : null;
                  const named = p.name.includes(p.credits.toLocaleString());
                  return (
                    <Row
                      key={p.id}
                      icon={Wallet}
                      sub={perDollar ? `${perDollar.toLocaleString()} per $1` : named ? undefined : `${p.credits.toLocaleString()} credits`}
                      trailing={isOwner && billing.stripeEnabled ? (
                        <Button size="sm" variant="tonal" disabled={busy === `pack_${p.id}`} onClick={() => void startInline("/api/billing/pack-intent", { packId: p.id, promoCode: packPromo || undefined }, `Buy ${p.name}`, (cents) => `Pay ${fmtPrice(cents ?? usdToCents(p.price_usd))}`, `pack_${p.id}`)}>
                          {busy === `pack_${p.id}` ? "…" : fmtPrice(usdToCents(p.price_usd))}
                        </Button>
                      ) : (
                        <Badge tone="primary">{fmtPrice(usdToCents(p.price_usd))}</Badge>
                      )}
                    >
                      {p.name}
                    </Row>
                  );
                })}
              </Group>
              {!billing.stripeEnabled && <p className="text-xs text-muted-foreground">Card payments aren't switched on yet, so packs can't be bought right now.</p>}
            </Card>
            </Stagger>
          </section>

          {/* Plan subscribe / upgrade — inline (no redirect). Hidden for comped tenants. */}
          {isOwner && billing.stripeEnabled && !billing.subscription.comp && upgrades.length > 0 && (
            <section className="space-y-2">
              {/* Keyed on paidPlan, not status: a studio on the free baseline is
                  `status: 'active'`, and "Change plan" implies they have one. */}
              <Eyebrow>{billing.subscription.paidPlan ? "Change plan" : "Choose a plan"}</Eyebrow>
              <Stagger>
              <Card className="space-y-3">
                <div className="space-y-1.5">
                  {upgrades.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2.5">
                      <div><div className="text-sm font-medium">{p.name}</div><div className="numeral text-xs text-muted-foreground">{fmtPrice(usdToCents(p.priceUsdMonth))}/mo</div></div>
                      <Button size="sm" variant="tonal" disabled={busy === `plan_${p.id}`} onClick={() => void startInline("/api/billing/plan-intent", { planId: p.id }, `Subscribe to ${p.name}`, () => `Subscribe · ${fmtPrice(usdToCents(p.priceUsdMonth))}/mo`, `plan_${p.id}`)}>
                        {busy === `plan_${p.id}` ? "…" : "Select"}
                      </Button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Billed monthly. Plan credits refresh each period; unused plan credits don't roll over.</p>
              </Card>
              </Stagger>
            </section>
          )}

          {/* Move to a smaller plan. Deliberately NOT gated on stripeEnabled: the
              server can complete a downgrade with nothing to cancel, and the free
              plan (priceUsdMonth 0) belongs in this list — the upgrade list above
              filters it out, which used to mean an owner had no way down at all. */}
          {isOwner && !billing.subscription.comp && downgrades.length > 0 && (
            <section className="space-y-2">
              <Eyebrow>Move to a smaller plan</Eyebrow>
              <Stagger>
              <Card className="space-y-3">
                <div className="space-y-1.5">
                  {downgrades.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2.5">
                      <div><div className="text-sm font-medium">{p.name}</div><div className="numeral text-xs text-muted-foreground">{p.priceUsdMonth > 0 ? `${fmtPrice(usdToCents(p.priceUsdMonth))}/mo` : "Free"}</div></div>
                      <Button size="sm" variant="secondary" onClick={() => setDowngrade(p.id)}><TrendingDown /> Switch</Button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">We'll show you anything that needs sorting out first, and exactly what to do.</p>
              </Card>
              </Stagger>
            </section>
          )}

          {billing.ledger.length > 0 && (
            <section className="space-y-2">
              <Eyebrow>Recent credit activity</Eyebrow>
              <Stagger>
              <Card className="space-y-3">
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
            </section>
          )}
        </>
        )}
      </Reveal>
      )}

      {flash && <p className="text-center text-sm text-muted-foreground" role="status">{flash}</p>}
      {downgrade && (
        <DowngradeSheet
          planId={downgrade}
          onClose={() => setDowngrade(null)}
          onDone={(msg) => { setDowngrade(null); setFlash(msg); setReloadKey((k) => k + 1); }}
          onCheckout={(planId, planName, priceUsdMonth) => {
            setDowngrade(null);
            void startInline("/api/billing/plan-intent", { planId }, `Switch to ${planName}`, () => `Switch · ${fmtPrice(usdToCents(priceUsdMonth))}/mo`, `plan_${planId}`);
          }}
          onPortal={() => { setDowngrade(null); void redirectTo("/api/billing/portal", "portal"); }}
        />
      )}
      <PaymentSheet
        open={!!checkout}
        onClose={() => setCheckout(null)}
        title={checkout?.title ?? "Checkout"}
        intent={checkout?.intent ?? null}
        submitLabel={checkout?.label ?? "Pay"}
        onSuccess={onPaid}
      />
    </Page>
  );
}

// ── Downgrade checklist (SPEC §5) ──────────────────────────────────────────
// `POST /billing/downgrade-check` returns every dimension over the target plan's
// ceiling with the current number, the ceiling, how many must go, and where to go
// and fix it. Hard blockers refuse the change server-side; soft ones (storage)
// are shown as "worth clearing" and never stand in the way — the same rule
// `withinQuota` follows, where a quota only ever blocks the NEXT write.
//
// The submit path re-checks: the owner may have spent ten minutes archiving, so
// the numbers in this sheet are never the ones the decision is made on.

interface Blocker {
  key: string;
  kind: "quota" | "feature";
  label: string;
  hard: boolean;
  current: number;
  ceiling: number;
  removeCount: number;
  unit?: string;
  message: string;
  action?: { label: string; href: string };
}
interface DowngradeReport {
  planId: string;
  planName: string;
  priceUsdMonth: number;
  currentPlanName: string;
  currentPriceUsdMonth: number;
  eligible: boolean;
  clean: boolean;
  blockers: Blocker[];
}
type ChangeResult = DowngradeReport & { ok?: boolean; requiresCheckout?: boolean; requiresPortal?: boolean };

function DowngradeSheet({ planId, onClose, onDone, onCheckout, onPortal }: {
  planId: string;
  onClose: () => void;
  onDone: (message: string) => void;
  onCheckout: (planId: string, planName: string, priceUsdMonth: number) => void;
  onPortal: () => void;
}) {
  const nav = useNavigate();
  const [report, setReport] = useState<DowngradeReport | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const check = async (): Promise<void> => {
    setChecking(true); setLoadErr(false); setErr(null);
    try { setReport(await api.post<DowngradeReport>("/api/billing/downgrade-check", { planId })); }
    catch { setLoadErr(true); }
    finally { setChecking(false); }
  };
  // Fetch on open. `alive` so a sheet closed mid-flight can't commit.
  useEffect(() => {
    let alive = true;
    setLoadErr(false);
    api.post<DowngradeReport>("/api/billing/downgrade-check", { planId })
      .then((r) => { if (alive) setReport(r); })
      .catch(() => { if (alive) setLoadErr(true); });
    return () => { alive = false; };
  }, [planId]);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true); setErr(null);
    try {
      const r = await api.post<ChangeResult>("/api/billing/plan-change", { planId });
      if (r.requiresCheckout) { onCheckout(r.planId, r.planName, r.priceUsdMonth); return; }
      if (r.requiresPortal) { onPortal(); return; }
      onDone(`You're on ${r.planName} now.`);
    } catch (e) {
      // 409 downgrade_blocked carries a fresh report — show the CURRENT numbers
      // rather than the stale ones this sheet opened with.
      const body = (e as { body?: DowngradeReport & { error?: string } }).body;
      if (body?.error === "downgrade_blocked" && Array.isArray(body.blockers)) {
        setReport(body);
        setErr("Something changed while you were working — here's what's left.");
      } else {
        setErr(errorText(e, "Couldn't switch plans. Please try again."));
      }
    } finally { setSubmitting(false); }
  };

  const hard = (report?.blockers ?? []).filter((b) => b.hard);
  const soft = (report?.blockers ?? []).filter((b) => !b.hard);
  const fmtCeiling = (b: Blocker) => (b.ceiling < 0 ? "unlimited" : `${b.ceiling.toLocaleString()}${b.unit ? ` ${b.unit}` : ""}`);

  return (
    <Sheet open onClose={onClose} title={report ? `Switch to ${report.planName}` : "Switch plan"}>
      {loadErr && !report ? (
        <EmptyState icon={AlertTriangle} title="Couldn't check that plan" description="We couldn't reach the server to see whether you're ready to switch." action={<Button onClick={() => void check()}>{checking ? "Checking…" : "Try again"}</Button>} />
      ) : (
        <Reveal loading={!report} skeleton={<SkeletonList rows={3} />}>
          {report && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{report.currentPlanName}</span>
                <ArrowRight className="size-4" />
                <span className="font-medium text-foreground">{report.planName}</span>
                <span className="numeral ml-auto">{report.priceUsdMonth > 0 ? `${fmtPrice(usdToCents(report.priceUsdMonth))}/mo` : "Free"}</span>
              </div>

              {report.clean ? (
                <SubCard className="flex items-start gap-2.5">
                  <IconBadge icon={CheckCheck} tone="success" size="sm" />
                  <p className="text-sm">Everything fits on {report.planName}. Nothing to tidy up first.</p>
                </SubCard>
              ) : (
                <>
                  {hard.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        {hard.length === 1 ? "One thing" : `${hard.length} things`} to sort out before you can switch:
                      </p>
                      {hard.map((b) => (
                        <SubCard key={b.key} className="space-y-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-medium">{b.label}</span>
                            <span className="numeral shrink-0 text-xs text-muted-foreground">
                              {b.current.toLocaleString()}{b.unit ? ` ${b.unit}` : ""} · {report.planName} includes {fmtCeiling(b)}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">{b.message}</p>
                          {b.action && (
                            <Button
                              size="sm"
                              variant="tonal"
                              onClick={() => nav(b.key === "activeClients" ? `${b.action!.href}?free=${b.removeCount}` : b.action!.href)}
                            >{b.action.label} <ArrowRight /></Button>
                          )}
                        </SubCard>
                      ))}
                    </div>
                  )}
                  {soft.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">Worth knowing — {hard.length > 0 ? "these don't" : "this doesn't"} block the switch:</p>
                      {soft.map((b) => (
                        <SubCard key={b.key} className="space-y-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-medium">{b.label}</span>
                            <span className="numeral shrink-0 text-xs text-muted-foreground">
                              {b.current.toLocaleString()}{b.unit ? ` ${b.unit}` : ""} · includes {fmtCeiling(b)}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">{b.message}</p>
                          {b.action && <Button size="sm" variant="secondary" onClick={() => nav(b.action!.href)}>{b.action.label} <ArrowRight /></Button>}
                        </SubCard>
                      ))}
                    </div>
                  )}
                </>
              )}

              {err && <p className="text-sm text-warning" role="alert">{err}</p>}

              <div className="space-y-2">
                <Button size="lg" className="w-full" disabled={!report.eligible || submitting} onClick={() => void submit()}>
                  {submitting ? <><Spinner /> Switching…</> : report.eligible ? `Switch to ${report.planName}` : "Not ready yet"}
                </Button>
                <Button size="lg" variant="secondary" className="w-full" disabled={checking || submitting} onClick={() => void check()}>
                  {checking ? <><Spinner /> Re-checking…</> : "Re-check"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Nothing on your account changes until you switch, and we check again the moment you do.
              </p>
            </div>
          )}
        </Reveal>
      )}
    </Sheet>
  );
}

/** "What's in your plan" — every platform feature the tenant does / doesn't
 *  hold, plus the capacity quotas, rendered straight from the entitlement
 *  registry (FEATURE_META / QUOTA_META) so it can't drift from what's enforced.
 *  Reserved (unreleased) features are hidden. */
function PlanFeatures({ ent }: { ent: Entitlements }) {
  /*
    INCLUDED FIRST, LOCKED AFTER.

    The registry's own order interleaved them — ✓ Commerce, 🔒 AI suite, 🔒
    Body-fat, ✓ External food search, 🔒 Supplements, ✓ Front desk, 🔒 Branding —
    so "what do I actually have" could only be answered by reading all seven rows
    and sorting them in your head. Sorted, the card answers it in one glance and
    the locked run underneath becomes a single, honest upsell block.
  */
  const features = FEATURE_KEYS
    .filter((k) => !FEATURE_META[k]?.reserved)
    .slice()
    .sort((a, b) => Number(!!ent.features[b]) - Number(!!ent.features[a]));
  const included = features.filter((k) => ent.features[k]).length;
  const fmtQuota = (v: number) => (v < 0 ? "Unlimited" : v.toLocaleString());
  /** Singularise a quota unit so "1 seats" can't ship. Unlimited takes none —
   *  and neither does a quota whose LABEL already ends in the unit, which is
   *  what put "Staff seats / 10 seats" on screen. */
  const unitFor = (unit: string | undefined, v: number, label: string) => {
    if (!unit || v < 0) return "";
    if (label.toLowerCase().endsWith(unit.toLowerCase())) return "";
    return v === 1 && unit.endsWith("s") ? unit.slice(0, -1) : unit;
  };
  return (
    <Card className="space-y-3">
      <SectionHeader icon={CheckCheck} tone="success" title="What's in your plan" count={`${included} of ${features.length}`} />
      <div className="space-y-1">
        {features.map((k) => {
          const on = ent.features[k];
          const meta = FEATURE_META[k]!;
          return (
            <div key={k} className="flex items-start gap-2.5 rounded-lg px-1 py-1.5">
              <IconBadge icon={on ? Check : Lock} tone={on ? "success" : "neutral"} size="sm" />
              <div className="min-w-0 flex-1">
                <div className={cn("text-sm font-medium", !on && "text-muted-foreground")}>{meta.label}</div>
                <div className="text-xs text-muted-foreground">{meta.hint}</div>
              </div>
              {!on && <Badge tone="neutral">Locked</Badge>}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-border/40 pt-3">
        {QUOTA_KEYS.map((k) => {
          const label = QUOTA_META[k]?.label ?? k;
          const unit = unitFor(QUOTA_META[k]?.unit, ent.quotas[k], label);
          return (
            <div key={k} className="rounded-xl bg-surface-2 px-3 py-2.5">
              <div className="text-micro uppercase text-muted-foreground">{label}</div>
              {/* "1 seats" was shipping. A unit that never agrees with its number is
                  the kind of thing nobody reports and everybody notices. */}
              <div className="numeral mt-0.5 text-sm font-bold">{fmtQuota(ent.quotas[k])}{unit && <span className="ml-1 text-[0.6rem] font-medium text-muted-foreground">{unit}</span>}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
