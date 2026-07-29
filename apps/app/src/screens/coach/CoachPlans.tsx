/** Coach: workout + meal plans for a client — list, create, open builder.
 *  Plans are organized into lanes (schedules): "Work week" vs "Off week", etc.
 *  A client can run one published plan per lane in parallel; the lane chips here
 *  filter the list and set which lane a new plan is created in. */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Badge, Chip, Field, Sheet, Reveal, SkeletonList, SegmentedControl, Page, Stagger, EmptyState, SectionHeader, cn, AlertTriangle, Dumbbell, Utensils, Plus, Ellipsis, Trash2, Archive, History, Zap, PencilLine } from "@kova/ui";
import { api, errorText } from "../../api.js";

interface Plan { id: string; name: string; status: string; publishedAt: string | null; variantId: string | null }
interface Lane { id: string; label: string; archived: boolean }
type Kind = "workout" | "meal";

export function CoachPlans({ clientId }: { clientId: string }) {
  const nav = useNavigate();
  const [kind, setKind] = useState<Kind>("workout");
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [variants, setVariants] = useState<Lane[]>([]);
  const [defaultLabel, setDefaultLabel] = useState("Main");
  const [laneId, setLaneId] = useState<string | null>(null); // null = default lane
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [lanesOpen, setLanesOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<Plan | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const endpoint = kind === "workout" ? "workout-plans" : "meal-plans";
  const open = (planId: string) => nav(`/clients/${clientId}/plans/${kind}/${planId}`);

  // Lanes are client-level, so the workout + meal lists share the same lane set;
  // we take it from whichever list loads. Both endpoints return it.
  //
  // The Workout/Meal toggle re-creates `load`, so two reads can be in flight at
  // once — a request token drops a stale one instead of letting the slower
  // endpoint's plans land under the other tab. A failure surfaces a retry;
  // uncaught it left the list skeleton shimmering forever.
  const reqId = useRef(0);
  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoadError(false);
    try {
      const r = await api.get<{ plans: Plan[]; variants: Lane[]; defaultLabel?: string }>(`/api/${endpoint}?clientId=${clientId}`);
      if (id !== reqId.current) return;
      setPlans(r.plans);
      setVariants(r.variants ?? []);
      setDefaultLabel(r.defaultLabel || "Main");
    } catch { if (id === reqId.current) setLoadError(true); }
  }, [clientId, endpoint]);
  useEffect(() => { setPlans(null); void load(); }, [load]);

  const create = async () => {
    if (creating) return; // a double-tap used to create two identical plans
    setCreating(true); setCreateErr(null);
    try {
      const r = await api.post<{ plan: Plan }>(`/api/${endpoint}`, { clientId, name, variantId: laneId });
      setCreateOpen(false); setName(""); open(r.plan.id);
    } catch (e) { setCreateErr(errorText(e, "Couldn't create that plan. Please try again.")); }
    finally { setCreating(false); }
  };

  const liveLanes = variants.filter((v) => !v.archived);
  // If the selected lane got archived out from under us, fall back to Main.
  useEffect(() => { if (laneId && !variants.some((l) => l.id === laneId && !l.archived)) setLaneId(null); }, [laneId, variants]);
  const shown = (plans ?? []).filter((p) => (p.variantId ?? null) === laneId);
  const laneName = laneId ? liveLanes.find((l) => l.id === laneId)?.label ?? "" : defaultLabel;

  return (
    <Page className="column space-y-3 p-4 pb-28">
      <SegmentedControl options={[{ value: "workout", label: "Workout" }, { value: "meal", label: "Meal" }]} value={kind} onChange={setKind} />

      {/* Lane (schedule) chips — filter + the lane a new plan lands in. Shown
          once there's a second lane; a coach can always add one. */}
      {(liveLanes.length > 0) && (
        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 no-scrollbar">
          <Chip selected={laneId === null} onClick={() => setLaneId(null)}>{defaultLabel}</Chip>
          {liveLanes.map((l) => (
            <Chip key={l.id} selected={laneId === l.id} onClick={() => setLaneId(l.id)}>{l.label}</Chip>
          ))}
          <Chip onClick={() => setLanesOpen(true)}><PencilLine className="size-3.5" /> Edit</Chip>
        </div>
      )}

      <SectionHeader
        icon={kind === "workout" ? Dumbbell : Utensils}
        tone={kind === "workout" ? "activity" : "nutrition"}
        title={liveLanes.length > 0 ? `${laneName} · ${kind === "workout" ? "Workout" : "Meal"}` : `${kind === "workout" ? "Workout" : "Meal"} plans`}
        action={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus /> New</Button>}
      />
      {loadError && !plans ? (
        <EmptyState icon={AlertTriangle} title={`Couldn't load ${kind} plans`} description="Something went wrong reaching the server. Check your connection and try again." action={<Button onClick={() => void load()}>Try again</Button>} />
      ) : (
      <Reveal loading={!plans} skeleton={<SkeletonList card rows={5} thumb={0} />}>
        {plans && (shown.length === 0 ? (
          <EmptyState icon={kind === "workout" ? Dumbbell : Utensils} title={`No ${kind} plans${liveLanes.length > 0 ? ` in ${laneName}` : ""}`} description={liveLanes.length > 0 ? "New plans you create land in this lane." : (kind === "workout" ? "Create one and build it — or use the AI draft inside the builder." : "Create one and build the options bank.")} action={liveLanes.length === 0 ? undefined : <Button variant="secondary" size="sm" onClick={() => setLanesOpen(true)}>Manage lanes</Button>} />
        ) : (
          <Stagger className="space-y-2">
            {shown.map((p) => (
              <Card key={p.id} interactive onClick={() => open(p.id)} className="flex items-center justify-between gap-2">
                <div className="min-w-0"><div className="truncate font-semibold">{p.name}</div>{p.publishedAt && <div className="text-xs text-muted-foreground">Published {new Date(p.publishedAt).toLocaleDateString()}</div>}</div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge tone={p.status === "published" ? "success" : p.status === "draft" ? "neutral" : "warning"}>{p.status}</Badge>
                  <button onClick={(e) => { e.stopPropagation(); setMenuFor(p); }} aria-label="Plan actions" className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground [&_svg]:size-4"><Ellipsis /></button>
                </div>
              </Card>
            ))}
          </Stagger>
        ))}
      </Reveal>
      )}

      {/* A quiet "add a schedule" entry when the client has no lanes yet. */}
      {liveLanes.length === 0 && plans && (
        <button onClick={() => setLanesOpen(true)} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-sm text-muted-foreground transition-colors hover:bg-surface-2">
          <Plus className="size-4" /> Add a schedule (e.g. Off week / Night shift)
        </button>
      )}

      <Sheet open={createOpen} onClose={() => { setCreateOpen(false); setCreateErr(null); }} title={`New ${kind} plan${liveLanes.length > 0 ? ` · ${laneName}` : ""}`} footer={<Button size="lg" className="w-full" disabled={name.trim().length < 2 || creating} onClick={() => void create()}>{creating ? "Creating…" : <>Create &amp; build</>}</Button>}>
        <div className="space-y-4">
          <Field label="Plan name" icon={kind === "workout" ? Dumbbell : Utensils} value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "workout" ? "Push Pull Legs" : "Cutting Plan"} />
          {liveLanes.length > 0 && <p className="text-xs text-muted-foreground">Lands in the <span className="font-medium text-foreground">{laneName}</span> schedule.</p>}
          {createErr && <p className="text-sm text-warning" role="alert">{createErr}</p>}
        </div>
      </Sheet>

      {lanesOpen && <LaneManager clientId={clientId} variants={variants} defaultLabel={defaultLabel} onClose={() => setLanesOpen(false)} onChanged={() => void load()} />}

      {menuFor && (
        <PlanActions
          plan={menuFor}
          endpoint={endpoint}
          onClose={() => setMenuFor(null)}
          onOpen={() => { const id = menuFor.id; setMenuFor(null); open(id); }}
          onChanged={() => { setMenuFor(null); void load(); }}
        />
      )}
    </Page>
  );
}

