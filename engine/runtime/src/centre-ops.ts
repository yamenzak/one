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

import type { Allowance, AnyOperation, AppSpec, Gate, TenantId } from "@engine/kernel";
import { PUBLIC, included, mayBrand, offlineBook, outcomeBook, sellableKeys } from "@engine/kernel";
import { brandingOf } from "./branding.js";
import { tenantById } from "./directory.js";
import { memberFor, rolesFor } from "./membership.js";
import type { PlatformCtx } from "./member-ops.js";
import type { Resolved } from "./compose.js";

/** The declarative slice of one app the page may hold. */
const publicFace = (
  a: AppSpec, permissions: readonly string[], roles: readonly string[],
  flags: Readonly<Record<string, boolean>>,
  allowance: (key: string) => Allowance,
  mayCall: (spec: AnyOperation) => Gate | null,
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
  /*
    ⚠️ AND NEITHER DOES A SCREEN THE PLAN DOES NOT INCLUDE. Same three answers,
    for the reason a flag gives them: a screen the page never receives has no nav
    row, no route and no way in by typing. What differs is who it is about — a
    flag is ours and a feature is theirs — and that difference belongs in the
    MONEY area, which sells the plan, rather than in a nav row that offers a
    destination and then apologises.
  */
  screens: a.screens.filter((s) => (!s.flag || flags[s.flag] === true)
    && (!s.features || s.features.some((k) => included(allowance(k))))),
  settings: a.settings ?? {},
  notifications: a.notifications ?? {},
  documents: a.documents ?? {},
  processors: a.processors ?? {},
  /* ⚠️ WHERE ITS RECORDS ACTUALLY SIT. The same declaration the reconciler
     provisions from, carried to the Data & Trust screen — a privacy notice
     whose "where is it kept" half is derived rather than written. */
  needs: a.needs ?? {},
  /* ⚠️ THE CHECKLIST AND WHAT IS WORTH CONGRATULATING, WITH EVERY OTHER
     DECLARATIVE SLICE. What is TICKED is a separate read (`guide.view`), because
     the rules never change and the progress changes on every write — sending
     both together would put a per-workspace count inside the payload every
     screen caches. */
  guide: a.guide ?? {},
  milestones: a.milestones ?? {},
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
  /*
    ⚠️ WHAT A WRITE SAYS WHEN IT WORKED, AND WHAT IT MADE STALE. Both belong to
    the operation rather than to whichever screen pressed the button: two screens
    calling one operation would otherwise be two answers to what just happened,
    and the list a write invalidates is often on neither of them.
  */
  outcomes: outcomeBook(a.operations),
  /*
    ⚠️ WHICH GATE WOULD STOP EACH OPERATION, FOR THIS CALLER, RIGHT NOW — and it
    is the SAME walk the request's own gate ran. Without it a screen decides for
    itself which controls to draw, which is a second opinion about access: the
    control is drawn, pressed, and fails, so the refusal arrives as a toast over
    a form somebody has already filled in.

    ⚠️ THE GATE, NOT A BOOLEAN. "You cannot yet" and "your plan does not include
    this" want different controls — one is disabled and the other is an offer —
    and a screen handed `false` can only draw the first.

    ⚠️ ONLY WHAT IS BLOCKED TRAVELS. Fifty operations is fifty keys on every
    boot, almost all of them `null`; absent means allowed, which is also the
    reading a client that forgets the field falls into.
  */
  may: Object.fromEntries(a.operations
    .map((o) => [o.id, mayCall(o)] as const)
    .filter(([, gate]) => gate !== null)),
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

      const [tenant, member, branding] = await Promise.all([
        tenantById(ctx.directory, ctx.tenantId as TenantId),
        memberFor(ctx.db, ctx.tenantId as TenantId, ctx.accountId as never),
        /* ⚠️ THE DIRECTORY, NOT THE SHARD. A workspace's identity is read on
           the pre-auth doors and before any shard is located — see
           `BRANDING_SCHEMA`'s place in `DIRECTORY_MODULES`. */
        brandingOf(ctx.directory, ctx.tenantId as TenantId),
      ]);
      /* ⚠️ ENTITLED TO ONE, AND ASKED FOR IT ON THIS SURFACE. `mayBrand` says a
         business may have an identity at all; the surface list says where it
         wanted it, and reading only the first is how a switch comes to save and
         change nothing. */
      const theirs = mayBrand(tenant?.kind ?? "personal")
        && branding?.surfaces.includes("shell")
        ? branding
        : null;

      const apps = await Promise.all(ctx.enabledApps
        .map((id) => ctx.appOf(id))
        .filter((a): a is AppSpec => !!a)
        .map(async (a) => publicFace(
          a,
          [...(await ctx.permissionsIn(a.id))],
          Object.keys(await rolesFor(ctx.db, ctx.tenantId as TenantId, a.id, a.access.roles)),
          ctx.flags,
          /* ⚠️ THE SAME RESOLVER THE GATE READ FOR THIS REQUEST. A surface
             resolving its own plan would be a second answer to what a workspace
             bought, and the two differ on exactly the key nobody has touched. */
          ctx.allowance,
          /* ⚠️ AND THE SAME WALK, so a control a screen draws and a route the
             gate refuses cannot come apart. */
          ctx.mayCall,
        )));

      return {
        /* ⚠️ THE KIND TRAVELS WITH THE NAME. The chrome decides what to offer
           from it, and asking separately would be a second round trip on the one
           read every screen in a workspace already stands on. */
        tenant: {
          name: tenant?.name ?? "",
          slug: tenant?.slug ?? "",
          kind: tenant?.kind ?? "personal",
          /*
            ⚠️ THE THEME ONLY WHERE THE WORKSPACE MAY BRAND AND ASKED TO, and the
            intersection is resolved HERE rather than on the page. Sending the
            theme with the picks beside it would make every surface in every
            product decide for itself whether to wear it — which is how one
            product ends up branded and the next one beside it is not, on the
            same workspace, with nobody able to say why.

            ⚠️ ABSENT MEANS OURS. A page handed nothing paints nothing, which is
            what a personal workspace and an un-branded business both get.
          */
          ...(theirs ? { theme: theirs.theme } : {}),
          /* ⚠️ WHETHER OUR MARK COMES OFF, which is a different transaction from
             putting theirs on — and ours to answer rather than a product's. */
          ...(theirs?.ourMark === false ? { ourMark: false } : {}),
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
