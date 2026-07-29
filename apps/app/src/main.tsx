import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Atmosphere, anchorIn, contentIn, contentStagger, DUR} from "@4dl/ui";
import "./styles.css";
import { SessionProvider, useSession } from "./session.js";
import { ThemeProvider } from "./theme.js";
import { Login } from "./screens/Login.js";
import { Start } from "./screens/Start.js";
import { Shell } from "./Shell.js";
import { AcceptInvite } from "./screens/AcceptInvite.js";
import { NoStudio, RootSignpost, WrongDoor } from "./screens/Doors.js";
import { AdminDoor } from "./screens/AdminDoor.js";
import { ONBOARDING_PATH } from "./screens/onboarding/paths.js";
import { PasskeyProvider } from "./PasskeyPrompt.js";
import { PwaUpdatePrompt, UnhandledErrorToast } from "./notices.js";
import { stripReloadParam } from "./hard-refresh.js";

/**
 * Branded boot screen — the very first frame of the product.
 *
 * On a white-label tenant (custom domain / branded host) the uploaded logo/icon
 * shows; otherwise the default Kova mark. Branding is applied before this
 * paints, so it already sits in the tenant's palette and mode.
 *
 * Design note (UI-LANGUAGE §8): the mark **settles down from 1.06**, it does not
 * grow from 0.82. That inversion is the whole entrance language in one element,
 * and the boot screen is where a user meets it first — so getting it right here
 * sets the expectation every subsequent screen keeps. The old spinning ring is
 * gone: an indefinite rotation is decoration that also implies work is happening
 * at a rate it cannot know. The progress bar stays, because it is honest about
 * being indeterminate.
 */
function BootSplash() {
  const { host, ctx } = useSession();
  const branding = ctx?.branding ?? host?.tenant?.branding;
  const logo = branding?.iconUrl || branding?.logoUrl || null;
  const name = host?.tenant?.name ?? null;
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-background">
      <Atmosphere />
      <motion.div
        initial="hidden"
        animate="show"
        variants={contentStagger}
        className="relative flex flex-col items-center gap-6"
      >
        <motion.div
          variants={anchorIn}
          className="grid size-20 place-items-center overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-glow"
        >
          {logo ? <img src={logo} alt="" className="size-full object-cover" /> : <span className="text-title-1 font-black">{(name?.[0] ?? "K").toUpperCase()}</span>}
        </motion.div>
        {name && <motion.div variants={contentIn} className="text-body-lg">{name}</motion.div>}
        <motion.div variants={contentIn} className="h-1 w-32 overflow-hidden rounded-full bg-surface-2">
          <motion.div className="h-full w-1/3 rounded-full bg-primary" animate={{ x: ["-120%", "320%"] }} transition={{ duration: 1.15, repeat: Infinity, ease: "easeInOut" }} />
        </motion.div>
      </motion.div>
    </div>
  );
}

export type Screen = "boot" | "login" | "signpost" | "nostudio" | "wrongdoor" | "start" | "shell" | "admin";

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
  host: { role: string; tenant: unknown } | null,
  path: string,
): Screen {
  // Both are needed before anything can be chosen, and guessing flashes the wrong
  // screen — which on this set of doors means flashing a login at someone who has
  // no studio to log in to.
  if (loading || !host) return "boot";

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
