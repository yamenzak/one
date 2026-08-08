/**
 * THE DOORS — and the one that used to serve a whole broken app.
 *
 * ── What this is here for ───────────────────────────────────────────────────
 *
 * `scena.4dl.app` is the ROOT: a signpost, not a workspace. The route guard has
 * always known that — it answers six paths there and refuses the rest — but the
 * SPA's cascade handled `admin` and fell through to the workspace Shell for
 * every other role. So the root rendered the entire operator app, because
 * `/api/me` answers on that door and reports the session's ACTIVE ORGANIZATION
 * as `tenantId`; every screen then drew, and `/api/channels`, `/api/billing`,
 * `/api/branding` and `/api/emergency/active` all 404'd.
 *
 * It was reported from production as "the whole app is 404" with a screenshot of
 * the Channels screen saying `listChannels 404`.
 *
 * ⚠️ NO UNIT TEST CAN SEE THIS. The failure is the composition of three things
 * that are individually correct — a guard that refuses, an `/api/me` that
 * answers, and a cascade with no branch — and it only exists once a browser has
 * a session and navigates. It needs the real worker on the real host topology,
 * which is what this suite is.
 *
 * On loopback `classifyHost` classifies against `localhost` whatever the config
 * says, so the BARE host here is the same door `scena.4dl.app` is in production.
 */

import { expect, test } from "@playwright/test";
import { carrySessionTo, createWorkspace, newParty, uniqueEmail } from "../src/app.js";
import { ROOT_DOMAIN, ROOT_URL, workspaceUrl } from "../src/env.js";

test("the root door is a signpost, and never the app", async ({ browser }) => {
  const context = await newParty(browser);
  const page = await context.newPage();
  const { slug, name } = await createWorkspace(context, page, uniqueEmail("doors"));

  // The same session, on the root. In production one cookie covers the whole
  // root; locally each `*.localhost` keeps its own jar, so it is carried.
  await carrySessionTo(context, `http://setup.${ROOT_DOMAIN}:8789/`, ROOT_DOMAIN);

  const refused: string[] = [];
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/") && r.status() === 404) refused.push(u.pathname);
  });

  // Deliberately a DEEP link, not `/`. The reported screenshot was `/channels`,
  // and a signpost that only holds for the bare path is not a signpost.
  await page.goto(`${ROOT_URL}/channels`);

  // The signpost names the address and offers the workspace as a destination.
  await expect(page.getByText(ROOT_DOMAIN, { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(name, "i") })).toBeVisible();

  /*
    THE ASSERTION THAT WOULD HAVE CAUGHT IT. Not "the signpost is visible" — the
    broken build rendered a whole app and would have failed on a text match for
    an unrelated reason. This says the workspace app is NOT mounted, which is the
    actual invariant: no nav, no screen heading, and — the symptom people saw —
    no refused data call.
  */
  await expect(page.getByRole("heading", { name: "Channels" })).toHaveCount(0);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await page.waitForTimeout(1500);
  expect(refused.join(", "), "the root door must not be serving a workspace screen").toBe("");

  // …and the destination actually opens the workspace.
  await carrySessionTo(context, `http://setup.${ROOT_DOMAIN}:8789/`, `${slug}.${ROOT_DOMAIN}`);
  await page.goto(`${workspaceUrl(slug)}/channels`);
  await expect(page.getByRole("heading", { name: "Channels" })).toBeVisible({ timeout: 30_000 });
});

test("a subdomain no workspace owns says so, and does not offer a sign-in", async ({ browser }) => {
  const context = await newParty(browser);
  const page = await context.newPage();
  // A well-formed slug that passes every shape check and belongs to nobody.
  await page.goto(`http://not-a-real-workspace-x7.${ROOT_DOMAIN}:8789/`);

  await expect(page.getByText(/no workspace at/i)).toBeVisible({ timeout: 30_000 });
  /*
    A sign-in form here would ask somebody to authenticate into a workspace that
    does not exist, and any code they requested would arrive with nowhere to go.
    The server refuses to send one; the screen must not imply otherwise.
  */
  await expect(page.getByLabel(/email/i)).toHaveCount(0);
});
