/** Coach Library — exercises (create + web import), foods, templates, content. */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Badge, Field, Textarea, Sheet, Skeleton, SegmentedControl, Chip, Page, Stagger, EmptyState, Search, Plus, Globe, Trash2, Dumbbell, Utensils, LayoutGrid, PencilLine } from "@mossa/ui";
import { api } from "../../api.js";

type Tab = "exercises" | "foods" | "templates" | "content";

export function Library() {
  const [tab, setTab] = useState<Tab>("exercises");
  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <h1 className="text-2xl font-bold tracking-tight">Library</h1>
      <SegmentedControl options={[{ value: "exercises", label: "Exercises" }, { value: "foods", label: "Foods" }, { value: "templates", label: "Templates" }, { value: "content", label: "Content" }]} value={tab} onChange={setTab} />
      {tab === "exercises" && <Exercises />}
      {tab === "foods" && <Foods />}
      {tab === "templates" && <Templates />}
      {tab === "content" && <Content />}
    </Page>
  );
}

interface ExerciseRow { id: string; name: string; muscle_groups: string | null; source?: string }
function Exercises() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ExerciseRow[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [webOpen, setWebOpen] = useState(false);
  const load = useCallback(async () => setItems((await api.get<{ exercises: ExerciseRow[] }>(`/api/exercises?q=${encodeURIComponent(q)}`)).exercises), [q]);
  useEffect(() => { const t = setTimeout(() => void load(), 200); return () => clearTimeout(t); }, [load]);
  return (
    <div className="space-y-3">
      <Field label="Search exercises" icon={Search} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" className="flex-1" onClick={() => setCreateOpen(true)}><Plus /> New</Button>
        <Button size="sm" variant="secondary" className="flex-1" onClick={() => setWebOpen(true)}><Globe /> Web search</Button>
      </div>
      {!items ? <Skeleton className="h-40" /> : items.length === 0 ? <EmptyState icon={Dumbbell} title="No matches" /> : (
        <Stagger className="space-y-1">{items.map((e) => (
          <Card key={e.id} className="flex items-center justify-between py-3">
            <div className="min-w-0"><span className="truncate">{e.name}</span></div>
            <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{(e.muscle_groups ?? "").split(",")[0]}</span>{e.source && e.source !== "custom" && <Badge tone="neutral">{e.source}</Badge>}</div>
          </Card>
        ))}</Stagger>
      )}
      {createOpen && <CreateExerciseSheet onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); void load(); }} />}
      {webOpen && <WebExerciseSheet onClose={() => setWebOpen(false)} onImported={() => void load()} />}
    </div>
  );
}

function CreateExerciseSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [muscles, setMuscles] = useState("");
  const [equipment, setEquipment] = useState("");
  const [difficulty, setDifficulty] = useState<"beginner" | "intermediate" | "advanced">("intermediate");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.post("/api/exercises", { name, muscleGroups: split(muscles), equipment: split(equipment), difficulty, visibility: "tenant" }); onDone(); }
    finally { setBusy(false); }
  };
  return (
    <Sheet open onClose={onClose} title="New exercise">
      <div className="space-y-4">
        <Field label="Name" icon={Dumbbell} value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Muscle groups (comma-separated)" value={muscles} onChange={(e) => setMuscles(e.target.value)} placeholder="chest, triceps" />
        <Field label="Equipment (comma-separated)" value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="barbell" />
        <div className="flex gap-2">{(["beginner", "intermediate", "advanced"] as const).map((d) => <Chip key={d} selected={difficulty === d} onClick={() => setDifficulty(d)}>{d}</Chip>)}</div>
        <Button size="lg" className="w-full" disabled={busy || name.trim().length < 2} onClick={() => void save()}>{busy ? "Saving…" : "Add to library"}</Button>
      </div>
    </Sheet>
  );
}

