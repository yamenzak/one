/** Coach Library — exercises (create + web import), foods, templates, content. */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Card, Badge, Field, Textarea, Sheet, Skeleton, SegmentedControl, Chip, Page, Stagger, EmptyState, cn, Reveal, SkeletonRow, SkeletonLine, MacroInline, Avatar, Search, Plus, Trash2, Archive, AlertTriangle, Dumbbell, Utensils, LayoutGrid, List, PencilLine, ArrowLeftRight, Ellipsis, Send, History } from "@kova/ui";
import { api } from "../../api.js";
import { useCan } from "../../FeatureLock.js";
import { AiAvatar } from "../../AiAvatar.js";
import { AiErrorBox } from "../../AiError.js";
import { FoodEditor } from "../client/FoodEditor.js";
import { ExerciseEditor } from "./ExerciseEditor.js";
import { FoodThumb } from "../food.js";
import { fmtEnergy } from "@kova/domain";
import { useUnits } from "../../units.js";
import { ExerciseRow, ExerciseThumb, metaText, splitList, pretty, type ExerciseInfo } from "../exercise.js";

type Tab = "exercises" | "foods" | "templates" | "content";
const TABS: Tab[] = ["exercises", "foods", "templates", "content"];

export function Library() {
  const nav = useNavigate();
  // The active tab lives in the URL (/library/:tab) so tabs are deep-linkable
  // and back/forward navigable; an unknown/absent tab falls back to exercises.
  const { tab: tabParam } = useParams<{ tab?: string }>();
  const tab = (TABS.includes(tabParam as Tab) ? tabParam : "exercises") as Tab;
  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <h1 className="text-title-2">Library</h1>
      <SegmentedControl options={[{ value: "exercises", label: "Exercises" }, { value: "foods", label: "Foods" }, { value: "templates", label: "Templates" }, { value: "content", label: "Content" }]} value={tab} onChange={(v) => nav(`/library/${v}`)} />
      {tab === "exercises" && <Exercises />}
      {tab === "foods" && <Foods />}
      {tab === "templates" && <Templates />}
      {tab === "content" && <Content />}
    </Page>
  );
}

