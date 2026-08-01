/** Package editor + redemption codes + promo codes. */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Badge, Field, Textarea, Switch, Sheet, Chip, Select, Page, Stagger, EmptyState, IconBadge, SectionHeader, ConfirmDialog, Reveal, SkeletonHeader, SkeletonList, CreditCard, Ticket, Tag, Trash2, Plus, X, PencilLine, Archive, RotateCcw, AlertTriangle , Group, Row } from "@4dl/ui";
import { CLIENT_FLAG_META, CLIENT_FLAG_CATEGORIES, SELLABLE_CLIENT_FLAG_KEYS, DEFAULT_CLIENT_FLAGS, type ClientFlags } from "@kova/domain";
import { api, errorText } from "../../api.js";
import { useSession } from "../../session.js";
import { FeatureLock } from "../../FeatureLock.js";
import { fmtPrice } from "../../money.js";

type BudgetFeature = "all" | "workout" | "meal";
const BUDGET_FEATURES: readonly BudgetFeature[] = ["all", "workout", "meal"];
type PkgFlags = Partial<Record<keyof ClientFlags, boolean>>;

interface Pkg {
  id: string;
  name: string;
  description?: string | null;
  one_time_price_cents: number | null;
  monthly_price_cents?: number | null;
  installment_months?: number | null;
  pay_link?: string | null;
  budgets: { feature: string; days: number }[];
  addOns?: { addOnTypeId: string; quantity: number }[] | null;
  flags?: PkgFlags | null;
  visibility: string;
  restricted_subject_id?: string | null;
  once_per_customer?: number | null;
}
interface ClientOpt { id: string; displayName: string }
interface AddOnType { id: string; label: string; duration_minutes: number }
interface Code { id: string; code: string; days_to_add: number; target_feature: string; used_count: number; max_uses: number; restricted_package_id?: string | null; restricted_subject_id?: string | null }
interface Promo { id: string; code: string; discount_type: string; percent_off: number | null; amount_off_cents: number | null; redemption_count: number; max_redemptions: number | null; restricted_package_id?: string | null; restricted_subject_id?: string | null; active: number }

/** `marketplace` is what puts a package in every client's in-app Shop, where it
 *  can actually be bought — so it's labelled for that, not "Public" (there is no
 *  public web storefront that renders these). */
const VISIBILITY_LABEL: Record<string, string> = { marketplace: "In client Shop", private: "Grant only", client_specific: "One client" };

const priceLabel = (p: Pkg): string =>
  p.monthly_price_cents ? `${fmtPrice(p.monthly_price_cents)}/mo`
  : p.one_time_price_cents ? `${fmtPrice(p.one_time_price_cents)}${p.installment_months && p.installment_months > 1 ? ` · ${p.installment_months}×` : ""}`
  : "Free";

