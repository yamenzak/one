import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation, Routes, Route, Navigate } from "react-router-dom";
import { Siren, LogOut, Sun, Moon, Scale } from "lucide-react";
import { ScenaMascot } from "./brand.js";
import { adminUrl } from "@4dl/app-kit";
import { useHost } from "./host.js";
import { AdminDoor } from "./pages/AdminDoor.js";
import { AppShell } from "./components/app-shell.js";
import type { NavGroup } from "@4dl/ui";
import { RoleProvider } from "./permissions.js";
import { EntitlementsProvider } from "./entitlements.js";
import { clearEmergency, getActiveEmergency, getMe, getBilling, getBranding, type ActiveEmergency, type Me, type BillingState } from "./api.js";
import { applyBrandTheme, clearBrandTheme } from "./brand-theme.js";
import { EmergencyModal } from "./components/EmergencyModal.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { navForRole, canAccessKey, PAGE_META } from "./nav.js";
import { signOut, authClient } from "./auth-client.js";
import { useTheme } from "./theme.js";
import { LoginScreen, OrgOnboard } from "./pages/Login.js";
import { LegalDialog, type LegalDoc } from "./legal/content.js";
import { BoardControlApp } from "./pages/BoardControlApp.js";
import { TeamPage } from "./pages/Team.js";
import { ScreensPage } from "./pages/Screens.js";
import { ScreenDetailPage } from "./pages/ScreenDetail.js";
import { StudioPage } from "./pages/Studio.js";
import { WidgetBuilderPage } from "./pages/WidgetBuilder.js";
import { ChannelsPage, ChannelDetailPage } from "./pages/Channels.js";
import { PlaylistsPage, PlaylistDetailPage } from "./pages/Playlists.js";
import { MediaLibraryPage } from "./pages/MediaLibrary.js";
import { LiveBoardsPage } from "./pages/LiveBoards.js";
import { KioskPage } from "./pages/Kiosk.js";
import { FeedsPage, SourceDetailPage } from "./pages/Feeds.js";
import { AlertsPage as AlertsPageComp } from "./pages/Alerts.js";
import { AnalyticsPage } from "./pages/Analytics.js";
import { BillingPage } from "./pages/Billing.js";
import { AdsPage, AdProfileDetailPage } from "./pages/Ads.js";
import { MusicPlaylistsPage, MusicPlaylistDetailPage } from "./pages/MusicPlaylists.js";
import { WidgetProfilesPage } from "./pages/WidgetProfiles.js";
import { WorkspaceSettingsPage } from "./pages/Settings.js";
import { PairModal } from "./components/PairModal.js";
import { Button, cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, PageChromeProvider, toast } from "@4dl/ui";

/**
 * Poll `fn` every `ms`, but skip while the tab is hidden and refetch the moment
 * it becomes visible again. Runs once immediately. Returns a cleanup function.
 * Keeps background tabs from burning API requests (+ auth/D1 work) for nothing.
 */
function pollWhileVisible(fn: () => void, ms: number): () => void {
  const tick = () => { if (document.visibilityState === "visible") fn(); };
  tick();
  const timer = setInterval(tick, ms);
  const onVis = () => { if (document.visibilityState === "visible") fn(); };
  document.addEventListener("visibilitychange", onVis);
  return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVis); };
}

/**
 * Sidebar footer: utility icons (emergency + theme) above the plan/credits card
 * and account (§25). Collapses to an icon stack when the rail is minimized.
 */
