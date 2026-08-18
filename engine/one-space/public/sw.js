/*
 * THE SERVICE WORKER — and its whole job is one notification, drawn right.
 *
 * ⚠️ IT IS NOT BUNDLED, AND THAT IS DELIBERATE. Vite copies `public/` verbatim,
 * so this file is served at the origin root with no hash in its name and no
 * import graph — which is what a service worker registration needs. Put through
 * the bundler it would land at `/assets/sw-<hash>.js`, and a worker registered
 * from there has a SCOPE of `/assets/`: push would be delivered to nothing, with
 * the registration reporting success.
 *
 * ⚠️ THE ICON IS `/icon.png` ON THIS ORIGIN, WHICH IS THE WHOLE REASON THE
 * SUBSCRIPTION IS FILED PER DOOR. Every workspace has its own address here, and
 * the worker answers that path with THAT workspace's tile — a logo it uploaded,
 * or its own initial drawn in its own colours. So the notification wears the
 * same picture as the icon on the home screen, and nothing had to send a URL for
 * it: an icon in the payload would be a second answer to "whose logo is this",
 * and the two would disagree the day somebody uploads a new one.
 *
 * ⚠️ AND THERE IS NO CACHING HERE. A service worker that caches is a second copy
 * of the application with its own idea of how old it may be, and every bug it
 * causes looks like the server serving stale content. This one is a push
 * receiver; when there is a reason to run offline, that is a decision made on
 * purpose rather than a `fetch` handler that arrived with the file.
 */

/* ⚠️ SKIP WAITING, THEN CLAIM. Without both, a new worker sits idle until every
   tab is closed — so a fix to this file reaches somebody who keeps a tab open
   for weeks approximately never. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/**
 * ⚠️ A PUSH EVENT MUST SHOW SOMETHING. Every browser that supports push requires
 * a visible notification for each one, and a handler that decides not to shows
 * the person a "this site was updated in the background" message instead — our
 * silence, in the browser's words, in a box we did not write. So an unreadable
 * payload still draws, with the honest text.
 */
self.addEventListener("push", (event) => {
  let said = {};
  try {
    said = event.data ? event.data.json() : {};
  } catch {
    said = {};
  }

  const title = typeof said.title === "string" && said.title.trim()
    ? said.title
    : "Something happened";

  event.waitUntil(self.registration.showNotification(title, {
    /* ⚠️ OUR OWN ORIGIN'S TILE — see the header. */
    icon: "/icon.png",
    /* ⚠️ THE BADGE IS THE MONOCHROME SILHOUETTE ANDROID PUTS IN THE STATUS BAR,
       and it is the SVG on purpose: it is masked to a single colour, so a
       photographic logo becomes a grey rectangle while a mark keeps its shape. */
    badge: "/icon.svg",
    /* ⚠️ THE LINK TRAVELS ON THE NOTIFICATION, because `notificationclick` fires
       in a worker that has no memory of this event. */
    data: { link: typeof said.link === "string" ? said.link : null },
    /*
      ⚠️ ONE TAG, SO A SECOND NOTIFICATION REPLACES THE FIRST RATHER THAN
      STACKING. Somebody who left a tab open over a weekend should meet one
      notification and an inbox, not forty of them and a phone they mute.
    */
    tag: "one",
    renotify: true,
  }));
});

/**
 * ⚠️ FOCUS A TAB THAT IS ALREADY OPEN BEFORE OPENING ANOTHER. Tapping a
 * notification and getting a second copy of the application — signed in, at a
 * different place, with the first one still there — is the single most common
 * defect in this handler, and it is invisible to anybody testing on a fresh
 * browser.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data && event.notification.data.link;
  /* ⚠️ RESOLVED AGAINST OUR OWN ORIGIN, so a link that somehow arrived absolute
     and pointing elsewhere cannot make this worker open it. */
  const to = new URL(link || "/space/inbox", self.registration.scope);
  if (to.origin !== self.location.origin) return;

  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of open) {
      if (new URL(client.url).origin !== to.origin) continue;
      await client.focus();
      /* ⚠️ `navigate` MAY BE REFUSED and the tab is still the right answer. */
      try { await client.navigate(to.href); } catch { /* focused is enough */ }
      return;
    }
    await self.clients.openWindow(to.href);
  })());
});

/**
 * ⚠️ A SUBSCRIPTION EXPIRES WITHOUT ANYBODY BEING TOLD, and this is the only
 * event that says so. A browser rotates its keys on its own schedule; without
 * this handler the person stays subscribed in our table and unreachable in
 * fact — the worst state, because nothing anywhere reports it.
 *
 * ⚠️ THE OLD ROW IS NOT DELETED FROM HERE. The new one arrives with the same
 * account behind the same cookie, and the old endpoint's own 410 removes it at
 * the next send — deleting it here would need a second call that can fail
 * between the two, leaving somebody subscribed to nothing.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil((async () => {
    const old = event.oldSubscription || await self.registration.pushManager.getSubscription();
    const key = event.newSubscription
      ? null
      : old && old.options && old.options.applicationServerKey;

    const made = event.newSubscription ?? (key
      ? await self.registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: key,
      })
      : null);
    if (!made) return;

    const raw = made.toJSON();
    await fetch("/api/me.push.subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      /* ⚠️ The cookie is what says who this is. A worker with no credentials
         would file every rotated device under nobody. */
      credentials: "include",
      body: JSON.stringify({
        endpoint: made.endpoint,
        p256dh: raw.keys && raw.keys.p256dh,
        auth: raw.keys && raw.keys.auth,
      }),
    });
  })());
});
