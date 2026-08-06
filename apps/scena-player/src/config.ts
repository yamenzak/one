/**
 * WHERE THE EDGE API LIVES — the DEVICE DOOR, not the dashboard's.
 *
 * The player is its own worker on its own origin (`tv.4dl.app`), so unlike the
 * dashboard it cannot say `/api/…` and be done: every call is cross-origin by
 * design, and this constant is the whole of the player's knowledge of where
 * Scena is.
 *
 * ⚠️ IT MUST BE `play.`, THE DEVICE DOOR. Stage 3 gave Scena that door
 * precisely because a screen is not a user session — the pairing routes,
 * manifests and assets answer there and `{"error":"wrong_door"}` anywhere else.
 * `host-context.ts` calls the label "the one origin a whole fleet is pinned to",
 * and changing it strands every device that has already cached the old one.
 *
 * ⚠️ AND THE FALLBACK IS WHAT SHIPS. `VITE_API_BASE` is set NOWHERE in this
 * repo — not in a `.env`, not in `deploy.yml`, not in the wrangler config — so
 * whatever is written here is what a television runs. It was
 * `http://localhost:8787`, which is a loopback address no TV has and, in this
 * monorepo, *Kova's* port. Both halves of that were wrong and neither failed
 * anywhere a test could see it, because the player has no server-side suite and
 * the E2E suite that would have caught it did not exist until Stage 8.
 *
 * `VITE_API_BASE` stays the override, for local work and for the E2E suite,
 * which points it at its own `play.localhost` port.
 */
export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "https://play.scena.4dl.app";

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