function SidebarFooter({
  collapsed, billing, email, role, emergencyActive, onEmergency, onNavigateBilling, onSignOut,
}: {
  collapsed: boolean;
  billing: BillingState | null;
  email: string;
  role: string | null;
  emergencyActive: boolean;
  onEmergency: () => void;
  onNavigateBilling: () => void;
  onSignOut: () => void;
}) {
  const { isDark, toggle } = useTheme();
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);
  const planName = billing?.plan?.name ?? "Free plan";
  const bal = billing?.balance?.balance ?? 0;
  const grant = billing?.entitlements?.aiCredits?.monthlyGrant ?? 0;
  const pct = grant > 0 ? Math.min(100, Math.round((bal / grant) * 100)) : 100;
  const low = grant > 0 && pct <= 15;
  const initials = (email || "SC").slice(0, 2).toUpperCase();

  const emergencyBtn = (
    <Button variant="ghost" size="icon" className={cn("size-9", emergencyActive && "text-destructive hover:text-destructive")} onClick={onEmergency} title={emergencyActive ? "Takeover active — click to clear" : "Screen takeover"} aria-label="Screen takeover">
      <Siren className="size-[18px]" />
    </Button>
  );
  const themeBtn = (
    <Button variant="ghost" size="icon" className="size-9 text-muted-foreground" onClick={toggle} title="Toggle theme" aria-label="Toggle theme">
      {isDark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </Button>
  );
  const accountMenu = (side: "top" | "right") => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="grid size-9 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring" aria-label="Account">
          <span className="grid size-8 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">{initials}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="end">
        <DropdownMenuItem onSelect={onNavigateBilling}>{planName} · {bal.toLocaleString()} cr</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setLegalDoc("terms")}><Scale className="size-4" /> Terms & privacy</DropdownMenuItem>
        <DropdownMenuItem onSelect={onSignOut}><LogOut className="size-4" /> Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const legal = <LegalDialog doc={legalDoc} onClose={() => setLegalDoc(null)} />;

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1">
        {emergencyBtn}
        {themeBtn}
        {accountMenu("right")}
        {legal}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {legal}
      <div className="flex items-center gap-0.5">
        {emergencyBtn}
        {themeBtn}
        {emergencyActive && <span className="ml-1 text-[11px] font-medium text-destructive">Takeover active</span>}
      </div>
      <button onClick={onNavigateBilling} className="w-full rounded-xl bg-sidebar-accent/50 p-3 text-left transition-colors hover:bg-sidebar-accent">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold">{planName}</span>
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{bal.toLocaleString()} cr</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full transition-[width] duration-500 ${low ? "bg-warning" : "bg-primary"}`} style={{ width: `${pct}%` }} />
        </div>
        <div className={`mt-1.5 text-[11px] ${low ? "text-warning" : "text-muted-foreground"}`}>
          {low ? "Low on AI credits · " : "AI credits · "}
          {grant > 0 ? `${bal.toLocaleString()} / ${grant.toLocaleString()}` : bal.toLocaleString()}
        </div>
      </button>
      <div className="flex items-center gap-2.5 px-1">
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">{initials}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{email || "Operator"}</div>
          <div className="text-[11px] capitalize text-muted-foreground">{role ?? "Owner"}</div>
        </div>
        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" onClick={onSignOut} title="Sign out" aria-label="Sign out">
          <LogOut className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function App() {
  const navigate = useNavigate();
  const host = useHost();
  const [pairOpen, setPairOpen] = useState(false);
  const [emgOpen, setEmgOpen] = useState(false);
  const [emergency, setEmergency] = useState<ActiveEmergency | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [me, setMe] = useState<Me | null>(null);
  const [meLoaded, setMeLoaded] = useState(false);
  const [billing, setBilling] = useState<BillingState | null>(null);
  const reloadMe = () => getMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoaded(true));

  // Poll the active override so the header reflects a fleet-wide takeover. A rare
  // event, so poll lazily — and never while the tab is hidden (refetch on focus).
  useEffect(() => {
    return pollWhileVisible(() => getActiveEmergency().then(setEmergency).catch(() => {}), 30000);
  }, []);

  // Identity (auth + role + admin gate) + billing state (for the sidebar card).
  useEffect(() => {
    reloadMe();
  }, [refreshKey]);
  useEffect(() => {
    if (!me?.authenticated || !me.tenantId) return;
    // Credits/plan change slowly; a lazy, visibility-gated poll keeps the card
    // fresh without hammering the API on every open tab.
    return pollWhileVisible(() => getBilling().then(setBilling).catch(() => {}), 60000);
  }, [refreshKey, me?.authenticated, me?.tenantId]);

  // Brand kit → the whole dashboard follows the tenant's colours/radius/font
  // (§6). Fetched once per active tenant; the Branding tab applies edits live.
  useEffect(() => {
    if (!me?.authenticated || !me.tenantId) return;
    getBranding().then(applyBrandTheme).catch(() => {});
  }, [me?.authenticated, me?.tenantId]);

  // Role-aware sidebar (receptionist → boards only, viewer → read-only, …),
  // with Admin appended for platform admins.
  const navGroups = useMemo<NavGroup[]>(() => navForRole(me?.role ?? null, Boolean(me?.isAdmin), me?.features ?? null, me?.permissions ?? null), [me?.role, me?.isAdmin, me?.features, me?.permissions]);

  async function clearOverride() {
    await clearEmergency().catch(() => {});
    setEmergency(null);
    toast.success("Override cleared — screens back to normal.");
  }

  const active = usePageKey();
  const { pathname } = useLocation();

  // The take-a-ticket kiosk is a scoped, public mini-app — full-screen, outside
  // the operator Shell (no sidebar, no account chrome). Board *control* now lives
  // in BoardControlApp (board-user login) and board *displays* are widgets, so
  // the legacy token /station + /display surfaces are retired (§boards).
  if (pathname.startsWith("/kiosk")) return <KioskPage />;

  const doSignOut = async () => {
    await signOut().catch(() => {});
    clearBrandTheme(); // back to the default theme at the login screen
    setMe(null);
    setBilling(null);
    reloadMe();
    navigate("/");
  };

  /*
    THE DOOR DECIDES BEFORE ANYTHING ELSE.

    ⚠️ An UNRESOLVED host renders nothing, not the studio. Treating `null` as
    "tenant" would mount the whole Shell for the length of one round trip and
    then replace it — and on the operator's address that means flashing a
    workspace at somebody who has none.

    The operator console is standalone rather than a route inside the Shell for
    the reason `AdminDoor.tsx` gives at length: `/api/admin/*` is refused on
    every host but this one, so a console reachable from inside a workspace is a
    console that 404s on every call. `/admin` was exactly that until now.
  */
  if (!host) return <Splash />;
  if (host.role === "admin") {
    if (!meLoaded) return <Splash />;
    if (!me?.authenticated) return <LoginScreen onDone={reloadMe} />;
    return <AdminDoor isAdmin={Boolean(me.isAdmin)} />;
  }

  // Auth gate: not-loaded → spinner, unauthenticated → login, no active org →
  // onboarding, else the operator app.
  if (!meLoaded) {
    return <Splash />;
  }
  if (!me?.authenticated) return <LoginScreen onDone={reloadMe} />;
  // Board users (a coordinator or a station) never see the operator app — they
  // land on their scoped control surface (§boards) and nothing else.
  if (me.board) return <BoardControlApp me={me} onSignedOut={() => { setMe(null); setBilling(null); reloadMe(); }} />;
  // Authenticated but no active org: a fresh session (returning owner or staff)
  // has a membership but no active org yet — auto-select it before offering
  // onboarding, so only genuinely org-less owners see the create-workspace step.
  if (!me.tenantId) return <OrgGate onResolved={reloadMe} onSignOut={doSignOut} />;

  // Guard direct navigation: a role/permission that can't see a page in the
  // sidebar shouldn't reach it by typing the URL. The server still enforces
  // data access; this keeps the UI honest and avoids error-only page shells.
  if (!canAccessKey(active, me?.role ?? null, Boolean(me?.isAdmin), me?.features ?? null, me?.permissions ?? null)) {
    return <Navigate to="/" replace />;
  }

  return (
    <RoleProvider role={me?.role ?? null} permissions={me?.permissions ?? null}>
    <EntitlementsProvider value={{ features: me?.features ?? null, quotas: me?.quotas ?? null }}>
    <PageChromeProvider>
      <AppShell
        navGroups={navGroups}
        active={active}
        onNavigate={(key) => {
          /*
            "Admin" is a DOOR, not a route.

            It used to navigate to `/admin` inside this Shell, which rendered
            the console and then 404'd on every call — `/api/admin/*` answers on
            the `admin.` host and nowhere else. A full page load to the other
            origin is the only honest destination, and it is what the console
            actually has an address at.
          */
          if (key === "admin") {
            window.location.href = adminUrl(host.rootDomain);
            return;
          }
          navigate(key === "screens" ? "/" : `/${key}`);
        }}
        fallbackCrumb={PAGE_META[active]?.title}
        onCrumb={(to) => navigate(to)}
        footer={(collapsed) => (
          <SidebarFooter
            collapsed={collapsed}
            billing={billing}
            email={me?.email ?? ""}
            role={me?.role ?? null}
            emergencyActive={Boolean(emergency)}
            onEmergency={() => (emergency ? clearOverride() : setEmgOpen(true))}
            onNavigateBilling={() => navigate("/billing")}
            onSignOut={doSignOut}
          />
        )}
      >
        <ErrorBoundary resetKey={pathname}>
          <div key={pathname} className="">
            <Routes>
              <Route path="/" element={<ScreensPage key={refreshKey} onPair={() => setPairOpen(true)} />} />
              <Route path="/screens/:id" element={<ScreenDetailPage />} />
              <Route path="/screens/:id/studio" element={<StudioPage mode="screen" />} />
              <Route path="/displays/:channelId" element={<StudioPage mode="display" />} />
              <Route path="/widgets" element={<WidgetBuilderPage />} />
              <Route path="/channels" element={<ChannelsPage />} />
              <Route path="/channels/:id" element={<ChannelDetailPage />} />
              <Route path="/playlists" element={<PlaylistsPage />} />
              <Route path="/playlists/:id" element={<PlaylistDetailPage />} />
              <Route path="/media" element={<MediaLibraryPage />} />
              <Route path="/music" element={<MusicPlaylistsPage />} />
              <Route path="/music/:id" element={<MusicPlaylistDetailPage />} />
              <Route path="/profiles" element={<WidgetProfilesPage />} />
              <Route path="/boards" element={<LiveBoardsPage />} />
              <Route path="/feeds" element={<FeedsPage />} />
              <Route path="/feeds/:id" element={<SourceDetailPage />} />
              <Route path="/ads" element={<AdsPage />} />
              <Route path="/ads/:id" element={<AdProfileDetailPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/alerts" element={<AlertsPageComp />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/settings" element={<WorkspaceSettingsPage />} />
              <Route path="/team" element={<TeamPage />} />
              <Route path="*" element={<NotFound onHome={() => navigate("/")} />} />
            </Routes>
          </div>
        </ErrorBoundary>
      </AppShell>

      <PairModal
        open={pairOpen}
        onClose={() => setPairOpen(false)}
        onPaired={(result) => {
          setPairOpen(false);
          setRefreshKey((k) => k + 1);
          // Land straight in the freshly paired screen's Studio, not the list —
          // the operator adds content there instead of hunting for the next page.
          navigate(result ? `/screens/${result.screenDoId}/studio` : "/");
        }}
      />

      <EmergencyModal
        open={emgOpen}
        active={emergency}
        onClose={() => setEmgOpen(false)}
        onBroadcast={() => {
          setEmgOpen(false);
          getActiveEmergency().then(setEmergency).catch(() => {});
        }}
      />
    </PageChromeProvider>
    </EntitlementsProvider>
    </RoleProvider>
  );
}

