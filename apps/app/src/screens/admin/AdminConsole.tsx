/** Platform admin console — tenants (comp/top-up/gift), plans, AI, Stripe,
 *  promos, custom domains, security.
 *
 *  House rules this file follows (AGENTS.md §8), because the console is where
 *  breaking them is most expensive:
 *
 *  • Every tab owes the operator four states: skeleton, content, empty, and a
 *    load error WITH a retry. `Reveal` renders its skeleton forever while
 *    `loading` is true, so a fetch whose `.catch` doesn't clear loading is a
 *    permanent skeleton with no way out but a reload.
 *  • Independent sections load independently (`useAdminLoad` per section), so a
 *    dead endpoint degrades one card instead of blanking a tab.
 *  • Every mutating control goes through `useAction`: one in-flight key that
 *    `disabled`s it, one announced result, one announced error. A failed save
 *    must never look identical to a successful one.
 *  • NOTHING about the plan catalog is hardcoded. Plan names, prices, quota keys
 *    and feature keys are rendered from what the API returns; an inactive
 *    (grandfathered) plan and an unknown quota/feature key each render as
 *    themselves rather than breaking the layout.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle, ArrowLeft, Badge, Building2, Button, Callout, Card, ChevronRight, Chip, CircleAlert, CircleCheck,
  ConfirmDialog, CreditCard, EmptyState, Eyebrow, Field, Gift, GlanceStrip, Globe, IconBadge, Info, Input, KeyRound,
  LayoutGrid, Page, Percent, Plus, Reveal, RefreshCw, Search, SectionHeader, SegmentedControl, Sheet, ShieldCheck,
  Skeleton, SkeletonLine, Sparkles, Spinner, Stagger, Switch, Tag, Trash2, Wallet, cn, toneText, type Tone,
  ActionResult, ConfigRow, Group, LoadError, TabIntro, useLoad, useAction as useActionBase,
} from "@mossa/ui";
import { api, errorText } from "../../api.js";
import { fmtPrice } from "../../money.js";

type AdminTab = "tenants" | "plans" | "stripe" | "promos" | "domains" | "ai" | "security";

const TABS: { value: AdminTab; label: string }[] = [
  { value: "tenants", label: "Tenants" },
  { value: "plans", label: "Plans" },
  { value: "ai", label: "AI" },
  { value: "stripe", label: "Stripe" },
  { value: "promos", label: "Promos" },
  { value: "domains", label: "Domains" },
  { value: "security", label: "Security" },
];

export function AdminConsole({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<AdminTab>("tenants");
  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="secondary" onClick={onBack} aria-label="Back"><ArrowLeft /></Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden />
            <h1 className="truncate text-xl font-bold tracking-tight">Platform admin</h1>
          </div>
          <p className="truncate text-xs text-muted-foreground">Mossa itself — every studio, plan, key and switch.</p>
        </div>
      </div>
      <div className="overflow-x-auto no-scrollbar">
        <SegmentedControl options={TABS} value={tab} onChange={setTab} />
      </div>
      {tab === "tenants" && <Tenants />}
      {tab === "plans" && <PlansConfig />}
      {tab === "stripe" && <StripeConfig />}
      {tab === "promos" && <PlatformPromos />}
      {tab === "ai" && <AiConfig />}
      {tab === "domains" && <DomainsConfig />}
      {tab === "security" && <SecurityConfig />}
    </Page>
  );
}

// ── Shared scaffolding ───────────────────────────────────────────────────────

/** One admin GET with an alive guard, an error string, and a retry. Pass a
 *  `useCallback`-stable loader. `loading` is only true before the first settle,
 *  so a retry (or a post-mutation refresh) never flashes the skeleton back over
 *  content that already arrived. */
// The console patterns (useLoad/useAction, LoadError, ActionResult, ConfigRow,
// TabIntro, Group) now live in @mossa/ui so the STUDIO settings render the same
// shapes from the same code rather than a drifting copy. `errorText` is passed in
// because the design system holds no opinion about the app's HTTP error shape.
const useAdminLoad = <T,>(load: () => Promise<T>, what: string) => useLoad(load, what, errorText);
const useAction = () => useActionBase(errorText);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Plan prices arrive as whole/decimal USD per month; render them like every
 *  other price in the app rather than bolting "$" onto a raw number. */
const planUsd = (usdPerMonth: number) => fmtPrice(Math.round((usdPerMonth ?? 0) * 100));

// ── Tenants ──────────────────────────────────────────────────────────────────

interface Tenant { id: string; name: string; slug: string; plan_id: string | null; status: string | null; comp: number | null; createdAt?: string | number | null }
interface PlanBrief { id: string; name: string; priceUsdMonth: number; active: number; tenantCount: number }

/** Subscription statuses are server-side strings; an unfamiliar one renders as
 *  itself in the neutral tone rather than disappearing. */
const STATUS_TONE: Record<string, Tone> = {
  active: "success",
  trialing: "primary",
  past_due: "warning",
  suspended: "danger",
  canceled: "danger",
  unpaid: "danger",
};
const statusTone = (s: string | null): Tone => (s ? STATUS_TONE[s] ?? "neutral" : "neutral");
const statusLabel = (s: string | null): string => (s ? s.replace(/_/g, " ") : "no subscription");

/** `organization.createdAt` is a timestamp, not a date-only column, so a plain
 *  Date parse is safe here — but an unexpected shape must not print "Invalid
 *  Date" into the console. */
const fmtWhen = (v: unknown): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
};

function Tenants() {
  const loadTenants = useCallback(() => api.get<{ tenants: Tenant[] }>("/api/admin/tenants").then((r) => r.tenants ?? []), []);
  const tenants = useAdminLoad(loadTenants, "the studio list");
  // The plan catalog is a SEPARATE loader on purpose: plan names and prices are
  // whatever the API says (never hardcoded here), and if that one call fails the
  // studio list must still render — one dead endpoint degrades one section.
  const loadPlans = useCallback(() => api.get<{ plans: PlanBrief[] }>("/api/admin/plans").then((r) => r.plans ?? []), []);
  const plans = useAdminLoad(loadPlans, "the plan catalog");

  const [query, setQuery] = useState("");
  const [manageId, setManageId] = useState<string | null>(null);
  const [gift, setGift] = useState<{ id: string; name: string } | null>(null);

  const rows = tenants.data ?? [];
  // Derive the open studio from the live list so a comp is reflected in the sheet
  // the moment the list reloads, instead of showing a stale snapshot.
  const manage = manageId ? rows.find((t) => t.id === manageId) ?? null : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((t) => `${t.name} ${t.slug}`.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  const planName = useCallback(
    (id: string | null): string => (id ? plans.data?.find((p) => p.id === id)?.name ?? id : "no plan"),
    [plans.data],
  );

  return (
    <>
      <Stagger className="space-y-3">
        <TabIntro>
          Every studio on the platform. Open one to comp it onto a plan, top up its AI credits, or gift it extra limits.
        </TabIntro>

        {tenants.error && !tenants.data ? (
          <LoadError what="the studios" error={tenants.error} onRetry={tenants.reload} />
        ) : (
          <Reveal
            loading={tenants.loading}
            className="space-y-3"
            skeleton={
              <>
                <Card className="py-4"><div className="flex gap-3">{[0, 1, 2].map((i) => <div key={i} className="flex-1 space-y-2"><SkeletonLine w="60%" h="title" className="mx-auto" /><SkeletonLine w="70%" h="xs" className="mx-auto" /></div>)}</div></Card>
                {Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i} className="flex items-center gap-3 p-4">
                    <Skeleton className="size-9 shrink-0 rounded-2xl" />
                    <div className="min-w-0 flex-1 space-y-1.5"><SkeletonLine w="7rem" h="text" /><SkeletonLine w="4rem" h="xs" /></div>
                    <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
                  </Card>
                ))}
              </>
            }
          >
            <div className="space-y-3">
              <Card className="py-4">
                <GlanceStrip
                  items={[
                    { icon: Building2, tone: "primary", value: rows.length, label: "Studios" },
                    { icon: CircleCheck, tone: "success", value: rows.filter((t) => t.status === "active").length, label: "Active" },
                    { icon: Gift, tone: "sleep", value: rows.filter((t) => !!t.comp).length, label: "Comped" },
                  ]}
                />
              </Card>

              {tenants.error && (
                <Callout tone="warning" icon={AlertTriangle} live="alert">
                  {tenants.error} Showing the last list that loaded.
                </Callout>
              )}

              {rows.length > 6 && (
                <Field label="Find a studio" icon={Search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="name or slug" />
              )}

              {rows.length === 0 ? (
                <EmptyState icon={Building2} title="No studios yet" description="The first owner who signs up and creates a workspace shows up here." />
              ) : filtered.length === 0 ? (
                <EmptyState icon={Search} title="No studio matches" description="Nothing in the list matches that name or slug." />
              ) : (
                filtered.map((t) => (
                  <Card key={t.id} interactive onClick={() => setManageId(t.id)} aria-label={`Manage ${t.name}`} className="flex items-center gap-3 p-4">
                    <IconBadge icon={Building2} tone={t.comp ? "sleep" : "primary"} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{t.name}</div>
                      <div className="truncate text-xs text-muted-foreground">/{t.slug}</div>
                    </div>
                    <div className="flex max-w-[7.5rem] shrink-0 flex-col items-end gap-1">
                      <Badge tone={t.comp ? "sleep" : "primary"} className="max-w-full">
                        <span className="min-w-0 truncate">{planName(t.plan_id)}{t.comp ? " · comp" : ""}</span>
                      </Badge>
                      <span className={cn("text-xs font-medium capitalize", toneText[statusTone(t.status)])}>{statusLabel(t.status)}</span>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Card>
                ))
              )}
            </div>
          </Reveal>
        )}
      </Stagger>

      {manage && (
        <TenantSheet
          tenant={manage}
          plans={plans.data}
          plansError={plans.error}
          onRetryPlans={plans.reload}
          planName={planName}
          onClose={() => setManageId(null)}
          onChanged={tenants.reload}
          onGift={() => { setGift({ id: manage.id, name: manage.name }); setManageId(null); }}
        />
      )}
      {gift && <GiftSheet tenantId={gift.id} name={gift.name} onClose={() => setGift(null)} />}
    </>
  );
}

/** Everything you can do TO one studio, in one place, each action next to the
 *  sentence that says what it costs. */
