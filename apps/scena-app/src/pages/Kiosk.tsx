/**
 * Take-a-ticket kiosk (§boards) — a customer-facing self-service surface.
 *
 * A tablet at the entrance opens this with a board-scoped kiosk token (issue-
 * only, no login). The customer taps a service, gets a ticket number, and the
 * page prints a clean receipt on any OS printer. A live "now serving" header
 * (token-gated public read) lets them gauge the wait, and each service tile
 * shows how many are already waiting. After a ticket prints the kiosk returns
 * to the menu automatically so the next person can help themselves.
 *
 * The old build linked a QR to the /station control page (a privilege leak) and
 * fetched board state through the operator-only endpoint; both are fixed here.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, Printer, Ticket, ArrowRight, Users } from "lucide-react";
import { Button } from "@4dl/ui";
import { getBoardLive, issueTicket, type Board } from "../api.js";
import { applyBrandTheme } from "../brand-theme.js";
import { useForcedDark } from "@4dl/app-kit";
import type { QueueState } from "@scena/protocol";

interface Issued { prefix: string; number: number; label: string | null; ahead: number }

const fmt = (prefix: string, n: number | null | undefined) => (n == null ? "—" : `${prefix}${String(n).padStart(3, "0")}`);

export function KioskPage() {
  // A lobby tablet is dark, whatever this browser last chose on the dashboard.
  useForcedDark();
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? "";
  const boardId = params.get("board") ?? "";

  const [board, setBoard] = useState<Board | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const everLoaded = useRef(false);
  const [ticket, setTicket] = useState<Issued | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // Live board state (public, token-gated) — refreshes now-serving + waiting.
  useEffect(() => {
    if (!boardId || !token) return;
    let alive = true;
    // Only show the "invalid/expired" screen if the board was NEVER loaded — a
    // transient poll failure after a good load must not blank a live kiosk.
    const tick = () => getBoardLive(boardId, token).then((b) => { if (alive) { everLoaded.current = true; setBoard(b); setLoadErr(false); if (b.branding) applyBrandTheme(b.branding); } }).catch(() => { if (alive && !everLoaded.current) setLoadErr(true); });
    tick();
    const t = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(t); };
  }, [boardId, token]);

  async function take(categoryId?: string) {
    setBusy(true);
    setErr(null);
    try {
      const r = await issueTicket(boardId, token, categoryId);
      if (r.error || !r.ticket) { setErr(r.error === "unauthorized kiosk" ? "This kiosk link is invalid." : r.error ?? "could not issue a ticket"); return; }
      setTicket(r.ticket);
      setTimeout(() => window.print(), 250);
      // Return to the menu so the next customer can serve themselves.
      setTimeout(() => setTicket((t) => (t === r.ticket ? null : t)), 15000);
    } catch (e) {
      /*
        The await was bare and `setBusy(false)` came after it, so a dropped
        request left every service tile DISABLED — on an unattended tablet at
        an entrance, with nobody to reload it and nothing on screen saying why.
        The `finally` is the fix; the message is so the next person can try.
      */
      setErr(e instanceof Error ? e.message : "Couldn’t issue a ticket. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!token || !boardId) return <Shell><div className="text-lg text-muted-foreground">Invalid kiosk link.</div></Shell>;
  if (loadErr) return <Shell><div className="text-lg text-muted-foreground">This kiosk link is invalid or expired.</div></Shell>;
  if (!board) return <Shell><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></Shell>;

  const queue = board.state as QueueState | null;
  const series = queue?.series ?? [];
  // Waiting count keyed by category (default series → null key).
  const waitingOf = (categoryId: string | null) => series.find((s) => (s.categoryId ?? null) === (categoryId ?? null))?.waiting ?? 0;
  const totalWaiting = series.reduce((n, s) => n + s.waiting, 0);
  const categories = queue?.categories ?? [];

  return (
    <Shell>
      <style>{`@media print { body * { visibility: hidden; } #ticket, #ticket * { visibility: visible; } #ticket { position: fixed; inset: 0; margin: auto; } }`}</style>

      {!ticket ? (
        <div className="flex w-full max-w-3xl flex-col items-center">
          <div className="mb-1 text-4xl font-extrabold">{board.name}</div>
          <div className="mb-6 flex items-center gap-2 text-lg text-muted-foreground"><Ticket className="h-5 w-5" /> Take a ticket</div>

          {/* Live now-serving strip */}
          <div className="mb-8 flex items-center gap-6 rounded-2xl border border-border bg-card/50 px-8 py-4">
            <div className="text-center">
              <div className="text-micro text-muted-foreground uppercase">Now serving</div>
              <div className="font-mono text-4xl font-bold tabular-nums text-primary">{fmt(queue?.prefix ?? "", queue?.serving ?? null)}</div>
            </div>
            <div className="h-10 w-px bg-border" />
            <div className="text-center">
              <div className="text-micro text-muted-foreground uppercase">Waiting</div>
              <div className="font-mono text-4xl font-bold tabular-nums">{totalWaiting}</div>
            </div>
          </div>

          {categories.length > 0 ? (
            <div className="grid w-full gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(categories.length, 3)}, minmax(0, 1fr))` }}>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  disabled={busy}
                  onClick={() => take(cat.id)}
                  className="flex min-h-36 flex-col items-center justify-center gap-1.5 rounded-2xl bg-primary text-primary-foreground shadow-lg transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
                >
                  <span className="font-mono text-base opacity-80">{cat.prefix}</span>
                  <span className="text-2xl font-extrabold">{cat.name}</span>
                  <span className="mt-1 flex items-center gap-1 text-sm opacity-80"><Users className="h-3.5 w-3.5" /> {waitingOf(cat.id)} waiting</span>
                </button>
              ))}
            </div>
          ) : (
            <button
              disabled={busy}
              onClick={() => take()}
              className="flex min-h-40 items-center gap-3 rounded-2xl bg-primary px-16 text-primary-foreground shadow-lg transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
            >
              <span className="text-3xl font-extrabold">{busy ? "…" : "Get my ticket"}</span>
              {!busy && <ArrowRight className="h-7 w-7" />}
            </button>
          )}

          {err && <div className="mt-6 text-destructive">{err}</div>}
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <div id="ticket" ref={printRef} className="min-w-80 rounded-3xl bg-white px-12 py-9 text-center text-black">
            <div className="text-xs uppercase tracking-widest text-black/70">{board.name}</div>
            {ticket.label && <div className="mt-1.5 text-lg font-bold">{ticket.label}</div>}
            <div className="my-3 font-mono text-8xl font-extrabold leading-none tabular-nums">{ticket.prefix}{String(ticket.number).padStart(3, "0")}</div>
            <div className="text-black/70">{ticket.ahead === 0 ? "You're next" : `${ticket.ahead} ahead of you`}</div>
            <div className="mt-4 text-caption text-black/70">Please keep this ticket and watch the screen.</div>
          </div>
          <div className="mt-7 flex gap-3">
            <Button variant="outline" size="lg" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print again</Button>
            <Button size="lg" onClick={() => setTicket(null)}>Done</Button>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen w-full bg-background text-foreground"
      style={{ background: "radial-gradient(circle at 50% 15%, color-mix(in oklch, var(--primary) 20%, var(--background)), var(--background))" }}
    >
      <div className="flex min-h-screen flex-col items-center justify-center px-5 py-10">{children}</div>
    </div>
  );
}
