/**
 * Food search + log sheet — local library, Open Food Facts fallback, barcode,
 * quick entry, and ✦ AI (natural-language + snap-a-meal).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtEnergy, kcalToDisplay, type UnitPrefs } from "@mossa/domain";
import { Button, Field, Sheet, Chip, Badge, Switch, SegmentedControl, MacroInline, cn, toneSoft, METRICS, Search, Barcode, Camera, PencilLine, Utensils, X } from "@mossa/ui";
import { api, todayLocal } from "../../api.js";
import { useSession } from "../../session.js";
import { useUnits } from "../../units.js";
import { AiAvatar } from "../../AiAvatar.js";
import { AiAnalyzing } from "../../AiAnalyzing.js";
import { AiErrorBox } from "../../AiError.js";
import { BarcodeScanner } from "./BarcodeScanner.js";
import { FoodEditor, type EditableFood } from "./FoodEditor.js";

/** A food the vision model detected in a snapped meal (pre-log, reviewable). */
interface SnapEntry { label: string; mealType?: string; calories: number; proteinG: number; carbsG: number; fatG: number; quantity?: number | null; unit?: string | null }

interface Food {
  id?: string; name: string; brand?: string | null; description?: string | null;
  serving_size?: number; servingSize?: number; serving_unit?: string; servingUnit?: string;
  calories: number; protein_g?: number; proteinG?: number; carbs_g?: number; carbsG?: number; fat_g?: number; fatG?: number;
  fiber_g?: number; fiberG?: number; sugar_g?: number; sugarG?: number; sodium_mg?: number; sodiumMg?: number;
  saturated_fat_g?: number; saturatedFatG?: number; cholesterol_mg?: number; cholesterolMg?: number;
  potassium_mg?: number; potassiumMg?: number; calcium_mg?: number; calciumMg?: number; iron_mg?: number; ironMg?: number;
  source?: string; sourceId?: string; barcode?: string | null; image_url?: string | null; imageUrl?: string | null;
}

const MEALS = ["breakfast", "lunch", "dinner", "snack", "pre_workout", "post_workout"] as const;
const mealLabel = (m: string) => m.replace(/_/g, " ");
const pick = (a: number | undefined, b: number | undefined) => a ?? b ?? 0;
const norm = (f: Food) => ({ servingSize: f.serving_size ?? f.servingSize ?? 100, servingUnit: f.serving_unit ?? f.servingUnit ?? "g", calories: f.calories, proteinG: pick(f.protein_g, f.proteinG), carbsG: pick(f.carbs_g, f.carbsG), fatG: pick(f.fat_g, f.fatG) });
/** Full micro/macro map (metric) for import + the detail nutrition panel. */
const micros = (f: Food) => ({
  fiberG: pick(f.fiber_g, f.fiberG), sugarG: pick(f.sugar_g, f.sugarG), sodiumMg: pick(f.sodium_mg, f.sodiumMg),
  saturatedFatG: pick(f.saturated_fat_g, f.saturatedFatG), cholesterolMg: pick(f.cholesterol_mg, f.cholesterolMg),
  potassiumMg: pick(f.potassium_mg, f.potassiumMg), calciumMg: pick(f.calcium_mg, f.calciumMg), ironMg: pick(f.iron_mg, f.ironMg),
});

