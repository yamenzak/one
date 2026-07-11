/**
 * Food search + log sheet — local library, Open Food Facts fallback, barcode,
 * quick entry, and ✦ AI (natural-language + snap-a-meal).
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Field, Sheet, Chip, Search, Barcode, Sparkles, Camera } from "@mossa/ui";
import { api, todayLocal } from "../../api.js";
import { BarcodeScanner } from "./BarcodeScanner.js";

interface Food {
  id?: string; name: string; brand?: string | null;
  serving_size?: number; servingSize?: number; serving_unit?: string; servingUnit?: string;
  calories: number; protein_g?: number; proteinG?: number; carbs_g?: number; carbsG?: number; fat_g?: number; fatG?: number;
  source?: string; sourceId?: string; barcode?: string | null;
}

const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
const norm = (f: Food) => ({ servingSize: f.serving_size ?? f.servingSize ?? 100, servingUnit: f.serving_unit ?? f.servingUnit ?? "g", calories: f.calories, proteinG: f.protein_g ?? f.proteinG ?? 0, carbsG: f.carbs_g ?? f.carbsG ?? 0, fatG: f.fat_g ?? f.fatG ?? 0 });

export function FoodSearchSheet({ clientId, mealType, onClose, onLogged }: { clientId: string; mealType?: string; onClose: () => void; onLogged: () => void }) {
  const [q, setQ] = useState("");
  const [local, setLocal] = useState<Food[]>([]);
  const [external, setExternal] = useState<Food[]>([]);
  const [selected, setSelected] = useState<Food | null>(null);
  const [meal, setMeal] = useState(mealType ?? "snack");
  const [quantity, setQuantity] = useState("100");
  const [searching, setSearching] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  const search = useCallback(async () => {
    if (q.trim().length < 2) { setLocal([]); setExternal([]); return; }
    setLocal((await api.get<{ foods: Food[] }>(`/api/foods?q=${encodeURIComponent(q)}`)).foods);
  }, [q]);
  useEffect(() => { const t = setTimeout(() => void search(), 250); return () => clearTimeout(t); }, [search]);

  const searchExternal = async () => { setSearching(true); try { setExternal((await api.get<{ foods: Food[] }>(`/api/foods/search-external?q=${encodeURIComponent(q)}`)).foods); } finally { setSearching(false); } };

  const lookupBarcode = async (code: string) => {
    setScanOpen(false);
    let r = await api.get<{ food: Food | null }>(`/api/foods/barcode?code=${code}`);
    if (!r.food) r = await api.get<{ food: Food | null }>(`/api/foods/barcode-external?code=${code}`);
    if (r.food) setSelected(r.food); else setAiError("No product matched that barcode.");
  };

  const log = async () => {
    if (!selected) return;
    let foodId = selected.id;
    if (!foodId && selected.source) foodId = (await api.post<{ id: string }>("/api/foods/import", { name: selected.name, brand: selected.brand ?? null, ...norm(selected), source: selected.source, sourceId: selected.sourceId, barcode: selected.barcode ?? null })).id;
    const n = norm(selected);
    const factor = Number(quantity) / n.servingSize;
    await api.post("/api/logs/food", { clientId, data: { date: todayLocal(), mealType: meal, foodId: foodId ?? null, label: selected.name, quantity: Number(quantity), unit: n.servingUnit, calories: Math.round(n.calories * factor), proteinG: Math.round(n.proteinG * factor), carbsG: Math.round(n.carbsG * factor), fatG: Math.round(n.fatG * factor) } });
    onLogged(); onClose();
  };

  const aiErr = (e: unknown) => { const m = e instanceof Error ? e.message : ""; setAiError(m.includes("aiSuite") ? "AI isn't on your studio's plan yet." : m.includes("insufficient") ? "Studio is out of AI credits." : "Couldn't parse that — try search."); };

  const naturalLog = async () => {
    setAiBusy(true); setAiError(null);
    try {
      const r = await api.post<{ entries: { label: string; mealType: string; calories: number; proteinG: number; carbsG: number; fatG: number }[] }>("/api/ai/parse-food", { clientId, text: q });
      for (const e of r.entries) await api.post("/api/logs/food", { clientId, data: { date: todayLocal(), mealType: e.mealType || meal, label: e.label, calories: e.calories, proteinG: e.proteinG, carbsG: e.carbsG, fatG: e.fatG } });
      onLogged(); onClose();
    } catch (e) { aiErr(e); } finally { setAiBusy(false); }
  };

  const snapMeal = async (photo: File) => {
    setAiBusy(true); setAiError(null);
    try {
      const fd = new FormData(); fd.append("file", photo); fd.append("purpose", "meal-snap");
      const up = await fetch("/api/media/upload", { method: "POST", credentials: "include", body: fd });
      const { key } = (await up.json()) as { key?: string };
      if (!key) throw new Error("upload failed");
      const r = await api.post<{ entries: { label: string; mealType: string; calories: number; proteinG: number; carbsG: number; fatG: number }[] }>("/api/ai/snap-meal", { clientId, imageKey: key, hint: q });
      for (const e of r.entries) await api.post("/api/logs/food", { clientId, data: { date: todayLocal(), mealType: e.mealType || meal, label: e.label, calories: e.calories, proteinG: e.proteinG, carbsG: e.carbsG, fatG: e.fatG } });
      onLogged(); onClose();
    } catch (e) { aiErr(e); } finally { setAiBusy(false); }
  };

  if (selected) {
    const n = norm(selected);
    const factor = Number(quantity || "0") / n.servingSize;
    return (
      <Sheet open onClose={() => setSelected(null)} title={selected.name}>
        <div className="space-y-4">
          {selected.brand && <div className="text-sm text-muted-foreground">{selected.brand}</div>}
          <div className="flex flex-wrap gap-2">{MEALS.map((m) => <Chip key={m} selected={meal === m} onClick={() => setMeal(m)}>{m}</Chip>)}</div>
          <Field label={`Quantity (${n.servingUnit})`} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ""))} />
          <div className="grid grid-cols-4 gap-2 text-center">
            {([["kcal", n.calories], ["P", n.proteinG], ["C", n.carbsG], ["F", n.fatG]] as const).map(([l, v]) => (
              <div key={l} className="rounded-xl bg-secondary p-2.5"><div className="numeral text-lg font-semibold">{Math.round(v * factor)}</div><div className="text-xs text-muted-foreground">{l}</div></div>
            ))}
          </div>
          <div className="flex gap-3"><Button variant="ghost" onClick={() => setSelected(null)}>Back</Button><Button size="lg" className="flex-1" onClick={() => void log()}>Log it</Button></div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title="Add food">
      <div className="space-y-3">
        <Field label="Search foods" icon={Search} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <div className="flex flex-wrap gap-2">
          <Chip icon={Barcode} onClick={() => setScanOpen(true)}>Barcode</Chip>
          <Chip icon={Search} onClick={() => void searchExternal()} disabled={q.length < 2}>{searching ? "Searching…" : "Web"}</Chip>
          <Chip icon={Sparkles} onClick={() => void naturalLog()} disabled={q.length < 3 || aiBusy}>{aiBusy ? "Parsing…" : "Log this"}</Chip>
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-secondary px-4 text-sm font-medium transition-colors hover:bg-surface-3 [&_svg]:size-4">
            <Camera /> {aiBusy ? "Reading…" : "Snap"}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && void snapMeal(e.target.files[0])} />
          </label>
        </div>
        {aiError && <p className="text-sm text-warning">{aiError}</p>}
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {local.map((f) => <FoodRow key={f.id} food={f} badge="library" onPick={() => setSelected(f)} />)}
          {external.map((f, i) => <FoodRow key={`ext-${i}`} food={f} badge="web" onPick={() => setSelected(f)} />)}
          {q.length >= 2 && local.length === 0 && external.length === 0 && !searching && <p className="p-4 text-center text-sm text-muted-foreground">Nothing local — try Web.</p>}
        </div>
      </div>
      {scanOpen && <BarcodeScanner onDetected={(code) => void lookupBarcode(code)} onClose={() => setScanOpen(false)} />}
    </Sheet>
  );
}

function FoodRow({ food, badge, onPick }: { food: Food; badge: string; onPick: () => void }) {
  return (
    <button onClick={onPick} className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition-colors hover:bg-secondary">
      <div className="min-w-0">
        <div className="truncate">{food.name}</div>
        {food.brand && <div className="truncate text-xs text-muted-foreground">{food.brand}</div>}
      </div>
      <div className="ml-2 shrink-0 text-right">
        <div className="numeral text-sm">{Math.round(food.calories)} kcal</div>
        <div className="text-[0.6rem] uppercase text-muted-foreground">{badge}</div>
      </div>
    </button>
  );
}
