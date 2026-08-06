/**
 * GOLDEN PATH 2 — TWO SCREENS, ONE FRAME. The claim the product rests on.
 *
 *     position(t) = (t − T0) mod cycleLength
 *
 * The server never says "show slide 3 now". Playout is a pure function of a
 * synced clock, which is why multi-screen sync, offline playback and live
 * updates are one mechanism rather than three features. `@scena/timeline` has 40
 * unit tests proving the function; none of them proves that two BROWSERS,
 * pairing separately against a real worker and fetching a real manifest, land on
 * the same slide.
 *
 * That is the whole of this spec, and it is the reason the suite boots the
 * player as a second worker on a second origin: a screen is a device with a
 * pinned URL, and driving it on the dashboard's origin would prove a topology
 * Scena deliberately does not have.
 *
 * ── What is driven through the UI, and what is not ──────────────────────────
 *
 * The PAIRING is real UI on both sides: the player renders its code, the
 * dashboard claims it. That is the path a person walks and the one that breaks
 * silently. Binding both screens to one channel and publishing goes through the
 * API with the browser's own cookie — those are two calls whose UI is covered by
 * spec 1 and by the integration suite, and driving them through forms here would
 * make this a test of forms rather than of the clock.
 */

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { api, createWorkspace, newParty, uniqueEmail } from "../src/app.js";
import { PLAYER_URL } from "../src/env.js";

interface Screen {
  id: string;
  name: string;
  channel_id: string | null;
}

/** What the player's own debug overlay says it is drawing, parsed. */
interface Frame {
  slideId: string;
  index: number;
  channelId: string;
  version: number;
}

/**
 * Open a player, wait for its pairing code, and hand it back.
 *
 * Its own browser context, because the reservation lives in `localStorage` and
 * two screens sharing one would be one screen with two windows — which is not
 * what a video wall is.
 */
async function bootScreen(context: BrowserContext): Promise<{ page: Page; code: string }> {
  const page = await context.newPage();
  await page.goto(PLAYER_URL);
  // The code is persisted as soon as the DO hands one over, and reading it from
  // storage rather than off the screen is deliberate: the pairing screen draws
  // each character in its own animated tile, so scraping it would couple this
  // spec to a presentation choice that has nothing to do with the clock.
  await expect
    .poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("scena.screen") ?? "{}")?.code ?? ""), {
      timeout: 60_000,
      message: "the player never reserved a screen (is the API base right?)",
    })
    .toMatch(/^[A-Z0-9]{4,8}$/);
  const code = await page.evaluate(() => String(JSON.parse(localStorage.getItem("scena.screen") ?? "{}").code));
  return { page, code };
}

/** The player's debug overlay, verbatim. */
function hudText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll("div"));
    const hud = nodes.find((n) => n.textContent?.includes("SCENA · debug") && n.style.position === "fixed");
    return hud?.textContent ?? "";
  });
}

function parseFrame(text: string): Frame | null {
  const slide = /slide\s+(\S+)\s+#(\d+)/.exec(text);
  const channel = /channel\s+(\S+)\s+v(\d+)/.exec(text);
  if (!slide || !channel) return null;
  return { slideId: slide[1]!, index: Number(slide[2]), channelId: channel[1]!, version: Number(channel[2]) };
}

/** Open the overlay. `d` toggles, so this is called exactly once per player. */
async function showHud(page: Page): Promise<void> {
  await page.bringToFront();
  await page.keyboard.press("d");
}

/**
 * Read the frame the player says it is drawing.
 *
 * Through the HUD, which exists FOR THIS: its own header says it makes the
 * invariant "same clock ⇒ same slide on every screen" directly observable by
 * putting two players side by side. Using the product's own instrument is
 * better than reaching into internals, because an instrument that lies is
 * itself a bug worth failing on.
 *
 * ⚠️ FOREGROUND, THEN WAIT FOR THE OVERLAY TO CHANGE. Two things bite here and
 * both look like a broken product rather than a broken harness:
 *
 *  - Playout is a `requestAnimationFrame` loop, and Chromium does not run rAF in
 *    a BACKGROUND page. Two players in two contexts means one of them is always
 *    backgrounded, so its loop is frozen and the overlay reports
 *    `slide — (no manifest)` indefinitely — which reads as "the manifest never
 *    arrived" and is nothing of the kind.
 *  - Foregrounding restarts the loop, but the overlay still holds the LAST frame
 *    from before it froze. Parsing that would compare a live reading on one
 *    screen against a stale one on the other, which is the exact mistake this
 *    spec exists to catch. So we wait for the text to MOVE (frames tick 5×/s)
 *    and only then parse.
 */
async function readFrame(page: Page): Promise<Frame> {
  const stale = await hudText(page);
  await page.bringToFront();
  let fresh: Frame | null = null;
  await expect
    .poll(
      async () => {
        const text = await hudText(page);
        fresh = text === stale ? null : parseFrame(text);
        return fresh !== null;
      },
      { timeout: 30_000, message: "the player never reported a live frame" },
    )
    .toBe(true);
  return fresh!;
}

