/**
 * Coach client management — access grants, coach assignment, swap approvals,
 * check-in review with AI summarizer, supplement prescriptions, lab requests +
 * value entry, a per-client report, and archive/offboard.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fmtWeight, kgToDisplay, weightLabel } from "@kova/domain";
import { Button, Card, Badge, Field, Select, Textarea, Sheet, SubCard, Chip, Collapsible, useOneOpen, Callout, Wrench, Page, Stagger, IconBadge, Eyebrow, GlanceStrip, EmptyState, Reveal, SkeletonStatGrid, SkeletonList, SkeletonLine, SkeletonRow, PhotoGrid, ConfirmDialog, Avatar, Spinner, Ticket, ArrowLeftRight, FlaskConical, Pill, ClipboardList, BarChart3, BookOpen, Plus, Check, X, ImageIcon, User, Star, Archive, Trash2, AlertTriangle, NoData, Anchor, ActionCluster, CountUp, Group, Row, GroupNote, RotateCcw, History, Users, ActionResult, useAction as useActionBase } from "@4dl/ui";
import { personaLabel, personaTone } from "../../registry/index.js";
import { api, errorText, todayLocal } from "../../api.js";
import { FeatureLock, useCan } from "../../FeatureLock.js";
import { useSession } from "../../session.js";
import { useUnits } from "../../units.js";
import { ExerciseRow, type ExerciseInfo } from "../exercise.js";
import { PreferencesEditorCard } from "../PreferencesEditor.js";
import { checkInPhotos } from "../client/WellnessDetails.js";
import { AiAvatar } from "../../AiAvatar.js";
import { SectionSplit } from "../SectionSplit.js";
import { InsightFeedback } from "../client/InsightFeedback.js";

/** `useAction`, bound to this app's error formatter — the same wrapper every
 *  other screen uses, so a refused write reads the same wherever it happens. */
const useAction = () => useActionBase(errorText);
import { Markdown } from "../../Markdown.js";
import { AiErrorBox } from "../../AiError.js";

interface Sub { id: string; status: string; daysRemaining: number; daysByFeature?: Record<string, number>; packageId: string | null }
interface GrantRow { id: string; packageName: string | null; source: string; days: { feature: string; days: number }[]; at: string }
interface Pkg { id: string; name: string }
interface Swap { id: string; reason: string | null; status: string; day_index: number | null; current_exercise_id: string | null; suggested_exercise_id: string | null }
interface Lab { id: string; display_name: string; status: string; client_notes?: string | null; file_key?: string | null; values?: { marker: string; value: string; unit?: string; flag?: string }[] | null; trainer_feedback?: string | null }
interface Supp { id: string; name: string; dose: string | null; kind: string; status: string; schedule?: { slot: string }[] }
interface CheckIn { id: string; date_local: string; mood: number | null; energy: number | null; stress: number | null; sleep_hours: number | null; weight_kg: number | null; steps_count: number | null; notes: string | null; photos_json: string | null; trainer_feedback: string | null }

/** Scroll a deep-linked row into view and pulse a highlight ring so the coach's
 *  eye lands on the exact item a notification pointed them at. */
function focusRow(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  const ring = ["ring-2", "ring-primary", "ring-offset-2", "ring-offset-background"];
  el.classList.add(...ring, "rounded-2xl");
  setTimeout(() => el.classList.remove(...ring), 2400);
  return true;
}

