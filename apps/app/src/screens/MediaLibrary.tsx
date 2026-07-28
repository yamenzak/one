/**
 * Media library (SPEC §11) — a role-scoped gallery of everything you can see in
 * the studio's media store, with a storage meter. A client sees + manages their
 * own uploads; a coach browses their clients' media read-only; an owner sees and
 * can delete anything. Opened from the avatar menu.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button, Card, Page, Reveal, EmptyState, Badge, Chip, IconBadge, ConfirmDialog, SkeletonList,
  ArrowLeft, Trash2, ImageIcon, Wand2, Archive, Building2, Dumbbell, FlaskConical, HeartPulse, Utensils,
  type LucideIcon,
} from "@kova/ui";
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

/**
 * Categories, over the raw `purpose` a file was stored under.
 *
 * Eleven purposes is a storage-layer detail; nobody browsing their own library
 * thinks "show me purpose=meal-snap". These group them the way someone actually
 * looks — my body, my food, the AI's output, the studio's own assets — and every
 * purpose belongs to exactly one, which a test asserts so a new purpose cannot be
 * added and then quietly become invisible here.
 */
const CATEGORIES: { id: string; label: string; icon: LucideIcon; purposes: string[] }[] = [
  { id: "body", label: "Body", icon: HeartPulse, purposes: ["progress", "avatar"] },
  { id: "food", label: "Food", icon: Utensils, purposes: ["food", "meal-snap", "label"] },
  { id: "training", label: "Training", icon: Dumbbell, purposes: ["exercise"] },
  { id: "health", label: "Health", icon: FlaskConical, purposes: ["lab"] },
  // AI output is media like any other — it occupies the same quota and the studio
  // owns it, so it is browsable and deletable here rather than hidden.
  { id: "ai", label: "AI-made", icon: Wand2, purposes: ["ai", "tts"] },
  { id: "studio", label: "Studio", icon: Building2, purposes: ["brand"] },
  { id: "other", label: "Other", icon: Archive, purposes: ["misc"] },
];
const categoryOf = (purpose: string): string => CATEGORIES.find((c) => c.purposes.includes(purpose))?.id ?? "other";
const fmtBytes = (n: number): string => (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
const fmtDate = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export function MediaLibrary({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [toDelete, setToDelete] = useState<MediaItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<string>("all"); // "all" | clientId | "tenant"
  const [cat, setCat] = useState<string>("all");

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
  /** Only the categories that actually have files — an empty chip is noise. */
  const cats = useMemo(() => {
    const present = new Set((items ?? []).map((i) => categoryOf(i.purpose)));
    return CATEGORIES.filter((c) => present.has(c.id));
  }, [items]);
  const shown = useMemo(() => {
    let all = items ?? [];
    if (filter === "tenant") all = all.filter((i) => !i.clientId);
    else if (filter !== "all") all = all.filter((i) => i.clientId === filter);
    if (cat !== "all") all = all.filter((i) => categoryOf(i.purpose) === cat);
    return all;
  }, [items, filter, cat]);
  /** Bytes in view, so a filtered set says what it is costing. */
  const shownBytes = useMemo(() => shown.reduce((n, i) => n + (i.sizeBytes || 0), 0), [shown]);

  return (
    <Page className="mx-auto max-w-3xl space-y-4 p-4 pb-28">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="secondary" onClick={onBack} aria-label="Back"><ArrowLeft /></Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight">Media library</h1>
          <p className="truncate text-xs text-muted-foreground">
            {items === null ? "Loading…" : `${items.length} file${items.length === 1 ? "" : "s"} · everything the app stores for you, including what the AI made`}
          </p>
        </div>
      </div>

      {/* Storage meter — OWNER ONLY. `/api/storage-usage` is owner-gated server
          side, so a client or coach simply has no `usage` and this does not
          render: a plan limit is the studio's commercial position, not a fact
          about the viewer's own files. */}
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

      {/* Whose media (coach / owner viewing multiple clients) */}
      {clients.length > 1 && (
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 no-scrollbar">
          <Chip selected={filter === "all"} onClick={() => setFilter("all")}>Everyone</Chip>
          <Chip selected={filter === "tenant"} onClick={() => setFilter("tenant")}>Studio</Chip>
          {clients.map((cl) => <Chip key={cl.id} selected={filter === cl.id} onClick={() => setFilter(cl.id)}>{cl.name}</Chip>)}
        </div>
      )}

      {/* What kind. Only categories with files, so the row never lies about
          what is in here. */}
      {cats.length > 1 && (
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 no-scrollbar">
          <Chip selected={cat === "all"} onClick={() => setCat("all")}>All</Chip>
          {cats.map((c) => <Chip key={c.id} selected={cat === c.id} onClick={() => setCat(c.id)}><c.icon className="size-3.5" /> {c.label}</Chip>)}
        </div>
      )}

      {(cat !== "all" || filter !== "all") && items !== null && (
        <p className="numeral px-1 text-xs text-muted-foreground">
          {shown.length} of {items.length} file{items.length === 1 ? "" : "s"} · {fmtBytes(shownBytes)}
        </p>
      )}

      <Reveal loading={items === null} className="space-y-4" skeleton={<SkeletonList card rows={4} thumb={56} />}>
        {items !== null && (shown.length === 0 ? (
          <EmptyState icon={ImageIcon} title="No media yet" description={canManage ? "Photos, files and images you upload will show up here." : "Media for the clients you can see will show up here."} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {shown.map((it) => (
              <Card key={it.id} className="group relative overflow-hidden p-0">
                {it.isImage ? (
                  <img src={it.url} alt={PURPOSE_LABEL[it.purpose] ?? it.purpose} loading="lazy" className="aspect-square w-full object-cover" />
                ) : (
                  <div className="grid aspect-square w-full place-items-center bg-surface-2 text-center text-xs text-muted-foreground">
                    <div className="space-y-1 px-2"><div className="font-mono text-xs uppercase">{it.contentType.split("/").pop()}</div><div>{PURPOSE_LABEL[it.purpose] ?? it.purpose}</div></div>
                  </div>
                )}
                <div className="space-y-1 p-2.5">
                  <div className="flex items-center gap-1.5">
                    <Badge tone="neutral">{PURPOSE_LABEL[it.purpose] ?? it.purpose}</Badge>
                    {it.mine && <span className="text-xs font-medium text-muted-foreground">yours</span>}
                  </div>
                  {it.clientName && <div className="truncate text-xs font-medium">{it.clientName}</div>}
                  <div className="numeral flex items-center justify-between text-xs text-muted-foreground">
                    <span>{fmtBytes(it.sizeBytes)}</span><span>{fmtDate(it.createdAt)}</span>
                  </div>
                </div>
                {it.canDelete && (
                  <button
                    onClick={() => setToDelete(it)}
                    aria-label={`Delete ${PURPOSE_LABEL[it.purpose] ?? "media"}`}
                    className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-full bg-background/85 text-danger shadow-sm backdrop-blur transition-transform hover:scale-105 active:scale-95 [&_svg]:size-4"
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
