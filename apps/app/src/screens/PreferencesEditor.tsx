/**
 * Shared training & nutrition preferences editor — the profile a coach builds
 * goals and plans from. Mounted by the client (in Settings) and by the coach (in
 * the client's Manage tab, `includeProfile` to also edit the BMR basics
 * gender/DOB/height). Stored metric; shown in the editor's units.
 */

import { useEffect, useState } from "react";
import {
  kgToDisplay, displayToKg, weightLabel, cmToFeetInches, feetInchesToCm,
  PRIMARY_GOAL_LABELS, ACTIVITY_LEVEL_LABELS, DIETARY_APPROACH_LABELS, WORKOUT_LOCATION_LABELS,
  type ClientPreferences, type WorkoutLocation,
} from "@kova/domain";
import { Button, Card, Chip, Field, Select, Textarea, Reveal, Skeleton, SkeletonLine, FieldGroup, ActionResult, Target, Dumbbell, Utensils, MapPin, Activity } from "@4dl/ui";
import { api } from "../api.js";
import { useSession } from "../session.js";
import { useUnits } from "../units.js";

interface Editable { gender: string | null; dateOfBirth: string | null; heightCm: number | null; preferences: ClientPreferences }
const WORKOUT_LOCATIONS = Object.keys(WORKOUT_LOCATION_LABELS) as WorkoutLocation[];
const opts = (m: Record<string, string>) => [{ value: "", label: "Select…" }, ...Object.entries(m).map(([value, label]) => ({ value, label }))];

