/**
 * Wellness (SPEC §8.6) — water/sleep/mood logging + fasting timer +
 * supplements tap-to-log + lab tests. Reachable from the account menu; a
 * client's everyday non-food, non-workout logging lives here.
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Chip, Field, Skeleton, SuggestionChip, WeekDots } from "@mossa/ui";
import { api, todayLocal } from "../../api.js";

interface Supplement {
  id: string;
  name: string;
  dose: string | null;
  kind: string;
  schedule: { slot: string }[];
}
interface Lab {
  id: string;
  display_name: string;
  status: string;
  due_by: string | null;
}
interface Fast {
  activeFast: { started_at: string; target_hours: number } | null;
  recentFasts: { duration_minutes: number; target_hours: number }[];
}

export function Wellness({ clientId, onBack }: { clientId: string; onBack: () => void }) {
  const [supps, setSupps] = useState<Supplement[]>([]);
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [labs, setLabs] = useState<Lab[]>([]);
  const [fast, setFast] = useState<Fast | null>(null);
  const [waterMl, setWaterMl] = useState(0);
  const [loading, setLoading] = useState(true);
  const date = todayLocal();

  const load = useCallback(async () => {
    const [s, sl, l, f, today] = await Promise.all([
      api.get<{ supplements: Supplement[] }>(`/api/supplements?clientId=${clientId}`),
      api.get<{ taken: { supplement_id: string; slot: string }[] }>(`/api/supplements/logs?clientId=${clientId}&date=${date}`),
      api.get<{ labs: Lab[] }>(`/api/labs?clientId=${clientId}`),
      api.get<Fast>(`/api/fasting?clientId=${clientId}`),
      api.get<{ waterMl: number }>(`/api/today?clientId=${clientId}&date=${date}`),
    ]);
    setSupps(s.supplements);
    setTaken(new Set(sl.taken.map((t) => `${t.supplement_id}:${t.slot}`)));
    setLabs(l.labs);
    setFast(f);
    setWaterMl(today.waterMl);
    setLoading(false);
  }, [clientId, date]);

  useEffect(() => {
    void load();
  }, [load]);

  const addWater = async (ml: number) => {
    await api.post("/api/logs/water", { clientId, data: { date, amountMl: ml } });
    setWaterMl((w) => w + ml);
  };
  const toggleSupp = async (id: string, slot: string) => {
    const key = `${id}:${slot}`;
    const r = await api.post<{ taken: boolean }>(`/api/supplements/${id}/log`, { clientId, date, slot });
    setTaken((prev) => {
      const next = new Set(prev);
      if (r.taken) next.add(key);
      else next.delete(key);
      return next;
    });
  };
  const toggleFast = async () => {
    await api.post("/api/fasting", { clientId, data: { action: fast?.activeFast ? "end" : "start", targetHours: 16 } });
    await load();
  };

  if (loading) return <Skeleton className="m-4 h-96" />;

  const fastElapsed = fast?.activeFast ? Math.floor((Date.now() - Date.parse(fast.activeFast.started_at)) / 60000) : 0;

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="grid size-10 place-items-center rounded-full bg-surface-2">←</button>
        <h1 className="text-xl font-bold">Wellness</h1>
      </div>

      {/* Water */}
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Water</h2>
          <span className="numeral text-hydration">{(waterMl / 1000).toFixed(1)} L</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[250, 500, 750].map((ml) => (
            <SuggestionChip key={ml} onClick={() => void addWater(ml)}>
              ＋{ml} ml
            </SuggestionChip>
          ))}
        </div>
      </Card>

      {/* Fasting */}
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Fasting</h2>
          {fast?.activeFast ? (
            <Chip tone="sleep">{Math.floor(fastElapsed / 60)}h {fastElapsed % 60}m</Chip>
          ) : (
            <Chip tone="neutral">Not fasting</Chip>
          )}
        </div>
        <Button className="mt-3 w-full" variant={fast?.activeFast ? "outline" : "tonal"} onClick={() => void toggleFast()}>
          {fast?.activeFast ? "End fast" : "Start 16h fast"}
        </Button>
      </Card>

      {/* Supplements */}
      {supps.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">Supplements</h2>
          <div className="space-y-3">
            {supps.map((s) => (
              <div key={s.id}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">{s.name}</span>
                  {s.dose && <span className="text-xs text-fg-muted">{s.dose}</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(s.schedule.length ? s.schedule : [{ slot: "daily" }]).map((sch) => {
                    const active = taken.has(`${s.id}:${sch.slot}`);
                    return (
                      <button
                        key={sch.slot}
                        onClick={() => void toggleSupp(s.id, sch.slot)}
                        className={`rounded-full px-4 py-2 text-sm capitalize ${active ? "bg-good-container text-good" : "bg-surface-2 text-fg-muted"}`}
                      >
                        {active ? "✓ " : ""}
                        {sch.slot}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Labs */}
      {labs.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">Lab tests</h2>
          <div className="space-y-2">
            {labs.map((l) => (
              <div key={l.id} className="flex items-center justify-between">
                <div>
                  <div>{l.display_name}</div>
                  {l.due_by && <div className="text-xs text-fg-muted">Due {new Date(l.due_by).toLocaleDateString()}</div>}
                </div>
                <Chip tone={l.status === "reviewed" ? "good" : l.status === "uploaded" ? "cardio" : "warn"}>{l.status}</Chip>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
