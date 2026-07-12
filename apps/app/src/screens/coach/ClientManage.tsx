/**
 * Coach client management — access grants, swap approvals, check-in review with
 * AI summarizer, supplement prescriptions, lab requests + value entry, and a
 * per-client report.
 */

import { useCallback, useEffect, useState } from "react";
import { fmtWeight, kgToDisplay, weightLabel } from "@mossa/domain";
import { Button, Card, Badge, Field, Textarea, Sheet, Skeleton, SubCard, Chip, Page, Stagger, IconBadge, EmptyState, PhotoGrid, Ticket, ArrowLeftRight, FlaskConical, Pill, ClipboardList, BarChart3, Sparkles, Plus, Check, X, ImageIcon } from "@mossa/ui";
import { api } from "../../api.js";
import { useUnits } from "../../units.js";
import { ExerciseThumb, ExerciseMeta, type ExerciseInfo } from "../exercise.js";
import { checkInPhotos } from "../client/WellnessDetails.js";
import { AiAvatar } from "../../AiAvatar.js";
import { AiErrorBox } from "../../AiError.js";

interface Sub { id: string; status: string; daysRemaining: number; packageId: string | null }
interface Pkg { id: string; name: string }
interface Swap { id: string; reason: string | null; status: string; day_index: number | null; current_exercise_id: string | null; suggested_exercise_id: string | null }
interface Lab { id: string; display_name: string; status: string; client_notes?: string | null; file_key?: string | null; values?: { marker: string; value: string; unit?: string; flag?: string }[] | null; trainer_feedback?: string | null }
interface Supp { id: string; name: string; dose: string | null; kind: string; status: string; schedule?: { slot: string }[] }
interface CheckIn { id: string; date_local: string; mood: number | null; energy: number | null; stress: number | null; sleep_hours: number | null; weight_kg: number | null; steps_count: number | null; notes: string | null; photos_json: string | null; trainer_feedback: string | null }

