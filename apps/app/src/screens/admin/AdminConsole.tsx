/** Platform admin console — tenants (comp/topup/seed), Stripe config. */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Badge, Field, Skeleton, SegmentedControl, Chip, Page, Stagger, ShieldCheck, Sparkles, ArrowLeft, KeyRound, Globe } from "@mossa/ui";
import { api } from "../../api.js";

interface Tenant { id: string; name: string; slug: string; plan_id: string | null; status: string | null; comp: number | null }
const PLANS = ["free", "solo", "studio", "team"];

type AdminTab = "tenants" | "stripe" | "domains";

export function AdminConsole({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<AdminTab>("tenants");
  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <div className="flex items-center gap-3"><Button size="icon" variant="secondary" onClick={onBack}><ArrowLeft /></Button><div className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /><h1 className="text-xl font-bold tracking-tight">Platform admin</h1></div></div>
      <SegmentedControl options={[{ value: "tenants", label: "Tenants" }, { value: "stripe", label: "Stripe" }, { value: "domains", label: "Domains" }]} value={tab} onChange={setTab} />
      {tab === "tenants" && <Tenants />}
      {tab === "stripe" && <StripeConfig />}
      {tab === "domains" && <DomainsConfig />}
    </Page>
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
  const load = useCallback(async () => setTenants((await api.get<{ tenants: Tenant[] }>("/api/admin/tenants")).tenants), []);
  useEffect(() => void load(), [load]);

  const comp = async (id: string, planId: string) => { setBusy(id); try { await api.post(`/api/admin/tenants/${id}/plan`, { planId, comp: true }); await load(); } finally { setBusy(null); } };
  const topUp = async (id: string) => { const c = Number(prompt("Credits to add") ?? "0"); if (c) await api.post(`/api/admin/tenants/${id}/topup`, { credits: c }); };
  const seedDemo = async () => { setBusy("demo"); try { const r = await api.post<{ seeded?: number; skipped?: string }>("/api/admin/seed-demo"); alert(r.skipped ? `Skipped: ${r.skipped}` : `Seeded ${r.seeded} sample clients.`); } finally { setBusy(null); } };

  if (!tenants) return <Skeleton className="h-64" />;
  return (
    <Stagger className="space-y-3">
      <Button variant="tonal" className="w-full" disabled={busy === "demo"} onClick={() => void seedDemo()}><Sparkles /> {busy === "demo" ? "Seeding…" : "Seed demo data into my tenant"}</Button>
      {tenants.map((t) => (
        <Card key={t.id} className="space-y-2.5">
          <div className="flex items-center justify-between"><div><div className="font-semibold">{t.name}</div><div className="text-xs text-muted-foreground">/{t.slug}</div></div><Badge tone={t.comp ? "sleep" : t.status === "active" ? "success" : "neutral"}>{t.comp ? "comped " : ""}{t.plan_id ?? "free"}</Badge></div>
          <div className="flex flex-wrap gap-2">
            {PLANS.map((p) => <button key={p} disabled={busy === t.id} onClick={() => void comp(t.id, p)} className="rounded-full bg-secondary px-3 py-1 text-xs capitalize transition-colors hover:bg-surface-3">{p}</button>)}
            <button onClick={() => void topUp(t.id)} className="rounded-full bg-primary/15 px-3 py-1 text-xs text-primary">+ credits</button>
          </div>
        </Card>
      ))}
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