export function ClientManage({ clientId, clientName, archived = false, onClientChanged }: {
  clientId: string;
  clientName?: string | null;
  /** Archived clients get a RESTORE where the others get an archive. */
  archived?: boolean;
  /** Re-read the client after a state change, so the header and this screen
   *  agree about whether they are on the roster. */
  onClientChanged?: () => void;
}) {
  const { ctx } = useSession();
  const canSuppLabs = useCan("supplementsLabs");
  // Every `/api/ai/*` call on this screen (supplement-reco, summarize-checkins,
  // lab-extract) is gated on aiSuite.
  const canAi = useCan("aiSuite");
  // Coach assignment and archive are presented as OWNER powers: a coach must not
  // be able to hand a client to someone else or retire a record out of the
  // roster. Archive is owner-only in the API too (route-guard demands
  // client:["archive"], which only the owner preset carries); the /trainers
  // routes ask for client:["update"], which the trainer preset DOES hold, so
  // this gate is the product decision, not the security boundary — the boundary
  // is requireClientAccess, which still scopes every call to one client row.
  const isOwner = ctx?.active?.role === "owner";
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [supps, setSupps] = useState<Supp[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [grantOpen, setGrantOpen] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [suppOpen, setSuppOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [labOpen, setLabOpen] = useState(false);
  const [reviewLab, setReviewLab] = useState<Lab | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [exercises, setExercises] = useState<ExerciseInfo[]>([]);
  const [suppToDiscontinue, setSuppToDiscontinue] = useState<Supp | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [partial, setPartial] = useState(false);

  // Seven INDEPENDENT reads, one per section — so `allSettled`, not `all`: with
  // `all` a single dead endpoint (labs 500ing, say) rejected the lot and left the
  // whole management screen a permanent skeleton. Now each section fills in from
  // its own read and the ones that failed are named in a banner.
  //
  // `subscriptions` is the exception: it gates the entire render below, so its
  // failure is the screen's error and gets the retry.
  const load = useCallback(async () => {
    setLoadError(false);
    const [s, p, sw, l, su, ci, ex] = await Promise.allSettled([
      api.get<{ subscriptions: Sub[] }>(`/api/subscriptions?clientId=${clientId}`),
      api.get<{ packages: Pkg[] }>("/api/packages"),
      api.get<{ swaps: Swap[] }>(`/api/swaps?clientId=${clientId}`),
      api.get<{ labs: Lab[] }>(`/api/labs?clientId=${clientId}`),
      api.get<{ supplements: Supp[] }>(`/api/supplements?clientId=${clientId}&includePaused=1`),
      api.get<{ checkIns: CheckIn[] }>(`/api/check-ins?clientId=${clientId}`),
      api.get<{ exercises: ExerciseInfo[] }>("/api/exercises"),
    ]);
    if (p.status === "fulfilled") setPackages(p.value.packages);
    if (sw.status === "fulfilled") setSwaps(sw.value.swaps);
    if (l.status === "fulfilled") setLabs(l.value.labs);
    if (su.status === "fulfilled") setSupps(su.value.supplements);
    if (ci.status === "fulfilled") setCheckIns(ci.value.checkIns);
    if (ex.status === "fulfilled") setExercises(ex.value.exercises);
    setPartial([p, sw, l, su, ci, ex].some((r) => r.status === "rejected"));
    if (s.status === "fulfilled") setSubs(s.value.subscriptions);
    else setLoadError(true);
  }, [clientId]);
  useEffect(() => void load(), [load]);

  // Deep-link: a notification points here at a specific item — open the lab
  // review sheet, or scroll+highlight the check-in / swap row. Runs once the
  // data is loaded, then strips the param so it doesn't re-fire.
  const [params, setParams] = useSearchParams();
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (!subs || deepLinkDone.current) return;
    const labId = params.get("lab");
    const checkinId = params.get("checkin");
    const swapId = params.get("swap");
    if (!labId && !checkinId && !swapId) return;
    deepLinkDone.current = true;
    if (labId) { const l = labs.find((x) => x.id === labId); if (l) setReviewLab(l); }
    // Let the rows paint before scrolling to one.
    const t = setTimeout(() => {
      if (checkinId) focusRow(`mng-ci-${checkinId}`);
      else if (swapId) focusRow(`mng-swap-${swapId}`);
    }, 120);
    setParams((prev) => { prev.delete("lab"); prev.delete("checkin"); prev.delete("swap"); return prev; }, { replace: true });
    return () => clearTimeout(t);
  }, [subs, labs, params, setParams]);

  const grant = async (packageId: string) => { await api.post("/api/subscriptions/grant", { clientId, packageId }); setGrantOpen(false); await load(); };
  const resolveSwap = async (id: string, status: "approved" | "rejected", replacementExerciseId?: string) => { await api.patch(`/api/swaps/${id}`, { status, replacementExerciseId }); await load(); };
  const discontinueSupp = async (id: string) => { await api.patch(`/api/supplements/${id}`, { status: "discontinued" }); await load(); };
  const setSuppStatus = async (id: string, status: "active" | "paused") => { await api.patch(`/api/supplements/${id}`, { status }); await load(); };

  const active = subs?.find((s) => s.status === "active");
  const activePkg = active ? packages.find((p) => p.id === active.packageId) : undefined;
  const pending = swaps.filter((s) => s.status === "pending");

  return (
    <Page className="column space-y-4 p-4 pb-28">
      {loadError && !subs ? (
        <EmptyState icon={AlertTriangle} title="Couldn't load this client" description="Something went wrong reaching the server. Check your connection and try again." action={<Button onClick={() => void load()}>Try again</Button>} />
      ) : (
      <Reveal loading={!subs} className="space-y-4" skeleton={
        <>
          <SkeletonList card rows={1} />
          <SkeletonList card rows={3} thumb={40} />
          <SkeletonList card rows={2} />
        </>
      }>
      {subs && (<>
      {/* One of the section reads failed — say so rather than letting an empty
          Supplements / Labs / Check-ins card read as "this client has none". */}
      {partial && (
        <Card className="flex items-start gap-3 border border-warning/25 bg-warning-soft/50">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1"><div className="text-sm font-semibold">Some sections didn't load</div><p className="text-sm text-muted-foreground">Part of this client's record couldn't be reached, so what's below may be incomplete.</p></div>
          <Button size="sm" variant="secondary" onClick={() => void load()}>Retry</Button>
        </Card>
      )}
      {/*
        T1 — the tab's anchor (§1: the client detail is six screens sharing
        chrome, so the anchor belongs to the tab). Manage is an admin surface,
        and the one number a coach acts on here is how long this client's access
        still runs — everything else on the tab is a section you open when you
        need it. No access → words, not a zero: `0` here would read as a
        countdown that has run out rather than as a state that was never
        granted.

        The strip below deliberately keeps Status and Plan and drops the day
        count: the anchor's value appears once (§1).
      */}
      <Anchor
        eyebrow="Access"
        className="pt-1"
        word={active ? undefined : "No access"}
        sub={active
          ? `${active.daysRemaining === 1 ? "day left" : "days left"}${activePkg?.name ? ` · ${activePkg.name}` : ""}`
          : "Grant a package — or a $0 comp — to unlock their features."}
        /* Three actions only when the studio actually has three (§1's floor);
           a permanently-disabled circle is noise, not an affordance. */
        below={canSuppLabs ? (
          <ActionCluster
            items={[
              { icon: Plus, label: "Grant", onClick: () => setGrantOpen(true) },
              { icon: BarChart3, label: "Report", onClick: () => setReportOpen(true) },
              { icon: ClipboardList, label: "Prescribe", onClick: () => setSuppOpen(true) },
            ]}
          />
        ) : (
          <div className="flex w-full max-w-sm gap-2 pt-1">
            <Button className="flex-1" onClick={() => setGrantOpen(true)}><Plus /> Grant</Button>
            <Button className="flex-1" variant="secondary" onClick={() => setReportOpen(true)}><BarChart3 /> Report</Button>
          </div>
        )}
      >
        {active && <CountUp value={active.daysRemaining} />}
      </Anchor>

      {active && (
        <section className="space-y-2">
          <Eyebrow action={isOwner ? <button onClick={() => setFixOpen(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary [&_svg]:size-3.5"><Wrench /> Correct days</button> : undefined}>Subscription</Eyebrow>
          <Stagger>
            <GlanceStrip items={[
              { icon: Check, tone: "activity", value: "Active", label: "Status" },
              { icon: ClipboardList, tone: "neutral", value: activePkg?.name ?? null, label: "Plan" },
            ]} />
            {/*
              PER SCOPE, next to the headline. The anchor above shows a MAX
              across scopes, so a client with 70 workout days and 0 meal days
              reads as "70 days left" — half of what they bought already lapsed
              and nothing on the screen said so.
            */}
            {active.daysByFeature && Object.values(active.daysByFeature).some((n, _i, all) => n !== all[0]) && (
              <div className="flex flex-wrap gap-2 px-1 pt-1">
                {Object.entries(active.daysByFeature).map(([f, n]) => (
                  <Badge key={f} tone={n > 0 ? "neutral" : "warning"}>{f}: {n} {n === 1 ? "day" : "days"}</Badge>
                ))}
              </div>
            )}
          </Stagger>
        </section>
      )}

      {/*
        The preferences editor is ~20 fields and it used to sit open on this tab,
        which made a form four times taller than everything else the single
        largest thing on an admin surface. It is a "doing" surface, so it belongs
        in a Sheet behind a Row (§7) — the tab stays scannable, and editing
        someone else's profile becomes a deliberate act rather than something you
        scroll past.
      */}
      <section className="space-y-2">
        <Eyebrow>Profile</Eyebrow>
        <Group>
          <Row icon={User} sub="Gender, birth date, height, goal, training and food limits" onClick={() => setPrefsOpen(true)}>
            Profile &amp; preferences
          </Row>
        </Group>
      </section>

      {pending.length > 0 && (
        <section className="space-y-2">
          <Eyebrow action={<Badge tone="cardio">{pending.length}</Badge>}>Swap requests</Eyebrow>
          <Stagger className="space-y-3">
            {pending.map((s) => <div key={s.id} id={`mng-swap-${s.id}`}><SwapResolver swap={s} exercises={exercises} onResolve={resolveSwap} /></div>)}
          </Stagger>
        </section>
      )}

      <CheckInReview clientId={clientId} checkIns={checkIns} onFeedback={load} />

      {canSuppLabs && (
      <section className="space-y-2">
        <Eyebrow action={
          <div className="flex gap-2">
            {canAi && <Button size="sm" variant="tonal" onClick={() => setSuggestOpen(true)}><AiAvatar className="size-5" /> Suggest</Button>}
            <Button size="sm" variant="secondary" onClick={() => setSuppOpen(true)}><Plus /> Prescribe</Button>
          </div>
        }>Supplements</Eyebrow>
        <Stagger>
        <Card className="space-y-3">
          {supps.length === 0 ? <p className="text-sm text-muted-foreground">No supplements prescribed.</p> : supps.map((s) => (
            <SubCard key={s.id} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="truncate font-medium">{s.name}</span>{s.status === "paused" && <Badge tone="warning">Paused</Badge>}</div>
                  {s.dose && <span className="text-xs text-muted-foreground">{s.dose}</span>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => void setSuppStatus(s.id, s.status === "paused" ? "active" : "paused")} className="rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground">{s.status === "paused" ? "Resume" : "Pause"}</button>
                  <button onClick={() => setSuppToDiscontinue(s)} aria-label="Discontinue supplement" className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:text-danger [&_svg]:size-4"><X /></button>
                </div>
              </div>
              {s.schedule && s.schedule.length > 0 && <div className="flex flex-wrap gap-1.5">{s.schedule.map((sc, i) => <span key={i} className="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground">{sc.slot.replace(/_/g, " ")}</span>)}</div>}
            </SubCard>
          ))}
        </Card>
        </Stagger>
      </section>
      )}

      {canSuppLabs && (
      <section className="space-y-2">
        <Eyebrow action={<Button size="sm" variant="secondary" onClick={() => setLabOpen(true)}><Plus /> Request</Button>}>Lab tests</Eyebrow>
        <Stagger>
        <Card className="space-y-3">
          {labs.length === 0 ? <p className="text-sm text-muted-foreground">No lab tests.</p> : labs.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">{l.display_name}</span>
              {l.status === "uploaded" || l.status === "reviewed" ? <Button size="sm" variant={l.status === "reviewed" ? "ghost" : "default"} onClick={() => setReviewLab(l)}>{l.status === "reviewed" ? "View" : "Review"}</Button> : <Badge tone="warning">{l.status}</Badge>}
            </div>
          ))}
        </Card>
        </Stagger>
      </section>
      )}
      </>)}
      </Reveal>
      )}

      {/*
        AN OFFBOARDING REQUEST IS AN ALERT, NOT A SECTION.

        It stays on the surface, above everything, because a coach has ASKED for
        a decision and the owner is the only one who can give it. Filing it
        behind an index row would be filing a to-do behind a menu.
      */}
      {isOwner && <OffboardRequestQueue clientId={clientId} onDecided={load} />}

      {/*
        THE REST OF THE TAB IS AN INDEX.

        Manage was one 1,200-line scroll: the access anchor, profile, swaps,
        check-ins, supplements, labs, the coach roster, the whole audit trail,
        and two full-width offboarding walls — in that order, all open, all the
        time. Nothing in it could be found, and the sections nobody had scrolled
        to may as well not have shipped (§7: past five groups, an INDEX and a
        page each).

        Everything above this line is what a coach acts on TODAY — access, the
        things waiting for them. Everything below is administration you go to
        deliberately, so it becomes three rows carrying their own current value.
      */}
      <SectionSplit
        param="m"
        subs={[
          ...(isOwner ? [{
            key: "coaches",
            label: "Coaches",
            icon: Users,
            tone: "cardio" as const,
            value: "Who can see this client",
            render: () => <CoachesSection clientId={clientId} />,
          }] : []),
          {
            key: "activity",
            label: "Activity log",
            icon: History,
            tone: "neutral" as const,
            value: "Every change, and who made it",
            render: () => <ActivityLog clientId={clientId} />,
          },
          {
            key: "offboard",
            label: archived ? "Restore or delete" : "Offboard",
            icon: Archive,
            tone: "warning" as const,
            value: archived ? "Archived — not on your roster" : "Archive or delete this client",
            render: () => (isOwner
              ? <OffboardSection clientId={clientId} clientName={clientName} archived={archived} onChanged={() => onClientChanged?.()} />
              : <OffboardRequestSection clientId={clientId} clientName={clientName} />),
          },
        ]}
      />

      <Sheet open={prefsOpen} onClose={() => setPrefsOpen(false)} title="Profile & preferences">
        <PreferencesEditorCard clientId={clientId} includeProfile onSaved={() => { setPrefsOpen(false); void load(); }} />
      </Sheet>

      <Sheet open={grantOpen} onClose={() => setGrantOpen(false)} title="Grant a package">
        {/* `/api/packages` + `/api/subscriptions/grant` are gated on `commerce`.
            Commerce is something the studio can BUY, so lock-with-a-reason here
            rather than hiding the button and leaving the coach guessing. */}
        <FeatureLock feature="commerce">
        <div className="space-y-2">
          {packages.length === 0 && <p className="text-sm text-muted-foreground">No packages yet — create one in the Business tab.</p>}
          {packages.map((p) => <button key={p.id} onClick={() => void grant(p.id)} className="flex w-full items-center justify-between rounded-xl bg-secondary px-4 py-3 text-left transition-colors hover:bg-surface-3"><span>{p.name}</span><span className="text-primary">Grant</span></button>)}
        </div>
        </FeatureLock>
      </Sheet>

      {fixOpen && active && <CorrectDaysSheet clientId={clientId} sub={active} onClose={() => setFixOpen(false)} onDone={() => { setFixOpen(false); void load(); }} />}

      {suppOpen && <PrescribeSheet clientId={clientId} onClose={() => setSuppOpen(false)} onDone={() => { setSuppOpen(false); void load(); }} />}
      {suggestOpen && <SuggestSuppSheet clientId={clientId} onClose={() => setSuggestOpen(false)} onPrescribed={load} />}
      {labOpen && <RequestLabSheet clientId={clientId} onClose={() => setLabOpen(false)} onDone={() => { setLabOpen(false); void load(); }} />}
      {reviewLab && <ReviewLabSheet clientId={clientId} lab={reviewLab} onClose={() => setReviewLab(null)} onDone={() => { setReviewLab(null); void load(); }} />}
      {reportOpen && <ReportSheet clientId={clientId} onClose={() => setReportOpen(false)} />}

      <ConfirmDialog
        open={!!suppToDiscontinue}
        onOpenChange={(o) => !o && setSuppToDiscontinue(null)}
        title={suppToDiscontinue ? `Discontinue ${suppToDiscontinue.name}?` : "Discontinue supplement?"}
        description="This stops the prescription for this client. You can prescribe it again later if needed."
        confirmLabel="Discontinue"
        destructive
        onConfirm={() => { if (suppToDiscontinue) void discontinueSupp(suppToDiscontinue.id); }}
      />
    </Page>
  );
}

// ── Coaches (client_trainers) ───────────────────────────────────────────────
// `client_trainers` is what `visibleClientIds` scopes a coach's roster to, and
// until this section existed the ONLY writer was the creator auto-assign in
// POST /clients. So every owner-created client stayed owner-only: an owner could
// invite four coaches and then had no way to hand any client over, a departing
// coach's book couldn't be reassigned, and `is_primary` (which routes body-scan /
// PR / check-in notifications) was unreachable. This is that screen.

interface AssignedCoach { userId: string; isPrimary: boolean; name: string | null; email: string | null }
interface StaffMember { userId: string; role: string; name: string | null; email: string | null }
const coachName = (c: { name: string | null; email: string | null }): string => c.name || c.email || "Coach";

function CoachesSection({ clientId }: { clientId: string }) {
  const { ctx } = useSession();
  const myUserId = ctx?.user.id ?? null;
  const [coaches, setCoaches] = useState<AssignedCoach[] | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffErr, setStaffErr] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  // The userId whose write is in flight — several rows are actionable at once, so
  // a single boolean would disable the wrong control.
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<AssignedCoach | null>(null);

  // Two independent reads: the assignment list gates this section, the staff list
  // only gates the "Assign" affordance. `allSettled` so a dead /members doesn't
  // blank a list of coaches we successfully read.
  const load = useCallback(async () => {
    setLoadErr(false);
    const [t, m] = await Promise.allSettled([
      api.get<{ trainers: AssignedCoach[] }>(`/api/clients/${clientId}/trainers`),
      api.get<{ members: StaffMember[] }>("/api/members"),
    ]);
    if (m.status === "fulfilled") { setStaff(m.value.members.filter((x) => x.role !== "client")); setStaffErr(false); }
    else setStaffErr(true);
    if (t.status === "fulfilled") setCoaches(t.value.trainers);
    else setLoadErr(true);
  }, [clientId]);
  useEffect(() => void load(), [load]);

  const assign = async (userId: string, isPrimary: boolean) => {
    if (busy) return;
    setBusy(userId); setErr(null);
    try {
      await api.post(`/api/clients/${clientId}/trainers`, { trainerUserId: userId, isPrimary });
      setAddOpen(false);
      await load();
    } catch (e) { setErr(errorText(e, "Couldn't update this client's coaches. Please try again.")); }
    finally { setBusy(null); }
  };
  const unassign = async (userId: string) => {
    if (busy) return;
    setBusy(userId); setErr(null);
    try { await api.del(`/api/clients/${clientId}/trainers/${userId}`); await load(); }
    catch (e) { setErr(errorText(e, "Couldn't remove that coach. Please try again.")); }
    finally { setBusy(null); }
  };

  const assigned = new Set((coaches ?? []).map((c) => c.userId));
  const addable = staff.filter((m) => !assigned.has(m.userId));
  const roleOf = (userId: string): string => staff.find((m) => m.userId === userId)?.role ?? "trainer";

  return (
    <section className="space-y-2">
      {/* No eyebrow: the sub-page's own header already says "Coaches", and a
          section heading repeating the page title is the chrome §7 bans. The
          ACTION still belongs here, so it stands alone. */}
      <div className="flex justify-end">
        <Button size="sm" disabled={!coaches || staffErr} onClick={() => { setErr(null); setAddOpen(true); }}><Plus /> Assign</Button>
      </div>
      <Stagger>
      {loadErr && !coaches ? (
        <Card className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1"><div className="text-sm font-semibold">Couldn't load coaches</div><p className="text-sm text-muted-foreground">We couldn't reach the server for this client's coach assignments.</p></div>
          <Button size="sm" variant="secondary" onClick={() => void load()}>Retry</Button>
        </Card>
      ) : (
      <Reveal loading={!coaches} skeleton={<Card><SkeletonRow thumb={40} /></Card>}>
        {coaches && (
        /* A Group of Rows, not a Card of SubCards. Card > card > row is three
           nesting levels for what is a roster (§1 caps it at two), and the
           explanatory line reads as a GroupNote under the list rather than as a
           paragraph sitting on top of it. */
        <>
          {coaches.length === 0 ? (
            <Card><p className="text-sm text-warning" role="status">No coach is assigned — nobody but an owner can see this client.</p></Card>
          ) : (
            /*
              ONE LINE OF NAME, ONE LINE OF FACT, TWO ICON BUTTONS.
              This row shipped with everything competing at once: the title held
              the name plus TWO badges (role and Primary), which wrapped to
              three lines on a phone; the sub-line repeated the email that was
              already the title, because `coachName` falls back to it when a
              staff member has no name; and the trailing slot held a labelled
              "Make primary" button next to an X, so the name had ~130px left.
              §7 caps a row at two trailing actions and both are icons.
            */
            <Group>
              {coaches.map((co) => {
                const name = coachName(co);
                const role = personaLabel(roleOf(co.userId), { self: co.userId === myUserId });
                // The email only earns the sub-line when it is not already the
                // title. Otherwise the role stands alone there.
                const sub = [role, co.email && co.email !== name ? co.email : null].filter(Boolean).join(" · ");
                return (
                  <Row
                    key={co.userId}
                    leading={<Avatar name={name} seed={co.email ?? co.userId} className="size-10" />}
                    sub={sub}
                    trailing={
                      <span className="flex shrink-0 items-center gap-0.5">
                        {/* A star that is a BUTTON when it can be pressed and a
                            plain mark when it cannot — the primary coach's row
                            needs to say so without offering an action that
                            would be a no-op. */}
                        {co.isPrimary ? (
                          <span className="grid size-11 place-items-center text-primary" title="Primary coach">
                            <Star aria-label="Primary coach" className="size-[1.15rem] fill-current" />
                          </span>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-muted-foreground"
                            aria-label={`Make ${name} the primary coach`}
                            disabled={busy !== null}
                            onClick={() => void assign(co.userId, true)}
                          >
                            <Star />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="text-muted-foreground" aria-label={`Remove ${name} from this client`} disabled={busy !== null} onClick={() => { setErr(null); setToRemove(co); }}><X /></Button>
                      </span>
                    }
                  >
                    {name}
                  </Row>
                );
              })}
            </Group>
          )}
          <GroupNote>Only assigned coaches see this client on their roster. The primary coach receives their notifications.</GroupNote>
          {staffErr && <p className="pt-2 text-sm text-muted-foreground">Your staff list didn't load, so assigning is unavailable right now. <button onClick={() => void load()} className="font-medium text-primary underline">Retry</button></p>}
          {err && <p className="pt-2 text-sm text-warning" role="alert">{err}</p>}
        </>
        )}
      </Reveal>
      )}
      </Stagger>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Assign a coach">
        <div className="space-y-2">
          {addable.length === 0 ? (
            <p className="text-sm text-muted-foreground">{staff.length === 0 ? "No staff yet — invite a coach from the Staff screen first." : "Every staff member is already assigned to this client."}</p>
          ) : addable.map((m) => (
            <button
              key={m.userId}
              onClick={() => void assign(m.userId, false)}
              disabled={busy !== null}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl bg-secondary px-4 py-3 text-left transition-colors hover:bg-surface-3 disabled:opacity-45"
            >
              <Avatar name={coachName(m)} seed={m.email ?? m.userId} className="size-9 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{coachName(m)}</div>
                <div className="truncate text-sm text-muted-foreground">{personaLabel(m.role)}{m.email ? ` · ${m.email}` : ""}</div>
              </div>
              <span className="shrink-0 text-sm font-medium text-primary">{busy === m.userId ? "Assigning…" : "Assign"}</span>
            </button>
          ))}
          {err && <p className="text-sm text-warning" role="alert">{err}</p>}
        </div>
      </Sheet>

      <ConfirmDialog
        open={!!toRemove}
        onOpenChange={(o) => !o && setToRemove(null)}
        title={toRemove ? `Remove ${coachName(toRemove)}?` : "Remove coach?"}
        description="They lose this client from their roster and can no longer open the record. Nothing the client has logged is deleted, and you can assign them again later."
        confirmLabel="Remove coach"
        destructive
        onConfirm={() => { if (toRemove) void unassign(toRemove.userId); }}
      />
    </section>
  );
}

// ── Offboard: archive vs delete (SPEC §8.1) ────────────────────────────────
// Two OUTCOMES that must never be confused, so they are two separate cards with
// different weight, different icons and a comparison line between them:
//
//   Archive — `POST /clients/:id/archive`. Flips `status = 'archived'`. Takes them
//     off the roster and KEEPS everything. Does NOT free a seat: the record and
//     its data are still on the tenancy, so the capacity is still in use. The
//     client keeps READ access to their own history and loses write.
//   Delete  — `POST /clients/:id/delete`. Runs `purgeClient`: every client-scoped
//     D1 row plus their R2 objects. This is the ONLY thing that frees a seat,
//     because it is the only thing that stops storing the data. Irreversible, so
//     it demands the client's name typed out (the server checks it too) and
//     reports what it freed rather than silently vanishing.
//
// Both are owner-only. Archive is the default-looking action; delete lives behind
// a danger-toned card so the destructive one is never the easy tap.

interface DeleteResult {
  deleted: { id: string; displayName: string };
  storage: { objectsRemoved: number; bytesFreed: number; mbFreed: number };
  activeClients: { used: number; max: number };
}

interface OffboardRequest {
  id: string; clientId: string; clientName: string | null; kind: "archive" | "delete";
  reason: string; status: "pending" | "approved" | "declined"; createdAt: string;
  decidedAt: string | null; decisionNote: string | null; requestedBy: string;
}

/**
 * A coach's side of offboarding: ask, with a reason.
 *
 * Archive and delete are owner-only, and before this a coach saw nothing here at
 * all — they had to go find the owner some other way, which lost both the reason
 * and the audit trail. Asking in-app keeps the request, the reason and the
 * decision attached to the client record.
 */
function OffboardRequestSection({ clientId, clientName }: { clientId: string; clientName?: string | null }) {
  const [mine, setMine] = useState<OffboardRequest[] | null>(null);
  const [kind, setKind] = useState<"archive" | "delete">("archive");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const who = clientName?.trim() || "this client";
  const load = useCallback(async () => {
    try {
      const r = await api.get<{ requests: OffboardRequest[] }>("/api/offboard-requests");
      setMine(r.requests.filter((x) => x.clientId === clientId));
    } catch { setMine([]); }
  }, [clientId]);
  useEffect(() => { void load(); }, [load]);

  const pending = mine?.find((r) => r.status === "pending") ?? null;
  const submit = async () => {
    if (busy || !reason.trim()) return;
    setBusy(true); setErr(null);
    try { await api.post(`/api/clients/${clientId}/offboard-request`, { kind, reason: reason.trim() }); setReason(""); await load(); }
    catch (e) { setErr(errorText(e, "Couldn't send that request. Please try again.")); }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-3">
      <Stagger>
        <Card className="space-y-3">
          {pending ? (
            <>
              <div className="flex items-center gap-2 font-medium"><Archive className="size-4 text-warning" /> Waiting on the owner</div>
              <p className="text-sm text-muted-foreground">
                You asked to <span className="font-medium text-foreground">{pending.kind}</span> {who}. Nothing has happened to
                the record — the owner decides, and you&rsquo;ll get a notification either way.
              </p>
              <SubCard className="text-sm text-muted-foreground">&ldquo;{pending.reason}&rdquo;</SubCard>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 font-medium"><Archive className="size-4 text-muted-foreground" /> Ask to remove {who}</div>
              <p className="text-sm text-muted-foreground">
                Only the studio owner can archive or delete a client. Send them the request and the reason; they approve or decline it.
              </p>
              <div className="flex flex-wrap gap-2">
                <Chip selected={kind === "archive"} onClick={() => setKind("archive")}>Archive — keep the data</Chip>
                <Chip selected={kind === "delete"} onClick={() => setKind("delete")}>Delete — erase everything</Chip>
              </div>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Why? e.g. moved away, stopped training, duplicate record" />
              <Button variant="outline" className="w-full" disabled={busy || !reason.trim()} onClick={() => void submit()}>
                {busy ? "Sending…" : "Send request"}
              </Button>
              {err && <p className="text-sm text-warning" role="alert">{err}</p>}
              {mine?.some((r) => r.status !== "pending") && (
                <SubCard className="space-y-1 text-xs text-muted-foreground">
                  {mine.filter((r) => r.status !== "pending").slice(0, 3).map((r) => (
                    <div key={r.id}>
                      <span className="font-medium text-foreground">{r.status === "approved" ? "Approved" : "Declined"}</span> · {r.kind}
                      {r.decisionNote ? ` — “${r.decisionNote}”` : ""}
                    </div>
                  ))}
                </SubCard>
              )}
            </>
          )}
        </Card>
      </Stagger>
    </section>
  );
}

/** The owner's side: a pending request on THIS client, with the two decisions. */
function OffboardRequestQueue({ clientId, onDecided }: { clientId: string; onDecided: () => void }) {
  const [reqs, setReqs] = useState<OffboardRequest[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await api.get<{ requests: OffboardRequest[] }>("/api/offboard-requests");
      setReqs(r.requests.filter((x) => x.clientId === clientId && x.status === "pending"));
    } catch { setReqs([]); }
  }, [clientId]);
  useEffect(() => { void load(); }, [load]);

  const req = reqs?.[0];
  if (!req) return null;

  const decide = async (approve: boolean) => {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      await api.post(`/api/offboard-requests/${req.id}/decide`, { approve, note: note.trim() || undefined });
      setNote("");
      await load();
      onDecided();
    } catch (e) { setErr(errorText(e, "Couldn't record that decision. Please try again.")); }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-2">
      <Eyebrow>Needs your decision</Eyebrow>
      <Stagger>
        <Card className="space-y-3 border border-warning/40">
          <div className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4 text-warning" /> {req.requestedBy} asked to {req.kind} this client</div>
          <SubCard className="text-sm text-muted-foreground">&ldquo;{req.reason}&rdquo;</SubCard>
          <p className="text-sm text-muted-foreground">
            {req.kind === "delete"
              ? "Approving erases the record and everything on it — logs, photos, lab files. There's no undo, and it frees a seat on your plan."
              : "Approving takes them off the roster and keeps the data. They can still read their own history. It does not free a seat."}
          </p>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Optional note back to the coach" />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" disabled={busy} onClick={() => void decide(false)}>Decline</Button>
            <Button className="flex-1" disabled={busy} onClick={() => void decide(true)}>{busy ? "…" : `Approve ${req.kind}`}</Button>
          </div>
          {err && <p className="text-sm text-warning" role="alert">{err}</p>}
        </Card>
      </Stagger>
    </section>
  );
}

