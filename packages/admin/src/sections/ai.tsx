/**
 * AI — the provider, what a call COSTS, and which model answers each kind of call.
 *
 * ── Why this is three sub-pages and not one scroll ──────────────────────────
 *
 * Stacked, these measured a megabyte of screenshot in Kova, and the pricing
 * table — the one an operator actually changes — sat below the entire provider
 * block every time. `ConsoleSplit` gives each its own address.
 *
 * ── The lanes are the package's; the examples are the app's ─────────────────
 *
 * `text` / `text-small` / `vision` / `image` / `speech` are `@4dl/ai`'s task
 * taxonomy, so the lane list is fixed here. What each lane is FOR is the app's
 * ("Plans, meals, articles" vs "Reading a sterilisation label"), so `lanes`
 * overrides the descriptions. Defaults are deliberately generic rather than
 * borrowed from whichever app was written first.
 *
 * ── Colour and copy carry one claim each ────────────────────────────────────
 *
 * A model that is switched OFF reads switched off, a default that is switched
 * off says "default, but off" rather than wearing a badge that claims it is in
 * force, and a lane whose picker is filtered SAYS it is filtered. Each of those
 * is a real bug that shipped: the engine selects on `enabled = 1`, so a disabled
 * default is a setting that exists and does nothing, and a filtered list that
 * hides its own filter is indistinguishable from a missing model.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActionResult, AlertTriangle, Badge, Button, Callout, Card, CircleCheck, ConfigRow, EmptyState, Field,
  FieldGroup, KeyRound, LayoutGrid, LoadError, Percent, Play, Plug, Reveal, RefreshCw, SectionHeader,
  SegmentedControl, Select, Skeleton, SkeletonLine, Spinner, Stagger, Switch, cn, useAction, useLoad,
} from "@4dl/ui";
import { AdminDepsProvider, useAdminDeps, type AdminDeps } from "../deps.js";
import { ConsoleSplit } from "../split.js";

interface AiStatus { geminiKeySet: boolean; mockMode: string; markup: number; modelCount: number }
interface ModelPricing {
  costPerRequest: Record<string, number>;
  perMillion: { input: number | null; output: number | null };
  perUnit: { credits: number; kind: string } | null;
}
interface ModelRow {
  id: string; label: string; provider: string; task: string;
  input_rate: number | null; output_rate: number | null; unit_rate: number | null; unit_kind: string | null;
  markup: number | null; enabled: number; is_default: number;
  pricing?: ModelPricing;
  /** Lanes the ENGINE can actually run this model on — the server's own answer,
   *  not a guess from `task`. Absent on a server too old to send it. */
  supports?: string[];
}
interface ProviderSyncReport {
  provider: string; source: string; ok: boolean; parsed: number; added: number; addedIds: string[];
  updated: number; disabled: number; disabledIds: string[];
  unpriceable: { id: string; reason: string }[]; error: string | null;
}
interface SyncReport { ok: boolean; providers: ProviderSyncReport[]; total: number; errors: string[] }

export interface AiLane { task: string; label: string; desc: string }

/**
 * The lanes whose membership the engine can vet (`modelSupportsTask`).
 *
 * `speech` is deliberately outside it: TTS runs through its own call rather than
 * `generate()`, so `supports` says nothing about it and filtering the speech
 * lane on that list would empty it.
 */
const VETTED_LANES = new Set(["text", "text-small", "vision", "image"]);

const DEFAULT_LANES: AiLane[] = [
  { task: "text", label: "Text", desc: "Long-form generation." },
  { task: "text-small", label: "Text (small)", desc: "Short factual jobs and metadata." },
  { task: "vision", label: "Vision", desc: "Reading images. Gemini only." },
  { task: "image", label: "Image", desc: "Generated images." },
  { task: "speech", label: "Speech", desc: "Spoken output." },
];

const nf = new Intl.NumberFormat("en-US");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A model's price in the currency a tenant spends: credits for a typical
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

