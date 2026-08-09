/**
 * THE PLAN CATALOG — price, limits, features, the credit grant, and the TRIAL.
 *
 * ── Why this is here and not in each app ────────────────────────────────────
 *
 * It was in each app, and that is the argument. Kova built a good one; Scena
 * built a different one over a `PUT` where Kova used a `PATCH`, with two numbers
 * editable inline and no grandfathering at all; Tessa built none, so changing a
 * price there was a code edit, a deploy and a catalog sync. Three answers to
 * "what does this plan sell", and the operator meets this screen on day one.
 *
 * Nothing about it is product vocabulary. The server hands over `quotaKeys`,
 * `featureKeys` and their labels — the registry-injection seam every other
 * package here uses — so this file knows that *some* capability is gated and
 * never which. An app that adds a limit sees it appear with no client change,
 * spelled as its raw key until somebody writes the label.
 *
 * ── `trialDays` is the field this exists to add ─────────────────────────────
 *
 * It is a first-class member of `EntitlementShape`, it is clamped for Stripe by
 * `@4dl/billing`, and it reaches `trial_period_days` on the real subscription in
 * every app. It was editable in NONE of them: Kova's editor rendered the whole
 * shape except this one key, under a section whose own blurb reads "price,
 * limits and trials". So the trial length shipped at whatever the seed said and
 * could only be changed by hand.
 *
 * ── Two warnings that are not decoration ────────────────────────────────────
 *
 * A plan with tenants on it says so before you edit it, because raising a limit
 * applies to all of them at once and lowering one snapshots what they already
 * had. A retired plan says it is retired and that edits still reach the tenants
 * grandfathered onto it — which is the non-obvious half, and the reason a
 * retired plan is shown at all rather than hidden.
 */

import { useCallback, useState } from "react";
import {
  ActionResult, AlertTriangle, Badge, Button, Callout, Card, CircleCheck, EmptyState, Eyebrow, Field,
  FieldGroup, IconBadge, Info, Input, LayoutGrid, LoadError, Reveal, Sheet, Skeleton,
  SkeletonLine, Spinner, Stagger, Switch, useAction, useLoad,
} from "@4dl/ui";
import { AdminDepsProvider, useAdminDeps, type AdminDeps } from "../deps.js";

/** The entitlement shape, as much of it as an operator edits. */
export interface PlanEntitlements {
  quotas: Record<string, number>;
  features: Record<string, boolean>;
  aiCredits: { monthlyGrant: number };
  /** Free-trial length in days for a NEW subscription. 0 = none. */
  trialDays: number;
}

export interface CatalogPlan {
  id: string;
  name: string;
  priceUsdMonth: number;
  active: number;
  /** Tenants currently ON this plan. Drives the grandfathering warning. */
  tenantCount: number;
  entitlements: PlanEntitlements;
}

/** A key's label and explanation. `group` is optional — see `groupsOf`. */
export interface KeyMeta {
  label: string;
  hint: string;
  /** Declared but not enforced by any route yet. Shown, and marked. */
  reserved?: boolean;
  /** For a quota: what the number counts. */
  unit?: string;
  /** Optional heading to file this key under. Ungrouped keys share one list. */
  group?: string;
}

export interface PlanCatalog {
  plans: CatalogPlan[];
  featureKeys: string[];
  quotaKeys: string[];
  featureMeta: Record<string, KeyMeta>;
  quotaMeta: Record<string, KeyMeta>;
}

export interface PlansSectionProps extends AdminDeps {
  /**
   * What this deployment calls a tenant, singular. Used in the sentences that
   * explain who an edit reaches — "3 studios on this plan" — because "tenant"
   * is a word an operator should never have to read.
   */
  tenantNoun?: string;
}

