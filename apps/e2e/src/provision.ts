/**
 * Fixtures: get a studio, a coach session and an onboarded client into place
 * over HTTP, so a spec spends its time on the path it is actually guarding.
 *
 * Spec 01 drives coach signup → invite → client sign-in → intake entirely
 * through the UI, because that path IS the thing under test. Specs 02 and 03
 * would otherwise repeat all of it before reaching their first meaningful click.
 * They provision through the API instead — through the app's own endpoints, with
 * the same OTP ceremony, so the sessions are real ones.
 *
 * Every call is a same-origin `fetch` issued from the persona's own page, so the
 * cookie jar and the `Origin` header are the browser's real ones. No cookie is
 * synthesised and no auth is stubbed: if sign-in breaks, these fixtures break
 * loudly. See `call` below for why it is not `APIRequestContext`.
 */

import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { latestSignInOtp } from "./d1.js";
import { carrySessionTo, newParty, prepare, uniqueEmail } from "./app.js";
import { ROOT_DOMAIN, SETUP_URL, studioUrl } from "./env.js";

/**
 * Fixture calls go through the PAGE, not through `APIRequestContext`.
 *
 * Two reasons, and the second is the one that forced it:
 *
 *  1. **Same-origin is the honest shape.** A `fetch` issued from a document on
 *     `<slug>.localhost:8787` is exactly what the app itself does: the browser
 *     supplies the `Origin` header Better Auth's CSRF check wants, and the cookie
 *     jar is the real one. `APIRequestContext` sends no Origin at all, so every
 *     call had to hand-forge one.
 *  2. **`APIRequestContext` resolves DNS in Playwright's driver process**, which
 *     this suite cannot patch — so on a container that does not implement RFC 6761
 *     `.localhost` (see resolve-localhost.ts) every fixture call died with
 *     `getaddrinfo ENOTFOUND setup.localhost`, while the browser, which resolves
 *     `.localhost` internally, was perfectly happy. Going through the page removes
 *     the second resolver from the picture entirely.
 *
 * `hop` parks the page on the target origin first — cheaply, on `/health`, which is
 * dependency-free JSON and boots no app — so the fetch that follows is same-origin.
 * Crossing origins matters: a page on `setup.` fetching `<slug>.` would be a CORS
 * request, and the worker sends no CORS headers (by design — production is
 * same-origin everywhere).
 */
async function hop(page: Page, base: string): Promise<void> {
  const current = (() => {
    try { return new URL(page.url()).origin; } catch { return ""; }
  })();
  if (current !== base) await page.goto(`${base}/health`);
}

async function call<T>(page: Page, base: string, method: string, path: string, data?: unknown): Promise<T> {
  await hop(page, base);
  const out = await page.evaluate(
    async ([m, p, body]: [string, string, string | null]) => {
      const res = await fetch(p, {
        method: m,
        headers: body === null ? {} : { "content-type": "application/json" },
        body: body === null ? undefined : body,
      });
      return { ok: res.ok, status: res.status, text: await res.text() };
    },
    [method, path, data === undefined ? null : JSON.stringify(data)] as [string, string, string | null],
  );
  if (!out.ok) throw new Error(`${method} ${base}${path} -> ${out.status} ${out.text}`);
  return (out.text ? JSON.parse(out.text) : null) as T;
}

const post = <T>(page: Page, base: string, path: string, data: unknown): Promise<T> => call<T>(page, base, "POST", path, data);
const patch = <T>(page: Page, base: string, path: string, data: unknown): Promise<T> => call<T>(page, base, "PATCH", path, data);
const get = <T>(page: Page, base: string, path: string): Promise<T> => call<T>(page, base, "GET", path);

/** The passwordless ceremony: request a code, read it from the dev D1, verify. */
export async function apiSignIn(page: Page, email: string, base = SETUP_URL): Promise<void> {
  await post(page, base, "/api/auth/email-otp/send-verification-otp", { email, type: "sign-in" });
  let otp: string | null = null;
  await expect
    .poll(() => (otp = latestSignInOtp(email)), {
      message: `no sign-in OTP reached the dev D1 verification table for ${email}`,
      timeout: 20_000,
      intervals: [100, 200, 300, 500],
    })
    .not.toBeNull();
  await post(page, base, "/api/auth/sign-in/email-otp", { email, otp });
}