export function Packages() {
  const { ctx } = useSession();
  const hasCommerce = ctx?.entitlements?.features?.commerce ?? false;
  const [packages, setPackages] = useState<Pkg[] | null>(null);
  const [archived, setArchived] = useState<Pkg[]>([]);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [codes, setCodes] = useState<Code[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [pkgOpen, setPkgOpen] = useState(false);
  const [editing, setEditing] = useState<Pkg | null>(null);
  const [toArchive, setToArchive] = useState<Pkg | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoToDelete, setPromoToDelete] = useState<Promo | null>(null);
  // One row action at a time; its id disables that row's buttons while in flight.
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  // allSettled: a dead promo/roster/archive endpoint degrades one section rather
  // than leaving the whole screen shimmering. Only the live package list is
  // load-critical — if it fails we show a retry instead of a permanent skeleton.
  const load = useCallback(async () => {
    setLoadError(false);
    const [p, arch, c, pr, cl] = await Promise.allSettled([
      api.get<{ packages: Pkg[] }>("/api/packages"),
      api.get<{ packages: Pkg[] }>("/api/packages?archived=1"),
      api.get<{ codes: Code[] }>("/api/redemption-codes"),
      api.get<{ codes: Promo[] }>("/api/promo-codes"),
      api.get<{ clients: ClientOpt[] }>("/api/clients"),
    ]);
    if (p.status === "rejected") { setLoadError(true); return; }
    setPackages(p.value.packages);
    setArchived(arch.status === "fulfilled" ? arch.value.packages : []);
    if (c.status === "fulfilled") setCodes(c.value.codes);
    if (pr.status === "fulfilled") setPromos(pr.value.codes);
    if (cl.status === "fulfilled") setClients(cl.value.clients);
  }, []);
  useEffect(() => { if (hasCommerce) void load(); }, [load, hasCommerce]);

  const deletePromo = async (id: string) => {
    setRowBusy(id); setActionErr(null);
    try { await api.del(`/api/promo-codes/${id}`); await load(); }
    catch (e) { setActionErr(errorText(e, "Couldn't deactivate that promo code.")); }
    finally { setRowBusy(null); }
  };
  // DELETE /packages/:id is an archive, not an erase: it flips `active = 0`, which
  // removes the package from the Shop and both checkout lanes but leaves every
  // subject_subscriptions row alone.
  const archivePkg = async (p: Pkg) => {
    setRowBusy(p.id); setActionErr(null);
    try { await api.del(`/api/packages/${p.id}`); await load(); }
    catch (e) { setActionErr(errorText(e, `Couldn't archive ${p.name}.`)); }
    finally { setRowBusy(null); }
  };
  const restorePkg = async (p: Pkg) => {
    setRowBusy(p.id); setActionErr(null);
    try { await api.patch(`/api/packages/${p.id}`, { active: true }); await load(); }
    catch (e) { setActionErr(errorText(e, `Couldn't put ${p.name} back on sale.`)); }
    finally { setRowBusy(null); }
  };

  return (
    <Page className="column space-y-4 p-4 pb-28">
    <FeatureLock feature="commerce">
      {loadError && !packages ? (
        <EmptyState icon={AlertTriangle} title="Couldn't load your packages" description="Something went wrong reaching the server. Check your connection and try again." action={<Button onClick={() => void load()}>Try again</Button>} />
      ) : (
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
      {actionErr && <p role="status" aria-live="polite" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{actionErr}</p>}

      <SectionHeader icon={CreditCard} tone="primary" title="Packages" action={<Button size="sm" onClick={() => setPkgOpen(true)}><Plus /> New</Button>} />
      {packages.length === 0 ? (
        <EmptyState icon={CreditCard} title="No packages yet" description="Build a package — feature budgets (workout/meal/all) sold once or monthly. $0 packages are comps you grant directly." />
      ) : (
        <Stagger className="space-y-2">
          {packages.map((p) => (
            <Card key={p.id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">{p.name}</div>
                  {p.description && <p className="mt-0.5 text-sm text-muted-foreground">{p.description}</p>}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {p.budgets.map((b, i) => <Badge key={i} tone="activity">{b.days}d {b.feature}</Badge>)}
                    {p.once_per_customer ? <Badge tone="neutral">once per customer</Badge> : null}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="numeral font-semibold">{priceLabel(p)}</div>
                  <Badge tone="neutral">{VISIBILITY_LABEL[p.visibility] ?? p.visibility}</Badge>
                </div>
              </div>
              <div className="flex items-center justify-end gap-1 border-t border-border/50 pt-1">
                <button type="button" onClick={() => setEditing(p)} disabled={rowBusy === p.id} aria-label={`Edit ${p.name}`} className="grid size-12 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50 [&_svg]:size-[1.15rem]"><PencilLine /></button>
                <button type="button" onClick={() => setToArchive(p)} disabled={rowBusy === p.id} aria-label={`Archive ${p.name}`} className="grid size-12 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50 [&_svg]:size-[1.15rem]"><Archive /></button>
              </div>
            </Card>
          ))}
        </Stagger>
      )}

      {archived.length > 0 && (
        <>
          <SectionHeader className="pt-2" icon={Archive} tone="neutral" title="Archived" count={archived.length} />
          <p className="px-1 text-xs text-muted-foreground">Off sale and hidden from every client&rsquo;s Shop. Clients who already bought one keep the days they paid for.</p>
          <Group>
            {archived.map((p) => (
              <Row
                key={p.id}
                sub={priceLabel(p)}
                trailing={
                  <Button size="sm" variant="secondary" disabled={rowBusy === p.id} onClick={() => void restorePkg(p)}>
                    <RotateCcw /> {rowBusy === p.id ? "Restoring…" : "Put back on sale"}
                  </Button>
                }
              >
                {p.name}
              </Row>
            ))}
          </Group>
        </>
      )}

      <SectionHeader className="pt-2" icon={Ticket} tone="primary" title="Redemption codes" action={<Button size="sm" onClick={() => setCodeOpen(true)}><Plus /> Code</Button>} />
      {codes.length === 0 ? <p className="text-sm text-muted-foreground">One-off access codes you can hand to a client to redeem.</p> : (
        <Group>
          {codes.map((c) => (
            <Row
              key={c.id}
              icon={Ticket}
              sub={`${c.days_to_add}d ${c.target_feature} · used ${c.used_count}/${c.max_uses}`}
            >
              <span className="font-mono">{c.code}</span>
            </Row>
          ))}
        </Group>
      )}

      <SectionHeader className="pt-2" icon={Tag} tone="nutrition" title="Promo codes" action={<Button size="sm" onClick={() => setPromoOpen(true)}><Plus /> Promo</Button>} />
      {promos.length === 0 ? <p className="text-sm text-muted-foreground">Discount codes applied at checkout.</p> : (
        <Group>
          {promos.map((p) => (
            <Row
              key={p.id}
              icon={Tag}
              className={p.active ? "" : "opacity-50"}
              sub={`${p.discount_type === "percent" ? `${p.percent_off}% off` : `${fmtPrice(p.amount_off_cents ?? 0)} off`} · used ${p.redemption_count}${p.max_redemptions ? `/${p.max_redemptions}` : ""}`}
              trailing={
                p.active ? (
                  <button type="button" onClick={() => setPromoToDelete(p)} disabled={rowBusy === p.id} aria-label={`Delete promo code ${p.code}`} className="grid size-12 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50 [&_svg]:size-4"><Trash2 /></button>
                ) : <Badge tone="neutral">inactive</Badge>
              }
            >
              <span className="font-mono">{p.code}</span>
            </Row>
          ))}
        </Group>
      )}
        </>
        )}
      </Reveal>
      )}

      {pkgOpen && <PackageSheet clients={clients} onClose={() => setPkgOpen(false)} onSaved={() => { setPkgOpen(false); void load(); }} />}
      {editing && <PackageSheet pkg={editing} clients={clients} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
      {codeOpen && <CodeSheet packages={packages ?? []} clients={clients} onClose={() => setCodeOpen(false)} onSaved={() => { setCodeOpen(false); void load(); }} />}
      {promoOpen && <PromoSheet packages={packages ?? []} clients={clients} onClose={() => setPromoOpen(false)} onSaved={() => { setPromoOpen(false); void load(); }} />}

      <ConfirmDialog
        open={!!toArchive}
        onOpenChange={(o) => !o && setToArchive(null)}
        title={toArchive ? `Archive ${toArchive.name}?` : "Archive package?"}
        description="It comes off sale straight away: it disappears from every client's Shop and can no longer be bought or granted. Clients who already bought it keep every day they paid for — nothing is taken back. You can put it back on sale from Archived at any time."
        confirmLabel="Archive"
        cancelLabel="Keep selling"
        destructive
        onConfirm={() => { if (toArchive) void archivePkg(toArchive); }}
      />

      <ConfirmDialog
        open={!!promoToDelete}
        onOpenChange={(o) => !o && setPromoToDelete(null)}
        title={promoToDelete ? `Delete promo ${promoToDelete.code}?` : "Delete promo code?"}
        description="This deactivates the code so it can no longer be redeemed at checkout."
        confirmLabel="Delete"
        destructive
        onConfirm={() => { if (promoToDelete) void deletePromo(promoToDelete.id); }}
      />
    </FeatureLock>
    </Page>
  );
}

