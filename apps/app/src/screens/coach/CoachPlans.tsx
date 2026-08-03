/**
 * Coach: workout + meal plans for a client — list, create, open builder.
 *
 * Plans are organised into LANES: "Work week" vs "Off week", "Night shift" vs
 * "Morning shift". A client runs one published plan per lane in parallel, and
 * lanes belong to ONE surface — a workout lane does not put an empty tab on
 * their meals (see `plan-variants.ts`).
 *
 * ── Why this screen was rebuilt ─────────────────────────────────────────────
 *
 * It was the one tab in the client set that did not look like the others.
 * Goals, Progress and Report all open with an eyebrow naming the surface and a
 * single quiet control in its action slot; this one opened on a bare segmented
 * control, then a horizontally-scrolling row of lane chips, then a
 * `SectionHeader`, then a stack of bespoke `Card`s — four different chrome
 * devices before the first plan, and a list that was not the app's list.
 *
 * Now: one eyebrow with the lane picker in it (the same shape `RangePicker`
 * uses on Progress and Report), the surface toggle and the add button on one
 * row, and the plans as a `Group` of `Row`s.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Badge, Field, Sheet, Reveal, SkeletonList, SegmentedControl, Page, Stagger, EmptyState, Eyebrow, Group, Row, GroupNote, ConfirmDialog, ArrowLeftRight, AlertTriangle, Dumbbell, Utensils, Plus, Check, Ellipsis, Trash2, Archive, History, Zap, PencilLine } from "@4dl/ui";
import { api, errorText } from "../../api.js";

interface Plan {
  id: string; name: string; status: string; publishedAt: string | null; variantId: string | null;
  /** Already on the wire — `planView` returns the parsed body for every plan in
   *  the list. The row was rendering a publish DATE while the shape of the plan
   *  sat unread in the same response. */
  body?: { days?: { isRestDay?: boolean }[]; mealOptions?: unknown[] } | null;
}

/** `{p.status}` printed the column verbatim, so a success badge read "published"
 *  in lower case beside sentence-cased ones, and the DB's "superseded" reached a
 *  coach untranslated. Statuses are a closed set (§10). */
const PLAN_STATUS: Record<string, string> = {
  published: "Live", draft: "Draft", superseded: "Replaced", archived: "Archived",
};

/** What a coach scans a plan list for: how big it is, and how current. An
 *  absolute publish date answers neither — it is a record's fact on a scanning
 *  surface (§7). */
