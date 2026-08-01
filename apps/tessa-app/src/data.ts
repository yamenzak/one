/**
 * THE API SURFACE, typed once.
 *
 * Every screen reads through here rather than calling `api.get` with a string,
 * for one reason that has already bitten this repo: the server's shapes are
 * plain `SELECT *` rows, so a renamed column is invisible to TypeScript at the
 * call site and shows up as `undefined` in a chip. Naming the shapes in one file
 * does not make that impossible, but it makes it a one-line fix in one place
 * instead of a hunt.
 *
 * These mirror `apps/tessa/src/*-routes.ts` by hand. Tessa has no shared
 * protocol package yet — Kova grew one (`@kova/protocol`) once its bodies got
 * complicated, and this is the point at which that becomes worth doing, but a
 * zod schema per route is a bigger change than the screens it would serve.
 */

import { api, errorText } from "@4dl/app-kit";

/** The formatter every `useLoad`/`useAction` in this app takes. */
export const fmt = errorText;

// ── Stock ───────────────────────────────────────────────────────────────────

export interface Lot {
  id: string;
  catalog_item_id: string;
  location_id: string | null;
  lot_code: string | null;
  item_name: string | null;
  quantity: number;
  unit_of_measure: string | null;
  /** The EFFECTIVE expiry — the earliest of the three clocks (TESSA.md §3.4). */
  expiry: string | null;
  /** Which clock produced it. The reason a UI can explain a surprising date. */
  expiryReason: "printed" | "opened" | "sterile" | null;
  expiryStatus: "none" | "ok" | "soon" | "expired";
  daysLeft: number | null;
}

export interface Location {
  id: string;
  parent_id: string | null;
  kind: string;
  name: string;
  code: string | null;
}

export interface CatalogItem {
  id: string;
  name: string;
  kind: string;
  tracking: string;
  gtin: string | null;
  consumption: string;
  post_opening_days: number | null;
}

/** What a receive answers when the barcode names a product we do not stock. */
export interface UnknownProduct {
  error: "unknown_product";
  scan: { gtin: string | null; lot: string | null; expiry: string | null; warnings: string[] } | null;
}

export const stock = {
  shelf: (locationId?: string) => api.get<{ lots: Lot[] }>(`/api/stock${locationId ? `?locationId=${encodeURIComponent(locationId)}` : ""}`),
  locations: () => api.get<{ locations: Location[] }>("/api/locations"),
  catalog: () => api.get<{ items: CatalogItem[] }>("/api/catalog"),
  receive: (body: { barcode?: string; catalogItemId?: string; locationId: string; quantity: number; lotCode?: string; expiry?: string }) =>
    api.post<{ lotId: string; quantity: number; expiry: string | null; lotCode: string | null }>("/api/stock/receive", body),
  act: (lotId: string, action: "use" | "discard" | "open" | "quarantine" | "move", body: Record<string, unknown>) =>
    api.post<{ ok: boolean; quantity?: number }>(`/api/stock/${lotId}/${action}`, body),
  history: (lotId: string) => api.get<{ events: LedgerRow[] }>(`/api/stock/${lotId}/history`),
};

export interface LedgerRow {
  id: string;
  at: string;
  event: string;
  quantity_delta: number | null;
  note: string | null;
}

// ── Instruments, trays, loads ───────────────────────────────────────────────

export interface Instrument {
  id: string;
  label_code: string;
  serial: string | null;
  item_name: string | null;
  status: string;
  cycle_count: number;
  reprocessing_class: string | null;
}

export interface Pack {
  id: string;
  label_code: string;
  recipe_name: string | null;
  status: string;
  cycle_id: string | null;
  sterilised_at: string | null;
  expiry: string | null;
  expiryStatus?: "none" | "ok" | "soon" | "expired";
  daysLeft?: number | null;
}

export interface Recipe {
  id: string;
  name: string;
  sterile_shelf_days: number;
  items: { catalog_item_id: string; quantity: number; name: string | null }[];
}

export interface Cycle {
  id: string;
  machine: string;
  cycle_number: string | null;
  status: "running" | "ended" | "released" | "failed";
  started_at: string;
  ended_at: string | null;
  physical_ok: number | null;
  chemical_ok: number | null;
  biological_ok: number | null;
  require_biological: number | null;
  failure_reason: string | null;
  pack_count?: number;
}

/** What `releaseCheck` decided, shipped so a button can explain itself. */
export type ReleaseVerdict = { ok: true; biologicalPending: boolean } | { ok: false; reason: string };

