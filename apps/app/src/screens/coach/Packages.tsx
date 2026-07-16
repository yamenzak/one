/** Package editor + redemption codes + promo codes. */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Badge, Field, Switch, Sheet, Chip, Page, Stagger, EmptyState, IconBadge, SectionHeader, Reveal, SkeletonHeader, SkeletonList, CreditCard, Ticket, Tag, Trash2, Plus, X } from "@mossa/ui";
import { CLIENT_FLAG_META, CLIENT_FLAG_CATEGORIES, CLIENT_FLAG_KEYS, DEFAULT_CLIENT_FLAGS, type ClientFlags } from "@mossa/domain";
import { api } from "../../api.js";
import { useSession } from "../../session.js";

interface Pkg { id: string; name: string; one_time_price_cents: number | null; monthly_price_cents?: number | null; budgets: { feature: string; days: number }[]; visibility: string }
interface Code { id: string; code: string; days_to_add: number; target_feature: string; used_count: number; max_uses: number }
interface Promo { id: string; code: string; discount_type: string; percent_off: number | null; amount_off_cents: number | null; redemption_count: number; max_redemptions: number | null; active: number }

export function Packages() {
  const [packages, setPackages] = useState<Pkg[] | null>(null);
  const [codes, setCodes] = useState<Code[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [pkgOpen, setPkgOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);

  const load = useCallback(async () => {
    const [p, c, pr] = await Promise.all([api.get<{ packages: Pkg[] }>("/api/packages"), api.get<{ codes: Code[] }>("/api/redemption-codes"), api.get<{ codes: Promo[] }>("/api/promo-codes").catch(() => ({ codes: [] }))]);
    setPackages(p.packages); setCodes(c.codes); setPromos(pr.codes);
  }, []);
  useEffect(() => void load(), [load]);
  const deletePromo = async (id: string) => { await api.del(`/api/promo-codes/${id}`); await load(); };

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <Reveal loading={!packages} className="space-y-4" skeleton={
        <>
          <SkeletonHeader action />
          <SkeletonList card rows={2} thumb={0} />
          <SkeletonHeader action className="pt-2" />
          <SkeletonList card rows={2} thumb={36} />
          <SkeletonHeader action className="pt-2" />
          <SkeletonList card rows={2} thumb={36} />
        </>
      }>
        {packages && (
        <>
      <SectionHeader icon={CreditCard} tone="primary" title="Packages" action={<Button size="sm" onClick={() => setPkgOpen(true)}><Plus /> New</Button>} />
      {packages.length === 0 ? (
        <EmptyState icon={CreditCard} title="No packages yet" description="Build a package — feature budgets (workout/meal/all) sold once or as installments. $0 packages are comps you grant directly." />
      ) : (
        <Stagger className="space-y-2">
          {packages.map((p) => (
            <Card key={p.id} className="flex items-center justify-between">
              <div><div className="font-semibold">{p.name}</div><div className="mt-1 flex flex-wrap gap-1">{p.budgets.map((b, i) => <Badge key={i} tone="activity">{b.days}d {b.feature}</Badge>)}</div></div>
              <div className="text-right"><div className="numeral font-semibold">{p.monthly_price_cents ? `$${(p.monthly_price_cents / 100).toFixed(0)}/mo` : p.one_time_price_cents ? `$${(p.one_time_price_cents / 100).toFixed(0)}` : "Free"}</div><Badge tone="neutral">{p.visibility}</Badge></div>
            </Card>
          ))}
        </Stagger>
      )}

      <SectionHeader className="pt-2" icon={Ticket} tone="primary" title="Redemption codes" action={<Button size="sm" onClick={() => setCodeOpen(true)}><Plus /> Code</Button>} />
      {codes.length === 0 ? <p className="text-sm text-muted-foreground">One-off access codes you can hand to a client to redeem.</p> : (
        <Stagger className="space-y-2">
          {codes.map((c) => (
            <Card key={c.id} className="flex items-center justify-between">
              <div className="flex items-center gap-2.5"><IconBadge icon={Ticket} tone="primary" size="sm" /><div><div className="font-mono font-semibold">{c.code}</div><div className="text-xs text-muted-foreground">{c.days_to_add}d {c.target_feature} · used {c.used_count}/{c.max_uses}</div></div></div>
            </Card>
          ))}
        </Stagger>
      )}

      <SectionHeader className="pt-2" icon={Tag} tone="nutrition" title="Promo codes" action={<Button size="sm" onClick={() => setPromoOpen(true)}><Plus /> Promo</Button>} />
      {promos.length === 0 ? <p className="text-sm text-muted-foreground">Discount codes applied at checkout.</p> : (
        <Stagger className="space-y-2">
          {promos.map((p) => (
            <Card key={p.id} className={`flex items-center justify-between ${p.active ? "" : "opacity-50"}`}>
              <div className="flex items-center gap-2.5"><IconBadge icon={Tag} tone="nutrition" size="sm" /><div><div className="font-mono font-semibold">{p.code}</div><div className="text-xs text-muted-foreground">{p.discount_type === "percent" ? `${p.percent_off}% off` : `$${((p.amount_off_cents ?? 0) / 100).toFixed(0)} off`} · used {p.redemption_count}{p.max_redemptions ? `/${p.max_redemptions}` : ""}</div></div></div>
              {p.active ? <button onClick={() => void deletePromo(p.id)} className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-danger-soft hover:text-danger [&_svg]:size-4"><Trash2 /></button> : <Badge tone="neutral">inactive</Badge>}
            </Card>
          ))}
        </Stagger>
      )}
        </>
        )}
      </Reveal>

      {pkgOpen && <PackageSheet onClose={() => setPkgOpen(false)} onSaved={() => { setPkgOpen(false); void load(); }} />}
      {codeOpen && <CodeSheet onClose={() => setCodeOpen(false)} onSaved={() => { setCodeOpen(false); void load(); }} />}
      {promoOpen && <PromoSheet onClose={() => setPromoOpen(false)} onSaved={() => { setPromoOpen(false); void load(); }} />}
    </Page>
  );
}

function PackageSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [priceMode, setPriceMode] = useState<"one_time" | "monthly" | "installment">("one_time");
  const [price, setPrice] = useState("");
  const [installmentMonths, setInstallmentMonths] = useState("3");
  const [budgets, setBudgets] = useState<{ feature: "all" | "workout" | "meal"; days: number }[]>([{ feature: "all", days: 30 }]);
  const [visibility, setVisibility] = useState<"private" | "marketplace">("marketplace");
  const [oncePerCustomer, setOncePerCustomer] = useState(false);
  // Only keys the tenant explicitly toggled land here — untouched flags fall
  // back to the client defaults at resolve time (so a package needn't restate
  // everything). Explicit `false` IS persisted, which is how a tenant carves
  // out a bespoke bundle (e.g. turn AI insights off).
  const [flags, setFlags] = useState<Partial<Record<keyof ClientFlags, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const { ctx } = useSession();
  const entFeatures = (ctx?.entitlements?.features ?? {}) as Record<string, boolean>;
  const cents = price ? Math.round(Number(price) * 100) : null;
  const setBudget = (i: number, p: Partial<{ feature: "all" | "workout" | "meal"; days: number }>) => setBudgets((b) => b.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  const save = async () => {
    setBusy(true);
    try {
      await api.post("/api/packages", {
        name,
        oneTimePriceCents: priceMode === "one_time" || priceMode === "installment" ? cents : null,
        monthlyPriceCents: priceMode === "monthly" ? cents : null,
        installmentMonths: priceMode === "installment" ? Number(installmentMonths) : null,
        budgets,
        flags: Object.keys(flags).length ? flags : null,
        oncePerCustomer,
        visibility,
      });
      onSaved();
    } finally { setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title="New package">
      <div className="space-y-4">
        <Field label="Name" icon={CreditCard} value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex gap-2">{(["one_time", "monthly", "installment"] as const).map((m) => <Chip key={m} selected={priceMode === m} onClick={() => setPriceMode(m)}>{m.replace("_", " ")}</Chip>)}</div>
        <Field label={priceMode === "monthly" ? "Price per month (USD)" : "Price (USD, blank = free comp)"} value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value)} />
        {priceMode === "installment" && <Field label="Installment months" value={installmentMonths} inputMode="numeric" onChange={(e) => setInstallmentMonths(e.target.value.replace(/\D/g, ""))} />}

        <div className="space-y-2">
          <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Feature budgets</span><button onClick={() => setBudgets((b) => [...b, { feature: "workout", days: 30 }])} className="text-xs font-medium text-primary">+ Budget</button></div>
          {budgets.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex gap-1">{(["all", "workout", "meal"] as const).map((f) => <Chip key={f} selected={b.feature === f} onClick={() => setBudget(i, { feature: f })}>{f}</Chip>)}</div>
              <input type="number" value={b.days} onChange={(e) => setBudget(i, { days: Number(e.target.value) })} className="w-16 rounded-lg bg-surface-3 px-2 py-1.5 text-sm outline-none" />
              <span className="text-xs text-muted-foreground">days</span>
              {budgets.length > 1 && <button onClick={() => setBudgets((x) => x.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-danger [&_svg]:size-3.5"><X /></button>}
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <span className="text-sm text-muted-foreground">Client capabilities</span>
            <p className="text-xs text-muted-foreground/80">What this package includes. Plan access also follows the budgets above — a workout-only budget already hides the meal plan.</p>
          </div>
          {CLIENT_FLAG_CATEGORIES.map((cat) => {
            const keys = CLIENT_FLAG_KEYS.filter(
              (k) => CLIENT_FLAG_META[k].category === cat.key && (!CLIENT_FLAG_META[k].requiresFeature || entFeatures[CLIENT_FLAG_META[k].requiresFeature as string]),
            );
            if (!keys.length) return null;
            return (
              <div key={cat.key} className="space-y-1.5 rounded-2xl bg-card p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat.label}</div>
                {keys.map((k) => {
                  const m = CLIENT_FLAG_META[k];
                  const checked = flags[k] ?? DEFAULT_CLIENT_FLAGS[k];
                  return (
                    <div key={k} className="flex items-center justify-between gap-3">
                      <div className="min-w-0"><div className="text-sm">{m.label}</div><div className="text-xs text-muted-foreground">{m.hint}</div></div>
                      <Switch checked={checked} onCheckedChange={(v) => setFlags((p) => ({ ...p, [k]: v }))} />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between"><span className="text-sm">Once per customer</span><Switch checked={oncePerCustomer} onCheckedChange={setOncePerCustomer} /></div>
        <div className="flex gap-2">{(["marketplace", "private"] as const).map((v) => <Chip key={v} selected={visibility === v} onClick={() => setVisibility(v)}>{v}</Chip>)}</div>
        <Button size="lg" className="w-full" disabled={name.trim().length < 2 || budgets.length === 0 || busy} onClick={() => void save()}>{busy ? "Creating…" : "Create package"}</Button>
      </div>
    </Sheet>
  );
}

function PromoSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setError(null);
    try {
      await api.post("/api/promo-codes", {
        code,
        discountType,
        percentOff: discountType === "percent" ? Number(value) : undefined,
        amountOffCents: discountType === "amount" ? Math.round(Number(value) * 100) : undefined,
        maxRedemptions: maxRedemptions ? Number(maxRedemptions) : undefined,
      });
      onSaved();
    } catch { setError("That code already exists."); } finally { setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title="New promo code">
      <div className="space-y-4">
        <Field label="Code" icon={Tag} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SUMMER20" />
        <div className="flex gap-2">{(["percent", "amount"] as const).map((t) => <Chip key={t} selected={discountType === t} onClick={() => setDiscountType(t)}>{t === "percent" ? "% off" : "$ off"}</Chip>)}</div>
        <Field label={discountType === "percent" ? "Percent off" : "Amount off (USD)"} value={value} inputMode="decimal" onChange={(e) => setValue(e.target.value)} />
        <Field label="Max redemptions (blank = unlimited)" value={maxRedemptions} inputMode="numeric" onChange={(e) => setMaxRedemptions(e.target.value.replace(/\D/g, ""))} />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button size="lg" className="w-full" disabled={code.length < 3 || !value || busy} onClick={() => void save()}>{busy ? "Creating…" : "Create promo"}</Button>
      </div>
    </Sheet>
  );
}

function CodeSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState("");
  const [days, setDays] = useState("7");
  const [feature, setFeature] = useState<"all" | "workout" | "meal">("all");
  const [maxUses, setMaxUses] = useState("1");
  const save = async () => { await api.post("/api/redemption-codes", { code, daysToAdd: Number(days), targetFeature: feature, maxUses: Number(maxUses) }); onSaved(); };
  return (
    <Sheet open onClose={onClose} title="New redemption code">
      <div className="space-y-4">
        <Field label="Code" icon={Ticket} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME7" />
        <Field label="Days to add" value={days} inputMode="numeric" onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} />
        <div className="flex gap-2">{(["all", "workout", "meal"] as const).map((f) => <Chip key={f} selected={feature === f} onClick={() => setFeature(f)}>{f}</Chip>)}</div>
        <Field label="Max uses" value={maxUses} inputMode="numeric" onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ""))} />
        <Button size="lg" className="w-full" disabled={code.length < 4 || !days} onClick={() => void save()}>Create code</Button>
      </div>
    </Sheet>
  );
}
