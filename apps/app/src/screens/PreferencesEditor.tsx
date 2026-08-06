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
import { Badge, Callout, Card, Chip, Clock, Field, Select, Textarea, Reveal, Skeleton, SkeletonLine, FieldGroup, SaveBar, useAction, Target, Dumbbell, Utensils, MapPin, Activity } from "@4dl/ui";
import { api, errorText } from "../api.js";
import { useSession } from "../session.js";
import { useUnits } from "../units.js";

interface Editable {
  gender: string | null; dateOfBirth: string | null; heightCm: number | null;
  preferences: ClientPreferences;
  /** When these were last reviewed. Null = never touched since the record was made. */
  preferencesUpdatedAt?: string | null;
}

/**
 * "Reviewed 3 months ago", and a nudge past six.
 *
 * Preferences are current state with no history, deliberately — the trajectory
 * a coach wants lives in `client_goals`, which is already dated. What was
 * missing is FRESHNESS: a four-day split and a dairy restriction set fourteen
 * months ago look exactly like ones confirmed this morning, so a coach plans
 * around stale answers with nothing suggesting they might be.
 *
 * Six months is the nudge threshold rather than three: training preferences do
 * not change quarterly, and a warning that is usually noise gets ignored on the
 * one occasion it is not.
 */
function freshness(iso: string | null | undefined): { label: string; stale: boolean } | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  const days = Math.max(0, Math.floor((Date.now() - t) / 86400000));
  const months = Math.floor(days / 30);
  const label =
    days < 1 ? "Reviewed today"
      : days < 7 ? `Reviewed ${days} day${days === 1 ? "" : "s"} ago`
      : months < 1 ? `Reviewed ${Math.floor(days / 7)} week${days < 14 ? "" : "s"} ago`
      : months < 12 ? `Reviewed ${months} month${months === 1 ? "" : "s"} ago`
      : `Reviewed over a year ago`;
  return { label, stale: months >= 6 };
}
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
  const act = useAction(errorText);
  const units = useUnits();
  useEffect(() => {
    void api.get<{ client: Editable }>(`/api/clients/${clientId}`)
      .then((r) => setC({
        gender: r.client.gender,
        dateOfBirth: r.client.dateOfBirth,
        heightCm: r.client.heightCm,
        preferences: r.client.preferences ?? {},
        preferencesUpdatedAt: r.client.preferencesUpdatedAt ?? null,
      }))
      .catch(() => undefined);
  }, [clientId]);
  const setP = (patch: Partial<ClientPreferences>) => setC((x) => (x ? { ...x, preferences: { ...x.preferences, ...patch } } : x));
  const set = (patch: Partial<Editable>) => setC((x) => (x ? { ...x, ...patch } : x));
  const num = (s: string): number | null => { const n = Number(s.replace(/[^\d.]/g, "")); return s && !isNaN(n) ? n : null; };
  const save = () => {
    if (!c) return;
    return act.run("save", async () => {
      await api.patch(`/api/clients/${clientId}`, { ...(includeProfile ? { gender: c.gender ?? undefined, dateOfBirth: c.dateOfBirth ?? undefined, heightCm: c.heightCm ?? undefined } : {}), preferences: c.preferences });
      // Saving IS the review, so the badge has to move — leaving it reading
      // "over a year ago" straight after a save is the control telling you it
      // did not work.
      set({ preferencesUpdatedAt: new Date().toISOString() });
      onSaved?.();
      return "Saved.";
    }, "Couldn't save these preferences — they're unchanged.");
  };
  const p = c?.preferences ?? {};
  const tw = p.targetWeightKg != null ? kgToDisplay(p.targetWeightKg, units) : null;
  const fresh = freshness(c?.preferencesUpdatedAt);
  const hFt = c?.heightCm != null ? cmToFeetInches(c.heightCm) : null;

  return (
    /*
      ONE CARD PER GROUP, NOT ONE CARD FOR THE WHOLE PAGE.

      This was a single `Card` holding the profile basics and three `FieldGroup`s
      and the save button — eleven controls about three unrelated subjects, in
      one box, with the group titles doing all the separating. A card is a
      BOUNDARY (§7), so one card around everything says these things belong
      together, and the eye has nothing to rest against while scrolling.

      The groups keep ONE save between them, because they are one form: the
      server takes the whole preferences blob in a single PATCH, so splitting the
      submit would let a half-applied profile exist. The bar sits outside the
      cards, under all of them, where a shared footer belongs.
    */
    <Reveal loading={!c} skeleton={
      <div className="space-y-4">
        {[0, 1, 2].map((g) => (
          <Card key={g} className="space-y-4">
            <SkeletonLine w="30%" h="text" />
            {Array.from({ length: 2 }).map((_, i) => <div key={i} className="space-y-1.5"><SkeletonLine w="35%" h="xs" /><Skeleton className="h-10 w-full rounded-xl" /></div>)}
          </Card>
        ))}
        <Skeleton className="h-11 w-full rounded-full" />
      </div>
    }>
      {c && (
      <div className="space-y-4">
        {/* The intro belongs to the COACH's view only. On the client's own
            settings page `SettingsPage` has already said this, one line above,
            in its description — so printing it again is the third layer of
            chrome above the first control (§7). */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          {includeProfile
            ? <p className="min-w-0 flex-1 text-sm text-muted-foreground">The profile targets, workouts and meals are built from. Editable on the client&apos;s behalf.</p>
            : <span className="min-w-0 flex-1" />}
          {fresh && (
            <Badge tone={fresh.stale ? "warning" : "neutral"}>
              <Clock className="size-3" /> {fresh.label}
            </Badge>
          )}
        </div>
        {fresh?.stale && (
          <Callout tone="warning" icon={Clock}>
            {self
              ? "It has been a while — a quick read-through keeps your targets and plans accurate. Saving confirms them even if nothing changed."
              : "It has been a while since this was reviewed. Worth confirming with them before the next block."}
          </Callout>
        )}

        {includeProfile && (
          <Card className="space-y-4">
            <div className="text-sm font-semibold">Basics</div>
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
          </Card>
        )}

        <Card>
        <FieldGroup title="Goal" hint="What everything else is built to serve.">
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><Target className="size-4" /> Primary goal</label>
          <Select value={p.primaryGoal ?? ""} onChange={(v) => setP({ primaryGoal: (v || null) as ClientPreferences["primaryGoal"] })} options={opts(PRIMARY_GOAL_LABELS)} />
        </div>
        <Field label={`Target weight (${weightLabel(units)})`} inputMode="decimal" value={tw != null ? String(tw) : ""} onChange={(e) => setP({ targetWeightKg: e.target.value ? displayToKg(Number(e.target.value.replace(/[^\d.]/g, "")), units) : null })} placeholder={self ? "Where you're headed" : "Where they're headed"} />
        </FieldGroup>
        </Card>

        <Card>
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
        </Card>

        <Card>
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
        </Card>

        {/* Announced, not whispered: the outcome used to be a muted <p> a screen
            reader never saw and a thumb scrolled past — and a FAILED save had no
            line at all, because the save had no catch. `SaveBar` puts the result
            above the button, where the thumb already is. */}
        <SaveBar label="Save preferences" saving={act.busy === "save"} msg={act.msg} err={act.err} onSave={() => void save()} />
      </div>
      )}
    </Reveal>
  );
}
