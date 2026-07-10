/**
 * Platform admin console (SPEC §2) — the ADMIN_EMAILS lane. Tenant list with
 * comp/top-up actions and Stripe platform config. A separate axis from tenant
 * RBAC; reached from the account menu when isPlatformAdmin.
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Chip, Field, Skeleton, SuggestionChip } from "@mossa/ui";
import { api } from "../../api.js";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan_id: string | null;
  status: string | null;
  comp: number | null;
}

const PLANS = ["free", "solo", "studio", "team"];

export function AdminConsole({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<"tenants" | "stripe">("tenants");
  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="grid size-10 place-items-center rounded-full bg-surface-2">←</button>
        <h1 className="text-xl font-bold">Platform admin</h1>
      </div>
      <div className="flex gap-2">
        <SuggestionChip selected={tab === "tenants"} onClick={() => setTab("tenants")}>Tenants</SuggestionChip>
        <SuggestionChip selected={tab === "stripe"} onClick={() => setTab("stripe")}>Stripe</SuggestionChip>
      </div>
      {tab === "tenants" ? <Tenants /> : <StripeConfig />}
    </div>
  );
}

function Tenants() {
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api.get<{ tenants: Tenant[] }>("/api/admin/tenants");
    setTenants(r.tenants);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const comp = async (id: string, planId: string) => {
    setBusy(id);
    try {
      await api.post(`/api/admin/tenants/${id}/plan`, { planId, comp: true });
      await load();
    } finally {
      setBusy(null);
    }
  };
  const topUp = async (id: string) => {
    const credits = Number(prompt("Credits to add") ?? "0");
    if (!credits) return;
    await api.post(`/api/admin/tenants/${id}/topup`, { credits });
  };

  const seedDemo = async () => {
    setBusy("demo");
    try {
      const r = await api.post<{ seeded?: number; skipped?: string }>("/api/admin/seed-demo");
      alert(r.skipped ? `Skipped: ${r.skipped}` : `Seeded ${r.seeded} sample clients into your active tenant.`);
    } finally {
      setBusy(null);
    }
  };

  if (!tenants) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-3">
      <Button variant="tonal" className="w-full" disabled={busy === "demo"} onClick={() => void seedDemo()}>
        {busy === "demo" ? "Seeding…" : "🌱 Seed demo data into my tenant"}
      </Button>
      {tenants.map((t) => (
        <Card key={t.id} className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">{t.name}</div>
              <div className="text-xs text-fg-muted">/{t.slug}</div>
            </div>
            <Chip tone={t.comp ? "sleep" : t.status === "active" ? "good" : "neutral"}>
              {t.comp ? "comped " : ""}
              {t.plan_id ?? "free"}
            </Chip>
          </div>
          <div className="flex flex-wrap gap-2">
            {PLANS.map((p) => (
              <button key={p} disabled={busy === t.id} onClick={() => void comp(t.id, p)} className="rounded-full bg-surface-2 px-3 py-1 text-xs">
                {p}
              </button>
            ))}
            <button onClick={() => void topUp(t.id)} className="rounded-full bg-primary-container px-3 py-1 text-xs text-on-primary-container">
              ＋ credits
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function StripeConfig() {
  const [status, setStatus] = useState<{ mode: string; enabled: boolean } | null>(null);
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void api.get<{ mode: string; enabled: boolean }>("/api/admin/stripe/status").then(setStatus).catch(() => undefined);
  }, []);

  const save = async () => {
    await api.post("/api/admin/stripe/config", { mode: "test", secretKey, webhookSecret });
    setMsg("Saved. Run catalog sync to push plans + packs to Stripe.");
    setStatus({ mode: "test", enabled: secretKey.startsWith("sk_") });
  };
  const sync = async () => {
    const r = await api.post<{ plans: number; packs: number }>("/api/admin/stripe/sync");
    setMsg(`Synced ${r.plans} plans + ${r.packs} packs to Stripe.`);
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Stripe (platform rail)</h2>
        <Chip tone={status?.enabled ? "good" : "neutral"}>{status?.mode ?? "…"}</Chip>
      </div>
      <Field label="Secret key (sk_test_…)" icon="🔑" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} />
      <Field label="Webhook signing secret (whsec_…)" icon="🪝" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} />
      <div className="flex gap-3">
        <Button className="flex-1" disabled={!secretKey.startsWith("sk_")} onClick={() => void save()}>Save</Button>
        <Button variant="outline" className="flex-1" disabled={!status?.enabled} onClick={() => void sync()}>Sync catalog</Button>
      </div>
      {msg && <p className="text-sm text-fg-muted">{msg}</p>}
    </Card>
  );
}
