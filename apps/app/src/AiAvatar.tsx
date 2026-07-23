/**
 * The studio's AI identity — one face and one name for the assistant, shown on
 * every AI surface so it reads as a single coach, not a scatter of sparkles.
 * A white-label studio uploads its own avatar (branding.aiAvatarUrl) and names
 * it (branding.aiName); otherwise it falls back to a deterministic DiceBear
 * "bottts" robot seeded per studio, named "Coach".
 */

import { dicebearUrl, cn } from "@mossa/ui";
import { useSession } from "./session.js";

export function aiAvatarSrc(uploaded: string | null | undefined, seed: string): string {
  return uploaded || dicebearUrl(`${seed}-ai-coach`, "bottts");
}

/** The resolved AI identity for the active studio (signed-in or branded host). */
export function useAiIdentity(): { name: string; src: string } {
  const { ctx, host } = useSession();
  const branding = ctx?.branding ?? host?.tenant?.branding;
  const seed = ctx?.active?.tenantSlug ?? ctx?.active?.tenantId ?? host?.tenant?.slug ?? "mossa";
  return {
    name: (branding?.aiName || "").trim() || "Coach",
    src: aiAvatarSrc(branding?.aiAvatarUrl, seed),
  };
}

/** The AI's face — an <img> of the studio's avatar. Sized via className. */
export function AiAvatar({ className }: { className?: string }) {
  const { src, name } = useAiIdentity();
  return <img src={src} alt={name} className={cn("size-9 shrink-0 rounded-full bg-primary/15 object-cover", className)} />;
}
