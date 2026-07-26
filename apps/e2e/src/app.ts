/**
 * Shared page setup + the flows every golden path starts from.
 *
 * Two pieces of app behaviour would otherwise fire in the middle of a test and
 * cover the UI, so both are switched off in an init script BEFORE the app boots:
 *
 *  1. The first-run product tour (`tour.tsx`) auto-starts 700 ms after the client
 *     surface mounts, swaps the API layer for a mock, and puts a spotlight
 *     overlay over the screen. It is gated on `localStorage`, so marking it seen
 *     is the app's own opt-out rather than a hack.
 *  2. The passkey enrolment nudge (`PasskeyPrompt.tsx`) opens a modal whenever
 *     WebAuthn is supported and the user holds no passkey — which is always true
 *     for a freshly created account in headless Chromium. Deleting
 *     `window.PublicKeyCredential` makes `passkeySupported()` false, which is the
 *     documented "this device can't do it" branch, so the modal never opens and
 *     the login screen skips conditional-UI autofill too.
 *
 * Neither is what these paths are testing, and neither is worth an app-source
 * `data-testid` to work around.
 */

import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { latestSignInOtp } from "./d1.js";

/** A run-unique email so specs never collide and can be re-run without a reset.
 *  (`otpSendGuard` also enforces a 30s per-address cooldown — reusing an address
 *  across runs would 429 rather than fail loudly.) */
export function uniqueEmail(role: string): string {
  return `e2e-${role}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}@mossa.test`;
}

/**
 * One browser context = one person on one device.
 *
 * Each gets its own `CF-Connecting-IP`, and that is not cosmetic: `otpSendGuard`
 * caps OTP sends at 20 per IP per hour (`OTP_MAX_PER_IP_PER_HOUR`) to stop an
 * email flood or roster-fill from a single source. Every sign-in in this suite
 * costs one, so a shared source burns the budget in three runs and the suite then
 * fails with `too_many_requests` — a shared global that looks exactly like
 * flakiness. Distinct per-context values keep each run independent of the last.
 * In production Cloudflare sets this header at the edge and a client cannot
 * influence it; locally nothing does, so the suite supplies it.
 */
export async function newParty(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ extraHTTPHeaders: { "cf-connecting-ip": syntheticIp() } });
}

/** A private-range address, drawn from a space big enough that two runs never
 *  collide into a shared quota. */
function syntheticIp(): string {
  const o = () => Math.floor(Math.random() * 256);
  return `10.${o()}.${o()}.${1 + Math.floor(Math.random() * 254)}`;
}

/** Install the pre-boot switches described above. Call once per page. */
export async function prepare(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // 1. Tours: already seen. Keys come from tour.tsx's `doneKey`.
    for (const id of ["app", "workout", "meal"]) {
      try {
        localStorage.setItem(`mossa.tour.v1.${id}.done`, "1");
      } catch {
        /* storage unavailable — the app treats that as "seen" anyway */
      }
    }
    // 2. WebAuthn: unsupported, so the enrolment modal never auto-opens.
    try {
      Reflect.deleteProperty(window, "PublicKeyCredential");
    } catch {
      /* non-configurable in some builds; the modal is then dismissed in-flow */
    }
  });
}

/**
 * Sign in from the login screen with an emailed OTP, reading the code out of the
 * dev worker's D1 rather than any log.
 *
 * `expect.poll` is the whole point here: the send is a fire-and-forget POST and
 * Better Auth writes the `verification` row inside a background task, so the row
 * appears a beat after the UI advances to the code screen.
 */
