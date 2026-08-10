/**
 * A DEPLOYMENT WITH NOTHING SHARED — which is what a self-host is, and what
 * `hello` is here to be.
 *
 * ⚠️ UNBOUND MUST CHANGE NOTHING. `sharedConfigBinding` is what makes one Stripe
 * key serve every product; a deployment with a single app has nothing to share
 * with, and the version of that which fails is the one where a console offers a
 * shared scope that quietly writes somewhere else — a key that works here and
 * nowhere, discovered by the second app.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker.js";
import { post, SETUP, signIn } from "./session.js";

const ORIGIN = "https://alone.hello.4dl.app";
const ADMIN = "https://admin.hello.4dl.app";

const at = (origin: string) => (cookie: string) => async (path: string, body?: unknown) => {
  const res = await worker.fetch(
    new Request(`${origin}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, never> };
};

let operator: ReturnType<ReturnType<typeof at>>;
let member: ReturnType<ReturnType<typeof at>>;

beforeAll(async () => {
  const staff = await signIn("alone@example.test", SETUP);
  await post(SETUP, "/api/identity.workspace.create", { slug: "alone" }, staff);
  member = at(ORIGIN)(await signIn("alone@example.test", ORIGIN));
  operator = at(ADMIN)(await signIn("op@alone.example.test", ADMIN));
});

describe("configuration with no shared store", () => {
  it("says there is nothing shared rather than implying there is", async () => {
    const out = await operator("/api/admin.config");
    expect(out.status).toBe(200);
    expect(out.body.shared).toBe(false);
  });

  it("still resolves this app's own values", async () => {
    expect((await operator("/api/admin.config.set", { key: "email.from", value: "Hello <noreply@x>", scope: "app" })).status).toBe(200);
    const keys = (await operator("/api/admin.config")).body.keys as unknown as { key: string; value: unknown; source: string }[];
    const from = keys.find((k) => k.key === "email.from")!;
    expect(from.value).toBe("Hello <noreply@x>");
    expect(from.source).toBe("app");
  });

  /*
    ⚠️ A STATED REFUSAL, NOT A CRASH. Reaching for a store that is not there
    throws, and the runtime turns any throw into the same 503 — so asserting the
    status alone cannot tell "we told you" from "it fell over", and the version
    that falls over writes nothing while saying nothing either.
  */
  it("refuses a shared write, and says why", async () => {
    const out = await operator("/api/admin.config.set", { key: "stripe.mode", value: "live", scope: "shared" });
    expect(out.status).toBe(503);
    expect(out.body.meta).toMatchObject({ reason: "this deployment binds no shared configuration store" });

    /* ⚠️ And it did not quietly land in this app's own store instead. */
    const keys = (await operator("/api/admin.config")).body.keys as unknown as { key: string; source: string }[];
    expect(keys.find((k) => k.key === "stripe.mode")!.source).toBe("unset");
  });

  /*
    ⚠️ AND AN APP THAT ASKS NO MODEL ANYTHING GETS NO CATALOGUE SCREEN. A surface
    that can only ever be wrong is one somebody will try to make work — and
    mounting it would make "which models are on" a question about a deployment
    rather than about a product.
  */
  it("mounts no model catalogue, because this app generates nothing", async () => {
    expect((await operator("/api/admin.models")).status).toBe(404);
  });

  it("is not reachable from inside a workspace", async () => {
    expect((await member("/api/admin.config")).status).toBe(403);
  });
});