function TenantSheet({ tenant, plans, plansError, onRetryPlans, planName, onClose, onChanged, onGift }: {
  tenant: Tenant;
  plans: PlanBrief[] | null;
  plansError: string | null;
  onRetryPlans: () => void;
  planName: (id: string | null) => string;
  onClose: () => void;
  onChanged: () => void;
  onGift: () => void;
}) {
  const act = useAction();
  const [credits, setCredits] = useState("");
  const [compTo, setCompTo] = useState<PlanBrief | null>(null);

  // Only a plan that is still on sale can be comped onto — the server resolves
  // the id against the live (active) catalog and 404s otherwise.
  const sellable = (plans ?? []).filter((p) => !!p.active);
  const onRetiredPlan = !!tenant.plan_id && !!plans && !plans.some((p) => p.id === tenant.plan_id && !!p.active);
  const since = fmtWhen(tenant.createdAt);

  const creditsN = Number(credits);
  const creditsValid = Number.isInteger(creditsN) && creditsN > 0;

  const comp = (plan: PlanBrief) =>
    act.run(`comp:${plan.id}`, async () => {
      await api.post(`/api/admin/tenants/${tenant.id}/plan`, { planId: plan.id, comp: true });
      onChanged();
      return `${tenant.name} is on ${plan.name} as a comp, effective now. Its monthly credit grant was applied.`;
    }, "Couldn't change the plan — nothing was changed.");

  const topUp = () =>
    act.run("topup", async () => {
      const view = await api.post<{ balance?: number }>(`/api/admin/tenants/${tenant.id}/topup`, { credits: creditsN });
      setCredits("");
      return typeof view?.balance === "number"
        ? `Added ${plural(creditsN, "credit")} — the balance is now ${view.balance}.`
        : `Added ${plural(creditsN, "credit")}.`;
    }, "Couldn't add credits — the balance is unchanged.");

  return (
    <Sheet open onClose={onClose} title={tenant.name}>
      <div className="space-y-5">
        <div className="space-y-2 rounded-2xl bg-surface-2 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">Workspace</span>
            <span className="min-w-0 truncate text-sm font-medium">/{tenant.slug}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">Plan</span>
            <Badge tone={tenant.comp ? "sleep" : "primary"} className="max-w-[60%]"><span className="min-w-0 truncate">{planName(tenant.plan_id)}{tenant.comp ? " · comp" : ""}</span></Badge>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">Subscription</span>
            <Badge tone={statusTone(tenant.status)} className="capitalize">{statusLabel(tenant.status)}</Badge>
          </div>
          {since && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">Created</span>
              <span className="text-sm font-medium">{since}</span>
            </div>
          )}
        </div>

        <ActionResult msg={act.msg} err={act.err} />

        <Group
          title="Plan"
          hint={<>Comping moves the studio onto a plan <span className="font-semibold text-foreground">immediately, with no charge</span>, and grants that plan&apos;s monthly AI credits. Only plans that are still on sale can be comped onto.</>}
        >
          {plansError ? (
            <Callout tone="warning" icon={AlertTriangle} live="alert">
              <span className="block">{plansError} Without the catalog there is nothing to comp onto.</span>
              <Button size="sm" variant="secondary" className="mt-2 min-h-12" onClick={onRetryPlans}><RefreshCw /> Retry</Button>
            </Callout>
          ) : !plans ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
          ) : sellable.length === 0 ? (
            <Callout tone="neutral" icon={Info}>No plan is on sale right now, so there is nothing to comp onto. Re-activate one in the Plans tab first.</Callout>
          ) : (
            <div className="space-y-2">
              {sellable.map((p) => {
                const current = p.id === tenant.plan_id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={act.busy !== null}
                    onClick={() => setCompTo(p)}
                    aria-label={`Comp ${tenant.name} onto ${p.name}`}
                    className={cn(
                      "flex min-h-14 w-full items-center gap-3 rounded-xl px-3.5 py-2 text-left transition-colors active:scale-[0.99] disabled:opacity-45",
                      current ? "bg-primary/15" : "bg-secondary hover:bg-surface-3",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{p.name}</div>
                      <div className="numeral truncate text-xs text-muted-foreground">{planUsd(p.priceUsdMonth)}/mo · {plural(p.tenantCount, "studio")}</div>
                    </div>
                    {act.busy === `comp:${p.id}`
                      ? <Spinner className="size-4 shrink-0" />
                      : current
                        ? <Badge tone="primary">current</Badge>
                        : <span className="shrink-0 text-xs font-semibold text-primary">Comp</span>}
                  </button>
                );
              })}
            </div>
          )}
          {onRetiredPlan && (
            <Callout tone="warning" icon={Info}>
              This studio is on <span className="font-semibold">{planName(tenant.plan_id)}</span>, which is no longer sold. It keeps those limits until you move it — and you can&apos;t move it back from here.
            </Callout>
          )}
        </Group>

        <Group
          title="AI credits"
          hint="A manual top-up of the studio's spendable balance. Purchased credits never lapse, so this is platform money given away — there is no undo."
        >
          <div className="flex items-end gap-2">
            <Field
              label="Credits to add"
              className="flex-1"
              inputMode="numeric"
              value={credits}
              onChange={(e) => setCredits(e.target.value.replace(/\D/g, ""))}
            />
            <Button className="min-h-12" disabled={!creditsValid || act.busy !== null} onClick={() => void topUp()}>
              {act.busy === "topup" ? <><Spinner className="size-4" /> Adding…</> : <><Wallet /> Add</>}
            </Button>
          </div>
        </Group>

        <Group
          title="Gifted entitlements"
          hint="Raise this studio's limits or unlock a feature above its plan without changing the plan. Grant-only — a gift can never take something away."
        >
          <Button variant="tonal" className="min-h-12 w-full" onClick={onGift}><Gift /> Open the gift editor</Button>
        </Group>
      </div>

      <ConfirmDialog
        open={compTo !== null}
        onOpenChange={(o) => !o && setCompTo(null)}
        title={compTo ? `Comp ${tenant.name} to ${compTo.name}?` : "Comp plan?"}
        description={
          compTo
            ? `This moves the studio onto ${compTo.name} (${planUsd(compTo.priceUsdMonth)}/mo) as a comp — no charge, effective immediately — and grants that plan's monthly AI credits. Any limit the studio is currently over stays over.`
            : undefined
        }
        confirmLabel="Comp plan"
        onConfirm={() => { if (compTo) void comp(compTo); }}
      />
    </Sheet>
  );
}

// ── Entitlements: the matrix editor shared by the plan builder and gifting ────

interface Ent { quotas: Record<string, number>; features: Record<string, boolean>; aiCredits: { monthlyGrant: number } }
interface EntMeta {
  featureKeys: string[];
  quotaKeys: string[];
  /** `reserved` = declared but not enforced by any route yet (roadmap). */
  featureMeta: Record<string, { label: string; hint: string; reserved?: boolean }>;
  quotaMeta: Record<string, { label: string; hint: string; unit?: string }>;
}

function EntitlementFields({ ent, meta, onChange }: { ent: Ent; meta: EntMeta; onChange: (e: Ent) => void }) {
  const setQuota = (k: string, v: number) => onChange({ ...ent, quotas: { ...ent.quotas, [k]: v } });
  const setFeature = (k: string, v: boolean) => onChange({ ...ent, features: { ...ent.features, [k]: v } });
  return (
    <div className="space-y-5">
      <Group title="Limits" hint="A number caps it; ∞ makes it unlimited. Keys come from the platform, so a limit added server-side appears here on its own.">
        <div className="space-y-3">
          {meta.quotaKeys.map((k) => {
            // An unknown key is a new server-side limit, not a bug — label it by
            // its key and say so, rather than rendering a blank row.
            const m = meta.quotaMeta[k] ?? { label: k, hint: "New platform limit — no description yet." };
            const v = ent.quotas[k] ?? 0;
            const unlimited = v < 0;
            return (
              <div key={k} className="flex items-start gap-2">
                <div className="min-w-0 flex-1 pt-1">
                  <div className="text-sm font-medium">{m.label}{m.unit ? <span className="font-normal text-muted-foreground"> ({m.unit})</span> : null}</div>
                  <div className="text-xs leading-snug text-muted-foreground">{m.hint}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setQuota(k, unlimited ? 0 : -1)}
                  aria-pressed={unlimited}
                  aria-label={`${m.label}: unlimited`}
                  className={cn(
                    "grid size-12 shrink-0 place-items-center rounded-xl text-lg font-semibold transition-colors",
                    unlimited ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground hover:bg-surface-3",
                  )}
                >
                  ∞
                </button>
                <Input
                  type="number"
                  min={0}
                  disabled={unlimited}
                  aria-label={m.label}
                  value={unlimited ? "" : v}
                  onChange={(e) => setQuota(k, Math.max(0, Number(e.target.value) || 0))}
                  placeholder={unlimited ? "∞" : ""}
                  className="numeral h-12 w-[4.75rem] shrink-0 px-2.5 text-right text-sm"
                />
              </div>
            );
          })}
        </div>
      </Group>

      <Group title="Features" hint="Each switch is a platform capability gate. A studio's client sees a feature only where this and the client's own package both allow it.">
        <div className="space-y-3">
          {meta.featureKeys.map((k) => {
            const m = meta.featureMeta[k] ?? { label: k, hint: "New platform feature — no description yet." };
            return (
              <div key={k} className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">{m.label}</span>
                    {m.reserved && <Badge tone="warning">not built yet</Badge>}
                  </div>
                  <div className="text-xs leading-snug text-muted-foreground">{m.hint}</div>
                </div>
                <div className="grid size-12 shrink-0 place-items-center">
                  <Switch checked={!!ent.features[k]} onCheckedChange={(val) => setFeature(k, val)} aria-label={m.label} />
                </div>
              </div>
            );
          })}
        </div>
      </Group>

      <Group title="AI credits" hint="Granted at the start of each billing period. The grant is a reset, not a top-up — last period's unused grant lapses.">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Monthly grant</div>
            <div className="text-xs leading-snug text-muted-foreground">Purchased credits are separate and never lapse.</div>
          </div>
          <Input
            type="number"
            min={0}
            aria-label="Monthly AI credit grant"
            value={ent.aiCredits.monthlyGrant}
            onChange={(e) => onChange({ ...ent, aiCredits: { monthlyGrant: Math.max(0, Number(e.target.value) || 0) } })}
            className="numeral h-12 w-24 shrink-0 px-2.5 text-right text-sm"
          />
        </div>
      </Group>
    </div>
  );
}

// ── Plans ────────────────────────────────────────────────────────────────────

interface PlanFull { id: string; name: string; priceUsdMonth: number; active: number; tenantCount: number; entitlements: Ent }

function PlansConfig() {
  const load = useCallback(() => api.get<{ plans: PlanFull[] } & EntMeta>("/api/admin/plans"), []);
  const { data, error, loading, reload } = useAdminLoad(load, "the plan catalog");
  const [edit, setEdit] = useState<PlanFull | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const all = data?.plans ?? [];
  const onSale = all.filter((p) => !!p.active);
  const retired = all.filter((p) => !p.active);

  if (error && !data) {
    return <Stagger><LoadError what="the plans" error={error} onRetry={reload} /></Stagger>;
  }

  return (
    <>
      <Stagger className="space-y-3">
        <TabIntro>
          Each plan is composed from every limit and feature flag the platform knows about. Raising a limit or enabling a
          feature reaches all studios on the plan instantly; lowering one grandfathers the studios already there.
        </TabIntro>

        {saved && <Callout tone="success" icon={CircleCheck} live="status">{saved}</Callout>}

        <Reveal
          loading={loading}
          className="space-y-4"
          skeleton={
            <>
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-9 shrink-0 rounded-2xl" />
                    <div className="flex-1 space-y-1.5"><SkeletonLine w="8rem" h="text" /><SkeletonLine w="5rem" h="xs" /></div>
                    <Skeleton className="h-12 w-20 shrink-0 rounded-xl" />
                  </div>
                  <div className="flex gap-1.5">{[0, 1, 2].map((j) => <Skeleton key={j} className="h-6 w-20 rounded-full" />)}</div>
                </Card>
              ))}
            </>
          }
        >
          {data && (all.length === 0 ? (
            <EmptyState icon={LayoutGrid} title="No plans in the catalog" description="The platform seeds its plans on first use. Reload once a studio has signed up." />
          ) : (
            <>
              <section className="space-y-2">
                <Eyebrow>On sale{onSale.length ? ` · ${onSale.length}` : ""}</Eyebrow>
                {onSale.length === 0 ? (
                  <Callout tone="warning" icon={AlertTriangle}>
                    No plan is on sale, so no studio can subscribe and none can be comped onto a plan.
                  </Callout>
                ) : (
                  onSale.map((p) => <PlanCard key={p.id} plan={p} featureKeys={data.featureKeys} onEdit={() => setEdit(p)} />)
                )}
              </section>

              {retired.length > 0 && (
                <section className="space-y-2">
                  <Eyebrow>No longer sold · {retired.length}</Eyebrow>
                  <p className="px-1 text-xs leading-relaxed text-muted-foreground">
                    Grandfathered: studios already on these keep them and keep working, but nobody new can pick one and
                    they can&apos;t be comped onto. Editing one still applies to the studios that are on it.
                  </p>
                  {retired.map((p) => <PlanCard key={p.id} plan={p} featureKeys={data.featureKeys} onEdit={() => setEdit(p)} />)}
                </section>
              )}
            </>
          ))}
        </Reveal>
      </Stagger>

      {edit && data && (
        <PlanEditSheet
          plan={edit}
          meta={data}
          onClose={() => setEdit(null)}
          onSaved={(message) => { setEdit(null); setSaved(message); reload(); }}
        />
      )}
    </>
  );
}

function PlanCard({ plan, featureKeys, onEdit }: { plan: PlanFull; featureKeys: string[]; onEdit: () => void }) {
  const enabled = featureKeys.filter((k) => plan.entitlements.features[k]).length;
  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <IconBadge icon={LayoutGrid} tone={plan.active ? "primary" : "neutral"} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="min-w-0 truncate font-semibold">{plan.name}</h3>
            {!plan.active && <Badge tone="neutral">not sold</Badge>}
          </div>
          <div className="numeral text-xs text-muted-foreground">{planUsd(plan.priceUsdMonth)} / month</div>
        </div>
        <Button size="sm" variant="secondary" className="min-h-12 shrink-0 rounded-xl" onClick={onEdit} aria-label={`Edit the ${plan.name} plan`}>
          <LayoutGrid /> Edit
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={plan.tenantCount ? "primary" : "neutral"}>{plural(plan.tenantCount, "studio")}</Badge>
        <Badge tone="neutral" className="numeral">{plan.entitlements.aiCredits.monthlyGrant} credits/mo</Badge>
        <Badge tone="neutral">{enabled} of {featureKeys.length} features</Badge>
      </div>
    </Card>
  );
}

function PlanEditSheet({ plan, meta, onClose, onSaved }: { plan: PlanFull; meta: EntMeta; onClose: () => void; onSaved: (message: string) => void }) {
  const [name, setName] = useState(plan.name);
  const [price, setPrice] = useState(String(plan.priceUsdMonth));
  const [ent, setEnt] = useState<Ent>(plan.entitlements);
  const act = useAction();

  const save = () =>
    act.run("save", async () => {
      const r = await api.patch<{ grandfathered: number }>(`/api/admin/plans/${plan.id}`, {
        name,
        priceUsdMonth: Number(price) || 0,
        entitlements: ent,
      });
      // The result is hoisted to the tab: this sheet closes on save, so a message
      // rendered in here would have been unmountedbefore anyone could read it.
      onSaved(
        r.grandfathered
          ? `Saved ${name}. ${plural(r.grandfathered, "existing studio")} kept their old limits.`
          : `Saved ${name} — applied to every studio on the plan.`,
      );
    }, "Couldn't save the plan — nothing was changed.");

  return (
    <Sheet open onClose={onClose} title={`Edit ${plan.name}`}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={plan.active ? "success" : "neutral"}>{plan.active ? "on sale" : "not sold"}</Badge>
          <Badge tone="neutral">{plural(plan.tenantCount, "studio")} on this plan</Badge>
        </div>
        {!plan.active && (
          <Callout tone="neutral" icon={Info}>
            This plan isn&apos;t sold any more. Edits still reach the studios grandfathered onto it.
          </Callout>
        )}
        {plan.tenantCount > 0 && (
          <Callout tone="warning" icon={AlertTriangle}>
            {plural(plan.tenantCount, "studio")} on this plan. Raising a limit or enabling a feature applies to all of
            them at once; lowering one snapshots their current level so nobody loses what they paid for.
          </Callout>
        )}

        <div className="flex gap-2">
          <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
          <Field label="$ / mo" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} className="w-24" />
        </div>

        <EntitlementFields ent={ent} meta={meta} onChange={setEnt} />

        <ActionResult msg={act.msg} err={act.err} />
        <Button size="lg" className="w-full" disabled={act.busy !== null} onClick={() => void save()}>
          {act.busy === "save" ? <><Spinner className="size-5" /> Saving…</> : "Save plan"}
        </Button>
      </div>
    </Sheet>
  );
}

