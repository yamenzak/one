/** Coach Library — exercises, foods, content hub. */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Badge, Field, Textarea, Sheet, Skeleton, SegmentedControl, Chip, Page, Stagger, EmptyState, Search, Plus, Dumbbell, Utensils, PencilLine } from "@mossa/ui";
import { api } from "../../api.js";

type Tab = "exercises" | "foods" | "content";

export function Library() {
  const [tab, setTab] = useState<Tab>("exercises");
  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <h1 className="text-2xl font-bold tracking-tight">Library</h1>
      <SegmentedControl options={[{ value: "exercises", label: "Exercises" }, { value: "foods", label: "Foods" }, { value: "content", label: "Content" }]} value={tab} onChange={setTab} />
      {tab === "exercises" && <Exercises />}
      {tab === "foods" && <Foods />}
      {tab === "content" && <Content />}
    </Page>
  );
}

function Exercises() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<{ id: string; name: string; muscle_groups: string | null }[] | null>(null);
  const load = useCallback(async () => setItems((await api.get<{ exercises: NonNullable<typeof items> }>(`/api/exercises?q=${encodeURIComponent(q)}`)).exercises), [q]);
  useEffect(() => { const t = setTimeout(() => void load(), 200); return () => clearTimeout(t); }, [load]);
  return (
    <div className="space-y-3">
      <Field label="Search exercises" icon={Search} value={q} onChange={(e) => setQ(e.target.value)} />
      {!items ? <Skeleton className="h-40" /> : items.length === 0 ? <EmptyState icon={Dumbbell} title="No matches" /> : (
        <Stagger className="space-y-1">{items.map((e) => <Card key={e.id} className="flex items-center justify-between py-3"><span>{e.name}</span><span className="text-xs text-muted-foreground">{(e.muscle_groups ?? "").split(",")[0]}</span></Card>)}</Stagger>
      )}
    </div>
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
