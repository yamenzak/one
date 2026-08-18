/**
 * AN EVENT AN OPERATION RAISES BECOMES A NOTE IN SOMEBODY'S INBOX.
 *
 * ⚠️ THIS IS THE HALF THAT WAS MISSING, AND ITS ABSENCE LOOKED LIKE A QUIET
 * WEEK. Every other piece was built: the inbox could be read, marked seen and
 * configured, the policy and the per-person preference resolved, the bell drew
 * a count. `fileNote` — the one write that puts a row in front of somebody —
 * was called by nothing, so an app raising an event raised it into nothing and
 * the surface said "you're all caught up" forever. An empty inbox is
 * indistinguishable from an inbox nothing writes to, which is why this went
 * three stages without being noticed.
 *
 * ⚠️ IT HANGS OFF `emits`, WHICH IS ALREADY DECLARED (D12). An operation names
 * the events it raises and a notification names the event that raises it; the
 * manifest already refuses a notification nothing raises (`unraisable`) and an
 * event no notification listens to is simply quiet. So telling somebody is a
 * consequence of two declarations, and there is no dispatch call for a handler
 * to forget.
 *
 * ⚠️ AND IT NEVER FAILS THE WRITE. The note is a consequence of the change, not
 * part of it: a full inbox table, a missing member row or a malformed template
 * must not turn a successful publish into a 500 and roll nothing back — the
 * change already happened. It is logged instead, which is the one thing a silent
 * catch must not do.
 */

import type { AppSpec, Channel } from "@engine/kernel";
import { PLATFORM_ROLES } from "@engine/kernel";
import { audienceFor, fileNote, interpolate } from "./inbox.js";
import type { Pusher } from "./services.js";
import type { Db } from "./sql.js";

/**
 * ⚠️ THE VALUES COME FROM WHAT THE OPERATION DECLARED, BY THE NAME THE TYPE
 * NAMED. A summary is a template — `{who} published {title}` — and `variables`
 * says what it needs. The input and the ANSWER both supply it, and the answer is
 * the half that matters: `note.publish` takes an id, and the title a person
 * wants to read is on the record rather than in the request. `who` is the person
 * who acted, which no operation carries and every summary wants.
 *
 * ⚠️ A MISSING ONE STAYS VISIBLE, deliberately — `say` leaves the token as it is
 * rather than printing `undefined` or an empty gap. Visibly wrong is a bug
 * somebody reports; plausibly wrong is a sentence that quietly means something
 * else.
 */
const valuesFor = (
  variables: readonly string[],
  said: Record<string, unknown>,
  who: string | null,
): Readonly<Record<string, string>> => {
  const out: Record<string, string> = {};
  for (const name of variables) {
    if (name === "who" && who) { out.who = who; continue; }
    const given = said[name];
    if (given !== undefined && given !== null) out[name] = String(given);
  }
  return out;
};

export interface Raised {
  readonly app: AppSpec;
  readonly tenantId: string;
  readonly events: readonly string[];
  readonly input: Record<string, unknown>;
  /** What the operation answered. Its declared output is where a title lives. */
  readonly answer: Record<string, unknown>;
  /** Who acted. They are not told about their own action — see `audienceFor`. */
  readonly actor: string | null;
  readonly actorName: string | null;
  readonly channels: readonly Channel[];
  /**
   * ⚠️ ABSENT MEANS THIS DEPLOYMENT CANNOT PUSH, and that is a state rather than
   * a fault — no keypair, no service worker, a test. `channels` will not carry
   * `push` either, so nothing here has to check twice.
   */
  readonly pusher?: Pusher;
}

/** File a note for everybody an event concerns. Answers how many were told. */
export async function tell(db: Db, raised: Raised, now = new Date()): Promise<number> {
  const book = raised.app.notifications ?? {};
  const roles = { ...PLATFORM_ROLES, ...raised.app.access.roles };
  let told = 0;

  for (const event of raised.events) {
    /* ⚠️ BY THE EVENT, NOT BY THE TYPE'S OWN ID. They are usually the same string
       and the day they are not, matching on the id tells nobody about a type
       that is correctly declared. `on` is the field that means this. */
    for (const def of Object.values(book).filter((d) => d.on === event)) {
      const dispatch = {
        type: def.id,
        tenantId: raised.tenantId as never,
        values: valuesFor(def.variables ?? [],
          { ...raised.input, ...raised.answer }, raised.actorName),
        except: raised.actor,
      };
      const audience = await audienceFor(
        db, book, raised.app.id, roles, dispatch, raised.channels);
      told += await fileNote(db, book, dispatch, audience, now);

      /*
        ⚠️ THE INTERRUPTION IS SENT AFTER THE RECORD IS WRITTEN, and the order is
        the promise the inbox makes. A push that arrived first and a file that
        then failed would be a notification pointing at a record that does not
        exist — somebody taps it and lands on an empty inbox.

        ⚠️ AND ONLY TO WHOEVER ASKED FOR IT. `channelsFor` has already resolved
        the workspace's ceiling against this person's own preference against what
        the deployment can actually deliver, so this reads a decision rather than
        making one.
      */
      if (!raised.pusher) continue;
      const wants = audience.filter((one) => one.channels.includes("push"));
      if (!wants.length) continue;
      const note = {
        tenantId: raised.tenantId,
        title: interpolate(def.summary, dispatch.values),
        link: def.link ?? null,
      };
      await Promise.all(wants.map((one) => raised.pusher!.push(one.accountId, note)));
    }
  }
  return told;
}
