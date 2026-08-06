/**
 * Live Boards (§boards) — create queue / room / score boards and watch their
 * live state. Each board auto-issues its own scoped logins (a coordinator + one
 * station per option), shown in the per-board credentials panel; boards are
 * *displayed* by binding a widget to them in the builder. A queue board also
 * opens a public take-a-ticket kiosk. A natural premium module: gating boards
 * per plan slots into the entitlements machinery (§25).
 */

import { Fragment, useEffect, useState } from "react";
import {
  Plus, MonitorPlay, Radio, Ticket, Trash2, LayoutGrid, Rows3,
  KeyRound, RefreshCw, ShieldUser, Eye, EyeOff, Trophy,
} from "lucide-react";
import { ScenaMascot } from "@scena/ui";
import { Button } from "../components/ui/button.js";
import { Card, CardContent } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Switch } from "../components/ui/switch.js";
import { Badge } from "../components/ui/badge.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { PageHeader } from "../components/page-header.js";
import { usePageChrome } from "../components/page-chrome.js";
import { StatusDot } from "../components/status.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog.js";
import { cn } from "@/lib/utils";
import {
  listBoards, createBoard, getBoardAnnounce, setBoardAnnounce, previewBoardAnnounce,
  setBoardCategories, setBoardCounters, setBoardRooms, setBoardSides, mintKiosk, getBoardUsers, regenerateBoardUser, deleteBoard, API_BASE,
  type Board, type BoardKind, type BoardAnnounce, type AnnounceConfig, type QueueCategory, type QueueCounter, type BoardUser,
} from "../api.js";
import { toast } from "../components/toast.js";
import { confirmDialog } from "../components/confirm.js";
import { useCan } from "../permissions.js";
import { GEMINI_TTS_VOICES } from "@scena/protocol";
import type { QueueState, RoomState, ScoreState } from "@scena/protocol";

/** The three board kinds, treated equally in the picker + empty state. */
const BOARD_TYPES: { kind: BoardKind; label: string; hint: string; icon: typeof Ticket }[] = [
  { kind: "queue", label: "Queue board", hint: "Take-a-number ticketing with a called-now display.", icon: Ticket },
  { kind: "room", label: "Room board", hint: "Live status per room — ready, busy, cleaning.", icon: Radio },
  { kind: "score", label: "Scoreboard", hint: "Live scores for matches and games.", icon: Trophy },
];

