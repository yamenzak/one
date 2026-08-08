/**
 * THE TRANSPORT, and the four decisions it makes.
 *
 * `apiFetch` exists because Scena had no way to notice an expired session: every
 * call in `api.ts` was a bare `fetch`, so a dead cookie left the Shell mounted,
 * every screen showing whatever empty state its failed poll produced, and every
 * save failing into a toast. An expired session was indistinguishable from a
 * deleted workspace.
 *
 * `scripts/scena-fetch-chokepoint.test.mjs` checks that every call site goes
 * through it — a fact about the SOURCE. This checks what it actually does, which
 * that cannot: three of the four cases below are about a request that must NOT
 * fire the hook, and each of those is a bug you would only find by having your
 * browser tab spin.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, apiError, setUnauthorizedHandler } from "./api.js";

const respond = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fired: number;

beforeEach(() => {
  fired = 0;
  setUnauthorizedHandler(() => { fired++; });
});
afterEach(() => {
  setUnauthorizedHandler(null);
  vi.unstubAllGlobals();
});

const stub = (res: Response) => vi.stubGlobal("fetch", vi.fn(async () => res));

describe("apiFetch", () => {
  it("reports a 401 so the app can re-read the session", async () => {
    stub(respond(401, { error: "unauthorized" }));
    await apiFetch("/api/screens");
    expect(fired).toBe(1);
  });

  it("passes the response through untouched — it does not throw", async () => {
    stub(respond(402, { error: "plan limit" }));
    const res = await apiFetch("/api/screens", { method: "POST" });
    // The call sites each decide what a failure means; changing that alongside
    // the transport would have made the migration a rewrite instead of a rename.
    expect(res.status).toBe(402);
    expect(fired).toBe(0);
  });

  it("stays silent on a 403 — a refused ROLE is not an expired session", async () => {
    stub(respond(403));
    await apiFetch("/api/members/x");
    expect(fired).toBe(0);
  });

  /*
    ⚠️ Better Auth self-reports 401 for a wrong OTP. Reporting it would reload
    the session on the login screen on every mistyped code.
  */
  it("stays silent on the auth lane", async () => {
    stub(respond(401));
    await apiFetch("/api/auth/email-otp/verify-email", { method: "POST" });
    expect(fired).toBe(0);
  });

  /*
    ⚠️ THE RE-ENTRANCY GUARD, and the reason it is not merely defensive: the
    handler's job is to re-read the session, so it calls `/api/me`, which comes
    back through here. Today Scena's route guard makes that route public and it
    answers 200, so the loop does not happen — one line in `route-guard.ts` away
    from a browser tab spinning until it is closed.
  */
  it("stays silent on the session probe, whatever the server answers", async () => {
    stub(respond(401));
    await apiFetch("/api/me");
    expect(fired).toBe(0);
    // Including when a base URL is configured, because the exemption matches the
    // PATH rather than the string.
    await apiFetch("https://scena.example/api/me");
    expect(fired).toBe(0);
  });
});

describe("apiError", () => {
  it("prefers the server's message over the status", async () => {
    const e = await apiError(respond(402, { error: "Your plan allows one screen." }), "save failed");
    expect(e.message).toBe("Your plan allows one screen.");
  });

  it("falls back to the caller's sentence and the code on a non-JSON body", async () => {
    const e = await apiError(new Response("<html>", { status: 500 }), "save failed");
    expect(e.message).toBe("save failed (500)");
  });

  /*
    The status rides along. `@4dl/app-kit`'s `ApiError` carries it and the exit
    cards branch on it (409 = "close your workspace first"); a Scena caller had
    nothing but the message text to match on, which is a translation away from
    breaking.
  */
  it("carries the status, so a caller can tell 402 from 403", async () => {
    const e = await apiError(respond(409, { error: "owner" }), "failed");
    expect((e as Error & { status?: number }).status).toBe(409);
  });
});
