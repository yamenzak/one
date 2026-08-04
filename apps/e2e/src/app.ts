/**
 * Shared page setup + the flows every golden path starts from.
 *
 * One piece of app behaviour would otherwise fire in the middle of a test and
 * cover the UI, so it is switched off in an init script BEFORE the app boots:
 *
 *  1. The passkey enrolment nudge (`PasskeyPrompt.tsx`) opens a modal whenever
 *     WebAuthn is supported and the user holds no passkey — which is always true
 *     for a freshly created account in headless Chromium. Deleting
 *     `window.PublicKeyCredential` makes `passkeySupported()` false, which is the
 *     documented "this device can't do it" branch, so the modal never opens and
 *     the login screen skips conditional-UI autofill too.
 *
 * It is not what these paths are testing, and it is not worth an app-source
 * `data-testid` to work around.
 */

import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { latestSignInOtp } from "./d1.js";
import { ROOT_DOMAIN, ROOT_URL, SETUP_URL, studioUrl } from "./env.js";

/**
 * Carry the SAME session cookie onto another `*.localhost` host.
 *
 * Not a synthesised session and not a stubbed auth: it is the exact cookie the
 * server issued, re-scoped. It exists to reproduce in dev what production does by
 * itself — there the cookie's `Domain` is the platform root, so one sign-in covers
 * `setup.kova.4dl.app` and every `<slug>.kova.4dl.app`. Locally that is impossible:
 * a `Domain` with no embedded dot is rejected by browsers (Chromium requires an
 * exact host match for dot-less domains), so `cookieDomainFor` returns null for
 * loopback and each `*.localhost` gets its own jar.
 *
 * Without this the suite would have to sign the same address in twice within
 * seconds, which `otpSendGuard`'s 30-second per-address cooldown correctly refuses
 * with a 429 — the rate limit doing its job, not a bug to work around by weakening
 * it. Copying the cookie keeps the control intact and still proves sign-in works,
 * because the cookie being copied was minted by a real OTP ceremony.
 */
export async function carrySessionTo(context: BrowserContext, fromUrl: string, toHost: string): Promise<void> {
  const cookies = await context.cookies(fromUrl);
  if (!cookies.length) throw new Error(`no cookies on ${fromUrl} to carry to ${toHost}`);
  await context.addCookies(cookies.map((c) => ({ ...c, domain: toHost })));
}

/** A run-unique email so specs never collide and can be re-run without a reset.
 *  (`otpSendGuard` also enforces a 30s per-address cooldown — reusing an address
 *  across runs would 429 rather than fail loudly.) */
export function uniqueEmail(role: string): string {
  // The ENTROPY GOES IN THE DOMAIN, and that is a screenshot rule rather than a
  // test one (§16: no placeholder ever reaches an image). Staff rows, the invite
  // sheet and the account menu all print this address, and
  // `e2e-owner-msf65q8g-bishe@kova.test` truncated mid-hash in every one of them
  // — a photograph of the product that says "this is a test fixture".
  // `<role>@<tag>.kova.test` reads as an address, and `.test` is the reserved
  // TLD, so it is still obviously not a real inbox.
  const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `${role}@${tag}.kova.test`;
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
    // WebAuthn: unsupported, so the enrolment modal never auto-opens.
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
  // Anchored on the CONTROLS, not the headings. After the UI rewrite the sign-in
  // screen's largest text is the studio's own name, so a heading assertion here
  // would be asserting the tenant's branding rather than that the form arrived.
  await expect(page.getByLabel("Email")).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /Email me a code/i }).click();

  // A send failure must not be mistaken for a slow send: the code field only
  // appears once the server accepted the send, so this is the real gate.
  await expect(page.getByLabel("Your code")).toBeVisible();

  const otp = await pollForOtp(email);
  await page.getByLabel("Your code").fill(otp);
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
 * The owner sign-in path, on the SETUP door.
 *
 * `setup.<root>` is the only place a studio is created, so it is also where an
 * owner signs in to create or resume one. Kept as a constant because it is a public
 * URL in shipped marketing HTML — keep it in lockstep with `SIGN_IN_PATH` in the
 * app and `APP_SIGNIN_URL` in `apps/www`.
 */
