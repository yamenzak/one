/**
 * A WORKSPACE'S OWN ADDRESS — the product, and the product only.
 *
 * ⚠️ THE FIVE AREAS ARE GONE FROM THE BAR. People, money, settings, trust and a
 * cross-app home used to be the permanent nav here, with each product filed
 * underneath them — so the thing somebody signed in to use was one level below
 * four things they visit twice a year, and every one of those four was
 * unreachable from any other door. They are OneSpace's now, over every screen,
 * from every door; what is left in the nav is what the product declared.
 *
 * ⚠️ THE SHELL IS THE PLATFORM'S; THE SCREEN'S CONTENT IS THE APP'S. Routing,
 * chrome, reachability and the switcher are decided out here — see
 * `AppSurface`.
 *
 * ⚠️ AND THE ROUTE THE SPACE IS AT NEVER REACHES THIS FILE. `beneath` in
 * `nav.ts` holds the last address that was not OneSpace's, so opening OneSpace
 * does not quietly change the product underneath it.
 */

import {
  Await, Band, Crown, Face, Layout, Shell, Spacer, TYPE, Working, placeFace, whoFace,
} from "@engine/design";
import type { ScreenSpec } from "@engine/kernel";
import { Button } from "@heroui/react";
import { useSession } from "../session.js";
import { AppSurface } from "./AppSurface.js";
import { Choose } from "./Choose.js";
import { useCentre, useLoad, type InboxView } from "./data.js";
import { parseStop } from "./route.js";

export function Product({ path, onGo, onOpenSpace, onOpenInbox }: {
  readonly path: string;
  readonly onGo: (path: string) => void;
  readonly onOpenSpace: () => void;
  readonly onOpenInbox: () => void;
}) {
  const { me } = useSession();
  const { of, again } = useCentre();
  /* ⚠️ Polled gently, so the badge is honest without a socket. */
  const inbox = useLoad<InboxView>("inbox.list");
  const unread = inbox.of.status === "ready" ? inbox.of.data.unseen : undefined;
  const person = me && me !== "nobody" ? me : null;
  const email = person?.email ?? undefined;

  return (
    <Await
      of={of}
      waiting={<div className="min-h-svh grid place-items-center"><Working says="Opening your workspace" /></div>}
      again={again}
      then={(view) => {
        const stop = parseStop(path, view.apps.map((a) => a.id));
        const app = stop.kind === "app"
          ? view.apps.find((a) => a.id === stop.app) ?? null
          : null;
        const route = stop.kind === "app" ? stop.route : "/";

        /* ⚠️ No product open: no product's nav either. A shell drawn around a
           chooser would put one app's five destinations over the choice of
           which app somebody wants. */
        if (!app) {
          return (
            /* ⚠️ THE WORKSPACE'S OWN PLANET, LIKE EVERY OTHER SCREEN OF IT.
               This named `glow` by hand — the one surface in the product that
               chose its own ground, which is what `groundOf` says must never
               happen — so the door INTO a workspace was the one place that
               workspace's world was absent.

               ⚠️ AND IT NAMES THE SUBJECT RATHER THAN BUILDING THE WORLD.
               `Layout` derives the ground, the density and the subject context
               from one face; a screen calling `worldFor` itself is a second
               derivation of one fact, which `scripts/scene.test.mjs` refuses. */
            <Layout subject={placeFace(view.tenant.slug)}>
              {/* ⚠️ THE SAME LEAD EVERY OTHER CROWN HAS. This screen used to
                  hand-assemble an `aside` from a face and an email — the `You`
                  helper — which is how the one screen with no product open came
                  to draw somebody differently from every screen that has one. */}
              <Crown
                who={{
                  name: email ?? "You",
                  face: person ? whoFace(person.accountId) : undefined,
                  onOpen: onOpenSpace,
                }}
                name={view.tenant.name}
                under="One"
              />
              <Band width="read"><div className="py-2"><Choose view={view} onGo={onGo} /></div></Band>
              <Spacer />
            </Layout>
          );
        }

        const screens: readonly ScreenSpec[] = app.screens.map((s) => ({
          ...s, route: `/${app.id}${s.route === "/" ? "" : s.route}`,
        }));

        return (
          <Shell
            screens={screens}
            here={path}
            held={new Set(app.permissions)}
            /* ⚠️ WHAT THE WORKSPACE IS, so a business-only screen is not offered
               to one that is not — the same question the gate asks, in the same
               order (D21). */
            kind={view.tenant.kind ?? "personal"}
            crown={{
              appId: app.id,
              appName: app.name,
              appMark: app.mark,
              tenantName: view.tenant.name,
              /* ⚠️ The switcher lists the OTHER products — a button back to
                 where you already are is a control that does nothing. */
              apps: view.apps.filter((a) => a.id !== app.id)
                .map((a) => ({ id: a.id, name: a.name, mark: a.mark })),
              unread,
              personEmail: email,
              personFace: person ? whoFace(person.accountId) : undefined,
            }}
            onGo={onGo}
            onSwitchApp={(id) => onGo(`/${id}`)}
            onOpenInbox={onOpenInbox}
            onOpenSpace={onOpenSpace}
          >
            <AppSurface app={app} route={route} />
          </Shell>
        );
      }}
    />
  );
}

