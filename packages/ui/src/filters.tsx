/**
 * FACETS — narrowing a collection, without spending the screen on it.
 *
 * A browsable collection grows facets: muscle group and equipment on an
 * exercise library, type and ownership on a food one. The obvious rendering is
 * a horizontally-scrolling chip row per facet, directly under the search box,
 * and it is what shipped. Two facets is then TWO extra rows above the first
 * result — on a phone, a third of the viewport spent on controls before any
 * content — and each row is a scroller, so half of every facet's options are
 * off-screen with nothing saying so.
 *
 * So it collapses to one button that states how many facets are active, and
 * everything opens in a sheet where the options can WRAP and all of them are
 * visible at once. Same trade, same reasoning, as `RangePicker` (§13 Dates):
 * a facet is something you set and then read from for a while, not a switch you
 * flip every few seconds.
 *
 * ── The decisions ───────────────────────────────────────────────────────────
 *
 * ONE OPTION PER FACET.       Multi-select reads as "narrower" and behaves as
 *                             "wider" (OR within a facet), which nobody
 *                             predicts. A second choice replaces the first.
 * THE BUTTON CARRIES THE COUNT. Icon-only and quiet at rest; tonal with the
 *                             number on it once a facet is set — a control that
 *                             hides state must say it has some, or the list
 *                             looks broken.
 * A FACET THAT CANNOT SPLIT THE SET IS DROPPED. One option filters nothing:
 *                             tapping it narrows the list to everything already
 *                             on screen. Callers pass what they have; this
 *                             component hides the useless ones, so the caller
 *                             does not have to remember the rule.
 */

import { useState } from "react";
import { Button, Chip } from "./primitives.js";
import { Sheet } from "./overlays.js";
import { SlidersHorizontal } from "./lib/icons.js";
import { cn } from "./lib/utils.js";

export interface FacetGroup {
  /** The key this facet's selection is stored under. */
  key: string;
  /** What the facet is, as a heading — "Muscle group", "Equipment". */
  label: string;
  options: { value: string; label: string }[];
}

/** facet key → the selected option, or `null` for "any". */
export type FacetSelection = Record<string, string | null>;

export const activeFacetCount = (value: FacetSelection): number =>
  Object.values(value).filter((v) => v != null && v !== "").length;

export function Filters({ groups, value, onChange, className }: {
  groups: readonly FacetGroup[];
  value: FacetSelection;
  onChange: (next: FacetSelection) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // A facet with fewer than two options cannot narrow anything — see the header.
  const usable = groups.filter((g) => g.options.length > 1);
  const active = activeFacetCount(value);
  // Nothing to offer: render nothing rather than a button that opens an empty
  // sheet. The row it sits on closes up around it.
  if (usable.length === 0) return null;

  const pick = (key: string, option: string) =>
    onChange({ ...value, [key]: value[key] === option ? null : option });

  return (
    <>
      <Button
        variant={active > 0 ? "tonal" : "ghost"}
        size={active > 0 ? "sm" : "icon"}
        className={cn("shrink-0", className)}
        // The label is fixed, not derived from the contents: the visible text is
        // a count when facets are on, and "Filters 2" is not a name.
        aria-label={active > 0 ? `Filters, ${active} on` : "Filters"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {/* Icon-only until a facet is on. The header row is a search field plus
            icon buttons; a worded button among them is both the odd one out and
            ~50px off the field — on a phone, the difference between a readable
            placeholder and a truncated one. The count appears when there is
            one, because THEN it is state and must be visible. */}
        <SlidersHorizontal aria-hidden />
        {active > 0 && <span aria-hidden className="numeral">{active}</span>}
      </Button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Filter"
        footer={
          <div className="flex gap-2">
            {active > 0 && (
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                onClick={() => onChange(Object.fromEntries(usable.map((g) => [g.key, null])))}
              >
                Clear all
              </Button>
            )}
            <Button size="lg" className="flex-1" onClick={() => setOpen(false)}>Done</Button>
          </div>
        }
      >
        <div className="space-y-4">
          {usable.map((g) => (
            <div key={g.key} className="space-y-2">
              <p className="px-1 text-micro uppercase text-muted-foreground">{g.label}</p>
              {/* Wrapped, not scrolled: in a sheet there is room, and a facet
                  whose options run off the edge is a facet you cannot survey. */}
              <div className="flex flex-wrap gap-2">
                {g.options.map((o) => (
                  <Chip key={o.value} selected={value[g.key] === o.value} onClick={() => pick(g.key, o.value)}>
                    {o.label}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Sheet>
    </>
  );
}
