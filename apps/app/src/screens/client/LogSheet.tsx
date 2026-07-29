/**
 * Log sheet — the comprehensive quick-log surface. Chip grid → per-kind forms:
 * food, activity (MET), water, weight, body (measurements + BF), sleep, mood,
 * and a rich check-in with progress photos + consent.
 */

import { useState } from "react";
import { ACTIVITIES, activitiesByCategory, activityTrack, weightLabel, lengthLabel, volumeLabel, energyLabel, displayToKg, lengthDisplayToCm, volumeDisplayToMl, displayToKcal, kcalToDisplay } from "@kova/domain";
import {
  Button, Field, Textarea, Sheet, Chip, IconBadge, Switch,
  Utensils, Footprints, Droplet, Weight, Ruler, Moon, Smile, ClipboardList, Camera, Angry, Frown, Meh, Laugh, Search, Timer, HeartPulse, MapPin, Flame, Dumbbell,
  cn, toneVar, type LucideIcon, type Tone,
} from "@kova/ui";
import { api, errorText, isQueued, todayLocal, uploadMedia } from "../../api.js";
import { QueuedNotice } from "../../notices.js";
import { useCan } from "../../FeatureLock.js";
import { useSession } from "../../session.js";
import { useUnits } from "../../units.js";
import { AiAvatar, useAiIdentity } from "../../AiAvatar.js";
import { FoodSearchSheet } from "./FoodSearchSheet.js";
import { activityIcon } from "./activityIcons.js";
import { SCALES, type ScaleKey } from "./scales.js";
import { BodyScanLauncher } from "./bodyscan/BodyScanLauncher.js";

type LogKind = "food" | "activity" | "water" | "weight" | "body" | "sleep" | "mood" | "checkin";
const CHIPS: { kind: LogKind; label: string; icon: LucideIcon; tone: Tone }[] = [
  { kind: "food", label: "Food", icon: Utensils, tone: "nutrition" },
  { kind: "activity", label: "Activity", icon: Footprints, tone: "cardio" },
  { kind: "water", label: "Water", icon: Droplet, tone: "hydration" },
  { kind: "weight", label: "Weight", icon: Weight, tone: "cardio" },
  { kind: "body", label: "Body", icon: Ruler, tone: "cardio" },
  { kind: "sleep", label: "Sleep", icon: Moon, tone: "sleep" },
  { kind: "mood", label: "Mood", icon: Smile, tone: "nutrition" },
  { kind: "checkin", label: "Check-in", icon: ClipboardList, tone: "primary" },
];
const MOOD_ICONS = [Angry, Frown, Meh, Smile, Laugh];

/*
  ONE TITLE, IN THE HEADER.

  Each form used to open with its own `<h2 className="text-lg font-semibold">`
  while the Sheet's real title slot was passed `undefined` — a heading rendered
  twice over at two sizes, one of them invisible to the accessibility tree. It
  became visible once the sheet header was pinned: the `<h2>` scrolled away
  under an empty pinned bar. The Sheet owns the title; these are its values.
*/
const KIND_TITLE: Record<LogKind, string> = {
  food: "Log food",
  activity: "Log activity",
  water: "Log water",
  weight: "Log weight",
  body: "Body measurements",
  sleep: "Log sleep",
  mood: "Log mood",
  checkin: "Daily check-in",
};

/*
  ── STRESS RUNS THE OTHER WAY, AND THE FACES DIDN'T ─────────────────────────

  All three scales rendered the SAME five faces, ascending: Angry … Laugh. On
  Mood and Energy that is right. On Stress it inverted the answer. The domain
  stores 5 = MOST stressed (`wellness.ts` scores `6 - avgStress`; `progress.ts`
  subtracts `(stress - 3)`), so a client having a great, calm day tapped the
  grinning face on the right — and the app recorded maximum stress, dragged
  their wellness score down, and handed their coach the opposite of the truth.

  Nothing about the widget could have told them: five faces, no endpoints, no
  words. So both are fixed — the glyphs run calm→stressed for this scale, and
  every scale now names what each end means.
*/
const STRESS_ICONS = [...MOOD_ICONS].reverse();

