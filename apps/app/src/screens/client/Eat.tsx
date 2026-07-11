/** Eat tab — today's diary grouped by meal, with search/barcode + meal plan. */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Skeleton, Page, Stagger, EmptyState, Plus, ClipboardList, Utensils } from "@mossa/ui";
import { api, todayLocal } from "../../api.js";
import { FoodSearchSheet } from "./FoodSearchSheet.js";
import { MealPlanDrawer } from "./MealPlanDrawer.js";

interface Entry { id: string; meal_type: string; label: string | null; calories: number; protein_g: number }

export function Eat({ clientId }: { clientId: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const date = todayLocal();

  const load = useCallback(async () => {
    setEntries((await api.get<{ entries: Entry[] }>(`/api/logs/food?clientId=${clientId}&date=${date}`)).entries);
  }, [clientId, date]);
  useEffect(() => void load(), [load]);

  if (!entries) return <Skeleton className="m-4 h-64" />;

  const byMeal = new Map<string, Entry[]>();
  for (const e of entries) byMeal.set(e.meal_type, [...(byMeal.get(e.meal_type) ?? []), e]);
  const total = entries.reduce((n, e) => n + e.calories, 0);

  return (
    <Page className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Eat</h1>
        <div className="numeral rounded-full bg-nutrition-soft px-3 py-1 text-sm font-semibold text-nutrition">{Math.round(total)} kcal</div>
      </div>

      {entries.length === 0 ? (
        <EmptyState icon={Utensils} title="Nothing logged today" description="Log your first meal — search, barcode, or your plan." action={<Button onClick={() => setLogOpen(true)}><Plus /> Log food</Button>} />
      ) : (
        <Stagger className="space-y-4">
          {[...byMeal.entries()].map(([meal, list]) => (
            <Card key={meal} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{meal.replace("_", " ")}</h2>
              {list.map((e) => (
                <div key={e.id} className="flex items-center justify-between border-t border-border/40 pt-2 first:border-0 first:pt-0">
                  <span className="text-sm">{e.label ?? "Food"}</span>
                  <span className="numeral text-sm text-muted-foreground">{Math.round(e.calories)} kcal</span>
                </div>
              ))}
            </Card>
          ))}
        </Stagger>
      )}

      <div className="flex gap-3">
        <Button size="lg" className="flex-1" onClick={() => setLogOpen(true)}><Plus /> Log food</Button>
        <Button size="lg" variant="tonal" className="flex-1" onClick={() => setPlanOpen(true)}><ClipboardList /> My plan</Button>
      </div>

      {logOpen && <FoodSearchSheet clientId={clientId} onClose={() => setLogOpen(false)} onLogged={() => void load()} />}
      {planOpen && <MealPlanDrawer clientId={clientId} onClose={() => setPlanOpen(false)} onLogged={() => void load()} />}
    </Page>
  );
}
