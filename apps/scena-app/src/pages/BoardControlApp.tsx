/**
 * Board control app (§boards) — where a signed-in **board user** lands.
 *
 * This replaces the public token station: instead of a QR-minted token, each
 * board has real scoped accounts (a coordinator + one station per option). When
 * such a user signs in, App.tsx routes them here (never the operator shell). The
 * surface is scoped by `me.board`:
 *   • coordinator (stationId null) → the whole board — every counter / room / side.
 *   • station (stationId set)      → just its own counter / room / side.
 * Control flows over the session cookie (no token) via the *Session helpers.
 *
 * Phase 3 adds scoreboards + queue reset; the full realtime rebuild is Phase 4.
 */
import { useEffect, useState } from "react";
import { Loader2, LogOut, Bell, RotateCcw, Minus, Plus } from "lucide-react";
import { Card, CardContent } from "../components/ui/card.js";
import { Button, Input } from "@4dl/ui";
import { confirmDialog } from "../components/confirm.js";
import {
  getBoard,
  getBranding,
  callNextSession,
  callNumberSession,
  recallSession,
  setRoomStatusSession,
  resetBoardSession,
  addScoreSession,
  setScorePeriodSession,
  type Board,
  type Me,
} from "../api.js";
import { signOut } from "../auth-client.js";
import { applyBrandTheme } from "../brand-theme.js";
import { useForcedDark } from "../theme.js";
import type { QueueState, RoomState, ScoreState } from "@scena/protocol";
import { QueueControls, RoomControls } from "./Station.js";

/** Map a station option id ("c1", "counter-2", …) to its 1-based counter number. */
function counterNumber(stationId: string | null): number {
  if (!stationId) return 1;
  const m = stationId.match(/(\d+)/);
  return m ? Math.max(1, Number(m[1])) : 1;
}

export function BoardControlApp({ me, onSignedOut }: { me: Me; onSignedOut: () => void }) {
  // A counter tablet is dark, whatever this browser last chose on the dashboard.
  useForcedDark();
  const scope = me.board!;
  const boardId = scope.boardId;
  const isStation = Boolean(scope.stationId);
  const isCoordinator = !isStation;

  const [board, setBoard] = useState<Board | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "gone">("loading");
  const [counter, setCounter] = useState(() => counterNumber(scope.stationId));
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      setBoard(await getBoard(boardId));
      setStatus("ready");
    } catch {
      // A transient blip while we already hold state keeps the last-known board;
      // never loading it means the board was deleted (its login is revoked too).
      setStatus((s) => (s === "ready" ? "ready" : "gone"));
    }
  }
  useEffect(() => {
    if (!boardId) return;
    refresh();
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, [boardId]);

  // Board users land here outside the operator shell — apply the workspace brand
  // so the control surface follows it too.
  useEffect(() => { getBranding().then(applyBrandTheme).catch(() => {}); }, []);

  async function act(fn: () => Promise<void>) {
    setErr(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "action failed");
    }
  }

  async function resetQueue() {
    const ok = await confirmDialog({
      title: "Reset the queue?",
      description: "Clears every ticket series and the current call, starting fresh. This is what the daily rollover does automatically.",
      confirmText: "Reset now",
      destructive: true,
    });
    if (ok) act(() => resetBoardSession(boardId));
  }

  const doSignOut = async () => {
    await signOut().catch(() => {});
    onSignedOut();
  };

  const roleLabel = isStation ? scope.label : "Coordinator";

  return (
    <Shell>
      <header className="flex w-full items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
          <Bell className="h-3.5 w-3.5" /> {board?.name ?? "Board"} · {roleLabel}
        </div>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={doSignOut}>
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </header>

      <div className="flex flex-1 flex-col items-center px-5 pb-12">
        <div className="w-full max-w-2xl">
          {status === "gone" ? (
            <div className="grid min-h-[50vh] place-items-center text-center">
              <div>
                <div className="text-lg font-semibold text-foreground">This board is no longer available</div>
                <p className="mt-1 text-sm text-muted-foreground">It may have been deleted. Please sign out.</p>
                <Button className="mt-5" onClick={doSignOut}><LogOut className="h-4 w-4" /> Sign out</Button>
              </div>
            </div>
          ) : !board ? (
            <div className="grid min-h-[50vh] place-items-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : board.kind === "queue" ? (
            <>
              <QueueControls
                state={board.state as QueueState | null}
                counter={counter}
                setCounter={setCounter}
                lockCounter={isStation}
                onNext={(categoryId) => act(() => callNextSession(boardId, counter, categoryId))}
                onCallNumber={(number, categoryId) => act(() => callNumberSession(boardId, counter, number, categoryId))}
                onRecall={() => act(() => recallSession(boardId))}
              />
              {isCoordinator && (
                <Button variant="outline" className="mt-5 w-full" onClick={resetQueue}>
                  <RotateCcw className="h-4 w-4" /> Reset queue
                </Button>
              )}
            </>
          ) : board.kind === "score" ? (
            <ScoreControls
              state={board.state as ScoreState | null}
              onlySideId={scope.stationId}
              canSetPeriod={isCoordinator}
              onAdjust={(sideId, delta) => act(() => addScoreSession(boardId, sideId, delta))}
              onPeriod={(period) => act(() => setScorePeriodSession(boardId, period))}
              onReset={isCoordinator ? () => act(() => resetBoardSession(boardId)) : undefined}
            />
          ) : (
            <RoomControls
              state={board.state as RoomState | null}
              onlyRoomId={scope.stationId}
              onFlip={(roomId, statusId) => act(() => setRoomStatusSession(boardId, roomId, statusId))}
            />
          )}

          {err && <div className="mt-5 text-center text-sm text-destructive">{err}</div>}
        </div>
      </div>
    </Shell>
  );
}