type LibraryExercise = ExerciseInfo & { source?: string; tenant_id?: string | null };
type ExEdit = { exerciseId?: string; initial?: Partial<ExerciseInfo> };
function Exercises() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<LibraryExercise[] | null>(null);
  const [view, setView] = useState<"list" | "grid">("list");
  // Browse facets, composed with search — lifted from the plan-builder's picker.
  const [muscle, setMuscle] = useState<string | null>(null);
  const [equip, setEquip] = useState<string | null>(null);
  const [editor, setEditor] = useState<ExEdit | null>(null);
  const [altFor, setAltFor] = useState<LibraryExercise | null>(null);
  const [archiveFor, setArchiveFor] = useState<LibraryExercise | null>(null);
  const load = useCallback(async () => setItems((await api.get<{ exercises: LibraryExercise[] }>(`/api/exercises?q=${encodeURIComponent(q)}`)).exercises), [q]);
  useEffect(() => { const t = setTimeout(() => void load(), 200); return () => clearTimeout(t); }, [load]);
  // Tenant-owned rows edit in place; platform seeds fork into a tenant copy.
  const open = (e: LibraryExercise) => setEditor(e.tenant_id ? { exerciseId: e.id, initial: e } : { initial: { ...e, id: undefined } });

  // Filter chips derived from the loaded library, most-common-first (same
  // derivation as the picker). Facets read from the full loaded set so toggling
  // one doesn't make the others vanish; the grid/rows then apply both.
  const opts = (get: (e: LibraryExercise) => string[]) => {
    const count = new Map<string, number>();
    for (const e of items ?? []) for (const v of get(e)) count.set(v, (count.get(v) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v).slice(0, 8);
  };
  const muscles = opts((e) => splitList(e.muscle_groups));
  const equipment = opts((e) => splitList(e.equipment));
  const filtered = (items ?? []).filter((e) =>
    (!muscle || splitList(e.muscle_groups).concat(splitList(e.secondary_muscle_groups)).includes(muscle)) &&
    (!equip || splitList(e.equipment).includes(equip)),
  );

  const actions = (e: LibraryExercise) => (
    <>
      <button onClick={() => open(e)} aria-label="Edit" className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground [&_svg]:size-4"><PencilLine /></button>
      <button onClick={() => setAltFor(e)} aria-label="Alternatives" className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground [&_svg]:size-4"><ArrowLeftRight /></button>
      {/* Only tenant-owned rows can be archived; platform seeds have no delete affordance. */}
      {e.tenant_id ? <button onClick={() => setArchiveFor(e)} aria-label="Archive" className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger [&_svg]:size-4"><Archive /></button> : null}
    </>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <Field className="flex-1" label="Search exercises" icon={Search} value={q} onChange={(e) => setQ(e.target.value)} />
        <Button variant="ghost" aria-label={view === "list" ? "Grid view" : "List view"} onClick={() => setView((v) => (v === "list" ? "grid" : "list"))}>{view === "list" ? <LayoutGrid /> : <List />}</Button>
        <Button variant="tonal" aria-label="New exercise" onClick={() => setEditor({})}><Plus /></Button>
      </div>
      {items && (muscles.length > 0 || equipment.length > 0) && (
        <div className="space-y-1.5">
          {muscles.length > 0 && (
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
              {muscles.map((m) => <span key={m} className="shrink-0"><Chip className="h-8 px-3 text-[0.8rem]" selected={muscle === m} onClick={() => setMuscle(muscle === m ? null : m)}>{pretty(m)}</Chip></span>)}
            </div>
          )}
          {equipment.length > 0 && (
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
              {equipment.map((eq) => <span key={eq} className="shrink-0"><Chip className="h-8 px-3 text-[0.8rem]" selected={equip === eq} onClick={() => setEquip(equip === eq ? null : eq)}>{pretty(eq)}</Chip></span>)}
            </div>
          )}
        </div>
      )}
      <Reveal loading={!items} skeleton={
        <div className="space-y-1">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="rounded-2xl bg-card px-3 py-2.5"><SkeletonRow thumb={44} /></div>)}</div>
      }>
        {items && (filtered.length === 0 ? <EmptyState icon={Dumbbell} title="No matches" /> : view === "grid" ? (
        <Stagger className="grid grid-cols-2 gap-3">{filtered.map((e) => (
          <Card key={e.id} className="overflow-hidden p-0">
            <button onClick={() => open(e)} className="block w-full text-left transition-opacity active:opacity-80">
              <div className="aspect-square bg-surface-2"><ExerciseThumb thumb={e.thumb_url} thumb2={e.thumb2_url} size={0} className="!size-full !rounded-none" /></div>
              <div className="px-3 pt-2">
                <div className="truncate text-sm font-semibold">{e.name}</div>
                <div className="truncate text-xs text-muted-foreground">{metaText(e) || "—"}</div>
              </div>
            </button>
            <div className="flex items-center justify-between gap-1 px-1.5 pb-1 pt-0.5">
              {e.difficulty ? <Badge tone="neutral" className="ml-1.5">{e.difficulty}</Badge> : <span />}
              <div className="flex items-center">{actions(e)}</div>
            </div>
          </Card>
        ))}</Stagger>
        ) : (
        <Stagger className="space-y-1">{filtered.map((e) => (
          <div key={e.id} className="rounded-2xl bg-card px-3 py-2.5">
            <ExerciseRow ex={e} thumbSize={52} onClick={() => open(e)} trailing={<div className="flex items-center gap-0">{actions(e)}</div>} />
          </div>
        ))}</Stagger>
        ))}
      </Reveal>
      {/* After a NEW add, clear any active search so the new row is actually visible (not filtered out by a stale query). */}
      {editor && <ExerciseEditor exerciseId={editor.exerciseId} initial={editor.initial} onClose={() => setEditor(null)} onSaved={() => { const wasNew = !editor.exerciseId; setEditor(null); if (wasNew && q) setQ(""); else void load(); }} />}
      {altFor && <AlternativesSheet exercise={altFor} onClose={() => setAltFor(null)} />}
      {archiveFor && <ArchiveConfirm kind="exercise" id={archiveFor.id} name={archiveFor.name} onClose={() => setArchiveFor(null)} onDone={() => { setArchiveFor(null); void load(); }} />}
    </div>
  );
}