function GiftSheet({ tenantId, name, onClose }: { tenantId: string; name: string; onClose: () => void }) {
  const load = useCallback(
    () => api.get<{ planId: string; effective: Ent } & EntMeta>(`/api/admin/tenants/${tenantId}/entitlements`),
    [tenantId],
  );
  const { data, error, loading, reload } = useAdminLoad(load, "this studio's entitlements");
  const [ent, setEnt] = useState<Ent | null>(null);
  const act = useAction();

  // Seed the editable copy once the server's effective matrix lands (and again
  // after a retry), without stomping edits in progress on a re-render.
  useEffect(() => { if (data) setEnt(data.effective); }, [data]);

  const save = () =>
    act.run("save", async () => {
      if (!ent) return;
      const r = await api.patch<{ effective: Ent }>(`/api/admin/tenants/${tenantId}/overrides`, { grants: ent });
      setEnt(r.effective);
      return "Gifts applied — raises and unlocks only.";
    }, "Couldn't apply the gifts — nothing was changed.");

  const reset = () =>
    act.run("reset", async () => {
      const r = await api.patch<{ effective: Ent }>(`/api/admin/tenants/${tenantId}/overrides`, { reset: true });
      setEnt(r.effective);
      return "Gifts cleared — this studio is back to exactly its plan.";
    }, "Couldn't clear the gifts — nothing was changed.");

  return (
    <Sheet open onClose={onClose} title={`Gift — ${name}`}>
      {error && !data ? (
        <LoadError what="this studio's entitlements" error={error} onRetry={reload} />
      ) : (
        <Reveal
          loading={loading || !ent}
          className="space-y-4"
          skeleton={
            <>
              <SkeletonLine w="90%" h="xs" />
              <div className="space-y-4">
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1 space-y-1.5"><SkeletonLine w="45%" h="text" /><SkeletonLine w="65%" h="xs" /></div>
                      <Skeleton className="size-12 shrink-0 rounded-xl" />
                      <Skeleton className="h-12 w-[4.75rem] shrink-0 rounded-xl" />
                    </div>
                  ))}
                </div>
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1.5"><SkeletonLine w="40%" h="text" /><SkeletonLine w="55%" h="xs" /></div>
                      <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2"><Skeleton className="h-12 flex-1 rounded-xl" /><Skeleton className="h-12 w-32 rounded-xl" /></div>
            </>
          }
        >
          {data && ent && (
            <div className="space-y-5">
              <Callout tone="neutral" icon={Info}>
                On the <span className="font-semibold capitalize">{data.planId}</span> plan. Gifts can only raise a limit
                or unlock a feature — never lower or disable one. A value below the plan simply won&apos;t apply.
              </Callout>

              <EntitlementFields ent={ent} meta={data} onChange={setEnt} />

              <ActionResult msg={act.msg} err={act.err} />
              <div className="flex gap-2">
                <Button className="min-h-12 flex-1" disabled={act.busy !== null} onClick={() => void save()}>
                  {act.busy === "save" ? <><Spinner className="size-4" /> Applying…</> : "Apply gifts"}
                </Button>
                <Button variant="outline" className="min-h-12" disabled={act.busy !== null} onClick={() => void reset()}>
                  {act.busy === "reset" ? <><Spinner className="size-4" /> …</> : "Reset to plan"}
                </Button>
              </div>
            </div>
          )}
        </Reveal>
      )}
    </Sheet>
  );
}

// ── AI ───────────────────────────────────────────────────────────────────────

interface AiStatus { geminiKeySet: boolean; mockMode: string; markup: number; modelCount: number }
interface ModelPricing {
  /** Credits a typical request costs, per lane. */
  costPerRequest: Record<string, number>;
  /** Credits per 1M tokens in / out, after markup. */
  perMillion: { input: number | null; output: number | null };
  /** Credits per billed unit (one image, 1k chars…), after markup. */
  perUnit: { credits: number; kind: string } | null;
}
interface ModelRow { id: string; label: string; provider: string; task: string; input_rate: number | null; output_rate: number | null; unit_rate: number | null; unit_kind: string | null; markup: number | null; enabled: number; is_default: number; pricing?: ModelPricing }

/** The catalog lanes, in the order an operator thinks about them. A lane only
 *  renders if the catalog actually has models for it. */
const TASK_LANES: { task: string; label: string; desc: string }[] = [
  { task: "text", label: "Text", desc: "Plans, meals, articles, summaries." },
  { task: "text-small", label: "Text (small)", desc: "Short factual jobs — food and exercise metadata." },
  { task: "vision", label: "Vision", desc: "Snap-a-Meal, label reader, lab extraction. Gemini only." },
  { task: "image", label: "Image", desc: "Generated cover, food and exercise images." },
  { task: "speech", label: "Speech", desc: "Spoken body-scan cues." },
];
const laneLabel = (task: string) => TASK_LANES.find((l) => l.task === task)?.label ?? task;

const nf = new Intl.NumberFormat("en-US");

/** A model's price in the currency a studio spends: credits for a typical
 *  request of its lane. Null when the catalog has no rates for it yet. */
const requestCost = (m: ModelRow): number | null => {
  const c = m.pricing?.costPerRequest?.[m.task];
  return typeof c === "number" && c > 0 ? c : null;
};

/** The exact credit rate card — per million tokens, or per unit. */
function creditRateLine(m: ModelRow): string | null {
  const p = m.pricing;
  if (!p) return null;
  if (p.perUnit) return `${nf.format(p.perUnit.credits)} cr / ${p.perUnit.kind === "image" ? "image" : p.perUnit.kind}`;
  if (p.perMillion.input === null && p.perMillion.output === null) return null;
  return `${nf.format(p.perMillion.input ?? 0)} / ${nf.format(p.perMillion.output ?? 0)} cr per 1M tok`;
}

/** Providers are server-side strings; an unknown one renders as itself instead
 *  of being mislabelled as Workers AI. */
const PROVIDER_LABEL: Record<string, string> = { google: "Gemini (Google)", "workers-ai": "Workers AI" };
const providerLabel = (p: string) => PROVIDER_LABEL[p] ?? p;

const MOCK_HINT: Record<string, string> = {
  auto: "Mock only where no real provider is configured (and only in development).",
  on: "Every AI call returns fabricated output — and still bills the studio credits.",
  off: "Never mock. A call with no configured provider fails instead.",
};

/** AI provider config — Gemini key, mock mode, credit markup, and the model
 *  catalog synced from the official Cloudflare + Gemini pricing docs. */
