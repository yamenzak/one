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
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle, Badge, Building2, Button, Callout, Card, ChevronRight, Chip, CircleCheck,
  ConfirmDialog, CreditCard, EmptyState, Eyebrow, Field, Gift, GlanceStrip, Globe, IconBadge, Info, Input, KeyRound, ThumbsUp,
  Dumbbell, LayoutGrid, Mail, Percent, Plus, Reveal, RefreshCw, Search, SectionHeader, SegmentedControl, Select, Sheet, ShieldCheck, Wand2,
  Skeleton, SkeletonLine, Play, Plug, Spinner, Stagger, Switch, Tag, Trash2, Wallet, Wrench, cn, toneText, type Tone,
  ActionResult, ConfigRow, FieldGroup, LoadError, useLoad, useAction as useActionBase,
} from "@4dl/ui";
import {
  AdminConsole as Console, PlatformAiSection, PlatformDomainsSection, providerLabel, type AiCatalogModel, PlatformEmailSection, PlatformMaintenanceSection,
  PlatformStripeSection, PlatformTurnstileSection, PlatformSharedConfigSection, PlatformRailSection, type ConsoleSection,
} from "@4dl/admin";
import { SectionSplit } from "../SectionSplit.js";
import { api, errorText } from "../../api.js";
import { fmtPrice } from "../../money.js";

/**
 * ── THE OPERATOR CONSOLE: AN INDEX AND A PAGE PER SECTION ──────────────────
 *
 * Seven tabs, and the first one — Tenants — measured **61,541px** on a seeded
 * install: every studio ever created, in one scroll, with no chunking and no
 * "See all". §1 caps a group at seven rows for exactly this reason. The other
 * six tabs were invisible until you flicked past a wall.
 *
 * Same shape as the studio settings now: a table of contents, then one section
 * at a time. `?s=<key>` keeps it one component and makes Back step out of a
 * section before it leaves the console.
 *
 * The FRAME is `@4dl/admin`'s — it is the same on every 4DL app's operator door.
 * What stays here is this list, because every entry names something Kova sells
 * or runs, and the next app's console will name something else entirely.
 */
