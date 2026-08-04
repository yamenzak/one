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
 * nothing yet still gets their profile, which is the order the work happens in:
 * a coach cannot price a package for someone whose profile is empty. E2E golden
 * path 1 walks it on a studio with no catalogue at all, so the independence is
 * asserted rather than assumed.
 *
 * ── It answers the coach's gap list, all nine of it ─────────────────────────
 *
 * `profileGaps` (@kova/domain body.ts) is the authority on "is this profile
 * finished": nine fields, and it drives the coach's finish-this-profile card,
 * the goal-setting prompts and the attention feed. The wizard used to fill six
 * and leave three — so a client completed every screen it showed them and their
 * coach was still told the profile was incomplete, with no way for either of
 * them to see why.
 *
 * The three, and where they now come from:
 *   `targetWeight`     asked on the goal step, beside today's weight, because a
 *                      goal without a number is a mood.
 *   `workoutsPerWeek`  derived from the days they pick. This one was the sharper
 *                      bug: the days went to `intake` only — free-form AI
 *                      context — while the gap list reads the typed
 *                      `preferences` store. The client answered and the answer
 *                      landed somewhere nothing reads.
 *   `mealsPerDay`      asked on the nutrition step.
 *
 * ── UNITS COME FIRST, because they change the question ──────────────────────
 *
 * The height field used to render in whatever units the account defaulted to,
 * which the client had never chosen — so a US client was asked for centimetres
 * on the very first screen and had to go and find Settings afterwards. Units are
 * now the first control on the first step, and switching them re-asks height in
 * place. It is also the one answer here that is about the APP rather than about
 * them, which is why it reads as a quiet segmented control rather than a
 * question.
 *
 * ── Everything is skippable, and that is a safety property ──────────────────
 *
 * This screen is the only thing between a client and the product. If it cannot
 * be completed — a field they cannot answer, a bug, a phone that will not show
 * a date picker — the client is not inconvenienced, they are LOCKED OUT. So
 * every step has a way past, `Skip for now` keeps whatever was filled, and the
 * coach's gap list is the safety net it already was.
 */

import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ageFromDob, cmToFeetInches, feetInchesToCm, fromKg, toKg } from "@kova/domain";
import {
  Button, Card, Field, Chip, ChoiceGroup, Choice, Callout, Eyebrow, ActionResult,
  Screen, StepHeader, StepPanel, StepActions, SegmentedControl, useAction as useActionBase,
  SPRING, DUR, Calendar, Ruler, ArrowRight, ArrowLeft, Info, Plus, Minus,
} from "@4dl/ui";
import { api, errorText } from "../../api.js";
import { useUnits } from "../../units.js";

const useAction = () => useActionBase(errorText);

type UnitSystem = "metric" | "imperial";

/** The six unit preferences, as the two answers anyone actually has. Energy is
 *  kcal in both: kJ is a separate choice a handful of people want, and offering
 *  it here would make a two-way switch a three-way one. */
const UNIT_SETS: Record<UnitSystem, Record<string, string>> = {
  metric: { weight: "kg", height: "cm", length: "cm", volume: "ml", distance: "km", energy: "kcal" },
  imperial: { weight: "lb", height: "ft_in", length: "in", volume: "oz", distance: "mi", energy: "kcal" },
};

