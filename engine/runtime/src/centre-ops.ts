/**
 * THE CENTRE'S BOOTSTRAP — one read the tenant door's page stands on.
 *
 * ⚠️ THE PAGE HOLDS NO MANIFEST. The centre is one bundle for every product,
 * so which screens an app declares, which settings it renders, which
 * notifications a person can narrow — all of it arrives from the deployment,
 * which is the only thing that holds the manifests. A page that imported an
 * app's manifest would be a page rebuilt per product, which is the previous
 * platform's four SPAs wearing one URL.
 *
 * ⚠️ ONLY THE DECLARATIVE SLICES TRAVEL. A manifest carries handlers; what
 * leaves the server is data — screens, settings, notification types, legal
 * documents, sub-processors — plus what THIS caller may do, resolved per app
 * by the one resolver (D15). The page then draws exactly what the gate would
 * allow, because both read the same sets.
 */

import type { AppSpec, TenantId } from "@engine/kernel";
import { PUBLIC, sellableKeys } from "@engine/kernel";
import { tenantById } from "./directory.js";
import { memberFor, rolesFor } from "./membership.js";
import type { PlatformCtx } from "./member-ops.js";
import type { Resolved } from "./compose.js";

/** The declarative slice of one app the page may hold. */
const publicFace = (
  a: AppSpec, permissions: readonly string[], roles: readonly string[],
) => ({
  id: a.id,
  name: a.name,
  mark: a.mark,
  screens: a.screens,
  settings: a.settings ?? {},
  notifications: a.notifications ?? {},
  documents: a.documents ?? {},
  processors: a.processors ?? {},
  permissions,
  /* ⚠️ The role NAMES — declared and this workspace's own — so the People
     screen offers real choices and the gate never has to refuse a typo. */
  roles,
  /* What a package may sell here, so the composer cannot offer a key that
     would be refused at composition. */
  sellable: [...sellableKeys(a)],
});

export function centreOps(app: AppSpec): Readonly<Record<string, Resolved>> {
  void app;
  const spec: Resolved = {
    id: "centre.view",
    kind: "read",
    method: "GET",
    path: "/api/centre.view",
    permission: PUBLIC,
    spec: {
      id: "centre.view", kind: "read", summary: "This workspace, and what you may do in it.",
      input: {}, output: {},
      permission: PUBLIC,
      idempotency: { mode: "none" },
      async handler() { return {} as never; },
    } as Resolved["spec"],
    run: async (bare) => {
      const ctx = bare as PlatformCtx;
      if (!ctx.accountId) return (ctx.fail as (c: string) => never)("platform.unauthorized");

      const tenant = await tenantById(ctx.directory, ctx.tenantId as TenantId);
      const member = await memberFor(ctx.db, ctx.tenantId as TenantId, ctx.accountId as never);

      const apps = await Promise.all(ctx.enabledApps
        .map((id) => ctx.appOf(id))
        .filter((a): a is AppSpec => !!a)
        .map(async (a) => publicFace(
          a,
          [...(await ctx.permissionsIn(a.id))],
          Object.keys(await rolesFor(ctx.db, ctx.tenantId as TenantId, a.id, a.access.roles)),
        )));

      return {
        tenant: { name: tenant?.name ?? "", slug: tenant?.slug ?? "" },
        you: {
          accountId: ctx.accountId,
          email: ctx.email,
          platformRole: member?.platformRole ?? null,
          appRoles: member?.appRoles ?? {},
          platform: [...(await ctx.permissionsIn(null))],
        },
        apps,
      };
    },
  };
  return { "centre.view": spec };
}
