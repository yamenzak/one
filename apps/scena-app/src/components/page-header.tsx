/**
 * PageHeader — the single title block every page opens with. Left: an optional
 * back link (inner pages), the page name, and description. Right: page controls
 * (search, filters, view toggles). The shell top bar carries the breadcrumbs +
 * primary actions; this never repeats them.
 */
import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  back,
  actions,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Inner-page back link. */
  back?: { label?: string; onClick: () => void };
  /** Right-aligned controls: search, filters, view toggles (also the legacy
   *  primary-actions slot). */
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("mb-6", className)}>
      {back && (
        <button
          onClick={back.onClick}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> {back.label ?? "Back"}
        </button>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="truncate text-[1.35rem] font-bold tracking-tight md:text-2xl">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          {children}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