test("two screens on one channel draw the same slide", async ({ browser }) => {
  const owner = await newParty(browser);
  const dash = await owner.newPage();
  await createWorkspace(owner, dash, uniqueEmail("owner"));

  /*
    ── a plan that allows a wall ────────────────────────────────────────────

    `free` allows ONE screen, which is correct — a video wall is what people
    pay for — and is why this spec cannot live in the launch gate. See
    `wall.config.ts`: it runs the worker with an empty `ADMIN_EMAILS`, which
    turns on the development platform-admin lane, and that is the only route to
    a paid plan without Stripe.

    Through the ordinary `/api/billing/change-plan` endpoint, not a back door:
    the same call the plan picker makes, taking the admin branch the product
    itself documents.
  */
  await api(dash, "POST", "/api/billing/change-plan", { planId: "starter" });

  /*
    ── two devices, each reserving its own screen ───────────────────────────

    ⚠️ PLAIN CONTEXTS, NOT `newParty`. That helper adds a `cf-connecting-ip`
    header so each signing-in PERSON spends their own OTP budget — and a screen
    is not a person. Worse, it breaks them: the player's reservation is a
    cross-origin POST with no custom headers, i.e. a SIMPLE request that needs
    no preflight, and adding one header turns it into a preflighted one. The
    worker's CORS allows `content-type` and nothing else, so the preflight is
    refused and the player renders "offline — no cached channel yet" with no
    request in the log that looks like a failure.
  */
  const deviceA = await browser.newContext();
  const deviceB = await browser.newContext();
  const a = await bootScreen(deviceA);
  const b = await bootScreen(deviceB);
  expect(a.code).not.toBe(b.code); // two devices, not one seen twice

  /* ── the operator claims both ───────────────────────────────────────────── */
  await api(dash, "POST", "/api/pair/claim", { code: a.code, name: "Wall left" });
  await api(dash, "POST", "/api/pair/claim", { code: b.code, name: "Wall right" });

  const { screens } = await api<{ screens: Screen[] }>(dash, "GET", "/api/screens");
  expect(screens).toHaveLength(2);
  // Each new device is auto-wired its OWN display, which is the right default
  // for one screen in one room and exactly wrong for a video wall — so the next
  // step is the one an operator building a wall actually takes.
  const [left, right] = screens;
  expect(left!.channel_id).not.toBe(right!.channel_id);

  /* ── put them both on ONE channel, give it something to show, publish ───── */
  const channelId = left!.channel_id!;
  await api(dash, "PUT", `/api/screens/${right!.id}/channel`, { channelId });
  /*
    THE CHANNEL NEEDS SLIDES, and a freshly auto-wired display has none.

    Without this the run gets all the way to the end and both players report
    `slide — (no manifest)`: they HAVE the manifest, they agree on it, and there
    is nothing in it to draw. Two screens agreeing about an empty channel is not
    the claim being tested. `seed-sample` is the "Sample" button in the Studio —
    the same starter scene an operator gets — so the slides are the product's,
    not the suite's.
  */
  await api(dash, "POST", `/api/channels/${channelId}/seed-sample`, {});
  const { version } = await api<{ version: number }>(dash, "POST", `/api/channels/${channelId}/publish`, {});

  /* ── both screens converge on the same manifest ─────────────────────────── */
  const manifestOf = (page: Page) =>
    page.evaluate(() => {
      const raw = localStorage.getItem("scena.manifest");
      if (!raw) return null;
      const m = JSON.parse(raw) as { channelId?: string; version?: number };
      return { channelId: m.channelId ?? null, version: m.version ?? null };
    });

  /*
    ── both screens converge on the same manifest ─────────────────────────────

    ⚠️ POLL FOR THE VERSION, NOT JUST THE CHANNEL. The left screen was ALREADY on
    this channel — it is the display it was auto-wired — and a channel publishes
    v1 lazily the first time a player fetches it, so `{ channelId }` alone was
    satisfied by a manifest predating the seed. The run then failed one line
    later comparing a stale v1 against the right screen's fresh one, which reads
    as a sync bug and is nothing of the kind. The version the publish returned is
    the only thing that says "the manifest we just made".
  */
  for (const page of [a.page, b.page]) {
    await expect
      .poll(() => manifestOf(page), { timeout: 90_000, message: "a screen never picked up the published manifest" })
      .toEqual({ channelId, version });
  }

  /* ── and they draw the same frame ───────────────────────────────────────── */
  await showHud(a.page);
  await showHud(b.page);

  /*
    A SANDWICH, NOT A PAIR. Only one page can be foregrounded at a time, so the
    two readings are necessarily taken a moment apart — and the seeded slides
    turn over every 6.5–7 s, which is short enough that a boundary sometimes
    falls inside the sampling window. Reading A, then B, then A AGAIN makes that
    observable instead of flaky: A's two readings bracket B's in time, so
    whatever A was showing while B was read is one of them. If no boundary was
    crossed the bracket is a single slide and the assertion is exact equality; if
    one was, B must be on the slide A was leaving or the one it was entering.
    Either way a clock that genuinely disagreed would land outside the bracket.
    No retry, and no duration tuned to make the test pass.
  */
  const a1 = await readFrame(a.page);
  const fb = await readFrame(b.page);
  const a2 = await readFrame(a.page);

  expect(fb.channelId).toBe(a1.channelId);
  expect(fb.version).toBe(a1.version);

  const bracket = [a1, a2].map((f) => `${f.slideId}#${f.index}`);
  const observed = `${fb.slideId}#${fb.index}`;
  if (bracket[0] === bracket[1]) expect(observed).toBe(bracket[0]); // no boundary crossed
  else expect(bracket).toContain(observed); // the window straddled a turnover

  await Promise.all([owner.close(), deviceA.close(), deviceB.close()]);
});
