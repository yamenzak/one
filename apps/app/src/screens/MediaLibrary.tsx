/**
 * Media library (SPEC §11) — a role-scoped gallery of everything you can see in
 * the studio's media store, with a storage meter. A client sees + manages their
 * own uploads; a coach browses their clients' media read-only; an owner sees and
 * can delete anything. Opened from the avatar menu.
 *
 * ── This was the screen furthest from the design language, and here is why ──
 *
 * It predated most of §7 and never came back for it. Seven things were wrong,
 * and every one of them is a rule this repo already had a component for:
 *
 *   a HAND-ROLLED HEADER      a `<div>` with a back button and an `<h1>`,
 *                             instead of the page header every other screen uses
 *   TWO RAW CHIP RAILS        stacked, both horizontally scrolling. §7 says
 *                             facets collapse to ONE button with a count
 *   NO SEARCH                 a collection of two hundred files, browsable only
 *                             by scrolling. §7's collection grammar is search +
 *                             view + a remembered preference, and `Collection`
 *                             ships all three
 *   NO VIEW TOGGLE            grid only, which is the wrong shape for finding a
 *                             lab PDF by name and the right one for photos
 *   A RAW `<img>`             instead of `Thumb`, so a broken key rendered a
 *                             browser's broken-image glyph and a portrait photo
 *                             was cropped rather than contained
 *   NOTHING TO TAP            a file had no detail view at all; the only action
 *                             was a delete button floating over the corner on
 *                             `hover:scale-105` — a mouse idiom in a phone app
 *   `catch(() => setItems([]))`  a FAILED load rendered "No media yet". The one
 *                             failure mode §7 calls out by name: a screen that
 *                             lies about being empty
 *
 * `Collection` now owns the header, the search, the view toggle, the skeletons
 * per view, the narrowed-vs-empty distinction and the load error, which is most
 * of what this file used to do by hand.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button, Card, Page, Badge, IconBadge, ConfirmDialog, Collection, Filters,
  useCollectionView, activeFacetCount, Row, Group, Sheet, Thumb, Meter,
  ArrowLeft, Trash2, ImageIcon, Wand2, Archive, Building2, Dumbbell, FlaskConical, HeartPulse, Utensils,
  Download, ExternalLink, cn, type FacetSelection, type LucideIcon,
} from "@4dl/ui";
import { api, errorText } from "../api.js";

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
const iconOf = (purpose: string): LucideIcon => CATEGORIES.find((c) => c.purposes.includes(purpose))?.icon ?? Archive;
const fmtBytes = (n: number): string => (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
const fmtDate = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const labelOf = (it: MediaItem) => PURPOSE_LABEL[it.purpose] ?? it.purpose;
/** What a search matches: what it is, whose it is, and what kind of file. */
const haystack = (it: MediaItem) =>
  `${labelOf(it)} ${it.clientName ?? ""} ${it.ownerName ?? ""} ${it.contentType}`.toLowerCase();

