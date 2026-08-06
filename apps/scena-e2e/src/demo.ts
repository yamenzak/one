/**
 * THE DEMO WORKSPACE — a signage operator's Tuesday, built through the real API.
 *
 * Every screenshot the design review looks at is a photograph of THIS, which is
 * what keeps the images honest: there is no fixture layer, no seeded SQL and no
 * mocked endpoint anywhere in it. A workspace is created through the sign-up
 * form, screens are paired by booting real players against the device door, and
 * every piece of content is a POST the dashboard itself makes.
 *
 * The cost of that is about a minute per project, which is why the whole world
 * is built once in `beforeAll` and every shot is a step inside one test.
 *
 * ── Why it needs a paid plan ────────────────────────────────────────────────
 *
 * `free` allows ONE screen, one channel, no live boards, no ads, no sources. A
 * screenshot run on that plan photographs a smaller product than the one being
 * sold — the most flattering possible mistake, and the hardest to notice,
 * because every individual picture looks fine. `pro` is what the images are of,
 * comped through the ordinary `/api/billing/change-plan` endpoint using the
 * development platform-admin lane (`shots.config.ts` explains why the launch
 * gate must never have that lane, and why this suite may).
 */

import { type Browser, type BrowserContext, type Page } from "@playwright/test";
import { api, carrySessionTo, createWorkspace, newParty, uniqueEmail } from "./app.js";
import { bootScreen, awaitPlayout, type BootedScreen } from "./screen.js";
import { ADMIN_URL, ROOT_DOMAIN, workspaceUrl } from "./env.js";

/** Names that appear IN the images, so they are fixed rather than random. */
export const LOBBY_SCREEN = "Lobby wall";
export const CAFE_SCREEN = "Café menu";
/** Content names the sweep waits on. Fixed here so a rename is one edit. */
export const DEMO_PLAYLIST = "Winter promos";
export const DEMO_MEDIA = "Opening hours";
export const DEMO_MUSIC = "Morning bed";
/**
 * The widget profile the LOBBY DISPLAY was auto-provisioned with.
 *
 * Not one this file creates: `pro` allows three widget profiles and each
 * display provisions its own, so the three displays here use all three — a
 * fourth is refused with `plan limit reached (3 widget profiles)`, which is the
 * product working. `provisionDisplay` names the blocks after the display, so
 * this string is derived from `LOBBY_SCREEN` rather than chosen.
 */
export const DEMO_PROFILE = `${LOBBY_SCREEN} — widgets`;
export const DEMO_SOURCE = "Today's specials";
export const DEMO_ADS = "House ads";
export const DEMO_BOARD = "Front desk";

export interface DemoWorld {
  context: BrowserContext;
  /** The operator's page, already on the workspace's own origin. */
  page: Page;
  slug: string;
  screens: { id: string; name: string; channelId: string }[];
  /** The booted players. Kept OPEN: closing them turns the fleet offline. */
  devices: BootedScreen[];
}

interface Screen {
  id: string;
  name: string;
  channel_id: string | null;
}

/**
 * Pin the theme before the app boots.
 *
 * The choice is read in `initTheme()` at module scope, so setting it after load
 * would photograph one frame of the wrong palette. Written on the workspace
 * origin, which is the only one the dashboard reads it from.
 */
async function pinTheme(page: Page, origin: string, theme: "light" | "dark"): Promise<void> {
  await page.goto(origin);
  await page.evaluate((t) => localStorage.setItem("scena.theme", t), theme);
}

