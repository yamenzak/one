/** Platform admin console — tenants (comp/topup/seed), Stripe config. */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Badge, Field, Sheet, Skeleton, Reveal, SkeletonLine, SegmentedControl, Switch, Chip, Page, Stagger, ConfirmDialog, ShieldCheck, Sparkles, ArrowLeft, KeyRound, Globe, Gift, Tag, Trash2, Plus, cn, LayoutGrid } from "@mossa/ui";
import { api } from "../../api.js";

interface Tenant { id: string; name: string; slug: string; plan_id: string | null; status: string | null; comp: number | null }
const PLANS = ["free", "solo", "studio", "team"];

type AdminTab = "tenants" | "plans" | "stripe" | "promos" | "domains" | "ai" | "security";

export function AdminConsole({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<AdminTab>("tenants");
  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <div className="flex items-center gap-3"><Button size="icon" variant="secondary" onClick={onBack}><ArrowLeft /></Button><div className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /><h1 className="text-xl font-bold tracking-tight">Platform admin</h1></div></div>
      <div className="overflow-x-auto no-scrollbar"><SegmentedControl options={[{ value: "tenants", label: "Tenants" }, { value: "plans", label: "Plans" }, { value: "ai", label: "AI" }, { value: "stripe", label: "Stripe" }, { value: "promos", label: "Promos" }, { value: "domains", label: "Domains" }, { value: "security", label: "Security" }]} value={tab} onChange={setTab} /></div>
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

// ── Entitlements: shared matrix editor (plan builder + per-tenant gifting) ────
interface Ent { quotas: Record<string, number>; features: Record<string, boolean>; aiCredits: { monthlyGrant: number } }
interface EntMeta { featureKeys: string[]; quotaKeys: string[]; featureMeta: Record<string, { label: string; hint: string }>; quotaMeta: Record<string, { label: string; hint: string; unit?: string }> }

function EntitlementFields({ ent, meta, onChange }: { ent: Ent; meta: EntMeta; onChange: (e: Ent) => void }) {
  const setQuota = (k: string, v: number) => onChange({ ...ent, quotas: { ...ent.quotas, [k]: v } });
  const setFeature = (k: string, v: boolean) => onChange({ ...ent, features: { ...ent.features, [k]: v } });
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Limits</div>
        <div className="space-y-2.5">
          {meta.quotaKeys.map((k) => {
            const m = meta.quotaMeta[k] ?? { label: k, hint: "" };
            const v = ent.quotas[k] ?? 0;
            const unlimited = v < 0;
            return (
              <div key={k} className="flex items-center gap-2">
                <div className="min-w-0 flex-1"><div className="text-sm font-medium">{m.label}</div><div className="truncate text-xs text-muted-foreground">{m.hint}</div></div>
                <button onClick={() => setQuota(k, unlimited ? 0 : -1)} className={cn("shrink-0 rounded-full px-2 py-1 text-[0.65rem] font-medium transition-colors", unlimited ? "bg-primary/15 text-primary" : "bg-surface-3 text-muted-foreground")}>∞</button>
                <input type="number" min={0} disabled={unlimited} value={unlimited ? "" : v} onChange={(e) => setQuota(k, Math.max(0, Number(e.target.value) || 0))} className="w-20 rounded-lg bg-surface-2 px-2 py-1.5 text-right text-sm outline-none disabled:opacity-40" placeholder={unlimited ? "∞" : ""} />
                <span className="w-8 shrink-0 text-[0.65rem] text-muted-foreground">{unlimited ? "" : m.unit ?? ""}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Features</div>
        <div className="space-y-2.5">
          {meta.featureKeys.map((k) => {
            const m = meta.featureMeta[k] ?? { label: k, hint: "" };
            return (
              <div key={k} className="flex items-center justify-between gap-3">
                <div className="min-w-0"><div className="text-sm font-medium">{m.label}</div><div className="truncate text-xs text-muted-foreground">{m.hint}</div></div>
                <Switch checked={!!ent.features[k]} onCheckedChange={(val) => setFeature(k, val)} />
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-3">
        <div><div className="text-sm font-medium">Monthly AI credits</div><div className="text-xs text-muted-foreground">Granted each billing period</div></div>
        <input type="number" min={0} value={ent.aiCredits.monthlyGrant} onChange={(e) => onChange({ ...ent, aiCredits: { monthlyGrant: Math.max(0, Number(e.target.value) || 0) } })} className="w-24 rounded-lg bg-surface-2 px-2 py-1.5 text-right text-sm outline-none" />
      </div>
    </div>
  );
}

interface PlanFull { id: string; name: string; priceUsdMonth: number; active: number; tenantCount: number; entitlements: Ent }

function PlansConfig() {
  const [data, setData] = useState<({ plans: PlanFull[] } & EntMeta) | null>(null);
  const [edit, setEdit] = useState<PlanFull | null>(null);
  const load = useCallback(() => void api.get<{ plans: PlanFull[] } & EntMeta>("/api/admin/plans").then(setData).catch(() => undefined), []);
  useEffect(load, [load]);
  return (
    <Reveal loading={!data} className="space-y-3" skeleton={
      <>
        <SkeletonLine w="90%" h="xs" className="px-1" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="flex items-center justify-between">
            <div className="space-y-1.5"><SkeletonLine w="8rem" h="text" /><SkeletonLine w="5rem" h="xs" /></div>
            <Skeleton className="h-8 w-16 rounded-full" />
          </Card>
        ))}
      </>
    }>
      {data && (
      <Stagger className="space-y-3">
        <p className="px-1 text-xs text-muted-foreground">Compose each plan from every feature flag. Raising a limit or enabling a feature applies to all tenants on the plan instantly; lowering grandfathers existing tenants automatically.</p>
        {data.plans.map((p) => (
          <Card key={p.id} className="flex items-center justify-between">
            <div><div className="font-semibold">{p.name} <span className="ml-1 text-xs font-normal text-muted-foreground">${p.priceUsdMonth}/mo{p.active ? "" : " · off"}</span></div><div className="text-xs text-muted-foreground">{p.tenantCount} tenant{p.tenantCount === 1 ? "" : "s"}</div></div>
            <Button size="sm" variant="secondary" onClick={() => setEdit(p)}><LayoutGrid /> Edit</Button>
          </Card>
        ))}
        {edit && <PlanEditSheet plan={edit} meta={data} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      </Stagger>
      )}
    </Reveal>
  );
}

function PlanEditSheet({ plan, meta, onClose, onSaved }: { plan: PlanFull; meta: EntMeta; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(plan.name);
  const [price, setPrice] = useState(String(plan.priceUsdMonth));
  const [ent, setEnt] = useState<Ent>(plan.entitlements);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api.patch<{ grandfathered: number }>(`/api/admin/plans/${plan.id}`, { name, priceUsdMonth: Number(price) || 0, entitlements: ent });
      setMsg(r.grandfathered ? `Saved. ${r.grandfathered} existing tenant${r.grandfathered === 1 ? "" : "s"} kept their old limits.` : "Saved — applied to all tenants on this plan.");
      onSaved();
    } finally { setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title={`Edit ${plan.name}`}>
      <div className="space-y-4">
        <div className="flex gap-2">
          <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
          <Field label="$ / mo" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} className="w-24" />
        </div>
        <EntitlementFields ent={ent} meta={meta} onChange={setEnt} />
        <Button size="lg" className="w-full" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save plan"}</Button>
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      </div>
    </Sheet>
  );
}

function GiftSheet({ tenantId, name, onClose }: { tenantId: string; name: string; onClose: () => void }) {
  const [data, setData] = useState<({ planId: string; effective: Ent } & EntMeta) | null>(null);
  const [ent, setEnt] = useState<Ent | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { void api.get<{ planId: string; effective: Ent } & EntMeta>(`/api/admin/tenants/${tenantId}/entitlements`).then((d) => { setData(d); setEnt(d.effective); }).catch(() => undefined); }, [tenantId]);
  const save = async () => { if (!ent) return; setBusy(true); setMsg(null); try { const r = await api.patch<{ effective: Ent }>(`/api/admin/tenants/${tenantId}/overrides`, { grants: ent }); setEnt(r.effective); setMsg("Gifts applied — raises and unlocks only."); } finally { setBusy(false); } };
  const reset = async () => { setBusy(true); setMsg(null); try { const r = await api.patch<{ effective: Ent }>(`/api/admin/tenants/${tenantId}/overrides`, { reset: true }); setEnt(r.effective); setMsg("Gifts cleared — back to plan."); } finally { setBusy(false); } };
  return (
    <Sheet open onClose={onClose} title={`Gift — ${name}`}>
      <Reveal loading={!data || !ent} className="space-y-4" skeleton={
        <>
          <SkeletonLine w="90%" h="xs" />
          <div className="space-y-4">
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2"><div className="min-w-0 flex-1 space-y-1.5"><SkeletonLine w="45%" h="text" /><SkeletonLine w="65%" h="xs" /></div><Skeleton className="h-9 w-20 shrink-0 rounded-lg" /></div>
              ))}
            </div>
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-3"><div className="min-w-0 flex-1 space-y-1.5"><SkeletonLine w="40%" h="text" /><SkeletonLine w="55%" h="xs" /></div><Skeleton className="h-6 w-11 shrink-0 rounded-full" /></div>
              ))}
            </div>
          </div>
          <div className="flex gap-2"><Skeleton className="h-10 flex-1 rounded-full" /><Skeleton className="h-10 w-28 rounded-full" /></div>
        </>
      }>
        {data && ent && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">On the <span className="font-medium capitalize">{data.planId}</span> plan. You can raise limits and unlock features — never lower or disable (a value below the plan simply won't apply).</p>
          <EntitlementFields ent={ent} meta={data} onChange={setEnt} />
          <div className="flex gap-2">
            <Button className="flex-1" disabled={busy} onClick={() => void save()}>{busy ? "…" : "Apply gifts"}</Button>
            <Button variant="outline" disabled={busy} onClick={() => void reset()}>Reset to plan</Button>
          </div>
          {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
        </div>
        )}
      </Reveal>
    </Sheet>
  );
}

