/**
 * Scena's empty state — `@4dl/ui`'s, with the mascot in front of it.
 *
 * ── Why this is not just the shared component ──────────────────────────────
 *
 * `@4dl/ui`'s `EmptyState` takes a `LucideIcon`, and it is right to: a design
 * system may not know what a Scena mascot is any more than it may know what a
 * workout is. The mood-carrying character IS the product's voice at first run,
 * so the branch that draws it lives here — the same split CLAUDE.md describes
 * for Kova's `StudioPausedBanner`: a registry read wrapped around a shared
 * primitive.
 *
 * Everything below the mark — the headline, the one-line nudge, the action slot,
 * the settle-in motion — is the shared component's, so an empty list in Scena
 * and an empty list in another 4DL app are the same shape.
 *
 * ⚠️ `scena` is for FIRST-RUN moments only ("create your first channel"), not
 * for every empty list. A mascot on every zero-state is a mascot invasion, and
 * the prop being optional is the whole guard.
 */

import type { ReactNode } from "react";
import { cn, EmptyState as SharedEmptyState, type LucideIcon } from "@4dl/ui";
import { Circle } from "lucide-react";
import { ScenaMascot, type ScenaMood } from "../brand.js";

export function EmptyState({
  icon,
  scena,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  /** Front this empty with the Scena mascot in the given mood instead of an icon. */
  scena?: ScenaMood;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Only the mascot branch honours this — the shared component owns its own
   *  box, and letting a caller reach into it is how a design system stops being
   *  one. Kept because several first-run panels set a max-width. */
  className?: string;
}) {
  if (!scena) {
    // The shared component requires an icon, and a silently missing medallion
    // would leave the headline floating in the middle of a panel.
    return <SharedEmptyState icon={icon ?? Circle} title={title} description={description} action={action} />;
  }
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      <ScenaMascot mood={scena} size={116} className="mb-1" />
      <h3 className="mt-4 text-title-3">{title}</h3>
      {description && <p className="mt-1.5 max-w-xs text-body text-muted-foreground">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
