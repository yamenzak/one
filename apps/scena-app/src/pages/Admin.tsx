/**
 * THE OPERATOR CONSOLE'S SCENA-SPECIFIC PANELS.
 *
 * ⚠️ This file no longer renders a page, and it is now down to the five panels
 * that are genuinely Scena's: the public track library, promo codes, the
 * workspace list, its own operator settings and the factory reset.
 * `AdminDoor.tsx` mounts them as sections alongside the platform's own.
 *
 * ⚠️ Three of the original seven are GONE, not moved-and-kept — the plan
 * catalog, the AI model rates and the Stripe credential form are `@4dl/admin`'s
 * panels now, and each departure is marked in place with what the shared one
 * does that this could not. A panel kept "just in case" is a second screen
 * writing the same `app_config` rows with no rule about which wins, which is
 * exactly what the email form here was doing against the console's own
 * `PlatformEmailSection`.
 *
 * What it used to be: a `TabsList` at `/admin` INSIDE the studio Shell. Two
 * things were wrong with that and only one was cosmetic. `/api/admin/*` has
 * been restricted to the `admin.` door since Stage 3, so in production the
 * route rendered the whole console and then 404'd on every call. And a tab
 * strip puts each subject one scroll apart with the rest invisible below —
 * "Workspaces" lists every workspace, "Public library" every track.
 *
 * The panels themselves are unchanged apart from losing the `addOpen` prop the
 * old shell threaded in to inject an "Add" into the page chrome. Both list
 * panels already rendered their own Add button, so that was a duplicate
 * control, not a lost one.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Music,
  Ticket,
  Users,
  RefreshCw,
  AlertTriangle,
  Tag,
  Search,
  Upload,
  Trash2,
  ImagePlus,
  Plus,
  Pencil,
} from "lucide-react";
import { FEATURE_CATALOG, QUOTA_CATALOG, FEATURE_CATEGORIES } from "@scena/manifest";
import { Badge, Button, Card, cn, confirm, Dialog, DialogContent, DialogDescription, DialogFooter, EmptyState, Group, Input, Label, Row, SectionHeader, Select, Skeleton, StatCard, StatusDot, toast, type Tone } from "@4dl/ui";
import {
  getAdminConfig,
  setAdminConfig,
  adminListPlans,
  adminListPromos,
  adminCreatePromo,
  adminTogglePromo,
  adminListTenants,
  adminAdjustCredits,
  adminTenantLifecycle,
  adminGetTenantEntitlements,
  adminSetTenantOverrides,
  adminSweep,
  uploadAsset,
  adminListLibrary,
  adminAddLibraryTrack,
  adminUpdateLibraryTrack,
  adminDeleteLibraryTrack,
  nukeRequest,
  nukeConfirm,
  type AdminPlanRef,
  type PromoCode,
  type AdminTenant,
  type LibraryTrack,
} from "../api.js";

const num = (n: number) => n.toLocaleString();

/** A compact search field, matching the list pages' toolbar pattern. */
function SearchBox({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full pl-8" />
    </div>
  );
}

