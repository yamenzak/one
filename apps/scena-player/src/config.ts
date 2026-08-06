/**
 * WHERE THE EDGE API LIVES.
 *
 * The player is its own worker on its own origin (`tv.4dl.app`), so unlike the
 * dashboard it cannot say `/api/…` and be done — every call is cross-origin by
 * design, and this constant is the whole of the player's knowledge of where
 * Scena is.
 *
 * ⚠️ THE FALLBACK USED TO BE `http://localhost:8787`, WHICH IS WRONG TWICE.
 * `VITE_API_BASE` is set nowhere in this repo — not in a `.env`, not in the
 * deploy workflow — so the fallback is what SHIPPED: a player at `tv.4dl.app`
 * whose every request went to a loopback address that does not exist on a
 * television. And 8787 is Kova's worker in this monorepo, so a developer
 * running the player locally against Scena was pointing it at another product.
 *
 * So the fallback is Scena's real API origin, which is the correct answer for
 * every deployed screen, and `VITE_API_BASE` stays the override for local work
 * and for the E2E suite (which builds the player against its own port).
 */
export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "https://scena.4dl.app";

/** localStorage key holding this screen's reserved DO id + ws path. */
export const STORAGE_KEY = "scena.screen";

/** Resolve a possibly-relative API url (manifest nudges are relative). */
export function resolveApiUrl(url: string): string {
  return url.startsWith("http") ? url : `${API_BASE}${url}`;
}

/** Build the WebSocket URL from the API base + ws path. */
export function wsUrl(path: string): string {
  const base = API_BASE.replace(/^http/, "ws");
  return `${base}${path}`;
}