const ADMIN_SECTIONS: ConsoleSection[] = [
  { key: "tenants", label: "Studios", blurb: "Every studio, its plan, credits and standing", icon: Building2, tone: "primary", render: () => <Tenants /> },
  { key: "plans", label: "Plans", blurb: "Price, limits and trials owners buy", icon: CreditCard, tone: "cardio", render: () => <PlansConfig /> },
  /* `@4dl/admin`'s, over `@4dl/ai`'s endpoints. Kova's two genuinely-own pieces
     ride in as slots: the live self-test (which runs THIS product's prompts
     through THIS product's parsers) and the 👍/👎 read side (which reads Kova's
     own `insight_feedback`). The lane descriptions are Kova's too — the lanes
     themselves are the package's taxonomy, what they are FOR is the product's. */
  {
    key: "ai", label: "AI", blurb: "Models, pricing, markup, the self-test", icon: Wand2, tone: "nutrition",
    render: () => (
      <PlatformAiSection
        api={api}
        errorText={errorText}
        lanes={[
          { task: "text", label: "Text", desc: "Plans, meals, articles, summaries." },
          { task: "text-small", label: "Text (small)", desc: "Short factual jobs — food and exercise metadata." },
          { task: "vision", label: "Vision", desc: "Snap-a-Meal, label reader, lab extraction. Gemini only." },
          { task: "image", label: "Image", desc: "Generated cover, food and exercise images." },
          { task: "speech", label: "Speech", desc: "Spoken body-scan cues." },
        ]}
        extraBelowCatalog={<AiFeedbackPanel />}
        extraSub={{
          key: "selftest", label: "Live self-test",
          value: "Runs real prompts and bills real credits",
          render: (models) => <AiSelfTest models={models} />,
        }}
      />
    ),
  },
  /* `@4dl/admin`'s. Two lanes, a mismatch alarm and a price rebuild are facts
     about Stripe, not about Kova — and Tessa, facing the same three endpoints,
     had reinvented them as a `JSON.stringify` dump and three text boxes. */
  { key: "stripe", label: "Stripe", blurb: "Keys, webhooks, and what is synced", icon: Wallet, tone: "supplement", render: () => <PlatformStripeSection api={api} errorText={errorText} platformName="Kova" /> },
  /* The Stripe rail's DEAD LETTER. One account serves every 4DL app, so an
     event that matched no product is the platform's problem, not this app's —
     and it means money was captured with nothing granted. The rail has parked
     these since it shipped; nothing could read one back until now. */
  { key: "rail", label: "Unattributed payments", blurb: "Stripe events that matched no app — money in, nothing granted", icon: Wallet, tone: "danger", render: () => <PlatformRailSection api={api} errorText={errorText} /> },
  { key: "promos", label: "Promo codes", blurb: "Platform-wide discounts on plans and packs", icon: Tag, tone: "activity", render: () => <PlatformPromos /> },
  /* `@4dl/admin`'s. `domainAdminRoutes` has been `@4dl/tenancy`'s since Stage
     10a, so every app that mounts it — the template included — had a working
     custom-domain feature and no way to configure it. */
  { key: "domains", label: "Custom domains", blurb: "Tenant domains and their certificates", icon: Globe, tone: "sleep", render: () => <PlatformDomainsSection api={api} errorText={errorText} tenantNoun="studio" cnameExample="saas.4dl.app" /> },
  { key: "content", label: "Starter content", blurb: "The exercise library a fresh deployment starts without", icon: Dumbbell, tone: "supplement", render: () => <StarterLibraryCard /> },
  /* The panel is `@4dl/admin`'s: who a deployment sends mail as is the shared
     email package's subject, not Kova's. Before it existed the endpoints behind
     it had no caller at all, and a fresh deploy could not send the sign-in code
     that is the only way in — DEPLOY.md carried it as a hand-edit-D1 step. */
  /* The SHARED store: one value, read by every 4DL app. It sits beside the
     per-app panels rather than replacing them, because the two answer different
     questions — "what does the platform use" and "what does THIS app use
     instead". A save here reaches every product, which is why its panel is the
     only settings surface in this console that confirms first. */
  { key: "platform", label: "Shared platform config", blurb: "Keys every 4DL app reads — set once, not once per product", icon: Globe, tone: "activity", render: () => <PlatformSharedConfigSection api={api} errorText={errorText} /> },
  { key: "email", label: "Email delivery", blurb: "How this deployment sends mail, and what a tenant pays per send", icon: Mail, tone: "primary", render: () => <PlatformEmailSection api={api} errorText={errorText} /> },
  /* Also `@4dl/admin`'s: closing a deployment for a migration is not a thing
     Kova does differently from any other app on the platform. Last but one, next
     to Security, because both are switches you arrive at deliberately rather
     than surfaces you browse. */
  { key: "maintenance", label: "Maintenance", blurb: "Put the whole platform in read-only, or close it entirely", icon: Wrench, tone: "danger", render: () => <PlatformMaintenanceSection api={api} errorText={errorText} /> },
  /* The blurb used to promise "sessions, admin access" — neither of which this
     section has ever had. A table of contents that lies is worse than none. */
  /* The bot check is `@4dl/admin`'s — a secret stored with no site key locks
     EVERY 4DL app out of its own sign-in, so the warning belongs with the
     package that owns the check. The nuclear reset stays Kova's and rides in as
     a slot: wiping a deployment is not something a shared package should know
     how to do. */
  {
    key: "security", label: "Security", blurb: "The bot check on sign-in, and the platform reset", icon: ShieldCheck, tone: "danger",
    render: () => <PlatformTurnstileSection api={api} errorText={errorText} extra={<NuclearResetCard />} />,
  },
];

/**
 * The router binding, which is all that is left here.
 *
 * `@4dl/admin`'s shell is router-free by design — a shared package that imports
 * one router cannot be consumed by an app using a different one — so the query
 * param lives on this side. `replace: true` on close is what makes Back step out
 * of a section rather than out of the console.
 */
export function AdminConsole({ onBack }: { onBack: () => void }) {
  const [params, setParams] = useSearchParams();

  return (
    <Console
      sections={ADMIN_SECTIONS}
      openKey={params.get("s")}
      onOpen={(key) =>
        setParams((q: URLSearchParams) => { if (key) q.set("s", key); else q.delete("s"); return q; }, { replace: !key })
      }
      onBack={onBack}
      title="Platform admin"
      subtitle="Kova itself — every studio, plan, key and switch."
    />
  );
}

// ── Shared scaffolding ───────────────────────────────────────────────────────

/** One admin GET with an alive guard, an error string, and a retry. Pass a
 *  `useCallback`-stable loader. `loading` is only true before the first settle,
 *  so a retry (or a post-mutation refresh) never flashes the skeleton back over
 *  content that already arrived. */
