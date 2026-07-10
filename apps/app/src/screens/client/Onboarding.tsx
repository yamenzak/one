/**
 * Client onboarding wizard (SPEC §8.1) — the intake. 5 steps: personal,
 * starting point, training context, nutrition, confirm. Persists to the
 * client record + marks onboardingComplete. Shown before the client surfaces
 * when onboarding_complete is false.
 */

import { useState } from "react";
import { Button, Card, Field, SuggestionChip } from "@mossa/ui";
import { api } from "../../api.js";

interface Intake {
  gender: "male" | "female" | null;
  dateOfBirth: string;
  heightCm: string;
  primaryGoal: string;
  workoutLocation: string;
  experienceLevel: string;
  activityLevel: string;
  dietaryApproach: string;
  availableDays: string[];
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function Onboarding({ clientId, displayName, onDone }: { clientId: string; displayName: string; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Intake>({
    gender: null,
    dateOfBirth: "",
    heightCm: "",
    primaryGoal: "maintain",
    workoutLocation: "gym",
    experienceLevel: "beginner",
    activityLevel: "moderate",
    dietaryApproach: "balanced",
    availableDays: ["Mon", "Wed", "Fri"],
  });
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Intake>(k: K, v: Intake[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const toggleDay = (d: string) => set("availableDays", f.availableDays.includes(d) ? f.availableDays.filter((x) => x !== d) : [...f.availableDays, d]);

  const finish = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/clients/${clientId}`, {
        gender: f.gender,
        dateOfBirth: f.dateOfBirth || null,
        heightCm: f.heightCm ? Number(f.heightCm) : null,
        intake: {
          primaryGoal: f.primaryGoal,
          workoutLocation: f.workoutLocation,
          experienceLevel: f.experienceLevel,
          activityLevel: f.activityLevel,
          dietaryApproach: f.dietaryApproach,
          availableDays: f.availableDays,
        },
        onboardingComplete: true,
      });
      onDone();
    } finally {
      setSaving(false);
    }
  };

  const canNext =
    (step === 0 && f.gender && f.dateOfBirth && f.heightCm && Number(f.heightCm) >= 50) ||
    step === 1 ||
    step === 2 ||
    step === 3;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-6 py-8">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-activity" : "bg-surface-2"}`} />
        ))}
      </div>

      {step === 0 && (
        <Card className="space-y-4">
          <h2 className="text-xl font-semibold">Hi {displayName} 👋</h2>
          <p className="text-sm text-fg-muted">A few basics so your coach can tailor everything.</p>
          <div className="flex gap-2">
            {(["male", "female"] as const).map((g) => (
              <SuggestionChip key={g} selected={f.gender === g} onClick={() => set("gender", g)}>
                {g}
              </SuggestionChip>
            ))}
          </div>
          <Field label="Date of birth" icon="🎂" type="date" value={f.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
          <Field label="Height (cm)" icon="📏" inputMode="numeric" value={f.heightCm} onChange={(e) => set("heightCm", e.target.value.replace(/\D/g, ""))} />
        </Card>
      )}

      {step === 1 && (
        <Card className="space-y-3">
          <h2 className="text-xl font-semibold">Your goal</h2>
          {([
            ["lose_weight", "Lose weight"],
            ["build_muscle", "Build muscle"],
            ["maintain", "Maintain"],
            ["improve_fitness", "Improve fitness"],
          ] as const).map(([v, label]) => (
            <button key={v} onClick={() => set("primaryGoal", v)} className={`w-full rounded-2xl px-4 py-3 text-left ${f.primaryGoal === v ? "bg-primary-container text-on-primary-container" : "bg-surface-2"}`}>
              {label}
            </button>
          ))}
        </Card>
      )}

      {step === 2 && (
        <Card className="space-y-4">
          <h2 className="text-xl font-semibold">Training context</h2>
          <div>
            <div className="mb-2 text-sm text-fg-muted">Where do you train?</div>
            <div className="flex gap-2">
              {["gym", "home", "outdoor"].map((l) => (
                <SuggestionChip key={l} selected={f.workoutLocation === l} onClick={() => set("workoutLocation", l)}>{l}</SuggestionChip>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm text-fg-muted">Experience</div>
            <div className="flex gap-2">
              {["beginner", "intermediate", "advanced"].map((l) => (
                <SuggestionChip key={l} selected={f.experienceLevel === l} onClick={() => set("experienceLevel", l)}>{l}</SuggestionChip>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm text-fg-muted">Available days</div>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <SuggestionChip key={d} selected={f.availableDays.includes(d)} onClick={() => toggleDay(d)}>{d}</SuggestionChip>
              ))}
            </div>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="space-y-4">
          <h2 className="text-xl font-semibold">Nutrition</h2>
          <div>
            <div className="mb-2 text-sm text-fg-muted">Activity level</div>
            <div className="flex flex-wrap gap-2">
              {["sedentary", "light", "moderate", "very_active"].map((l) => (
                <SuggestionChip key={l} selected={f.activityLevel === l} onClick={() => set("activityLevel", l)}>{l.replace("_", " ")}</SuggestionChip>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm text-fg-muted">Dietary approach</div>
            <div className="flex flex-wrap gap-2">
              {["balanced", "high_protein", "low_carb", "keto", "vegan", "vegetarian"].map((l) => (
                <SuggestionChip key={l} selected={f.dietaryApproach === l} onClick={() => set("dietaryApproach", l)}>{l.replace("_", " ")}</SuggestionChip>
              ))}
            </div>
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card className="space-y-3 text-center">
          <div className="text-5xl">🎉</div>
          <h2 className="text-xl font-semibold">You're all set!</h2>
          <p className="text-sm text-fg-muted">Your coach now has what they need to build your plan.</p>
        </Card>
      )}

      <div className="flex gap-3">
        {step > 0 && (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>Back</Button>
        )}
        {step < 4 ? (
          <Button size="lg" className="flex-1" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Continue</Button>
        ) : (
          <Button size="lg" className="flex-1" disabled={saving} onClick={() => void finish()}>{saving ? "Saving…" : "Finish"}</Button>
        )}
      </div>
    </div>
  );
}