interface Intake {
  system: UnitSystem;
  gender: "male" | "female" | null;
  dateOfBirth: string;
  heightCm: string; heightFt: string; heightIn: string;
  weight: string; targetWeight: string;
  primaryGoal: string; workoutLocation: string; experienceLevel: string;
  activityLevel: string; dietaryApproach: string; availableDays: string[];
  mealsPerDay: number;
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
 * the question. On a step that asks two or three it is not: two groups render as
 * six unexplained rows in a column, and a sighted reader ends up with strictly
 * less to go on than a screen-reader user.
 */
function Ask({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <Eyebrow>{label}</Eyebrow>
        {hint}
      </div>
      {children}
    </div>
  );
}

/**
 * The value the app worked out from what they just typed, appearing as they
 * type it.
 *
 * This is the difference between a form and a conversation, and it is cheap:
 * a birth date becomes an age, two weights become a distance to travel, four
 * tapped chips become "4 days a week". Each one is proof the app UNDERSTOOD the
 * answer — which is the reassurance a five-minute intake actually needs, and it
 * costs one line per question rather than an illustration.
 *
 * Springs in and out rather than appearing, because it arrives mid-keystroke:
 * an un-animated line popping in under a field reads as a validation error.
 */
function Readout({ children }: { children: ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {children ? (
        <motion.p
          key={String(children)}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={SPRING}
          className="text-caption font-medium text-primary"
        >
          {children}
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}

/** A small count, changed by two buttons rather than a keyboard. */
function Stepper({ value, min, max, onChange, unit }: { value: number; min: number; max: number; onChange: (n: number) => void; unit: string }) {
  const step = (d: number) => onChange(Math.min(max, Math.max(min, value + d)));
  return (
    <div className="flex items-center justify-between rounded-2xl bg-card p-2 pl-4">
      <div className="flex items-baseline gap-1.5">
        {/* Keyed so the number itself animates on change — the control is two
            buttons and a number, and without this only the buttons move. */}
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={value}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: DUR.fast }}
            className="min-w-[1.2ch] text-title-2 tabular-nums"
          >
            {value}
          </motion.span>
        </AnimatePresence>
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Button variant="secondary" size="icon-sm" aria-label={`Fewer ${unit}`} disabled={value <= min} onClick={() => step(-1)}><Minus /></Button>
        <Button variant="secondary" size="icon-sm" aria-label={`More ${unit}`} disabled={value >= max} onClick={() => step(1)}><Plus /></Button>
      </div>
    </div>
  );
}

export function Onboarding({ clientId, displayName, onDone }: { clientId: string; displayName: string; onDone: () => void }) {
  const units = useUnits();
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Intake>({
    // Seeded from the account default so someone who already set units in
    // Settings is not asked to set them again — and so the control starts on the
    // answer the rest of the app is already using.
    system: units.height === "ft_in" ? "imperial" : "metric",
    gender: null, dateOfBirth: "", heightCm: "", heightFt: "", heightIn: "",
    weight: "", targetWeight: "",
    primaryGoal: "maintain", workoutLocation: "gym", experienceLevel: "beginner",
    activityLevel: "moderate", dietaryApproach: "balanced", availableDays: ["Mon", "Wed", "Fri"],
    mealsPerDay: 3,
  });
  const act = useAction();
  const set = <K extends keyof Intake>(k: K, v: Intake[K]) => setF((p) => ({ ...p, [k]: v }));
  const toggleDay = (d: string) =>
    set("availableDays", f.availableDays.includes(d) ? f.availableDays.filter((x) => x !== d) : [...f.availableDays, d]);

  const imperial = f.system === "imperial";
  const wUnit = imperial ? "lb" : "kg";
  const num = (s: string) => { const n = Number(s.replace(/[^\d.]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };

  const heightCm = imperial
    ? (f.heightFt ? Math.round(feetInchesToCm(Number(f.heightFt), Number(f.heightIn || 0))) : null)
    : (f.heightCm ? Number(f.heightCm) : null);
  // Guards against a fat-fingered "1800" posting a nonsense heightCm.
  const heightValid = heightCm != null && heightCm >= 50 && heightCm <= 300;
  const heightEntered = imperial ? !!f.heightFt : !!f.heightCm;
  const age = useMemo(() => ageFromDob(f.dateOfBirth || null), [f.dateOfBirth]);

  const weightKg = num(f.weight) != null ? toKg(num(f.weight)!, wUnit) : null;
  const targetKg = num(f.targetWeight) != null ? toKg(num(f.targetWeight)!, wUnit) : null;
  const gap = weightKg != null && targetKg != null ? Math.round(Math.abs(fromKg(weightKg, wUnit) - fromKg(targetKg, wUnit))) : null;

  const canNext = step !== 0 || (!!f.gender && !!f.dateOfBirth && heightValid);
  const last = step === STEPS.length - 1;

  /**
   * Switching units RE-EXPRESSES what is already typed rather than clearing it.
   *
   * Someone who typed 180 cm and then realises they think in feet should see
   * 5′ 11″, not an empty field — the alternative silently punishes them for
   * answering the first question before noticing the control above it.
   */
  const setSystem = (next: UnitSystem) => {
    setF((p) => {
      if (p.system === next) return p;
      const cm = p.system === "imperial"
        ? (p.heightFt ? feetInchesToCm(Number(p.heightFt), Number(p.heightIn || 0)) : null)
        : (p.heightCm ? Number(p.heightCm) : null);
      const ft = cm != null ? cmToFeetInches(cm) : null;
      const conv = (v: string) => {
        const n = Number(v.replace(/[^\d.]/g, ""));
        if (!Number.isFinite(n) || n <= 0) return "";
        return String(Math.round(fromKg(toKg(n, p.system === "imperial" ? "lb" : "kg"), next === "imperial" ? "lb" : "kg")));
      };
      return {
        ...p,
        system: next,
        heightCm: cm != null ? String(Math.round(cm)) : "",
        heightFt: ft ? String(ft.ft) : "",
        heightIn: ft ? String(ft.in) : "",
        weight: conv(p.weight),
        targetWeight: conv(p.targetWeight),
      };
    });
  };

  /**
   * ONE write path for Finish and for Skip.
   *
   * Skip is not a second, weaker save — it is the same save with whatever has
   * been answered so far, which is why it cannot drift from the real one. The
   * only difference is that it does not wait for the remaining steps.
   */
  const submit = (key: string) =>
    act.run(key, async () => {
      // Units first and separately: they are the USER's preference, not the
      // client record's, and they must survive even if the profile write is
      // refused — otherwise someone who picked imperial gets metric everywhere
      // because an unrelated field failed validation.
      await api.patch("/api/me/units", UNIT_SETS[f.system]).catch(() => undefined);

      // These land in `preferences`, not only in `intake`. `intake_json` is
      // free-form context for the AI; `preferences_json` is the typed store the
      // rest of the product reads — including `profileGaps`. The option values
      // are deliberately the same enums `ClientPrefs` validates, so they map
      // across unchanged.
      await api.patch(`/api/clients/${clientId}`, {
        gender: f.gender,
        dateOfBirth: f.dateOfBirth || null,
        heightCm: heightValid ? heightCm : null,
        preferences: {
          primaryGoal: f.primaryGoal,
          workoutLocation: f.workoutLocation,
          activityLevel: f.activityLevel,
          dietaryApproach: f.dietaryApproach,
          targetWeightKg: targetKg != null ? Math.round(targetKg * 10) / 10 : null,
          // The gap list reads this, and the days ARE the answer to it.
          workoutsPerWeek: f.availableDays.length || null,
          mealsPerDay: f.mealsPerDay,
        },
        intake: {
          primaryGoal: f.primaryGoal, workoutLocation: f.workoutLocation,
          experienceLevel: f.experienceLevel, activityLevel: f.activityLevel,
          dietaryApproach: f.dietaryApproach, availableDays: f.availableDays,
          mealsPerDay: f.mealsPerDay,
        },
        onboardingComplete: true,
      });

      // Today's weight is a MEASUREMENT, not a preference — it is the first
      // point on their chart and what BMI and BMR are computed from. Best-effort
      // on purpose: `/measurements` is gated by `measurementLogging`, which a
      // client with no package does not hold, and a refused optional log must
      // never be the reason someone cannot finish signing up.
      if (weightKg != null) {
        // `{ clientId, data }` — `withClient` wraps every log body, and the
        // DATE is the device's local day (`date_local`, YYYY-MM-DD), never a
        // UTC slice: a 9pm weigh-in in Dubai belongs to that day, not tomorrow.
        await api
          .post("/api/measurements", {
            clientId,
            data: { date: new Date().toLocaleDateString("en-CA"), weightKg: Math.round(weightKg * 10) / 10 },
          })
          .catch(() => undefined);
      }
      onDone();
    }, "Couldn't save your answers. Nothing was lost — try again.");

  const busy = act.busy !== null;

  return (
    <Screen className="pb-0">
      <StepHeader steps={STEPS} current={step} eyebrow={step === 0 ? `Hi ${displayName}` : "Your intake"} />

      <StepPanel step={step}>
        {step === 0 && (
          <div className="space-y-5">
            <p className="px-1 text-sm text-muted-foreground">
              A few basics so your coach can tailor everything — and so the app can work out your targets.
            </p>

            {/* Units lead, because they change what the height question ASKS.
                Quiet by design: it is the one control here that is about the app
                rather than about them. */}
            <Ask label="Units">
              <SegmentedControl
                fill
                options={[{ value: "metric", label: "Metric" }, { value: "imperial", label: "Imperial" }]}
                value={f.system}
                onChange={(v) => setSystem(v as UnitSystem)}
              />
            </Ask>

            <Ask label="Sex" hint={<span className="text-caption text-muted-foreground">Required</span>}>
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
              <div className="space-y-1.5">
                <Field label="Date of birth" icon={Calendar} type="date" value={f.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
                <Readout>{age != null && age > 0 && age < 120 ? `${age} years old` : null}</Readout>
              </div>

              {/* The height question re-asks itself when units change. Keyed on
                  the system so the swap is a crossfade rather than two inputs
                  silently changing their labels under the cursor. */}
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={f.system}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: DUR.fast }}
                >
                  {imperial ? (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Height (ft)" icon={Ruler} inputMode="numeric" value={f.heightFt} onChange={(e) => set("heightFt", e.target.value.replace(/\D/g, ""))} />
                      <Field label="(in)" inputMode="numeric" value={f.heightIn} onChange={(e) => set("heightIn", e.target.value.replace(/\D/g, ""))} />
                    </div>
                  ) : (
                    <Field label="Height (cm)" icon={Ruler} inputMode="numeric" value={f.heightCm} onChange={(e) => set("heightCm", e.target.value.replace(/\D/g, ""))} />
                  )}
                </motion.div>
              </AnimatePresence>
              {heightEntered && !heightValid && <p className="px-1 text-xs text-warning">Enter a realistic height.</p>}
            </Card>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            {/* One question, so the step's own name in `StepHeader` IS the
                question and a second heading would just repeat it. */}
            <ChoiceGroup label="What are you here for?" value={f.primaryGoal} onChange={(v) => set("primaryGoal", v)}>
              {GOALS.map((g) => <Choice key={g.value} value={g.value} title={g.title} sub={g.sub} />)}
            </ChoiceGroup>

            <Ask label="Your weight" hint={<span className="text-caption text-muted-foreground">Optional</span>}>
              <Card className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label={`Today (${wUnit})`} inputMode="decimal" value={f.weight} onChange={(e) => set("weight", e.target.value.replace(/[^\d.]/g, ""))} />
                  <Field label={`Target (${wUnit})`} inputMode="decimal" value={f.targetWeight} onChange={(e) => set("targetWeight", e.target.value.replace(/[^\d.]/g, ""))} />
                </div>
                <Readout>
                  {gap == null ? null
                    : gap === 0 ? "Right where you want to be"
                    : `${gap} ${wUnit} to ${(weightKg ?? 0) > (targetKg ?? 0) ? "lose" : "gain"}`}
                </Readout>
                <p className="px-1 text-xs text-muted-foreground">
                  Today&rsquo;s weight becomes the first point on your chart. Both are yours to change any time.
                </p>
              </Card>
            </Ask>
          </div>
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
            <Ask
              label="Days you can train"
              hint={<Readout>{f.availableDays.length ? `${f.availableDays.length}× a week` : null}</Readout>}
            >
              {/* The one genuine multi-select in the wizard, and the one place
                  chips are the right control.

                  SEVEN COLUMNS, not a wrap. `flex-wrap` fits six and orphans
                  Sunday on a second row, which reads as a list that happens to
                  contain days; a fixed seven-up grid reads as A WEEK, which is
                  the thing being answered. It also stops the row reflowing as
                  the selection changes. */}
              <div className="grid grid-cols-7 gap-1.5">
                {DAYS.map((d) => (
                  <Chip key={d} selected={f.availableDays.includes(d)} onClick={() => toggleDay(d)} className="w-full justify-center px-0 text-xs">
                    {d}
                  </Chip>
                ))}
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
            <Ask label="Meals a day">
              <Stepper value={f.mealsPerDay} min={1} max={8} unit="meals" onChange={(n) => set("mealsPerDay", n)} />
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

      <StepActions
        back={step > 0 ? <Button variant="ghost" size="icon" aria-label="Back" disabled={busy} onClick={() => setStep((s) => s - 1)}><ArrowLeft /></Button> : undefined}
        /* THE ESCAPE HATCH. Quiet, on every step but the last, and it SAVES
           rather than abandons — see the header: this screen is the only thing
           between a client and the product, so it must never be a wall. */
        escape={!last ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit("skip")}
            className="rounded-full px-3 py-1.5 text-caption text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            {act.busy === "skip" ? "Skipping…" : "Skip for now"}
          </button>
        ) : undefined}
      >
        {last ? (
          <Button size="lg" className="w-full" disabled={busy} onClick={() => void submit("finish")}>
            {act.busy === "finish" ? "Saving…" : "Finish"}
          </Button>
        ) : (
          <Button size="lg" className="w-full" disabled={!canNext || busy} onClick={() => setStep((s) => s + 1)}>
            Continue <ArrowRight />
          </Button>
        )}
      </StepActions>
    </Screen>
  );
}
