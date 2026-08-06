/**
 * Screen player bootstrap (BLUEPRINT §6-§9) with the offline-first layer (§8).
 *
 * Online first-run: reserve a ScreenDO → show the pairing code → operator claims
 * it → receive the manifest nudge → pre-cache assets → sync the clock → play.
 *
 * Offline / reload: if a manifest + a clock bridge are already cached, boot
 * straight into playout from Cache Storage with no network, then reconcile with
 * the server if/when the socket reconnects. Playout is a pure function of the
 * cached manifest and the clock, so a disconnected screen keeps playing.
 */

import { reserveScreen, fetchManifest, type Reservation } from "./api.js";
import { ScreenSocket } from "./socket.js";
import { Playout } from "./player.js";
import { Hud } from "./hud.js";
import { renderPairing, renderConnecting, renderPaired } from "./pairing.js";
import { precacheManifest } from "./precache.js";
import { EmergencyOverlay } from "./emergency.js";
import { AdInterruptOverlay } from "./ads.js";
import { MusicPlayer } from "./music.js";
import { Announcer } from "./announcer.js";
import { ScreenSaver, MuteBadge } from "./controls.js";
import { loadManifest, leaseValid, wipeCachedContent, hardReset } from "./store.js";
import { STORAGE_KEY } from "./config.js";
import { fontFaceCss, type Manifest } from "@scena/manifest";

const stage = document.getElementById("stage")!;

// Widgets (text / clock / …) render in the page DOM — not the slide iframe — so
// the bundled, self-hosted slide fonts must be @font-face'd here too, or a widget
// set to e.g. "Poppins" would fall back to the default face on screen.
const fontStyle = document.createElement("style");
fontStyle.textContent = fontFaceCss();
document.head.appendChild(fontStyle);

// Brand widget-theme (§6): the `--w-*` token block travels in each manifest so
// widgets follow the tenant's brand on screen. Injected/refreshed on apply.
let themeEl: HTMLStyleElement | null = null;
function applyWidgetTheme(css: string): void {
  if (!css) return;
  if (!themeEl) {
    themeEl = document.createElement("style");
    themeEl.id = "scena-widget-theme";
    document.head.appendChild(themeEl);
  }
  if (themeEl.textContent !== css) themeEl.textContent = css;
}

console.info("[scena] player boot", { online: navigator.onLine });

