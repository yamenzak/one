/**
 * Log sheet — the comprehensive quick-log surface. Chip grid → per-kind forms:
 * food, activity (MET), water, weight, body (measurements + BF), sleep, mood,
 * and a rich check-in with progress photos + consent.
 */

import { useState } from "react";
import { ACTIVITIES, activitiesByCategory, activityTrack, weightLabel, lengthLabel, volumeLabel, energyLabel, displayToKg, lengthDisplayToCm, volumeDisplayToMl, displayToKcal, kcalToDisplay } from "@mossa/domain";
import {
  Button, Field, Textarea, Sheet, Chip, IconBadge, Switch,
  Utensils, Footprints, Droplet, Weight, Ruler, Moon, Smile, ClipboardList, Camera, Angry, Frown, Meh, Laugh, Search, Timer, HeartPulse, MapPin, Flame, Dumbbell,
  cn, toneVar, type LucideIcon, type Tone,
} from "@mossa/ui";
import { api, todayLocal, uploadMedia } from "../../api.js";
import { useUnits } from "../../units.js";
import { AiAvatar, useAiIdentity } from "../../AiAvatar.js";
import { FoodSearchSheet } from "./FoodSearchSheet.js";
import { activityIcon } from "./activityIcons.js";
import { BodyScanLauncher } from "./bodyscan/BodyScanLauncher.js";

type LogKind = "food" | "activity" | "water" | "weight" | "body" | "sleep" | "mood" | "checkin";
const CHIPS: { kind: LogKind; label: string; icon: LucideIcon; tone: Tone }[] = [
  { kind: "food", label: "Food", icon: Utensils, tone: "nutrition" },
  { kind: "activity", label: "Activity", icon: Footprints, tone: "activity" },
  { kind: "water", label: "Water", icon: Droplet, tone: "hydration" },
  { kind: "weight", label: "Weight", icon: Weight, tone: "cardio" },
  { kind: "body", label: "Body", icon: Ruler, tone: "cardio" },
  { kind: "sleep", label: "Sleep", icon: Moon, tone: "sleep" },
  { kind: "mood", label: "Mood", icon: Smile, tone: "nutrition" },
  { kind: "checkin", label: "Check-in", icon: ClipboardList, tone: "primary" },
];
const MOOD_ICONS = [Angry, Frown, Meh, Smile, Laugh];

