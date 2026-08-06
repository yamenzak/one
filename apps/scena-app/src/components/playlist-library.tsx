/**
 * THE PLAYLIST LIBRARY — one surface, two products.
 *
 * Slide playlists and music playlists were the same screen written twice: the
 * same `<Table>` with a name column and a ⋮ cell, the same search box, the same
 * tag filter, and the same three dialogs (create, rename, tags) with different
 * API functions inside them. Around four hundred lines, duplicated, and they had
 * already drifted — the slide list reported a failed load as
 * `Couldn't reach the API: [object Object]`, the music list reported one by
 * rendering `LoadError` and the "no music playlists yet" empty state STACKED,
 * because its catch wrote `[]` into the same state the empty branch reads.
 *
 * `@4dl/ui`'s `Collection` owns the five states. What is left over is the
 * product plumbing — which verbs create/rename/delete one of these, where a row
 * navigates, what a row says — and that is what this takes as parameters. It
 * deliberately does NOT own the row: a slide playlist's second line is its
 * timing and transition, a music playlist's is its length and genres, and a
 * component that tried to render both would grow a `kind` prop and two branches.
 *
 * ⚠️ It owns the SEARCH and FACET state, so a caller cannot ship a list whose
 * no-results copy names only the search — the defect both of these had.
 */

import { useMemo, useState, type ReactNode } from "react";
import { MoreVertical, Pencil, Plus, Tag as TagIcon, Trash2, type LucideIcon } from "lucide-react";
import { Collection, Filters, toast, type FacetSelection } from "@4dl/ui";
import { Button } from "./ui/button.js";
import { Input } from "./ui/input.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog.js";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "./ui/dropdown-menu.js";
import { ConfirmDialog } from "./confirm-dialog.js";
import { TagEditor } from "./tag-editor.js";

/** The shape both playlist kinds share. Everything else is the caller's. */
export interface PlaylistLike {
  id: string;
  name: string;
  tags?: string[] | null;
}

export interface PlaylistLibraryProps<T extends PlaylistLike> {
  /** Lower-case plural, used in the copy `Collection` writes for itself. */
  noun: string;
  items: T[] | null;
  /** The message a failed load produced, or null. */
  error: string | null;
  /** Re-run the load — for the retry button and after every write. */
  reload: () => void;

  perms: { create: boolean; write: boolean; delete: boolean };

  /** The three verbs. `create` answers with the new id so the caller can open it. */
  create: (name: string) => Promise<string>;
  update: (id: string, patch: { name?: string; tags?: string[] }) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;

  /** Where a freshly-created playlist takes you. */
  onCreated: (id: string) => void;

  /** Copy. Each of these differs between the two, so none of it is defaulted. */
  createLabel: string;
  createTitle: string;
  createPlaceholder: string;
  /** What an unnamed playlist is called — never the placeholder, which is an example. */
  defaultName: string;
  empty: { icon: LucideIcon; title: string; description: string };
  deleteDescription: string;

  /**
   * Extra fields the search should match, beyond the name — music playlists
   * are searched by genre. Returns the haystack, lower-cased by the caller or
   * not; this lower-cases it.
   */
  searchText?: (item: T) => string;

  /** The row. `menu` is the ⋮ this component owns; place it in the trailing slot. */
  row: (item: T, menu: ReactNode) => ReactNode;
}

