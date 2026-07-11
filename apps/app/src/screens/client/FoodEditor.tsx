/**
 * FoodEditor — create or edit a food, with photo, barcode, macros + micros and
 * a visibility toggle (staff). Shared by the client food search (manual add /
 * barcode-miss) and the trainer Library. Editing a platform-seed food forks a
 * tenant-owned copy on the server (copy-on-write), so the returned id may differ.
 */

import { useEffect, useState } from "react";
import { Button, Field, Sheet, Chip, cn, toneSoft, METRICS, Utensils, Barcode, Camera, ChevronDown, Sparkles } from "@mossa/ui";
import { api } from "../../api.js";
import { useSession } from "../../session.js";

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

const MICROS = [
  ["fiber", "Fiber", "g"], ["sugar", "Sugar", "g"], ["satFat", "Sat. fat", "g"], ["sodium", "Sodium", "mg"],
  ["cholesterol", "Cholesterol", "mg"], ["potassium", "Potassium", "mg"], ["calcium", "Calcium", "mg"], ["iron", "Iron", "mg"],
] as const;

type MicroKey = (typeof MICROS)[number][0];

function toForm(f?: EditableFood) {
  return {
    name: f?.name ?? "", brand: f?.brand ?? "", barcode: f?.barcode ?? "",
    serving: s(f?.serving_size ?? f?.servingSize) || "100", unit: f?.serving_unit ?? f?.servingUnit ?? "g",
    cal: s(f?.calories), p: s(pick(f?.protein_g, f?.proteinG)), c: s(pick(f?.carbs_g, f?.carbsG)), ft: s(pick(f?.fat_g, f?.fatG)),
    fiber: s(pick(f?.fiber_g, f?.fiberG)), sugar: s(pick(f?.sugar_g, f?.sugarG)), satFat: s(pick(f?.saturated_fat_g, f?.saturatedFatG)),
    sodium: s(pick(f?.sodium_mg, f?.sodiumMg)), cholesterol: s(pick(f?.cholesterol_mg, f?.cholesterolMg)),
    potassium: s(pick(f?.potassium_mg, f?.potassiumMg)), calcium: s(pick(f?.calcium_mg, f?.calciumMg)), iron: s(pick(f?.iron_mg, f?.ironMg)),
    image: (f?.image_url ?? f?.imageUrl ?? "") as string,
    visibility: (f?.visibility as "tenant" | "private" | undefined) ?? "tenant",
  };
}

