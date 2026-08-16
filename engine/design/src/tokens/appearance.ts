/**
 * LIGHT OR DARK, AND SOMETHING HAS TO SAY WHICH.
 *
 * ⚠️ HEROUI HAS NO `prefers-color-scheme` RULE ANYWHERE. Dark is `.dark` or
 * `[data-theme="dark"]`, stamped on the document by the application — so an app
 * that never stamps it is an app that is permanently light, on every device, for
 * everybody. Nothing errors, nothing warns, every test passes, and the only way
 * to find out is to look at it on a dark screen. The Hub shipped exactly that
 * and a screenshot caught it.
 *
 * ⚠️ THREE STATES, NOT TWO. "Follow the device" is the default and it is a state
 * of its own: a person who has never chosen must track their system as it
 * changes at sunset, and a product that stored `light` on first load has quietly
 * made a choice on their behalf that they now have to undo.
 *
 * ⚠️ AND IT LISTENS. A device that switches theme while the page is open — which
 * is what a scheduled dark mode does every evening — must not leave the tab on
 * yesterday's.
 */

export type Appearance = "light" | "dark" | "system";

export const APPEARANCES: readonly Appearance[] = ["light", "dark", "system"];

/** ⚠️ Prefixed, because a person may have several products on one origin. */
export const APPEARANCE_KEY = "one:appearance";

/** What `system` resolves to right now. */
export const preferred = (): "light" | "dark" =>
  typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark" : "light";

export const resolve = (choice: Appearance): "light" | "dark" =>
  choice === "system" ? preferred() : choice;

const isAppearance = (value: unknown): value is Appearance =>
  value === "light" || value === "dark" || value === "system";

/**
 * ⚠️ AN UNREADABLE STORE IS `system`, NOT A THROW. Private browsing and a
 * blocked-cookies setting both make `localStorage` throw on ACCESS, not on
 * write — so a naive read takes the whole application down before it renders,
 * for the people most likely to be cautious about a new product.
 */
export function stored(): Appearance {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    return isAppearance(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

export function remember(choice: Appearance): void {
  try {
    if (choice === "system") localStorage.removeItem(APPEARANCE_KEY);
    else localStorage.setItem(APPEARANCE_KEY, choice);
  } catch {
    /* ⚠️ Swallowed: not being able to REMEMBER a preference must never stop it
       being APPLIED for this visit. */
  }
}

/**
 * Stamp the document, and keep it stamped.
 *
 * ⚠️ ON `documentElement`, NOT ON A WRAPPER. Overlays — modals, tooltips,
 * popovers — are portalled to `document.body`, outside whatever the application
 * renders into. A theme applied to a React root leaves every one of them on the
 * other theme, which is the bug where the page is dark and the dialog is white.
 *
 * Returns the unsubscribe, so a caller that unmounts does not leak a listener.
 */
export function applyAppearance(choice: Appearance = stored()): () => void {
  const root = document.documentElement;
  const paint = () => {
    root.dataset.theme = resolve(choice);
    /* ⚠️ Tells the BROWSER too, so form controls, scrollbars and the address bar
       match. Without it a dark page keeps light native widgets. */
    root.style.colorScheme = choice === "system" ? "light dark" : choice;
  };
  paint();

  if (choice !== "system" || typeof matchMedia !== "function") return () => {};
  const media = matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", paint);
  return () => media.removeEventListener("change", paint);
}

/**
 * ⚠️ THE SCRIPT THAT RUNS BEFORE THE FIRST PAINT. Stamping from the application
 * bundle means the browser has already painted the light theme by the time React
 * mounts — a white flash on every cold load, on a dark device, which reads as a
 * fault rather than as a load. Inline this in `<head>`, before the stylesheet.
 */
export const APPEARANCE_SCRIPT = `(function(){try{
var c=localStorage.getItem(${JSON.stringify(APPEARANCE_KEY)});
if(c!=="light"&&c!=="dark")c=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
document.documentElement.dataset.theme=c;
document.documentElement.style.colorScheme=c;
}catch(e){}})();`;