/** Create / rename / archive a client's plan lanes (schedules). */
function LaneManager({ clientId, variants, defaultLabel, onClose, onChanged }: { clientId: string; variants: Lane[]; defaultLabel: string; onClose: () => void; onChanged: () => void }) {
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const live = variants.filter((v) => !v.archived);

  const add = async () => {
    if (adding.trim().length < 1 || busy) return;
    setBusy(true);
    try { await api.post(`/api/clients/${clientId}/variants`, { label: adding.trim() }); setAdding(""); onChanged(); }
    finally { setBusy(false); }
  };
  const patch = async (id: string, body: { label?: string; archived?: boolean }) => { await api.patch(`/api/clients/${clientId}/variants/${id}`, body); onChanged(); };
  const renameDefault = async (label: string) => { await api.patch(`/api/clients/${clientId}/default-lane`, { label }); onChanged(); };

  return (
    <Sheet open onClose={onClose} title="Schedules">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Lanes let a client run parallel plans — a "Work week" and an "Off week", or "Night shift" and "Morning shift". Each lane keeps its own published plan; the client switches between them.</p>
        <div className="space-y-2">
          {/* The default lane — renameable, but can't be archived (it always exists). */}
          <LaneRow lane={{ id: "__default", label: defaultLabel, archived: false }} isDefault onRename={(label) => void renameDefault(label)} onArchive={() => undefined} />
          {live.map((l) => (
            <LaneRow key={l.id} lane={l} onRename={(label) => void patch(l.id, { label })} onArchive={() => void patch(l.id, { archived: true })} />
          ))}
        </div>
        <div className="flex items-end gap-2">
          <Field label="Add a schedule" className="flex-1" value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Off week" onKeyDown={(e) => { if (e.key === "Enter") void add(); }} />
          <Button disabled={adding.trim().length < 1 || busy} onClick={() => void add()}><Plus /> Add</Button>
        </div>
      </div>
    </Sheet>
  );
}