export async function signInWithOtp(page: Page, email: string): Promise<void> {
  await expect(page.getByRole("heading", { name: "Continue with email" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue with email" }).click();

  // A send failure must not be mistaken for a slow send: the app reports it here.
  await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible();

  const otp = await pollForOtp(email);
  await page.getByLabel("6-digit code").fill(otp);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

async function pollForOtp(email: string): Promise<string> {
  let code: string | null = null;
  await expect
    .poll(() => (code = latestSignInOtp(email)), {
      message: `no sign-in OTP appeared in the dev D1 verification table for ${email}`,
      timeout: 20_000,
      intervals: [100, 200, 300, 500],
    })
    .not.toBeNull();
  return code!;
}

/**
 * Mossa's own sign-in. It is NOT `/` any more: on the platform host `/` is an
 * explanatory gate (see `PlatformGate.tsx`), because a client of a studio who
 * landed there used to sign up under Mossa instead of under their coach. Keep this
 * in lockstep with `SIGN_IN_PATH` in the app and `APP_SIGNIN_URL` in `apps/www`.
 */
export const SIGN_IN_PATH = "/studio/sign-in";

/**
 * Enter through the platform host's front door and click through to sign-in.
 *
 * This is the gate's regression guard, and it guards two opposite failures at
 * once: the gate must NOT offer a signup form (the whole reason it exists), and it
 * must still let staff in (the installed PWA's `start_url` is `/`, so a signed-out
 * owner lands here — no visible way through would be a launch-blocking lockout).
 */
export async function throughPlatformGate(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /platform coaches run their business on/i })).toBeVisible();
  // No signup surface: no OTP card, no email field.
  await expect(page.getByRole("heading", { name: "Continue with email" })).toHaveCount(0);
  await expect(page.getByLabel("Email")).toHaveCount(0);
  // The end-user redirect — the point of the whole screen.
  await expect(page.getByText(/Use the link your coach sent you/i)).toBeVisible();
  // …and the staff escape hatch.
  await page.getByRole("link", { name: /^Sign in/ }).click();
  await expect(page).toHaveURL(new RegExp(`${SIGN_IN_PATH}$`));
  await expect(page.getByRole("heading", { name: "Continue with email" })).toBeVisible();
}

/**
 * The three-step first-run onboarding: name the studio → choose a plan → start it.
 *
 * The plan step is mandatory (the free tier is retired), and step 3 in this stack
 * takes the **degrade path**: no Stripe keys are configured, so no client secret
 * can exist. That is asserted rather than tolerated — if a mandatory paid step ever
 * hard-blocks there, nobody can create a studio on a fresh deploy, which is the
 * same class of bootstrap deadlock as the OTP one.
 */
export async function createStudio(page: Page, name: string, plan = "Light"): Promise<void> {
  await expect(page.getByRole("heading", { name: "Your studio", exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Business name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2 — the live catalog, not a hardcoded list: the plan is addressed by the
  // accessible name the API's own name + price produce.
  await expect(page.getByRole("heading", { name: "Choose a plan", exact: true })).toBeVisible();
  const option = page.getByRole("radio", { name: new RegExp(`^${plan},`) });
  await expect(option).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await option.click();
  await expect(option).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3 — Stripe is unconfigured here, so the owner is let through with the
  // plan recorded and billing pending. Nothing is charged and nothing paid is
  // granted; the studio runs on the free baseline until billing completes.
  await expect(page.getByRole("heading", { name: "Start your plan", exact: true })).toBeVisible();
  await expect(page.getByText(/Billing isn.t ready yet/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Nothing has been charged/i)).toBeVisible();
  await page.getByRole("button", { name: /Go to my studio/ }).click();

  // The studio name lands in the app bar once the context refreshes.
  await expect(page.getByRole("button", { name: "Account" })).toBeVisible({ timeout: 30_000 });
}

// (There is deliberately no `signUpOwner` wrapper any more. The owner path is now
// three distinct things worth seeing separately in a failure report — the platform
// gate, the OTP sign-in, and the three-step onboarding — so spec 01 composes
// `throughPlatformGate` + `signInWithOtp` + `createStudio` as its own test.steps.)

/**
 * A bottom-tab-bar button.
 *
 * Scoped to the bar itself on purpose: the shell renders BOTH `BottomTabs` and
 * `NavRail` (CSS decides which is visible), and screens like the coach's
 * client-detail add a segmented control with overlapping labels ("Today"), so an
 * unscoped `getByRole("button", { name: "Today" })` is genuinely ambiguous.
 */
export function tab(
  page: Page,
  name: "Today" | "Train" | "Eat" | "Wellness" | "Progress" | "Clients" | "Library" | "Business" | "Sessions",
) {
  return page.locator('[data-tour="navbar"]').getByRole("button", { name, exact: true });
}

/**
 * A bottom sheet / drawer, addressed by its title.
 *
 * Sheets are where most of this app's writes happen and their content routinely
 * repeats text that is also on the page behind them (an email address, a button
 * label). Scoping to the dialog keeps assertions unambiguous and reads as
 * "inside the New client sheet, …".
 */
export function sheet(page: Page, title: string) {
  return page.getByRole("dialog", { name: title });
}
