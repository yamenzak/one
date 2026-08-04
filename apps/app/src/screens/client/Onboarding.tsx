/**
 * THE CLIENT'S INTAKE — the first screen anyone sees inside a studio.
 *
 * ── What it is, and what it must not depend on ──────────────────────────────
 *
 * It runs BEFORE any package, on purpose, and that is a rule rather than an
 * accident: `Shell` renders it the moment a client's record says
 * `onboardingComplete` is false, above every access gate, and the write behind
 * it (`PATCH /api/clients/:id`) is guarded by row-level scope alone — no
 * entitlement, no budget, no subscription. A studio that has sold the client
 * nothing yet still gets their sex, birth date and height, which is exactly the
 * order the work happens in: a coach cannot price a package for someone whose
 * profile is empty. E2E golden path 1 walks it on a studio with no catalogue at
 * all, so the independence is asserted rather than assumed.
 *
 * ── What was wrong with it ──────────────────────────────────────────────────
 *
 * It predated the flow primitives and reimplemented all three of them by hand:
 * a bare `div` of progress bars, a keyed `motion.div` per step, and two buttons
 * in a flex row. `StepHeader` / `StepPanel` / `StepActions` (§13) exist because
 * each of those has a trap — the panel's especially, since a hand-rolled object
 * `animate` silently kills every variant-driven child beneath it.
 *
 * Three more, in order of how much they cost:
 *
 *   THE SAVE COULD FAIL SILENTLY.  `try { await … } finally { setSaving(false) }`
 *     with no catch: the intake rejected into the app-wide "something didn't
 *     load" toast — generic words, indistinguishable from a failed READ — and
 *     the client sat on a finished wizard with a working Finish button and no
 *     idea their answers had not been kept. It is `useAction` now (§7), which
 *     cannot leave a rejection unhandled.
 *   SINGLE-SELECT WAS BUILT FROM CHIPS.  A row of `Chip`s looks like a
 *     multi-select and announces as N unrelated buttons. Every pick-one question
 *     here — sex, goal, where you train, experience, activity, diet — is a
 *     `ChoiceGroup`: a real radiogroup, one tab stop, arrow keys, and the
 *     question read out with the options. `Chip` survives in exactly one place,
 *     the days you can train, which genuinely IS a multi-select.
 *   A STEP THAT ASKED NOTHING.  Step 5 was a "you're all set" card the client
 *     had to tap past before anything was saved. The confirmation belongs AFTER
 *     the write, not before it — so the last question is the last step, and
 *     finishing is what the button does.
 */

import { useState, type ReactNode } from "react";
import { feetInchesToCm } from "@kova/domain";
import {
  Button, Card, Field, Chip, ChoiceGroup, Choice, Callout, Eyebrow, ActionResult,
  Screen, StepHeader, StepPanel, StepActions, useAction as useActionBase,
  Calendar, Ruler, ArrowRight, ArrowLeft, Info,
} from "@4dl/ui";
import { api, errorText } from "../../api.js";
import { useUnits } from "../../units.js";

const useAction = () => useActionBase(errorText);

