/**
 * WHICH SCREEN — decided by WHICH DOOR, not by the path.
 *
 * That inversion is the whole point of `@4dl/tenancy`'s host model, and it is
 * the same arrangement Kova arrived at after getting it wrong the other way. The
 * hostname carries the answer, resolved server-side before any of this runs:
 *
 *   root      a signpost. Never a login — the server will not send a sign-in
 *             code here, so a form would be a lie.
 *   setup     the only place a centre is created.
 *   tenant    a centre. Nothing behind the name → say so, do NOT offer a login
 *   custom    to somewhere that does not exist.
 *   invalid   nothing.
 *
 * ⚠️ Drive the WORKER (:8787), not vite (:5273). With the vite proxy the browser
 * Origin is the vite port while the worker's is its own, and Better Auth ignores
 * the `trustedOrigins` array — so every cookie-bearing auth POST 403s
 * `INVALID_ORIGIN`. Production is same-origin and unaffected. Kova hit this and
 * documented it in CLAUDE.md; the same trap is here.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { MotionConfig } from "motion/react";
import { Screen, Spinner } from "@4dl/ui";
import { ErrorBoundary, ThemeProvider } from "@4dl/app-kit";
import "./styles.css";
import { SessionProvider, useSession } from "./session.js";
import { I18nProvider } from "./i18n.js";
import { Shell } from "./Shell.js";
import { Login } from "./screens/Login.js";
import { NoStudio, RootSignpost, Start, WrongDoor } from "./screens/Doors.js";
import { AcceptInvite } from "./screens/AcceptInvite.js";
import { AdminDoor } from "./screens/Admin.js";
import { Labels } from "./screens/Labels.js";
import { Settings } from "./screens/Settings.js";
import { Inbox } from "./Notifications.js";
import { Recall } from "./screens/Recall.js";

export type ScreenName = "boot" | "login" | "signpost" | "nostudio" | "wrongdoor" | "start" | "admin" | "shell";

export function pickScreen(
  loading: boolean,
  ctx: { active: unknown } | null,
  host: { role: string; tenant: unknown } | null,
): ScreenName {
  // Both are needed before anything can be chosen. Guessing flashes the wrong
  // screen, which on this set of doors means flashing a login at someone who has
  // no centre to log in to.
  if (loading || !host) return "boot";
  switch (host.role) {
    case "invalid":
      return "wrongdoor";
    case "root":
      return "signpost";
    case "setup":
      return ctx ? "start" : "login";
    /**
     * The OPERATOR door. It has no tenant by construction, so without this case
     * it fell into `default` below, failed `!host.tenant`, and rendered "no
     * centre at this address" — while `/api/admin/*` answered underneath it.
     * Signed out, it shows the sign-in form: this is a platform door and the
     * server will issue a code for it.
     */
    case "admin":
      return ctx ? "admin" : "login";
    default: {
      if (!host.tenant) return "nostudio";
      if (!ctx) return "login";
      // Signed in, but not a member of THIS centre. The setup door is where a
      // centre is made; here there is nothing to show them.
      if (!(ctx as { active: unknown }).active) return "nostudio";
      return "shell";
    }
  }
}

function Boot() {
  return (
    <Screen center>
      <div className="py-24"><Spinner /></div>
    </Screen>
  );
}

function App() {
  const { loading, ctx, host } = useSession();
  const location = useLocation();
  const screen = pickScreen(loading, ctx, host);

  /**
   * The invitation link BYPASSES `pickScreen`, and it has to.
   *
   * Whoever clicks it is by definition not yet a member of this centre, so
   * `pickScreen` resolves `nostudio` — "no centre uses this address" — on the
   * one screen whose entire job is to say the opposite. Guarded on `loading` so
   * it does not flash before the host is known.
   */
  if (!loading && location.pathname.startsWith("/accept-invitation/")) {
    return (
      <Routes location={location}>
        <Route path="/accept-invitation/:id" element={<AcceptInvite />} />
      </Routes>
    );
  }

  if (screen !== "shell") {
    return (
      <>
        {screen === "boot" && <Boot />}
        {screen === "signpost" && <RootSignpost />}
        {screen === "nostudio" && <NoStudio />}
        {screen === "wrongdoor" && <WrongDoor />}
        {screen === "login" && <Login />}
        {screen === "start" && <Start />}
        {screen === "admin" && <AdminDoor />}
      </>
    );
  }

  /**
   * The recall report is a ROUTE rather than a sheet, and that is deliberate: it
   * is a document a centre works through over days and hands to an inspector,
   * so it has to survive a reload and be linkable. Everything else in the app is
   * a tab or a sheet over one.
   */
  return (
    <Routes location={location}>
      <Route path="/recall/:cycleId" element={<Recall />} />
      {/* Also a route rather than a sheet: printing is a full-page act, and the
          print stylesheet needs the sheet to be the whole document. */}
      <Route path="/labels" element={<Labels />} />
      {/* A ROUTE, not a Shell tab: settings is a place you go and come back
          from, and the account menu already navigates here. It used to match the
          catch-all below and render the app chrome over an empty body. */}
      <Route path="/settings" element={<Settings onBack={() => history.back()} />} />
      {/* Also a route: a notification's deep link has to survive being opened
          from an email in a fresh browser, and the bell's "See all" needs
          somewhere to go that a back button can return from. */}
      <Route path="/inbox" element={<Inbox />} />
      <Route path="*" element={<Shell />} />
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <SessionProvider>
          <ThemeProvider branding={null}>
            {/* Inside the session so a future per-centre default locale can read
                it, and outside the app so every screen has `t` from first paint
                — a screen that renders once in English and then swaps is worse
                than one that waits. */}
            <I18nProvider>
              <ErrorBoundary>
                <App />
              </ErrorBoundary>
            </I18nProvider>
          </ThemeProvider>
        </SessionProvider>
      </BrowserRouter>
    </MotionConfig>
  </StrictMode>,
);
