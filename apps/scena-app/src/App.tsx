import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useLocation, Routes, Route, Navigate } from "react-router-dom";
import { Siren, LogOut, Sun, Moon, Scale, Layers, Music, Tv, Rss, Megaphone } from "lucide-react";
import { ScenaMascot } from "./brand.js";
import { adminUrl, ErrorBoundary } from "@4dl/app-kit";
import { bootBrand, useHost } from "./host.js";
import { ScenaNoWorkspace, ScenaRootSignpost, ScenaWrongDoor } from "./pages/Doors.js";
import { AdminDoor } from "./pages/AdminDoor.js";
import { CollectionPane } from "./components/collection-pane.js";
import { Shell } from "./Shell.js";
import { RoleProvider } from "./permissions.js";
import { EntitlementsProvider } from "./entitlements.js";
import { clearEmergency, getActiveEmergency, getMe, getBilling, getBranding, setUnauthorizedHandler, type ActiveEmergency, type Me, type BillingState } from "./api.js";
import { clearBrandTheme, type WorkspaceBrand } from "./brand-theme.js";
import { EmergencyModal } from "./components/EmergencyModal.js";
import { canAccessKey, PAGE_META } from "./nav.js";
import { signOut, authClient } from "./auth-client.js";
import { ThemeProvider } from "./theme.js";
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
  /*
    THE BRAND, RESOLVED — and `ThemeProvider` applies it, not this component.

    Three sources, most authoritative last: the remembered one for this hostname
    (already painted at module load, so it seeds the state rather than causing a
    second paint), the PUBLIC one `/api/host` carries to a pre-auth visitor, and
    the authenticated read below. Seeding from the boot cache is what stops the
    provider's first `applyBrand(null)` wiping the paint that beat it there.
  */
  const [brand, setBrand] = useState<WorkspaceBrand | null>(bootBrand?.branding ?? null);
  const reloadMe = () => getMe().then(setMe).catch(() => setMe(null)).finally(() => setMeLoaded(true));

  /*
    Poll the active override so the header reflects a fleet-wide takeover. A rare
    event, so poll lazily — and never while the tab is hidden (refetch on focus).

    ⚠️ GATED ON THE DOOR HAVING A WORKSPACE, because this is a workspace-scoped
    route. Ungated it fired on the root and the operator console too, where the
    guard correctly refuses it — a 404 every thirty seconds, on a door that
    renders a signpost. It was the last of the four calls that made the root look
    like a broken app; the other three stopped once `@4dl/auth` stopped lending
    the session's organization to a door with no tenant of its own.
  */
  const inWorkspace = Boolean(host?.tenant);
  useEffect(() => {
    if (!inWorkspace) return;
    return pollWhileVisible(() => getActiveEmergency().then(setEmergency).catch(() => {}), 30000);
  }, [inWorkspace]);

  // Identity (auth + role + admin gate) + billing state (for the sidebar card).
  useEffect(() => {
    reloadMe();
  }, [refreshKey]);

  /*
    AN EXPIRED SESSION HAS TO LOOK EXPIRED.

    Every call in `api.ts` goes through `apiFetch`, which reports a 401 here.
    Without this the cookie could die and nothing would say so: `getMe` is read
    once at boot, so the Shell stayed mounted, every screen rendered the empty
    state its failed poll produced, and every save failed into a toast. The app
    was indistinguishable from one whose workspace had been deleted — which is
    the shape of bug this whole app has been audited for, in the one place it
    could not be seen from a screenshot.

    Re-reading the session rather than clearing it: the answer is the SERVER's.
    `getMe` returns `{authenticated: false}` and the gate below draws the sign-in
    screen, which is also correct if the 401 was a fluke and the cookie is fine.

    `setMe(null)` is deliberately NOT called first. It would blank the Shell for
    the length of the round trip on any single 401 — including the ones that are
    a per-route refusal rather than an expiry — and a screen that empties and
    refills is worse than one that waits.
  */
  useEffect(() => {
    setUnauthorizedHandler(() => { void reloadMe(); });
    return () => setUnauthorizedHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once; reloadMe is stable enough (it only closes over setState)
  }, []);
  useEffect(() => {
    if (!me?.authenticated || !me.tenantId) return;
    // Credits/plan change slowly; a lazy, visibility-gated poll keeps the card
    // fresh without hammering the API on every open tab.
    return pollWhileVisible(() => getBilling().then(setBilling).catch(() => {}), 60000);
  }, [refreshKey, me?.authenticated, me?.tenantId]);

  /*
    Brand kit → the whole dashboard follows the workspace's colours, shape and
    font (§6). Fetched once per active tenant; the Brand kit section applies
    edits live.

    ⚠️ NOT redundant with the boot brand, which `host.ts` now paints from
    `/api/host` before this component exists. That one is the PUBLIC read and it
    is served through the tenancy host cache, so a kit saved a moment ago can
    still be the previous one there. This is the authoritative refresh, and it is
    what makes a save you just made correct on the next screen you open.
  */
  useEffect(() => {
    if (!me?.authenticated || !me.tenantId) return;
    getBranding().then(setBrand).catch(() => {});
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

  /*
    The PUBLIC brand, for the sign-in screen. It arrives with the door, so it is
    already correct before anybody has a session — which is the whole reason the
    kit moved into `tenant_settings.branding_json`. The authenticated read above
    supersedes it (the host payload is served through the tenancy cache, so a kit
    saved a moment ago can still be the previous one there), and a door with no
    workspace resolves to `null`, which the provider applies as "clear".
  */
  useEffect(() => {
    if (!host || brand) return;
    setBrand(host.tenant?.branding ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seeds once, when the door lands; the authenticated read owns it after that
  }, [host]);

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
  /*
    THE MODE CONTEXT WRAPS EVERY OUTCOME BELOW.

    `body()` is a plain function, not a component — it holds the door/auth cascade
    unchanged, and it contains no hooks (`usePageKey` and `useLocation` are called
    above it), so calling it inline is not a rules-of-hooks violation. The
    alternative was repeating the provider at each of the eight early returns.

    ⚠️ The KIOSK is deliberately OUTSIDE this, returned before it. It pins itself
    dark for its whole life (`useForcedDark`), has no account chrome and nothing
    in it reads the mode — and it is the one surface that must not inherit
    whatever theme an operator once chose on that tablet.
  */
  const body = (): ReactNode => {
  if (!host) return <Splash />;

  /*
    ⚠️ THE DOOR DECIDES WHETHER THE APP MOUNTS AT ALL, AND IT DID NOT.

    This handled `admin` and then fell through to the workspace Shell for every
    other role. On `scena.4dl.app` — the ROOT, a signpost that is nobody's
    workspace — the entire app therefore mounted: `/api/me` answers on the root
    door and reports the session's ACTIVE ORGANIZATION as `tenantId`, so the
    Shell believed it had a tenancy. The route guard, correctly, answers six
    paths on the root and refuses the rest, so every screen drew and then
    `/api/channels`, `/api/billing`, `/api/branding` and `/api/emergency/active`
    all 404'd. A whole app, signed in, in which nothing worked.

    The session's active org is a fact about the PERSON; the door is a fact about
    the ADDRESS. On the root they disagree, and the address is the one the server
    enforces — so the address decides.

    EXHAUSTIVE, with no `default`: `DoorRole` is a closed union, so a door added
    later fails to compile here instead of silently falling through to the Shell,
    which is precisely how this happened.
  */
  const doorScreen = ((): ReactNode | null => {
    switch (host.role) {
      case "root":
        return <ScenaRootSignpost host={host} />;
      /*
        `play.` is a DEVICE door — a screen's pinned origin, served by a different
        worker entirely. A browser that lands here typed it by hand and there is
        no dashboard behind it, so it gets the same nothing as a reserved label.
      */
      case "device":
      case "invalid":
        return <ScenaWrongDoor />;
      case "admin":
        if (!meLoaded) return <Splash />;
        if (!me?.authenticated) return <LoginScreen onDone={reloadMe} />;
        return <AdminDoor isAdmin={Boolean(me.isAdmin)} />;
      case "tenant":
      case "custom":
        // A well-formed workspace address that no workspace owns. NOT a login: a
        // sign-in form here invites somebody into a place that does not exist.
        return host.tenant ? null : <ScenaNoWorkspace host={host} />;
      case "setup":
        // The create-a-workspace lane. Falls through to the auth gate below.
        return null;
      default: {
        /*
          ⚠️ THIS IS WHAT MAKES THE CASCADE EXHAUSTIVE, and a `switch` with
          `break`s would NOT have been — TypeScript only demands every case when
          every branch returns. Assigning the role to `never` is the check: add a
          door to `HostRole` and this file stops compiling, instead of quietly
          falling through to the workspace Shell on the new door. That fall-through
          is the whole bug, so the guard has to be a compile error rather than a
          comment asking the next person to remember.
        */
        const unanswered: never = host.role;
        return unanswered;
      }
    }
  })();
  if (doorScreen) return doorScreen;

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

            THE GUTTER, which this app did not have — in BOTH directions.

            `.column` centres and caps but adds no padding. Kova's screens each
            carry their own (`Page` is `p-4 pb-28`, `Screen` is `pt-6 pb-16`) and
            Scena's carried none, so every phone screenshot showed the title, the
            search field and the cards running off both edges of the device — and
            on every width the first heading sat hard against the bottom of the
            app bar with no air at all. That last one is the "it is not quite
            Kova" you can see and cannot name.

            One place, not forty, because `<main>` is the only element every
            screen passes through. A `Shape` stands down on both axes: its panes
            already pad themselves and the divider between them has to reach the
            frame.

            `--chrome-top` says how far below the viewport top this scroller
            starts (tokens.css); a `Shape` pane resets it to 0, being its own.

            `@container` so a screen sizes itself against this column rather
            than the window — `Shape`'s column marks itself too and, being
            nearer, wins inside a two-pane.
          */}
          <main
            key={pathname}
            className="@container column px-4 pb-16 pt-6 [--chrome-top:var(--app-bar-h)] has-[>[data-fullbleed]]:max-w-none has-[>[data-shape]]:h-[calc(100dvh-var(--app-bar-h))] has-[>[data-shape]]:max-w-none has-[>[data-shape]]:p-0 md:px-6"
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
  };

  return <ThemeProvider branding={brand}>{body()}</ThemeProvider>;
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
