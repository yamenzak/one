/** Wellness — water, fasting timer, supplement tap-log, lab tests. */

import { useCallback, useEffect, useState } from "react";
import { fmtVolume, volumeLabel, volumeDisplayToMl } from "@mossa/domain";
import { Button, Card, Badge, Chip, Skeleton, Page, Stagger, IconBadge, ArrowLeft, Droplet, Timer, Pill, FlaskConical, Calendar, Check } from "@mossa/ui";
import { api, todayLocal } from "../../api.js";
import { useUnits } from "../../units.js";

interface Supplement { id: string; name: string; dose: string | null; kind: string; schedule: { slot: string }[] }
interface Lab { id: string; display_name: string; status: string; due_by: string | null }
interface Fast { activeFast: { started_at: string; target_hours: number } | null; recentFasts: { duration_minutes: number; target_hours: number }[] }
interface Session { id: string; scheduled_at: string; duration_minutes: number; status: string }

export function Wellness({ clientId, onBack }: { clientId: string; onBack: () => void }) {
  const [supps, setSupps] = useState<Supplement[]>([]);
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [labs, setLabs] = useState<Lab[]>([]);
  const [fast, setFast] = useState<Fast | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [waterMl, setWaterMl] = useState(0);
  const [loading, setLoading] = useState(true);
  const units = useUnits();
  const waterPresets = units.volume === "oz" ? [8, 12, 16] : [250, 500, 750];
  const date = todayLocal();

  const load = useCallback(async () => {
    const [s, sl, l, f, sess, today] = await Promise.all([
      api.get<{ supplements: Supplement[] }>(`/api/supplements?clientId=${clientId}`),
      api.get<{ taken: { supplement_id: string; slot: string }[] }>(`/api/supplements/logs?clientId=${clientId}&date=${date}`),
      api.get<{ labs: Lab[] }>(`/api/labs?clientId=${clientId}`),
      api.get<Fast>(`/api/fasting?clientId=${clientId}`),
      api.get<{ sessions: Session[] }>(`/api/sessions?clientId=${clientId}`).catch(() => ({ sessions: [] })),
      api.get<{ waterMl: number }>(`/api/today?clientId=${clientId}&date=${date}`),
    ]);
    setSupps(s.supplements); setTaken(new Set(sl.taken.map((t) => `${t.supplement_id}:${t.slot}`))); setLabs(l.labs); setFast(f); setSessions(sess.sessions); setWaterMl(today.waterMl); setLoading(false);
  }, [clientId, date]);
  useEffect(() => void load(), [load]);

  const addWater = async (displayAmount: number) => { const ml = Math.round(volumeDisplayToMl(displayAmount, units)); await api.post("/api/logs/water", { clientId, data: { date, amountMl: ml } }); setWaterMl((w) => w + ml); };
  const toggleSupp = async (id: string, slot: string) => {
    const key = `${id}:${slot}`;
    const r = await api.post<{ taken: boolean }>(`/api/supplements/${id}/log`, { clientId, date, slot });
    setTaken((p) => { const n = new Set(p); r.taken ? n.add(key) : n.delete(key); return n; });
  };
  const [fastTarget, setFastTarget] = useState(16);
  const toggleFast = async () => { await api.post("/api/fasting", { clientId, data: { action: fast?.activeFast ? "end" : "start", targetHours: fastTarget } }); await load(); };

  if (loading) return <Skeleton className="m-4 h-96" />;
  const fastElapsed = fast?.activeFast ? Math.floor((Date.now() - Date.parse(fast.activeFast.started_at)) / 60000) : 0;
  const fastHours = fastElapsed / 60;
  const ZONES = [
    { label: "Fed", max: 4, tone: "nutrition" as const },
    { label: "Catabolic", max: 16, tone: "cardio" as const },
    { label: "Fat burning", max: 24, tone: "activity" as const },
    { label: "Ketosis", max: 72, tone: "sleep" as const },
  ];
  const zone = ZONES.find((z) => fastHours < z.max) ?? ZONES[ZONES.length - 1]!;

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
            <span className="numeral font-semibold text-hydration">{fmtVolume(waterMl, units)}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">{waterPresets.map((v) => <Chip key={v} onClick={() => void addWater(v)}>+{v} {volumeLabel(units)}</Chip>)}</div>
        </Card>
      </Stagger>

      <Stagger>
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5"><IconBadge icon={Timer} tone="sleep" size="sm" /><h2 className="font-semibold">Fasting</h2></div>
            {fast?.activeFast ? <Badge tone={zone.tone}>{Math.floor(fastElapsed / 60)}h {fastElapsed % 60}m · {zone.label}</Badge> : <Badge tone="neutral">Not fasting</Badge>}
          </div>
          {fast?.activeFast ? (
            <>
              <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, (fastHours / fast.activeFast.target_hours) * 100)}%` }} />
              </div>
              <div className="text-xs text-muted-foreground">Target {fast.activeFast.target_hours}h · {zone.label} zone</div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">{[16, 18, 20, 24].map((h) => <Chip key={h} selected={fastTarget === h} onClick={() => setFastTarget(h)}>{h}h</Chip>)}</div>
          )}
          <Button className="w-full" variant={fast?.activeFast ? "outline" : "tonal"} onClick={() => void toggleFast()}>{fast?.activeFast ? "End fast" : `Start ${fastTarget}h fast`}</Button>
          {(fast?.recentFasts.length ?? 0) > 0 && (
            <div className="space-y-1.5 pt-1">
              {fast!.recentFasts.slice(0, 3).map((r, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{Math.floor(r.duration_minutes / 60)}h {r.duration_minutes % 60}m</span>
                  {r.duration_minutes >= r.target_hours * 60 ? <Badge tone="success">Goal met</Badge> : <span>target {r.target_hours}h</span>}
                </div>
              ))}
            </div>
          )}
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
              <div key={l.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0"><div className="truncate">{l.display_name}</div>{l.due_by && <div className="text-xs text-muted-foreground">Due {new Date(l.due_by).toLocaleDateString()}</div>}</div>
                {l.status === "requested" || l.status === "scheduled" ? (
                  <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-primary/15 px-3 text-xs font-medium text-primary [&_svg]:size-3.5"><FlaskConical /> Upload
                    <input type="file" accept="image/*,application/pdf" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; const fd = new FormData(); fd.append("file", file); fd.append("purpose", "lab"); const up = await fetch("/api/media/upload", { method: "POST", credentials: "include", body: fd }); const { key } = (await up.json()) as { key?: string }; if (key) { await api.post(`/api/labs/${l.id}/upload`, { clientId, fileKey: key }); await load(); } }} />
                  </label>
                ) : (
                  <Badge tone={l.status === "reviewed" ? "success" : l.status === "uploaded" ? "cardio" : "warning"}>{l.status}</Badge>
                )}
              </div>
            ))}
          </Card>
        </Stagger>
      )}

      {sessions.length > 0 && (
        <Stagger>
          <Card className="space-y-3">
            <div className="flex items-center gap-2.5"><IconBadge icon={Calendar} tone="activity" size="sm" /><h2 className="font-semibold">Sessions</h2></div>
            {sessions.slice(0, 6).map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0"><div className="truncate text-sm">{new Date(s.scheduled_at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div><div className="text-xs text-muted-foreground">{s.duration_minutes} min</div></div>
                <Badge tone={s.status === "completed" ? "success" : s.status === "scheduled" ? "activity" : s.status === "no_show" ? "danger" : "neutral"}>{s.status.replace("_", " ")}</Badge>
              </div>
            ))}
          </Card>
        </Stagger>
      )}
    </Page>
  );
}
