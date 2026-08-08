import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation, Routes, Route, Navigate } from "react-router-dom";
import { Siren, LogOut, Sun, Moon, Scale, Layers, Music, Tv, Rss, Megaphone } from "lucide-react";
import { ScenaMascot } from "./brand.js";
import { adminUrl, ErrorBoundary } from "@4dl/app-kit";
import { useHost } from "./host.js";
import { AdminDoor } from "./pages/AdminDoor.js";
import { CollectionPane } from "./components/collection-pane.js";
import { Shell } from "./Shell.js";
import { RoleProvider } from "./permissions.js";
import { EntitlementsProvider } from "./entitlements.js";
import { clearEmergency, getActiveEmergency, getMe, getBilling, getBranding, type ActiveEmergency, type Me, type BillingState } from "./api.js";
import { applyBrandTheme, clearBrandTheme } from "./brand-theme.js";
import { EmergencyModal } from "./components/EmergencyModal.js";
import { canAccessKey, PAGE_META } from "./nav.js";
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
  // (§6). Fetched once per active tenant; the Brand kit tab applies edits live.
  useEffect(() => {
    if (!me?.authenticated || !me.tenantId) return;
    getBranding().then(applyBrandTheme).catch(() => {});
  }, [me?.authenticated, me?.tenantId]);

  // Role-aware sidebar (receptionist → boards only, viewer → read-only, …),
  // with Admin appended for platform admins.

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
      <Shell
        me={me}
        billing={billing}
        emergencyActive={Boolean(emergency)}
        onEmergency={() => (emergency ? clearOverride() : setEmgOpen(true))}
        onSignOut={doSignOut}
      >
        <ErrorBoundary resetKey={pathname} homePath="/" art={<ScenaMascot mood="sad" size={104} className="mx-auto mb-2" />}>
          {/*
            THE CONTENT COLUMN — the same contract as Kova's `<main>`.

            Every screen renders inside one centred column that stops growing at
            720px (§2). Wider viewports get MORE COLUMNS, never a wider one,
            which is also why a card can be designed once and be correct at any
            width. A `Shape` in one of its pane arrangements publishes
            `data-shape` and is released from BOTH the width cap and the
            document's height, because there the panes ARE the layout. A screen
            that is a WALL rather than a document — the fleet, where the content
            is forty live previews — publishes `data-fullbleed` and is released
            from the width cap alone. Same two escapes Kova's `<main>` offers,
            and Scena was missing this one.

            THE GUTTER, which this app did not have. `.column` centres and caps
            but adds no padding — Kova's screens each carry their own `px-4` and
            Scena's never did, so every phone screenshot showed the title, the
            search field and the cards running off both edges of the device. One
            place, not forty. A `Shape` stands down: its panes already pad
            themselves and the divider between them has to reach the frame.

            `--chrome-top` says how far below the viewport top this scroller
            starts (tokens.css); a `Shape` pane resets it to 0, being its own.

            `@container` so a screen sizes itself against this column rather
            than the window — `Shape`'s column marks itself too and, being
            nearer, wins inside a two-pane.
          */}
          <main
            key={pathname}
            className="@container column px-4 [--chrome-top:var(--app-bar-h)] has-[>[data-fullbleed]]:max-w-none has-[>[data-shape]]:h-[calc(100dvh-var(--app-bar-h))] has-[>[data-shape]]:max-w-none has-[>[data-shape]]:px-0 md:px-6"
          >
            <Routes>
              <Route path="/" element={<ScreensPage key={refreshKey} onPair={() => setPairOpen(true)} />} />
              <Route path="/screens/:id" element={<ScreenDetailPage />} />
              <Route path="/screens/:id/studio" element={<StudioPage mode="screen" />} />
              <Route path="/displays/:channelId" element={<StudioPage mode="display" />} />
              <Route path="/widgets" element={<WidgetBuilderPage />} />
              {/*
                THE TWO CONSOLIDATED DESTINATIONS have no page of their own —
                they are a NAME for a set of routes. Pressing Library or
                Insights lands on the first of its parts, and every part maps
                back to the right tab through `OWNER` in `Shell.tsx`.

                A landing page listing "here are six libraries" would be a menu
                for a menu: the nav already named the destination, and the
                switcher inside the list already lists the parts.
              */}
              <Route path="/library" element={<Navigate to="/playlists" replace />} />
              <Route path="/insights" element={<Navigate to="/analytics" replace />} />
              {/*
                THE THREE COLLECTIONS (§11.3). Nested rather than flat, so the
                list and the record are one destination the shape arranges —
                two panes at ≥1100, two pages below it. See `CollectionPane`
                for why the index element must stay the real list page.
              */}
              <Route
                path="/channels"
                element={<CollectionPane base="/channels" list={<ChannelsPage pane />} icon={Tv} title="Pick a channel" description="Its slides, music and widgets open here — the list stays beside them." />}
              >
                <Route index element={<ChannelsPage />} />
                <Route path=":id" element={<ChannelDetailPage />} />
              </Route>
              <Route
                path="/playlists"
                element={<CollectionPane base="/playlists" list={<PlaylistsPage pane />} icon={Layers} title="Pick a playlist" description="Its slides open here — the library stays beside them." />}
              >
                <Route index element={<PlaylistsPage />} />
                <Route path=":id" element={<PlaylistDetailPage />} />
              </Route>
              <Route path="/media" element={<MediaLibraryPage />} />
              <Route
                path="/music"
                element={<CollectionPane base="/music" list={<MusicPlaylistsPage pane />} icon={Music} title="Pick a playlist" description="Its tracks open here — the library stays beside them." />}
              >
                <Route index element={<MusicPlaylistsPage />} />
                <Route path=":id" element={<MusicPlaylistDetailPage />} />
              </Route>
              <Route path="/profiles" element={<WidgetProfilesPage />} />
              <Route path="/boards" element={<LiveBoardsPage />} />
              <Route
                path="/feeds"
                element={<CollectionPane base="/feeds" list={<FeedsPage pane />} icon={Rss} title="Pick a source" description="Its fields and refresh settings open here — the list stays beside them." />}
              >
                <Route index element={<FeedsPage />} />
                <Route path=":id" element={<SourceDetailPage />} />
              </Route>
              <Route
                path="/ads"
                element={<CollectionPane base="/ads" list={<AdsPage pane />} icon={Megaphone} title="Pick an ad profile" description="Its rotation and schedule open here — the list stays beside them." />}
              >
                <Route index element={<AdsPage />} />
                <Route path=":id" element={<AdProfileDetailPage />} />
              </Route>
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/alerts" element={<AlertsPageComp />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/settings" element={<WorkspaceSettingsPage />} />
              <Route path="/team" element={<TeamPage />} />
              <Route path="*" element={<NotFound onHome={() => navigate("/")} />} />
            </Routes>
          </main>
        </ErrorBoundary>
      </Shell>

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
  return <div className="grid min-h-screen place-items-center text-body text-muted-foreground">Loading…</div>;
}

/** Full-screen boot splash — a thinking Scena while identity/tenant resolves. */
function Splash() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="flex flex-col items-center gap-3">
        <ScenaMascot mood="thinking" size={96} />
        <div className="text-body text-muted-foreground">Loading…</div>
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
        <h2 className="text-body-lg font-semibold">This page wandered off</h2>
        <p className="mt-1.5 text-body text-muted-foreground">
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