export interface Studio {
  context: BrowserContext;
  page: Page;
  email: string;
  tenantId: string;
  name: string;
  /** The studio's DNS label — its address is `<slug>.<root>`. */
  slug: string;
  /** The studio's own origin. Every coach call and page visit uses it. */
  base: string;
}

/**
 * A brand-new owner with a brand-new studio, in their own browser context.
 *
 * ONE sign-in — on the setup door, where a studio is created — and then the same
 * real cookie is carried onto the studio's own host. Production needs no such step
 * (the cookie's Domain is the platform root, so it covers both); dev cannot widen a
 * dot-less domain. Signing the same address in twice instead would trip
 * `otpSendGuard`'s 30-second per-address cooldown with a 429 — the rate limit
 * working correctly. See `carrySessionTo`.
 */
export async function provisionStudio(browser: Browser, name: string): Promise<Studio> {
  const context = await newParty(browser);
  const email = uniqueEmail("owner");
  const page = await context.newPage();
  await prepare(page);
  await apiSignIn(page, email);
  const org = await post<{ id: string; slug: string }>(page, SETUP_URL, "/api/auth/organization/create", { name, slug: slugify(name) });
  // Trust the slug the server stored, not the one proposed: it is validated against
  // DNS-label rules and a reserved-label list, and it is the studio's address.
  const slug = org.slug;
  const base = studioUrl(slug);
  await carrySessionTo(context, SETUP_URL, `${slug}.${ROOT_DOMAIN}`);
  const ctx = await get<{ active: { tenantId: string } | null }>(page, base, "/api/context");
  if (!ctx.active) throw new Error(`owner has no active tenancy on ${base} after creating the studio`);
  return { context, page, email, tenantId: ctx.active.tenantId, name, slug, base };
}

export interface Client {
  context: BrowserContext;
  page: Page;
  email: string;
  id: string;
  name: string;
  /** The studio origin this client belongs to — where their app is served. */
  base: string;
}

/**
 * A client on `studio`'s roster who has finished intake and is signed in on their
 * own browser context — the state every coaching path starts from.
 *
 * The intake write goes through the coach's session (`PATCH /api/clients/:id`),
 * which is a legitimate coach capability and keeps the fixture independent of the
 * client-persona permission surface that spec 01 exists to guard.
 */
export async function provisionClient(browser: Browser, studio: Studio, name: string): Promise<Client> {
  const email = uniqueEmail("client");
  const created = await post<{ client: { id: string } }>(studio.page, studio.base, "/api/clients", { email, displayName: name });
  const id = created.client.id;
  await patch(studio.page, studio.base, `/api/clients/${id}`, {
    gender: "male",
    dateOfBirth: "1992-03-08",
    heightCm: 180,
    intake: {
      primaryGoal: "build_muscle",
      workoutLocation: "gym",
      experienceLevel: "intermediate",
      activityLevel: "moderate",
      dietaryApproach: "balanced",
      availableDays: ["Mon", "Wed", "Fri"],
    },
    onboardingComplete: true,
  });

  // The client signs in at THEIR STUDIO'S door — the only door that would ever let
  // them in (`setup.` creates studios, and the root refuses to send a code at all),
  // and the one that pins their tenancy. A fresh address, so no cooldown and no
  // cookie to carry.
  const context = await newParty(browser);
  const page = await context.newPage();
  await prepare(page);
  await apiSignIn(page, email, studio.base);
  return { context, page, email, id, name, base: studio.base };
}

/**
 * Create a tenant-owned exercise, so a spec never depends on the platform's STARTER
 * LIBRARY being installed.
 *
 * That library is opt-in (an operator button — content nobody asked for and could
 * not refuse was removed), so a clean checkout has an empty exercise catalog and any
 * spec reaching for a seeded name fails on a missing button with no hint that the
 * cause is absent seed content. A studio's own exercise is also the more honest
 * fixture: it is what a real coach has.
 */
export async function seedExercise(studio: Studio, name: string): Promise<string> {
  const created = await post<{ id: string }>(studio.page, studio.base, "/api/exercises", {
    name,
    category: "strength",
    muscleGroups: ["quadriceps"],
    equipment: ["barbell"],
    visibility: "tenant",
  });
  return created.id;
}

/** Tear down both personas' contexts. */
export async function teardown(...parties: { context: BrowserContext }[]): Promise<void> {
  for (const p of parties) await p.context.close();
}

const slugify = (s: string): string =>
  `${s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)}-${Date.now().toString(36)}`;