/** Section header inside a config card. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-micro uppercase text-muted-foreground">{children}</div>;
}

function Loading() {
  return (
    <div className="space-y-2.5 py-1">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-11 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function DangerTab() {
  const [stage, setStage] = useState<"idle" | "sent">("idle");
  const [sentTo, setSentTo] = useState("");
  const [otp, setOtp] = useState("");
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestCode() {
    setBusy(true);
    try {
      const r = await nukeRequest();
      if (r.error || !r.ok) throw new Error(r.error || "Could not send code");
      setSentTo(r.sentTo || "your admin email");
      setStage("sent");
      toast.success("Confirmation code emailed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send code");
    } finally {
      setBusy(false);
    }
  }

  async function confirmWipe() {
    const ok = await confirm({
      title: "Wipe everything — are you absolutely sure?",
      description: "This permanently deletes every workspace, user, screen, channel, board, and uploaded file across the whole platform. There is no undo.",
      confirmLabel: "Wipe everything",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await nukeConfirm(otp.trim(), phrase.trim());
      if (r.error || !r.ok) throw new Error(r.error || "Wipe failed");
      toast.success(`Wiped ${r.tables ?? 0} tables · ${r.objects ?? 0} files. Reloading…`);
      // Our own session is gone now — send everyone back to a clean login.
      setTimeout(() => {
        window.location.href = "/";
      }, 1500);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Wipe failed");
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-2xl border-destructive/40">
      <SectionHeader
        title={
          <>
            <AlertTriangle className="size-4" /> Factory reset
          </>
        }
        className="mb-4"
      />
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-body text-muted-foreground">
        Permanently deletes <b className="text-foreground">everything</b> — all workspaces, users, screens, channels, boards, credentials, and uploaded media —
        and resets this deployment to a fresh install. The plan catalog is re-seeded so it stays usable.{" "}
        <b className="text-foreground">This cannot be undone.</b>
      </div>

      {stage === "idle" ? (
        <Button variant="destructive" className="w-fit" disabled={busy} onClick={requestCode}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <AlertTriangle className="size-4" />} Start factory reset
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-body text-muted-foreground">
            We emailed a 6-digit code to <span className="font-medium text-foreground">{sentTo}</span>. Enter it and type the phrase to confirm.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="nuke-otp">Confirmation code</Label>
              <Input
                id="nuke-otp"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                className="font-mono tracking-[0.3em]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nuke-phrase">
                Type <span className="font-mono text-destructive">WIPE EVERYTHING</span>
              </Label>
              <Input id="nuke-phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="WIPE EVERYTHING" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="destructive" disabled={busy || otp.length < 6 || phrase.trim() !== "WIPE EVERYTHING"} onClick={confirmWipe}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <AlertTriangle className="size-4" />} Wipe everything now
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setStage("idle");
                setOtp("");
                setPhrase("");
              }}
            >
              Cancel
            </Button>
            <button type="button" className="text-caption text-muted-foreground hover:text-foreground" disabled={busy} onClick={requestCode}>
              Resend code
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* -------------------------------- Stripe --------------------------------- */
/**
 * SCENA'S OWN OPERATOR SETTINGS — what is left after the shared panels took the
 * rest.
 *
 * ── What this replaces ──────────────────────────────────────────────────────
 *
 * `StripeTab` was three panels wearing one coat, and two of the three belonged
 * to packages that already ship a better version:
 *
 *   Stripe credentials   → `PlatformStripeSection`. Two LANES (test/live) with
 *                          the mismatch alarm and the catalog-id stash, where
 *                          this had one flat set of keys and no way to tell you
 *                          the stored catalog belonged to the other lane.
 *   Email                → `PlatformEmailSection`, which this console ALREADY
 *                          mounted as its own section. Two screens writing the
 *                          same `app_config` rows is not a duplicate control, it
 *                          is two answers to "what is the sender" with no rule
 *                          about which wins.
 *   Gemini key, AI mock,
 *   AI markup            → `PlatformAiSection`, which reads the MERGED config so
 *                          it can say a key came from the shared platform store
 *                          rather than reporting "no key" and inviting an
 *                          operator to paste one in — which would write a
 *                          permanent per-app override of the shared value.
 *
 * What genuinely is Scena's is below: its own dunning windows (Scena runs its
 * own two-rung ladder, not `@4dl/billing`'s four) and the platform OpenWeather
 * key, which no other product has.
 */
/**
 * ⚠️ THE KEYS THIS FORM OWNS, and the list is the point.
 *
 * The panel this replaces loaded the WHOLE config map and posted the whole thing
 * back on save — which is how one screen came to own every key any other screen
 * displayed, and why moving Stripe and email out of it was not just a deletion.
 * Posting a key you merely happen to be holding is how a stale value overwrites
 * a fresh one written from another panel thirty seconds earlier.
 *
 * The server refuses `stripe.*` outright now (`configWriteRefusal`), so sending
 * the whole map would not silently misbehave — it would 400 and this form would
 * be unsavable. Which is the better failure, and still a failure.
 */
const SCENA_CONFIG_KEYS = ["billing.grace_days", "billing.delete_days", "weather.api_key", "weather.onecall_version", "weather.credits_per_call"];

