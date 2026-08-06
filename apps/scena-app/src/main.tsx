import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import { App } from "./App.js";
import { ConfirmHost } from "./components/confirm.js";
import { initTheme } from "./theme.js";
import { fontFaceCss } from "@scena/manifest";
import { Toaster } from "@4dl/ui";

// Stamp the theme before first paint (system pref or stored override) so there's
// no flash of the wrong theme.
initTheme();

// Make the bundled slide fonts available to the dashboard UI too, so the
// branding preview + font pickers render in real type.
const fontStyle = document.createElement("style");
fontStyle.textContent = fontFaceCss();
document.head.appendChild(fontStyle);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
      <Toaster />
      <ConfirmHost />
    </BrowserRouter>
  </StrictMode>,
);

// Register the service worker so Scena is installable (adds the offline shell).
// Non-fatal: the app works fine without it.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* ignore */ });
  });
}
