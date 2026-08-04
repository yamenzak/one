/** Client Shop — the tenant's storefront: marketplace packages (rich product
 *  cards), Stripe Connect / inline buy, redeem codes. */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button, Card, Badge, Field, Sheet, Page, Stagger, IconBadge, Eyebrow, ConfirmDialog, EmptyState, toneVar, ArrowLeft, LogOut, Ticket, Store, Check, RotateCcw, Reveal, SkeletonLine, SkeletonList , Anchor, CountUp, Atmosphere} from "@4dl/ui";
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
    try {
      const [p, s] = await Promise.all([api.get<{ packages: Pkg[] }>("/api/packages"), api.get<{ subscriptions: Sub[] }>(`/api/subscriptions?clientId=${clientId}`)]);
      setPackages(p.packages.filter((x) => x.visibility === "marketplace"));
      setSub(s.subscriptions.find((x) => x.status === "active") ?? null);
    } catch {
      // A REFUSED READ MUST STILL SETTLE THE SCREEN. Without this the rejection
      // escaped into the app-wide unhandled-error toast, `packages` stayed null,
      // and the storefront sat on its skeleton for good — which in `locked` mode
      // is the ENTIRE app for that client, with no way forward and nothing said.
      // The `commerce` entitlement was handled above precisely because this bit
      // once, and every other failure (a 500, a dropped connection, a tenant
      // whose catalogue read errors) lands here for the same reason.
      setPackages([]);
      setSub(null);
      setMsg("Couldn't load this studio's packages. Pull to refresh, or ask your coach to set you up.");
    }
  }, [clientId, canCommerce]);
  useEffect(() => void load(), [load]);

  // Is there actually anything to buy? Both halves matter: a studio that never
  // bought commerce, and one that did but has published nothing. Either way the
  // anchor must not tell the client to pick something.
  const canBuy = canCommerce && !!packages && packages.length > 0;

  const redeem = async () => {
    setBusy(true); setRedeemMsg(null);
    try { const r = await api.post<{ daysAdded: number; feature: string }>("/api/redeem", { clientId, code }); setRedeemMsg(`✓ ${r.daysAdded} days of ${r.feature} access added.`); setCode(""); await load(); await refresh(); }
    catch (e) { setRedeemMsg(e instanceof Error && e.message.includes("not found") ? "That code isn't valid." : "Couldn't redeem that code."); }
    finally { setBusy(false); }
  };
  /**
   * ONE buy path for every package and every provider.
   *
   * The studio is paid on its own merchant account, so the app's whole job is to
   * open a purchase and hand the client wherever that studio takes payment.
   * There is no inline card form any more: Kova never sees the card, which is
   * exactly why the studio's provider — and their country, and their currency —
   * is entirely their choice.
   *
   * `checkoutUrl` comes back null when the studio settles off-platform (cash,
   * transfer, their own card machine). That is not a failure and must not read
   * like one: the purchase is real and waiting on their coach's confirmation.
   */
  const buy = async (packageId: string) => {
    if (buying) return;
    setBuying(true); setMsg(null);
    try {
      const r = await api.post<{ checkoutUrl: string | null }>("/api/purchases", { clientId, packageId });
      if (r.checkoutUrl) { location.href = r.checkoutUrl; return; }
      setMsg("Your coach will confirm this payment with you — your access starts as soon as they do.");
      await load();
    } catch (e) {
      // The server's message is worth showing: it distinguishes "this renews
      // monthly but your coach's payment method can't do that" from a generic
      // outage, and only the first tells the client anything useful.
      setMsg(e instanceof Error && e.message ? e.message : "Couldn't start that purchase — please try again.");
    } finally { setBuying(false); }
  };

  const cta = (p: Pkg): ReactNode => {
    if (p.monthly_price_cents) return <Button size="lg" className="mt-4 w-full" disabled={buying} onClick={() => void buy(p.id)}>Subscribe</Button>;
    if (p.one_time_price_cents) return <Button size="lg" className="mt-4 w-full" disabled={buying} onClick={() => void buy(p.id)}>Buy now</Button>;
    return <p className="mt-3 text-center text-xs text-muted-foreground">Ask your coach to add this to your account.</p>;
  };

  const memberships = (packages ?? []).filter(isRecurring);
  const oneTime = (packages ?? []).filter((p) => !isRecurring(p));

  // One-tap "extend" = re-buy the same package the current access came from.
  // Only offered when it's a paid, non-renewing package still on sale.
  const activePkg = sub?.packageId ? (packages ?? []).find((p) => p.id === sub.packageId) : undefined;
  const canExtend = !!sub && !sub.autoRenew && !!activePkg && !!(activePkg.one_time_price_cents || activePkg.monthly_price_cents);
  const extend = () => { if (activePkg) void buy(activePkg.id); };

  return (
    <Page className="relative isolate column space-y-5 p-4 pb-28">
      {/* Shop is an overlay route (Shell.tsx) — it renders OUTSIDE the shell, so
          it never inherited the shell's ambient wash and was the one anchored
          screen in the client app sitting on flat canvas. It owns one (§3). */}
      <Atmosphere />
      {/* Storefront header */}
      <div className="flex items-center gap-3">
        {locked ? (
          <IconBadge icon={Store} tone="primary" />
        ) : (
          <Button size="icon" variant="secondary" onClick={onBack} aria-label="Back"><ArrowLeft /></Button>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-caption text-muted-foreground">Plans &amp; packages{studio ? ` from ${studio}` : ""}</p>
        </div>
        {locked && <Button size="sm" variant="ghost" onClick={() => void signOut()}><LogOut /> Sign out</Button>}
      </div>

      {/* T1 (§1). The question a client opens Shop with is "how long have I got",
          not "what is this screen called" — so the anchor is their remaining
          access when they have some, and the offer when they do not. */}
      {sub && sub.daysRemaining > 0 ? (
        <Anchor eyebrow="Access left" className="pt-1" sub={sub.daysRemaining === 1 ? "day" : "days"}>
          <CountUp value={sub.daysRemaining} />
        </Anchor>
      ) : (
        /* "Pick one below to start" is a lie when there is nothing below to
           pick: a studio that doesn't sell online, or one with no published
           packages, leaves this screen as a redemption + explanation surface.
           Say which one it is (§10). */
        <Anchor
          eyebrow="Your plan"
          className="pt-1"
          word={canBuy ? (locked ? "Choose a package" : "Nothing active") : "Nothing active"}
          sub={canBuy ? "Pick one below to start" : "Your coach sets this up for you"}
        />
      )}

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

      <PlanIncludes hasPlan={!!sub && sub.daysRemaining > 0} />

      {memberships.length > 0 && (
        <section className="space-y-3">
          <Eyebrow>Memberships &amp; plans</Eyebrow>
          {memberships.map((p, i) => <Stagger key={p.id}><PackageCard p={p} tone={CARD_TONES[i % CARD_TONES.length]!} cta={cta(p)} hasActive={!!sub} /></Stagger>)}
        </section>
      )}

      {oneTime.length > 0 && (
        <section className="space-y-3">
          <Eyebrow>{memberships.length > 0 ? "Packages" : "Packages & access"}</Eyebrow>
          {/* No discount-code field any more. A checkout discount has to be
              applied by whoever owns the checkout page, and that is now the
              studio's own provider — Kova cannot discount a payment link it does
              not own. Studios put promotions in their provider instead; ACCESS
              codes (below) are unaffected, because those grant days rather than
              reduce a price. */}
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

      {/* Kova cannot stop the charge — that standing order lives with the
          studio's own payment provider, which is the whole point of the studio
          being paid directly. Offering a "Cancel auto-renew" button we cannot
          honour would be worse than saying so: the client would believe it
          worked and be charged again next month. So this points them at the two
          people who CAN stop it. */}
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Stopping your subscription"
        description="Your coach takes this payment on their own account, so they'll stop it for you — just message them. If you paid by card you can also cancel from the receipt email your payment went through. Your access stays active until the time you've paid for runs out."
        confirmLabel="Got it"
        cancelLabel="Close"
        onConfirm={() => setConfirmCancel(false)}
      />

      {redeemOpen && (
        <Sheet open onClose={() => { setRedeemOpen(false); setRedeemMsg(null); }} title="Redeem an access code" footer={<Button size="lg" className="w-full" disabled={code.length < 4 || busy} onClick={() => void redeem()}>{busy ? "Redeeming…" : "Redeem"}</Button>}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Have an access code from your coach? Enter it to add days to your plan. This is different from a checkout discount code.</p>
            <Field label="Access code" icon={Ticket} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME7" />
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
function PlanIncludes({ hasPlan }: { hasPlan: boolean }) {
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
      {/* With no active plan these are still real capabilities — the studio's
          defaults — but calling them "your plan" under an anchor that just said
          "Nothing active" contradicts it on the same screen. */}
      <Eyebrow action={<span className="text-xs font-medium text-muted-foreground">{included.length}</span>}>
        {hasPlan ? "What your plan includes" : "What you can do now"}
      </Eyebrow>
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
