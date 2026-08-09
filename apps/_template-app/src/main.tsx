/**
 * WHICH SCREEN — decided by WHICH DOOR, not by the path.
 *
 * That inversion is the whole point of `@4dl/tenancy`'s host model, and every
 * app here arrived at it — two of them after getting it wrong the other way. The
 * hostname carries the answer, resolved server-side before any of this runs:
 *
 *   root      a signpost. NEVER a login — the server refuses to send a sign-in
 *             code here, so a form would be a lie about what pressing it does.
 *   setup     the only place a tenant is created.
 *   admin     the operator console. No tenant, by construction.
 *   tenant    a tenant. Nothing behind the name → say so, do NOT offer a login
 *   custom    to somewhere that does not exist.
 *   invalid   nothing.
 *
 * The decision itself is `screen.ts`, deliberately: this file calls
 * `createRoot(document…)` at module scope, so anything defined here cannot be
 * imported by a test. `pickScreen` was untestable for exactly that reason in the
 * app that wrote it inline, which is a large part of why two of its inputs were
 * declared and never read.
 *
 * ⚠️ **Drive the WORKER (:8787), not vite.** With the vite proxy the browser
 * Origin is the vite port while the worker's is its own, and Better Auth ignores
 * the `trustedOrigins` array — so every cookie-bearing auth POST 403s
 * `INVALID_ORIGIN`. Production is same-origin and unaffected. Every app in this
 * repo has hit this.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { MotionConfig } from "motion/react";
import { Screen, Spinner, Toaster } from "@4dl/ui";
import { ErrorBoundary, MaintenanceScreen } from "@4dl/app-kit";
import "./styles.css";
import { SessionProvider, useSession } from "./session.js";
import { ThemeProvider } from "./theme.js";
import { pickScreen } from "./screen.js";
import { Shell } from "./Shell.js";
import { TenantBlocked } from "./screens/Blocked.js";
import { Login } from "./screens/Login.js";
import { NoTenantHere, RootSignpost, WrongDoor } from "./screens/Doors.js";
import { AdminDoor } from "./screens/Admin.js";
import { Settings } from "./screens/Settings.js";
import { InboxPage } from "./Notifications.js";

function Boot() {
  return (
    <Screen center>
      <div className="py-24"><Spinner /></div>
    </Screen>
  );
}

/**
 * The setup door, once signed in — where a tenant is created.
 *
 * ⚠️ **This is a WIZARD, not a two-field form, and the difference is not
 * cosmetic.** `@4dl/ui`'s `StepHeader`/`StepPanel`/`StepActions` are the shape
 * all three apps use: name → plan → start, with the tenant created BETWEEN the
 * last two steps so Back is lossless and a Stripe subscription has something to
 * attach to.
 *
 * The reason it matters is what happens after the form. A catalog whose `free`
 * row is an `active: 0` parking state makes `statusOf` report `incomplete` for a
 * tenant that never chose a plan — and the host gate turns that into READ-ONLY.
 * A tenant created by a form with nothing after it therefore lands in a product
 * where every write is refused, on the very first screen, with nothing on it
 * explaining why. Tessa shipped that.
 *
 * ⚠️ And the DEGRADE lane is the feature, not the fallback: with no Stripe keys
 * there is no checkout session to be had, and a mandatory paid step that refused
 * would mean *nobody can ever create a tenant* on a self-host or before the
 * deploy guide's Stripe step. Create the tenant, record the choice
 * (`pending_plan_id` — selecting a plan must never GRANT it; only the webhook
 * may stamp `plan_id`), charge nothing, and say so on the screen.
 *
 * The server half is `onboarding-routes.ts` on the guard's `isPersonal` lane
 * (`/api/me/onboarding/*`), because every `/api/billing*` path demands a tenancy
 * and this caller has none yet.
 */
function Start() {
  return (
    <Screen center width="narrow">
      <div className="w-full space-y-4 py-12 text-center">
        <h1 className="text-title-1">Create a workspace</h1>
        <p className="text-body text-muted-foreground">
          Build the wizard here — see this component&rsquo;s comment for the three steps and the two traps.
        </p>
      </div>
    </Screen>
  );
}

function App() {
  const { loading, ctx, host } = useSession();
  const location = useLocation();
  const screen = pickScreen(loading, ctx, host);

  /**
   * ⚠️ THE INVITATION LINK BYPASSES `pickScreen`, and it has to.
   *
   * Whoever clicks it is by definition not yet a member of this tenant, so
   * `pickScreen` resolves `notenant` — "no workspace uses this address" — on the
   * one screen whose entire job is to say the opposite. Guarded on `loading` so
   * it does not flash before the host is known.
   *
   * The accept screen itself is not in this template because it is four lines of
   * `POST /api/auth/organization/accept-invitation` around whatever the product
   * wants to say. Add it here.
   */
  if (!loading && location.pathname.startsWith("/accept-invitation/")) {
    return <Boot />;
  }

  if (screen !== "shell") {
    return (
      <>
        {screen === "boot" && <Boot />}
        {screen === "maintenance" && (
          <MaintenanceScreen
            state={host!.maintenance!}
            brandName={host?.tenant ? (host.tenant as { name?: string }).name : null}
          />
        )}
        {screen === "blocked" && <TenantBlocked />}
        {screen === "signpost" && <RootSignpost />}
        {screen === "notenant" && <NoTenantHere />}
        {screen === "wrongdoor" && <WrongDoor />}
        {screen === "login" && <Login />}
        {screen === "start" && <Start />}
        {screen === "admin" && <AdminDoor />}
      </>
    );
  }

  return (
    <Routes location={location}>
      {/* A ROUTE, not a Shell tab: settings is a place you go and come back
          from, and the account menu navigates here. */}
      <Route path="/settings" element={<Settings onBack={() => history.back()} />} />
      {/* Also a route: a notification's deep link has to survive being opened
          from an email in a fresh browser, and the bell's "See all" needs
          somewhere a back button can return from. */}
      <Route path="/inbox" element={<InboxPage />} />
      <Route path="*" element={<Shell />} />
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* `reducedMotion="user"` honours the OS preference for every animation in
        every shared component at once. `scripts/motion-config.test.mjs` asserts
        each SPA sets it — an app that forgets does not fail, it just ignores a
        setting somebody turned on for a medical reason. */}
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <SessionProvider>
          <ThemeProvider>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
            {/* Every outcome the shared components announce lands here. An app
                that ships without it loses them all — `ActionResult` renders
                nothing on its own by design. */}
            <Toaster />
          </ThemeProvider>
        </SessionProvider>
      </BrowserRouter>
    </MotionConfig>
  </StrictMode>,
);
