/** Client Explore — the tenant's content hub (articles/recipes/routines). */

import { useCallback, useEffect, useState } from "react";
import { Card, Badge, Skeleton, Page, Stagger, EmptyState, ArrowLeft, Button, PencilLine } from "@mossa/ui";
import { api } from "../../api.js";

interface Resource { id: string; type: string; title: string; summary: string | null; bodyMd: string | null; coverUrl: string | null; durationMinutes: number | null }

export function Explore({ clientId, onBack }: { clientId: string; onBack: () => void }) {
  const [items, setItems] = useState<Resource[] | null>(null);
  const [open, setOpen] = useState<Resource | null>(null);
  const load = useCallback(async () => setItems((await api.get<{ resources: Resource[] }>(`/api/resources/feed?clientId=${clientId}`)).resources), [clientId]);
  useEffect(() => void load(), [load]);

  if (open) {
    return (
      <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
        <div className="flex items-center gap-3"><Button size="icon" variant="secondary" onClick={() => setOpen(null)}><ArrowLeft /></Button><h1 className="flex-1 truncate text-xl font-bold tracking-tight">{open.title}</h1></div>
        {open.coverUrl && <img src={open.coverUrl} alt="" className="max-h-56 w-full rounded-2xl object-cover" />}
        <article className="prose-sm whitespace-pre-wrap text-[0.95rem] leading-relaxed text-foreground/90">{open.bodyMd || open.summary}</article>
      </Page>
    );
  }

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <div className="flex items-center gap-3"><Button size="icon" variant="secondary" onClick={onBack}><ArrowLeft /></Button><h1 className="text-xl font-bold tracking-tight">Explore</h1></div>
      {!items ? <Skeleton className="h-64" /> : items.length === 0 ? <EmptyState icon={PencilLine} title="Nothing here yet" description="Your coach hasn't published articles or routines yet." /> : (
        <Stagger className="space-y-3">
          {items.map((r) => (
            <Card key={r.id} interactive onClick={() => setOpen(r)}>
              {r.coverUrl && <img src={r.coverUrl} alt="" className="mb-3 max-h-40 w-full rounded-xl object-cover" />}
              <div className="flex items-center gap-2"><Badge tone="neutral">{r.type}</Badge>{r.durationMinutes && <span className="text-xs text-muted-foreground">{r.durationMinutes} min</span>}</div>
              <h2 className="mt-1.5 font-semibold">{r.title}</h2>
              {r.summary && <p className="mt-0.5 text-sm text-muted-foreground">{r.summary}</p>}
            </Card>
          ))}
        </Stagger>
      )}
    </Page>
  );
}
