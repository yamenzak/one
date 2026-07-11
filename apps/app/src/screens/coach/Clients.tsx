/**
 * Coach: roster + create client + client detail. The detail IS the client app
 * (same surfaces scoped to the client) wrapped in coach chrome + editing tabs.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Card, Badge, Field, Sheet, Skeleton, Avatar, SegmentedControl, Page, Stagger, EmptyState, Users, Mail, User, ArrowLeft, Plus } from "@mossa/ui";
import { api } from "../../api.js";
import { Today } from "../client/Today.js";
import { Progress } from "../client/Progress.js";
import { CoachPlans } from "./CoachPlans.js";
import { GoalManager } from "./GoalManager.js";
import { ClientManage } from "./ClientManage.js";

export interface ClientSummary { id: string; displayName: string; email: string | null; status: string; hasLogin: boolean; avatarUrl?: string | null; avatarSeed?: string | null }

export function Clients() {
  const nav = useNavigate();
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const [pending, setPending] = useState<Set<string>>(new Set());
  const load = useCallback(async () => { setClients((await api.get<{ clients: ClientSummary[] }>("/api/clients")).clients); }, []);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    void api.get<{ swaps: { client_id: string }[] }>("/api/swaps").then((r) => setPending(new Set(r.swaps.map((s) => s.client_id)))).catch(() => undefined);
  }, []);

  const create = async () => {
    setBusy(true);
    try { const r = await api.post<{ client: { id: string } }>("/api/clients", { displayName: name, email: email || undefined }); setCreateOpen(false); setName(""); setEmail(""); await load(); nav(`/clients/${r.client.id}/today`); }
    finally { setBusy(false); }
  };

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
        <Button onClick={() => setCreateOpen(true)}><Plus /> New</Button>
      </div>

      {!clients ? <Skeleton className="h-64" /> : clients.length === 0 ? (
        <EmptyState icon={Users} title="No clients yet" description="Add your first client. With an email set, they sign in the moment you do — no codes, no passwords." action={<Button onClick={() => setCreateOpen(true)}><Plus /> Add client</Button>} />
      ) : (
        <Stagger className="space-y-2">
          {clients.map((c) => (
            <Card key={c.id} interactive onClick={() => nav(`/clients/${c.id}/today`)} className="flex items-center gap-3.5 py-3.5">
              <Avatar name={c.displayName} src={c.avatarUrl} seed={c.avatarSeed ?? c.id} className="size-11" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 truncate font-semibold">{c.displayName}{pending.has(c.id) && <span className="size-2 shrink-0 rounded-full bg-cardio" title="Needs action" />}</div>
                <div className="truncate text-sm text-muted-foreground">{c.email ?? "no email"}</div>
              </div>
              {pending.has(c.id) ? <Badge tone="cardio">Swap</Badge> : c.hasLogin ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Invited</Badge>}
            </Card>
          ))}
        </Stagger>
      )}

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title="New client">
        <div className="space-y-4">
          <Field label="Name" icon={User} value={name} onChange={(e) => setName(e.target.value)} />
          <Field label="Email (optional)" icon={Mail} type="email" value={email} onChange={(e) => setEmail(e.target.value)} hint="With an email, they sign in with a code — their space links automatically." />
          <Button size="lg" className="w-full" disabled={name.trim().length < 2 || busy} onClick={() => void create()}>{busy ? "Creating…" : "Add client"}</Button>
        </div>
      </Sheet>
    </Page>
  );
}

const TABS = [
  { value: "today", label: "Today" },
  { value: "plans", label: "Plans" },
  { value: "goals", label: "Goals" },
  { value: "progress", label: "Progress" },
  { value: "manage", label: "Manage" },
] as const;
type Tab = (typeof TABS)[number]["value"];

/** Client detail — URL-routed at /clients/:clientId/:subtab. The detail IS the
 *  client app scoped to that client, wrapped in coach chrome. */
export function ClientDetail() {
  const nav = useNavigate();
  const { clientId, subtab } = useParams<{ clientId: string; subtab?: string }>();
  const tab = (TABS.some((t) => t.value === subtab) ? subtab : "today") as Tab;
  const [client, setClient] = useState<ClientSummary | null>(null);
  useEffect(() => {
    if (!clientId) return;
    void api.get<{ client: ClientSummary }>(`/api/clients/${clientId}`).then((r) => setClient(r.client)).catch(() => setClient(null));
  }, [clientId]);
  if (!clientId) return null;
  return (
    <div>
      <div className="sticky top-16 z-20 space-y-3 border-b border-border/40 bg-background/80 px-4 pb-3 pt-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <Button size="icon" variant="secondary" onClick={() => nav("/clients")}><ArrowLeft /></Button>
          <Avatar name={client?.displayName ?? ""} src={client?.avatarUrl} seed={client?.avatarSeed ?? clientId} className="size-10" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{client?.displayName ?? "…"}</div>
            <div className="text-xs text-muted-foreground">Coach view</div>
          </div>
        </div>
        <div className="mx-auto max-w-xl overflow-x-auto">
          <SegmentedControl options={TABS.map((t) => ({ value: t.value, label: t.label }))} value={tab} onChange={(v) => nav(`/clients/${clientId}/${v}`)} />
        </div>
      </div>
      {tab === "today" && <Today clientId={clientId} />}
      {tab === "plans" && <CoachPlans clientId={clientId} />}
      {tab === "goals" && <GoalManager clientId={clientId} />}
      {tab === "progress" && <Progress clientId={clientId} />}
      {tab === "manage" && <ClientManage clientId={clientId} />}
    </div>
  );
}