export function MediaLibrary({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<MediaItem | null>(null);
  const [open, setOpen] = useState<MediaItem | null>(null);
  const [query, setQuery] = useState("");
  const [facets, setFacets] = useState<FacetSelection>({ who: null, kind: null });
  // Photos want a grid, files want a list, and which one you want is a lasting
  // preference rather than a per-visit decision (§7).
  const [view, setView] = useCollectionView("media", "grid");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [lib, use] = await Promise.all([
        api.get<{ items: MediaItem[]; canManage: boolean }>("/api/media-library"),
        api.get<Usage>("/api/storage-usage").catch(() => null),
      ]);
      setItems(lib.items);
      setCanManage(lib.canManage);
      if (use) setUsage(use);
    } catch (e) {
      // A failed read renders the FAILURE. It used to render an empty gallery,
      // which told someone with two hundred files that they had none.
      setError(errorText(e, "Couldn't load your media library."));
      setItems(null);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  /*
    Returns the promise, and does NOT swallow a rejection. `ConfirmDialog`
    awaits it: it holds itself open and disabled while the delete runs, closes
    on success, and shows the failure in place if it rejects. The `busy` state
    and the hand-written "Deleting…" label this used to need are the dialog's
    now — and the bare `finally` they came with meant a refused delete rejected
    into the app-wide "Something didn't load" toast, twelve inches from the
    dialog that caused it.
  */
  const del = async (id: string) => {
    await api.del(`/api/media-library/${id}`);
    setOpen(null);
    await load();
  };

  // A per-client facet appears only when the viewer can see more than one
  // client's media — a facet with one option cannot narrow anything.
  const clients = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items ?? []) if (it.clientId && it.clientName) m.set(it.clientId, it.clientName);
    return [...m.entries()].map(([id, name]) => ({ id, name }));
  }, [items]);
  /** Only the categories that actually have files — an empty option is noise. */
  const cats = useMemo(() => {
    const present = new Set((items ?? []).map((i) => categoryOf(i.purpose)));
    return CATEGORIES.filter((c) => present.has(c.id));
  }, [items]);

  /*
    ONE BUTTON, TWO FACETS (§7).

    These were two stacked horizontally-scrolling chip rails — one for whose
    media, one for what kind — above the grid, so on a phone the gallery started
    below two rows of chips that both ran off the right edge. `Filters` renders
    itself as a single button carrying a count, and opens a sheet with both.
  */
  const facetGroups = useMemo(() => [
    {
      key: "who",
      label: "Whose media",
      options: [{ value: "tenant", label: "Studio" }, ...clients.map((c) => ({ value: c.id, label: c.name }))],
    },
    { key: "kind", label: "Kind", options: cats.map((c) => ({ value: c.id, label: c.label })) },
  ], [clients, cats]);

  const shown = useMemo(() => {
    let all = items ?? [];
    const who = facets.who;
    if (who === "tenant") all = all.filter((i) => !i.clientId);
    else if (who) all = all.filter((i) => i.clientId === who);
    if (facets.kind) all = all.filter((i) => categoryOf(i.purpose) === facets.kind);
    const q = query.trim().toLowerCase();
    if (q) all = all.filter((i) => haystack(i).includes(q));
    return all;
  }, [items, facets, query]);
  /** Bytes in view, so a narrowed set says what it is costing. */
  const shownBytes = useMemo(() => shown.reduce((n, i) => n + (i.sizeBytes || 0), 0), [shown]);
  const narrowed = activeFacetCount(facets) > 0;

  return (
    <Page className="mx-auto max-w-3xl space-y-4 p-4 pb-28">
      {/* The page header every other screen uses, instead of a bespoke flex row
          with its own `<h1>`. */}
      <div className="flex items-center gap-3">
        <Button size="icon" variant="secondary" onClick={onBack} aria-label="Back"><ArrowLeft /></Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-title-3">Media library</h1>
          <p className="truncate text-caption text-muted-foreground">
            Everything the app stores for you, including what the AI made
          </p>
        </div>
      </div>

      {/* Storage meter — OWNER ONLY. `/api/storage-usage` is owner-gated server
          side, so a client or coach simply has no `usage` and this does not
          render: a plan limit is the studio's commercial position, not a fact
          about the viewer's own files. */}
      {usage && (
        <Card className="space-y-2">
          <div className="flex items-center justify-between text-body">
            <div className="flex items-center gap-2.5"><IconBadge icon={ImageIcon} tone="sleep" size="sm" /><span className="font-semibold">Storage</span></div>
            <span className="numeral text-muted-foreground">
              {usage.unlimited ? `${usage.usedMb} MB used` : `${usage.usedMb} / ${usage.limitMb} MB`}
            </span>
          </div>
          {/* The one meter in the app that changes TONE with its own value — a
              storage bar going amber at 70% and red at 90% IS the warning, and
              the line under it is the words that go with it (§4). */}
          {!usage.unlimited && (
            <Meter size="md" value={usage.pct} max={100} tone={usage.pct >= 90 ? "danger" : usage.pct >= 70 ? "warning" : "sleep"} />
          )}
          {!usage.unlimited && usage.pct >= 90 && <p className="text-caption text-danger">Almost full — delete media you no longer need, or upgrade your plan.</p>}
        </Card>
      )}

      <Collection
        items={items === null ? null : shown}
        itemKey={(it: MediaItem) => it.id}
        error={error}
        onRetry={() => void load()}
        noun="media"
        view={view}
        onView={setView}
        query={query}
        onQuery={setQuery}
        narrowed={narrowed}
        onClearFilters={() => setFacets({ who: null, kind: null })}
        filter={<Filters groups={facetGroups} value={facets} onChange={setFacets} />}
        empty={{
          icon: ImageIcon,
          title: "No media yet",
          description: canManage
            ? "Photos, files and images you upload will show up here."
            : "Media for the clients you can see will show up here.",
        }}
        thumb={56}
        renderList={(it: MediaItem) => (
          <Row
            key={it.id}
            leading={<MediaThumb item={it} size={44} />}
            sub={[it.clientName, fmtBytes(it.sizeBytes), fmtDate(it.createdAt)].filter(Boolean).join(" · ")}
            onClick={() => setOpen(it)}
          >{labelOf(it)}</Row>
        )}
        renderGrid={(it: MediaItem) => (
          /* The whole tile is the target, and it OPENS the file rather than
             offering a delete. Destruction lives one level in, on the detail
             sheet, where there is room to say what is being destroyed — it used
             to be a 32px circle in the corner of a thumbnail, on a phone. */
          <button
            key={it.id}
            onClick={() => setOpen(it)}
            className="group overflow-hidden rounded-2xl bg-card text-left ring-border/60 transition-shadow hover:shadow-e2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MediaThumb item={it} className="w-full" />
            <div className="space-y-1 p-2.5">
              <div className="flex items-center gap-1.5">
                <Badge tone="neutral">{labelOf(it)}</Badge>
                {it.mine && <span className="text-caption font-medium text-muted-foreground">yours</span>}
              </div>
              {it.clientName && <div className="truncate text-caption font-medium">{it.clientName}</div>}
              <div className="numeral flex items-center justify-between text-caption text-muted-foreground">
                <span>{fmtBytes(it.sizeBytes)}</span><span>{fmtDate(it.createdAt)}</span>
              </div>
            </div>
          </button>
        )}
      />

      {/* What is in view, and what it costs. Below the collection rather than
          above it, because it describes the result rather than the controls. */}
      {items !== null && !error && (narrowed || query.trim()) && shown.length > 0 && (
        <p className="numeral px-1 text-caption text-muted-foreground">
          {shown.length} of {items.length} file{items.length === 1 ? "" : "s"} · {fmtBytes(shownBytes)}
        </p>
      )}

      <MediaDetail
        item={open}
        onClose={() => setOpen(null)}
        onDelete={(it) => setToDelete(it)}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={toDelete ? `Delete this ${labelOf(toDelete).toLowerCase()}?` : "Delete this file?"}
        description="It's removed from storage permanently and unlinked wherever it was used. This can't be undone."
        confirmLabel="Delete"
        busyLabel="Deleting…"
        destructive
        onConfirm={() => (toDelete ? del(toDelete.id) : undefined)}
      />
    </Page>
  );
}