export function ScenaSettingsTab() {
  const [cfg, setCfg] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAdminConfig()
      .then(setCfg)
      // A failed load must not render as an empty FORM: every field would show a
      // blank, and pressing Save would write those blanks over real settings.
      .catch(() => setCfg(null));
  }, []);
  if (!cfg) return <Loading />;

  const set = (k: string, v: string) => setCfg({ ...cfg, [k]: v });

  async function save() {
    setBusy(true);
    try {
      const mine = Object.fromEntries(SCENA_CONFIG_KEYS.map((k) => [k, cfg![k] ?? ""]));
      await setAdminConfig(mine);
      toast.success("Settings saved.");
    } catch (e) {
      // The server refuses some values outright. Without this catch the
      // rejection went to the app-wide "something went wrong" toast, which tells
      // an operator nothing about WHICH field was refused, and the form kept
      // showing a value that was never stored.
      toast.error(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  }

  const field = (key: string, label: string, placeholder = "", helper?: string) => (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Input
        value={cfg[key] ?? ""}
        onChange={(e) => set(key, e.target.value)}
        placeholder={placeholder}
        className={cn(key.includes("key") && "font-mono")}
      />
      {helper ? <span className="text-caption text-muted-foreground">{helper}</span> : null}
    </div>
  );

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <Card>
        <div className="mb-4">
          <h3 className="text-title-3">Dunning windows</h3>
          <p className="text-body text-muted-foreground">
            How long a workspace stays live after a payment fails, and how long its data is kept after that.
          </p>
        </div>
        {field("billing.grace_days", "Grace days (past-due → suspend)")}
        {field("billing.delete_days", "Delete days (suspend → auto-delete)")}
        <div className="pt-1">
          <Button disabled={busy} onClick={save}>Save</Button>
        </div>
      </Card>

      <Card>
        <div className="mb-4">
          <h3 className="text-title-3">Weather</h3>
          <p className="text-body text-muted-foreground">
            The company key behind every weather source. Empty means locations show mock conditions, for free.
          </p>
        </div>
        {field(
          "weather.api_key",
          "Platform OpenWeather key",
          "OpenWeather One Call key…",
          "Each real fetch charges the workspace the per-call price below — per location, once an hour, inside its opening-hours window.",
        )}
        <div className="flex flex-col gap-1.5">
          <Label>OpenWeather One Call version</Label>
          <Select
            value={cfg["weather.onecall_version"] ?? "4.0"}
            onChange={(v) => set("weather.onecall_version", v)}
            className="w-full"
            options={[
              { value: "4.0", label: "4.0 (current)" },
              { value: "3.0", label: "3.0 (legacy)" },
            ]}
          />
          <p className="text-caption text-muted-foreground">
            Match your key&rsquo;s subscription — a key is subscribed to one version, not both. New keys are 4.0.
          </p>
        </div>
        {field("weather.credits_per_call", "Weather credits per call", "3")}
        <div className="pt-1">
          <Button disabled={busy} onClick={save}>Save</Button>
        </div>
      </Card>
    </div>
  );
}

/* --------------------------------- Plans --------------------------------- */
/*
  THE PLAN CATALOG EDITOR IS `@4dl/admin`'s NOW — `PlatformPlansSection`,
  mounted from `AdminDoor.tsx`.

  What was here: an inline price/grant editor plus a modal for the rest, over a
  `PUT` where the other apps used a `PATCH`, and with no GRANDFATHERING at all —
  so tightening a tier took the capability away from every workspace already on
  it, and the help text described that as the design. It also could not edit the
  free TRIAL, which is the thing that replaced the free tier here.

  The rows are still derived from `@scena/manifest`'s catalogs, which is what
  made the move cheap: the server hands the panel `quotaKeys`/`featureKeys` and
  their labels (see `entitlements.ts`'s `PLAN_*_META`), so a feature added to the
  catalog still appears in the editor on its own.
*/

/* -------------------------------- Models --------------------------------- */
/*
  THE AI MODEL CATALOG IS `@4dl/admin`'s NOW — `PlatformAiSection`, over
  `@4dl/ai`'s `aiCatalogAdminRoutes`, mounted from `AdminDoor.tsx`.

  What this file had was a rate table and three toggles over Scena's own
  bespoke admin handlers, which are deleted with it. What the shared panel
  adds is everything around them:

    • the provider key and the mock lane read from the MERGED config, so a key
      set once in the shared platform store reads as SET here rather than
      inviting an operator to paste a second copy — which would write a
      permanent per-app override of the shared value;
    • the per-lane default-model picker, which says when its list is filtered
      rather than silently offering nothing;
    • **"Apply to every 4DL app"** — the broadcast that is the entire reason the
      shared selection exists, and which Scena could neither send nor receive.

  The rate rows themselves are unchanged: `ai_models` has been `@4dl/ai`'s since
  `AI_SCHEMA` became entry seven of `SCHEMA_MODULES`, so this is the surface
  catching up with the store.
*/