function Rating({ label, value, onChange }: { label: string; value: number | null; onChange: (n: number) => void }) {
  return (
    <div>
      <div className="mb-2 text-sm text-muted-foreground">{label}</div>
      <div className="flex gap-2">
        {MOOD_ICONS.map((Face, i) => (
          <button key={i} onClick={() => onChange(i + 1)} className={`grid size-11 place-items-center rounded-full transition-all active:scale-90 [&_svg]:size-5 ${value === i + 1 ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
            <Face />
          </button>
        ))}
      </div>
    </div>
  );
}

export function LogSheet({ open, onClose, clientId, onLogged, initialKind }: { open: boolean; onClose: () => void; clientId: string; onLogged: () => void; initialKind?: LogKind }) {
  const [kind, setKind] = useState<LogKind | null>(initialKind ?? null);
  const [foodMode, setFoodMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<Record<string, string>>({});
  const [ratings, setRatings] = useState<{ mood: number | null; energy: number | null; stress: number | null; sleepQ: number | null }>({ mood: null, energy: null, stress: null, sleepQ: null });
  const [activityKey, setActivityKey] = useState("walking");
  const [actSearch, setActSearch] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [photos, setPhotos] = useState<{ key: string; consentToFeature: boolean }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const date = todayLocal();
  const units = useUnits();
  const ai = useAiIdentity();
  const num = (k: string) => (f[k] ? Number(f[k]) : undefined);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  // Decimal entry: allow digits and a single decimal point only — never let a
  // stray character reach Number() and post NaN.
  const setDec = (k: string, v: string) => set(k, v.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"));
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const kg = (k: string) => { const v = num(k); return v != null ? round2(displayToKg(v, units)) : undefined; };
  const cm = (k: string) => { const v = num(k); return v != null ? round2(lengthDisplayToCm(v, units)) : undefined; };
  const kcal = (k: string) => { const v = num(k); return v != null ? Math.round(displayToKcal(v, units)) : undefined; };
  const waterPresets = units.volume === "oz" ? [8, 12, 16, 24] : [250, 500, 750, 1000];
  // Distance rides the client's length preference: metric → km, imperial → mi.
  const distUnit = units.length === "in" ? "mi" : "km";
  const distanceToM = (): number | undefined => { const v = num("distance"); return v != null ? Math.round(v * (distUnit === "mi" ? 1609.34 : 1000)) : undefined; };
  const activityLabel = ACTIVITIES.find((a) => a.key === activityKey)?.label ?? "Activity";
  const track = activityTrack(activityKey); // "reps" | "distance" | "duration"

  // Grounded AI estimate — fill calories (and HR if blank) when the user doesn't
  // have the number from their watch.
  const askAi = async () => {
    const track = activityTrack(activityKey);
    const duration = num("duration");
    const reps = num("reps");
    const distanceM = distanceToM();
    if (!duration && !reps && !distanceM) { setErr(track === "reps" ? "Add a count first so the estimate has something to go on." : "Add a duration first so the estimate has something to go on."); return; }
    setErr(null); setAiBusy(true); setAiNote(null);
    try {
      const r = await api.post<{ calories: number; avgHrBpm: number | null; rationale: string }>("/api/ai/activity-estimate", {
        clientId, activityKey, label: activityLabel, durationMin: duration ?? null, reps: reps ?? null, avgHrBpm: num("hr") ?? null, distanceM: distanceM ?? null,
      });
      set("kcal", String(kcalToDisplay(r.calories, units)));
      if (r.avgHrBpm && !f.hr) set("hr", String(r.avgHrBpm));
      setAiNote(r.rationale || `Estimated ~${kcalToDisplay(r.calories, units)} ${energyLabel(units)}.`);
    } catch {
      setErr("Couldn't estimate right now — enter it manually.");
    } finally { setAiBusy(false); }
  };

  const close = () => { setKind(null); setFoodMode(false); setF({}); setRatings({ mood: null, energy: null, stress: null, sleepQ: null }); setActSearch(""); setAiNote(null); setPhotos([]); setErr(null); setPhotoErr(null); onClose(); };

  const uploadPhoto = async (file: File) => {
    setPhotoErr(null);
    try {
      const key = await uploadMedia(file, "progress", "upload", clientId);
      setPhotos((p) => [...p, { key, consentToFeature: false }]);
    } catch {
      setPhotoErr("Couldn't upload that photo — try again.");
    }
  };

  // Guard decimal inputs before posting: [field, min, max, human label]. A blank
  // field is skipped; a set field must parse to a finite number in range.
  const decChecks = (): [string, number, number, string][] => {
    if (kind === "weight") return [["amount", 20, 1100, "weight"]];
    if (kind === "body") return [["weight", 20, 1100, "weight"], ["bf", 1, 75, "body fat %"], ["neck", 5, 400, "neck size"], ["waist", 5, 400, "waist size"], ["hips", 5, 400, "hip size"], ["chest", 5, 400, "chest size"]];
    if (kind === "sleep") return [["hours", 0, 24, "hours slept"]];
    if (kind === "checkin") return [["weight", 20, 1100, "weight"], ["sleepHours", 0, 24, "sleep hours"]];
    return [];
  };

  const submit = async () => {
    for (const [k, min, max, label] of decChecks()) {
      const s = f[k];
      if (!s) continue;
      const n = Number(s);
      if (!Number.isFinite(n) || n < min || n > max) { setErr(`Enter a valid ${label}.`); return; }
    }
    if (kind === "activity") {
      if (track === "reps" && !num("reps")) { setErr("Enter a count."); return; }
      if (track !== "reps" && !num("duration")) { setErr("Enter a duration."); return; }
    }
    setErr(null);
    setBusy(true);
    try {
      if (kind === "water") await api.post("/api/logs/water", { clientId, data: { date, amountMl: num("amount") != null ? Math.round(volumeDisplayToMl(num("amount")!, units)) : undefined } });
      else if (kind === "weight") await api.post("/api/measurements", { clientId, data: { date, weightKg: kg("amount") } });
      else if (kind === "body") await api.post("/api/measurements", { clientId, data: { date, weightKg: kg("weight"), bodyFatPercent: num("bf"), neckCm: cm("neck"), waistCm: cm("waist"), hipsCm: cm("hips"), chestCm: cm("chest") } });
      else if (kind === "activity") await api.post("/api/logs/activity", { clientId, data: { date, activityKey, label: activityKey === "other" && f.actLabel ? f.actLabel : activityLabel, durationMin: num("duration") ?? null, reps: track === "reps" ? (num("reps") ?? null) : null, avgHrBpm: num("hr") ?? null, distanceM: track === "distance" ? (distanceToM() ?? null) : null, notes: f.actNotes || null, caloriesBurned: kcal("kcal") ?? null } });
      else if (kind === "sleep") await api.post("/api/logs/sleep", { clientId, data: { date, durationMinutes: Math.round((num("hours") ?? 0) * 60), quality: ratings.sleepQ ?? undefined, notes: f.notes || undefined } });
      else if (kind === "mood") await api.post("/api/logs/mood", { clientId, data: { date, mood: ratings.mood ?? undefined, energy: ratings.energy ?? undefined, stress: ratings.stress ?? undefined, notes: f.notes || undefined } });
      else if (kind === "checkin") await api.post("/api/check-ins", { clientId, data: { date, weightKg: kg("weight"), mood: ratings.mood ?? undefined, energy: ratings.energy ?? undefined, stress: ratings.stress ?? undefined, sleepHours: num("sleepHours"), stepsCount: num("steps"), notes: f.notes || undefined, progressPhotos: photos.length ? photos : undefined } });
      onLogged();
      close();
    } finally { setBusy(false); }
  };

  // Food logging is the full search/barcode/AI experience — identical to the Eat tab.
  if (open && foodMode) {
    return <FoodSearchSheet clientId={clientId} onClose={close} onLogged={onLogged} />;
  }

  return (
    <Sheet open={open} onClose={close} title={kind ? undefined : "Log"}>
      {!kind ? (
        <div className="grid grid-cols-2 gap-3 pb-2">
          {CHIPS.map((c) => (
            <button key={c.kind} onClick={() => (c.kind === "food" ? setFoodMode(true) : setKind(c.kind))} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-4 text-left transition-all hover:bg-surface-3 active:scale-[0.98]">
              <IconBadge icon={c.icon} tone={c.tone} size="sm" />
              <span className="font-medium">{c.label}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {kind === "water" && (<>
            <h2 className="text-lg font-semibold">Log water</h2>
            <div className="flex flex-wrap gap-2">{waterPresets.map((v) => <Chip key={v} selected={f.amount === String(v)} onClick={() => set("amount", String(v))}>{v} {volumeLabel(units)}</Chip>)}</div>
            <Field label={`Amount (${volumeLabel(units)})`} icon={Droplet} inputMode="numeric" value={f.amount ?? ""} onChange={(e) => set("amount", e.target.value.replace(/\D/g, ""))} />
          </>)}
          {kind === "weight" && (<>
            <h2 className="text-lg font-semibold">Log weight</h2>
            <Field label={`Weight (${weightLabel(units)})`} icon={Weight} inputMode="decimal" value={f.amount ?? ""} onChange={(e) => setDec("amount", e.target.value)} />
          </>)}
          {kind === "body" && (<>
            <h2 className="text-lg font-semibold">Body measurements</h2>
            <BodyScanLauncher clientId={clientId} onSaved={() => { onLogged(); close(); }}>
              {({ open, loading, profileReady }) =>
                profileReady ? (
                  <div className="space-y-2">
                    <Button className="w-full" onClick={open}><Camera /> Scan with camera</Button>
                    <div className="text-center text-xs text-muted-foreground">Or enter your measurements manually</div>
                  </div>
                ) : loading ? null : (
                  <p className="text-xs text-muted-foreground">Add your sex, birth date and height in your profile to scan with the camera.</p>
                )
              }
            </BodyScanLauncher>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Weight (${weightLabel(units)})`} inputMode="decimal" value={f.weight ?? ""} onChange={(e) => setDec("weight", e.target.value)} />
              <Field label="Body fat %" inputMode="decimal" value={f.bf ?? ""} onChange={(e) => setDec("bf", e.target.value)} />
              <Field label={`Neck (${lengthLabel(units)})`} inputMode="decimal" value={f.neck ?? ""} onChange={(e) => setDec("neck", e.target.value)} />
              <Field label={`Waist (${lengthLabel(units)})`} inputMode="decimal" value={f.waist ?? ""} onChange={(e) => setDec("waist", e.target.value)} />
              <Field label={`Hips (${lengthLabel(units)})`} inputMode="decimal" value={f.hips ?? ""} onChange={(e) => setDec("hips", e.target.value)} />
              <Field label={`Chest (${lengthLabel(units)})`} inputMode="decimal" value={f.chest ?? ""} onChange={(e) => setDec("chest", e.target.value)} />
            </div>
          </>)}
          {kind === "activity" && (<>
            <h2 className="text-lg font-semibold">Log activity</h2>
            {/* Searchable, categorized picker with a per-sport glyph. */}
            <div className="rounded-2xl border border-border/60 bg-surface-2 p-2">
              <div className="mb-2 flex items-center gap-2 px-1">
                <IconBadge icon={activityIcon(activityKey)} tone="activity" size="sm" />
                <span className="flex-1 text-sm font-semibold">{activityLabel}</span>
              </div>
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input value={actSearch} onChange={(e) => setActSearch(e.target.value)} placeholder="Search sports & workouts…" className="h-9 w-full rounded-full bg-background pl-8 pr-3 text-sm outline-none" />
              </div>
              <div className="max-h-52 space-y-2 overflow-y-auto pr-0.5">
                {activitiesByCategory().map((g) => {
                  const q = actSearch.trim().toLowerCase();
                  const items = g.activities.filter((a) => a.label.toLowerCase().includes(q));
                  if (!items.length) return null;
                  return (
                    <div key={g.key}>
                      <div className="px-1 pb-1 text-[0.62rem] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {items.map((a) => {
                          const Icon = activityIcon(a.key);
                          const on = activityKey === a.key;
                          return (
                            <button key={a.key} onClick={() => setActivityKey(a.key)} style={on ? { background: toneVar.activity, color: "#fff" } : undefined} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors [&_svg]:size-3.5", !on && "bg-background hover:bg-surface-3")}>
                              <Icon /> {a.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {activityKey === "other" && <Field label="What was it?" value={f.actLabel ?? ""} onChange={(e) => set("actLabel", e.target.value)} placeholder="Name your activity" />}
            {/* Only the fields that fit this activity — typed from a wearable
                (push-ups → a count, running → distance) or estimated by AI. */}
            <div className="grid grid-cols-2 gap-3">
              {track === "reps" && <Field label="Count (reps)" icon={Dumbbell} inputMode="numeric" value={f.reps ?? ""} onChange={(e) => set("reps", e.target.value.replace(/\D/g, ""))} />}
              {track === "distance" && <Field label={`Distance (${distUnit})`} icon={MapPin} inputMode="decimal" value={f.distance ?? ""} onChange={(e) => setDec("distance", e.target.value)} />}
              <Field label={track === "reps" ? "Duration (min, opt)" : "Duration (min)"} icon={Timer} inputMode="numeric" value={f.duration ?? ""} onChange={(e) => set("duration", e.target.value.replace(/\D/g, ""))} />
              <Field label="Avg HR (opt)" icon={HeartPulse} inputMode="numeric" value={f.hr ?? ""} onChange={(e) => set("hr", e.target.value.replace(/\D/g, ""))} />
              <Field label={`Energy (${energyLabel(units)}, opt)`} icon={Flame} inputMode="numeric" value={f.kcal ?? ""} onChange={(e) => set("kcal", e.target.value.replace(/\D/g, ""))} />
            </div>
            <p className="text-xs text-muted-foreground">Enter what your watch, Whoop, Apple Health or Fitbit shows. No numbers? Ask {ai.name} to estimate them from your body &amp; training.</p>
            <Button variant="tonal" size="sm" disabled={aiBusy} onClick={() => void askAi()}><AiAvatar className="size-5" /> {aiBusy ? "Estimating…" : `Ask ${ai.name} to estimate`}</Button>
            {aiNote && <p className="rounded-xl px-3 py-2 text-xs" style={{ background: `color-mix(in oklch, ${toneVar.activity} 12%, transparent)`, color: toneVar.activity }}>{aiNote}</p>}
            <Textarea rows={2} placeholder="Notes (optional)…" value={f.actNotes ?? ""} onChange={(e) => set("actNotes", e.target.value)} />
          </>)}
          {kind === "sleep" && (<>
            <h2 className="text-lg font-semibold">Log sleep</h2>
            <Field label="Hours slept" icon={Moon} inputMode="decimal" value={f.hours ?? ""} onChange={(e) => setDec("hours", e.target.value)} />
            <Rating label="Quality" value={ratings.sleepQ} onChange={(n) => setRatings((r) => ({ ...r, sleepQ: n }))} />
          </>)}
          {kind === "mood" && (<>
            <h2 className="text-lg font-semibold">Log mood</h2>
            <Rating label="Mood" value={ratings.mood} onChange={(n) => setRatings((r) => ({ ...r, mood: n }))} />
            <Rating label="Energy" value={ratings.energy} onChange={(n) => setRatings((r) => ({ ...r, energy: n }))} />
            <Rating label="Stress" value={ratings.stress} onChange={(n) => setRatings((r) => ({ ...r, stress: n }))} />
          </>)}
          {kind === "checkin" && (<>
            <h2 className="text-lg font-semibold">Daily check-in</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Weight (${weightLabel(units)})`} inputMode="decimal" value={f.weight ?? ""} onChange={(e) => setDec("weight", e.target.value)} />
              <Field label="Sleep (hrs)" inputMode="decimal" value={f.sleepHours ?? ""} onChange={(e) => setDec("sleepHours", e.target.value)} />
              <Field label="Steps" inputMode="numeric" value={f.steps ?? ""} onChange={(e) => set("steps", e.target.value.replace(/\D/g, ""))} />
            </div>
            <Rating label="Mood" value={ratings.mood} onChange={(n) => setRatings((r) => ({ ...r, mood: n }))} />
            <Rating label="Energy" value={ratings.energy} onChange={(n) => setRatings((r) => ({ ...r, energy: n }))} />
            <Rating label="Stress" value={ratings.stress} onChange={(n) => setRatings((r) => ({ ...r, stress: n }))} />
            <Textarea rows={2} placeholder="Notes for your coach…" value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
            <div>
              <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground"><span>Progress photos</span></div>
              <div className="flex flex-wrap gap-2">
                {photos.map((p, i) => (
                  <div key={i} className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs">
                    Photo {i + 1}
                    <Switch checked={p.consentToFeature} onCheckedChange={(v) => setPhotos((arr) => arr.map((x, j) => (j === i ? { ...x, consentToFeature: v } : x)))} />
                  </div>
                ))}
                <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-secondary px-3 text-xs [&_svg]:size-3.5"><Camera /> Add<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && void uploadPhoto(e.target.files[0])} /></label>
              </div>
              {photoErr && <p className="mt-1.5 text-xs text-warning">{photoErr}</p>}
              {photos.length > 0 && <p className="mt-1.5 text-xs text-muted-foreground">Photos are private. Toggle to allow featuring as a before/after.</p>}
            </div>
          </>)}
          {err && <p className="text-sm text-warning">{err}</p>}
          <div className="flex gap-3 pt-1">
            <Button variant="ghost" onClick={() => { setErr(null); setKind(null); }}>Back</Button>
            <Button size="lg" className="flex-1" disabled={busy} onClick={() => void submit()}>{busy ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
