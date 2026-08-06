/**
 * Shared feature-gate UI (BLUEPRINT §25). One consistent "locked / upgrade"
 * treatment for every plan-gated capability, driven by the shared catalog
 * (`@scena/manifest`) so labels and copy stay in lockstep with the plan shape.
 *
 * A gate is a UX layer only — the server enforces the same grants and returns
 * 402/403. Use these instead of hand-rolling a lock badge per page:
 *
 *   const { allowed } = useFeatureGate("aiGeneration");
 *   <CardTitle>AI <FeatureLockBadge feature="aiGeneration" /></CardTitle>
 *   <LockedFeatureCard feature="proofOfPlay" />          // full-page locked state
 */
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { featureMeta, type FeatureDef } from "@scena/manifest";
import { useFeature } from "../entitlements.js";
import { Badge } from "./ui/badge.js";
import { Button } from "./ui/button.js";
import { cn } from "../lib/utils.js";

/** Whether the tenant has `feature`, plus its catalog metadata (humanized
 *  fallback for a key not yet in the catalog). */
export function useFeatureGate(feature: string): { allowed: boolean; meta: FeatureDef } {
  const allowed = useFeature(feature);
  return { allowed, meta: featureMeta(feature) };
}

/** A small "🔒 Upgrade" pill that links to Billing. */
export function UpgradeBadge({ className }: { className?: string }) {
  return (
    <Badge asChild variant="secondary" className={cn("gap-1 font-normal", className)}>
      <Link to="/billing"><Lock className="size-3" /> Upgrade</Link>
    </Badge>
  );
}

/** Title-adjacent badge that only appears when the feature is locked. */
export function FeatureLockBadge({ feature, className }: { feature: string; className?: string }) {
  const { allowed } = useFeatureGate(feature);
  if (allowed) return null;
  return <UpgradeBadge className={className} />;
}

/** A centered, full-page locked state — for a whole gated screen/tab. */
export function LockedFeatureCard({ feature, className }: { feature: string; className?: string }) {
  const { meta } = useFeatureGate(feature);
  return (
    <div className={cn("mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border bg-card px-6 py-10 text-center", className)}>
      <div className="grid size-11 place-items-center rounded-full bg-muted"><Lock className="size-5 text-muted-foreground" /></div>
      <div className="text-base font-semibold">{meta.label}</div>
      {meta.description && <p className="text-sm text-muted-foreground">{meta.description}</p>}
      <Button asChild size="sm" className="mt-1"><Link to="/billing">Upgrade plan</Link></Button>
    </div>
  );
}
