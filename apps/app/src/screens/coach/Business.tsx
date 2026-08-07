/** Owner Business — tabbed: overview (plan + credits + AI usage), packages, staff. */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Badge, SegmentedControl, Field, Sheet, SubCard, Page, Stagger, ChartCard, SectionHeader, Eyebrow, GlanceStrip, IconBadge, EmptyState, Spinner, cn, toneVar, Reveal, SkeletonStatGrid, SkeletonChart, SkeletonList, Wallet, Gauge, CreditCard, History, Plus, Minus, Store, AlertTriangle, ArrowRight, TrendingDown, CheckCheck, Check, Lock, Tag, Anchor, CountUp, Group, Row, GroupNote, Meter, Notice } from "@4dl/ui";
import { FEATURE_KEYS, FEATURE_META, QUOTA_KEYS, QUOTA_META, type Entitlements } from "@kova/domain";
import { api, errorText } from "../../api.js";
import { creditKind } from "../../registry/index.js";
import { useSession } from "../../session.js";
import { fmtPrice } from "../../money.js";
import { PaymentSheet, type CheckoutIntent } from "../../PaymentSheet.js";
import { Staff } from "./Staff.js";
import { Packages } from "./Packages.js";
import { PaymentSetup } from "./PaymentSetup.js";
import { PendingPayments } from "./PendingPayments.js";

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
  /** `label`/`kind` are resolved server-side — see apps/api/src/credit-reasons.ts. */
  ledger: { delta: number; reason: string; label?: string; kind?: string; at: number }[];
  stripeEnabled?: boolean;
  publishableKey?: string | null;
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
type Tab = "overview" | "packages" | "getting-paid" | "staff";

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
    wrong_subject: "That code isn't available on your account.",
  }[reason] ?? "That promo code can't be applied.";
}

export function Business() {
  const { ctx } = useSession();
  const canSell = !!ctx?.entitlements?.features?.commerce; // packages = the commerce feature
  const [tab, setTab] = useState<Tab>("overview");
  // If a plan change dropped commerce, don't strand the user on a hidden tab.
  const activeTab = (tab === "packages" || tab === "getting-paid") && !canSell ? "overview" : tab;
  const options: { value: Tab; label: string }[] = [
    { value: "overview", label: "Overview" },
    ...(canSell ? [{ value: "packages" as Tab, label: "Packages" }] : []),
    ...(canSell ? [{ value: "getting-paid" as Tab, label: "Getting paid" }] : []),
    { value: "staff", label: "Staff" },
  ];
  return (
    <div>
      {/* `fill`, like every other surface-level rail (Library, Plans): the tabs
          span the column instead of hugging their labels, so the strip lines up
          with the cards beneath it rather than ending in a ragged edge. */}
      <div className="column p-4 pb-0"><SegmentedControl fill options={options} value={activeTab} onChange={(v) => setTab(v as Tab)} /></div>
      {activeTab === "overview" && <Overview onOpenPayments={() => setTab("getting-paid")} />}
      {activeTab === "packages" && <Packages />}
      {activeTab === "getting-paid" && (
        <div className="column space-y-6 p-4">
          {/* The list first: a coach opening this tab usually has a client
              waiting on access, not a provider to configure. */}
          <PendingPayments canConfirm />
          <PaymentSetup isOwner={ctx?.active?.role === "owner"} />
        </div>
      )}
      {activeTab === "staff" && <Staff />}
    </div>
  );
}

