/**
 * JSON columns, read defensively.
 *
 * Deep structures (plan bodies, budgets, settings, entitlement overrides) live in
 * TEXT columns validated at the route boundary by the app's wire schemas. By the
 * time a store reads one back it is already trusted — but "already trusted" is
 * not "guaranteed parseable": a column can hold a partially written value, a
 * value written by an older shape, or NULL because the row predates the column.
 *
 * So reads take a fallback and never throw. A screen rendering defaults is a
 * recoverable state; a 500 on every read of one bad row is not.
 */

export const j = (v: unknown): string => JSON.stringify(v);

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