/**
 * A file's picture — `Thumb` for an image, a typed plate for anything else.
 *
 * `Thumb` is what every other surface in the product uses, and it brings the
 * three things the raw `<img>` here did not have: a fallback when the key is
 * gone or private, containment rather than a crop, and the tone system. A lab
 * PDF has no picture at all, so it gets its extension and a category glyph —
 * which is more identifying than a grey rectangle.
 */
function MediaThumb({ item, size, className }: { item: MediaItem; size?: number; className?: string }) {
  if (item.isImage) {
    return <Thumb src={item.url} alt={PURPOSE_LABEL[item.purpose] ?? item.purpose} size={size} radius={size ? "lg" : "none"} className={cn("aspect-square", className)} />;
  }
  const Icon = iconOf(item.purpose);
  return (
    <div
      className={cn("grid aspect-square shrink-0 place-items-center bg-surface-2 text-muted-foreground", size ? "rounded-lg" : "", className)}
      style={size ? { width: size, height: size } : undefined}
    >
      <div className="space-y-1 px-2 text-center">
        <Icon className={cn("mx-auto", size ? "size-4" : "size-6")} />
        {!size && <div className="font-mono text-micro uppercase">{item.contentType.split("/").pop()}</div>}
      </div>
    </div>
  );
}

/**
 * ONE FILE, AND EVERY QUESTION ANSWERED IN ORDER (§7).
 *
 * There was no detail view at all: a file's only affordance was a delete button
 * over its corner, so "what is this, whose is it, when was it added, can I open
 * the full size" had no answer anywhere in the product. A detail sheet is a
 * sequence of labelled answers, and destruction belongs at the bottom of it
 * rather than one mis-tap from a gallery scroll.
 */
function MediaDetail({ item, onClose, onDelete }: {
  item: MediaItem | null;
  onClose: () => void;
  onDelete: (it: MediaItem) => void;
}) {
  if (!item) return null;
  return (
    <Sheet
      open
      onClose={onClose}
      title={labelOf(item)}
      footer={item.canDelete ? (
        <Button size="lg" variant="outline" className="w-full border-danger/40 text-danger" onClick={() => onDelete(item)}>
          <Trash2 /> Delete this file
        </Button>
      ) : undefined}
    >
      <div className="space-y-4">
        {item.isImage ? (
          <Thumb src={item.url} alt={labelOf(item)} ratio="photo" radius="2xl" className="w-full" />
        ) : (
          <div className="grid aspect-[4/3] w-full place-items-center rounded-2xl bg-surface-2 text-muted-foreground">
            <div className="space-y-2 text-center">
              <IconBadge icon={iconOf(item.purpose)} tone="sleep" />
              <div className="font-mono text-caption uppercase">{item.contentType.split("/").pop()}</div>
            </div>
          </div>
        )}

        <Group>
          <Row trailing={<span className="text-body text-muted-foreground">{labelOf(item)}</span>}>Kind</Row>
          {item.clientName && <Row trailing={<span className="text-body text-muted-foreground">{item.clientName}</span>}>Client</Row>}
          {item.ownerName && <Row trailing={<span className="text-body text-muted-foreground">{item.ownerName}</span>}>Uploaded by</Row>}
          <Row trailing={<span className="numeral text-body text-muted-foreground">{fmtDate(item.createdAt)}</span>}>Added</Row>
          <Row trailing={<span className="numeral text-body text-muted-foreground">{fmtBytes(item.sizeBytes)}</span>}>Size</Row>
          <Row trailing={<span className="font-mono text-caption text-muted-foreground">{item.contentType}</span>}>Type</Row>
        </Group>

        {/* The way to the file itself. A media URL is authed and same-origin, so
            the browser's own viewer is the right full-size view — there is no
            lightbox to build here. */}
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" asChild>
            <a href={item.url} target="_blank" rel="noreferrer"><ExternalLink /> Open full size</a>
          </Button>
          <Button variant="secondary" asChild aria-label="Download">
            <a href={item.url} download><Download /></a>
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