function Overview({ onOpenPayments }: { onOpenPayments: () => void }) {
  const { ctx } = useSession();
  const nav = useNavigate();
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
          <Anchor eyebrow={"AI credits left"} sub={billing.balance.available > 0
                ? "across monthly and purchased"
                : ctx?.entitlements?.features?.aiSuite
                  ? "The AI suite is paused until you top up"
                  : "The AI suite isn't in your plan"}>
        <CountUp value={billing.balance.available} />
      </Anchor>
          {/* No live subscription. Distinct from dunning: a past-due studio HAS a
              subscription and a card to fix; this one is either sitting on the free
              baseline or holding a plan whose checkout never completed. The Shell
              bar says the same thing on every coach screen — this is where it gets
              resolved, so it carries the actual action. */}
          {noSub && (
            <Stagger>
              <Notice
                icon={AlertTriangle}
                title={isPending ? `${pendingName} was never activated` : "No subscription"}
                action={isOwner && billing.stripeEnabled && isPending && pendingPlanId ? (
                  <Button size="sm" style={{ backgroundColor: toneVar.danger }} disabled={busy === `plan_${pendingPlanId}`} onClick={() => void startInline("/api/billing/plan-intent", { planId: pendingPlanId }, `Activate ${pendingName}`, () => `Subscribe · ${fmtPrice(usdToCents(pendingPlan?.priceUsdMonth ?? 0))}/mo`, `plan_${pendingPlanId}`)}>
                    {busy === `plan_${pendingPlanId}` ? "…" : "Finish setup"} <ArrowRight />
                  </Button>
                ) : undefined}
              >
                {isPending
                  ? `You picked ${pendingName} but the card step never completed, so nothing is being billed.`
                  : "Nothing is being billed for this studio."}
                {" "}You&rsquo;re on Kova&rsquo;s free baseline{baselineText ? `: ${baselineText}.` : "."}
                {/* "configured on this deployment" is a sentence for whoever runs
                    the servers, shown to whoever runs the gym. */}
                {!billing.stripeEnabled && " Card payments aren't switched on yet, so there's nothing to subscribe to right now."}
              </Notice>
            </Stagger>
          )}

          {/* Dunning banner — the visible half of the me→tenant lifecycle. */}
          {!billing.subscription.comp && DUNNING[billing.subscription.status] && (
            <Stagger>
              <Notice
                icon={AlertTriangle}
                title={DUNNING[billing.subscription.status]!.title}
                action={isOwner && billing.stripeEnabled ? (
                  <Button size="sm" style={{ backgroundColor: toneVar.danger }} disabled={busy === "portal"} onClick={() => void redirectTo("/api/billing/portal", "portal")}>
                    {busy === "portal" ? "Opening…" : "Update payment"} <ArrowRight />
                  </Button>
                ) : undefined}
              >
                {DUNNING[billing.subscription.status]!.body}
              </Notice>
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
          {/* ONE GROUP, because they answer one question: what is the money doing.
              The plan row and the getting-paid door were two separate containers
              stacked 12px apart — and the second was a hand-rolled bordered
              button with its own icon chip and its own hover, so two adjacent
              lines doing the same job read as two different kinds of thing. */}
          {(!noSub || canSell) && (
            <Stagger>
              <Group>
                {!noSub && (
                  <Row icon={CreditCard} sub={STATE_LABEL[billingState]}>
                    {billing.subscription.planName}
                  </Row>
                )}
                {/* The sub-line says WHAT IS INSIDE, like any index row (§7) —
                    it used to carry the pitch ("we never hold your money or take
                    a cut"), which is a sentence for a marketing page and which a
                    row truncates at the second clause anyway. */}
                {canSell && (
                  <Row icon={Store} iconTone="nutrition" onClick={onOpenPayments} sub="How clients pay you, and what's waiting">
                    Getting paid
                  </Row>
                )}
              </Group>
            </Stagger>
          )}

          {/* Getting paid. No longer a "connect your Stripe to us" card: the
              studio is paid on its OWN account by its OWN provider, so this is a
              route into their setup rather than a handshake with ours. */}

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
              {/* The top three, and a way to the rest. This card used to list
                  seven features with a hand-rolled bar each, which is most of a
                  report rendered inside an overview — and it named them by
                  de-hyphenating the registry key ("Coach note", "Lab extract"),
                  so the same feature had one name here and another on the AI
                  settings screen. `/business/credits` is the report; this is the
                  headline that leads to it. */}
              <ChartCard
                title="AI usage" icon={Gauge} tone="warning"
                value={totalCr.toLocaleString()} unit="cr"
                delta={<Badge tone="neutral">30 days · {totalCalls} runs</Badge>}
                action={<Button size="sm" variant="ghost" onClick={() => nav("/business/credits")}>See all <ArrowRight /></Button>}
              >
                <div className="space-y-2.5">
                  {top.slice(0, 3).map((u) => (
                    <Meter
                      key={u.feature}
                      tone="warning"
                      value={u.credits}
                      max={maxCr}
                      label={featLabel(u.feature)}
                      valueLabel={<>{u.credits.toLocaleString()} cr <span className="text-muted-foreground/60">· {u.calls}×</span></>}
                    />
                  ))}
                </div>
              </ChartCard>
            </Stagger>
          )}

          {ctx?.entitlements && <PlanFeatures ent={ctx.entitlements} />}

          <section className="space-y-2">
            <Eyebrow>Credit packs</Eyebrow>
            <Stagger className="space-y-3">
              {/*
                WHERE THE ANCHOR'S NUMBER CAME FROM — the split, which §1
                explicitly endorses beneath an anchor, in place of restating it.

                Purchased credits never expire; the plan grant resets each period.
                THAT is the fact these two lines exist to teach, and it used to be
                three fragments — "0 purchased · 0 monthly · resets monthly" —
                where the only word carrying meaning ("resets") sat in a chip
                attached to nothing and repeated the word beside it.

                Two lines, not one wrapped one: at phone width the inline
                separator ended up stranded at the end of the first line, pointing
                at nothing.
              */}
              <div className="space-y-0.5 px-1 text-caption text-muted-foreground">
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
              {!billing.stripeEnabled && <GroupNote>Card payments aren&rsquo;t switched on yet, so packs can&rsquo;t be bought right now.</GroupNote>}
            </Stagger>
          </section>

          {/* Plan subscribe / upgrade — inline (no redirect). Hidden for comped tenants. */}
          {isOwner && billing.stripeEnabled && !billing.subscription.comp && upgrades.length > 0 && (
            <section className="space-y-2">
              {/* Keyed on paidPlan, not status: a studio on the free baseline is
                  `status: 'active'`, and "Change plan" implies they have one. */}
              <Eyebrow>{billing.subscription.paidPlan ? "Change plan" : "Choose a plan"}</Eyebrow>
              <Stagger>
              {/* A `Group` of `Row`s, like the packs above and the archived
                  packages on the next tab. These were `bg-surface-2` boxes
                  stacked 6px apart inside a Card — a list drawn by hand, under
                  the row floor, with no hairline and no press state. */}
              <Group>
                {upgrades.map((p) => (
                  <Row
                    key={p.id}
                    icon={ArrowRight}
                    iconTone="primary"
                    sub={`${fmtPrice(usdToCents(p.priceUsdMonth))}/mo`}
                    trailing={
                      <Button size="sm" variant="tonal" disabled={busy === `plan_${p.id}`} onClick={() => void startInline("/api/billing/plan-intent", { planId: p.id }, `Subscribe to ${p.name}`, () => `Subscribe · ${fmtPrice(usdToCents(p.priceUsdMonth))}/mo`, `plan_${p.id}`)}>
                        {busy === `plan_${p.id}` ? "…" : "Select"}
                      </Button>
                    }
                  >
                    {p.name}
                  </Row>
                ))}
              </Group>
              <GroupNote>Billed monthly. Plan credits refresh each period; unused plan credits don&rsquo;t roll over.</GroupNote>
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
              <Group>
                {downgrades.map((p) => (
                  <Row
                    key={p.id}
                    icon={TrendingDown}
                    iconTone="neutral"
                    sub={p.priceUsdMonth > 0 ? `${fmtPrice(usdToCents(p.priceUsdMonth))}/mo` : "Free"}
                    trailing={<Button size="sm" variant="secondary" onClick={() => setDowngrade(p.id)}>Switch</Button>}
                  >
                    {p.name}
                  </Row>
                ))}
              </Group>
              <GroupNote>We&rsquo;ll show you anything that needs sorting out first, and exactly what to do.</GroupNote>
              </Stagger>
            </section>
          )}

          {/*
            Recent credit activity.

            Every row here used to print the ledger's STORED reason — the string
            the metering path had at the moment it charged, so an owner read
            `email.send`, `ai.coach-note`, `ai.client-summary` (§10: product
            language, never system language). The words now come off the wire
            (`credit-reasons.ts`, which asks the AI registry for a feature's real
            name) and the glyph off `registry/credits.ts`, keyed on the KIND of
            movement rather than on its sign — a column of identical plus and
            minus badges said nothing the number beside it did not already say.
          */}
          {billing.ledger.length > 0 && (
            <section className="space-y-2">
              <Eyebrow action={<Button size="sm" variant="ghost" onClick={() => nav("/business/credits")}>See all <ArrowRight /></Button>}>Recent credit activity</Eyebrow>
              <Stagger>
              {/* The ledger is a list of movements, and a movement is a row: what
                  happened on the left, what it cost on the right (§9.3). It was
                  a `divide-y` stack of 32px lines inside a Card — the densest
                  thing on the tab, and the only place credits changed hands.

                  The WORDS come off the wire: every row used to print the
                  ledger's stored reason, so an owner read `email.send` and
                  `ai.coach-note` (§10). `credit-reasons.ts` asks the AI registry
                  for a feature's real name; `registry/credits.ts` turns the KIND
                  into the glyph — keyed on what the movement was, not on its
                  sign, because a column of identical plus and minus badges said
                  nothing the number beside it did not already say. */}
              <Group>
                {billing.ledger.slice(-6).reverse().map((e, i, arr) => {
                  const spec = creditKind(e.kind ?? "other");
                  const up = e.delta >= 0;
                  return (
                    <Row
                      key={`${e.at}-${i}`}
                      icon={spec.icon}
                      iconTone={up ? "success" : spec.tone}
                      divider={i < arr.length - 1}
                      value={<span className={up ? "text-success" : "text-foreground"}>{up ? "+" : ""}{e.delta.toLocaleString()}</span>}
                    >
                      {e.label ?? e.reason}
                    </Row>
                  );
                })}
              </Group>
              </Stagger>
            </section>
          )}
        </>
        )}
      </Reveal>
      )}

      {flash && <p className="text-center text-body text-muted-foreground" role="status">{flash}</p>}
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
    <Sheet
      open
      onClose={onClose}
      title={report ? `Switch to ${report.planName}` : "Switch plan"}
      /* No footer until the check has come back: while it is loading, or when it
         failed, there is nothing to submit and a dead button pinned to the
         bottom of the sheet would be the loudest thing on it. */
      footer={report ? (
        <Button size="lg" className="w-full" disabled={!report.eligible || submitting} onClick={() => void submit()}>
          {submitting ? <><Spinner /> Switching…</> : report.eligible ? `Switch to ${report.planName}` : "Not ready yet"}
        </Button>
      ) : undefined}
    >
      {loadErr && !report ? (
        <EmptyState icon={AlertTriangle} title="Couldn't check that plan" description="We couldn't reach the server to see whether you're ready to switch." action={<Button onClick={() => void check()}>{checking ? "Checking…" : "Try again"}</Button>} />
      ) : (
        <Reveal loading={!report} skeleton={<SkeletonList rows={3} />}>
          {report && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-body text-muted-foreground">
                <span>{report.currentPlanName}</span>
                <ArrowRight className="size-4" />
                <span className="font-medium text-foreground">{report.planName}</span>
                <span className="numeral ml-auto">{report.priceUsdMonth > 0 ? `${fmtPrice(usdToCents(report.priceUsdMonth))}/mo` : "Free"}</span>
              </div>

              {report.clean ? (
                <SubCard className="flex items-start gap-2.5">
                  <IconBadge icon={CheckCheck} tone="success" size="sm" />
                  <p className="text-body">Everything fits on {report.planName}. Nothing to tidy up first.</p>
                </SubCard>
              ) : (
                <>
                  {hard.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-body text-muted-foreground">
                        {hard.length === 1 ? "One thing" : `${hard.length} things`} to sort out before you can switch:
                      </p>
                      {hard.map((b) => (
                        <SubCard key={b.key} className="space-y-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-body font-medium">{b.label}</span>
                            <span className="numeral shrink-0 text-caption text-muted-foreground">
                              {b.current.toLocaleString()}{b.unit ? ` ${b.unit}` : ""} · {report.planName} includes {fmtCeiling(b)}
                            </span>
                          </div>
                          <p className="text-body text-muted-foreground">{b.message}</p>
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
                      <p className="text-body text-muted-foreground">Worth knowing — {hard.length > 0 ? "these don't" : "this doesn't"} block the switch:</p>
                      {soft.map((b) => (
                        <SubCard key={b.key} className="space-y-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-body font-medium">{b.label}</span>
                            <span className="numeral shrink-0 text-caption text-muted-foreground">
                              {b.current.toLocaleString()}{b.unit ? ` ${b.unit}` : ""} · includes {fmtCeiling(b)}
                            </span>
                          </div>
                          <p className="text-body text-muted-foreground">{b.message}</p>
                          {b.action && <Button size="sm" variant="secondary" onClick={() => nav(b.action!.href)}>{b.action.label} <ArrowRight /></Button>}
                        </SubCard>
                      ))}
                    </div>
                  )}
                </>
              )}

              {err && <p className="text-body text-warning" role="alert">{err}</p>}

              <div className="space-y-2">
                <Button size="lg" variant="secondary" className="w-full" disabled={checking || submitting} onClick={() => void check()}>
                  {checking ? <><Spinner /> Re-checking…</> : "Re-check"}
                </Button>
              </div>
              <p className="text-caption text-muted-foreground">
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
  /*
    A GROUP OF ROWS, AND THE CAPACITIES ARE ROWS TOO.

    This was a `Card` holding a 40px hand-rolled line per feature — under the row
    floor, no hairline, no press state, the hint at 12px under a 14px label — and
    then a 2-up grid of `bg-surface-2` boxes for the quotas. Three different
    spellings of "a labelled value" inside one card.

    The quotas ARE the same thing as the features: a capability and what you have
    of it. So they join the same list, below a hairline break, with the number in
    the value slot where every other number in the app sits (§9.3). It also fixes
    a real ambiguity — a quota tile said "3" over "ACTIVE CLIENTS" with nothing
    saying whether that was a ceiling or a count.
  */
  return (
    <section className="space-y-2">
      <Eyebrow action={<Badge tone="success">{included} of {features.length}</Badge>}>What&rsquo;s in your plan</Eyebrow>
      <Group>
        {features.map((k) => {
          const on = ent.features[k];
          const meta = FEATURE_META[k]!;
          return (
            <Row
              key={k}
              icon={on ? Check : Lock}
              iconTone={on ? "success" : undefined}
              sub={meta.hint}
              trailing={on ? undefined : <Badge tone="neutral">Locked</Badge>}
              className={on ? undefined : "opacity-60"}
            >
              {meta.label}
            </Row>
          );
        })}
        {QUOTA_KEYS.map((k) => {
          const label = QUOTA_META[k]?.label ?? k;
          const unit = unitFor(QUOTA_META[k]?.unit, ent.quotas[k], label);
          return (
            <Row
              key={k}
              icon={Gauge}
              iconTone="neutral"
              sub="Included in your plan"
              /* "1 seats" was shipping. A unit that never agrees with its number
                 is the kind of thing nobody reports and everybody notices. */
              value={<>{fmtQuota(ent.quotas[k])}{unit && <span className="ml-1 text-caption font-medium text-muted-foreground">{unit}</span>}</>}
            >
              {label}
            </Row>
          );
        })}
      </Group>
    </section>
  );
}