interface Intake {
  gender: "male" | "female" | null;
  dateOfBirth: string;
  heightCm: string; heightFt: string; heightIn: string;
  primaryGoal: string; workoutLocation: string; experienceLevel: string;
  activityLevel: string; dietaryApproach: string; availableDays: string[];
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const STEPS = ["About you", "Your goal", "How you train", "How you eat"] as const;

const GOALS = [
  { value: "lose_weight", title: "Lose weight", sub: "Lower body fat while keeping strength" },
  { value: "build_muscle", title: "Build muscle", sub: "Add size and strength over time" },
  { value: "maintain", title: "Maintain", sub: "Hold where you are and stay consistent" },
  { value: "improve_fitness", title: "Improve fitness", sub: "Feel better, move better, last longer" },
] as const;

const ACTIVITY = [
  { value: "sedentary", title: "Sedentary", sub: "Desk job, little walking" },
  { value: "light", title: "Lightly active", sub: "On your feet some of the day" },
  { value: "moderate", title: "Moderately active", sub: "Regular walking or manual work" },
  { value: "very_active", title: "Very active", sub: "Physical job or training most days" },
] as const;

const DIETS = [
  { value: "balanced", title: "Balanced", sub: "A bit of everything" },
  { value: "high_protein", title: "High protein", sub: "Protein leads every meal" },
  { value: "low_carb", title: "Low carb", sub: "Fewer starches and sugars" },
  { value: "keto", title: "Keto", sub: "Very low carb, high fat" },
  { value: "vegetarian", title: "Vegetarian", sub: "No meat or fish" },
  { value: "vegan", title: "Vegan", sub: "No animal products at all" },
] as const;

/**
 * One question, with its heading visible.
 *
 * `ChoiceGroup`'s `label` is `aria-label` — announced, never drawn. On a step
 * that asks ONE thing that is right, because the step's name in `StepHeader` is
 * the question. On a step that asks two or three it is not: "Where do you
 * train?" and "How much training have you done?" render as six unexplained rows
 * in a column, and a sighted reader has strictly less to go on than a screen
 * reader does.
 */
function Ask({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Eyebrow>{label}</Eyebrow>
      {children}
    </div>
  );
}

export function Onboarding({ clientId, displayName, onDone }: { clientId: string; displayName: string; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Intake>({
    gender: null, dateOfBirth: "", heightCm: "", heightFt: "", heightIn: "",
    primaryGoal: "maintain", workoutLocation: "gym", experienceLevel: "beginner",
    activityLevel: "moderate", dietaryApproach: "balanced", availableDays: ["Mon", "Wed", "Fri"],
  });
  const units = useUnits();
  const act = useAction();
  const set = <K extends keyof Intake>(k: K, v: Intake[K]) => setF((p) => ({ ...p, [k]: v }));
  const toggleDay = (d: string) =>
    set("availableDays", f.availableDays.includes(d) ? f.availableDays.filter((x) => x !== d) : [...f.availableDays, d]);

  const heightCm = units.height === "ft_in"
    ? (f.heightFt ? Math.round(feetInchesToCm(Number(f.heightFt), Number(f.heightIn || 0))) : null)
    : (f.heightCm ? Number(f.heightCm) : null);
  // Guards against a fat-fingered "1800" posting a nonsense heightCm.
  const heightValid = heightCm != null && heightCm >= 50 && heightCm <= 300;
  const heightEntered = units.height === "ft_in" ? !!f.heightFt : !!f.heightCm;
  const canNext = step !== 0 || (!!f.gender && !!f.dateOfBirth && heightValid);
  const last = step === STEPS.length - 1;

  const finish = () =>
    act.run("finish", async () => {
      // These four answers must land in `preferences`, not only in `intake`.
      // `intake_json` is free-form context for the AI; `preferences_json` is the
      // typed store the rest of the product reads — including profileGaps, which
      // drives the coach's "finish this profile" card and the goal-setting
      // prompts. Sending them only as intake meant a client answered goal,
      // activity level and where they train, and their coach was still told all
      // three were missing. The option values here are deliberately the same
      // enums ClientPrefs validates, so they map across unchanged.
      await api.patch(`/api/clients/${clientId}`, {
        gender: f.gender,
        dateOfBirth: f.dateOfBirth || null,
        heightCm,
        preferences: {
          primaryGoal: f.primaryGoal,
          workoutLocation: f.workoutLocation,
          activityLevel: f.activityLevel,
          dietaryApproach: f.dietaryApproach,
        },
        intake: {
          primaryGoal: f.primaryGoal, workoutLocation: f.workoutLocation,
          experienceLevel: f.experienceLevel, activityLevel: f.activityLevel,
          dietaryApproach: f.dietaryApproach, availableDays: f.availableDays,
        },
        onboardingComplete: true,
      });
      onDone();
    }, "Couldn't save your answers. Nothing was lost — try again.");

  return (
    <Screen className="pb-0">
      <StepHeader steps={STEPS} current={step} eyebrow={step === 0 ? `Hi ${displayName}` : "Your intake"} />

      <StepPanel step={step}>
        {step === 0 && (
          <div className="space-y-5">
            <p className="px-1 text-sm text-muted-foreground">
              A few basics so your coach can tailor everything — and so the app can work out your targets.
            </p>
            <Ask label="Sex">
              <ChoiceGroup label="Sex" value={f.gender} onChange={(v) => set("gender", v as Intake["gender"])}>
                <Choice value="male" title="Male" />
                <Choice value="female" title="Female" />
              </ChoiceGroup>
              {/* Asked because the body-composition formulas take it as an
                  input, not to categorise anyone. Saying so is cheaper than
                  leaving people to guess why it is required. */}
              <p className="flex items-start gap-1.5 px-1 text-xs text-muted-foreground [&_svg]:mt-px [&_svg]:size-3.5 [&_svg]:shrink-0">
                <Info /> Used by the body-fat and calorie formulas. Your coach sees it; nobody else does.
              </p>
            </Ask>
            <Card className="space-y-4">
              <Field label="Date of birth" icon={Calendar} type="date" value={f.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
              {units.height === "ft_in" ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Height (ft)" icon={Ruler} inputMode="numeric" value={f.heightFt} onChange={(e) => set("heightFt", e.target.value.replace(/\D/g, ""))} />
                  <Field label="(in)" inputMode="numeric" value={f.heightIn} onChange={(e) => set("heightIn", e.target.value.replace(/\D/g, ""))} />
                </div>
              ) : (
                <Field label="Height (cm)" icon={Ruler} inputMode="numeric" value={f.heightCm} onChange={(e) => set("heightCm", e.target.value.replace(/\D/g, ""))} />
              )}
              {heightEntered && !heightValid && <p className="px-1 text-xs text-warning">Enter a realistic height.</p>}
            </Card>
          </div>
        )}

        {/* One question on this step, so the step's own name in `StepHeader` IS
            the question and a second heading would just repeat it. */}
        {step === 1 && (
          <ChoiceGroup label="What are you here for?" value={f.primaryGoal} onChange={(v) => set("primaryGoal", v)}>
            {GOALS.map((g) => <Choice key={g.value} value={g.value} title={g.title} sub={g.sub} />)}
          </ChoiceGroup>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <Ask label="Where do you train?">
              <ChoiceGroup label="Where do you train?" value={f.workoutLocation} onChange={(v) => set("workoutLocation", v)}>
                <Choice value="gym" title="A gym" sub="Full equipment" />
                <Choice value="home" title="At home" sub="Whatever you have" />
                <Choice value="outdoor" title="Outdoors" sub="Bodyweight and running" />
              </ChoiceGroup>
            </Ask>
            <Ask label="How much training have you done?">
              <ChoiceGroup label="How much training have you done?" value={f.experienceLevel} onChange={(v) => set("experienceLevel", v)}>
                <Choice value="beginner" title="New to it" sub="Under a year, or starting again" />
                <Choice value="intermediate" title="Some experience" sub="Training on and off for a while" />
                <Choice value="advanced" title="Experienced" sub="Years of consistent training" />
              </ChoiceGroup>
            </Ask>
            <Ask label="Days you can train">
              {/* The one genuine multi-select in the wizard, and the one place
                  chips are the right control. */}
              <div className="flex flex-wrap gap-2">
                {DAYS.map((d) => <Chip key={d} selected={f.availableDays.includes(d)} onClick={() => toggleDay(d)}>{d}</Chip>)}
              </div>
              {f.availableDays.length === 0 && <p className="px-1 text-xs text-muted-foreground">Pick at least one and your coach can build a week around it.</p>}
            </Ask>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <Ask label="How active is your day, outside training?">
              <ChoiceGroup label="How active is your day, outside training?" value={f.activityLevel} onChange={(v) => set("activityLevel", v)}>
                {ACTIVITY.map((a) => <Choice key={a.value} value={a.value} title={a.title} sub={a.sub} />)}
              </ChoiceGroup>
            </Ask>
            <Ask label="How do you eat?">
              <ChoiceGroup label="How do you eat?" value={f.dietaryApproach} onChange={(v) => set("dietaryApproach", v)}>
                {DIETS.map((d) => <Choice key={d.value} value={d.value} title={d.title} sub={d.sub} />)}
              </ChoiceGroup>
            </Ask>
            <Callout tone="primary" icon={Info}>
              None of this is fixed — your coach can change any of it, and so can you from Settings.
            </Callout>
          </div>
        )}

        {/* The failure lands next to the button that caused it, not in the
            app-wide toast that also announces failed reads. */}
        <ActionResult msg={act.msg} err={act.err} />
      </StepPanel>

      <StepActions back={step > 0 ? <Button variant="ghost" size="icon" aria-label="Back" onClick={() => setStep((s) => s - 1)}><ArrowLeft /></Button> : undefined}>
        {last ? (
          <Button size="lg" className="w-full" disabled={act.busy !== null} onClick={finish}>
            {act.busy ? "Saving…" : "Finish"}
          </Button>
        ) : (
          <Button size="lg" className="w-full" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
            Continue <ArrowRight />
          </Button>
        )}
      </StepActions>
    </Screen>
  );
}
