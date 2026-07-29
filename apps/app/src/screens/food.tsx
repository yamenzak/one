/**
 * Shared food UI bits — the nutrition-side analog of exercise.tsx. One thumbnail,
 * one macro split bar, one normalizer, and one canonical FoodRow so a food reads
 * identically everywhere it appears: the diary, search, the meal plan, the
 * library, the builder, and plan history. Update the look here → it updates
 * app-wide (DESIGN.md metric-coding; SPEC §7 nutrition).
 *
 * Foods reach the UI in two casings — snake_case from the DB/log routes and
 * camelCase from the protocol/external providers. `normFood()` folds both into a
 * single display shape so every call site can hand the row whatever it has.
 */

import type { ReactNode } from "react";
import { fmtEnergy } from "@kova/domain";
import { MacroInline, cn, Utensils } from "@kova/ui";
import { useUnits } from "../units.js";

/** The canonical, casing-agnostic shape a food row renders from. */
export interface FoodDisplay {
  name: string;
  brand?: string | null;
  image?: string | null;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Anything foodish the UI receives — both casings, all fields optional. Any
 *  DB row, log entry, protocol option, or external hit structurally fits. */
export interface FoodInput {
  name?: string | null; label?: string | null; brand?: string | null; description?: string | null;
  image?: string | null; image_url?: string | null; imageUrl?: string | null;
  calories?: number | null;
  proteinG?: number | null; protein_g?: number | null;
  carbsG?: number | null; carbs_g?: number | null;
  fatG?: number | null; fat_g?: number | null;
}

/** Fold a snake_case (DB/log) or camelCase (protocol/external) food into the
 *  display shape. Safe to spread straight into <FoodRow {...normFood(f)} />. */
export function normFood(f: FoodInput): FoodDisplay {
  return {
    name: f.name || f.label || "Food",
    brand: f.brand ?? f.description ?? null,
    image: f.image ?? f.image_url ?? f.imageUrl ?? null,
    calories: f.calories ?? 0,
    proteinG: f.proteinG ?? f.protein_g ?? 0,
    carbsG: f.carbsG ?? f.carbs_g ?? 0,
    fatG: f.fatG ?? f.fat_g ?? 0,
  };
}

/** Square food thumbnail — the food's photo, else a nutrition-tinted glyph.
 *  One look for every food image in the app. */
export function FoodThumb({ src, size = 44, className = "" }: { src?: string | null; size?: number; className?: string }) {
  return (
    <div className={cn("grid shrink-0 place-items-center overflow-hidden rounded-lg bg-nutrition-soft text-nutrition", className)} style={{ width: size, height: size }}>
      {src ? <img src={src} alt="" className="size-full object-contain" /> : <Utensils className="size-1/2" />}
    </div>
  );
}

/** Thin proportional protein/carbs/fat bar — the macro split at a glance. */
export function MacroSplitBar({ proteinG, carbsG, fatG, className = "" }: { proteinG: number; carbsG: number; fatG: number; className?: string }) {
  const total = proteinG + carbsG + fatG || 1;
  return (
    <div className={cn("flex h-1.5 overflow-hidden rounded-full bg-surface-3", className)}>
      <span className="bg-protein" style={{ width: `${(proteinG / total) * 100}%` }} />
      <span className="bg-carbs" style={{ width: `${(carbsG / total) * 100}%` }} />
      <span className="bg-fat" style={{ width: `${(fatG / total) * 100}%` }} />
    </div>
  );
}

/**
 * The canonical food row: thumbnail, name, a sub-line (brand by default, or an
 * override like "120 g" / a meal label), and a right-hand energy + macros
 * column. The tappable content is thumb+text; `trailing` hangs actions/badges
 * off the end. Wrap it in whatever container the surface uses (SubCard, Card,
 * a bare list) — the row itself is the shared, unified part.
 */
export function FoodRow({
  name, brand, image, calories, proteinG, carbsG, fatG,
  sub, trailing, energy = true, macros = true, thumbSize = 44, onClick, className,
}: Partial<FoodDisplay> & {
  name: string;
  /** Overrides the brand sub-line (e.g. a quantity or meal label). */
  sub?: ReactNode;
  /** Actions/badges pinned to the far right (Log, remove, edit, day steppers…). */
  trailing?: ReactNode;
  energy?: boolean;
  macros?: boolean;
  thumbSize?: number;
  onClick?: () => void;
  className?: string;
}) {
  const units = useUnits();
  const subtitle = sub ?? (brand || null);
  /*
    MACROS GO UNDER THE NAME, NOT BESIDE IT.

    They used to sit in the trailing column, which is `shrink-0` — so on a phone
    the three macro chips plus the calorie figure claimed ~110px of a ~330px row
    and every real food name truncated: "Greek yoghurt, berri…", "Chicken, rice
    & broc…", "Salmon, sweet potat…". Every one of them. A diary whose entries
    cannot be read is not a diary, and the fix is free — the second line was
    already there carrying the quantity, and macros belong with it.
  */
  const showMacros = macros && (proteinG != null || carbsG != null || fatG != null);
  /*
    When the row already has a trailing control — a "+" in the quick-add sheet,
    a stepper, a remove — the calorie figure is the SECOND thing competing with
    the name for the same edge, and the name loses again: "Salmon, sweet potato
    & …". So it moves down to the detail line with the macros, and the trailing
    column keeps exactly one thing.
  */
  const energyInline = energy && calories != null && trailing != null;
  const Body = (
    <>
      <FoodThumb src={image} size={thumbSize} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{name}</div>
        <div className="flex min-w-0 items-center gap-2 truncate text-sm text-muted-foreground">
          {subtitle != null && <span className="shrink-0">{subtitle}</span>}
          {energyInline && <span className="numeral shrink-0 font-semibold text-calories">{fmtEnergy(calories!, units)}</span>}
          {showMacros && <MacroInline proteinG={proteinG ?? 0} carbsG={carbsG ?? 0} fatG={fatG ?? 0} className="min-w-0 text-xs" />}
        </div>
      </div>
    </>
  );
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {onClick ? (
        <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left transition-opacity active:opacity-80">{Body}</button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{Body}</div>
      )}
      {energy && calories != null && !energyInline && (
        <div className="numeral shrink-0 text-sm font-semibold text-calories">{fmtEnergy(calories, units)}</div>
      )}
      {trailing}
    </div>
  );
}
