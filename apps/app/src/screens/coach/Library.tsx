/** Coach Library — exercises (create + web import), foods, templates, content. */

import { useCallback, useEffect, useState } from "react";
import { fmtEnergy } from "@mossa/domain";
import { Button, Card, Badge, Field, Textarea, Sheet, Skeleton, SegmentedControl, Chip, Page, Stagger, EmptyState, MacroInline, Search, Plus, Globe, Trash2, Dumbbell, Utensils, LayoutGrid, PencilLine, ArrowLeftRight, Sparkles } from "@mossa/ui";
import { api } from "../../api.js";
import { useUnits } from "../../units.js";
import { AiAvatar } from "../../AiAvatar.js";
import { AiErrorBox } from "../../AiError.js";
import { FoodEditor } from "../client/FoodEditor.js";
import { ExerciseEditor } from "./ExerciseEditor.js";
import { ExerciseThumb, ExerciseMeta, type ExerciseInfo } from "../exercise.js";

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

type ExerciseRow = ExerciseInfo & { source?: string; tenant_id?: string | null };
type ExEdit = { exerciseId?: string; initial?: Partial<ExerciseInfo> };
function Exercises() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ExerciseRow[] | null>(null);
  const [editor, setEditor] = useState<ExEdit | null>(null);
  const [webOpen, setWebOpen] = useState(false);
  const [altFor, setAltFor] = useState<ExerciseRow | null>(null);
  const load = useCallback(async () => setItems((await api.get<{ exercises: ExerciseRow[] }>(`/api/exercises?q=${encodeURIComponent(q)}`)).exercises), [q]);
  useEffect(() => { const t = setTimeout(() => void load(), 200); return () => clearTimeout(t); }, [load]);
  // Tenant-owned rows edit in place; platform seeds fork into a tenant copy.
  const open = (e: ExerciseRow) => setEditor(e.tenant_id ? { exerciseId: e.id, initial: e } : { initial: { ...e, id: undefined } });
  return (
    <div className="space-y-3">
      <Field label="Search exercises" icon={Search} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" className="flex-1" onClick={() => setEditor({})}><Plus /> New</Button>
        <Button size="sm" variant="secondary" className="flex-1" onClick={() => setWebOpen(true)}><Globe /> Web search</Button>
      </div>
      {!items ? <Skeleton className="h-40" /> : items.length === 0 ? <EmptyState icon={Dumbbell} title="No matches" /> : (
        <Stagger className="space-y-1">{items.map((e) => (
          <div key={e.id} className="flex items-center gap-3 rounded-2xl bg-card px-3 py-2.5">
            <button onClick={() => open(e)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <ExerciseThumb thumb={e.thumb_url} thumb2={e.thumb2_url} size={40} />
              <div className="min-w-0 flex-1"><div className="truncate font-medium">{e.name}</div><ExerciseMeta ex={e} className="text-xs text-muted-foreground" /></div>
            </button>
            <button onClick={() => open(e)} aria-label="Edit" className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground [&_svg]:size-4"><PencilLine /></button>
            <button onClick={() => setAltFor(e)} aria-label="Alternatives" className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground [&_svg]:size-4"><ArrowLeftRight /></button>
          </div>
        ))}</Stagger>
      )}
      {editor && <ExerciseEditor exerciseId={editor.exerciseId} initial={editor.initial} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void load(); }} />}
      {webOpen && <WebExerciseSheet onClose={() => setWebOpen(false)} onImported={() => void load()} />}
      {altFor && <AlternativesSheet exercise={altFor} onClose={() => setAltFor(null)} />}
    </div>
  );
}