/* ---------------------------- Public library ----------------------------- */
export function LibraryTab() {
  const [tracks, setTracks] = useState<LibraryTrack[] | null>(null);
  const [q, setQ] = useState("");
  // null = closed · "new" = add · a track = edit.
  const [dialog, setDialog] = useState<LibraryTrack | "new" | null>(null);
  const reload = () =>
    adminListLibrary()
      .then((r) => setTracks(r.tracks))
      .catch(() => setTracks([]));
  useEffect(() => {
    reload();
  }, []);
  const close = () => setDialog(null);
  if (!tracks) return <Loading />;

  const needle = q.trim().toLowerCase();
  const visible = needle ? tracks.filter((t) => `${t.title} ${t.artist ?? ""} ${t.genre ?? ""}`.toLowerCase().includes(needle)) : tracks;
  const genres = new Set(tracks.map((t) => t.genre || "Uncategorized")).size;
  const runtime = tracks.reduce((s, t) => s + t.duration_ms, 0);

  async function del(t: LibraryTrack) {
    const ok = await confirm({
      title: `Delete “${t.title}”?`,
      description: "This removes the track from every tenant's public library.",
      confirmLabel: "Delete track",
      destructive: true,
    });
    if (!ok) return;
    await adminDeleteLibraryTrack(t.id);
    reload();
    toast.success("Track deleted.");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Tracks" value={num(tracks.length)} />
        <StatCard label="Genres" value={num(genres)} />
        <StatCard label="Total runtime" value={mmss(runtime)} />
      </div>
      <Card>
        <div className="mb-4 gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-title-3">Public library</h3>
              <p className="text-body text-muted-foreground">Licensed tracks available to every tenant whose plan includes the Music library.</p>
            </div>
            <div className="flex items-center gap-2">
              {tracks.length > 0 && <SearchBox value={q} onChange={setQ} placeholder="Search tracks…" className="w-full sm:w-56" />}
              <Button onClick={() => setDialog("new")}>
                <Plus className="size-4" /> Add track
              </Button>
            </div>
          </div>
        </div>
        {tracks.length === 0 ? (
          <EmptyState
            icon={Music}
            title="No public tracks yet"
            description="Upload licensed audio to build the shared library every tenant can use."
            action={
              <Button onClick={() => setDialog("new")}>
                <Plus className="size-4" /> Add your first track
              </Button>
            }
            className="border-0 bg-transparent py-8"
          />
        ) : visible.length === 0 ? (
          <div className="py-10 text-center text-body text-muted-foreground">No tracks match your search.</div>
        ) : (
          <Group>
            {visible.map((t, i) => (
              <Row
                key={t.id}
                divider={i < visible.length - 1}
                onClick={() => setDialog(t)}
                leading={
                  <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md bg-surface-2 text-muted-foreground">
                    {t.art_url ? <img src={t.art_url} alt="" className="size-full object-cover" /> : <Music className="size-4" />}
                  </span>
                }
                sub={[t.artist || null, t.genre || "Uncategorized", t.vocal || null].filter(Boolean).join(" · ")}
                trailing={
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="numeral mr-1 text-caption text-muted-foreground">{mmss(t.duration_ms)}</span>
                    <Button size="icon-sm" variant="ghost" aria-label={`Edit ${t.title}`} onClick={(e) => { e.stopPropagation(); setDialog(t); }}>
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-danger"
                      aria-label={`Delete ${t.title}`}
                      onClick={(e) => { e.stopPropagation(); void del(t); }}
                    >
                      <Trash2 />
                    </Button>
                  </span>
                }
              >
                {t.title}
              </Row>
            ))}
          </Group>
        )}
      </Card>
      <TrackDialog track={dialog === "new" ? null : dialog} open={dialog !== null} onClose={close} onSaved={reload} />
    </div>
  );
}

/** Add or edit a public-library track. In add mode it uploads the audio; in edit
 *  mode the audio is immutable (content-addressed) so only metadata + art change. */