async function boot(): Promise<void> {
  // Escape hatch: navigating a stuck screen to `<player-url>?reset` wipes every
  // trace this origin holds (reservation, cached channel, all caches) and the
  // Service Worker, then reloads clean — the reliable way to un-stick a device
  // (e.g. one on a build too old to honor a remote unpair). `repair`/`reload`
  // are accepted aliases. Runs before anything.
  const q = new URLSearchParams(location.search);
  if (q.has("reset") || q.has("repair") || q.has("reload")) {
    renderConnecting(stage, "resetting…");
    await hardReset();
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch { /* non-fatal */ }
    location.replace(location.origin + location.pathname);
    return;
  }

  // Self-update: when a new build's Service Worker takes over, reload the screen
  // at the next slide boundary (never mid-content) so deploys land untouched.
  let pendingReload = false;
  const reloadAtBoundary = () => {
    if (pendingReload) return;
    pendingReload = true;
    // Fallback if no boundary comes soon (e.g. a single very long slide).
    setTimeout(() => { if (pendingReload) location.reload(); }, 120_000);
  };
  registerServiceWorker(reloadAtBoundary);
  const hud = new Hud(document.body);
  const emergency = new EmergencyOverlay();
  const music = new MusicPlayer(() => socket.syncedNow());
  const saver = new ScreenSaver();
  const muteBadge = new MuteBadge(document.body);
  const ads = new AdInterruptOverlay((e) => socket.emit(e), (ducked) => music.setDucked(ducked), () => muteBadge.muted);
  // Board announcements run through a persistent announcer that ducks the music
  // bed (like an audio ad) and survives scene rebuilds — so a slide advance can
  // never bury or cut a queue call. Shares the same duck as the ad overlay.
  const announcer = new Announcer((ducked) => music.setDucked(ducked));

  let started = false;
  // When we transition to "assigned", hold playout briefly so the success
  // flourish is actually seen before the channel paints over it.
  let pairedUntil = 0;

  const socket = new ScreenSocket("", {
    onSyncChange: (offset, rtt, n) => hud.setSync(offset, rtt, n, socket.clockSource),
    onPairing: (state, code) => {
      // The server is authoritative about whether this screen may play. If it
      // reports anything other than "assigned" while we're already playing, this
      // screen has been unpaired/reset (or it's an old alpha DO that no longer
      // owns a channel) — stop and wipe so it can never keep showing cached
      // content it no longer owns (which would dodge the paid-screen limit).
      if (started && state !== "assigned") {
        void deauthorize();
        return;
      }
      if (started) return;
      // Persist the live code the server hands us, so a reload shows THIS code
      // (claimable) rather than the original reservation code, which was consumed
      // and deleted at first claim — reading that stale code fails as "invalid".
      if (state === "pairing" && code) persistReservationCode(code);
      if (state === "pairing" && code) renderPairing(stage, code, "waiting for pairing…", refreshPairing);
      else if (state === "claimed") renderConnecting(stage, "claimed — caching channel…");
      else if (state === "assigned") {
        if (pairedUntil === 0) pairedUntil = performance.now() + 2000; // first claim → play the flourish
        renderPaired(stage);
      }
    },
    onManifest: async (msg) => {
      // Always refetch on a nudge: a publish (§9) may change the widget layer
      // without bumping the version the nudge carries. Rebuilding the scene is
      // cheap and idempotent.
      renderIfIdle("caching channel…");
      const manifest = await fetchAndCache(msg.url);
      if (socket.hasClock) startPlayout(manifest);
      else pending = manifest; // hold until the clock is usable
    },
    onEmergency: (msg) => emergency.show(msg.id, msg.title, msg.body, msg.tone),
    onInterrupt: (msg) => ads.show(msg, () => socket.syncedNow()),
    // A "clear" lifts whichever interrupt owns that id (emergency or ad).
    onClear: (id) => {
      emergency.clear(id);
      ads.clear(id);
    },
    onCommand: (msg) => {
      switch (msg.action) {
        case "unpair":
          // Deauthorization (§6): the operator unpaired/removed this device.
          // Wipe the cached channel + assets so a reload can't replay it, then
          // reload back to pairing. The reservation is kept, so it re-pairs as
          // the same device under the fresh code the dashboard shows.
          void deauthorize();
          break;
        case "refresh":
          location.reload();
          break;
        case "mute":
          muteBadge.set(true);
          music.setMuted(true);
          break;
        case "unmute":
          muteBadge.set(false);
          music.setMuted(false);
          break;
        case "screensaver.on":
          saver.show(() => socket.syncedNow());
          break;
        case "screensaver.off":
          saver.hide();
          break;
        case "debug.on":
          hud.setVisible(true);
          break;
        case "debug.off":
          hud.setVisible(false);
          break;
        // switch_channel: single-channel demo — no-op until multi-channel (§13)
      }
    },
    onOpen: () => hud.setOnline(true),
    onClose: () => {
      hud.setOnline(false);
      if (!started) renderConnecting(stage, "reconnecting…");
    },
  });

  const playout = new Playout(stage, () => socket.syncedNow(), {
    onSlideChange: (id) => {
      socket.setContentId(id);
      if (pendingReload) location.reload(); // a new build is ready — swap at the boundary
    },
    onPlayoutEvent: (event) => socket.emit(event),
    onFrame: (info) => {
      hud.setClockSource(socket.clockSource);
      hud.update(info);
    },
    announcer,
  });

  let pending: Manifest | null = null;
  function startPlayout(manifest: Manifest): void {
    // Hold the very first paint until the "paired" flourish has played out.
    const wait = pairedUntil - performance.now();
    if (wait > 0) {
      pending = manifest;
      setTimeout(() => { if (pending) startPlayout(pending); }, wait + 30);
      return;
    }
    started = true;
    pending = null;
    applyWidgetTheme(manifest.theme); // §6 — brand `--w-*` tokens for widgets
    playout.setManifest(manifest);
    music.setManifest(manifest); // §16 — music follows the same synced clock
  }
  function renderIfIdle(text: string): void {
    if (!started) renderConnecting(stage, text);
  }

  // Stop playout and erase the cached channel + assets, then reload to pairing.
  // Shared by the `unpair` command and the server-authority check above so a
  // deauthorized screen can never keep playing off its cache.
  let deauthorizing = false;
  async function deauthorize(): Promise<void> {
    if (deauthorizing) return;
    deauthorizing = true;
    started = false;
    playout.stop();
    // The reservation's stored code was consumed + deleted at first claim, so it
    // no longer claims. Drop it (keep the DO id/wsPath) so the reload doesn't show
    // a dead code — the DO hands us the fresh pairing code on reconnect.
    clearReservationCode();
    await wipeCachedContent();
    location.reload();
  }

  // Operator escape hatch on the pairing screen: mint a brand-new pairing code.
  // Drops this screen's reservation so the reload reserves a fresh ScreenDO with a
  // guaranteed-claimable code (used when the shown code won't pair — expired, or a
  // stale one lingering after an unpair).
  let refreshing = false;
  async function refreshPairing(): Promise<void> {
    if (refreshing) return;
    refreshing = true;
    started = false;
    playout.stop();
    socket.close();
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* non-fatal */ }
    await wipeCachedContent();
    location.reload();
  }

  // If sync converges after a manifest arrived, start the held manifest.
  const syncPoll = setInterval(() => {
    if (pending && socket.hasClock) {
      startPlayout(pending);
      clearInterval(syncPoll);
    }
  }, 100);

  hud.setOnline(navigator.onLine);
  window.addEventListener("online", () => hud.setOnline(true));
  window.addEventListener("offline", () => hud.setOnline(false));

  // --- Offline-first cold boot: play from cache immediately if we can. -------
  // Gate on the offline lease (§8): a cached channel only plays without the
  // server when we've had live contact recently. A screen that was unpaired/
  // removed while offline can't renew the lease, so once it lapses it stops
  // cold-booting into content — it just waits to reconnect (where the server is
  // authoritative). This closes the "keep it offline to dodge the screen limit"
  // hole without punishing a genuinely offline-but-still-paired screen.
  const cached = loadManifest();
  if (cached && !leaseValid(Date.now())) {
    renderConnecting(stage, "reconnecting…");
  } else if (cached && socket.hasClock) {
    startPlayout(cached);
  } else if (cached) {
    renderConnecting(stage, "syncing clock…");
  }

  // --- Connect (needs a reservation; that one call needs the network). -------
  try {
    const reservation = await getReservation();
    socket.setPath(reservation.wsPath);
    // Only paint a code we trust. A freshly reserved screen has a valid code; a
    // reservation whose code was cleared on unpair shows "connecting" until the DO
    // sends the authoritative pairing code (avoids flashing a dead code).
    if (!started) {
      if (reservation.code) renderPairing(stage, reservation.code, "waiting for pairing…", refreshPairing);
      else renderConnecting(stage, "getting a pairing code…");
    }
    socket.connect();
  } catch {
    if (!started) renderConnecting(stage, "offline — no cached channel yet");
  }
}

