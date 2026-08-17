/**
 * WHO HAS TURNED PUSH ON, ON WHICH DEVICE, AT WHICH DOOR.
 *
 * ⚠️ A SUBSCRIPTION IS A DEVICE, NOT A PERSON, and that is half the shape of
 * this table. Somebody with a laptop and a phone has two, each with its own
 * keys, and telling them once means sending twice. A store keyed on the account
 * would silently replace the laptop with the phone, and the symptom is a person
 * who stopped being notified on the thing they were sitting at.
 *
 * ⚠️ AND IT IS A DOOR, WHICH IS THE OTHER HALF AND THE ONE THAT IS EASY TO MISS.
 * A service worker belongs to ONE ORIGIN, and every workspace here has its own —
 * so a subscription made at a workspace's door can only ever show that
 * workspace's icon and open that workspace's links. Delivering a note about
 * workspace A through a subscription made at workspace B is a notification
 * wearing the wrong business's logo, linking somewhere that does not resolve.
 * `tenant_id` is what stops it, and it is why the notification is right without
 * anything having to send a picture: the service worker asks its OWN origin for
 * `/icon.png`, which is that workspace's PWA icon, uploaded or drawn.
 *
 * ⚠️ IT IS IN THE DIRECTORY, BECAUSE THE ACCOUNT IS. A person is told across
 * every workspace they are in, so the lookup is by account and the workspace
 * narrows it — filed on a shard, a device would have to be re-registered per
 * workspace and would go when one of them closed.
 *
 * ⚠️ THE ENDPOINT IS THE IDENTITY, WHICH IS WHY IT IS THE KEY. A browser hands
 * back the same endpoint when it re-subscribes and a new one when it rotates;
 * keyed on it, re-subscribing updates in place and rotation adds a row the old
 * one's own 410 will remove. Keyed on anything else, every page load that
 * re-subscribes leaves another copy and one person is told five times.
 */

import type { AccountId, TenantId } from "@engine/kernel";
import { newId } from "@engine/kernel";
import type { SchemaModule } from "./schema.js";
import type { Db } from "./sql.js";
import { newVapid, send, type Subscription, type Vapid } from "./webpush.js";
import type { Pusher } from "./services.js";

/* ----------------------------------------------------------------- schema --- */

export const PUSH_SCHEMA: SchemaModule = {
  id: "push",
  statements: [
    `CREATE TABLE IF NOT EXISTS push_subscription (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, tenant_id TEXT, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, at TEXT NOT NULL);`,
    `CREATE INDEX IF NOT EXISTS ix_push_account ON push_subscription (account_id);`,
    /* ⚠️ ONE ROW, AND THE PRIMARY KEY SAYS SO. Two keypairs is two identities to
       every push service, and whichever one a browser subscribed under is the
       only one that can reach it — so the second is a silent half of the fleet
       that stops being told anything. */
    `CREATE TABLE IF NOT EXISTS push_key (id TEXT PRIMARY KEY CHECK (id = 'the'), public_key TEXT NOT NULL, private_key TEXT NOT NULL, subject TEXT NOT NULL, at TEXT NOT NULL);`,
  ],
};

/* ------------------------------------------------------------------- keys --- */

/**
 * THE DEPLOYMENT'S IDENTITY TO EVERY PUSH SERVICE.
 *
 * ⚠️ MISSING IS AN ANSWER, NOT A FAILURE. A deployment with no keypair has no
 * push, and every caller already reads that as a channel it must not offer —
 * `availableChannels` leaves it out, so the switch is absent rather than present
 * and inert.
 */
export async function vapidOf(db: Db): Promise<Vapid | null> {
  try {
    const row = await db.prepare(
      `SELECT public_key, private_key, subject FROM push_key WHERE id = 'the'`)
      .first<{ public_key: string; private_key: string; subject: string }>();
    return row
      ? { publicKey: row.public_key, privateKey: row.private_key, subject: row.subject }
      : null;
  } catch {
    /* ⚠️ A deployment that has not applied this module loses push, not the
       request it was answering. */
    return null;
  }
}