interface WebExercise { name: string; muscleGroups: string[]; secondaryMuscleGroups?: string[]; equipment: string[]; instructions?: string | null; category?: string | null; force?: string | null; difficulty?: string | null; source: string; sourceId: string; imageUrl: string | null }
function WebExerciseSheet({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<WebExercise[] | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return; }
    const t = setTimeout(async () => {
      try { setResults((await api.get<{ exercises: WebExercise[] }>(`/api/exercises/search-external?q=${encodeURIComponent(q)}`)).exercises); setError(null); }
      catch { setError("Web search isn't enabled on your plan."); setResults([]); }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);
  const doImport = async (e: WebExercise) => {
    setImporting(e.sourceId);
    try { await api.post("/api/exercises/import", { name: e.name, muscleGroups: e.muscleGroups, secondaryMuscleGroups: e.secondaryMuscleGroups ?? [], equipment: e.equipment, instructions: e.instructions ?? null, category: e.category ?? null, force: e.force ?? null, difficulty: e.difficulty ?? null, imageUrl: e.imageUrl, source: e.source, sourceId: e.sourceId }); onImported(); }
    finally { setImporting(null); }
  };
  return (
    <Sheet open onClose={onClose} title="Import from the web">
      <Field label="Search wger" icon={Globe} value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" placeholder="e.g. bulgarian split squat" />
      {error && <p className="px-1 py-2 text-sm text-danger">{error}</p>}
      <div className="max-h-96 space-y-2 overflow-y-auto">
        {results?.map((e) => (
          <Card key={e.sourceId} className="flex items-center gap-3 py-2.5">
            {e.imageUrl && <img src={e.imageUrl} alt="" className="size-10 rounded-lg object-cover" />}
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{e.name}</div><div className="truncate text-xs text-muted-foreground">{[e.muscleGroups.join(", "), e.category].filter(Boolean).join(" · ") || "—"} · {e.source}</div></div>
            <Button size="sm" variant="secondary" disabled={importing === e.sourceId} onClick={() => void doImport(e)}>{importing === e.sourceId ? "…" : "Import"}</Button>
          </Card>
        ))}
        {results && results.length === 0 && !error && <p className="py-6 text-center text-sm text-muted-foreground">No results.</p>}
      </div>
    </Sheet>
  );
}

function Foods() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<{ id: string; name: string; calories: number; brand: string | null }[] | null>(null);
  const load = useCallback(async () => setItems((await api.get<{ foods: NonNullable<typeof items> }>(`/api/foods?q=${encodeURIComponent(q)}`)).foods), [q]);
  useEffect(() => { const t = setTimeout(() => void load(), 200); return () => clearTimeout(t); }, [load]);
  return (
    <div className="space-y-3">
      <Field label="Search foods" icon={Search} value={q} onChange={(e) => setQ(e.target.value)} />
      {!items ? <Skeleton className="h-40" /> : items.length === 0 ? <EmptyState icon={Utensils} title="No foods yet" description="Build your library from the Eat tab." /> : (
        <Stagger className="space-y-1">{items.map((f) => <Card key={f.id} className="flex items-center justify-between py-3"><span>{f.name}{f.brand && <span className="ml-2 text-xs text-muted-foreground">{f.brand}</span>}</span><span className="numeral text-sm text-muted-foreground">{Math.round(f.calories)} kcal</span></Card>)}</Stagger>
      )}
    </div>
  );
}

interface Template { id: string; name: string; visibility: string; createdBy: string }
function Templates() {
  const [kind, setKind] = useState<"workout" | "meal">("workout");
  const [items, setItems] = useState<Template[] | null>(null);
  const load = useCallback(async () => setItems((await api.get<{ templates: Template[] }>(`/api/${kind}-templates`)).templates), [kind]);
  useEffect(() => void load(), [load]);
  const remove = async (id: string) => { await api.del(`/api/${kind}-templates/${id}`); await load(); };
  return (
    <div className="space-y-3">
      <SegmentedControl options={[{ value: "workout", label: "Workout" }, { value: "meal", label: "Meal" }]} value={kind} onChange={setKind} />
      {!items ? <Skeleton className="h-40" /> : items.length === 0 ? <EmptyState icon={LayoutGrid} title="No templates yet" description="Save any plan as a template from its builder to reuse it across clients." /> : (
        <Stagger className="space-y-2">{items.map((t) => (
          <Card key={t.id} className="flex items-center justify-between py-3">
            <div className="min-w-0"><div className="truncate font-medium">{t.name}</div><div className="text-xs text-muted-foreground">{t.visibility === "tenant" ? "Shared with team" : "Private"}</div></div>
            <button onClick={() => void remove(t.id)} className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-danger-soft hover:text-danger [&_svg]:size-4"><Trash2 /></button>
          </Card>
        ))}</Stagger>
      )}
    </div>
  );
}

interface Resource { id: string; type: string; title: string; status: string; audience: string }
function Content() {
  const [items, setItems] = useState<Resource[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"public" | "clients" | "assigned">("clients");
  const load = useCallback(async () => setItems((await api.get<{ resources: Resource[] }>("/api/resources")).resources), []);
  useEffect(() => void load(), [load]);
  const create = async () => { const r = await api.post<{ id: string }>("/api/resources", { type: "article", title, bodyMd: body, audience }); await api.post(`/api/resources/${r.id}/publish`, { status: "published" }); setCreateOpen(false); setTitle(""); setBody(""); await load(); };
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button size="sm" onClick={() => setCreateOpen(true)}><PencilLine /> Write article</Button></div>
      {!items ? <Skeleton className="h-40" /> : items.length === 0 ? <EmptyState icon={PencilLine} title="Content hub is empty" description="Publish articles, recipes, and routines — public ones become your marketplace blog." /> : (
        <Stagger className="space-y-2">{items.map((r) => <Card key={r.id} className="flex items-center justify-between py-3"><div><div className="font-medium">{r.title}</div><div className="text-xs text-muted-foreground">{r.type} · {r.audience}</div></div><Badge tone={r.status === "published" ? "success" : "neutral"}>{r.status}</Badge></Card>)}</Stagger>
      )}
      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title="Write article">
        <div className="space-y-4">
          <Field label="Title" icon={PencilLine} value={title} onChange={(e) => setTitle(e.target.value)} />
          <div><label className="mb-1.5 block text-sm font-medium text-muted-foreground">Body (markdown)</label><Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} /></div>
          <div className="flex gap-2">{(["clients", "public", "assigned"] as const).map((a) => <Chip key={a} selected={audience === a} onClick={() => setAudience(a)}>{a}</Chip>)}</div>
          <Button size="lg" className="w-full" disabled={title.trim().length < 2} onClick={() => void create()}><Plus /> Publish</Button>
        </div>
      </Sheet>
    </div>
  );
}

function split(s: string): string[] { return s.split(",").map((x) => x.trim()).filter(Boolean); }
