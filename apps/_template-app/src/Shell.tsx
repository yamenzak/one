/**
 * THE SHELL — the app chrome, and the three things every 4DL Shell must carry.
 *
 * ⚠️ **The nav is the app's, and only the nav.** Whether tabs swap by persona is
 * a product decision — Kova's do, Tessa's deliberately do not — which is why
 * this file stays per-app and is not in a package. Everything ELSE below is the
 * same in every product and is here because each one was, at some point,
 * missing from an app that shipped:
 *
 *   THE MAINTENANCE STRIP. `platform.maintenance = "readonly"` refuses every
 *   write deployment-wide. The operator panel for it shipped in all three
 *   consoles; two apps rendered nothing, so turning it on refused every write
 *   with no explanation anywhere in the product.
 *
 *   THE STANDING CHIP. `gate.readOnly` is rung one of the dunning ladder — the
 *   app is fully served and writes are refused. Say so. (`gate.blocked` is rung
 *   two and never reaches here: `pickScreen` replaces the screen before the
 *   Shell mounts.)
 *
 *   THE BELL. See `Notifications.tsx`.
 *
 * ── The desktop half is not optional ────────────────────────────────────────
 *
 * `BottomTabs` is `md:hidden` inside `@4dl/ui`, so an app that renders only it
 * has NO navigation at all from 768px up — a floating phone island and then
 * nothing. Tessa shipped exactly that. `NavRail` takes the same `TabDef[]`: one
 * navigation drawn twice, never two lists that drift.
 */

import { useLocation, useNavigate } from "react-router-dom";
import {
  AppBar,
  Avatar,
  Badge,
  BottomTabs,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Home,
  NavRail,
  Users,
  type TabDef,
} from "@4dl/ui";
// Product iconography from lucide directly — `@4dl/ui`'s set is curated to what
// the PLATFORM needs, and re-exporting every icon through it would make the
// package a lucide fork. Same source, same component type.
import { FileText } from "lucide-react";
import { adminUrl, MaintenanceBanner } from "@4dl/app-kit";
import { useSession } from "./session.js";
import { NotificationBell } from "./Notifications.js";
import { Today } from "./screens/Today.js";
import { Records } from "./screens/Records.js";
import { Team } from "./screens/Team.js";

/** Replace these with the product's own. Three to five is the useful range: a
 *  sixth tab is a menu wearing a tab bar's clothes. */
const TABS: TabDef[] = [
  { key: "today", label: "Today", icon: Home },
  { key: "records", label: "Records", icon: FileText },
  { key: "team", label: "Team", icon: Users },
];

export function Shell() {
  const { ctx, host, signOut } = useSession();
  const nav = useNavigate();
  const location = useLocation();

  const tab = location.pathname.split("/")[1] || "today";
  const gate = ctx?.active?.gate;
  const name = ctx?.active?.name ?? "Template";

  return (
    /*
      `md:pl-24` and no bottom padding past `md` — the rail's width, and the
      island's room given back.
    */
    <div className="min-h-dvh pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-24">
      {/* ABOVE the bar, because it is the wider truth: a `readonly` maintenance
          window is about the whole platform, not this tenant's standing. `full`
          never reaches here — `pickScreen` swaps the screen first. */}
      <MaintenanceBanner state={host?.maintenance} />
      <AppBar
        leading={<span className="truncate text-body-lg font-semibold">{name}</span>}
        trailing={
          <>
            {gate?.readOnly && <Badge tone="warning">Read-only</Badge>}
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full" aria-label="Account">
                  <Avatar name={ctx?.user?.name || ctx?.user?.email || "?"} src={ctx?.user?.image ?? undefined} className="size-8" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{ctx?.user?.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => nav("/settings")}>Settings</DropdownMenuItem>
                {/*
                  ⚠️ THE CONSOLE IS A FULL PAGE LOAD TO ANOTHER ORIGIN, not a
                  route. `/api/admin/*` answers on the `admin.` door and nowhere
                  else, so a router navigation here would render the whole
                  console and then 404 on every call — which both other apps
                  shipped, and which is invisible in dev where one root means the
                  door check correctly stands down.
                */}
                {ctx?.isPlatformAdmin && host && (
                  <DropdownMenuItem onSelect={() => { window.location.href = adminUrl(host.rootDomain); }}>
                    Platform admin
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => void signOut()}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {tab === "today" && <Today />}
      {tab === "records" && <Records />}
      {tab === "team" && <Team />}

      <BottomTabs tabs={TABS} active={tab} onSelect={(k) => nav(k === "today" ? "/" : `/${k}`)} />
      {/* The SAME definitions. `brand` is the tenant's own initial, which is what
          the app bar carries too. */}
      <NavRail
        tabs={TABS}
        active={tab}
        onSelect={(k) => nav(k === "today" ? "/" : `/${k}`)}
        brand={name.charAt(0).toUpperCase()}
      />
    </div>
  );
}
