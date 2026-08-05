/**
 * Meal plan builder — a BANK OF OPTIONS the client picks one of, per meal.
 *
 * ── What this screen is, and what it was ────────────────────────────────────
 *
 * The plan is six meal types deep and the coach works on one at a time. The
 * screen rendered ALL of them, always, as full cards — so a fresh draft opened
 * as six cards reading "No options yet", and a real one meant scrolling past
 * breakfast and lunch to reach the dinner you came to fix. It is now a RAIL of
 * meal types carrying their option counts, and the meal you picked is the page —
 * the same shape the workout builder uses for days.
 *
 * Three more things were costing the coach room and telling them nothing:
 *
 *   TWO CARDS SAID THE SAME NUMBER.  A "Daily target" card sat above a "Daily
 *     plan health" card whose ring already shows the sample day AGAINST that
 *     target. The target alone is not information; the comparison is.
 *   EVERY FOOD CARRIED A CHIP ROW AND A LABELLED FIELD.  Four foods in an option
 *     was four preset rows and four floating-label fields — roughly 400px of
 *     controls for four numbers. The portion is now one line.
 *   EVERY FOOD SHOWED THE SAME GLYPH.  `FoodThumb` was rendered with no `src` at
 *     all, so a library full of photographed foods looked like a library of
 *     nothing. The image was simply never read out of the food row.
 */

import { useCallback, useEffect, useState } from "react";
import type { MealBody, MealOption, MealFood, MealPlanMode } from "@kova/protocol";
import { optionMacroTotals, type FoodLike } from "@kova/protocol";
import { fmtEnergy, scaleFood, servingsToQuantity, SERVING_PRESETS } from "@kova/domain";
import { Button, Card, Badge, Field, Input, Sheet, Skeleton, SubCard, ProgressRing, Eyebrow, Chip, Callout, Collapsible, useOneOpen, ConfirmDialog, Disclosure, EmptyState, Page, Stagger, Rail, RailItem, Reveal, SkeletonLine, SkeletonRow, colorToHex, toneVar, cn, AlertTriangle, Plus, PencilLine, Utensils, Flame, Save, ListChecks, Layers, Trash2, X } from "@4dl/ui";
import { MacroInline, MacroBar } from "../../registry/index.js";
import { api, ApiError, errorText } from "../../api.js";
import { useCan } from "../../FeatureLock.js";
import { AiAvatar } from "../../AiAvatar.js";
import { ClientPrefsStrip } from "./ClientPrefsStrip.js";
import { AiErrorBox } from "../../AiError.js";
import { useUnits } from "../../units.js";
import { FoodSearchSheet } from "../client/FoodSearchSheet.js";
import { FoodThumb } from "../food.js";
import { BuilderHeader, BuilderFooter, BuilderMenuItem, BuilderMenuSeparator, SeedMenuItems, TemplatePickerSheet, SaveTemplateSheet, usePlanLifecycle } from "./builder.js";

/** Client daily targets (flat shape, as stored on the active goal). */
interface Targets { targetCalories?: number; targetProteinG?: number; targetCarbsG?: number; targetFatG?: number }
interface Plan { id: string; clientId: string; name: string; status: string; body: MealBody; targetGoal?: Record<string, unknown> | null; variantId?: string | null }
interface FoodRow { id: string; name: string; serving_size: number; calories: number; protein_g: number; carbs_g: number; fat_g: number; image_url: string | null }
const BUILTIN_TYPES = ["breakfast", "lunch", "dinner", "snack", "pre_workout", "post_workout"];
const typeLabel = (t: string) => t.replace(/_/g, " ");
const newOption = (mealType: string, ordinal: number): MealOption => ({ mealType, mealName: `Option ${ordinal}`, isFree: false, foods: [] });

/** Normalize a plan's snapshotted goal (flat or `{targets}`-nested) into flat targets. */
function asTargets(src: unknown): Targets | null {
  if (!src || typeof src !== "object") return null;
  const o = src as Record<string, unknown>;
  const t = (o.targets && typeof o.targets === "object" ? o.targets : o) as Targets;
  return typeof t.targetCalories === "number" ? t : null;
}

