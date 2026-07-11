/** Client onboarding wizard — 5-step intake, animated. */

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button, Card, Field, Chip, Calendar, Ruler, ArrowRight, Trophy } from "@mossa/ui";
import { api } from "../../api.js";

interface Intake { gender: "male" | "female" | null; dateOfBirth: string; heightCm: string; primaryGoal: string; workoutLocation: string; experienceLevel: string; activityLevel: string; dietaryApproach: string; availableDays: string[] }
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function Onboarding({ clientId, displayName, onDone }: { clientId: string; displayName: string; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Intake>({ gender: null, dateOfBirth: "", heightCm: "", primaryGoal: "maintain", workoutLocation: "gym", experienceLevel: "beginner", activityLevel: "moderate", dietaryApproach: "balanced", availableDays: ["Mon", "Wed", "Fri"] });
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Intake>(k: K, v: Intake[K]) => setF((p) => ({ ...p, [k]: v }));
  const toggleDay = (d: string) => set("availableDays", f.availableDays.includes(d) ? f.availableDays.filter((x) => x !== d) : [...f.availableDays, d]);

  const finish = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/clients/${clientId}`, { gender: f.gender, dateOfBirth: f.dateOfBirth || null, heightCm: f.heightCm ? Number(f.heightCm) : null, intake: { primaryGoal: f.primaryGoal, workoutLocation: f.workoutLocation, experienceLevel: f.experienceLevel, activityLevel: f.activityLevel, dietaryApproach: f.dietaryApproach, availableDays: f.availableDays }, onboardingComplete: true });
      onDone();
    } finally { setSaving(false); }
  };

  const canNext = (step === 0 && f.gender && f.dateOfBirth && f.heightCm && Number(f.heightCm) >= 50) || step > 0;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-6 py-8">
      <div className="flex gap-1.5">{[0, 1, 2, 3, 4].map((i) => <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-secondary"}`} />)}</div>

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
          {step === 0 && (
            <Card className="space-y-4">
              <div><h2 className="text-xl font-semibold tracking-tight">Hi {displayName}</h2><p className="mt-1 text-sm text-muted-foreground">A few basics so your coach can tailor everything.</p></div>
              <div className="flex gap-2">{(["male", "female"] as const).map((g) => <Chip key={g} selected={f.gender === g} onClick={() => set("gender", g)}>{g}</Chip>)}</div>
              <Field label="Date of birth" icon={Calendar} type="date" value={f.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
              <Field label="Height (cm)" icon={Ruler} inputMode="numeric" value={f.heightCm} onChange={(e) => set("heightCm", e.target.value.replace(/\D/g, ""))} />
            </Card>
          )}
          {step === 1 && (
            <Card className="space-y-2.5"><h2 className="text-xl font-semibold tracking-tight">Your goal</h2>
              {([["lose_weight", "Lose weight"], ["build_muscle", "Build muscle"], ["maintain", "Maintain"], ["improve_fitness", "Improve fitness"]] as const).map(([v, label]) => (
                <button key={v} onClick={() => set("primaryGoal", v)} className={`w-full rounded-xl px-4 py-3.5 text-left font-medium transition-all active:scale-[0.98] ${f.primaryGoal === v ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{label}</button>
              ))}
            </Card>
          )}
          {step === 2 && (
            <Card className="space-y-4"><h2 className="text-xl font-semibold tracking-tight">Training context</h2>
              <Group label="Where do you train?" options={["gym", "home", "outdoor"]} value={f.workoutLocation} onChange={(v) => set("workoutLocation", v)} />
              <Group label="Experience" options={["beginner", "intermediate", "advanced"]} value={f.experienceLevel} onChange={(v) => set("experienceLevel", v)} />
              <div><div className="mb-2 text-sm text-muted-foreground">Available days</div><div className="flex flex-wrap gap-2">{DAYS.map((d) => <Chip key={d} selected={f.availableDays.includes(d)} onClick={() => toggleDay(d)}>{d}</Chip>)}</div></div>
            </Card>
          )}
          {step === 3 && (
            <Card className="space-y-4"><h2 className="text-xl font-semibold tracking-tight">Nutrition</h2>
              <Group label="Activity level" options={["sedentary", "light", "moderate", "very_active"]} value={f.activityLevel} onChange={(v) => set("activityLevel", v)} format />
              <Group label="Dietary approach" options={["balanced", "high_protein", "low_carb", "keto", "vegan", "vegetarian"]} value={f.dietaryApproach} onChange={(v) => set("dietaryApproach", v)} format />
            </Card>
          )}
          {step === 4 && (
            <Card className="space-y-3 text-center">
              <div className="mx-auto grid size-16 place-items-center rounded-3xl bg-primary/15 text-primary [&_svg]:size-8"><Trophy /></div>
              <h2 className="text-xl font-semibold tracking-tight">You're all set</h2>
              <p className="text-sm text-muted-foreground">Your coach now has what they need to build your plan.</p>
            </Card>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex gap-3">
        {step > 0 && <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>Back</Button>}
        {step < 4 ? <Button size="lg" className="flex-1" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Continue <ArrowRight /></Button> : <Button size="lg" className="flex-1" disabled={saving} onClick={() => void finish()}>{saving ? "Saving…" : "Finish"}</Button>}
      </div>
    </div>
  );
}

function Group({ label, options, value, onChange, format }: { label: string; options: string[]; value: string; onChange: (v: string) => void; format?: boolean }) {
  return (
    <div>
      <div className="mb-2 text-sm text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-2">{options.map((o) => <Chip key={o} selected={value === o} onClick={() => onChange(o)}>{format ? o.replace("_", " ") : o}</Chip>)}</div>
    </div>
  );
}