function OffboardSection({ clientId, clientName, archived, onChanged }: {
  clientId: string;
  clientName?: string | null;
  archived: boolean;
  onChanged: () => void;
}) {
  const nav = useNavigate();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const act = useAction();
  const who = clientName?.trim() || "this client";

  const archive = () =>
    void act.run("archive", async () => {
      await api.post(`/api/clients/${clientId}/archive`);
      nav("/clients");
      return `${who} is archived.`;
    }, "Couldn't archive this client.");

  const restore = () =>
    void act.run("restore", async () => {
      await api.post(`/api/clients/${clientId}/unarchive`);
      onChanged();
      return `${who} is back on your roster.`;
    }, "Couldn't restore this client.");

  /*
    TWO ROWS, NOT TWO WALLS.

    This was two bordered cards carrying five paragraphs between them — what
    archiving keeps, what it does not free, that there was no way back, what
    deleting erases, that it frees a seat, that there is no undo. Every word of
    it was true and none of it was READ, because it sat permanently open on an
    admin tab under everything else, and prose you scroll past is prose you
    have not seen (§10: nothing explains a control the reader can just try;
    prose is for what is irreversible).

    The consequence belongs on the CONFIRMATION, at the moment you are asked to
    accept it — which is where both now say it, in one sentence each.
  */
  return (
    <section className="space-y-3">
      <Group>
        {archived ? (
          <Row
            icon={RotateCcw}
            sub="Put them back on your roster — everything is still here"
            onClick={restore}
            disabled={act.busy !== null}
          >
            {act.busy === "restore" ? "Restoring…" : "Restore client"}
          </Row>
        ) : (
          <Row
            icon={Archive}
            sub="Off the roster, everything kept. Reversible."
            onClick={() => setConfirmArchive(true)}
            disabled={act.busy !== null}
          >
            {act.busy === "archive" ? "Archiving…" : "Archive client"}
          </Row>
        )}
        <Row
          icon={Trash2}
          tone="danger"
          sub="Erases their whole history. Frees a seat. No undo."
          onClick={() => setDeleteOpen(true)}
        >
          Delete permanently
        </Row>
      </Group>
      <ActionResult msg={act.msg} err={act.err} />

      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title={`Archive ${who}?`}
        /* One sentence naming the consequence (§10), and it can now end on the
           truth rather than on "treat this as one-way": archiving is reversible
           from this same screen. */
        description={`${who} comes off your roster and keeps every log, plan and file — they can still sign in to read their history, but not add to it. It does not free a seat on your plan, and you can restore them from here.`}
        confirmLabel="Archive client"
        destructive
        onConfirm={archive}
      />

      {deleteOpen && (
        <DeleteClientSheet
          clientId={clientId}
          clientName={clientName ?? null}
          onClose={() => setDeleteOpen(false)}
          onDone={() => nav("/clients")}
        />
      )}
    </section>
  );
}

