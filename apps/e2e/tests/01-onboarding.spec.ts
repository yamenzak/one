/**
 * GOLDEN PATH 1 — the front door.
 *
 *   owner signs up → creates a studio → invites a client by email
 *     → the client signs in with their own emailed code
 *     → auto-links to the invited record
 *     → completes the 5-step intake wizard
 *     → lands in the client app
 *     → the coach's roster flips the client from "Invited" to "Active"
 *
 * This is the highest-value regression guard in the repo, because every step of
 * it has been broken at least once and two of the breaks made the product
 * unenterable:
 *
 *  • `PATCH /api/clients/:id` demanded `client:["update"]`, a permission the
 *    `client` role preset deliberately does not hold — so the intake wizard's
 *    ONLY write 403'd and no client could ever get past onboarding. The
 *    integration suite cannot see that class of bug at all: its test users are
 *    platform admins, and the route guard short-circuits for those (AGENTS.md §4).
 *    A browser driving the real client persona can.
 *  • Invited members dead-ended on "Create workspace" — the auto-link in
 *    `context-routes.ts` is what turns an invited `clients` row into a persona,
 *    and if it misses, the client is offered a studio of their own instead.
 *
 * So the assertions to care about are: the wizard's Finish actually persists, and
 * the client lands on the CLIENT surface (Train/Eat tabs) rather than the
 * first-run "Start your business" screen.
 */

import { test, expect, type Page } from "@playwright/test";
import { newParty, prepare, sheet, signInWithOtp, signUpOwner, tab, uniqueEmail } from "../src/app.js";

test("owner onboards, invites a client, and the client signs in and completes intake", async ({ browser }) => {
  const ownerEmail = uniqueEmail("owner");
  const clientEmail = uniqueEmail("client");
  const studio = `E2E Studio ${Date.now().toString(36)}`;
  const clientName = "Dana Test";

  const coachCtx = await newParty(browser);
  const coach = await coachCtx.newPage();

  await test.step("owner signs up and creates the studio", async () => {
    await signUpOwner(coach, ownerEmail, studio);
    // The coach surface, not the client one: the owner's own dashboard, under
    // the studio they just named.
    await expect(coach.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
    await expect(coach.getByText(studio)).toBeVisible();
    await expect(tab(coach, "Clients")).toBeVisible();
  });

  await test.step("owner invites a client by email", async () => {
    await tab(coach, "Clients").click();
    await expect(coach.getByRole("heading", { name: "Clients", exact: true })).toBeVisible();
    await expect(coach.getByText("No clients yet")).toBeVisible();

    // The header "New" rather than the empty-state "Add client": the create sheet
    // has its own "Add client" submit, so opening from the header keeps that name
    // unambiguous.
    await coach.getByRole("button", { name: "New", exact: true }).click();
    const form = sheet(coach, "New client");
    await form.getByLabel("Email").fill(clientEmail);
    await form.getByLabel("Name (optional)").fill(clientName);
    await form.getByRole("button", { name: "Add client" }).click();

    // The invite sheet proves the server built + emailed the branded deep-link.
    const invited = sheet(coach, "Client invited");
    await expect(invited).toBeVisible();
    await expect(invited.getByText(clientEmail)).toBeVisible();
    await expect(invited.getByText(/\?invite=/)).toBeVisible();
    await invited.getByRole("button", { name: "Go to client" }).click();

    // Coach view of the new client.
    await expect(coach.getByText("Coach view")).toBeVisible();
    await expect(coach).toHaveURL(/\/clients\/[^/]+\/today$/);
  });

  await test.step("the new client is on the roster", async () => {
    await tab(coach, "Clients").click();
    const row = coach.getByRole("button").filter({ hasText: clientName });
    await expect(row).toBeVisible();
    await expect(row).toContainText(clientEmail);
  });

  // A separate context: a second browser profile, so the two personas hold two
  // independent session cookies exactly as two people on two phones would.
  const clientCtx = await newParty(browser);
  const client = await clientCtx.newPage();

  await test.step("the invited client signs in with their own code", async () => {
    await prepare(client);
    await client.goto("/");
    await signInWithOtp(client, clientEmail);
  });

  await test.step("the client is auto-linked and gets the intake wizard, not 'create a studio'", async () => {
    // The regression that mattered: an unlinked invitee saw "Start your business".
    await expect(client.getByRole("heading", { name: /^Hi / })).toBeVisible({ timeout: 30_000 });
    await expect(client.getByRole("heading", { name: "Start your business" })).toHaveCount(0);
  });

  await test.step("the client completes all five intake steps", async () => {
    // Step 1 — basics. Continue stays disabled until gender + DOB + a sane height.
    const next = client.getByRole("button", { name: "Continue" });
    await expect(next).toBeDisabled();
    await client.getByRole("button", { name: "female" }).click();
    await client.getByLabel("Date of birth").fill("1994-06-15");
    await client.getByLabel("Height (cm)").fill("168");
    await expect(next).toBeEnabled();
    await next.click();

    // Step 2 — goal.
    await expect(client.getByRole("heading", { name: "Your goal" })).toBeVisible();
    await client.getByRole("button", { name: "Build muscle" }).click();
    await next.click();

    // Step 3 — training context.
    await expect(client.getByRole("heading", { name: "Training context" })).toBeVisible();
    await client.getByRole("button", { name: "home", exact: true }).click();
    await next.click();

    // Step 4 — nutrition.
    await expect(client.getByRole("heading", { name: "Nutrition" })).toBeVisible();
    await client.getByRole("button", { name: "high protein" }).click();
    await next.click();

    // Step 5 — the write. This is the PATCH that used to 403.
    await expect(client.getByRole("heading", { name: "You're all set" })).toBeVisible();
    await client.getByRole("button", { name: "Finish" }).click();
  });

  await test.step("the client lands on the client surface", async () => {
    await expect(tab(client, "Train")).toBeVisible({ timeout: 30_000 });
    await expect(tab(client, "Eat")).toBeVisible();
    // …and the wizard is behind them for good: a reload must not re-gate them,
    // which only holds if `onboardingComplete` actually persisted.
    await client.reload();
    await expect(tab(client, "Train")).toBeVisible({ timeout: 30_000 });
    await expect(client.getByRole("heading", { name: /^Hi / })).toHaveCount(0);
  });

  await test.step("the coach can see what the client entered", async () => {
    // Cross-persona proof that the intake PATCH landed, not just that the client's
    // own screen advanced. The coach's client-detail Today renders the same
    // profile-completeness card, and the three fields the wizard writes directly
    // (sex, date of birth, height) must no longer be listed as missing — while a
    // field the wizard never asks for still is.
    await coach.reload();
    await expect(tab(coach, "Clients")).toBeVisible({ timeout: 30_000 });
    await tab(coach, "Clients").click();
    await coach.getByRole("button").filter({ hasText: clientName }).click();
    await expect(coach.getByText("Coach view")).toBeVisible();

    const profileCard = coach.getByRole("button").filter({ hasText: "Complete your profile" });
    await expect(profileCard).toBeVisible({ timeout: 30_000 });
    await expect(profileCard).toContainText("Target weight");
    await expect(profileCard).not.toContainText("Date of birth");
    await expect(profileCard).not.toContainText("Height");
    await expect(profileCard).not.toContainText("Gender");
  });

  await closeAll(coach, client);
});

async function closeAll(...pages: Page[]): Promise<void> {
  for (const p of pages) await p.context().close();
}
