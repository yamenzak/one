/**
 * TESSA'S SESSION — `@4dl/app-kit`'s runtime, told which app it is.
 *
 * The package owns the hard parts: the pre-auth host probe and its five doors,
 * the context cache that keeps a cold start with no signal from looking like a
 * sign-out, the 401 handler that clears both state and cache, and the tenant
 * switch that navigates rather than mutating a session. None of that is Tessa's
 * to reimplement.
 *
 * What Tessa supplies is its context SHAPE and its storage namespace.
 */

import { appStorage, createSession } from "@4dl/app-kit";

/** What `/api/context` sends. Kept in step with `context-routes.ts` by hand —
 *  there is no shared protocol package for Tessa yet. */
export interface TessaUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: string;
}

/** The workspace this HOST belongs to, plus what this person may do in it. */
export interface ActiveWorkspace extends Workspace {
  permissions: Record<string, string[]>;
  gate: { readOnly?: boolean; blocked?: boolean; reason?: string } | null;
}

export interface TessaContext {
  user: TessaUser;
  workspaces: Workspace[];
  active: ActiveWorkspace | null;
  isPlatformAdmin: boolean;
  branding: { name?: string; logoUrl?: string; iconUrl?: string } | null;
}

/**
 * The theme key is on the KEEP list, so signing out does not throw someone back
 * to a light-mode flash on a phone that has been dark since it was unboxed. It
 * says nothing about who they were.
 */
// Matches the anti-flash script in index.html — one key, two readers.
export const storage = appStorage("tessa", ["tessa-theme"]);

export const { SessionProvider, useSession, useOnline } = createSession<TessaContext>({
  storage,
  tenantsOf: (ctx) => ctx.workspaces.map((w) => ({ tenantId: w.id, slug: w.slug })),
});

/**
 * May the signed-in person do this?
 *
 * A COURTESY, never a control — the server re-checks every one of these at the
 * route, and this only decides whether a button is drawn. Its real job is the
 * inverse: not drawing a Release button for a stock keeper who can only ever get
 * a 403 from it.
 */
export function useCan(): (resource: string, action: string) => boolean {
  const { ctx } = useSession();
  const perms = ctx?.active?.permissions ?? {};
  return (resource, action) => (perms[resource] ?? []).includes(action);
}