export function FoodSearchSheet({ clientId, mealType, autoCamera, onClose, onLogged, onPick }: { clientId?: string; mealType?: string; autoCamera?: boolean; onClose: () => void; onLogged?: () => void; onPick?: (foodId: string, name: string) => void }) {
  const snapInputRef = useRef<HTMLInputElement>(null);
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
  const [snapErr, setSnapErr] = useState<unknown>(null);
  // Snap-a-meal review: the AI's detected foods + its note + the photo, held
  // for the user to confirm/trim BEFORE anything is logged (no fire-and-forget).
  const [snap, setSnap] = useState<{ entries: SnapEntry[]; note: string | null; imageKey: string } | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  // Manual add / barcode-miss editor. `null` = closed; an object opens it,
  // optionally prefilled (e.g. with a scanned-but-unmatched barcode).
  const [editor, setEditor] = useState<Partial<EditableFood> | null>(null);
  // Barcode miss → fire the label scanner on editor open (auto camera).
  const [editorAutoScan, setEditorAutoScan] = useState(false);
  const { ctx } = useSession();
  const units = useUnits();
  const isStaff = ctx?.active?.role !== undefined && ctx.active.role !== "client";

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
  // "Snap a meal" entry point — open the camera picker as soon as the sheet mounts.
  useEffect(() => { if (autoCamera) snapInputRef.current?.click(); }, [autoCamera]);

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
    // Miss → open the new-food editor with the barcode prefilled and fire the
    // label scanner so they can shoot the nutrition panel to auto-fill it.
    if (r.food) rowClick(r.food);
    else { setAiError(null); setSnapErr(null); setEditorAutoScan(true); setEditor({ barcode: code }); }
  };

  const log = async () => {
    if (!selected) return;
    const foodId = await importFood(selected);
    const n = norm(selected);
    const factor = Number(quantity) / n.servingSize;
    await api.post("/api/logs/food", { clientId, data: { date: todayLocal(), mealType: meal, foodId: foodId ?? null, label: selected.name, quantity: Number(quantity), unit: n.servingUnit, calories: Math.round(n.calories * factor), proteinG: Math.round(n.proteinG * factor), carbsG: Math.round(n.carbsG * factor), fatG: Math.round(n.fatG * factor) } });
    onLogged?.(); onClose();
  };

  const snapMeal = async (photo: File) => {
    setAiBusy(true); setAiError(null); setSnapErr(null);
    try {
      const fd = new FormData(); fd.append("file", photo); fd.append("purpose", "meal-snap");
      const up = await fetch("/api/media/upload", { method: "POST", credentials: "include", body: fd });
      if (!up.ok) throw new Error("Couldn't upload that photo — try again.");
      const { key } = (await up.json()) as { key?: string };
      if (!key) throw new Error("Couldn't upload that photo — try again.");
      const r = await api.post<{ entries: SnapEntry[]; note: string | null }>("/api/ai/snap-meal", { clientId, imageKey: key, hint: q });
      if (!r.entries?.length) throw new Error("No foods detected in that photo — try another angle or search instead.");
      // Show the AI's read for review — logging happens only on confirm.
      setSnap({ entries: r.entries, note: r.note ?? null, imageKey: key });
    } catch (e) { setSnapErr(e); } finally { setAiBusy(false); }
  };

  /** Confirm a reviewed snap: log every kept item under the chosen meal, each
   *  stamped with the meal photo so the diary shows what they ate. */
  const logSnap = async (items: SnapEntry[], mealType: string) => {
    const imageUrl = snap ? `/api/media/${snap.imageKey}` : null;
    for (const e of items) {
      await api.post("/api/logs/food", { clientId, data: { date: todayLocal(), mealType, label: e.label, quantity: e.quantity ?? null, unit: e.unit ?? null, calories: e.calories, proteinG: e.proteinG, carbsG: e.carbsG, fatG: e.fatG, imageUrl } });
    }
    setSnap(null); onLogged?.(); onClose();
  };

  if (aiBusy && !snap) {
    return (
      <Sheet open onClose={onClose} title="Reading your plate…">
        <AiAnalyzing label="Analyzing your meal" sub="Spotting foods and estimating macros…" />
      </Sheet>
    );
  }

  if (snap) {
    return (
      <SnapReview
        entries={snap.entries}
        note={snap.note}
        defaultMeal={snap.entries[0]?.mealType && MEALS.includes(snap.entries[0].mealType as (typeof MEALS)[number]) ? snap.entries[0].mealType! : meal}
        units={units}
        onCancel={() => setSnap(null)}
        onRetake={() => { setSnap(null); snapInputRef.current?.click(); }}
        onConfirm={logSnap}
      />
    );
  }

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
          <div className="flex flex-wrap gap-2">{MEALS.map((m) => <Chip key={m} selected={meal === m} onClick={() => setMeal(m)}>{mealLabel(m)}</Chip>)}</div>
          <Field label={`Quantity (${n.servingUnit})`} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ""))} />
          <div className="grid grid-cols-4 gap-2">
            {([["calories", n.calories], ["protein", n.proteinG], ["carbs", n.carbsG], ["fat", n.fatG]] as const).map(([metric, v]) => {
              const M = METRICS[metric];
              return (
                <div key={metric} className={cn("flex flex-col items-center gap-1 rounded-xl p-2.5", toneSoft[M.tone])}>
                  <M.icon className="size-4" />
                  <div className="numeral text-lg font-semibold leading-none">{metric === "calories" ? kcalToDisplay(v * factor, units).toLocaleString() : Math.round(v * factor)}</div>
                </div>
              );
            })}
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
              <input ref={snapInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && void snapMeal(e.target.files[0])} />
            </label>
          )}
          <button onClick={() => { setEditorAutoScan(false); setEditor({}); }} className="grid size-9 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-surface-3 [&_svg]:size-[1.15rem]" aria-label="Add manually"><PencilLine /></button>
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
        {snapErr != null && <AiErrorBox error={snapErr} />}
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {local.filter(matchesFilter).map((f) => <FoodRow key={f.id} food={f} badge="library" units={units} onPick={() => rowClick(f)} />)}
          {external.filter(matchesFilter).map((f, i) => <FoodRow key={`ext-${i}`} food={f} badge="web" units={units} onPick={() => rowClick(f)} />)}
          {searching && external.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Searching the web…</p>}
          {q.length >= 2 && !searching && local.filter(matchesFilter).length === 0 && external.filter(matchesFilter).length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">{extPage === 0 && !webAlso ? "Nothing in your library — turn on Web." : "No matches."}</p>
          )}
          {extPage > 0 && extMore && (
            <Button variant="ghost" className="w-full" disabled={searching} onClick={() => void searchExternal(extPage + 1)}>{searching ? "Loading…" : "Load more results"}</Button>
          )}
          {!webAlso && extPage === 0 && q.length >= 2 && !searching && (
            <button onClick={() => { setWebAlso(true); void searchExternal(1); }} className="w-full rounded-xl px-3 py-2.5 text-center text-sm font-medium text-primary">Can't find it? Search the web →</button>
          )}
        </div>
      </div>
      {scanOpen && <BarcodeScanner onDetected={(code) => void lookupBarcode(code)} onClose={() => setScanOpen(false)} />}
      {editor && (
        <FoodEditor
          initial={editor}
          isStaff={isStaff}
          autoScanLabel={editorAutoScan}
          title={editor.barcode ? "New product" : undefined}
          onClose={() => { setEditor(null); setEditorAutoScan(false); }}
          onSaved={(food) => { setEditor(null); setEditorAutoScan(false); if (onPick) void pickFood(food as Food); else setSelected(food as Food); }}
        />
      )}
    </Sheet>
  );
}