interface ModelRow { id: string; label: string; provider: string; task: string; input_rate: number | null; output_rate: number | null; unit_rate: number | null; unit_kind: string | null; markup: number | null; enabled: number; is_default: number }

/** AI provider config — Gemini key, mock mode, credit markup, and the model
 *  catalog synced from the official Cloudflare + Gemini pricing docs. */
function AiConfig() {
  const [status, setStatus] = useState<{ geminiKeySet: boolean; mockMode: string; markup: number; modelCount: number } | null>(null);
  const [geminiKey, setGeminiKey] = useState("");
  const [markup, setMarkupInput] = useState("");
  const [models, setModels] = useState<ModelRow[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const load = useCallback(() => {
    void api.get<{ geminiKeySet: boolean; mockMode: string; markup: number; modelCount: number }>("/api/admin/ai/config").then((s) => { setStatus(s); setMarkupInput(String(s.markup)); }).catch(() => undefined);
    void api.get<{ models: ModelRow[] }>("/api/admin/ai/models").then((r) => setModels(r.models)).catch(() => undefined);
  }, []);
  useEffect(load, [load]);
  const saveKey = async () => { await api.post("/api/admin/ai/config", { geminiKey }); setGeminiKey(""); setMsg("Saved. Gemini is now available for text, vision and image."); load(); };
  const setMock = async (mockMode: string) => { await api.post("/api/admin/ai/config", { mockMode }); load(); };
  const saveMarkup = async () => { const m = Number(markup); if (m >= 1 && m <= 100) { await api.post("/api/admin/ai/config", { markup: m }); setMsg(`Markup set to ${m}× — applied to every model.`); load(); } };
  const sync = async () => { setSyncing(true); setMsg(null); try { const r = await api.post<{ parsed: number; total: number; errors: string[] }>("/api/admin/ai/models/sync", {}); setMsg(r.errors?.length ? `Synced ${r.parsed} models (${r.errors.length} source error).` : `Synced ${r.parsed} models from the pricing docs.`); load(); } catch { setMsg("Sync failed — check outbound access to the docs."); } finally { setSyncing(false); } };
  const patchModel = async (id: string, body: { enabled?: boolean; isDefault?: boolean }) => { await api.patch(`/api/admin/ai/models/${encodeURIComponent(id)}`, body); load(); };

  const rate = (m: ModelRow) => m.unit_kind === "image" ? `${m.unit_rate ?? "?"} n/img` : `${m.input_rate ?? "?"} / ${m.output_rate ?? "?"} n/M`;
  const grouped = (models ?? []).reduce<Record<string, ModelRow[]>>((acc, m) => { (acc[m.provider] ??= []).push(m); return acc; }, {});

  return (
    <Stagger className="space-y-4">
      <Card className="space-y-4">
        <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Sparkles className="size-5 text-primary" /><h2 className="font-semibold">AI providers</h2></div><Badge tone={status?.geminiKeySet ? "success" : "neutral"}>{status?.geminiKeySet ? "Gemini on" : "mock only"}</Badge></div>
        <p className="text-sm text-muted-foreground">A Google AI Studio key unlocks Gemini for text, vision and image (Nano Banana) — more powerful than Workers AI. Workers AI stays available and cheaper.</p>
        <Field label={status?.geminiKeySet ? "Gemini API key — saved (blank keeps it)" : "Gemini API key"} icon={KeyRound} type="password" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} />
        <Button className="w-full" disabled={!geminiKey} onClick={() => void saveKey()}>Save key</Button>
        <div className="flex items-center justify-between border-t border-border/50 pt-3">
          <div><div className="text-sm font-medium">Mock mode</div><div className="text-xs text-muted-foreground">Force deterministic offline outputs (dev/testing).</div></div>
          <SegmentedControl options={[{ value: "auto", label: "Auto" }, { value: "on", label: "On" }, { value: "off", label: "Off" }]} value={status?.mockMode ?? "auto"} onChange={(v) => void setMock(v)} />
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center gap-2"><Sparkles className="size-5 text-primary" /><h2 className="font-semibold">Pricing & markup</h2></div>
        <p className="text-sm text-muted-foreground">Every model bills in credits at <span className="font-medium text-foreground">markup × the real provider cost</span> (Cloudflare neurons; Gemini USD converted to the same unit) — so the platform is always profitable. Setting the markup applies it to the whole catalog.</p>
        <div className="flex items-end gap-2">
          <div className="flex-1"><Field label="Credit markup (×)" inputMode="decimal" value={markup} onChange={(e) => setMarkupInput(e.target.value.replace(/[^0-9.]/g, ""))} /></div>
          <Button disabled={!(Number(markup) >= 1)} onClick={() => void saveMarkup()}>Apply</Button>
        </div>
        <Button variant="tonal" className="w-full" disabled={syncing} onClick={() => void sync()}><Sparkles /> {syncing ? "Syncing…" : `Sync catalog from Cloudflare + Gemini docs`}</Button>
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      </Card>

      <Reveal loading={models === null} className="space-y-4" skeleton={
        <>
          {Array.from({ length: 2 }).map((_, g) => (
            <Card key={g} className="space-y-2">
              <div className="flex items-center justify-between"><SkeletonLine w="8rem" h="text" /><Skeleton className="h-5 w-8 rounded-full" /></div>
              <div className="divide-y divide-border/40">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2 py-2">
                    <Skeleton className="size-5 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-1.5"><SkeletonLine w="50%" h="text" /><SkeletonLine w="35%" h="xs" /></div>
                    <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </>
      }>
        {models !== null && (
        <>
        {Object.entries(grouped).map(([provider, rows]) => (
          <Card key={provider} className="space-y-2">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold capitalize">{provider === "google" ? "Gemini (Google)" : "Workers AI"}</h3><Badge tone="neutral">{rows.length}</Badge></div>
            <div className="divide-y divide-border/40">
              {rows.map((m) => (
                <div key={m.id} className="flex items-center gap-2 py-2">
                  <button onClick={() => void patchModel(m.id, { isDefault: true })} aria-label="Set as default" title="Set as default for its task" className="shrink-0">
                    {m.is_default ? <Badge tone="primary">default</Badge> : <span className="grid size-5 place-items-center rounded-full border border-border text-transparent hover:border-primary" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{m.label}</div>
                    <div className="numeral truncate text-[0.65rem] text-muted-foreground">{m.task} · {rate(m)} · {m.markup ?? "?"}×</div>
                  </div>
                  <Switch checked={m.enabled === 1} onCheckedChange={(v) => void patchModel(m.id, { enabled: v })} />
                </div>
              ))}
            </div>
          </Card>
        ))}
        </>
        )}
      </Reveal>
    </Stagger>
  );
}

/** Cloudflare for SaaS credentials — powers tenant custom domains (SPEC §14.1). */
function DomainsConfig() {
  const [status, setStatus] = useState<{ configured: boolean; zoneId: string | null; cnameTarget: string | null; tokenSet: boolean } | null>(null);
  const [apiToken, setApiToken] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [cnameTarget, setCnameTarget] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => void api.get<{ configured: boolean; zoneId: string | null; cnameTarget: string | null; tokenSet: boolean }>("/api/admin/domains/config").then((s) => { setStatus(s); setZoneId(s.zoneId ?? ""); setCnameTarget(s.cnameTarget ?? ""); }).catch(() => undefined);
  useEffect(load, []);
  const save = async () => {
    const body: Record<string, string> = {};
    if (apiToken) body.apiToken = apiToken;
    if (zoneId) body.zoneId = zoneId;
    if (cnameTarget) body.cnameTarget = cnameTarget;
    await api.post("/api/admin/domains/config", body);
    setApiToken(""); setMsg("Saved. Tenants can now add custom domains in Settings."); load();
  };
  return (
    <Stagger>
      <Card className="space-y-4">
        <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Globe className="size-5 text-primary" /><h2 className="font-semibold">Cloudflare for SaaS</h2></div><Badge tone={status?.configured ? "success" : "neutral"}>{status?.configured ? "enabled" : "off"}</Badge></div>
        <p className="text-sm text-muted-foreground">A zone API token with <span className="font-medium">SSL and Certificates: Edit</span>, the SaaS-enabled zone id, and the CNAME target tenants point their domain at.</p>
        {/* One-time dashboard setup that can't be done from code. */}
        <ol className="space-y-1.5 rounded-xl bg-surface-2 p-3 text-xs text-muted-foreground">
          <li><span className="font-medium text-foreground">1.</span> On the 4dl.app zone → SSL/TLS → Custom Hostnames → <span className="font-medium">Enable</span>, and set a Fallback Origin (e.g. <code className="rounded bg-surface-3 px-1">ssl.mossa.4dl.app</code> → CNAME <code className="rounded bg-surface-3 px-1">mossa.4dl.app</code>, proxied).</li>
          <li><span className="font-medium text-foreground">2.</span> Create an API token scoped to that zone with <span className="font-medium">SSL and Certificates · Edit</span>.</li>
          <li><span className="font-medium text-foreground">3.</span> Paste the token, zone id, and the CNAME target below. Full steps in DEPLOY.md.</li>
        </ol>
        <Field label={status?.tokenSet ? "API token — saved (blank keeps it)" : "API token"} icon={KeyRound} type="password" value={apiToken} onChange={(e) => setApiToken(e.target.value)} />
        <Field label="Zone id" value={zoneId} onChange={(e) => setZoneId(e.target.value)} />
        <Field label="CNAME target (e.g. ssl.mossa.4dl.app)" icon={Globe} value={cnameTarget} onChange={(e) => setCnameTarget(e.target.value)} />
        <Button className="w-full" disabled={!apiToken && !zoneId && !cnameTarget} onClick={() => void save()}>Save</Button>
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      </Card>
    </Stagger>
  );
}

/** Cloudflare Turnstile — the bot check on the OTP-send path. Off until a
 *  secret is saved; the site key is handed to the login screen via /api/host. */
function SecurityConfig() {
  const [status, setStatus] = useState<{ siteKey: string | null; secretSet: boolean } | null>(null);
  const [siteKey, setSiteKey] = useState("");
  const [secret, setSecret] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => void api.get<{ siteKey: string | null; secretSet: boolean }>("/api/admin/turnstile/config").then((s) => { setStatus(s); setSiteKey(s.siteKey ?? ""); }).catch(() => undefined);
  useEffect(load, []);
  const save = async () => {
    // Send both so an emptied field clears it (turns Turnstile off).
    await api.post("/api/admin/turnstile/config", { siteKey, ...(secret ? { secret } : {}) });
    setSecret(""); setMsg("Saved. New sign-ins run the check once a secret is set."); load();
  };
  const disable = async () => { await api.post("/api/admin/turnstile/config", { siteKey: "", secret: "" }); setSiteKey(""); setSecret(""); setMsg("Turnstile turned off."); load(); };
  return (
    <Stagger>
      <Card className="space-y-4">
        <div className="flex items-center justify-between"><div className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /><h2 className="font-semibold">Turnstile bot check</h2></div><Badge tone={status?.secretSet ? "success" : "neutral"}>{status?.secretSet ? "enabled" : "off"}</Badge></div>
        <p className="text-sm text-muted-foreground">A Cloudflare Turnstile widget guards the email-code request on every login (platform + branded). Codes send freely until a secret is saved.</p>
        <ol className="space-y-1.5 rounded-xl bg-surface-2 p-3 text-xs text-muted-foreground">
          <li><span className="font-medium text-foreground">1.</span> In Cloudflare → Turnstile, add a widget. Under Hostnames, list <code className="rounded bg-surface-3 px-1">mossa.4dl.app</code> and any tenant custom domains (or use a domain-flexible widget) so the check works on white-label domains.</li>
          <li><span className="font-medium text-foreground">2.</span> Copy the <span className="font-medium">Site key</span> (public) and <span className="font-medium">Secret key</span> (server) below.</li>
        </ol>
        <Field label="Site key" icon={ShieldCheck} value={siteKey} onChange={(e) => setSiteKey(e.target.value)} placeholder="0x4AAAAAAA…" />
        <Field label={status?.secretSet ? "Secret key — saved (blank keeps it)" : "Secret key"} icon={KeyRound} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="0x4AAAAAAA…" />
        <div className="flex gap-2">
          <Button className="flex-1" disabled={!siteKey && !secret} onClick={() => void save()}>Save</Button>
          {status?.secretSet && <Button variant="secondary" onClick={() => void disable()}>Turn off</Button>}
        </div>
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      </Card>
    </Stagger>
  );
}

function Tenants() {
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [topUpId, setTopUpId] = useState<string | null>(null);
  const [credits, setCredits] = useState("");
  const [gift, setGift] = useState<{ id: string; name: string } | null>(null);
  const [compTarget, setCompTarget] = useState<{ id: string; name: string; planId: string } | null>(null);
  const load = useCallback(async () => setTenants((await api.get<{ tenants: Tenant[] }>("/api/admin/tenants")).tenants), []);
  useEffect(() => void load(), [load]);

  const comp = async (id: string, planId: string) => { setBusy(id); try { await api.post(`/api/admin/tenants/${id}/plan`, { planId, comp: true }); await load(); } finally { setBusy(null); } };
  const topUp = async () => { const c = Number(credits); if (topUpId && c) await api.post(`/api/admin/tenants/${topUpId}/topup`, { credits: c }); setTopUpId(null); setCredits(""); setMsg(c ? `Added ${c} credits.` : null); };
  const seedDemo = async () => { setBusy("demo"); setMsg(null); try { const r = await api.post<{ seeded?: number; skipped?: string }>("/api/admin/seed-demo"); setMsg(r.skipped ? `Skipped: ${r.skipped}` : `Seeded ${r.seeded} sample clients.`); } finally { setBusy(null); } };

  return (
    <Reveal loading={!tenants} className="space-y-3" skeleton={
      <>
        <Skeleton className="h-10 w-full rounded-full" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="space-y-2.5">
            <div className="flex items-center justify-between"><div className="space-y-1.5"><SkeletonLine w="7rem" h="text" /><SkeletonLine w="4rem" h="xs" /></div><Skeleton className="h-6 w-16 rounded-full" /></div>
            <div className="flex flex-wrap gap-2">{Array.from({ length: 6 }).map((_, j) => <Skeleton key={j} className="h-7 w-16 rounded-full" />)}</div>
          </Card>
        ))}
      </>
    }>
      {tenants && (
    <Stagger className="space-y-3">
      <Button variant="tonal" className="w-full" disabled={busy === "demo"} onClick={() => void seedDemo()}><Sparkles /> {busy === "demo" ? "Seeding…" : "Seed demo data into my tenant"}</Button>
      {msg && <p className="text-center text-sm text-muted-foreground">{msg}</p>}
      {tenants.map((t) => (
        <Card key={t.id} className="space-y-2.5">
          <div className="flex items-center justify-between"><div><div className="font-semibold">{t.name}</div><div className="text-xs text-muted-foreground">/{t.slug}</div></div><Badge tone={t.comp ? "sleep" : t.status === "active" ? "success" : "neutral"}>{t.comp ? "comped " : ""}{t.plan_id ?? "free"}</Badge></div>
          <div className="flex flex-wrap gap-2">
            {PLANS.map((p) => <button key={p} disabled={busy === t.id} onClick={() => setCompTarget({ id: t.id, name: t.name, planId: p })} className="rounded-full bg-secondary px-3 py-1 text-xs capitalize transition-all active:scale-95 hover:bg-surface-3">{p}</button>)}
            <button onClick={() => setTopUpId(t.id)} className="rounded-full bg-primary/15 px-3 py-1 text-xs text-primary transition-transform active:scale-95">+ credits</button>
            <button onClick={() => setGift({ id: t.id, name: t.name })} className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-xs text-primary transition-transform active:scale-95 [&_svg]:size-3.5"><Gift /> gift</button>
          </div>
        </Card>
      ))}
      {gift && <GiftSheet tenantId={gift.id} name={gift.name} onClose={() => setGift(null)} />}
      <ConfirmDialog
        open={!!compTarget}
        onOpenChange={(o) => !o && setCompTarget(null)}
        title={compTarget ? `Comp ${compTarget.name} to ${compTarget.planId}?` : "Comp plan?"}
        description="This immediately moves the tenant onto this plan as a comp — no charge. It takes effect right away."
        confirmLabel="Comp plan"
        onConfirm={() => { if (compTarget) void comp(compTarget.id, compTarget.planId); }}
      />
      <Sheet open={!!topUpId} onClose={() => setTopUpId(null)} title="Add credits">
        <div className="space-y-4">
          <Field label="Credits to add" inputMode="numeric" value={credits} onChange={(e) => setCredits(e.target.value.replace(/\D/g, ""))} autoFocus />
          <Button size="lg" className="w-full" disabled={!Number(credits)} onClick={() => void topUp()}>Add credits</Button>
        </div>
      </Sheet>
    </Stagger>
      )}
    </Reveal>
  );
}

function StripeConfig() {
  const [status, setStatus] = useState<{ mode: string; enabled: boolean } | null>(null);
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { void api.get<{ mode: string; enabled: boolean }>("/api/admin/stripe/status").then(setStatus).catch(() => undefined); }, []);
  const save = async () => { await api.post("/api/admin/stripe/config", { mode: "test", secretKey, webhookSecret }); setMsg("Saved. Run catalog sync to push plans + packs."); setStatus({ mode: "test", enabled: secretKey.startsWith("sk_") }); };
  const sync = async () => { const r = await api.post<{ plans: number; packs: number }>("/api/admin/stripe/sync"); setMsg(`Synced ${r.plans} plans + ${r.packs} packs.`); };
  return (
    <Stagger>
      <Card className="space-y-4">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Stripe (platform rail)</h2><Badge tone={status?.enabled ? "success" : "neutral"}>{status?.mode ?? "…"}</Badge></div>
        <Field label="Secret key (sk_test_…)" icon={KeyRound} value={secretKey} onChange={(e) => setSecretKey(e.target.value)} />
        <Field label="Webhook secret (whsec_…)" icon={KeyRound} value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} />
        <div className="flex gap-3"><Button className="flex-1" disabled={!secretKey.startsWith("sk_")} onClick={() => void save()}>Save</Button><Button variant="outline" className="flex-1" disabled={!status?.enabled} onClick={() => void sync()}>Sync catalog</Button></div>
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      </Card>
    </Stagger>
  );
}