export const SIGN_IN_PATH = "/studio/sign-in";

/**
 * The ROOT door is a signpost — not an app, and not a signup surface.
 *
 * This guards the property the whole host taxonomy exists for. A client of a studio
 * who lands on the bare root used to be shown the same OTP form as everyone else
 * and signed up under *Kova* rather than under their coach: an orphan account, in no
 * tenancy, with nothing to tell them anything had gone wrong. So the assertion is
 * two-sided — the root must explain where to go, and must offer no way to sign in.
 */
export async function assertRootIsSignpost(page: Page): Promise<void> {
  await page.goto(`${ROOT_URL}/`);
  // The screen's anchor is the ADDRESS — that is what it is about, and after the
  // UI rewrite it is the largest thing on the page rather than a heading. Assert
  // the explanation by text, not by role, so a future re-layout that keeps the
  // meaning does not fail here for the wrong reason.
  await expect(page.getByText(/Every studio has its own address/i)).toBeVisible();
  // No signup surface: no email field and no way to request a code, anywhere on
  // the page. Asserted on the CONTROLS rather than on a heading — the sign-in
  // screen's headings have changed once already, and a copy-shaped assertion
  // that silently stops discriminating is worse than no assertion.
  await expect(page.getByLabel("Email")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /code/i })).toHaveCount(0);
  // The end-user redirect — the point of the whole screen. Asserted on the row's
  // own heading rather than its supporting line: the heading is the promise
  // ("this screen has something for a client of a studio"), the sub-line is copy
  // that will keep being tuned.
  await expect(page.getByText(/Training with a coach\?/i)).toBeVisible();
  await expect(page.getByText(/link they sent you/i)).toBeVisible();
  // …and the route for someone who wants to run a studio.
  await expect(page.getByRole("link", { name: /Set up your studio/i })).toBeVisible();
}

/** Open the setup door's sign-in. */
export async function toSetupSignIn(page: Page): Promise<void> {
  await page.goto(`${SETUP_URL}${SIGN_IN_PATH}`);
  await expect(page.getByLabel("Email")).toBeVisible();
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
export async function createStudio(page: Page, name: string, plan = "Light"): Promise<string> {
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

  // "Go to my studio" hands the owner their studio's own ADDRESS, so the session has
  // to exist there before the click. In production it already does — one cookie for
  // the whole root. In dev it cannot, so carry it across first; see `carrySessionTo`.
  const created = await page.evaluate(async () => {
    const res = await fetch("/api/context");
    return (await res.json()) as { active: { tenantSlug: string } | null };
  });
  const createdSlug = created.active?.tenantSlug;
  if (!createdSlug) throw new Error("the studio was created but /api/context reports no active tenancy");
  await carrySessionTo(page.context(), SETUP_URL, `${createdSlug}.${ROOT_DOMAIN}`);

  await page.getByRole("button", { name: /Go to my studio/ }).click();

  // Finishing hands the owner their studio's own ADDRESS, not `/` on the setup
  // door — that is a cross-origin navigation to `<slug>.<root>`, and it is the
  // thing an owner bookmarks and hands to clients. Asserting the hostname here is
  // what would catch a regression back to an in-app `nav("/")`, which would leave
  // the owner on the one host where their studio is not pinned.
  await expect(page).toHaveURL(new RegExp(`^http://[a-z0-9-]+\\.${ROOT_DOMAIN}:`), { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Account" })).toBeVisible({ timeout: 30_000 });
  const slug = new URL(page.url()).hostname.split(".")[0]!;
  expect(slug, "the studio landed on a real subdomain").not.toBe("setup");
  return slug;
}

// (There is deliberately no `signUpOwner` wrapper. The owner path is four distinct
// things worth seeing separately in a failure report — the root signpost, the setup
// door's sign-in, the OTP ceremony and the three-step onboarding — so spec 01
// composes them as its own test.steps.)

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
  return page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name, exact: true });
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