function FoodRow({ food, badge, units, onPick }: { food: Food; badge: string; units: UnitPrefs; onPick: () => void }) {
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
          <span className="numeral shrink-0 text-calories">{fmtEnergy(n.calories, units)}</span>
          <MacroInline proteinG={n.proteinG} carbsG={n.carbsG} fatG={n.fatG} className="shrink-0 text-[0.7rem]" />
        </div>
      </div>
      <Badge tone={badge === "web" ? "cardio" : "neutral"}>{badge}</Badge>
    </button>
  );
}

/**
 * Snap-a-meal review — the smart step between the photo and the diary. Shows
 * the AI's read (foods + macros) and a one-line assessment, lets the user pick
 * the meal and trim any mis-detected item, then logs everything on confirm.
 */
function SnapReview({ entries, note, defaultMeal, units, onCancel, onRetake, onConfirm }: {
  entries: SnapEntry[]; note: string | null; defaultMeal: string; units: UnitPrefs;
  onCancel: () => void; onRetake: () => void; onConfirm: (items: SnapEntry[], mealType: string) => Promise<void>;
}) {
  const [items, setItems] = useState<SnapEntry[]>(entries);
  const [meal, setMeal] = useState(defaultMeal);
  const [busy, setBusy] = useState(false);
  const totals = items.reduce((t, e) => ({ calories: t.calories + e.calories, proteinG: t.proteinG + e.proteinG, carbsG: t.carbsG + e.carbsG, fatG: t.fatG + e.fatG }), { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  const confirm = async () => { setBusy(true); try { await onConfirm(items, meal); } finally { setBusy(false); } };

  return (
    <Sheet open onClose={onCancel} title="Review meal">
      <div className="space-y-4">
        {note && (
          <div className="flex items-start gap-3 rounded-2xl bg-primary/10 p-3">
            <AiAvatar className="size-8 shrink-0" />
            <div className="min-w-0">
              <div className="text-[0.65rem] font-semibold uppercase tracking-wide text-primary">AI read</div>
              <p className="mt-0.5 text-sm leading-relaxed">{note}</p>
            </div>
          </div>
        )}

        <div>
          <div className="mb-1.5 text-sm text-muted-foreground">Meal</div>
          <div className="flex flex-wrap gap-2">{MEALS.map((m) => <Chip key={m} selected={meal === m} onClick={() => setMeal(m)}>{mealLabel(m)}</Chip>)}</div>
        </div>

        <div className="space-y-1.5">
          {items.map((e, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{e.label}</div>
                <div className="mt-0.5 flex items-center gap-2 truncate text-xs text-muted-foreground">
                  {e.quantity ? <span className="numeral shrink-0">{Math.round(e.quantity)} {e.unit ?? "g"}</span> : null}
                  <span className="numeral shrink-0 text-calories">{fmtEnergy(e.calories, units)}</span>
                  <MacroInline proteinG={e.proteinG} carbsG={e.carbsG} fatG={e.fatG} className="shrink-0 text-[0.7rem]" />
                </div>
              </div>
              <button onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-danger [&_svg]:size-4" aria-label={`Remove ${e.label}`}><X /></button>
            </div>
          ))}
          {items.length === 0 && <p className="rounded-xl bg-surface-2 p-4 text-center text-sm text-muted-foreground">Nothing left — retake the photo.</p>}
        </div>

        {items.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {([["calories", totals.calories], ["protein", totals.proteinG], ["carbs", totals.carbsG], ["fat", totals.fatG]] as const).map(([metric, v]) => {
              const M = METRICS[metric];
              return (
                <div key={metric} className={cn("flex flex-col items-center gap-1 rounded-xl p-2.5", toneSoft[M.tone])}>
                  <M.icon className="size-4" />
                  <div className="numeral text-lg font-semibold leading-none">{metric === "calories" ? kcalToDisplay(v, units).toLocaleString() : Math.round(v)}</div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="ghost" onClick={onRetake}><Camera /> Retake</Button>
          <Button size="lg" className="flex-1" disabled={busy || items.length === 0} onClick={() => void confirm()}>{busy ? "Logging…" : `Log ${items.length} item${items.length === 1 ? "" : "s"}`}</Button>
        </div>
      </div>
    </Sheet>
  );
}
