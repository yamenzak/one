import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  ARRIVE_MOTION, CHART_MOTION, DOOR_MOTION, FACE_CSS, GROUND_CSS, SKY_MOTION, ambienceStylesheet,
  brandCss,
  applyAppearance,
} from "@engine/design";
import "./styles.css";
import { App } from "./App.js";
import { SessionProvider } from "./session.js";

/**
 * ⚠️ THE SKY IS ONE STYLE ELEMENT, BUILT FROM THE SHARED TOKENS. Every rule
 * comes from `@engine/design` — the grounds from the scene engine, the motion from
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
 * application — so without this OneSpace is permanently light on every device,
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
/** One's own colour: a true neutral, so nothing derived from it carries a hue. */
const MONO = "oklch(0.62 0 0)";

const sky = document.createElement("style");
sky.textContent = [
  FACE_CSS, GROUND_CSS, ambienceStylesheet(), SKY_MOTION, ARRIVE_MOTION, DOOR_MOTION, CHART_MOTION,
  /*
    ⚠️ ONE'S OWN BRAND, AND IT IS MONOCHROME. `GROUND_CSS` ships a blue as the
    colour a deployment has before anybody chooses — right for a framework,
    wrong for this product. Every tier, every surface and the ambience behind
    every screen are `color-mix`es with `--brand`, so one neutral value makes
    the whole interface graphite without a single component knowing.

    ⚠️ ZERO CHROMA RATHER THAN A NEAR-GREY. A full-bleed gradient is where a
    hue nobody asked for shows up first, and at the size of a phone screen
    "almost neutral" reads as a colour chosen badly rather than as monochrome.

    ⚠️ AND IT IS `brandCss`, NOT A RULE IN `styles.css`. The first attempt was
    exactly that and changed nothing: this block is appended to `<head>` AFTER
    the stylesheet, so the framework default won on source order and the whole
    product stayed blue with every check green. Going through the same function
    a workspace's branding goes through means it lands in the same place, in the
    same order, and a tenant's own choice still wins after it.
  */
  brandCss({ accent: MONO }),
].join("\n");
document.head.append(sky);

const root = document.getElementById("root");
/* ⚠️ A missing mount point is a build that shipped wrong, not a runtime
   condition to degrade around — say so where somebody will see it. */
if (!root) throw new Error("no #root to mount OneSpace into");

createRoot(root).render(
  <StrictMode>
    <SessionProvider>
      <App />
    </SessionProvider>
  </StrictMode>,
);

/*
  ⚠️ THE SERVICE WORKER IS REGISTERED AT BOOT AND ASKS NOBODY ANYTHING.
  Registering is silent; only `Notification.requestPermission` prompts, and that
  is behind the switch on the notification screen — a prompt on arrival is
  refused by some browsers and PENALISED by others, which costs the ability to
  ask at all.

  ⚠️ AND IT HAS TO BE HERE RATHER THAN ONLY WHERE THE SWITCH IS.
  `pushsubscriptionchange` is delivered to a REGISTERED worker and nowhere else,
  so a browser that rotated its keys while nobody was on the settings screen —
  which is every time — would leave the person subscribed in our table and
  unreachable in fact, with nothing anywhere reporting it.

  ⚠️ IT FAILS QUIETLY, ON PURPOSE. A private window, an unsupported browser and
  a blocked worker are all ordinary, and none of them is a reason to put a
  message in front of somebody who did not ask for notifications.
*/
if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/sw.js", { scope: "/" })
    .catch(() => undefined);
}