const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? "" : "s"}`;
const usd = (n: number): string => (n === 0 ? "Free" : `$${n % 1 === 0 ? n : n.toFixed(2)}`);

/** Keys in declaration order, split into their groups. One group when none declared. */
function groupsOf(keys: string[], meta: Record<string, KeyMeta>): { name: string | null; keys: string[] }[] {
  const out: { name: string | null; keys: string[] }[] = [];
  for (const k of keys) {
    const name = meta[k]?.group ?? null;
    const last = out[out.length - 1];
    if (last && last.name === name) last.keys.push(k);
    else out.push({ name, keys: [k] });
  }
  return out;
}

/**
 * The matrix editor. Exported because an app's per-tenant sheet edits the same
 * shape — one editor for "what the plan sells" and "what this tenant was given"
 * is what keeps the two from disagreeing about what a key even is.
 */
export function PlanEntitlementFields({
  ent,
  catalog,
  onChange,
}: {
  ent: PlanEntitlements;
  catalog: Pick<PlanCatalog, "featureKeys" | "quotaKeys" | "featureMeta" | "quotaMeta">;
  onChange: (next: PlanEntitlements) => void;
}) {
  const setQuota = (k: string, v: number) => onChange({ ...ent, quotas: { ...ent.quotas, [k]: v } });
  const setFeature = (k: string, v: boolean) => onChange({ ...ent, features: { ...ent.features, [k]: v } });

  return (
    <div className="space-y-5">
      {groupsOf(catalog.quotaKeys, catalog.quotaMeta).map((g, gi) => (
        <FieldGroup
          key={g.name ?? `q${gi}`}
          title={g.name ? `Limits · ${g.name}` : "Limits"}
          hint="A number caps it; ∞ makes it unlimited. Keys come from the platform, so a limit added server-side appears here on its own."
        >
          <div className="space-y-3">
            {g.keys.map((k) => {
              // An unknown key is a NEW server-side limit, not a bug. Label it by
              // its key and say so, rather than rendering a blank row.
              const m = catalog.quotaMeta[k] ?? { label: k, hint: "New platform limit — no description yet." };
              const v = ent.quotas[k] ?? 0;
              const unlimited = v < 0;
              return (
                <div key={k} className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 pt-1">
                    <div className="text-body font-medium">
                      {m.label}
                      {m.unit ? <span className="font-normal text-muted-foreground"> ({m.unit})</span> : null}
                    </div>
                    <div className="text-caption leading-snug text-muted-foreground">{m.hint}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQuota(k, unlimited ? 0 : -1)}
                    aria-pressed={unlimited}
                    aria-label={`${m.label}: unlimited`}
                    className={
                      unlimited
                        ? "grid size-12 shrink-0 place-items-center rounded-xl bg-primary/15 text-body-lg font-semibold text-primary transition-colors"
                        : "grid size-12 shrink-0 place-items-center rounded-xl bg-secondary text-body-lg font-semibold text-muted-foreground transition-colors hover:bg-surface-3"
                    }
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
                    className="numeral h-12 w-[4.75rem] shrink-0 px-2.5 text-right text-body"
                  />
                </div>
              );
            })}
          </div>
        </FieldGroup>
      ))}

      {groupsOf(catalog.featureKeys, catalog.featureMeta).map((g, gi) => (
        <FieldGroup
          key={g.name ?? `f${gi}`}
          title={g.name ? `Features · ${g.name}` : "Features"}
          hint="Each switch is a platform capability gate."
        >
          <div className="space-y-3">
            {g.keys.map((k) => {
              const m = catalog.featureMeta[k] ?? { label: k, hint: "New platform feature — no description yet." };
              return (
                <div key={k} className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-body font-medium">{m.label}</span>
                      {m.reserved && <Badge tone="warning">not built yet</Badge>}
                    </div>
                    <div className="text-caption leading-snug text-muted-foreground">{m.hint}</div>
                  </div>
                  <div className="grid size-12 shrink-0 place-items-center">
                    <Switch checked={!!ent.features[k]} onCheckedChange={(val) => setFeature(k, val)} aria-label={m.label} />
                  </div>
                </div>
              );
            })}
          </div>
        </FieldGroup>
      ))}

      <FieldGroup
        title="AI credits"
        hint="Granted at the start of each billing period. The grant is a reset, not a top-up — last period's unused grant lapses."
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-body font-medium">Monthly grant</div>
            <div className="text-caption leading-snug text-muted-foreground">Purchased credits are separate and never lapse.</div>
          </div>
          <Input
            type="number"
            min={0}
            aria-label="Monthly AI credit grant"
            value={ent.aiCredits.monthlyGrant}
            onChange={(e) => onChange({ ...ent, aiCredits: { monthlyGrant: Math.max(0, Number(e.target.value) || 0) } })}
            className="numeral h-12 w-24 shrink-0 px-2.5 text-right text-body"
          />
        </div>
      </FieldGroup>

      {/*
        THE FIELD THAT WAS MISSING EVERYWHERE.

        `0` is a real value and the common one, so this is a number box rather
        than a switch — and the hint says what actually happens at the provider,
        because "14 days free" and "we take the card now and charge in 14 days"
        are different promises and only one of them is true.
      */}
      <FieldGroup title="Free trial" hint="Applied to a NEW subscription only. Changing it never affects anyone already subscribed — their trial was set when they signed up.">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-body font-medium">Trial length</div>
            <div className="text-caption leading-snug text-muted-foreground">
              {ent.trialDays > 0
                ? `The card is collected up front and nothing is charged for ${plural(ent.trialDays, "day")}.`
                : "No trial — the first payment is taken at sign-up."}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Input
              type="number"
              min={0}
              max={730}
              aria-label="Free trial length in days"
              value={ent.trialDays}
              onChange={(e) => onChange({ ...ent, trialDays: Math.max(0, Math.min(730, Math.floor(Number(e.target.value) || 0))) })}
              className="numeral h-12 w-20 px-2.5 text-right text-body"
            />
            <span className="text-caption text-muted-foreground">days</span>
          </div>
        </div>
      </FieldGroup>
    </div>
  );
}

function PlanCard({ plan, featureKeys, tenantNoun, onEdit }: { plan: CatalogPlan; featureKeys: string[]; tenantNoun: string; onEdit: () => void }) {
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
          <div className="numeral text-caption text-muted-foreground">{usd(plan.priceUsdMonth)} / month</div>
        </div>
        <Button size="sm" variant="secondary" className="min-h-12 shrink-0 rounded-xl" onClick={onEdit} aria-label={`Edit the ${plan.name} plan`}>
          <LayoutGrid /> Edit
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={plan.tenantCount ? "primary" : "neutral"}>{plural(plan.tenantCount, tenantNoun)}</Badge>
        <Badge tone="neutral" className="numeral">{plan.entitlements.aiCredits.monthlyGrant} credits/mo</Badge>
        <Badge tone="neutral">{enabled} of {featureKeys.length} features</Badge>
        {/* Shown only when set: a badge reading "no trial" on every row is texture. */}
        {plan.entitlements.trialDays > 0 && <Badge tone="success">{plan.entitlements.trialDays}-day trial</Badge>}
      </div>
    </Card>
  );
}

function PlanEditSheet({
  plan,
  catalog,
  tenantNoun,
  onClose,
  onSaved,
}: {
  plan: CatalogPlan;
  catalog: PlanCatalog;
  tenantNoun: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { api, errorText } = useAdminDeps();
  const [name, setName] = useState(plan.name);
  const [price, setPrice] = useState(String(plan.priceUsdMonth));
  const [ent, setEnt] = useState<PlanEntitlements>(plan.entitlements);
  const act = useAction(errorText);

  const save = () =>
    act.run(
      "save",
      async () => {
        const r = await api.patch<{ grandfathered: number }>(`/api/admin/plans/${plan.id}`, {
          name,
          priceUsdMonth: Number(price) || 0,
          entitlements: ent,
        });
        // Hoisted to the list: this sheet closes on save, so a message rendered
        // in here would unmount before anyone could read it.
        onSaved(
          r.grandfathered
            ? `Saved ${name}. ${plural(r.grandfathered, `existing ${tenantNoun}`)} kept their old limits.`
            : `Saved ${name} — applied to every ${tenantNoun} on the plan.`,
        );
      },
      "Couldn't save the plan — nothing was changed.",
    );

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Edit ${plan.name}`}
      footer={
        <Button size="lg" className="w-full" disabled={act.busy !== null} onClick={() => void save()}>
          {act.busy === "save" ? <><Spinner className="size-5" /> Saving…</> : "Save plan"}
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={plan.active ? "success" : "neutral"}>{plan.active ? "on sale" : "not sold"}</Badge>
          <Badge tone="neutral">{plural(plan.tenantCount, tenantNoun)} on this plan</Badge>
        </div>
        {!plan.active && (
          <Callout tone="neutral" icon={Info}>
            This plan isn&apos;t sold any more. Edits still reach the {tenantNoun}s grandfathered onto it.
          </Callout>
        )}
        {plan.tenantCount > 0 && (
          <Callout tone="warning" icon={AlertTriangle}>
            {plural(plan.tenantCount, tenantNoun)} on this plan. Raising a limit or enabling a feature applies to all of
            them at once; lowering one snapshots their current level so nobody loses what they paid for.
          </Callout>
        )}

        <div className="flex gap-2">
          <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
          <Field
            label="$ / mo"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
            className="w-24"
          />
        </div>

        <PlanEntitlementFields ent={ent} catalog={catalog} onChange={setEnt} />

        <ActionResult msg={act.msg} err={act.err} />
      </div>
    </Sheet>
  );
}

