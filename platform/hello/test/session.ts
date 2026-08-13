/**
 * Signing a test in, the way a person does: ask for a code, read it, exchange it.
 *
 * ⚠️ NOT A SHORTCUT AROUND THE CEREMONY. A fixture that inserted a session row
 * would let the sign-in path rot while every other suite stayed green — and the
 * defect that reaches production is the one on the path nobody drives.
 */

import { env } from "cloudflare:test";
import { sql, type ResolvedRegion } from "@one/kernel";
import { bindingsFor, CONFIG_SCHEMA, seedOne, SESSION_COOKIE } from "@one/runtime";
import worker, { recorded } from "../src/worker.js";

/* ⚠️ Whose configuration. The directory is bound with the same id into every
   worker, so a row with no app on it is every product's row. */
const APP = "hello";

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
  /* ⚠️ THE MODULE'S OWN DDL, NEVER A COPY OF IT. A fixture that retyped this
     `CREATE TABLE` kept a stale shape alive after the real one gained the app
     column, and what it produced was an `ON CONFLICT` that matched no key —
     three suites failing on the fixture rather than on anything they test. */
  await db.batch([...CONFIG_SCHEMA.ddl]);
  for (const [key, value] of Object.entries({ "email.provider": "recorded", "email.from": "Hello <noreply@4dl.app>" })) {
    /*
      ⚠️ SEEDED, NEVER OVERWRITTEN, and the fixture depends on the distinction as
      much as production does. This runs on every sign-in, so an upsert here puts
      a sender back after a test has deliberately blanked one — and the suite
      that proves "a code that could not be sent is not a code that was" passes
      by having sent it.
    */
    await seedOne(db, APP, key, value, new Date().toISOString() as never);
  }
};

export const SETUP = "https://setup.hello.4dl.app";

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
/**
 * ⚠️ `refusable` IS FOR ONE CASE AND IT IS NAMED RATHER THAN DEFAULTED. A door
 * that has no workspace behind it REFUSES a sign-in, correctly, and a suite
 * probing every door needs a cookie header to send it — so it asks for one
 * knowing it may not get one. Everywhere else an absent cookie is a fault, and
 * the difference has to be stated by the caller rather than guessed here.
 */
export async function signIn(email: string, origin: string, refusable = false): Promise<string> {
  await seedMail();
  const asked = await post(origin, "/api/identity.code.request", { email });
  /*
    ⚠️ READ OUT OF THE MESSAGE THAT WAS SENT, not out of a map the worker kept.
    The `recorded` provider is one a deployment CHOOSES, so this drives the same
    path production drives and stops one step short of a network call.
  */
  const sent = recorded.get(email.toLowerCase());
  const code = /\b(\d{4,8})\b/.exec(sent?.body ?? "")?.[1];
  const { res, body } = await post(origin, "/api/identity.code.verify", { email, code });
  if (typeof body.accountId === "string") accountIds.set(email, body.accountId);
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0]!;

  /*
    ⚠️ A SIGN-IN THAT DID NOT HAPPEN SAYS SO HERE, and this is not defensive
    padding. Returning "" made every later request in the file anonymous, and
    what a reader saw was an assertion three tests away — "expected false to be
    true" about a list of sessions — with nothing anywhere naming the sign-in.
    It cost most of an afternoon once.

    ⚠️ THE OTP COOLDOWN IS THE USUAL CAUSE, so its status is in the message. A
    second code for one address inside a minute is refused by design; a fixture
    that asks for one and reads the previous message is asking the suite to
    depend on whether a code had already been spent.
  */
  if (!cookie.startsWith(`${SESSION_COOKIE}=`)) {
    if (refusable) return "";
    throw new Error(
      `sign-in did not happen for ${email} at ${origin}: ` +
      `code.request ${asked.res.status}, code.verify ${res.status}, code ${code ?? "none recorded"}`,
    );
  }

  /*
    ⚠️ AND THEY AGREE TO WHAT THEY HAVE TO AGREE TO, because a real person does.
    Every write is refused with 451 until the documents this role must accept are
    accepted — which is the point of the gate, and which made 81 fixtures fail
    the moment it was enforced. Doing it HERE rather than exempting the suite is
    what keeps those tests describing a real session: a fixture that skipped the
    ceremony would leave the gate covered by one test instead of by all of them.
  */
  await acceptEverything(origin, cookie);
  return cookie;
}

/**
 * ⚠️ WHATEVER THIS ROLE STILL OWES, READ FROM THE PRODUCT RATHER THAN LISTED.
 * A fixture naming the documents by hand is one that keeps passing when a new
 * one is added and every real person is blocked by it.
 */
export async function acceptEverything(origin: string, cookie: string): Promise<void> {
  /* ⚠️ A GET, because `legal.list` is a read and the router routes it as one. */
  const res = await worker.fetch(
    new Request(`${origin}/api/legal.list`, { headers: cookie ? { cookie } : {} }),
    env as never,
  );
  const body = (await res.json()) as { outstanding?: { id: string; version: string }[] };
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