interface WebExercise { name: string; muscleGroups: string[]; secondaryMuscleGroups?: string[]; equipment: string[]; instructions?: string | null; category?: string | null; force?: string | null; difficulty?: string | null; source: string; sourceId: string; imageUrl: string | null; imageUrl2?: string | null }
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
        {!alts ? <Skeleton className="h-20" /> : alts.length === 0 ? <p className="text-sm text-muted-foreground">No alternatives yet.</p> : (
          <div className="space-y-1">{alts.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-2.5 py-2">
              <ExerciseThumb thumb={a.thumb_url} thumb2={a.thumb2_url} size={36} />
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{a.name}</div><ExerciseMeta ex={a} className="text-xs text-muted-foreground" /></div>
              <button onClick={() => void remove(a.id)} aria-label="Remove" className="text-muted-foreground hover:text-danger [&_svg]:size-4"><Trash2 /></button>
            </div>
          ))}</div>
        )}
        <div className="border-t border-border/50 pt-3">
          <Field label="Add an alternative" icon={Search} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mt-1 max-h-56 space-y-1 overflow-y-auto">
            {results.filter((e) => !altIds.has(e.id)).map((e) => (
              <button key={e.id} onClick={() => void add(e.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-secondary">
                <ExerciseThumb thumb={e.thumb_url} thumb2={e.thumb2_url} size={34} />
                <div className="min-w-0 flex-1 truncate text-sm">{e.name}</div>
                <Plus className="size-4 shrink-0 text-primary" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

export function WebExerciseSheet({ onClose, onImported, onPicked }: { onClose: () => void; onImported?: () => void; onPicked?: (id: string) => void }) {
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
    try { const r = await api.post<{ id: string }>("/api/exercises/import", { name: e.name, muscleGroups: e.muscleGroups, secondaryMuscleGroups: e.secondaryMuscleGroups ?? [], equipment: e.equipment, instructions: e.instructions ?? null, category: e.category ?? null, force: e.force ?? null, difficulty: e.difficulty ?? null, imageUrl: e.imageUrl, imageUrl2: e.imageUrl2 ?? null, source: e.source, sourceId: e.sourceId }); onImported?.(); onPicked?.(r.id); }
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

interface FoodRow { id: string; name: string; calories: number; brand: string | null; tenant_id: string | null; visibility?: string | null; protein_g?: number; carbs_g?: number; fat_g?: number; image_url?: string | null }
function Foods() {
  const units = useUnits();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<FoodRow[] | null>(null);
  // `null` = closed; `{}` = new; `{ id }` = edit that food.
  const [editor, setEditor] = useState<{ id?: string } | null>(null);
  const load = useCallback(async () => setItems((await api.get<{ foods: FoodRow[] }>(`/api/foods?q=${encodeURIComponent(q)}`)).foods), [q]);
  useEffect(() => { const t = setTimeout(() => void load(), 200); return () => clearTimeout(t); }, [load]);
  const tag = (f: FoodRow) => (f.tenant_id === null ? "seed" : f.visibility === "private" ? "private" : "shared");
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Field className="flex-1" label="Search foods" icon={Search} value={q} onChange={(e) => setQ(e.target.value)} />
        <Button variant="tonal" onClick={() => setEditor({})}><Plus /> New</Button>
      </div>
      {!items ? <Skeleton className="h-40" /> : items.length === 0 ? <EmptyState icon={Utensils} title="No foods yet" description="Add one, or build your library from the Eat tab." action={<Button onClick={() => setEditor({})}><Plus /> New food</Button>} /> : (
        <Stagger className="space-y-1">{items.map((f) => (
          <Card key={f.id} className="flex items-center gap-3 py-3">
            <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-2">{f.image_url ? <img src={f.image_url} alt="" className="size-full object-cover" /> : <Utensils className="size-4 text-muted-foreground" />}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{f.name}{f.brand && <span className="ml-2 text-xs text-muted-foreground">{f.brand}</span>}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="numeral text-calories">{fmtEnergy(f.calories, units)}</span><MacroInline proteinG={f.protein_g ?? 0} carbsG={f.carbs_g ?? 0} fatG={f.fat_g ?? 0} className="text-[0.7rem]" /></div>
            </div>
            <Badge tone={tag(f) === "seed" ? "cardio" : tag(f) === "private" ? "neutral" : "activity"}>{tag(f)}</Badge>
            <button onClick={() => setEditor({ id: f.id })} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground [&_svg]:size-4" aria-label="Edit food"><PencilLine /></button>
          </Card>
        ))}</Stagger>
      )}
      {editor && (
        <FoodEditor
          foodId={editor.id}
          isStaff
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); void load(); }}
        />
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
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"public" | "clients" | "assigned">("clients");
  const [aiTopic, setAiTopic] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<unknown>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const load = useCallback(async () => setItems((await api.get<{ resources: Resource[] }>("/api/resources")).resources), []);
  useEffect(() => void load(), [load]);
  const reset = () => { setTitle(""); setSummary(""); setBody(""); setAiTopic(""); setAiError(null); setCoverUrl(null); };
  const create = async () => { const r = await api.post<{ id: string }>("/api/resources", { type: "article", title, summary: summary || undefined, bodyMd: body, coverUrl: coverUrl || undefined, audience }); await api.post(`/api/resources/${r.id}/publish`, { status: "published" }); setCreateOpen(false); reset(); await load(); };
  const genCover = async () => {
    setCoverBusy(true); setAiError(null);
    try { const r = await api.post<{ url: string }>("/api/ai/cover-image", { prompt: title || aiTopic }); setCoverUrl(r.url); }
    catch (e) { setAiError(e); }
    finally { setCoverBusy(false); }
  };
  const draftAi = async () => {
    setAiBusy(true); setAiError(null);
    try {
      const r = await api.post<{ article: { title: string; summary: string; body: string } }>("/api/ai/article", { topic: aiTopic });
      setTitle(r.article.title); setSummary(r.article.summary ?? ""); setBody(r.article.body);
    } catch (e) { setAiError(e); }
    finally { setAiBusy(false); }
  };
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button size="sm" onClick={() => setCreateOpen(true)}><PencilLine /> Write article</Button></div>
      {!items ? <Skeleton className="h-40" /> : items.length === 0 ? <EmptyState icon={PencilLine} title="Content hub is empty" description="Publish articles, recipes, and routines — public ones become your marketplace blog." /> : (
        <Stagger className="space-y-2">{items.map((r) => <Card key={r.id} className="flex items-center justify-between py-3"><div><div className="font-medium">{r.title}</div><div className="text-xs text-muted-foreground">{r.type} · {r.audience}</div></div><Badge tone={r.status === "published" ? "success" : "neutral"}>{r.status}</Badge></Card>)}</Stagger>
      )}
      <Sheet open={createOpen} onClose={() => { setCreateOpen(false); }} title="Write article">
        <div className="space-y-4">
          <div className="space-y-2 rounded-2xl bg-primary/10 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-primary"><AiAvatar className="size-6" /> Draft with AI</div>
            <div className="flex gap-2">
              <input value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} placeholder="Topic — e.g. Sleep for muscle growth" className="min-w-0 flex-1 rounded-lg bg-surface-2 px-3 py-2 text-sm outline-none" />
              <Button size="sm" disabled={aiBusy || aiTopic.trim().length < 3} onClick={() => void draftAi()}>{aiBusy ? "Writing…" : "Draft"}</Button>
            </div>
          </div>
          {aiError ? <AiErrorBox error={aiError} /> : null}
          <Field label="Title" icon={PencilLine} value={title} onChange={(e) => setTitle(e.target.value)} />
          <Field label="Summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="One-line teaser (optional)" />
          <div className="space-y-2">
            {coverUrl && <img src={coverUrl} alt="Cover" className="h-32 w-full rounded-xl object-cover" />}
            <Button size="sm" variant="secondary" className="w-full" disabled={coverBusy || (!title && !aiTopic)} onClick={() => void genCover()}><Sparkles /> {coverBusy ? "Generating…" : coverUrl ? "Regenerate cover" : "Generate cover image"}</Button>
          </div>
          <div><label className="mb-1.5 block text-sm font-medium text-muted-foreground">Body (markdown)</label><Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} /></div>
          <div className="flex gap-2">{(["clients", "public", "assigned"] as const).map((a) => <Chip key={a} selected={audience === a} onClick={() => setAudience(a)}>{a}</Chip>)}</div>
          <Button size="lg" className="w-full" disabled={title.trim().length < 2} onClick={() => void create()}><Plus /> Publish</Button>
        </div>
      </Sheet>
    </div>
  );
}

function split(s: string): string[] { return s.split(",").map((x) => x.trim()).filter(Boolean); }
