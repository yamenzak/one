/** Platform admin console — tenants (comp/topup/seed), Stripe config. */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Badge, Field, Sheet, Skeleton, SegmentedControl, Switch, Chip, Page, Stagger, ShieldCheck, Sparkles, ArrowLeft, KeyRound, Globe } from "@mossa/ui";
import { api } from "../../api.js";

interface Tenant { id: string; name: string; slug: string; plan_id: string | null; status: string | null; comp: number | null }
const PLANS = ["free", "solo", "studio", "team"];

type AdminTab = "tenants" | "stripe" | "domains" | "ai";

export function AdminConsole({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<AdminTab>("tenants");
  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <div className="flex items-center gap-3"><Button size="icon" variant="secondary" onClick={onBack}><ArrowLeft /></Button><div className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /><h1 className="text-xl font-bold tracking-tight">Platform admin</h1></div></div>
      <SegmentedControl options={[{ value: "tenants", label: "Tenants" }, { value: "stripe", label: "Stripe" }, { value: "ai", label: "AI" }, { value: "domains", label: "Domains" }]} value={tab} onChange={setTab} />
      {tab === "tenants" && <Tenants />}
      {tab === "stripe" && <StripeConfig />}
      {tab === "ai" && <AiConfig />}
      {tab === "domains" && <DomainsConfig />}
    </Page>
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

      {models === null ? <Skeleton className="h-40" /> : (
        Object.entries(grouped).map(([provider, rows]) => (
          <Card key={provider} className="space-y-2">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold capitalize">{provider === "google" ? "Gemini (Google)" : "Workers AI"}</h3><Badge tone="neutral">{rows.length}</Badge></div>
            <div className="divide-y divide-border/40">
              {rows.map((m) => (
                <div key={m.id} className="flex items-center gap-2 py-2">
                  <button onClick={() => void patchModel(m.id, { isDefault: true })} title="Set as default for its task" className="shrink-0">
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
        ))
      )}
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

function Tenants() {
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [topUpId, setTopUpId] = useState<string | null>(null);
  const [credits, setCredits] = useState("");
  const load = useCallback(async () => setTenants((await api.get<{ tenants: Tenant[] }>("/api/admin/tenants")).tenants), []);
  useEffect(() => void load(), [load]);

  const comp = async (id: string, planId: string) => { setBusy(id); try { await api.post(`/api/admin/tenants/${id}/plan`, { planId, comp: true }); await load(); } finally { setBusy(null); } };
  const topUp = async () => { const c = Number(credits); if (topUpId && c) await api.post(`/api/admin/tenants/${topUpId}/topup`, { credits: c }); setTopUpId(null); setCredits(""); setMsg(c ? `Added ${c} credits.` : null); };
  const seedDemo = async () => { setBusy("demo"); setMsg(null); try { const r = await api.post<{ seeded?: number; skipped?: string }>("/api/admin/seed-demo"); setMsg(r.skipped ? `Skipped: ${r.skipped}` : `Seeded ${r.seeded} sample clients.`); } finally { setBusy(null); } };

  if (!tenants) return <Skeleton className="h-64" />;
  return (
    <Stagger className="space-y-3">
      <Button variant="tonal" className="w-full" disabled={busy === "demo"} onClick={() => void seedDemo()}><Sparkles /> {busy === "demo" ? "Seeding…" : "Seed demo data into my tenant"}</Button>
      {msg && <p className="text-center text-sm text-muted-foreground">{msg}</p>}
      {tenants.map((t) => (
        <Card key={t.id} className="space-y-2.5">
          <div className="flex items-center justify-between"><div><div className="font-semibold">{t.name}</div><div className="text-xs text-muted-foreground">/{t.slug}</div></div><Badge tone={t.comp ? "sleep" : t.status === "active" ? "success" : "neutral"}>{t.comp ? "comped " : ""}{t.plan_id ?? "free"}</Badge></div>
          <div className="flex flex-wrap gap-2">
            {PLANS.map((p) => <button key={p} disabled={busy === t.id} onClick={() => void comp(t.id, p)} className="rounded-full bg-secondary px-3 py-1 text-xs capitalize transition-all active:scale-95 hover:bg-surface-3">{p}</button>)}
            <button onClick={() => setTopUpId(t.id)} className="rounded-full bg-primary/15 px-3 py-1 text-xs text-primary transition-transform active:scale-95">+ credits</button>
          </div>
        </Card>
      ))}
      <Sheet open={!!topUpId} onClose={() => setTopUpId(null)} title="Add credits">
        <div className="space-y-4">
          <Field label="Credits to add" inputMode="numeric" value={credits} onChange={(e) => setCredits(e.target.value.replace(/\D/g, ""))} autoFocus />
          <Button size="lg" className="w-full" disabled={!Number(credits)} onClick={() => void topUp()}>Add credits</Button>
        </div>
      </Sheet>
    </Stagger>
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
