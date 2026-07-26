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
import { PasskeyProvider } from "./PasskeyPrompt.js";
import { PwaUpdatePrompt, UnhandledErrorToast } from "./notices.js";

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
          <motion.span aria-hidden className="absolute inset-0 rounded-[2rem]" style={{ boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--primary) 22%, transparent)" }} animate={{ rotate: 360 }} transition={{ duration: 9, repeat: Infinity, ease: "linear" }} />
          <motion.div
            initial={{ scale: 0.82, opacity: 0, y: 4 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="grid size-20 place-items-center overflow-hidden rounded-[1.6rem] bg-primary text-primary-foreground shadow-[0_16px_50px_-12px_color-mix(in_oklch,var(--primary)_65%,transparent)]"
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

function App() {
  const { loading, ctx } = useSession();
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
  const screen = loading ? "boot" : !ctx ? "login" : !ctx.active ? "start" : "shell";
  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div key={screen} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          {screen === "boot" && <BootSplash />}
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
