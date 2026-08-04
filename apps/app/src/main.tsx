import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Atmosphere, brandMark, DUR, EASE_OUT, SPRING_SOFT, exitOf, hasIcon, markPlateClass, Toaster, cn, type Variants } from "@4dl/ui";
import "./styles.css";
import { SessionProvider, useSession } from "./session.js";
import { bootBrand, ThemeProvider, useTheme } from "./theme.js";
import { Login } from "./screens/Login.js";
import { Start } from "./screens/Start.js";
import { Shell } from "./Shell.js";
import { AcceptInvite } from "./screens/AcceptInvite.js";
import { NoStudio, RootSignpost, WrongDoor } from "./screens/Doors.js";
import { Maintenance } from "./screens/Maintenance.js";
import { AdminDoor } from "./screens/AdminDoor.js";
import { ONBOARDING_PATH } from "./screens/onboarding/paths.js";
import { PasskeyProvider } from "./PasskeyPrompt.js";
import { PwaUpdatePrompt, UnhandledErrorToast } from "./notices.js";
import { stripReloadParam } from "./hard-refresh.js";
import { ErrorBoundary } from "./ErrorBoundary.js";

/**
 * Branded boot screen — the very first frame of the product.
 *
 * On a white-label tenant (custom domain / branded host) the uploaded logo/icon
 * shows; otherwise the default Kova mark. Branding is applied before this
 * paints, so it already sits in the tenant's palette and mode.
 *
 * ── Whose brand, before anyone has said ─────────────────────────────────────
 *
 * The session has nothing here: `/api/host` and `/api/context` are both still in
 * flight, which is precisely why this screen exists. It used to fall back to
 * Kova's mark — the letter "K" on the default primary — so every client of every
 * white-labelled studio met the VENDOR for a beat before meeting their coach, on
 * the screen that opens every session. Two fixes, in order:
 *
 *   the REMEMBERED brand   what this hostname resolved to last time (theme.tsx).
 *                          Covers every visit after the first, and the offline
 *                          cold start, which is the one boot with no network at
 *                          all.
 *   NEUTRAL, not Kova      when even that is absent — a first-ever visit — show
 *                          a plain plate and the progress bar. Nothing in the
 *                          browser can know the studio at that instant, and an
 *                          unlabelled moment is honest where the wrong brand is
 *                          not. The letter comes back the moment a NAME does,
 *                          which on the platform's own doors is immediately.
 *
 * ── The studio's PLATE is theirs, and this screen used to overrule it ───────
 *
 * `branding.mark.plate` is a real choice in the brand editor — `accent` (a solid
 * brand square with the letters knocked out), `tint` (the same at 16%), or
 * `none` (a bare mark on nothing) — and it is baked INTO the generated PNG by
 * `renderMarkPng`. This screen painted `bg-primary` behind whatever it was
 * handed, which quietly overruled two of the three: a `tint` mark had its 16%
 * plate backfilled to a solid block, and a studio that deliberately chose a bare
 * mark got a coloured square anyway — on the very first frame of their product.
 *
 * `markPlateClass` (`@4dl/ui` theme.ts) is the one home for that decision, and
 * the nav rail reads it through `NavRail`'s `brandPlate`. The switcher and the
 * doors do NOT, and cannot: they list several studios from `PersonaRef`s, which
 * carry an icon and a colour and deliberately not `mark` — see the type's own
 * comment on why a persona is not a whole branding. They keep their uniform
 * tint, which is the right treatment for a list anyway.
 *
 * ── The choreography, and why it is weighted the way it is ──────────────────
 *
 * ENTRY settles rather than arrives: the mark fades up from 0.92 on a soft
 * spring while a glow blooms behind it, then the name, then the bar. Nothing
 * overshoots — a boot screen that bounces reads as a toy, and this is the frame
 * that sets the tone for everything after it.
 *
 * EXIT runs in REVERSE ORDER (`staggerDirection: -1`), which is the whole
 * trick: the bar goes first, then the name, and the mark leaves LAST while
 * growing slightly. So the screen does not blink away — it clears back to the
 * mark, and the mark opens. The app is behind it the moment it is gone.
 * `AnimatePresence mode="wait"` in `App` is what makes that readable: the shell
 * waits, so the exit is a transition rather than a collision.
 *
 * Every duration comes from the registry (§8) and the exit is `exitOf` the
 * entrance, so a leaving screen is decisive rather than reluctant. Under
 * `prefers-reduced-motion` the transforms drop out and the opacity carries it,
 * which is why the choreography never depends on movement alone.
 */

const splashStagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: DUR.fast, delayChildren: 0.05 } },
  // Reversed: the mark is the last thing to leave.
  exit: { transition: { staggerChildren: exitOf(DUR.fast), staggerDirection: -1 } },
};

const markIn: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  show: { opacity: 1, scale: 1, transition: SPRING_SOFT },
  // Grows on the way out — the mark opening into the app, not shrinking away.
  exit: { opacity: 0, scale: 1.14, transition: { duration: DUR.base, ease: EASE_OUT } },
};

