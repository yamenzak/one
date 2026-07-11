/**
 * Food search + log sheet — local library, Open Food Facts fallback, barcode,
 * quick entry, and ✦ AI (natural-language + snap-a-meal).
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Field, Sheet, Chip, Badge, Switch, SegmentedControl, MacroInline, cn, toneSoft, METRICS, Search, Barcode, Camera, Utensils } from "@mossa/ui";
import { api, todayLocal } from "../../api.js";
import { BarcodeScanner } from "./BarcodeScanner.js";

interface Food {
  id?: string; name: string; brand?: string | null; description?: string | null;
  serving_size?: number; servingSize?: number; serving_unit?: string; servingUnit?: string;
  calories: number; protein_g?: number; proteinG?: number; carbs_g?: number; carbsG?: number; fat_g?: number; fatG?: number;
  fiber_g?: number; fiberG?: number; sugar_g?: number; sugarG?: number; sodium_mg?: number; sodiumMg?: number;
  saturated_fat_g?: number; saturatedFatG?: number; cholesterol_mg?: number; cholesterolMg?: number;
  potassium_mg?: number; potassiumMg?: number; calcium_mg?: number; calciumMg?: number; iron_mg?: number; ironMg?: number;
  source?: string; sourceId?: string; barcode?: string | null; image_url?: string | null; imageUrl?: string | null;
}

const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
const pick = (a: number | undefined, b: number | undefined) => a ?? b ?? 0;
const norm = (f: Food) => ({ servingSize: f.serving_size ?? f.servingSize ?? 100, servingUnit: f.serving_unit ?? f.servingUnit ?? "g", calories: f.calories, proteinG: pick(f.protein_g, f.proteinG), carbsG: pick(f.carbs_g, f.carbsG), fatG: pick(f.fat_g, f.fatG) });
/** Full micro/macro map (metric) for import + the detail nutrition panel. */
const micros = (f: Food) => ({
  fiberG: pick(f.fiber_g, f.fiberG), sugarG: pick(f.sugar_g, f.sugarG), sodiumMg: pick(f.sodium_mg, f.sodiumMg),
  saturatedFatG: pick(f.saturated_fat_g, f.saturatedFatG), cholesterolMg: pick(f.cholesterol_mg, f.cholesterolMg),
  potassiumMg: pick(f.potassium_mg, f.potassiumMg), calciumMg: pick(f.calcium_mg, f.calciumMg), ironMg: pick(f.iron_mg, f.ironMg),
});

