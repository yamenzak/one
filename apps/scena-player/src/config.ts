/** Where the edge API lives. In dev the player (5173) talks to wrangler (8787). */
export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8787";

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