// ── Platform promo codes (Mossa → tenant): website-native discounts on a
//    tenant's credit-pack purchase. Percentage or fixed, optional max uses. ─────
interface PPromo { id: string; code: string; discount_type: string; percent_off: number | null; amount_off_cents: number | null; redemption_count: number; max_redemptions: number | null; active: number }

function PlatformPromos() {
  const [promos, setPromos] = useState<PPromo[] | null>(null);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<PPromo | null>(null);
  const load = useCallback(async () => setPromos((await api.get<{ codes: PPromo[] }>("/api/admin/promo-codes")).codes), []);
  useEffect(() => void load(), [load]);
  const del = async (id: string) => { await api.del(`/api/admin/promo-codes/${id}`); await load(); };
  return (
    <Stagger className="space-y-3">
      <div className="flex items-center justify-between">
        <div><h2 className="font-semibold">Platform promo codes</h2><p className="text-xs text-muted-foreground">Discounts on tenants' credit-pack purchases.</p></div>
        <Button size="sm" onClick={() => setOpen(true)}><Plus /> New</Button>
      </div>
      <Reveal loading={!promos} skeleton={<SkeletonLine />}>
        {promos && (promos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No platform promo codes yet.</p>
        ) : (
          <div className="space-y-2">
            {promos.map((p) => (
              <Card key={p.id} className={cn("flex items-center justify-between", !p.active && "opacity-50")}>
                <div className="flex items-center gap-2.5">
                  <div className="grid size-8 place-items-center rounded-full bg-primary/10 text-primary [&_svg]:size-4"><Tag /></div>
                  <div><div className="font-mono font-semibold">{p.code}</div><div className="text-xs text-muted-foreground">{p.discount_type === "percent" ? `${p.percent_off}% off` : `$${((p.amount_off_cents ?? 0) / 100).toFixed(0)} off`} · used {p.redemption_count}{p.max_redemptions ? `/${p.max_redemptions}` : ""}</div></div>
                </div>
                {p.active ? <button onClick={() => setToDelete(p)} aria-label="Delete promo code" className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-danger-soft hover:text-danger [&_svg]:size-4"><Trash2 /></button> : <Badge tone="neutral">inactive</Badge>}
              </Card>
            ))}
          </div>
        ))}
      </Reveal>
      {open && <PlatformPromoSheet onClose={() => setOpen(false)} onSaved={() => { setOpen(false); void load(); }} />}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={toDelete ? `Delete promo ${toDelete.code}?` : "Delete promo code?"}
        description="This deactivates the code so it can no longer be applied at checkout."
        confirmLabel="Delete"
        destructive
        onConfirm={() => { if (toDelete) void del(toDelete.id); }}
      />
    </Stagger>
  );
}

function PlatformPromoSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setError(null);
    try {
      await api.post("/api/admin/promo-codes", {
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
    <Sheet open onClose={onClose} title="New platform promo">
      <div className="space-y-4">
        <Field label="Code" icon={Tag} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="LAUNCH20" />
        <div className="flex gap-2">{(["percent", "amount"] as const).map((t) => <Chip key={t} selected={discountType === t} onClick={() => setDiscountType(t)}>{t === "percent" ? "% off" : "$ off"}</Chip>)}</div>
        <Field label={discountType === "percent" ? "Percent off" : "Amount off (USD)"} value={value} inputMode="decimal" onChange={(e) => setValue(e.target.value)} />
        <Field label="Max redemptions (blank = unlimited)" value={maxRedemptions} inputMode="numeric" onChange={(e) => setMaxRedemptions(e.target.value.replace(/\D/g, ""))} />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button size="lg" className="w-full" disabled={code.length < 3 || !value || busy} onClick={() => void save()}>{busy ? "Creating…" : "Create promo"}</Button>
      </div>
    </Sheet>
  );
}