export function PlatformPlansSection({ api, errorText, tenantNoun = "tenant" }: PlansSectionProps) {
  return (
    <AdminDepsProvider value={{ api, errorText }}>
      <PlansPanel tenantNoun={tenantNoun} />
    </AdminDepsProvider>
  );
}

function PlansPanel({ tenantNoun }: { tenantNoun: string }) {
  const { api, errorText } = useAdminDeps();
  const load = useCallback(() => api.get<PlanCatalog>("/api/admin/plans"), [api]);
  const { data, error, loading, reload } = useLoad(load, "the plan catalog", errorText);
  const [edit, setEdit] = useState<CatalogPlan | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const all = data?.plans ?? [];
  const onSale = all.filter((p) => !!p.active);
  const retired = all.filter((p) => !p.active);

  if (error && !data) {
    return (
      <Stagger>
        <LoadError what="the plans" error={error} onRetry={reload} />
      </Stagger>
    );
  }

  return (
    <>
      <Stagger className="space-y-3">
        {/* No header: `AdminConsole` already renders this section's label and
            blurb above the panel, and a second title reads as a nested page. */}
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
                    <div className="flex-1 space-y-1.5">
                      <SkeletonLine w="8rem" h="text" />
                      <SkeletonLine w="5rem" h="xs" />
                    </div>
                    <Skeleton className="h-12 w-20 shrink-0 rounded-xl" />
                  </div>
                  <div className="flex gap-1.5">
                    {[0, 1, 2].map((j) => <Skeleton key={j} className="h-6 w-20 rounded-full" />)}
                  </div>
                </Card>
              ))}
            </>
          }
        >
          {data &&
            (all.length === 0 ? (
              <EmptyState
                icon={LayoutGrid}
                title="No plans in the catalog"
                description="The platform seeds its plans on first use. Reload once something has signed up."
              />
            ) : (
              <>
                <section className="space-y-2">
                  <Eyebrow>On sale{onSale.length ? ` · ${onSale.length}` : ""}</Eyebrow>
                  {onSale.length === 0 ? (
                    <Callout tone="warning" icon={AlertTriangle}>
                      No plan is on sale, so nobody can subscribe and nobody can be comped onto one.
                    </Callout>
                  ) : (
                    onSale.map((p) => (
                      <PlanCard key={p.id} plan={p} featureKeys={data.featureKeys} tenantNoun={tenantNoun} onEdit={() => setEdit(p)} />
                    ))
                  )}
                </section>

                {retired.length > 0 && (
                  <section className="space-y-2">
                    <Eyebrow>No longer sold · {retired.length}</Eyebrow>
                    <p className="px-1 text-caption leading-relaxed text-muted-foreground">
                      Grandfathered: anyone already on these keeps them and keeps working, but nobody new can pick one
                      and they can&apos;t be comped onto. Editing one still applies to whoever is on it.
                    </p>
                    {retired.map((p) => (
                      <PlanCard key={p.id} plan={p} featureKeys={data.featureKeys} tenantNoun={tenantNoun} onEdit={() => setEdit(p)} />
                    ))}
                  </section>
                )}
              </>
            ))}
        </Reveal>
      </Stagger>

      {edit && data && (
        <PlanEditSheet
          plan={edit}
          catalog={data}
          tenantNoun={tenantNoun}
          onClose={() => setEdit(null)}
          onSaved={(message) => {
            setEdit(null);
            setSaved(message);
            reload();
          }}
        />
      )}
    </>
  );
}
