/**
 * EmptyState — the premium "nothing here yet" panel. A soft icon medallion, a
 * clear headline, a one-line nudge, and an optional primary action. Used
 * everywhere a list can be empty so first-run never feels broken or bare.
 */
import * as React from "react";
import { ScenaMascot, type ScenaMood } from "@scena/ui";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  scena,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  /** Front a first-run/onboarding empty with the Scena mascot in this mood
   *  instead of the icon medallion. Reserve for the core "create your first X"
   *  moments — not every empty list (that would be a mascot invasion). */
  scena?: ScenaMood;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "animate-rise flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/40 px-6 py-16 text-center",
        className,
      )}
    >
      {scena ? (
        <ScenaMascot mood={scena} size={116} className="mb-1" />
      ) : icon ? (
        <div className="mb-4 grid size-12 place-items-center rounded-full bg-primary/10 text-primary [&_svg]:size-6">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
