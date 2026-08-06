/**
 * The hosts this suite drives, and the two things it reads out of the database.
 *
 * Scena is subdomain-first like the other two, and this suite exercises the real
 * door topology rather than a simulation of it — `*.localhost` resolves to
 * loopback in every current browser and in `wrangler dev`:
 *
 *   localhost:8789              the ROOT
 *   setup.localhost:8789        where a workspace is created
 *   admin.localhost:8789        the operator console
 *   <slug>.localhost:8789       a workspace. The tenancy is pinned by this host.
 *   play.localhost:8789         the DEVICE door — pairing, manifests, assets
 *   localhost:8790              the PLAYER itself — a different WORKER, see below
 *
 * ⚠️ **Port 8789.** Kova's suite owns 8787 and Tessa's 8788. Sharing one would
 * make whichever suite ran second silently drive another product's worker, which
 * fails as a baffling "element not found" rather than as a port conflict.
 *
 * ⚠️ **The player is a SECOND worker on a SECOND port, and that is the product,
 * not a test convenience.** A screen is a device: one pinned URL, cached by a
 * Service Worker, running for months offline. It resolves no tenant from its
 * host — the tenant arrives from the pairing claim. Driving it on the dashboard's
 * origin would test a topology Scena deliberately does not have.
 *
 * ⚠️ Still the WORKER, never Vite. With the Vite proxy the browser Origin differs
 * from the worker's, and Better Auth 1.6.23 ignores `trustedOrigins`, so every
 * cookie-bearing auth POST 403s `INVALID_ORIGIN` — nobody can create a workspace
 * at all.
 */

import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { installLocalhostResolver } from "./resolve-localhost.js";

// Some container images do not implement RFC 6761 `.localhost`, so the suite
// supplies it rather than depending on the host. Runs at import: the very first
// request must already resolve.
installLocalhostResolver();

export const APP_PORT = 8789;
export const PLAYER_PORT = 8790;
export const ROOT_DOMAIN = "localhost";

export const ROOT_URL = `http://${ROOT_DOMAIN}:${APP_PORT}`;
export const SETUP_URL = `http://setup.${ROOT_DOMAIN}:${APP_PORT}`;
export const ADMIN_URL = `http://admin.${ROOT_DOMAIN}:${APP_PORT}`;
export const workspaceUrl = (slug: string): string => `http://${slug}.${ROOT_DOMAIN}:${APP_PORT}`;

/**
 * THE DEVICE DOOR — where every screen's pairing, manifest and asset request
 * goes, and the only door that answers them.
 *
 * `play.` is not decoration: `@4dl/tenancy` classifies it as a door of its own
 * and the route guard skips the whole member/standing engine for it, because a
 * screen is a device with a pinned URL rather than a user session. Everywhere
 * else those routes answer `{"error":"wrong_door"}` — which is exactly how the
 * player's misconfigured API base surfaced when this suite first ran it.
 */
export const DEVICE_URL = `http://play.${ROOT_DOMAIN}:${APP_PORT}`;

/** The player's own origin. No tenant in the hostname — see the header. */
export const PLAYER_URL = `http://${ROOT_DOMAIN}:${PLAYER_PORT}`;

/** Miniflare's D1 persistence directory under `apps/scena/.wrangler`. */
const D1_DIR = new URL("../../scena/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/", import.meta.url).pathname;

/**
 * Miniflare names each D1 database `<hash>.sqlite` and keeps its own
 * `metadata.sqlite` alongside. There is exactly one real database here (the `DB`
 * binding), so "the non-metadata .sqlite" identifies it without hard-coding a
 * hash that would change if the binding id ever did.
 *
 * ⚠️ A stale database from an older run makes this throw "found: 2" rather than
 * pick one — the same guard the screenshot suite has, and for the same reason:
 * silently reading the wrong database produces a run that fails somewhere else
 * entirely. `rm -rf apps/scena/.wrangler/state` and re-run.
 */
function d1File(): string {
  let names: string[];
  try {
    names = readdirSync(D1_DIR);
  } catch {
    throw new Error(
      `No local D1 state at ${D1_DIR}. The Scena worker must have served at least one request before the suite reads it.`,
    );
  }
  const hit = names.filter((n) => n.endsWith(".sqlite") && n !== "metadata.sqlite");
  if (hit.length !== 1) throw new Error(`Expected one D1 file in ${D1_DIR}, found: ${hit.join(", ") || "none"}`);
  return join(D1_DIR, hit[0]!);
}

function read<T>(fn: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(d1File(), { readOnly: true });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/**
 * The emailed sign-in code — the only way in, for anyone.
 *
 * Auth is 100% passwordless with no password provider, so this six-digit code is
 * the whole ceremony. Read from SQLite rather than scraped from the worker's
 * console: log formatting, stdout buffering and a reused dev server are all
 * things the suite would then depend on and does not own. Scena's integration
 * suite reads the same table, so this is its out-of-process twin.
 *
 * Opened read-only, one connection per read: Miniflare runs the file in WAL
 * mode, and a fresh connection is the simplest way to be sure of seeing a frame
 * the worker committed a millisecond ago.
 */
export function latestSignInOtp(email: string): string {
  const row = read((db) =>
    db
      .prepare("SELECT value FROM verification WHERE identifier LIKE ? ORDER BY createdAt DESC LIMIT 1")
      .get(`%otp%${email}%`) as { value?: string } | undefined,
  );
  const code = (row?.value ?? "").match(/\d{6}/)?.[0];
  if (!code) throw new Error(`No sign-in code found for ${email}.`);
  return code;
}

/**
 * The slug the app minted for a workspace.
 *
 * The create-workspace form builds it client-side from the name plus a hash, and
 * no API surface hands it back — `/api/me` answers with a tenant ID, not an
 * address. Rather than reimplement `slugify`+`hash` here (two functions that
 * would then have to be kept in step with a file nobody would think to look at),
 * the suite reads what Better Auth actually stored.
 */
export function workspaceSlug(name: string): string {
  const row = read((db) =>
    db.prepare("SELECT slug FROM organization WHERE name = ? ORDER BY createdAt DESC LIMIT 1").get(name) as
      | { slug?: string }
      | undefined,
  );
  if (!row?.slug) throw new Error(`No organization stored for "${name}".`);
  return String(row.slug);
}
