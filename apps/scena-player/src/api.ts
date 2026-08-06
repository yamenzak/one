import { parseManifest, type Manifest } from "@scena/manifest";
import { API_BASE, resolveApiUrl } from "./config.js";

export interface Reservation {
  code: string;
  screenDoId: string;
  wsPath: string;
}

/** Pairing step 1 (§6): reserve a ScreenDO and get a code + ws path. */
export async function reserveScreen(): Promise<Reservation> {
  const res = await fetch(`${API_BASE}/api/screen/new`, { method: "POST" });
  if (!res.ok) throw new Error(`reserveScreen failed: ${res.status}`);
  return (await res.json()) as Reservation;
}

/** Fetch + validate a manifest by (possibly relative) url. */
export async function fetchManifest(url: string): Promise<Manifest> {
  const res = await fetch(resolveApiUrl(url));
  if (!res.ok) throw new Error(`fetchManifest failed: ${res.status}`);
  return parseManifest(await res.json());
}
