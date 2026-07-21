/**
 * Role-adaptive shell (DESIGN.md §5) — one app, nav by persona + mode, now
 * URL-routed (React Router). Tabs + overlays are real routes so refresh and
 * deep-links work: /today /train /eat /progress · /clients/:id/:tab · /library
 * /business · /settings /wellness /shop /explore /admin.
 */

import { useEffect, useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Routes, Route, Navigate, Outlet, useNavigate, useLocation, useParams } from "react-router-dom";
import {
  AppBar, Avatar, BottomTabs, NavRail, Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  Home, Dumbbell, Utensils, LineChart, Users, LayoutGrid, Wallet, Settings as SettingsIcon, Sun, Moon, LogOut, Store, HeartPulse, ShieldCheck, ArrowLeftRight, Check, BookOpen, Sparkles, LifeBuoy, Spinner, toneVar, type TabDef, type Tone,
} from "@mossa/ui";
import { useSession, useActiveClientId } from "./session.js";
import { useTheme } from "./theme.js";
import { api } from "./api.js";
import { Today } from "./screens/client/Today.js";
import { Train } from "./screens/client/Train.js";
import { Eat } from "./screens/client/Eat.js";
import { Progress } from "./screens/client/Progress.js";
import { CoachToday } from "./screens/coach/CoachToday.js";
import { Clients, ClientDetail } from "./screens/coach/Clients.js";
import { WorkoutBuilder } from "./screens/coach/WorkoutBuilder.js";
import { MealBuilder } from "./screens/coach/MealBuilder.js";
import { WorkoutPlayer } from "./screens/client/WorkoutPlayer.js";
import { Business } from "./screens/coach/Business.js";
import { Library } from "./screens/coach/Library.js";
import { Settings } from "./screens/Settings.js";
import { Inbox } from "./screens/Inbox.js";
import { Wellness } from "./screens/client/Wellness.js";
import { Onboarding } from "./screens/client/Onboarding.js";
import { Shop } from "./screens/client/Shop.js";
import { Explore } from "./screens/client/Explore.js";
import { AdminConsole } from "./screens/admin/AdminConsole.js";
import { NotificationBell } from "./NotificationBell.js";
import { TourProvider, useTour, type TourId } from "./tour.js";

const CLIENT_TABS: TabDef[] = [
  { key: "today", label: "Today", icon: Home, tone: "primary" },
  { key: "train", label: "Train", icon: Dumbbell, tone: "activity" },
  { key: "eat", label: "Eat", icon: Utensils, tone: "nutrition" },
  { key: "wellness", label: "Wellness", icon: HeartPulse, tone: "sleep" },
  { key: "progress", label: "Progress", icon: LineChart, tone: "cardio" },
];

/** The guided tours offered from the Help menu (client surface). */
const HELP_TOURS: { id: TourId; icon: typeof Home; tone: Tone; title: string; sub: string }[] = [
  { id: "app", icon: Sparkles, tone: "primary", title: "App walkthrough", sub: "A hands-on tour of everything, with sample data." },
  { id: "workout", icon: Dumbbell, tone: "activity", title: "Workout player", sub: "Days, sets, rest timers and logging." },
  { id: "meal", icon: Utensils, tone: "nutrition", title: "Meal plan & shopping", sub: "Options, macros, recipes and your list." },
];

/** Am I currently looking at the client surface? (client role, or train mode.) */
function useClientSurface(): boolean {
  const { ctx, mode } = useSession();
  const active = ctx!.active!;
  return active.role !== "client" ? mode === "train" : true;
}

