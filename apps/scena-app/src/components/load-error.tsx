/**
 * A consistent inline "couldn't load" banner with a Retry, for list pages.
 *
 * Replaces the old pattern of swallowing a fetch failure into an empty array —
 * which made an outage look identical to "you have nothing yet." Show this when
 * a load fails so the state is honest, and keep any previously-loaded data
 * on screen rather than blanking it.
 */
import { AlertTriangle } from "lucide-react";
import { Button } from "./ui/button.js";

export function LoadError({ what = "data", onRetry }: { what?: string; onRetry?: () => void }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
      <span className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="size-4 shrink-0" /> Couldn't load {what}. Check your connection.
      </span>
      {onRetry && (
        <Button variant="outline" size="sm" className="shrink-0" onClick={onRetry}>Retry</Button>
      )}
    </div>
  );
}