/** The bloom's strength lives in the VARIANT, not in an `opacity-70` class:
 *  motion writes `opacity` as an inline style, which beats the class outright,
 *  so a Tailwind opacity here would be silently ignored the moment it animated. */
const glowIn: Variants = {
  hidden: { opacity: 0, scale: 0.6 },
  show: { opacity: 0.7, scale: 1, transition: { duration: DUR.slow, ease: EASE_OUT } },
  exit: { opacity: 0, scale: 1.6, transition: { duration: DUR.base, ease: EASE_OUT } },
};

const lineIn: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE_OUT } },
  exit: { opacity: 0, y: 4, transition: { duration: exitOf(DUR.base), ease: EASE_OUT } },
};

function BootSplash() {
  const { host, ctx } = useSession();
  const { mode } = useTheme();
  const branding = ctx?.branding ?? host?.tenant?.branding ?? bootBrand?.branding;
  const logo = brandMark(branding, mode, "icon");
  // A wordmark handed to a square slot gets its middle third cropped, which
  // is the first thing anyone sees of the studio. Fit it instead.
  const square = hasIcon(branding, mode);
  const name = host?.tenant?.name ?? bootBrand?.name ?? null;
  const initial = name?.trim()?.[0]?.toUpperCase() ?? null;
  // The studio's own plate, and only where WE are drawing one. The letter
  // fallback is not their mark, so it keeps the accent plate whatever they set
  // for an icon they have not uploaded. `glow` is this surface's call, not
  // theirs: a 96px hero mark earns the brand shadow; the nav rail's 44px tile
  // asks for the same plate without it.
  const plate = logo
    ? markPlateClass(branding, { glow: true })
    : initial ? markPlateClass(null, { glow: true }) : "bg-surface-2";

  return (
    // `Atmosphere` stays OUTSIDE the choreography on purpose: `atmosphereIn`
    // declares `hidden`/`show` and no `exit`, so inside the stagger parent it
    // would both consume a stagger slot and sit there un-animated while
    // everything else left. The wash belongs to the screen, not to the sequence.
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-background">
      <Atmosphere />
      <motion.div
        initial="hidden"
        animate="show"
        exit="exit"
        variants={splashStagger}
        className="relative flex flex-col items-center gap-6"
      >
        <div className="relative grid place-items-center">
          {/* The bloom. Behind the mark, `aria-hidden`, and pure light — it
              carries the entrance when reduced motion has removed the scale. */}
          <motion.div
            aria-hidden
            variants={glowIn}
            className="pointer-events-none absolute size-44 rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, var(--primary) 0%, transparent 70%)" }}
          />
          <motion.div
            variants={markIn}
            className={cn("relative grid size-20 place-items-center overflow-hidden rounded-2xl text-primary-foreground", plate)}
          >
            {logo
              ? <img src={logo} alt="" className={square ? "size-full object-cover" : "size-full object-contain p-2"} />
              : initial && <span className="text-title-1 font-black">{initial}</span>}
          </motion.div>
        </div>
        {name && <motion.div variants={lineIn} className="text-body-lg">{name}</motion.div>}
        <motion.div variants={lineIn} className="h-1 w-32 overflow-hidden rounded-full bg-surface-2">
          <motion.div className="h-full w-1/3 rounded-full bg-primary" animate={{ x: ["-120%", "320%"] }} transition={{ duration: 1.15, repeat: Infinity, ease: "easeInOut" }} />
        </motion.div>
      </motion.div>
    </div>
  );
}

export type Screen = "boot" | "maintenance" | "login" | "signpost" | "nostudio" | "wrongdoor" | "start" | "shell" | "admin";

/**
 * Which top-level screen this request gets — decided by WHICH DOOR the app is
 * being served on, not by the path.
 *
 * That inversion is the point of the whole host model. Previously one shared
 * hostname served every purpose and this function had to infer intent from the
 * URL path plus a `host.tenant` that only *branding* depended on. Now the
 * hostname carries the answer, resolved server-side before any of this runs:
 *
 *   root      a signpost. Never an app, never a login — the server will not even
 *             send a sign-in code here, so offering the form would be a lie.
 *             Renders for signed-in visitors too, which is why `ctx` does not
 *             short-circuit it: the root has no tenancy for a Shell to scope to.
 *   setup     the studio wizard. Signed out → the owner sign-in.
 *   admin     the operator console, standalone. It must not depend on the operator
 *             owning a studio, so it does not go through the Shell's persona path.
 *   tenant    a studio. No studio behind the name → `nostudio`, NOT a login:
 *   custom    inviting someone to sign in somewhere that does not exist is worse
 *             than telling them the address is wrong.
 *   invalid   nothing.
 *
 * `/studio/setup` still renders the wizard even once a tenant exists: step 1
 * creates the studio mid-flow, so the path (not session state) is what keeps the
 * wizard mounted and makes a reload resume rather than restart.
 */