function AiConfig() {
  // Two independent loaders: a broken model catalog must not hide the provider
  // form (which is how you'd fix it), and vice versa.
  const loadConfig = useCallback(() => api.get<AiStatus>("/api/admin/ai/config"), []);
  const cfg = useAdminLoad(loadConfig, "the AI configuration");
  const loadModels = useCallback(() => api.get<{ models: ModelRow[] }>("/api/admin/ai/models").then((r) => r.models ?? []), []);
  const models = useAdminLoad(loadModels, "the model catalog");

  const [geminiKey, setGeminiKey] = useState("");
  const [markup, setMarkup] = useState("");
  const provider = useAction();
  const pricing = useAction();
  const catalog = useAction();

  const status = cfg.data;
  // Keep the markup box in step with the server value until the operator edits it.
  useEffect(() => { if (status) setMarkup((m) => (m === "" ? String(status.markup) : m)); }, [status]);

  const saveKey = () =>
    provider.run("key", async () => {
      await api.post("/api/admin/ai/config", { geminiKey });
      setGeminiKey("");
      cfg.reload();
      return "Key saved. Gemini is now available for text, vision and image.";
    }, "Couldn't save the key.");

  const setMock = (mockMode: string) =>
    provider.run(`mock:${mockMode}`, async () => {
      // The server REFUSES `on` outside development — it would fabricate output
      // (lab values included) and bill for it. Without a catch that 400 looked
      // exactly like success while the control snapped back.
      await api.post("/api/admin/ai/config", { mockMode });
      cfg.reload();
      return `Mock mode set to ${mockMode}.`;
    }, "Couldn't change mock mode.");

  const saveMarkup = () => {
    const m = Number(markup);
    if (!(m >= 1 && m <= 100)) {
      pricing.fail("The markup must be between 1× and 100×.");
      return;
    }
    void pricing.run("markup", async () => {
      await api.post("/api/admin/ai/config", { markup: m });
      cfg.reload();
      return `Markup set to ${m}× — applied to every model in the catalog.`;
    }, "Couldn't set the markup.");
  };

  const [syncReport, setSyncReport] = useState<SyncReport | null>(null);
  const sync = () =>
    pricing.run("sync", async () => {
      const r = await api.post<SyncReport>("/api/admin/ai/models/sync", {});
      setSyncReport(r);
      cfg.reload();
      models.reload();
      // The per-provider breakdown is rendered below; keep the one-liner to the
      // headline so "Gemini: 0 parsed" is never hidden behind a generic message.
      const line = r.providers
        .map((p) => (p.error ? `${providerLabel(p.provider)}: ${p.error}` : `${providerLabel(p.provider)}: ${p.parsed} parsed, ${p.added} new, ${p.disabled} switched off`))
        .join(" · ");
      return `${line}. ${plural(r.total, "model")} selectable.`;
    }, "Sync failed — check outbound access to the pricing docs.");

  const patchModel = (m: ModelRow, body: { enabled?: boolean; isDefault?: boolean }, what: string) =>
    catalog.run(`model:${m.id}`, async () => {
      await api.patch(`/api/admin/ai/models/${encodeURIComponent(m.id)}`, body);
      models.reload();
      return `${m.label}: ${what}`;
    }, `Couldn't update ${m.label}.`);

  /** Make `m` the default for its lane. `enabled: true` rides along on purpose:
   *  `modelForTask` only ever selects `enabled = 1`, so a disabled default is
   *  silently ignored and some other model of that lane answers instead — a
   *  default you set and the engine quietly overrules is worse than none. */
  const setDefaultModel = (m: ModelRow) =>
    catalog.run(`lane:${m.task}`, async () => {
      await api.patch(`/api/admin/ai/models/${encodeURIComponent(m.id)}`, { isDefault: true, enabled: true });
      models.reload();
      return `${laneLabel(m.task)} now defaults to ${m.label}.`;
    }, `Couldn't set the ${laneLabel(m.task)} default.`);

  const rate = (m: ModelRow) => (m.unit_kind === "image" ? `${m.unit_rate ?? "?"} n/img` : `${m.input_rate ?? "?"} / ${m.output_rate ?? "?"} n/M`);
  const grouped = (models.data ?? []).reduce<Record<string, ModelRow[]>>((acc, m) => {
    (acc[m.provider] ??= []).push(m);
    return acc;
  }, {});

  return (
    <>
      <Stagger className="space-y-3">
        <TabIntro>Which provider answers an AI call, what it costs the studio in credits, and which models are on.</TabIntro>

        {/* ── Providers ─────────────────────────────────────────────────── */}
        {cfg.error && !status ? (
          <LoadError what="the AI configuration" error={cfg.error} onRetry={cfg.reload} />
        ) : (
          <Reveal
            loading={cfg.loading}
            skeleton={
              <Card className="space-y-3">
                <div className="flex items-center gap-2.5"><Skeleton className="size-9 rounded-2xl" /><SkeletonLine w="8rem" h="title" /></div>
                <SkeletonLine w="95%" h="xs" /><SkeletonLine w="80%" h="xs" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </Card>
            }
          >
            {status && (
              <Card className="space-y-4">
                <SectionHeader
                  icon={Sparkles}
                  title="Providers"
                  action={<Badge tone={status.geminiKeySet ? "success" : "warning"}>{status.geminiKeySet ? "Gemini + Workers AI" : "Workers AI only"}</Badge>}
                />
                <div className="space-y-2.5 rounded-2xl bg-surface-2 p-3.5">
                  <ConfigRow
                    label="Gemini API key"
                    ok={status.geminiKeySet}
                    detail={status.geminiKeySet ? "Text, vision and image (Nano Banana) are available." : "Without it the vision suite and image generation are dead."}
                    okLabel="Stored"
                  />
                  <ConfigRow label="Workers AI" ok detail="Always available on the worker binding, and cheaper." okLabel="Built in" />
                  <ConfigRow
                    label="Model catalog"
                    ok={status.modelCount > 0}
                    detail={status.modelCount > 0 ? `${plural(status.modelCount, "model")} priced and selectable.` : "Empty — run the catalog sync below."}
                    okLabel={`${status.modelCount}`}
                    missingLabel="Empty"
                  />
                </div>

                {cfg.error && <Callout tone="warning" icon={AlertTriangle} live="alert">{cfg.error} Showing the last values that loaded.</Callout>}

                <Group title="Gemini key" hint="A Google AI Studio key. Stored write-only — leaving the box blank keeps whatever is saved.">
                  <Field
                    label={status.geminiKeySet ? "Gemini API key — stored (blank keeps it)" : "Gemini API key"}
                    icon={KeyRound}
                    type="password"
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                  />
                  <Button className="min-h-12 w-full" disabled={!geminiKey || provider.busy !== null} onClick={() => void saveKey()}>
                    {provider.busy === "key" ? <><Spinner className="size-4" /> Saving…</> : "Save key"}
                  </Button>
                </Group>

                <Group title="Mock mode" hint={MOCK_HINT[status.mockMode] ?? "Deterministic offline outputs for development and testing."}>
                  <SegmentedControl
                    fill
                    options={[{ value: "auto", label: "Auto" }, { value: "on", label: "On" }, { value: "off", label: "Off" }]}
                    value={status.mockMode}
                    onChange={(v) => void setMock(v)}
                  />
                  {status.mockMode === "on" && (
                    <Callout tone="danger" icon={AlertTriangle} live="alert">
                      Mock mode is forced on: every AI answer is fabricated — including <code>lab-extract</code> clinical
                      values — and the studio is still billed credits for it.
                    </Callout>
                  )}
                </Group>

                <ActionResult msg={provider.msg} err={provider.err} />
              </Card>
            )}
          </Reveal>
        )}

        {/* ── Pricing ───────────────────────────────────────────────────── */}
        <Card className="space-y-4">
          <SectionHeader icon={Percent} title="Credit pricing" />
          <p className="text-sm text-muted-foreground">
            Every model bills in credits at <span className="font-medium text-foreground">markup × the real provider cost</span>{" "}
            (Cloudflare neurons; Gemini USD converted to the same unit), so the platform is always profitable. Setting the
            markup rewrites it across the whole catalog.
          </p>
          <div className="flex items-end gap-2">
            <Field
              label="Credit markup (×)"
              className="flex-1"
              inputMode="decimal"
              value={markup}
              onChange={(e) => setMarkup(e.target.value.replace(/[^0-9.]/g, ""))}
              hint={status ? `Currently ${status.markup}×` : undefined}
            />
            <Button className="min-h-12" disabled={pricing.busy !== null || markup.trim() === ""} onClick={saveMarkup}>
              {pricing.busy === "markup" ? <><Spinner className="size-4" /> …</> : "Apply"}
            </Button>
          </div>
          <Group
            title="Catalog sync"
            hint="Re-reads the official Cloudflare and Gemini pricing pages: it DISCOVERS models new to the page, refreshes every rate, and switches off any model that has disappeared from its provider's page (never deletes one — a studio may still reference it). Task routing, enable/default and markup choices survive. Each provider is handled on its own, so a failed fetch on one never touches the other's models."
          >
            <Button variant="tonal" className="min-h-12 w-full" disabled={pricing.busy !== null} onClick={() => void sync()}>
              {pricing.busy === "sync" ? <><Spinner className="size-4" /> Syncing…</> : <><RefreshCw /> Sync from the pricing docs</>}
            </Button>
          </Group>
          <ActionResult msg={pricing.msg} err={pricing.err} />
          {syncReport && <SyncReportCard report={syncReport} />}
        </Card>

        {/* ── Model catalog ─────────────────────────────────────────────── */}
        {models.error && !models.data ? (
          <LoadError what="the model catalog" error={models.error} onRetry={models.reload} />
        ) : (
          <Reveal
            loading={models.loading}
            className="space-y-3"
            skeleton={
              <>
                {Array.from({ length: 2 }).map((_, g) => (
                  <Card key={g} className="space-y-2">
                    <div className="flex items-center justify-between"><SkeletonLine w="8rem" h="text" /><Skeleton className="h-5 w-16 rounded-full" /></div>
                    <div className="divide-y divide-border/40">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-2 py-2.5">
                          <Skeleton className="size-12 shrink-0 rounded-xl" />
                          <div className="min-w-0 flex-1 space-y-1.5"><SkeletonLine w="50%" h="text" /><SkeletonLine w="35%" h="xs" /></div>
                          <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </>
            }
          >
            {models.data && (models.data.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                title="No models in the catalog"
                description="Nothing can be generated until the catalog is populated. Run the sync above to pull rates from the pricing docs."
              />
            ) : (
              <div className="space-y-3">
                <ActionResult msg={catalog.msg} err={catalog.err} />
                {models.error && <Callout tone="warning" icon={AlertTriangle} live="alert">{models.error} Showing the last catalog that loaded.</Callout>}
                <DefaultModelPicker models={models.data} busy={catalog.busy} onPick={setDefaultModel} />
                <p className="px-1 text-xs leading-relaxed text-muted-foreground">
                  The switch decides whether a studio can pick a model at all. Prices are what the STUDIO pays:{" "}
                  <span className="numeral">~n cr</span> is a typical request of that model&apos;s lane, and the second
                  line is the exact credit rate card. Neurons and the markup that produced them follow, as the cost basis.
                </p>
                {Object.entries(grouped).map(([prov, rows]) => (
                  <Card key={prov} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 pb-1">
                      <h3 className="min-w-0 truncate text-sm font-semibold">{providerLabel(prov)}</h3>
                      <Badge tone={rows.some((m) => m.enabled === 1) ? "success" : "neutral"}>
                        {rows.filter((m) => m.enabled === 1).length} of {rows.length} on
                      </Badge>
                    </div>
                    <div className="divide-y divide-border/40">
                      {rows.map((m) => {
                        const busy = catalog.busy === `model:${m.id}`;
                        const cost = requestCost(m);
                        const rateLine = creditRateLine(m);
                        return (
                          <div key={m.id} className="flex items-center gap-2.5 py-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="min-w-0 truncate text-sm font-medium">{m.label}</span>
                                {m.is_default === 1 && <Badge tone="primary">default · {laneLabel(m.task)}</Badge>}
                              </div>
                              <div className="numeral truncate text-xs text-foreground/80">
                                {m.task}
                                {cost !== null && <> · <span className="font-semibold">~{nf.format(cost)} cr</span> per request</>}
                                {rateLine && <> · {rateLine}</>}
                              </div>
                              <div className="numeral truncate text-xs text-muted-foreground">{rate(m)} · {m.markup ?? "?"}×</div>
                            </div>
                            {busy
                              ? <Spinner className="size-4 shrink-0" />
                              : <Switch
                                  checked={m.enabled === 1}
                                  disabled={catalog.busy !== null}
                                  aria-label={`${m.label} enabled`}
                                  onCheckedChange={(v) => void patchModel(m, { enabled: v }, v ? "enabled" : "disabled")}
                                />}
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                ))}
              </div>
            ))}
          </Reveal>
        )}

        {/* ── Live self-test ────────────────────────────────────────────── */}
        <AiSelfTest models={models.data ?? []} />
      </Stagger>
    </>
  );
}

/**
 * The default model for each lane, as a straight list of selectors.
 *
 * This replaced a radio circle on every catalog row. The circle was accurate
 * and unreadable: "which model answers a plan draft today?" meant scanning
 * every provider group for a filled dot, and the answer to "one default per
 * task" was nowhere on screen. A selector per lane states the question and the
 * answer in one line — and prices the options while it asks.
 */
function DefaultModelPicker({ models, busy, onPick }: { models: ModelRow[]; busy: string | null; onPick: (m: ModelRow) => void }) {
  // Vision is served by ANY Gemini model (they are all multimodal), but
  // `is_default` is scoped to a model's own task server-side (`UPDATE ai_models
  // SET is_default = 0 WHERE task = ?`), so only an exact-lane row can be
  // pinned. When the vision lane has no pinned row the engine still answers —
  // `preferredModelForTask` widens to the Gemini text lanes — so name what will
  // actually run instead of claiming the lane is broken.
  const visionFallback = models.find((m) => m.provider === "google" && m.enabled === 1 && (m.task === "text" || m.task === "text-small") && m.is_default === 1)
    ?? models.find((m) => m.provider === "google" && m.enabled === 1 && (m.task === "text" || m.task === "text-small"))
    ?? null;

  const lanes = TASK_LANES.map((lane) => {
    const options = models.filter((m) => m.task === lane.task);
    if (!options.length) return null;
    const pinned = options.find((m) => m.is_default === 1 && m.enabled === 1) ?? null;
    const current = pinned
      ?? options.find((m) => m.is_default === 1)
      // What the engine falls back to: first enabled row of the lane.
      ?? options.find((m) => m.enabled === 1)
      ?? null;
    return { lane, options, current, pinned, fallback: lane.task === "vision" ? visionFallback : null };
  }).filter((l): l is NonNullable<typeof l> => !!l);
  if (!lanes.length) return null;

  return (
    <Card className="space-y-3">
      <SectionHeader icon={CircleCheck} title="Default models" />
      <p className="text-sm text-muted-foreground">
        What answers each kind of call when a studio hasn&apos;t chosen its own model — which is most of them. Picking
        one here switches it on too, since the engine only ever serves an enabled model.
      </p>
      <div className="space-y-2.5">
        {lanes.map(({ lane, options, current, pinned, fallback }) => (
          <div key={lane.task} className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">{lane.label}</div>
                <div className="truncate text-xs text-muted-foreground">{lane.desc}</div>
              </div>
              {busy === `lane:${lane.task}` ? <Spinner className="size-4 shrink-0" /> : (
                <select
                  aria-label={`Default model for ${lane.label}`}
                  value={current?.id ?? ""}
                  disabled={busy !== null}
                  onChange={(e) => { const m = options.find((x) => x.id === e.target.value); if (m) onPick(m); }}
                  className="max-w-[52%] shrink-0 truncate rounded-lg bg-surface-2 px-3 py-1.5 text-sm outline-none disabled:opacity-60"
                >
                  {!current && <option value="">Choose a model…</option>}
                  {options.map((m) => {
                    const cost = requestCost(m);
                    return (
                      <option key={m.id} value={m.id}>
                        {m.label}{cost !== null ? ` — ~${nf.format(cost)} cr` : ""}{m.enabled === 1 ? "" : " (off)"}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>
            {!pinned && (
              fallback ? (
                // Vision with nothing pinned: any Gemini model reads images, so
                // this is a working configuration, not a fault.
                <p className="text-xs text-muted-foreground">
                  Nothing pinned — <b className="text-foreground">{fallback.label}</b> answers it (every Gemini model
                  reads images). Pin one above to fix it.
                </p>
              ) : (
                <p className="text-xs text-warning">
                  No enabled default — the engine is falling back to{" "}
                  {current ? <b>{current.label}</b> : <>nothing, and this lane will fail</>}. Pick one to pin it.
                </p>
              )
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Catalog sync report ──────────────────────────────────────────────────────

interface ProviderSyncReport {
  provider: string;
  source: string;
  ok: boolean;
  parsed: number;
  added: number;
  addedIds: string[];
  updated: number;
  disabled: number;
  disabledIds: string[];
  unpriceable: { id: string; reason: string }[];
  error: string | null;
}
interface SyncReport { ok: boolean; providers: ProviderSyncReport[]; total: number; errors: string[] }

/** What the last sync actually did, per provider. A generic "sync failed" hides
 *  the one thing an operator needs — WHICH source broke and what it cost them. */
function SyncReportCard({ report }: { report: SyncReport }) {
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      {report.providers.map((p) => (
        <div key={p.provider} className="rounded-2xl bg-surface-2 p-3 text-xs">
          <div className="flex items-center justify-between gap-2 pb-1">
            <span className="min-w-0 truncate text-sm font-semibold">{providerLabel(p.provider)}</span>
            <Badge tone={p.error ? "danger" : "success"}>{p.error ? "not reconciled" : `${p.parsed} parsed`}</Badge>
          </div>
          {p.error ? (
            <p className="leading-relaxed text-danger">{p.error}</p>
          ) : (
            <p className="leading-relaxed text-muted-foreground">
              <span className="numeral">{p.added}</span> new · <span className="numeral">{p.updated}</span> re-priced ·{" "}
              <span className={cn("numeral", p.disabled > 0 && "font-semibold text-foreground")}>{p.disabled}</span> switched off
              {p.disabledIds.length > 0 && <> — {p.disabledIds.slice(0, 6).join(", ")}{p.disabledIds.length > 6 ? "…" : ""}</>}
            </p>
          )}
          {p.addedIds.length > 0 && (
            <p className="pt-1 leading-relaxed text-muted-foreground">New: {p.addedIds.slice(0, 8).join(", ")}{p.addedIds.length > 8 ? ` +${p.addedIds.length - 8} more` : ""}</p>
          )}
          {p.unpriceable.length > 0 && (
            <details className="pt-1.5">
              <summary className="min-h-6 cursor-pointer text-muted-foreground">{plural(p.unpriceable.length, "model")} on the page could not be priced</summary>
              <ul className="space-y-1 pt-1.5">
                {p.unpriceable.map((u) => (
                  <li key={u.id} className="leading-relaxed text-muted-foreground"><span className="font-medium text-foreground">{u.id}</span> — {u.reason}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

// ── AI self-test ─────────────────────────────────────────────────────────────

interface SelfTestPlanRun {
  check: string; label: string; feature: string; task: string;
  modelId: string; modelLabel: string; provider: string; estimatedCredits: number;
}
interface SelfTestPlan {
  scope: string;
  runs: SelfTestPlanRun[];
  truncated: number;
  maxRuns: number;
  totalEstimatedCredits: number;
  geminiKeySet: boolean;
  mockMode: string;
  willMock: Record<string, boolean>;
}
interface SelfTestResult {
  check: string; label: string; feature: string; task: string;
  modelId: string; modelLabel: string; provider: string;
  status: "pass" | "fail" | "unsupported" | "blocked";
  failure: string | null;
  detail: string | null;
  latencyMs: number;
  credits: number;
  mocked: boolean;
  excerpt: string;
  summary: string | null;
}

type SelfTestScope = "default" | "compare" | "workers-ai" | "google" | "model";

const SCOPE_OPTIONS: { value: SelfTestScope; label: string }[] = [
  { value: "default", label: "As shipped" },
  { value: "compare", label: "Compare" },
  { value: "workers-ai", label: "Workers AI" },
  { value: "google", label: "Gemini" },
  { value: "model", label: "One model" },
];

const SCOPE_HINT: Record<SelfTestScope, string> = {
  default: "Exactly the model each feature would use right now — the studio's real experience.",
  compare: "The same prompt on the default Workers AI model and the default Gemini model, side by side per check.",
  "workers-ai": "Every check on the default Workers AI model for its task.",
  google: "Every check on the default Gemini model for its task.",
  model: "Every check the chosen model can serve.",
};

const CHECK_TONE: Record<SelfTestResult["status"], Tone> = { pass: "success", fail: "danger", unsupported: "neutral", blocked: "warning" };
const CHECK_LABEL: Record<SelfTestResult["status"], string> = { pass: "Pass", fail: "Fail", unsupported: "N/A", blocked: "Blocked" };

/** Why a check failed, in words an operator can act on. */
const FAILURE_LABEL: Record<string, string> = {
  feature_off: "feature switched off in AI settings",
  not_configured: "no provider configured for this lane",
  not_supported: "not supported on this provider",
  insufficient_credits: "the studio is out of credits",
  transport: "the call never completed (timeout / network)",
  provider: "the provider returned an error",
  empty: "the model answered with nothing (no credits charged)",
  unparseable_json: "the answer was not JSON the product can read",
  schema: "valid JSON, wrong shape for this feature",
};

/**
 * Run the product's real AI prompts against real models and show what comes
 * back. Spends real credits, so the plan (and its cost) is shown first and the
 * button says what it will spend. Runs are issued ONE AT A TIME so a slow
 * provider shows as progress rather than a frozen button.
 */
function AiSelfTest({ models }: { models: ModelRow[] }) {
  const [scope, setScope] = useState<SelfTestScope>("default");
  const [pickedModel, setPickedModel] = useState("");
  const [results, setResults] = useState<SelfTestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const query = useMemo(() => {
    if (scope === "compare" || scope === "default") return `scope=${scope}`;
    if (scope === "model") return `scope=model&modelId=${encodeURIComponent(pickedModel)}`;
    return `scope=provider&provider=${scope}`;
  }, [scope, pickedModel]);
  const loadPlan = useCallback(() => api.get<SelfTestPlan>(`/api/admin/ai/selftest?${query}`), [query]);
  const plan = useAdminLoad(loadPlan, "the self-test plan");

  const runs = plan.data?.runs ?? [];
  const willMock = plan.data?.willMock ?? {};
  const mockedProviders = runs.filter((r) => willMock[r.provider]).map((r) => r.provider);
  const anyMock = mockedProviders.length > 0;

  const run = async () => {
    setRunning(true);
    setResults([]);
    setDone(0);
    setErr(null);
    setNote(null);
    try {
      const acc: SelfTestResult[] = [];
      for (const r of runs) {
        const out = await api.post<{ results: SelfTestResult[]; stopped: string | null }>("/api/admin/ai/selftest", {
          runs: [{ check: r.check, modelId: r.modelId }],
        });
        acc.push(...out.results);
        setResults([...acc]);
        setDone(acc.length);
        if (out.stopped) { setNote(out.stopped); break; }
      }
    } catch (e) {
      setErr(errorText(e, "The self-test couldn't run."));
    } finally {
      setRunning(false);
    }
  };

  const spent = results.reduce((n, r) => n + r.credits, 0);
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  // Group by check so the same prompt on two providers sits adjacent.
  const byCheck = results.reduce<{ label: string; rows: SelfTestResult[] }[]>((acc, r) => {
    const g = acc.find((x) => x.label === r.label);
    if (g) g.rows.push(r);
    else acc.push({ label: r.label, rows: [r] });
    return acc;
  }, []);

  return (
    <Card className="space-y-4">
      <SectionHeader icon={Sparkles} title="Live self-test" />
      <p className="text-sm text-muted-foreground">
        Runs the product's <span className="font-medium text-foreground">real prompts</span> — a plan draft, a food parse,
        a check-in summary, an exercise auto-fill, a nutrition estimate and a vision call — through the normal metered
        path, then validates each answer with the same parser the feature uses. A 200 that comes back as prose is a{" "}
        <span className="font-medium text-foreground">failure</span> here, because it is one for a coach.
      </p>
      <Callout tone="warning" icon={AlertTriangle}>
        This spends real credits from the studio you are currently switched into. Nothing is faked or refunded.
      </Callout>

      <Group title="What to run" hint={SCOPE_HINT[scope]}>
        <div className="overflow-x-auto no-scrollbar">
          <SegmentedControl options={SCOPE_OPTIONS} value={scope} onChange={(v) => setScope(v as SelfTestScope)} />
        </div>
        {scope === "model" && (
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Model</span>
            <select
              className="min-h-12 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm"
              value={pickedModel}
              onChange={(e) => setPickedModel(e.target.value)}
            >
              <option value="">Choose a model…</option>
              {models.filter((m) => m.enabled === 1).map((m) => (
                <option key={m.id} value={m.id}>{providerLabel(m.provider)} — {m.label} ({m.task})</option>
              ))}
            </select>
          </label>
        )}
      </Group>

      {plan.error && !plan.data ? (
        <LoadError what="the self-test plan" error={plan.error} onRetry={plan.reload} />
      ) : (
        <Reveal loading={plan.loading} skeleton={<Skeleton className="h-24 w-full rounded-2xl" />}>
          {plan.data && (
            <div className="space-y-3">
              <div className="rounded-2xl bg-surface-2 p-3 text-sm">
                {runs.length === 0 ? (
                  <p className="text-muted-foreground">Nothing to run — no enabled model matches that choice.</p>
                ) : (
                  <p className="text-muted-foreground">
                    <span className="numeral font-semibold text-foreground">{plural(runs.length, "check")}</span> ·
                    estimated at most{" "}
                    <span className="numeral font-semibold text-foreground">{plural(plan.data.totalEstimatedCredits, "credit")}</span>
                    {plan.data.truncated > 0 && <> · {plan.data.truncated} further run(s) trimmed at the {plan.data.maxRuns}-run cap</>}
                  </p>
                )}
              </div>

              {anyMock && (
                <Callout tone="warning" icon={AlertTriangle}>
                  {[...new Set(mockedProviders)].map(providerLabel).join(" and ")} will answer from the{" "}
                  <b>canned mock</b> ({plan.data.mockMode === "on" ? "mock mode is forced on" : "no real provider is configured"}),
                  so those rows prove the plumbing and the billing — not the model.
                </Callout>
              )}

              <Button
                className="min-h-12 w-full"
                disabled={running || runs.length === 0}
                onClick={() => void run()}
              >
                {running
                  ? <><Spinner className="size-4" /> Running check {Math.min(done + 1, runs.length)} of {runs.length}…</>
                  : <>Run {plural(runs.length, "check")} · spend up to {plural(plan.data.totalEstimatedCredits, "credit")}</>}
              </Button>
            </div>
          )}
        </Reveal>
      )}

      {running && (
        <div role="status" aria-live="polite" className="text-xs text-muted-foreground">
          {done} of {runs.length} finished. Providers can take 20-60 seconds each — this is not stuck.
        </div>
      )}
      {err && <Callout tone="danger" icon={AlertTriangle} live="alert">{err}</Callout>}
      {note && <Callout tone="warning" icon={AlertTriangle} live="alert">{note}</Callout>}

      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5" role="status" aria-live="polite">
            <Badge tone={failed > 0 ? "danger" : "success"}>{passed} passed</Badge>
            {failed > 0 && <Badge tone="danger">{failed} failed</Badge>}
            <Badge tone="neutral">{plural(spent, "credit")} spent</Badge>
            {results.some((r) => r.mocked) && <Badge tone="warning">mocked</Badge>}
          </div>
          {byCheck.map((g) => (
            <div key={g.label} className="space-y-1.5 rounded-2xl bg-surface-2 p-3">
              <h4 className="text-sm font-semibold">{g.label}</h4>
              {g.rows.map((r) => (
                <div key={`${r.check}:${r.modelId}`} className="space-y-1 border-t border-border/40 pt-2 first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={CHECK_TONE[r.status]}>{CHECK_LABEL[r.status]}</Badge>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.modelLabel}</span>
                    {r.mocked && <Badge tone="warning">mock</Badge>}
                  </div>
                  <div className="numeral text-xs text-muted-foreground">
                    {providerLabel(r.provider)} · {r.modelId} · {r.latencyMs} ms · {plural(r.credits, "credit")}
                  </div>
                  {r.status === "pass" && r.summary && <p className="text-xs text-muted-foreground">{r.summary}</p>}
                  {r.failure && (
                    <p className={cn("text-xs leading-relaxed", toneText[CHECK_TONE[r.status]])}>
                      <b>{FAILURE_LABEL[r.failure] ?? r.failure}</b>{r.detail ? ` — ${r.detail}` : ""}
                    </p>
                  )}
                  {r.excerpt && (
                    <details>
                      <summary className="min-h-6 cursor-pointer text-xs text-muted-foreground">What the model said</summary>
                      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-surface-1 p-2 text-[11px] leading-relaxed">{r.excerpt}</pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Domains (Cloudflare for SaaS, SPEC §14.1) ────────────────────────────────

interface DomainStatus { configured: boolean; zoneId: string | null; cnameTarget: string | null; tokenSet: boolean }

function DomainsConfig() {
  const load = useCallback(() => api.get<DomainStatus>("/api/admin/domains/config"), []);
  const { data: status, error, loading, reload } = useAdminLoad(load, "the custom-domain configuration");
  const [apiToken, setApiToken] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [cnameTarget, setCnameTarget] = useState("");
  const [seeded, setSeeded] = useState(false);
  const act = useAction();

  // Prefill the public fields from the server once; never stomp typing.
  useEffect(() => {
    if (status && !seeded) {
      setZoneId(status.zoneId ?? "");
      setCnameTarget(status.cnameTarget ?? "");
      setSeeded(true);
    }
  }, [status, seeded]);

  const save = () =>
    act.run("save", async () => {
      // Send only what is filled in — the token is write-only, so an empty box
      // must keep the stored one rather than clear it.
      const body: Record<string, string> = {};
      if (apiToken) body.apiToken = apiToken;
      if (zoneId) body.zoneId = zoneId;
      if (cnameTarget) body.cnameTarget = cnameTarget;
      await api.post("/api/admin/domains/config", body);
      setApiToken("");
      reload();
      return "Saved. Studios can add custom domains from their own Settings.";
    }, "Couldn't save the Cloudflare for SaaS credentials.");

  if (error && !status) {
    return <Stagger><LoadError what="the custom-domain configuration" error={error} onRetry={reload} /></Stagger>;
  }

  const partial = !!status && !status.configured && (status.tokenSet || !!status.zoneId || !!status.cnameTarget);

  return (
    <Stagger className="space-y-3">
      <TabIntro>Cloudflare for SaaS: the credentials that let a studio serve the app on its own domain.</TabIntro>
      <Reveal
        loading={loading}
        skeleton={
          <Card className="space-y-3">
            <div className="flex items-center gap-2.5"><Skeleton className="size-9 rounded-2xl" /><SkeletonLine w="10rem" h="title" /></div>
            <Skeleton className="h-24 w-full rounded-2xl" />
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
          </Card>
        }
      >
        {status && (
          <Card className="space-y-4">
            <SectionHeader
              icon={Globe}
              title="Cloudflare for SaaS"
              action={<Badge tone={status.configured ? "success" : partial ? "warning" : "neutral"}>{status.configured ? "enabled" : partial ? "incomplete" : "off"}</Badge>}
            />
            <p className="text-sm text-muted-foreground">
              All three parts are needed: a zone API token with <span className="font-medium text-foreground">SSL and Certificates · Edit</span>,
              the SaaS-enabled zone id, and the CNAME target studios point their domain at.
            </p>

            <div className="space-y-2.5 rounded-2xl bg-surface-2 p-3.5">
              <ConfigRow label="API token" ok={status.tokenSet} detail="Write-only — never echoed back." okLabel="Stored" />
              <ConfigRow label="Zone id" ok={!!status.zoneId} detail={status.zoneId ?? "The zone with Custom Hostnames enabled."} />
              <ConfigRow label="CNAME target" ok={!!status.cnameTarget} detail={status.cnameTarget ?? "The hostname studios CNAME their domain to."} />
            </div>

            {partial && (
              <Callout tone="warning" icon={AlertTriangle} live="alert">
                Partly configured — custom domains stay off until all three are stored, and a studio that adds one will
                see it never verify.
              </Callout>
            )}
            {status.configured && (
              <Callout tone="success" icon={CircleCheck}>
                Ready. A studio adding a domain gets a certificate issued and its own WebAuthn relying party.
              </Callout>
            )}

            <Group title="One-time Cloudflare setup" hint="These two steps can't be done from here — do them in the Cloudflare dashboard first. Full walkthrough in DEPLOY.md.">
              <ol className="space-y-1.5 rounded-xl bg-surface-2 p-3 text-xs leading-relaxed text-muted-foreground">
                <li><span className="font-medium text-foreground">1.</span> On the serving zone → SSL/TLS → Custom Hostnames → <span className="font-medium">Enable</span>, and set a Fallback Origin (e.g. <code className="rounded bg-surface-3 px-1">ssl.mossa.4dl.app</code> → CNAME <code className="rounded bg-surface-3 px-1">mossa.4dl.app</code>, proxied).</li>
                <li><span className="font-medium text-foreground">2.</span> Create an API token scoped to that zone with <span className="font-medium">SSL and Certificates · Edit</span>.</li>
              </ol>
            </Group>

            <Group title="Credentials">
              <Field
                label={status.tokenSet ? "API token — stored (blank keeps it)" : "API token"}
                icon={KeyRound}
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
              />
              <Field label="Zone id" value={zoneId} onChange={(e) => setZoneId(e.target.value)} />
              <Field label="CNAME target" icon={Globe} value={cnameTarget} onChange={(e) => setCnameTarget(e.target.value)} placeholder="ssl.mossa.4dl.app" />
              <Button className="min-h-12 w-full" disabled={act.busy !== null || (!apiToken && !zoneId && !cnameTarget)} onClick={() => void save()}>
                {act.busy === "save" ? <><Spinner className="size-4" /> Saving…</> : "Save"}
              </Button>
            </Group>

            {error && <Callout tone="warning" icon={AlertTriangle} live="alert">{error} Showing the last values that loaded.</Callout>}
            <ActionResult msg={act.msg} err={act.err} />
          </Card>
        )}
      </Reveal>
    </Stagger>
  );
}

// ── Security ─────────────────────────────────────────────────────────────────

interface TurnstileStatus { siteKey: string | null; secretSet: boolean }

/** Cloudflare Turnstile — the bot check on the OTP-send path. Off until a
 *  secret is saved; the site key is handed to the login screen via /api/host.
 *  A secret with NO site key is a lockout: the server demands a token the login
 *  screen has no widget to produce, so nobody can sign in. */
function SecurityConfig() {
  const load = useCallback(() => api.get<TurnstileStatus>("/api/admin/turnstile/config"), []);
  const { data: status, error, loading, reload } = useAdminLoad(load, "the Turnstile configuration");
  const [siteKey, setSiteKey] = useState("");
  const [secret, setSecret] = useState("");
  const [seeded, setSeeded] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const act = useAction();

  useEffect(() => {
    if (status && !seeded) { setSiteKey(status.siteKey ?? ""); setSeeded(true); }
  }, [status, seeded]);

  const save = () =>
    act.run("save", async () => {
      // Both are sent so an emptied site-key box clears it; the secret is only
      // sent when typed, so a blank box keeps the stored one.
      await api.post("/api/admin/turnstile/config", { siteKey, ...(secret ? { secret } : {}) });
      setSecret("");
      reload();
      return "Saved. New sign-ins run the check as soon as a secret is stored.";
    }, "Couldn't save the Turnstile configuration.");

  const disable = () =>
    act.run("disable", async () => {
      await api.post("/api/admin/turnstile/config", { siteKey: "", secret: "" });
      setSiteKey("");
      setSecret("");
      reload();
      return "Turnstile is off. Sign-in codes send without a challenge.";
    }, "Couldn't turn Turnstile off.");

  const lockout = !!status && status.secretSet && !status.siteKey;
  const badge: { tone: Tone; label: string } = !status
    ? { tone: "neutral", label: "…" }
    : lockout
      ? { tone: "danger", label: "misconfigured" }
      : status.secretSet
        ? { tone: "success", label: "enforcing" }
        : status.siteKey
          ? { tone: "warning", label: "not enforcing" }
          : { tone: "neutral", label: "off" };

  return (
    <>
      <Stagger className="space-y-3">
        <TabIntro>The bot check in front of every emailed sign-in code, and the platform-wide reset.</TabIntro>

        {error && !status ? (
          <LoadError what="the Turnstile configuration" error={error} onRetry={reload} />
        ) : (
          <Reveal
            loading={loading}
            skeleton={
              <Card className="space-y-3">
                <div className="flex items-center gap-2.5"><Skeleton className="size-9 rounded-2xl" /><SkeletonLine w="10rem" h="title" /></div>
                <Skeleton className="h-20 w-full rounded-2xl" />
                {[0, 1].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
              </Card>
            }
          >
            {status && (
              <Card className="space-y-4">
                <SectionHeader icon={ShieldCheck} title="Turnstile bot check" action={<Badge tone={badge.tone}>{badge.label}</Badge>} />
                <p className="text-sm text-muted-foreground">
                  A Cloudflare Turnstile widget guards the email-code request on every login, platform and branded. The{" "}
                  <span className="font-medium text-foreground">secret</span> is what switches enforcement on; the{" "}
                  <span className="font-medium text-foreground">site key</span> is what makes the widget appear. You need both.
                </p>

                <div className="space-y-2.5 rounded-2xl bg-surface-2 p-3.5">
                  <ConfigRow label="Site key (public)" ok={!!status.siteKey} detail={status.siteKey ?? "Handed to the login screen so the widget can render."} />
                  <ConfigRow label="Secret key (server)" ok={status.secretSet} detail="Write-only. Enforcement is on whenever this is stored." okLabel="Stored" />
                </div>

                {lockout ? (
                  <Callout tone="danger" icon={AlertTriangle} live="alert">
                    A secret is stored with no site key, so the server demands a token the login screen can&apos;t produce —{" "}
                    <span className="font-semibold">nobody can request a sign-in code.</span> Add the site key, or turn Turnstile off.
                  </Callout>
                ) : status.secretSet ? (
                  <Callout tone="success" icon={CircleCheck}>Enforcing on every sign-in code request.</Callout>
                ) : status.siteKey ? (
                  <Callout tone="warning" icon={Info}>
                    The widget will render but nothing is verified server-side — codes still send freely. Store the secret to enforce it.
                  </Callout>
                ) : (
                  <Callout tone="neutral" icon={Info}>Off — sign-in codes send with no challenge.</Callout>
                )}

                <Group title="Cloudflare setup" hint="List the platform host and any studio custom domains under the widget's Hostnames (or use a domain-flexible widget), so the check works on white-label domains too.">
                  <Field label="Site key" icon={ShieldCheck} value={siteKey} onChange={(e) => setSiteKey(e.target.value)} placeholder="0x4AAAAAAA…" hint="Public — it is handed to the login screen so the widget can render." />
                  <Field
                    label={status.secretSet ? "Secret key — stored (blank keeps it)" : "Secret key"}
                    icon={KeyRound}
                    type="password"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder="0x4AAAAAAA…"
                  />
                  <div className="flex gap-2">
                    <Button className="min-h-12 flex-1" disabled={act.busy !== null || (!siteKey && !secret)} onClick={() => void save()}>
                      {act.busy === "save" ? <><Spinner className="size-4" /> Saving…</> : "Save"}
                    </Button>
                    {status.secretSet && (
                      <Button variant="outline" className="min-h-12" disabled={act.busy !== null} onClick={() => setConfirmOff(true)}>
                        {act.busy === "disable" ? <><Spinner className="size-4" /> …</> : "Turn off"}
                      </Button>
                    )}
                  </div>
                </Group>

                {error && <Callout tone="warning" icon={AlertTriangle} live="alert">{error} Showing the last values that loaded.</Callout>}
                <ActionResult msg={act.msg} err={act.err} />
              </Card>
            )}
          </Reveal>
        )}

        <NuclearResetCard />
      </Stagger>

      <ConfirmDialog
        open={confirmOff}
        onOpenChange={setConfirmOff}
        title="Turn Turnstile off?"
        description="This clears both keys, so every login goes back to sending an email code with no bot check. The per-email cooldown and per-IP hourly cap still apply."
        confirmLabel="Turn off"
        destructive
        onConfirm={() => void disable()}
      />
    </>
  );
}

/** Platform nuclear reset — wipe every tenant + all data back to an empty
 *  install (platform config kept). OTP to the admin's email + a typed phrase. */
function NuclearResetCard() {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"intro" | "code">("intro");
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const PHRASE = "RESET EVERYTHING";

  const sendCode = async () => {
    setBusy(true); setErr(null);
    try { await api.post("/api/admin/nuclear-reset/request-otp"); setStage("code"); }
    catch (e) { setErr(errorText(e, "Couldn't send the code.")); }
    finally { setBusy(false); }
  };
  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.post<{ ok: boolean; tenants: number }>("/api/admin/nuclear-reset", { code: code.trim(), confirm });
      setDone(r.tenants);
    } catch (e) {
      const s = (e as { status?: number })?.status;
      setErr(s === 403 ? "That code is wrong or has expired." : s === 400 ? `Type ${PHRASE} exactly to confirm.` : "Reset failed.");
    } finally { setBusy(false); }
  };

  return (
    <>
      <Card className="space-y-3">
        <SectionHeader icon={AlertTriangle} tone="danger" title={<span className="text-danger">Nuclear reset</span>} />
        <p className="text-sm text-muted-foreground">
          Permanently erases <span className="font-medium text-foreground">every studio</span>, all users, and all media —
          the whole platform back to empty. Plans, keys and AI config are kept. There is no undo and no backup.
        </p>
        <Callout tone="danger" icon={Info}>
          Two gates before anything is deleted: a code emailed to your admin address, and the exact phrase{" "}
          <span className="numeral font-semibold">{PHRASE}</span> typed out.
        </Callout>
        <Button
          variant="outline"
          className="min-h-12 w-full border-danger/40 text-danger"
          onClick={() => { setStage("intro"); setCode(""); setConfirm(""); setErr(null); setDone(null); setOpen(true); }}
        >
          <Trash2 /> Reset the platform…
        </Button>
      </Card>

      <Sheet open={open} onClose={() => setOpen(false)} title="Nuclear reset">
        {done != null ? (
          <div className="space-y-3 text-center" role="status" aria-live="polite">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-success-soft/60 text-success"><CircleCheck className="size-6" aria-hidden /></div>
            <p className="text-sm">
              Wiped <span className="font-semibold">{done}</span> studio{done === 1 ? "" : "s"} and everything in them.
              You&apos;ll be signed out — sign back in to start fresh.
            </p>
            <Button className="min-h-12 w-full" onClick={() => location.assign("/")}>Reload</Button>
          </div>
        ) : stage === "intro" ? (
          <div className="space-y-4">
            <Callout tone="danger" icon={AlertTriangle}>
              This erases the entire platform: every studio, every user, every uploaded file. It cannot be undone.
            </Callout>
            <p className="text-sm text-muted-foreground">We&apos;ll email a confirmation code to your admin address first.</p>
            {err && <Callout tone="danger" icon={AlertTriangle} live="alert">{err}</Callout>}
            <Button className="min-h-12 w-full" disabled={busy} onClick={() => void sendCode()}>
              {busy ? <><Spinner className="size-4" /> Sending…</> : "Email me a confirmation code"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit code we emailed you, then type the phrase exactly. Both must match before anything is deleted.
            </p>
            <Field label="Confirmation code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} placeholder="000000" autoFocus />
            <Field label={`Type ${PHRASE} to confirm`} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={PHRASE} />
            {err && <Callout tone="danger" icon={AlertTriangle} live="alert">{err}</Callout>}
            <Button variant="destructive" className="min-h-12 w-full" disabled={busy || code.length < 6 || confirm !== PHRASE} onClick={() => void run()}>
              {busy ? <><Spinner className="size-4" /> Wiping…</> : <><Trash2 /> Erase everything, permanently</>}
            </Button>
          </div>
        )}
      </Sheet>
    </>
  );
}

/**
 * Stripe configuration — BOTH rails.
 *
 * This form used to send only `{ mode: "test", secretKey, webhookSecret }`, with
 * the mode hardcoded, while /api/admin/stripe/config has always accepted six
 * fields. Three of them were unreachable, each with a silent consequence:
 *  • no publishable key → every inline payment breaks on both rails, because the
 *    Payment Element cannot initialise without it (pack-intent, plan-intent and
 *    connect/pay-intent all return it to the browser);
 *  • no Connect webhook secret → client→tenant events fail signature verification,
 *    so a client pays their coach and no access is ever granted;
 *  • mode pinned to "test" → live keys could never be activated from the product.
 */
type StripeLane = "test" | "live";
type StripeMode = StripeLane | "disabled";
type LaneCreds = { secretKey: string; publishableKey: string; webhookSecret: string; connectWebhookSecret: string };
interface LaneStatus {
  secretKey: boolean;
  publishableKey: boolean;
  webhookSecret: boolean;
  connectWebhookSecret: boolean;
  complete: boolean;
  secretKeyLast4: string | null;
  publishableKeyLast4: string | null;
  secretKeyLane: StripeLane | null;
  publishableKeyLane: StripeLane | null;
}
interface StripeStatusView {
  mode: StripeMode;
  enabled: boolean;
  activeLane: StripeLane;
  keyLane: StripeLane | null;
  laneMismatch: boolean;
  activeLaneComplete: boolean;
  connectWebhookMissing: boolean;
  connectWebhookFallback: boolean;
  lanes: Record<StripeLane, LaneStatus>;
  legacy: LaneStatus;
  active: LaneStatus & { lane: StripeLane; sources: Record<keyof LaneCreds, "lane" | "legacy" | "none"> };
  platformFeeBps: number;
}

const EMPTY_CREDS: LaneCreds = { secretKey: "", publishableKey: "", webhookSecret: "", connectWebhookSecret: "" };
const CRED_LABEL: Record<keyof LaneCreds, string> = {
  secretKey: "secret key",
  publishableKey: "publishable key",
  webhookSecret: "platform webhook secret",
  connectWebhookSecret: "Connect webhook secret",
};
const CRED_KEYS = Object.keys(CRED_LABEL) as (keyof LaneCreds)[];
const nonEmpty = (c: LaneCreds): Partial<LaneCreds> => Object.fromEntries(Object.entries(c).filter(([, v]) => v.trim() !== ""));
const hasAny = (c: LaneCreds) => Object.keys(nonEmpty(c)).length > 0;
/** "stored ••3f9a — blank keeps it" / "not set", per field. */
const storedHint = (present: boolean, last4: string | null, viaLegacy: boolean): string =>
  present ? `stored${last4 ? ` ••${last4}` : ""}${viaLegacy ? " (from the pre-lane key)" : ""} — leave blank to keep it` : "not set";

function StripeConfig() {
  const [status, setStatus] = useState<StripeStatusView | null>(null);
  const [mode, setMode] = useState<StripeMode>("test");
  const [editLane, setEditLane] = useState<StripeLane>("test");
  const [creds, setCreds] = useState<Record<StripeLane, LaneCreds>>({ test: { ...EMPTY_CREDS }, live: { ...EMPTY_CREDS } });
  const [feeBps, setFeeBps] = useState("");
  const [busy, setBusy] = useState<"save" | "sync" | "flip" | null>(null);
  const [flipping, setFlipping] = useState<StripeMode | null>(null);
  const [flipTo, setFlipTo] = useState<StripeMode | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const apply = useCallback((s: StripeStatusView) => {
    setStatus(s);
    setMode(s.mode);
    setEditLane(s.mode === "disabled" ? "test" : s.mode);
    if (typeof s.platformFeeBps === "number") setFeeBps(String(s.platformFeeBps));
  }, []);
  const loadStatus = useCallback(async () => apply(await api.get<StripeStatusView>("/api/admin/stripe/status")), [apply]);
  // A load failure needs a retry, not just a line of red text: without the status
  // this whole tab is guesswork about which lane is live.
  useEffect(() => {
    let alive = true;
    setLoadErr(null);
    api.get<StripeStatusView>("/api/admin/stripe/status")
      .then((s) => { if (alive) apply(s); })
      .catch((e) => { if (alive) setLoadErr(errorText(e, "Could not read the Stripe status")); });
    return () => { alive = false; };
  }, [apply, nonce]);

  const setCred = (lane: StripeLane, k: keyof LaneCreds, v: string) => setCreds((c) => ({ ...c, [lane]: { ...c[lane], [k]: v } }));

  // Keys are write-only (never read back), so only send what was actually typed —
  // otherwise saving the fee would blank a key that is already stored. Both lanes
  // go in one request, so test and live can be filled in before any flip.
  const save = async () => {
    setBusy("save");
    setErr(null);
    setMsg(null);
    try {
      const fee = feeBps.trim() === "" ? undefined : Number(feeBps);
      if (fee !== undefined && (!Number.isInteger(fee) || fee < 0 || fee > 10000)) {
        setErr("Platform fee must be a whole number of basis points between 0 and 10000.");
        return;
      }
      const r = await api.post<{ status: StripeStatusView }>("/api/admin/stripe/config", {
        mode,
        lanes: {
          ...(hasAny(creds.test) ? { test: nonEmpty(creds.test) } : {}),
          ...(hasAny(creds.live) ? { live: nonEmpty(creds.live) } : {}),
        },
        ...(fee !== undefined ? { platformFeeBps: fee } : {}),
      });
      setCreds({ test: { ...EMPTY_CREDS }, live: { ...EMPTY_CREDS } });
      if (r?.status) apply(r.status); else await loadStatus();
      setMsg("Saved. Run Sync catalog to push plans + credit packs to Stripe for the active lane.");
    } catch (e) {
      setErr(errorText(e, "Could not save the Stripe configuration"));
    } finally {
      setBusy(null);
    }
  };

  /** The flip: one request that changes nothing but the active lane. */
  const flip = async (target: StripeMode) => {
    setBusy("flip");
    setFlipping(target);
    setErr(null);
    setMsg(null);
    try {
      const r = await api.post<{ status: StripeStatusView; catalogSwapped?: boolean }>("/api/admin/stripe/config", { mode: target });
      if (r?.status) apply(r.status); else await loadStatus();
      setMsg(
        target === "disabled"
          ? "Payments are now disabled. No checkout will start on either rail."
          : `Now on the ${target} lane, using the ${target} keys already stored.${r?.catalogSwapped ? " Catalog ids were swapped to that lane — run Sync catalog if a plan or pack has none yet." : ""}`,
      );
    } catch (e) {
      setErr(errorText(e, "Could not switch lane"));
    } finally {
      setBusy(null);
      setFlipping(null);
    }
  };

  const sync = async () => {
    setBusy("sync");
    setErr(null);
    setMsg(null);
    try {
      const r = await api.post<{ plans: number; packs: number }>("/api/admin/stripe/sync");
      setMsg(`Synced ${r.plans} plans + ${r.packs} credit packs into the ${status?.activeLane ?? "active"} lane.`);
    } catch (e) {
      setErr(errorText(e, "Catalog sync failed"));
    } finally {
      setBusy(null);
    }
  };

  // Mirrors the server's write-path refusal: a key whose prefix names the other
  // lane is rejected, so warn before the round-trip.
  const typedLaneClash = (["test", "live"] as const).filter((lane) => {
    const other = lane === "test" ? "live" : "test";
    return creds[lane].secretKey.startsWith(`sk_${other}_`) || creds[lane].publishableKey.startsWith(`pk_${other}_`);
  });
  const laneOf = (l: StripeLane) => status?.lanes[l];
  const missingActive = status && status.mode !== "disabled" ? CRED_KEYS.filter((k) => !status.active[k]) : [];
  const targets: StripeMode[] = status ? (["test", "live", "disabled"] as StripeMode[]).filter((m) => m !== status.mode) : [];

  if (loadErr && !status) {
    return <Stagger><LoadError what="the Stripe status" error={loadErr} onRetry={() => setNonce((n) => n + 1)} /></Stagger>;
  }

  return (
    <>
      <Stagger className="space-y-3">
        <TabIntro>Both payment rails: studios paying Mossa, and clients paying their studio through Connect.</TabIntro>

        <Reveal
          loading={!status}
          className="space-y-3"
          skeleton={
            <>
              {[0, 1].map((i) => (
                <Card key={i} className="space-y-3">
                  <div className="flex items-center justify-between"><SkeletonLine w="6rem" h="title" /><Skeleton className="h-6 w-24 rounded-full" /></div>
                  <SkeletonLine w="95%" h="xs" /><SkeletonLine w="70%" h="xs" />
                  <Skeleton className="h-12 w-full rounded-xl" />
                </Card>
              ))}
            </>
          }
        >
          {status && (
            <div className="space-y-3">
              {/* ── What is actually in force right now ─────────────────── */}
              <Card className="space-y-3">
                <SectionHeader
                  icon={CreditCard}
                  title="Stripe"
                  action={
                    <Badge tone={status.mode === "disabled" ? "neutral" : status.laneMismatch || !status.activeLaneComplete ? "warning" : "success"}>
                      {status.mode === "disabled" ? "Payments disabled" : `${status.mode === "live" ? "Live" : "Test"} · active`}
                    </Badge>
                  }
                />
                <p className="text-[13px] text-muted-foreground" role="status" aria-live="polite">
                  {status.mode === "disabled"
                    ? "No checkout can start on either rail. Store a lane's keys below, then switch to it."
                    : status.activeLaneComplete
                      ? `All four ${status.mode} credentials are in place${status.keyLane ? `, and the active secret key really is a ${status.keyLane}-mode key` : ""}. Real money ${status.mode === "live" ? "does" : "does not"} move in this lane.`
                      : `The ${status.mode} lane is incomplete: no ${missingActive.map((k) => CRED_LABEL[k]).join(", ")}.`}
                </p>
                {loadErr && <Callout tone="warning" icon={AlertTriangle} live="alert">{loadErr}. Showing the last status that loaded.</Callout>}
                {status.laneMismatch && (
                  <Callout tone="danger" icon={AlertTriangle} live="alert">
                    The key that is active is a <b>{status.keyLane}</b>-mode key while the mode says <b>{status.mode}</b>.{" "}
                    {status.keyLane === "live" ? "Real charges are being taken under a test label." : "Nothing you charge is real."}{" "}
                    Store matching keys in the {status.mode} lane, or switch to {status.keyLane} mode.
                  </Callout>
                )}
                {status.mode !== "disabled" && status.connectWebhookMissing && (
                  <Callout tone="danger" icon={AlertTriangle} live="alert">
                    No Connect webhook secret in the {status.mode} lane
                    {status.connectWebhookFallback ? " — Connect events fall back to the platform secret, which is a different endpoint and will fail signature verification" : ""}.
                    A client pays their coach and no access is granted, with no error anywhere.
                  </Callout>
                )}
                <div className="flex flex-wrap gap-1.5" aria-label="Credentials stored per lane">
                  {(["test", "live"] as const).map((lane) => (
                    <Badge key={lane} tone={laneOf(lane)?.complete ? "success" : laneOf(lane)?.secretKey ? "warning" : "neutral"}>
                      {lane}: {laneOf(lane)?.complete ? "all 4 stored" : `${CRED_KEYS.filter((k) => laneOf(lane)?.[k]).length}/4 stored`}
                    </Badge>
                  ))}
                  {status.legacy.secretKey && <Badge tone="neutral">pre-lane keys present (used as a fallback)</Badge>}
                </div>
              </Card>

              {/* ── The flip: one action, and what it does ──────────────── */}
              <Card className="space-y-3">
                <SectionHeader icon={Wallet} title="Active lane" />
                <p className="text-[13px] text-muted-foreground">
                  Switching lane changes which stored credentials every payment path uses — nothing is re-pasted. Test and
                  live products and prices are <b>separate objects</b> in Stripe, so run <b>Sync catalog</b> after a switch
                  (ids are kept per lane, so a lane you have already synced comes back with its own).
                </p>
                <div className="flex flex-wrap gap-2">
                  {targets.map((t) => (
                    <Button
                      key={t}
                      variant={t === "disabled" ? "outline" : "default"}
                      className="min-h-12 flex-1"
                      disabled={busy !== null}
                      onClick={() => setFlipTo(t)}
                    >
                      {flipping === t ? <><Spinner className="size-4" /> Switching…</> : t === "disabled" ? "Disable payments" : `Switch to ${t}`}
                    </Button>
                  ))}
                </div>
                {status.mode !== "disabled" && !status.activeLaneComplete && (
                  <Callout tone="warning" icon={AlertTriangle} live="alert">
                    Finish the {status.mode} lane before taking a real payment — {missingActive.map((k) => CRED_LABEL[k]).join(", ")} missing.
                  </Callout>
                )}
              </Card>

              {/* ── Per-lane credential editor ──────────────────────────── */}
              <Card className="space-y-4">
                <SectionHeader icon={KeyRound} title="Credentials" />
                <p className="text-[13px] text-muted-foreground">
                  Each lane has its own keys and its own two webhook secrets. Fill in both lanes once and switching is a
                  one-click mode change. Keys are stored write-only — a blank field keeps what is saved.
                </p>
                <SegmentedControl
                  fill
                  options={[{ value: "test", label: "Test lane" }, { value: "live", label: "Live lane" }]}
                  value={editLane}
                  onChange={setEditLane}
                />
                {(["test", "live"] as const).map((lane) =>
                  lane !== editLane ? null : (
                    <div key={lane} className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium">Editing the <b>{lane}</b> lane{status.mode === lane ? " (currently active)" : ""}</span>
                        {hasAny(creds[lane]) && <Badge tone="primary">unsaved</Badge>}
                      </div>
                      <Field
                        label={`${lane} secret key (sk_${lane}_…)`}
                        icon={KeyRound}
                        value={creds[lane].secretKey}
                        onChange={(e) => setCred(lane, "secretKey", e.target.value)}
                        hint={storedHint(!!laneOf(lane)?.secretKey, laneOf(lane)?.secretKeyLast4 ?? null, false)}
                        placeholder={`sk_${lane}_…`}
                      />
                      <Field
                        label={`${lane} publishable key (pk_${lane}_…)`}
                        icon={KeyRound}
                        value={creds[lane].publishableKey}
                        onChange={(e) => setCred(lane, "publishableKey", e.target.value)}
                        hint={storedHint(!!laneOf(lane)?.publishableKey, laneOf(lane)?.publishableKeyLast4 ?? null, false)}
                        placeholder="required for in-app payments"
                      />
                      <div className="space-y-2 rounded-2xl bg-surface-2 p-3">
                        <div className="text-[13px] font-medium">Webhook signing secrets ({lane})</div>
                        <p className="text-[13px] text-muted-foreground">
                          Two endpoints, two secrets, <b>and a separate pair per lane</b>. <span className="font-medium text-foreground">Platform</span> is <code>/api/stripe/webhook</code> (studios paying Mossa).
                          {" "}<span className="font-medium text-foreground">Connect</span> is <code>/api/connect/webhook</code> (clients paying their coach) and needs “Listen to events on connected accounts” enabled.
                          Without the Connect secret, a client&apos;s payment succeeds and no access is granted.
                        </p>
                        <Field
                          label={`Platform webhook secret (${lane})`}
                          icon={KeyRound}
                          value={creds[lane].webhookSecret}
                          onChange={(e) => setCred(lane, "webhookSecret", e.target.value)}
                          hint={storedHint(!!laneOf(lane)?.webhookSecret, null, false)}
                          placeholder="whsec_…"
                        />
                        <Field
                          label={`Connect webhook secret (${lane})`}
                          icon={KeyRound}
                          value={creds[lane].connectWebhookSecret}
                          onChange={(e) => setCred(lane, "connectWebhookSecret", e.target.value)}
                          hint={storedHint(!!laneOf(lane)?.connectWebhookSecret, null, false)}
                          placeholder="whsec_…"
                        />
                      </div>
                    </div>
                  ),
                )}
                {typedLaneClash.length > 0 && (
                  <Callout tone="warning" icon={AlertTriangle} live="alert">
                    The {typedLaneClash.join(" and ")} lane holds a key from the other mode — a <code>sk_live_</code>/<code>pk_live_</code> key
                    can only be stored in the live lane, and the reverse. This will be refused on save.
                  </Callout>
                )}

                <Group title="Mode to save with" hint="Saving applies this mode along with anything typed above. To change lane without touching credentials, use Active lane.">
                  <div className="flex gap-2" role="radiogroup" aria-label="Stripe mode">
                    {(["test", "live", "disabled"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={mode === m}
                        onClick={() => setMode(m)}
                        className={cn(
                          "min-h-12 flex-1 rounded-xl px-3 text-[13px] font-medium capitalize transition-colors",
                          mode === m ? "bg-primary text-primary-foreground" : "bg-secondary",
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </Group>

                <Group title="Platform fee" hint="Mossa's cut of each client→studio Connect payment, in basis points (100 = 1%). 0 means studios keep everything. Saved by the button below.">
                  <Field
                    label="Platform fee (basis points)"
                    icon={Percent}
                    inputMode="numeric"
                    value={feeBps}
                    onChange={(e) => setFeeBps(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="0"
                    hint={feeBps.trim() === "" ? "Blank leaves the stored fee unchanged." : `${(Number(feeBps) / 100).toFixed(2)}% of every client payment`}
                  />
                </Group>

                <div className="flex gap-3">
                  <Button className="min-h-12 flex-1" disabled={busy !== null} onClick={() => void save()}>
                    {busy === "save" ? <><Spinner className="size-4" /> Saving…</> : "Save"}
                  </Button>
                  <Button variant="outline" className="min-h-12 flex-1" disabled={busy !== null || !status.enabled} onClick={() => void sync()}>
                    {busy === "sync" ? <><Spinner className="size-4" /> Syncing…</> : "Sync catalog"}
                  </Button>
                </div>
                {err && <Callout tone="danger" icon={AlertTriangle} live="alert">{err}</Callout>}
                {msg && !err && <Callout tone="success" icon={CircleCheck} live="status">{msg}</Callout>}
              </Card>
            </div>
          )}
        </Reveal>
      </Stagger>

      <ConfirmDialog
        open={flipTo !== null}
        onOpenChange={(o) => !o && setFlipTo(null)}
        title={flipTo === "disabled" ? "Disable payments?" : `Switch payments to ${flipTo}?`}
        description={
          flipTo === "disabled"
            ? "Both rails stop: no plan, credit-pack or client-package checkout can start. Stored keys are kept."
            : `Every payment path switches to the ${flipTo} keys and the ${flipTo} webhook secrets already stored — nothing is re-pasted.${flipTo && status?.lanes[flipTo as StripeLane] && !status.lanes[flipTo as StripeLane].complete ? ` That lane is incomplete (${CRED_KEYS.filter((k) => !status.lanes[flipTo as StripeLane][k]).map((k) => CRED_LABEL[k]).join(", ")} missing), and any gap fails silently at payment time.` : ""} Test and live products/prices are separate objects in Stripe, so run Sync catalog afterwards.`
        }
        confirmLabel={flipTo === "disabled" ? "Disable" : `Switch to ${flipTo}`}
        destructive={flipTo === "live" || flipTo === "disabled"}
        onConfirm={() => { if (flipTo) void flip(flipTo); }}
      />
    </>
  );
}

// ── Platform promo codes (Mossa → tenant): website-native discounts on a
//    tenant's credit-pack purchase. Percentage or fixed, optional max uses. ─────

interface PPromo {
  id: string;
  code: string;
  discount_type: string;
  percent_off: number | null;
  amount_off_cents: number | null;
  redemption_count: number;
  max_redemptions: number | null;
  expires_at: string | null;
  active: number;
}

const promoDiscount = (p: PPromo) => (p.discount_type === "percent" ? `${p.percent_off ?? 0}% off` : `${fmtPrice(p.amount_off_cents ?? 0)} off`);

function PlatformPromos() {
  const load = useCallback(() => api.get<{ codes: PPromo[] }>("/api/admin/promo-codes").then((r) => r.codes ?? []), []);
  const { data, error, loading, reload } = useAdminLoad(load, "the promo codes");
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<PPromo | null>(null);
  const act = useAction();

  const del = (p: PPromo) =>
    act.run(`del:${p.id}`, async () => {
      await api.del(`/api/admin/promo-codes/${p.id}`);
      reload();
      return `${p.code} deactivated — it can no longer be applied at checkout.`;
    }, "Couldn't deactivate that code — it is still live.");

  const codes = data ?? [];
  const live = codes.filter((p) => !!p.active);
  const dead = codes.filter((p) => !p.active);

  return (
    <>
      <Stagger className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold">Platform promo codes</h2>
            <p className="text-xs leading-relaxed text-muted-foreground">Mossa → studio: a discount on a studio&apos;s credit-pack purchase.</p>
          </div>
          <Button size="sm" className="min-h-12 shrink-0 rounded-xl" onClick={() => setOpen(true)}><Plus /> New</Button>
        </div>

        <ActionResult msg={act.msg} err={act.err} />

        {error && !data ? (
          <LoadError what="the promo codes" error={error} onRetry={reload} />
        ) : (
          <Reveal
            loading={loading}
            className="space-y-4"
            skeleton={
              <>
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} className="flex items-center gap-3 p-4">
                    <Skeleton className="size-9 shrink-0 rounded-2xl" />
                    <div className="min-w-0 flex-1 space-y-1.5"><SkeletonLine w="6rem" h="text" /><SkeletonLine w="9rem" h="xs" /></div>
                    <Skeleton className="size-12 shrink-0 rounded-full" />
                  </Card>
                ))}
              </>
            }
          >
            {data && (codes.length === 0 ? (
              <EmptyState
                icon={Tag}
                title="No platform promo codes"
                description="A code discounts a studio's credit-pack purchase on the platform rail."
                action={<Button className="min-h-12" onClick={() => setOpen(true)}><Plus /> New promo code</Button>}
              />
            ) : (
              <>
                <section className="space-y-2">
                  <Eyebrow>Live · {live.length}</Eyebrow>
                  {live.length === 0
                    ? <Callout tone="neutral" icon={Info}>No live codes — every code below has been deactivated.</Callout>
                    : live.map((p) => <PromoRow key={p.id} promo={p} busy={act.busy === `del:${p.id}`} disabled={act.busy !== null} onDelete={() => setToDelete(p)} />)}
                </section>
                {dead.length > 0 && (
                  <section className="space-y-2">
                    <Eyebrow>Deactivated · {dead.length}</Eyebrow>
                    <p className="px-1 text-xs text-muted-foreground">Kept for the record. These are refused at checkout and can&apos;t be re-enabled from here.</p>
                    {dead.map((p) => <PromoRow key={p.id} promo={p} />)}
                  </section>
                )}
              </>
            ))}
          </Reveal>
        )}
      </Stagger>

      {open && <PlatformPromoSheet onClose={() => setOpen(false)} onSaved={() => { setOpen(false); reload(); }} />}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={toDelete ? `Deactivate ${toDelete.code}?` : "Deactivate promo code?"}
        description={
          toDelete
            ? `${toDelete.code} (${promoDiscount(toDelete)}) stops working at checkout immediately. It has been used ${plural(toDelete.redemption_count, "time")}. This can't be undone from the console.`
            : undefined
        }
        confirmLabel="Deactivate"
        destructive
        onConfirm={() => { if (toDelete) void del(toDelete); }}
      />
    </>
  );
}

function PromoRow({ promo: p, busy, disabled, onDelete }: { promo: PPromo; busy?: boolean; disabled?: boolean; onDelete?: () => void }) {
  const capped = p.max_redemptions != null;
  const exhausted = capped && p.redemption_count >= (p.max_redemptions ?? 0);
  const expires = p.expires_at ? fmtWhen(p.expires_at) : null;
  return (
    <Card className={cn("flex items-center gap-3 p-4", !p.active && "opacity-60")}>
      <IconBadge icon={Tag} tone={p.active ? "primary" : "neutral"} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="numeral truncate font-semibold">{p.code}</div>
        <div className="numeral truncate text-xs text-muted-foreground">
          {promoDiscount(p)} · used {p.redemption_count}{capped ? ` of ${p.max_redemptions}` : ""}
          {expires ? ` · expires ${expires}` : ""}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {exhausted && p.active && <Badge tone="warning">used up</Badge>}
        {!p.active && <Badge tone="neutral">off</Badge>}
        {p.active && onDelete && (
          <Button
            size="icon"
            variant="ghost"
            className="size-12 text-muted-foreground hover:bg-danger-soft hover:text-danger"
            aria-label={`Deactivate promo code ${p.code}`}
            disabled={disabled}
            onClick={onDelete}
          >
            {busy ? <Spinner className="size-4" /> : <Trash2 />}
          </Button>
        )}
      </div>
    </Card>
  );
}

function PlatformPromoSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const act = useAction();

  const numeric = Number(value);
  const valid = code.trim().length >= 3 && numeric > 0 && (discountType === "percent" ? numeric <= 100 : true);

  const save = () =>
    act.run("save", async () => {
      await api.post("/api/admin/promo-codes", {
        code,
        discountType,
        percentOff: discountType === "percent" ? Number(value) : undefined,
        amountOffCents: discountType === "amount" ? Math.round(Number(value) * 100) : undefined,
        maxRedemptions: maxRedemptions ? Number(maxRedemptions) : undefined,
      });
      onSaved();
    }, "Couldn't create that code — it may already exist.");

  return (
    <Sheet open onClose={onClose} title="New platform promo">
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Applies to a studio&apos;s credit-pack purchase on the platform rail. Codes are stored upper-case and can be
          deactivated later, but never edited.
        </p>
        <Field label="Code" icon={Tag} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="LAUNCH20" />
        <div className="space-y-1.5">
          <div className="text-sm font-medium text-muted-foreground">Discount</div>
          <div className="flex gap-2" role="radiogroup" aria-label="Discount type">
            {(["percent", "amount"] as const).map((t) => (
              <Chip key={t} className="min-h-12" selected={discountType === t} onClick={() => setDiscountType(t)}>
                {t === "percent" ? "% off" : "$ off"}
              </Chip>
            ))}
          </div>
        </div>
        <Field
          label={discountType === "percent" ? "Percent off" : "Amount off (USD)"}
          value={value}
          inputMode="decimal"
          onChange={(e) => setValue(e.target.value)}
          hint={discountType === "percent" ? "1–100" : "Charged in cents — 12.50 becomes $12.50 off"}
        />
        <Field label="Max redemptions" value={maxRedemptions} inputMode="numeric" onChange={(e) => setMaxRedemptions(e.target.value.replace(/\D/g, ""))} hint="Blank = unlimited" />
        {act.err && <Callout tone="danger" icon={AlertTriangle} live="alert">{act.err}</Callout>}
        <Button size="lg" className="w-full" disabled={!valid || act.busy !== null} onClick={() => void save()}>
          {act.busy === "save" ? <><Spinner className="size-5" /> Creating…</> : "Create promo"}
        </Button>
      </div>
    </Sheet>
  );
}
