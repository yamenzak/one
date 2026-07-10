/**
 * Coach: roster + create client + client detail. The detail IS the client app
 * (DESIGN.md §5 keystone): the same Today/Train/Eat/Progress components
 * rendered for that client, wrapped in coach chrome.
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Chip, Field, Sheet, Skeleton, SuggestionChip } from "@mossa/ui";
import { api } from "../../api.js";
import { Today } from "../client/Today.js";
import { Train } from "../client/Train.js";
import { Eat } from "../client/Eat.js";
import { Progress } from "../client/Progress.js";
import { CoachPlans } from "./CoachPlans.js";
import { GoalManager } from "./GoalManager.js";
import { ClientManage } from "./ClientManage.js";

export interface ClientSummary {
  id: string;
  displayName: string;
  email: string | null;
  status: string;
  hasLogin: boolean;
}

export function Clients() {
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<ClientSummary | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api.get<{ clients: ClientSummary[] }>("/api/clients");
    setClients(r.clients);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      await api.post("/api/clients", { displayName: name, email: email || undefined });
      setCreateOpen(false);
      setName("");
      setEmail("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (selected) return <ClientDetail client={selected} onBack={() => setSelected(null)} />;

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clients</h1>
        <Button onClick={() => setCreateOpen(true)}>＋ New client</Button>
      </div>

      {!clients ? (
        <Skeleton className="h-64" />
      ) : clients.length === 0 ? (
        <Card className="text-center">
          <div className="text-4xl">🤝</div>
          <h2 className="mt-2 text-lg font-semibold">No clients yet</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Add your first client. Give them an email and they can sign in the moment you do — no
            invite codes, no passwords.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {clients.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className="flex w-full items-center gap-4 rounded-[--radius-card] bg-surface-1 p-4 text-left active:scale-[0.99]"
            >
              <span className="grid size-12 place-items-center rounded-full bg-activity-container text-lg font-bold text-activity">
                {c.displayName.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{c.displayName}</span>
                <span className="block truncate text-sm text-fg-muted">{c.email ?? "no email"}</span>
              </span>
              {c.hasLogin ? <Chip tone="good">Active</Chip> : <Chip>Invited</Chip>}
            </button>
          ))}
        </div>
      )}

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title="New client">
        <div className="space-y-4">
          <Field label="Name" icon="🙂" value={name} onChange={(e) => setName(e.target.value)} />
          <Field
            label="Email (optional)"
            icon="✉️"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            helper="With an email set, they sign in with a code — their space links automatically."
          />
          <Button size="lg" className="w-full" disabled={name.trim().length < 2 || busy} onClick={() => void create()}>
            {busy ? "Creating…" : "Add client"}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

const DETAIL_TABS = ["Today", "Plans", "Goals", "Progress", "Manage"] as const;
type DetailTab = (typeof DETAIL_TABS)[number];

function ClientDetail({ client, onBack }: { client: ClientSummary; onBack: () => void }) {
  const [tab, setTab] = useState<DetailTab>("Today");
  return (
    <div>
      {/* Coach chrome */}
      <div className="sticky top-0 z-20 bg-bg/95 px-4 pb-3 pt-2 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <button onClick={onBack} className="grid size-10 place-items-center rounded-full bg-surface-2" aria-label="Back">
            ←
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{client.displayName}</div>
            <div className="text-xs text-fg-muted">Coach view — you see what they see</div>
          </div>
        </div>
        <div className="mx-auto mt-3 flex max-w-xl gap-2">
          {DETAIL_TABS.map((t) => (
            <SuggestionChip key={t} selected={tab === t} onClick={() => setTab(t)}>
              {t}
            </SuggestionChip>
          ))}
        </div>
      </div>
      {/* THE keystone: the same client surfaces + coach-only editing tabs. */}
      {tab === "Today" && <Today clientId={client.id} />}
      {tab === "Plans" && <CoachPlans clientId={client.id} />}
      {tab === "Goals" && <GoalManager clientId={client.id} />}
      {tab === "Progress" && <Progress clientId={client.id} />}
      {tab === "Manage" && <ClientManage clientId={client.id} />}
    </div>
  );
}
