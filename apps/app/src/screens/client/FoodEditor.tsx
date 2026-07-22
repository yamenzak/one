/**
 * FoodEditor — the unified create/edit food composer, used in the trainer
 * Library and inline in client food logging (manual add / barcode-miss). A
 * fixed-height, non-dismissible drawer with two steps:
 *
 *   choose  → name + four ways in: With AI (estimate) · Web/barcode · Scan
 *             label · Manual
 *   review  → photo, serving, macros + micros, visibility → Add / Update
 *
 * Editing (or a barcode-miss with autoScanLabel) jumps straight to review.
 * Editing a platform-seed food forks a tenant copy on the server.
 */

import { useEffect, useRef, useState } from "react";
import { kcalToDisplay, displayToKcal, energyLabel, featureEnabled, type UnitPrefs } from "@mossa/domain";
import { FixedDrawer, Button, Field, Chip, SegmentedControl, cn, toneSoft, METRICS, Utensils, Barcode, ChevronDown, Sparkles, Globe, PencilLine, ScanLine, Search, Plus, X, ArrowLeft } from "@mossa/ui";
import { api, uploadMedia } from "../../api.js";
import { useSession } from "../../session.js";
import { useUnits } from "../../units.js";
import { AiAnalyzing } from "../../AiAnalyzing.js";
import { AiImageField } from "../../AiImageField.js";
import { ModeRow, StepFade } from "../../composer.js";
import { BarcodeScanner } from "./BarcodeScanner.js";
import { FoodRow, normFood } from "../food.js";

export interface EditableFood {
  id?: string;
  name: string; brand?: string | null; barcode?: string | null; description?: string | null;
  serving_size?: number; servingSize?: number; serving_unit?: string; servingUnit?: string;
  calories: number; protein_g?: number; proteinG?: number; carbs_g?: number; carbsG?: number; fat_g?: number; fatG?: number;
  fiber_g?: number; fiberG?: number; sugar_g?: number; sugarG?: number; sodium_mg?: number; sodiumMg?: number;
  saturated_fat_g?: number; saturatedFatG?: number; cholesterol_mg?: number; cholesterolMg?: number;
  potassium_mg?: number; potassiumMg?: number; calcium_mg?: number; calciumMg?: number; iron_mg?: number; ironMg?: number;
  image_url?: string | null; imageUrl?: string | null; visibility?: string; source?: string; sourceId?: string;
}

const num = (v: string) => (v ? Number(v) : 0);
const s = (v: number | undefined) => (v ? String(v) : "");
const pick = (a: number | undefined, b: number | undefined) => a ?? b ?? undefined;
const pk = (a: number | undefined, b: number | undefined) => a ?? b ?? 0;

const MICROS = [
  ["fiber", "Fiber", "g"], ["sugar", "Sugar", "g"], ["satFat", "Sat. fat", "g"], ["sodium", "Sodium", "mg"],
  ["cholesterol", "Cholesterol", "mg"], ["potassium", "Potassium", "mg"], ["calcium", "Calcium", "mg"], ["iron", "Iron", "mg"],
] as const;
type MicroKey = (typeof MICROS)[number][0];

function toForm(f: EditableFood | undefined, units: UnitPrefs) {
  return {
    name: f?.name ?? "", brand: f?.brand ?? "", barcode: f?.barcode ?? "",
    serving: s(f?.serving_size ?? f?.servingSize) || "100", unit: f?.serving_unit ?? f?.servingUnit ?? "g",
    cal: f?.calories ? String(kcalToDisplay(f.calories, units)) : "", p: s(pick(f?.protein_g, f?.proteinG)), c: s(pick(f?.carbs_g, f?.carbsG)), ft: s(pick(f?.fat_g, f?.fatG)),
    fiber: s(pick(f?.fiber_g, f?.fiberG)), sugar: s(pick(f?.sugar_g, f?.sugarG)), satFat: s(pick(f?.saturated_fat_g, f?.saturatedFatG)),
    sodium: s(pick(f?.sodium_mg, f?.sodiumMg)), cholesterol: s(pick(f?.cholesterol_mg, f?.cholesterolMg)),
    potassium: s(pick(f?.potassium_mg, f?.potassiumMg)), calcium: s(pick(f?.calcium_mg, f?.calciumMg)), iron: s(pick(f?.iron_mg, f?.ironMg)),
    image: (f?.image_url ?? f?.imageUrl ?? "") as string,
    visibility: (f?.visibility as "tenant" | "private" | undefined) ?? "tenant",
  };
}

