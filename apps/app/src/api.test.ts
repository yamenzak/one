/**
 * The offline-write classification. This is the one piece of the api layer with a
 * non-obvious contract: a rejected `fetch` on a log-write path means the service
 * worker has PARKED the write for replay (a deferred success), while the same
 * rejection anywhere else means nothing was written at all. Getting it backwards
 * double-counts the user's day — they retry a write that was already queued — so
 * it's worth pinning down.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, errorText, isOffline, isQueued } from "./api.js";

/** Make `fetch` fail the way a dead radio does: a rejected promise, not a 5xx. */
function networkDown() {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
}
/** Pretend a service worker is (or isn't) controlling the page. */
function withServiceWorker(controlling: boolean) {
  vi.stubGlobal("navigator", { serviceWorker: controlling ? { controller: {} } : undefined });
}
function respondWith(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))));
}

afterEach(() => vi.unstubAllGlobals());

describe("offline write classification", () => {
  it("a queued log path with a controlling worker is a DEFERRED SUCCESS", async () => {
    withServiceWorker(true);
    networkDown();
    for (const path of ["/api/logs/food", "/api/logs/water", "/api/check-ins", "/api/measurements", "/api/body-scans", "/api/supplements/sup_1/log", "/api/fasting"]) {
      const err = await api.post(path, {}).catch((e: unknown) => e);
      expect(isQueued(err), path).toBe(true);
      expect(isOffline(err), path).toBe(false);
    }
  });

  it("without a controlling worker nothing is queued, so it's a plain failure", async () => {
    // Dev server / first load before activation: claiming "saved" would be a lie.
    withServiceWorker(false);
    networkDown();
    const err = await api.post("/api/logs/food", {}).catch((e: unknown) => e);
    expect(isQueued(err)).toBe(false);
    expect(isOffline(err)).toBe(true);
  });

  it("reads and non-queued writes are plain offline failures", async () => {
    withServiceWorker(true);
    networkDown();
    for (const call of [api.get("/api/logs/food"), api.post("/api/plans", {}), api.post("/api/supplements", {})]) {
      const err = await call.catch((e: unknown) => e);
      expect(isOffline(err)).toBe(true);
      expect(isQueued(err)).toBe(false);
    }
  });

  it("a real HTTP error is never dressed up as an offline queue", async () => {
    withServiceWorker(true);
    respondWith(400, { error: "invalid body" });
    const err = await api.post("/api/logs/water", {}).catch((e: unknown) => e);
    expect(isQueued(err)).toBe(false);
    expect(isOffline(err)).toBe(false);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
    expect(errorText(err)).toBe("invalid body");
  });
});
