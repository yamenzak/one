/**
 * Role-adaptive shell (KOVA.md Part II §5) — one app, nav by persona + mode, now
 * URL-routed (React Router). Tabs + overlays are real routes so refresh and
 * deep-links work: /today /train /eat /progress · /clients/:id/:tab · /library
 * /business · /settings /wellness /shop /explore /admin.
 */

import { useEffect, useLayoutEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Routes, Route, Navigate, Outlet, useNavigate, useLocation, useParams } from "react-router-dom";
import {
  ChevronDown,
  AppBar, Avatar, BottomTabs, NavRail, Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  Home, Dumbbell, Utensils, LineChart, Users, LayoutGrid, Wallet, Calendar, Settings as SettingsIcon, Sun, Moon, LogOut, Store, HeartPulse, ShieldCheck, ArrowLeftRight, Check, BookOpen, Hand, LifeBuoy, Spinner, CircleUser, SlidersHorizontal, KeyRound, ImageIcon, RefreshCw, AlertTriangle, ArrowRight, brandMark, hasIcon, hasWordmark, toneVar, type TabDef, type Tone,
} from "@4dl/ui";
import { resolveStanding, tenantStandingOfGate } from "@4dl/tenancy/model";
import { useSession, useActiveClientId, adminUrl } from "./session.js";
import { useTheme } from "./theme.js";
import { api } from "./api.js";
import { hardRefresh } from "./hard-refresh.js";
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
import { Sessions } from "./screens/coach/Sessions.js";
import { Library } from "./screens/coach/Library.js";
import { Settings } from "./screens/Settings.js";
import { Inbox } from "./screens/Inbox.js";
import { MediaLibrary } from "./screens/MediaLibrary.js";
import { Wellness } from "./screens/client/Wellness.js";
import { Onboarding } from "./screens/client/Onboarding.js";
import { StudioBlocked } from "./screens/StudioBlocked.js";
import { Shop } from "./screens/client/Shop.js";
import { Explore } from "./screens/client/Explore.js";
import { AcceptInvite } from "./screens/AcceptInvite.js";
import { NotificationBell } from "./NotificationBell.js";
import { MaintenanceBanner, OfflinePill, StudioPausedBanner } from "./notices.js";
import { StudioSwitcher } from "./StudioSwitcher.js";
import { ErrorBoundary } from "./ErrorBoundary.js";

const CLIENT_TABS: TabDef[] = [
  { key: "today", label: "Today", icon: Home, tone: "primary" },
  { key: "train", label: "Train", icon: Dumbbell, tone: "activity" },
  { key: "eat", label: "Eat", icon: Utensils, tone: "nutrition" },
  { key: "wellness", label: "Wellness", icon: HeartPulse, tone: "sleep" },
  { key: "progress", label: "Progress", icon: LineChart, tone: "cardio" },
];

/** Am I currently looking at the client surface? (client role, or train mode.) */
function useClientSurface(): boolean {
  const { ctx, mode } = useSession();
  const active = ctx!.active!;
  return active.role !== "client" ? mode === "train" : true;
}

