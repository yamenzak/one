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
/*
  ⚠️ NO MODULE-LEVEL "ALREADY DONE" FLAG, AND THAT IS NOT AN OVERSIGHT.

  Storage is isolated PER TEST FILE and the module registry is not, so a flag set
  by whichever file ran first survives into every later one while the database it
  wrote to does not. The result is a suite where one file seeds, passes, and every
  other file signs in against a deployment with no mail provider — so no code is
  ever recorded, the verify fails, and the fixture reports "the studio must have
  been created" against an undefined id. It reproduces only under a full run,
  which is exactly when nobody is looking at one file.

  The insert is `ON CONFLICT DO NOTHING`, so doing it every time costs one
  statement and cannot be wrong.
*/
const seedMail = async () => {
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

/**
 * A slug this attempt has not used before.
 *
 * ⚠️ STORAGE IS SHARED ACROSS THIS PACKAGE'S FILES AND A FILE IS RETRIED ONCE,
 * so a fixture that creates a fixed slug conflicts with ITSELF: the first
 * attempt takes the address, something later fails, and the retry's `beforeAll`
 * is told the address is taken — which reports as "the studio must have been
 * created" and hides whatever actually went wrong.
 *
 * A fresh address per attempt makes the fixture idempotent under retry without
 * weakening anything: a workspace is a workspace whatever it is called.
 */
let minted = 0;
export const freshSlug = (base: string): string => `${base}-${(minted += 1)}${Math.random().toString(36).slice(2, 7)}`;

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
export async function signIn(email: string, origin: string, opts: { accept?: boolean } = {}): Promise<string> {
  await seedMail();
  /*
    ⚠️ ONE RETRY OF THE WHOLE CEREMONY, AND THE REASON IS THE STORE RATHER THAN
    THE CODE.

    Storage is SHARED across this package's files (`isolatedStorage: false`), and
    under a full run the `sign_in_codes` row occasionally is not the one that was
    just written by the time the exchange reads it — so a freshly delivered code
    is answered "that doesn't look right" about a field the caller never chose.
    Asking again writes a new row and exchanges it in the same breath.

    ⚠️ IT IS BOUNDED AT TWO, so a genuine failure still fails. And nothing here
    clears `recorded`: several files are mid-sign-in against one map, and a
    tidy-up that emptied it took another file's undelivered code with it.
  */
  /*
    ⚠️ `accept: false` IS FOR THE TESTS THAT ARE ABOUT CONSENT ITSELF, and for
    nothing else. Every other fixture accepts, because every real person does —
    exempting the suite would leave the gate covered by one test instead of by
    all of them.
  */
  const accept = opts.accept ?? true;
  const once = await attemptSignIn(email, origin, accept);
  if (once) return once;
  const again = await attemptSignIn(email, origin, accept);
  if (again) return again;
  throw new Error(`signing ${email} in did not work twice — is a mail provider configured?`);
}

async function attemptSignIn(email: string, origin: string, accept: boolean): Promise<string | null> {
  const held = recorded.get(email.toLowerCase());
  const asked = await post(origin, "/api/identity.code.request", { email });
  /*
    ⚠️ A REFUSED RESEND MEANS THE LAST CODE IS STILL THE LIVE ONE. There is a
    sixty-second cooldown per address — the one gate in front of an
    unauthenticated send — and a suite signing the same person in at two doors in
    the same second is refused the second time by design.
  */
  if (asked.res.status !== 200 && !held) return null;

  /*
    ⚠️ READ OUT OF THE MESSAGE THAT WAS SENT, not out of a map the worker kept.
    The `recorded` provider is one a deployment CHOOSES, so this drives the same
    path production drives and stops one step short of a network call.
  */
  const sent = recorded.get(email.toLowerCase());
  const code = /\b(\d{4,8})\b/.exec(sent?.body ?? "")?.[1];
  if (!code) return null;

  const { res, body } = await post(origin, "/api/identity.code.verify", { email, code });
  if (typeof body.accountId === "string") accountIds.set(email, body.accountId);
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] || null;
  /*
    ⚠️ AND THEY AGREE TO WHAT THEY HAVE TO AGREE TO, because a real person does.
    Every write is refused with 451 until the documents this role must accept
    are accepted — which is the point of the gate, and which made most of this
    suite fail the moment it was enforced. Doing it HERE rather than exempting
    the tests is what keeps them describing a real session: a fixture that
    skipped the ceremony would leave the gate covered by one test instead of by
    all of them.
  */
  if (cookie && accept) await acceptEverything(origin, cookie);
  return cookie;
}

/**
 * ⚠️ WHATEVER THIS ROLE STILL OWES, READ FROM THE PRODUCT RATHER THAN LISTED.
 * A fixture naming the documents by hand is one that keeps passing when a new
 * one is added and every real person is blocked by it — which is how a studio
 * comes to be unable to save anything on the morning a new notice ships.
 */
export async function acceptEverything(origin: string, cookie: string): Promise<void> {
  /* ⚠️ A GET, because `legal.list` is a read and the router routes it as one. */
  const res = await worker.fetch(
    new Request(`${origin}/api/legal.list`, { headers: { cookie } }),
    env as never,
  );
  const body = (await res.json().catch(() => ({}))) as { outstanding?: { id: string; version: string }[] };
  for (const doc of body.outstanding ?? []) {
    await post(origin, "/api/legal.accept", { document: doc.id, version: doc.version }, cookie);
  }
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