function LaneRow({ lane, isDefault, onRename, onArchive }: { lane: Lane; isDefault?: boolean; onRename: (label: string) => void; onArchive: () => void }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(lane.label);
  return (
    <div className="flex items-center gap-2 rounded-xl bg-secondary/50 px-3 py-2">
      {editing ? (
        <>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className="min-w-0 flex-1 rounded-lg bg-card px-2 py-1 text-sm outline-none ring-ring focus:ring-2" autoFocus />
          <button onClick={() => { setEditing(false); if (label.trim() && label.trim() !== lane.label) onRename(label.trim()); }} className="text-sm font-medium text-primary">Save</button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{lane.label}</span>
          {isDefault && <span className="text-xs text-muted-foreground">default</span>}
          <button onClick={() => { setLabel(lane.label); setEditing(true); }} aria-label="Rename" className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground [&_svg]:size-4"><PencilLine /></button>
          {!isDefault && <button onClick={onArchive} aria-label="Archive" className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground [&_svg]:size-4"><Archive /></button>}
        </>
      )}
    </div>
  );
}

/**
 * Plan lifecycle actions, contextual to status. Only drafts delete; published
 * and superseded plans archive; an older superseded/archived plan can be made
 * active again (re-published — supersedes the current one) or rolled back to a
 * draft to edit first. No hard delete of anything that was ever published.
 */
function PlanActions({ plan, endpoint, onClose, onOpen, onChanged }: { plan: Plan; endpoint: string; onClose: () => void; onOpen: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const act = (fn: () => Promise<unknown>) => async () => { setBusy(true); try { await fn(); onChanged(); } catch { setBusy(false); } };
  const isOld = plan.status === "superseded" || plan.status === "archived";
  const status = (s: string) => api.post(`/api/${endpoint}/${plan.id}/status`, { status: s });
  return (
    <Sheet open onClose={onClose} title={plan.name}>
      <div className="space-y-1">
        <ActionRow icon={PencilLine} label="Open in builder" onClick={onOpen} />
        {isOld && <ActionRow icon={Zap} label="Make active again" hint="Re-publishes this plan and supersedes the current one in its lane" disabled={busy} onClick={act(() => api.post(`/api/${endpoint}/${plan.id}/publish`, {}))} />}
        {isOld && <ActionRow icon={History} label="Roll back to draft" hint="Make it editable again" disabled={busy} onClick={act(() => status("draft"))} />}
        {(plan.status === "published" || plan.status === "superseded") && <ActionRow icon={Archive} label="Archive" hint="Hide it without deleting" disabled={busy} onClick={act(() => status("archived"))} />}
        {plan.status === "draft" && (
          confirmDel
            ? <ActionRow icon={Trash2} label={busy ? "Deleting…" : "Tap again to delete"} danger disabled={busy} onClick={act(() => api.del(`/api/${endpoint}/${plan.id}`))} />
            : <ActionRow icon={Trash2} label="Delete draft" danger onClick={() => setConfirmDel(true)} />
        )}
      </div>
    </Sheet>
  );
}

function ActionRow({ icon: Icon, label, hint, danger, disabled, onClick }: { icon: (p: { className?: string }) => ReactNode; label: string; hint?: string; danger?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button disabled={disabled} onClick={onClick} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors disabled:opacity-50 [&_svg]:size-[1.15rem]", danger ? "text-danger hover:bg-danger-soft" : "hover:bg-surface-2")}>
      <Icon className="shrink-0" />
      <div className="min-w-0 flex-1"><div className="text-sm font-medium">{label}</div>{hint && <div className="text-xs text-muted-foreground">{hint}</div>}</div>
    </button>
  );
}
