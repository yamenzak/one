/**
 * Lightweight runtime diagnostics for the debug overlay (§ perf/support).
 *
 * Source-backed widgets (ticker, weather, generic source bindings) report the
 * outcome of every fetch here — how many items/rows came back, or the error —
 * keyed by a stable id. The HUD reads these so a technician can see, on the
 * actual screen, whether a source is reaching the API and returning data. This
 * is the difference between "the screen is broken" and "the feed is empty".
 */

export interface DiagEntry {
  kind: "ticker" | "weather" | "source" | "board";
  label: string;
  /** true = last fetch succeeded with data, false = error/empty. */
  ok: boolean;
  /** Short human detail, e.g. "12 items", "empty", "http 503", "offline". */
  detail: string;
  /** Wall-clock ms of the last update. */
  at: number;
}

const entries = new Map<string, DiagEntry>();

/** Record the latest outcome for a source-bound widget. */
export function diagReport(id: string, e: Omit<DiagEntry, "at">): void {
  entries.set(id, { ...e, at: Date.now() });
}

/** Snapshot of all reported sources, ordered by label. */
export function diagEntries(): DiagEntry[] {
  return [...entries.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Drop everything (called when the scene rebuilds so stale rows don't linger). */
export function diagClear(): void {
  entries.clear();
}
