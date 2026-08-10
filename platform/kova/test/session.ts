/**
 * Signing a test in, the way a person does: ask for a code, read it, exchange it.
 *
 * ⚠️ NOT A SHORTCUT AROUND THE CEREMONY. A fixture that inserted a session row
 * would let the sign-in path rot while every other suite stayed green — and the
 * defect that reaches production is the one on the path nobody drives.
 */

import { env } from "cloudflare:test";
import { sql, type ResolvedRegion } from "@one/kernel";
import { bindingsFor } from "@one/runtime";
import worker, { recorded } from "../src/worker.js";

/**
 * ⚠️ THE DEPLOYMENT HAS TO CHOOSE A MAIL PROVIDER BEFORE IT CAN SEND ANYTHING,
 * and no screen can do it first: reaching the console needs a session, which
 * needs a code, which needs mail. Provisioning breaks that circle in production
 * — a workflow with database access does what a login cannot — and this is the
 * same two rows, written by the fixture that stands in for it.
 *
 * ⚠️ IT IS SEEDED HERE RATHER THAN DEFAULTED IN THE WORKER. A worker that fell
 * back to `recorded` when nothing was configured is a production deployment
 * quietly recording its sign-in codes and answering as though the mail went out.
 */
let seeded = false;
const seedMail = async () => {
  if (seeded) return;
  seeded = true;
  const db = bindingsFor({ db: sql() }, { DB: (env as Record<string, unknown>).DIRECTORY }, { defaultRegion: "auto" })("auto" as ResolvedRegion).db;
  await db.batch([`CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, at TEXT NOT NULL);`]);
  for (const [key, value] of [["email.provider", "recorded"], ["email.from", "Kova <noreply@4dl.app>"]]) {
    await db.run(
      `INSERT INTO app_config (key, value, at) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING`,
      key, value, new Date().toISOString(),
    );
  }
};

export const SETUP = "https://setup.kova.4dl.app";

export const post = async (origin: string, path: string, body: unknown, cookie = "") => {
  const res = await worker.fetch(
    new Request(`${origin}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
    env as never,
  );
  return { res, body: (await res.json()) as Record<string, unknown> };
};

/**
 * The account id behind each signed-in address.
 *
 * ⚠️ THE VERIFY RESPONSE IS WHERE IT COMES FROM, not a database read. A fixture
 * that looked the row up itself would keep passing if the response stopped
 * carrying it — and the response is what a real client has.
 */
export const accountIds = new Map<string, string>();

/** Returns the cookie for that origin. Sessions are per origin, so it matters. */
export async function signIn(email: string, origin: string): Promise<string> {
  await seedMail();
  await post(origin, "/api/identity.code.request", { email });
  /*
    ⚠️ READ OUT OF THE MESSAGE THAT WAS SENT, not out of a map the worker kept.
    The `recorded` provider is one a deployment CHOOSES, so this drives the same
    path production drives and stops one step short of a network call.
  */
  const sent = recorded.get(email.toLowerCase());
  const code = /\b(\d{4,8})\b/.exec(sent?.body ?? "")?.[1];
  const { res, body } = await post(origin, "/api/identity.code.verify", { email, code });
  if (typeof body.accountId === "string") accountIds.set(email, body.accountId);
  return (res.headers.get("set-cookie") ?? "").split(";")[0]!;
}

/**
 * A colleague or a customer arriving the way a real one does: invited by
 * somebody who may invite, then signing in with the address it was sent to.
 *
 * ⚠️ NOT A SHORTCUT AROUND THE ROSTER, for the same reason `signIn` is not one
 * around the sign-in ceremony. A fixture that inserted a membership row would
 * let the invitation path rot while every other suite stayed green — and a
 * signed-in account with no membership now holds nothing at all, which is the
 * whole point.
 */
export async function joinAs(origin: string, host: string, email: string, role: string): Promise<string> {
  await post(origin, "/api/member.invite", { email, role }, host);
  return signIn(email, origin);
}