export function ClientManage({ clientId }: { clientId: string }) {
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [supps, setSupps] = useState<Supp[]>([]);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [grantOpen, setGrantOpen] = useState(false);
  const [suppOpen, setSuppOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [labOpen, setLabOpen] = useState(false);
  const [reviewLab, setReviewLab] = useState<Lab | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [exercises, setExercises] = useState<ExerciseInfo[]>([]);

  const load = useCallback(async () => {
    const [s, p, sw, l, su, ci, ex] = await Promise.all([
      api.get<{ subscriptions: Sub[] }>(`/api/subscriptions?clientId=${clientId}`),
      api.get<{ packages: Pkg[] }>("/api/packages"),
      api.get<{ swaps: Swap[] }>(`/api/swaps?clientId=${clientId}`),
      api.get<{ labs: Lab[] }>(`/api/labs?clientId=${clientId}`),
      api.get<{ supplements: Supp[] }>(`/api/supplements?clientId=${clientId}`),
      api.get<{ checkIns: CheckIn[] }>(`/api/check-ins?clientId=${clientId}`),
      api.get<{ exercises: ExerciseInfo[] }>("/api/exercises"),
    ]);
    setSubs(s.subscriptions); setPackages(p.packages); setSwaps(sw.swaps); setLabs(l.labs); setSupps(su.supplements); setCheckIns(ci.checkIns); setExercises(ex.exercises);
  }, [clientId]);
  useEffect(() => void load(), [load]);

  const grant = async (packageId: string) => { await api.post("/api/subscriptions/grant", { clientId, packageId }); setGrantOpen(false); await load(); };
  const resolveSwap = async (id: string, status: "approved" | "rejected", replacementExerciseId?: string) => { await api.patch(`/api/swaps/${id}`, { status, replacementExerciseId }); await load(); };
  const discontinueSupp = async (id: string) => { await api.patch(`/api/supplements/${id}`, { status: "discontinued" }); await load(); };
  const setSuppStatus = async (id: string, status: "active" | "paused") => { await api.patch(`/api/supplements/${id}`, { status }); await load(); };

  if (!subs) return <Skeleton className="m-4 h-64" />;
  const active = subs.find((s) => s.status === "active");
  const pending = swaps.filter((s) => s.status === "pending");

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <Stagger>
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5"><IconBadge icon={Ticket} tone="primary" size="sm" /><h2 className="font-semibold">Access</h2></div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setReportOpen(true)}><BarChart3 /> Report</Button>
              <Button size="sm" onClick={() => setGrantOpen(true)}><Plus /> Grant</Button>
            </div>
          </div>
          {active ? <div className="mt-3 flex items-center justify-between"><span className="text-sm text-muted-foreground">Active subscription</span><Badge tone="success">{active.daysRemaining} days left</Badge></div> : <p className="mt-2 text-sm text-muted-foreground">No active subscription. Grant a package (or a $0 comp) to unlock features.</p>}
        </Card>
      </Stagger>

      {pending.length > 0 && (
        <Stagger>
          <Card className="space-y-3">
            <div className="flex items-center gap-2.5"><IconBadge icon={ArrowLeftRight} tone="cardio" size="sm" /><h2 className="font-semibold">Swap requests</h2><Badge tone="cardio">{pending.length}</Badge></div>
            {pending.map((s) => <SwapResolver key={s.id} swap={s} exercises={exercises} onResolve={resolveSwap} />)}
          </Card>
        </Stagger>
      )}

      <Stagger>
        <CheckInReview clientId={clientId} checkIns={checkIns} onFeedback={load} />
      </Stagger>

      <Stagger>
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5"><IconBadge icon={Pill} tone="activity" size="sm" /><h2 className="font-semibold">Supplements</h2></div>
            <div className="flex gap-2">
              <Button size="sm" variant="tonal" onClick={() => setSuggestOpen(true)}><Sparkles /> Suggest</Button>
              <Button size="sm" variant="secondary" onClick={() => setSuppOpen(true)}><Plus /> Prescribe</Button>
            </div>
          </div>
          {supps.length === 0 ? <p className="text-sm text-muted-foreground">No supplements prescribed.</p> : supps.map((s) => (
            <SubCard key={s.id} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="truncate font-medium">{s.name}</span>{s.status === "paused" && <Badge tone="warning">Paused</Badge>}</div>
                  {s.dose && <span className="text-xs text-muted-foreground">{s.dose}</span>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => void setSuppStatus(s.id, s.status === "paused" ? "active" : "paused")} className="rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground">{s.status === "paused" ? "Resume" : "Pause"}</button>
                  <button onClick={() => void discontinueSupp(s.id)} className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:text-danger [&_svg]:size-4"><X /></button>
                </div>
              </div>
              {s.schedule && s.schedule.length > 0 && <div className="flex flex-wrap gap-1.5">{s.schedule.map((sc, i) => <span key={i} className="rounded-full bg-surface-3 px-2 py-0.5 text-[0.65rem] font-medium capitalize text-muted-foreground">{sc.slot.replace(/_/g, " ")}</span>)}</div>}
            </SubCard>
          ))}
        </Card>
      </Stagger>

      <Stagger>
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5"><IconBadge icon={FlaskConical} tone="sleep" size="sm" /><h2 className="font-semibold">Lab tests</h2></div>
            <Button size="sm" variant="secondary" onClick={() => setLabOpen(true)}><Plus /> Request</Button>
          </div>
          {labs.length === 0 ? <p className="text-sm text-muted-foreground">No lab tests.</p> : labs.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">{l.display_name}</span>
              {l.status === "uploaded" || l.status === "reviewed" ? <Button size="sm" variant={l.status === "reviewed" ? "ghost" : "default"} onClick={() => setReviewLab(l)}>{l.status === "reviewed" ? "View" : "Review"}</Button> : <Badge tone="warning">{l.status}</Badge>}
            </div>
          ))}
        </Card>
      </Stagger>

      <Sheet open={grantOpen} onClose={() => setGrantOpen(false)} title="Grant a package">
        <div className="space-y-2">
          {packages.length === 0 && <p className="text-sm text-muted-foreground">No packages yet — create one in the Business tab.</p>}
          {packages.map((p) => <button key={p.id} onClick={() => void grant(p.id)} className="flex w-full items-center justify-between rounded-xl bg-secondary px-4 py-3 text-left transition-colors hover:bg-surface-3"><span>{p.name}</span><span className="text-primary">Grant</span></button>)}
        </div>
      </Sheet>

      {suppOpen && <PrescribeSheet clientId={clientId} onClose={() => setSuppOpen(false)} onDone={() => { setSuppOpen(false); void load(); }} />}
      {suggestOpen && <SuggestSuppSheet clientId={clientId} onClose={() => setSuggestOpen(false)} onPrescribed={load} />}
      {labOpen && <RequestLabSheet clientId={clientId} onClose={() => setLabOpen(false)} onDone={() => { setLabOpen(false); void load(); }} />}
      {reviewLab && <ReviewLabSheet clientId={clientId} lab={reviewLab} onClose={() => setReviewLab(null)} onDone={() => { setReviewLab(null); void load(); }} />}
      {reportOpen && <ReportSheet clientId={clientId} onClose={() => setReportOpen(false)} />}
    </Page>
  );
}

