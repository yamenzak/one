/**
 * THE ROUTE SEAM, auth's side.
 *
 * `@4dl/tenancy` needed one of these to ship routes without importing auth (see
 * its `route-deps.ts` for the full reasoning). Auth needs the mirror image for a
 * different reason: its own route modules must not assume an app's `Env` shape
 * or its context variables, only the slice they read.
 *
 * Deliberately NOT imported from tenancy, even though the two look alike. Auth
 * already depends on tenancy, so sharing the type would work — but it would make
 * an app that wants auth and no tenancy impossible, and "nothing depends on more
 * than it needs" is the rule the whole extraction rests on.
 */

import type { Context } from "hono";
import type { HasDb, HasEnvironment } from "@4dl/core";

export type RouteEnv = {
  Bindings: HasDb & HasEnvironment & { ADMIN_EMAILS?: string };
  Variables: { user?: { id: string; email?: string | null } | null };
};

export type RouteContext = Context<RouteEnv>;

export interface RouteGuards {
  /** Platform operator — an allowlist, a separate axis from tenant RBAC. */
  isPlatformAdmin: (c: RouteContext) => boolean;
}
