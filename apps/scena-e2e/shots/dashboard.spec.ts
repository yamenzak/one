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

import { test, type Page } from "@playwright/test";
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

/**
 * Readiness anchors, scoped to `<main>`.
 *
 * ⚠️ NOT `page.getByText(...)`. The desktop sidebar is `hidden md:block` — it
 * stays in the DOM at the narrow viewport with `display: none`, and every nav
 * label is text. `.first()` then picks a HIDDEN nav item and `toBeVisible`
 * waits out its timeout on a page that rendered correctly. Worse on the way in:
 * at desktop the nav item IS visible, so a loose anchor is satisfied by the
 * sidebar before the screen has loaded anything — which is how the widget
 * builder came to be photographed as its own empty state.
 */
const inMain = (page: Page, text: string | RegExp) => page.getByRole("main").getByText(text).first();

test("the operator's workspace", async () => {
  const page = world.page;
  await page.bringToFront();

  await test.step("the fleet", async () => {
    await visit(page, `${base}/`, inMain(page, LOBBY_SCREEN));
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
    await visit(page, `${base}/`, inMain(page, LOBBY_SCREEN));
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
    await visit(page, `${base}/screens/${lobby.id}`, inMain(page, /online|offline/i));
    await shoot(page, project, "screen", { settle: 800 });
  });

  // The Studio is where an operator spends the most time — the slide list, the
  // music bed and the widget layer of one display, edited as one thing.
  await test.step("the studio", async () => {
    const lobby = world.screens.find((s) => s.name === LOBBY_SCREEN)!;
    await visit(page, `${base}/screens/${lobby.id}/studio`, inMain(page, /live preview|slides/i));
    await shoot(page, project, "studio", { settle: 1000 });
  });

  /*
    THE BUILDER NEEDS A PROFILE. `/widgets` on its own renders "No widget
    profile selected" — so the first version of this step produced a convincing
    photograph of an empty screen, filed under the name of the surface an
    operator spends the most time in, and the loose anchor it used
    (`getByText(/widget/i)`) was satisfied by the sidebar's own "Widget
    profiles" label before the page had loaded anything at all.

    `?profile=<id>` is the same deep link the Studio's "Open builder" button
    uses, and the id comes from the lobby display the world already built.
  */
  await test.step("the widget builder", async () => {
    await visit(page, `${base}/widgets?profile=${world.widgetProfileId}`, inMain(page, /widget|clock|layer/i));
    await shoot(page, project, "widget-builder", { settle: 1200 });
  });

  await test.step("channels", async () => {
    await visit(page, `${base}/channels`, inMain(page, LOBBY_SCREEN));
    await shoot(page, project, "channels", { settle: 600 });
  });

  /*
    THE TWO-PANE WITH SOMETHING OPEN IN IT (§11.2), which is the arrangement
    the shape exists for and the one nothing photographed. The shot above is
    the list beside its placeholder — worth having, and not evidence that
    picking an item leaves the list on screen. This is.

    Clicked rather than deep-linked: navigating straight to a record would also
    pass with a shape that discards its list, which is exactly the failure the
    picture is meant to rule out.
  */
  await test.step("a channel, beside its list", async () => {
    await visit(page, `${base}/channels`, inMain(page, LOBBY_SCREEN));
    await inMain(page, LOBBY_SCREEN).click();
    await shoot(page, project, "channel", { settle: 900 });
  });

  await test.step("slide playlists", async () => {
    await visit(page, `${base}/playlists`, inMain(page, DEMO_PLAYLIST));
    await shoot(page, project, "playlists", { settle: 600 });
  });

  await test.step("the media library", async () => {
    await visit(page, `${base}/media`, inMain(page, DEMO_MEDIA));
    await shoot(page, project, "media", { settle: 600 });
  });

  await test.step("music", async () => {
    await visit(page, `${base}/music`, inMain(page, DEMO_MUSIC));
    await shoot(page, project, "music", { settle: 600 });
  });

  await test.step("widget profiles", async () => {
    await visit(page, `${base}/profiles`, inMain(page, DEMO_PROFILE));
    await shoot(page, project, "profiles", { settle: 600 });
  });

  await test.step("data sources", async () => {
    await visit(page, `${base}/feeds`, inMain(page, DEMO_SOURCE));
    await shoot(page, project, "feeds", { settle: 600 });
  });

  await test.step("ads", async () => {
    await visit(page, `${base}/ads`, inMain(page, DEMO_ADS));
    await shoot(page, project, "ads", { settle: 600 });
  });

  await test.step("live boards", async () => {
    await visit(page, `${base}/boards`, inMain(page, DEMO_BOARD));
    await shoot(page, project, "boards", { settle: 1000 });
  });

  await test.step("analytics", async () => {
    await visit(page, `${base}/analytics`, page.getByRole("main").getByRole("heading", { name: "Analytics", exact: true }));
    await shoot(page, project, "analytics", { settle: 800 });
  });

  await test.step("alerts", async () => {
    await visit(page, `${base}/alerts`, page.getByRole("main").getByRole("heading", { name: "Alerts", exact: true }));
    await shoot(page, project, "alerts", { settle: 600 });
  });

  await test.step("billing", async () => {
    await visit(page, `${base}/billing`, page.getByRole("main").getByRole("heading", { name: "Billing", exact: true }));
    await shoot(page, project, "billing", { settle: 800 });
  });

  await test.step("the team", async () => {
    await visit(page, `${base}/team`, page.getByRole("main").getByRole("heading", { name: "Team", exact: true }));
    await shoot(page, project, "team", { settle: 600 });
  });

  await test.step("settings", async () => {
    await visit(page, `${base}/settings`, page.getByRole("main").getByRole("heading", { name: "Settings", exact: true }));
    await shoot(page, project, "settings", { settle: 600 });
  });

  /*
    A SECTION PAGE, not just the index — because they are different designs and
    only one of them was ever photographed.

    Settings is index/detail: the index is a list of rows and every section is a
    page of real controls behind it, so a suite that shoots only the index has
    photographed the table of contents and none of the book. The brand kit is
    the one worth having: it is the deepest surface in the app (a section, then
    a sub-page), it holds the only `SaveBar` on this screen, and it is where an
    unsaved preview lives.
  */
  await test.step("a settings section", async () => {
    // The SUB-page's own heading, not the parent's: once a sub-page is open the
    // brand frame stands down so there is only one header and one back button
    // (Settings.tsx says why), so "Brand kit" is not on screen here.
    await visit(page, `${base}/settings?s=brand&sub=identity`, page.getByRole("main").getByRole("heading", { name: "Name & fonts" }));
    await shoot(page, project, "settings-brand", { settle: 600 });
  });

  /*
    THE WAY OUT, which did not exist until it did.

    Worth its own frame rather than being folded into the settings shot: the row
    that opens it is owner-only and the card behind it is the one irreversible
    control in the product, so "what does a person actually see before they press
    this" is a question the images should be able to answer.
  */
  await test.step("closing the workspace", async () => {
    await visit(page, `${base}/settings?s=danger`, page.getByRole("main").getByRole("heading", { name: "Close this workspace" }));
    await shoot(page, project, "settings-danger", { settle: 400 });
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
