/**
 * Units (SPEC §3) — store metric, convert at display time. Every user (client
 * OR trainer) keeps a personal, mix-and-match preference set (e.g. UK: height in
 * cm, weight in lb). Storage is always metric; these helpers convert for display
 * and parse inputs back to metric.
 */

export type WeightUnit = "kg" | "lb";
export type HeightUnit = "cm" | "ft_in";
export type LengthUnit = "cm" | "in"; // body measurements (waist, etc.)
export type VolumeUnit = "ml" | "oz";
export type DistanceUnit = "km" | "mi";
export type EnergyUnit = "kcal" | "kJ";

export interface UnitPrefs {
  weight: WeightUnit;
  height: HeightUnit;
  length: LengthUnit;
  volume: VolumeUnit;
  distance: DistanceUnit;
  energy: EnergyUnit;
}

export const DEFAULT_UNITS: UnitPrefs = {
  weight: "kg", height: "cm", length: "cm", volume: "ml", distance: "km", energy: "kcal",
};

/** Coerce a partial/unknown prefs object to a complete, valid UnitPrefs. */
export function resolveUnits(input: Partial<UnitPrefs> | null | undefined): UnitPrefs {
  const p = input ?? {};
  return {
    weight: p.weight === "lb" ? "lb" : "kg",
    height: p.height === "ft_in" ? "ft_in" : "cm",
    length: p.length === "in" ? "in" : "cm",
    volume: p.volume === "oz" ? "oz" : "ml",
    distance: p.distance === "mi" ? "mi" : "km",
    energy: p.energy === "kJ" ? "kJ" : "kcal",
  };
}

const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;
const ML_PER_OZ = 29.5735;
const KM_PER_MI = 1.609344;
const KJ_PER_KCAL = 4.184;

const r1 = (n: number): number => Math.round(n * 10) / 10;

// ── Raw conversions (internal + legacy callers) ─────────────────────────────
export const toKg = (value: number, unit: WeightUnit): number => (unit === "kg" ? value : value * KG_PER_LB);
export const fromKg = (kg: number, unit: WeightUnit): number => (unit === "kg" ? kg : kg / KG_PER_LB);
export const toCm = (value: number, unit: LengthUnit): number => (unit === "cm" ? value : value * CM_PER_IN);
export const fromCm = (cm: number, unit: LengthUnit): number => (unit === "cm" ? cm : cm / CM_PER_IN);
export const toMl = (value: number, unit: VolumeUnit): number => (unit === "ml" ? value : value * ML_PER_OZ);
export const fromMl = (ml: number, unit: VolumeUnit): number => (unit === "ml" ? ml : ml / ML_PER_OZ);

export const roundWeight = (v: number): number => Math.round(v * 10) / 10;
export const roundLength = (v: number): number => Math.round(v * 2) / 2;
export const roundVolume = (v: number): number => Math.round(v);

// ── Feet/inches ─────────────────────────────────────────────────────────────
export function cmToFeetInches(cm: number): { ft: number; in: number } {
  const totalIn = cm / CM_PER_IN;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round(totalIn - ft * 12);
  if (inch === 12) { ft += 1; inch = 0; }
  return { ft, in: inch };
}
export const feetInchesToCm = (ft: number, inch: number): number => (ft * 12 + inch) * CM_PER_IN;

// ── Unit labels ─────────────────────────────────────────────────────────────
export const weightLabel = (p: UnitPrefs): string => (p.weight === "lb" ? "lb" : "kg");
export const lengthLabel = (p: UnitPrefs): string => (p.length === "in" ? "in" : "cm");
export const volumeLabel = (p: UnitPrefs): string => (p.volume === "oz" ? "oz" : "ml");
export const distanceLabel = (p: UnitPrefs): string => (p.distance === "mi" ? "mi" : "km");
export const energyLabel = (p: UnitPrefs): string => (p.energy === "kJ" ? "kJ" : "kcal");

// ── Metric value → display number (for prefilling number inputs) ────────────
export const kgToDisplay = (kg: number, p: UnitPrefs): number => r1(p.weight === "lb" ? kg / KG_PER_LB : kg);
export const cmToLengthDisplay = (cm: number, p: UnitPrefs): number => r1(p.length === "in" ? cm / CM_PER_IN : cm);
export const mlToVolumeDisplay = (ml: number, p: UnitPrefs): number => Math.round(p.volume === "oz" ? ml / ML_PER_OZ : ml);

// ── Display number (in the user's unit) → metric (for storing inputs) ───────
export const displayToKg = (value: number, p: UnitPrefs): number => (p.weight === "lb" ? value * KG_PER_LB : value);
export const lengthDisplayToCm = (value: number, p: UnitPrefs): number => (p.length === "in" ? value * CM_PER_IN : value);
export const volumeDisplayToMl = (value: number, p: UnitPrefs): number => (p.volume === "oz" ? value * ML_PER_OZ : value);

// ── Formatters (metric value → "72.5 kg" / "5'11\"" / "16.9 oz") ────────────
export function fmtWeight(kg: number | null | undefined, p: UnitPrefs, withUnit = true): string {
  if (kg == null) return "—";
  const v = p.weight === "lb" ? kg / KG_PER_LB : kg;
  return `${r1(v)}${withUnit ? ` ${weightLabel(p)}` : ""}`;
}

export function fmtHeight(cm: number | null | undefined, p: UnitPrefs): string {
  if (cm == null) return "—";
  if (p.height === "ft_in") { const { ft, in: i } = cmToFeetInches(cm); return `${ft}'${i}"`; }
  return `${Math.round(cm)} cm`;
}

export function fmtLength(cm: number | null | undefined, p: UnitPrefs, withUnit = true): string {
  if (cm == null) return "—";
  const v = p.length === "in" ? cm / CM_PER_IN : cm;
  return `${r1(v)}${withUnit ? ` ${lengthLabel(p)}` : ""}`;
}

export function fmtVolume(ml: number | null | undefined, p: UnitPrefs): string {
  if (ml == null) return "—";
  if (p.volume === "oz") return `${Math.round(ml / ML_PER_OZ)} oz`;
  return ml >= 1000 ? `${r1(ml / 1000)} L` : `${Math.round(ml)} ml`;
}

export function fmtDistance(meters: number | null | undefined, p: UnitPrefs): string {
  if (meters == null) return "—";
  const km = meters / 1000;
  return p.distance === "mi" ? `${r1(km / KM_PER_MI)} mi` : `${r1(km)} km`;
}

export function fmtEnergy(kcal: number | null | undefined, p: UnitPrefs, withUnit = true): string {
  if (kcal == null) return "—";
  const v = p.energy === "kJ" ? Math.round(kcal * KJ_PER_KCAL) : Math.round(kcal);
  return `${v.toLocaleString()}${withUnit ? ` ${energyLabel(p)}` : ""}`;
}

/** Convert a metric kcal value to the display number only (no unit/locale). */
export const kcalToDisplay = (kcal: number, p: UnitPrefs): number => (p.energy === "kJ" ? Math.round(kcal * KJ_PER_KCAL) : Math.round(kcal));
