/**
 * THE SHELL — five tabs, chosen for a person holding a phone in a stock room.
 *
 * Kova's Shell swaps nav by persona. Tessa's does not, and the difference is a
 * real product decision rather than an omission: everyone who uses Tessa works
 * at the same centre and moves between its rooms. A stock keeper covering the
 * CSSD on a Friday should see the CSSD tab, not be told it does not exist —
 * their PERMISSIONS already decide what they can do once they are there, and the
 * server enforces those. Hiding whole surfaces from staff who occasionally need
 * them is how people end up using paper.
 *
 * What the tabs are, and why these five:
 *
 *   Today   what needs attention now — expiring stock, loads waiting to be
 *           released, cases still open. The one screen worth opening cold.
 *   Stock   the shelf.
 *   CSSD    trays and loads — the reprocessing loop.
 *   Cases   what was used, and the reverse trace.
 *   Scan    not a tab: the centre action, because every flow starts with it.
 *
 * The scan button sits in the middle of the nav rather than in a corner. It is
 * pressed more than everything else combined, and it has to be reachable with a
 * thumb while the other hand is holding a box.
 */

import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppBar, Archive, Avatar, Badge, BottomTabs, Button, NavRail, ClipboardList, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Home, RotateCcw, ScanLine, TrendingUp, type TabDef } from "@4dl/ui";
import { useSession } from "./session.js";
import { NotificationBell } from "./Notifications.js";
import { useI18n, useT } from "./i18n.js";
import { Insights } from "./screens/Insights.js";
import { ScanSheet } from "./screens/ScanSheet.js";
import { Today } from "./screens/Today.js";
import { Stock } from "./screens/Stock.js";
import { Cssd } from "./screens/Cssd.js";
import { Cases } from "./screens/Cases.js";



export function Shell() {
  const { ctx, signOut } = useSession();
  const t = useT();
  const { locale, locales, setLocale } = useI18n();
  const nav = useNavigate();
  const location = useLocation();
  const [scanning, setScanning] = useState(false);

  // Built per render rather than at module scope: the labels are translated,
  // and a module-level constant would freeze whichever locale loaded first.
  const TABS: TabDef[] = [
    { key: "today", label: t("nav.today"), icon: Home },
    { key: "stock", label: t("nav.stock"), icon: Archive },
    { key: "cssd", label: t("nav.cssd"), icon: RotateCcw },
    { key: "cases", label: t("nav.cases"), icon: ClipboardList },
    { key: "insights", label: t("nav.insights"), icon: TrendingUp },
  ];
  const tab = location.pathname.split("/")[1] || "today";
  const gate = ctx?.active?.gate;
  const name = ctx?.active?.name ?? t("app.name");

  return (
    /*
      `md:pl-24` and no bottom padding past `md` — the rail's width, and the
      island's room given back.

      Tessa had NO desktop navigation at all: `BottomTabs` is `md:hidden` inside
      `@4dl/ui`, so from 768 up this app rendered a floating phone island and
      then, above it, nothing. §11.4 rule 7 — "a mobile affordance does not
      survive a wider viewport" — with the affordance being the only navigation
      there was. Kova has swapped to the rail at `md` since it was built; this
      is the same two lines, and the same `NavRail` from the same package.

      A centre runs on a bench tablet AND on the office desktop, so this is not
      a hypothetical width for this product.
    */
    <div className="min-h-dvh pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-24">
      <AppBar
        leading={<span className="truncate text-body-lg font-semibold">{name}</span>}
        trailing={
          <>
            {/**
             * The standing banner, compressed to a chip.
             *
             * `readOnly` still serves the whole app — reads are never withheld
             * over a bill (TESSA.md inherits Kova's ladder), so this says what is
             * true rather than replacing the screen. `blocked` is a different
             * matter and is handled before the Shell ever mounts.
             */}
            {gate?.readOnly && <Badge tone="warning">{t("shell.readOnly")}</Badge>}
            {/* The bell. A CSSD is a place where the thing you most need to know
                — a load failed its biological, and trays are already out — is
                learned by somebody who is not at the machine. */}
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full" aria-label={t("shell.account")}>
                  <Avatar name={ctx?.user?.name ?? ctx?.user?.email ?? "?"} src={ctx?.user?.image ?? undefined} className="size-8" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{ctx?.user?.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {/* The language switcher lives here rather than in a settings
                    screen: a person who has landed in the wrong language cannot
                    read the path to a settings screen. */}
                {locales.map((l) => (
                  <DropdownMenuItem key={l.code} onSelect={() => setLocale(l.code)}>
                    {l.code === locale ? `✓ ${l.label}` : l.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => nav("/settings")}>{t("shell.settings")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void signOut()}>{t("shell.signOut")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {tab === "today" && <Today onScan={() => setScanning(true)} />}
      {tab === "stock" && <Stock />}
      {tab === "cssd" && <Cssd />}
      {tab === "cases" && <Cases />}
      {tab === "insights" && <Insights />}

      {/**
       * The scan button, floating above the tab bar. Deliberately NOT a fifth
       * tab: a tab implies a place you go and stay, and scanning is a thing you
       * do to whatever screen you are already on.
       */}
      {/*
        Centred above the tab island on a phone; bottom-RIGHT once the island is
        gone.

        The position was written for the island and only for it — at ≥md the
        island is `md:hidden`, so the first desktop photograph of this app
        showed a green circle floating in the middle of empty space, anchored to
        chrome that was not there. It cannot simply be hidden: scanning has to
        be reachable from every tab, and the Scan tile on Today is only on
        Today. Bottom-right is where a floating action sits when nothing is
        under it.
      */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 flex justify-center md:bottom-8 md:left-auto md:right-8 md:justify-end">
        <Button
          size="lg"
          className="pointer-events-auto size-14 rounded-full p-0 shadow-glow"
          aria-label={t("nav.scan")}
          onClick={() => setScanning(true)}
        >
          <ScanLine className="size-6" />
        </Button>
      </div>

      <BottomTabs tabs={TABS} active={tab} onSelect={(k) => nav(k === "today" ? "/" : `/${k}`)} />
      {/* The SAME tab definitions — one navigation drawn twice, never two lists
          that drift. `brand` is the centre's own initial, which is what the app
          bar carries too. */}
      <NavRail
        tabs={TABS}
        active={tab}
        onSelect={(k) => nav(k === "today" ? "/" : `/${k}`)}
        brand={name.charAt(0).toUpperCase()}
      />
      {scanning && <ScanSheet onClose={() => setScanning(false)} />}
    </div>
  );
}
