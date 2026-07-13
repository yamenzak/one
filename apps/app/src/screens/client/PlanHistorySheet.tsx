/**
 * Plan history — a read-only browser of a client's previous (superseded) plans,
 * for both workout and meal kinds. Opened from the Train / Eat active-plan
 * surfaces so clients can look back at what a past phase prescribed.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkoutBody, MealBody, MealOption } from "@mossa/protocol";
import { optionMacroTotals, type FoodLike } from "@mossa/protocol";
import { fmtEnergy } from "@mossa/domain";
import {
  Sheet, Card, Badge, Skeleton, EmptyState, MacroInline, cn,
  Dumbbell, Utensils, Moon, ChevronDown, History, type LucideIcon,
} from "@mossa/ui";
import { api } from "../../api.js";
import { useUnits } from "../../units.js";

type Kind = "workout" | "meal";
interface PlanRow { id: string; name: string; status: string; publishedAt: string | null; createdAt: string; body: WorkoutBody & MealBody }
interface ExerciseLite { id: string; name: string }
interface FoodRow { id: string; name: string; serving_size: number; calories: number; protein_g: number; carbs_g: number; fat_g: number }

const dateStr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "");

export function PlanHistorySheet({ clientId, kind, onClose }: { clientId: string; kind: Kind; onClose: () => void }) {
  const units = useUnits();
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [exMap, setExMap] = useState<Map<string, ExerciseLite>>(new Map());
  const [foods, setFoods] = useState<Map<string, FoodRow>>(new Map());
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const endpoint = kind === "workout" ? "workout-plans" : "meal-plans";
    const [pl, lib] = await Promise.all([
      api.get<{ plans: PlanRow[] }>(`/api/${endpoint}?clientId=${clientId}`),
      kind === "workout"
        ? api.get<{ exercises: ExerciseLite[] }>("/api/exercises?scope=all")
        : api.get<{ foods: FoodRow[] }>("/api/foods?scope=all"),
    ]);
    // Previous = superseded (the active plan is the published one, shown on the page).
    setPlans(pl.plans.filter((p) => p.status === "superseded"));
    if (kind === "workout") setExMap(new Map((lib as { exercises: ExerciseLite[] }).exercises.map((e) => [e.id, e])));
    else setFoods(new Map((lib as { foods: FoodRow[] }).foods.map((f) => [f.id, f])));
  }, [clientId, kind]);
  useEffect(() => void load(), [load]);

  const foodMap = useMemo(
    () => new Map([...foods.entries()].map(([id, f]) => [id, { id: f.id, servingSize: f.serving_size, caloriesPerServing: f.calories, proteinG: f.protein_g, carbsG: f.carbs_g, fatG: f.fat_g } as FoodLike])),
    [foods],
  );

  return (
    <Sheet open onClose={onClose} title={kind === "workout" ? "Previous workout plans" : "Previous meal plans"}>
      {!plans ? (
        <Skeleton className="h-40" />
      ) : plans.length === 0 ? (
        <EmptyState icon={History} title="No previous plans" description="When your coach publishes a new plan, the old one lands here for reference." />
      ) : (
        <div className="space-y-2.5">
          {plans.map((p) => {
            const open = openId === p.id;
            return (
              <Card key={p.id} className="space-y-2.5 p-3">
                <button onClick={() => setOpenId(open ? null : p.id)} className="flex w-full items-center gap-3 text-left">
                  <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground [&_svg]:size-[1.05rem]">{kind === "workout" ? <Dumbbell /> : <Utensils />}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{dateStr(p.publishedAt ?? p.createdAt)} · {kind === "workout" ? `${p.body.days?.length ?? 0} days` : `${p.body.mealOptions?.length ?? 0} options`}</div>
                  </div>
                  <Badge tone="neutral">previous</Badge>
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
                </button>
                {open && (kind === "workout" ? <WorkoutDetail body={p.body} exName={(id) => exMap.get(id)?.name ?? "Exercise"} /> : <MealDetail body={p.body} foodMap={foodMap} nameOf={(id) => foods.get(id)?.name ?? "Food"} units={units} />)}
              </Card>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}

function slotLine(slot: WorkoutBody["days"][number]["blocks"][number]["slots"][number]): string {
  const n = slot.sets.length;
  const s0 = slot.sets[0];
  const m = slot.measurementMode;
  const val = m === "time" ? (s0?.timeSec ? `${s0.timeSec}s` : "time") : m === "distance" ? (s0?.distanceM ? `${s0.distanceM} m` : "distance") : (s0?.reps ? `${s0.reps} reps` : "reps");
  return `${n} × ${val}`;
}

function WorkoutDetail({ body, exName }: { body: WorkoutBody; exName: (id: string) => string }) {
  return (
    <div className="space-y-2 pt-0.5">
      {(body.days ?? []).map((day, i) => {
        const slots = day.isRestDay ? [] : day.blocks.flatMap((b) => b.slots);
        return (
          <div key={i} className="rounded-xl bg-surface-2 p-3">
            <div className="mb-1.5 flex items-center gap-2">
              <IconTile icon={day.isRestDay ? Moon : Dumbbell} tone={day.isRestDay ? "sleep" : "activity"} />
              <span className="text-sm font-semibold">{day.name || `Day ${i + 1}`}</span>
              {day.isRestDay && <Badge tone="sleep">Rest</Badge>}
            </div>
            {!day.isRestDay && (
              <div className="space-y-1">
                {slots.map((slot, k) => (
                  <div key={k} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{exName(slot.exerciseId)}</span>
                    <span className="numeral shrink-0 text-xs text-muted-foreground">{slotLine(slot)}</span>
                  </div>
                ))}
                {slots.length === 0 && <p className="text-xs text-muted-foreground">No exercises.</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const mealLabel = (t: string) => t.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function MealDetail({ body, foodMap, nameOf, units }: { body: MealBody; foodMap: Map<string, FoodLike>; nameOf: (id: string) => string; units: ReturnType<typeof useUnits> }) {
  const groups = new Map<string, MealOption[]>();
  for (const opt of body.mealOptions ?? []) groups.set(opt.mealType, [...(groups.get(opt.mealType) ?? []), opt]);
  return (
    <div className="space-y-2.5 pt-0.5">
      {[...groups.entries()].map(([type, opts]) => (
        <div key={type} className="rounded-xl bg-surface-2 p-3">
          <div className="mb-2 flex items-center gap-2"><IconTile icon={Utensils} tone="nutrition" /><span className="text-sm font-semibold">{mealLabel(type)}</span></div>
          <div className="space-y-2">
            {opts.map((opt, i) => {
              const t = optionMacroTotals(opt, foodMap);
              return (
                <div key={i} className="rounded-lg bg-card p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-medium">{opt.mealName || (opt.isFree ? "Free meal" : `Option ${i + 1}`)}</span>
                    <span className="numeral shrink-0 text-xs text-calories">{opt.isFree ? (opt.freeMealMaxCalories != null ? `≤ ${fmtEnergy(opt.freeMealMaxCalories, units)}` : "—") : fmtEnergy(t.calories, units)}</span>
                  </div>
                  {!opt.isFree && (
                    <>
                      <MacroInline proteinG={t.proteinG} carbsG={t.carbsG} fatG={t.fatG} className="mt-1 text-[0.7rem]" />
                      {opt.foods.length > 0 && <div className="mt-1 truncate text-xs text-muted-foreground">{opt.foods.map((f) => nameOf(f.foodId)).join(", ")}</div>}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function IconTile({ icon: Icon, tone }: { icon: LucideIcon; tone: "activity" | "sleep" | "nutrition" }) {
  const cls = tone === "activity" ? "bg-activity-soft text-activity" : tone === "sleep" ? "bg-sleep-soft text-sleep" : "bg-nutrition-soft text-nutrition";
  return <span className={cn("grid size-6 shrink-0 place-items-center rounded-lg [&_svg]:size-3.5", cls)}><Icon /></span>;
}
