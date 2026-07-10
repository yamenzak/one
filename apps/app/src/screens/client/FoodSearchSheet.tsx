/**
 * Food search + log sheet (DESIGN.md §3, SPEC §8.4) — local library first,
 * external (Open Food Facts) fallback, barcode entry, quick entry. Logs a
 * scaled FoodEntry to the diary.
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Field, Sheet, SuggestionChip } from "@mossa/ui";
import { api, todayLocal } from "../../api.js";

interface Food {
  id?: string;
  name: string;
  brand?: string | null;
  serving_size?: number;
  servingSize?: number;
  serving_unit?: string;
  servingUnit?: string;
  calories: number;
  protein_g?: number;
  proteinG?: number;
  carbs_g?: number;
  carbsG?: number;
  fat_g?: number;
  fatG?: number;
  source?: string;
  sourceId?: string;
  barcode?: string | null;
}

const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;

function norm(f: Food) {
  return {
    servingSize: f.serving_size ?? f.servingSize ?? 100,
    servingUnit: f.serving_unit ?? f.servingUnit ?? "g",
    calories: f.calories,
    proteinG: f.protein_g ?? f.proteinG ?? 0,
    carbsG: f.carbs_g ?? f.carbsG ?? 0,
    fatG: f.fat_g ?? f.fatG ?? 0,
  };
}

export function FoodSearchSheet({ clientId, mealType, onClose, onLogged }: { clientId: string; mealType?: string; onClose: () => void; onLogged: () => void }) {
  const [q, setQ] = useState("");
  const [local, setLocal] = useState<Food[]>([]);
  const [external, setExternal] = useState<Food[]>([]);
  const [selected, setSelected] = useState<Food | null>(null);
  const [meal, setMeal] = useState(mealType ?? "snack");
  const [quantity, setQuantity] = useState("100");
  const [searching, setSearching] = useState(false);

  const search = useCallback(async () => {
    if (q.trim().length < 2) {
      setLocal([]);
      setExternal([]);
      return;
    }
    const r = await api.get<{ foods: Food[] }>(`/api/foods?q=${encodeURIComponent(q)}`);
    setLocal(r.foods);
  }, [q]);

  useEffect(() => {
    const t = setTimeout(() => void search(), 250);
    return () => clearTimeout(t);
  }, [search]);

  const searchExternal = async () => {
    setSearching(true);
    try {
      const r = await api.get<{ foods: Food[] }>(`/api/foods/search-external?q=${encodeURIComponent(q)}`);
      setExternal(r.foods);
    } finally {
      setSearching(false);
    }
  };

  const barcode = async () => {
    const code = prompt("Enter barcode digits");
    if (!code) return;
    let r = await api.get<{ food: Food | null }>(`/api/foods/barcode?code=${code}`);
    if (!r.food) r = await api.get<{ food: Food | null }>(`/api/foods/barcode-external?code=${code}`);
    if (r.food) setSelected(r.food);
    else alert("No product found for that barcode.");
  };

  const log = async () => {
    if (!selected) return;
    let foodId = selected.id;
    // External result -> import into the library first.
    if (!foodId && selected.source) {
      const imp = await api.post<{ id: string }>("/api/foods/import", {
        name: selected.name,
        brand: selected.brand ?? null,
        ...norm(selected),
        source: selected.source,
        sourceId: selected.sourceId,
        barcode: selected.barcode ?? null,
      });
      foodId = imp.id;
    }
    const n = norm(selected);
    const factor = Number(quantity) / n.servingSize;
    await api.post("/api/logs/food", {
      clientId,
      data: {
        date: todayLocal(),
        mealType: meal,
        foodId: foodId ?? null,
        label: selected.name,
        quantity: Number(quantity),
        unit: n.servingUnit,
        calories: Math.round(n.calories * factor),
        proteinG: Math.round(n.proteinG * factor),
        carbsG: Math.round(n.carbsG * factor),
        fatG: Math.round(n.fatG * factor),
      },
    });
    onLogged();
    onClose();
  };

  if (selected) {
    const n = norm(selected);
    const factor = Number(quantity || "0") / n.servingSize;
    return (
      <Sheet open onClose={() => setSelected(null)} title={selected.name}>
        <div className="space-y-4">
          {selected.brand && <div className="text-sm text-fg-muted">{selected.brand}</div>}
          <div className="flex flex-wrap gap-2">
            {MEALS.map((m) => (
              <SuggestionChip key={m} selected={meal === m} onClick={() => setMeal(m)}>
                {m}
              </SuggestionChip>
            ))}
          </div>
          <Field label={`Quantity (${n.servingUnit})`} icon="⚖️" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ""))} />
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              ["kcal", Math.round(n.calories * factor)],
              ["P", Math.round(n.proteinG * factor)],
              ["C", Math.round(n.carbsG * factor)],
              ["F", Math.round(n.fatG * factor)],
            ].map(([label, val]) => (
              <div key={label} className="rounded-2xl bg-surface-2 p-2">
                <div className="numeral text-lg font-semibold">{val}</div>
                <div className="text-xs text-fg-muted">{label}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => setSelected(null)}>Back</Button>
            <Button size="lg" className="flex-1" onClick={() => void log()}>Log it</Button>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title="Add food">
      <div className="space-y-3">
        <Field label="Search foods" icon="🔍" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <div className="flex gap-2">
          <SuggestionChip onClick={barcode}>📷 Barcode</SuggestionChip>
          <SuggestionChip onClick={() => void searchExternal()} disabled={q.length < 2}>
            {searching ? "Searching…" : "🌐 Search web"}
          </SuggestionChip>
        </div>
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {local.map((f) => (
            <FoodRow key={f.id} food={f} badge="library" onPick={() => setSelected(f)} />
          ))}
          {external.map((f, i) => (
            <FoodRow key={`ext-${i}`} food={f} badge="web" onPick={() => setSelected(f)} />
          ))}
          {q.length >= 2 && local.length === 0 && external.length === 0 && !searching && (
            <p className="p-4 text-center text-sm text-fg-muted">Nothing local — try "Search web".</p>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function FoodRow({ food, badge, onPick }: { food: Food; badge: string; onPick: () => void }) {
  return (
    <button onClick={onPick} className="flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left hover:bg-surface-2">
      <div className="min-w-0">
        <div className="truncate">{food.name}</div>
        {food.brand && <div className="truncate text-xs text-fg-muted">{food.brand}</div>}
      </div>
      <div className="ml-2 shrink-0 text-right">
        <div className="numeral text-sm">{Math.round(food.calories)} kcal</div>
        <div className="text-[10px] uppercase text-fg-muted">{badge}</div>
      </div>
    </button>
  );
}
