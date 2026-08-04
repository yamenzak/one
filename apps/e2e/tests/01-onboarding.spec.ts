/**
 * GOLDEN PATH 1 — the front door.
 *
 *   an unauthenticated visitor at the platform host `/` gets the GATE, not a
 *   signup form → clicks through to Kova's own deep sign-in
 *     → owner signs in → names their studio → picks a plan (mandatory)
 *     → billing degrades cleanly (no Stripe in this stack) → studio is live
 *     → invites a client by email
 *     → the client opens the studio's own branded door (`<slug>.<root>`, straight
 *       out of the invite link the server built) and signs in with their code
 *     → auto-links to the invited record
 *     → completes the 4-step intake wizard
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
 * first-run studio wizard.
 *
 * The front half now also guards the entry rework, and both halves of it matter:
 *  • `/` on the platform host must NOT offer a signup form (that is how clients
 *    ended up as orphan accounts under Kova instead of under their coach), and
 *  • it must still let staff through, because the installed PWA's `start_url` is
 *    `/` and a signed-out owner opening their app lands exactly there.
 * Plus: the mandatory plan step must DEGRADE when Stripe is unconfigured. If it
 * hard-blocked, nobody could create a studio on a fresh deploy — the same class of
 * bootstrap deadlock as the OTP one.
 */

import { test, expect, type Page } from "@playwright/test";
import { assertRootIsSignpost, createStudio, newParty, prepare, sheet, signInWithOtp, tab, toSetupSignIn, uniqueEmail } from "../src/app.js";

