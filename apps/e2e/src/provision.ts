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
 * The cookie jar is the browser context's own (`context.request` shares it), so
 * a `page.goto("/")` afterwards is already signed in. No cookie is synthesised
 * and no auth is stubbed: if sign-in breaks, these fixtures break loudly.
 *
 * Better Auth's CSRF check compares the `Origin` header against the request's own
 * origin, and `APIRequestContext` sends none by default, so every call passes it
 * explicitly — the same header the browser would send.
 */

import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { latestSignInOtp } from "./d1.js";
import { newParty, prepare, uniqueEmail } from "./app.js";
import { APP_URL } from "./env.js";

const ORIGIN = { origin: APP_URL };

async function post<T>(api: APIRequestContext, path: string, data: unknown): Promise<T> {
  const res = await api.post(path, { data, headers: ORIGIN });
  if (!res.ok()) throw new Error(`POST ${path} → ${res.status()} ${await res.text()}`);
  return (await res.json()) as T;
}

async function patch<T>(api: APIRequestContext, path: string, data: unknown): Promise<T> {
  const res = await api.patch(path, { data, headers: ORIGIN });
  if (!res.ok()) throw new Error(`PATCH ${path} → ${res.status()} ${await res.text()}`);
  return (await res.json()) as T;
}

async function get<T>(api: APIRequestContext, path: string): Promise<T> {
  const res = await api.get(path, { headers: ORIGIN });
  if (!res.ok()) throw new Error(`GET ${path} → ${res.status()} ${await res.text()}`);
  return (await res.json()) as T;
}

/** The passwordless ceremony: request a code, read it from the dev D1, verify. */
export async function apiSignIn(api: APIRequestContext, email: string): Promise<void> {
  await post(api, "/api/auth/email-otp/send-verification-otp", { email, type: "sign-in" });
  let otp: string | null = null;
  await expect
    .poll(() => (otp = latestSignInOtp(email)), {
      message: `no sign-in OTP reached the dev D1 verification table for ${email}`,
      timeout: 20_000,
      intervals: [100, 200, 300, 500],
    })
    .not.toBeNull();
  await post(api, "/api/auth/sign-in/email-otp", { email, otp });
}

export interface Studio {
  context: BrowserContext;
  page: Page;
  api: APIRequestContext;
  email: string;
  tenantId: string;
  name: string;
}

/** A brand-new owner with a brand-new studio, in their own browser context. */
export async function provisionStudio(browser: Browser, name: string): Promise<Studio> {
  const context = await newParty(browser);
  const api = context.request;
  const email = uniqueEmail("owner");
  await apiSignIn(api, email);
  await post(api, "/api/auth/organization/create", { name, slug: slugify(name) });
  const ctx = await get<{ active: { tenantId: string } | null }>(api, "/api/context");
  if (!ctx.active) throw new Error("owner has no active tenancy after creating the studio");
  const page = await context.newPage();
  await prepare(page);
  return { context, page, api, email, tenantId: ctx.active.tenantId, name };
}

export interface Client {
  context: BrowserContext;
  page: Page;
  api: APIRequestContext;
  email: string;
  id: string;
  name: string;
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
  const created = await post<{ client: { id: string } }>(studio.api, "/api/clients", { email, displayName: name });
  const id = created.client.id;
  await patch(studio.api, `/api/clients/${id}`, {
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

  const context = await newParty(browser);
  await apiSignIn(context.request, email);
  const page = await context.newPage();
  await prepare(page);
  return { context, page, api: context.request, email, id, name };
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
