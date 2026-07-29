/**
 * A compact, read-only strip of a client's saved preferences — dropped into the
 * planning surfaces (workout + meal builders) so the coach plans against what
 * the client actually asked for. `focus` leads with the relevant chips.
 */

import { useEffect, useState } from "react";
import {
  kgToDisplay, weightLabel,
  PRIMARY_GOAL_LABELS, ACTIVITY_LEVEL_LABELS, DIETARY_APPROACH_LABELS, WORKOUT_LOCATION_LABELS,
  type ClientPreferences,
} from "@kova/domain";
import { Card, Target, Dumbbell, Utensils, MapPin, type LucideIcon } from "@4dl/ui";
import { api } from "../../api.js";
import { useUnits } from "../../units.js";

export function ClientPrefsStrip({ clientId, focus, className }: { clientId: string; focus?: "workout" | "meal"; className?: string }) {
  const [prefs, setPrefs] = useState<ClientPreferences | null>(null);
  const units = useUnits();
  useEffect(() => {
    void api.get<{ client: { preferences: ClientPreferences } }>(`/api/clients/${clientId}`).then((r) => setPrefs(r.client.preferences ?? {})).catch(() => undefined);
  }, [clientId]);
  if (!prefs) return null;

  const chips: { icon?: LucideIcon; label: string }[] = [];
  if (prefs.primaryGoal) chips.push({ icon: Target, label: PRIMARY_GOAL_LABELS[prefs.primaryGoal] });
  if (focus !== "meal") {
    if (prefs.workoutsPerWeek != null) chips.push({ icon: Dumbbell, label: `${prefs.workoutsPerWeek}×/week` });
    if (prefs.workoutLocation) chips.push({ icon: MapPin, label: WORKOUT_LOCATION_LABELS[prefs.workoutLocation] });
  }
  if (focus !== "workout") {
    if (prefs.mealsPerDay != null) chips.push({ icon: Utensils, label: `${prefs.mealsPerDay} meals/day` });
    if (prefs.dietaryApproach) chips.push({ label: DIETARY_APPROACH_LABELS[prefs.dietaryApproach] });
  }
  if (prefs.activityLevel) chips.push({ label: ACTIVITY_LEVEL_LABELS[prefs.activityLevel] });
  if (prefs.targetWeightKg != null) chips.push({ label: `Target ${kgToDisplay(prefs.targetWeightKg, units)} ${weightLabel(units)}` });
  if (chips.length === 0 && !prefs.limitations) return null;

  return (
    <Card className={className ?? ""}>
      <div className="mb-2 flex items-center gap-1.5 text-micro uppercase text-muted-foreground"><Target className="size-3.5" /> Client prefers</div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((ch, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium [&_svg]:size-3">{ch.icon && <ch.icon />}{ch.label}</span>
        ))}
      </div>
      {prefs.limitations && <p className="mt-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">Limitations · </span>{prefs.limitations}</p>}
    </Card>
  );
}
