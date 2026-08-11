/**
 * THE COMPONENT REGISTRY — what exists, and what states it has been designed in.
 *
 * ⚠️ A COMPONENT NOT REGISTERED HERE IS NOT PART OF THE LANGUAGE. That is the
 * whole of the renderer boundary: an app cannot define a shell, a dialog, a
 * toast, an empty state or a form primitive, because the only ones that exist
 * are the ones on this list and the guard refuses any other.
 */

import type { ComponentStates } from "./state.js";
import type { IconName } from "./icons.js";

export const COMPONENTS: readonly ComponentStates[] = [
  /* ⚠️ The shell and its one navigation surface are components like any other:
     `RENDERER_OWNS` forbids an app to build them, so the package owes them, and
     the boundary guard reads THIS list to check that it does. */
  { id: "shell", interaction: ["idle"] },
  { id: "nav", interaction: ["idle", "hover", "pressed", "focus"] },
  { id: "surface", interaction: ["idle"] },
  { id: "text", interaction: ["idle"] },
  { id: "no-data", interaction: ["idle"] },
  /*
    ⚠️ `disabled` AND `locked` ARE NOT BOTH HERE. Gated is one or the other, and
    locked is the one that can explain itself, stay focusable and offer the way
    out — so a button that a plan withholds is locked, and a button that is
    genuinely inapplicable is disabled. Declaring both would say the distinction
    is presentational.
  */
  { id: "button", interaction: ["idle", "hover", "pressed", "focus", "busy", "locked"] },
  { id: "row", interaction: ["idle", "hover", "pressed", "focus"] },
  { id: "callout", interaction: ["idle"] },
  { id: "empty-state", interaction: ["idle"] },
  { id: "skeleton", interaction: ["idle"] },
  { id: "collection", interaction: ["idle"], data: ["unknown", "empty", "partial", "error", "ready"] },
  { id: "overlay", interaction: ["idle", "focus"] },

  /*
    ── THE LAYOUT. ⚠️ REGISTERED FOR THE SAME REASON THE PRIMITIVES ARE: an
    archetype is part of the language, so a screen may not invent a sixth one —
    and what is not on this list is what the boundary guard refuses.
  */
  { id: "page", interaction: ["idle"] },
  { id: "sky", interaction: ["idle"] },
  { id: "app-bar", interaction: ["idle", "focus"] },
  { id: "crown", interaction: ["idle"] },
  { id: "topic", interaction: ["idle"] },
  { id: "page-title", interaction: ["idle"] },
  { id: "identity", interaction: ["idle"] },
  { id: "amount", interaction: ["idle"] },
  { id: "quick-action", interaction: ["idle", "hover", "pressed", "focus"] },
  { id: "section", interaction: ["idle"] },
  { id: "tile", interaction: ["idle", "hover", "pressed", "focus"] },
  { id: "segmented", interaction: ["idle", "focus"] },
  { id: "scroller", interaction: ["idle"] },
  { id: "promo", interaction: ["idle"] },
  { id: "badge", interaction: ["idle"] },
  { id: "medallion", interaction: ["idle"] },
  { id: "glyph", interaction: ["idle"] },
  { id: "icon", interaction: ["idle", "pressed"] },

  /*
    ── THE FORM. ⚠️ EVERY ONE OF THESE IS ON `RENDERER_OWNS`, so an app cannot
    build its own — which means the package OWES each of them. That half of the
    boundary went unchecked for four stages and unmet for all of them.
  */
  { id: "form", interaction: ["idle"] },
  { id: "field", interaction: ["idle", "focus", "invalid", "disabled"] },
  { id: "input", interaction: ["idle", "hover", "focus", "invalid", "disabled"] },
  { id: "textarea", interaction: ["idle", "focus", "invalid", "disabled"] },
  { id: "select", interaction: ["idle", "focus", "invalid", "disabled"] },
  { id: "checkbox", interaction: ["idle", "focus", "disabled"] },
  { id: "radio", interaction: ["idle", "focus", "disabled"] },
  { id: "switch", interaction: ["idle", "focus", "disabled"] },
  { id: "dial", interaction: ["idle", "focus", "disabled"] },
  { id: "save-bar", interaction: ["idle", "busy"] },
  { id: "bulk-actions", interaction: ["idle"] },

  /* ── READING SURFACES. */
  { id: "page-header", interaction: ["idle"] },
  { id: "breadcrumb", interaction: ["idle", "hover", "focus"] },
  { id: "steps", interaction: ["idle"] },
  { id: "pagination", interaction: ["idle", "hover", "focus", "disabled"] },
  { id: "table", interaction: ["idle"] },
  { id: "stat", interaction: ["idle"] },
  { id: "progress", interaction: ["idle"], data: ["unknown", "ready"] },
  { id: "disclosure", interaction: ["idle", "focus"] },
  { id: "menu", interaction: ["idle", "hover", "focus"] },
  { id: "toast", interaction: ["idle"] },
  { id: "tooltip", interaction: ["idle"] },
  { id: "spinner", interaction: ["idle"] },
  { id: "divider", interaction: ["idle"] },
];

