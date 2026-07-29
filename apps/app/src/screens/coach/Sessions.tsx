/**
 * Coach: sessions & front desk (SPEC §8.9, `frontDesk` entitlement). Owners
 * define session types (consultations) and any staff member books a client in
 * against the sessions their package prepaid.
 *
 * ── The words on this screen ────────────────────────────────────────────────
 * The server calls these things "add-on types" and an "add-on balance", and the
 * routes/columns keep those names. The SCREEN does not: a coach at a front desk
 * says "session type" and "sessions left", and "add-on unit" is a billing-model
 * word leaking into a scheduling tool. The API vocabulary stays in the code, the
 * human vocabulary stays on the glass.
 *
 * The balance ledger lives server-side (`session-routes.ts`) and this screen must
 * describe it truthfully: **completing OR no-showing spends a session; cancelling
 * a booking that already spent one hands it back; cancelling a still-scheduled
 * booking spends and refunds nothing.** Booking with nothing left is refused, so
 * the schedule sheet has to surface the server's message rather than failing
 * silently. Resolved bookings stay on screen as history (the API returns a 30-day
 * tail) — that is where a spent session can be handed back by reopening.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Badge, Field, Sheet, Select, Page, Stagger, EmptyState, SectionHeader, ConfirmDialog, Reveal, SkeletonList, Avatar, Anchor, CountUp, Calendar, Clock, CheckCheck, X, User, Plus, Ticket, CreditCard, History, RotateCcw , Group, Row } from "@kova/ui";
import { api, errorText } from "../../api.js";
import { useSession } from "../../session.js";
import { FeatureLock } from "../../FeatureLock.js";
import { fmtPrice } from "../../money.js";
import type { ClientSummary } from "./Clients.js";

interface AddOnType { id: string; slug: string; label: string; kind: string; duration_minutes: number; standalone_price_cents: number | null }
interface SessionRow { id: string; client_id: string; addon_type_id: string; scheduled_at: string; duration_minutes: number; status: string; notes: string | null }

const STATUS_TONE: Record<string, "success" | "activity" | "danger" | "neutral"> = { completed: "success", scheduled: "activity", no_show: "danger", cancelled: "neutral" };
/** `status.replace("_", " ")` put a lowercase "no show" on a badge next to
 *  sentence-cased ones. Statuses are a closed set; write them out. */
const STATUS_LABEL: Record<string, string> = { completed: "Completed", scheduled: "Scheduled", no_show: "No-show", cancelled: "Cancelled" };

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

  // Nothing to book against yet — the whole screen's first step.
  const needsType = types != null && types.length === 0;
  // The anchor's sub-line is the SECOND fact, never a restatement of the number
  // above it (§1): when something is booked it says when the next one is.
  const anchorSub = useMemo(() => {
    if (needsType) return "No session types yet";
    if (upcoming.length === 0) return clients.length === 0 ? "No clients yet" : "Nothing booked";
    const next = upcoming.reduce((a, b) => (a.scheduled_at <= b.scheduled_at ? a : b));
    /*
      RELATIVE HERE, ABSOLUTE ON THE CARD.

      The sub-line used to print "Fri 4:30 PM" — the same string the first card
      prints a hundred pixels below it, which with a single booking made the
      anchor a caption for the thing under it. How far out it is, is the fact
      the anchor can add and the card can't.
    */
    const when = new Date(next.scheduled_at);
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const days = Math.floor((when.getTime() - midnight.getTime()) / 86_400_000);
    const rel = days <= 0 ? `today, ${when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
      : days === 1 ? "tomorrow"
      : days < 7 ? `in ${days} days`
      : when.toLocaleDateString([], { month: "short", day: "numeric" });
    return `Next ${rel} · ${clientName(next.client_id)}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clientName reads `clients`, which is in the deps
  }, [needsType, upcoming, clients]);

  const transition = async (id: string, status: "scheduled" | "completed" | "no_show" | "cancelled") => {
    setBusyId(id);
    setMsg(null);
    try { await api.patch(`/api/sessions/${id}`, { status }); await load(); }
    catch (e) { setMsg(errorText(e, "Couldn't update that session.")); }
    finally { setBusyId(null); }
  };

  return (
    <Page className="column space-y-4 p-4 pb-28">
      <FeatureLock feature="frontDesk">
        <Reveal loading={!sessions || !types} className="space-y-4" skeleton={<><SkeletonList card rows={4} thumb={40} /><SkeletonList card rows={2} thumb={36} /></>}>
          {sessions && types && (
          <>
            {/*
              FIRST-RUN IS ITS OWN SCREEN.

              With no session types there is nothing to anchor: "Booked in 0" is
              the least informative number on a page whose entire subject is
              setup, and it stacked a hero, a button and an empty state all
              saying the same thing. This is the §1 no-T1 case — the empty state
              IS the surface, and it carries the action.
            */}
            {needsType ? (
              <EmptyState
                icon={Ticket}
                title="Set up your session types"
                description={isOwner
                  ? "A session type is one thing you offer — a nutrition consult, a body scan, a check-in call. Name it once and anyone on your team can book clients in."
                  : "Your studio owner sets these up. Once there's one, you can book clients in from here."}
                action={isOwner ? <Button size="lg" onClick={() => setTypeOpen(true)}><Plus /> Add a session type</Button> : undefined}
              />
            ) : (
            <>
            {/* T1 (§1). A front desk has exactly one question on arrival: what is
                booked. The old screen opened with a section header and two large
                empty regions and nothing to read. */}
            <Anchor eyebrow={"Booked in"} sub={anchorSub}>
        <CountUp value={upcoming.length} />
      </Anchor>

            <Stagger className="pb-1">
              <Button size="lg" className="w-full" disabled={clients.length === 0} onClick={() => setScheduleOpen(true)}><Plus /> Book a session</Button>
            </Stagger>

            {msg && <p role="status" aria-live="polite" className="text-sm text-danger">{msg}</p>}
            {upcoming.length === 0 ? (
              /* NOT an EmptyState. The anchor two lines up already says "Nothing
                 booked" and the action is the button between them, so a 350px
                 illustrated block could only repeat both — which it did, title
                 for title. What's left is the one thing neither says: what a
                 booking costs the client, and when. */
              <p className="px-6 pb-2 text-center text-sm text-muted-foreground">
                {clients.length === 0
                  ? "Add a client first, then book them in from here."
                  : "Marking a session complete — or a no-show — uses one of that client's prepaid sessions."}
              </p>
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
                      {/* No "Scheduled" badge here: everything in this list is
                          scheduled, so the badge said nothing and took the room
                          a long client name needed. */}
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
                        <Badge tone={STATUS_TONE[s.status] ?? "neutral"}>{STATUS_LABEL[s.status] ?? s.status}</Badge>
                      </div>
                      {(s.status === "completed" || s.status === "no_show") && (
                        <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-2.5">
                          <Button size="sm" variant="ghost" disabled={busyId === s.id} onClick={() => void transition(s.id, "scheduled")}><RotateCcw /> Reopen</Button>
                          <span className="text-xs text-muted-foreground">Gives the client their session back.</span>
                        </div>
                      )}
                    </Card>
                  ))}
                </Stagger>
              </>
            )}

            {/* Only once there is something to list. Empty, this used to be a
                section header, one hanging sentence, and half a screen of dead
                space below it — the setup instruction already lives in the
                empty state and the primary action above. */}
            {types.length > 0 && (
              <>
                <SectionHeader className="pt-2" icon={Ticket} tone="primary" title="What you offer" count={types.length} action={isOwner ? <Button size="sm" variant="secondary" onClick={() => setTypeOpen(true)}><Plus /> Add type</Button> : undefined} />
                <Group>
                  {types.map((t) => (
                    <Row key={t.id} icon={Calendar} sub={`${t.duration_minutes} min${t.standalone_price_cents != null ? ` · ${fmtPrice(t.standalone_price_cents)} on its own` : ""}`}>
                      {t.label}
                    </Row>
                  ))}
                </Group>
              </>
            )}
            </>
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
          description="The booking is released and the client is told. Nothing was used yet, so their prepaid sessions are untouched."
          confirmLabel="Cancel session"
          destructive
          onConfirm={() => { if (cancelling) void transition(cancelling.id, "cancelled"); }}
        />
      </FeatureLock>
    </Page>
  );
}