/** Providers are server-side strings; an unknown one renders as itself rather
 *  than being mislabelled as one of the two we happen to know. */
const PROVIDER_LABEL: Record<string, string> = { google: "Gemini (Google)", "workers-ai": "Workers AI" };
const providerLabel = (p: string) => PROVIDER_LABEL[p] ?? p;

const MOCK_HINT: Record<string, string> = {
  auto: "Mock only where no real provider is configured (and only in development).",
  on: "Every AI call returns fabricated output — and still bills the tenant credits.",
  off: "Never mock. A call with no configured provider fails instead.",
};

/** What an app's own sub-page gets handed. The catalog is already loaded here,
 *  and re-fetching it from the app would reach a shared endpoint directly —
 *  which `@4dl/admin/conformance` correctly refuses. */
export type AiCatalogModel = ModelRow;

export interface AiSectionProps extends AdminDeps {
  /** Per-lane descriptions. Merged over the generic defaults by `task`. */
  lanes?: AiLane[];
  /**
   * An extra sub-page — Kova puts its live self-test here.
   *
   * `render` receives the loaded catalog rather than fetching it: a self-test
   * needs to know which models exist, and an app asking `/api/admin/ai/models`
   * for itself is precisely the duplication this package exists to stop.
   */
  extraSub?: { key: string; label: string; value?: ReactNode; render: (models: AiCatalogModel[]) => ReactNode };
  /** Rendered under the model catalog. Kova puts its 👍/👎 read side here. */
  extraBelowCatalog?: ReactNode;
}

/** Providers are server-side strings; exported so an app's own sub-page labels
 *  them the same way the catalog above it does. */
export { providerLabel };

export function PlatformAiSection({ api, errorText, lanes, extraSub, extraBelowCatalog }: AiSectionProps) {
  return (
    <AdminDepsProvider value={{ api, errorText }}>
      <AiConfig lanes={lanes} extraSub={extraSub} extraBelowCatalog={extraBelowCatalog} />
    </AdminDepsProvider>
  );
}

