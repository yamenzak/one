/**
 * Smart food logging hub — the heart of food logging. Two modes:
 *
 *  · LOG mode (default): a landing screen of hero AI actions (snap / barcode /
 *    manual), a one-tap "recent / frequent" re-log rail, then search (local +
 *    Open Food Facts) with a portion-aware detail view.
 *  · PICK mode (`onPick`, meal-plan builder): the classic search list — choosing
 *    a row imports the food and returns its id, no logging, no AI rail.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { kcalToDisplay, scaleFood, servingsToQuantity, SERVING_PRESETS, type UnitPrefs } from "@mossa/domain";
import { Button, Field, Sheet, Chip, SegmentedControl, IconBadge, cn, toneSoft, METRICS, Search, Barcode, Camera, PencilLine, ChevronRight, Plus, X } from "@mossa/ui";
import { api, todayLocal, uploadMedia } from "../../api.js";
import { useSession } from "../../session.js";
import { useUnits } from "../../units.js";
import { FoodRow, normFood } from "../food.js";
import { AiAvatar } from "../../AiAvatar.js";
import { Markdown } from "../../Markdown.js";
import { AiAnalyzing } from "../../AiAnalyzing.js";
import { AiErrorBox } from "../../AiError.js";
import { BarcodeScanner } from "./BarcodeScanner.js";
import { FoodEditor, type EditableFood } from "./FoodEditor.js";

/** A food the vision model detected in a snapped meal (pre-log, reviewable). */
interface SnapEntry { label: string; mealType?: string; calories: number; proteinG: number; carbsG: number; fatG: number; quantity?: number | null; unit?: string | null }

/** A previously-logged food, ready to re-log at its last portion in one tap. */
interface Recent {
  food_id: string | null; label: string; unit: string | null; quantity: number | null;
  calories: number; protein_g: number; carbs_g: number; fat_g: number;
  image_url: string | null; serving_size: number | null; serving_unit: string | null; log_count: number;
}

/** A stable client-side id — for keying editable/removable rows without
 *  falling back to array indices (which shift when rows are deleted). */
