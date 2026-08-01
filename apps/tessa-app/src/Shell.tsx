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
import { AppBar, Archive, Avatar, Badge, BottomTabs, Button, ClipboardList, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Home, RotateCcw, ScanLine, type TabDef } from "@4dl/ui";
import { useSession } from "./session.js";
import { useI18n, useT } from "./i18n.js";
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
  ];
  const tab = location.pathname.split("/")[1] || "today";
  const gate = ctx?.active?.gate;
  const name = ctx?.active?.name ?? t("app.name");

  return (
    <div className="min-h-dvh pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
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

      {/**
       * The scan button, floating above the tab bar. Deliberately NOT a fifth
       * tab: a tab implies a place you go and stay, and scanning is a thing you
       * do to whatever screen you are already on.
       */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 flex justify-center">
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
      {scanning && <ScanSheet onClose={() => setScanning(false)} />}
    </div>
  );
}