export const cssd = {
  instruments: (status?: string) => api.get<{ instruments: Instrument[] }>(`/api/instruments${status ? `?status=${status}` : ""}`),
  registerInstrument: (body: { catalogItemId: string; labelCode: string; serial?: string; locationId?: string }) =>
    api.post<{ id: string }>("/api/instruments", body),
  instrumentAct: (id: string, action: "clean" | "retire" | "quarantine", body: Record<string, unknown> = {}) =>
    api.post<{ ok: boolean }>(`/api/instruments/${id}/${action}`, body),
  recipes: () => api.get<{ recipes: Recipe[] }>("/api/recipes"),
  createRecipe: (body: { name: string; sterileShelfDays: number; items?: { catalogItemId: string; quantity: number }[] }) =>
    api.post<{ id: string }>("/api/recipes", body),
  packs: (status?: string) => api.get<{ packs: Pack[] }>(`/api/packs${status ? `?status=${status}` : ""}`),
  pack: (id: string) => api.get<{ pack: Pack; members: { unit_id: string; label_code: string; item_name: string | null }[]; events: LedgerRow[] }>(`/api/packs/${id}`),
  buildPack: (body: { recipeId: string; labelCode: string; locationId?: string; unitIds: string[] }) =>
    api.post<{ id: string; members: number; shortfall: { catalogItemId: string; wanted: number; have: number }[] }>("/api/packs", body),
  openPack: (id: string, body: { caseId?: string } = {}) => api.post<{ ok: boolean; returned: number; expired: boolean }>(`/api/packs/${id}/open`, body),

  cycles: (status?: string) => api.get<{ cycles: Cycle[] }>(`/api/cycles${status ? `?status=${status}` : ""}`),
  cycle: (id: string) => api.get<{ cycle: Cycle; packs: Pack[]; release: ReleaseVerdict }>(`/api/cycles/${id}`),
  startCycle: (body: { machine: string; cycleNumber?: string; packIds: string[]; requireBiological?: boolean }) =>
    api.post<{ id: string; packs: number }>("/api/cycles", body),
  endCycle: (id: string, body: { physicalOk: boolean; chemicalOk: boolean }) =>
    api.post<{ status: string; summary?: RecallSummary }>(`/api/cycles/${id}/end`, body),
  release: (id: string) => api.post<{ ok: boolean; released: number; biologicalPending: boolean }>(`/api/cycles/${id}/release`, {}),
  biological: (id: string, passed: boolean) =>
    api.post<{ outcome: string; summary?: RecallSummary; unreachable?: UnreachablePack[] }>(`/api/cycles/${id}/biological`, { passed }),
};

// ── The recall ──────────────────────────────────────────────────────────────

export interface RecallSummary {
  quarantined: number;
  alreadyQuarantined: number;
  /** Opened. Nothing in the app can reach these — the list that matters. */
  unreachable: number;
}

export interface UnreachablePack {
  id: string;
  labelCode: string;
  caseId: string | null;
  openedAt: string | null;
}

export const trace = {
  cycle: (id: string) =>
    api.get<{
      cycle: Cycle;
      summary: RecallSummary;
      packs: (Pack & { disposition: "quarantine" | "already_quarantined" | "unreachable"; case_id: string | null; opened_at: string | null })[];
      instruments: { pack_id: string; unit_id: string; label_code: string; item_name: string | null }[];
    }>(`/api/trace/cycle/${id}`),
  case: (id: string) =>
    api.get<{
      case: CaseRow;
      lines: CaseLine[];
      instruments: { unit_id: string; label_code: string; item_name: string | null }[];
      concerns: { packId: string; labelCode: string | null; cycleId: string | null; cycleNumber: string | null }[];
      amended: boolean;
    }>(`/api/trace/case/${id}`),
};

// ── Cases ───────────────────────────────────────────────────────────────────

export interface CaseRow {
  id: string;
  case_ref: string;
  procedure_code: string | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
  reopen_count: number | null;
  line_count?: number;
}

export interface CaseLine {
  id: string;
  at: string;
  event: string;
  tracked_kind: string;
  tracked_id: string;
  quantity_delta: number | null;
  item_name: string | null;
  label_code: string | null;
  cycle_status: string | null;
  cycle_number: string | null;
}

export const cases = {
  list: (status?: string) => api.get<{ cases: CaseRow[] }>(`/api/cases${status ? `?status=${status}` : ""}`),
  detail: (id: string) => api.get<{ case: CaseRow; lines: CaseLine[] }>(`/api/cases/${id}`),
  open: (body: { caseRef: string; procedureCode?: string; locationId?: string }) => api.post<{ id: string }>("/api/cases", body),
  act: (id: string, action: "close" | "reopen") => api.post<{ ok: boolean; status: string; reopenCount?: number }>(`/api/cases/${id}/${action}`, {}),
};

/** Expiry status → the tone the design system draws it in. One mapping, so a
 *  chip on the shelf and a chip on a tray can never disagree. */
export const expiryTone = (s: Lot["expiryStatus"] | undefined): "success" | "warning" | "danger" | "neutral" =>
  s === "expired" ? "danger" : s === "soon" ? "warning" : s === "ok" ? "success" : "neutral";

/**
 * "12d left" · "expired 3 days ago" · "no expiry", in the reader's language.
 *
 * Takes `t` rather than importing it: this module is data, not React, and a
 * hook here would make every caller a component. Signed on purpose — see
 * `daysUntilExpiry` in `@tessa/domain`.
 */
export function expiryTextWith(
  t: (key: string, vars?: Record<string, string | number>) => string,
  lot: { expiry: string | null; daysLeft?: number | null },
): string {
  if (!lot.expiry) return t("expiry.none");
  const d = lot.daysLeft;
  if (d == null) return lot.expiry;
  if (d < 0) return t("expiry.expired", { days: Math.abs(d) });
  if (d === 0) return t("expiry.today");
  return t("expiry.left", { days: d });
}