/**
 * Scoreboard remote — a referee (coordinator) drives every side's score + the
 * period label; a per-side station adjusts only its own score.
 */
function ScoreControls({
  state,
  onlySideId,
  canSetPeriod,
  onAdjust,
  onPeriod,
  onReset,
}: {
  state: ScoreState | null;
  onlySideId: string | null;
  canSetPeriod: boolean;
  onAdjust: (sideId: string, delta: number) => void;
  onPeriod: (period: string) => void;
  onReset?: () => void;
}) {
  const [period, setPeriod] = useState("");
  useEffect(() => { if (state) setPeriod(state.period); }, [state?.period]);
  if (!state) return null;
  const sides = onlySideId ? state.sides.filter((s) => s.id === onlySideId) : state.sides;

  return (
    <div className="flex flex-col gap-4">
      {state.title && <div className="text-center text-sm font-medium uppercase tracking-widest text-muted-foreground">{state.title}</div>}
      {state.period && !canSetPeriod && <div className="text-center font-mono text-lg text-foreground/80">{state.period}</div>}

      <div className={`grid gap-3 ${sides.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {sides.map((s) => (
          <Card key={s.id}>
            <CardContent className="flex flex-col items-center gap-3 py-6">
              <div className="text-sm font-bold uppercase tracking-wide text-foreground/80">{s.short || s.name}</div>
              <div className="font-mono text-6xl font-black tabular-nums text-foreground">{s.score}</div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="size-11" onClick={() => onAdjust(s.id, -1)} disabled={s.score <= 0}>
                  <Minus className="h-5 w-5" />
                </Button>
                <Button size="lg" className="h-11 px-6 text-lg" onClick={() => onAdjust(s.id, 1)}>
                  <Plus className="h-5 w-5" /> 1
                </Button>
              </div>
              <div className="flex items-center gap-1.5">
                {[2, 3].map((n) => (
                  <Button key={n} variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={() => onAdjust(s.id, n)}>
                    +{n}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {canSetPeriod && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Period / clock</label>
            <Input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onPeriod(period); }}
              placeholder="Q3 · 04:12"
              className="font-mono"
            />
          </div>
          <Button variant="secondary" onClick={() => onPeriod(period)}>Set</Button>
        </div>
      )}

      {onReset && (
        <Button variant="outline" onClick={onReset}>
          <RotateCcw className="h-4 w-4" /> New game (reset scores)
        </Button>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-screen w-full flex-col bg-background text-foreground"
      style={{ background: "radial-gradient(circle at 50% 0%, color-mix(in oklch, var(--primary) 18%, var(--background)), var(--background))" }}
    >
      {children}
    </div>
  );
}
