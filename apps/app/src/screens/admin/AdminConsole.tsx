/** Platform admin console — tenants (comp/topup/seed), Stripe config. */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Badge, Field, Skeleton, SegmentedControl, Chip, Page, Stagger, ShieldCheck, Sparkles, ArrowLeft, KeyRound } from "@mossa/ui";
import { api } from "../../api.js";

interface Tenant { id: string; name: string; slug: string; plan_id: string | null; status: string | null; comp: number | null }
const PLANS = ["free", "solo", "studio", "team"];

export function AdminConsole({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<"tenants" | "stripe">("tenants");
  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <div className="flex items-center gap-3"><Button size="icon" variant="secondary" onClick={onBack}><ArrowLeft /></Button><div className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /><h1 className="text-xl font-bold tracking-tight">Platform admin</h1></div></div>
      <SegmentedControl options={[{ value: "tenants", label: "Tenants" }, { value: "stripe", label: "Stripe" }]} value={tab} onChange={setTab} />
      {tab === "tenants" ? <Tenants /> : <StripeConfig />}
    </Page>
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