export function MealBuilder({ planId, onBack }: { planId: string; onBack: () => void }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [options, setOptions] = useState<MealOption[]>([]);
  const [customTypes, setCustomTypes] = useState<{ label: string }[]>([]);
  const [hiddenTypes, setHiddenTypes] = useState<string[]>([]);
  const [mode, setMode] = useState<MealPlanMode>("options");
  const [foods, setFoods] = useState<Map<string, FoodLike>>(new Map());
  const [rows, setRows] = useState<Map<string, { name: string; image: string | null }>>(new Map());
  const [targets, setTargets] = useState<Targets | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [foodPicker, setFoodPicker] = useState<{ optIdx: number } | null>(null);
  const units = useUnits();
  const [aiOpen, setAiOpen] = useState(false);
  // Every AI affordance here posts to a route gated on the aiSuite entitlement.
  const canAi = useCan("aiSuite");
  const [typeOpen, setTypeOpen] = useState(false);
  const [newType, setNewType] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  /** Which meal type is on screen. `null` until the plan resolves its list. */
  const [activeType, setActiveType] = useState<string | null>(null);
  // Seed-the-draft: the client's most recent OTHER plan + a template picker.
  const [latestOther, setLatestOther] = useState<{ id: string; name: string; body: MealBody } | null>(null);
  const [seedTemplateOpen, setSeedTemplateOpen] = useState(false);
  // A pending destructive replace, held until the coach confirms.
  const [seedConfirm, setSeedConfirm] = useState<{ source: string; apply: () => void } | null>(null);

  const foodsFromRows = (list: FoodRow[]): Map<string, FoodLike> =>
    new Map(list.map((x) => [x.id, { id: x.id, servingSize: x.serving_size, caloriesPerServing: x.calories, proteinG: x.protein_g, carbsG: x.carbs_g, fatG: x.fat_g }]));
  const rowsFrom = (list: FoodRow[]) => new Map(list.map((x) => [x.id, { name: x.name, image: x.image_url }] as const));

  // Two independent reads, so `allSettled`: the plan is required (nothing renders
  // without it) but the food library only powers the macro read-outs, and with
  // `all` a foods outage rejected the pair and left the whole builder a permanent
  // skeleton — the coach couldn't even see the meals they'd already written.
  // Losing foods alone just falls back to "Macros update after saving".
  const load = useCallback(async () => {
    setLoadError(false);
    const [p, f] = await Promise.allSettled([api.get<{ plan: Plan }>(`/api/meal-plans/${planId}`), api.get<{ foods: FoodRow[] }>("/api/foods?scope=all")]);
    if (f.status === "fulfilled") { setFoods(foodsFromRows(f.value.foods)); setRows(rowsFrom(f.value.foods)); }
    if (p.status === "rejected") { setLoadError(true); return; }
    setPlan(p.value.plan); setOptions(p.value.plan.body.mealOptions ?? []); setCustomTypes(p.value.plan.body.customMealTypes ?? []); setHiddenTypes(p.value.plan.body.hiddenMealTypes ?? []); setMode(p.value.plan.body.mode ?? "options");
  }, [planId]);
  useEffect(() => void load(), [load]);

  const life = usePlanLifecycle({
    kind: "meal", planId, reload: load,
    body: () => ({ mode, customMealTypes: customTypes, hiddenMealTypes: hiddenTypes, mealOptions: options }),
  });

  /*
    ONE OPTION OPEN AT A TIME. An option is a name, a macro line, three or four
    food rows each with a portion control, and a photo affordance — 250px or so.
    Three of them for one meal filled the screen before the coach could compare
    them, which is the entire reason a bank of options exists.
  */
  const opened = useOneOpen<number>(0);
  const [modeConfirm, setModeConfirm] = useState(false);

  // Live target feedback: the client's ACTIVE goal targets (canonical, guarded
  // by requireClientAccess). Drafts don't snapshot a goal — only published
  // plans do — so we read the live goal here and fall back to the plan's
  // snapshot. A quiet miss just hides the target cues.
  useEffect(() => {
    const cid = plan?.clientId;
    if (!cid) return;
    let alive = true;
    api.get<{ goals: { status: string; targets: Targets | null }[] }>(`/api/goals?clientId=${cid}`)
      .then((r) => { if (!alive) return; const g = r.goals?.find((x) => x.status === "active") ?? r.goals?.[0]; setTargets(g?.targets ?? asTargets(plan?.targetGoal)); })
      .catch(() => { if (alive) setTargets(asTargets(plan?.targetGoal)); });
    return () => { alive = false; };
  }, [plan?.clientId, plan?.targetGoal]);

  const nameOf = useCallback((id: string) => rows.get(id)?.name ?? "Food", [rows]);
  const imageOf = useCallback((id: string) => rows.get(id)?.image ?? null, [rows]);

  // Pull the food reference map fresh WITHOUT touching plan/option edits — used
  // after a pick or AI draft so newly-imported foods get live macros + serving
  // presets immediately (onPick only hands back an id + name).
  const refreshFoods = useCallback(async () => {
    try {
      const f = await api.get<{ foods: FoodRow[] }>("/api/foods?scope=all");
      setFoods(foodsFromRows(f.foods));
      setRows((prev) => { const m = new Map(prev); for (const [k, v] of rowsFrom(f.foods)) m.set(k, v); return m; });
    } catch { /* keep optimistic names */ }
  }, []);

  // Fetch the client's plans (created_at DESC) to offer "Latest plan" as a
  // seed — the most recent plan that isn't THIS draft AND shares its lane
  // (variant), so a "Cutting" draft doesn't seed from a "Main" plan. A quiet
  // miss just disables it.
  useEffect(() => {
    const cid = plan?.clientId;
    if (!cid) return;
    const lane = plan?.variantId ?? null;
    let alive = true;
    api.get<{ plans: { id: string; name: string; body: MealBody; variantId?: string | null }[] }>(`/api/meal-plans?clientId=${cid}`)
      .then((r) => { if (alive) setLatestOther(r.plans?.find((pl) => pl.id !== planId && (pl.variantId ?? null) === lane) ?? null); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [plan?.clientId, plan?.variantId, planId]);

  // Replace the current draft's body with a seed body, then refresh the food
  // reference map so foods referenced by the seed resolve their macros.
  const applySeedBody = (body: MealBody) => {
    setOptions(body.mealOptions ?? []);
    setCustomTypes(body.customMealTypes ?? []);
    setHiddenTypes(body.hiddenMealTypes ?? []);
    setMode(body.mode ?? "options");
    life.markDirty();
    void refreshFoods();
  };
  // Guard: replacing is destructive, so confirm only when the draft has options.
  const seedDraft = (source: string, body: MealBody) => {
    const apply = () => applySeedBody(body);
    if (options.length > 0) setSeedConfirm({ source, apply });
    else apply();
  };

  const mutate = (fn: (d: MealOption[]) => void) => { const next = structuredClone(options); fn(next); setOptions(next); life.markDirty(); };
  /*
    SWITCHING KIND.

    `fixed` means one option per meal, so the switch DROPS the extras rather
    than leaving a plan whose stored shape contradicts its mode — a reader
    taking "the first" would silently ignore work the coach could still see in
    the builder. Going back to `options` keeps what is there and simply starts
    offering the choice again, so the round trip is only lossy in the direction
    that was confirmed.
  */
  const applyMode = (next: MealPlanMode) => {
    setMode(next);
    if (next === "fixed") {
      const seen = new Set<string>();
      setOptions((prev) => prev.filter((o) => (seen.has(o.mealType) ? false : (seen.add(o.mealType), true))));
    }
    life.markDirty();
    setModeConfirm(false);
  };
  // Remove a meal type from THIS plan: built-ins are hidden (restorable via
  // "+ Meal type"); custom types are dropped outright. Either way its options go.
  const removeType = (type: string) => {
    setOptions((prev) => prev.filter((o) => o.mealType !== type));
    if (BUILTIN_TYPES.includes(type)) setHiddenTypes((p) => (p.includes(type) ? p : [...p, type]));
    else setCustomTypes((p) => p.filter((t) => t.label !== type));
    life.markDirty();
  };
  const addCustomType = () => { const label = newType.trim(); if (label && !customTypes.some((t) => t.label === label)) { setCustomTypes((p) => [...p, { label }]); life.markDirty(); setActiveType(label); } setNewType(""); setTypeOpen(false); };
  const runAi = async (instructions: string): Promise<string[]> => {
    if (!plan) return [];
    const res = await api.post<{ draft: MealBody; dropped?: string[] }>("/api/ai/draft-meal", { clientId: plan.clientId, instructions });
    setOptions((prev) => [...prev, ...(res.draft.mealOptions ?? [])]); life.markDirty();
    void refreshFoods();
    const dropped = res.dropped ?? [];
    if (!dropped.length) setAiOpen(false);
    return dropped;
  };

  const readOnly = plan?.status === "superseded" || plan?.status === "archived";
  const byType = new Map<string, { opt: MealOption; idx: number }[]>();
  options.forEach((opt, idx) => byType.set(opt.mealType, [...(byType.get(opt.mealType) ?? []), { opt, idx }]));
  const allTypes = [...BUILTIN_TYPES.filter((t) => !hiddenTypes.includes(t)), ...customTypes.map((t) => t.label)];
  const restorable = BUILTIN_TYPES.filter((t) => hiddenTypes.includes(t)); // hidden built-ins, offered for re-add
  // Open on the first meal that HAS something, else the first meal — a draft
  // seeded from a template should land on its content, not on an empty
  // breakfast the coach then has to scroll past.
  const type = (activeType && allTypes.includes(activeType) ? activeType : null)
    ?? allTypes.find((t) => (byType.get(t)?.length ?? 0) > 0)
    ?? allTypes[0]
    ?? null;
  const opts = type ? byType.get(type) ?? [] : [];

  return (
    <Page className="column space-y-4 p-4 pb-32">
      {loadError && !plan ? (
        <EmptyState icon={AlertTriangle} title="Couldn't load this plan" description="Something went wrong reaching the server. Check your connection and try again." action={<div className="flex gap-2"><Button variant="secondary" onClick={onBack}>Back</Button><Button onClick={() => void load()}>Try again</Button></div>} />
      ) : (
      <Reveal loading={!plan} className="space-y-4" skeleton={
        <>
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-xl" />
            <SkeletonLine w="40%" h="title" className="flex-1" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="size-9 rounded-xl" />
          </div>
          <Skeleton className="h-12 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
          <div className="flex gap-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />)}</div>
          <div className="space-y-3 rounded-2xl bg-card p-4">
            <SkeletonLine w="30%" h="title" />
            <div className="rounded-xl bg-surface-2 p-3"><SkeletonRow thumb={34} /></div>
          </div>
        </>
      }>
        {plan && (
        <>
      <BuilderHeader
        title={plan.name}
        status={plan.status}
        onBack={onBack}
        menu={
          <>
            {!readOnly && (
              <>
                {canAi && <BuilderMenuItem onSelect={() => setAiOpen(true)}><AiAvatar className="size-4" /> Draft meals with AI</BuilderMenuItem>}
                <SeedMenuItems
                  latestName={latestOther?.name ?? null}
                  onLatest={() => latestOther && seedDraft(latestOther.name, latestOther.body)}
                  onTemplate={() => setSeedTemplateOpen(true)}
                />
                <BuilderMenuItem onSelect={() => setTypeOpen(true)}><Plus /> Add a meal type</BuilderMenuItem>
                <BuilderMenuSeparator />
                {/* The plan's KIND. Switching to fixed is lossy (the options
                    beyond the first stop being offered), so it asks first. */}
                <BuilderMenuItem onSelect={() => (mode === "fixed" ? applyMode("options") : setModeConfirm(true))}>
                  {mode === "fixed" ? <><ListChecks /> Let the client choose between options</> : <><Layers /> Make this a fixed daily plan</>}
                </BuilderMenuItem>
                <BuilderMenuSeparator />
              </>
            )}
            <BuilderMenuItem onSelect={() => setExportOpen(true)}><Save /> Save as template</BuilderMenuItem>
          </>
        }
      />

      <ClientPrefsStrip clientId={plan.clientId} focus="meal" />

      {mode === "fixed" && (
        <Callout tone="nutrition" icon={Layers}>
          A <strong>fixed</strong> plan — one meal per slot, no choosing. Switch it back to options from the ⋯ menu.
        </Callout>
      )}

      <PlanHealth allTypes={allTypes} byType={byType} foods={foods} targets={targets} mode={mode} />

      {/*
        The meal picker. Each chip carries its option count, so "which meals have
        I actually written" is answered without opening any of them — the
        question the old six-cards-of-nothing layout answered by making you
        scroll.
      */}
      {allTypes.length > 0 && (
        <Rail>
          {allTypes.map((t) => {
            const n = byType.get(t)?.length ?? 0;
            return (
              <RailItem key={t}>
                <Chip selected={t === type} onClick={() => setActiveType(t)} className="capitalize">
                  {typeLabel(t)}
                  <span className={cn("numeral ml-1.5 text-xs", t === type ? "opacity-70" : n > 0 ? "text-nutrition" : "text-muted-foreground/50")}>{n}</span>
                </Chip>
              </RailItem>
            );
          })}
          {!readOnly && <RailItem><Chip onClick={() => setTypeOpen(true)} aria-label="Add a meal type"><Plus className="size-3.5" /></Chip></RailItem>}
        </Rail>
      )}

      <Stagger className="space-y-4">
      {!type ? (
        <EmptyState icon={Utensils} title="No meals in this plan" description="Add a meal type to start building the bank of options this client picks from." action={<Button onClick={() => setTypeOpen(true)}><Plus /> Add a meal type</Button>} />
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 px-1">
            <h2 className="text-title-3 capitalize">{typeLabel(type)}</h2>
            <div className="flex items-center gap-1">
              {/* In a fixed plan a meal HAS one option, so once it exists there
                  is nothing to add — the button would create a second meal the
                  client is never offered. */}
              {(mode === "options" || opts.length === 0) && (
                <Button size="sm" variant="tonal" onClick={() => { mutate((d) => d.push(newOption(type, opts.length + 1))); opened.focus(options.length); }}>
                  <Plus /> {mode === "fixed" ? "Set the meal" : "Option"}
                </Button>
              )}
              {!readOnly && <button onClick={() => removeType(type)} aria-label={`Remove ${typeLabel(type)}`} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger [&_svg]:size-4"><Trash2 /></button>}
            </div>
          </div>

          {opts.length === 0 ? (
            <EmptyState
              icon={Utensils}
              title={mode === "fixed" ? `No ${typeLabel(type)} yet` : `No ${typeLabel(type)} options yet`}
              description={mode === "fixed"
                ? "A fixed plan prescribes exactly one thing per meal — this is what the client eats."
                : "An option is one thing the client may eat for this meal. Give them two or three and they pick whichever suits the day."}
              action={<Button onClick={() => { mutate((d) => d.push(newOption(type, 1))); opened.focus(options.length); }}><Plus /> {mode === "fixed" ? "Set this meal" : "Add the first option"}</Button>}
            />
          ) : opts.map(({ opt, idx }, n) => (
            <OptionCard
              key={idx}
              opt={opt} ordinal={n + 1} targets={targets} foods={foods} mode={mode}
              nameOf={nameOf} imageOf={imageOf}
              open={opened.isOpen(idx)} onToggle={() => opened.toggle(idx)}
              onPatch={(fn) => mutate((d) => fn(d[idx]!))}
              onRemove={() => { mutate((d) => d.splice(idx, 1)); opened.focus(null); }}
              onAddFood={() => setFoodPicker({ optIdx: idx })}
            />
          ))}
        </>
      )}
      </Stagger>

      <BuilderFooter status={plan.status} readOnly={!!readOnly} life={life} />
        </>
        )}
      </Reveal>
      )}

      {foodPicker && <FoodSearchSheet onClose={() => setFoodPicker(null)} onPick={(id, name) => { mutate((d) => d[foodPicker.optIdx]!.foods.push({ foodId: id, quantity: 100, unit: "g" })); setRows((p) => new Map(p).set(id, { name, image: p.get(id)?.image ?? null })); setFoodPicker(null); void refreshFoods(); }} />}
      {aiOpen && <AiMealSheet onClose={() => setAiOpen(false)} onRun={runAi} />}
      {exportOpen && plan && <SaveTemplateSheet kind="meal" body={{ mode, customMealTypes: customTypes, hiddenMealTypes: hiddenTypes, mealOptions: options }} defaultName={plan.name} stripNote="The meals and their portions are kept as written." onClose={() => setExportOpen(false)} />}
      <Sheet open={typeOpen} onClose={() => setTypeOpen(false)} title="Add meal type" footer={<Button size="lg" className="w-full" disabled={newType.trim().length < 2} onClick={addCustomType}>Add meal type</Button>}>
        <div className="space-y-4">
          {restorable.length > 0 && (
            <div className="space-y-2">
              <Eyebrow>Bring back a removed meal</Eyebrow>
              <div className="flex flex-wrap gap-2">
                {restorable.map((t) => <Chip key={t} className="capitalize" onClick={() => { setHiddenTypes((p) => p.filter((x) => x !== t)); life.markDirty(); setActiveType(t); setTypeOpen(false); }}>{typeLabel(t)}</Chip>)}
              </div>
            </div>
          )}
          <Field label="Or add a custom meal" icon={Utensils} value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="e.g. Second breakfast" autoFocus />
        </div>
      </Sheet>
      {seedTemplateOpen && (
        <TemplatePickerSheet<MealBody>
          kind="meal" tone="nutrition"
          countOf={(b) => { const n = b.mealOptions?.length ?? 0; return `${n} option${n === 1 ? "" : "s"}`; }}
          onClose={() => setSeedTemplateOpen(false)}
          onPick={(body, name) => { setSeedTemplateOpen(false); seedDraft(name, body); }}
        />
      )}
      <ConfirmDialog
        open={modeConfirm}
        onOpenChange={setModeConfirm}
        title="Make this a fixed daily plan?"
        description="Each meal keeps its FIRST option and the rest are removed. The client stops choosing and simply eats what's written."
        confirmLabel="Make it fixed"
        destructive
        onConfirm={() => applyMode("fixed")}
      />
      <ConfirmDialog
        open={!!seedConfirm}
        onOpenChange={(o) => { if (!o) setSeedConfirm(null); }}
        title="Replace this draft?"
        description={`The current meals will be replaced with “${seedConfirm?.source ?? ""}”.`}
        confirmLabel="Replace"
        destructive
        onConfirm={() => seedConfirm?.apply()}
      />
    </Page>
  );
}

/**
 * ONE OPTION — a thing the client may eat for this meal.
 *
 * The name was a floating-label `Field` inside a `SubCard` inside a `Card`:
 * three levels of container and a label reading "Option name" above a value
 * reading "Option 1". It is now the card's own title, edited in place, with the
 * ordinal supplying the identity a placeholder was carrying.
 */
function OptionCard({ opt, ordinal, targets, foods, mode, nameOf, imageOf, open, onToggle, onPatch, onRemove, onAddFood }: {
  opt: MealOption; ordinal: number; targets: Targets | null; foods: Map<string, FoodLike>; mode: MealPlanMode;
  nameOf: (id: string) => string; imageOf: (id: string) => string | null;
  open: boolean; onToggle: () => void;
  onPatch: (fn: (o: MealOption) => void) => void;
  onRemove: () => void;
  onAddFood: () => void;
}) {
  const units = useUnits();
  const t = optionMacroTotals(opt, foods);
  const over = !!(targets?.targetCalories && t.calories > targets.targetCalories);
  const label = opt.mealName || (opt.isFree ? "Free meal" : `Option ${ordinal}`);
  return (
    <Collapsible
      open={open}
      onToggle={onToggle}
      summary={
        /* The collapsed row is the comparison: what it is, what it costs, and
           what it is made of. Choosing between three lunches must not require
           opening all three. */
        <span className="flex items-center gap-3">
          <FoodThumb src={opt.imageUrl ?? opt.foods.map((mf) => imageOf(mf.foodId)).find(Boolean) ?? null} size={34} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="min-w-0 truncate text-sm font-semibold">{label}</span>
              {opt.isFree && <Badge tone="nutrition">Free</Badge>}
            </span>
            <span className="mt-0.5 flex min-w-0 items-center gap-2">
              <span className={cn("numeral shrink-0 text-xs font-semibold", over ? "text-warning" : "text-calories")}>{fmtEnergy(t.calories, units)}</span>
              {!opt.isFree && <MacroInline proteinG={t.proteinG} carbsG={t.carbsG} fatG={t.fatG} className="shrink-0 text-xs" />}
              {!opt.isFree && <span className="truncate text-xs text-muted-foreground">{opt.foods.length === 0 ? "no foods yet" : opt.foods.map((mf) => nameOf(mf.foodId)).join(", ")}</span>}
            </span>
          </span>
        </span>
      }
    >
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        {/* LABELLED, not a bare title. The summary row directly above already
            shows the name; an unlabelled second copy of it reads as a duplicate
            rather than as the field that edits it. */}
        <Field
          label={mode === "fixed" ? "What this meal is" : "Option name"}
          value={opt.mealName}
          placeholder={mode === "fixed" ? "e.g. Oats & berries" : `Option ${ordinal}`}
          onChange={(e) => onPatch((o) => (o.mealName = e.target.value))}
          className="min-w-0 flex-1"
        />
        {/*
          A toggle that reads as a BADGE when it is off is a lie: "Free meal" on
          a quiet pill beside an option full of foods says this option IS free.
          So off is a verb ("Make free") on a dashed outline, and on is the state
          on a filled tone. One control, and it never claims the wrong thing.
        */}
        <button
          onClick={() => onPatch((o) => { o.isFree = !o.isFree; if (o.isFree) o.foods = []; })}
          aria-pressed={opt.isFree}
          className={cn(
            "mb-1.5 shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
            opt.isFree ? "bg-nutrition-soft text-nutrition" : "border border-dashed border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.isFree ? "Free meal" : "Make free"}
        </button>
        <Button size="icon-sm" variant="ghost" aria-label={`Remove ${label}`} className="mb-1 shrink-0 text-muted-foreground hover:text-danger" onClick={onRemove}><X /></Button>
      </div>

      {opt.isFree ? (
        <Field label="Max calories" type="number" inputMode="numeric" placeholder="Optional cap" value={opt.freeMealMaxCalories ?? ""} onChange={(e) => onPatch((o) => (o.freeMealMaxCalories = e.target.value ? Number(e.target.value) : null))} className="max-w-[12rem]" />
      ) : (
        <div className="space-y-2">
          {opt.foods.map((mf, fi) => (
            <FoodPortionRow
              key={fi}
              mf={mf}
              name={nameOf(mf.foodId)}
              image={imageOf(mf.foodId)}
              food={foods.get(mf.foodId)}
              onQty={(q) => onPatch((o) => (o.foods[fi]!.quantity = q))}
              onRemove={() => onPatch((o) => o.foods.splice(fi, 1))}
            />
          ))}
          <button onClick={onAddFood} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-xs font-medium text-nutrition transition-colors hover:bg-surface-2 [&_svg]:size-4"><Plus /> Add food</button>
          {opt.foods.length === 0 && <p className="px-1 text-center text-[0.7rem] text-muted-foreground">Search your library — or create a new food from the search if it isn't there yet.</p>}
          {opt.foods.length > 0 && <MealImage mealName={opt.mealName} foodNames={opt.foods.map((mf) => nameOf(mf.foodId))} value={opt.imageUrl} onChange={(url) => onPatch((o) => (o.imageUrl = url))} />}
        </div>
      )}
    </div>
    </Collapsible>
  );
}

/** Live "daily plan health" intelligence over the in-memory plan. A meal plan is a
 *  bank of options (the client picks ONE option per meal), so we derive a
 *  representative SAMPLE DAY = the first option of each meal type (meals with no
 *  options are skipped; free meals contribute their max-calories cap via
 *  optionMacroTotals). Pure derivation — no fetches, no plan mutation. */
function PlanHealth({ allTypes, byType, foods, targets, mode }: {
  allTypes: string[];
  byType: Map<string, { opt: MealOption; idx: number }[]>;
  foods: Map<string, FoodLike>;
  targets: Targets | null;
  mode: MealPlanMode;
}) {
  const units = useUnits();
  const meals = allTypes
    .map((type) => ({ type, opts: (byType.get(type) ?? []).map((o) => o.opt) }))
    .filter((m) => m.opts.length > 0);

  // Nothing to summarise until at least one meal has an option carrying food (or a
  // free-meal cap) — an all-empty draft gets no card, not a card full of zeroes.
  const hasContent = meals.some((m) => m.opts.some((o) => (!o.isFree && o.foods.length > 0) || (o.isFree && !!o.freeMealMaxCalories)));
  if (!hasContent) return null;

  // Sample day = FIRST option of each meal type, summed.
  const total = meals.reduce(
    (a, m) => { const t = optionMacroTotals(m.opts[0]!, foods); return { calories: a.calories + t.calories, proteinG: a.proteinG + t.proteinG, carbsG: a.carbsG + t.carbsG, fatG: a.fatG + t.fatG }; },
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
  // Per-meal calorie range across ALL that meal's options (shows the coach the
  // variability the client can pick within, e.g. "Lunch 520–740 kcal").
  const ranges = meals.map((m) => {
    const cals = m.opts.map((o) => optionMacroTotals(o, foods).calories);
    return { type: m.type, min: Math.min(...cals), max: Math.max(...cals) };
  });

  const target = targets?.targetCalories;
  const delta = target ? total.calories - target : 0;
  const onTarget = target ? Math.abs(delta) <= target * 0.05 : false;
  const over = delta > 0;
  const deltaTone = onTarget ? "success" : over ? "warning" : "neutral";
  const deltaLabel = !target ? null : onTarget ? "On target" : `${fmtEnergy(Math.abs(delta), units)} ${over ? "over" : "under"}`;

  return (
    <Card className="space-y-4 p-4">
      <Eyebrow action={<Badge tone="neutral">{meals.length} meal{meals.length > 1 ? "s" : ""}</Badge>}>Daily plan health</Eyebrow>
      {/*
        THE RING IS THE ANCHOR, AND THE MACROS ARE THE BREAKDOWN UNDER IT.

        This was one horizontal row: a 104px ring, then `MacroBar` in the
        remaining `flex-1`. Three macro pills in ~250px is ~85px each, so every
        label truncated — "Pro…", "Ca…", "Fat…" — and the verdict badge
        ("404 kcal under") floated at the right end of a column it did not
        belong to. A readout whose three labels are all ellipses has stopped
        being a readout.

        Vertical instead. The ring owns its line with the verdict beside it —
        the two numbers that answer "is this day right?" — and the macros run
        full width beneath as three meters, which is how the rest of the product
        grades a value against a target. Nothing truncates, and the target
        stops being a 12%-opacity wash behind the text.
      */}
      <div className="flex items-center justify-center gap-5">
        {target ? (
          <ProgressRing
            size={116}
            strokeWidth={11}
            progress={total.calories / target}
            tone={over && !onTarget ? "warning" : "calories"}
            softTrack
            value={fmtEnergy(total.calories, units, false)}
            label={mode === "fixed" ? "The day" : "Sample day"}
            sublabel={`of ${fmtEnergy(target, units)}`}
          />
        ) : (
          <div className="flex shrink-0 flex-col items-center justify-center gap-1 rounded-2xl bg-surface-2 px-5 py-4 text-center">
            <Flame className="size-5" style={{ color: toneVar.calories }} />
            <span className="numeral text-2xl font-bold leading-none">{fmtEnergy(total.calories, units, false)}</span>
            <span className="text-xs font-medium text-muted-foreground">{mode === "fixed" ? "The day" : "Sample day"}</span>
          </div>
        )}
        {deltaLabel && <Badge tone={deltaTone}>{deltaLabel}</Badge>}
      </div>

      <MacroBar
        layout="stacked"
        proteinG={total.proteinG}
        carbsG={total.carbsG}
        fatG={total.fatG}
        targets={target ? { proteinG: targets?.targetProteinG, carbsG: targets?.targetCarbsG, fatG: targets?.targetFatG } : null}
      />

      {/* The per-meal spread folds: it is a check on the variety the client can
          pick within, not the number the coach is steering. A fixed plan has no
          spread — every meal is one number — so it says so. */}
      <Disclosure label={mode === "fixed" ? "Per meal" : "Per-meal range"}>
        <div className="space-y-1.5">
        {ranges.map((r) => (
          <div key={r.type} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5 capitalize text-muted-foreground [&_svg]:size-3.5">
              <Flame style={{ color: toneVar.calories }} /> {typeLabel(r.type)}
            </span>
            <span className="numeral font-medium text-calories">
              {r.min === r.max ? fmtEnergy(r.min, units) : `${fmtEnergy(r.min, units, false)}–${fmtEnergy(r.max, units)}`}
            </span>
          </div>
        ))}
        </div>
      </Disclosure>
    </Card>
  );
}

/**
 * One food in an option: identity, live scaled macros, and the portion.
 *
 * The portion used to be a wrapped chip row plus a floating-label `Field` on its
 * own line — roughly 100px per food. It is one line now: the multipliers scroll,
 * the exact amount sits at the end, and the unit is the field's suffix rather
 * than a label above it. Portion math stays shared (`scaleFood` /
 * `servingsToQuantity`).
 */
function FoodPortionRow({ mf, name, image, food, onQty, onRemove }: { mf: MealFood; name: string; image: string | null; food?: FoodLike; onQty: (q: number) => void; onRemove: () => void }) {
  const units = useUnits();
  const scaled = food ? scaleFood({ servingSize: food.servingSize, calories: food.caloriesPerServing, proteinG: food.proteinG, carbsG: food.carbsG, fatG: food.fatG }, mf.quantity) : null;
  const serving = food?.servingSize ?? 0;
  return (
    <SubCard className="space-y-2">
      <div className="flex items-center gap-3">
        <FoodThumb src={image} size={34} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium leading-tight">{name}</div>
          {scaled ? (
            <MacroInline proteinG={scaled.proteinG} carbsG={scaled.carbsG} fatG={scaled.fatG} className="mt-0.5 text-[0.7rem]" />
          ) : (
            <div className="mt-0.5 text-[0.7rem] text-muted-foreground">Macros update after saving</div>
          )}
        </div>
        {scaled && <div className="numeral shrink-0 text-sm font-semibold text-calories">{fmtEnergy(scaled.calories, units)}</div>}
        <button onClick={onRemove} aria-label={`Remove ${name}`} className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-3 hover:text-danger [&_svg]:size-3.5"><X /></button>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative shrink-0">
          <Input
            type="number" inputMode="decimal" aria-label={`Amount in ${mf.unit}`}
            value={mf.quantity} onChange={(e) => onQty(Number(e.target.value))}
            className="h-9 w-[5.5rem] pr-7 text-sm"
          />
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">{mf.unit}</span>
        </div>
        {serving > 0 && (
          <Rail bleed="none" className="pb-0">
            {SERVING_PRESETS.map((mult) => {
              const q = servingsToQuantity(serving, mult);
              return <RailItem key={mult}><Chip selected={Math.abs(mf.quantity - q) < 0.05} onClick={() => onQty(q)} className="h-9 px-3 text-xs">{mult}×</Chip></RailItem>;
            })}
          </Rail>
        )}
      </div>
    </SubCard>
  );
}

/** The tenant's live accent colour as #rrggbb (from the applied --primary). */
const accentHex = (): string => { try { return colorToHex(getComputedStyle(document.documentElement).getPropertyValue("--primary").trim()); } catch { return "#10b981"; } };

/** Per-option plated-meal photo — an appetizing AI render of the option's foods. */
function MealImage({ mealName, foodNames, value, onChange }: { mealName: string; foodNames: string[]; value?: string | null; onChange: (url: string | null) => void }) {
  // `/api/ai/generate-image` is gated on aiSuite.
  const canAi = useCan("aiSuite");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const gen = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.post<{ url: string }>("/api/ai/generate-image", { feature: "meal-image", subject: mealName.trim() || "a healthy meal", hint: foodNames.length ? `made of ${foodNames.slice(0, 6).join(", ")}` : "", brandColor: accentHex() });
      onChange(r.url);
    } catch (e) {
      setErr(e instanceof ApiError && e.message.toLowerCase().includes("credit") ? "Out of AI credits." : "Couldn't generate — try again.");
    } finally { setBusy(false); }
  };
  if (value) {
    return (
      <div className="relative overflow-hidden rounded-xl">
        <img src={value} alt="" className="h-24 w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
        <div className="absolute right-2 top-2 flex gap-1.5">
          {canAi && <button onClick={() => void gen()} disabled={busy} className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md transition-colors hover:bg-black/70 [&_svg]:size-3.5"><AiAvatar className="size-3.5" /> {busy ? "…" : "Redo"}</button>}
          <button onClick={() => onChange(null)} aria-label="Remove photo" className="grid size-7 place-items-center rounded-full bg-black/50 text-white backdrop-blur-md transition-colors hover:bg-black/70 [&_svg]:size-3.5"><X /></button>
        </div>
      </div>
    );
  }
  if (!canAi) return null;
  return (
    <>
      <button onClick={() => void gen()} disabled={busy} className="flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-xs text-muted-foreground transition-colors hover:bg-surface-2 disabled:opacity-50 [&_svg]:size-3.5">
        {busy ? <><span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> Plating…</> : <><AiAvatar className="size-3.5" /> Generate a plated photo</>}
      </button>
      {err && <p className="text-xs text-warning">{err}</p>}
    </>
  );
}

function AiMealSheet({ onClose, onRun }: { onClose: () => void; onRun: (i: string) => Promise<string[]> }) {
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [dropped, setDropped] = useState<string[] | null>(null);
  const run = async () => { setBusy(true); setErr(null); setDropped(null); try { const d = await onRun(instructions); if (d.length) setDropped(d); } catch (e) { setErr(e); } finally { setBusy(false); } };
  return (
    <Sheet open onClose={onClose} title="AI meal draft" footer={<Button size="lg" className="w-full" disabled={busy} onClick={() => void run()}>{busy ? "Drafting…" : "Generate options"}</Button>}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Drafts meal options from this client's targets, body and dietary preferences — every food comes from your library. You'll review before publishing.</p>
        <Field label="Instructions (optional)" icon={PencilLine} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. high-protein, no dairy, 4 meals" />
        {dropped ? <div className="rounded-xl border border-border/60 bg-surface-2 p-3 text-xs text-muted-foreground">Options added. {dropped.length} suggested food{dropped.length === 1 ? "" : "s"} weren't in your library and {dropped.length === 1 ? "was" : "were"} skipped: {dropped.join(", ")}. Add {dropped.length === 1 ? "it" : "them"} to your library to include next time.</div> : null}
        {err ? <AiErrorBox error={err} /> : null}
      </div>
    </Sheet>
  );
}
