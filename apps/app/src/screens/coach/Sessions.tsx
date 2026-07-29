/**
 * Coach: sessions & front desk (SPEC §8.9, `frontDesk` entitlement). Owners
 * define add-on types (consultations) and any staff member schedules sessions
 * against a client's add-on balance.
 *
 * The balance ledger lives server-side (`session-routes.ts`) and this screen must
 * describe it truthfully: **completing OR no-showing spends a unit; cancelling a
 * session that already spent one hands it back; cancelling a still-scheduled
 * session spends and refunds nothing.** Booking without an unspent unit is
 * refused, so the schedule sheet has to surface the server's message rather than
 * failing silently. Resolved sessions stay on screen as history (the API returns
 * a 30-day tail) — that is where a consumed unit can be handed back by reopening.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Badge, Field, Sheet, Select, Page, Stagger, EmptyState, IconBadge, SectionHeader, ConfirmDialog, Reveal, SkeletonList, Avatar, Calendar, Clock, CheckCheck, X, User, Plus, Ticket, CreditCard, History, RotateCcw , Group, Row } from "@kova/ui";
import { api, errorText } from "../../api.js";
import { useSession } from "../../session.js";
import { FeatureLock } from "../../FeatureLock.js";
import { fmtPrice } from "../../money.js";
import type { ClientSummary } from "./Clients.js";

interface AddOnType { id: string; slug: string; label: string; kind: string; duration_minutes: number; standalone_price_cents: number | null }
interface SessionRow { id: string; client_id: string; addon_type_id: string; scheduled_at: string; duration_minutes: number; status: string; notes: string | null }

const STATUS_TONE: Record<string, "success" | "activity" | "danger" | "neutral"> = { completed: "success", scheduled: "activity", no_show: "danger", cancelled: "neutral" };

export function Sessions() {
  const { ctx } = useSession();
  const isOwner = ctx?.active?.role === "owner";
  const [types, setTypes] = useState<AddOnType[] | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [cancelling, setCancelling] = useState<SessionRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [t, s, cl] = await Promise.all([
      api.get<{ addOnTypes: AddOnType[] }>("/api/addon-types").catch(() => ({ addOnTypes: [] })),
      api.get<{ sessions: SessionRow[] }>("/api/sessions").catch(() => ({ sessions: [] })),
      api.get<{ clients: ClientSummary[] }>("/api/clients").catch(() => ({ clients: [] })),
    ]);
    setTypes(t.addOnTypes); setSessions(s.sessions); setClients(cl.clients);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const clientName = (id: string) => clients.find((c) => c.id === id)?.displayName ?? "Client";
  const typeLabel = (id: string) => types?.find((t) => t.id === id)?.label ?? "Session";

  // The API returns upcoming bookings AND a recent resolved tail in one list;
  // split them so history reads newest-first without hiding what's coming up.
  const upcoming = useMemo(() => (sessions ?? []).filter((s) => s.status === "scheduled"), [sessions]);
  const history = useMemo(
    () => (sessions ?? []).filter((s) => s.status !== "scheduled").sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at)),
    [sessions],
  );

  const transition = async (id: string, status: "scheduled" | "completed" | "no_show" | "cancelled") => {
    setBusyId(id);
    setMsg(null);
    try { await api.patch(`/api/sessions/${id}`, { status }); await load(); }
    catch (e) { setMsg(errorText(e, "Couldn't update that session.")); }
    finally { setBusyId(null); }
  };

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <FeatureLock feature="frontDesk">
        <Reveal loading={!sessions || !types} className="space-y-4" skeleton={<><SkeletonList card rows={4} thumb={40} /><SkeletonList card rows={2} thumb={36} /></>}>
          {sessions && types && (
          <>
            <SectionHeader icon={Calendar} tone="cardio" title="Upcoming sessions" action={<Button size="sm" disabled={types.length === 0 || clients.length === 0} onClick={() => setScheduleOpen(true)}><Plus /> Schedule</Button>} />
            {msg && <p role="status" aria-live="polite" className="text-sm text-danger">{msg}</p>}
            {upcoming.length === 0 ? (
              <EmptyState icon={Calendar} title="No sessions scheduled" description={types.length === 0 ? "Add a consultation type below, then schedule a session against a client's add-on balance." : "Schedule a session against a client's add-on balance — completing it or marking a no-show spends a unit."} />
            ) : (
              <Stagger className="space-y-2">
                {upcoming.map((s) => (
                  <Card key={s.id} className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={clientName(s.client_id)} seed={s.client_id} className="size-10" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{clientName(s.client_id)}</div>
                        <div className="truncate text-sm text-muted-foreground">{typeLabel(s.addon_type_id)}</div>
                      </div>
                      <Badge tone={STATUS_TONE[s.status] ?? "neutral"}>{s.status.replace("_", " ")}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 [&_svg]:size-3.5"><Calendar />{new Date(s.scheduled_at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                      <span className="inline-flex items-center gap-1 [&_svg]:size-3.5"><Clock />{s.duration_minutes} min</span>
                    </div>
                    {s.notes && <p className="text-sm text-muted-foreground">{s.notes}</p>}
                    <div className="flex flex-wrap gap-2 border-t border-border/40 pt-3">
                      <Button size="sm" variant="tonal" disabled={busyId === s.id} onClick={() => void transition(s.id, "completed")}><CheckCheck /> Complete</Button>
                      <Button size="sm" variant="secondary" disabled={busyId === s.id} onClick={() => void transition(s.id, "no_show")}><X /> No-show</Button>
                      <Button size="sm" variant="ghost" disabled={busyId === s.id} onClick={() => setCancelling(s)}>Cancel</Button>
                    </div>
                  </Card>
                ))}
              </Stagger>
            )}

            {history.length > 0 && (
              <>
                <SectionHeader className="pt-2" icon={History} tone="neutral" title="Recent history" />
                <Stagger className="space-y-2">
                  {history.map((s) => (
                    <Card key={s.id} className="space-y-2.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={clientName(s.client_id)} seed={s.client_id} className="size-9 opacity-70" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{clientName(s.client_id)}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {typeLabel(s.addon_type_id)} · {new Date(s.scheduled_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                          </div>
                        </div>
                        <Badge tone={STATUS_TONE[s.status] ?? "neutral"}>{s.status.replace("_", " ")}</Badge>
                      </div>
                      {(s.status === "completed" || s.status === "no_show") && (
                        <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-2.5">
                          <Button size="sm" variant="ghost" disabled={busyId === s.id} onClick={() => void transition(s.id, "scheduled")}><RotateCcw /> Reopen</Button>
                          <span className="text-xs text-muted-foreground">Returns the add-on unit to their balance.</span>
                        </div>
                      )}
                    </Card>
                  ))}
                </Stagger>
              </>
            )}

            <SectionHeader className="pt-2" icon={Ticket} tone="primary" title="Add-on types" action={isOwner ? <Button size="sm" onClick={() => setTypeOpen(true)}><Plus /> Type</Button> : undefined} />
            {types.length === 0 ? (
              <p className="text-sm text-muted-foreground">{isOwner ? "Consultation types you can schedule against a client's add-on balance." : "No add-on types yet — ask the studio owner to add one."}</p>
            ) : (
              <Group>
                {types.map((t) => (
                  <Row key={t.id} icon={Calendar} sub={`${t.duration_minutes} min${t.standalone_price_cents != null ? ` · ${fmtPrice(t.standalone_price_cents)}` : ""}`}>
                    {t.label}
                  </Row>
                ))}
              </Group>
            )}
          </>
          )}
        </Reveal>

        {scheduleOpen && types && <ScheduleSheet clients={clients} types={types} onClose={() => setScheduleOpen(false)} onSaved={() => { setScheduleOpen(false); void load(); }} />}
        {typeOpen && <AddOnTypeSheet onClose={() => setTypeOpen(false)} onSaved={() => { setTypeOpen(false); void load(); }} />}

        <ConfirmDialog
          open={!!cancelling}
          onOpenChange={(o) => !o && setCancelling(null)}
          title="Cancel this session?"
          // Honest copy: a scheduled session has spent nothing yet, so there is no
          // unit to refund — the booking is simply released. (The old text promised
          // a refund that never happened.) A unit only comes back by reopening a
          // completed / no-showed session.
          description="Cancelling releases the booking and notifies the client. Their add-on unit was never spent, so nothing is refunded."
          confirmLabel="Cancel session"
          destructive
          onConfirm={() => { if (cancelling) void transition(cancelling.id, "cancelled"); }}
        />
      </FeatureLock>
    </Page>
  );
}

/** Schedule a session — client × add-on type × when. */
function ScheduleSheet({ clients, types, onClose, onSaved }: { clients: ClientSummary[]; types: AddOnType[]; onClose: () => void; onSaved: () => void }) {
  const [clientId, setClientId] = useState("");
  const [addOnTypeId, setAddOnTypeId] = useState(types[0]?.id ?? "");
  const [when, setWhen] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const duration = types.find((t) => t.id === addOnTypeId)?.duration_minutes ?? 30;
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.post("/api/sessions", { clientId, addOnTypeId, scheduledAt: new Date(when).toISOString(), durationMinutes: duration, notes: notes.trim() || undefined });
      onSaved();
    }
    // The server refuses a booking with no unspent add-on unit (409) and its
    // message says how to fix it — show that, don't swallow it.
    catch (e) { setErr(errorText(e, "Couldn't schedule that session.")); }
    finally { setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title="Schedule a session">
      <div className="space-y-4">
        <div className="space-y-1.5"><span className="text-sm text-muted-foreground">Client</span><Select aria-label="Client" value={clientId} onChange={setClientId} options={[{ value: "", label: "Choose a client…" }, ...clients.map((c) => ({ value: c.id, label: c.displayName }))]} /></div>
        <div className="space-y-1.5"><span className="text-sm text-muted-foreground">Add-on type</span><Select aria-label="Add-on type" value={addOnTypeId} onChange={setAddOnTypeId} options={types.map((t) => ({ value: t.id, label: `${t.label} · ${t.duration_minutes} min` }))} /></div>
        <label className="block space-y-1.5">
          <span className="text-sm text-muted-foreground">When</span>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-full rounded-xl bg-surface-3 px-3 py-2.5 text-sm outline-none ring-ring focus-visible:ring-2" />
        </label>
        <Field label="Notes (optional)" icon={User} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {err && <p role="status" aria-live="polite" className="text-sm text-danger">{err}</p>}
        <Button size="lg" className="w-full" disabled={!clientId || !addOnTypeId || !when || busy} onClick={() => void save()}>{busy ? "Scheduling…" : "Schedule session"}</Button>
      </div>
    </Sheet>
  );
}

/** Define a new add-on / consultation type (owner only). */
function AddOnTypeSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState("");
  const [duration, setDuration] = useState("30");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.post("/api/addon-types", { label: label.trim(), durationMinutes: Number(duration) || 30, standalonePriceCents: price ? Math.round(Number(price) * 100) : undefined });
      onSaved();
    }
    catch (e) { setErr(errorText(e, "Couldn't create that add-on type.")); }
    finally { setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title="New add-on type">
      <div className="space-y-4">
        <Field label="Label" icon={Ticket} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nutrition consultation" />
        <Field label="Duration (minutes)" icon={Clock} value={duration} inputMode="numeric" onChange={(e) => setDuration(e.target.value.replace(/\D/g, ""))} />
        <Field label="Standalone price (USD, optional)" icon={CreditCard} value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value)} hint="What one session costs on its own. Setting it also lets staff book this type when a client has no included units left." />
        {err && <p role="status" aria-live="polite" className="text-sm text-danger">{err}</p>}
        <Button size="lg" className="w-full" disabled={label.trim().length < 2 || busy} onClick={() => void save()}>{busy ? "Creating…" : "Create type"}</Button>
      </div>
    </Sheet>
  );
}
