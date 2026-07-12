/**
 * Role-adaptive shell (DESIGN.md §5) — one app, nav by persona + mode, now
 * URL-routed (React Router). Tabs + overlays are real routes so refresh and
 * deep-links work: /today /train /eat /progress · /clients/:id/:tab · /library
 * /business · /settings /wellness /shop /explore /admin.
 */

import { useEffect, useState, type ReactNode } from "react";
import { Routes, Route, Navigate, Outlet, useNavigate, useLocation, useParams } from "react-router-dom";
import {
  AppBar, Avatar, BottomTabs, NavRail, Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  Home, Dumbbell, Utensils, LineChart, Users, LayoutGrid, Wallet, Settings as SettingsIcon, Sun, Moon, LogOut, Store, HeartPulse, ShieldCheck, ArrowLeftRight, Check, BookOpen, type TabDef,
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
import { Wellness } from "./screens/client/Wellness.js";
import { Onboarding } from "./screens/client/Onboarding.js";
import { Shop } from "./screens/client/Shop.js";
import { Explore } from "./screens/client/Explore.js";
import { AdminConsole } from "./screens/admin/AdminConsole.js";
import { NotificationBell } from "./NotificationBell.js";

const CLIENT_TABS: TabDef[] = [
  { key: "today", label: "Today", icon: Home },
  { key: "train", label: "Train", icon: Dumbbell },
  { key: "eat", label: "Eat", icon: Utensils },
  { key: "progress", label: "Progress", icon: LineChart },
  { key: "wellness", label: "Wellness", icon: HeartPulse },
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

  if (gateClientId && needsOnboarding) return <Onboarding clientId={gateClientId} displayName={ctx!.user.name || "there"} onDone={() => setNeedsOnboarding(false)} />;

  return (
    <Routes>
      {/* Full-screen surfaces (no tab chrome). */}
      <Route path="/settings" element={<SettingsRoute />} />
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
        <Route path="business" element={<CoachArea><Business /></CoachArea>} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Route>
    </Routes>
  );
}

/** The tab layout: app bar + routed content + bottom tabs / nav rail. */
function TabLayout() {
  const { ctx, mode, setMode, switchTenant, signOut, refresh } = useSession();
  const { mode: themeMode, toggleMode } = useTheme();
  const clientId = useActiveClientId();
  const clientSurface = useClientSurface();
  const nav = useNavigate();
  const loc = useLocation();
  const active = ctx!.active!;
  const isStaff = active.role !== "client";

  const tabs: TabDef[] = clientSurface
    ? CLIENT_TABS
    : [
        { key: "today", label: "Today", icon: Home },
        { key: "clients", label: "Clients", icon: Users },
        { key: "library", label: "Library", icon: LayoutGrid },
        ...(active.role === "owner" ? [{ key: "business", label: "Business", icon: Wallet } as TabDef] : []),
      ];
  const seg = loc.pathname.split("/")[1] || "today";
  const current = tabs.some((t) => t.key === seg) ? seg : "today";

  const enterTrainMode = async () => {
    if (!active.clientId) { await api.post("/api/clients/self"); await refresh(); }
    setMode("train");
    nav("/today");
  };

  return (
    <div className="min-h-dvh pb-20 md:pb-0 md:pl-24">
      <AppBar
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
                <DropdownMenuItem destructive onSelect={() => void signOut().then(() => location.reload())}><LogOut /> Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <main><Outlet /></main>

      <BottomTabs tabs={tabs} active={current} onSelect={(k) => nav(`/${k}`)} />
      <NavRail tabs={tabs} active={current} onSelect={(k) => nav(`/${k}`)} brand={ctx!.branding?.iconUrl ? <img src={ctx!.branding.iconUrl} alt={active.tenantName} className="size-full object-cover" /> : active.tenantName.charAt(0).toUpperCase()} />
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
