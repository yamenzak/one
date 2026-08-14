/**
 * THE TENANT CENTRE — one shell behind a workspace's own address.
 *
 * ⚠️ FIVE FIXED AREAS, THEN THE APPS (D10). The nav is the five; each enabled
 * product's own screens render inside the SAME shell under `/<app>/…`, with the
 * switcher in the crown — so an app ships collections, operations, screens for
 * its own logic and words, and no people screen, no billing screen, no settings
 * screen, no consent screen. Those exist once, here.
 *
 * ⚠️ THE ROUTER IS THE BROWSER'S HISTORY AND A PURE PARSE. `parseStop` decides
 * what a path means (testable with no DOM); this file only pushes and listens.
 * Moving between DOORS is still a full page load — those are different origins.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ScreenSpec } from "@quad/kernel";
import { Await, Shell, Trouble, Working } from "@quad/web";
import { useSession } from "../session.js";
import { accountUrl } from "../door.js";
import { useCentre, type CentreApp, type CentreView, type InboxView } from "./data.js";
import { useLoad } from "./data.js";
import { areasFor, parseStop, type Stop } from "./route.js";
import { Home } from "./Home.js";
import { People } from "./People.js";
import { Money } from "./Money.js";
import { SettingsArea } from "./SettingsArea.js";
import { Trust } from "./Trust.js";
import { InboxScreen } from "./InboxScreen.js";
import { AppSurface } from "./AppSurface.js";

/* ----------------------------------------------------------------- history --- */

function usePath(): readonly [string, (path: string) => void] {
  const [path, setPath] = useState(() => location.pathname);
  useEffect(() => {
    const read = () => setPath(location.pathname);
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const go = useCallback((next: string) => {
    if (next === location.pathname) return;
    history.pushState(null, "", next);
    setPath(next);
  }, []);
  return [path, go] as const;
}

/* ------------------------------------------------------------------- shell --- */

/** The synthetic key that marks "anybody in the workspace" on a centre area. */
const HERE = "centre:here";

export function Centre() {
  const { where, me, leave } = useSession();
  const { of, again } = useCentre();
  const [path, go] = usePath();

  /* ⚠️ Polled gently, so the badge is honest without a socket. */
  const inbox = useLoad<InboxView>("inbox.list");

  return (
    <Await
      of={of}
      waiting={<div className="min-h-dvh grid place-items-center"><Working says="Opening your workspace" /></div>}
      again={again}
      then={(view) => {
        const stop = parseStop(path, view.apps.map((a) => a.id), new Set(view.you.platform));
        const app = stop.kind === "app" ? view.apps.find((a) => a.id === stop.app) ?? null : null;

        return (
          <CentreShell
            view={view}
            app={app}
            stop={stop}
            here={path}
            unread={inbox.of.status === "ready" ? inbox.of.data.unseen : null}
            onGo={go}
            onAccount={() => { if (where) location.assign(accountUrl(where, location)); }}
            onSignOut={() => { void leave().then(() => location.assign("/")); }}
            email={me && me !== "nobody" ? me.email : null}
          >
            {stop.kind === "app" && app
              ? <AppSurface app={app} route={stop.route} />
              : stop.kind === "area" && stop.area === "home"
                ? <Home view={view} unread={inbox.of.status === "ready" ? inbox.of.data.unseen : null} onGo={go} />
                : stop.kind === "area" && stop.area === "people"
                  ? <People view={view} />
                  : stop.kind === "area" && stop.area === "money"
                    ? <Money view={view} />
                    : stop.kind === "area" && stop.area === "settings"
                      ? <SettingsArea view={view} />
                      : stop.kind === "area" && stop.area === "trust"
                        ? <Trust view={view} where={where} />
                        : <InboxScreen onGo={go} onSeen={inbox.again} />}
          </CentreShell>
        );
      }}
    />
  );
}

/* ⚠️ Exported for the guard: every stop the parser can produce has a branch
   above — a stop with no branch renders a blank page. */
export const STOP_BRANCHES: readonly string[] =
  ["app", "home", "people", "money", "settings", "trust", "inbox"];

function CentreShell({ view, app, stop, here, unread, onGo, onAccount, onSignOut, email, children }: {
  readonly view: CentreView;
  readonly app: CentreApp | null;
  readonly stop: Stop;
  readonly here: string;
  readonly unread: number | null;
  readonly onGo: (path: string) => void;
  readonly onAccount: () => void;
  readonly onSignOut: () => void;
  readonly email: string | null;
  readonly children: React.ReactNode;
}) {
  void stop;
  void onAccount;
  void onSignOut;
  const platform = useMemo(() => new Set([...view.you.platform, HERE]), [view.you.platform]);

  /*
    ⚠️ ONE NAV GRAMMAR FOR BOTH CONTEXTS. In the centre the five areas are the
    screens; inside a product its declared screens are — same shell, same
    reachability rule (a destination somebody cannot reach is not drawn), so
    switching apps changes the WORLD without changing the furniture.
  */
  const screens: readonly ScreenSpec[] = app
    ? app.screens.map((s) => ({ ...s, route: `/${app.id}${s.route === "/" ? "" : s.route}` }))
    : areasFor(platform).map((a) => ({
      id: a.area, route: a.route, label: a.label, nav: "primary" as const,
      permission: a.needs ?? HERE,
    }));

  const held = app ? new Set(app.permissions) : platform;

  return (
    <Shell
      screens={screens}
      here={here}
      held={held}
      crown={{
        appName: app ? app.name : "One",
        appMark: app ? app.mark : "◇",
        tenantName: view.tenant.name,
        /* ⚠️ The switcher lists the OTHER places to be: every product, and the
           centre itself when a product is open. */
        apps: [
          ...(app ? [{ id: "", name: "Workspace", mark: "◇" }] : []),
          ...view.apps.filter((a) => a.id !== app?.id)
            .map((a) => ({ id: a.id, name: a.name, mark: a.mark })),
        ],
        unread: unread ?? undefined,
        personEmail: email ?? undefined,
      }}
      onGo={onGo}
      onSwitchApp={(id) => onGo(id === "" ? "/" : `/${id}`)}
      onOpenInbox={() => onGo("/inbox")}
    >
      {children}
    </Shell>
  );
}
