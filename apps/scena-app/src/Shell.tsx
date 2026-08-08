/**
 * SCENA'S SHELL — Kova's shell, with Scena's destinations in it.
 *
 * This replaces `DashboardShell`: a 248px labelled sidebar of fifteen items in
 * five groups, a breadcrumb bar, and an inset content panel. That shape was
 * chosen because "a product with twenty-three destinations cannot express them
 * as five tabs" — which was true of the LIST and not of the product. Fifteen
 * sidebar rows is not fifteen destinations; it is five destinations with their
 * parts spelled out.
 *
 * ── The mapping, which is the only real decision here ───────────────────────
 *
 *   Screens    the fleet, and the root
 *   Channels   what is composed and published
 *   Library    slide playlists · music · widget profiles · media · sources · ads
 *   Boards     live boards
 *   Insights   analytics · alerts
 *   ⋯ account  team · billing · settings · admin  (the avatar menu, as in Kova)
 *
 * Six of the old rows moved one tap deeper, into a Library with sub-tabs —
 * which is exactly the shape Kova's own Library already has, and exactly what
 * the sidebar's "Building blocks" group was describing in words. Four moved
 * into the account menu, where Kova puts settings, media and the admin door,
 * because they are things you configure rather than places you work.
 *
 * ── What comes across from Kova, and why each part matters ──────────────────
 *
 *  1. `AppBar` + `BottomTabs` (phone) / `NavRail` (≥md). One nav surface per
 *     width, 3–5 destinations, thumb-reachable on a phone.
 *  2. THE ATMOSPHERE. A 52vh wash of the active destination's tone, masked to
 *     fade, `absolute` rather than `fixed` so it is the top of a space and
 *     scrolls away rather than following you down the page. UI-LANGUAGE §3
 *     names this as most of why the reference apps feel like places.
 *  3. TOKEN AMBIENCE. The active tone rebinds `--primary`/`--ring` for the
 *     content, so every accent on the page speaks that destination's colour.
 *     Scena had one colour for all fifteen rows, so every screen was one room.
 *  4. The account menu on the avatar, with the name beside it at `sm` and up.
 *  5. The standing and maintenance banners ABOVE the bar — the state of the
 *     whole surface, not one more indicator competing for space inside it.
 *
 * ── What stays Scena's ──────────────────────────────────────────────────────
 *
 * The emergency takeover (a siren, not a setting), the plan/credits card, and
 * the theme toggle. All three are in the account menu now rather than a sidebar
 * footer, which is where Kova puts the same class of thing.
 */

import { useEffect, useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AppBar, Avatar, BottomTabs, NavRail, DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, ShellActions, useChrome, cn, type TabDef,
} from "@4dl/ui";
import {
  Siren, LogOut, Sun, Moon, Scale, Users, CreditCard, Settings as SettingsIcon, ShieldCheck,
  Image as ImageIcon, MonitorSpeaker, Tv, Layers, LayoutDashboard, BarChart3,
} from "lucide-react";
import { adminUrl } from "@4dl/app-kit";
import { NotificationBell } from "./Notifications.js";
import { ScenaIcon } from "./brand.js";
import { useTheme } from "./theme.js";
import { LegalDialog, type LegalDoc } from "./legal/content.js";
import type { BillingState, Me } from "./api.js";

/**
 * The five destinations, each with its tone.
 *
 * The tone is not decoration: it drives the nav pill, the page wash and every
 * accent on the screen (`pageVars` below). One per destination, registered in
 * `registry/tones.ts` + `tokens.accents.css`.
 */
/*
  Lucide components, not Scena's own `icons` nodes: `TabDef.icon` is a
  `LucideIcon` because `BottomTabs` and `NavRail` set its stroke weight from the
  active state (2.4 when selected, 2 otherwise), which they can only do to a
  component they render themselves. A pre-rendered node would arrive with its
  weight already baked and the selected tab would not thicken.
*/
export const TABS: TabDef[] = [
  { key: "screens", label: "Screens", icon: MonitorSpeaker, tone: "fleet" },
  { key: "channels", label: "Channels", icon: Tv, tone: "channel" },
  { key: "library", label: "Library", icon: Layers, tone: "blocks" },
  { key: "boards", label: "Boards", icon: LayoutDashboard, tone: "boards" },
  { key: "insights", label: "Insights", icon: BarChart3, tone: "insights" },
];