/** Stripe's per-charge ceiling ($999,999.99) — anything above it is a typo. */
const MAX_PRICE_CENTS = 99_999_999;

/**
 * Blank = a free comp, which is legitimate. Anything else must be plain digits:
 * `Number("$99")` / `Number("99 USD")` is NaN, `JSON.stringify` writes NaN as
 * `null`, and the package used to publish as "Free" — after which every client
 * hit a 400 at checkout and was told to ask their coach to finish Stripe setup,
 * pointing the owner at entirely the wrong problem. So an unparseable or absurd
 * price now blocks the save with the real reason.
 */
function parsePrice(raw: string): { cents: number | null; error: string | null } {
  const s = raw.trim();
  if (!s) return { cents: null, error: null };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { cents: null, error: "Digits only — 99 or 99.50. Leave out the $ and any currency code." };
  const cents = Math.round(Number(s) * 100);
  if (!Number.isFinite(cents)) return { cents: null, error: "That isn't a number." };
  if (cents > MAX_PRICE_CENTS) return { cents: null, error: `Keep it under ${fmtPrice(MAX_PRICE_CENTS)}.` };
  return { cents, error: null };
}

/** Cents → the text the price field shows, without a stray ".00" tail. */
const centsToInput = (cents: number | null | undefined): string =>
  cents == null ? "" : cents % 100 === 0 ? String(Math.round(cents / 100)) : (cents / 100).toFixed(2);