export function Shell() {
  const { ctx, host } = useSession();
  const active = ctx!.active!;
  const loc = useLocation();
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

  /**
   * BLOCKED — the studio's own bill, one rung past read-only.
   *
   * This is deliberately the FIRST gate, above onboarding and above access: when
   * the app itself is withheld there is nothing to onboard into and nothing to
   * sell. `readOnly` still shows the whole app with writes refused; `blocked`
   * replaces it. Both are the same debt, and the difference is what the person
   * sees, which is why the gate reports them separately.
   *
   * Everyone lands here, staff included — the owner most of all, since they are
   * the one who can fix it. `StudioBlocked` keeps the two doors that must never
   * close: paying, and leaving with your data.
   */
  if (host?.gate?.blocked) {
    return <StudioBlocked studioName={host.tenant?.name ?? "This studio"} role={active.role} />;
  }

  /**
   * Access gate: on a tenant that requires a live plan/package, a client with no
   * active access is locked to the Plans screen (only clients — never staff).
   *
   * ARCHIVED OUTRANKS IT. A studio that archived someone has ended the
   * relationship; greeting them with a screen selling that studio's packages
   * would be absurd, and buying one would not un-archive them anyway. An archived
   * client goes into the app read-only instead (see `requireClientAccess`, which
   * refuses their writes) with a banner saying so.
   */
  const standing = active.clientId && ctx!.clientAccess
    ? resolveStanding({
        membership: ctx!.clientAccess.archived ? "archived" : "active",
        accessActive: ctx!.clientAccess.active,
        accessRequired: ctx!.clientAccess.required,
        // The STUDIO's real standing, from the host gate. This was a hardcoded
        // "ok" — here and in `requireClientAccess`, the only two callers — which
        // made the axis dead in practice: a client at a suspended studio was told
        // everything was fine right up until a save failed.
        tenant: tenantStandingOfGate(host?.gate?.reason),
      })
    : null;
  if (active.role === "client" && active.clientId && standing?.lockedToStorefront) {
    return <Shop clientId={active.clientId} locked />;
  }

  return (
    <>
    {/* Backstop boundary: a crash in any full-screen route (admin, settings,
        plan builder…) recovers here instead of white-screening the app. Keyed by
        pathname so navigating away clears the error. */}
    <ErrorBoundary resetKey={loc.pathname}>
    <Routes>
      {/* Full-screen surfaces (no tab chrome). */}
      {/* Studio settings is owner-only, and the menu only offers it to owners —
          but a deep link, a bookmark or a shared URL doesn't know that, and
          landing a client on "Studio settings are available to studio owners."
          with nothing but a back arrow is a dead end. Send them where they were
          almost certainly trying to go: their own settings. */}
      <Route path="/settings" element={<OwnerOnly><SettingsRoute view="studio" /></OwnerOnly>} />
      <Route path="/profile" element={<SettingsRoute view="profile" />} />
      <Route path="/preferences" element={<SettingsRoute view="preferences" />} />
      {/* The personal Appearance page is gone — its two studio-wide toggles moved
          into Studio → Branding and dark mode lives in the account menu. The path
          stays so old bookmarks and links land somewhere sensible. */}
      <Route path="/appearance" element={<SettingsRoute view="preferences" />} />
      <Route path="/notification-settings" element={<SettingsRoute view="notifications" />} />
      <Route path="/passkeys" element={<SettingsRoute view="passkeys" />} />
      <Route path="/inbox" element={<InboxRoute />} />
      <Route path="/media" element={<MediaRoute />} />
      <Route path="/shop" element={<OverlayWithClient render={(cid, back) => <Shop clientId={cid} onBack={back} />} />} />
      <Route path="/explore" element={<OverlayWithClient render={(cid, back) => <Explore clientId={cid} onBack={back} />} />} />
      {/* Staff invitation deep-link (SPEC §4). Full-screen; the screen drives its
          own OTP flow, so a signed-in staffer accepts a seat on another tenant
          in place. (For a not-yet-signed-in invitee the pre-session router in
          main.tsx must render this before the login gate — see residual.) */}
      <Route path="/accept-invitation/:invitationId" element={<AcceptInvite />} />
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
        <Route path="sessions" element={<CoachArea><Sessions /></CoachArea>} />
        <Route path="business" element={<CoachArea><Business /></CoachArea>} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Route>
    </Routes>
    </ErrorBoundary>
    </>
  );
}

