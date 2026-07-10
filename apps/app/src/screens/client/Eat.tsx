/** Eat tab: today's diary entries grouped by meal (search/barcode next phase). */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Skeleton } from "@mossa/ui";
import { api, todayLocal } from "../../api.js";
import { FoodSearchSheet } from "./FoodSearchSheet.js";

interface Entry {
  id: string;
  meal_type: string;
  label: string | null;
  calories: number;
  protein_g: number;
}

export function Eat({ clientId }: { clientId: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const date = todayLocal();

  const load = useCallback(async () => {
    const r = await api.get<{ entries: Entry[] }>(`/api/logs/food?clientId=${clientId}&date=${date}`);
    setEntries(r.entries);
  }, [clientId, date]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!entries) return <Skeleton className="m-4 h-64" />;

  const byMeal = new Map<string, Entry[]>();
  for (const e of entries) {
    const list = byMeal.get(e.meal_type) ?? [];
    list.push(e);
    byMeal.set(e.meal_type, list);
  }
  const total = entries.reduce((n, e) => n + e.calories, 0);

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 pb-28">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Eat</h1>
        <div className="numeral text-lg font-semibold text-nutrition">{Math.round(total)} kcal</div>
      </div>
      {entries.length === 0 ? (
        <Card className="text-center">
          <div className="text-4xl">🍽️</div>
          <h2 className="mt-2 text-lg font-semibold">Nothing logged today</h2>
          <p className="mt-1 text-sm text-fg-muted">Log your first meal — quick entry works, search and barcode are coming.</p>
        </Card>
      ) : (
        [...byMeal.entries()].map(([meal, list]) => (
          <Card key={meal}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-fg-muted">{meal.replace("_", " ")}</h2>
            <div className="space-y-2">
              {list.map((e) => (
                <div key={e.id} className="flex items-center justify-between">
                  <span>{e.label ?? "Food"}</span>
                  <span className="numeral text-fg-muted">{Math.round(e.calories)} kcal</span>
                </div>
              ))}
            </div>
          </Card>
        ))
      )}
      <Button size="lg" className="w-full" onClick={() => setLogOpen(true)}>
        ＋ Log food
      </Button>
      {logOpen && <FoodSearchSheet clientId={clientId} onClose={() => setLogOpen(false)} onLogged={() => void load()} />}
    </div>
  );
}