/** The irreversible one. Two stages so it can never be a single tap: read what
 *  goes, then type the client's name (the server re-checks the typed string, so
 *  this is a real gate rather than a dialog you can bypass with a scripted POST).
 *  On success it stays open to report what was actually freed. */
function DeleteClientSheet({ clientId, clientName, onClose, onDone }: { clientId: string; clientName: string | null; onClose: () => void; onDone: () => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<DeleteResult | null>(null);
  const name = clientName?.trim() || "";
  const matches = name.length > 0 && typed.trim().toLowerCase() === name.toLowerCase();
  const del = async () => {
    if (busy || !matches) return;
    setBusy(true); setErr(null);
    try { setDone(await api.post<DeleteResult>(`/api/clients/${clientId}/delete`, { confirm: typed.trim() })); }
    catch (e) { setErr(errorText(e, "Couldn't delete this client. Nothing was removed — please try again.")); }
    finally { setBusy(false); }
  };
  return (
    <Sheet
      open
      onClose={done ? onDone : onClose}
      title={done ? "Client deleted" : `Delete ${name || "client"}`}
      /* The footer follows the branch. This sheet is two surfaces sharing a
         frame — a typed confirmation, then a receipt — and each has its own
         way out. */
      footer={done ? (
        <Button size="lg" className="w-full" onClick={onDone}>Back to roster</Button>
      ) : (
        <div className="space-y-2">
          <Button variant="outline" size="lg" className="w-full border-danger/40 text-danger" disabled={busy || !matches} onClick={() => void del()}>
            {busy ? <><Spinner /> Deleting…</> : <><Trash2 /> Delete permanently</>}
          </Button>
          <Button variant="ghost" size="lg" className="w-full" onClick={onClose}>Keep this client</Button>
        </div>
      )}
    >
      {done ? (
        <div className="space-y-4" role="status" aria-live="polite">
          <div className="flex items-start gap-3">
            <IconBadge icon={Check} tone="success" />
            <div className="min-w-0">
              <p className="text-sm"><span className="font-medium">{done.deleted.displayName}</span> and everything on their record have been erased.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {done.storage.objectsRemoved > 0
                  ? `${done.storage.objectsRemoved} file${done.storage.objectsRemoved === 1 ? "" : "s"} removed, ${done.storage.mbFreed} MB of storage reclaimed.`
                  : "No stored files were attached, so storage is unchanged."}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {done.activeClients.max < 0
                  ? `Your roster is now ${done.activeClients.used}. Your plan has no client limit.`
                  : `Your roster is now ${done.activeClients.used} of ${done.activeClients.max} — that seat is free.`}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This erases their logs, measurements, check-ins, progress photos, uploaded lab files, plans and history. It cannot be recovered by you or by us.
          </p>
          <Field
            label={`Type “${name}” to confirm`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            hint="Case doesn't matter."
          />
          {err && <p className="text-sm text-danger" role="alert">{err}</p>}
        </div>
      )}
    </Sheet>
  );
}

/** Coach-action audit history — the durable record of what staff did to this
 *  client's record (GET /clients/:id/audit). Each row's label comes from the
 *  AUDIT_ACTIONS registry (server-rendered); the icon is coded by action family. */
interface AuditItem { id: string; action: string; label: string; summary: string | null; at: number; actor: string | null }
const AUDIT_ICON: Record<string, typeof Pill> = {
  goal: BarChart3, plan: ClipboardList, checkin: Check, supplement: Pill, lab: FlaskConical, swap: ArrowLeftRight, content: BookOpen, package: Ticket, client: User, member: User,
};
const timeAgo = (ms: number): string => {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  const m = s / 60; if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60; if (h < 24) return `${Math.floor(h)}h ago`;
  const d = h / 24; if (d < 7) return `${Math.floor(d)}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

function ActivityLog({ clientId }: { clientId: string }) {
  const [items, setItems] = useState<AuditItem[] | null>(null);
  useEffect(() => {
    void api.get<{ items: AuditItem[] }>(`/api/clients/${clientId}/audit`).then((r) => setItems(r.items)).catch(() => setItems([]));
  }, [clientId]);
  // It used to `return null` on an empty log, which was right while this was one
  // section among ten on a scroll. It is a destination now: opening a row and
  // landing on a blank page reads as broken.
  if (items && items.length === 0) {
    return <EmptyState icon={History} title="Nothing yet" description="Every change to this client — by you, a coach, or them — shows up here." />;
  }
  return (
    <section className="space-y-2">
      <Stagger>
      <Card className="space-y-3">
        {!items ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded-lg bg-surface-2" />)}</div>
        ) : (
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {items.map((it) => {
              const Icon = AUDIT_ICON[it.action.split(".")[0] ?? ""] ?? ClipboardList;
              return (
                <div key={it.id} className="flex items-start gap-2.5 rounded-lg px-1 py-1.5">
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm"><span className="font-medium">{it.actor ?? "A coach"}</span> {it.label}{it.summary ? <span className="text-muted-foreground"> · {it.summary}</span> : null}</div>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(it.at)}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      </Stagger>
    </section>
  );
}

/** Resolve one swap: shows which exercise + day, and picks the replacement. */
function SwapResolver({ swap, exercises, onResolve }: { swap: Swap; exercises: ExerciseInfo[]; onResolve: (id: string, status: "approved" | "rejected", replacementExerciseId?: string) => Promise<void> }) {
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const current = swap.current_exercise_id ? exMap.get(swap.current_exercise_id) : undefined;
  const [choice, setChoice] = useState<ExerciseInfo | null>(swap.suggested_exercise_id ? exMap.get(swap.suggested_exercise_id) ?? null : null);
  const [picking, setPicking] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [q, setQ] = useState("");
  const filtered = exercises.filter((e) => e.id !== swap.current_exercise_id && e.name.toLowerCase().includes(q.toLowerCase())).slice(0, 20);
  return (
    <div className="space-y-2.5 rounded-xl bg-surface-2 p-3">
      <div className="text-sm">Swap <span className="font-semibold">{current?.name ?? "an exercise"}</span>{typeof swap.day_index === "number" ? <span className="text-muted-foreground"> · Day {swap.day_index + 1}</span> : null}</div>
      {swap.reason && <div className="text-xs italic text-muted-foreground">“{swap.reason}”</div>}
      {choice ? (
        <SubCard className="py-2">
          <ExerciseRow ex={choice} thumbSize={34} trailing={
            <button onClick={() => { setChoice(null); setPicking(true); }} className="shrink-0 text-xs font-medium text-primary">Change</button>
          } />
        </SubCard>
      ) : picking ? (
        <div className="space-y-1">
          <Field label="Replacement" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {filtered.map((e) => (
              <button key={e.id} onClick={() => { setChoice(e); setPicking(false); setQ(""); }} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-surface-3">
                <ExerciseRow ex={e} thumbSize={32} meta={false} />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <Button size="sm" variant="secondary" className="w-full" onClick={() => setPicking(true)}>Choose replacement</Button>
      )}
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" disabled={!choice} onClick={() => void onResolve(swap.id, "approved", choice?.id)}><Check /> Approve</Button>
        <Button size="sm" variant="outline" className="flex-1" onClick={() => setConfirmReject(true)}><X /> Reject</Button>
      </div>
      <ConfirmDialog
        open={confirmReject}
        onOpenChange={setConfirmReject}
        title="Reject this swap request?"
        description="The client keeps their current exercise and is told the request was declined."
        confirmLabel="Reject request"
        destructive
        onConfirm={() => void onResolve(swap.id, "rejected")}
      />
    </div>
  );
}

function CheckInReview({ clientId, checkIns, onFeedback }: { clientId: string; checkIns: CheckIn[]; onFeedback: () => Promise<void> }) {
  const canAi = useCan("aiSuite");
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  // The check-in id whose reply is in flight, plus per-row failures — a coach can
  // have several rows open, so a single boolean would disable the wrong Send.
  const [sending, setSending] = useState<string | null>(null);
  const [sendErr, setSendErr] = useState<Record<string, string>>({});
  const units = useUnits();
  const firstId = checkIns[0]?.id ?? null;
  const summarize = useCallback(async (fresh: boolean) => {
    setBusy(true); setErr(null);
    try {
      const r = await api.post<{ summary: string; suggestedReply: string }>("/api/ai/summarize-checkins", { clientId, fresh });
      setSummary(r.summary);
      // Only seed the reply box on an EXPLICIT refresh. Overwriting a draft the
      // coach is halfway through typing, because a cached summary arrived on
      // mount, is the kind of help nobody asked for.
      setDraft((d) => (fresh && firstId && !d[firstId]?.trim() ? { ...d, [firstId]: r.suggestedReply } : d));
    // Quiet on the automatic pass, loud on Refresh — a studio with no AI
    // provider must not get an error box every time a coach opens Manage.
    } catch (e) { if (fresh) setErr(e); }
    finally { setBusy(false); }
  }, [clientId, firstId]);

  /*
   * Written on arrival, like every other note this assistant writes.
   *
   * It used to wait behind a Summarize button on a screen the coach opened
   * *because* they were about to read the check-ins. The route caches on the
   * client's signal hash for an hour, so arriving is free and only a new
   * check-in (or Refresh) pays again.
   */
  useEffect(() => {
    if (!canAi || checkIns.length === 0) return;
    void summarize(false);
  }, [canAi, checkIns.length, summarize]);
  // Sending notifies the client, so a double-tap used to send the reply twice —
  // and a failed POST cleared nothing and said nothing, leaving the coach to
  // believe the client had been answered when they hadn't.
  const send = async (id: string) => {
    const fb = draft[id]?.trim();
    if (!fb || sending) return;
    setSending(id); setSendErr((m) => ({ ...m, [id]: "" }));
    try {
      await api.post(`/api/check-ins/${id}/feedback`, { clientId, feedback: fb });
      setDraft((d) => ({ ...d, [id]: "" }));
      await onFeedback();
    } catch (e) { setSendErr((m) => ({ ...m, [id]: errorText(e, "Couldn't send that reply. Please try again.") })); }
    finally { setSending(null); }
  };
  return (
    <section className="space-y-2">
      {/* `/api/ai/summarize-checkins` is gated on aiSuite. */}
      <Eyebrow action={canAi ? <Button size="sm" variant="tonal" disabled={busy || checkIns.length === 0} onClick={() => void summarize(true)}><AiAvatar className="size-5" /> {busy ? "…" : "Refresh"}</Button> : undefined}>Check-ins</Eyebrow>
      <Stagger>
      <Card className="space-y-3">
      {err ? <AiErrorBox error={err} /> : null}
      {busy && !summary && (
        <SubCard className="space-y-2"><SkeletonLine w="100%" /><SkeletonLine w="70%" /></SubCard>
      )}
      {summary && (
        <SubCard className="space-y-2 text-sm">
          <div className="flex items-start gap-2.5"><AiAvatar className="size-7" /><Markdown className="min-w-0 flex-1">{summary}</Markdown></div>
          <InsightFeedback insightType="checkin-reply" insightRef={clientId} />
        </SubCard>
      )}
      {checkIns.length === 0 ? <p className="text-sm text-muted-foreground">No check-ins yet.</p> : checkIns.slice(0, 5).map((c) => {
        const photos = checkInPhotos(c.photos_json);
        const meta = [c.mood != null ? `mood ${c.mood}/5` : null, c.energy != null ? `energy ${c.energy}/5` : null, c.sleep_hours ? `${c.sleep_hours}h sleep` : null, c.steps_count ? `${c.steps_count.toLocaleString()} steps` : null].filter(Boolean).join(" · ");
        return (
          <SubCard key={c.id} id={`mng-ci-${c.id}`} className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{new Date(`${c.date_local}T00:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</span>
              {c.weight_kg && <span className="numeral text-xs font-medium text-muted-foreground">{fmtWeight(c.weight_kg, units)}</span>}
            </div>
            {meta && <div className="text-xs text-muted-foreground">{meta}</div>}
            {photos.length > 0 && <PhotoGrid photos={photos} cols={4} />}
            {c.notes && <p className="text-sm text-muted-foreground">“{c.notes}”</p>}
            {c.trainer_feedback ? <div className="flex items-start gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary"><Check className="mt-0.5 size-3.5 shrink-0" /><span>You replied: {c.trainer_feedback}</span></div> : (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <input value={draft[c.id] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [c.id]: e.target.value }))} placeholder="Reply…" className="flex-1 rounded-lg bg-surface-3 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/70" />
                  <Button size="sm" disabled={!draft[c.id]?.trim() || sending === c.id} onClick={() => void send(c.id)}>{sending === c.id ? "Sending…" : "Send"}</Button>
                </div>
                {sendErr[c.id] && <p className="text-sm text-warning" role="alert">{sendErr[c.id]}</p>}
              </div>
            )}
          </SubCard>
        );
      })}
    </Card>
    </Stagger>
    </section>
  );
}