/** Anything an app is forbidden to build for itself. The boundary, as a list. */
export const RENDERER_OWNS: readonly string[] = [
  "shell", "nav", "breadcrumb", "page-header", "tabs",
  "dialog", "sheet", "drawer", "popover", "menu", "toast",
  "empty-state", "skeleton", "form", "field", "button", "input", "select", "checkbox",
  "pagination", "bulk-actions", "save-bar", "confirm",
];

/* ------------------------------------------------------------ navigation --- */

/**
 * ⚠️ ONE NAVIGATION SURFACE AT A TIME, AND THREE LEVELS THAT ARE NOT
 * INTERCHANGEABLE — a DESTINATION is a place that survives a reload, a SECTION
 * is a lens on one destination, and a RECORD is one thing from a collection.
 * Most "the desktop feels wrong" bugs are two of these wearing each other's
 * clothes: a rail AND a top nav bar is two answers to "where am I".
 *
 * Only the first is declared, because only the first has a surface. A section
 * lives inside the content column and a record is a route — neither needs a type
 * here, and one nothing consumed would be documentation pretending to be code.
 */
export interface Destination {
  readonly id: string;
  readonly label: string;
  /** ⚠️ A NAME FROM THE CLOSED SET, so the shell can DRAW it. It was a free
      string, and the shell rendered an empty span beside every label. */
  readonly icon: IconName;
  /** What shape this destination takes at every width. A screen does not choose. */
  readonly kind: "overview" | "collection" | "task";
}

export interface NavProblem { readonly detail: string }

/**
 * ⚠️ THREE TO FIVE. Six destinations means two of them are the same place, and
 * the rail is where somebody aims from memory rather than reads.
 *
 * ⚠️ AND AN ICON TRAVELS WITH ITS LABEL. An icon-only rail item is unnamed to
 * voice control and ambiguous to everybody else.
 */
export function navProblems(destinations: readonly Destination[]): readonly NavProblem[] {
  const out: NavProblem[] = [];
  if (destinations.length < 3) out.push({ detail: `${destinations.length} destinations: fewer than three is not a navigation surface` });
  if (destinations.length > 5) out.push({ detail: `${destinations.length} destinations: more than five means two of them are the same place` });
  for (const d of destinations) {
    if (!d.label.trim()) out.push({ detail: `destination "${d.id}" has an icon and no label` });
  }
  const seen = new Set<string>();
  for (const d of destinations) {
    if (seen.has(d.id)) out.push({ detail: `two destinations share the id "${d.id}"` });
    seen.add(d.id);
  }
  return out;
}

/** The four widths. Tablet is a named width, not "small desktop". */
export type Width = "phone" | "tablet" | "desktop" | "wide";

/**
 * What shape a destination takes — decided by its KIND, never by the screen.
 *
 * ⚠️ A COLLECTION SHOWS ITS LIST AND A RECORD AT THE SAME TIME from desktop up.
 * The list is not decoration: it is how somebody works through ten records
 * without going back nine times, and replacing it on open is the single thing
 * that makes a wide viewport read as a phone in the middle of a monitor.
 */
export function shapeFor(kind: Destination["kind"], width: Width): "column" | "focus" | "two-pane" | "board" | "full-bleed" {
  if (kind === "task") return "full-bleed";
  if (width === "phone") return "column";
  if (kind === "collection") return width === "tablet" ? "focus" : "two-pane";
  return width === "wide" ? "board" : "focus";
}

/**
 * ⚠️ INSIDE A PANE, A VIEWPORT BREAKPOINT IS A LIE. A record built for a
 * full-width panel and dropped into a narrow pane keeps every breakpoint
 * answering yes — nothing on it is wrong, it is answering a question about the
 * wrong box. A surface that can appear in a pane sizes itself against its
 * CONTAINER.
 */
export const paneCapable = (kind: Destination["kind"]): boolean => kind !== "task";