export function Shell() {
  const { ctx } = useSession();
  const active = ctx!.active!;
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);
  const gateClientId = active.role === "client" ? active.clientId : null;
  useEffect(() => {
    if (!gateClientId) return setNeedsOnboarding(false);
    void api.get<{ client: { onboardingComplete: boolean } }>(`/api/clients/${gateClientId}`).then((r) => setNeedsOnboarding(!r.client.onboardingComplete)).catch(() => setNeedsOnboarding(false));
  }, [gateClientId]);

  // Hold a boot screen until the onboarding check resolves — otherwise the full
  // app renders for a frame before we know whether to show the intake wizard.
  if (gateClientId && needsOnboarding === null) return <div className="grid min-h-dvh place-items-center"><Spinner /></div>;
  if (gateClientId && needsOnboarding) return <Onboarding clientId={gateClientId} displayName={ctx!.user.name || "there"} onDone={() => setNeedsOnboarding(false)} />;

  // Access gate: on a tenant that requires a live plan/package, a client with no
  // active access is locked to the Plans screen (only clients — never staff).
  if (active.role === "client" && active.clientId && ctx!.clientAccess?.required && !ctx!.clientAccess.active) {
    return <Shop clientId={active.clientId} locked />;
  }

  return (
    <TourProvider>
    <Routes>
      {/* Full-screen surfaces (no tab chrome). */}
      <Route path="/settings" element={<SettingsRoute />} />
      <Route path="/inbox" element={<InboxRoute />} />
      <Route path="/shop" element={<OverlayWithClient render={(cid, back) => <Shop clientId={cid} onBack={back} />} />} />
      <Route path="/explore" element={<OverlayWithClient render={(cid, back) => <Explore clientId={cid} onBack={back} />} />} />
      <Route path="/admin" element={<AdminRoute />} />
      {/* Plan builder — full-screen editor, its own bottom action bar. */}
      <Route path="/clients/:clientId/plans/:planKind/:planId" element={<CoachArea><PlanBuilderRoute /></CoachArea>} />

      {/* Tabbed app. */}
      <Route element={<TabLayout />}>
        <Route index element={<Navigate to="/today" replace />} />
        <Route path="today" element={<TodayRoute />} />
        <Route path="train" element={<ClientArea>{(cid) => <Train clientId={cid} />}</ClientArea>} />
        <Route path="train/session" element={<ClientArea>{(cid) => <TrainSessionRoute clientId={cid} />}</ClientArea>} />
        <Route path="train/session/:day" element={<ClientArea>{(cid) => <TrainSessionRoute clientId={cid} />}</ClientArea>} />
        <Route path="eat" element={<ClientArea>{(cid) => <Eat clientId={cid} />}</ClientArea>} />
        <Route path="progress" element={<ClientArea>{(cid) => <Progress clientId={cid} />}</ClientArea>} />
        <Route path="wellness" element={<ClientArea>{(cid) => <Wellness clientId={cid} />}</ClientArea>} />
        <Route path="clients" element={<CoachArea><Clients /></CoachArea>} />
        <Route path="clients/:clientId" element={<CoachArea><ClientDetail /></CoachArea>} />
        <Route path="clients/:clientId/:subtab" element={<CoachArea><ClientDetail /></CoachArea>} />
        <Route path="library" element={<CoachArea><Library /></CoachArea>} />
        <Route path="library/:tab" element={<CoachArea><Library /></CoachArea>} />
        <Route path="business" element={<CoachArea><Business /></CoachArea>} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Route>
    </Routes>
    </TourProvider>
  );
}