function PrescribeSheet({ clientId, onClose, onDone }: { clientId: string; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [kind, setKind] = useState("other");
  const [slots, setSlots] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const toggle = (s: string) => setSlots((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  const save = async () => {
    setBusy(true);
    try { await api.post("/api/supplements", { clientId, name, dose: dose || undefined, kind, schedule: slots.map((slot) => ({ slot })) }); onDone(); }
    finally { setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title="Prescribe supplement" footer={<Button size="lg" className="w-full" disabled={busy || name.trim().length < 2} onClick={() => void save()}>{busy ? "Saving…" : "Prescribe"}</Button>}>
      <div className="space-y-4">
        <Field label="Name" icon={Pill} value={name} onChange={(e) => setName(e.target.value)} placeholder="Creatine monohydrate" />
        <Field label="Dose" value={dose} onChange={(e) => setDose(e.target.value)} placeholder="5 g" />
        <div className="flex flex-wrap gap-2">{["protein", "creatine", "vitamin", "omega3", "pre_workout", "other"].map((k) => <Chip key={k} selected={kind === k} onClick={() => setKind(k)}>{k.replace("_", " ")}</Chip>)}</div>
        <div><label className="mb-1.5 block text-sm font-medium text-muted-foreground">Schedule</label><div className="flex flex-wrap gap-2">{["morning", "pre_workout", "post_workout", "evening", "bedtime"].map((s) => <Chip key={s} selected={slots.includes(s)} onClick={() => toggle(s)}>{s.replace("_", " ")}</Chip>)}</div></div>
      </div>
    </Sheet>
  );
}

interface SuppReco { name: string; dose: string; rationale: string; linkedMarker: string | null }
function SuggestSuppSheet({ clientId, onClose, onPrescribed }: { clientId: string; onClose: () => void; onPrescribed: () => Promise<void> }) {
  const [recos, setRecos] = useState<SuppReco[] | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  // The reco whose POST is in flight, and the one that failed — a double-tap used
  // to prescribe the same supplement twice, and a rejection left the row's
  // "Prescribe" button unchanged, so it looked like a no-op rather than an error.
  const [prescribing, setPrescribing] = useState<string | null>(null);
  const [prescribeErr, setPrescribeErr] = useState<{ name: string; text: string } | null>(null);
  useEffect(() => {
    void api.post<{ recommendations: SuppReco[]; note: string }>("/api/ai/supplement-reco", { clientId })
      .then((r) => { setRecos(r.recommendations); setNote(r.note); })
      .catch((e) => setError(e));
  }, [clientId]);
  const prescribe = async (r: SuppReco) => {
    if (prescribing) return;
    setPrescribing(r.name); setPrescribeErr(null);
    try {
      await api.post("/api/supplements", { clientId, name: r.name, dose: r.dose || undefined, kind: "other", schedule: [{ slot: "daily" }] });
      setAdded((a) => new Set(a).add(r.name));
      await onPrescribed();
    } catch (e) { setPrescribeErr({ name: r.name, text: errorText(e, "Couldn't prescribe that. Please try again.") }); }
    finally { setPrescribing(null); }
  };
  return (
    <Sheet open onClose={onClose} title="Suggested supplements" size="tall">
      <div className="space-y-3">
        <div className="flex items-center gap-2.5 rounded-xl bg-primary/10 p-2.5"><AiAvatar className="size-8" /><p className="text-xs text-muted-foreground">Evidence-based ideas from this client's reviewed labs, goal and current stack. Review before prescribing.</p></div>
        {error ? <AiErrorBox error={error} /> : (
          <Reveal loading={!recos} className="space-y-3" skeleton={<SkeletonList rows={3} />}>
            {recos && (recos.length === 0 ? <p className="text-sm text-muted-foreground">No suggestions right now.</p> : recos.map((r, i) => (
              <SubCard key={i} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0"><span className="font-medium">{r.name}</span>{r.dose && <span className="ml-2 text-xs text-muted-foreground">{r.dose}</span>}</div>
                  {added.has(r.name) ? <Badge tone="success">Added</Badge> : <Button size="sm" disabled={prescribing !== null} onClick={() => void prescribe(r)}>{prescribing === r.name ? "Adding…" : "Prescribe"}</Button>}
                </div>
                <p className="text-xs text-muted-foreground">{r.rationale}</p>
                {prescribeErr && prescribeErr.name === r.name && <p className="text-sm text-warning" role="alert">{prescribeErr.text}</p>}
                {r.linkedMarker && <Badge tone="cardio">{r.linkedMarker}</Badge>}
              </SubCard>
            )))}
          </Reveal>
        )}
        {note && <SubCard className="flex items-start gap-2 text-xs text-muted-foreground"><AiAvatar className="mt-0.5 size-4 shrink-0" /><Markdown className="min-w-0 flex-1">{note}</Markdown></SubCard>}
        {/* Rate the SET of suggestions, once, rather than each row — the useful
            signal is whether this feature's output was worth reading. */}
        {recos && recos.length > 0 && <InsightFeedback insightType="supplement-reco" insightRef={clientId} />}
      </div>
    </Sheet>
  );
}

const LAB_TYPES = ["blood_panel", "hormone", "vitamin_d", "lipid", "thyroid", "body_composition", "custom"];
function RequestLabSheet({ clientId, onClose, onDone }: { clientId: string; onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState("blood_panel");
  const [customType, setCustomType] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.post("/api/labs", { clientId, type, customType: type === "custom" ? customType : undefined, instructions: instructions || undefined }); onDone(); }
    finally { setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title="Request a lab test" footer={<Button size="lg" className="w-full" disabled={busy || (type === "custom" && customType.trim().length < 2)} onClick={() => void save()}>{busy ? "Requesting…" : "Request test"}</Button>}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">{LAB_TYPES.map((t) => <Chip key={t} selected={type === t} onClick={() => setType(t)}>{t.replace("_", " ")}</Chip>)}</div>
        {type === "custom" && <Field label="Custom name" value={customType} onChange={(e) => setCustomType(e.target.value)} />}
        <div><label className="mb-1.5 block text-sm font-medium text-muted-foreground">Instructions</label><Textarea rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Fasted, morning draw…" /></div>
      </div>
    </Sheet>
  );
}

interface LabValue { _id: string; marker: string; value: string; unit: string; flag: "low" | "normal" | "high" }
const isLabImage = (key: string) => /\.(png|jpe?g|webp|gif|heic)$/i.test(key);
/** Stable client-side id so editable rows key by identity, not array index. */
const rowId = (): string => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
function ReviewLabSheet({ clientId, lab, onClose, onDone }: { clientId: string; lab: Lab; onClose: () => void; onDone: () => void }) {
  const [values, setValues] = useState<LabValue[]>(() => (lab.values && lab.values.length ? lab.values.map((v) => ({ _id: rowId(), marker: v.marker, value: v.value, unit: v.unit ?? "", flag: (v.flag as LabValue["flag"]) ?? "normal" })) : [{ _id: rowId(), marker: "", value: "", unit: "", flag: "normal" }]));
  const [feedback, setFeedback] = useState(lab.trainer_feedback ?? "");
  const canAi = useCan("aiSuite");
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractErr, setExtractErr] = useState<unknown>(null);
  const fileUrl = lab.file_key ? `/api/media/${lab.file_key}` : null;
  const autofill = async () => {
    setExtracting(true); setExtractErr(null);
    try {
      const r = await api.post<{ values: { marker: string; value: string; unit?: string; flag?: string }[] }>("/api/ai/lab-extract", { clientId, labId: lab.id });
      if (r.values?.length) setValues(r.values.map((v) => ({ _id: rowId(), marker: v.marker, value: String(v.value), unit: v.unit ?? "", flag: (v.flag as LabValue["flag"]) ?? "normal" })));
    } catch (e) { setExtractErr(e); }
    finally { setExtracting(false); }
  };
  const setRow = (i: number, p: Partial<LabValue>) => setValues((v) => v.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  const save = async () => {
    setBusy(true);
    try {
      const clean = values.filter((v) => v.marker.trim() && v.value.trim()).map(({ _id, ...rest }) => rest);
      await api.patch(`/api/labs/${lab.id}`, { status: "reviewed", values: clean.length ? clean : undefined, trainerFeedback: feedback || undefined });
      onDone();
    } finally { setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title={`Review — ${lab.display_name}`} footer={<Button size="lg" className="w-full" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Mark reviewed"}</Button>}>
      <div className="space-y-4">
        {fileUrl && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-muted-foreground">Uploaded result</label>
            {isLabImage(lab.file_key!) ? (
              <PhotoGrid photos={[{ url: fileUrl, label: lab.display_name }]} cols={2} />
            ) : (
              <a href={fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 transition-colors hover:bg-surface-3"><IconBadge icon={ImageIcon} tone="cardio" size="sm" /><span className="text-sm font-medium">Open uploaded file</span></a>
            )}
          </div>
        )}
        {lab.client_notes && <SubCard className="text-sm text-muted-foreground">Client note: {lab.client_notes}</SubCard>}
        {/* `/api/ai/lab-extract` is gated on aiSuite. */}
        {fileUrl && canAi && <Button size="sm" variant="tonal" className="w-full" disabled={extracting} onClick={() => void autofill()}><AiAvatar className="size-5" /> {extracting ? "Reading report…" : "Auto-fill from report"}</Button>}
        {extractErr ? <AiErrorBox error={extractErr} /> : null}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-muted-foreground">Values</label>
          {values.map((v, i) => (
            <div key={v._id} className="flex items-center gap-1.5 text-sm">
              <input value={v.marker} onChange={(e) => setRow(i, { marker: e.target.value })} placeholder="Marker" className="min-w-0 flex-1 rounded-lg bg-surface-3 px-2.5 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/70" />
              <input value={v.value} onChange={(e) => setRow(i, { value: e.target.value })} placeholder="Value" className="w-16 rounded-lg bg-surface-3 px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/70" />
              <input value={v.unit} onChange={(e) => setRow(i, { unit: e.target.value })} placeholder="unit" className="w-14 rounded-lg bg-surface-3 px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/70" />
              <Select
                aria-label={`Flag for ${v.marker || "this marker"}`}
                value={v.flag}
                className="h-9 w-[4.75rem] shrink-0 px-2"
                onChange={(flag) => setRow(i, { flag: flag as LabValue["flag"] })}
                options={[{ value: "low", label: "low" }, { value: "normal", label: "ok" }, { value: "high", label: "high" }]}
              />
            </div>
          ))}
          <button onClick={() => setValues((v) => [...v, { _id: rowId(), marker: "", value: "", unit: "", flag: "normal" }])} className="text-xs font-medium text-primary">+ Row</button>
        </div>
        <div><label className="mb-1.5 block text-sm font-medium text-muted-foreground">Feedback</label><Textarea rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What this means and next steps…" /></div>
      </div>
    </Sheet>
  );
}

interface Report {
  compliance: { checkInDays: number; foodDays: number; workoutDays: number; checkInConsistencyPct: number; currentStreak: number; calorieAdherencePct: number | null };
  averages: { mood: number | null; sleepHours: number | null };
  weightSeries: { date: string; kg: number }[];
  bodyFatSeries: { date: string; pct: number }[];
  totalTonnage: number;
  prs: { exerciseId: string; e1rm: number; weight: number; reps: number }[];
}
function ReportSheet({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");
  const [report, setReport] = useState<Report | null>(null);
  const [reportErr, setReportErr] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [exNames, setExNames] = useState<Map<string, string>>(new Map());
  const units = useUnits();
  // Same dead end as the screen loader: a failed read left this sheet a
  // permanent skeleton (the range chips still switching, nothing ever arriving).
  useEffect(() => {
    let alive = true;
    setReport(null); setReportErr(false);
    const today = todayLocal();
    api.get<Report>(`/api/reports/client/${clientId}?range=${range}&today=${today}`)
      .then((r) => { if (alive) setReport(r); })
      .catch(() => { if (alive) setReportErr(true); });
    return () => { alive = false; };
  }, [clientId, range, reloadKey]);
  useEffect(() => { void api.get<{ exercises: { id: string; name: string }[] }>("/api/exercises?scope=all").then((r) => setExNames(new Map(r.exercises.map((e) => [e.id, e.name])))).catch(() => undefined); }, []);
  const weight = report?.weightSeries ?? [];
  const wDelta = weight.length >= 2 ? Math.round((kgToDisplay(weight.at(-1)!.kg, units) - kgToDisplay(weight[0]!.kg, units)) * 10) / 10 : null;
  const bfSeries = report?.bodyFatSeries ?? [];
  const bfDelta = bfSeries.length >= 2 ? Math.round((bfSeries.at(-1)!.pct - bfSeries[0]!.pct) * 10) / 10 : null;
  return (
    <Sheet open onClose={onClose} title="Client report">
      <div className="mb-3 flex gap-2">{(["7d", "30d", "90d"] as const).map((r) => <Chip key={r} selected={range === r} onClick={() => setRange(r)}>{r}</Chip>)}</div>
      {reportErr ? (
        <EmptyState icon={AlertTriangle} title="Couldn't load the report" description="Something went wrong reaching the server. Check your connection and try again." action={<Button onClick={() => setReloadKey((k) => k + 1)}>Try again</Button>} />
      ) : (
      <Reveal loading={!report} skeleton={<><SkeletonStatGrid count={9} cols={3} /><SkeletonList card rows={5} thumb={0} /></>}>
        {report && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Metric label="Check-ins" value={report.compliance.checkInDays} />
            <Metric label="Workouts" value={report.compliance.workoutDays} />
            <Metric label="Streak" value={report.compliance.currentStreak} />
            <Metric label="Consistency" value={`${report.compliance.checkInConsistencyPct}%`} />
            <Metric label="Cal adherence" value={report.compliance.calorieAdherencePct != null ? `${report.compliance.calorieAdherencePct}%` : null} />
            <Metric label="Weight Δ" value={wDelta != null ? `${wDelta > 0 ? "+" : ""}${wDelta} ${weightLabel(units)}` : null} />
            <Metric label="Body-fat Δ" value={bfDelta != null ? `${bfDelta > 0 ? "+" : ""}${bfDelta}%` : null} />
            <Metric label="Avg mood" value={report.averages.mood ?? null} />
            <Metric label="Avg sleep" value={report.averages.sleepHours != null ? `${report.averages.sleepHours}h` : null} />
            <Metric label="Tonnage" value={`${Math.round(kgToDisplay(report.totalTonnage, units) / 1000).toLocaleString()}k ${weightLabel(units)}`} />
          </div>
          {report.prs.length > 0 && (
            <Card className="space-y-1.5">
              <h3 className="text-sm font-semibold">Top lifts (est. 1RM)</h3>
              {report.prs.slice(0, 8).map((p) => <div key={p.exerciseId} className="flex items-center justify-between text-sm"><span className="truncate text-muted-foreground">{exNames.get(p.exerciseId) ?? "Exercise"}</span><span className="numeral font-medium">{Math.round(kgToDisplay(p.e1rm, units))} {weightLabel(units)}</span></div>)}
            </Card>
          )}
        </div>
        )}
      </Reveal>
      )}
    </Sheet>
  );
}

function Metric({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="rounded-xl bg-secondary p-3">
      {value == null ? <NoData className="block text-xs">Not yet</NoData> : <div className="numeral text-lg font-semibold">{value}</div>}
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

/**
 * CORRECTING A CLIENT'S DAYS — the owner's damage control.
 *
 * Every other control in the access economy adds runway from a priced package.
 * This one writes a number directly, in both directions, and it exists because
 * a defect stacked days nobody sold. So the sheet is built to make the owner
 * certain before they commit:
 *
 *   THE HISTORY IS ON THE SAME SCREEN.  Loaded from the grant ledger and shown
 *     above the field. "Why does this client have 210 days" is answerable here
 *     and was answerable nowhere before — the subscription row folds repeat
 *     purchases into itself and keeps one package name.
 *   THE FIELD IS AN ABSOLUTE, NOT A DELTA. "+30" invites arithmetic against a
 *     number the owner already believes is wrong. They type what it SHOULD be.
 *   THE REASON IS REQUIRED, and lands in the audit trail — this is the one
 *     write in the product with no price attached to explain it.
 *   ZERO IS SPELLED OUT. Taking access away is a different sentence from
 *     shortening it, so the button says which one is about to happen.
 */
function CorrectDaysSheet({ clientId, sub, onClose, onDone }: {
  clientId: string;
  sub: Sub;
  onClose: () => void;
  onDone: () => void;
}) {
  const [history, setHistory] = useState<GrantRow[] | null>(null);
  const [feature, setFeature] = useState("all");
  const [days, setDays] = useState("");
  const [reason, setReason] = useState("");
  const act = useAction();
  const open = useOneOpen<string>(null);

  useEffect(() => {
    let alive = true;
    api.get<{ grants: GrantRow[] }>(`/api/subscriptions/history?clientId=${clientId}`)
      .then((r) => { if (alive) setHistory(r.grants); })
      .catch(() => { if (alive) setHistory([]); });
    return () => { alive = false; };
  }, [clientId]);

  const n = Number(days);
  const valid = days.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= 3650 && reason.trim().length >= 3;
  const save = () =>
    act.run("set", async () => {
      await api.post(`/api/subscriptions/${sub.id}/days`, { feature, days: n, reason: reason.trim() });
      onDone();
      return n === 0 ? "Access removed." : `Set to ${n} ${n === 1 ? "day" : "days"}.`;
    }, "Couldn't change the days. Nothing was altered.");

  return (
    <Sheet
      open
      onClose={onClose}
      title="Correct access days"
      size="tall"
      footer={
        <Button size="lg" className="w-full" variant={n === 0 && days.trim() !== "" ? "destructive" : "default"} disabled={!valid || act.busy !== null} onClick={save}>
          {act.busy ? "Saving…" : days.trim() === "" ? "Enter a number" : n === 0 ? "Remove their access" : `Set to ${n} ${n === 1 ? "day" : "days"}`}
        </Button>
      }
    >
      <div className="space-y-5">
        <Callout tone="warning" icon={AlertTriangle}>
          This writes the number directly — it is not a purchase and nothing is charged.
          The client is not notified; the change is recorded against your name.
        </Callout>

        <div className="space-y-2.5">
          <Eyebrow>Right now</Eyebrow>
          <div className="flex flex-wrap gap-2">
            {Object.entries(sub.daysByFeature ?? {}).map(([f, d]) => (
              <Badge key={f} tone={d > 0 ? "neutral" : "warning"}>{f}: {d} {d === 1 ? "day" : "days"}</Badge>
            ))}
            {!sub.daysByFeature && <Badge tone="neutral">{sub.daysRemaining} days</Badge>}
          </div>
        </div>

        <div className="space-y-2.5">
          <Eyebrow>Where the days came from</Eyebrow>
          {history === null ? (
            <SkeletonList rows={2} />
          ) : history.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">Nothing recorded. Grants made before this ledger existed aren't listed — which is part of why the numbers may be wrong.</p>
          ) : (
            <div className="space-y-1.5">
              {history.map((g) => (
                <Collapsible
                  key={g.id}
                  tone="inset"
                  open={open.isOpen(g.id)}
                  onToggle={() => open.toggle(g.id)}
                  summary={
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.packageName ?? "A removed package"}</span>
                      <Badge tone="neutral">{g.source}</Badge>
                    </span>
                  }
                >
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div>{new Date(g.at).toLocaleString()}</div>
                    <div>{g.days.length === 0 ? "No days" : g.days.map((d) => `${d.days} × ${d.feature}`).join(" · ")}</div>
                  </div>
                </Collapsible>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2.5">
          <Eyebrow>Set it to</Eyebrow>
          <div className="flex items-end gap-2">
            <Select
              value={feature}
              onChange={setFeature}
              aria-label="Which access"
              options={[{ value: "all", label: "Everything" }, { value: "workout", label: "Workout only" }, { value: "meal", label: "Meal only" }]}
              className="h-11 w-40 shrink-0"
            />
            <Field
              label="Days"
              type="number"
              inputMode="numeric"
              min={0}
              max={3650}
              value={days}
              placeholder="e.g. 30"
              onChange={(e) => setDays(e.target.value.replace(/[^\d]/g, ""))}
              className="flex-1"
            />
          </div>
          <p className="px-1 text-xs text-muted-foreground">
            Whatever is there now is replaced — days already used stay in the record. Their next purchase queues on top of this.
          </p>
        </div>

        <Field
          label="Why (recorded in the audit trail)"
          value={reason}
          placeholder="e.g. granted three times by mistake"
          onChange={(e) => setReason(e.target.value)}
        />
        <ActionResult msg={act.msg} err={act.err} />
      </div>
    </Sheet>
  );
}
