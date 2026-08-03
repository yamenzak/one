/**
 * Plan-lane switcher — a client (or coach viewing them) flips which LANE they
 * are on right now: "Work week" vs "Off week", "Night shift" vs "Morning
 * shift". Hidden until the client actually has a second lane, so the default
 * single-plan experience is untouched. The null lane shows as "Main".
 *
 * It said "Schedule", which is the word this product already uses for a
 * CALENDAR — a booked session has a schedule, and so does a supplement. A lane
 * is not a calendar: it is a parallel version of the plan, and only one of them
 * is live at a time. Every layer under this already called it a lane; only the
 * label did not.
 *
 * `kind` is required because lanes are per surface — switching the workout lane
 * must not move the client's meals.
 */

import { useState } from "react";
import { Chip, ArrowLeftRight } from "@4dl/ui";
import { api } from "../../api.js";

export interface Lane { id: string; label: string; archived: boolean }

export function LaneSwitcher({
  clientId,
  kind,
  variants,
  currentVariantId,
  defaultLabel = "Main",
  onSwitched,
}: {
  clientId: string;
  /** Which surface's lanes these are. */
  kind: "workout" | "meal";
  variants: Lane[];
  currentVariantId: string | null;
  defaultLabel?: string;
  onSwitched: (variantId: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const lanes = variants.filter((v) => !v.archived);
  if (lanes.length === 0) return null; // no second lane → nothing to switch

  const options: { id: string | null; label: string }[] = [{ id: null, label: defaultLabel }, ...lanes.map((l) => ({ id: l.id, label: l.label }))];

  const pick = async (id: string | null) => {
    if (busy || id === (currentVariantId ?? null)) return;
    setBusy(true);
    try {
      await api.patch(`/api/clients/${clientId}/current-variant`, { variantId: id, kind });
      onSwitched(id);
    } catch {
      /* leave selection as-is on failure */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 px-1 text-micro uppercase text-muted-foreground">
        <ArrowLeftRight className="size-3.5" /> Lane
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 no-scrollbar">
        {options.map((o) => (
          <Chip key={o.id ?? "__main"} selected={(currentVariantId ?? null) === o.id} onClick={() => void pick(o.id)}>
            {o.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
