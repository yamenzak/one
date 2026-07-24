/**
 * Coach: roster + create client + client detail. The detail IS the client app
 * (same surfaces scoped to the client) wrapped in coach chrome + editing tabs.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Card, Badge, Field, Sheet, Avatar, SegmentedControl, Page, Stagger, EmptyState, Reveal, SkeletonList, toneVar, Users, Mail, User, ArrowLeft, Plus, Copy, Check, ExternalLink } from "@mossa/ui";
import type { AttentionSeverity } from "@mossa/domain";
import { api } from "../../api.js";
import { SEVERITY_TONE } from "../../attention-ui.js";
import { Today } from "../client/Today.js";
import { Progress } from "../client/Progress.js";
import { CoachPlans } from "./CoachPlans.js";
import { GoalManager } from "./GoalManager.js";
import { ClientManage } from "./ClientManage.js";
import { ClientReport } from "./ClientReport.js";

export interface ClientSummary { id: string; displayName: string; email: string | null; status: string; hasLogin: boolean; avatarUrl?: string | null; avatarSeed?: string | null }

/** The invite payload POST /api/clients returns when an email is present — the
 *  branded deep-link (also emailed) the coach can show in the gym. */
interface Invite { url: string; token: string; email: string }

export function Clients() {
  const nav = useNavigate();
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  // After a client is created with an email, hold the invite so the coach can
  // show / copy the in-gym deep-link before continuing into the client.
  const [invite, setInvite] = useState<{ invite: Invite; clientId: string } | null>(null);

  // Per-client attention rollup — the worst item's label + how many, so a coach
  // spots a stale goal / quiet client / lab-to-review straight from the roster.
  const [att, setAtt] = useState<Map<string, { label: string; count: number; severity: AttentionSeverity }>>(new Map());
  const load = useCallback(async () => { setClients((await api.get<{ clients: ClientSummary[] }>("/api/clients")).clients); }, []);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    void api.get<{ clients: { clientId: string; items: { label: string; severity: AttentionSeverity }[] }[] }>("/api/coach/attention")
      .then((r) => setAtt(new Map(r.clients.filter((c) => c.items.length).map((c) => [c.clientId, { label: c.items[0]!.label, count: c.items.length, severity: c.items[0]!.severity }]))))
      .catch(() => undefined);
  }, []);

  const create = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ client: { id: string }; invite: Invite | null }>("/api/clients", { email: email.trim(), displayName: name.trim() || undefined });
      setCreateOpen(false); setName(""); setEmail(""); await load();
      // With an email the server emails a branded invite AND returns the deep-link
      // so the coach can show it in the gym; otherwise go straight to the client.
      if (r.invite) setInvite({ invite: r.invite, clientId: r.client.id });
      else nav(`/clients/${r.client.id}/today`);
    } finally { setBusy(false); }
  };
  const emailValid = /.+@.+\..+/.test(email.trim());

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
        <Button onClick={() => setCreateOpen(true)}><Plus /> New</Button>
      </div>

      <Reveal loading={!clients} skeleton={<SkeletonList card rows={6} thumb={44} />}>
        {clients && (clients.length === 0 ? (
          <EmptyState icon={Users} title="No clients yet" description="Add your first client. With an email set, they sign in the moment you do — no codes, no passwords." action={<Button onClick={() => setCreateOpen(true)}><Plus /> Add client</Button>} />
        ) : (
          <Stagger className="space-y-2">
            {clients.map((c) => (
              <Card key={c.id} interactive onClick={() => nav(`/clients/${c.id}/today`)} className="flex items-center gap-3.5 py-3.5">
                <Avatar name={c.displayName} src={c.avatarUrl} seed={c.avatarSeed ?? c.id} className="size-11" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 truncate font-semibold">{c.displayName}{att.has(c.id) && <span className="size-2 shrink-0 rounded-full" style={{ background: toneVar[SEVERITY_TONE[att.get(c.id)!.severity]] }} title="Needs attention" />}</div>
                  <div className="truncate text-sm text-muted-foreground">{c.email ?? "no email"}</div>
                </div>
                {att.has(c.id)
                  ? <Badge tone={SEVERITY_TONE[att.get(c.id)!.severity]}>{att.get(c.id)!.label}{att.get(c.id)!.count > 1 ? ` +${att.get(c.id)!.count - 1}` : ""}</Badge>
                  : c.hasLogin ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Invited</Badge>}
              </Card>
            ))}
          </Stagger>
        ))}
      </Reveal>

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title="New client">
        <div className="space-y-4">
          <Field label="Email" icon={Mail} type="email" value={email} onChange={(e) => setEmail(e.target.value)} hint="This is the invite — they sign in with a code and their space links automatically." />
          <Field label="Name (optional)" icon={User} value={name} onChange={(e) => setName(e.target.value)} hint="Leave blank and they'll add it on their profile." />
          <Button size="lg" className="w-full" disabled={!emailValid || busy} onClick={() => void create()}>{busy ? "Creating…" : "Add client"}</Button>
        </div>
      </Sheet>

      {invite && (
        <InviteSheet
          invite={invite.invite}
          onClose={() => { const id = invite.clientId; setInvite(null); nav(`/clients/${id}/today`); }}
        />
      )}
    </Page>
  );
}