function Rating({ label, scale, value, onChange }: { label: string; scale: ScaleKey; value: number | null; onChange: (n: number) => void }) {
  const s = SCALES[scale];
  const icons = s.inverted ? STRESS_ICONS : MOOD_ICONS;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {/* The answer in words, so what you tapped is never a guess. */}
        {value != null && <span className="text-sm font-medium">{s.words[value - 1]}</span>}
      </div>
      <div className="flex gap-2" role="radiogroup" aria-label={label}>
        {icons.map((Face, i) => (
          <button key={i} role="radio" aria-label={`${label}: ${s.words[i]}`} aria-checked={value === i + 1} onClick={() => onChange(i + 1)} className={`grid size-11 place-items-center rounded-full transition-all active:scale-90 [&_svg]:size-5 ${value === i + 1 ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
            <Face />
          </button>
        ))}
      </div>
      {/* Endpoints, always — a bare row of faces is only guessable for Mood. */}
      <div className="mt-1.5 flex justify-between px-1 text-micro uppercase text-muted-foreground">
        <span>{s.low}</span><span>{s.high}</span>
      </div>
    </div>
  );
}

export function LogSheet({ open, onClose, clientId, onLogged, initialKind }: { open: boolean; onClose: () => void; clientId: string; onLogged: () => void; initialKind?: LogKind }) {
  const [kindState, setKind] = useState<LogKind | null>(initialKind ?? null);
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
  // The write is parked in the service-worker queue — reassure, don't alarm.
  const [queued, setQueued] = useState(false);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const date = todayLocal();
  const units = useUnits();
  const ai = useAiIdentity();
  // The chip registry is the switchboard: every kind below writes to a route
  // that now 403s without its client capability, so a kind the client doesn't
  // hold is dropped from the grid entirely (check-in is governed by no flag).
  const canFood = useCan("foodLogging");
  const canActivity = useCan("extraWorkouts");
  const canWater = useCan("waterLogging");
  const canMeasure = useCan("measurementLogging");
  const canSleep = useCan("sleepLogging");
  const canMood = useCan("moodLogging");
  // The camera scan inside the Body form posts to /api/body-scans (`bodyScan`).
  const canBodyScan = useCan("bodyScan");
  const chips = CHIPS.filter((c) =>
    c.kind === "food" ? canFood
    : c.kind === "activity" ? canActivity
    : c.kind === "water" ? canWater
    : c.kind === "weight" || c.kind === "body" ? canMeasure
    : c.kind === "sleep" ? canSleep
    : c.kind === "mood" ? canMood
    : true);
  // A caller's `initialKind` can name a chip this client's package no longer
  // includes (Wellness deep-links sleep/mood, Train deep-links activity) — fall
  // back to the first available form rather than opening an empty sheet.
  const kind: LogKind | null = kindState == null || chips.some((c) => c.kind === kindState)
    ? kindState
    : chips.find((c) => c.kind !== "food")?.kind ?? null;
  // Check-in FORM composition — which fields the coach's package asks for. These
  // shape the form, they are not a security gate, so an absent clientFlags
  // (staff, or no package context) means "include everything".
  const { ctx } = useSession();
  const cf = ctx?.clientFlags;
  const ciMood = cf?.checkInIncludesMood ?? true;
  const ciSleep = cf?.checkInIncludesSleep ?? true;
  const ciStress = cf?.checkInIncludesStress ?? true;
  const ciMeasurements = cf?.checkInIncludesMeasurements ?? true;
  const ciPhotos = cf?.checkInIncludesPhotos ?? true;
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

  const close = () => { setKind(null); setFoodMode(false); setF({}); setRatings({ mood: null, energy: null, stress: null, sleepQ: null }); setActSearch(""); setAiNote(null); setPhotos([]); setErr(null); setQueued(false); setPhotoErr(null); onClose(); };

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
    // Water and Sleep post a REQUIRED positive number (LogWater.amountMl and
    // LogSleep.durationMinutes are both `int().positive()` in @kova/protocol).
    // A blank amount sent `undefined`, and 0 hours sent durationMinutes: 0 —
    // both 400 at the route, which with no catch below read as a Save button
    // that does nothing, forever. Catch it here where we can say why.
    if (kind === "water" && !num("amount")) { setErr("Enter how much you drank."); return; }
    if (kind === "sleep" && !((num("hours") ?? 0) > 0)) { setErr("Enter how many hours you slept."); return; }
    // Weight / Body / Check-in are all-optional forms, but an entirely empty one
    // posts nothing and looks like it saved. Require at least one value.
    if (kind === "weight" && !num("amount")) { setErr("Enter your weight."); return; }
    if (kind === "body" && !["weight", "bf", "neck", "waist", "hips", "chest"].some((k) => num(k) != null)) {
      setErr("Enter at least one measurement."); return;
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
      // Only send what the form actually rendered — an un-asked-for field must
      // not arrive as a value the coach then sees on the check-in.
      else if (kind === "checkin") await api.post("/api/check-ins", { clientId, data: { date, weightKg: ciMeasurements ? kg("weight") : undefined, mood: ciMood ? (ratings.mood ?? undefined) : undefined, energy: ciMood ? (ratings.energy ?? undefined) : undefined, stress: ciStress ? (ratings.stress ?? undefined) : undefined, sleepHours: ciSleep ? num("sleepHours") : undefined, stepsCount: num("steps"), notes: f.notes || undefined, progressPhotos: ciPhotos && photos.length ? photos : undefined } });
      onLogged();
      close();
    } catch (e) {
      // Without this every one of the eight kinds failed in total silence: an
      // unhandled rejection, "Saving…" flipping back to "Save", the sheet still
      // open, and nothing said. A queued offline write is the opposite case — it
      // WILL land, so treat it as a success and say so rather than inviting a
      // retry that would double-count the day.
      if (isQueued(e)) { setQueued(true); onLogged(); return; }
      setErr(errorText(e, "Couldn't save that. Check your connection and try again."));
    } finally { setBusy(false); }
  };

  // Food logging is the full search/barcode/AI experience — identical to the Eat tab.
  if (open && foodMode) {
    return <FoodSearchSheet clientId={clientId} onClose={close} onLogged={onLogged} />;
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title={kind ? KIND_TITLE[kind] : "Log"}
      /* The chip grid is a picker, so it takes the tall size and stops resizing
         as capabilities change the chip count. A form sizes to itself. */
      size={kind ? "default" : "tall"}
      footer={kind ? (
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => { setErr(null); setQueued(false); setKind(null); }}>Back</Button>
          <Button size="lg" className="flex-1" disabled={busy} onClick={() => void submit()}>{busy ? "Saving…" : queued ? "Done" : "Save"}</Button>
        </div>
      ) : undefined}
    >
      {!kind ? (
        <div className="grid grid-cols-2 gap-3 pb-2">
          {chips.map((c) => (
            <button key={c.kind} onClick={() => (c.kind === "food" ? setFoodMode(true) : setKind(c.kind))} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-4 text-left transition-all hover:bg-surface-3 active:scale-[0.98]">
              <IconBadge icon={c.icon} tone={c.tone} size="sm" />
              <span className="font-medium">{c.label}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {kind === "water" && (<>
            <div className="flex flex-wrap gap-2">{waterPresets.map((v) => <Chip key={v} selected={f.amount === String(v)} onClick={() => set("amount", String(v))}>{v} {volumeLabel(units)}</Chip>)}</div>
            <Field label={`Amount (${volumeLabel(units)})`} icon={Droplet} inputMode="numeric" value={f.amount ?? ""} onChange={(e) => set("amount", e.target.value.replace(/\D/g, ""))} />
          </>)}
          {kind === "weight" && (<>
            <Field label={`Weight (${weightLabel(units)})`} icon={Weight} inputMode="decimal" value={f.amount ?? ""} onChange={(e) => setDec("amount", e.target.value)} />
          </>)}
          {kind === "body" && (<>
            {canBodyScan && (
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
            )}
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
            {/* Searchable, categorized picker with a per-sport glyph. */}
            <div className="rounded-2xl border border-border/60 bg-surface-2 p-2">
              <div className="mb-2 flex items-center gap-2 px-1">
                <IconBadge icon={activityIcon(activityKey)} tone="cardio" size="sm" />
                <span className="flex-1 text-sm font-semibold">{activityLabel}</span>
              </div>
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input value={actSearch} onChange={(e) => setActSearch(e.target.value)} aria-label="Search sports & workouts" placeholder="Search sports & workouts…" className="h-9 w-full rounded-full bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/70" />
              </div>
              {/*
                NO GLYPH ON THE CHIPS.

                Every chip carried `activityIcon(a.key)`, which resolves by
                CATEGORY — so a section headed "CARDIO" showed the identical
                footprints mark nine times in a row, on Rowing and Elliptical
                too. An icon repeated down a list is not an identifier, it is
                texture: it said nothing the heading hadn't, and it took the
                width the labels needed, forcing three-per-row and a clipped
                bottom line. The selected activity keeps its glyph in the header
                above, where there is exactly one of them.

                The mask is the other half: a scroll area that hard-cuts through
                the middle of a row reads as broken, not as "there's more".
              */}
              <div
                className="max-h-52 space-y-2 overflow-y-auto pr-0.5"
                style={{ maskImage: "linear-gradient(to bottom, #000 calc(100% - 1.5rem), transparent)", WebkitMaskImage: "linear-gradient(to bottom, #000 calc(100% - 1.5rem), transparent)" }}
              >
                {activitiesByCategory().map((g) => {
                  const q = actSearch.trim().toLowerCase();
                  const items = g.activities.filter((a) => a.label.toLowerCase().includes(q));
                  if (!items.length) return null;
                  return (
                    <div key={g.key}>
                      <div className="px-1 pb-1 text-micro uppercase text-muted-foreground">{g.label}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {items.map((a) => {
                          const on = activityKey === a.key;
                          return (
                            <button key={a.key} aria-pressed={on} onClick={() => setActivityKey(a.key)} style={on ? { background: toneVar.cardio, color: "var(--tone-foreground)" } : undefined} className={cn("rounded-full px-3 py-1.5 text-sm transition-colors", !on && "bg-background hover:bg-surface-3")}>
                              {a.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {/* A search that matches nothing must say so. */}
                {actSearch.trim() && !ACTIVITIES.some((a) => a.label.toLowerCase().includes(actSearch.trim().toLowerCase())) && (
                  <p className="px-1 py-3 text-center text-sm text-muted-foreground">Nothing matches “{actSearch.trim()}”. Pick <span className="font-medium text-foreground">Other</span> and name it yourself.</p>
                )}
                <div className="h-4" aria-hidden="true" />
              </div>
            </div>
            {activityKey === "other" && <Field label="What was it?" value={f.actLabel ?? ""} onChange={(e) => set("actLabel", e.target.value)} placeholder="Name your activity" />}
            {/* Only the fields that fit this activity — typed from a wearable
                (push-ups → a count, running → distance) or estimated by AI. */}
            <div className="grid grid-cols-2 gap-3">
              {track === "reps" && <Field label="Count (reps)" icon={Dumbbell} inputMode="numeric" value={f.reps ?? ""} onChange={(e) => set("reps", e.target.value.replace(/\D/g, ""))} />}
              {track === "distance" && <Field label={`Distance (${distUnit})`} icon={MapPin} inputMode="decimal" value={f.distance ?? ""} onChange={(e) => setDec("distance", e.target.value)} />}
              <Field label={track === "reps" ? "Duration (min, optional)" : "Duration (min)"} icon={Timer} inputMode="numeric" value={f.duration ?? ""} onChange={(e) => set("duration", e.target.value.replace(/\D/g, ""))} />
              <Field label="Avg HR (optional)" icon={HeartPulse} inputMode="numeric" value={f.hr ?? ""} onChange={(e) => set("hr", e.target.value.replace(/\D/g, ""))} />
              <Field label={`Energy (${energyLabel(units)}, optional)`} icon={Flame} inputMode="numeric" value={f.kcal ?? ""} onChange={(e) => set("kcal", e.target.value.replace(/\D/g, ""))} />
            </div>
            <p className="text-xs text-muted-foreground">Enter what your watch, Whoop, Apple Health or Fitbit shows. No numbers? Ask {ai.name} to estimate them from your body &amp; training.</p>
            <Button variant="tonal" size="sm" disabled={aiBusy} onClick={() => void askAi()}><AiAvatar className="size-5" /> {aiBusy ? "Estimating…" : `Ask ${ai.name} to estimate`}</Button>
            {aiNote && <p className="rounded-xl px-3 py-2 text-xs" style={{ background: `color-mix(in oklch, ${toneVar.cardio} 12%, transparent)`, color: toneVar.cardio }}>{aiNote}</p>}
            <Textarea rows={2} placeholder="Notes (optional)…" value={f.actNotes ?? ""} onChange={(e) => set("actNotes", e.target.value)} />
          </>)}
          {kind === "sleep" && (<>
            <Field label="Hours slept" icon={Moon} inputMode="decimal" value={f.hours ?? ""} onChange={(e) => setDec("hours", e.target.value)} />
            <Rating label="Quality" scale="sleepQ" value={ratings.sleepQ} onChange={(n) => setRatings((r) => ({ ...r, sleepQ: n }))} />
          </>)}
          {kind === "mood" && (<>
            <Rating label="Mood" scale="mood" value={ratings.mood} onChange={(n) => setRatings((r) => ({ ...r, mood: n }))} />
            <Rating label="Energy" scale="energy" value={ratings.energy} onChange={(n) => setRatings((r) => ({ ...r, energy: n }))} />
            <Rating label="Stress" scale="stress" value={ratings.stress} onChange={(n) => setRatings((r) => ({ ...r, stress: n }))} />
          </>)}
          {kind === "checkin" && (<>
            {/* Form composition from the package's check-in flags. */}
            <div className="grid grid-cols-2 gap-3">
              {ciMeasurements && <Field label={`Weight (${weightLabel(units)})`} inputMode="decimal" value={f.weight ?? ""} onChange={(e) => setDec("weight", e.target.value)} />}
              {ciSleep && <Field label="Sleep (hrs)" inputMode="decimal" value={f.sleepHours ?? ""} onChange={(e) => setDec("sleepHours", e.target.value)} />}
              {/* Steps is the odd one out of three, so it takes the whole row
                  rather than leaving a hole beside itself. When the package
                  drops weight or sleep it falls back into the pair. */}
              <Field className={ciMeasurements !== ciSleep ? undefined : "col-span-2"} label="Steps" inputMode="numeric" value={f.steps ?? ""} onChange={(e) => set("steps", e.target.value.replace(/\D/g, ""))} />
            </div>
            {ciMood && <Rating label="Mood" scale="mood" value={ratings.mood} onChange={(n) => setRatings((r) => ({ ...r, mood: n }))} />}
            {ciMood && <Rating label="Energy" scale="energy" value={ratings.energy} onChange={(n) => setRatings((r) => ({ ...r, energy: n }))} />}
            {ciStress && <Rating label="Stress" scale="stress" value={ratings.stress} onChange={(n) => setRatings((r) => ({ ...r, stress: n }))} />}
            <Textarea rows={2} placeholder="Notes for your coach…" value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
            {ciPhotos && (
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
            )}
          </>)}
          {err && <p className="text-sm text-warning" role="alert">{err}</p>}
          {queued && <QueuedNotice />}
        </div>
      )}
    </Sheet>
  );
}
