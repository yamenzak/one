/**
 * Client entitlements (§25 · feature flags). A thin context fed from `/api/me`
 * so the dashboard can hide or disable what the tenant's plan doesn't include —
 * a UX layer only; the server enforces the same gates and returns 402/403.
 *
 * `useFeature("aiGeneration")` → boolean; list-valued features (ticker, weather,
 * clock, alerting) are true when non-empty.
 */
import { createContext, useContext, useMemo } from "react";

export interface Ents {
  features: Record<string, unknown> | null;
  quotas: Record<string, number> | null;
}

const Ctx = createContext<Ents>({ features: null, quotas: null });

export function EntitlementsProvider({ value, children }: { value: Ents; children: React.ReactNode }) {
  const v = useMemo(() => value, [value.features, value.quotas]);
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

/** Is a feature on? Unknown/absent features default to ON (fail-open) so a stale
 *  client never hides a capability the server actually allows. List features are
 *  on when non-empty. */
export function useFeature(key: string): boolean {
  const { features } = useContext(Ctx);
  return featureOn(features, key);
}

export function featureOn(features: Record<string, unknown> | null, key: string): boolean {
  if (!features || !(key in features)) return true; // fail-open when unknown
  const v = features[key];
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}
