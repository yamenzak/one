/**
 * THE SESSION — `@4dl/app-kit`'s runtime, told which app it is.
 *
 * The package owns the hard parts, and every one of them is a bug somebody
 * already shipped: the pre-auth host probe and its five doors, the context cache
 * that keeps a cold start with no signal from looking like a sign-out, the 401
 * handler that clears both state and cache, and the tenant switch that NAVIGATES
 * rather than mutating a session (the tenancy is pinned by the hostname, so
 * "switching" without moving origin produces a session pointed at the wrong
 * tenant, which grants nothing and looks like a broken app).
 *
 * What this app supplies is its context SHAPE and its storage namespace.
 */

import { appStorage, createSession } from "@4dl/app-kit";
import type { Branding } from "@4dl/ui";

/** What `/api/context` sends. Keep it in step with the route by hand, or give
 *  the app a `@<app>/protocol` package and share the zod schema. */
export interface AppUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  role: string;
}

/** The tenant this HOST belongs to, plus what this person may do in it. */
export interface ActiveTenant extends Tenant {
  permissions: Record<string, string[]>;
  /**
   * ⚠️ SERIALISE THE GATE BY SPREADING IT (`{ ...host.gate }`) on the server.
   * Hand-picking fields is how `blocked` reached the model, the resolver and the
   * Shell while `/api/host` still sent only `{ readOnly, reason }` — so the app
   * read `gate.blocked` as undefined and rendered the ordinary read-only app to
   * a tenant thirty days past due.
   */
  gate: { readOnly?: boolean; blocked?: boolean; reason?: string } | null;
}

export interface AppContext {
  user: AppUser;
  tenants: Tenant[];
  active: ActiveTenant | null;
  isPlatformAdmin: boolean;
  /**
   * The tenant's brand, as `@4dl/ui` understands it — the SAME type the theme
   * applies, deliberately.
   *
   * Tessa declared a third shape here (`{ name?, logoUrl?, iconUrl? }`) while
   * the server sent `branding_json` and `host-context.ts` narrowed it to
   * something else again: three disagreeing descriptions of one blob, none
   * checked against the consumer. That is how `<ThemeProvider branding={null}>`
   * sat in `main.tsx` for the life of the app, discarding the exact value the
   * settings screen exists to produce.
   */
  branding: Branding | null;
}

/**
 * ⚠️ The theme key is on the KEEP list, and the string matches the anti-flash
 * script in `index.html` and `configureTheme` in `theme.tsx` — three readers,
 * one literal, and nothing checks that they agree.
 *
 * It is kept across sign-out because it says nothing about who someone was, and
 * clearing it throws them back to a light-mode flash on a phone that has been
 * dark since it was unboxed.
 */
export const storage = appStorage("template", ["template-theme"]);

export const { SessionProvider, useSession, useOnline } = createSession<AppContext>({
  storage,
  tenantsOf: (ctx) => ctx.tenants.map((t) => ({ tenantId: t.id, slug: t.slug })),
});

/**
 * May the signed-in person do this?
 *
 * A COURTESY, never a control — the server re-checks every one of these at the
 * route, and this only decides whether a button is drawn. Its real job is the
 * inverse: not drawing a control for somebody who can only ever get a 403 from
 * it.
 */
export function useCan(): (resource: string, action: string) => boolean {
  const { ctx } = useSession();
  const perms = ctx?.active?.permissions ?? {};
  return (resource, action) => (perms[resource] ?? []).includes(action);
}