/**
 * One sheet for both create and edit. With `pkg` it PATCHes that package
 * (a true partial update server-side — but we send every field so switching
 * price mode clears the column it left behind, and an emptied add-on list
 * actually clears `addons_json`). Without it, POSTs a new one.
 */
function PackageSheet({ pkg, clients, onClose, onSaved }: { pkg?: Pkg | null; clients: ClientOpt[]; onClose: () => void; onSaved: () => void }) {
  const editing = !!pkg;
  const [name, setName] = useState(pkg?.name ?? "");
  const [description, setDescription] = useState(pkg?.description ?? "");
  /**
   * TWO price modes, not three. "Pay in N months" is gone with Stripe Connect:
   * it needs someone to count the payments and then CANCEL the charge, and on a
   * checkout page the studio owns there is nothing we can call to do that. A
   * best-effort attempt would keep billing a client who had finished paying.
   *
   * A studio that wants the same shape prices the package MONTHLY and stops it
   * in their own provider when the term ends — same outcome, same manual step,
   * minus a promise of automation we cannot keep.
   */
  const [priceMode, setPriceMode] = useState<"one_time" | "monthly">(
    pkg?.monthly_price_cents ? "monthly" : "one_time",
  );
  const [price, setPrice] = useState(centsToInput(pkg?.monthly_price_cents ?? pkg?.one_time_price_cents ?? null));
  const [payLink, setPayLink] = useState(pkg?.pay_link ?? "");
  const [budgets, setBudgets] = useState<{ feature: BudgetFeature; days: number }[]>(() => {
    const initial = (pkg?.budgets ?? [])
      .filter((b): b is { feature: BudgetFeature; days: number } => BUDGET_FEATURES.includes(b.feature as BudgetFeature));
    return initial.length ? initial : [{ feature: "all", days: 30 }];
  });
  // Included add-ons (SPEC §7): consultation units the package grants. Only shown
  // when the tenant has defined add-on types (frontDesk). Keyed by type id → qty.
  const [addOnTypes, setAddOnTypes] = useState<AddOnType[]>([]);
  const [addOns, setAddOns] = useState<Record<string, number>>(() => Object.fromEntries((pkg?.addOns ?? []).map((a) => [a.addOnTypeId, a.quantity])));
  const [visibility, setVisibility] = useState<"private" | "marketplace" | "client_specific">(
    pkg?.visibility === "private" || pkg?.visibility === "client_specific" ? pkg.visibility : "marketplace",
  );
  const [restrictedClientId, setRestrictedClientId] = useState(pkg?.restricted_subject_id ?? "");
  const [oncePerCustomer, setOncePerCustomer] = useState(!!pkg?.once_per_customer);
  // Only keys the tenant explicitly toggled land here — untouched flags fall
  // back to the client defaults at resolve time (so a package needn't restate
  // everything). Explicit `false` IS persisted, which is how a tenant carves
  // out a bespoke bundle (e.g. turn AI insights off).
  const [flags, setFlags] = useState<PkgFlags>(pkg?.flags ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { ctx } = useSession();
  const entFeatures = (ctx?.entitlements?.features ?? {}) as Record<string, boolean>;
  const setBudget = (i: number, p: Partial<{ feature: BudgetFeature; days: number }>) => setBudgets((b) => b.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  // Add-on types exist only when the tenant holds `frontDesk`; a 403/empty list
  // just hides the "included add-ons" section.
  useEffect(() => {
    if (!entFeatures.frontDesk) return;
    void api.get<{ addOnTypes: AddOnType[] }>("/api/addon-types").then((r) => setAddOnTypes(r.addOnTypes)).catch(() => undefined);
  }, [entFeatures.frontDesk]);

  const parsed = parsePrice(price);
  // A recurring package with no real amount is nonsense — and the
  // one-time lane is the only place "blank = free comp" is meaningful.
  const priceError = parsed.error
    ?? (priceMode === "monthly" && !parsed.cents ? "A monthly package needs a price."
      : null);
  const badDays = budgets.some((b) => !Number.isInteger(b.days) || b.days < 1);
  const canSave = name.trim().length >= 2 && budgets.length > 0 && !badDays && !priceError
    && !(visibility === "client_specific" && !restrictedClientId);

  const save = async () => {
    if (busy || !canSave) return;
    setBusy(true); setError(null);
    try {
      const includedAddOns = Object.entries(addOns).filter(([, q]) => q > 0).map(([addOnTypeId, quantity]) => ({ addOnTypeId, quantity }));
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        oneTimePriceCents: priceMode === "monthly" ? null : parsed.cents,
        monthlyPriceCents: priceMode === "monthly" ? parsed.cents : null,
        budgets,
        // On an edit always send the array — PATCH leaves omitted keys alone, so
        // `undefined` here would make "I removed every add-on" a silent no-op.
        addOns: editing ? includedAddOns : includedAddOns.length ? includedAddOns : undefined,
        flags: Object.keys(flags).length ? flags : null,
        oncePerCustomer,
        visibility,
        restrictedClientId: visibility === "client_specific" && restrictedClientId ? restrictedClientId : null,
        payLink: payLink.trim() || null,
      };
      if (pkg) await api.patch(`/api/packages/${pkg.id}`, body);
      else await api.post("/api/packages", body);
      onSaved();
    } catch (e) {
      setError(errorText(e, editing ? "Couldn't save those changes." : "Couldn't create that package."));
    } finally { setBusy(false); }
  };

  return (
    <Sheet open onClose={onClose} title={editing ? "Edit package" : "New package"} footer={<Button size="lg" className="w-full" disabled={!canSave || busy} onClick={() => void save()}>
          {busy ? (editing ? "Saving…" : "Creating…") : editing ? "Save changes" : "Create package"}
        </Button>}>
      <div className="space-y-4">
        {editing && <p className="text-sm text-muted-foreground">Changes apply to the Shop right away. Clients who already bought this package keep the access they paid for — editing never touches a live subscription.</p>}
        <Field label="Name" icon={CreditCard} value={name} onChange={(e) => setName(e.target.value)} />
        <div>
          <span className="mb-1.5 block text-sm font-medium text-muted-foreground">Description</span>
          <Textarea rows={2} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One line clients see on the Shop card." />
        </div>
        <div className="flex gap-2">{(["one_time", "monthly"] as const).map((m) => <Chip key={m} selected={priceMode === m} onClick={() => setPriceMode(m)}>{m.replace("_", " ")}</Chip>)}</div>
        <Field
          label={priceMode === "monthly" ? "Price per month (USD)" : "Price (USD, blank = free comp)"}
          value={price}
          inputMode="decimal"
          onChange={(e) => setPrice(e.target.value)}
          error={priceError ?? undefined}
          hint={priceError ? undefined : parsed.cents != null ? `Clients see ${fmtPrice(parsed.cents)}${priceMode === "monthly" ? " per month" : ""}.` : undefined}
        />

        {/* The checkout page for THIS package, on the coach's own provider.
            Per-package because a hosted payment link is fixed-price — one link
            cannot serve a catalogue. Blank is fine and common: the studio
            settles off-platform and confirms by hand. */}
        <Field
          label="Payment link (optional)"
          value={payLink}
          onChange={(e) => setPayLink(e.target.value)}
          placeholder="https://buy.stripe.com/…"
          hint={payLink.trim() ? "Clients are sent here to pay." : "Leave blank to take payment your own way and confirm it yourself."}
        />

        <div className="space-y-2">
          <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Feature budgets</span><button type="button" onClick={() => setBudgets((b) => [...b, { feature: "workout", days: 30 }])} className="text-xs font-medium text-primary">+ Budget</button></div>
          {budgets.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex gap-1">{BUDGET_FEATURES.map((f) => <Chip key={f} selected={b.feature === f} onClick={() => setBudget(i, { feature: f })}>{f}</Chip>)}</div>
              <input type="number" min={1} value={b.days} onChange={(e) => setBudget(i, { days: Number(e.target.value) })} aria-label="Budget days" className="w-16 rounded-lg bg-surface-3 px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/70" />
              <span className="text-xs text-muted-foreground">days</span>
              {budgets.length > 1 && <button type="button" onClick={() => setBudgets((x) => x.filter((_, idx) => idx !== i))} aria-label="Remove budget" className="text-muted-foreground hover:text-danger [&_svg]:size-3.5"><X /></button>}
            </div>
          ))}
          {badDays && <p className="text-xs text-danger">Every budget needs at least 1 day.</p>}
        </div>

        {addOnTypes.length > 0 && (
          <div className="space-y-2">
            <div>
              {/* Same vocabulary as the Sessions screen: "session type", "prepaid
                  sessions". "Add-on units" is the billing model's word, not the
                  coach's. */}
              <span className="text-sm text-muted-foreground">Sessions included</span>
              <p className="text-xs text-muted-foreground/80">How many of each the client gets. Used up when you mark a session complete or a no-show.</p>
            </div>
            {addOnTypes.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0"><div className="text-sm">{t.label}</div><div className="text-xs text-muted-foreground">{t.duration_minutes} min</div></div>
                <input type="number" min={0} value={addOns[t.id] ?? 0} onChange={(e) => setAddOns((p) => ({ ...p, [t.id]: Math.max(0, Number(e.target.value)) }))} className="w-16 rounded-lg bg-surface-3 px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/70" aria-label={`${t.label} sessions included`} />
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <span className="text-sm text-muted-foreground">Client capabilities</span>
            <p className="text-xs text-muted-foreground/80">What this package includes. Plan access also follows the budgets above — a workout-only budget already hides the meal plan.</p>
          </div>
          {CLIENT_FLAG_CATEGORIES.map((cat) => {
            // `SELLABLE_CLIENT_FLAG_KEYS` drops the `reserved` flags — ones the
            // builder used to offer with nothing behind them (no route, no screen),
            // so a tenant could sell a capability the product doesn't have. Stored
            // values on existing packages still resolve; only the toggle is gone.
            const keys = SELLABLE_CLIENT_FLAG_KEYS.filter(
              (k) => CLIENT_FLAG_META[k].category === cat.key && (!CLIENT_FLAG_META[k].requiresFeature || entFeatures[CLIENT_FLAG_META[k].requiresFeature as string]),
            );
            if (!keys.length) return null;
            return (
              <div key={cat.key} className="space-y-1.5 rounded-2xl bg-card p-3">
                <div className="text-micro uppercase text-muted-foreground">{cat.label}</div>
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
        <div className="space-y-2">
          <span className="text-sm text-muted-foreground">Visibility</span>
          <div className="flex flex-wrap gap-2">{([["marketplace", "Client Shop"], ["private", "Grant only"], ["client_specific", "One client"]] as const).map(([v, label]) => <Chip key={v} selected={visibility === v} onClick={() => setVisibility(v)}>{label}</Chip>)}</div>
          <p className="text-xs text-muted-foreground/80">
            {visibility === "marketplace" ? "Listed in every client's Shop tab, where they can buy it themselves."
              : visibility === "private" ? "Never listed. You assign it from a client's Plans & access."
              : "Listed in one client's Shop only, and only they can buy it."}
          </p>
          {visibility === "client_specific" && (
            <Select aria-label="Client" value={restrictedClientId} onChange={setRestrictedClientId} options={[{ value: "", label: "Choose a client…" }, ...clients.map((c) => ({ value: c.id, label: c.displayName }))]} />
          )}
        </div>
        {error && <p role="status" aria-live="polite" className="text-sm text-danger">{error}</p>}
      </div>
    </Sheet>
  );
}

function PromoSheet({ packages, clients, onClose, onSaved }: { packages: Pkg[]; clients: ClientOpt[]; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [restrictedPackageId, setRestrictedPackageId] = useState("");
  const [restrictedClientId, setRestrictedClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Same NaN trap as the package price: "20%" or "$20" used to serialise to null
  // and create a discount that discounts nothing.
  const amount = parsePrice(value);
  const percent = Number(value.trim());
  const valueError = discountType === "amount"
    ? (amount.error ?? (amount.cents ? null : "Enter an amount, e.g. 20."))
    : (!/^\d+$/.test(value.trim()) ? "Whole percent only, 1–100." : percent < 1 || percent > 100 ? "Between 1 and 100." : null);
  const canSave = code.trim().length >= 3 && !valueError;
  const save = async () => {
    if (busy || !canSave) return;
    setBusy(true); setError(null);
    try {
      await api.post("/api/promo-codes", {
        code: code.trim(),
        discountType,
        percentOff: discountType === "percent" ? percent : undefined,
        amountOffCents: discountType === "amount" ? amount.cents : undefined,
        maxRedemptions: maxRedemptions ? Number(maxRedemptions) : undefined,
        restrictedPackageId: restrictedPackageId || undefined,
        restrictedClientId: restrictedClientId || undefined,
      });
      onSaved();
    } catch (e) { setError(errorText(e, "That code already exists.")); } finally { setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title="New promo code" footer={<Button size="lg" className="w-full" disabled={!canSave || busy} onClick={() => void save()}>{busy ? "Creating…" : "Create promo"}</Button>}>
      <div className="space-y-4">
        <Field label="Code" icon={Tag} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SUMMER20" />
        <div className="flex gap-2">{(["percent", "amount"] as const).map((t) => <Chip key={t} selected={discountType === t} onClick={() => setDiscountType(t)}>{t === "percent" ? "% off" : "$ off"}</Chip>)}</div>
        <Field label={discountType === "percent" ? "Percent off" : "Amount off (USD)"} value={value} inputMode="decimal" onChange={(e) => setValue(e.target.value)} error={valueError ?? undefined} />
        <Field label="Max redemptions (blank = unlimited)" value={maxRedemptions} inputMode="numeric" onChange={(e) => setMaxRedemptions(e.target.value.replace(/\D/g, ""))} />
        <div className="space-y-1.5"><span className="text-sm text-muted-foreground">Limit to a package (optional)</span><Select aria-label="Package" value={restrictedPackageId} onChange={setRestrictedPackageId} options={[{ value: "", label: "Any package" }, ...packages.map((p) => ({ value: p.id, label: p.name }))]} /></div>
        <div className="space-y-1.5"><span className="text-sm text-muted-foreground">Limit to a client (optional)</span><Select aria-label="Client" value={restrictedClientId} onChange={setRestrictedClientId} options={[{ value: "", label: "Any client" }, ...clients.map((c) => ({ value: c.id, label: c.displayName }))]} /></div>
        {error && <p role="status" aria-live="polite" className="text-sm text-danger">{error}</p>}
      </div>
    </Sheet>
  );
}

function CodeSheet({ packages, clients, onClose, onSaved }: { packages: Pkg[]; clients: ClientOpt[]; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState("");
  const [days, setDays] = useState("7");
  const [feature, setFeature] = useState<BudgetFeature>("all");
  const [maxUses, setMaxUses] = useState("1");
  const [restrictedPackageId, setRestrictedPackageId] = useState("");
  const [restrictedClientId, setRestrictedClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dayCount = Number(days);
  const daysError = !(Number.isInteger(dayCount) && dayCount >= 1 && dayCount <= 730) ? "Between 1 and 730 days." : null;
  const canSave = code.trim().length >= 4 && !daysError && Number(maxUses) >= 1;
  const save = async () => {
    if (busy || !canSave) return;
    setBusy(true); setError(null);
    try {
      await api.post("/api/redemption-codes", { code: code.trim(), daysToAdd: dayCount, targetFeature: feature, maxUses: Number(maxUses), restrictedPackageId: restrictedPackageId || undefined, restrictedClientId: restrictedClientId || undefined });
      onSaved();
    } catch (e) { setError(errorText(e, "Couldn't create that code — it may already exist.")); } finally { setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title="New redemption code" footer={<Button size="lg" className="w-full" disabled={!canSave || busy} onClick={() => void save()}>{busy ? "Creating…" : "Create code"}</Button>}>
      <div className="space-y-4">
        <Field label="Code" icon={Ticket} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME7" />
        <Field label="Days to add" value={days} inputMode="numeric" onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} error={daysError ?? undefined} />
        <div className="flex gap-2">{BUDGET_FEATURES.map((f) => <Chip key={f} selected={feature === f} onClick={() => setFeature(f)}>{f}</Chip>)}</div>
        <Field label="Max uses" value={maxUses} inputMode="numeric" onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ""))} />
        <div className="space-y-1.5"><span className="text-sm text-muted-foreground">Only for holders of a package (optional)</span><Select aria-label="Package" value={restrictedPackageId} onChange={setRestrictedPackageId} options={[{ value: "", label: "Any package" }, ...packages.map((p) => ({ value: p.id, label: p.name }))]} /></div>
        <div className="space-y-1.5"><span className="text-sm text-muted-foreground">Only for one client (optional)</span><Select aria-label="Client" value={restrictedClientId} onChange={setRestrictedClientId} options={[{ value: "", label: "Any client" }, ...clients.map((c) => ({ value: c.id, label: c.displayName }))]} /></div>
        {error && <p role="status" aria-live="polite" className="text-sm text-danger">{error}</p>}
      </div>
    </Sheet>
  );
}
