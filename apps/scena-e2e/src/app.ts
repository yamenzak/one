/**
 * The ceremony every Scena golden path starts from.
 *
 * Sign in, create a workspace, get onto that workspace's own hostname with the
 * session intact, and call the app's API with the browser's cookie. All four are
 * setup rather than product, and repeating them in each spec would bury what the
 * spec is about.
 */

import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { latestSignInOtp, ROOT_DOMAIN, SETUP_URL, workspaceSlug, workspaceUrl } from "./env.js";

/** A run-unique address, so specs never collide and the suite re-runs with no
 *  reset. (An OTP cooldown would 429 a reused address rather than fail loudly.) */
export const uniqueEmail = (role: string): string =>
  `e2e-${role}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}@scena.test`;

/** A run-unique workspace NAME. The slug is derived from it by the app, and the
 *  suite reads back what was stored rather than re-deriving it — see `env.ts`. */
export const uniqueWorkspace = (): string => `E2E ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

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
  return browser.newContext({
    extraHTTPHeaders: { "cf-connecting-ip": `10.${o()}.${o()}.${1 + Math.floor(Math.random() * 254)}` },
  });
}

/**
 * Carry the SAME session cookie onto another `*.localhost` host.
 *
 * Not a synthesised session: the exact cookie the server issued, re-scoped. It
 * reproduces in dev what production does by itself — there the cookie's `Domain`
 * is the platform root, so one sign-in covers `setup.` and every workspace.
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

/**
 * Create a workspace from the sign-in screen and land on its own hostname.
 *
 * Returns `{ name, slug }` — the slug is the origin every later navigation
 * needs, because the tenancy is pinned by the hostname and a spec that stayed on
 * `setup.` would be driving a door with no workspace behind it.
 *
 * The form is two steps (name + email, then the code), which is the real
 * ceremony a first-time owner goes through; there is no shortcut through the API
 * because this IS the path being proved.
 */
export async function createWorkspace(
  context: BrowserContext,
  page: Page,
  email: string,
): Promise<{ name: string; slug: string }> {
  const name = uniqueWorkspace();
  await page.goto(SETUP_URL);
  await page.getByRole("button", { name: /create a workspace/i }).click();
  await page.getByLabel("Workspace name").fill(name);
  await page.getByLabel("Your email").fill(email);
  await page.getByRole("button", { name: /email me a code/i }).click();
  await page.getByLabel("Verification code").waitFor();
  await page.getByLabel("Verification code").fill(latestSignInOtp(email));
  await page.getByRole("button", { name: /verify & create workspace/i }).click();

  // The Shell is up once the fleet screen's own heading is on the page — the one
  // signal that the org was created AND set active, rather than the app falling
  // back to the create-workspace step it just came from.
  await expect(page.getByRole("heading", { name: "Screens" })).toBeVisible({ timeout: 30_000 });

  const slug = workspaceSlug(name);
  await carrySessionTo(context, SETUP_URL, `${slug}.${ROOT_DOMAIN}`);
  await page.goto(workspaceUrl(slug));
  await expect(page.getByRole("heading", { name: "Screens" })).toBeVisible({ timeout: 30_000 });
  return { name, slug };
}

/**
 * Call the app's own API with the browser's session.
 *
 * A golden path is about ONE thing, and driving twenty pieces of setup through
 * forms would make it a test of forms. What each spec drives through the UI is
 * chosen deliberately and stated in its own comments; everything else is
 * arranged through the same HTTP surface the UI uses, with the same cookie.
 *
 * ⚠️ The fetch runs INSIDE the page, not through `page.request`. Playwright's
 * API request context runs in the driver process, which does its own DNS and
 * does not see this suite's `.localhost` resolver — every call dies as
 * `ENOTFOUND <slug>.localhost`. Chromium resolves it natively, so evaluating in
 * the page both works and is more faithful: same origin, same cookie, same code
 * path the app itself takes.
 */
export async function api<T>(
  page: Page,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
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
  return (out.text ? JSON.parse(out.text) : {}) as T;
}