async function fetchAndCache(url: string): Promise<Manifest> {
  const manifest = await fetchManifest(url);
  await precacheManifest(manifest); // assets on disk before we paint
  return manifest;
}

/** Reuse a prior reservation (keeps a claimed screen paired across reloads). */
async function getReservation(): Promise<Reservation> {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as Reservation;
    } catch {
      /* fall through to a fresh reservation */
    }
  }
  const fresh = await reserveScreen();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  return fresh;
}

/** Keep the stored reservation's code in sync with the code the server currently
 *  advertises for this screen (e.g. a fresh code minted on unpair), so a reload
 *  displays a claimable code instead of a stale, already-consumed one. */
function persistReservationCode(code: string): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const r = JSON.parse(raw) as Reservation;
    if (r.code === code) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...r, code }));
  } catch {
    /* non-fatal — the live socket still shows the right code this session */
  }
}

/** Blank the stored reservation code (keeping the DO id/wsPath) so a reload after
 *  an unpair doesn't paint the now-consumed code; the DO supplies the fresh one. */
function clearReservationCode(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const r = JSON.parse(raw) as Reservation;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...r, code: "" }));
  } catch {
    /* non-fatal */
  }
}

function registerServiceWorker(onUpdateReady: () => void): void {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", async () => {
    try {
      // `updateViaCache: none` → the SW script is always byte-checked against the
      // network on update, so a deploy is noticed even behind a long CDN TTL.
      const reg = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
      // A newer build installed. `installed` + an existing controller means this
      // is an *update* (the first-ever install has no controller yet), so the SW
      // self-activates (skipWaiting) and the app should reload to run it.
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          if (nw.state === "installed" && navigator.serviceWorker.controller) onUpdateReady();
        });
      });
      // A kiosk never navigates, so poll for a new deploy — otherwise the browser
      // might not check for a Service Worker update for a day.
      const check = () => { void reg.update().catch(() => {}); };
      setInterval(check, 20 * 60_000);
      window.addEventListener("online", check);
    } catch {
      /* SW is an enhancement; the player still runs without it */
    }
  });
}

boot().catch((err) => {
  renderConnecting(stage, `startup error: ${String(err)}`);
});