function TrackDialog({ track, open, onClose, onSaved }: { track: LibraryTrack | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const editing = !!track;
  const [genre, setGenre] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [vocal, setVocal] = useState<"" | "vocal" | "instrumental">("");
  const [art, setArt] = useState<{ hash: string; url: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const artRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setGenre(track?.genre ?? "");
    setTitle(track?.title ?? "");
    setArtist(track?.artist ?? "");
    setVocal((track?.vocal as "vocal" | "instrumental" | null) || "");
    setArt(track?.art_hash && track?.art_url ? { hash: track.art_hash, url: track.art_url } : null);
    setFile(null);
  }, [open, track]);

  async function onArt(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const { hash, url } = await uploadAsset(f);
      setArt({ hash, url });
    } catch {
      toast.error("Could not upload cover art");
    }
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setFile(f);
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  async function submit() {
    if (!genre.trim()) {
      toast.error("Pick a genre.");
      return;
    }
    setBusy(true);
    try {
      if (editing && track) {
        const r = await adminUpdateLibraryTrack(track.id, {
          genre: genre.trim(),
          title: title.trim(),
          artist: artist.trim(),
          vocal: vocal || null,
          artHash: art?.hash ?? null,
          artUrl: art?.url ?? null,
        });
        if (r.error) {
          toast.error(r.error);
          return;
        }
        toast.success("Track updated.");
      } else {
        if (!file) {
          toast.error("Choose an audio file.");
          return;
        }
        const durationMs = await audioFileDuration(file);
        const { hash, url } = await uploadAsset(file);
        const r = await adminAddLibraryTrack({
          genre: genre.trim(),
          title: title.trim() || file.name.replace(/\.[^.]+$/, ""),
          artist: artist.trim(),
          assetHash: hash,
          assetUrl: url,
          durationMs,
          vocal: vocal || undefined,
          artHash: art?.hash,
          artUrl: art?.url,
        });
        if (r.error) {
          toast.error(r.error);
          return;
        }
        toast.success("Added to the public library — licensed for every tenant with the Music library feature.");
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent title={editing ? "Edit track" : "Add a track"} className="sm:max-w-md">
        <DialogDescription>
          {editing
            ? "Update the track's details. The audio itself is immutable — delete and re-add to swap the file."
            : "Upload audio the platform is licensed to share. It becomes available to every tenant whose plan includes the Music library."}
        </DialogDescription>
        <div className="flex flex-col gap-3 py-2">
          <div className="space-y-1.5">
            <Label>Genre</Label>
            <Input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="Lo-fi, Jazz, Ambient…" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>
                Title <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="from filename" />
            </div>
            <div className="space-y-1.5">
              <Label>
                Artist <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input value={artist} onChange={(e) => setArtist(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={vocal || "unset"}
              onChange={(v) => setVocal(v === "unset" ? "" : (v as "vocal" | "instrumental"))}
              className="w-full"
              options={[
                { value: "unset", label: "Unset" },
                { value: "vocal", label: "Vocal" },
                { value: "instrumental", label: "Instrumental" },
              ]}
            />
          </div>
          <input ref={artRef} type="file" accept="image/*" onChange={onArt} className="hidden" />
          <input ref={fileRef} type="file" accept="audio/*" onChange={onFile} className="hidden" />
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button variant="outline" onClick={() => artRef.current?.click()}>
              {art ? (
                <>
                  <ImagePlus className="size-4 text-success" /> Cover ✓
                </>
              ) : (
                <>
                  <ImagePlus className="size-4" /> Cover art
                </>
              )}
            </Button>
            {!editing && (
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="size-4" /> {file ? `♪ ${file.name.length > 20 ? file.name.slice(0, 18) + "…" : file.name}` : "Choose audio"}
              </Button>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {editing ? "Save changes" : "Add track"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const mmss = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function audioFileDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("audio");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(el.src);
      resolve(Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : 0);
    };
    el.onerror = () => reject(new Error("could not read audio"));
    el.src = URL.createObjectURL(file);
  });
}

/* -------------------------------- Promos --------------------------------- */
export function PromosTab() {
  const [promos, setPromos] = useState<PromoCode[] | null>(null);
  const [plans, setPlans] = useState<AdminPlanRef[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const reload = () =>
    adminListPromos()
      .then(setPromos)
      .catch(() => {});
  useEffect(() => {
    reload();
    adminListPlans()
      .then(setPlans)
      .catch(() => {});
  }, []);
  const close = () => setDialogOpen(false);
  if (!promos) return <Loading />;

  return (
    <>
      <Card>
        <div className="mb-4 gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-title-3">
                Promo codes <span className="ml-1 text-body font-normal text-muted-foreground tabular-nums">{promos.length}</span>
              </h3>
              <p className="text-body text-muted-foreground">Gift credits or a comped plan to a tenant.</p>
            </div>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" /> New code
            </Button>
          </div>
        </div>
        {promos.length === 0 ? (
          <EmptyState
            icon={Ticket}
            title="No promo codes yet"
            description="Create a credit top-up or plan gift to share with a tenant."
            action={
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="size-4" /> Create a code
              </Button>
            }
            className="border-0 bg-transparent py-8"
          />
        ) : (
            <Group>
              {promos.map((p, i) => (
                <Row
                  key={p.code}
                  divider={i < promos.length - 1}
                  sub={
                    <span className="flex items-center gap-1.5">
                      <Badge tone={p.kind === "plan" ? "primary" : "neutral"}>
                        {p.kind === "plan" ? `Gift ${p.plan_id} · ${p.plan_months}mo` : `${num(p.credits ?? 0)} cr`}
                      </Badge>
                      <span className="truncate">{p.note || "no note"}</span>
                    </span>
                  }
                  trailing={
                    <span className="flex shrink-0 items-center gap-3">
                      {/* Redemptions against the cap — the one number an
                          operator scans down this list. */}
                      <span className="numeral text-caption text-muted-foreground">
                        {p.redeemed_count}
                        {p.max_redemptions ? `/${p.max_redemptions}` : ""}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await adminTogglePromo(p.code);
                          await reload();
                        }}
                      >
                        {p.active ? "Disable" : "Enable"}
                      </Button>
                    </span>
                  }
                >
                  <span className="flex items-center gap-2 font-mono">
                    {p.code}
                    {p.active ? null : <Badge tone="neutral">off</Badge>}
                  </span>
                </Row>
              ))}
            </Group>
        )}
      </Card>
      <PromoDialog open={dialogOpen} plans={plans} onClose={close} onSaved={reload} />
    </>
  );
}

/** Create a promo code (credit top-up or comped plan). */
function PromoDialog({ open, plans, onClose, onSaved }: { open: boolean; plans: AdminPlanRef[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ code: "", kind: "credits", credits: "1000", planId: "pro", planMonths: "12", maxRedemptions: "", note: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setForm({ code: "", kind: "credits", credits: "1000", planId: "pro", planMonths: "12", maxRedemptions: "", note: "" });
  }, [open]);

  async function create() {
    if (!form.code.trim()) return;
    setBusy(true);
    try {
      const r = await adminCreatePromo({
        code: form.code.trim(),
        kind: form.kind,
        credits: Number(form.credits) || 0,
        planId: form.planId,
        planMonths: Number(form.planMonths) || 12,
        maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
        note: form.note,
      });
      if (r.error) {
        toast.error(r.error === "code exists" ? "That code already exists." : r.error);
        return;
      }
      toast.success(`Created ${form.code.trim()}.`);
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent title="New promo code" className="sm:max-w-md">
        <DialogDescription>Gift credits or a comped plan to a tenant. They redeem it from their Billing page.</DialogDescription>
        <div className="flex flex-col gap-3 py-2">
          <div className="space-y-1.5">
            <Label>Code</Label>
            <Input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="WELCOME2026"
              className="font-mono uppercase"
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            {(["credits", "plan"] as const).map((k) => (
              <Button key={k} type="button" variant={form.kind === k ? "default" : "outline"} className="flex-1" onClick={() => setForm({ ...form, kind: k })}>
                {k === "credits" ? "Credit top-up" : "Gift a plan"}
              </Button>
            ))}
          </div>
          {form.kind === "credits" ? (
            <div className="space-y-1.5">
              <Label>Credits granted</Label>
              <Input value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} className="font-mono tabular-nums" />
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="flex-1 space-y-1.5">
                <Label>Plan</Label>
                <Select
                  value={form.planId}
                  onChange={(v) => setForm({ ...form, planId: v })}
                  className="w-full"
                  options={[...plans.map((p) => ({ value: p.id, label: p.name }))]}
                />
              </div>
              <div className="w-24 space-y-1.5">
                <Label>Months</Label>
                <Input value={form.planMonths} onChange={(e) => setForm({ ...form, planMonths: e.target.value })} className="font-mono tabular-nums" />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>
              Max redemptions <span className="font-normal text-muted-foreground">(blank = ∞)</span>
            </Label>
            <Input value={form.maxRedemptions} onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })} className="font-mono tabular-nums" />
          </div>
          <div className="space-y-1.5">
            <Label>Note</Label>
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. gift to Northline Media" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={create} disabled={busy || !form.code.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}Create code
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------- Tenants -------------------------------- */
const TENANT_TONE: Record<string, Tone> = { active: "success", suspended: "muted", pending_delete: "warning" };
/** The built-in demo/sandbox workspace (DEMO_TENANT in the API). It backs the
 *  signed-out demo + fallback content, so it's shown as a system row and shielded
 *  from suspend/delete — nuking it would break the public demo. */
const DEMO_TENANT_ID = "tenant_demo";

export function TenantsTab() {
  const [tenants, setTenants] = useState<AdminTenant[] | null>(null);
  const [overridesFor, setOverridesFor] = useState<string | null>(null);
  const [creditsFor, setCreditsFor] = useState<AdminTenant | null>(null);
  const [q, setQ] = useState("");
  const reload = () =>
    adminListTenants()
      .then(setTenants)
      .catch(() => {});
  useEffect(() => {
    reload();
  }, []);

  async function life(t: AdminTenant, action: "suspend" | "reactivate" | "delete") {
    if (action === "delete") {
      const ok = await confirm({
        title: `Delete all data for ${t.tenant_id}?`,
        description: "This permanently removes all authoring data for the tenant. This is irreversible.",
        confirmLabel: "Delete tenant",
        destructive: true,
      });
      if (!ok) return;
    }
    await adminTenantLifecycle(t.tenant_id, action);
    toast.success(`${t.tenant_id}: ${action}`);
    await reload();
  }
  async function sweep() {
    const r = await adminSweep();
    toast.success(r.actions.length ? `Applied ${r.actions.length} lifecycle transitions.` : "No lifecycle changes due.");
    await reload();
  }

  const needle = q.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!tenants) return null;
    return needle ? tenants.filter((t) => `${t.tenant_id} ${t.plan_id}`.toLowerCase().includes(needle)) : tenants;
  }, [tenants, needle]);

  if (!tenants) return <Loading />;
  const active = tenants.filter((t) => t.status === "active").length;
  const suspended = tenants.filter((t) => t.status !== "active").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Tenants" value={num(tenants.length)} />
        <StatCard label="Active" value={num(active)} tone="success" />
        <StatCard label="Suspended / pending" value={num(suspended)} tone={suspended ? "warning" : "neutral"} />
      </div>

      <Card>
        <div className="mb-4 gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-title-3">Tenants</h3>
              <p className="text-body text-muted-foreground">Adjust credits, entitlement overrides, and lifecycle.</p>
            </div>
            <Button variant="outline" onClick={sweep}>
              <RefreshCw className="size-4" /> Run lifecycle sweep
            </Button>
          </div>
          {tenants.length > 0 && <SearchBox value={q} onChange={setQ} placeholder="Search tenants…" className="w-full sm:w-64" />}
        </div>
        {tenants.length === 0 ? (
          <EmptyState icon={Users} title="No tenants yet" description="Tenants appear here once workspaces sign up." className="border-0 bg-transparent py-8" />
        ) : visible && visible.length === 0 ? (
          <div className="py-10 text-center text-body text-muted-foreground">No tenants match your search.</div>
        ) : (
          <Group>
            {(visible ?? []).map((t, i) => {
              const tone = TENANT_TONE[t.status] ?? "muted";
              const isDemo = t.tenant_id === DEMO_TENANT_ID;
              return (
                <Row
                  key={t.tenant_id}
                  divider={i < (visible?.length ?? 0) - 1}
                  sub={
                    <span className="flex items-center gap-1.5">
                      <StatusDot tone={tone} />
                      <span className="capitalize">{t.status.replace(/_/g, " ")}</span>
                      <span className="capitalize">· {t.plan_id}</span>
                      {t.comp ? <Badge tone="neutral">comped</Badge> : null}
                      {isDemo ? <Badge tone="neutral">demo · system</Badge> : null}
                    </span>
                  }
                  trailing={
                    <span className="flex shrink-0 items-center gap-1.5">
                      {/* The balance is the number an operator scans down this
                          list; the four actions are what they came to press. */}
                      <span className="numeral mr-1 tabular-nums">{num(t.balance)}</span>
                      <Button size="sm" variant="ghost" onClick={() => setOverridesFor(t.tenant_id)}>
                        Overrides
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setCreditsFor(t)}>
                        Credits
                      </Button>
                      {isDemo ? null : t.status === "suspended" ? (
                        <Button size="sm" variant="ghost" onClick={() => life(t, "reactivate")}>
                          Reactivate
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => life(t, "suspend")}>
                          Suspend
                        </Button>
                      )}
                      {isDemo ? null : (
                        <Button size="sm" variant="ghost" className="text-danger hover:text-danger" onClick={() => life(t, "delete")}>
                          Delete
                        </Button>
                      )}
                    </span>
                  }
                >
                  <span className="font-mono">{t.tenant_id}</span>
                </Row>
              );
            })}
          </Group>
        )}
      </Card>
      {overridesFor && (
        <OverridesModal
          tenantId={overridesFor}
          onClose={() => {
            setOverridesFor(null);
            reload();
          }}
        />
      )}
      <AdjustCreditsModal tenant={creditsFor} onClose={() => setCreditsFor(null)} onDone={reload} />
    </div>
  );
}

