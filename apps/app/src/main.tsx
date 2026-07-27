import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import "./styles.css";
import { SessionProvider, useSession } from "./session.js";
import { ThemeProvider } from "./theme.js";
import { Login } from "./screens/Login.js";
import { Start } from "./screens/Start.js";
import { Shell } from "./Shell.js";
import { AcceptInvite } from "./screens/AcceptInvite.js";
import { PlatformGate } from "./screens/onboarding/PlatformGate.js";
import { ONBOARDING_PATH, SIGN_IN_PATH } from "./screens/onboarding/paths.js";
import { PasskeyProvider } from "./PasskeyPrompt.js";
import { PwaUpdatePrompt, UnhandledErrorToast } from "./notices.js";
import { stripReloadParam } from "./hard-refresh.js";

/**
 * Branded boot screen — the studio's logo on a soft brand glow with a gentle
 * reveal and shimmer, so the app feels premium from the first frame. On a
 * white-label tenant (custom domain / branded host) the uploaded logo/icon
 * shows; otherwise the default Mossa mark. Branding is applied before this
 * paints, so it already sits in the tenant's palette and mode.
 */
function BootSplash() {
  const { host, ctx } = useSession();
  const branding = ctx?.branding ?? host?.tenant?.branding;
  const logo = branding?.iconUrl || branding?.logoUrl || null;
  const name = host?.tenant?.name ?? null;
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(58% 46% at 50% 42%, color-mix(in oklch, var(--primary) 16%, transparent), transparent 72%)" }} />
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="relative flex flex-col items-center gap-7">
        <div className="relative grid size-24 place-items-center">
          <motion.span aria-hidden className="absolute inset-0 rounded-3xl ring-1 ring-primary/20" animate={{ rotate: 360 }} transition={{ duration: 9, repeat: Infinity, ease: "linear" }} />
          <motion.div
            initial={{ scale: 0.82, opacity: 0, y: 4 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="grid size-20 place-items-center overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-glow"
          >
            {logo ? <img src={logo} alt="" className="size-full object-cover" /> : <span className="text-3xl font-black tracking-tight">{(name?.[0] ?? "M").toUpperCase()}</span>}
          </motion.div>
        </div>
        {name && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.5 }} className="text-[0.95rem] font-semibold tracking-tight text-foreground/85">
            {name}
          </motion.div>
        )}
        <div className="h-1 w-36 overflow-hidden rounded-full bg-surface-2">
          <motion.div className="h-full w-1/3 rounded-full bg-primary" animate={{ x: ["-120%", "320%"] }} transition={{ duration: 1.15, repeat: Infinity, ease: "easeInOut" }} />
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Which top-level screen this request gets.
 *
 * ── The platform host is no longer an end-user signup surface ────────────────
 *
 * `mossa.4dl.app/` used to render the same OTP form to everybody, so a client of
 * a studio who landed there signed up under *Mossa* instead of under their coach —
 * an orphan account in the wrong tenant, with nothing to tell them so. An
 * unauthenticated visitor at `/` on the platform host now gets `PlatformGate`,
 * which explains what Mossa is, points at the marketing site, and — the actual
 * point — tells an end user to use the link their coach sent them.
 *
 * The four rules that keep that from locking anyone out:
 *
 *  1. **Tenant surfaces are untouched.** `host.tenant` is set by a custom domain
 *     or a `/t/<slug>` entry, and there the branded `Login` still renders at `/`.
 *     That IS the end-user door; the gate must never appear on it.
 *  2. **Mossa's own sign-in moved to `/studio/sign-in`** (`SIGN_IN_PATH`), linked
 *     from `apps/www` and from the gate's low-emphasis "Already have a Mossa
 *     account? Sign in" — so an installed PWA (whose `start_url` is `/`) opening
 *     signed-out still has a one-tap way in.
 *  3. **Deep links still sign in.** Only `/` is gated; any other unauthenticated
 *     platform path keeps rendering `Login`, so an emailed link like
 *     `/labs?lab=…` doesn't lose its destination behind an interstitial.
 *  4. **A signed-in user is unaffected** — `ctx` short-circuits everything above
 *     and the Shell renders exactly as before.
 *
 * `/studio/setup` renders the onboarding wizard even when a tenant already
 * exists: step 1 creates the studio mid-flow, so the path (not session state) is
 * what keeps the wizard mounted and makes a reload resume rather than restart.
 */
function pickScreen(
  loading: boolean,
  ctx: unknown,
  hostResolved: boolean,
  hostIsTenant: boolean,
  path: string,
): "boot" | "login" | "gate" | "start" | "shell" {
  if (loading) return "boot";
  if (!ctx) {
    // The host probe decides gate-vs-login; without it we'd flash the wrong one.
    if (!hostResolved) return "boot";
    if (hostIsTenant) return "login";
    if (path === SIGN_IN_PATH) return "login";
    return path === "/" ? "gate" : "login";
  }
  const active = (ctx as { active: unknown }).active;
  if (!active) return "start";
  return path.startsWith(ONBOARDING_PATH) ? "start" : "shell";
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
  const screen = pickScreen(loading, ctx, host !== null, Boolean(host?.tenant), location.pathname);
  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div key={screen} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          {screen === "boot" && <BootSplash />}
          {screen === "gate" && <PlatformGate />}
          {screen === "login" && <Login />}
          {screen === "start" && <Start />}
          {screen === "shell" && <PasskeyProvider><Shell /></PasskeyProvider>}
        </motion.div>
      </AnimatePresence>
      {/* App-level, screen-independent: a promise nobody caught must at least be
          visible, and a waiting service-worker update must be announced rather
          than silently applied mid-session. Outside AnimatePresence so neither
          is torn down by a screen transition. */}
      <UnhandledErrorToast />
      <PwaUpdatePrompt />
    </>
  );
}

// Drop the cache-buster the manual "Check for updates" reload appends, so it
// never gets bookmarked or shared.
stripReloadParam();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <SessionProvider>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </SessionProvider>
      </BrowserRouter>
    </MotionConfig>
  </StrictMode>,
);
