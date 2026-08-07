import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import { App } from "./App.js";
import { initTheme } from "./theme.js";
import { fontFaceCss } from "@scena/manifest";
import { MotionConfig } from "motion/react";
import { ConfirmHost, Toaster } from "@4dl/ui";

// Stamp the theme before first paint (system pref or stored override) so there's
// no flash of the wrong theme.
initTheme();

// Make the bundled slide fonts available to the dashboard UI too, so the
// branding preview + font pickers render in real type.
const fontStyle = document.createElement("style");
fontStyle.textContent = fontFaceCss();
document.head.appendChild(fontStyle);

/*
  `MotionConfig reducedMotion="user"` — §12's accessibility floor, and it was
  missing here while Kova and Tessa both had it.

  It was harmless for as long as this app did not animate: the dashboard shell
  never orchestrated, so every screen's entrance was inert and there was nothing
  for a reduced-motion preference to strip. Turning the choreography on is what
  makes its absence a defect — a person who has asked their OS for less motion
  would have started getting a staggered rise on every screen and no way to
  refuse it.

  `"user"` rather than `true`: it strips TRANSFORMS while keeping opacity, which
  is what the setting actually asks for. Layout never depends on an animation
  having run, so nothing breaks when it does.
*/
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <App />
        <Toaster />
        <ConfirmHost />
      </BrowserRouter>
    </MotionConfig>
  </StrictMode>,
);

// Register the service worker so Scena is installable (adds the offline shell).
// Non-fatal: the app works fine without it.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* ignore */ });
  });
}