function planSummary(p: Plan): string | null {
  const bits: string[] = [];
  const days = p.body?.days?.filter((d) => !d?.isRestDay).length;
  const opts = p.body?.mealOptions?.length;
  if (days) bits.push(`${days} training day${days === 1 ? "" : "s"}`);
  else if (opts) bits.push(`${opts} option${opts === 1 ? "" : "s"}`);
  if (p.publishedAt) {
    const d = Math.floor((Date.now() - Date.parse(p.publishedAt)) / 86_400_000);
    bits.push(d <= 0 ? "live today" : d === 1 ? "live since yesterday" : d < 30 ? `live ${d} days` : `live since ${new Date(p.publishedAt).toLocaleDateString()}`);
  }
  return bits.length ? bits.join(" · ") : null;
}
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
      {/* The lane rides in the header's action slot — the same slot Progress and
          Report hang their range picker off. It replaces a scrolling chip row
          that was permanently on screen to answer a question most clients never
          ask, and it scales past three lanes without scrolling. */}
      <Eyebrow action={
        <Button size="sm" variant="secondary" onClick={() => setLanesOpen(true)}>
          <ArrowLeftRight aria-hidden /> {liveLanes.length > 0 ? laneName : "Lanes"}
        </Button>
      }>Plans</Eyebrow>

      {/* Surface + the one primary action, on one row — the roster's shape. */}
      <div className="flex items-center gap-2">
        <SegmentedControl
          fill
          className="min-w-0 flex-1"
          options={[{ value: "workout", label: "Workout" }, { value: "meal", label: "Meal" }]}
          value={kind}
          onChange={setKind}
        />
        <Button size="icon" variant="tonal" className="shrink-0" aria-label={`New ${kind} plan`} onClick={() => setCreateOpen(true)}><Plus /></Button>
      </div>

      {loadError && !plans ? (
        <EmptyState icon={AlertTriangle} title={`Couldn't load ${kind} plans`} description="Something went wrong reaching the server. Check your connection and try again." action={<Button onClick={() => void load()}>Try again</Button>} />
      ) : (
      <Reveal loading={!plans} skeleton={<SkeletonList card rows={5} thumb={0} />}>
        {plans && (shown.length === 0 ? (
          <EmptyState
            icon={kind === "workout" ? Dumbbell : Utensils}
            title={`No ${kind} plans${liveLanes.length > 0 ? ` in ${laneName}` : ""}`}
            description={liveLanes.length > 0
              ? "New plans land in this lane. Switch lanes from the header."
              : (kind === "workout" ? "Create one and build it — or use the AI draft inside the builder." : "Create one and build the options bank.")}
            action={<Button onClick={() => setCreateOpen(true)}><Plus /> New plan</Button>}
          />
        ) : (
          <Stagger>
            <Group>
              {shown.map((p) => (
                <Row
                  key={p.id}
                  icon={kind === "workout" ? Dumbbell : Utensils}
                  iconTone={kind === "workout" ? "activity" : "nutrition"}
                  onClick={() => open(p.id)}
                  sub={planSummary(p) ?? undefined}
                  trailing={
                    <span className="flex shrink-0 items-center gap-1">
                      <Badge tone={p.status === "published" ? "success" : p.status === "draft" ? "neutral" : "warning"}>{PLAN_STATUS[p.status] ?? p.status}</Badge>
                      <Button size="icon" variant="ghost" className="text-muted-foreground" aria-label={`Actions for ${p.name}`} onClick={(e) => { e.stopPropagation(); setMenuFor(p); }}><Ellipsis /></Button>
                    </span>
                  }
                >
                  {p.name}
                </Row>
              ))}
            </Group>
            {liveLanes.length === 0 && (
              <GroupNote>Two parallel plans — an off week, night shifts? Add a lane from the header.</GroupNote>
            )}
          </Stagger>
        ))}
      </Reveal>
      )}

      <Sheet open={createOpen} onClose={() => { setCreateOpen(false); setCreateErr(null); }} title={`New ${kind} plan${liveLanes.length > 0 ? ` · ${laneName}` : ""}`} footer={<Button size="lg" className="w-full" disabled={name.trim().length < 2 || creating} onClick={() => void create()}>{creating ? "Creating…" : <>Create &amp; build</>}</Button>}>
        <div className="space-y-4">
          <Field label="Plan name" icon={kind === "workout" ? Dumbbell : Utensils} value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "workout" ? "Push Pull Legs" : "Cutting Plan"} />
          {liveLanes.length > 0 && <p className="text-caption text-muted-foreground">Lands in the <span className="font-medium text-foreground">{laneName}</span> lane.</p>}
          {createErr && <p className="text-sm text-warning" role="alert">{createErr}</p>}
        </div>
      </Sheet>

      {lanesOpen && (
        <LaneManager
          clientId={clientId}
          kind={kind}
          variants={variants}
          defaultLabel={defaultLabel}
          selected={laneId}
          onSelect={(id) => { setLaneId(id); setLanesOpen(false); }}
          onClose={() => setLanesOpen(false)}
          onChanged={() => void load()}
        />
      )}

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

/**
 * The lane sheet — PICK one, and manage the set from the same place.
 *
 * It used to be management only, reached from a pencil chip at the end of a
 * scrolling chip row, so choosing a lane and editing one were two different
 * controls in two different places. They are the same question ("which lane?")
 * asked twice, so they are one sheet: tap a lane to work in it, or rename and
 * archive it in place.
 */
