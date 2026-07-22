/**
 * SupplementGuide — a client-facing AI explainer for their OWN supplement stack:
 * what each supports, when to take it, and simple tips. On-demand (a tap, not an
 * auto-load, so it only spends a credit when asked). Educational, never
 * prescriptive — starting/stopping/dosing stays with the coach. Hidden when the
 * tenant lacks the AI suite or the client's package excludes AI insights.
 */

import { useState } from "react";
import { motion } from "motion/react";
import { Button, Sparkles } from "@mossa/ui";
import { featureEnabled } from "@mossa/domain";
import { api } from "../../api.js";
import { useSession } from "../../session.js";
import { AiAvatar } from "../../AiAvatar.js";
import { Markdown } from "../../Markdown.js";

export function SupplementGuide({ clientId }: { clientId: string }) {
  const { ctx } = useSession();
  // Composed from the aiCoachInsights FEATURES record (aiSuite entitlement ⊕ the
  // client's package flag) — the same gate the /ai/narrative route enforces.
  const features = ctx?.entitlements?.features;
  const available = !!features && featureEnabled("aiCoachInsights", { features, clientFlags: ctx?.clientFlags });
  const [guide, setGuide] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!available) return null;

  const ask = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.post<{ guide: string }>("/api/ai/supplement-guide", { clientId });
      setGuide(r.guide?.trim() || "No tips to show right now.");
    } catch {
      setErr("Couldn't load supplement tips right now — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-1">
      {!guide ? (
        <Button variant="tonal" size="sm" disabled={busy} onClick={() => void ask()}>
          <Sparkles /> {busy ? "Thinking…" : "Explain my supplements"}
        </Button>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="flex items-start gap-3">
          <AiAvatar className="mt-0.5 size-8 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-primary">Supplement tips</div>
            <Markdown className="mt-1 text-[0.95rem] text-foreground/85">{guide}</Markdown>
            <p className="mt-1.5 text-[0.7rem] text-muted-foreground">General info — ask your coach before starting, stopping, or changing anything.</p>
          </div>
        </motion.div>
      )}
      {err && <p className="mt-1 text-sm text-danger">{err}</p>}
    </div>
  );
}
