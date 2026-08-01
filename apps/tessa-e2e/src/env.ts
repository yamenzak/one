/**
 * The hosts this suite drives, and the one thing it reads out of the database.
 *
 * Tessa is subdomain-first like Kova, so the suite exercises the real door
 * topology rather than a simulation of it. `*.localhost` resolves to loopback in
 * every current browser and in `wrangler dev`:
 *
 *   localhost:8788              the ROOT — a signpost, no sign-in
 *   setup.localhost:8788        where a centre is created
 *   <slug>.localhost:8788       a centre. The tenancy is pinned by this hostname.
 *
 * ⚠️ **Port 8788, not 8787.** Kova's suite owns 8787 and both write into their
 * own `.wrangler` state. Sharing a port would make whichever suite ran second
 * silently drive the other product's worker — which fails as a baffling "element
 * not found" rather than as a port conflict.
 *
 * ⚠️ Still the WORKER, never Vite. With the Vite proxy the browser Origin differs
 * from the worker's, and Better Auth 1.6.23 ignores `trustedOrigins`, so every
 * cookie-bearing auth POST 403s `INVALID_ORIGIN` — an owner cannot create a
 * centre at all. See `apps/tessa-app/src/main.tsx`.
 */

import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { installLocalhostResolver } from "./resolve-localhost.js";

// Some container images do not implement RFC 6761 `.localhost`, so the suite
// supplies it rather than depending on the host. Runs at import: the very first
// request must already resolve.
installLocalhostResolver();

export const APP_PORT = 8788;
export const ROOT_DOMAIN = "localhost";
export const ROOT_URL = `http://${ROOT_DOMAIN}:${APP_PORT}`;
export const SETUP_URL = `http://setup.${ROOT_DOMAIN}:${APP_PORT}`;
export const centreUrl = (slug: string): string => `http://${slug}.${ROOT_DOMAIN}:${APP_PORT}`;

/** Miniflare's D1 persistence directory under `apps/tessa/.wrangler`. */
const D1_DIR = new URL("../../tessa/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/", import.meta.url).pathname;

/**
 * Miniflare names each D1 database `<hash>.sqlite` and keeps its own
 * `metadata.sqlite` alongside. There is exactly one real database here (the `DB`
 * binding), so "the non-metadata .sqlite" identifies it without hard-coding a
 * hash that changes if the binding id ever does.
 */
function d1File(): string {
  let names: string[];
  try {
    names = readdirSync(D1_DIR);
  } catch {
    throw new Error(`No local D1 state at ${D1_DIR}. The worker must have served a request before the suite reads it.`);
  }
  const hit = names.filter((n) => n.endsWith(".sqlite") && n !== "metadata.sqlite");
  if (hit.length !== 1) throw new Error(`Expected one D1 file in ${D1_DIR}, found: ${hit.join(", ") || "none"}`);
  return join(D1_DIR, hit[0]!);
}

/**
 * The emailed sign-in code — the only way in, for anyone.
 *
 * Auth is 100% passwordless with no password provider, so this six-digit code is
 * the whole ceremony. Read from SQLite rather than scraped from the worker's
 * console: log formatting, stdout buffering and a reused dev server are all
 * things the suite would then depend on and does not own. The integration suite
 * reads the same table, so this is its out-of-process twin.
 *
 * Opened read-only, one connection per read: Miniflare runs the file in WAL
 * mode, and a fresh connection is the simplest way to be sure of seeing a frame
 * the worker committed a millisecond ago.
 */
export function latestSignInOtp(email: string): string {
  const db = new DatabaseSync(d1File(), { readOnly: true });
  try {
    const row = db
      .prepare("SELECT value FROM verification WHERE identifier LIKE ? ORDER BY createdAt DESC LIMIT 1")
      .get(`%otp%${email}%`) as { value?: string } | undefined;
    const code = (row?.value ?? "").match(/\d{6}/)?.[0];
    if (!code) throw new Error(`No sign-in code found for ${email}.`);
    return code;
  } finally {
    db.close();
  }
}