export function FoodEditor({
  foodId, initial, isStaff, title, onClose, onSaved,
}: {
  foodId?: string;
  initial?: Partial<EditableFood>;
  isStaff?: boolean;
  title?: string;
  onClose: () => void;
  onSaved: (food: EditableFood) => void;
}) {
  const { ctx } = useSession();
  const aiSuite = !!ctx?.entitlements?.features?.aiSuite;
  const [f, setF] = useState(() => toForm(initial as EditableFood));
  const [loading, setLoading] = useState(!!foodId);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [showMicros, setShowMicros] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const dec = (v: string) => v.replace(/[^\d.]/g, "");

  // Label Reader (SPEC §6): photograph the nutrition panel → auto-fill fields.
  const scanLabel = async (file: File) => {
    setScanning(true); setScanErr(null);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("purpose", "label");
      const up = await fetch("/api/media/upload", { method: "POST", credentials: "include", body: fd });
      const { key } = (await up.json()) as { key?: string };
      if (!key) throw new Error("upload failed");
      const r = await api.post<{ food: Record<string, unknown> }>("/api/ai/label-reader", { imageKey: key });
      const g = r.food;
      const str = (v: unknown) => (v == null ? "" : String(v));
      setF((p) => ({
        ...p,
        name: p.name || str(g.name), brand: p.brand || str(g.brand),
        serving: g.servingSize != null ? str(g.servingSize) : p.serving, unit: str(g.servingUnit) || p.unit,
        cal: str(g.calories), p: str(g.proteinG), c: str(g.carbsG), ft: str(g.fatG),
        fiber: str(g.fiberG), sugar: str(g.sugarG), satFat: str(g.saturatedFatG), sodium: str(g.sodiumMg),
        cholesterol: str(g.cholesterolMg), potassium: str(g.potassiumMg), calcium: str(g.calciumMg), iron: str(g.ironMg),
        image: p.image || `/api/media/${key}`,
      }));
      setShowMicros(true);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      setScanErr(m.includes("insufficient") ? "Studio is out of AI credits." : "Couldn't read that label — enter it by hand.");
    } finally { setScanning(false); }
  };

  // Load the existing row when editing (so micros/brand/photo prefill).
  useEffect(() => {
    if (!foodId) return;
    let alive = true;
    void api.get<{ food: EditableFood }>(`/api/foods/${foodId}`).then((r) => { if (alive) { setF(toForm(r.food)); setLoading(false); } }).catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [foodId]);

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("purpose", "food");
      const up = await fetch("/api/media/upload", { method: "POST", credentials: "include", body: fd });
      const { key } = (await up.json()) as { key?: string };
      if (key) set("image", `/api/media/${key}`);
    } finally { setUploading(false); }
  };

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        name: f.name.trim(), brand: f.brand.trim() || null, barcode: f.barcode.trim() || null,
        imageUrl: f.image || null, servingSize: num(f.serving) || 100, servingUnit: f.unit.trim() || "g",
        calories: num(f.cal), proteinG: num(f.p), carbsG: num(f.c), fatG: num(f.ft),
        fiberG: num(f.fiber), sugarG: num(f.sugar), saturatedFatG: num(f.satFat), sodiumMg: num(f.sodium),
        cholesterolMg: num(f.cholesterol), potassiumMg: num(f.potassium), calciumMg: num(f.calcium), ironMg: num(f.iron),
        visibility: f.visibility, source: "custom" as const,
      };
      const res = foodId
        ? await api.patch<{ id: string }>(`/api/foods/${foodId}`, body)
        : await api.post<{ id: string }>("/api/foods", body);
      onSaved({ id: res.id, ...body });
    } finally { setBusy(false); }
  };

  return (
    <Sheet open onClose={onClose} title={title ?? (foodId ? "Edit food" : "Add a food")}>
      {loading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />
      ) : (
        <div className="space-y-4">
          {/* Photo */}
          <div className="flex items-center gap-3">
            <label className="grid size-16 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-2xl bg-surface-2 text-muted-foreground transition-colors hover:bg-surface-3">
              {uploading ? <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : f.image ? <img src={f.image} alt="" className="size-full object-cover" /> : <Camera className="size-5" />}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && void uploadPhoto(e.target.files[0])} />
            </label>
            <div className="min-w-0 flex-1 space-y-2">
              <Field label="Name" icon={Utensils} value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus />
            </div>
          </div>

          {/* Label Reader — photograph the nutrition panel to auto-fill. */}
          {aiSuite && (
            <div>
              <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-primary/15 px-3.5 text-sm font-medium text-primary transition-colors hover:bg-primary/25 [&_svg]:size-4">
                {scanning ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Sparkles />}
                {scanning ? "Reading label…" : "Scan nutrition label"}
                <input type="file" accept="image/*" capture="environment" className="hidden" disabled={scanning} onChange={(e) => e.target.files?.[0] && void scanLabel(e.target.files[0])} />
              </label>
              {scanErr && <p className="mt-1.5 text-sm text-warning">{scanErr}</p>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Brand" value={f.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Optional" />
            <Field label="Barcode" icon={Barcode} inputMode="numeric" value={f.barcode} onChange={(e) => set("barcode", dec(e.target.value))} placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Serving size" inputMode="decimal" value={f.serving} onChange={(e) => set("serving", dec(e.target.value))} />
            <Field label="Unit" value={f.unit} onChange={(e) => set("unit", e.target.value)} placeholder="g / ml / piece" />
          </div>

          <div className="text-xs text-muted-foreground">Per serving:</div>
          <div className="grid grid-cols-4 gap-2">
            {([["cal", "kcal", "calories"], ["p", "P", "protein"], ["c", "C", "carbs"], ["ft", "F", "fat"]] as const).map(([k, ph, metric]) => {
              const M = METRICS[metric];
              return (
                <label key={k} className={cn("flex flex-col items-center gap-1 rounded-xl p-2", toneSoft[M.tone])}>
                  <M.icon className="size-4" />
                  <input inputMode="decimal" value={f[k]} onChange={(e) => set(k, dec(e.target.value))} placeholder={ph} className="w-full bg-transparent text-center text-sm font-semibold outline-none placeholder:font-normal placeholder:opacity-60" />
                </label>
              );
            })}
          </div>

          {/* Micronutrients (collapsible) */}
          <button type="button" onClick={() => setShowMicros((v) => !v)} className="flex w-full items-center justify-between text-sm text-muted-foreground">
            More nutrients <ChevronDown className={cn("size-4 transition-transform", showMicros && "rotate-180")} />
          </button>
          {showMicros && (
            <div className="grid grid-cols-2 gap-3">
              {MICROS.map(([k, label, unit]) => (
                <Field key={k} label={`${label} (${unit})`} inputMode="decimal" value={f[k as MicroKey]} onChange={(e) => set(k as MicroKey, dec(e.target.value))} placeholder="0" />
              ))}
            </div>
          )}

          {/* Visibility (staff only) */}
          {isStaff && (
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">Who can use this food</div>
              <div className="flex gap-2">
                <Chip selected={f.visibility === "tenant"} onClick={() => set("visibility", "tenant")}>Shared with team</Chip>
                <Chip selected={f.visibility === "private"} onClick={() => set("visibility", "private")}>Only me</Chip>
              </div>
            </div>
          )}

          <Button size="lg" className="w-full" disabled={busy || uploading || f.name.trim().length < 2} onClick={() => void save()}>
            {busy ? "Saving…" : foodId ? "Save changes" : "Add food"}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