export function FoodSearchSheet({ clientId, mealType, onClose, onLogged, onPick }: { clientId?: string; mealType?: string; onClose: () => void; onLogged?: () => void; onPick?: (foodId: string, name: string) => void }) {
  const [q, setQ] = useState("");
  const [local, setLocal] = useState<Food[]>([]);
  const [external, setExternal] = useState<Food[]>([]);
  const [selected, setSelected] = useState<Food | null>(null);
  const [meal, setMeal] = useState(mealType ?? "snack");
  const [quantity, setQuantity] = useState("100");
  const [searching, setSearching] = useState(false);
  const [extPage, setExtPage] = useState(0);
  const [extMore, setExtMore] = useState(false);
  const [filter, setFilter] = useState<"all" | "whole" | "branded">("all");
  const [webAlso, setWebAlso] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  const searchExternal = useCallback(async (page = 1) => {
    if (q.trim().length < 2) return;
    setSearching(true);
    try {
      const res = (await api.get<{ foods: Food[] }>(`/api/foods/search-external?q=${encodeURIComponent(q)}&page=${page}`)).foods;
      setExternal((prev) => {
        if (page === 1) return res;
        const seen = new Set(prev.map((f) => `${f.source}:${f.sourceId ?? f.name}`));
        return [...prev, ...res.filter((f) => !seen.has(`${f.source}:${f.sourceId ?? f.name}`))];
      });
      setExtPage(page);
      setExtMore(res.length >= 10);
    } finally { setSearching(false); }
  }, [q]);

  const search = useCallback(async () => {
    if (q.trim().length < 2) { setLocal([]); setExternal([]); setExtPage(0); return; }
    setLocal((await api.get<{ foods: Food[] }>(`/api/foods?q=${encodeURIComponent(q)}`)).foods);
    setExternal([]); setExtPage(0); setExtMore(false);
    if (webAlso) void searchExternal(1);
  }, [q, webAlso, searchExternal]);
  useEffect(() => { const t = setTimeout(() => void search(), 300); return () => clearTimeout(t); }, [search]);

  const matchesFilter = (f: Food) => filter === "all" || (filter === "branded" ? !!f.brand : !f.brand);

  /** Import an external food (or return an existing local id). */
  const importFood = async (f: Food): Promise<string | undefined> => {
    if (f.id) return f.id;
    if (!f.source) return undefined;
    return (await api.post<{ id: string }>("/api/foods/import", { name: f.name, brand: f.brand ?? null, description: f.description ?? null, ...norm(f), ...micros(f), imageUrl: f.image_url ?? f.imageUrl ?? null, source: f.source, sourceId: f.sourceId, barcode: f.barcode ?? null })).id;
  };

  // Pick mode (plan building): choosing a row imports + returns the id, no logging.
  const pickFood = async (f: Food) => { const id = await importFood(f); if (id && onPick) { onPick(id, f.name); onClose(); } };
  const rowClick = (f: Food) => (onPick ? void pickFood(f) : setSelected(f));

  const lookupBarcode = async (code: string) => {
    setScanOpen(false);
    let r = await api.get<{ food: Food | null }>(`/api/foods/barcode?code=${code}`);
    if (!r.food) r = await api.get<{ food: Food | null }>(`/api/foods/barcode-external?code=${code}`);
    if (r.food) rowClick(r.food); else setAiError("No product matched that barcode.");
  };

  const log = async () => {
    if (!selected) return;
    const foodId = await importFood(selected);
    const n = norm(selected);
    const factor = Number(quantity) / n.servingSize;
    await api.post("/api/logs/food", { clientId, data: { date: todayLocal(), mealType: meal, foodId: foodId ?? null, label: selected.name, quantity: Number(quantity), unit: n.servingUnit, calories: Math.round(n.calories * factor), proteinG: Math.round(n.proteinG * factor), carbsG: Math.round(n.carbsG * factor), fatG: Math.round(n.fatG * factor) } });
    onLogged?.(); onClose();
  };

  const aiErr = (e: unknown) => { const m = e instanceof Error ? e.message : ""; setAiError(m.includes("aiSuite") ? "AI isn't on your studio's plan yet." : m.includes("insufficient") ? "Studio is out of AI credits." : "Couldn't parse that — try search."); };

  const snapMeal = async (photo: File) => {
    setAiBusy(true); setAiError(null);
    try {
      const fd = new FormData(); fd.append("file", photo); fd.append("purpose", "meal-snap");
      const up = await fetch("/api/media/upload", { method: "POST", credentials: "include", body: fd });
      const { key } = (await up.json()) as { key?: string };
      if (!key) throw new Error("upload failed");
      const r = await api.post<{ entries: { label: string; mealType: string; calories: number; proteinG: number; carbsG: number; fatG: number }[] }>("/api/ai/snap-meal", { clientId, imageKey: key, hint: q });
      for (const e of r.entries) await api.post("/api/logs/food", { clientId, data: { date: todayLocal(), mealType: e.mealType || meal, label: e.label, calories: e.calories, proteinG: e.proteinG, carbsG: e.carbsG, fatG: e.fatG } });
      onLogged?.(); onClose();
    } catch (e) { aiErr(e); } finally { setAiBusy(false); }
  };

  if (selected) {
    const n = norm(selected);
    const mi = micros(selected);
    const factor = Number(quantity || "0") / n.servingSize;
    const img = selected.image_url ?? selected.imageUrl;
    const microRows: [string, number, string][] = [
      ["Fiber", mi.fiberG, "g"], ["Sugar", mi.sugarG, "g"], ["Sat. fat", mi.saturatedFatG, "g"], ["Sodium", mi.sodiumMg, "mg"],
      ["Cholesterol", mi.cholesterolMg, "mg"], ["Potassium", mi.potassiumMg, "mg"], ["Calcium", mi.calciumMg, "mg"], ["Iron", mi.ironMg, "mg"],
    ];
    const hasMicros = microRows.some(([, v]) => v > 0);
    return (
      <Sheet open onClose={() => setSelected(null)} title={selected.name}>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {img && <img src={img} alt="" className="size-14 shrink-0 rounded-xl object-cover" />}
            <div className="min-w-0">{selected.brand && <div className="truncate text-sm text-muted-foreground">{selected.brand}</div>}<div className="text-xs text-muted-foreground">per {n.servingSize} {n.servingUnit}</div></div>
          </div>
          <div className="flex flex-wrap gap-2">{MEALS.map((m) => <Chip key={m} selected={meal === m} onClick={() => setMeal(m)}>{m}</Chip>)}</div>
          <Field label={`Quantity (${n.servingUnit})`} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ""))} />
          <div className="grid grid-cols-4 gap-2 text-center">
            {([["calories", "kcal", n.calories], ["protein", "P", n.proteinG], ["carbs", "C", n.carbsG], ["fat", "F", n.fatG]] as const).map(([metric, l, v]) => (
              <div key={l} className={cn("rounded-xl p-2.5", toneSoft[METRICS[metric].tone])}><div className="numeral text-lg font-semibold">{Math.round(v * factor)}</div><div className="text-xs font-medium opacity-70">{l}</div></div>
            ))}
          </div>
          {hasMicros && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl bg-surface-2 p-3 text-sm">
              {microRows.filter(([, v]) => v > 0).map(([l, v, u]) => (
                <div key={l} className="flex items-center justify-between"><span className="text-muted-foreground">{l}</span><span className="numeral">{Math.round(v * factor * 10) / 10} {u}</span></div>
              ))}
            </div>
          )}
          <div className="flex gap-3"><Button variant="ghost" onClick={() => setSelected(null)}>Back</Button><Button size="lg" className="flex-1" onClick={() => void log()}>Log it</Button></div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Add food"
      titleAction={
        <div className="flex items-center gap-1.5">
          <button onClick={() => setScanOpen(true)} className="grid size-9 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-surface-3 [&_svg]:size-[1.15rem]" aria-label="Scan barcode"><Barcode /></button>
          {!onPick && (
            <label className="grid size-9 cursor-pointer place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-surface-3 [&_svg]:size-[1.15rem]" aria-label="Snap a meal">
              {aiBusy ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Camera />}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && void snapMeal(e.target.files[0])} />
            </label>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Search foods" icon={Search} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <div className="flex items-center justify-between gap-3">
          <SegmentedControl
            options={[{ value: "all", label: "All" }, { value: "whole", label: "Whole" }, { value: "branded", label: "Branded" }]}
            value={filter}
            onChange={setFilter}
          />
          <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">Web<Switch checked={webAlso} onCheckedChange={(v) => { setWebAlso(v); if (v) void searchExternal(1); }} /></label>
        </div>
        {aiError && <p className="text-sm text-warning">{aiError}</p>}
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {local.filter(matchesFilter).map((f) => <FoodRow key={f.id} food={f} badge="library" onPick={() => rowClick(f)} />)}
          {external.filter(matchesFilter).map((f, i) => <FoodRow key={`ext-${i}`} food={f} badge="web" onPick={() => rowClick(f)} />)}
          {searching && external.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Searching the web…</p>}
          {q.length >= 2 && !searching && local.filter(matchesFilter).length === 0 && external.filter(matchesFilter).length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">{extPage === 0 && !webAlso ? "Nothing in your library — turn on Web." : "No matches."}</p>
          )}
          {extPage > 0 && extMore && (
            <Button variant="ghost" className="w-full" disabled={searching} onClick={() => void searchExternal(extPage + 1)}>{searching ? "Loading…" : "Load more results"}</Button>
          )}
          {!webAlso && extPage === 0 && q.length >= 2 && !searching && (
            <button onClick={() => void searchExternal(1)} className="w-full rounded-xl px-3 py-2.5 text-center text-sm font-medium text-primary">Can't find it? Search the web →</button>
          )}
        </div>
      </div>
      {scanOpen && <BarcodeScanner onDetected={(code) => void lookupBarcode(code)} onClose={() => setScanOpen(false)} />}
    </Sheet>
  );
}

function FoodRow({ food, badge, onPick }: { food: Food; badge: string; onPick: () => void }) {
  const img = food.image_url ?? food.imageUrl;
  const n = norm(food);
  return (
    <button onClick={onPick} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-secondary">
      <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-2">
        {img ? <img src={img} alt="" className="size-full object-cover" /> : <Utensils className="size-4 text-muted-foreground" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{food.name}</div>
        <div className="flex items-center gap-2 truncate text-xs text-muted-foreground">
          {food.brand && <span className="truncate">{food.brand}</span>}
          <span className="numeral shrink-0 text-calories">{Math.round(n.calories)} kcal</span>
          <MacroInline proteinG={n.proteinG} carbsG={n.carbsG} fatG={n.fatG} className="shrink-0 text-[0.7rem]" />
        </div>
      </div>
      <Badge tone={badge === "web" ? "cardio" : "neutral"}>{badge}</Badge>
    </button>
  );
}