/**
 * Bridge between "signed in" and "has an active tenant". A fresh session (a
 * returning owner or any staff member) carries a membership but no active
 * organization yet, so pick the first one automatically. Only a user with zero
 * memberships (a brand-new owner) falls through to the create-workspace step.
 */
function OrgGate({ onResolved, onSignOut }: { onResolved: () => void; onSignOut: () => void }) {
  const [needsOnboard, setNeedsOnboard] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authClient.organization.list();
        const orgs = (res.data as { id?: string }[] | undefined) ?? [];
        const first = orgs.find((o) => o.id)?.id;
        if (first) {
          await authClient.organization.setActive({ organizationId: first });
          if (!cancelled) onResolved();
          return;
        }
      } catch {
        /* fall through to onboarding */
      }
      if (!cancelled) setNeedsOnboard(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [onResolved]);

  if (needsOnboard) return <OrgOnboard onDone={onResolved} onSignOut={onSignOut} />;
  return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Loading…</div>;
}

/** Full-screen boot splash — a thinking Scena while identity/tenant resolves. */
function Splash() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="flex flex-col items-center gap-3">
        <ScenaMascot mood="thinking" size={96} />
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    </div>
  );
}

/** In-shell 404 — a searching Scena for a route that doesn't exist. */
function NotFound({ onHome }: { onHome: () => void }) {
  return (
    <div className="grid min-h-[60vh] place-items-center p-6">
      <div className="max-w-md text-center">
        <ScenaMascot mood="searching" size={112} className="mx-auto mb-2" />
        <h2 className="text-lg font-semibold">This page wandered off</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          We couldn't find that page. It may have moved, or the link is out of date.
        </p>
        <div className="mt-5 flex justify-center">
          <Button onClick={onHome}>Back to Devices</Button>
        </div>
      </div>
    </div>
  );
}

/** Derive the active nav key from the current path. */
function usePageKey(): string {
  const { pathname } = useLocation();
  if (pathname === "/" || pathname.startsWith("/screens")) return "screens";
  const seg = pathname.split("/")[1];
  return seg && seg in PAGE_META ? seg : "screens";
}