/** Resolve one swap: shows which exercise + day, and picks the replacement. */
function SwapResolver({ swap, exercises, onResolve }: { swap: Swap; exercises: ExerciseInfo[]; onResolve: (id: string, status: "approved" | "rejected", replacementExerciseId?: string) => Promise<void> }) {
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const current = swap.current_exercise_id ? exMap.get(swap.current_exercise_id) : undefined;
  const [choice, setChoice] = useState<ExerciseInfo | null>(swap.suggested_exercise_id ? exMap.get(swap.suggested_exercise_id) ?? null : null);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const filtered = exercises.filter((e) => e.id !== swap.current_exercise_id && e.name.toLowerCase().includes(q.toLowerCase())).slice(0, 20);
  return (
    <div className="space-y-2.5 rounded-xl bg-surface-2 p-3">
      <div className="text-sm">Swap <span className="font-semibold">{current?.name ?? "an exercise"}</span>{typeof swap.day_index === "number" ? <span className="text-muted-foreground"> · Day {swap.day_index + 1}</span> : null}</div>
      {swap.reason && <div className="text-xs italic text-muted-foreground">“{swap.reason}”</div>}
      {choice ? (
        <SubCard className="flex items-center gap-2.5 py-2">
          <ExerciseThumb thumb={choice.thumb_url} size={34} />
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">→ {choice.name}</div><ExerciseMeta ex={choice} className="text-xs text-muted-foreground" /></div>
          <button onClick={() => { setChoice(null); setPicking(true); }} className="shrink-0 text-xs font-medium text-primary">Change</button>
        </SubCard>
      ) : picking ? (
        <div className="space-y-1">
          <Field label="Replacement" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {filtered.map((e) => (
              <button key={e.id} onClick={() => { setChoice(e); setPicking(false); setQ(""); }} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-surface-3">
                <ExerciseThumb thumb={e.thumb_url} size={32} />
                <div className="min-w-0 flex-1 truncate text-sm">{e.name}</div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <Button size="sm" variant="secondary" className="w-full" onClick={() => setPicking(true)}>Choose replacement</Button>
      )}
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" disabled={!choice} onClick={() => void onResolve(swap.id, "approved", choice?.id)}><Check /> Approve</Button>
        <Button size="sm" variant="outline" className="flex-1" onClick={() => void onResolve(swap.id, "rejected")}><X /> Reject</Button>
      </div>
    </div>
  );
}

function CheckInReview({ clientId, checkIns, onFeedback }: { clientId: string; checkIns: CheckIn[]; onFeedback: () => Promise<void> }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const units = useUnits();
  const summarize = async () => {
    setBusy(true); setErr(null); setSummary(null);
    try {
      const r = await api.post<{ summary: string; suggestedReply: string }>("/api/ai/summarize-checkins", { clientId });
      setSummary(r.summary);
      if (checkIns[0]) setDraft((d) => ({ ...d, [checkIns[0]!.id]: r.suggestedReply }));
    } catch (e) { setErr(e); }
    finally { setBusy(false); }
  };
  const send = async (id: string) => { const fb = draft[id]?.trim(); if (!fb) return; await api.post(`/api/check-ins/${id}/feedback`, { clientId, feedback: fb }); setDraft((d) => ({ ...d, [id]: "" })); await onFeedback(); };
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5"><IconBadge icon={ClipboardList} tone="nutrition" size="sm" /><h2 className="font-semibold">Check-ins</h2></div>
        <Button size="sm" variant="tonal" disabled={busy || checkIns.length === 0} onClick={() => void summarize()}><Sparkles /> {busy ? "…" : "Summarize"}</Button>
      </div>
      {err ? <AiErrorBox error={err} /> : null}
      {summary && <SubCard className="flex items-start gap-2.5 text-sm"><AiAvatar className="size-7" /><p>{summary}</p></SubCard>}
      {checkIns.length === 0 ? <p className="text-sm text-muted-foreground">No check-ins yet.</p> : checkIns.slice(0, 5).map((c) => {
        const photos = checkInPhotos(c.photos_json);
        const meta = [c.mood != null ? `mood ${c.mood}/5` : null, c.energy != null ? `energy ${c.energy}/5` : null, c.sleep_hours ? `${c.sleep_hours}h sleep` : null, c.steps_count ? `${c.steps_count.toLocaleString()} steps` : null].filter(Boolean).join(" · ");
        return (
          <SubCard key={c.id} className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{new Date(c.date_local).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</span>
              {c.weight_kg && <span className="numeral text-xs font-medium text-muted-foreground">{fmtWeight(c.weight_kg, units)}</span>}
            </div>
            {meta && <div className="text-xs text-muted-foreground">{meta}</div>}
            {photos.length > 0 && <PhotoGrid photos={photos} cols={4} />}
            {c.notes && <p className="text-sm text-muted-foreground">“{c.notes}”</p>}
            {c.trainer_feedback ? <div className="flex items-start gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary"><Check className="mt-0.5 size-3.5 shrink-0" /><span>You replied: {c.trainer_feedback}</span></div> : (
              <div className="flex items-center gap-2">
                <input value={draft[c.id] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [c.id]: e.target.value }))} placeholder="Reply…" className="flex-1 rounded-lg bg-surface-3 px-3 py-2 text-sm outline-none" />
                <Button size="sm" disabled={!draft[c.id]?.trim()} onClick={() => void send(c.id)}>Send</Button>
              </div>
            )}
          </SubCard>
        );
      })}
    </Card>
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
    <Sheet open onClose={onClose} title="Prescribe supplement">
      <div className="space-y-4">
        <Field label="Name" icon={Pill} value={name} onChange={(e) => setName(e.target.value)} placeholder="Creatine monohydrate" />
        <Field label="Dose" value={dose} onChange={(e) => setDose(e.target.value)} placeholder="5 g" />
        <div className="flex flex-wrap gap-2">{["protein", "creatine", "vitamin", "omega3", "pre_workout", "other"].map((k) => <Chip key={k} selected={kind === k} onClick={() => setKind(k)}>{k.replace("_", " ")}</Chip>)}</div>
        <div><label className="mb-1.5 block text-sm font-medium text-muted-foreground">Schedule</label><div className="flex flex-wrap gap-2">{["morning", "pre_workout", "post_workout", "evening", "bedtime"].map((s) => <Chip key={s} selected={slots.includes(s)} onClick={() => toggle(s)}>{s.replace("_", " ")}</Chip>)}</div></div>
        <Button size="lg" className="w-full" disabled={busy || name.trim().length < 2} onClick={() => void save()}>{busy ? "Saving…" : "Prescribe"}</Button>
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
  useEffect(() => {
    void api.post<{ recommendations: SuppReco[]; note: string }>("/api/ai/supplement-reco", { clientId })
      .then((r) => { setRecos(r.recommendations); setNote(r.note); })
      .catch((e) => setError(e));
  }, [clientId]);
  const prescribe = async (r: SuppReco) => {
    await api.post("/api/supplements", { clientId, name: r.name, dose: r.dose || undefined, kind: "other", schedule: [{ slot: "daily" }] });
    setAdded((a) => new Set(a).add(r.name));
    await onPrescribed();
  };
  return (
    <Sheet open onClose={onClose} title="Suggested supplements">
      <div className="space-y-3">
        <div className="flex items-center gap-2.5 rounded-xl bg-primary/10 p-2.5"><AiAvatar className="size-8" /><p className="text-xs text-muted-foreground">Evidence-based ideas from this client's reviewed labs, goal and current stack. Review before prescribing.</p></div>
        {error ? <AiErrorBox error={error} /> : !recos ? <Skeleton className="h-40" /> : recos.length === 0 ? <p className="text-sm text-muted-foreground">No suggestions right now.</p> : recos.map((r, i) => (
          <SubCard key={i} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0"><span className="font-medium">{r.name}</span>{r.dose && <span className="ml-2 text-xs text-muted-foreground">{r.dose}</span>}</div>
              {added.has(r.name) ? <Badge tone="success">Added</Badge> : <Button size="sm" onClick={() => void prescribe(r)}>Prescribe</Button>}
            </div>
            <p className="text-xs text-muted-foreground">{r.rationale}</p>
            {r.linkedMarker && <Badge tone="cardio">{r.linkedMarker}</Badge>}
          </SubCard>
        ))}
        {note && <SubCard className="flex items-start gap-2 text-xs text-muted-foreground"><Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" /><span>{note}</span></SubCard>}
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
    <Sheet open onClose={onClose} title="Request a lab test">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">{LAB_TYPES.map((t) => <Chip key={t} selected={type === t} onClick={() => setType(t)}>{t.replace("_", " ")}</Chip>)}</div>
        {type === "custom" && <Field label="Custom name" value={customType} onChange={(e) => setCustomType(e.target.value)} />}
        <div><label className="mb-1.5 block text-sm font-medium text-muted-foreground">Instructions</label><Textarea rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Fasted, morning draw…" /></div>
        <Button size="lg" className="w-full" disabled={busy || (type === "custom" && customType.trim().length < 2)} onClick={() => void save()}>{busy ? "Requesting…" : "Request test"}</Button>
      </div>
    </Sheet>
  );
}

interface LabValue { marker: string; value: string; unit: string; flag: "low" | "normal" | "high" }
const isLabImage = (key: string) => /\.(png|jpe?g|webp|gif|heic)$/i.test(key);
function ReviewLabSheet({ clientId, lab, onClose, onDone }: { clientId: string; lab: Lab; onClose: () => void; onDone: () => void }) {
  const [values, setValues] = useState<LabValue[]>(() => (lab.values && lab.values.length ? lab.values.map((v) => ({ marker: v.marker, value: v.value, unit: v.unit ?? "", flag: (v.flag as LabValue["flag"]) ?? "normal" })) : [{ marker: "", value: "", unit: "", flag: "normal" }]));
  const [feedback, setFeedback] = useState(lab.trainer_feedback ?? "");
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractErr, setExtractErr] = useState<unknown>(null);
  const fileUrl = lab.file_key ? `/api/media/${lab.file_key}` : null;
  const autofill = async () => {
    setExtracting(true); setExtractErr(null);
    try {
      const r = await api.post<{ values: { marker: string; value: string; unit?: string; flag?: string }[] }>("/api/ai/lab-extract", { clientId, labId: lab.id });
      if (r.values?.length) setValues(r.values.map((v) => ({ marker: v.marker, value: String(v.value), unit: v.unit ?? "", flag: (v.flag as LabValue["flag"]) ?? "normal" })));
    } catch (e) { setExtractErr(e); }
    finally { setExtracting(false); }
  };
  const setRow = (i: number, p: Partial<LabValue>) => setValues((v) => v.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  const save = async () => {
    setBusy(true);
    try {
      const clean = values.filter((v) => v.marker.trim() && v.value.trim());
      await api.patch(`/api/labs/${lab.id}`, { status: "reviewed", values: clean.length ? clean : undefined, trainerFeedback: feedback || undefined });
      onDone();
    } finally { setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title={`Review — ${lab.display_name}`}>
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
        {fileUrl && <Button size="sm" variant="tonal" className="w-full" disabled={extracting} onClick={() => void autofill()}><Sparkles /> {extracting ? "Reading report…" : "Auto-fill from report"}</Button>}
        {extractErr ? <AiErrorBox error={extractErr} /> : null}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-muted-foreground">Values</label>
          {values.map((v, i) => (
            <div key={i} className="flex items-center gap-1.5 text-sm">
              <input value={v.marker} onChange={(e) => setRow(i, { marker: e.target.value })} placeholder="Marker" className="min-w-0 flex-1 rounded-lg bg-surface-3 px-2.5 py-1.5 outline-none" />
              <input value={v.value} onChange={(e) => setRow(i, { value: e.target.value })} placeholder="Value" className="w-16 rounded-lg bg-surface-3 px-2 py-1.5 outline-none" />
              <input value={v.unit} onChange={(e) => setRow(i, { unit: e.target.value })} placeholder="unit" className="w-14 rounded-lg bg-surface-3 px-2 py-1.5 outline-none" />
              <select value={v.flag} onChange={(e) => setRow(i, { flag: e.target.value as LabValue["flag"] })} className="rounded-lg bg-surface-3 px-1.5 py-1.5 outline-none"><option value="low">low</option><option value="normal">ok</option><option value="high">high</option></select>
            </div>
          ))}
          <button onClick={() => setValues((v) => [...v, { marker: "", value: "", unit: "", flag: "normal" }])} className="text-xs font-medium text-primary">+ Row</button>
        </div>
        <div><label className="mb-1.5 block text-sm font-medium text-muted-foreground">Feedback</label><Textarea rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What this means and next steps…" /></div>
        <Button size="lg" className="w-full" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Mark reviewed"}</Button>
      </div>
    </Sheet>
  );
}

interface Report {
  compliance: { checkInDays: number; foodDays: number; workoutDays: number; checkInConsistencyPct: number; currentStreak: number; calorieAdherencePct: number | null };
  averages: { mood: number | null; sleepHours: number | null };
  weightSeries: { date: string; kg: number }[];
  totalTonnage: number;
  prs: { exerciseId: string; e1rm: number; weight: number; reps: number }[];
}
function ReportSheet({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");
  const [report, setReport] = useState<Report | null>(null);
  const [exNames, setExNames] = useState<Map<string, string>>(new Map());
  const units = useUnits();
  useEffect(() => { setReport(null); const today = new Date().toISOString().slice(0, 10); void api.get<Report>(`/api/reports/client/${clientId}?range=${range}&today=${today}`).then(setReport); }, [clientId, range]);
  useEffect(() => { void api.get<{ exercises: { id: string; name: string }[] }>("/api/exercises").then((r) => setExNames(new Map(r.exercises.map((e) => [e.id, e.name])))).catch(() => undefined); }, []);
  const weight = report?.weightSeries ?? [];
  const wDelta = weight.length >= 2 ? Math.round((kgToDisplay(weight.at(-1)!.kg, units) - kgToDisplay(weight[0]!.kg, units)) * 10) / 10 : null;
  return (
    <Sheet open onClose={onClose} title="Client report">
      <div className="mb-3 flex gap-2">{(["7d", "30d", "90d"] as const).map((r) => <Chip key={r} selected={range === r} onClick={() => setRange(r)}>{r}</Chip>)}</div>
      {!report ? <Skeleton className="h-64" /> : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Metric label="Check-ins" value={report.compliance.checkInDays} />
            <Metric label="Workouts" value={report.compliance.workoutDays} />
            <Metric label="Streak" value={report.compliance.currentStreak} />
            <Metric label="Consistency" value={`${report.compliance.checkInConsistencyPct}%`} />
            <Metric label="Cal adherence" value={report.compliance.calorieAdherencePct != null ? `${report.compliance.calorieAdherencePct}%` : "—"} />
            <Metric label="Weight Δ" value={wDelta != null ? `${wDelta > 0 ? "+" : ""}${wDelta} ${weightLabel(units)}` : "—"} />
            <Metric label="Avg mood" value={report.averages.mood ?? "—"} />
            <Metric label="Avg sleep" value={report.averages.sleepHours != null ? `${report.averages.sleepHours}h` : "—"} />
            <Metric label="Tonnage" value={`${Math.round(report.totalTonnage / 1000)}t`} />
          </div>
          {report.prs.length > 0 && (
            <Card className="space-y-1.5">
              <h3 className="text-sm font-semibold">Top lifts (est. 1RM)</h3>
              {report.prs.slice(0, 8).map((p) => <div key={p.exerciseId} className="flex items-center justify-between text-sm"><span className="truncate text-muted-foreground">{exNames.get(p.exerciseId) ?? "Exercise"}</span><span className="numeral font-medium">{Math.round(kgToDisplay(p.e1rm, units))} {weightLabel(units)}</span></div>)}
            </Card>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl bg-secondary p-3"><div className="numeral text-lg font-semibold">{value}</div><div className="text-[0.65rem] text-muted-foreground">{label}</div></div>;
}