export function PreferencesEditorCard({ clientId, includeProfile = false, onSaved }: { clientId: string; includeProfile?: boolean; onSaved?: () => void }) {
  /*
    WHO IS READING THIS.

    One editor, two readers: a coach filling in a client's profile, and the
    client filling in their own from Preferences. Every string was written for
    the coach — so a client opening their own settings was asked for "Target
    weight … Where THEY'RE headed", "Where THEY train", and injuries described as
    "equipment THEY don't have". Their own screen, talking about them in the
    third person.

    Derived from the session rather than passed as a prop: a call site cannot
    get it wrong, and there is exactly one truth (does this client record belong
    to the signed-in user).
  */
  const { ctx } = useSession();
  const self = ctx?.active?.clientId != null && ctx.active.clientId === clientId;
  const [c, setC] = useState<Editable | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const units = useUnits();
  useEffect(() => { void api.get<{ client: Editable }>(`/api/clients/${clientId}`).then((r) => setC({ gender: r.client.gender, dateOfBirth: r.client.dateOfBirth, heightCm: r.client.heightCm, preferences: r.client.preferences ?? {} })).catch(() => undefined); }, [clientId]);
  const setP = (patch: Partial<ClientPreferences>) => setC((x) => (x ? { ...x, preferences: { ...x.preferences, ...patch } } : x));
  const set = (patch: Partial<Editable>) => setC((x) => (x ? { ...x, ...patch } : x));
  const num = (s: string): number | null => { const n = Number(s.replace(/[^\d.]/g, "")); return s && !isNaN(n) ? n : null; };
  const save = async () => {
    if (!c) return; setSaving(true); setMsg(null);
    try {
      await api.patch(`/api/clients/${clientId}`, { ...(includeProfile ? { gender: c.gender ?? undefined, dateOfBirth: c.dateOfBirth ?? undefined, heightCm: c.heightCm ?? undefined } : {}), preferences: c.preferences });
      setMsg("Saved."); onSaved?.();
    } finally { setSaving(false); }
  };
  const p = c?.preferences ?? {};
  const tw = p.targetWeightKg != null ? kgToDisplay(p.targetWeightKg, units) : null;
  const hFt = c?.heightCm != null ? cmToFeetInches(c.heightCm) : null;

  return (
    <Reveal loading={!c} skeleton={
      <Card className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="space-y-1.5"><SkeletonLine w="35%" h="xs" /><Skeleton className="h-10 w-full rounded-xl" /></div>)}
        <Skeleton className="h-11 w-full rounded-full" />
      </Card>
    }>
      {c && (
      <Card className="space-y-4">
        <p className="text-sm text-muted-foreground">{includeProfile ? "The profile targets, workouts and meals are built from. Editable on the client's behalf." : "Your coach uses these to build accurate targets, workouts and meals. Keep them current."}</p>

        {includeProfile && (
          <>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Gender</label>
              <div className="flex gap-2">{([["male", "Male"], ["female", "Female"]] as const).map(([v, l]) => <Chip key={v} selected={c.gender === v} onClick={() => set({ gender: v })}>{l}</Chip>)}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date of birth" type="date" value={c.dateOfBirth ?? ""} onChange={(e) => set({ dateOfBirth: e.target.value || null })} />
              {units.height === "ft_in" ? (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Height (ft)" inputMode="numeric" value={hFt ? String(hFt.ft) : ""} onChange={(e) => set({ heightCm: feetInchesToCm(Number(e.target.value.replace(/\D/g, "") || 0), hFt?.in ?? 0) || null })} />
                  <Field label="(in)" inputMode="numeric" value={hFt ? String(hFt.in) : ""} onChange={(e) => set({ heightCm: feetInchesToCm(hFt?.ft ?? 0, Number(e.target.value.replace(/\D/g, "") || 0)) || null })} />
                </div>
              ) : (
                <Field label="Height (cm)" inputMode="numeric" value={c.heightCm != null ? String(Math.round(c.heightCm)) : ""} onChange={(e) => set({ heightCm: Number(e.target.value.replace(/[^\d.]/g, "")) || null })} />
              )}
            </div>
          </>
        )}

        <FieldGroup title="Goal" hint="What everything else is built to serve.">
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><Target className="size-4" /> Primary goal</label>
          <Select value={p.primaryGoal ?? ""} onChange={(v) => setP({ primaryGoal: (v || null) as ClientPreferences["primaryGoal"] })} options={opts(PRIMARY_GOAL_LABELS)} />
        </div>
        <Field label={`Target weight (${weightLabel(units)})`} inputMode="decimal" value={tw != null ? String(tw) : ""} onChange={(e) => setP({ targetWeightKg: e.target.value ? displayToKg(Number(e.target.value.replace(/[^\d.]/g, "")), units) : null })} placeholder={self ? "Where you're headed" : "Where they're headed"} />
        </FieldGroup>

        <FieldGroup title="Training" hint="How much, how often, and where.">
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><Activity className="size-4" /> Activity level</label>
          <Select value={p.activityLevel ?? ""} onChange={(v) => setP({ activityLevel: (v || null) as ClientPreferences["activityLevel"] })} options={opts(ACTIVITY_LEVEL_LABELS)} />
          <p className="mt-1 px-1 text-xs text-muted-foreground">Day-to-day movement outside workouts — sets the calorie baseline.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Workouts / week" icon={Dumbbell} inputMode="numeric" value={p.workoutsPerWeek != null ? String(p.workoutsPerWeek) : ""} onChange={(e) => setP({ workoutsPerWeek: num(e.target.value) })} />
          <Field label="Meals / day" icon={Utensils} inputMode="numeric" value={p.mealsPerDay != null ? String(p.mealsPerDay) : ""} onChange={(e) => setP({ mealsPerDay: num(e.target.value) })} />
        </div>
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><MapPin className="size-4" /> {self ? "Where you train" : "Where they train"}</label>
          <div className="flex flex-wrap gap-2">{WORKOUT_LOCATIONS.map((loc) => <Chip key={loc} selected={p.workoutLocation === loc} onClick={() => setP({ workoutLocation: p.workoutLocation === loc ? null : loc })}>{WORKOUT_LOCATION_LABELS[loc]}</Chip>)}</div>
        </div>
        </FieldGroup>

        <FieldGroup title="Food & limits" hint="What to plan around, and what to avoid.">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Dietary approach</label>
          <Select value={p.dietaryApproach ?? ""} onChange={(v) => setP({ dietaryApproach: (v || null) as ClientPreferences["dietaryApproach"] })} options={opts(DIETARY_APPROACH_LABELS)} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Injuries or limitations</label>
          <Textarea value={p.limitations ?? ""} onChange={(e) => setP({ limitations: e.target.value || null })} placeholder={self ? "A bad knee, allergies, equipment you don't have…" : "A bad knee, allergies, equipment they don't have…"} rows={3} />
        </div>
        </FieldGroup>

        <Button size="lg" className="w-full" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save preferences"}</Button>
        {/* Announced, not whispered: this used to be a muted <p> a screen reader
            never saw and a thumb scrolled past. */}
        <ActionResult msg={msg} err={null} />
      </Card>
      )}
    </Reveal>
  );
}