function AiConfig({ lanes, extraSub, extraBelowCatalog }: Omit<AiSectionProps, "api" | "errorText">) {
  const { api, errorText } = useAdminDeps();

  const TASK_LANES = DEFAULT_LANES.map((d) => lanes?.find((l) => l.task === d.task) ?? d);
  const laneLabel = (task: string) => TASK_LANES.find((l) => l.task === task)?.label ?? task;

  // Two independent loaders: a broken model catalog must not hide the provider
  // form (which is how you'd fix it), and vice versa.
  const loadConfig = useCallback(() => api.get<AiStatus>("/api/admin/ai/config"), [api]);
  const cfg = useLoad(loadConfig, "the AI configuration", errorText);
  const loadModels = useCallback(() => api.get<{ models: ModelRow[] }>("/api/admin/ai/models").then((r) => r.models ?? []), [api]);
  const models = useLoad(loadModels, "the model catalog", errorText);

  const [geminiKey, setGeminiKey] = useState("");
  const [markup, setMarkup] = useState("");
  const provider = useAction(errorText);
  const pricing = useAction(errorText);
  const catalog = useAction(errorText);

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
      // and bill for it. Without a catch that 400 looked exactly like success
      // while the control snapped back.
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
      // The per-provider breakdown renders below; keep the one-liner to the
      // headline so "Gemini: 0 parsed" is never hidden behind a generic message.
      const line = r.providers
        .map((p) => (p.error ? `${providerLabel(p.provider)}: ${p.error}` : `${providerLabel(p.provider)}: ${p.parsed} parsed, ${p.added} new, ${p.disabled} switched off`))
        .join(" · ");
      return `${line}. ${plural(r.total, "model")} selectable.`;
    }, "Sync failed — check outbound access to the pricing docs.");

  /**
   * "Apply to every app" — off by default, and remembered for the session.
   *
   * Off by default because a switch that silently reaches products you are not
   * looking at is the wrong default for a control that decides what a tenant
   * can spend credits on. Remembered because the operator who wants it wants it
   * for the whole sitting, not once per row.
   *
   * It is a BROADCAST, not a shared setting: each app applies it once and then
   * owns its own row again. So this can be ticked for one model and left off
   * for the next without anything to reconcile afterwards.
   */
  const [allApps, setAllApps] = useState(false);

  const patchModel = (m: ModelRow, body: { enabled?: boolean; isDefault?: boolean }, what: string) =>
    catalog.run(`model:${m.id}`, async () => {
      const r = await api.patch<{ broadcast?: boolean }>(
        `/api/admin/ai/models/${encodeURIComponent(m.id)}`,
        { ...body, ...(allApps ? { allApps: true } : {}) },
      );
      models.reload();
      // The server reports whether the broadcast actually landed. A deployment
      // with no shared store cannot make one, and saying "every app" when only
      // this one changed is the failure this whole feature exists to remove.
      if (!allApps) return `${m.label}: ${what}`;
      return r?.broadcast
        ? `${m.label}: ${what} — on this app now, on the others next time each one syncs or its console is opened.`
        : `${m.label}: ${what} on THIS app only — the shared store isn't wired, so nothing was sent to the others.`;
    }, `Couldn't update ${m.label}.`);

  /** Make `m` the default for its lane. `enabled: true` is belt and braces — the
   *  picker only offers models already switched on — closing the window where a
   *  model is switched off between the catalog loading and this click. */
  const setDefaultModel = (m: ModelRow) =>
    catalog.run(`lane:${m.task}`, async () => {
      await api.patch(`/api/admin/ai/models/${encodeURIComponent(m.id)}`, { isDefault: true, enabled: true, ...(allApps ? { allApps: true } : {}) });
      models.reload();
      return `${laneLabel(m.task)} now defaults to ${m.label}.`;
    }, `Couldn't set the ${laneLabel(m.task)} default.`);

  const rate = (m: ModelRow) => (m.unit_kind === "image" ? `${m.unit_rate ?? "?"} n/img` : `${m.input_rate ?? "?"} / ${m.output_rate ?? "?"} n/M`);
  const grouped = (models.data ?? []).reduce<Record<string, ModelRow[]>>((acc, m) => {
    (acc[m.provider] ??= []).push(m);
    return acc;
  }, {});

  return (
    <Stagger>
      <ConsoleSplit
        param="a"
        subs={[
          {
            key: "provider", label: "Provider", icon: Plug, tone: "primary",
            value: status ? (status.geminiKeySet ? `Gemini key set · mock ${status.mockMode}` : "No Gemini key — the vision suite is dead") : "…",
            render: () => (
              <div className="space-y-3">
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
                          icon={Plug}
                          title="Providers"
                          action={<Badge tone={status.geminiKeySet ? "success" : "warning"}>{status.geminiKeySet ? "Gemini + Workers AI" : "Workers AI only"}</Badge>}
                        />
                        <div className="space-y-2.5 rounded-2xl bg-surface-2 p-3.5">
                          <ConfigRow
                            label="Gemini API key"
                            ok={status.geminiKeySet}
                            detail={status.geminiKeySet ? "Text, vision and image generation are available." : "Without it, anything that reads an image is unreachable."}
                            okLabel="Stored"
                          />
                          <ConfigRow label="Workers AI" ok detail="Always available on the worker binding, and cheaper." okLabel="Built in" />
                          <ConfigRow
                            label="Model catalog"
                            ok={status.modelCount > 0}
                            detail={status.modelCount > 0 ? `${plural(status.modelCount, "model")} priced and selectable.` : "Empty — run the catalog sync."}
                            okLabel={`${status.modelCount}`}
                            missingLabel="Empty"
                          />
                        </div>

                        {cfg.error && <Callout tone="warning" icon={AlertTriangle} live="alert">{cfg.error} Showing the last values that loaded.</Callout>}

                        {/* Google's console has a name that collides with one app's word
                            for a tenant, so the boundary check refuses the natural phrasing
                            — and is right to: a shared package cannot tell the two uses
                            apart. Naming the product instead is unambiguous and shorter. */}
                        <FieldGroup title="Gemini key" hint="A Gemini API key from Google. Stored write-only — leaving the box blank keeps whatever is saved.">
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
                        </FieldGroup>

                        <FieldGroup title="Mock mode" hint={MOCK_HINT[status.mockMode] ?? "Deterministic offline outputs for development and testing."}>
                          <SegmentedControl
                            fill
                            options={[{ value: "auto", label: "Auto" }, { value: "on", label: "On" }, { value: "off", label: "Off" }]}
                            value={status.mockMode}
                            onChange={(v) => void setMock(v)}
                          />
                          {status.mockMode === "on" && (
                            <Callout tone="danger" icon={AlertTriangle} live="alert">
                              Mock mode is forced on: every AI answer is fabricated — and the tenant is still billed credits for it.
                            </Callout>
                          )}
                        </FieldGroup>

                        <ActionResult msg={provider.msg} err={provider.err} />
                      </Card>
                    )}
                  </Reveal>
                )}
              </div>
            ),
          },
          {
            key: "pricing", label: "Credit pricing", icon: Percent, tone: "warning",
            value: status ? `${plural(status.modelCount, "model")} · ${status.markup}× markup` : "…",
            render: () => (
              <div className="space-y-3">
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
                  <FieldGroup
                    title="Catalog sync"
                    hint="Re-reads the official Cloudflare and Gemini pricing pages: it DISCOVERS models new to the page, refreshes every rate, and switches off any model that has disappeared from its provider's page (never deletes one — a tenant may still reference it). Task routing, enable/default and markup choices survive. Each provider is handled on its own, so a failed fetch on one never touches the other's models."
                  >
                    <Button variant="tonal" className="min-h-12 w-full" disabled={pricing.busy !== null} onClick={() => void sync()}>
                      {pricing.busy === "sync" ? <><Spinner className="size-4" /> Syncing…</> : <><RefreshCw /> Sync from the pricing docs</>}
                    </Button>
                  </FieldGroup>
                  <ActionResult msg={pricing.msg} err={pricing.err} />
                  {syncReport && <SyncReportCard report={syncReport} />}
                </Card>

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
                        icon={LayoutGrid}
                        title="No models in the catalog"
                        description="Nothing can be generated until the catalog is populated. Run the sync above to pull rates from the pricing docs."
                      />
                    ) : (
                      <div className="space-y-3">
                        <ActionResult msg={catalog.msg} err={catalog.err} />
                        {models.error && <Callout tone="warning" icon={AlertTriangle} live="alert">{models.error} Showing the last catalog that loaded.</Callout>}
                        <DefaultModelPicker lanes={TASK_LANES} models={models.data} busy={catalog.busy} onPick={setDefaultModel} />
                        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
                          The switch decides whether a tenant can pick a model at all. Prices are what the TENANT pays:{" "}
                          <span className="numeral">~n cr</span> is a typical request of that model&apos;s lane, and the second
                          line is the exact credit rate card. Neurons and the markup that produced them follow, as the cost basis.
                        </p>
                        {/* One decision for the whole list, rather than a
                            checkbox on every row: "should this reach the other
                            products" is a mode the operator is in, not a property
                            of a model. */}
                        <label className="flex items-center gap-2.5 rounded-xl bg-surface-2 p-3">
                          <Switch checked={allApps} onCheckedChange={setAllApps} aria-label="Apply changes to every 4DL app" />
                          <span className="min-w-0 flex-1 text-sm">
                            <span className="font-medium">Apply to every 4DL app</span>
                            <span className="block text-xs text-muted-foreground">
                              Switching a model on or off, and setting a lane default, also reaches the other products. Each
                              applies it once and keeps its own setting after that. Per-model prices are never sent.
                            </span>
                          </span>
                        </label>

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
                                    {/* A switched-off row READS switched off. The only signal
                                        used to be the toggle at the far right of a thirty-row
                                        list, so a model missing from the default picker looked
                                        like it had vanished rather than been turned off. */}
                                    <div className={cn("min-w-0 flex-1", m.enabled !== 1 && "opacity-55")}>
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="min-w-0 truncate text-sm font-medium">{m.label}</span>
                                        {m.enabled !== 1 && <Badge tone="neutral">off</Badge>}
                                        {/* A default that is switched off is a setting the
                                            engine ignores — it selects on `enabled = 1`. Say
                                            so rather than claiming it is in force. */}
                                        {m.is_default === 1 && (
                                          m.enabled === 1
                                            ? <Badge tone="primary">default · {laneLabel(m.task)}</Badge>
                                            : <Badge tone="warning">default, but off</Badge>
                                        )}
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

                {extraBelowCatalog}
              </div>
            ),
          },
          ...(extraSub
            ? [{
                key: extraSub.key,
                label: extraSub.label,
                value: extraSub.value,
                icon: Play,
                tone: "success" as const,
                render: () => extraSub.render(models.data ?? []),
              }]
            : []),
        ]}
      />
    </Stagger>
  );
}

