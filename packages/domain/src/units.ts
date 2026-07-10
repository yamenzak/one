/**
 * Units (SPEC §3): store metric, convert at display time. Preferences live on
 * the client record / member profile.
 */

export type WeightUnit = "kg" | "lbs";
export type LengthUnit = "cm" | "in";
export type VolumeUnit = "ml" | "oz";

const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;
const ML_PER_OZ = 29.5735;

export const toKg = (value: number, unit: WeightUnit): number =>
  unit === "kg" ? value : value * KG_PER_LB;
export const fromKg = (kg: number, unit: WeightUnit): number =>
  unit === "kg" ? kg : kg / KG_PER_LB;

export const toCm = (value: number, unit: LengthUnit): number =>
  unit === "cm" ? value : value * CM_PER_IN;
export const fromCm = (cm: number, unit: LengthUnit): number =>
  unit === "cm" ? cm : cm / CM_PER_IN;

export const toMl = (value: number, unit: VolumeUnit): number =>
  unit === "ml" ? value : value * ML_PER_OZ;
export const fromMl = (ml: number, unit: VolumeUnit): number =>
  unit === "ml" ? ml : ml / ML_PER_OZ;

/** Display-rounding: weights to 0.1, lengths to 0.5 cm-equivalent, volumes whole. */
export const roundWeight = (v: number): number => Math.round(v * 10) / 10;
export const roundLength = (v: number): number => Math.round(v * 2) / 2;
export const roundVolume = (v: number): number => Math.round(v);
