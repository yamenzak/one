/** Coach Library tab: exercises, foods, content hub — browse + create. */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Chip, Field, Sheet, Skeleton, SuggestionChip } from "@mossa/ui";
import { api } from "../../api.js";

type Tab = "exercises" | "foods" | "content";

export function Library() {
  const [tab, setTab] = useState<Tab>("exercises");
  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <h1 className="text-2xl font-bold">Library</h1>
      <div className="flex gap-2">
        {(["exercises", "foods", "content"] as Tab[]).map((t) => (
          <SuggestionChip key={t} selected={tab === t} onClick={() => setTab(t)}>
            {t[0]!.toUpperCase() + t.slice(1)}
          </SuggestionChip>
        ))}
      </div>
      {tab === "exercises" && <Exercises />}
      {tab === "foods" && <Foods />}
      {tab === "content" && <Content />}
    </div>
  );
}

function Exercises() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<{ id: string; name: string; muscle_groups: string | null; equipment: string | null }[] | null>(null);

  const load = useCallback(async () => {
    const r = await api.get<{ exercises: typeof items }>(`/api/exercises?q=${encodeURIComponent(q)}`);
    setItems(r.exercises);
  }, [q]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-3">
      <Field label="Search exercises" icon="🔍" value={q} onChange={(e) => setQ(e.target.value)} />
      {!items ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="space-y-1">
          {items.map((e) => (
            <Card key={e.id} className="flex items-center justify-between py-3">
              <span>{e.name}</span>
              <span className="text-xs text-fg-muted">{(e.muscle_groups ?? "").split(",")[0]}</span>
            </Card>
          ))}
          {items.length === 0 && <p className="p-4 text-center text-sm text-fg-muted">No matches.</p>}
        </div>
      )}
    </div>
  );
}

function Foods() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<{ id: string; name: string; calories: number; brand: string | null }[] | null>(null);

  const load = useCallback(async () => {
    const r = await api.get<{ foods: typeof items }>(`/api/foods?q=${encodeURIComponent(q)}`);
    setItems(r.foods);
  }, [q]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-3">
      <Field label="Search foods" icon="🔍" value={q} onChange={(e) => setQ(e.target.value)} />
      {!items ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="space-y-1">
          {items.map((f) => (
            <Card key={f.id} className="flex items-center justify-between py-3">
              <span>
                {f.name}
                {f.brand && <span className="ml-2 text-xs text-fg-muted">{f.brand}</span>}
              </span>
              <span className="numeral text-sm text-fg-muted">{Math.round(f.calories)} kcal</span>
            </Card>
          ))}
          {items.length === 0 && <p className="p-4 text-center text-sm text-fg-muted">No foods yet — build your library from the Eat tab.</p>}
        </div>
      )}
    </div>
  );
}

interface Resource {
  id: string;
  type: string;
  title: string;
  status: string;
  audience: string;
}

function Content() {
  const [items, setItems] = useState<Resource[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"public" | "clients" | "assigned">("clients");

  const load = useCallback(async () => {
    const r = await api.get<{ resources: Resource[] }>("/api/resources");
    setItems(r.resources);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    const r = await api.post<{ id: string }>("/api/resources", { type: "article", title, bodyMd: body, audience });
    await api.post(`/api/resources/${r.id}/publish`, { status: "published" });
    setCreateOpen(false);
    setTitle("");
    setBody("");
    await load();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>＋ Write article</Button>
      </div>
      {!items ? (
        <Skeleton className="h-40" />
      ) : items.length === 0 ? (
        <Card className="text-center text-sm text-fg-muted">
          Your content hub is empty. Publish articles, recipes, and routines — public ones become your
          marketplace blog.
        </Card>
      ) : (
        items.map((r) => (
          <Card key={r.id} className="flex items-center justify-between py-3">
            <div>
              <div className="font-medium">{r.title}</div>
              <div className="text-xs text-fg-muted">{r.type} · {r.audience}</div>
            </div>
            <Chip tone={r.status === "published" ? "good" : "neutral"}>{r.status}</Chip>
          </Card>
        ))
      )}
      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title="Write article">
        <div className="space-y-4">
          <Field label="Title" icon="✍️" value={title} onChange={(e) => setTitle(e.target.value)} />
          <fieldset className="rounded-[--radius-field] border border-fg-muted/40 px-4 pb-3 pt-1">
            <legend className="px-1 text-xs text-fg-muted">Body (markdown)</legend>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className="w-full bg-transparent text-base outline-none" />
          </fieldset>
          <div className="flex gap-2">
            {(["clients", "public", "assigned"] as const).map((a) => (
              <SuggestionChip key={a} selected={audience === a} onClick={() => setAudience(a)}>
                {a}
              </SuggestionChip>
            ))}
          </div>
          <Button size="lg" className="w-full" disabled={title.trim().length < 2} onClick={() => void create()}>
            Publish
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
