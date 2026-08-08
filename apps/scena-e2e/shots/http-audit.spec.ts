/**
 * EVERY REQUEST THE APP MAKES, AND WHAT CAME BACK.
 *
 * A page can render perfectly and still be broken: the shell mounts, the list
 * shows an empty state, and behind it three fetches came back 404. Every suite
 * in this repo asserts on what is DRAWN, so none of them can see that — which is
 * why "lots of 404s on almost all pages" was a thing a person noticed by opening
 * devtools and no test did.
 *
 * This drives the same surfaces the screenshot sweep drives and fails on any
 * non-2xx the app asked for. Not a screenshot suite: it is in this package
 * because it needs the same furnished world and the same doors.
 *
 * ⚠️ Deliberately NOT in the launch gate. It needs the operator lane (the demo
 * world is comped onto a plan) and the whole furnished build, which is minutes.
 * It is the diagnostic you run when something smells wrong, and the regression
 * net for the class of bug it just caught.
 */

import { expect, test } from "@playwright/test";
import { buildDemoWorld, closeDemoWorld, type DemoWorld } from "../src/demo.js";
import { createWorkspace, newParty, uniqueEmail } from "../src/app.js";
import { visit } from "../src/shoot.js";
import { workspaceUrl } from "../src/env.js";

/** Every operator surface, in the order the sidebar lists them. */
const PAGES: [string, string][] = [
  ["/", "fleet"],
  ["/channels", "channels"],
  ["/playlists", "playlists"],
  ["/music", "music"],
  ["/profiles", "widget profiles"],
  ["/media", "media"],
  ["/feeds", "sources"],
  ["/ads", "ads"],
  ["/boards", "boards"],
  ["/analytics", "analytics"],
  ["/alerts", "alerts"],
  ["/billing", "billing"],
  ["/team", "team"],
  ["/settings", "settings"],
  ["/settings?s=brand", "settings · brand"],
  ["/settings?s=playback", "settings · playback"],
  ["/settings?s=ai", "settings · AI"],
];

test("no page asks for something that is not there", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const world: DemoWorld = await buildDemoWorld(browser, "dark");
  const page = world.page;
  const base = workspaceUrl(world.slug);

  /** Every non-2xx the app asked for, with the page it happened on. */
  const bad: { where: string; status: number; url: string }[] = [];
  let where = "boot";
  page.on("response", (res) => {
    const url = res.url();
    // EVERYTHING the page asked for, not just `/api/` — the first pass of this
    // audit filtered to the API and reported a clean run, which was true and
    // not the answer: a missing icon, manifest or font is a 404 in the console
    // exactly like a missing route, and it is the one a person actually sees.
    if (res.status() === 404 || res.status() >= 500) bad.push({ where, status: res.status(), url: new URL(url).pathname });
  });

  for (const [path, label] of PAGES) {
    where = label;
    await visit(page, `${base}${path}`);
    // Long enough for the polls each screen starts on mount — several of these
    // fetch on an interval, and the first tick is the one that would 404.
    await page.waitForTimeout(1500);
  }

  await closeDemoWorld(world);

  const summary = bad.map((b) => `  ${b.status}  ${b.where.padEnd(20)} ${b.url}`).join("\n");
  expect(bad, `the app asked for ${bad.length} thing(s) that answered 404/5xx:\n${summary}`).toEqual([]);
});


/**
 * THE SAME SWEEP ON A WORKSPACE THAT WAS MADE A MINUTE AGO.
 *
 * The furnished world above is comped onto a plan and full of content, and it
 * comes back clean — which is a true answer to the wrong question. What a person
 * opening Scena for the first time has is a FREE workspace with nothing in it,
 * where a screen's first fetch may be for a record that does not exist and an
 * entitlement-gated lane may not be there at all. That is the state the 404s
 * were reported from, and the state no suite in this repo had ever driven.
 */
test("a brand-new workspace asks for nothing that is not there", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const context = await newParty(browser);
  const page = await context.newPage();
  const { slug } = await createWorkspace(context, page, uniqueEmail("audit"));
  const base = workspaceUrl(slug);

  const bad: { where: string; status: number; url: string }[] = [];
  let where = "boot";
  page.on("response", (res) => {
    if (res.status() === 404 || res.status() >= 500) bad.push({ where, status: res.status(), url: new URL(res.url()).pathname });
  });

  for (const [path, label] of PAGES) {
    where = label;
    await visit(page, `${base}${path}`);
    await page.waitForTimeout(1500);
  }
  await context.close();

  const summary = bad.map((b) => `  ${b.status}  ${b.where.padEnd(20)} ${b.url}`).join("\n");
  expect(bad, `a fresh workspace asked for ${bad.length} thing(s) that answered 404/5xx:\n${summary}`).toEqual([]);
});
