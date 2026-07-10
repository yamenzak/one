/**
 * Session provider — loads /api/context once (and on demand), exposes the
 * active persona + coach/train mode (DESIGN.md §5: role changes scope +
 * powers + nav, never screens).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SessionContext } from "@mossa/protocol";
import { api } from "./api.js";

type Mode = "coach" | "train";

interface Session {
  loading: boolean;
  ctx: SessionContext | null;
  mode: Mode;
  setMode: (m: Mode) => void;
  refresh: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ctx, setCtx] = useState<SessionContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setModeState] = useState<Mode>(() =>
    localStorage.getItem("mossa-mode") === "train" ? "train" : "coach",
  );

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<SessionContext>("/api/context");
      setCtx(data);
    } catch {
      setCtx(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    localStorage.setItem("mossa-mode", m);
  }, []);

  const switchTenant = useCallback(
    async (tenantId: string) => {
      await api.post("/api/context/switch", { tenantId });
      await refresh();
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    await api.post("/api/auth/sign-out").catch(() => undefined);
    setCtx(null);
  }, []);

  const value = useMemo(
    () => ({ loading, ctx, mode, setMode, refresh, switchTenant, signOut }),
    [loading, ctx, mode, setMode, refresh, switchTenant, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside provider");
  return s;
}

/** The client record the current surface should scope to (train mode / client role). */
export function useActiveClientId(): string | null {
  const { ctx, mode } = useSession();
  if (!ctx?.active) return null;
  if (ctx.active.role === "client") return ctx.active.clientId;
  return mode === "train" ? ctx.active.clientId : null;
}
