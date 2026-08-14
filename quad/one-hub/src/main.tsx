import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./App.js";
import { SessionProvider } from "./session.js";

const root = document.getElementById("root");
/* ⚠️ A missing mount point is a build that shipped wrong, not a runtime
   condition to degrade around — say so where somebody will see it. */
if (!root) throw new Error("no #root to mount the Hub into");

createRoot(root).render(
  <StrictMode>
    <SessionProvider>
      <App />
    </SessionProvider>
  </StrictMode>,
);
