/**
 * Widget Profiles — the list page for the reusable-entities model. A widget profile
 * is a reusable overlay layout authored once (in the builder, a separate task) and
 * referenced by any number of channels. This page lists profiles: create, rename,
 * delete, and open in the builder.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, LayoutGrid, Pencil, Trash2, ChevronRight } from "lucide-react";
import { Button } from "../components/ui/button.js";
import { Card, CardContent } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Badge } from "../components/ui/badge.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog.js";
import { PageHeader } from "../components/page-header.js";
import { usePageChrome } from "../components/page-chrome.js";
import { confirmDialog } from "../components/confirm.js";
import { useCan } from "../permissions.js";
import { ProfileStartDialog } from "../builder/ProfileStartDialog.js";
import { toast } from "@4dl/ui";
import { EmptyState } from "../components/empty.js";
import {
  listWidgetProfiles, updateWidgetProfile, deleteWidgetProfile,
  type WidgetProfile,
} from "../api.js";

const DEFAULT_W = 1920;
const DEFAULT_H = 1080;

export function WidgetProfilesPage() {
  const can = useCan();
  const canCreate = can("widget", "create");
  const canWrite = can("widget", "update");
  const canDelete = can("widget", "delete");
  const [profiles, setProfiles] = useState<WidgetProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WidgetProfile | null>(null);
  const [starting, setStarting] = useState(false);
  const navigate = useNavigate();

  const reload = () => {
    setError(null);
    return listWidgetProfiles().then(setProfiles).catch((e) => setError(e instanceof Error ? e.message : String(e))).finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, []);

  const newBtn = canCreate ? <Button onClick={() => setStarting(true)}><Plus className="size-4" /> New profile</Button> : undefined;

  // Primary action + breadcrumb live in the shell top bar (matches every page).
  usePageChrome(
    { crumbs: [{ label: "Widget profiles" }], actions: canCreate ? [{ key: "new", label: "New profile", icon: <Plus className="size-4" />, onClick: () => setStarting(true) }] : [] },
    [canCreate],
  );

  async function remove(p: WidgetProfile) {
    const ok = await confirmDialog({
      title: `Delete “${p.name}”?`,
      description: "This removes the profile and its overlay layout. Channels referencing it will lose the overlay.",
      confirmText: "Delete profile",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteWidgetProfile(p.id);
      reload();
      toast.success(`“${p.name}” deleted.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete profile");
    }
  }

  return (
    <div>
      <PageHeader
        title="Widget profiles"
        description={
          loading
            ? "Reusable overlay layouts you can assign to any channel."
            : `${profiles.length} profile${profiles.length === 1 ? "" : "s"} · reusable across channels`
        }
      />

      {error && !loading ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center text-sm text-muted-foreground">Couldn't reach the API: {error}</CardContent>
        </Card>
      ) : loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="flex items-start gap-3.5">
                <Skeleton className="size-11 rounded-xl" />
                <div className="flex-1 space-y-2 py-1">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : profiles.length === 0 ? (
        <EmptyState
          scena="idle"
          title="No widget profiles yet"
          description="Start from a template, a blank canvas, or a copy — then assign it to any channel. Author once, reuse everywhere."
          action={newBtn}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((p) => (
            <Card
              key={p.id}
              onClick={() => navigate(`/widgets?profile=${p.id}`)}
              className="group cursor-pointer hover:border-primary/40 hover:shadow-md"
            >
              <CardContent className="flex items-start gap-3.5">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <LayoutGrid className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{p.name}</span>
                    <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="tabular-nums">{p.design_w ?? DEFAULT_W}×{p.design_h ?? DEFAULT_H}</Badge>
                    <span className="text-xs text-muted-foreground">Reusable · shared across channels</span>
                  </div>
                </div>
                {(canWrite || canDelete) && <div className="-mr-1 flex shrink-0 gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                  {canWrite && <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={(e) => { e.stopPropagation(); setEditing(p); }}
                    title="Rename profile"
                  >
                    <Pencil className="size-4" />
                  </Button>}
                  {canDelete && <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); remove(p); }}
                    title="Delete profile"
                  >
                    <Trash2 className="size-4" />
                  </Button>}
                </div>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ProfileStartDialog open={starting} onOpenChange={setStarting} profiles={profiles} />
      <RenameProfile profile={editing} onOpenChange={(v) => { if (!v) setEditing(null); }} onSaved={() => { setEditing(null); reload(); }} />
    </div>
  );
}

function RenameProfile({ profile, onOpenChange, onSaved }: { profile: WidgetProfile | null; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (profile) setName(profile.name); }, [profile]);
  async function save() {
    if (!profile) return;
    setBusy(true);
    try {
      await updateWidgetProfile(profile.id, { name: name.trim() || profile.name });
      onSaved();
      toast.success("Profile renamed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not rename profile");
    } finally { setBusy(false); }
  }
  return (
    <Dialog open={!!profile} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Rename profile</DialogTitle></DialogHeader>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
