/**
 * FeatureLock — the one uniform "not in your plan" affordance, driven by the
 * entitlement registry. Wrap any surface that needs a platform feature: if the
 * tenant holds it, the children render; otherwise a consistent locked card
 * appears with the feature's label + hint (from FEATURE_META) and the right CTA
 * (owner → see plans; staff → ask the owner). Replaces the ad-hoc 403 / hidden
 * handling scattered across screens, so a locked feature always reads the same.
 */
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { FEATURE_META, gateSpecOf, featureEnabled, type Entitlements, type FeatureKey } from "@kova/domain";
import { Card, IconBadge, Button, Lock } from "@4dl/ui";
import { useSession } from "./session.js";

/**
 * THE read-model capability check for the app — the mirror of the API's
 * `gateFeature`, resolved from the SAME `FEATURES` record so a screen can never
 * offer a control a route will 403. Composes the tenant's platform entitlement
 * with (for the client persona only) the client's package flag, exactly as
 * `gateFeature` → `requireClientFlag` does: staff are never bounded by what a
 * client bought, so their `clientFlags` half is passed as null.
 *
 * Use this instead of reading `ctx.entitlements.features.x` by hand — that form
 * silently skips the client-flag half and re-derives plan logic in the app.
 */
export function useCan(feature: FeatureKey): boolean {
  const { ctx } = useSession();
  const features = ctx?.entitlements?.features;
  // No context yet ⇒ fail CLOSED. Returning true while the bootstrap is in
  // flight is what makes a locked control flash into view and then 403.
  if (!features) return false;
  const isClient = ctx?.active?.role === "client";
  return featureEnabled(feature, { features, clientFlags: isClient ? ctx?.clientFlags : null });
}

/** The entitlement a feature needs, for pairing `useCan` with a `FeatureLock`. */
export function entitlementOf(feature: FeatureKey): keyof Entitlements["features"] | undefined {
  return gateSpecOf(feature).entitlement;
}

export function FeatureLock({
  feature,
  children,
}: {
  feature: keyof Entitlements["features"];
  children?: ReactNode;
}) {
  const { ctx } = useSession();
  const nav = useNavigate();
  const has = ctx?.entitlements?.features?.[feature] ?? false;
  if (has) return <>{children}</>;

  const meta = FEATURE_META[feature] ?? { label: feature, hint: "" };
  const isOwner = ctx?.active?.role === "owner";
  return (
    <Card className="flex flex-col items-center gap-3 py-8 text-center">
      <IconBadge icon={Lock} tone="warning" size="lg" />
      <div>
        <div className="font-semibold">{meta.label} isn&apos;t in your plan</div>
        {meta.hint && <p className="mx-auto mt-1 max-w-xs text-body text-muted-foreground">{meta.hint}</p>}
      </div>
      {isOwner ? (
        <Button onClick={() => nav("/business")}>See plans</Button>
      ) : (
        <p className="text-body text-muted-foreground">Ask your studio owner to upgrade to unlock this.</p>
      )}
    </Card>
  );
}