/** The tab layout: app bar + routed content + bottom tabs / nav rail. */
function TabLayout() {
  const { ctx, mode, setMode, switchTenant, signOut, refresh } = useSession();
  const { mode: themeMode, toggleMode, tintedNav, ambient } = useTheme();
  const clientId = useActiveClientId();
  const clientSurface = useClientSurface();
  const nav = useNavigate();
  const loc = useLocation();
  const active = ctx!.active!;
  const isStaff = active.role !== "client";
  const { tour: activeTour, start: startTour, startIfNew } = useTour();

  // First-run interactive tour — once per device, for the client surface.
  useEffect(() => {
    if (!clientSurface) return;
    const t = setTimeout(() => startIfNew("app"), 700);
    return () => clearTimeout(t);
  }, [clientSurface, startIfNew]);

  const tabs: TabDef[] = clientSurface
    ? CLIENT_TABS
    : [
        { key: "today", label: "Today", icon: Home, tone: "primary" },
        { key: "clients", label: "Clients", icon: Users, tone: "cardio" },
        { key: "library", label: "Library", icon: LayoutGrid, tone: "activity" },
        ...(active.role === "owner" ? [{ key: "business", label: "Business", icon: Wallet, tone: "warning" } as TabDef] : []),
      ];
  const seg = loc.pathname.split("/")[1] || "today";
  const current = tabs.some((t) => t.key === seg) ? seg : "today";

  // App-bar glass pills appear only once the page is scrolled off the top. Track
  // window scroll, and reset to top BEFORE paint on every navigation so a new
  // page always opens at the top with bare (pill-less) brand + actions.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    // Own the scroll position — stop the browser from restoring it on reload
    // after our reset runs (which would re-fire scroll and wrongly show pills).
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useLayoutEffect(() => { window.scrollTo(0, 0); setScrolled(false); }, [loc.pathname]);

  const enterTrainMode = async () => {
    if (!active.clientId) { await api.post("/api/clients/self"); await refresh(); }
    setMode("train");
    nav("/today");
  };

  const activeTone = tabs.find((t) => t.key === current)?.tone;
  const ambientColor = activeTone ? `var(--${activeTone})` : "var(--primary)";
  // Ambient "token ambience": rebind --primary/--ring to the active section's
  // domain token so every accent on the page (buttons, selected chips, links,
  // rings) speaks that section's colour instead of the brand primary. We must
  // ALSO rebind --primary-foreground to the on-tone foreground: the brand
  // foreground is fixed to the brand primary's polarity, but domain tones invert
  // per mode, so leaving it produces low-contrast text on a solid tone button
  // (e.g. a purple "Check in" with dark-on-dark text). --tone-foreground clears
  // AA on every tone in both modes. Scoped to the content — the nav tints itself.
  // Only rebind for the non-primary section tokens — `--primary: var(--primary)`
  // would be a circular self-reference and blank out every primary-tinted element.
  const pageVars = ambient && activeTone && activeTone !== "primary"
    ? ({ "--primary": `var(--${activeTone})`, "--ring": `var(--${activeTone})`, "--primary-foreground": "var(--tone-foreground)" } as CSSProperties)
    : undefined;

  return (
    <div className="min-h-dvh pb-20 md:pb-0 md:pl-24">
      {/* Ambient hero wash — each section's domain token bleeds from the top and
          fades into the background, crossfading as you move between pages. */}
      {ambient && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[52vh] transition-[background-color] duration-500 ease-out md:left-24"
          style={{
            backgroundColor: `color-mix(in oklch, ${ambientColor} 24%, transparent)`,
            maskImage: "linear-gradient(to bottom, black 0%, black 6%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 6%, transparent 100%)",
          }}
        />
      )}
      <div className="relative z-10 transition-colors duration-500" style={pageVars}>
      <AppBar
        bare={ambient}
        scrolled={scrolled}
        leading={
          <div className="flex min-w-0 items-center gap-2">
            {ctx!.branding?.logoUrl ? (
              <img src={ctx!.branding.logoUrl} alt={active.tenantName} className="h-8 max-w-32 object-contain" />
            ) : (
              <span className="truncate text-base font-semibold tracking-tight">{active.tenantName}</span>
            )}
            {isStaff && (
              <span className="hidden rounded-full bg-secondary px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground sm:inline">
                {clientSurface ? "Train" : "Coach"}
              </span>
            )}
          </div>
        }
        trailing={
          <>
            {clientSurface && clientId && (
              <button onClick={() => nav("/explore")} className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" aria-label="Explore resources">
                <BookOpen className="size-[1.15rem]" />
              </button>
            )}
            {clientSurface && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="grid size-9 place-items-center rounded-full text-muted-foreground outline-none ring-ring transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2" aria-label="Help &amp; guided tours">
                    <LifeBuoy className="size-[1.15rem]" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Guided tours</DropdownMenuLabel>
                  {HELP_TOURS.map((t) => (
                    <DropdownMenuItem key={t.id} onSelect={() => startTour(t.id)}>
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: `color-mix(in oklch, ${toneVar[t.tone]} 15%, transparent)` }}>
                        <t.icon style={{ color: toneVar[t.tone] }} />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium leading-tight">{t.title}</span>
                        <span className="block text-xs text-muted-foreground">{t.sub}</span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full outline-none ring-ring focus-visible:ring-2" aria-label="Account">
                  <Avatar name={ctx!.user.name || ctx!.user.email} seed={ctx!.user.email} className="size-9" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>{ctx!.user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {isStaff && (
                  <>
                    <DropdownMenuItem onSelect={clientSurface ? () => { setMode("coach"); nav("/today"); } : () => void enterTrainMode()}>
                      <ArrowLeftRight /> {clientSurface ? "Switch to Coach mode" : "Switch to Train mode"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                {ctx!.personas.length > 1 && !ctx!.hostTenantId && (
                  <>
                    {ctx!.personas.map((p) => (
                      <DropdownMenuItem key={p.tenantId} onSelect={() => void switchTenant(p.tenantId)}>
                        <Store /> {p.tenantName}
                        {p.tenantId === active.tenantId && <Check className="ml-auto size-4 text-primary" />}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                )}
                {clientSurface && clientId && (
                  <DropdownMenuItem onSelect={() => nav("/shop")}><Store /> Plans &amp; access</DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => nav("/settings")}><SettingsIcon /> Settings &amp; passkeys</DropdownMenuItem>
                {ctx!.isPlatformAdmin && <DropdownMenuItem onSelect={() => nav("/admin")}><ShieldCheck /> Platform admin</DropdownMenuItem>}
                <DropdownMenuItem onSelect={toggleMode}>{themeMode === "dark" ? <Sun /> : <Moon />} {themeMode === "dark" ? "Light mode" : "Dark mode"}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => void signOut()}><LogOut /> Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {/* Remount the routed content when the APP tour toggles, so screens refetch
          through the (mock ↔ live) api interceptor. The workout/meal tours annotate
          the real screen in place, so they must NOT remount it. */}
      <main key={activeTour === "app" ? "tour" : "live"}><Outlet /></main>
      </div>

      <BottomTabs tabs={tabs} active={current} onSelect={(k) => nav(`/${k}`)} tinted={tintedNav} />
      <NavRail tabs={tabs} active={current} onSelect={(k) => nav(`/${k}`)} tinted={tintedNav} brand={ctx!.branding?.iconUrl ? <img src={ctx!.branding.iconUrl} alt={active.tenantName} className="size-full object-cover" /> : active.tenantName.charAt(0).toUpperCase()} />
    </div>
  );
}

/** "Today" resolves to the coach inbox or the client home by surface. */
function TodayRoute() {
  const clientSurface = useClientSurface();
  const clientId = useActiveClientId();
  const nav = useNavigate();
  if (!clientSurface) return <CoachToday />;
  if (!clientId) return <NoClient />;
  return <Today clientId={clientId} onStart={() => nav("/train")} onOpen={(r) => nav(r)} />;
}

/** Guard: client-surface routes; redirect coaches, provision a training space. */
function ClientArea({ children }: { children: (clientId: string) => ReactNode }) {
  const clientSurface = useClientSurface();
  const clientId = useActiveClientId();
  if (!clientSurface) return <Navigate to="/today" replace />;
  if (!clientId) return <NoClient />;
  return <>{children(clientId)}</>;
}

/** Guard: coach-surface routes. */
function CoachArea({ children }: { children: ReactNode }) {
  const clientSurface = useClientSurface();
  if (clientSurface) return <Navigate to="/today" replace />;
  return <>{children}</>;
}

function NoClient() {
  const { ctx, setMode, refresh } = useSession();
  const nav = useNavigate();
  const active = ctx!.active!;
  const enter = async () => {
    if (!active.clientId) { await api.post("/api/clients/self"); await refresh(); }
    setMode("train");
    nav("/today");
  };
  return (
    <div className="p-8 text-center text-muted-foreground">
      No client record yet.
      <Button className="mt-4" onClick={() => void enter()}>Create my training space</Button>
    </div>
  );
}

function SettingsRoute() {
  const nav = useNavigate();
  return <Settings onBack={() => nav(-1)} />;
}

function InboxRoute() {
  const nav = useNavigate();
  return <Inbox onBack={() => nav(-1)} />;
}

function AdminRoute() {
  const { ctx } = useSession();
  const nav = useNavigate();
  if (!ctx!.isPlatformAdmin) return <Navigate to="/today" replace />;
  return <AdminConsole onBack={() => nav(-1)} />;
}

/** Client-scoped full-screen overlays (wellness / shop / explore). */
function OverlayWithClient({ render }: { render: (clientId: string, back: () => void) => ReactNode }) {
  const clientId = useActiveClientId();
  const nav = useNavigate();
  if (!clientId) return <Navigate to="/today" replace />;
  return <>{render(clientId, () => nav(-1))}</>;
}

/** Plan builder route — /clients/:id/plans/:kind/:planId. */
function PlanBuilderRoute() {
  const nav = useNavigate();
  const { clientId, planKind, planId } = useParams<{ clientId: string; planKind: string; planId: string }>();
  if (!clientId || !planId) return <Navigate to="/clients" replace />;
  const back = () => nav(`/clients/${clientId}/plans`);
  return planKind === "meal" ? <MealBuilder planId={planId} onBack={back} /> : <WorkoutBuilder planId={planId} onBack={back} />;
}

/** Workout player route — /train/session[/:day]. Sets persist server-side, so
 *  refresh restores the session; onExit returns to the Train tab. */
function TrainSessionRoute({ clientId }: { clientId: string }) {
  const nav = useNavigate();
  const { day } = useParams<{ day?: string }>();
  return <WorkoutPlayer clientId={clientId} initialDay={day != null ? Number(day) : undefined} onExit={() => nav("/train")} />;
}
