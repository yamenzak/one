/**
 * WHO IS HERE, AND WHERE HERE IS.
 *
 * ⚠️ `null` MEANS "NOT KNOWN YET" AND IT IS NOT THE SAME AS EMPTY. Three
 * surfaces in a previous product seeded an empty array and rendered it as fact:
 * a passkey list showed a confident "0", a bell said "you're all caught up"
 * while still loading, and a media library turned a FAILED load into "nothing
 * here". All three are one bug — a wrong answer wearing a loading state's
 * excuse — and all three are fixed by not having a value until there is one.
 *
 * ⚠️ AND A FAILED LOAD IS A PROBLEM, NEVER AN EMPTY LIST. The distinction is the
 * whole reason `api` answers with a value instead of throwing.
 */

import { createContext, use, useCallback, useEffect, useState } from "react";
import type { Problem } from "@engine/kernel";
import { api, whenSessionExpires, type Answer, type Me } from "./api.js";
import { faceFor, type DoorKind, type Face, type Where } from "./door.js";

export interface Session {
  /** ⚠️ `null` until `/health` answers — see the header. */
  readonly where: Where | null;
  readonly face: Face | null;
  /** ⚠️ `null` while unknown, `"nobody"` once we know there is no session. */
  readonly me: Me | "nobody" | null;
  /** What stopped us finding out. Distinct from "found nothing". */
  readonly stuck: Problem | null;
  readonly askForCode: (email: string) => Promise<Answer<unknown>>;
  readonly enter: (email: string, code: string) => Promise<Answer<{ joined: readonly string[] }>>;
  readonly leave: () => Promise<void>;
  readonly refresh: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export const useSession = (): Session => {
  const session = use(Ctx);
  if (!session) throw new Error("useSession outside SessionProvider");
  return session;
};

export function SessionProvider({ children }: { readonly children: React.ReactNode }) {
  const [where, setWhere] = useState<Where | null>(null);
  const [me, setMe] = useState<Me | "nobody" | null>(null);
  const [stuck, setStuck] = useState<Problem | null>(null);

  const refresh = useCallback(async () => {
    const who = await api.get<Me>("me.who");
    /* ⚠️ 401 is the answer to "is anybody signed in", not a failure. Every other
       refusal is, and conflating them is how a broken deployment renders as a
       polite sign-in page. */
    if (who.ok) { setMe(who.value); setStuck(null); return; }
    if (who.problem.status === 401) { setMe("nobody"); setStuck(null); return; }
    setStuck(who.problem);
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      const health = await api.health();
      if (!live) return;
      if (!health.ok) { setStuck(health.problem); return; }
      setWhere({
        kind: health.value.door as DoorKind,
        root: health.value.root,
        slug: health.value.slug ?? null,
      });
      await refresh();
    })();
    return () => { live = false; };
  }, [refresh]);

  /* ⚠️ One decision about an expired session, made once — see `api.ts`. */
  useEffect(() => { whenSessionExpires(() => setMe("nobody")); }, []);

  const askForCode = useCallback(
    (email: string) => api.post("me.code", { email }),
    [],
  );

  const enter = useCallback(async (email: string, code: string) => {
    const got = await api.post<{ joined: readonly string[] }>("me.session", { email, code });
    if (got.ok) await refresh();
    return got;
  }, [refresh]);

  const leave = useCallback(async () => {
    await api.post("me.signout");
    setMe("nobody");
  }, []);

  return (
    <Ctx value={{
      where,
      face: where ? faceFor(where.kind) : null,
      me, stuck, askForCode, enter, leave, refresh,
    }}>
      {children}
    </Ctx>
  );
}