export function pickScreen(
  loading: boolean,
  ctx: { active: unknown } | null,
  host: { role: string; tenant: unknown; maintenance?: { level?: string } | null } | null,
  path: string,
): Screen {
  // Both are needed before anything can be chosen, and guessing flashes the wrong
  // screen — which on this set of doors means flashing a login at someone who has
  // no studio to log in to.
  if (loading || !host) return "boot";

  /**
   * The deployment is closed — outranks every door but the operator's.
   *
   * Above the role switch because at `full` the server refuses `/api/context`
   * and the auth lane, so `ctx` is null and every branch below would land on a
   * login whose "Continue" can only ever return 503. Showing someone a form that
   * cannot work is worse than showing them the closed sign.
   *
   * `admin` is excluded for the same reason the route guard exempts that door:
   * it is where the switch is turned back off. `readonly` is NOT handled here —
   * the app still works at that level, and the Shell announces it in a banner.
   */
  if (host.maintenance?.level === "full" && host.role !== "admin") return "maintenance";

  switch (host.role) {
    case "invalid":
      return "wrongdoor";
    case "root":
      return "signpost";
    case "admin":
      return ctx ? "admin" : "login";
    case "setup":
      if (!ctx) return "login";
      // A studio-less owner and a mid-wizard owner both belong in the wizard; an
      // owner who has finished has no business on the setup door, and the wizard
      // itself sends them on to their studio.
      return "start";
    default: {
      // tenant | custom — a studio host.
      if (!host.tenant) return "nostudio";
      if (!ctx) return "login";
      if (!ctx.active) return "start";
      return path.startsWith(ONBOARDING_PATH) ? "start" : "shell";
    }
  }
}

function App() {
  const { loading, ctx, host } = useSession();
  const location = useLocation();
  // The staff-invite deep-link renders BEFORE the session gate: a brand-new
  // invitee isn't signed in yet, so it must not be short-circuited to Login.
  // Rendered inside a matching Route so AcceptInvite's useParams resolves.
  if (location.pathname.startsWith("/accept-invitation/")) {
    return (
      <Routes>
        <Route path="/accept-invitation/:invitationId" element={<AcceptInvite />} />
      </Routes>
    );
  }
  const screen = pickScreen(loading, ctx, host, location.pathname);
  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div key={screen} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: DUR.base }}>
          {screen === "boot" && <BootSplash />}
          {screen === "maintenance" && <Maintenance state={host!.maintenance!} brandName={host?.tenant?.name ?? null} />}
          {screen === "signpost" && <RootSignpost />}
          {screen === "nostudio" && <NoStudio />}
          {screen === "wrongdoor" && <WrongDoor />}
          {screen === "login" && <Login />}
          {screen === "start" && <Start />}
          {/* The operator console, standalone. Outside the Shell on purpose: the
              Shell scopes itself to an active persona, and a platform operator
              need not own a studio at all. */}
          {screen === "admin" && <AdminDoor />}
          {screen === "shell" && <PasskeyProvider><Shell /></PasskeyProvider>}
        </motion.div>
      </AnimatePresence>
      {/* App-level, screen-independent: a promise nobody caught must at least be
          visible, and a waiting service-worker update must be announced rather
          than silently applied mid-session. Outside AnimatePresence so neither
          is torn down by a screen transition. */}
      <UnhandledErrorToast />
      <PwaUpdatePrompt />
      {/* Every refused write in the app lands here. Outside AnimatePresence and
          outside the router on purpose: a toast that unmounts with the screen
          that caused it is the failure this replaces. */}
      <Toaster />
    </>
  );
}

// Drop the cache-buster the manual "Check for updates" reload appends, so it
// never gets bookmarked or shared.
stripReloadParam();

/**
 * THE ROOT BOUNDARY — the one that stops a crash being a BLACK SCREEN.
 *
 * `Shell` has had a boundary around its `<Routes>` since the plan builder went
 * full-screen, and that covers every routed screen. It covers nothing else: not
 * `SessionProvider`, not `ThemeProvider`, not `App`/`pickScreen`, and not the
 * early `return`s at the top of `Shell` — the boot spinner, `StudioBlocked`, and
 * the locked `Shop`. A throw in any of those is not caught by anything, so React
 * unmounts the whole root, `#root` empties, and the page is left showing the
 * `body` background and nothing else.
 *
 * That is not a hypothetical: a client reported a dark, empty screen after
 * finishing their intake, and the blank area sampled to `oklch(0.165 …)` — the
 * `--background` token exactly. The stylesheet had loaded; React had rendered
 * nothing. There was no message, no button, and no console to open on a phone,
 * so the fault could not even be named, let alone fixed.
 *
 * Tessa has had this since it was written. Kova never got it — which is the
 * whole reason its failure mode was a photograph of a black rectangle.
 *
 * It is deliberately the OUTERMOST thing inside `StrictMode`: a boundary can
 * only catch what is below it, so anything it does not enclose is a screen this
 * app still cannot apologise for.
 */
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <SessionProvider>
            <ThemeProvider>
              <App />
            </ThemeProvider>
          </SessionProvider>
        </BrowserRouter>
      </MotionConfig>
    </ErrorBoundary>
  </StrictMode>,
);
