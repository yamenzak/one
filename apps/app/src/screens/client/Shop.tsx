/** Client Shop — the tenant's storefront: marketplace packages (rich product
 *  cards), Stripe Connect / inline buy, redeem codes. */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button, Card, Badge, Field, Sheet, Page, Stagger, IconBadge, Eyebrow, ConfirmDialog, EmptyState, toneVar, ArrowLeft, LogOut, Ticket, Store, Check, RotateCcw, Reveal, SkeletonLine, SkeletonList } from "@kova/ui";
import { CLIENT_FLAG_KEYS, CLIENT_FLAG_META } from "@kova/domain";
import { api } from "../../api.js";
import { StudioListCard } from "../../StudioSwitcher.js";
import { useCan } from "../../FeatureLock.js";
import { useSession } from "../../session.js";
import { fmtPrice } from "../../money.js";
import { PaymentSheet, type CheckoutIntent } from "../../PaymentSheet.js";

interface Pkg { id: string; name: string; description: string | null; one_time_price_cents: number | null; monthly_price_cents?: number | null; installment_months?: number | null; budgets: { feature: string; days: number }[]; flags?: Record<string, boolean> | null; visibility: string }
interface Sub { status: string; daysRemaining: number; autoRenew?: boolean; packageId?: string | null }

const priceLabel = (p: Pkg): string =>
  p.monthly_price_cents ? `${fmtPrice(p.monthly_price_cents)}/mo`
  : p.one_time_price_cents ? fmtPrice(p.one_time_price_cents)
  : "Free";

/** Cover-band tones cycled across the product grid so cards read as distinct
 *  merchandise rather than one repeated row. */
const CARD_TONES = ["primary", "cardio", "activity", "nutrition"] as const;
const budgetLabel = (f: string) => (f === "all" ? "Full access" : f === "workout" ? "Workout plans" : f === "meal" ? "Meal plans" : f);
const isRecurring = (p: Pkg) => !!p.monthly_price_cents || !!(p.installment_months && p.installment_months > 1);

/** The client Shop. In `locked` mode it IS the access gate: no way back into the
 *  app until a plan/package covers them, plus a sign-out escape. */
