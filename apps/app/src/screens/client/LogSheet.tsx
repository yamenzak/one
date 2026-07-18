/**
 * Log sheet — the comprehensive quick-log surface. Chip grid → per-kind forms:
 * food, activity (MET), water, weight, body (measurements + BF), sleep, mood,
 * and a rich check-in with progress photos + consent.
 */

import { useState } from "react";
import { ACTIVITIES, weightLabel, lengthLabel, volumeLabel, energyLabel, displayToKg, lengthDisplayToCm, volumeDisplayToMl, displayToKcal } from "@mossa/domain";
import {
  Button, Field, Textarea, Sheet, Chip, IconBadge, Switch,
  Utensils, Footprints, Droplet, Weight, Ruler, Bed, Smile, ClipboardList, Camera, Angry, Frown, Meh, Laugh,
  type LucideIcon, type Tone,
} from "@mossa/ui";
import { api, todayLocal, uploadMedia } from "../../api.js";
import { useUnits } from "../../units.js";
import { FoodSearchSheet } from "./FoodSearchSheet.js";

type LogKind = "food" | "activity" | "water" | "weight" | "body" | "sleep" | "mood" | "checkin";
const CHIPS: { kind: LogKind; label: string; icon: LucideIcon; tone: Tone }[] = [
  { kind: "food", label: "Food", icon: Utensils, tone: "nutrition" },
  { kind: "activity", label: "Activity", icon: Footprints, tone: "activity" },
  { kind: "water", label: "Water", icon: Droplet, tone: "hydration" },
  { kind: "weight", label: "Weight", icon: Weight, tone: "cardio" },
  { kind: "body", label: "Body", icon: Ruler, tone: "cardio" },
  { kind: "sleep", label: "Sleep", icon: Bed, tone: "sleep" },
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
  const [photos, setPhotos] = useState<{ key: string; consentToFeature: boolean }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const date = todayLocal();
  const units = useUnits();
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

  const close = () => { setKind(null); setFoodMode(false); setF({}); setRatings({ mood: null, energy: null, stress: null, sleepQ: null }); setPhotos([]); setErr(null); setPhotoErr(null); onClose(); };

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
    setErr(null);
    setBusy(true);
    try {
      if (kind === "water") await api.post("/api/logs/water", { clientId, data: { date, amountMl: num("amount") != null ? Math.round(volumeDisplayToMl(num("amount")!, units)) : undefined } });
      else if (kind === "weight") await api.post("/api/measurements", { clientId, data: { date, weightKg: kg("amount") } });
      else if (kind === "body") await api.post("/api/measurements", { clientId, data: { date, weightKg: kg("weight"), bodyFatPercent: num("bf"), neckCm: cm("neck"), waistCm: cm("waist"), hipsCm: cm("hips"), chestCm: cm("chest") } });
      else if (kind === "activity") await api.post("/api/logs/activity", { clientId, data: { date, activityKey, label: ACTIVITIES.find((a) => a.key === activityKey)?.label, durationMin: num("duration") ?? 0, avgHrBpm: num("hr") ?? null, caloriesBurned: kcal("kcal") ?? null } });
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
            <div className="flex flex-wrap gap-2">{ACTIVITIES.slice(0, 12).map((a) => <Chip key={a.key} selected={activityKey === a.key} onClick={() => setActivityKey(a.key)}>{a.label}</Chip>)}</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Duration (min)" inputMode="numeric" value={f.duration ?? ""} onChange={(e) => set("duration", e.target.value.replace(/\D/g, ""))} />
              <Field label="Avg HR (opt)" inputMode="numeric" value={f.hr ?? ""} onChange={(e) => set("hr", e.target.value.replace(/\D/g, ""))} />
            </div>
            <Field label={`Energy (${energyLabel(units)}, opt — else estimated)`} inputMode="numeric" value={f.kcal ?? ""} onChange={(e) => set("kcal", e.target.value.replace(/\D/g, ""))} hint="Wearables are more accurate; leave blank to estimate from MET × weight." />
          </>)}
          {kind === "sleep" && (<>
            <h2 className="text-lg font-semibold">Log sleep</h2>
            <Field label="Hours slept" icon={Bed} inputMode="decimal" value={f.hours ?? ""} onChange={(e) => setDec("hours", e.target.value)} />
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
