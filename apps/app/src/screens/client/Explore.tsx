/** Client Explore — the tenant's content hub (articles/recipes/routines). */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Badge, Chip, Skeleton, Page, Stagger, EmptyState, ArrowLeft, Button, PencilLine } from "@mossa/ui";
import { api } from "../../api.js";
import { Markdown } from "../../Markdown.js";

interface Resource { id: string; type: string; title: string; summary: string | null; bodyMd: string | null; coverUrl: string | null; durationMinutes: number | null; category?: string | null; topics?: string[] }

export function Explore({ clientId, onBack }: { clientId: string; onBack: () => void }) {
  const [items, setItems] = useState<Resource[] | null>(null);
  const [open, setOpen] = useState<Resource | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  const load = useCallback(async () => setItems((await api.get<{ resources: Resource[] }>(`/api/resources/feed?clientId=${clientId}`)).resources), [clientId]);
  useEffect(() => void load(), [load]);

  // Category chips derived from what's actually published.
  const categories = useMemo(() => [...new Set((items ?? []).map((r) => r.category).filter((x): x is string => !!x))], [items]);
  const shown = (items ?? []).filter((r) => !cat || r.category === cat);

  if (open) {
    return (
      <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
        <div className="flex items-center gap-3"><Button size="icon" variant="secondary" onClick={() => setOpen(null)}><ArrowLeft /></Button><h1 className="flex-1 truncate text-xl font-bold tracking-tight">{open.title}</h1></div>
        {open.coverUrl && <img src={open.coverUrl} alt="" className="max-h-56 w-full rounded-2xl object-cover" />}
        <div className="flex flex-wrap items-center gap-1.5">
          {open.category && <Badge tone="activity">{open.category}</Badge>}
          {(open.topics ?? []).map((t) => <span key={t} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground">{t}</span>)}
        </div>
        {open.bodyMd ? <Markdown className="text-[0.95rem] text-foreground/90">{open.bodyMd}</Markdown> : <p className="text-[0.95rem] leading-relaxed text-foreground/90">{open.summary}</p>}
      </Page>
    );
  }

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <div className="flex items-center gap-3"><Button size="icon" variant="secondary" onClick={onBack}><ArrowLeft /></Button><h1 className="text-xl font-bold tracking-tight">Explore</h1></div>
      {categories.length > 0 && (
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
          <span className="shrink-0"><Chip selected={cat === null} onClick={() => setCat(null)}>All</Chip></span>
          {categories.map((cName) => <span key={cName} className="shrink-0"><Chip selected={cat === cName} onClick={() => setCat(cName)}>{cName}</Chip></span>)}
        </div>
      )}
      {!items ? <Skeleton className="h-64" /> : shown.length === 0 ? <EmptyState icon={PencilLine} title="Nothing here yet" description="Your coach hasn't published articles or routines yet." /> : (
        <Stagger className="space-y-3">
          {shown.map((r) => (
            <Card key={r.id} interactive onClick={() => setOpen(r)}>
              {r.coverUrl && <img src={r.coverUrl} alt="" className="mb-3 max-h-40 w-full rounded-xl object-cover" />}
              <div className="flex items-center gap-2"><Badge tone="neutral">{r.category || r.type}</Badge>{r.durationMinutes && <span className="text-xs text-muted-foreground">{r.durationMinutes} min</span>}</div>
              <h2 className="mt-1.5 font-semibold">{r.title}</h2>
              {r.summary && <p className="mt-0.5 text-sm text-muted-foreground">{r.summary}</p>}
            </Card>
          ))}
        </Stagger>
      )}
    </Page>
  );
}