export function LiveBoardsPage() {
  const can = useCan();
  const canCreate = can("board", "create");
  const canDelete = can("board", "delete");
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const [view, setView] = useState<"grid" | "list">(() => (localStorage.getItem("scena.boards.view") === "list" ? "list" : "grid"));
  useEffect(() => { localStorage.setItem("scena.boards.view", view); }, [view]);

  async function refresh() {
    setBoards(await listBoards().catch(() => []));
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, []);

  // Room boards open a template picker (blank or a starter palette); queue and
  // score boards create straight from a sensible preset.
  async function add(kind: BoardKind) {
    if (kind === "room") { setRoomOpen(true); return; }
    setBusy(true);
    try {
      const preset: Record<"queue" | "score", { name: string; config: unknown }> = {
        queue: { name: "Front desk queue", config: { prefix: "A" } },
        score: { name: "Match scoreboard", config: { sides: [{ id: "home", name: "Home", short: "HOME" }, { id: "away", name: "Away", short: "AWAY" }] } },
      };
      await createBoard(kind, preset[kind as "queue" | "score"].name, preset[kind as "queue" | "score"].config);
      await refresh();
      toast.success(`${kind === "queue" ? "Queue" : "Score"} board created.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create board");
    } finally {
      setBusy(false);
    }
  }

  async function createRoom(name: string, config: { statuses: RoomState["statuses"]; rooms: { id: string; name: string; status: string }[] }) {
    await createBoard("room", name, config);
    await refresh();
  }

  async function removeBoard(board: Board) {
    const ok = await confirmDialog({
      title: `Delete “${board.name}”?`,
      description: "This deletes the board and every login it issued (coordinator + stations). Any tablet signed in as one of them is signed out. This can't be undone.",
      confirmText: "Delete board",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteBoard(board.id);
      await refresh();
      toast.success("Board deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete board");
    }
  }

  usePageChrome(
    {
      crumbs: [{ label: "Live boards" }],
      actions: canCreate ? [{
        key: "new", label: "New board", icon: <Plus className="size-4" />, disabled: busy,
        items: BOARD_TYPES.map((t) => { const Icon = t.icon; return { key: t.kind, label: t.label, icon: <Icon className="size-4" />, onClick: () => add(t.kind) }; }),
      }] : [],
    },
    [busy, canCreate],
  );

  return (
    <div>
      <PageHeader
        title="Live boards"
        description="Queue, room & score boards. Each issues its own logins; bind a widget to display it."
        actions={boards && boards.length > 0 ? (
          <div className="inline-flex rounded-md border p-0.5">
            <Button variant={view === "grid" ? "secondary" : "ghost"} size="icon" className="size-7" title="Grid view" aria-label="Grid view" onClick={() => setView("grid")}><LayoutGrid className="size-4" /></Button>
            <Button variant={view === "list" ? "secondary" : "ghost"} size="icon" className="size-7" title="List view" aria-label="List view" onClick={() => setView("list")}><Rows3 className="size-4" /></Button>
          </div>
        ) : undefined}
      />

      {!boards ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <Card key={i}>
              <CardContent className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-10 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-8 w-36 rounded-md" />
                </div>
                <Skeleton className="h-20 w-full rounded-lg" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : boards.length === 0 ? (
        <div className="animate-rise flex flex-col items-center rounded-xl border border-dashed bg-card/40 px-6 py-14 text-center">
          <ScenaMascot mood="idle" size={116} className="mb-1" />
          <h3 className="text-base font-semibold">{canCreate ? "Create your first live board" : "No live boards yet"}</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">Each board issues its own logins and goes live the moment you bind a widget to it.{canCreate ? " Pick a type to start." : " Ask an admin to create one."}</p>
          {canCreate && <div className="mt-6 grid w-full max-w-2xl gap-3 sm:grid-cols-3">
            {BOARD_TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.kind}
                  type="button"
                  disabled={busy}
                  onClick={() => add(t.kind)}
                  className="group flex flex-col items-center gap-2 rounded-xl border bg-card p-5 text-center shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md disabled:pointer-events-none disabled:opacity-60"
                >
                  <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15"><Icon className="size-5" /></div>
                  <div className="text-sm font-semibold">{t.label}</div>
                  <div className="text-xs text-muted-foreground">{t.hint}</div>
                </button>
              );
            })}
          </div>}
        </div>
      ) : view === "list" ? (
        <BoardsList boards={boards} onDelete={canDelete ? removeBoard : undefined} />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {boards.map((b) => (
            <BoardCard key={b.id} board={b} onDelete={canDelete ? () => removeBoard(b) : undefined} />
          ))}
        </div>
      )}

      <RoomStartDialog open={roomOpen} onOpenChange={setRoomOpen} onCreate={createRoom} />
    </div>
  );
}

/** The starter palettes for a new room board — including a blank one that lands
 *  with no rooms (you add them in the editor), like a blank widget profile. All
 *  statuses/rooms stay fully editable after creation. */
interface RoomTemplate { id: string; name: string; description: string; statuses: RoomState["statuses"]; rooms: { id: string; name: string; status: string }[] }
const ROOM_GREEN = "oklch(0.68 0.16 155)", ROOM_AMBER = "oklch(0.75 0.15 75)", ROOM_RED = "oklch(0.6 0.2 25)", ROOM_GREY = "oklch(0.55 0.02 300)";
const rooms4 = (status: string) => [1, 2, 3, 4].map((n) => ({ id: `r${n}`, name: `Room ${n}`, status }));
const ROOM_TEMPLATES: RoomTemplate[] = [
  {
    id: "blank", name: "Blank board",
    description: "No rooms yet — add your own. Starts with Ready / Preparing / Occupied, all editable.",
    statuses: [{ id: "ready", label: "Ready", color: ROOM_GREEN }, { id: "preparing", label: "Preparing", color: ROOM_AMBER }, { id: "occupied", label: "Occupied", color: ROOM_RED }],
    rooms: [],
  },
  {
    id: "clinic", name: "Clinic / exam rooms",
    description: "Four exam rooms — ready, preparing, occupied.",
    statuses: [{ id: "ready", label: "Ready", color: ROOM_GREEN }, { id: "preparing", label: "Preparing", color: ROOM_AMBER }, { id: "occupied", label: "Occupied", color: ROOM_RED }],
    rooms: rooms4("ready"),
  },
  {
    id: "meeting", name: "Meeting rooms",
    description: "Four rooms — available, in use, reserved.",
    statuses: [{ id: "available", label: "Available", color: ROOM_GREEN }, { id: "inuse", label: "In use", color: ROOM_RED }, { id: "reserved", label: "Reserved", color: ROOM_AMBER }],
    rooms: rooms4("available"),
  },
  {
    id: "housekeeping", name: "Hotel housekeeping",
    description: "Four rooms — clean, being cleaned, dirty, out of service.",
    statuses: [{ id: "clean", label: "Clean", color: ROOM_GREEN }, { id: "cleaning", label: "Being cleaned", color: ROOM_AMBER }, { id: "dirty", label: "Dirty", color: ROOM_RED }, { id: "oos", label: "Out of service", color: ROOM_GREY }],
    rooms: rooms4("dirty"),
  },
];

/** A minimal sound control for room/score boards: play a chime on-screen when
 *  the board changes (a room flips / a score updates). Reuses the announce
 *  config's `mode` (silent vs chime) — voice reads stay queue-only. */
function ChimeToggle({ boardId, what }: { boardId: string; what: string }) {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => { getBoardAnnounce(boardId).then((a) => setOn((a?.config.mode ?? "silent") !== "silent")).catch(() => setOn(false)); }, [boardId]);
  const toggle = async (next: boolean) => {
    setOn(next);
    try { await setBoardAnnounce(boardId, { mode: next ? "chime" : "silent" }); }
    catch { setOn(!next); toast.error("Couldn't update the chime setting"); }
  };
  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sound</div>
      <label className="flex cursor-pointer items-center gap-2 text-xs font-normal text-muted-foreground">
        <Switch checked={on ?? false} onCheckedChange={toggle} disabled={on === null} />
        Play a chime on screens when {what}
      </label>
    </div>
  );
}

/** Manage a score board's sides (competitors) + title. Each side gets its own
 *  station login; live scores are preserved where a side id survives an edit. */
function ScoreManager({ boardId, state, onSaved }: { boardId: string; state: ScoreState | null; onSaved?: () => void }) {
  type Side = { id: string; name: string; short: string; color: string };
  const [sides, setSides] = useState<Side[]>([]);
  const [title, setTitle] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (dirty || !state) return;
    setSides(state.sides.map((s) => ({ id: s.id, name: s.name, short: s.short ?? "", color: s.color ?? "" })));
    setTitle(state.title ?? "");
  }, [state, dirty]);

  const asHex = (c: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : "#7c8aa0");
  const addSide = () => { setSides([...sides, { id: `s${Date.now().toString(36)}`, name: `Team ${sides.length + 1}`, short: "", color: "" }]); setDirty(true); };
  const editSide = (i: number, p: Partial<Side>) => { setSides(sides.map((s, j) => (j === i ? { ...s, ...p } : s))); setDirty(true); };
  const removeSide = (i: number) => { if (sides.length <= 2) return; setSides(sides.filter((_, j) => j !== i)); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      const r = await setBoardSides(boardId, sides, title);
      setSides(r.state.sides.map((s) => ({ id: s.id, name: s.name, short: s.short ?? "", color: s.color ?? "" })));
      setDirty(false);
      toast.success("Sides saved — each has its own station login (see Board logins).");
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save sides");
    } finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Competitors</div>
      <div className="text-xs text-muted-foreground">Each side gets its own station sign-in to adjust just its score.</div>
      <Input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} placeholder="Match title (optional)" className="h-8" />
      {sides.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          <label className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border shadow-sm" style={{ background: s.color || "var(--muted)" }} title="Side colour">
            <input type="color" value={asHex(s.color)} onChange={(e) => editSide(i, { color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
          <Input value={s.name} onChange={(e) => editSide(i, { name: e.target.value })} placeholder={`Team ${i + 1}`} className="h-8 flex-1" />
          <Input value={s.short} onChange={(e) => editSide(i, { short: e.target.value.slice(0, 6) })} placeholder="ABBR" className="h-8 w-20 text-center font-mono uppercase" />
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" disabled={sides.length <= 2} title={sides.length <= 2 ? "Keep at least two sides" : "Remove side"} onClick={() => removeSide(i)}><Trash2 className="size-3.5" /></Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={addSide}><Plus className="size-4" /> Side</Button>
        {dirty && <Button size="sm" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</Button>}
      </div>
    </div>
  );
}

function RoomStartDialog({
  open, onOpenChange, onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (name: string, config: { statuses: RoomState["statuses"]; rooms: { id: string; name: string; status: string }[] }) => Promise<void>;
}) {
  const [picked, setPicked] = useState("blank");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const tpl = ROOM_TEMPLATES.find((t) => t.id === picked) ?? ROOM_TEMPLATES[0]!;

  useEffect(() => { if (open) { setPicked("blank"); setName(""); } }, [open]);

  const create = async () => {
    setBusy(true);
    try {
      await onCreate(name.trim() || tpl.name, { statuses: tpl.statuses, rooms: tpl.rooms });
      toast.success(`“${name.trim() || tpl.name}” created.`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create board");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>New room board</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2">
          {ROOM_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPicked(t.id)}
              className={cn(
                "flex flex-col gap-2.5 rounded-xl border p-4 text-left transition-all hover:shadow-md",
                picked === t.id ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/40",
              )}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{t.name}</div>
                <div className="text-[11px] text-muted-foreground">{t.rooms.length ? `${t.rooms.length} rooms` : "empty"}</div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {t.statuses.map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-neutral-900" style={{ background: s.color }}>{s.label}</span>
                ))}
              </div>
              <div className="text-[11.5px] leading-snug text-muted-foreground">{t.description}</div>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t px-5 py-3">
          <Input placeholder={tpl.name} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} className="w-full sm:max-w-xs" />
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={create} disabled={busy}>{busy ? "Creating…" : `Create ${tpl.id === "blank" ? "blank" : "board"}`}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const boardIcon = (kind: BoardKind) => (kind === "queue" ? Ticket : kind === "score" ? Trophy : LayoutGrid);

/** A one-line live summary of a board's current state, for the list view. */
function boardSummary(b: Board): string {
  if (b.kind === "queue") {
    const s = b.state as QueueState | null;
    const serving = s && s.serving !== null ? `${s.prefix}${String(s.serving).padStart(3, "0")}` : "—";
    const waiting = (s?.series ?? []).reduce((n, x) => n + x.waiting, 0);
    return `Now serving ${serving} · ${waiting} waiting`;
  }
  if (b.kind === "score") {
    const s = b.state as ScoreState | null;
    if (!s || !s.sides.length) return "No sides yet";
    return s.sides.map((x) => `${x.short || x.name} ${x.score}`).join("  –  ");
  }
  const s = b.state as RoomState | null;
  if (!s || !s.rooms.length) return "No rooms yet";
  return `${s.rooms.length} room${s.rooms.length === 1 ? "" : "s"}`;
}

/** The preview + management editors shared by the grid card and the list row. */
function BoardBody({ board }: { board: Board }) {
  const isQueue = board.kind === "queue";
  const isScore = board.kind === "score";
  const isRoom = board.kind === "room";
  // Bumped after a counter change so the logins panel re-fetches (new station).
  const [credsKey, setCredsKey] = useState(0);
  return (
    <>
      {isQueue ? <QueuePreview state={board.state as QueueState | null} /> : isScore ? <ScorePreview state={board.state as ScoreState | null} /> : <RoomPreview state={board.state as RoomState | null} />}

      <BoardCredentials boardId={board.id} refreshKey={credsKey} />

      {isQueue && <CounterManager boardId={board.id} initial={board.counters ?? []} onSaved={() => setCredsKey((k) => k + 1)} />}
      {isQueue && <CategoryManager boardId={board.id} initial={(board.state as QueueState | null)?.categories ?? []} />}
      {isQueue && <AnnouncePanel boardId={board.id} />}
      {isRoom && <RoomManager boardId={board.id} state={board.state as RoomState | null} onSaved={() => setCredsKey((k) => k + 1)} />}
      {isScore && <ScoreManager boardId={board.id} state={board.state as ScoreState | null} onSaved={() => setCredsKey((k) => k + 1)} />}
      {(isRoom || isScore) && <ChimeToggle boardId={board.id} what={isRoom ? "a room changes status" : "the score changes"} />}

      <div className="font-mono text-[11px] text-muted-foreground">bind widgets to · {board.id}</div>
    </>
  );
}

function BoardCard({ board, onDelete }: { board: Board; onDelete?: () => void }) {
  const Icon = boardIcon(board.kind);
  return (
    <Card className="hover-lift hover:border-primary/40 hover:shadow-md">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold">{board.name}</span>
              <Badge variant="secondary" className="capitalize">{board.kind}</Badge>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-success">
              <StatusDot tone="success" ping />
              Live
            </div>
          </div>
          {onDelete && <Button variant="ghost" size="icon" className="size-9 text-muted-foreground hover:text-destructive" onClick={onDelete} title="Delete board" aria-label="Delete board">
            <Trash2 className="size-4" />
          </Button>}
        </div>

        <BoardBody board={board} />
      </CardContent>
    </Card>
  );
}

/** Compact list view: one row per board with a live summary; a row expands to
 *  the full management surface (the same editors as the grid card). */
function BoardsList({ boards, onDelete }: { boards: Board[]; onDelete?: (b: Board) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Board</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Live now</TableHead>
                <TableHead className="w-40 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {boards.map((b) => {
                const Icon = boardIcon(b.kind);
                const open = openId === b.id;
                return (
                  <Fragment key={b.id}>
                    <TableRow className="cursor-pointer" onClick={() => setOpenId(open ? null : b.id)}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></div>
                          <div className="min-w-0">
                            <div className="truncate font-medium">{b.name}</div>
                            <div className="font-mono text-[11px] text-muted-foreground">{b.id}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="secondary" className="capitalize">{b.kind}</Badge></TableCell>
                      <TableCell><span className="flex items-center gap-1.5 text-xs text-success"><StatusDot tone="success" ping /> Live</span></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{boardSummary(b)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setOpenId(open ? null : b.id)}>{open ? "Close" : "Manage"}</Button>
                          {onDelete && <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => onDelete(b)} title="Delete board" aria-label="Delete board"><Trash2 className="size-4" /></Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                    {open && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={5} className="bg-muted/20 p-0">
                          <div className="flex flex-col gap-4 px-4 py-4"><BoardBody board={b} /></div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ScorePreview({ state }: { state: ScoreState | null }) {
  if (!state) return <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">No sides configured yet.</div>;
  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3">
      {state.period && <div className="mb-1 text-center font-mono text-xs text-muted-foreground">{state.period}</div>}
      <div className="flex items-center justify-center gap-4">
        {state.sides.map((s, i) => (
          <div key={s.id} className="flex items-center gap-4">
            {i > 0 && <span className="text-lg text-muted-foreground">–</span>}
            <div className="text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{s.short || s.name}</div>
              <div className="font-mono text-3xl font-black tabular-nums text-primary">{s.score}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Board logins (§boards) — the scoped users that replace public station tokens.
 * Each board auto-issues a coordinator (controls everything) plus one station per
 * option (a room / a counter). Staff sign in at the normal login with these
 * 6-char credentials and land straight on their control surface. The admin hands
 * them out here and can regenerate a password (which signs that device out).
 */
function BoardCredentials({ boardId, refreshKey = 0 }: { boardId: string; refreshKey?: number }) {
  const [users, setUsers] = useState<BoardUser[] | null>(null);
  const [open, setOpen] = useState(false);

  // A counter change reconciles the logins — drop the cache so we re-fetch.
  useEffect(() => { setUsers(null); }, [refreshKey]);
  useEffect(() => {
    if (!open || users) return;
    getBoardUsers(boardId).then(setUsers).catch(() => setUsers([]));
  }, [open, users, boardId]);

  const regenerate = async (u: BoardUser) => {
    const pw = await regenerateBoardUser(boardId, u.id);
    if (!pw) { toast.error("Could not regenerate."); return; }
    setUsers((prev) => (prev ?? []).map((x) => (x.id === u.id ? { ...x, password: pw } : x)));
    toast.success(`New password for ${u.label} · that device is signed out.`);
  };

  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <button className="flex items-center gap-2 text-left" onClick={() => setOpen((v) => !v)}>
        <KeyRound className="size-4 text-muted-foreground" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Board logins</span>
        <span className="text-[11px] text-muted-foreground">{open ? "hide" : "show"}</span>
      </button>
      {open && (
        users == null ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : users.length === 0 ? (
          <div className="text-xs text-muted-foreground">No logins yet.</div>
        ) : (
          <div className="flex flex-col divide-y rounded-lg border">
            {users.map((u) => <CredentialRow key={u.id} u={u} onRegenerate={() => regenerate(u)} />)}
          </div>
        )
      )}
    </div>
  );
}

function CredentialRow({ u, onRegenerate }: { u: BoardUser; onRegenerate: () => void }) {
  const [show, setShow] = useState(false);
  const isCoordinator = u.kind === "coordinator";
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${what} copied.`); } catch { /* selectable */ }
  };
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", isCoordinator ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
        {isCoordinator ? <ShieldUser className="size-4" /> : <MonitorPlay className="size-3.5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{u.label}{isCoordinator && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-primary">controls all</span>}</div>
        <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <button className="hover:text-foreground" onClick={() => copy(u.username, "Username")} title="Copy username">{u.username}</button>
          <span className="opacity-40">·</span>
          <button className="hover:text-foreground" onClick={() => copy(u.password, "Password")} title="Copy password">{show ? u.password : "••••••"}</button>
        </div>
      </div>
      <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" onClick={() => setShow((v) => !v)} title={show ? "Hide password" : "Show password"}>
        {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </Button>
      <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" onClick={onRegenerate} title="Regenerate password">
        <RefreshCw className="size-3.5" />
      </Button>
    </div>
  );
}