/** Bind an exercise's alternatives (SPEC §8.3) — two-way, instant client swaps. */
function AlternativesSheet({ exercise, onClose }: { exercise: ExerciseInfo; onClose: () => void }) {
  const [alts, setAlts] = useState<ExerciseInfo[] | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ExerciseInfo[]>([]);
  const load = useCallback(async () => setAlts((await api.get<{ alternatives: ExerciseInfo[] }>(`/api/exercises/${exercise.id}/alternatives`)).alternatives), [exercise.id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => setResults((await api.get<{ exercises: ExerciseInfo[] }>(`/api/exercises?q=${encodeURIComponent(q)}`)).exercises.filter((e) => e.id !== exercise.id)), 200);
    return () => clearTimeout(t);
  }, [q, exercise.id]);
  const add = async (id: string) => { await api.post(`/api/exercises/${exercise.id}/alternatives`, { exerciseId: id }); setQ(""); setResults([]); await load(); };
  const remove = async (id: string) => { await api.del(`/api/exercises/${exercise.id}/alternatives/${id}`); await load(); };
  const altIds = new Set((alts ?? []).map((a) => a.id));
  return (
    <Sheet open onClose={onClose} title={`Alternatives · ${exercise.name}`}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Bound alternatives let clients swap instantly — no approval. Binding is two-way.</p>
        <Reveal loading={!alts} skeleton={
          <div className="space-y-1">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="rounded-xl bg-surface-2 px-2.5 py-2"><SkeletonRow thumb={36} trailing={false} /></div>)}</div>
        }>
          {alts && (alts.length === 0 ? <p className="text-sm text-muted-foreground">No alternatives yet.</p> : (
            <div className="space-y-1">{alts.map((a) => (
              <div key={a.id} className="rounded-xl bg-surface-2 px-2.5 py-2">
                <ExerciseRow ex={a} thumbSize={36} trailing={
                  <button onClick={() => void remove(a.id)} aria-label="Remove" className="text-muted-foreground hover:text-danger [&_svg]:size-4"><Trash2 /></button>
                } />
              </div>
            ))}</div>
          ))}
        </Reveal>
        <div className="border-t border-border/50 pt-3">
          <Field label="Add an alternative" icon={Search} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mt-1 max-h-56 space-y-1 overflow-y-auto">
            {results.filter((e) => !altIds.has(e.id)).map((e) => (
              <button key={e.id} onClick={() => void add(e.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-secondary">
                <ExerciseRow ex={e} thumbSize={34} meta={false} trailing={<Plus className="size-4 shrink-0 text-primary" />} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/**
 * Archive (soft-delete) confirm. Archiving hides a row from the library and
 * pickers but keeps it resolvable for plans/logs that already reference it, so
 * nothing goes blank. For exercises we surface how many plans still use it.
 */
function ArchiveConfirm({ kind, id, name, onClose, onDone }: { kind: "exercise" | "food"; id: string; name: string; onClose: () => void; onDone: () => void }) {
  const [usage, setUsage] = useState<{ plans: number; templates: number } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (kind !== "exercise") return;
    void api.get<{ plans: number; templates: number }>(`/api/exercises/${id}/usage`).then(setUsage).catch(() => setUsage(null));
  }, [kind, id]);
  const archive = async () => {
    setBusy(true);
    try { await api.del(`/api/${kind === "exercise" ? "exercises" : "foods"}/${id}`); onDone(); }
    finally { setBusy(false); }
  };
  const used = usage ? usage.plans + usage.templates : 0;
  const parts = usage ? [usage.plans && `${usage.plans} plan${usage.plans === 1 ? "" : "s"}`, usage.templates && `${usage.templates} template${usage.templates === 1 ? "" : "s"}`].filter(Boolean).join(" and ") : "";
  return (
    <Sheet open onClose={onClose} title={`Archive ${name}?`}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">It's removed from your library and pickers. Plans and logs that already use it keep working — the name still shows, and you can restore it by re-adding it.</p>
        {kind === "exercise" && used > 0 && (
          <div className="flex items-start gap-2.5 rounded-2xl bg-warning-soft p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>Still used in {parts}. Those keep showing it, but it won't be offered for new plans.</span>
          </div>
        )}
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" className="flex-1" disabled={busy} onClick={() => void archive()}><Archive /> {busy ? "Archiving…" : "Archive"}</Button>
        </div>
      </div>
    </Sheet>
  );
}

interface FoodRow { id: string; name: string; calories: number; brand: string | null; tenant_id: string | null; visibility?: string | null; protein_g?: number; carbs_g?: number; fat_g?: number; image_url?: string | null }
function Foods() {
  const units = useUnits();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<FoodRow[] | null>(null);
  const [view, setView] = useState<"list" | "grid">("list");
  // Browse facets, composed with search — mirrors the exercise library.
  const [kind, setKind] = useState<"whole" | "branded" | null>(null);
  const [owner, setOwner] = useState<"seed" | "shared" | "private" | null>(null);
  // `null` = closed; `{}` = new; `{ id }` = edit that food.
  const [editor, setEditor] = useState<{ id?: string } | null>(null);
  const [archiveFor, setArchiveFor] = useState<FoodRow | null>(null);
  const load = useCallback(async () => setItems((await api.get<{ foods: FoodRow[] }>(`/api/foods?q=${encodeURIComponent(q)}`)).foods), [q]);
  useEffect(() => { const t = setTimeout(() => void load(), 200); return () => clearTimeout(t); }, [load]);
  const tag = (f: FoodRow): "seed" | "private" | "shared" => (f.tenant_id === null ? "seed" : f.visibility === "private" ? "private" : "shared");
  const tagLabel = { seed: "Library", shared: "Shared", private: "Mine" } as const;
  const tagTone = (t: "seed" | "private" | "shared") => (t === "seed" ? "cardio" : t === "private" ? "neutral" : "activity");

  // Type (whole vs branded) + ownership facets — only shown when they'd split
  // the loaded set. Facets read from the full set so toggling one keeps the
  // others; the list/grid then applies both alongside search.
  const kinds = [
    ...((items ?? []).some((f) => !f.brand) ? [{ v: "whole" as const, label: "Whole" }] : []),
    ...((items ?? []).some((f) => f.brand) ? [{ v: "branded" as const, label: "Branded" }] : []),
  ];
  const owners = (["private", "shared", "seed"] as const).filter((o) => (items ?? []).some((f) => tag(f) === o));
  const filtered = (items ?? []).filter((f) =>
    (!kind || (kind === "branded" ? !!f.brand : !f.brand)) && (!owner || tag(f) === owner),
  );

  const macros = (f: FoodRow) => (
    <>
      <span className="numeral font-semibold text-calories">{fmtEnergy(f.calories, units)}</span>
      {f.protein_g != null && <MacroInline proteinG={f.protein_g} carbsG={f.carbs_g ?? 0} fatG={f.fat_g ?? 0} className="text-xs" />}
    </>
  );
  const actions = (f: FoodRow) => (
    <>
      <button onClick={() => setEditor({ id: f.id })} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground [&_svg]:size-4" aria-label="Edit food"><PencilLine /></button>
      {/* Seeds (tenant_id null) can't be archived — only a tenant's own rows. */}
      {f.tenant_id !== null ? <button onClick={() => setArchiveFor(f)} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger [&_svg]:size-4" aria-label="Archive food"><Archive /></button> : null}
    </>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <Field className="flex-1" label="Search foods" icon={Search} value={q} onChange={(e) => setQ(e.target.value)} />
        <Button variant="ghost" aria-label={view === "list" ? "Grid view" : "List view"} onClick={() => setView((v) => (v === "list" ? "grid" : "list"))}>{view === "list" ? <LayoutGrid /> : <List />}</Button>
        <Button variant="tonal" aria-label="New food" onClick={() => setEditor({})}><Plus /></Button>
      </div>
      {items && (kinds.length > 1 || owners.length > 1) && (
        <div className="space-y-1.5">
          {kinds.length > 1 && (
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
              {kinds.map((k) => <span key={k.v} className="shrink-0"><Chip className="h-8 px-3 text-[0.8rem]" selected={kind === k.v} onClick={() => setKind(kind === k.v ? null : k.v)}>{k.label}</Chip></span>)}
            </div>
          )}
          {owners.length > 1 && (
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
              {owners.map((o) => <span key={o} className="shrink-0"><Chip className="h-8 px-3 text-[0.8rem]" selected={owner === o} onClick={() => setOwner(owner === o ? null : o)}>{tagLabel[o]}</Chip></span>)}
            </div>
          )}
        </div>
      )}
      <Reveal loading={!items} skeleton={
        <div className="space-y-1">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="rounded-2xl bg-card p-4"><SkeletonRow thumb={40} /></div>)}</div>
      }>
        {items && (filtered.length === 0 ? <EmptyState icon={Utensils} title="No foods" description="Add one, or build your library from the Eat tab." action={<Button onClick={() => setEditor({})}><Plus /> New food</Button>} /> : view === "grid" ? (
        <Stagger className="grid grid-cols-2 gap-3">{filtered.map((f) => (
          <Card key={f.id} className="overflow-hidden p-0">
            <button onClick={() => setEditor({ id: f.id })} className="block w-full text-left transition-opacity active:opacity-80">
              <div className="aspect-square bg-nutrition-soft"><FoodThumb src={f.image_url} size={0} className="!size-full !rounded-none" /></div>
              <div className="px-3 pt-2">
                <div className="truncate text-sm font-semibold">{f.name}</div>
                {f.brand && <div className="truncate text-xs text-muted-foreground">{f.brand}</div>}
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">{macros(f)}</div>
              </div>
            </button>
            <div className="flex items-center justify-between gap-1 px-1.5 pb-1 pt-0.5">
              <Badge tone={tagTone(tag(f))} className="ml-1.5">{tagLabel[tag(f)]}</Badge>
              <div className="flex items-center">{actions(f)}</div>
            </div>
          </Card>
        ))}</Stagger>
        ) : (
        // Two-line row so the food NAME gets the full width — it only shares its
        // line with the actions; kcal, macros and the visibility tag sit beneath.
        <Stagger className="space-y-1">{filtered.map((f) => (
          <Card key={f.id} className="p-3">
            <div className="flex items-center gap-3">
              <FoodThumb src={f.image_url} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{f.name}{f.brand && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{f.brand}</span>}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  {macros(f)}
                  <Badge tone={tagTone(tag(f))}>{tagLabel[tag(f)]}</Badge>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">{actions(f)}</div>
            </div>
          </Card>
        ))}</Stagger>
        ))}
      </Reveal>
      {editor && (
        <FoodEditor
          foodId={editor.id}
          isStaff
          onClose={() => setEditor(null)}
          onSaved={() => { const wasNew = !editor.id; setEditor(null); if (wasNew && q) setQ(""); else void load(); }}
        />
      )}
      {archiveFor && <ArchiveConfirm kind="food" id={archiveFor.id} name={archiveFor.name} onClose={() => setArchiveFor(null)} onDone={() => { setArchiveFor(null); void load(); }} />}
    </div>
  );
}

interface Template { id: string; name: string; visibility: string; createdBy: string }
function Templates() {
  const nav = useNavigate();
  const [kind, setKind] = useState<"workout" | "meal">("workout");
  const [items, setItems] = useState<Template[] | null>(null);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [useFor, setUseFor] = useState<Template | null>(null); // template being applied to a client
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => setItems((await api.get<{ templates: Template[] }>(`/api/${kind}-templates`)).templates), [kind]);
  useEffect(() => void load(), [load]);
  useEffect(() => { void api.get<{ clients: ClientOpt[] }>("/api/clients").then((r) => setClients(r.clients)).catch(() => undefined); }, []);
  const remove = async (id: string) => { await api.del(`/api/${kind}-templates/${id}`); await load(); };
  const applyTo = async (clientId: string) => {
    if (!useFor) return;
    setBusy(true);
    try {
      const { plan } = await api.post<{ plan: { id: string } }>(`/api/${kind}-plans/from-template`, { clientId, templateId: useFor.id });
      setUseFor(null);
      nav(`/clients/${clientId}/plans/${kind}/${plan.id}`); // straight into the builder to publish
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <SegmentedControl options={[{ value: "workout", label: "Workout" }, { value: "meal", label: "Meal" }]} value={kind} onChange={setKind} />
      <Reveal loading={!items} skeleton={
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between rounded-2xl bg-card p-4">
            <div className="space-y-1.5"><SkeletonLine w="9rem" h="text" /><SkeletonLine w="5rem" h="xs" /></div>
            <Skeleton className="size-8 rounded-full" />
          </div>
        ))}</div>
      }>
        {items && (items.length === 0 ? <EmptyState icon={LayoutGrid} title="No templates yet" description="Save any plan as a template from its builder to reuse it across clients." /> : (
        <Stagger className="space-y-2">{items.map((t) => (
          <Card key={t.id} className="flex items-center justify-between gap-2 py-3">
            <div className="min-w-0"><div className="truncate font-medium">{t.name}</div><div className="text-xs text-muted-foreground">{t.visibility === "tenant" ? "Shared with team" : "Private"}</div></div>
            <div className="flex shrink-0 items-center gap-1">
              <Button size="sm" variant="tonal" onClick={() => setUseFor(t)}><Send className="size-4" /> Use</Button>
              <button onClick={() => void remove(t.id)} aria-label="Delete template" className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-danger-soft hover:text-danger [&_svg]:size-4"><Trash2 /></button>
            </div>
          </Card>
        ))}</Stagger>
        ))}
      </Reveal>
      {useFor && (
        <Sheet open onClose={() => !busy && setUseFor(null)} title={`Use "${useFor.name}"`}>
          <p className="mb-3 text-sm text-muted-foreground">Create a {kind} plan for a client from this template — you'll land in the builder to review and publish it.</p>
          <div className="max-h-[60vh] space-y-1 overflow-y-auto">
            {clients.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">No clients yet.</p>
            ) : clients.map((cl) => (
              <button key={cl.id} disabled={busy} onClick={() => void applyTo(cl.id)} className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-secondary disabled:opacity-60">
                <Avatar name={cl.displayName} src={cl.avatarUrl} seed={cl.avatarSeed ?? cl.id} className="size-9 shrink-0" />
                <span className="min-w-0 flex-1 truncate font-medium">{cl.displayName}</span>
                <Send className="size-4 shrink-0 text-primary" />
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}

interface Resource { id: string; type: string; title: string; status: string; audience: string; category?: string | null; topics?: string[] }
interface ClientOpt { id: string; displayName: string; avatarUrl?: string | null; avatarSeed?: string | null }

const AUDIENCE_LABEL: Record<string, string> = { clients: "All clients", public: "Public", assigned: "Specific clients" };

function Content() {
  const [items, setItems] = useState<Resource[] | null>(null);
  // `null` = closed; `{}` = new; `{ id }` = edit that article.
  const [sheet, setSheet] = useState<{ id?: string } | null>(null);
  const [menuFor, setMenuFor] = useState<Resource | null>(null);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const load = useCallback(async () => setItems((await api.get<{ resources: Resource[] }>("/api/resources")).resources), []);
  useEffect(() => void load(), [load]);
  useEffect(() => { void api.get<{ clients: ClientOpt[] }>("/api/clients").then((r) => setClients(r.clients)).catch(() => undefined); }, []);
  const tone = (s: string) => (s === "published" ? "success" : s === "archived" ? "warning" : "neutral");
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button size="sm" onClick={() => setSheet({})}><PencilLine /> Write article</Button></div>
      <Reveal loading={!items} skeleton={
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-2 rounded-2xl bg-card p-4">
            <div className="min-w-0 flex-1 space-y-1.5"><SkeletonLine w="70%" h="text" /><SkeletonLine w="45%" h="xs" /></div>
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="size-8 rounded-full" />
          </div>
        ))}</div>
      }>
        {items && (items.length === 0 ? <EmptyState icon={PencilLine} title="Content hub is empty" description="Publish articles, recipes, and routines — public ones become your marketplace blog." /> : (
        <Stagger className="space-y-2">{items.map((r) => (
          <Card key={r.id} className="flex items-center justify-between gap-2 py-3">
            <button onClick={() => setSheet({ id: r.id })} className="min-w-0 flex-1 text-left">
              <div className="truncate font-medium">{r.title}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span>{r.category || r.type}</span>
                <span>· {AUDIENCE_LABEL[r.audience] ?? r.audience}</span>
                {(r.topics ?? []).slice(0, 3).map((t) => <span key={t} className="rounded-full bg-surface-2 px-1.5 py-0.5">{t}</span>)}
              </div>
            </button>
            <Badge tone={tone(r.status)}>{r.status}</Badge>
            <button onClick={() => setMenuFor(r)} aria-label="Article actions" className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground [&_svg]:size-4"><Ellipsis /></button>
          </Card>
        ))}</Stagger>
        ))}
      </Reveal>
      {sheet && <ArticleEditor id={sheet.id} clients={clients} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); void load(); }} />}
      {menuFor && <ArticleActions article={menuFor} onClose={() => setMenuFor(null)} onEdit={() => { const id = menuFor.id; setMenuFor(null); setSheet({ id }); }} onChanged={() => { setMenuFor(null); void load(); }} />}
    </div>
  );
}

