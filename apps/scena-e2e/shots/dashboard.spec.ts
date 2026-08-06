/**
 * THE SWEEP — every surface worth photographing, in one furnished workspace.
 *
 * Two tests rather than one per screen, and deliberately so: the world costs
 * about a minute to build and rebuilding it per screen would make the run long
 * enough that nobody would take it. Inside a test each shot is its own step, so
 * a failure names the screen it happened on.
 *
 * ── The shot ids are an interface ────────────────────────────────────────────
 *
 * `fleet`, `studio`, `boards`, … are what any document referencing an image
 * refers to. Renaming one is a content change that has to be made in both
 * places; adding one is free. That is why they are literals here rather than
 * derived from the URL.
 *
 * ── Readiness, not settling ──────────────────────────────────────────────────
 *
 * Every `visit` names an element that only exists once the screen has its data.
 * Scena's screens POLL, and several of them render an empty state on the first
 * tick — navigating and shooting immediately produces a convincing photograph of
 * "no boards yet" over a workspace with one. That is the exact class of bug the
 * UI rewrite spent a stage removing, and it would be embarrassing to reintroduce
 * it in the suite that photographs the fix.
 */

import { test } from "@playwright/test";
import {
  buildDemoWorld,
  closeDemoWorld,
  openOperatorConsole,
  DEMO_ADS,
  DEMO_BOARD,
  DEMO_MEDIA,
  DEMO_MUSIC,
  DEMO_PLAYLIST,
  DEMO_PROFILE,
  DEMO_SOURCE,
  LOBBY_SCREEN,
  type DemoWorld,
} from "../src/demo.js";
import { shoot, visit } from "../src/shoot.js";
import { workspaceUrl } from "../src/env.js";

let world: DemoWorld;
let project: string;
let base: string;

test.beforeAll(async ({ browser }, info) => {
  project = info.project.name;
  world = await buildDemoWorld(browser, project.endsWith("light") ? "light" : "dark");
  base = workspaceUrl(world.slug);
});

test.afterAll(async () => {
  if (world) await closeDemoWorld(world);
});

