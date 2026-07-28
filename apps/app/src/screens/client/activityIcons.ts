/**
 * Per-activity glyphs for the logger + feed. A category icon by default, with a
 * few key overrides (cycling → bike, jump-rope/HIIT → zap). Keeps the domain
 * catalog pure (no React) while giving each sport a recognizable face.
 */

import { Footprints, Bike, Dumbbell, Trophy, Waves, HeartPulse, Zap, Snowflake, Activity, type LucideIcon } from "@kova/ui";
import { activityByKey, type ActivityCategory } from "@kova/domain";

const CATEGORY_ICON: Record<ActivityCategory, LucideIcon> = {
  cardio: Footprints,
  strength: Dumbbell,
  sport: Trophy,
  water: Waves,
  studio: HeartPulse,
  combat: Zap,
  winter: Snowflake,
  other: Activity,
};

const KEY_ICON: Record<string, LucideIcon> = {
  cycling: Bike,
  spinning: Bike,
  running: Footprints,
  jogging: Footprints,
  jump_rope: Zap,
  hiit: Zap,
  burpees: Zap,
};

export function activityIcon(key: string | null | undefined): LucideIcon {
  if (key && KEY_ICON[key]) return KEY_ICON[key]!;
  return CATEGORY_ICON[activityByKey(key ?? "other").category] ?? Activity;
}