/* ---------------------------- Credit adjustment --------------------------- */
function AdjustCreditsModal({ tenant, onClose, onDone }: { tenant: AdminTenant | null; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("1000");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (tenant) setAmount("1000");
  }, [tenant]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenant) return;
    setSaving(true);
    try {
      await adminAdjustCredits(tenant.tenant_id, "add", Number(amount) || 0);
      toast.success(`Adjusted credits for ${tenant.tenant_id}.`);
      onDone();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={Boolean(tenant)}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent title="Adjust credits" className="sm:max-w-sm">
        <form onSubmit={submit}>
          <DialogDescription>
            Add credits to <span className="font-mono">{tenant?.tenant_id}</span>. Use a negative amount to remove.
          </DialogDescription>
          <div className="py-4">
            <Label>Amount</Label>
            <Input autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1.5 font-mono tabular-nums" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Apply"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------- Entitlement overrides ------------------------- */

// Overrides cover every quota + feature the catalog knows (safety features are
// always-on, so they're excluded from the per-tenant gift editor).
const OVR_QUOTAS = QUOTA_CATALOG;
const OVR_FEATURES = FEATURE_CATALOG.filter((f) => !f.safety);

function OverridesModal({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof adminGetTenantEntitlements>> | null>(null);
  // Local edit state: quotas as strings ("" = inherit), features tri-state,
  // grant string.
  const [q, setQ] = useState<Record<string, string>>({});
  const [f, setF] = useState<Record<string, "inherit" | "on" | "off">>({});
  const [grant, setGrant] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminGetTenantEntitlements(tenantId)
      .then((d) => {
        setData(d);
        setQ(Object.fromEntries(OVR_QUOTAS.map((x) => [x.key, d.overrides.quotas?.[x.key] != null ? String(d.overrides.quotas![x.key]) : ""])));
        setF(
          Object.fromEntries(
            OVR_FEATURES.map((x) => [x.key, d.overrides.features?.[x.key] == null ? "inherit" : d.overrides.features[x.key] ? "on" : "off"]),
          ) as Record<string, "inherit" | "on" | "off">,
        );
        setGrant(d.overrides.aiCredits?.monthlyGrant != null ? String(d.overrides.aiCredits.monthlyGrant) : "");
      })
      .catch(() => {});
  }, [tenantId]);

  async function save() {
    setSaving(true);
    const quotas: Record<string, number> = {};
    for (const { key } of OVR_QUOTAS) if (q[key]?.trim() !== "" && q[key] != null && !Number.isNaN(Number(q[key]))) quotas[key] = Math.trunc(Number(q[key]));
    const features: Record<string, boolean> = {};
    for (const { key } of OVR_FEATURES)
      if (f[key] === "on") features[key] = true;
      else if (f[key] === "off") features[key] = false;
    const overrides: { quotas?: Record<string, number>; features?: Record<string, boolean>; aiCredits?: { monthlyGrant: number } } = {};
    if (Object.keys(quotas).length) overrides.quotas = quotas;
    if (Object.keys(features).length) overrides.features = features;
    if (grant.trim() !== "" && !Number.isNaN(Number(grant))) overrides.aiCredits = { monthlyGrant: Math.trunc(Number(grant)) };
    await adminSetTenantOverrides(tenantId, overrides);
    setSaving(false);
    toast.success(`Overrides saved for ${tenantId}.`);
    onClose();
  }

  const planQ = data?.plan.quotas ?? {};
  const planGrant = data?.plan.aiCredits.monthlyGrant ?? 0;
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent title="Entitlement overrides" className="flex max-h-[88dvh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogDescription>
          Gift extra allowances on top of <b>{data?.planId ?? "…"}</b> for <span className="font-mono">{tenantId}</span>. Blank = inherit the plan (the plan
          value is shown as a hint). -1 = unlimited.
        </DialogDescription>
        {!data ? (
          <Loading />
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
              <div className="space-y-2">
                <SectionLabel>Quotas</SectionLabel>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {OVR_QUOTAS.map((x) => (
                    <label key={x.key} className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-body text-muted-foreground">
                      <span className="flex-1">{x.label}</span>
                      <Input
                        value={q[x.key] ?? ""}
                        onChange={(e) => setQ({ ...q, [x.key]: e.target.value })}
                        placeholder={String(planQ[x.key] ?? 0)}
                        className="h-8 w-20 text-right font-mono tabular-nums"
                      />
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <SectionLabel>Features</SectionLabel>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {OVR_FEATURES.map((x) => (
                    <label key={x.key} className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-body text-muted-foreground">
                      <span className="flex-1">{x.label}</span>
                      <Select
                        value={f[x.key] ?? "inherit"}
                        onChange={(v) => setF({ ...f, [x.key]: v as "inherit" | "on" | "off" })}
                        className="h-8 w-28"
                        options={[
                          { value: "inherit", label: "Inherit" },
                          { value: "on", label: "Grant on" },
                          { value: "off", label: "Force off" },
                        ]}
                      />
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-body text-muted-foreground">
                <span className="flex-1">Monthly AI credit grant</span>
                <Input
                  value={grant}
                  onChange={(e) => setGrant(e.target.value)}
                  placeholder={String(planGrant)}
                  className="h-8 w-24 text-right font-mono tabular-nums"
                />
              </label>
            </div>
            <DialogFooter className="border-t pt-3">
              <Button
                variant="ghost"
                onClick={() => {
                  setQ(Object.fromEntries(OVR_QUOTAS.map((x) => [x.key, ""])));
                  setF(Object.fromEntries(OVR_FEATURES.map((x) => [x.key, "inherit"])) as Record<string, "inherit" | "on" | "off">);
                  setGrant("");
                }}
              >
                Clear all
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={saving} onClick={save}>
                {saving ? "Saving…" : "Save overrides"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
