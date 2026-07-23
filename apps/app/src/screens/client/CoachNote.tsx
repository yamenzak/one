/**
 * CoachNote — the personalized, context-aware AI note that greets the client on
 * their home / train / eat / wellness screens. Fetches a message built from
 * their full context (cached server-side 1h, refreshed on any material change).
 * Renders nothing when the feature is off, unentitled, or has no message.
 */

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { api, todayLocal } from "../../api.js";
import { AiAvatar, useAiIdentity } from "../../AiAvatar.js";
import { Markdown } from "../../Markdown.js";

type Surface = "home" | "train" | "eat" | "wellness" | "progress";

export function CoachNote({ clientId, surface }: { clientId: string; surface: Surface }) {
  const [msg, setMsg] = useState<string | null>(null);
  const ai = useAiIdentity();

  useEffect(() => {
    let live = true;
    const today = todayLocal();
    const hour = new Date().getHours();
    void api
      .get<{ message: string | null }>(`/api/ai/coach-note?clientId=${clientId}&surface=${surface}&today=${today}&hour=${hour}`)
      .then((r) => { if (live) setMsg(r.message); })
      .catch(() => { if (live) setMsg(null); });
    return () => { live = false; };
  }, [clientId, surface]);

  if (!msg) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="flex items-start gap-3 px-1">
      <AiAvatar className="mt-0.5 size-8 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-primary">{ai.name}</div>
        <Markdown className="mt-1 text-[0.95rem] text-foreground/85">{msg}</Markdown>
      </div>
    </motion.div>
  );
}
