/**
 * THE OPERATOR CONSOLE — the deployment looking at itself, on `admin.`
 *
 * ⚠️ THE SAME SHELL AS THE CENTRE, AND THAT IS THE POINT. An operator surface
 * built out of its own chrome is a second design nobody maintains; this is the
 * same `Shell`, the same Island, the same four-outcome loads — pointed at the
 * deployment instead of at a workspace.
 *
 * ⚠️ AND EVERY SCREEN HERE IS ABOUT US, NOT ABOUT THEM. Tenants and their
 * standing, the flags we have switched on, the jobs nobody watches, the shards
 * and their room, and the switch that closes every door. What a workspace's own
 * people manage lives behind their own address.
 */

import { useCallback, useEffect, useState } from "react";
import type { ScreenSpec } from "@quad/kernel";
import { Await, Shell, Working } from "@quad/web";
import { useSession } from "../session.js";
import { useLoad } from "../centre/data.js";
import { Tenants } from "./Tenants.js";
import { Switches } from "./Switches.js";
import { Works } from "./Works.js";
import { Ground } from "./Ground.js";

/* ⚠️ Four destinations, and they are the operator's whole world. The kernel's
   ceiling is five; a fifth here would be a screen somebody invented. */
export type Stop = "tenants" | "switches" | "works" | "ground";

export const STOPS: readonly { readonly id: Stop; readonly route: string; readonly label: string; readonly icon: string }[] = [
  { id: "tenants", route: "/", label: "Tenants", icon: "people" },
  { id: "switches", route: "/switches", label: "Switches", icon: "settings" },
  { id: "works", route: "/works", label: "Works", icon: "list" },
  { id: "ground", route: "/ground", label: "Ground", icon: "package" },
];

/** ⚠️ Pure, and every path answers — an unknown one is the first screen. */
export const stopFor = (path: string): Stop => {
  const clean = path.replace(/\/+$/, "") || "/";
  return STOPS.find((s) => s.route === clean)?.id ?? "tenants";
};

export function Console() {
  const { me } = useSession();
  const [path, setPath] = useState(() => location.pathname);
  /* ⚠️ The console asks whether this person is an operator by ASKING FOR
     something only an operator may have. A page that decided for itself would
     be a second answer to a question the deployment already owns. */
  const gate = useLoad<{ mode: string }>("op.maintenance");

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

  const screens: readonly ScreenSpec[] = STOPS.map((s) => ({
    id: s.id, route: s.route, label: s.label, icon: s.icon,
    nav: "primary" as const, permission: "operator",
  }));

  return (
    <Await
      of={gate.of}
      waiting={<div className="min-h-dvh grid place-items-center"><Working says="Opening the console" /></div>}
      again={gate.again}
      then={() => {
        const at = stopFor(path);
        return (
          <Shell
            screens={screens}
            here={STOPS.find((s) => s.id === at)?.route ?? "/"}
            held={new Set(["operator"])}
            crown={{
              appName: "Operator",
              appMark: "◇",
              tenantName: "One",
              personEmail: me && me !== "nobody" ? me.email ?? undefined : undefined,
            }}
            onGo={go}
          >
            {at === "tenants" ? <Tenants /> : null}
            {at === "switches" ? <Switches /> : null}
            {at === "works" ? <Works /> : null}
            {at === "ground" ? <Ground /> : null}
          </Shell>
        );
      }}
    />
  );
}
