/**
 * Licensing surfaces (§4b) — a small provenance badge + a rights note.
 *
 * Provenance drives commercial-use rights:
 *  - `public`  → came from the platform's public/licensed library → cleared for
 *                the tenant's commercial use.
 *  - `ai`      → made with our AI (imagery / HTML / audio) → licensed to the tenant.
 *  - `upload`  → the tenant's own upload → we can't verify its rights; the tenant
 *                is responsible for clearing it (incl. music inside a video).
 *
 * All three badges share one shape (subtle tint + hairline ring, medium weight)
 * so they read as one designed system rather than loud stickers.
 */
import { ShieldCheck, Sparkles, UserRound, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type Provenance = string | null | undefined;

const BADGE_BASE = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset";

/** A compact badge stating the commercial-use status of an asset. Every
 *  provenance value is badged (uploads included), so an asset's rights are
 *  always explicit. Unknown/empty provenance renders nothing. */
export function LicenseBadge({ source, className }: { source: Provenance; className?: string }) {
  if (source === "public") {
    return (
      <span className={cn(BADGE_BASE, "bg-info/10 text-info ring-info/25", className)} title="From the public library — licensed for your commercial use">
        <ShieldCheck className="size-3" /> Licensed
      </span>
    );
  }
  if (source === "ai") {
    return (
      <span className={cn(BADGE_BASE, "bg-success/10 text-success ring-success/25", className)} title="Made with AI — licensed to you for commercial use">
        <Sparkles className="size-3" /> Made with AI
      </span>
    );
  }
  if (source === "upload") {
    return (
      <span className={cn(BADGE_BASE, "bg-muted text-muted-foreground ring-border", className)} title="Your upload — you're responsible for clearing its rights">
        <UserRound className="size-3" /> Your upload
      </span>
    );
  }
  return null;
}

/** A one-line rights note for a library page. Always shown (a standing notice,
 *  not dismissible). `scope` tailors the wording for the media / slides / music
 *  context. Kept in step with the Terms and Privacy Policy. */
export function LicenseNote({ scope }: { scope: "media" | "slides" | "music" }) {
  const uploads =
    scope === "media" ? "images, video, and music (including audio inside a video)"
    : scope === "music" ? "audio you upload"
    : "images and video (including their audio)";
  const verb = scope === "music" ? "play them" : "display them";
  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-border/70 bg-muted/40 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1">
        <span className="font-medium text-foreground">Your uploads</span> are yours to clear — {uploads} must be cleared for the way you {verb}. The{" "}
        <span className="font-medium text-foreground">public library</span> is licensed for your commercial use, and anything{" "}
        <span className="font-medium text-foreground">made with AI</span> is licensed to you.
      </p>
    </div>
  );
}