/**
 * A KEYPAIR, MADE HERE AND NEVER PASTED.
 *
 * ⚠️ THE CONSOLE GENERATES AND DOES NOT ACCEPT, and that is the whole design of
 * the screen above this. A private key typed into a form is one that has been
 * through a clipboard, a browser's autofill store and whatever logged the
 * request body; generated in the worker it exists in one place. There is also
 * nothing an operator could usefully paste — the keypair means nothing outside
 * this deployment.
 *
 * ⚠️ AND REPLACING ONE UNSUBSCRIBES EVERY DEVICE ON THE DEPLOYMENT. A browser
 * subscribes TO a public key; a new one makes every existing endpoint
 * undeliverable, for ever, with a 403 that reads like a bug. So a second call
 * REFUSES unless the caller says out loud that it means to, and the rows go with
 * it — leaving them would be a table of devices that can never be reached again.
 */
export type KeyRefusal = "already_have_one";

export async function makePushKeys(
  db: Db, subject: string, replace: boolean, now = new Date(),
): Promise<{ readonly publicKey: string } | KeyRefusal> {
  if (await vapidOf(db) && !replace) return "already_have_one";

  const pair = await newVapid();
  await db.prepare(
    `INSERT INTO push_key (id, public_key, private_key, subject, at) VALUES ('the', ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET public_key = excluded.public_key,
       private_key = excluded.private_key, subject = excluded.subject, at = excluded.at`)
    .bind(pair.publicKey, pair.privateKey, subject, now.toISOString()).run();

  /* ⚠️ EVERY SUBSCRIPTION GOES WITH THE KEY IT WAS MADE UNDER — see above. */
  await db.prepare(`DELETE FROM push_subscription`).run();
  return { publicKey: pair.publicKey };
}

/* ------------------------------------------------------------------ store --- */

export type SubscribeRefusal = "incomplete";

/**
 * ⚠️ THE THREE FIELDS ARE CHECKED, because they arrive from a browser and a
 * subscription missing its keys is one that can never be decrypted — a row that
 * looks live, counts as a device somebody is reachable on, and fails silently
 * at every send.
 */
export async function subscribeDevice(
  db: Db, accountId: AccountId, tenantId: TenantId | null, sub: Subscription,
  now = new Date(),
): Promise<{ readonly endpoint: string } | SubscribeRefusal> {
  const endpoint = sub.endpoint.trim();
  if (!endpoint || !sub.p256dh || !sub.auth) return "incomplete";
  try {
    if (new URL(endpoint).protocol !== "https:") return "incomplete";
  } catch {
    return "incomplete";
  }

  await db.prepare(
    `INSERT INTO push_subscription (id, account_id, tenant_id, endpoint, p256dh, auth, at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET account_id = excluded.account_id,
       tenant_id = excluded.tenant_id, p256dh = excluded.p256dh,
       auth = excluded.auth, at = excluded.at`)
    .bind(newId("psh", now), accountId, tenantId, endpoint, sub.p256dh, sub.auth,
      now.toISOString())
    .run();
  return { endpoint };
}

/**
 * THE DEVICES ONE PERSON CAN BE REACHED ON ABOUT ONE WORKSPACE.
 *
 * ⚠️ THIS WORKSPACE'S DOOR, OR THE DEPLOYMENT'S OWN — and nothing else. A
 * subscription made at another workspace's origin would deliver a notification
 * with that workspace's logo on it, opening a link into a workspace the note is
 * not about. Both are wrong in a way that looks like a bug in the product rather
 * than in the routing.
 *
 * ⚠️ A NULL `tenant_id` IS THE ACCOUNT DOOR, and it is included on purpose: the
 * person turned push on at OUR door, so it wears our mark and links into their
 * own space, which is exactly what a note reaching them there should look like.
 */