/** Create/edit an article — AI draft, cover, category + tags, audience (with a
 *  per-client picker for "specific clients"), saved as draft or published. */
function ArticleEditor({ id, clients, onClose, onSaved }: { id?: string; clients: ClientOpt[]; onClose: () => void; onSaved: () => void }) {
  const [loading, setLoading] = useState(!!id);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [audience, setAudience] = useState<"public" | "clients" | "assigned">("clients");
  const [assigned, setAssigned] = useState<string[]>([]);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  // `/api/ai/article` + `/api/ai/cover-image` are gated on aiSuite.
  const canAi = useCan("aiSuite");
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    void api.get<{ resource: { title?: string; summary?: string | null; bodyMd?: string | null; category?: string | null; topics?: string[]; audience?: string; assignedClientIds?: string[]; coverUrl?: string | null } }>(`/api/resources/${id}`)
      .then((r) => { if (!alive) return; const x = r.resource; setTitle(x.title ?? ""); setSummary(x.summary ?? ""); setBody(x.bodyMd ?? ""); setCategory(x.category ?? ""); setTags((x.topics ?? []).join(", ")); setAudience((x.audience as typeof audience) ?? "clients"); setAssigned(x.assignedClientIds ?? []); setCoverUrl(x.coverUrl ?? null); setLoading(false); })
      .catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id]);

  const genCover = async () => { setCoverBusy(true); setErr(null); try { const r = await api.post<{ url: string }>("/api/ai/cover-image", { prompt: title || aiTopic }); setCoverUrl(r.url); } catch (e) { setErr(e); } finally { setCoverBusy(false); } };
  const draftAi = async () => { setAiBusy(true); setErr(null); try { const r = await api.post<{ article: { title: string; summary: string; body: string } }>("/api/ai/article", { topic: aiTopic }); setTitle(r.article.title); setSummary(r.article.summary ?? ""); setBody(r.article.body); } catch (e) { setErr(e); } finally { setAiBusy(false); } };
  const toggleClient = (cid: string) => setAssigned((p) => (p.includes(cid) ? p.filter((x) => x !== cid) : [...p, cid]));

  const save = async (status: "draft" | "published") => {
    setBusy(true); setErr(null);
    try {
      const req = { type: "article", title, summary: summary || undefined, bodyMd: body, coverUrl: coverUrl || undefined, category: category.trim() || undefined, topics: tags.split(",").map((t) => t.trim()).filter(Boolean), audience, assignedClientIds: audience === "assigned" ? assigned : [] };
      const rid = id ? (await api.patch(`/api/resources/${id}`, req), id) : (await api.post<{ id: string }>("/api/resources", req)).id;
      await api.post(`/api/resources/${rid}/publish`, { status });
      onSaved();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <Sheet open onClose={onClose} title={id ? "Edit article" : "Write article"}>
      <Reveal loading={loading} skeleton={
        <div className="space-y-4">
          <Skeleton className="h-11 rounded-xl" />
          <Skeleton className="h-11 rounded-xl" />
          <div className="grid grid-cols-2 gap-3"><Skeleton className="h-11 rounded-xl" /><Skeleton className="h-11 rounded-xl" /></div>
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-11 rounded-xl" />
        </div>
      }>
        {!loading && (
        <div className="space-y-4">
          {!id && canAi && (
            <div className="space-y-2 rounded-2xl bg-primary/10 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-primary"><AiAvatar className="size-6" /> Draft with AI</div>
              <div className="flex gap-2">
                <input value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} placeholder="Topic — e.g. Sleep for muscle growth" className="min-w-0 flex-1 rounded-lg bg-surface-2 px-3 py-2 text-sm outline-none" />
                <Button size="sm" disabled={aiBusy || aiTopic.trim().length < 3} onClick={() => void draftAi()}>{aiBusy ? "Writing…" : "Draft"}</Button>
              </div>
            </div>
          )}
          {err ? <AiErrorBox error={err} /> : null}
          <Field label="Title" icon={PencilLine} value={title} onChange={(e) => setTitle(e.target.value)} />
          <Field label="Summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="One-line teaser (optional)" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Nutrition" />
            <Field label="Tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="comma, separated" />
          </div>
          <div className="space-y-2">
            {coverUrl && <img src={coverUrl} alt="Cover" className="h-32 w-full rounded-xl object-cover" />}
            {canAi && <Button size="sm" variant="secondary" className="w-full" disabled={coverBusy || (!title && !aiTopic)} onClick={() => void genCover()}><AiAvatar className="size-5" /> {coverBusy ? "Generating…" : coverUrl ? "Regenerate cover" : "Generate cover image"}</Button>}
          </div>
          <div><label className="mb-1.5 block text-sm font-medium text-muted-foreground">Body (markdown — supports tables)</label><Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} /></div>
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground">Who sees it</div>
            <div className="flex flex-wrap gap-2">{(["clients", "public", "assigned"] as const).map((a) => <Chip key={a} selected={audience === a} onClick={() => setAudience(a)}>{AUDIENCE_LABEL[a]}</Chip>)}</div>
          </div>
          {audience === "assigned" && (
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">Shared only with {assigned.length ? `${assigned.length} client${assigned.length === 1 ? "" : "s"}` : "…pick clients"}</div>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-border/50 p-1.5">
                {clients.length === 0 ? <p className="p-2 text-center text-xs text-muted-foreground">No clients yet.</p> : clients.map((cl) => (
                  <button key={cl.id} onClick={() => toggleClient(cl.id)} className={cn("flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-colors", assigned.includes(cl.id) ? "bg-primary/10 text-primary" : "hover:bg-surface-2")}>
                    <span className="truncate">{cl.displayName}</span>
                    {assigned.includes(cl.id) && <span className="text-xs">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" disabled={busy || title.trim().length < 2} onClick={() => void save("draft")}>{busy ? "Saving…" : "Save draft"}</Button>
            <Button className="flex-1" disabled={busy || title.trim().length < 2} onClick={() => void save("published")}><Send /> Publish</Button>
          </div>
        </div>
        )}
      </Reveal>
    </Sheet>
  );
}

/** Article lifecycle menu — publish/unpublish, archive/restore, delete. */
function ArticleActions({ article, onClose, onEdit, onChanged }: { article: Resource; onClose: () => void; onEdit: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const act = (fn: () => Promise<unknown>) => async () => { setBusy(true); try { await fn(); onChanged(); } catch { setBusy(false); } };
  const status = (s: string) => api.post(`/api/resources/${article.id}/publish`, { status: s });
  return (
    <Sheet open onClose={onClose} title={article.title}>
      <div className="space-y-1">
        <ActionRow icon={PencilLine} label="Edit" onClick={onEdit} />
        {article.status !== "published" && <ActionRow icon={Send} label="Publish" disabled={busy} onClick={act(() => status("published"))} />}
        {article.status === "published" && <ActionRow icon={History} label="Unpublish (back to draft)" disabled={busy} onClick={act(() => status("draft"))} />}
        {article.status !== "archived" && <ActionRow icon={Archive} label="Archive" hint="Hide it without deleting" disabled={busy} onClick={act(() => status("archived"))} />}
        {article.status === "archived" && <ActionRow icon={History} label="Restore to draft" disabled={busy} onClick={act(() => status("draft"))} />}
        {confirmDel
          ? <ActionRow icon={Trash2} label={busy ? "Deleting…" : "Tap again to delete"} danger disabled={busy} onClick={act(() => api.del(`/api/resources/${article.id}`))} />
          : <ActionRow icon={Trash2} label="Delete permanently" danger onClick={() => setConfirmDel(true)} />}
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

function split(s: string): string[] { return s.split(",").map((x) => x.trim()).filter(Boolean); }