type FoodHit = EditableFood;

export function FoodEditor({ foodId, initial, isStaff, autoScanLabel, onClose, onSaved }: {
  foodId?: string;
  initial?: Partial<EditableFood>;
  isStaff?: boolean;
  /** Fire the nutrition-label scanner as soon as the drawer opens (barcode-miss). */
  autoScanLabel?: boolean;
  onClose: () => void;
  onSaved: (food: EditableFood) => void;
}) {
  const { ctx } = useSession();
  const units = useUnits();
  const features = ctx?.entitlements?.features;
  const aiSuite = !!features?.aiSuite; // the food-IMAGE tool is staff-only, entitlement-gated
  // The food TOOLS (macro estimate, label scan) are the aiMealTools feature —
  // for a client, the same aiSuite ⊕ package-flag gate /ai/parse-food & /ai/
  // snap-meal enforce; staff aren't limited by a client's package.
  const aiMealTools = !!features && featureEnabled("aiMealTools", { features, clientFlags: isStaff ? null : ctx?.clientFlags });
  const startReview = !!foodId || !!autoScanLabel;

  const [step, setStep] = useState<"choose" | "review">(startReview ? "review" : "choose");
  const [editId, setEditId] = useState<string | undefined>(foodId);
  const [f, setF] = useState(() => toForm(initial as EditableFood, units));
  const [loading, setLoading] = useState(!!foodId);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showMicros, setShowMicros] = useState(false);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const dec = (v: string) => v.replace(/[^\d.]/g, "");

  // Web/barcode — driven by the food-name field (no separate query box).
  const [webMode, setWebMode] = useState(false);
  const [webResults, setWebResults] = useState<FoodHit[] | null>(null);
  const [webBusy, setWebBusy] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  // Whole vs branded — brand-tagged rows are packaged/branded (Open Food Facts),
  // brandless are whole/generic (USDA & the rest). A client-side cut of the merge.
  const [foodFilter, setFoodFilter] = useState<"all" | "whole" | "branded">("all");
  // Scan a barcode straight into the barcode field (manual entry), no lookup.
  const [fieldScanOpen, setFieldScanOpen] = useState(false);
  useEffect(() => {
    if (!webMode) return;
    const q = f.name.trim();
    if (q.length < 2) { setWebResults(null); return; }
    const t = setTimeout(() => {
      setWebBusy(true);
      api.get<{ foods: FoodHit[] }>(`/api/foods/search-external?q=${encodeURIComponent(q)}`)
        .then((r) => setWebResults(r.foods)).catch(() => setWebResults([])).finally(() => setWebBusy(false));
    }, 350);
    return () => clearTimeout(t);
  }, [webMode, f.name]);

  // Label Reader — photograph the nutrition panel → auto-fill.
  const scanLabel = async (file: File) => {
    setScanning(true); setErr(null);
    try {
      const key = await uploadMedia(file, "label");
      const r = await api.post<{ food: Record<string, unknown> }>("/api/ai/label-reader", { imageKey: key });
      const g = r.food;
      const str = (v: unknown) => (v == null ? "" : String(v));
      setF((p) => ({
        ...p, name: p.name || str(g.name), brand: p.brand || str(g.brand),
        serving: g.servingSize != null ? str(g.servingSize) : p.serving, unit: str(g.servingUnit) || p.unit,
        cal: g.calories != null ? String(kcalToDisplay(Number(g.calories), units)) : "", p: str(g.proteinG), c: str(g.carbsG), ft: str(g.fatG),
        fiber: str(g.fiberG), sugar: str(g.sugarG), satFat: str(g.saturatedFatG), sodium: str(g.sodiumMg),
        cholesterol: str(g.cholesterolMg), potassium: str(g.potassiumMg), calcium: str(g.calciumMg), iron: str(g.ironMg),
        image: p.image || `/api/media/${key}`,
      }));
      setShowMicros(true); setStep("review");
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      setErr(m.includes("insufficient") || m.includes("credits") ? "Out of AI credits." : "Couldn't read that label — enter it by hand.");
    } finally { setScanning(false); }
  };

  // With AI — estimate the macros from the name.
  const estimateFromName = async () => {
    if (f.name.trim().length < 2) return;
    setAiBusy(true); setErr(null);
    try {
      const r = await api.post<{ food: Record<string, number | string> }>("/api/ai/food-meta", { name: f.name.trim() });
      const g = r.food;
      setF((p) => ({
        ...p, serving: String(g.servingSize ?? 100), unit: String(g.servingUnit ?? "g"),
        cal: g.calories != null ? String(kcalToDisplay(Number(g.calories), units)) : "", p: String(g.proteinG ?? ""), c: String(g.carbsG ?? ""), ft: String(g.fatG ?? ""),
        fiber: String(g.fiberG ?? ""), sugar: String(g.sugarG ?? ""), sodium: String(g.sodiumMg ?? ""),
      }));
      setStep("review");
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      setErr(m.includes("credits") ? "Out of AI credits." : "Couldn't estimate — enter it by hand.");
    } finally { setAiBusy(false); }
  };

  const importHit = async (hit: FoodHit) => {
    if (hit.id) return hit.id;
    return (await api.post<{ id: string }>("/api/foods/import", {
      name: hit.name, brand: hit.brand ?? null,
      servingSize: hit.serving_size ?? hit.servingSize ?? 100, servingUnit: hit.serving_unit ?? hit.servingUnit ?? "g",
      calories: hit.calories, proteinG: pk(hit.protein_g, hit.proteinG), carbsG: pk(hit.carbs_g, hit.carbsG), fatG: pk(hit.fat_g, hit.fatG),
      fiberG: pk(hit.fiber_g, hit.fiberG), sugarG: pk(hit.sugar_g, hit.sugarG), sodiumMg: pk(hit.sodium_mg, hit.sodiumMg),
      imageUrl: hit.image_url ?? hit.imageUrl ?? null, source: hit.source ?? "openfoodfacts", sourceId: hit.sourceId ?? hit.name, barcode: hit.barcode ?? null,
    })).id;
  };

  const pickWeb = async (hit: FoodHit) => {
    setErr(null);
    try { const id = await importHit(hit); setEditId(id); setF(toForm(hit, units)); setStep("review"); }
    catch (e) { setErr(e instanceof Error && e.message.includes("externalSearch") ? "Web search isn't on your plan." : "Couldn't import that."); }
  };

  const lookupBarcode = async (code: string) => {
    setScanOpen(false);
    let r = await api.get<{ food: FoodHit | null }>(`/api/foods/barcode?code=${code}`);
    if (!r.food) r = await api.get<{ food: FoodHit | null }>(`/api/foods/barcode-external?code=${code}`);
    if (r.food) { setEditId(r.food.id); setF(toForm(r.food, units)); setStep("review"); }
    else { setF((p) => ({ ...p, barcode: code })); setStep("review"); }
  };

  useEffect(() => { if (autoScanLabel && aiMealTools && !foodId) labelInputRef.current?.click(); }, [autoScanLabel, aiMealTools, foodId]);
  useEffect(() => {
    if (!foodId) return;
    let alive = true;
    void api.get<{ food: EditableFood }>(`/api/foods/${foodId}`).then((r) => { if (alive) { setF(toForm(r.food, units)); setLoading(false); } }).catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [foodId]);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const body = {
        name: f.name.trim(), brand: f.brand.trim() || null, barcode: f.barcode.trim() || null,
        imageUrl: f.image || null, servingSize: num(f.serving) || 100, servingUnit: f.unit.trim() || "g",
        calories: Math.round(displayToKcal(num(f.cal), units)), proteinG: num(f.p), carbsG: num(f.c), fatG: num(f.ft),
        fiberG: num(f.fiber), sugarG: num(f.sugar), saturatedFatG: num(f.satFat), sodiumMg: num(f.sodium),
        cholesterolMg: num(f.cholesterol), potassiumMg: num(f.potassium), calciumMg: num(f.calcium), ironMg: num(f.iron),
        visibility: f.visibility, source: "custom" as const,
      };
      const res = editId ? await api.patch<{ id: string }>(`/api/foods/${editId}`, body) : await api.post<{ id: string }>("/api/foods", body);
      onSaved({ id: res.id, ...body });
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save."); } finally { setBusy(false); }
  };

  const closeX = <button onClick={onClose} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground [&_svg]:size-[1.15rem]"><X /></button>;
  const title = scanning ? "Reading the label…" : step === "choose" ? "Add a food" : editId && foodId ? "Edit food" : "Review food";
  const footer = step === "review" && !scanning && !loading ? (
    <Button size="lg" className="w-full" disabled={busy || f.name.trim().length < 2} onClick={() => void save()}>{busy ? "Saving…" : editId ? "Save changes" : "Add food"}</Button>
  ) : null;

  return (
    <>
      <FixedDrawer open onClose={onClose} dismissible={false} title={title} headerAction={closeX} footer={footer}>
        {scanning ? (
          <AiAnalyzing label="Reading the label" sub="Pulling serving size and macros…" />
        ) : loading ? (
          <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />
        ) : (
          <StepFade stepKey={step}>
            {step === "choose" ? (
              <div className="space-y-4">
                <Field label="Food name" icon={Utensils} value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus placeholder="e.g. Greek yogurt" />
                {/* A single-column list of mode rows — stable regardless of how many
                    the entitlement unlocks (no 2×N grid reflow). The AI-powered
                    paths lead and are badged so they read as first-class. */}
                <div className="space-y-2">
                  {aiMealTools && <ModeRow icon={Sparkles} tone="primary" smart label="Estimate with AI" hint="Fill the macros from the name" busy={aiBusy} disabled={f.name.trim().length < 2} onClick={() => void estimateFromName()} />}
                  {aiMealTools && <ModeRow icon={ScanLine} tone="nutrition" smart label="Scan nutrition label" hint="Read the panel with your camera" onClick={() => labelInputRef.current?.click()} />}
                  <ModeRow icon={Globe} tone="cardio" label="Search web & barcode" hint="Find it in food databases" active={webMode} onClick={() => setWebMode((v) => !v)} />
                  <ModeRow icon={PencilLine} tone="neutral" label="Enter manually" hint="Type the values yourself" disabled={f.name.trim().length < 2} onClick={() => setStep("review")} />
                </div>
                <input ref={labelInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && void scanLabel(e.target.files[0])} />

                {webMode && (
                  <div className="space-y-2 rounded-2xl border border-border/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5"><Search /> <span className="truncate">Results for “{f.name.trim() || "…"}” from Open Food Facts…</span></div>
                      <button onClick={() => setScanOpen(true)} aria-label="Scan barcode" className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-foreground hover:bg-surface-3 [&_svg]:size-[1.1rem]"><Barcode /></button>
                    </div>
                    {webResults && webResults.length > 0 && (
                      <SegmentedControl
                        options={[{ value: "all", label: "All" }, { value: "whole", label: "Whole" }, { value: "branded", label: "Branded" }]}
                        value={foodFilter}
                        onChange={setFoodFilter}
                      />
                    )}
                    <div className="max-h-64 space-y-1 overflow-y-auto">
                      {f.name.trim().length < 2 && <p className="p-3 text-center text-sm text-muted-foreground">Type a food name above to search, or scan a barcode.</p>}
                      {webBusy && <p className="p-3 text-center text-sm text-muted-foreground">Searching…</p>}
                      {webResults?.filter((h) => foodFilter === "all" || (foodFilter === "branded" ? !!h.brand : !h.brand)).map((hit, i) => (
                        <div key={i} className="rounded-xl px-2 py-2 transition-colors hover:bg-secondary">
                          <FoodRow
                            {...normFood(hit)}
                            macros={false}
                            thumbSize={40}
                            onClick={() => void pickWeb(hit)}
                            trailing={<Plus className="size-4 shrink-0 text-primary" />}
                          />
                        </div>
                      ))}
                      {webResults && webResults.length === 0 && !webBusy && <p className="p-3 text-center text-sm text-muted-foreground">No results — try Scan label or Manual.</p>}
                      {webResults && webResults.length > 0 && !webResults.some((h) => foodFilter === "all" || (foodFilter === "branded" ? !!h.brand : !h.brand)) && <p className="p-3 text-center text-sm text-muted-foreground">No {foodFilter} foods here — try “All”.</p>}
                    </div>
                  </div>
                )}
                {err && <p className="text-sm text-warning">{err}</p>}
              </div>
            ) : (
              <div className="space-y-6">
                {!foodId && <button onClick={() => setStep("choose")} className="-mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground [&_svg]:size-4"><ArrowLeft /> Back</button>}

                {/* ── Basics ─────────────────────────────────────────────── */}
                <div className="space-y-3">
                  <Field label="Name" icon={Utensils} value={f.name} onChange={(e) => set("name", e.target.value)} />
                  <AiImageField value={f.image} onChange={(url) => set("image", url)} feature="food-image" subject={f.name} canAi={!!isStaff && aiSuite} label="Photo" />
                  {aiMealTools && (
                    <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-primary/15 px-3.5 text-sm font-medium text-primary transition-colors hover:bg-primary/25 [&_svg]:size-4">
                      <ScanLine /> Scan nutrition label
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && void scanLabel(e.target.files[0])} />
                    </label>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Brand" value={f.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Optional" />
                    <div className="flex items-end gap-2">
                      <Field className="flex-1" label="Barcode" icon={Barcode} inputMode="numeric" value={f.barcode} onChange={(e) => set("barcode", dec(e.target.value))} placeholder="Optional" />
                      <Button type="button" variant="secondary" size="icon" aria-label="Scan barcode into the field" onClick={() => setFieldScanOpen(true)}><Barcode /></Button>
                    </div>
                  </div>
                </div>

                {/* ── Nutrition (per serving) ────────────────────────────── */}
                <div className="space-y-3">
                  <div className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">Nutrition per serving</div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Serving size" inputMode="decimal" value={f.serving} onChange={(e) => set("serving", dec(e.target.value))} />
                    <Field label="Unit" value={f.unit} onChange={(e) => set("unit", e.target.value)} placeholder="g / ml / piece" />
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {([["cal", "calories", "Cal", energyLabel(units)], ["p", "protein", "Protein", "g"], ["c", "carbs", "Carbs", "g"], ["ft", "fat", "Fat", "g"]] as const).map(([k, metric, label, unit]) => {
                      const M = METRICS[metric];
                      return (
                        <label key={k} className={cn("flex flex-col gap-1.5 rounded-2xl p-2.5", toneSoft[M.tone])}>
                          <span className="flex items-center gap-1 text-[0.64rem] font-semibold leading-none [&_svg]:size-3"><M.icon /> <span className="truncate">{label}</span></span>
                          <span className="flex items-baseline gap-0.5 rounded-lg bg-background/70 px-1.5 py-1.5">
                            <input inputMode="decimal" value={f[k]} onChange={(e) => set(k, dec(e.target.value))} placeholder="0" className="w-full min-w-0 bg-transparent text-center text-[0.95rem] font-bold text-foreground outline-none placeholder:font-medium placeholder:text-muted-foreground/50" />
                            <span className="shrink-0 text-[0.58rem] font-medium text-muted-foreground">{unit}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  <button type="button" onClick={() => setShowMicros((v) => !v)} className="flex w-full items-center justify-between rounded-xl py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                    More nutrients <ChevronDown className={cn("size-4 transition-transform", showMicros && "rotate-180")} />
                  </button>
                  {showMicros && (
                    <div className="grid grid-cols-2 gap-3">
                      {MICROS.map(([k, label, unit]) => (
                        <Field key={k} label={`${label} (${unit})`} inputMode="decimal" value={f[k as MicroKey]} onChange={(e) => set(k as MicroKey, dec(e.target.value))} placeholder="0" />
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Sharing (staff only) ───────────────────────────────── */}
                {isStaff && (
                  <div className="space-y-2">
                    <div className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">Who can use this food</div>
                    <div className="flex gap-2">
                      <Chip selected={f.visibility === "tenant"} onClick={() => set("visibility", "tenant")}>Shared with team</Chip>
                      <Chip selected={f.visibility === "private"} onClick={() => set("visibility", "private")}>Only me</Chip>
                    </div>
                  </div>
                )}
                {err && <p className="text-sm text-warning">{err}</p>}
              </div>
            )}
          </StepFade>
        )}
      </FixedDrawer>
      {scanOpen && <BarcodeScanner onDetected={(code) => void lookupBarcode(code)} onClose={() => setScanOpen(false)} />}
      {fieldScanOpen && <BarcodeScanner onDetected={(code) => { set("barcode", code); setFieldScanOpen(false); }} onClose={() => setFieldScanOpen(false)} />}
    </>
  );
}