test("the operator's workspace", async () => {
  const page = world.page;
  await page.bringToFront();

  await test.step("the fleet", async () => {
    await visit(page, `${base}/`, page.getByText(LOBBY_SCREEN).first());
    await shoot(page, project, "fleet", { settle: 800 });
  });

  /*
    Pairing is the first thing anybody does and the screen most often described
    in words. The dialog is opened rather than deep-linked because it is a
    dialog: there is no URL that means "the pair sheet is open".

    ⚠️ Below `sm` the app-shell collapses EVERY header action into one ⋮ menu,
    so the button this clicks does not exist at the narrow viewport — the run
    failed there with a click timeout on a control the design deliberately does
    not render. Photographing the narrow projects without a picture of pairing
    would have been the wrong fix; so would widening the viewport. Both
    affordances are the product, so the step takes whichever one is on screen.
  */
  await test.step("pairing a screen", async () => {
    await visit(page, `${base}/`, page.getByText(LOBBY_SCREEN).first());
    const direct = page.getByRole("button", { name: "Pair screen", exact: true });
    if (await direct.isVisible()) {
      await direct.click();
    } else {
      await page.getByRole("button", { name: "Page actions" }).click();
      await page.getByRole("menuitem", { name: /pair screen/i }).click();
    }
    await shoot(page, project, "pair-screen", { ready: page.getByRole("dialog"), settle: 400 });
    await page.keyboard.press("Escape");
  });

  await test.step("a screen", async () => {
    const lobby = world.screens.find((s) => s.name === LOBBY_SCREEN)!;
    await visit(page, `${base}/screens/${lobby.id}`, page.getByText(/online|offline/i).first());
    await shoot(page, project, "screen", { settle: 800 });
  });

  // The Studio is where an operator spends the most time — the slide list, the
  // music bed and the widget layer of one display, edited as one thing.
  await test.step("the studio", async () => {
    const lobby = world.screens.find((s) => s.name === LOBBY_SCREEN)!;
    await visit(page, `${base}/screens/${lobby.id}/studio`, page.getByText(/studio/i).first());
    await shoot(page, project, "studio", { settle: 1000 });
  });

  await test.step("the widget builder", async () => {
    await visit(page, `${base}/widgets`, page.getByText(/widget/i).first());
    await shoot(page, project, "widget-builder", { settle: 1000 });
  });

  await test.step("channels", async () => {
    await visit(page, `${base}/channels`, page.getByText(LOBBY_SCREEN).first());
    await shoot(page, project, "channels", { settle: 600 });
  });

  await test.step("slide playlists", async () => {
    await visit(page, `${base}/playlists`, page.getByText(DEMO_PLAYLIST).first());
    await shoot(page, project, "playlists", { settle: 600 });
  });

  await test.step("the media library", async () => {
    await visit(page, `${base}/media`, page.getByText(DEMO_MEDIA).first());
    await shoot(page, project, "media", { settle: 600 });
  });

  await test.step("music", async () => {
    await visit(page, `${base}/music`, page.getByText(DEMO_MUSIC).first());
    await shoot(page, project, "music", { settle: 600 });
  });

  await test.step("widget profiles", async () => {
    await visit(page, `${base}/profiles`, page.getByText(DEMO_PROFILE).first());
    await shoot(page, project, "profiles", { settle: 600 });
  });

  await test.step("data sources", async () => {
    await visit(page, `${base}/feeds`, page.getByText(DEMO_SOURCE).first());
    await shoot(page, project, "feeds", { settle: 600 });
  });

  await test.step("ads", async () => {
    await visit(page, `${base}/ads`, page.getByText(DEMO_ADS).first());
    await shoot(page, project, "ads", { settle: 600 });
  });

  await test.step("live boards", async () => {
    await visit(page, `${base}/boards`, page.getByText(DEMO_BOARD).first());
    await shoot(page, project, "boards", { settle: 1000 });
  });

  await test.step("analytics", async () => {
    await visit(page, `${base}/analytics`, page.getByRole("heading", { name: "Analytics", exact: true }));
    await shoot(page, project, "analytics", { settle: 800 });
  });

  await test.step("alerts", async () => {
    await visit(page, `${base}/alerts`, page.getByRole("heading", { name: "Alerts", exact: true }));
    await shoot(page, project, "alerts", { settle: 600 });
  });

  await test.step("billing", async () => {
    await visit(page, `${base}/billing`, page.getByRole("heading", { name: "Billing", exact: true }));
    await shoot(page, project, "billing", { settle: 800 });
  });

  await test.step("the team", async () => {
    await visit(page, `${base}/team`, page.getByRole("heading", { name: "Team", exact: true }));
    await shoot(page, project, "team", { settle: 600 });
  });

  await test.step("settings", async () => {
    await visit(page, `${base}/settings`, page.getByRole("heading", { name: "Settings", exact: true }));
    await shoot(page, project, "settings", { settle: 600 });
  });

  // The operator console is a different DOOR, not a route inside the app — and
  // it had no picture at all, which is how a console redesign ships unreviewed.
  await test.step("the operator console", async () => {
    const console_ = await openOperatorConsole(world);
    await shoot(console_, project, "admin-console", { settle: 1200 });
    await console_.close();
  });
});

/**
 * THE SCREEN ITSELF — the half of this product that hangs on a wall.
 *
 * Photographed from the real player on the real device door, which is the only
 * place it exists. A mock of a television is not a television, and the pairing
 * screen in particular is the first thing every customer ever sees of Scena.
 */
test("the screen", async () => {
  const [lobby, cafe] = world.devices;

  await test.step("a screen playing", async () => {
    await lobby!.page.bringToFront();
    await shoot(lobby!.page, project, "player-playing", { settle: 1500 });
  });

  // The debug overlay exists to make "same clock ⇒ same slide" observable by
  // putting two players side by side. It is also the fastest way for an
  // installer to tell a broken screen from a slow network, and it had no
  // picture.
  await test.step("the debug overlay", async () => {
    await cafe!.page.bringToFront();
    await cafe!.page.keyboard.press("d");
    await shoot(cafe!.page, project, "player-debug", { settle: 800 });
    await cafe!.page.keyboard.press("d");
  });
});

test.describe.configure({ mode: "serial" });
