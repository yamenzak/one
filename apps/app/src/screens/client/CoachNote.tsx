/**
 * CoachNote — the personalized, context-aware AI note that greets the client on
 * their home / train / eat / wellness screens. Fetches a message built from
 * their full context (cached server-side 1h, refreshed on any material change).
 * Renders nothing when the feature is off, unentitled, or has no message.
 */

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { api, todayLocal } from "../../api.js";
import { AiAvatar } from "../../AiAvatar.js";

type Surface = "home" | "train" | "eat" | "wellness";

export function CoachNote({ clientId, surface }: { clientId: string; surface: Surface }) {
  const [msg, setMsg] = useState<string | null>(null);

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
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="relative overflow-hidden rounded-2xl bg-primary/10 p-4">
      <div className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-primary/15 blur-2xl" />
      <div className="relative flex items-start gap-3">
        <AiAvatar className="size-9" />
        <div className="min-w-0">
          <div className="text-[0.65rem] font-semibold uppercase tracking-wide text-primary">Your coach</div>
          <p className="mt-1 text-sm leading-relaxed">{msg}</p>
        </div>
      </div>
    </motion.div>
  );
}
