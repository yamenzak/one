/**
 * BILLING (§25): plan, AI credits, one-time packs, promo redemption, ledger.
 *
 * ── What 7d changed ─────────────────────────────────────────────────────────
 *
 * `purchase()` had a `finally` and no `catch`, so a refused credit-pack
 * checkout rejected into the app-wide "Something didn't load" toast — the one
 * screen where "we could not take your money" has to be said out loud.
 *
 * The failed-load card said "We couldn't reach the API" whatever the server
 * actually answered; it carries the real message now, through `LoadError`.
 *
 * The ledger's five-column `<Table>` is a `Row` list: on a phone the Reference
 * and Balance columns were the first to be squeezed out, and Balance is the
 * column somebody opens a ledger to read.
 */
import { useEffect, useState } from "react";
import { Receipt, Check, Sparkles, ArrowRight, Lock, Loader2 } from "lucide-react";
import { Button, Dialog, DialogContent, DialogFooter, Group, Input, LoadError, Meter, Row, Skeleton, toast } from "@4dl/ui";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { PageHeader } from "../components/page-header.js";
import { LegalDialog, LegalLinks, type LegalDoc } from "../legal/content.js";
import { cn } from "@/lib/utils";
import { FEATURE_CATALOG, QUOTA_CATALOG } from "@scena/manifest";
import { EmptyState } from "../components/empty.js";
import {
  getBilling,
  changePlan,
  buyPack,
  redeemPromo,
  type BillingState,
  type Plan,
  type Violation,
} from "../api.js";

const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
const num = (n: number) => n.toLocaleString();
/** Bytes as an amount a person reads — GB past a gigabyte, MB below it. */
const mb = (bytes: number) => {
  const m = bytes / (1024 * 1024);
  return m >= 1024 ? `${(m / 1024).toFixed(1)} GB` : `${m < 10 && m > 0 ? m.toFixed(1) : Math.round(m)} MB`;
};