// The console patterns (useLoad/useAction, LoadError, ActionResult, ConfigRow,
// TabIntro, Group) now live in @4dl/ui so the STUDIO settings render the same
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
  /** How many rows are on screen. Grows in place; resets whenever the search
   *  changes, so a narrowed list never opens already-expanded. */
  const PAGE = 25;
  const [shown, setShown] = useState(PAGE);
  useEffect(() => { setShown(PAGE); }, [query]);
  const [manageId, setManageId] = useState<string | null>(null);
  const [gift, setGift] = useState<{ id: string; name: string } | null>(null);

  const rows = tenants.data ?? [];
  // Derive the open studio from the live list so a comp is reflected in the sheet
  // the moment the list reloads, instead of showing a stale snapshot.
  const manage = manageId ? rows.find((t) => t.id === manageId) ?? null : null;

  /*
    ── A LIST OF EVERY STUDIO EVER IS NOT A SCREEN ──────────────────────────
    This rendered `filtered.map(...)` with no bound. On a seeded install it
    measured 61,541px — twenty-eight phone screens in one scroll, with the
    console's other six sections behind it. §1 chunks at seven for exactly this
    reason; an operator list has no "See all" to navigate TO, so it grows in
    place instead, and says how much it is showing.
  */
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
                filtered.slice(0, shown).map((t) => (
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

              {/* Says what it is holding back. A list that silently truncates
                  reads as a complete list that happens to be short. */}
              {filtered.length > shown && (
                <button
                  onClick={() => setShown((n) => n + PAGE)}
                  className="w-full rounded-2xl border border-dashed border-border py-3 text-sm text-muted-foreground transition-colors hover:bg-surface-2"
                >
                  Showing {shown} of {filtered.length} — show {Math.min(PAGE, filtered.length - shown)} more
                </button>
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
    <Sheet
      open
      onClose={onClose}
      title={tenant.name}
      /* Tall, and deliberately no footer: this is not a form with an action, it
         is a rack of operator tools — plan, credits, gifts — each of which owns
         its own button inside its own FieldGroup. Pinning one of them would
         promote it over its siblings. */
      size="tall"
    >
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

        <FieldGroup
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
        </FieldGroup>

        <FieldGroup
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
        </FieldGroup>

        <FieldGroup
          title="Gifted entitlements"
          hint="Raise this studio's limits or unlock a feature above its plan without changing the plan. Grant-only — a gift can never take something away."
        >
          <Button variant="tonal" className="min-h-12 w-full" onClick={onGift}><Gift /> Open the gift editor</Button>
        </FieldGroup>
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
      <FieldGroup title="Limits" hint="A number caps it; ∞ makes it unlimited. Keys come from the platform, so a limit added server-side appears here on its own.">
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
      </FieldGroup>

      <FieldGroup title="Features" hint="Each switch is a platform capability gate. A studio's client sees a feature only where this and the client's own package both allow it.">
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
      </FieldGroup>

      <FieldGroup title="AI credits" hint="Granted at the start of each billing period. The grant is a reset, not a top-up — last period's unused grant lapses.">
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
      </FieldGroup>
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
    <Sheet open onClose={onClose} title={`Edit ${plan.name}`} footer={<Button size="lg" className="w-full" disabled={act.busy !== null} onClick={() => void save()}>
          {act.busy === "save" ? <><Spinner className="size-5" /> Saving…</> : "Save plan"}
        </Button>}>
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
    <Sheet
      open
      onClose={onClose}
      title={`Gift — ${name}`}
      /* Tall: the entitlement matrix is long and loads async, so a content-sized
         sheet grew by half a screen the moment the read came back. The submit
         pair pins below it — otherwise it sits under the whole matrix. */
      size="tall"
      footer={ent && !error ? (
        <div className="flex gap-2">
          <Button size="lg" className="flex-1" disabled={act.busy !== null} onClick={() => void save()}>
            {act.busy === "save" ? <><Spinner className="size-4" /> Applying…</> : "Apply gifts"}
          </Button>
          <Button size="lg" variant="outline" disabled={act.busy !== null} onClick={() => void reset()}>
            {act.busy === "reset" ? <><Spinner className="size-4" /> …</> : "Reset to plan"}
          </Button>
        </div>
      ) : undefined}
    >
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
            </div>
          )}
        </Reveal>
      )}
    </Sheet>
  );
}

interface FeedbackRow { type: string; up: number; down: number; total: number; lastAt: number; helpfulPct: number | null }

/**
 * What clients actually thought of the AI's output.
 *
 * The 👍/👎 under a coach note posts to `insight_feedback`, and until now
 * nothing read that table — the votes were collected and discarded. This is the
 * read side. It is deliberately plain: per insight type, how many votes and what
 * share were positive, so a type that clients consistently dislike is visible
 * rather than buried in D1.
 */
