/**
 * Shared board control widgets (§boards) — the queue caller + room-status
 * controls, used by the authenticated BoardControlApp a board user lands on.
 *
 * These were the body of the old token Station page; that public-token surface
 * is retired (control is now a scoped login), so this module keeps just the
 * reusable, presentational controls — the container wires the actions.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, RotateCcw, Hash, Minus, Plus } from "lucide-react";
import { Badge, Button, Card, Input, Separator, Tabs, TabsContent, TabsList, TabsTrigger } from "@4dl/ui";
import type { QueueState, RoomState } from "@scena/protocol";

type Series = QueueState["series"][number];

const seriesKey = (s: Series) => s.categoryId ?? "__default__";
const fmt = (prefix: string, n: number | null | undefined) => (n == null ? "—" : `${prefix}${String(n).padStart(3, "0")}`);

export function QueueControls({
  state,
  counter,
  setCounter,
  onNext,
  onCallNumber,
  onRecall,
  lockCounter = false,
}: {
  state: QueueState | null;
  counter: number;
  setCounter: (n: number) => void;
  onNext: (categoryId?: string) => void;
  onCallNumber: (number: number, categoryId?: string) => void;
  onRecall: () => void;
  /** Station users control one fixed counter — hide the selector. */
  lockCounter?: boolean;
}) {
  // One default series if the board isn't split into categories.
  const series: Series[] = useMemo(() => {
    if (state?.series?.length) return state.series;
    return [{ categoryId: null, name: null, prefix: state?.prefix ?? "A", issued: state?.issued ?? 0, serving: state?.serving ?? null, waiting: 0 }];
  }, [state]);

  const [tab, setTab] = useState<string>(seriesKey(series[0]!));
  useEffect(() => {
    if (!series.some((s) => seriesKey(s) === tab)) setTab(seriesKey(series[0]!));
  }, [series, tab]);

  return (
    <>
      {/* NOW SERVING */}
      <Card className="mb-5 border-border/60 bg-card/60">
        <div className="text-micro uppercase text-muted-foreground">Now serving</div>
        <div className="font-mono text-7xl font-bold leading-none tabular-nums">{fmt(state?.prefix ?? "", state?.serving ?? null)}</div>
        <div className="mt-1 text-sm text-muted-foreground">{state?.counter != null ? `Counter ${state.counter}` : "—"}</div>
      </Card>

      {/* Counter / desk selector — hidden for a station locked to one counter. */}
      <div className={`mb-5 flex items-center justify-center gap-3 ${lockCounter ? "hidden" : ""}`}>
        <span className="text-sm text-muted-foreground">Counter / desk</span>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" onClick={() => setCounter(Math.max(1, counter - 1))}>
            <Minus className="h-4 w-4" />
          </Button>
          <Input
            type="number"
            min={1}
            value={counter}
            onChange={(e) => setCounter(Math.max(1, Number(e.target.value) || 1))}
            className="w-16 text-center font-mono text-base font-semibold tabular-nums"
          />
          <Button variant="outline" size="icon" onClick={() => setCounter(counter + 1)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="mb-4 flex h-auto w-full flex-wrap gap-1">
          {series.map((s) => (
            <TabsTrigger key={seriesKey(s)} value={seriesKey(s)} className="flex-1 flex-col gap-0.5 py-1.5">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <span className="font-mono">{s.prefix}</span>
                {s.name ?? "Tickets"}
                <Badge className="tabular-nums">{s.waiting}</Badge>
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {series.map((s) => {
          const categoryId = s.categoryId ?? undefined;
          const nextUp = s.waiting > 0 ? (s.serving ?? 0) + 1 : null;
          return (
            <TabsContent key={seriesKey(s)} value={seriesKey(s)}>
              <SeriesPanel s={s} nextUp={nextUp} onNext={() => onNext(categoryId)} onCallNumber={(n) => onCallNumber(n, categoryId)} onRecall={onRecall} />
            </TabsContent>
          );
        })}
      </Tabs>

      {state?.recent?.length ? <RecentStrip recent={state.recent} defaultPrefix={state.prefix} /> : null}
    </>
  );
}

function SeriesPanel({
  s,
  nextUp,
  onNext,
  onCallNumber,
  onRecall,
}: {
  s: Series;
  nextUp: number | null;
  onNext: () => void;
  onCallNumber: (number: number) => void;
  onRecall: () => void;
}) {
  const [num, setNum] = useState("");
  const specific = Number(num);
  const canCall = num.trim() !== "" && Number.isFinite(specific) && specific > 0;

  return (
    <Card>
      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label="Waiting" value={String(s.waiting)} />
        <Stat label="Next up" value={fmt(s.prefix, nextUp)} accent />
        <Stat label="Issued" value={fmt(s.prefix, s.issued || null)} />
      </div>

      <Button size="lg" className="h-16 text-lg" onClick={onNext} disabled={s.waiting === 0}>
        Call next <ChevronRight className="h-5 w-5" />
      </Button>

      <Separator />

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="mb-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Hash className="h-3 w-3" /> Call a specific number
          </label>
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="e.g. 42"
            value={num}
            onChange={(e) => setNum(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canCall) {
                onCallNumber(specific);
                setNum("");
              }
            }}
            className="font-mono"
          />
        </div>
        <Button
          variant="secondary"
          className="h-9"
          disabled={!canCall}
          onClick={() => {
            onCallNumber(specific);
            setNum("");
          }}
        >
          Call {s.prefix}
          {canCall ? String(specific).padStart(3, "0") : "###"}
        </Button>
      </div>

      <Button variant="outline" onClick={onRecall}>
        <RotateCcw className="h-4 w-4" /> Recall current
      </Button>
    </Card>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-2 py-3">
      <div className="text-micro text-muted-foreground uppercase">{label}</div>
      <div className={`font-mono text-2xl font-bold tabular-nums ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function RecentStrip({ recent, defaultPrefix }: { recent: QueueState["recent"]; defaultPrefix: string }) {
  return (
    <div className="mt-6">
      <div className="mb-2 text-micro uppercase text-muted-foreground">Recent calls</div>
      <div className="flex flex-wrap gap-2">
        {recent.slice(0, 8).map((r, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5">
            <span className="font-mono text-sm font-semibold tabular-nums">{fmt(r.prefix ?? defaultPrefix, r.number)}</span>
            <span className="text-xs text-muted-foreground">· #{r.counter}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RoomControls({
  state,
  onFlip,
  onlyRoomId,
}: {
  state: RoomState | null;
  onFlip: (roomId: string, statusId: string) => void;
  onlyRoomId?: string | null;
}) {
  if (!state) return null;
  const rooms = onlyRoomId ? state.rooms.filter((r) => r.id === onlyRoomId) : state.rooms;
  return (
    <div className="flex flex-col gap-3">
      {rooms.map((room) => (
        <Card key={room.id}>
          <div className="mb-3 font-semibold">{room.name}</div>
          <div className="flex flex-wrap gap-2">
            {state.statuses.map((st) => (
              <button
                key={st.id}
                onClick={() => onFlip(room.id, st.id)}
                style={{ background: st.color }}
                className={`flex-1 rounded-lg px-3 py-3 text-sm font-bold text-black transition ${room.status === st.id ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "opacity-80 hover:opacity-100"}`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
