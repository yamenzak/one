/**
 * The flows every Tessa golden path starts from.
 *
 * Sign in, create a centre, and get onto that centre's own hostname with the
 * session intact. All three are ceremony rather than product, and repeating them
 * in each spec would bury what the spec is actually about.
 */

import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { centreUrl, latestSignInOtp, ROOT_DOMAIN, SETUP_URL } from "./env.js";

/** A run-unique address, so specs never collide and the suite re-runs with no
 *  reset. (An OTP cooldown would 429 a reused address rather than fail loudly.) */
export const uniqueEmail = (role: string): string =>
  `e2e-${role}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}@tessa.test`;

/**
 * One browser context = one person on one device, each with its own
 * `CF-Connecting-IP`.
 *
 * Not cosmetic: the OTP guard caps sends per IP per hour to stop an email flood
 * from one source. Every sign-in here costs one, so a shared source burns the
 * budget after a few runs and the suite then fails with `too_many_requests` — a
 * shared global that looks exactly like flakiness. In production Cloudflare sets
 * this header at the edge and a client cannot influence it; locally nothing
 * does, so the suite supplies it.
 */
export async function newParty(browser: Browser): Promise<BrowserContext> {
  const o = (): number => Math.floor(Math.random() * 256);
  return browser.newContext({ extraHTTPHeaders: { "cf-connecting-ip": `10.${o()}.${o()}.${1 + Math.floor(Math.random() * 254)}` } });
}

/**
 * Carry the SAME session cookie onto another `*.localhost` host.
 *
 * Not a synthesised session: the exact cookie the server issued, re-scoped. It
 * reproduces in dev what production does by itself — there the cookie's `Domain`
 * is the platform root, so one sign-in covers `setup.` and every centre.
 * Locally that is impossible, because a `Domain` with no embedded dot is
 * rejected by browsers, so each `*.localhost` keeps its own jar.
 *
 * The alternative is signing the same address in twice within seconds, which the
 * OTP cooldown correctly refuses. Copying keeps that control intact and still
 * proves sign-in works, because the cookie being copied came from a real
 * ceremony.
 */
export async function carrySessionTo(context: BrowserContext, fromUrl: string, toHost: string): Promise<void> {
  const cookies = await context.cookies(fromUrl);
  if (!cookies.length) throw new Error(`no cookies on ${fromUrl} to carry to ${toHost}`);
  await context.addCookies(cookies.map((c) => ({ name: c.name, value: c.value, domain: toHost, path: "/" })));
}

/** Sign in on the setup door with a fresh address. */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto(SETUP_URL);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Code").waitFor();
  await page.getByLabel("Code").fill(latestSignInOtp(email));
  await page.getByRole("button", { name: "Sign in" }).click();
}

/**
 * Create a centre and land on its own hostname, signed in.
 *
 * Returns the slug, which is the origin every later navigation needs — the
 * tenancy is pinned by the hostname, so a spec that stayed on `setup.` would be
 * testing a door with no centre behind it.
 */
export async function createCentre(context: BrowserContext, page: Page, name = "Praxis Nord"): Promise<string> {
  const slug = `e2e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  await page.getByLabel("Centre name").waitFor();
  await page.getByLabel("Centre name").fill(name);
  await page.getByLabel("Address").fill(slug);
  await page.getByRole("button", { name: "Create it" }).click();
  await page.waitForURL(new RegExp(`${slug}\\.`), { timeout: 30_000 }).catch(() => undefined);
  await carrySessionTo(context, SETUP_URL, `${slug}.${ROOT_DOMAIN}`);
  await page.goto(centreUrl(slug));
  // The Shell is up once the centre's own name is in the bar — the one signal
  // that the tenancy resolved rather than the app falling back to a door screen.
  await expect(page.getByText(name)).toBeVisible({ timeout: 20_000 });
  return slug;
}

/**
 * Call the app's own API with the browser's session.
 *
 * The golden path below is about the RECALL, and driving twenty pieces of setup
 * through forms would make it a test of forms. What each spec drives through the
 * UI is chosen deliberately and stated in its own comments; everything else is
 * arranged through the same HTTP surface the UI uses, with the same cookie.
 */
export async function api<T>(page: Page, method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
  /**
   * Run the fetch INSIDE the page, not through `page.request`.
   *
   * Playwright's API request context runs in the driver process, which does its
   * own DNS and does not see this suite's `.localhost` resolver — every call
   * dies as `ENOTFOUND <slug>.localhost`. Chromium resolves it natively (and is
   * pinned to by `--host-resolver-rules` anyway), so evaluating in the page both
   * works and is more faithful: same origin, same cookie, same code path the app
   * itself takes.
   */
  const out = await page.evaluate(
    async ([m, p, b]) => {
      const res = await fetch(p as string, {
        method: m as string,
        headers: { "content-type": "application/json" },
        body: b === null ? undefined : (b as string),
      });
      const text = await res.text();
      return { ok: res.ok, status: res.status, text };
    },
    [method, path, body === undefined ? null : JSON.stringify(body)] as const,
  );
  if (!out.ok) throw new Error(`${method} ${path} → ${out.status} ${out.text}`);
  return JSON.parse(out.text) as T;
}
