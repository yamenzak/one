/**
 * Coach: roster + create client + client detail. The detail IS the client app
 * (same surfaces scoped to the client) wrapped in coach chrome + editing tabs.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, Card, Badge, Field, Sheet, Avatar, IconTabs, Page, Stagger, EmptyState, Reveal, SkeletonList, ConfirmDialog, toneVar, Users, Mail, User, Search, ArrowLeft, Plus, Copy, Check, ExternalLink, Archive, AlertTriangle, Anchor, CountUp, Group, Row, Sun, ClipboardList, Target, TrendingUp, BarChart3, Settings as SettingsIcon } from "@4dl/ui";
import type { AttentionSeverity } from "@kova/domain";
import { api, errorText } from "../../api.js";
import { useSession } from "../../session.js";
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
interface Invite { url: string; token: string; email: string; delivery: { sent: boolean; reason: string | null } }

export function Clients() {
  const nav = useNavigate();
  const { ctx } = useSession();
  const isOwner = ctx?.active?.role === "owner";
  // Arrived from a downgrade blocker: `?free=N` says how many seats the smaller
  // plan needs back. In that mode the roster grows an inline Archive on each row
  // so the owner can clear seats here instead of opening each client in turn.
  const [params, setParams] = useSearchParams();
  const freeTarget = Math.max(0, Math.min(999, Number(params.get("free") ?? 0) || 0));
  // `?new=1` opens the create sheet — the coach Today's "Add client" action is a
  // deep link rather than a duplicate of this screen's own sheet, so there is one
  // implementation of adding a client and one place its copy lives.
  const wantsNew = params.get("new") === "1";
  const freeing = isOwner && freeTarget > 0;
  const [freedCount, setFreedCount] = useState(0);
  const [toArchive, setToArchive] = useState<ClientSummary | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveErr, setArchiveErr] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  // After a client is created with an email, hold the invite so the coach can
  // show / copy the in-gym deep-link before continuing into the client.
  const [invite, setInvite] = useState<{ invite: Invite; clientId: string } | null>(null);

  // Per-client attention rollup — the worst item's label + how many, so a coach
  // spots a stale goal / quiet client / lab-to-review straight from the roster.
  const [att, setAtt] = useState<Map<string, { labels: string[]; severity: AttentionSeverity }>>(new Map());
  // Uncaught, this left the roster skeleton up forever with nothing said and no
  // way back — the coach's entire book of business looking like a slow load.
  // A failure keeps whatever roster we already had and offers a retry.
  const load = useCallback(async () => {
    setLoadError(false);
    try { setClients((await api.get<{ clients: ClientSummary[] }>("/api/clients")).clients); }
    catch { setLoadError(true); }
  }, []);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    void api.get<{ clients: { clientId: string; items: { label: string; severity: AttentionSeverity }[] }[] }>("/api/coach/attention")
      // Keep ALL the labels, not just the first. The row used to render
      // "Gone quiet +2" — a category plus an opaque number — while the two
      // things the coach actually has to act on were fetched, discarded, and
      // only reachable by opening the client.
      .then((r) => setAtt(new Map(r.clients.filter((c) => c.items.length).map((c) => [c.clientId, { labels: c.items.map((i) => i.label), severity: c.items[0]!.severity }]))))
      .catch(() => undefined);
  }, []);

  /*
    ORDER BY WHAT NEEDS DOING, then by name.

    At ten clients the screen said "1 needs a look" at the top and put that
    client LAST — the roster came back in creation order, so the anchor pointed
    at something below the fold. Anyone who has never signed in sinks to the
    bottom: they are waiting on the client, not on the coach.
  */
  const [q, setQ] = useState("");
  const ordered = useMemo(() => {
    if (!clients) return null;
    const rank = (c: ClientSummary) => (!c.hasLogin ? 2 : att.has(c.id) ? 0 : 1);
    const needle = q.trim().toLowerCase();
    return clients
      .filter((c) => !needle || c.displayName.toLowerCase().includes(needle) || (c.email ?? "").toLowerCase().includes(needle))
      .slice()
      .sort((a, b) => rank(a) - rank(b) || a.displayName.localeCompare(b.displayName));
  }, [clients, att, q]);

  const create = async () => {
    if (busy) return;
    setBusy(true); setCreateErr(null);
    try {
      const r = await api.post<{ client: { id: string }; invite: Invite | null }>("/api/clients", { email: email.trim(), displayName: name.trim() || undefined });
      setCreateOpen(false); setName(""); setEmail(""); await load();
      // With an email the server emails a branded invite AND returns the deep-link
      // so the coach can show it in the gym; otherwise go straight to the client.
      if (r.invite) setInvite({ invite: r.invite, clientId: r.client.id });
      else nav(`/clients/${r.client.id}/today`);
    } catch (e) {
      // The common failure here is a 400 for an email already on the roster.
      // Uncaught it read as "nothing happened", so the coach retyped the same
      // address; the server's own message names the real reason.
      setCreateErr(errorText(e, "Couldn't add that client. Check the email and try again."));
    } finally { setBusy(false); }
  };
  const emailValid = /.+@.+\..+/.test(email.trim());

  // Archive from the roster — the same endpoint the client's Manage tab calls.
  // Deleting permanently stays on that tab: it's irreversible and needs the typed
  // confirmation, which is not something to offer from a list.
  const archive = async (c: ClientSummary) => {
    if (archiveBusy) return;
    setArchiveBusy(true); setArchiveErr(null);
    try {
      await api.post(`/api/clients/${c.id}/archive`);
      setToArchive(null);
      setFreedCount((n) => n + 1);
      await load();
    } catch (e) { setArchiveErr(errorText(e, "Couldn't archive that client. Please try again.")); }
    finally { setArchiveBusy(false); }
  };
  const stillNeeded = Math.max(0, freeTarget - freedCount);

  // Consume the deep link once, then strip it, so a back-navigation or a reload
  // does not re-open the sheet over whatever the coach moved on to.
  useEffect(() => {
    if (!wantsNew) return;
    setCreateOpen(true);
    setParams((q) => { q.delete("new"); return q; }, { replace: true });
  }, [wantsNew, setParams]);

  return (
    <Page className="column space-y-4 p-4 pb-28">
      {/* T1 (§1). The roster IS the screen, so the anchor is its size — and the
          sub-line carries the only fact a coach scans for on arrival: how many
          of them want something. */}
      <Anchor eyebrow={"Clients"} sub={(() => {
            if (!clients?.length) return "None yet";
            // Same rule as the rows: someone who has never signed in is
            // "Invited", not "needs a look".
            const flagged = clients.filter((c) => c.hasLogin && att.has(c.id)).length;
            const active = clients.filter((c) => c.hasLogin);
            const pending = clients.length - active.length;
            /*
              A COUNT OF TEN THAT IS NINE INVITATIONS IS A FLATTERING COUNT.

              The anchor is the roster's size, so the sub-line has to say how
              much of it is real. Nine people who have never opened the app
              still read as "10 clients · all caught up" — true of the one who
              signed in, and quietly wrong about the studio.
            */
            const waiting = pending > 0 ? `${pending} not signed in yet` : null;
            const head = flagged === 0
              ? (active.length === 0 ? null : "All caught up")
              // "Every active one needs a look" only reads as a summary when
              // there is more than one of them; at one it is a long way to say
              // "1".
              : flagged === active.length && active.length > 1 ? "Every active one needs a look"
              : `${flagged} need${flagged === 1 ? "s" : ""} a look`;
            return [head, waiting].filter(Boolean).join(" · ") || "All caught up";
          })()}>
        <CountUp value={clients?.length ?? 0} />
      </Anchor>

      <Stagger className="pb-1">
        <Button size="lg" className="w-full" onClick={() => setCreateOpen(true)}><Plus /> Add client</Button>
      </Stagger>

      {freeing && (
        <Card className="space-y-2.5 border border-primary/25" role="status" aria-live="polite">
          <div className="flex items-center gap-2 font-medium"><Users className="size-4 text-primary" /> Freeing seats for a smaller plan</div>
          <p className="text-sm text-muted-foreground">
            {stillNeeded > 0
              ? `Free ${stillNeeded} more client seat${stillNeeded === 1 ? "" : "s"} and the plan change goes through. Archiving keeps everything on the record; deleting (on a client's Manage tab) also reclaims their storage.`
              : "That's enough seats — head back to Business to finish the plan change."}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant={stillNeeded > 0 ? "secondary" : "default"} onClick={() => nav("/business")}>Back to Business</Button>
            <Button size="sm" variant="ghost" onClick={() => setParams((p) => { p.delete("free"); return p; }, { replace: true })}>Not now</Button>
          </div>
          {archiveErr && <p className="text-sm text-warning" role="alert">{archiveErr}</p>}
        </Card>
      )}

      {loadError && !clients ? (
        <EmptyState icon={AlertTriangle} title="Couldn't load your clients" description="Something went wrong reaching the server. Check your connection and try again." action={<Button onClick={() => void load()}>Try again</Button>} />
      ) : (
      <Reveal loading={!clients} skeleton={<SkeletonList card rows={6} thumb={44} />}>
        {/* Search appears once scrolling is the alternative. Below that it is a
            control asking to be used on a list you can already see. */}
        {clients && clients.length > 7 && (
          <Field
            label="Search clients"
            labelHidden
            icon={Search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email…"
            className="mb-2"
          />
        )}
        {ordered && (clients!.length === 0 ? (
          <EmptyState icon={Users} title="No clients yet" description="Add your first client. With an email set, they sign in the moment you do — no codes, no passwords." action={<Button onClick={() => setCreateOpen(true)}><Plus /> Add your first client</Button>} />
        ) : (
          ordered.length === 0 ? (
            <EmptyState icon={Users} title="Nothing matches" description="Try part of a name or an email address." />
          ) : (
          <Group>
            {ordered.map((c) => (
              <Row
                key={c.id}
                onClick={() => nav(`/clients/${c.id}/today`)}
                /*
                  What needs doing, not who they are.

                  Every row's sub-line was the client's email, truncated —
                  "e2e-roster-0-aswcwg@kova.t…" — which is an identifier, not a
                  fact a coach scans by (§7: the secondary line is a fact, not a
                  category). The attention labels are the fact. Email survives
                  as the fallback for a client who has not named themselves yet,
                  where it is the only identity there is.
                */
                /* Two labels and a count, not three labels and an ellipsis:
                   "Check-in to answer · No active plan · Profil…" spent its last
                   characters on a word nobody can finish reading. */
                sub={(() => {
                  const ls = c.hasLogin ? att.get(c.id)?.labels : undefined;
                  if (!ls?.length) return c.email ?? "No email yet";
                  return ls.length > 2 ? `${ls.slice(0, 2).join(" · ")} · +${ls.length - 2}` : ls.join(" · ");
                })()}
                leading={<Avatar name={c.displayName} src={c.avatarUrl} seed={c.avatarSeed ?? c.id} className="size-10" />}
                trailing={
                  freeing ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      disabled={archiveBusy}
                      aria-label={`Archive ${c.displayName}`}
                      onClick={(e) => { e.stopPropagation(); setArchiveErr(null); setToArchive(c); }}
                    ><Archive /> Archive</Button>
                  ) : !c.hasLogin ? (
                    /*
                      An invited client is not a lapsed one.

                      Attention rules assume an ACTIVE client who stopped doing
                      something, so they fired "Gone quiet" and "No active plan"
                      at someone invited five seconds ago who has never signed
                      in — which the E2E caught by asserting the row still shows
                      the address the invite went to. Until they log in, the row
                      is about the invitation: the email is the thing a coach
                      double-checks, and "Invited" is the whole status.
                    */
                    <Badge tone="neutral">Invited</Badge>
                  ) : att.has(c.id) ? (
                    // The badge is the COUNT — the sub-line carries the words —
                    // so a long name keeps its room.
                    <Badge tone={SEVERITY_TONE[att.get(c.id)!.severity]}>{att.get(c.id)!.labels.length}</Badge>
                  ) : <Badge tone="success">Active</Badge>
                }
              >
                {c.displayName}
              </Row>
            ))}
          </Group>
          )
        ))}
      </Reveal>
      )}

      <Sheet open={createOpen} onClose={() => { setCreateOpen(false); setCreateErr(null); }} title="New client" footer={<Button size="lg" className="w-full" disabled={!emailValid || busy} onClick={() => void create()}>{busy ? "Sending…" : "Send invite"}</Button>}>
        <div className="space-y-4">
          <Field label="Email" icon={Mail} type="email" value={email} onChange={(e) => setEmail(e.target.value)} hint="This is the invite — they sign in with a code and their space links automatically." />
          <Field label="Name (optional)" icon={User} value={name} onChange={(e) => setName(e.target.value)} hint="Leave blank and they'll add it on their profile." />
          {createErr && <p className="text-sm text-warning" role="alert">{createErr}</p>}
        </div>
      </Sheet>

      {invite && (
        <InviteSheet
          invite={invite.invite}
          onClose={() => { const id = invite.clientId; setInvite(null); nav(`/clients/${id}/today`); }}
        />
      )}

      <ConfirmDialog
        open={!!toArchive}
        onOpenChange={(o) => !o && setToArchive(null)}
        title={toArchive ? `Archive ${toArchive.displayName}?` : "Archive client?"}
        description="They come off your roster and free a seat against your plan's client limit. Everything on their record is kept, but if they have a login they lose access to their space."
        confirmLabel={archiveBusy ? "Archiving…" : "Archive client"}
        destructive
        onConfirm={() => { if (toArchive) void archive(toArchive); }}
      />
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
    <Sheet open onClose={onClose} title="Client invited" footer={<Button size="lg" className="w-full" onClick={onClose}>Go to client</Button>}>
      <div className="space-y-4">
        {/* The truth about the email, not a claim. This said "We emailed a
            branded sign-in link" unconditionally — including when email was off,
            the studio was out of credits, or the deployment could not send at
            all, which is the state a FRESH install is in. The coach walked away
            believing the client had been contacted. */}
        <div className="flex items-start gap-3">
          <div
            className="grid size-11 shrink-0 place-items-center rounded-2xl [&_svg]:size-[1.35rem]"
            style={{
              background: `color-mix(in oklch, ${invite.delivery.sent ? toneVar.success : toneVar.warning} 15%, transparent)`,
              color: invite.delivery.sent ? toneVar.success : toneVar.warning,
            }}
          >
            {invite.delivery.sent ? <Check /> : <AlertTriangle />}
          </div>
          <div className="min-w-0">
            {invite.delivery.sent ? (
              <>
                <p className="text-sm">We emailed a branded sign-in link to <span className="font-medium text-foreground">{invite.email}</span>.</p>
                <p className="mt-1 text-sm text-muted-foreground">Share this link in the gym too — they open it and sign in with a one-time code, no password.</p>
              </>
            ) : (
              <>
                <p className="text-sm"><span className="font-medium text-foreground">The invite email didn't go out.</span> {invite.delivery.reason}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The client was still created — send them the link below and they can sign in with it right away.
                </p>
              </>
            )}
          </div>
        </div>
        <div className="space-y-2 rounded-2xl bg-card p-3">
          <div className="text-micro uppercase text-muted-foreground">{invite.delivery.sent ? "Invite link" : "Invite link — send this to them"}</div>
          <div className="break-all rounded-xl bg-surface-3 px-3 py-2.5 font-mono text-xs">{invite.url}</div>
          <div className="flex gap-2">
            <Button size="sm" variant="tonal" className="flex-1" onClick={() => void copy()}>{copied ? <><Check /> Copied</> : <><Copy /> Copy link</>}</Button>
            <Button size="sm" variant="secondary" className="flex-1" onClick={() => window.open(invite.url, "_blank", "noopener")}><ExternalLink /> Open</Button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/**
 * Six tabs. A `fill` SegmentedControl truncated half of them at phone width —
 * "Prog…", "Repo…", "Man…" — which is what §7's 2-to-4 cap is warning about.
 * `IconTabs` is the answer above that cap: every tab is its icon, only the
 * active one keeps its label, exactly like the bottom nav.
 */
const TABS = [
  { value: "today", label: "Today", icon: Sun },
  { value: "plans", label: "Plans", icon: ClipboardList },
  { value: "goals", label: "Goals", icon: Target },
  { value: "progress", label: "Progress", icon: TrendingUp },
  { value: "report", label: "Report", icon: BarChart3 },
  { value: "manage", label: "Manage", icon: SettingsIcon },
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
        <div className="column flex items-center">
          <div className="flex min-w-0 items-center gap-1.5 rounded-full border border-border/40 bg-background/60 py-1 pl-1 pr-3.5 backdrop-blur-md">
            <button onClick={() => nav("/clients")} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" aria-label="All clients">
              <ArrowLeft className="size-[1.1rem]" />
            </button>
            <Avatar name={client?.displayName ?? ""} src={client?.avatarUrl} seed={client?.avatarSeed ?? clientId} className="size-8 shrink-0" />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold">{client?.displayName ?? "…"}</div>
              <div className="text-micro uppercase text-muted-foreground">Coach view</div>
            </div>
          </div>
        </div>
        <div className="column">
          <IconTabs items={TABS} value={tab} onChange={(v) => nav(`/clients/${clientId}/${v}`)} />
        </div>
      </div>
      {tab === "today" && <Today key={clientId} clientId={clientId} />}
      {tab === "plans" && <CoachPlans key={clientId} clientId={clientId} />}
      {tab === "goals" && <GoalManager key={clientId} clientId={clientId} />}
      {tab === "progress" && <Progress key={clientId} clientId={clientId} />}
      {tab === "report" && <ClientReport key={clientId} clientId={clientId} />}
      {/* clientName is only for copy in the archive confirmation — Manage names the
          client it's about to take off the roster rather than saying "this client". */}
      {tab === "manage" && <ClientManage key={clientId} clientId={clientId} clientName={client?.displayName} />}
    </div>
  );
}
