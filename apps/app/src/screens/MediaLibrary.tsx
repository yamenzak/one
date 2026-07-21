/**
 * Media library (SPEC §11) — a role-scoped gallery of everything you can see in
 * the studio's media store, with a storage meter. A client sees + manages their
 * own uploads; a coach browses their clients' media read-only; an owner sees and
 * can delete anything. Opened from the avatar menu.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button, Card, Page, Reveal, EmptyState, Badge, Chip, IconBadge, ConfirmDialog, SkeletonList,
  ArrowLeft, Trash2, ImageIcon, Sparkles,
} from "@mossa/ui";
import { api } from "../api.js";

interface MediaItem {
  id: string;
  url: string;
  purpose: string;
  contentType: string;
  isImage: boolean;
  sizeBytes: number;
  createdAt: string;
  clientId: string | null;
  clientName: string | null;
  ownerName: string | null;
  mine: boolean;
  canDelete: boolean;
}
interface Usage { usedBytes: number; limitBytes: number; usedMb: number; limitMb: number; unlimited: boolean; pct: number }

const PURPOSE_LABEL: Record<string, string> = {
  progress: "Progress photo", lab: "Lab file", avatar: "Avatar", brand: "Branding",
  food: "Food image", exercise: "Exercise image", label: "Label scan", "meal-snap": "Meal snap",
  ai: "AI image", tts: "Voice cue", misc: "File",
};
const fmtBytes = (n: number): string => (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
const fmtDate = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export function MediaLibrary({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [toDelete, setToDelete] = useState<MediaItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<string>("all"); // "all" | clientId | "tenant"

  const load = useCallback(async () => {
    const [lib, use] = await Promise.all([
      api.get<{ items: MediaItem[]; canManage: boolean }>("/api/media-library"),
      api.get<Usage>("/api/storage-usage").catch(() => null),
    ]);
    setItems(lib.items);
    setCanManage(lib.canManage);
    if (use) setUsage(use);
  }, []);
  useEffect(() => { void load().catch(() => setItems([])); }, [load]);

  const del = async (id: string) => {
    setBusy(true);
    try { await api.del(`/api/media-library/${id}`); setToDelete(null); await load(); }
    finally { setBusy(false); }
  };

  // A per-client filter appears when the viewer can see more than one client's media.
  const clients = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items ?? []) if (it.clientId && it.clientName) m.set(it.clientId, it.clientName);
    return [...m.entries()].map(([id, name]) => ({ id, name }));
  }, [items]);
  const shown = useMemo(() => {
    const all = items ?? [];
    if (filter === "all") return all;
    if (filter === "tenant") return all.filter((i) => !i.clientId);
    return all.filter((i) => i.clientId === filter);
  }, [items, filter]);

  return (
    <Page className="mx-auto max-w-3xl space-y-4 p-4 pb-28">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="secondary" onClick={onBack} aria-label="Back"><ArrowLeft /></Button>
        <h1 className="flex-1 text-xl font-bold tracking-tight">Media library</h1>
      </div>

      {/* Storage meter */}
      {usage && (
        <Card className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2.5"><IconBadge icon={ImageIcon} tone="sleep" size="sm" /><span className="font-semibold">Storage</span></div>
            <span className="numeral text-muted-foreground">
              {usage.unlimited ? `${usage.usedMb} MB used` : `${usage.usedMb} / ${usage.limitMb} MB`}
            </span>
          </div>
          {!usage.unlimited && (
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div className={`h-full rounded-full ${usage.pct >= 90 ? "bg-danger" : usage.pct >= 70 ? "bg-warning" : "bg-sleep"}`} style={{ width: `${usage.pct}%` }} />
            </div>
          )}
          {!usage.unlimited && usage.pct >= 90 && <p className="text-xs text-danger">Almost full — delete media you no longer need, or upgrade your plan.</p>}
        </Card>
      )}

      {/* Client filter (coach / owner viewing multiple clients) */}
      {clients.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <Chip selected={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
          <Chip selected={filter === "tenant"} onClick={() => setFilter("tenant")}>Studio</Chip>
          {clients.map((cl) => <Chip key={cl.id} selected={filter === cl.id} onClick={() => setFilter(cl.id)}>{cl.name}</Chip>)}
        </div>
      )}

      <Reveal loading={items === null} className="space-y-4" skeleton={<SkeletonList card rows={4} thumb={56} />}>
        {items !== null && (shown.length === 0 ? (
          <EmptyState icon={Sparkles} title="No media yet" description={canManage ? "Photos, files and images you upload will show up here." : "Media for the clients you can see will show up here."} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {shown.map((it) => (
              <Card key={it.id} className="group relative overflow-hidden p-0">
                {it.isImage ? (
                  <img src={it.url} alt={PURPOSE_LABEL[it.purpose] ?? it.purpose} loading="lazy" className="aspect-square w-full object-cover" />
                ) : (
                  <div className="grid aspect-square w-full place-items-center bg-surface-2 text-center text-xs text-muted-foreground">
                    <div className="space-y-1 px-2"><div className="font-mono text-[0.6rem] uppercase">{it.contentType.split("/").pop()}</div><div>{PURPOSE_LABEL[it.purpose] ?? it.purpose}</div></div>
                  </div>
                )}
                <div className="space-y-1 p-2.5">
                  <div className="flex items-center gap-1.5">
                    <Badge tone="neutral">{PURPOSE_LABEL[it.purpose] ?? it.purpose}</Badge>
                    {it.mine && <span className="text-[0.6rem] font-medium text-muted-foreground">yours</span>}
                  </div>
                  {it.clientName && <div className="truncate text-xs font-medium">{it.clientName}</div>}
                  <div className="numeral flex items-center justify-between text-[0.65rem] text-muted-foreground">
                    <span>{fmtBytes(it.sizeBytes)}</span><span>{fmtDate(it.createdAt)}</span>
                  </div>
                </div>
                {it.canDelete && (
                  <button
                    onClick={() => setToDelete(it)}
                    aria-label="Delete media"
                    className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-full bg-background/80 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-danger focus:opacity-100 group-hover:opacity-100 [&_svg]:size-4"
                  >
                    <Trash2 />
                  </button>
                )}
              </Card>
            ))}
          </div>
        ))}
      </Reveal>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete this file?"
        description="It's removed from storage permanently and unlinked wherever it was used. This can't be undone."
        confirmLabel={busy ? "Deleting…" : "Delete"}
        destructive
        onConfirm={() => toDelete && void del(toDelete.id)}
      />
    </Page>
  );
}