/**
 * What the sync actually did, per provider.
 *
 * Reported separately because "0 added" is the NORMAL outcome of a healthy
 * re-sync, and a single summary line makes that indistinguishable from "the
 * button did nothing" — or worse, hides "Gemini: 0 parsed", which means the doc
 * format changed and the catalog is now frozen.
 */
function SyncReportCard({ report }: { report: SyncReport }) {
  return (
    <div className="space-y-2">
      {report.providers.map((p) => (
        <div key={p.provider} className="rounded-xl bg-surface-2 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{providerLabel(p.provider)}</span>
            <Badge tone={p.error ? "danger" : "success"}>{p.error ? "failed" : `${p.parsed} parsed`}</Badge>
          </div>
          {p.error ? (
            <p className="mt-1 text-danger">{p.error}</p>
          ) : (
            <p className="mt-1 text-muted-foreground">
              {p.added} new · {p.updated} refreshed · {p.disabled} switched off
              {p.unpriceable.length > 0 && <> · {p.unpriceable.length} unpriceable</>}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * The default model for each lane, as a straight list of selectors.
 *
 * ── Only SWITCHED-ON models are offered ─────────────────────────────────────
 *
 * This list used to carry every row of the lane, disabled ones included, marked
 * "(off)" — and picking one switched it on as a side effect. The convenience was
 * not worth what it cost: the catalog is where an operator decides which models
 * a deployment may use, and a picker that then offers the ones they just refused
 * makes those switches look advisory. Worse, it is a hidden write — "set the
 * text default" also meant "and re-enable a model you turned off".
 */
function DefaultModelPicker({ lanes, models, busy, onPick }: {
  lanes: AiLane[];
  models: ModelRow[];
  busy: string | null;
  onPick: (m: ModelRow) => void;
}) {
  // Vision is served by ANY Gemini model (they are all multimodal), but
  // `is_default` is scoped to a model's own task server-side, so only an
  // exact-lane row can be pinned. When the vision lane has no pinned row the
  // engine still answers — it widens to the Gemini text lanes — so name what
  // will actually run instead of claiming the lane is broken.
  const visionFallback =
    models.find((m) => m.provider === "google" && m.enabled === 1 && (m.task === "text" || m.task === "text-small") && m.is_default === 1)
    ?? models.find((m) => m.provider === "google" && m.enabled === 1 && (m.task === "text" || m.task === "text-small"))
    ?? null;

  const rows = lanes.map((lane) => {
    const inLane = models.filter((m) => m.task === lane.task);
    if (!inLane.length) return null;
    // What may be CHOSEN: switched on, AND runnable on this lane by this app.
    // The second half matters for rows whose tag promises more than the code
    // delivers — a Workers-AI `vision` model is in the vision lane and fails
    // every call, because that branch never attaches the image.
    const options = inLane.filter((m) => m.enabled === 1 && (!VETTED_LANES.has(lane.task) || (m.supports ?? [lane.task]).includes(lane.task)));
    const pinned = options.find((m) => m.is_default === 1) ?? null;
    const current = pinned ?? options[0] ?? null;
    // A row still flagged `is_default` that the operator has since switched OFF.
    // The engine ignores it, so it is a setting that exists and does nothing.
    const staleDefault = !pinned ? inLane.find((m) => m.is_default === 1) ?? null : null;
    // How many of this lane the picker is NOT offering. Counted so the row can
    // SAY it: a filtered list that hides its filter reads as a bug.
    const off = inLane.length - options.length;
    return { lane, options, off, current, pinned, staleDefault, fallback: lane.task === "vision" ? visionFallback : null };
  }).filter((l): l is NonNullable<typeof l> => !!l);
  if (!rows.length) return null;

  return (
    <Card className="space-y-3">
      <SectionHeader icon={CircleCheck} title="Default models" />
      <p className="text-sm text-muted-foreground">
        What answers each kind of call when a tenant hasn&apos;t chosen its own model — which is most of them. Only
        models switched on in the catalog below are offered, because those are the only ones the engine will serve.
      </p>
      <div className="space-y-2.5">
        {rows.map(({ lane, options, off, current, pinned, staleDefault, fallback }) => (
          <div key={lane.task} className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">{lane.label}</div>
                <div className="truncate text-xs text-muted-foreground">{lane.desc}</div>
              </div>
              {busy === `lane:${lane.task}` ? <Spinner className="size-4 shrink-0" /> : options.length ? (
                <Select
                  aria-label={`Default model for ${lane.label}`}
                  value={current?.id ?? ""}
                  disabled={busy !== null}
                  placeholder="Choose a model…"
                  className="h-9 w-auto max-w-[52%]"
                  onChange={(id) => { const m = options.find((x) => x.id === id); if (m) onPick(m); }}
                  options={options.map((m) => {
                    const cost = requestCost(m);
                    return { value: m.id, label: `${m.label}${cost !== null ? ` — ~${nf.format(cost)} cr` : ""}` };
                  })}
                />
              ) : (
                <span className="shrink-0 text-xs font-medium text-warning">Nothing to pick</span>
              )}
            </div>
            {/* One line per lane, and only the one that is true. Worst first: a
                lane with nothing switched on cannot answer at all, which outranks
                a stale pin, which outranks an unpinned but working fallback. */}
            {!options.length ? (
              fallback ? (
                <p className="text-xs text-muted-foreground">
                  Nothing here can be pinned — <b className="text-foreground">{fallback.label}</b> answers it. Every
                  Gemini model reads images, so this lane needs no default.
                </p>
              ) : (
                <p className="text-xs text-warning">
                  Nothing in this lane is both switched on and runnable here, so this kind of call will fail. Switch one
                  on in the catalog below.
                </p>
              )
            ) : staleDefault ? (
              <p className="text-xs text-warning">
                <b className="text-foreground">{staleDefault.label}</b> is still marked as this lane&rsquo;s default but is
                switched off, so the engine ignores it. Switch it back on below, or pin one of the models offered here.
              </p>
            ) : !pinned ? (
              fallback ? (
                <p className="text-xs text-muted-foreground">
                  Nothing pinned — <b className="text-foreground">{fallback.label}</b> answers it (every Gemini model
                  reads images). Pin one above to fix it.
                </p>
              ) : (
                <p className="text-xs text-warning">
                  No pinned default — the engine is falling back to{" "}
                  {current ? <b>{current.label}</b> : <>nothing, and this lane will fail</>}. Pick one to pin it.
                </p>
              )
            ) : null}
            {off > 0 && options.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {off} more in this lane {off === 1 ? "is" : "are"} not offered here — switched off, or not runnable by
                this app. The catalog below shows which.
              </p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
