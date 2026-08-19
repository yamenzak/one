/**
 * BOOTING THE WORKER THE WAY THE RUNTIME DOES.
 *
 * ⚠️ A REQUEST THAT READS NO TABLE NO LONGER WAITS FOR THE SCHEMA. `/health` and
 * the page are answered off the hostname alone and the migration is handed to the
 * runtime instead — which is what stopped a cold isolate serving a blank screen
 * for several seconds while every module was applied. Cloudflare keeps that work
 * alive through `waitUntil`; a suite calling `worker.fetch(request, env)` by hand
 * supplies nothing, so the promise is floating and a `beforeAll` that assumed the
 * tables were there raced it.
 *
 * ⚠️ SO A SUITE THAT NEEDS THE TABLES AWAITS THE SAME PROMISE, and this is the
 * one place that knows how. Written out per file it was written out four ways,
 * and three of them looked right.
 */

import worker from "../src/index.js";

export interface Warm {
  /** Hand to `worker.fetch` as its third argument. */
  readonly ctx: { waitUntil(p: Promise<unknown>): void };
  /** ⚠️ What was handed over, so a test can assert that anything WAS. */
  readonly handed: Promise<unknown>[];
  /** Await everything the worker handed over since the last call. */
  readonly settled: () => Promise<void>;
}

export const warm = (): Warm => {
  const handed: Promise<unknown>[] = [];
  return {
    ctx: { waitUntil: (p) => { handed.push(p); } },
    handed,
    settled: async () => { await Promise.all(handed.splice(0)); },
  };
};

/**
 * ⚠️ ONE PROBE, THEN WAIT. `/health` is the cheapest path that warms the boot,
 * and awaiting what it handed over is what makes the tables real before the first
 * assertion touches one.
 */
export const booted = async (env: unknown, host = "localhost"): Promise<void> => {
  const at = warm();
  await worker.fetch(new Request(`http://${host}:8080/health`), env as never, at.ctx);
  await at.settled();
};
