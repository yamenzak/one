/**
 * Read the local `wrangler dev` D1 database directly.
 *
 * The suite needs one thing out of the running worker's database that no HTTP
 * surface will ever hand it: the emailed sign-in OTP. Auth here is 100%
 * passwordless with no password provider, so that six-digit code is the only way
 * in, for every persona, in every spec.
 *
 * Reading the SQLite file is deliberate. The alternative — scraping the
 * `wrangler dev` console for the `[mail:mock]` line — couples the suite to log
 * formatting, to stdout buffering, and to a process we do not own once
 * Playwright's `webServer` reuses an already-running dev server. The
 * integration suite takes the same approach (`apps/api/test/api.test.ts` reads
 * Better Auth's `verification` table), so the pattern is already the house
 * style; this is its out-of-process twin.
 *
 * Connections are opened read-only and one-per-read: Miniflare runs the file in
 * WAL mode, and a fresh connection is the simplest way to be certain we see
 * frames the worker committed a millisecond ago.
 */

import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";
import { join } from "node:path";

/** Miniflare's D1 persistence directory under `apps/api/.wrangler`. */
const D1_DIR = new URL("../../api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/", import.meta.url).pathname;

/**
 * Miniflare names each D1 database `<sha256-of-binding-identity>.sqlite` and
 * keeps its own `metadata.sqlite` alongside. There is exactly one real database
 * in this worker (the `DB` binding), so "the non-metadata .sqlite" identifies it
 * without hard-coding a hash that would change if the binding id ever did.
 */
function d1File(): string {
  let names: string[];
  try {
    names = readdirSync(D1_DIR);
  } catch {
    throw new Error(
      `No local D1 state at ${D1_DIR}. The API worker must have served at least one request before the suite reads it.`,
    );
  }
  const hit = names.filter((n) => n.endsWith(".sqlite") && n !== "metadata.sqlite");
  if (hit.length !== 1) {
    throw new Error(`Expected exactly one D1 database file in ${D1_DIR}, found: ${hit.join(", ") || "none"}`);
  }
  return join(D1_DIR, hit[0]!);
}

/** Run `fn` against a fresh read-only handle on the dev D1 file. */
function read<T>(fn: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(d1File(), { readOnly: true });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/**
 * The most recent sign-in OTP for `email`, or null if none has landed yet.
 *
 * Better Auth stores the code in `verification` under the identifier
 * `sign-in-otp-<email>` with a `<code>:<attempts>` value. Both halves are
 * matched loosely (`\d{6}` anywhere in the value) so a change to that encoding
 * degrades into a clear failure rather than a wrong code.
 */
/**
 * Run one statement against the local D1, read-WRITE.
 *
 * Only for putting the worker into a state no HTTP surface will produce on
 * demand — the billing ladder is driven by a daily cron, and a spec cannot wait
 * 30 days to see the blocked screen. Everything else must go through the API.
 */
export function d1Exec(sql: string): void {
  const db = new DatabaseSync(d1File());
  try {
    db.exec(sql);
  } finally {
    db.close();
  }
}

export function latestSignInOtp(email: string): string | null {
  const row = read((db) =>
    db
      .prepare("SELECT value FROM verification WHERE identifier = ? ORDER BY createdAt DESC LIMIT 1")
      .get(`sign-in-otp-${email.toLowerCase()}`) as { value?: string } | undefined,
  );
  return (String(row?.value ?? "").match(/\d{6}/) ?? [])[0] ?? null;
}