/**
 * Which destination a path belongs to.
 *
 * The Library's six sub-tabs and Insights' two are their own routes, so the
 * nav has to map them back — otherwise opening the media library would light
 * NOTHING in the nav and the person would be somewhere the app cannot name.
 * That is the failure mode a tab bar has and a sidebar does not, and it is the
 * price of the consolidation; this is where it gets paid.
 */
const OWNER: Record<string, string> = {
  screens: "screens",
  channels: "channels",
  displays: "channels",
  playlists: "library",
  music: "library",
  profiles: "library",
  widgets: "library",
  media: "library",
  feeds: "library",
  ads: "library",
  boards: "boards",
  analytics: "insights",
  alerts: "insights",
};

export function destinationFor(pathname: string): string {
  const seg = pathname.split("/")[1] ?? "";
  return OWNER[seg] ?? "screens";
}

export function Shell({
  me,
  billing,
  emergencyActive,
  onEmergency,
  onSignOut,
  children,
}: {
  me: Me | null;
  billing: BillingState | null;
  emergencyActive: boolean;
  onEmergency: () => void;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const nav = useNavigate();
  const loc = useLocation();
  const { mode, toggleMode } = useTheme();
  const isDark = mode === "dark";
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);
  const chrome = useChrome();
  const current = destinationFor(loc.pathname);
  const activeTone = TABS.find((t) => t.key === current)?.tone;

  /*
    Glass pills on the bar appear only once the page is scrolled off the top,
    and the state resets BEFORE paint on every navigation — a new page always
    opens at the top, and `scroll` will not fire to say so.
  */
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useLayoutEffect(() => { setScrolled(false); }, [loc.pathname]);

  /*
    TOKEN AMBIENCE — the active destination's tone becomes the page's primary.

    `--primary-foreground` has to be rebound too: the brand foreground is fixed
    to the brand primary's polarity, but these tones invert per mode, so leaving
    it produces low-contrast ink on a solid tone button. Each tone names its own
    on-colour (tokens.accents.css); the shared `--tone-foreground` stays as the
    fallback. Scoped to the CONTENT — the nav tints itself.
  */
  const pageVars = activeTone
    ? ({
        "--primary": `var(--${activeTone})`,
        "--ring": `var(--${activeTone})`,
        "--primary-foreground": `var(--${activeTone}-foreground, var(--tone-foreground))`,
      } as CSSProperties)
    : undefined;

  const workspace = "Scena";
  const email = me?.email ?? "";
  const planName = billing?.plan?.name ?? "Free plan";
  const balance = billing?.balance?.balance ?? 0;
  const isAdmin = Boolean(me?.isAdmin);

  const go = (key: string) => nav(key === "screens" ? "/" : `/${key}`);

  return (
    <div className="relative min-h-dvh pb-20 md:pb-0 md:pl-24">
      {/*
        The wash. `absolute`, not `fixed`: a wash pinned to the VIEWPORT is a
        wallpaper that follows you down the page; one pinned to the scroll
        container is the top of a space (UI-LANGUAGE §3). `md:left-24` clears
        the rail, so the colour belongs to the content rather than to the frame.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[52vh] transition-[background-color] duration-500 ease-out md:left-24"
        style={{
          backgroundColor: `color-mix(in oklch, var(--${activeTone ?? "primary"}) 24%, transparent)`,
          maskImage: "linear-gradient(to bottom, black 0%, black 6%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 6%, transparent 100%)",
        }}
      />

      <div className="relative z-10 transition-colors duration-500" style={pageVars}>
        <AppBar
          bare
          scrolled={scrolled}
          leading={
            // Everything on the bar sits on ONE 36px line — the height of the
            // trailing controls — so the two sides are optically level.
            <div className="flex h-9 min-w-0 items-center gap-2">
              <ScenaIcon size={28} className="shrink-0" />
              <span className="flex h-9 items-center truncate text-body-lg font-semibold tracking-tight">{workspace}</span>
            </div>
          }
          trailing={
            <>
              {/*
                THE PAGE'S OWN ACTIONS — "Pair screen", "Publish", "Delete".

                Scena's screens publish these through `usePageChrome`, and the
                sidebar shell rendered them in its breadcrumb bar. Moving to
                this shell took the renderer away and every one of them silently
                disappeared; the screenshot suite found it on the first run, by
                timing out on a Pair button that no longer existed anywhere.

                They belong on the bar, which is where Kova puts page-level
                controls too. `ShellActions` collapses them into a ⋮ on narrow
                widths by itself.
              */}
              <ShellActions actions={chrome.actions} />
              {/*
                THE BELL, which this app dispatched to for three stages without
                ever showing anybody. Left of the avatar, as in every other 4DL
                app — a notification is about the workspace, the avatar menu is
                about you.
              */}
              <NotificationBell />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center gap-2 rounded-full pr-0 outline-none ring-ring focus-visible:ring-2 sm:-mr-1 sm:rounded-full sm:pl-1 sm:pr-2.5 sm:transition-colors sm:hover:bg-secondary"
                    aria-label={`Account — ${email}`}
                  >
                    <Avatar name={email} className="size-9" />
                    {/* The name at `sm` and up: on a phone there is no room, on
                        a desk the bar had inches of space and still made you
                        open a menu to find out who you were signed in as. */}
                    <span className="hidden max-w-40 truncate text-body font-medium sm:block">{email}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>
                    <div className="truncate text-body font-medium">{email}</div>
                    <div className="text-caption font-normal text-muted-foreground">{me?.role ?? ""}</div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {/*
                    THE PLAN IS A DOOR, not a read-out. It was a card in the
                    sidebar footer showing a progress bar and a balance; here it
                    is the row you press to go and do something about it, which
                    is what everyone was pressing it for.
                  */}
                  <DropdownMenuItem onSelect={() => nav("/billing")}>
                    <CreditCard className="size-4" /> {planName} · {balance.toLocaleString()} cr
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => nav("/team")}><Users className="size-4" /> Team</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => nav("/media")}><ImageIcon className="size-4" /> Media library</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => nav("/settings")}><SettingsIcon className="size-4" /> Workspace settings</DropdownMenuItem>
                  {/*
                    A HOP TO THE DOOR, not an in-app route. `/api/admin/*`
                    answers on the `admin.` host and nowhere else, so a route
                    here would render a console that 404s on every call — which
                    is exactly what this app did before Stage 7b.
                  */}
                  {isAdmin && (
                    <DropdownMenuItem onSelect={() => { window.location.href = adminUrl(window.location.hostname.split(".").slice(1).join(".")); }}>
                      <ShieldCheck className="size-4" /> Platform admin
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onEmergency}>
                    <Siren className={cn("size-4", emergencyActive && "text-destructive")} />
                    {emergencyActive ? "Clear takeover" : "Screen takeover"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={toggleMode}>
                    {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />} {isDark ? "Light mode" : "Dark mode"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setLegalDoc("terms")}><Scale className="size-4" /> Terms &amp; privacy</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={onSignOut}><LogOut className="size-4" /> Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
        />

        {children}
      </div>

      <BottomTabs tabs={TABS} active={current} onSelect={go} tinted />
      {/*
        `brandPlate` is transparent because `ScenaIcon` carries its own plate and
        its own colour. The rail's default is `bg-primary text-primary-foreground`
        — and `primary` is the ACTIVE DESTINATION'S TONE here, so on Screens the
        violet mark was painted onto a violet square and vanished. The rail
        cannot work this out: it is handed a node, not a branding.
      */}
      <NavRail tabs={TABS} active={current} onSelect={go} tinted brand={<ScenaIcon size={26} />} brandPlate="bg-transparent" />
      <LegalDialog doc={legalDoc} onClose={() => setLegalDoc(null)} />
    </div>
  );
}