function LaneManager({ clientId, kind, variants, defaultLabel, selected, onSelect, onClose, onChanged }: {
  clientId: string;
  kind: Kind;
  variants: Lane[];
  defaultLabel: string;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [toArchive, setToArchive] = useState<Lane | null>(null);
  const live = variants.filter((v) => !v.archived);

  const add = async () => {
    if (adding.trim().length < 1 || busy) return;
    setBusy(true);
    try { await api.post(`/api/clients/${clientId}/variants`, { label: adding.trim(), kind }); setAdding(""); onChanged(); }
    finally { setBusy(false); }
  };
  const patch = async (id: string, body: { label?: string; archived?: boolean }) => { await api.patch(`/api/clients/${clientId}/variants/${id}`, body); onChanged(); };
  const renameDefault = async (l: string) => { await api.patch(`/api/clients/${clientId}/default-lane`, { label: l }); onChanged(); };
  const startEdit = (id: string, current: string) => { setLabel(current); setEditing(id); };
  const commitEdit = (id: string, current: string) => {
    setEditing(null);
    const next = label.trim();
    if (!next || next === current) return;
    void (id === "__default" ? renameDefault(next) : patch(id, { label: next }));
  };

  const laneRow = (id: string | null, name: string, isDefault: boolean) => {
    const key = id ?? "__default";
    if (editing === key) {
      return (
        <div key={key} className="flex items-center gap-2 px-4 py-2.5">
          <Field
            label="Lane name"
            labelHidden
            className="min-w-0 flex-1"
            value={label}
            autoFocus
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commitEdit(key, name); if (e.key === "Escape") setEditing(null); }}
          />
          <Button size="sm" onClick={() => commitEdit(key, name)}>Save</Button>
        </div>
      );
    }
    return (
      <Row
        key={key}
        icon={kind === "workout" ? Dumbbell : Utensils}
        iconTone={id === selected ? (kind === "workout" ? "activity" : "nutrition") : undefined}
        sub={isDefault ? "The lane every plan starts in" : undefined}
        onClick={() => onSelect(id)}
        chevron={false}
        trailing={
          <span className="flex shrink-0 items-center gap-0.5">
            {id === selected && <Check aria-label="Working in this lane" className="mr-1 size-4 text-primary" />}
            <Button size="icon" variant="ghost" className="text-muted-foreground" aria-label={`Rename ${name}`} onClick={(e) => { e.stopPropagation(); startEdit(key, name); }}><PencilLine /></Button>
            {!isDefault && (
              <Button size="icon" variant="ghost" className="text-muted-foreground" aria-label={`Archive ${name}`} onClick={(e) => { e.stopPropagation(); setToArchive({ id: id!, label: name, archived: false }); }}><Archive /></Button>
            )}
          </span>
        }
      >
        {name}
      </Row>
    );
  };

  return (
    <Sheet open onClose={onClose} title={kind === "workout" ? "Workout lanes" : "Meal lanes"} size="tall">
      <div className="space-y-4">
        <Group>
          {laneRow(null, defaultLabel, true)}
          {live.map((l) => laneRow(l.id, l.label, false))}
        </Group>
        <GroupNote>
          A lane is a parallel version of the plan — a work week and an off week, night shifts and mornings.
          Each keeps its own published plan and the client switches between them.
          {" "}These lanes are {kind === "workout" ? "for training only; meals have their own." : "for meals only; training has its own."}
        </GroupNote>

        <div className="flex items-end gap-2">
          <Field label="Add a lane" className="flex-1" value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Off week" onKeyDown={(e) => { if (e.key === "Enter") void add(); }} />
          <Button disabled={adding.trim().length < 1 || busy} onClick={() => void add()}><Plus /> Add</Button>
        </div>
      </div>

      <ConfirmDialog
        open={toArchive != null}
        onOpenChange={(o) => { if (!o) setToArchive(null); }}
        title={`Archive ${toArchive?.label ?? "this lane"}?`}
        description="Its plans are kept and stop running. A client on this lane goes back to the default one."
        confirmLabel="Archive"
        onConfirm={() => { const l = toArchive; setToArchive(null); if (l) void patch(l.id, { archived: true }); }}
      />
    </Sheet>
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
  const status = (sv: string) => api.post(`/api/${endpoint}/${plan.id}/status`, { status: sv });
  return (
    <Sheet open onClose={onClose} title={plan.name}>
      {/* The app's rows, not a local button list — same menu grammar as every
          other sheet that offers a set of actions (§7). */}
      <Group>
        <Row icon={PencilLine} iconTone="primary" onClick={onOpen} chevron={false}>Open in builder</Row>
        {isOld && <Row icon={Zap} iconTone="success" sub="Re-publishes it and supersedes the current one in its lane" disabled={busy} onClick={act(() => api.post(`/api/${endpoint}/${plan.id}/publish`, {}))} chevron={false}>Make active again</Row>}
        {isOld && <Row icon={History} sub="Make it editable again" disabled={busy} onClick={act(() => status("draft"))} chevron={false}>Roll back to draft</Row>}
        {(plan.status === "published" || plan.status === "superseded") && <Row icon={Archive} sub="Hide it without deleting" disabled={busy} onClick={act(() => status("archived"))} chevron={false}>Archive</Row>}
        {plan.status === "draft" && <Row icon={Trash2} tone="danger" disabled={busy} onClick={() => setConfirmDel(true)} chevron={false}>Delete draft</Row>}
      </Group>

      <ConfirmDialog
        open={confirmDel}
        onOpenChange={(o) => { if (!o) setConfirmDel(false); }}
        title={`Delete ${plan.name}?`}
        description="It was never published, so nothing the client has seen is affected. This cannot be undone."
        confirmLabel={busy ? "Deleting…" : "Delete"}
        destructive
        onConfirm={act(() => api.del(`/api/${endpoint}/${plan.id}`))}
      />
    </Sheet>
  );
}
