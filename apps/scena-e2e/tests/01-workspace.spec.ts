/**
 * GOLDEN PATH 1 — an owner arrives with nothing and ends up with a workspace.
 *
 * This is the path every other spec depends on, and the one that fails first
 * when something structural moves: the door classification, the OTP lane, the
 * org-create call, the auto-select of the new org, or the Shell's read of
 * `/api/me`. Each of those has an integration test; none of them proves that a
 * person with a browser gets from a sign-in screen to a fleet view.
 *
 * It also asserts the FIRST-RUN state, deliberately: a brand-new workspace has
 * no screens, and what it shows is `GetStarted` — two choice cards and a
 * three-step explainer. That panel is the product's first impression and the
 * one screen in the app with no data behind it to make it look finished.
 */

import { expect, test } from "@playwright/test";
import { api, createWorkspace, newParty, uniqueEmail } from "../src/app.js";

test("an owner signs up, creates a workspace, and lands on the fleet", async ({ browser }) => {
  const context = await newParty(browser);
  const page = await context.newPage();
  const email = uniqueEmail("owner");

  const { name, slug } = await createWorkspace(context, page, email);

  // The tenancy resolved from the HOSTNAME, not from a client-side guess: the
  // slug came out of what Better Auth stored, and the app answered on it.
  expect(page.url()).toContain(`${slug}.localhost`);

  // The session is a real one on this origin, and it is scoped to this tenant.
  const me = await api<{ authenticated: boolean; tenantId: string | null; role: string | null; email: string }>(
    page,
    "GET",
    "/api/me",
  );
  expect(me.authenticated).toBe(true);
  expect(me.email).toBe(email);
  expect(me.tenantId).toBeTruthy();
  // Whoever creates the workspace owns it — every later spec's permissions
  // assume this and would fail confusingly if it ever changed.
  expect(me.role).toBe("owner");

  // First run: no screens, so the onboarding panel rather than an empty grid.
  await expect(page.getByText("Welcome to Scena")).toBeVisible();
  // Text, not `getByRole("heading")`: `GetStarted`'s choice cards title
  // themselves with a styled div inside a <button>, so the card's accessible
  // name is the whole card. Asserting the role would pass only by accident of
  // markup and break on a purely visual change.
  await expect(page.getByText("Pair a screen", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Create a display", { exact: true }).first()).toBeVisible();

  // And the workspace is really empty — not a fixture pretending to be one.
  const { screens } = await api<{ screens: unknown[] }>(page, "GET", "/api/screens");
  expect(screens).toHaveLength(0);

  await context.close();
  expect(name).toBeTruthy();
});
