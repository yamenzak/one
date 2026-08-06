/**
 * Dynamic data sources (§sources). A source — a public API (JSON), a public
 * Google Sheet, an RSS feed, or a manual list — is fetched server-side on a
 * schedule and normalized to one simple shape: a table of `columns` + string
 * `rows`. Widgets bind individual fields to a source through `config.bindings`;
 * this pure layer resolves those bindings against the fetched datasets and
 * overlays the results onto the widget config, so the builder preview and the
 * player render byte-identically (the render functions never see a "binding",
 * only resolved values).
 */

import { type Config, str, num } from "./types.js";

/** A source's normalized data: a header row + string cells. Everything is a
 *  string — widgets coerce as needed (num()/str()), same as manual config. */
export interface SourceDataset {
  columns: string[];
  rows: string[][];
}

export type BindingKind = "value" | "list";

/**
 * One field's binding to a source.
 *  - kind "value": a single cell (`col` + `row`, default row 0), or the whole
 *    column joined by `join`.
 *  - kind "list": maps each row to a { label, value, note } via column refs
 *    (used by the menu's `items` and, later, ticker headlines).
 * A `col`/`labelCol`/… ref is a column *name* (case-insensitive) or index.
 */
export interface FieldBinding {
  sourceId: string;
  kind?: BindingKind;
  col?: string | number;
  row?: number;
  join?: string;
  labelCol?: string | number;
  valueCol?: string | number;
  noteCol?: string | number;
  max?: number;
}

export type Bindings = Record<string, FieldBinding>;

/** The bindings map a widget carries (empty when nothing is bound). */
export function readBindings(config: Config): Bindings {
  const b = (config as { bindings?: unknown }).bindings;
  if (!b || typeof b !== "object") return {};
  const out: Bindings = {};
  for (const [k, v] of Object.entries(b as Record<string, unknown>)) {
    if (v && typeof v === "object" && str((v as FieldBinding).sourceId)) out[k] = v as FieldBinding;
  }
  return out;
}

/** Resolve a column ref (name or index) to a column index; falls back to 0. */
export function colIndex(ds: SourceDataset, ref: string | number | undefined): number {
  if (ref == null || ref === "") return 0;
  if (typeof ref === "number") return ref >= 0 && ref < ds.columns.length ? ref : 0;
  const i = ds.columns.findIndex((c) => c.toLowerCase() === String(ref).toLowerCase());
  return i >= 0 ? i : 0;
}

export function cellAt(ds: SourceDataset, row: number, col: number): string {
  return ds.rows[row]?.[col] ?? "";
}

/** Resolve a `value` binding to a string (a single cell, or a joined column). */
export function resolveValue(ds: SourceDataset, b: FieldBinding): string {
  const col = colIndex(ds, b.col);
  if (b.join != null) return ds.rows.map((r) => r[col] ?? "").filter((s) => s !== "").join(b.join);
  return cellAt(ds, Math.max(0, Math.floor(num(b.row, 0))), col);
}

export interface BoundRow { label: string; value: string; note: string; }

/** Resolve a `list` binding to menu-style rows. */
export function resolveList(ds: SourceDataset, b: FieldBinding): BoundRow[] {
  const lc = colIndex(ds, b.labelCol ?? 0);
  const vc = b.valueCol != null && b.valueCol !== "" ? colIndex(ds, b.valueCol) : -1;
  const nc = b.noteCol != null && b.noteCol !== "" ? colIndex(ds, b.noteCol) : -1;
  const max = b.max && b.max > 0 ? Math.floor(b.max) : ds.rows.length;
  return ds.rows.slice(0, max).map((r) => ({
    label: r[lc] ?? "",
    value: vc >= 0 ? r[vc] ?? "" : "",
    note: nc >= 0 ? r[nc] ?? "" : "",
  }));
}

/**
 * Overlay a widget's resolved bindings onto its config. `datasets` maps a
 * sourceId to its fetched table; a missing/undefined dataset leaves the field's
 * authored value untouched (so the builder shows placeholders until data lands,
 * and the player keeps the last good value if a source blips). A `list` binding
 * named `items` becomes menu items ({label,value,note}); any other `value`
 * binding sets `config[field]` to the resolved string.
 */
export function applyBindings(config: Config, datasets: Record<string, SourceDataset | undefined>): Config {
  const bindings = readBindings(config);
  const fields = Object.keys(bindings);
  if (fields.length === 0) return config;
  const out: Config = { ...config };
  for (const field of fields) {
    const b = bindings[field]!;
    const ds = datasets[b.sourceId];
    if (!ds || ds.rows.length === 0) continue;
    if (b.kind === "list") {
      out[field] = resolveList(ds, b).map((r) => ({ label: r.label, value: r.value, note: r.note }));
    } else {
      out[field] = resolveValue(ds, b);
    }
  }
  return out;
}

/** The distinct sourceIds a widget's bindings reference (for fetching). */
export function boundSourceIds(config: Config): string[] {
  return [...new Set(Object.values(readBindings(config)).map((b) => b.sourceId).filter(Boolean))];
}

/** True when the widget has at least one source binding. */
export function hasBindings(config: Config): boolean {
  return Object.keys(readBindings(config)).length > 0;
}
