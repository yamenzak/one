/**
 * AiAvatar — the face of the studio's AI coach. Uses the tenant's uploaded AI
 * avatar (branding.aiAvatarUrl) when set, otherwise a deterministic DiceBear
 * "bottts" robot seeded per studio. Rendered on every AI surface so the agent
 * has one consistent identity.
 */

import { dicebearUrl, cn } from "@mossa/ui";
import { useSession } from "./session.js";

export function aiAvatarSrc(uploaded: string | null | undefined, seed: string): string {
  return uploaded || dicebearUrl(`${seed}-ai-coach`, "bottts");
}

export function AiAvatar({ className }: { className?: string }) {
  const { ctx, host } = useSession();
  const uploaded = ctx?.branding?.aiAvatarUrl ?? host?.tenant?.branding?.aiAvatarUrl;
  const seed = ctx?.active?.tenantSlug ?? ctx?.active?.tenantId ?? host?.tenant?.slug ?? "mossa";
  return <img src={aiAvatarSrc(uploaded, seed)} alt="AI coach" className={cn("size-9 shrink-0 rounded-full bg-primary/15 object-cover", className)} />;
}