function AiFeedbackPanel() {
  const fb = useAdminLoad(() => api.get<{ types: FeedbackRow[]; totalVotes: number }>("/api/admin/ai/feedback"), "AI feedback");
  return (
    <Card className="space-y-4">
      <SectionHeader icon={ThumbsUp} title="Client feedback" count={fb.data ? fb.data.totalVotes : undefined} />
      <p className="text-sm text-muted-foreground">
        The 👍/👎 clients leave under an AI insight, by type. A low helpful rate is the signal to revisit that
        feature&rsquo;s prompt or model.
      </p>
      <Reveal loading={fb.loading} skeleton={<SkeletonLine w="60%" h="text" />}>
        {fb.error ? (
          <p className="text-sm text-warning">Couldn&rsquo;t load feedback.</p>
        ) : !fb.data?.types.length ? (
          <EmptyState icon={ThumbsUp} title="No votes yet" description="Nothing has been rated. The thumbs appear under coach notes on a client's screens." />
        ) : (
          <div className="divide-y divide-border/50">
            {fb.data.types.map((t) => (
              <div key={t.type} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{t.type}</div>
                  <div className="text-xs text-muted-foreground">{t.up} helpful · {t.down} not · last {new Date(t.lastAt).toLocaleDateString()}</div>
                </div>
                {t.helpfulPct != null && (
                  <Badge tone={t.helpfulPct >= 70 ? "success" : t.helpfulPct >= 40 ? "warning" : "danger"}>{t.helpfulPct}% helpful</Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </Reveal>
    </Card>
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
function AiSelfTest({ models }: { models: AiCatalogModel[] }) {
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
      <SectionHeader icon={Play} title="Live self-test" />
      <p className="text-sm text-muted-foreground">
        Runs the product's <span className="font-medium text-foreground">real prompts</span> — a plan draft, a food parse,
        a check-in summary, an exercise auto-fill, a nutrition estimate and a vision call — through the normal metered
        path, then validates each answer with the same parser the feature uses. A 200 that comes back as prose is a{" "}
        <span className="font-medium text-foreground">failure</span> here, because it is one for a coach.
      </p>
      <Callout tone="warning" icon={AlertTriangle}>
        This spends real credits from the studio you are currently switched into. Nothing is faked or refunded.
      </Callout>

      <FieldGroup title="What to run" hint={SCOPE_HINT[scope]}>
        <div className="overflow-x-auto no-scrollbar">
          <SegmentedControl options={SCOPE_OPTIONS} value={scope} onChange={(v) => setScope(v as SelfTestScope)} />
        </div>
        {scope === "model" && (
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Model</span>
            <Select
              aria-label="Model"
              value={pickedModel}
              placeholder="Choose a model…"
              onChange={setPickedModel}
              options={models.filter((m) => m.enabled === 1).map((m) => ({
                value: m.id,
                label: `${providerLabel(m.provider)} — ${m.label} (${m.task})`,
              }))}
            />
          </label>
        )}
      </FieldGroup>

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


/** Platform nuclear reset — wipe every tenant + all data back to an empty
 *  install (platform config kept). OTP to the admin's email + a typed phrase. */
/**
 * The starter exercise library, as a choice.
 *
 * It used to install itself on the first `GET /api/exercises`, which made a
 * deployment impossible to empty: deleting the 40 rows just brought them back on
 * the next request, and a nuclear reset appeared to "come back with premade
 * exercises". Content an operator did not ask for and cannot refuse is not a
 * starter kit. Now it is installed and removed here, deliberately.
 *
 * The warning about drafting is not decoration: the plan-draft prompt whitelists
 * library ids and discards anything outside them, so with an empty library the
 * feature refuses outright (409) rather than billing for a draft that cannot
 * survive validation.
 */
function StarterLibraryCard() {
  const load = useCallback(() => api.get<{ installed: boolean; count: number; available: number }>("/api/admin/starter-library"), []);
  const lib = useAdminLoad(load, "the starter library");
  const act = useAction();

  const set = (install: boolean) =>
    act.run(install ? "install" : "remove", async () => {
      const r = await api.post<{ count: number }>("/api/admin/starter-library", { install });
      lib.reload();
      return install ? `Installed ${plural(r.count, "exercise")}.` : "Starter library removed — the library is now empty.";
    }, install ? "Couldn't install the starter library." : "Couldn't remove the starter library.");

  return (
    <Card className="space-y-4">
      <SectionHeader icon={Dumbbell} title="Starter exercise library" />
      <p className="text-sm text-muted-foreground">
        {plural(lib.data?.available ?? 0, "curated exercise")} on the platform lane, readable by every studio and owned by
        none. Nothing installs it automatically — a fresh deployment starts empty.
      </p>
      {lib.error && !lib.data ? (
        <LoadError what="the starter library" error={lib.error} onRetry={lib.reload} />
      ) : (
        <Reveal loading={lib.loading} skeleton={<Skeleton className="h-12 w-full rounded-xl" />}>
          {lib.data && (
            <div className="space-y-2.5 rounded-2xl bg-surface-2 p-3.5">
              <ConfigRow
                label="Installed"
                ok={lib.data.installed}
                detail={lib.data.installed
                  ? "Every studio sees these alongside their own exercises."
                  : "Studios see only the exercises they add themselves."}
                okLabel={`${lib.data.count}`}
                missingLabel="None"
              />
              {!lib.data.installed && (
                <Callout tone="warning" icon={AlertTriangle}>
                  With no exercises at all, the AI plan draft refuses — it can only pick from a library that exists.
                </Callout>
              )}
              <Button
                className="min-h-12 w-full"
                variant={lib.data.installed ? "outline" : "default"}
                disabled={act.busy !== null}
                onClick={() => void set(!lib.data!.installed)}
              >
                {act.busy ? <><Spinner className="size-4" /> Working…</> : lib.data.installed ? <><Trash2 /> Remove the starter library</> : <><Plus /> Install {plural(lib.data.available, "exercise")}</>}
              </Button>
            </div>
          )}
        </Reveal>
      )}
      <ActionResult msg={act.msg} err={act.err} />
    </Card>
  );
}

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

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Nuclear reset"
        /* Three states, one frame — a warning, a two-field confirmation, and a
           receipt. The footer follows the state so the single thing to press is
           always at the bottom edge, including on the step whose two fields
           push it below the fold. */
        footer={done != null ? (
          <Button size="lg" className="w-full" onClick={() => location.assign("/")}>Reload</Button>
        ) : stage === "intro" ? (
          <Button size="lg" className="w-full" disabled={busy} onClick={() => void sendCode()}>
            {busy ? <><Spinner className="size-4" /> Sending…</> : "Email me a confirmation code"}
          </Button>
        ) : (
          <Button size="lg" variant="destructive" className="w-full" disabled={busy || code.length < 6 || confirm !== PHRASE} onClick={() => void run()}>
            {busy ? <><Spinner className="size-4" /> Wiping…</> : <><Trash2 /> Erase everything, permanently</>}
          </Button>
        )}
      >
        {done != null ? (
          <div className="space-y-3 text-center" role="status" aria-live="polite">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-success-soft/60 text-success"><CircleCheck className="size-6" aria-hidden /></div>
            <p className="text-sm">
              Wiped <span className="font-semibold">{done}</span> studio{done === 1 ? "" : "s"} and everything in them.
              You&apos;ll be signed out — sign back in to start fresh.
            </p>
          </div>
        ) : stage === "intro" ? (
          <div className="space-y-4">
            <Callout tone="danger" icon={AlertTriangle}>
              This erases the entire platform: every studio, every user, every uploaded file. It cannot be undone.
            </Callout>
            <p className="text-sm text-muted-foreground">We&apos;ll email a confirmation code to your admin address first.</p>
            {err && <Callout tone="danger" icon={AlertTriangle} live="alert">{err}</Callout>}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit code we emailed you, then type the phrase exactly. Both must match before anything is deleted.
            </p>
            <Field label="Confirmation code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))} placeholder="000000" autoFocus />
            <Field label={`Type ${PHRASE} to confirm`} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={PHRASE} />
            {err && <Callout tone="danger" icon={AlertTriangle} live="alert">{err}</Callout>}
          </div>
        )}
      </Sheet>
    </>
  );
}

// ── Platform promo codes (Kova → tenant): website-native discounts on a
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
            <p className="text-xs leading-relaxed text-muted-foreground">Kova → studio: a discount on a studio&apos;s credit-pack purchase.</p>
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
    <Sheet open onClose={onClose} title="New platform promo" footer={<Button size="lg" className="w-full" disabled={!valid || act.busy !== null} onClick={() => void save()}>
          {act.busy === "save" ? <><Spinner className="size-5" /> Creating…</> : "Create promo"}
        </Button>}>
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
      </div>
    </Sheet>
  );
}
