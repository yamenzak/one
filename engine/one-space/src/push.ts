/**
 * TURNING PUSH ON FROM THE BROWSER — the ceremony, in one place.
 *
 * ⚠️ IT IS FIVE APIS THAT EACH FAIL DIFFERENTLY, and every screen that writes
 * its own gets a different subset right. `Notification` may not exist; the
 * service worker may not register; `Notification.requestPermission` may be
 * refused, ignored or already answered; `pushManager.subscribe` throws rather
 * than resolving false; and the subscription still has to reach the server or
 * the device is subscribed in the browser and unknown to us. One function, so
 * there is one set of answers.
 *
 * ⚠️ THE PERMISSION IS ASKED FROM A GESTURE AND NOWHERE ELSE. Browsers refuse
 * a prompt that was not caused by a person, and some of them PENALISE a site
 * that tries — so asking on mount is not merely rude, it can lose the ability to
 * ask at all. The switch is the gesture.
 *
 * ⚠️ AND THE SUBSCRIPTION BELONGS TO THIS ORIGIN. Every workspace here has its
 * own address, so turning notifications on inside a workspace subscribes THAT
 * workspace — which is what makes the notification wear its icon rather than
 * ours. `me.push.subscribe` files it under the door it arrived at; nothing here
 * has to say which workspace it is in.
 */

import { api } from "./api.js";
import type { Permission } from "@engine/design";

/** ⚠️ Served from `public/`, unhashed, at the root — see the file's own header. */
const WORKER = "/sw.js";

/**
 * ⚠️ THE KEY IS BYTES, NOT THE STRING THE SERVER SENT. `applicationServerKey`
 * takes a `BufferSource`; handed base64url it throws `InvalidCharacterError`,
 * which reads as a bug in the key rather than in its encoding.
 */
/* ⚠️ `<ArrayBuffer>` EXPLICITLY. A bare `new Uint8Array(n)` is typed over
   `ArrayBufferLike`, which might be SHARED memory and is therefore not a
   `BufferSource` — so `applicationServerKey` refuses it, and the error names the
   key rather than its type. */
const keyBytes = (b64url: string): Uint8Array<ArrayBuffer> => {
  const padded = b64url.replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

/** Whether this browser can do it at all. Checked once, read everywhere. */
export const pushIsPossible = (): boolean =>
  typeof window !== "undefined"
  && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/**
 * ⚠️ REGISTERED ONCE PER PAGE AND AWAITED, not fired and forgotten. `subscribe`
 * needs an ACTIVE registration, and a worker that is still installing rejects
 * with a message about an invalid state — which is the usual reason "it works on
 * the second press".
 */
const registration = async (): Promise<ServiceWorkerRegistration> => {
  const had = await navigator.serviceWorker.getRegistration(WORKER);
  const now = had ?? await navigator.serviceWorker.register(WORKER, { scope: "/" });
  await navigator.serviceWorker.ready;
  return now;
};

/**
 * WHERE THIS DEVICE STANDS, WITHOUT ASKING ANYBODY ANYTHING.
 *
 * ⚠️ A GRANTED PERMISSION IS NOT A SUBSCRIPTION. Somebody who cleared site data,
 * or whose browser rotated its keys, is `granted` with nothing subscribed — so
 * reading `Notification.permission` alone reports a device as reachable that is
 * not. Both are asked.
 */
export async function pushState(): Promise<{
  readonly state: Permission;
  readonly endpoint: string | null;
}> {
  if (!pushIsPossible()) return { state: "unavailable", endpoint: null };
  if (Notification.permission === "denied") return { state: "denied", endpoint: null };

  try {
    const had = await (await registration()).pushManager.getSubscription();
    return had ? { state: "on", endpoint: had.endpoint } : { state: "off", endpoint: null };
  } catch {
    /* ⚠️ A registration that will not come up is "off" rather than a thrown
       screen: the person can still press the switch, and the failure is then
       reported where they pressed it. */
    return { state: "off", endpoint: null };
  }
}

export type TurnOnRefusal = "unavailable" | "denied" | "no_keypair" | "refused";

/**
 * ⚠️ THE SERVER'S KEY, ASKED EVERY TIME RATHER THAN REMEMBERED. A subscription
 * made against a key the deployment has since replaced is undeliverable for
 * ever, and the browser reports nothing — it is a valid subscription to a
 * sender that no longer exists.
 */
export async function turnPushOn(): Promise<{ readonly endpoint: string } | TurnOnRefusal> {
  if (!pushIsPossible()) return "unavailable";

  const key = await api.get<{ key: string | null }>("me.push.key");
  if (!key.ok) return "refused";
  if (!key.value.key) return "no_keypair";

  /* ⚠️ THE PROMPT, FROM THE GESTURE THAT CALLED THIS. `default` and `denied` are
     different answers: one has not been asked, the other said no and cannot be
     asked again. */
  const said = await Notification.requestPermission();
  if (said !== "granted") return said === "denied" ? "denied" : "refused";

  let made: PushSubscription;
  try {
    made = await (await registration()).pushManager.subscribe({
      /* ⚠️ REQUIRED, AND NOT A PREFERENCE. Every browser refuses a silent push
         subscription; the flag is a promise that each one shows something, and
         the service worker keeps it. */
      userVisibleOnly: true,
      applicationServerKey: keyBytes(key.value.key),
    });
  } catch {
    return "refused";
  }

  const raw = made.toJSON();
  const filed = await api.post<{ endpoint: string }>("me.push.subscribe", {
    endpoint: made.endpoint,
    p256dh: raw.keys?.p256dh ?? "",
    auth: raw.keys?.auth ?? "",
  });
  if (!filed.ok) {
    /* ⚠️ UNDONE IN THE BROWSER TOO. A subscription the server never stored is a
       device that believes it is subscribed and can never be sent to, and the
       switch would come back on after a reload to say so. */
    await made.unsubscribe().catch(() => undefined);
    return "refused";
  }
  return { endpoint: made.endpoint };
}

/**
 * ⚠️ THE BROWSER FIRST, THEN US — and the order is what makes a half-failure
 * safe. A row deleted while the browser stays subscribed means a push service
 * keeps a live endpoint nothing will ever use; the other way round means we hold
 * a row for a device that has gone, which the first 410 removes by itself.
 */
export async function turnPushOff(): Promise<boolean> {
  if (!pushIsPossible()) return true;
  const had = await (await registration()).pushManager.getSubscription();
  if (!had) return true;

  await had.unsubscribe().catch(() => undefined);
  const said = await api.post<{ endpoint: string }>("me.push.forget", { endpoint: had.endpoint });
  return said.ok;
}