const uid = (): string => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

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
  const resultsRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Monotonic search token — every fresh query bumps it; a response is applied
  // only if its token is still current, so out-of-order responses (a slow query
  // resolving after a newer one) never overwrite the latest results.
  const searchSeq = useRef(0);
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
  const [recents, setRecents] = useState<Recent[]>([]);
  const [recentTab, setRecentTab] = useState<"recent" | "frequent">("recent");
  const [aiBusy, setAiBusy] = useState(false);
  // In-flight guard for the log/re-log POST — food logs are append-only rows, so
  // a double-tap would create duplicate diary entries and double-count macros.
  const [logging, setLogging] = useState(false);
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
  // Web providers (keyless OFF/wger) fold into the same list when the plan
  // allows — no toggle. A logger doesn't care if a food is ours or the web's.
  const webEnabled = !!ctx?.entitlements?.features?.externalSearch;
  const hasQuery = q.trim().length > 0;

  const searchExternal = useCallback(async (page = 1) => {
    if (q.trim().length < 2) return;
    const seq = searchSeq.current;
    setSearching(true);
    try {
      const res = (await api.get<{ foods: Food[] }>(`/api/foods/search-external?q=${encodeURIComponent(q)}&page=${page}`)).foods;
      if (seq !== searchSeq.current) return; // a newer query superseded this one
      setExternal((prev) => {
        if (page === 1) return res;
        const seen = new Set(prev.map((f) => `${f.source}:${f.sourceId ?? f.name}`));
        return [...prev, ...res.filter((f) => !seen.has(`${f.source}:${f.sourceId ?? f.name}`))];
      });
      setExtPage(page);
      setExtMore(res.length >= 10);
    } finally { if (seq === searchSeq.current) setSearching(false); }
  }, [q]);

  const search = useCallback(async () => {
    if (q.trim().length < 2) { searchSeq.current++; setLocal([]); setExternal([]); setExtPage(0); return; }
    const seq = ++searchSeq.current;
    const foods = (await api.get<{ foods: Food[] }>(`/api/foods?q=${encodeURIComponent(q)}`)).foods;
    if (seq !== searchSeq.current) return; // a newer query started while this was in flight
    setLocal(foods);
    setExternal([]); setExtPage(0); setExtMore(false);
    if (webEnabled) void searchExternal(1);
  }, [q, webEnabled, searchExternal]);
  useEffect(() => { const t = setTimeout(() => void search(), 300); return () => clearTimeout(t); }, [search]);
  // Infinite scroll: when the sentinel at the bottom of the results list scrolls
  // into view, pull the next page of web results (the button below still works
  // as a manual/no-IntersectionObserver fallback).
  useEffect(() => {
    if (!extMore || searching || extPage < 1) return;
    const root = resultsRef.current, target = sentinelRef.current;
    if (!root || !target || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) void searchExternal(extPage + 1); }, { root, rootMargin: "160px" });
    io.observe(target);
    return () => io.disconnect();
  }, [extMore, searching, extPage, searchExternal]);
  // "Snap a meal" entry point — open the camera picker as soon as the sheet mounts.
  useEffect(() => { if (autoCamera) snapInputRef.current?.click(); }, [autoCamera]);
  // Recents rail — log mode only. A quiet failure just hides the rail.
  useEffect(() => {
    if (onPick || !clientId) return;
    let alive = true;
    api.get<{ recents: Recent[] }>(`/api/foods/recent?clientId=${clientId}`).then((r) => { if (alive) setRecents(r.recents ?? []); }).catch(() => {});
    return () => { alive = false; };
  }, [onPick, clientId]);

  const matchesFilter = (f: Food) => filter === "all" || (filter === "branded" ? !!f.brand : !f.brand);
  const localFiltered = local.filter(matchesFilter);
  const extFiltered = external.filter(matchesFilter);
  const recentList = recentTab === "frequent" ? [...recents].sort((a, b) => b.log_count - a.log_count) : recents;

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
    if (!selected || logging) return;
    setLogging(true);
    try {
      const foodId = await importFood(selected);
      const n = norm(selected);
      const factor = Number(quantity) / n.servingSize;
      await api.post("/api/logs/food", { clientId, data: { date: todayLocal(), mealType: meal, foodId: foodId ?? null, label: selected.name, quantity: Number(quantity), unit: n.servingUnit, calories: Math.round(n.calories * factor), proteinG: Math.round(n.proteinG * factor), carbsG: Math.round(n.carbsG * factor), fatG: Math.round(n.fatG * factor) } });
      onLogged?.(); onClose();
    } finally { setLogging(false); }
  };

  /** One-tap re-log: log a recent food at the exact portion it was last logged,
   *  under the currently-selected meal. The single biggest logging speed win. */
  const relog = async (r: Recent) => {
    if (logging) return;
    setLogging(true);
    try {
      await api.post("/api/logs/food", { clientId, data: { date: todayLocal(), mealType: meal, foodId: r.food_id ?? null, label: r.label, quantity: r.quantity, unit: r.unit, calories: r.calories, proteinG: r.protein_g, carbsG: r.carbs_g, fatG: r.fat_g } });
      onLogged?.(); onClose();
    } finally { setLogging(false); }
  };

  const snapMeal = async (photo: File) => {
    setAiBusy(true); setAiError(null); setSnapErr(null);
    try {
      // Client-owned media — route through uploadMedia so the 401 hook + error
      // surfacing fire (instead of a bare fetch that silently no-ops).
      const key = await uploadMedia(photo, "meal-snap", photo.name, clientId);
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

  const openManual = (initial: Partial<EditableFood> = {}) => { setAiError(null); setSnapErr(null); setEditorAutoScan(false); setEditor(initial); };

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
    const qtyNum = Number(quantity || "0");
    const factor = qtyNum / n.servingSize;
    const scaled = scaleFood({ servingSize: n.servingSize, calories: n.calories, proteinG: n.proteinG, carbsG: n.carbsG, fatG: n.fatG }, qtyNum);
    const scaledFor: Record<"calories" | "protein" | "carbs" | "fat", number> = { calories: scaled.calories, protein: scaled.proteinG, carbs: scaled.carbsG, fat: scaled.fatG };
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
          {/* Portion — quick serving multipliers + an exact amount, live-scaled. */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap gap-2">
              {SERVING_PRESETS.map((s) => {
                const qv = servingsToQuantity(n.servingSize, s);
                return <Chip key={s} selected={Math.abs(qtyNum - qv) < 0.05} onClick={() => setQuantity(String(qv))}>{s}×</Chip>;
              })}
            </div>
            <Field label={`Amount (${n.servingUnit})`} inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"))} />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(["calories", "protein", "carbs", "fat"] as const).map((metric) => {
              const M = METRICS[metric];
              const v = scaledFor[metric];
              return (
                <div key={metric} className={cn("flex flex-col items-center gap-1 rounded-xl p-2.5", toneSoft[M.tone])}>
                  <M.icon className="size-4" />
                  <div className="numeral text-lg font-semibold leading-none">{metric === "calories" ? kcalToDisplay(v, units).toLocaleString() : Math.round(v)}</div>
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
          <div className="flex gap-3"><Button variant="ghost" onClick={() => setSelected(null)}>Back</Button><Button size="lg" className="flex-1" disabled={logging} onClick={() => void log()}>{logging ? "Logging…" : "Log it"}</Button></div>
        </div>
      </Sheet>
    );
  }

  const results = (
    <div ref={resultsRef} className="max-h-80 space-y-1 overflow-y-auto">
      {localFiltered.map((f) => <FoodResult key={f.id} food={f} onPick={() => rowClick(f)} />)}
      {extFiltered.map((f, i) => <FoodResult key={`ext-${i}`} food={f} onPick={() => rowClick(f)} />)}
      {searching && external.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Searching…</p>}
      {hasQuery && q.trim().length >= 2 && !searching && localFiltered.length === 0 && extFiltered.length === 0 && (
        <div className="space-y-1">
          {/* Signpost inline creation when nothing matches. */}
          <button onClick={() => openManual({ name: q.trim() })} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-secondary">
            <IconBadge icon={Plus} tone="primary" size="sm" />
            <span className="min-w-0"><span className="block truncate font-medium">Create “{q.trim()}”</span><span className="block text-xs text-muted-foreground">Add it as a new food</span></span>
          </button>
          {!onPick && <p className="px-2 pt-0.5 text-xs text-muted-foreground">Or scan a barcode or snap a photo above.</p>}
        </div>
      )}
      {extPage > 0 && extMore && (
        <>
          <div ref={sentinelRef} aria-hidden className="h-px" />
          <Button variant="ghost" className="w-full" disabled={searching} onClick={() => void searchExternal(extPage + 1)}>{searching ? "Loading…" : "Load more results"}</Button>
        </>
      )}
    </div>
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title="Add food"
      titleAction={
        // Pick mode keeps the compact header actions (no snap-a-meal); log mode
        // promotes them to the hero tiles below.
        onPick ? (
          <div className="flex items-center gap-1.5">
            <button onClick={() => setScanOpen(true)} className="grid size-9 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-surface-3 [&_svg]:size-[1.15rem]" aria-label="Scan barcode"><Barcode /></button>
            <button onClick={() => openManual()} className="grid size-9 place-items-center rounded-full bg-secondary text-foreground transition-colors hover:bg-surface-3 [&_svg]:size-[1.15rem]" aria-label="Add manually"><PencilLine /></button>
          </div>
        ) : undefined
      }
    >
      {/* Single hidden snap input — shared by the hero tile, the search toolbar,
          the retake action, and autoCamera (log mode only). */}
      {!onPick && (
        <input ref={snapInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && void snapMeal(e.target.files[0])} />
      )}

      <div className="space-y-4">
        {/* LANDING (log mode, empty query): hero AI actions + recents rail. */}
        {!onPick && !hasQuery && (
          <>
            <div className="space-y-2.5">
              {/* Snap a meal — the premium hero (gated the same as before: log mode). */}
              <button onClick={() => snapInputRef.current?.click()} className="group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl bg-primary p-4 text-left text-primary-foreground shadow-sm transition-transform active:scale-[0.99]">
                <span aria-hidden className="pointer-events-none absolute -right-6 -top-10 size-32 rounded-full bg-white/20 blur-2xl" />
                <span className="relative grid size-12 shrink-0 place-items-center rounded-2xl bg-white/20 [&_svg]:size-6"><Camera /></span>
                <span className="relative min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-semibold"><AiAvatar className="size-4" /> Snap a meal</span>
                  <span className="mt-0.5 block text-sm text-primary-foreground/80">Photo → macros in seconds</span>
                </span>
                <ChevronRight className="relative size-5 shrink-0 opacity-80" />
              </button>
              <div className="grid grid-cols-2 gap-2.5">
                <button onClick={() => setScanOpen(true)} className="flex items-center gap-3 rounded-2xl bg-card p-3 text-left transition-colors hover:bg-secondary">
                  <IconBadge icon={Barcode} tone="nutrition" size="sm" />
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">Scan barcode</span><span className="block truncate text-xs text-muted-foreground">Packaged food</span></span>
                </button>
                <button onClick={() => openManual()} className="flex items-center gap-3 rounded-2xl bg-card p-3 text-left transition-colors hover:bg-secondary">
                  <IconBadge icon={PencilLine} tone="neutral" size="sm" />
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">Add manually</span><span className="block truncate text-xs text-muted-foreground">Custom entry</span></span>
                </button>
              </div>
            </div>

            {recents.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{recentTab === "frequent" ? "Most logged" : "Recent"}</h3>
                  <SegmentedControl
                    options={[{ value: "recent", label: "Recent" }, { value: "frequent", label: "Frequent" }]}
                    value={recentTab}
                    onChange={setRecentTab}
                  />
                </div>
                <div className="space-y-1">
                  {recentList.map((r) => (
                    <button key={`${r.food_id ?? r.label}`} disabled={logging} onClick={() => void relog(r)} className="block w-full rounded-xl px-2 py-2 text-left transition-colors hover:bg-secondary disabled:opacity-60">
                      <FoodRow
                        {...normFood(r)}
                        sub={r.quantity ? `${Math.round(r.quantity)} ${r.unit ?? "g"}` : undefined}
                        thumbSize={44}
                        trailing={<span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary [&_svg]:size-4"><Plus /></span>}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="space-y-3">
          <Field label="Search foods" icon={Search} value={q} onChange={(e) => setQ(e.target.value)} autoFocus={!!onPick} />
          {/* Compact action toolbar while searching (log mode) — keeps snap /
              scan / manual one tap away, and snap still passes the query as a hint. */}
          {!onPick && hasQuery && (
            <div className="flex gap-2">
              <button onClick={() => snapInputRef.current?.click()} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-secondary py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-3 [&_svg]:size-4"><Camera /> Snap</button>
              <button onClick={() => setScanOpen(true)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-secondary py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-3 [&_svg]:size-4"><Barcode /> Scan</button>
              <button onClick={() => openManual()} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-secondary py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-3 [&_svg]:size-4"><PencilLine /> Manual</button>
            </div>
          )}
          <SegmentedControl
            options={[{ value: "all", label: "All" }, { value: "whole", label: "Whole" }, { value: "branded", label: "Branded" }]}
            value={filter}
            onChange={setFilter}
          />
          {snapErr != null && <AiErrorBox error={snapErr} />}
          {aiError && <p className="text-sm text-warning">{aiError}</p>}
          {results}
        </div>
      </div>

      {scanOpen && <BarcodeScanner onDetected={(code) => void lookupBarcode(code)} onClose={() => setScanOpen(false)} />}
      {editor && (
        <FoodEditor
          initial={editor}
          isStaff={isStaff}
          autoScanLabel={editorAutoScan}
          onClose={() => { setEditor(null); setEditorAutoScan(false); }}
          onSaved={(food) => { setEditor(null); setEditorAutoScan(false); if (onPick) void pickFood(food as Food); else setSelected(food as Food); }}
        />
      )}
    </Sheet>
  );
}

function FoodResult({ food, onPick }: { food: Food; onPick: () => void }) {
  return (
    <button onClick={onPick} className="block w-full rounded-xl px-2 py-2 text-left transition-colors hover:bg-secondary">
      <FoodRow {...normFood(food)} thumbSize={44} />
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
  // Each row carries a stable `_key` so removing one doesn't rekey the rest.
  const [items, setItems] = useState<(SnapEntry & { _key: string })[]>(() => entries.map((e) => ({ ...e, _key: uid() })));
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
              <div className="text-xs font-semibold uppercase tracking-wide text-primary">AI read</div>
              <Markdown className="mt-0.5 text-sm">{note}</Markdown>
            </div>
          </div>
        )}

        <div>
          <div className="mb-1.5 text-sm text-muted-foreground">Meal</div>
          <div className="flex flex-wrap gap-2">{MEALS.map((m) => <Chip key={m} selected={meal === m} onClick={() => setMeal(m)}>{mealLabel(m)}</Chip>)}</div>
        </div>

        <div className="space-y-1.5">
          {items.map((e) => (
            <div key={e._key} className="rounded-xl bg-surface-2 px-3 py-2.5">
              <FoodRow
                {...normFood(e)}
                sub={e.quantity ? `${Math.round(e.quantity)} ${e.unit ?? "g"}` : undefined}
                trailing={<button onClick={() => setItems((xs) => xs.filter((x) => x._key !== e._key))} className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-danger [&_svg]:size-4" aria-label={`Remove ${e.label}`}><X /></button>}
              />
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