/** Book a session — client × type × when. */
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
    <Sheet open onClose={onClose} title="Book a session" footer={<Button size="lg" className="w-full" disabled={!clientId || !addOnTypeId || !when || busy} onClick={() => void save()}>{busy ? "Booking…" : "Book session"}</Button>}>
      <div className="space-y-4">
        <div className="space-y-1.5"><span className="text-sm text-muted-foreground">Client</span><Select aria-label="Client" value={clientId} onChange={setClientId} options={[{ value: "", label: "Choose a client…" }, ...clients.map((c) => ({ value: c.id, label: c.displayName }))]} /></div>
        <div className="space-y-1.5"><span className="text-sm text-muted-foreground">What for</span><Select aria-label="What for" value={addOnTypeId} onChange={setAddOnTypeId} options={types.map((t) => ({ value: t.id, label: `${t.label} · ${t.duration_minutes} min` }))} /></div>
        <label className="block space-y-1.5">
          <span className="text-sm text-muted-foreground">When</span>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-full rounded-xl bg-surface-3 px-3 py-2.5 text-sm outline-none ring-ring focus-visible:ring-2" />
        </label>
        <Field label="Notes (optional)" icon={User} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {err && <p role="status" aria-live="polite" className="text-sm text-danger">{err}</p>}
        {/* What the button is about to cost the client, said before it's spent —
            not after, in an error. */}
        <p className="text-xs text-muted-foreground">Booking holds the slot. It only uses one of their prepaid sessions when you mark it complete or a no-show.</p>
      </div>
    </Sheet>
  );
}

/** Define a new session type — one thing the studio offers (owner only). */
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
    catch (e) { setErr(errorText(e, "Couldn't create that session type.")); }
    finally { setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title="New session type" footer={<Button size="lg" className="w-full" disabled={label.trim().length < 2 || busy} onClick={() => void save()}>{busy ? "Creating…" : "Create session type"}</Button>}>
      <div className="space-y-4">
        <Field label="Name" icon={Ticket} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nutrition consultation" hint="What you'd call it to a client." />
        <Field label="How long" icon={Clock} value={duration} inputMode="numeric" onChange={(e) => setDuration(e.target.value.replace(/\D/g, ""))} hint="In minutes." />
        <Field label="Price on its own (optional)" icon={CreditCard} value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value)} hint="USD. What one costs when it isn't already in a package — set it and your team can still book a client who's used theirs up." />
        {err && <p role="status" aria-live="polite" className="text-sm text-danger">{err}</p>}
      </div>
    </Sheet>
  );
}
