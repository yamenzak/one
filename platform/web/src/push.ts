/**
 * ASKING A BROWSER TO BE NOTIFIED — the half that runs on the device.
 *
 * ⚠️ WITHOUT THIS THE CHANNEL IS A SWITCH WITH NOTHING BEHIND IT, which is
 * exactly why push was deleted from this platform once already. The server can
 * encrypt and sign a message all day; a subscription only exists if a browser
 * makes one, and only a browser can ask the person.
 *
 * vocabulary-exempt-file(client): `self.clients` is the Service Worker API's own
 * name for the tabs a worker controls, inside the worker source below. It is a
 * platform symbol rather than a word this package chose, and it cannot be
 * renamed where it is called.
 *
 * ⚠️ THE PERMISSION IS ASKED AT THE MOMENT SOMEBODY PRESSES THE SWITCH, and
 * never on load. A page that demands notification permission on arrival is one
 * every browser now suppresses and every person refuses — and a refusal is
 * permanent, so asking early spends the one chance there is.
 *
 * ⚠️ AND THERE IS NO ROUTER AND NO FETCH HERE. The subscription is handed BACK
 * to the caller to save, exactly as every other screen in this package hands its
 * work back. An app knows where its API is; this does not.
 */

/** What a browser's subscription is, in the shape the platform stores. */
export interface Subscribed {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  /** Something a person can tell two browsers apart by. Never a fingerprint. */
  readonly label: string;
}

/**
 * ⚠️ THREE THINGS HAVE TO BE TRUE AND THEY FAIL SEPARATELY: no service worker
 * (an old browser, or a page not served over https), no `PushManager` (Safari
 * before it shipped one), and no `Notification`. Asked as one question, a
 * missing switch has no explanation.
 */
export const pushSupported = (): boolean =>
  typeof navigator !== "undefined"
  && "serviceWorker" in navigator
  && typeof globalThis !== "undefined"
  && "PushManager" in globalThis
  && "Notification" in globalThis;

/**
 * ⚠️ THE KEY ARRIVES AS URL-SAFE BASE64 AND THE API WANTS BYTES. Handing it the
 * string is the mistake this exists to prevent: `subscribe` throws
 * `InvalidCharacterError`, which reads as a broken browser rather than as a
 * wrong argument.
 */
export function keyBytes(base64url: string): Uint8Array {
  const padded = base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * ⚠️ A NAME FOR THE BROWSER, FROM THE BROWSER'S OWN WORDS FOR ITSELF. It is a
 * label on a row somebody reads to decide which subscription to remove — so it
 * is deliberately coarse. Anything sharper would be a fingerprint stored against
 * a person's account.
 */
export const browserLabel = (agent = typeof navigator === "undefined" ? "" : navigator.userAgent): string => {
  const named = ["Firefox", "Edg", "Chrome", "Safari"].find((n) => agent.includes(n));
  const where = /iPhone|iPad|Android/.exec(agent)?.[0];
  const browser = named === "Edg" ? "Edge" : named ?? "This browser";
  return where ? `${browser} on ${where}` : browser;
};

export type PushRefusal = "unsupported" | "unconfigured" | "denied" | "failed";

export type Answered =
  | { readonly ok: true; readonly subscription: Subscribed }
  | { readonly ok: false; readonly why: PushRefusal };

/**
 * Ask this browser to accept notifications, and hand back what to store.
 *
 * ⚠️ EACH REFUSAL IS A DIFFERENT THING TO SAY. `unconfigured` is our fault and
 * the switch should not have been shown; `denied` is the person's own decision
 * and cannot be asked again from a page; `unsupported` is the browser. One
 * "could not enable notifications" makes all three the same shrug, and the only
 * one anybody can act on is the second.
 *
 * ⚠️ THE SERVICE WORKER PATH IS THE APP'S. A worker's scope is its own directory,
 * so one served from anywhere but the root cannot receive a push for the whole
 * site — which fails as "it works on some pages", months later.
 */
export async function askToPush(input: {
  readonly key: string;
  readonly worker: string;
}): Promise<Answered> {
  if (!pushSupported()) return { ok: false, why: "unsupported" };
  /* ⚠️ An empty key is a deployment with no push configured. The screen should
     not have offered the switch, and answering "denied" would blame the person. */
  if (input.key.trim() === "") return { ok: false, why: "unconfigured" };

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, why: "denied" };

    await navigator.serviceWorker.register(input.worker);
    const ready = await navigator.serviceWorker.ready;
    const subscription = await ready.pushManager.subscribe({
      /*
        ⚠️ REQUIRED, AND IT IS A PROMISE RATHER THAN A FLAG. It says every push
        will show the person something — browsers revoke the permission of a site
        that pushes silently, and the platform has no silent push to send.
      */
      userVisibleOnly: true,
      applicationServerKey: keyBytes(input.key) as BufferSource,
    });
    const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return { ok: false, why: "failed" };
    return {
      ok: true,
      subscription: {
        endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, label: browserLabel(),
      },
    };
  } catch {
    return { ok: false, why: "failed" };
  }
}

/**
 * Stop this browser receiving them, and hand back what to forget.
 *
 * ⚠️ THE ENDPOINT IS RETURNED RATHER THAN THE CALL BEING MADE. Unsubscribing
 * locally and failing to tell the server leaves a row that is pushed to for ever
 * and reaches nobody; the two have to happen together, and the caller is the one
 * that can await both.
 */
export async function stopPushing(): Promise<string | null> {
  if (!pushSupported()) return null;
  try {
    const ready = await navigator.serviceWorker.ready;
    const subscription = await ready.pushManager.getSubscription();
    if (!subscription) return null;
    const { endpoint } = subscription;
    await subscription.unsubscribe();
    return endpoint;
  } catch {
    return null;
  }
}

/**
 * THE SERVICE WORKER ITSELF, as source an app serves from its own root.
 *
 * ⚠️ IT IS A STRING HERE BECAUSE A SERVICE WORKER IS A FILE AT A URL, NOT AN
 * IMPORT. Its scope is the directory it is served from, so it has to be at the
 * root — and bundling it as a module would put it under the build's asset path,
 * where it can only receive pushes for part of the site. An app writes this to
 * `/sw.js` (or appends it to the one it already has).
 *
 * ⚠️ AND IT SHOWS SOMETHING, ALWAYS. `userVisibleOnly` is a promise the browser
 * enforces: a push that displays nothing costs the site its permission, so a
 * malformed payload still draws a notification rather than being swallowed.
 */
export const PUSH_WORKER = `
self.addEventListener("push", (event) => {
  /* A push with no data still shows something — see above. */
  let said = { title: "Something happened", body: "" };
  try { said = { ...said, ...(event.data ? event.data.json() : {}) }; } catch (_) {}
  event.waitUntil(self.registration.showNotification(said.title, {
    body: said.body || "",
    icon: "/icon.png",
    /* ⚠️ Two notices about the same thing collapse into one on the lock screen. */
    tag: said.tag,
    data: said.data,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  /*
    ⚠️ AN OPEN TAB IS FOCUSED RATHER THAN A SECOND ONE OPENED. Somebody who taps
    a notification while the app is already open should land in the app they have,
    with what they were doing intact.
  */
  event.waitUntil(self.clients.matchAll({ type: "window" }).then((tabs) => {
    for (const tab of tabs) if (tab.url.startsWith(self.location.origin) && "focus" in tab) return tab.focus();
    return self.clients.openWindow("/");
  }));
});
`.trimStart();