export function PlaylistLibrary<T extends PlaylistLike>({
  noun, items, error, reload, perms, create, update, remove, onCreated,
  createLabel, createTitle, createPlaceholder, defaultName, empty, deleteDescription, searchText, row,
}: PlaylistLibraryProps<T>) {
  const [q, setQ] = useState("");
  const [facets, setFacets] = useState<FacetSelection>({ tag: null });
  const [newOpen, setNewOpen] = useState(false);
  const [rename, setRename] = useState<T | null>(null);
  const [tagsOf, setTagsOf] = useState<T | null>(null);
  const [del, setDel] = useState<T | null>(null);

  const allTags = useMemo(() => [...new Set((items ?? []).flatMap((p) => p.tags ?? []))].sort(), [items]);
  const facetGroups = useMemo(
    () => [{ key: "tag", label: "Tag", options: allTags.map((t) => ({ value: t, label: t })) }],
    [allTags],
  );
  const shown = useMemo(() => {
    if (!items) return null;
    const needle = q.trim().toLowerCase();
    return items.filter((p) => {
      const hay = `${p.name} ${searchText?.(p) ?? ""}`.toLowerCase();
      return (!needle || hay.includes(needle)) && (!facets.tag || (p.tags ?? []).includes(facets.tag));
    });
  }, [items, q, facets, searchText]);

  const newButton = perms.create ? (
    <Button onClick={() => setNewOpen(true)}><Plus className="size-4" /> {createLabel}</Button>
  ) : undefined;

  const menu = (p: T) => (perms.write || perms.delete) ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${p.name}`}><MoreVertical className="size-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {perms.write && <DropdownMenuItem onClick={() => setRename(p)}><Pencil className="size-4" /> Rename</DropdownMenuItem>}
        {perms.write && <DropdownMenuItem onClick={() => setTagsOf(p)}><TagIcon className="size-4" /> Tags…</DropdownMenuItem>}
        {perms.delete && <DropdownMenuItem className="text-destructive" onClick={() => setDel(p)}><Trash2 className="size-4" /> Delete</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : undefined;

  return (
    <div>
      <Collection
        items={shown}
        itemKey={(p: T) => p.id}
        error={error}
        onRetry={reload}
        noun={noun}
        query={q}
        onQuery={setQ}
        narrowed={Boolean(facets.tag)}
        onClearFilters={() => setFacets({ tag: null })}
        filter={<Filters groups={facetGroups} value={facets} onChange={setFacets} />}
        action={newButton}
        empty={{ ...empty, action: newButton }}
        renderList={(p: T) => row(p, menu(p))}
      />

      <NameDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        title={createTitle}
        placeholder={createPlaceholder}
        confirmLabel="Create"
        initial=""
        onSave={async (name) => { const id = await create(name || defaultName); toast.success("Playlist created."); onCreated(id); }}
      />
      <NameDialog
        open={!!rename}
        onOpenChange={(o) => !o && setRename(null)}
        title="Rename playlist"
        placeholder="Name"
        confirmLabel="Save"
        initial={rename?.name ?? ""}
        onSave={async (name) => {
          if (!rename || name === rename.name) return;
          await update(rename.id, { name });
          toast.success("Renamed");
          reload();
        }}
      />
      <TagsDialog
        playlist={tagsOf}
        onClose={() => setTagsOf(null)}
        onSave={async (tags) => { if (!tagsOf) return; await update(tagsOf.id, { tags }); toast.success("Tags saved"); reload(); }}
      />
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={del ? `Delete “${del.name}”?` : ""}
        description={deleteDescription}
        confirmLabel="Delete playlist"
        destructive
        onConfirm={async () => {
          if (!del) return;
          try { await remove(del.id); toast.success("Playlist deleted"); setDel(null); reload(); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
        }}
      />
    </div>
  );
}

/**
 * One name field, used for create AND rename.
 *
 * They were two near-identical dialogs per file — four in all — and only one of
 * the four kept its button disabled while the write was in flight. A double-tap
 * on the other three created two playlists.
 */
function NameDialog({ open, onOpenChange, title, placeholder, confirmLabel, initial, onSave }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  placeholder: string;
  confirmLabel: string;
  initial: string;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  /*
   * Reset when the dialog OPENS or is re-targeted at a different row, adjusted
   * during render rather than in an effect — an effect would paint the previous
   * playlist's name for a frame, which on the rename dialog is somebody else's
   * name appearing in your field.
   */
  const [seen, setSeen] = useState<string | null>(null);
  const sig = open ? `${initial}` : null;
  if (seen !== sig) { setSeen(sig); setName(initial); }

  async function save() {
    if (busy) return;
    setBusy(true);
    try { await onSave(name.trim()); onOpenChange(false); }
    catch (e) { toast.error(e instanceof Error ? e.message : "That didn’t go through."); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <Input
          autoFocus
          maxLength={80}
          placeholder={placeholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
        />
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TagsDialog<T extends PlaylistLike>({ playlist, onClose, onSave }: {
  playlist: T | null;
  onClose: () => void;
  onSave: (tags: string[]) => Promise<void>;
}) {
  const [tags, setTags] = useState<string[]>(playlist?.tags ?? []);
  const [seen, setSeen] = useState(playlist?.id ?? null);
  const [busy, setBusy] = useState(false);
  if (seen !== (playlist?.id ?? null)) { setSeen(playlist?.id ?? null); setTags(playlist?.tags ?? []); }

  async function save() {
    setBusy(true);
    try { await onSave(tags); onClose(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save tags"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={!!playlist} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Tags · {playlist?.name}</DialogTitle></DialogHeader>
        <TagEditor tags={tags} onChange={setTags} placeholder="Add a tag…" />
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