function fmtDate(ts: number): string {
  const ms = ts < 1e12 ? ts * 1000 : ts;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Billing (§25): plan, AI credits, one-time packs, promo redemption, ledger. */
export function BillingPage() {
  const [state, setState] = useState<BillingState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [downgrade, setDowngrade] = useState<{ plan: Plan; violations: Violation[] } | null>(null);
  const [promo, setPromo] = useState("");
  const [promoMsg, setPromoMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);
  const [pending, setPending] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    setError(null);
    return getBilling().then(setState).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };
  useEffect(() => { reload(); }, []);

  if (!state) {
    // A genuine outage and a first load are different states. Hanging on the
    // skeleton is the failure this distinction exists to prevent.
    if (error) return <div className="mx-auto max-w-md py-10"><LoadError what="billing" error={error} onRetry={reload} /></div>;
    return <BillingSkeleton />;
  }

  const { subscription: sub, plan, balance, plans, packs, ledger, entitlements, storage } = state;
  const grant = entitlements.aiCredits.monthlyGrant || 0;
  // Media storage is the second thing the plan caps, and until Stage 5 it was
  // capped by nothing at all. Shown beside the credit balance because a ceiling
  // you cannot see is one that surprises you at the moment an upload matters.
  const storagePct = storage && storage.limitBytes > 0 ? Math.min(100, Math.round((storage.usedBytes / storage.limitBytes) * 100)) : 0;

  // Confirm before switching — never change plan on a single card click.
  async function confirmPlan(p: Plan) {
    setBusy(p.id);
    try {
      const r = await changePlan(p.id);
      if (r.blocked) { setPending(null); setDowngrade({ plan: p, violations: r.violations ?? [] }); }
      else if (r.checkoutUrl) window.location.href = r.checkoutUrl;
      else if (r.error === "payments_unavailable") toast.error("Online payments aren't enabled yet — contact us to upgrade.");
      else if (r.error) toast.error(r.error);
      else { setPending(null); await reload(); toast.success(`You're now on ${p.name}.`); }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Plan change failed");
    } finally {
      setBusy(null);
    }
  }

  async function purchase(packId: string) {
    setBusy(packId);
    try {
      const r = await buyPack(packId);
      if (r.checkoutUrl) window.location.href = r.checkoutUrl;
      else toast.error(r.error === "stripe not configured" ? "Stripe is not configured — ask your admin to enable payments." : r.error ?? "Checkout unavailable");
    } catch (e) {
      // Was a bare `finally`. A refused checkout rejected into the app-wide
      // "Something didn't load" toast, which names neither the pack nor why.
      toast.error(e instanceof Error ? e.message : "Couldn’t start checkout — you have not been charged.");
    } finally {
      setBusy(null);
    }
  }

  async function applyPromo() {
    if (!promo.trim()) return;
    setBusy("promo");
    try {
      const r = await redeemPromo(promo.trim());
      setPromoMsg({ ok: true, text: r.kind === "plan" ? `Plan gift applied: ${r.planId}` : `Added ${num(r.credits ?? 0)} credits` });
      setPromo("");
      await reload();
    } catch (e) {
      setPromoMsg({ ok: false, text: e instanceof Error ? humanPromoError(e.message) : "Redeem failed" });
    } finally {
      setBusy(null);
    }
  }

  const status = sub.comp ? "comped" : sub.status;
  const statusDot = sub.status === "active" ? "bg-success" : sub.status === "suspended" ? "bg-destructive" : "bg-warning";
  const statusText = sub.status === "active" ? "text-success" : sub.status === "suspended" ? "text-destructive" : "text-warning";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title="Billing" description="Manage your plan, AI credits, and one-time packs." />

      {/* Plan + credits */}
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        {/* Current plan */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current plan</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4">
            <div className="flex items-baseline gap-2.5">
              <span className="text-2xl font-semibold tracking-tight">{plan?.name ?? sub.plan_id}</span>
              <span className="font-mono text-sm tabular-nums text-muted-foreground">
                {plan ? (plan.price_cents === 0 ? "Free" : `${dollars(plan.price_cents)}/${plan.interval}`) : ""}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 border-t pt-4 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Status</div>
                <div className={cn("mt-1 flex items-center gap-1.5 font-medium capitalize", statusText)}>
                  <span className={cn("size-2 shrink-0 rounded-full", statusDot)} />
                  {status}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Monthly grant</div>
                <div className="mt-1 font-mono font-medium tabular-nums">{grant ? num(grant) : "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Renews</div>
                <div className="mt-1 font-mono font-medium tabular-nums">{sub.current_period_end ? fmtDate(sub.current_period_end) : "—"}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI credit balance meter */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">AI credit balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="numeral text-3xl font-semibold">{num(balance.balance)}</div>
            {grant > 0 && (
              <Meter
                className="mt-3"
                size="md"
                value={balance.balance}
                max={grant}
                tone="primary"
                valueLabel={`${num(balance.balance)} / ${num(grant)} grant · ${num(balance.available)} available`}
              />
            )}
            <div className="mt-3 text-xs text-muted-foreground/70">$1 = 1,000 credits · charged per model at generation time.</div>
          </CardContent>
        </Card>

        {/* Media storage meter */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Media storage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-3xl font-semibold tabular-nums">{storage ? mb(storage.usedBytes) : "—"}</div>
            {storage && storage.limitBytes > 0 && (
              <Meter
                className="mt-3"
                size="md"
                value={storage.usedBytes}
                max={storage.limitBytes}
                // Past 90% the bar is the warning — the number beside it is the
                // same number it was at 40%, and nobody reads two of those.
                tone={storagePct >= 90 ? "danger" : "primary"}
                valueLabel={`${mb(storage.usedBytes)} / ${mb(storage.limitBytes)} used`}
              />
            )}
            {storage && storage.limitBytes < 0 && <div className="mt-3 text-xs text-muted-foreground">Unlimited on this plan.</div>}
            <div className="mt-3 text-xs text-muted-foreground/70">Uploads and generated assets. Deleting media from the library frees it.</div>
          </CardContent>
        </Card>
      </div>

      {/* Plans — a marketplace of what each tier unlocks */}
      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Plans</h2>
          <p className="text-xs text-muted-foreground">Pick the tier that fits — upgrade or downgrade any time.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((p) => {
            const current = p.id === sub.plan_id;
            const rank = (plan?.price_cents ?? 0);
            const dir = p.price_cents > rank ? "up" : p.price_cents < rank ? "down" : "same";
            const feats = planHighlights(p);
            return (
              <div key={p.id}
                className={cn("relative flex flex-col rounded-2xl border p-5", current ? "border-primary shadow-sm ring-1 ring-primary" : "bg-card")}>
                {current && <span className="absolute right-4 top-4 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Current</span>}
                <div className="text-sm font-semibold">{p.name}</div>
                <div className="mt-1.5 flex items-baseline gap-1">
                  <span className="text-2xl font-bold tracking-tight">{p.price_cents === 0 ? "Free" : dollars(p.price_cents)}</span>
                  {p.price_cents > 0 && <span className="text-xs text-muted-foreground">/{p.interval}</span>}
                </div>
                <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-primary">
                  <Sparkles className="size-3" /> {planGrantN(p) > 0 ? `${planGrant(p)} AI credits / mo` : "No AI credits"}
                </div>
                <ul className="mt-4 flex-1 space-y-1.5">
                  {feats.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-[12.5px] text-muted-foreground">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-success" /> <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  variant={current ? "outline" : dir === "up" ? "default" : "secondary"}
                  size="sm"
                  className="mt-5 w-full"
                  disabled={current || busy === p.id}
                  onClick={() => setPending(p)}
                >
                  {current ? "Current plan" : dir === "up" ? "Upgrade" : dir === "down" ? "Downgrade" : "Switch"}
                </Button>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Paid plans renew automatically until cancelled; AI credits are consumed at generation time and are non-refundable. By subscribing you agree to our <LegalLinks onOpen={setLegalDoc} />.
        </p>
      </div>

      {/* Packs + promo */}
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Credit packs</CardTitle>
            <p className="text-xs text-muted-foreground">One-time top-ups. Purchased credits never expire.</p>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {packs.map((pk) => (
              <div key={pk.id} className="flex flex-col items-center rounded-xl border p-4 text-center">
                <div className="font-mono text-xl font-semibold tabular-nums">{num(pk.credits)}</div>
                <div className="mb-3 text-xs text-muted-foreground">credits</div>
                <Button variant="outline" size="sm" className="w-full" disabled={busy === pk.id} onClick={() => purchase(pk.id)}>
                  {dollars(pk.price_cents)}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Redeem a code</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={promo}
                onChange={(e) => setPromo(e.target.value.toUpperCase())}
                placeholder="PROMO CODE"
                className="font-mono uppercase"
              />
              <Button disabled={busy === "promo"} onClick={applyPromo}>Redeem</Button>
            </div>
            {promoMsg && (
              <div className={cn("mt-2 text-xs", promoMsg.ok ? "text-success" : "text-destructive")}>{promoMsg.text}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Ledger */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Credit ledger</CardTitle>
        </CardHeader>
        <CardContent>
          {ledger.length === 0 ? (
            <EmptyState icon={Receipt} title="No activity yet" description="Credit grants, purchases, and AI usage will appear here as they happen." />
          ) : (
            <Group>
              {ledger.map((l) => (
                <Row
                  key={l.id}
                  icon={Receipt}
                  iconTone={l.delta >= 0 ? "success" : "neutral"}
                  sub={`${fmtDate(l.created_at)}${l.ref ? ` · ${l.ref}` : ""}`}
                  value={<span className={l.delta >= 0 ? "text-success" : undefined}>{l.delta >= 0 ? "+" : ""}{num(l.delta)}</span>}
                  valueSub={`balance ${num(l.balance)}`}
                >
                  {reasonLabel(l.reason)}
                </Row>
              ))}
            </Group>
          )}
        </CardContent>
      </Card>

      {downgrade && (
        <DowngradeModal
          planName={downgrade.plan.name}
          violations={downgrade.violations}
          onClose={() => setDowngrade(null)}
        />
      )}
      {pending && (
        <PlanChangeDialog
          target={pending}
          currentPrice={plan?.price_cents ?? 0}
          stripeEnabled={state.stripeEnabled}
          busy={busy === pending.id}
          onConfirm={() => confirmPlan(pending)}
          onClose={() => { if (busy !== pending.id) setPending(null); }}
        />
      )}
      <LegalDialog doc={legalDoc} onClose={() => setLegalDoc(null)} />
    </div>
  );
}

/** Human "what you get" highlights for a plan, from its entitlements blob.
 *  Derived from the shared catalog: quotas with a `billing` formatter list their
 *  value; features with `billing` copy list when enabled (bool on, or a non-empty
 *  allow-list). Add a catalogued feature and it appears here automatically. */
function planHighlights(p: Plan): string[] {
  let ent: { quotas?: Record<string, number>; features?: Record<string, unknown> } = {};
  try { ent = JSON.parse(p.entitlements_json || "{}"); } catch { /* empty */ }
  const q = ent.quotas ?? {};
  const f = ent.features ?? {};
  const out: string[] = [];
  // Capacity lines first (screens, profiles, sources, boards…).
  for (const quota of QUOTA_CATALOG) {
    if (!quota.billing) continue;
    const line = quota.billing(q[quota.key] ?? 0);
    if (line) out.push(line);
  }
  // Then feature lines, in catalog order.
  for (const feat of FEATURE_CATALOG) {
    if (!feat.billing) continue;
    // Every feature is a boolean now — and `=== true` rather than truthiness,
    // to match how the server resolves one. A plan blob carrying `1` or `"true"`
    // does NOT enable the feature there, so advertising it here would promise
    // something the gate refuses.
    if (f[feat.key] === true) out.push(feat.billing);
  }
  return out;
}

/** Confirm-before-switch dialog — no plan ever changes on a single click. */
function PlanChangeDialog({ target, currentPrice, stripeEnabled, busy, onConfirm, onClose }: {
  target: Plan; currentPrice: number; stripeEnabled: boolean; busy: boolean; onConfirm: () => void; onClose: () => void;
}) {
  const paid = target.price_cents > 0;
  const dir = target.price_cents > currentPrice ? "up" : target.price_cents < currentPrice ? "down" : "same";
  const needsPayment = paid && dir === "up";
  const blockedNoStripe = needsPayment && !stripeEnabled;
  const feats = planHighlights(target);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent title={`${dir === "up" ? "Upgrade to" : "Switch to"} ${target.name}`} className="sm:max-w-md">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold tracking-tight">{paid ? dollars(target.price_cents) : "Free"}</span>
          {paid && <span className="text-sm text-muted-foreground">/{target.interval}</span>}
        </div>
        <ul className="space-y-1.5">
          {feats.map((f) => (
            <li key={f} className="flex items-start gap-1.5 text-[13px] text-muted-foreground">
              <Check className="mt-0.5 size-3.5 shrink-0 text-success" /> <span>{f}</span>
            </li>
          ))}
        </ul>
        {blockedNoStripe ? (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[12.5px] text-foreground/80">
            <Lock className="mt-0.5 size-4 shrink-0 text-warning" />
            Online payments aren't enabled yet. Contact us to move onto a paid plan.
          </div>
        ) : needsPayment ? (
          <p className="text-[12.5px] text-muted-foreground">You'll be taken to secure checkout (Stripe) to enter payment. Your plan changes once payment succeeds.</p>
        ) : dir === "down" ? (
          <p className="text-[12.5px] text-muted-foreground">You'll move down to {target.name}. If you're using more than it allows, we'll show what to remove first.</p>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">Confirm switching your workspace to {target.name}.</p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={onConfirm} disabled={busy || blockedNoStripe}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : needsPayment ? <>Continue to checkout <ArrowRight className="size-4" /></> : "Switch plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BillingSkeleton() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardContent className="space-y-4 py-6">
            <Skeleton className="h-8 w-48" />
            <div className="grid grid-cols-3 gap-4 border-t pt-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 py-6">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-1.5 w-full rounded-full" />
            <Skeleton className="h-3 w-40" />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardContent className="grid gap-2.5 py-6 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function DowngradeModal({ planName, violations, onClose }: { planName: string; violations: Violation[]; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent title={<>Can’t downgrade to {planName} yet</>}>
        <p className="text-sm text-muted-foreground">You’re still using more than {planName} allows. Resolve these, then try again:</p>
        <div className="flex flex-col gap-2">
          {violations.map((v, i) => (
            <div key={i} className="flex items-start gap-2.5 rounded-lg border px-3 py-2 text-sm">
              <span className="font-bold text-warning">•</span>
              <span>{violationText(v)}</span>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function violationText(v: Violation): string {
  if (v.type === "quota") return `Remove ${v.removeCount} ${labelResource(v.resource)} (have ${v.have}, limit ${v.max}).`;
  return v.action ?? `Stop using ${labelResource(v.resource)}.`;
}

function labelResource(r: string): string {
  return ({ pairedDevices: "paired screens", channels: "channels", feeds: "feeds", scheduleRules: "schedule rules", liveBoards: "live boards", stations: "stations", roomQueueManagement: "queue/room boards" } as Record<string, string>)[r] ?? r;
}

function reasonLabel(r: string): string {
  return ({ "grant.monthly": "Monthly grant", "pack.purchase": "Credit pack", "promo.redeem": "Promo redeemed", "admin.grant": "Admin adjustment", "admin.adjust": "Admin adjustment", "ai.text": "AI slide", "ai.image": "AI image", "ai.tts": "AI voice", "ai.generation": "AI generation" } as Record<string, string>)[r] ?? r;
}

function planGrantN(p: Plan): number {
  try {
    return (JSON.parse(p.entitlements_json) as { aiCredits?: { monthlyGrant?: number } }).aiCredits?.monthlyGrant ?? 0;
  } catch {
    return 0;
  }
}
function planGrant(p: Plan): string {
  return num(planGrantN(p));
}

function humanPromoError(code: string): string {
  return ({ not_found: "That code doesn’t exist.", inactive: "That code is no longer active.", expired: "That code has expired.", exhausted: "That code has been fully redeemed.", already_redeemed: "You’ve already redeemed this code.", bad_plan: "That code points to a missing plan." } as Record<string, string>)[code] ?? code;
}
