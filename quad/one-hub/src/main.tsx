import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  ARRIVE_MOTION, CHART_MOTION, FACE_CSS, GROUND_CSS, SKY_MOTION, ambienceStylesheet,
  applyAppearance,
} from "@quad/web";
import "./styles.css";
import { App } from "./App.js";
import { SessionProvider } from "./session.js";

/**
 * ⚠️ THE SKY IS ONE STYLE ELEMENT, BUILT FROM THE SHARED TOKENS. Every rule
 * comes from `@quad/web` — the gradients from `skyCss`, the motion from
 * `SKY_MOTION`, which is a transition on a token rather than an animation, so
 * both `prefers-reduced-motion` and a `data-reduce-motion` ancestor can stop it.
 *
 * ⚠️ AND IT IS INJECTED RATHER THAN WRITTEN INTO THE STYLESHEET, because the
 * gradients are derived from the accent at runtime — a workspace's brand has to
 * reach the background of every screen without any screen knowing branding
 * exists.
 */
/**
 * ⚠️ NOTHING ELSE SELECTS DARK. HeroUI has no `prefers-color-scheme` rule at
 * all — dark is `[data-theme="dark"]` on the document, stamped by the
 * application — so without this the Hub is permanently light on every device,
 * silently, with every test green. `index.html` stamps it before the first
 * paint; this keeps it stamped when the device changes at sunset.
 */
applyAppearance();

/*
  ⚠️ EVERY BLOCK THE SHARED LAYER EXPORTS, AND THE LIST IS THE BUG. `CHART_MOTION`
  was imported here and left out of the join, so the chart reveal never ran once,
  in any build — an unused import that nothing flags, because a stylesheet that
  is missing does not throw, it simply does not animate. `scripts/motion.test.mjs`
  asserts the set now.
*/
const sky = document.createElement("style");
sky.textContent = [
  FACE_CSS, GROUND_CSS, ambienceStylesheet(), SKY_MOTION, ARRIVE_MOTION, CHART_MOTION,
].join("\n");
document.head.append(sky);

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