/** The tab layout: app bar + routed content + bottom tabs / nav rail. */
function TabLayout() {
  const { ctx, host, mode, setMode, switchTenant, signOut, refresh } = useSession();
  const { mode: themeMode, toggleMode, tintedNav, ambient } = useTheme();
  const clientId = useActiveClientId();
  const clientSurface = useClientSurface();
  const nav = useNavigate();
  const loc = useLocation();
  const active = ctx!.active!;
  const isStaff = active.role !== "client";
  const barMark = brandMark(ctx!.branding, themeMode, "logo");
  const barWordmark = hasWordmark(ctx!.branding, themeMode);
  const railMark = brandMark(ctx!.branding, themeMode, "icon");
  const tabs: TabDef[] = clientSurface
    ? CLIENT_TABS
    : [
        { key: "today", label: "Today", icon: Home, tone: "primary" },
        { key: "clients", label: "Clients", icon: Users, tone: "cardio" },
        { key: "library", label: "Library", icon: LayoutGrid, tone: "activity" },
        ...(ctx!.entitlements?.features?.frontDesk ? [{ key: "sessions", label: "Sessions", icon: Calendar, tone: "sleep" } as TabDef] : []),
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
    <div className="relative min-h-dvh pb-20 md:pb-0 md:pl-24">
      {/* Ambient hero wash — each section's domain token bleeds from the top and
          fades into the background, crossfading as you move between pages.
          This is the Shell's `Atmosphere` (UI-LANGUAGE §3), and it is `absolute`
          rather than `fixed` for the reason the language gives: a wash pinned to
          the VIEWPORT is a wallpaper that follows you down the page, while one
          pinned to the SCROLL CONTAINER is the top of a space and scrolls away.
          The difference is most of why the reference apps feel like places. */}
      {ambient && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[52vh] transition-[background-color] duration-500 ease-out md:left-24"
          style={{
            backgroundColor: `color-mix(in oklch, ${ambientColor} 24%, transparent)`,
            maskImage: "linear-gradient(to bottom, black 0%, black 6%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 6%, transparent 100%)",
          }}
        />
      )}
      <div className="relative z-10 transition-colors duration-500" style={pageVars}>
      {/* Above the bar, not inside it: a read-only studio is the state of the whole
          surface, not one more indicator competing for space in the trailing row.
          The maintenance strip sits FIRST because it is the wider truth — a
          deployment-wide window outranks one studio's standing, and when both are
          true the platform's window is the one that explains the refused save. */}
      <MaintenanceBanner />
      <StudioPausedBanner />
      <AppBar
        bare={ambient}
        scrolled={scrolled}
        leading={
          // Every item on the bar sits on ONE 36px (size-9) line — the height of
          // the trailing controls. The brand used to be shorter than them (an h-8
          // logo, and a bare text span at its own line-height), so the two sides
          // of the bar were optically off by 4–12px.
          <div className="flex h-9 min-w-0 items-center gap-2">
            {/* The bar's mark follows the theme, like every other surface: a
                studio's logo is usually one colour, and the one drawn for dark
                is what a member sees all day after switching to light.
                A WORDMARK replaces the name; a square icon sits BESIDE it,
                because a two-letter mark alone does not say whose studio this
                is — and `brandMark` falls back to the icon when there is no
                wordmark, which is how the name silently vanished from the bar
                when the fallback was wired without this distinction. */}
            {barMark && (
              <img
                src={barMark}
                alt={barWordmark ? active.tenantName : ""}
                className={barWordmark ? "h-9 max-w-32 object-contain" : "size-9 shrink-0 rounded-lg object-cover"}
              />
            )}
            {!barWordmark && (
              <span className="flex h-9 items-center truncate text-base font-semibold tracking-tight">{active.tenantName}</span>
            )}
            {isStaff && (
              <span className="hidden h-9 items-center rounded-full bg-secondary px-2.5 text-micro uppercase text-muted-foreground sm:inline-flex">
                {clientSurface ? "Train" : "Coach"}
              </span>
            )}
            {/* Which studio am I in, and are there others? Next to the brand,
                because that is what it changes — not in the account menu, where
                it read as a personal setting rather than a change of workspace. */}
            <StudioSwitcher />
          </div>
        }
        trailing={
          <>
            {/* Connectivity first in the trailing row: when the radio is dead it's
                the single most load-bearing thing on the bar — it's what explains
                why a log said "will sync" and why a screen is showing stale data. */}
            <OfflinePill />
            {clientSurface && clientId && (
              <button onClick={() => nav("/explore")} className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" aria-label="Explore resources">
                <BookOpen className="size-[1.15rem]" />
              </button>
            )}
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full outline-none ring-ring focus-visible:ring-2" aria-label="Account">
                  {/* The same face the rest of the app draws for this person:
                      the photo they uploaded in Profile, else their shuffled
                      DiceBear seed — both off the CLIENT row, which is where
                      `POST /clients/:id/avatar` writes them and where the coach's
                      roster reads them. `user.image` is Better Auth's own field
                      and is never set on this passwordless stack, so the bar used
                      to ignore an uploaded photo and seed a different robot from
                      the email. Staff with no client record keep initials. */}
                  <Avatar
                    name={ctx!.user.name || ctx!.user.email}
                    src={active.avatarUrl ?? ctx!.user.image}
                    seed={active.avatarSeed ?? active.clientId ?? ctx!.user.email}
                    className="size-9"
                  />
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
                {clientSurface && clientId && (
                  <DropdownMenuItem onSelect={() => nav("/shop")}><Store /> Plans &amp; access</DropdownMenuItem>
                )}
                {/* ONE door for everything about me. This was three entries a tap
                    apart — Profile, Preferences, Passkeys & security — each a
                    half-empty screen about the same subject, so finding your own
                    units meant remembering which of the three it was behind. The
                    old routes still work as deep links into their section. */}
                <DropdownMenuItem onSelect={() => nav("/profile")}><SlidersHorizontal /> Settings</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => nav("/media")}><ImageIcon /> Media library</DropdownMenuItem>
                {active.role === "owner" && <DropdownMenuItem onSelect={() => nav("/settings")}><SettingsIcon /> Studio settings</DropdownMenuItem>}
                {/*
                    A HOP TO THE DOOR, NOT AN IN-APP ROUTE.

                    This used to render the whole operator console inside the
                    studio shell. In production every one of its calls 404s:
                    `/api/admin/*` answers on the operator door and nowhere else
                    (route-guard.ts), precisely so a session valid across the
                    root cannot carry platform powers onto a tenant's subdomain.
                    So the route loaded a console that then failed everywhere —
                    a surface that looked reachable and was not. The console has
                    one address; this goes there.
                */}
                {ctx!.isPlatformAdmin && host?.rootDomain && (
                  <DropdownMenuItem onSelect={() => { location.href = adminUrl(host.rootDomain); }}>
                    <ShieldCheck /> Platform admin
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={toggleMode}>{themeMode === "dark" ? <Sun /> : <Moon />} {themeMode === "dark" ? "Light mode" : "Dark mode"}</DropdownMenuItem>
                {/* The only way off a stale cached build on a phone: mobile browsers
                    expose no way to unregister a service worker. Keeps you signed in
                    and keeps your settings — see hard-refresh.ts. */}
                <DropdownMenuItem onSelect={() => void hardRefresh()}><RefreshCw /> Check for updates</DropdownMenuItem>
                <DropdownMenuItem destructive onSelect={() => void signOut()}><LogOut /> Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {/* Unsubscribed-owner notice. Directly under the app bar, above every coach
          screen — an owner cannot reach any part of their studio without passing
          it, and it is structurally invisible to clients (see BillingNotice). */}
      {!clientSurface && active.role === "owner" && <BillingNotice />}

      {/* An archived client can READ their history but not add to it. Without
          saying so, every log button becomes a 403 with no explanation — the
          server refuses correctly and the person has no idea why. Directly under
          the bar, above every screen, so it cannot be missed or scrolled past. */}
      {clientSurface && ctx!.clientAccess?.archived && (
        <div role="status" className="border-b border-border/40 bg-warning/10 px-4 py-2.5 text-center text-sm text-warning">
          <span className="font-medium">Your history is read-only.</span>{" "}
          {active.tenantName} has closed your place here — everything you logged is still yours to look back on.
        </div>
      )}

      {/*
        THE CONTENT COLUMN — UI-LANGUAGE §2, §11.

        Every screen renders inside one centred column that stops growing at
        720px. Without it, desktop was the anti-pattern the language names
        explicitly: a row stretched to 1400px with its value floating in the
        void, a banner spanning the whole viewport, and a hero whose two halves
        drifted apart until they stopped reading as one object.

        Wider viewports get MORE COLUMNS, never a wider one — which is also why
        every card in the product can be designed once and be pixel-correct at
        any width: it is never asked to be a different shape.

        Applied here, once, rather than in ~40 screens that would each have to
        remember. Screens that genuinely need the full width (a plan builder
        canvas, a two-pane roster) opt out with `data-fullbleed` on their own
        root, which the negative margins below release.
      */}
      <main className="column [&>[data-fullbleed]]:max-w-none">
        <ErrorBoundary resetKey={loc.pathname}><Outlet /></ErrorBoundary>
      </main>
      </div>

      <BottomTabs tabs={tabs} active={current} onSelect={(k) => nav(`/${k}`)} tinted={tintedNav} />
      <NavRail tabs={tabs} active={current} onSelect={(k) => nav(`/${k}`)} tinted={tintedNav} brand={railMark ? <img src={railMark} alt={active.tenantName} className={hasIcon(ctx!.branding, themeMode) ? "size-full object-cover" : "size-full object-contain p-1"} /> : active.tenantName.charAt(0).toUpperCase()} />
    </div>
  );
}

/**
 * "This studio isn't paying for anything" — the missing half of the trial bug.
 *
 * An owner whose card confirmation failed used to land in a studio that looked
 * fully paid for, with no signal anywhere that they had no subscription. This is
 * that signal, and it is deliberately:
 *
 *  • **Owner-only and coach-surface-only.** Rendered from TabLayout behind
 *    `active.role === "owner" && !clientSurface`, and `GET /api/billing` is
 *    `billing:["read"]`, which `intersectGrant` makes structurally owner-only —
 *    so a client can neither see this nor fetch what feeds it. An owner in Train
 *    mode is on the client surface and doesn't see it either: that surface is
 *    their client-facing view, and a billing bar has no business in it.
 *  • **Not dismissible.** Dismissal is what the reported bug already did for
 *    free: the studio ran for 30 days looking healthy and then Stripe cancelled
 *    it. This is not a notice about an event, it is a description of the studio's
 *    current state, and it disappears the moment that state is fixed — so there
 *    is nothing to dismiss, only something to do.
 *  • **Specific about the cost.** The locked-feature count, client ceiling and
 *    credit grant come from the server's effective entitlements, so the copy
 *    cannot drift from what's actually enforced.
 */
function BillingNotice() {
  const nav = useNavigate();
  const loc = useLocation();
  const [state, setState] = useState<{
    billingState: string;
    pendingPlanName: string | null;
    lockedFeatures: string[];
    activeClientLimit: number;
    monthlyCredits: number;
  } | null>(null);
  // Once billing is healthy we stop asking (`ok`), so a paying tenant pays for
  // exactly one request per session. While it is NOT healthy we re-check on each
  // navigation, so the bar clears itself the moment the owner finishes paying.
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (ok) return;
    let alive = true;
    api
      .get<{
        subscription: { billingState?: string; pendingPlanName?: string | null };
        baseline?: { lockedFeatures?: string[]; activeClientLimit?: number; monthlyCredits?: number };
      }>("/api/billing")
      .then((b) => {
        if (!alive) return;
        const bs = b.subscription?.billingState;
        // Anything other than the two unpaid states is healthy enough that this
        // bar is not the right surface — a past-due tenant DOES have a
        // subscription and gets the dunning banner on Business instead.
        if (bs !== "pending" && bs !== "none") { setOk(true); setState(null); return; }
        setState({
          billingState: bs,
          pendingPlanName: b.subscription.pendingPlanName ?? null,
          lockedFeatures: b.baseline?.lockedFeatures ?? [],
          activeClientLimit: b.baseline?.activeClientLimit ?? 0,
          monthlyCredits: b.baseline?.monthlyCredits ?? 0,
        });
      })
      // A failed probe shows nothing rather than crying wolf about billing.
      .catch(() => { if (alive) setState(null); });
    return () => { alive = false; };
  }, [ok, loc.pathname]);

  if (!state) return null;
  const pending = state.billingState === "pending";
  const locked = state.lockedFeatures;
  const lockedText =
    locked.length === 0
      ? null
      : `${locked.slice(0, 3).join(", ")}${locked.length > 3 ? ` and ${locked.length - 3} more` : ""} ${locked.length === 1 ? "is" : "are"} off`;
  const limits = [
    state.activeClientLimit >= 0 ? `${state.activeClientLimit} active client${state.activeClientLimit === 1 ? "" : "s"} max` : null,
    state.monthlyCredits > 0 ? `${state.monthlyCredits.toLocaleString()} AI credits a month` : "no AI credits",
    lockedText,
  ].filter(Boolean) as string[];

  return (
    /*
      COMPACT BY DEFAULT, expandable for the detail.

      This shipped as a full explanation card pinned above every coach screen —
      on a phone it ate the top third of the viewport, so the first thing an
      owner saw was a paragraph about billing rather than their own studio. It
      pushed the anchor (§1) below the fold on the two screens that most need
      one.

      A banner is a T3 concern and must not occupy T1 space. So: one line, one
      action, and the consequences one tap away. Nothing is hidden that was not
      already a click from Business — and the state is still undismissable,
      because it describes the studio rather than announcing an event.
    */
    /* Constrained to the content column, not the viewport. On desktop this ran
       the full width of the window while every card below it stopped at 720 —
       so the label sat at the far left and its button ~900px away on the far
       right, which is §11's "a row stretched to 1400px with a value floating in
       the void", verbatim. */
    <div role="status" className="column px-4 pt-3">
      <details className="group overflow-hidden rounded-2xl border border-danger/30 bg-surface-1">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
          <AlertTriangle aria-hidden className="size-[1.05rem] shrink-0" style={{ color: toneVar.danger }} />
          <span className="min-w-0 flex-1 truncate text-caption font-semibold" style={{ color: toneVar.danger }}>
            {pending ? `${state.pendingPlanName ?? "Your plan"} was never activated` : "No subscription"}
          </span>
          <Button
            size="sm"
            className="shrink-0"
            style={{ backgroundColor: toneVar.danger }}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); nav("/business"); }}
          >
            {pending ? "Finish setup" : "Choose a plan"}
          </Button>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <p className="border-t border-border/50 px-3 py-2.5 text-caption leading-relaxed text-muted-foreground">
          {pending
            ? "The card step didn't complete, so nothing is being billed and you're running on Kova's free baseline"
            : "You're running on Kova's free baseline"}
          {limits.length > 0 ? `: ${limits.join(" · ")}.` : "."}
        </p>
      </details>
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

/** Owner-gated route wrapper. Redirects rather than stranding — see /settings. */
function OwnerOnly({ children }: { children: ReactNode }) {
  const { ctx } = useSession();
  if (!ctx) return null;
  return ctx.active?.role === "owner" ? <>{children}</> : <Navigate to="/preferences" replace />;
}

function SettingsRoute({ view }: { view: import("./screens/Settings.js").SettingsView }) {
  const nav = useNavigate();
  return <Settings onBack={() => nav(-1)} view={view} />;
}

function InboxRoute() {
  const nav = useNavigate();
  return <Inbox onBack={() => nav(-1)} />;
}

function MediaRoute() {
  const nav = useNavigate();
  return <MediaLibrary onBack={() => nav(-1)} />;
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
  // Sanitize the route param: only a non-negative integer is a valid day index.
  // Junk ("abc") or a negative value falls back to the day picker rather than
  // indexing plan.body.days out of bounds; the player clamps the upper end.
  const parsed = day != null ? Number(day) : NaN;
  const initialDay = Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
  return <WorkoutPlayer clientId={clientId} initialDay={initialDay} onExit={() => nav("/train")} />;
}