/** Build the whole world. Returns everything a spec needs to deep-link into it. */
export async function buildDemoWorld(browser: Browser, theme: "light" | "dark"): Promise<DemoWorld> {
  const context = await newParty(browser);
  const page = await context.newPage();
  const { name, slug } = await createWorkspace(context, page, uniqueEmail("demo"));
  const base = workspaceUrl(slug);

  await api(page, "POST", "/api/billing/change-plan", { planId: "pro" });
  await pinTheme(page, base, theme);
  await page.goto(base);

  /* ── two devices, paired the way a device is paired ──────────────────────── */
  const devices = [await bootScreen(browser), await bootScreen(browser)];
  // `sample: true` is the onboarding flow's own switch — a new device gets its
  // own editable display and a starter scene, so it lights up immediately. The
  // pictures are of that scene rather than of a black rectangle.
  await api(page, "POST", "/api/pair/claim", { code: devices[0]!.code, name: LOBBY_SCREEN, sample: true });
  await api(page, "POST", "/api/pair/claim", { code: devices[1]!.code, name: CAFE_SCREEN, sample: true });

  const { screens } = await api<{ screens: Screen[] }>(page, "GET", "/api/screens");
  if (screens.length !== 2) throw new Error(`expected 2 paired screens, got ${screens.length}`);
  const lobby = screens.find((s) => s.name === LOBBY_SCREEN) ?? screens[0]!;
  const channelId = lobby.channel_id!;

  /* ── content the operator would have ─────────────────────────────────────── */
  // A third display with no screen on it yet — preparing content ahead of a
  // delivery is a real thing operators do, and it is what makes the channels
  // list more than a mirror of the fleet.
  await api(page, "POST", "/api/displays", { name: "Meeting room", sample: true });

  await api(page, "POST", "/api/slide-playlists", { name: DEMO_PLAYLIST });
  await api(page, "POST", "/api/media", {
    kind: "html",
    name: DEMO_MEDIA,
    htmlBody: "<h1>Open until 9</h1><p>Kitchen closes at 8.</p>",
  });
  await api(page, "POST", "/api/music-playlists", { name: DEMO_MUSIC });

  const { id: feedId } = await api<{ id: string }>(page, "POST", "/api/feeds", {
    name: DEMO_SOURCE,
    provider: "manual",
  });
  for (const [title, body] of [
    ["Soup of the day", "Roast tomato & basil"],
    ["Special", "Grilled sea bass, new potatoes"],
    ["Dessert", "Pear tart"],
  ]) {
    await api(page, "POST", `/api/feeds/${feedId}/items`, { title, body });
  }

  await api(page, "POST", "/api/ad-profiles", { name: DEMO_ADS });
  const { id: boardId } = await api<{ id: string }>(page, "POST", "/api/boards", {
    kind: "queue",
    name: DEMO_BOARD,
    config: { prefix: "A", counters: [{ id: "c1", name: "Desk 1" }, { id: "c2", name: "Desk 2" }] },
  });
  /*
    A queue with nobody in it photographs as an empty state, which is a picture
    of the wrong thing — the board screens are about the live numbers.

    ⚠️ The OWNER cannot issue or call, and that is not a bug to work around. A
    board provisions its own coordinator and station USERS (`syncBoardUsers`),
    and `canControlBoard` admits either one of those or a board-scoped TOKEN.
    An owner's session is neither, so `/issue` answers 403 — correctly: the
    people who press these buttons are a receptionist at a desk and a tablet
    bolted to a wall, not whoever pays the bill. So the world mints the two
    tokens the product mints, and uses each for what it is for.
  */
  const kiosk = await api<{ token: string }>(page, "POST", `/api/boards/${boardId}/kiosk`, {});
  const station = await api<{ token: string }>(page, "POST", `/api/boards/${boardId}/station`, { name: "Desk 1" });
  for (let i = 0; i < 3; i++) await api(page, "POST", `/api/boards/${boardId}/issue`, { token: kiosk.token });
  await api(page, "POST", `/api/boards/${boardId}/call`, { counter: 1, token: station.token });

  // A colleague, invited and not yet signed in — the roster's two states in one
  // picture, and the one an owner sees most often right after setting up.
  // `operator` is one of Scena's four invitable roles (`access.ts`); the invite
  // EMAIL cannot be delivered locally, and that is fine — the pending row is
  // what the roster draws.
  await api(page, "POST", "/api/staff/invite", { email: uniqueEmail("teammate"), role: "operator" }).catch(
    () => undefined,
  );

  /* ── let the screens actually start playing ──────────────────────────────── */
  for (const device of devices) await awaitPlayout(device.page);
  await page.bringToFront();

  return {
    context,
    page,
    slug,
    screens: screens.map((s) => ({ id: s.id, name: s.name, channelId: s.channel_id! })),
    devices,
  };
}

/** Carry the operator's session onto the `admin.` door and land there. */
export async function openOperatorConsole(world: DemoWorld): Promise<Page> {
  await carrySessionTo(world.context, workspaceUrl(world.slug), `admin.${ROOT_DOMAIN}`);
  const page = await world.context.newPage();
  await page.goto(ADMIN_URL);
  return page;
}

/** Close everything this world opened. */
export async function closeDemoWorld(world: DemoWorld): Promise<void> {
  await Promise.all(world.devices.map((d) => d.context.close()));
  await world.context.close();
}
