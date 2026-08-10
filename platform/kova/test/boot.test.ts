/**
 * ⚠️ IT BOOTS, OR NOTHING ELSE MATTERS. This is the smallest assertion that the
 * manifest composes, the schema applies and the doors resolve — and it is the
 * one that fails first when a platform change breaks an app.
 */

import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/worker.js";

const at = (origin: string, path: string) =>
  worker.fetch(new Request(`${origin}${path}`), env as never);

describe("kova answers", () => {
  /*
    ⚠️ THE PROBE ANSWERS EVERYWHERE, INCLUDING ON A HOST THAT IS NOT A DOOR. It
    is how a deployment is known to be up at all, so it runs before the host is
    classified — which means it is the wrong endpoint to prove door behaviour
    with, and this test exists partly to say so.
  */
  it("is healthy", async () => {
    expect((await at("https://kova.4dl.app", "/health")).status).toBe(200);
  });

  /*
    ⚠️ THE SETUP DOOR, because it is the one place that serves before any
    workspace exists. A slug that nobody has taken is not a door, so asking it
    for a price list is a 404 rather than an empty catalogue.
  */
  it("serves its plans to somebody with no session", async () => {
    expect((await at("https://setup.kova.4dl.app", "/api/billing.plans")).status).toBe(200);
  });

  it("refuses a workspace address nobody has taken", async () => {
    expect((await at("https://nobody.kova.4dl.app", "/api/billing.plans")).status).toBe(404);
  });

  /* ⚠️ Anything outside this app's root is not ours to answer at all. */
  it("refuses a hostname that is not a door", async () => {
    expect((await at("https://nothing.example.test", "/api/billing.plans")).status).not.toBe(200);
  });
});
