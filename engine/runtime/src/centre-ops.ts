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
import { PUBLIC, offlineBook, sellableKeys } from "@engine/kernel";
import { tenantById } from "./directory.js";
import { memberFor, rolesFor } from "./membership.js";
import type { PlatformCtx } from "./member-ops.js";
import type { Resolved } from "./compose.js";

/** The declarative slice of one app the page may hold. */
const publicFace = (
  a: AppSpec, permissions: readonly string[], roles: readonly string[],
  flags: Readonly<Record<string, boolean>>,
) => ({
  id: a.id,
  name: a.name,
  mark: a.mark,
  /*
    ⚠️ A SCREEN BEHIND A SWITCH THAT IS OFF DOES NOT TRAVEL. It used to travel
    whole: a manifest could put a screen behind a flag, the declaration refused
    to be anything else, and the surface sent every one of them — so the nav
    offered `/search` to everybody while the flag it named changed nothing. A
    screen the page never receives is a screen with no nav row, no route and no
    way to reach it by typing, which is the same three answers the gate gives.

    ⚠️ AND IT IS FILTERED HERE RATHER THAN IN THE PAGE. The client would have to
    be trusted with it, and a client that forgets draws a destination the server
    refuses — the failure this whole seam exists to make impossible (D15).
  */
  screens: a.screens.filter((s) => !s.flag || flags[s.flag] === true),
  settings: a.settings ?? {},
  notifications: a.notifications ?? {},
  documents: a.documents ?? {},
  processors: a.processors ?? {},
  /* ⚠️ WHERE ITS RECORDS ACTUALLY SIT. The same declaration the reconciler
     provisions from, carried to the Data & Trust screen — a privacy notice
     whose "where is it kept" half is derived rather than written. */
  needs: a.needs ?? {},
  permissions,
  /* ⚠️ The role NAMES — declared and this workspace's own — so the People
     screen offers real choices and the gate never has to refuse a typo. */
  roles,
  /* What a package may sell here, so the composer cannot offer a key that
     would be refused at composition. */
  sellable: [...sellableKeys(a)],
  /*
    ⚠️ WHAT A PHONE MAY DO WITH NO SIGNAL, PER OPERATION. The door has to hold a
    write or answer a read from what it last saw, and it cannot work out for
    itself which calls those are — a door deciding would be a second answer to a
    question `offline` already settles, and the wrong direction of wrong: a read
    answered from a stale copy nobody declared cacheable is last week's numbers
    with nothing saying so.
  */
  offline: offlineBook(a.collections),
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
          ctx.flags,
        )));

      return {
        /* ⚠️ THE KIND TRAVELS WITH THE NAME. The chrome decides what to offer
           from it, and asking separately would be a second round trip on the one
           read every screen in a workspace already stands on. */
        tenant: {
          name: tenant?.name ?? "",
          slug: tenant?.slug ?? "",
          kind: tenant?.kind ?? "personal",
        },
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