/** Post-create invite affordance (SPEC §4): the branded deep-link is emailed to
 *  the client and shown here so the coach can also relay it in the gym — copy it,
 *  open it, or read it aloud. A scannable QR needs a generator lib (see residual);
 *  today the link is rendered prominently as the fallback. */
function InviteSheet({ invite, onClose }: { invite: Invite; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(invite.url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  };
  return (
    <Sheet open onClose={onClose} title="Client invited">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl [&_svg]:size-[1.35rem]" style={{ background: `color-mix(in oklch, ${toneVar.success} 15%, transparent)`, color: toneVar.success }}><Check /></div>
          <div className="min-w-0">
            <p className="text-sm">We emailed a branded sign-in link to <span className="font-medium text-foreground">{invite.email}</span>.</p>
            <p className="mt-1 text-sm text-muted-foreground">Share this link in the gym too — they open it and sign in with a one-time code, no password.</p>
          </div>
        </div>
        <div className="space-y-2 rounded-2xl bg-card p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invite link</div>
          <div className="break-all rounded-xl bg-surface-3 px-3 py-2.5 font-mono text-xs">{invite.url}</div>
          <div className="flex gap-2">
            <Button size="sm" variant="tonal" className="flex-1" onClick={() => void copy()}>{copied ? <><Check /> Copied</> : <><Copy /> Copy link</>}</Button>
            <Button size="sm" variant="secondary" className="flex-1" onClick={() => window.open(invite.url, "_blank", "noopener")}><ExternalLink /> Open</Button>
          </div>
        </div>
        <Button size="lg" className="w-full" onClick={onClose}>Go to client</Button>
      </div>
    </Sheet>
  );
}

const TABS = [
  { value: "today", label: "Today" },
  { value: "plans", label: "Plans" },
  { value: "goals", label: "Goals" },
  { value: "progress", label: "Progress" },
  { value: "report", label: "Report" },
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
      {/* Bare, floating sub-header — mirrors the AppBar's ambient language:
          no solid slab, so the page wash + content bleed behind it and only the
          identity chip + tab pill float over what's scrolling past. */}
      <div className="sticky top-16 z-20 space-y-2.5 px-4 pb-2 pt-2">
        <div className="mx-auto flex max-w-xl items-center">
          <div className="flex min-w-0 items-center gap-1.5 rounded-full border border-border/40 bg-background/60 py-1 pl-1 pr-3.5 backdrop-blur-md">
            <button onClick={() => nav("/clients")} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" aria-label="All clients">
              <ArrowLeft className="size-[1.1rem]" />
            </button>
            <Avatar name={client?.displayName ?? ""} src={client?.avatarUrl} seed={client?.avatarSeed ?? clientId} className="size-8 shrink-0" />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold">{client?.displayName ?? "…"}</div>
              <div className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">Coach view</div>
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-xl">
          <SegmentedControl fill options={TABS.map((t) => ({ value: t.value, label: t.label }))} value={tab} onChange={(v) => nav(`/clients/${clientId}/${v}`)} />
        </div>
      </div>
      {tab === "today" && <Today key={clientId} clientId={clientId} />}
      {tab === "plans" && <CoachPlans key={clientId} clientId={clientId} />}
      {tab === "goals" && <GoalManager key={clientId} clientId={clientId} />}
      {tab === "progress" && <Progress key={clientId} clientId={clientId} />}
      {tab === "report" && <ClientReport key={clientId} clientId={clientId} />}
      {tab === "manage" && <ClientManage key={clientId} clientId={clientId} />}
    </div>
  );
}