/** Manage a queue board's counters (service desks). Each counter is the number a
 *  ticket is called to ("proceed to counter 3") and gets its own station login. */
function CounterManager({ boardId, initial, onSaved }: { boardId: string; initial: QueueCounter[]; onSaved?: () => void }) {
  const [counters, setCounters] = useState<QueueCounter[]>(initial.length ? initial : [{ id: "c1", name: "Counter 1" }]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const numOf = (id: string, fallback: number) => parseInt(id.replace(/\D/g, ""), 10) || fallback;
  const add = () => {
    const n = Math.max(0, ...counters.map((c) => numOf(c.id, 0))) + 1;
    setCounters([...counters, { id: `c${n}`, name: `Counter ${n}` }]);
    setDirty(true);
  };
  const rename = (i: number, name: string) => { setCounters(counters.map((c, j) => (j === i ? { ...c, name } : c))); setDirty(true); };
  const remove = (i: number) => { if (counters.length <= 1) return; setCounters(counters.filter((_, j) => j !== i)); setDirty(true); };
  const save = async () => {
    setSaving(true);
    try {
      const r = await setBoardCounters(boardId, counters);
      setCounters(r.counters);
      setDirty(false);
      toast.success("Counters saved — each has its own station login (see Board logins).");
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save counters");
    } finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Counters / desks</div>
      <div className="text-xs text-muted-foreground">Each counter is called to by number (“proceed to counter 3”) and gets its own station sign-in.</div>
      {counters.map((cnt, i) => {
        const n = numOf(cnt.id, i + 1);
        return (
          <div key={cnt.id} className="flex items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 font-mono text-sm font-semibold text-primary">{n}</span>
            <Input value={cnt.name} onChange={(e) => rename(i, e.target.value)} placeholder={`Counter ${n}`} className="h-8 flex-1" />
            <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" disabled={counters.length <= 1} title={counters.length <= 1 ? "Keep at least one counter" : "Remove counter"} onClick={() => remove(i)}><Trash2 className="size-3.5" /></Button>
          </div>
        );
      })}
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={add}><Plus className="size-4" /> Counter</Button>
        {dirty && <Button size="sm" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</Button>}
      </div>
    </div>
  );
}

/** Manage a queue board's service categories + open the take-a-ticket kiosk. */
function CategoryManager({ boardId, initial }: { boardId: string; initial: QueueCategory[] }) {
  const [cats, setCats] = useState<QueueCategory[]>(initial);
  const [dirty, setDirty] = useState(false);
  const add = () => { setCats([...cats, { id: `cat_${Date.now().toString(36)}`, name: "New service", prefix: String.fromCharCode(65 + cats.length) }]); setDirty(true); };
  const edit = (i: number, p: Partial<QueueCategory>) => { setCats(cats.map((c, j) => (j === i ? { ...c, ...p } : c))); setDirty(true); };
  const remove = (i: number) => { setCats(cats.filter((_, j) => j !== i)); setDirty(true); };
  const save = async () => { await setBoardCategories(boardId, cats); setDirty(false); toast.success("Categories saved."); };
  const openKiosk = async () => { const { kioskPath } = await mintKiosk(boardId); window.open(kioskPath, "_blank"); };

  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <div className="flex items-center">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Services / categories</div>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={openKiosk}><Ticket className="size-4" /> Open kiosk</Button>
      </div>
      {cats.length === 0 && <div className="text-xs text-muted-foreground">One default series. Add categories to split into services (each its own ticket prefix).</div>}
      {cats.map((cat, i) => (
        <div key={cat.id} className="flex items-center gap-2">
          <Input value={cat.prefix} onChange={(e) => edit(i, { prefix: e.target.value.toUpperCase().slice(0, 3) })} className="h-8 w-14 text-center font-mono" />
          <Input value={cat.name} onChange={(e) => edit(i, { name: e.target.value })} className="h-8 flex-1" />
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" onClick={() => remove(i)}><Trash2 className="size-3.5" /></Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={add}><Plus className="size-4" /> Category</Button>
        {dirty && <Button size="sm" onClick={save}>Save</Button>}
      </div>
    </div>
  );
}

const RATE_OPTS = [{ v: 0.85, l: "Slower" }, { v: 1, l: "Normal" }, { v: 1.15, l: "Faster" }];

/** Per-board spoken-announcement settings (§boards) — Gemini native TTS. */
function AnnouncePanel({ boardId }: { boardId: string }) {
  const [a, setA] = useState<BoardAnnounce | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { getBoardAnnounce(boardId).then(setA).catch(() => {}); }, [boardId]);
  if (!a) return null;
  const c = a.config;

  const save = async (patch: Partial<AnnounceConfig>) => {
    setA({ ...a, config: { ...a.config, ...patch } });
    await setBoardAnnounce(boardId, patch);
  };
  // Gemini prebuilt voices are language-agnostic, so the persona list is the
  // same for every language (the language selector drives the spoken language).
  const voices = GEMINI_TTS_VOICES;

  const preview = async () => {
    setPreviewing(true); setMsg(null);
    const r = await previewBoardAnnounce(boardId);
    setPreviewing(false);
    if (r.error || r.ok === false) {
      const d = r.detail ?? "";
      setMsg(
        r.error === "voice generation not in plan" ? "AI voice isn't in your plan."
          : r.error === "insufficient_credits" ? "Not enough AI credits — top up in Billing."
          : /key_missing/i.test(d) ? "No Gemini API key is configured. An admin adds the platform Gemini key in Admin → Stripe & config."
          : /gemini_40[013]|permission_denied|forbidden|api.?key|invalid|quota|billing/i.test(d) ? `The AI provider rejected the request — check the platform Gemini key is valid and the Generative Language API is enabled/billed. ${d}`
          : d || r.error || "Generation failed",
      );
      return;
    }
    if (r.url) { void new Audio(r.url.startsWith("http") ? r.url : `${API_BASE}${r.url}`).play().catch(() => {}); setMsg(r.cached ? "Sample played · cached (free)" : `Sample played${r.credits ? ` · ${r.credits} cr` : ""}`); }
  };

  return (
    <div className="flex flex-col gap-2.5 border-t pt-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Voice announcement</div>
      <div className="flex gap-1.5">
        {(["silent", "chime", "voice"] as const).map((m) => (
          <Button key={m} variant={c.mode === m ? "default" : "outline"} size="sm" className="flex-1 capitalize" onClick={() => save({ mode: m })}>{m}</Button>
        ))}
      </div>
      {c.mode === "voice" && (
        <>
          <Input
            value={c.template}
            onChange={(e) => setA({ ...a, config: { ...a.config, template: e.target.value } })}
            onBlur={(e) => save({ template: e.target.value })}
            placeholder="Ticket {ticket}, please proceed to counter {counter}."
            className="font-mono text-xs"
          />
          <div className="text-[10px] text-muted-foreground">Write it in the chosen language. {"{ticket}"} and {"{counter}"} are read as natural whole numbers (e.g. “A forty-two”).</div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={c.languageCode} onValueChange={(v) => save({ languageCode: v })}>
              <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>{a.languages.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={c.voice} onValueChange={(v) => save({ voice: v })}>
              <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>{voices.map((v) => <SelectItem key={v.id} value={v.id}>{v.label} · {v.gender === "female" ? "♀" : "♂"}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(c.rate)} onValueChange={(v) => save({ rate: Number(v) })}>
              <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>{RATE_OPTS.map((o) => <SelectItem key={o.v} value={String(o.v)}>{o.l}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(c.repeat)} onValueChange={(v) => save({ repeat: Number(v) })}>
              <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>{[1, 2, 3].map((n) => <SelectItem key={n} value={String(n)}>Say {n}×</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={preview} disabled={previewing}>{previewing ? "Generating…" : "▶ Preview"}</Button>
            {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
          </div>
          <div className="rounded-md bg-muted/50 px-2.5 py-2 text-[10px] leading-relaxed text-muted-foreground">
            Announcements are generated by <b className="text-foreground">Gemini native TTS</b>, an external service — the text you enter is sent to Google. Audio is credit-metered per character.
          </div>
        </>
      )}
      {c.mode === "chime" && <div className="text-xs text-muted-foreground">A ding plays on each call — no number is read out.</div>}
      {c.mode === "silent" && <div className="text-xs text-muted-foreground">On-screen only — the number flashes with no sound.</div>}
    </div>
  );
}

function QueuePreview({ state }: { state: QueueState | null }) {
  const num = state && state.serving !== null ? `${state.prefix}${String(state.serving).padStart(3, "0")}` : "—";
  const waiting = (state?.series ?? []).reduce((n, s) => n + s.waiting, 0);
  return (
    <div className="flex items-end gap-5 rounded-lg border bg-muted/30 px-4 py-3">
      <div>
        <div className="text-xs text-muted-foreground">Now serving</div>
        <div className="font-mono text-4xl font-bold tabular-nums text-primary">{num}</div>
      </div>
      {state?.counter != null && <div className="pb-1 text-sm text-muted-foreground">Counter {state.counter}</div>}
      <div className="flex-1" />
      <div className="pb-1 text-right">
        <div className="text-xs text-muted-foreground">Waiting</div>
        <div className="font-mono text-2xl font-semibold tabular-nums">{waiting}</div>
      </div>
    </div>
  );
}

function RoomPreview({ state }: { state: RoomState | null }) {
  if (!state) return <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">No rooms configured yet.</div>;
  // Room status colors are data-driven (each status carries its own color); fall
  // back to a neutral theme surface when a status has no color set.
  const statusOf = (id: string) => state.statuses.find((s) => s.id === id);
  return (
    <div className="grid grid-cols-4 gap-2">
      {state.rooms.map((r) => {
        const st = statusOf(r.status);
        return (
          <div
            key={r.id}
            style={st?.color ? { background: st.color } : undefined}
            className={cn(
              "rounded-lg px-2 py-2.5",
              st?.color ? "text-neutral-900" : "bg-muted text-foreground",
            )}
          >
            <div className="text-sm font-extrabold">{r.name}</div>
            <div className="text-[11px] opacity-80">{st?.label ?? r.status}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Manage a room board's rooms + its status palette. Statuses are fully custom
 *  per board — any number, any label, any colour — and each room gets its own
 *  station login. Removing a status remaps rooms using it to the first one. */
function RoomManager({ boardId, state, onSaved }: { boardId: string; state: RoomState | null; onSaved?: () => void }) {
  const [statuses, setStatuses] = useState<RoomState["statuses"]>(state?.statuses ?? []);
  const [rooms, setRooms] = useState<RoomState["rooms"]>(state?.rooms ?? []);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Seed from the live state (it polls every 2s) until the user starts editing.
  useEffect(() => {
    if (dirty || !state) return;
    setStatuses(state.statuses);
    setRooms(state.rooms);
  }, [state, dirty]);

  // Native <input type=color> needs a hex value; the swatch shows the real
  // stored colour (which may be oklch), the picker just edits it to hex.
  const asHex = (c: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : "#8b8b95");

  const addStatus = () => { setStatuses([...statuses, { id: `s${Date.now().toString(36)}`, label: "New status", color: "#8b8b95" }]); setDirty(true); };
  const editStatus = (i: number, p: Partial<RoomState["statuses"][number]>) => { setStatuses(statuses.map((s, j) => (j === i ? { ...s, ...p } : s))); setDirty(true); };
  const removeStatus = (i: number) => {
    const gone = statuses[i];
    const next = statuses.filter((_, j) => j !== i);
    if (!gone || !next[0]) return;
    const fallback = next[0].id;
    setStatuses(next);
    setRooms(rooms.map((r) => (r.status === gone.id ? { ...r, status: fallback } : r)));
    setDirty(true);
  };

  const addRoom = () => { setRooms([...rooms, { id: `r${Date.now().toString(36)}`, name: `Room ${rooms.length + 1}`, status: statuses[0]?.id ?? "", since: 0 }]); setDirty(true); };
  const editRoom = (i: number, p: Partial<RoomState["rooms"][number]>) => { setRooms(rooms.map((r, j) => (j === i ? { ...r, ...p } : r))); setDirty(true); };
  const removeRoom = (i: number) => { if (rooms.length <= 1) return; setRooms(rooms.filter((_, j) => j !== i)); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      const r = await setBoardRooms(boardId, rooms, statuses);
      setStatuses(r.state.statuses);
      setRooms(r.state.rooms);
      setDirty(false);
      toast.success("Rooms saved — each has its own station login (see Board logins).");
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save rooms");
    } finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-col gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Statuses</div>
        <div className="text-xs text-muted-foreground">The states a room can be in — label + colour are yours. Staff flip a room between these.</div>
        {statuses.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <label className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border shadow-sm" style={{ background: s.color }} title="Pick colour">
              <input type="color" value={asHex(s.color)} onChange={(e) => editStatus(i, { color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
            <Input value={s.label} onChange={(e) => editStatus(i, { label: e.target.value })} placeholder="Status name" className="h-8 flex-1" />
            <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" disabled={statuses.length <= 1} title={statuses.length <= 1 ? "Keep at least one status" : "Remove status"} onClick={() => removeStatus(i)}><Trash2 className="size-3.5" /></Button>
          </div>
        ))}
        <div><Button variant="ghost" size="sm" onClick={addStatus}><Plus className="size-4" /> Status</Button></div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Rooms</div>
        <div className="text-xs text-muted-foreground">Each room is controlled from its own station sign-in (see Board logins).</div>
        {rooms.map((r, i) => (
          <div key={r.id} className="flex items-center gap-2">
            <Input value={r.name} onChange={(e) => editRoom(i, { name: e.target.value })} placeholder={`Room ${i + 1}`} className="h-8 flex-1" />
            <Select value={r.status} onValueChange={(v) => editRoom(i, { status: v })}>
              <SelectTrigger size="sm" className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{statuses.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" disabled={rooms.length <= 1} title={rooms.length <= 1 ? "Keep at least one room" : "Remove room"} onClick={() => removeRoom(i)}><Trash2 className="size-3.5" /></Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={addRoom}><Plus className="size-4" /> Room</Button>
          {dirty && <Button size="sm" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</Button>}
        </div>
      </div>
    </div>
  );
}