export async function subscriptionsOf(
  db: Db, accountId: AccountId, tenantId: TenantId | null,
): Promise<readonly Subscription[]> {
  try {
    const rows = await db.prepare(
      `SELECT endpoint, p256dh, auth FROM push_subscription
       WHERE account_id = ? AND (tenant_id IS NULL OR tenant_id = ?)`)
      .bind(accountId, tenantId).all<{ endpoint: string; p256dh: string; auth: string }>();
    return rows.results;
  } catch {
    /* ⚠️ FAILS TO "NO DEVICES", NEVER TO A THROW. A deployment that has not
       applied this module must lose push, not the dispatch that was carrying an
       inbox row and an email beside it. */
    return [];
  }
}

/**
 * ⚠️ CALLED ON A 410 AND NOWHERE ELSE — see `PushOutcome`. A push service
 * answers that for ever once a browser is uninstalled or the permission is
 * revoked, so a row that survives it is one we retry until somebody notices the
 * bill. Deleting on any other failure would unsubscribe a person because their
 * network was down for a minute.
 */
export async function dropSubscription(db: Db, endpoint: string): Promise<void> {
  await db.prepare(`DELETE FROM push_subscription WHERE endpoint = ?`).bind(endpoint).run();
}

/** One device, turned off from the screen that turned it on. */
export async function unsubscribeDevice(
  db: Db, accountId: AccountId, endpoint: string,
): Promise<void> {
  await db.prepare(`DELETE FROM push_subscription WHERE account_id = ? AND endpoint = ?`)
    .bind(accountId, endpoint).run();
}

/* ---------------------------------------------------------------- sending --- */

/**
 * THE `Pusher` THE NOTIFY LANE ASKS FOR, JOINED TO THE STORE AND THE CRYPTO.
 *
 * ⚠️ EVERY DEVICE, AND A FAILURE ON ONE IS NOT A FAILURE ON THE OTHERS. Somebody
 * with a stale laptop subscription and a live phone must still get the phone;
 * awaiting them in sequence and throwing on the first would mean the dead device
 * silences the live one, permanently, with nothing saying why.
 *
 * ⚠️ AND A `gone` DEVICE IS DELETED HERE, WHERE THE ANSWER IS. Sending is the
 * only moment the platform learns a subscription is dead — there is no other
 * signal — so a sender that did not prune would grow a table of endpoints it
 * retries for ever.
 */
export const pusherOver = (directory: Db): Pusher => ({
  /* ⚠️ THE KEYPAIR, ASKED EACH TIME. It is made from the operator console while
     the worker is running — memoised, an operator would generate one, watch the
     console call push live, and find every isolate still refusing it until the
     next deploy. */
  async live() {
    return !!await vapidOf(directory);
  },

  async push(accountId, note) {
    const vapid = await vapidOf(directory);
    if (!vapid) return;

    const devices = await subscriptionsOf(
      directory, accountId as AccountId, (note.tenantId as TenantId | null) ?? null);
    if (!devices.length) return;

    /*
      ⚠️ THE BODY IS WHAT THE SERVICE WORKER READS, and it is small on purpose:
      a title and where to go. The push service caps a payload at 4 kB and the
      notification shows two lines — anything else is bytes travelling through a
      third party for nothing.

      ⚠️ AND THERE IS NO ICON IN IT. The service worker asks its own origin,
      which IS the workspace this note is about — see the header. An icon URL in
      the payload would be a second answer to "whose logo is this", and the two
      would disagree the day somebody uploads a new one.
    */
    const payload = JSON.stringify({ title: note.title, link: note.link });

    await Promise.all(devices.map(async (device) => {
      const said = await send(vapid, device, payload);
      if (said === "gone") await dropSubscription(directory, device.endpoint);
    }));
  },
});