test("owner onboards, invites a client, and the client signs in and completes intake", async ({ browser }) => {
  const ownerEmail = uniqueEmail("owner");
  const clientEmail = uniqueEmail("client");
  const studio = `E2E Studio ${Date.now().toString(36)}`;
  const clientName = "Dana Test";
  /** The studio's own address, lifted out of the invite link the server built —
   *  that is where a real invited client arrives, and it is deliberately NOT the
   *  root host, which is a signpost. Set once the studio exists. */
  let inviteUrl = "";
  /** The studio's DNS label, returned by `createStudio` from the host it landed on. */
  let slug = "";

  const coachCtx = await newParty(browser);
  const coach = await coachCtx.newPage();

  await test.step("the ROOT host is a signpost, not a signup form", async () => {
    await prepare(coach);
    // Asserts both halves: no OTP form / no email field anywhere, and the end-user
    // redirect copy plus the route for someone who does want to run a studio.
    await assertRootIsSignpost(coach);
  });

  await test.step("owner signs in and completes the three-step studio onboarding", async () => {
    await toSetupSignIn(coach);
    await signInWithOtp(coach, ownerEmail);
    // Names the studio, picks Light off the LIVE plan catalog, asserts the
    // Stripe-unconfigured degrade path lets them through with billing pending, and
    // returns the slug of the host it landed on — the studio's own address.
    slug = await createStudio(coach, studio);
    // The coach surface, not the client one: the owner's own dashboard, under
    // the studio they just named.
    // "Which screen am I on" asserted from the NAV, not from a page heading. The
    // coach Today's heading became an anchor in the UI rewrite, and a heading
    // assertion had already survived one redesign by accident — the nav's
    // `aria-current` is the durable signal and it is what a screen reader uses.
    await expect(tab(coach, "Today")).toHaveAttribute("aria-current", "page");
    await expect(coach.getByText(studio)).toBeVisible();
    await expect(tab(coach, "Clients")).toBeVisible();
  });

  await test.step("the chosen plan is recorded as pending, not granted", async () => {
    // The safety property behind the degrade path: an owner who never entered a
    // card must NOT be holding the plan they picked. `GET /api/billing` is the
    // authority — the studio sits on the free baseline with Light pending.
    // Read it the way the app does: a same-origin fetch from the studio's own page.
    // `page.request` would resolve DNS in Playwright's driver process, which cannot
    // see `.localhost` on every host — see src/provision.ts.
    const body = await coach.evaluate(async () => {
      const res = await fetch("/api/billing");
      if (!res.ok) throw new Error(`GET /api/billing -> ${res.status}`);
      return (await res.json()) as { subscription: { planId: string; pendingPlanId: string | null } };
    });
    expect(body.subscription.pendingPlanId).toBe("light");
    expect(body.subscription.planId).toBe("free");
  });

  await test.step("owner invites a client by email", async () => {
    await tab(coach, "Clients").click();
    await expect(tab(coach, "Clients")).toHaveAttribute("aria-current", "page");
    await expect(coach.getByText("No clients yet")).toBeVisible();

    // "Add client" is now unambiguous by design: it names the action cluster's
    // opener, and the sheet's submit is "Send invite" — which is also the truer
    // verb, since it creates the client AND emails them a sign-in link. Two
    // controls sharing one accessible name is obvious by eye and ambiguous by
    // ear, so the rename fixed the product, not the test.
    await coach.getByRole("button", { name: "Add client", exact: true }).click();
    const form = sheet(coach, "New client");
    await form.getByLabel("Email").fill(clientEmail);
    await form.getByLabel("Name (optional)").fill(clientName);
    await form.getByRole("button", { name: "Send invite" }).click();

    // The invite sheet proves the server built the branded deep-link.
    //
    // It must NOT assert that the email went out, and that is not a compromise —
    // this spec deliberately walks the Stripe-unconfigured degrade path, so its
    // studio sits on the free baseline, and the free baseline grants zero credits
    // (`FREE_ENTITLEMENTS.aiCredits.monthlyGrant`). An email costs one
    // (`email.credits_per_email`), so the send is refused with `no_credits` and the
    // sheet shows its recovery instead: the link, for the coach to hand over.
    //
    // Asserting that recovery is the stronger test. It pins the contract that
    // matters — a studio that cannot email must still be able to onboard a client —
    // and it is the state a real owner is in between creating a studio and finishing
    // billing. (Worth knowing as a product fact, not just a test detail: no invite
    // email leaves a studio until its subscription is live.)
    const invited = sheet(coach, "Client invited");
    await expect(invited).toBeVisible();
    await expect(invited.getByText(/invite email didn.t go out|out of credits/i)).toBeVisible();
    const link = invited.getByText(/\?invite=/);
    await expect(link).toBeVisible();
    // The link the server built must point at the STUDIO'S OWN HOST — that is the
    // whole white-label promise, and the regression it guards is a link back to the
    // shared root, which is now a signpost that would serve an invited client
    // nothing. The hostname is asserted; the origin is rewritten to the local port
    // because the server builds an https link against the deployed root.
    const url = new URL((await link.textContent())!.trim());
    expect(url.hostname.split(".")[0]).toBe(slug);
    expect(url.pathname).toBe("/");
    inviteUrl = `http://${slug}.localhost:8787/${url.search}`;
    await invited.getByRole("button", { name: "Go to client" }).click();

    // Coach view of the new client.
    await expect(coach.locator("[data-coach-view]")).toBeVisible();
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

  await test.step("the invited client opens their studio's branded door and signs in", async () => {
    await prepare(client);
    // Straight from the invite link, onto the studio's own hostname. The tenancy is
    // pinned by that host, so the branded login below is not merely wearing the
    // studio's brand — it can only ever sign this person into THIS studio.
    await client.goto(inviteUrl);
    await expect(client.getByRole("heading", { name: studio, exact: true })).toBeVisible();
    await signInWithOtp(client, clientEmail);
  });

  await test.step("the client is auto-linked and gets the intake wizard, not 'create a studio'", async () => {
    // The regression that mattered: an unlinked invitee saw the business wizard.
    // Anchored on the intake's first step heading and the ABSENCE of the studio
    // wizard's, because both are `StepHeader` h1s and only the words differ.
    await expect(client.getByRole("heading", { name: "About you" })).toBeVisible({ timeout: 30_000 });
    await expect(client.getByRole("heading", { name: "Your studio", exact: true })).toHaveCount(0);
    await expect(client.getByRole("heading", { name: "Choose a plan" })).toHaveCount(0);
  });

  await test.step("the client completes all four intake steps", async () => {
    // Every pick-one question is a `ChoiceGroup` — a real radiogroup — so these
    // are radios, not buttons. That is the point of the component: a chip row
    // announces as N unrelated buttons and looks like a multi-select.
    const next = client.getByRole("button", { name: "Continue" });
    // Step 1 — basics. Continue stays disabled until sex + DOB + a sane height.
    await expect(next).toBeDisabled();
    await client.getByRole("radio", { name: "Female" }).click();
    await client.getByLabel("Date of birth").fill("1994-06-15");
    await client.getByLabel("Height (cm)").fill("168");
    await expect(next).toBeEnabled();
    await next.click();

    // Step 2 — goal.
    await expect(client.getByRole("heading", { name: "Your goal" })).toBeVisible();
    await client.getByRole("radio", { name: /^Build muscle/ }).click();
    await next.click();

    // Step 3 — how you train.
    await expect(client.getByRole("heading", { name: "How you train" })).toBeVisible();
    await client.getByRole("radio", { name: /^At home/ }).click();
    await next.click();

    // Step 4 — how you eat, and the write. This is the PATCH that used to 403.
    // There is no "you're all set" step any more: the confirmation belongs after
    // the write, so the last question is the last step.
    await expect(client.getByRole("heading", { name: "How you eat" })).toBeVisible();
    await client.getByRole("radio", { name: /^High protein/ }).click();
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
    await expect(coach.locator("[data-coach-view]")).toBeVisible();

    // The gap list is a coach-only affordance now — the client's own version of
    // this card is a single row, because they are one tap from the form and do
    // not need it previewed. The coach cannot open that form, so they still get
    // the field names: "ask them to finish their profile" is useless next to
    // "ask them for their target weight". `data-profile-gaps` marks the list.
    const profileGaps = coach.locator("[data-profile-gaps]");
    await expect(profileGaps).toBeVisible({ timeout: 30_000 });
    await expect(profileGaps).toContainText("Target weight");
    await expect(profileGaps).not.toContainText("Date of birth");
    await expect(profileGaps).not.toContainText("Height");
    await expect(profileGaps).not.toContainText("Gender");

    // The wizard's other three answers must count too. These were sent only as
    // `intake` — free-form AI context — while profileGaps reads the typed
    // `preferences` store, so a client answered their goal, their activity level
    // and where they train, and their coach was still told all three were
    // missing. Onboarding now writes both.
    await expect(profileGaps).not.toContainText("Primary goal");
    await expect(profileGaps).not.toContainText("Activity level");
    await expect(profileGaps).not.toContainText("Where you train");
  });

  await closeAll(coach, client);
});

async function closeAll(...pages: Page[]): Promise<void> {
  for (const p of pages) await p.context().close();
}