export function Shop({ clientId, onBack, locked }: { clientId: string; onBack?: () => void; locked?: boolean }) {
  const { host, refresh, signOut } = useSession();
  const studio = host?.tenant?.name ?? null;
  const [packages, setPackages] = useState<Pkg[] | null>(null);
  const [sub, setSub] = useState<Sub | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [redeemMsg, setRedeemMsg] = useState<string | null>(null);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [buying, setBuying] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // The studio has to have bought `commerce` from Kova for any of this to
  // exist. Without it both reads below 403 — which left the storefront on its
  // skeleton forever — so skip them and say plainly that there's nothing to buy.
  // The redeem-a-code path stays live either way: for a client `Shell.tsx` has
  // pinned here by `requireActiveAccess`, it is the only way forward.
  const canCommerce = useCan("commerce");

  const load = useCallback(async () => {
    if (!canCommerce) { setPackages([]); setSub(null); return; }
    const [p, s] = await Promise.all([api.get<{ packages: Pkg[] }>("/api/packages"), api.get<{ subscriptions: Sub[] }>(`/api/subscriptions?clientId=${clientId}`)]);
    setPackages(p.packages.filter((x) => x.visibility === "marketplace"));
    setSub(s.subscriptions.find((x) => x.status === "active") ?? null);
  }, [clientId, canCommerce]);
  useEffect(() => void load(), [load]);

  const redeem = async () => {
    setBusy(true); setRedeemMsg(null);
    try { const r = await api.post<{ daysAdded: number; feature: string }>("/api/redeem", { clientId, code }); setRedeemMsg(`✓ ${r.daysAdded} days of ${r.feature} access added.`); setCode(""); await load(); await refresh(); }
    catch (e) { setRedeemMsg(e instanceof Error && e.message.includes("not found") ? "That code isn't valid." : "Couldn't redeem that code."); }
    finally { setBusy(false); }
  };
  // Recurring subscriptions use hosted Checkout (Stripe provisions the
  // connected-account customer + price for us).
  const buy = async (packageId: string) => {
    if (buying) return;
    setBuying(true); setMsg(null);
    try { const r = await api.post<{ url: string }>("/api/connect/checkout", { clientId, packageId, returnUrl: location.href }); location.href = r.url; }
    catch { setMsg("Checkout isn't available yet — ask your coach to finish Stripe setup."); setBuying(false); }
  };
  // One-time packages check out inline (Payment Element) on the tenant's account.
  const [checkout, setCheckout] = useState<{ intent: CheckoutIntent; name: string; price: string } | null>(null);
  const [buyPromo, setBuyPromo] = useState("");
  const promoMsg = (m: string): string => ({ not_found: "That promo code isn't valid.", inactive: "That code is no longer active.", expired: "That code has expired.", exhausted: "That code has been fully used.", wrong_package: "That code doesn't apply to this package.", wrong_client: "That code isn't available on your account." }[m.replace("promo_", "")] ?? "That promo code can't be applied.");
  const buyInline = async (p: Pkg) => {
    if (buying) return;
    setBuying(true); setMsg(null);
    try {
      const r = await api.post<{ clientSecret?: string; publishableKey?: string; stripeAccount?: string; granted?: boolean; amountCents?: number }>("/api/connect/pay-intent", { clientId, packageId: p.id, promoCode: buyPromo || undefined });
      if (r.granted) { setMsg("Access unlocked!"); await load(); await refresh(); return; } // promo covered it fully
      // Label the button from the amount the SERVER created the PaymentIntent for
      // — with a promo applied the list price is not what Stripe will charge.
      if (r.clientSecret && r.publishableKey) setCheckout({ intent: { clientSecret: r.clientSecret, publishableKey: r.publishableKey, stripeAccount: r.stripeAccount }, name: p.name, price: fmtPrice(r.amountCents ?? p.one_time_price_cents ?? 0) });
      else setMsg("Checkout isn't available yet — ask your coach to finish Stripe setup.");
    } catch (e) { setMsg(e instanceof Error && e.message.startsWith("promo_") ? promoMsg(e.message) : "Checkout isn't available yet — ask your coach to finish Stripe setup."); }
    finally { setBuying(false); }
  };
  const onPaid = async () => {
    setCheckout(null);
    setMsg("Payment received — your access updates in a moment.");
    await load();
    await refresh();
  };
  const cancelRenew = async () => {
    setBusy(true); setMsg(null);
    // The route returns non-2xx (502) when the Stripe cancel actually fails —
    // never assume success; surface a retryable error and keep auto-renew shown.
    try { await api.post("/api/connect/cancel-subscription", { clientId }); setMsg("Auto-renew canceled — your access continues until it runs out."); await load(); }
    catch { setMsg("Couldn't cancel — please try again."); }
    finally { setBusy(false); }
  };

  const cta = (p: Pkg): ReactNode => {
    if (p.monthly_price_cents) return <Button size="lg" className="mt-4 w-full" disabled={buying} onClick={() => void buy(p.id)}>Subscribe</Button>;
    if (p.installment_months && p.installment_months > 1 && p.one_time_price_cents) return <Button size="lg" className="mt-4 w-full" disabled={buying} onClick={() => void buy(p.id)}>Pay in {p.installment_months} months</Button>;
    if (p.one_time_price_cents) return <Button size="lg" className="mt-4 w-full" disabled={buying} onClick={() => void buyInline(p)}>Buy now</Button>;
    return <p className="mt-3 text-center text-xs text-muted-foreground">Ask your coach to add this to your account.</p>;
  };

  const memberships = (packages ?? []).filter(isRecurring);
  const oneTime = (packages ?? []).filter((p) => !isRecurring(p));
  const hasInlinePaid = oneTime.some((p) => p.one_time_price_cents);

  // One-tap "extend" = re-buy the same package the current access came from.
  // Only offered when it's a paid, non-renewing package still on sale.
  const activePkg = sub?.packageId ? (packages ?? []).find((p) => p.id === sub.packageId) : undefined;
  const canExtend = !!sub && !sub.autoRenew && !!activePkg && !!(activePkg.one_time_price_cents || activePkg.monthly_price_cents);
  const extend = () => { if (activePkg) void (isRecurring(activePkg) ? buy(activePkg.id) : buyInline(activePkg)); };

  return (
    <Page className="mx-auto max-w-xl space-y-5 p-4 pb-28">
      {/* Storefront header */}
      <div className="flex items-center gap-3">
        {locked ? (
          <IconBadge icon={Store} tone="primary" />
        ) : (
          <Button size="icon" variant="secondary" onClick={onBack} aria-label="Back"><ArrowLeft /></Button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-title-2">Shop</h1>
          <p className="truncate text-xs text-muted-foreground">Plans &amp; packages{studio ? ` from ${studio}` : ""}</p>
        </div>
        {locked && <Button size="sm" variant="ghost" onClick={() => void signOut()}><LogOut /> Sign out</Button>}
      </div>

      {/* THE STRANDING FIX. In `locked` mode this screen replaces the whole Shell,
          so there is no app bar and therefore no studio switcher — the only way
          out was Sign out. A client locked at one studio who has a live plan at
          ANOTHER was stuck: signing out and back in lands them in whichever tenant
          the session's activeOrganizationId names, which can be the locked one
          again. One studio's unpaid access must never cost you the studios you did
          pay for. Renders nothing when there is only one studio. */}
      {locked && (
        <StudioListCard />
      )}

      {locked && (
        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative flex items-start gap-3">
            <IconBadge icon={Ticket} tone="primary" size="sm" />
            <div className="min-w-0 text-sm"><div className="font-medium">{canCommerce ? "Choose a plan to get started" : "Let's get your access set up"}</div><div className="text-muted-foreground">{canCommerce ? "Your access is inactive. Pick a package below or enter a code — or ask your coach to set you up." : "Your access is inactive. Enter an access code below, or ask your coach to set you up."}</div></div>
          </div>
        </Card>
      )}

      <Reveal loading={!packages} className="space-y-5" skeleton={
        <>
          <SkeletonList card rows={1} />
          <SkeletonLine w="6rem" h="xs" className="ml-1" />
          <SkeletonList card rows={2} thumb={0} />
        </>
      }>
        {packages && (
        <>
      {msg && <Card className="border border-primary/20 bg-primary/5 text-sm text-foreground/85">{msg}</Card>}

      {canCommerce && (sub ? (
        <div className="space-y-2">
          <Card className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-sm text-muted-foreground">Current access</span>
                {sub.autoRenew && <div className="text-xs font-medium text-primary">Auto-renews monthly</div>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={sub.daysRemaining <= 7 ? "warning" : "success"}>{sub.daysRemaining} days left</Badge>
                {sub.autoRenew && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmCancel(true)}>Cancel</Button>}
              </div>
            </div>
            {canExtend && activePkg && (
              <Button variant="tonal" className="w-full" disabled={buying} onClick={extend}><RotateCcw /> Extend {activePkg.name} · {priceLabel(activePkg)}</Button>
            )}
          </Card>
          {!sub.autoRenew && (
            <p className="px-1 text-xs text-muted-foreground">Extending <span className="font-medium text-foreground">stacks</span> on top of your current {sub.daysRemaining} days — nothing is wasted.</p>
          )}
        </div>
      ) : (
        !locked && <p className="px-1 text-xs text-muted-foreground">Pick a package below to unlock your plan. Buy again anytime to extend — access stacks, it never resets.</p>
      ))}

      <PlanIncludes />

      {memberships.length > 0 && (
        <section className="space-y-3">
          <Eyebrow>Memberships &amp; plans</Eyebrow>
          {memberships.map((p, i) => <Stagger key={p.id}><PackageCard p={p} tone={CARD_TONES[i % CARD_TONES.length]!} cta={cta(p)} hasActive={!!sub} /></Stagger>)}
        </section>
      )}

      {oneTime.length > 0 && (
        <section className="space-y-3">
          <Eyebrow>{memberships.length > 0 ? "Packages" : "Packages & access"}</Eyebrow>
          {hasInlinePaid && (
            <Field label="Discount code — applied at checkout (optional)" icon={Ticket} value={buyPromo} onChange={(e) => setBuyPromo(e.target.value.toUpperCase())} placeholder="SUMMER20" />
          )}
          {oneTime.map((p, i) => <Stagger key={p.id}><PackageCard p={p} tone={CARD_TONES[(memberships.length + i) % CARD_TONES.length]!} cta={cta(p)} hasActive={!!sub} /></Stagger>)}
        </section>
      )}

      {/* No `commerce` = there is no online storefront to show. Say that calmly
          and honestly — an "upgrade your plan" card would be aimed at the wrong
          person, since the client isn't the buyer of the studio's plan. */}
      {!canCommerce ? (
        <EmptyState icon={Store} title="Your coach isn't selling plans online" description="This studio doesn't take payments here. Your coach sets up your access for you — or enter an access code below if you have one." />
      ) : packages.length === 0 && !sub && (
        <Card className="text-center text-sm text-muted-foreground">No packages are available to buy right now. Enter a code below, or ask your coach to set you up.</Card>
      )}

      {/* Access codes live in their own sheet — kept out of the storefront flow
          so they don't get confused with checkout discount codes. */}
      <div className="pt-1 text-center">
        <button onClick={() => setRedeemOpen(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-4"><Ticket /> Have an access code? Redeem it</button>
      </div>
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

      <PaymentSheet
        open={!!checkout}
        onClose={() => setCheckout(null)}
        title={checkout ? `Buy ${checkout.name}` : "Checkout"}
        intent={checkout?.intent ?? null}
        submitLabel={checkout ? `Pay ${checkout.price}` : "Pay"}
        onSuccess={onPaid}
      />

      {redeemOpen && (
        <Sheet open onClose={() => { setRedeemOpen(false); setRedeemMsg(null); }} title="Redeem an access code">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Have an access code from your coach? Enter it to add days to your plan. This is different from a checkout discount code.</p>
            <Field label="Access code" icon={Ticket} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME7" />
            <Button size="lg" className="w-full" disabled={code.length < 4 || busy} onClick={() => void redeem()}>{busy ? "Redeeming…" : "Redeem"}</Button>
            {redeemMsg && <p className="text-sm text-muted-foreground">{redeemMsg}</p>}
          </div>
        </Sheet>
      )}
    </Page>
  );
}

/** A storefront product card: a tone-tinted cover band (name + price), then a
 *  "what's included" checklist (budgets + package capabilities) and the CTA. */
function PackageCard({ p, tone, cta, hasActive }: { p: Pkg; tone: (typeof CARD_TONES)[number]; cta: ReactNode; hasActive: boolean }) {
  const tv = toneVar[tone];
  const days = Math.max(0, ...p.budgets.map((b) => b.days));
  // Make the access model explicit on the card: recurring vs a fixed run of
  // days, and — when they're already covered — that it queues (never resets).
  const note = p.monthly_price_cents
    ? "Billed monthly · cancel anytime"
    : days > 0
      ? hasActive ? `${days} days · begins when your current access ends` : `${days} days of access`
      : null;
  const price: { big: string; cadence: string } =
    p.monthly_price_cents ? { big: fmtPrice(p.monthly_price_cents), cadence: "/ month" }
    : p.installment_months && p.installment_months > 1 && p.one_time_price_cents ? { big: fmtPrice(p.one_time_price_cents), cadence: `${p.installment_months}× ${fmtPrice(Math.ceil(p.one_time_price_cents / p.installment_months))}/mo` }
    : p.one_time_price_cents ? { big: fmtPrice(p.one_time_price_cents), cadence: "one-time" }
    : { big: "Free", cadence: "" };
  const capabilities = p.flags ? CLIENT_FLAG_KEYS.filter((k) => p.flags![k] === true).slice(0, 4).map((k) => CLIENT_FLAG_META[k].label) : [];
  const includes = [...p.budgets.map((b) => `${b.days}-day ${budgetLabel(b.feature)}`), ...capabilities];
  return (
    <Card className="overflow-hidden p-0">
      <div className="relative overflow-hidden px-5 pb-4 pt-5" style={{ background: `linear-gradient(135deg, color-mix(in oklch, ${tv} 20%, transparent), color-mix(in oklch, ${tv} 5%, transparent))` }}>
        <Store className="pointer-events-none absolute -right-4 -top-4 size-28 opacity-[0.08]" style={{ color: tv }} />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="grid size-9 place-items-center rounded-xl [&_svg]:size-[1.1rem]" style={{ backgroundColor: `color-mix(in oklch, ${tv} 18%, transparent)`, color: tv }}><Store /></span>
            <h3 className="mt-2.5 text-lg font-bold tracking-tight">{p.name}</h3>
            {p.description && <p className="mt-0.5 text-sm text-muted-foreground">{p.description}</p>}
          </div>
          <div className="shrink-0 text-right">
            <div className="numeral text-2xl font-extrabold leading-none" style={{ color: tv }}>{price.big}</div>
            {price.cadence && <div className="mt-1 text-xs font-medium text-muted-foreground">{price.cadence}</div>}
          </div>
        </div>
      </div>
      <div className="p-5 pt-4">
        {includes.length > 0 && (
          <ul className="space-y-2">
            {includes.map((f, i) => (
              <li key={i} className="flex items-center gap-2.5 text-sm">
                <span className="grid size-5 shrink-0 place-items-center rounded-full [&_svg]:size-3" style={{ backgroundColor: `color-mix(in oklch, ${tv} 16%, transparent)`, color: tv }}><Check strokeWidth={3} /></span>
                {f}
              </li>
            ))}
          </ul>
        )}
        {note && <p className="mt-3 text-xs text-muted-foreground">{note}</p>}
        {cta}
      </div>
    </Card>
  );
}

/** "What your plan includes" — the client's own capabilities, grouped by
 *  category, rendered from CLIENT_FLAG_META + the resolved clientFlags in
 *  session context. The flags are already the intersection of what the coach
 *  enabled for this client AND what the studio bought from Kova (∩ live
 *  budget), so this shows exactly what they can actually do. Positive framing:
 *  only included capabilities are listed. */
const PLAN_PREVIEW = 5;
function PlanIncludes() {
  const { ctx } = useSession();
  const [expanded, setExpanded] = useState(false);
  const flags = ctx?.clientFlags;
  if (!flags) return null;
  const included = CLIENT_FLAG_KEYS.filter((k) => flags[k]);
  if (!included.length) return null;
  const shown = expanded ? included : included.slice(0, PLAN_PREVIEW);
  const hidden = included.length - shown.length;
  return (
    <section className="space-y-2">
      <Eyebrow action={<span className="text-xs font-medium text-muted-foreground">{included.length} included</span>}>What your plan includes</Eyebrow>
      <div className="flex flex-wrap gap-1.5 px-1">
        {shown.map((k) => (
          <span key={k} className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success [&_svg]:size-3">
            <Check strokeWidth={3} />{CLIENT_FLAG_META[k].label}
          </span>
        ))}
        {(hidden > 0 || expanded) && (
          <button onClick={() => setExpanded((v) => !v)} className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
            {expanded ? "Show less" : `+${hidden} more`}
          </button>
        )}
      </div>
    </section>
  );
}
