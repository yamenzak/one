/** Wellness — water, fasting timer, supplement tap-log, lab tests. */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Badge, Chip, Skeleton, Page, Stagger, IconBadge, ArrowLeft, Droplet, Timer, Pill, FlaskConical, Check } from "@mossa/ui";
import { api, todayLocal } from "../../api.js";

interface Supplement { id: string; name: string; dose: string | null; kind: string; schedule: { slot: string }[] }
interface Lab { id: string; display_name: string; status: string; due_by: string | null }
interface Fast { activeFast: { started_at: string; target_hours: number } | null; recentFasts: { duration_minutes: number; target_hours: number }[] }

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
    setSupps(s.supplements); setTaken(new Set(sl.taken.map((t) => `${t.supplement_id}:${t.slot}`))); setLabs(l.labs); setFast(f); setWaterMl(today.waterMl); setLoading(false);
  }, [clientId, date]);
  useEffect(() => void load(), [load]);

  const addWater = async (ml: number) => { await api.post("/api/logs/water", { clientId, data: { date, amountMl: ml } }); setWaterMl((w) => w + ml); };
  const toggleSupp = async (id: string, slot: string) => {
    const key = `${id}:${slot}`;
    const r = await api.post<{ taken: boolean }>(`/api/supplements/${id}/log`, { clientId, date, slot });
    setTaken((p) => { const n = new Set(p); r.taken ? n.add(key) : n.delete(key); return n; });
  };
  const toggleFast = async () => { await api.post("/api/fasting", { clientId, data: { action: fast?.activeFast ? "end" : "start", targetHours: 16 } }); await load(); };

  if (loading) return <Skeleton className="m-4 h-96" />;
  const fastElapsed = fast?.activeFast ? Math.floor((Date.now() - Date.parse(fast.activeFast.started_at)) / 60000) : 0;

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="secondary" onClick={onBack}><ArrowLeft /></Button>
        <h1 className="text-xl font-bold tracking-tight">Wellness</h1>
      </div>

      <Stagger>
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5"><IconBadge icon={Droplet} tone="hydration" size="sm" /><h2 className="font-semibold">Water</h2></div>
            <span className="numeral font-semibold text-hydration">{(waterMl / 1000).toFixed(1)} L</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">{[250, 500, 750].map((ml) => <Chip key={ml} onClick={() => void addWater(ml)}>+{ml} ml</Chip>)}</div>
        </Card>
      </Stagger>

      <Stagger>
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5"><IconBadge icon={Timer} tone="sleep" size="sm" /><h2 className="font-semibold">Fasting</h2></div>
            {fast?.activeFast ? <Badge tone="sleep">{Math.floor(fastElapsed / 60)}h {fastElapsed % 60}m</Badge> : <Badge tone="neutral">Not fasting</Badge>}
          </div>
          <Button className="mt-3 w-full" variant={fast?.activeFast ? "outline" : "tonal"} onClick={() => void toggleFast()}>{fast?.activeFast ? "End fast" : "Start 16h fast"}</Button>
        </Card>
      </Stagger>

      {supps.length > 0 && (
        <Stagger>
          <Card className="space-y-3">
            <div className="flex items-center gap-2.5"><IconBadge icon={Pill} tone="activity" size="sm" /><h2 className="font-semibold">Supplements</h2></div>
            {supps.map((s) => (
              <div key={s.id}>
                <div className="flex items-center justify-between"><span className="font-medium">{s.name}</span>{s.dose && <span className="text-xs text-muted-foreground">{s.dose}</span>}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(s.schedule.length ? s.schedule : [{ slot: "daily" }]).map((sch) => {
                    const on = taken.has(`${s.id}:${sch.slot}`);
                    return <button key={sch.slot} onClick={() => void toggleSupp(s.id, sch.slot)} className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm capitalize transition-all active:scale-95 [&_svg]:size-3.5 ${on ? "bg-success-soft text-success" : "bg-secondary text-muted-foreground"}`}>{on && <Check strokeWidth={3} />}{sch.slot}</button>;
                  })}
                </div>
              </div>
            ))}
          </Card>
        </Stagger>
      )}

      {labs.length > 0 && (
        <Stagger>
          <Card className="space-y-3">
            <div className="flex items-center gap-2.5"><IconBadge icon={FlaskConical} tone="cardio" size="sm" /><h2 className="font-semibold">Lab tests</h2></div>
            {labs.map((l) => (
              <div key={l.id} className="flex items-center justify-between">
                <div><div>{l.display_name}</div>{l.due_by && <div className="text-xs text-muted-foreground">Due {new Date(l.due_by).toLocaleDateString()}</div>}</div>
                <Badge tone={l.status === "reviewed" ? "success" : l.status === "uploaded" ? "cardio" : "warning"}>{l.status}</Badge>
              </div>
            ))}
          </Card>
        </Stagger>
      )}
    </Page>
  );
}
