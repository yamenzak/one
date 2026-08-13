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
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import worker, { recorded } from "../src/worker.js";
import { post, restoreMail, SETUP, signIn } from "./session.js";

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
    ⚠️ THE CATALOGUE IS MOUNTED WHETHER OR NOT THIS APP GENERATES ANYTHING, and
    that is the opposite of what it used to be. It was mounted only where an app
    declared models — correct while the models WERE the app's. They are the
    DEPLOYMENT's now, so a product that asks no model anything is served by the
    same catalogue as one that does, and a deployment which has not added a model
    yet is exactly the deployment that most needs the screen.

    ⚠️ AND WITH NO SHARED STORE IT SAYS SO rather than answering with an empty
    catalogue. Empty and unreachable look identical on a screen, and only one of
    them is somebody's mistake.
  */
  it("mounts the model catalogue even where this app generates nothing", async () => {
    const out = await operator("/api/admin.models");
    expect(out.status).toBe(200);
    expect(out.body.models).toEqual([]);
    expect(out.body.shared).toBe(false);
  });

  /* ⚠️ Every lane the meter can price travels with it, so a console renders the
     choice from what the platform supports rather than from a list of its own. */
  it("hands the console every lane rather than letting it write its own list", async () => {
    expect((await operator("/api/admin.models")).body.lanes)
      .toEqual(["text", "vision", "image", "speech", "transcribe", "video"]);
  });

  /* ⚠️ And a write with nowhere to write it is refused, not swallowed. */
  it("refuses to publish a model when there is no shared store to publish it to", async () => {
    const out = await operator("/api/admin.models.set", {
      id: "m", provider: "p", lanes: ["text"], input: 1, output: 2, markup: 1.5,
    });
    expect(out.status).toBe(503);
  });

  it("is not reachable from inside a workspace", async () => {
    expect((await member("/api/admin.config")).status).toBe(403);
  });

  /*
    ⚠️ ONE CONSOLE, EVERY PRODUCT — which is what having ONE Stripe account and
    ONE Google account behind three products actually needs. Three operator
    doors meant three sign-ins and three places to paste one key, and the copy
    that did not get re-pasted failed in a way nobody attributed to the rotation.

    ⚠️ AND IT IS NOT THE THING `kernel/config.ts` REJECTS. That is a central
    service PUSHING configuration into each product — a privileged write endpoint
    in every app, authenticated by a machine token, accepting secret keys.
    Nothing pushes here: the store is one database, the rows are keyed by app,
    and each worker still reads only its own.
  */
  it("configures another product from the one door", async () => {
    expect((await operator("/api/admin.config.set", {
      key: "email.from", value: "Kova <noreply@4dl.app>", scope: "app", app: "kova",
    })).status).toBe(200);

    /* ⚠️ A read takes its input from the query, which is what makes it linkable. */
    const theirs = (await operator("/api/admin.config?app=kova")).body;
    expect(theirs.app).toBe("kova");
    expect((theirs.keys as unknown as { key: string; value: unknown }[])
      .find((k) => k.key === "email.from")?.value).toBe("Kova <noreply@4dl.app>");

    /* ⚠️ AND THE SERVING PRODUCT'S OWN ROW IS UNTOUCHED, which is the whole
       point of the column. Before it, these were one row. */
    const mine = (await operator("/api/admin.config")).body;
    expect(mine.app).toBe("hello");
    expect((mine.keys as unknown as { key: string; value: unknown }[])
      .find((k) => k.key === "email.from")?.value).not.toBe("Kova <noreply@4dl.app>");
  });

  /*
    ⚠️ AN UNDECLARED PRODUCT IS REFUSED RATHER THAN WRITTEN, and the reason is the
    same one an undeclared KEY is refused for: the store is keyed by app, so a
    typo does not fail — it files a real Stripe key under a product that does not
    exist, where nothing will ever read it and nothing will ever say so.
  */
  it("refuses a product this deployment does not have", async () => {
    const out = await operator("/api/admin.config.set", {
      key: "email.from", value: "x", scope: "app", app: "not-a-product",
    });
    expect(out.status).toBe(400);
  });

  /* ⚠️ The picker's own list, in the same answer — a console told separately is
     one whose picker can offer an app the read then refuses. */
  it("says which products there are to choose between", async () => {
    expect((await operator("/api/admin.config")).body.products).toContain("kova");
  });
});

/* ----------------------------------------------------------------- mail --- */

/*
  ⚠️ THIS FILE IS `solo` BECAUSE IT TURNS THE DEPLOYMENT'S MAIL OFF. Blanking
  `email.from` proves the one thing the console has to be able to report — the
  lane is not working, and here is why — and there is no way to prove it without
  the lane actually not working. Storage is shared across this package's files,
  so run beside them it takes every other file's sign-in down with it: a 503 on
  the first attempt and the OTP cooldown on the retry, surfacing as a different
  test failing in a different file on about a third of runs, with nothing naming
  the cause.

  ⚠️ THE `afterAll` BELOW IS STILL RIGHT AND IS NOT ENOUGH ON ITS OWN. It puts
  the sender back whether or not the case passed, which is what stops a failure
  here cascading — but it cannot close the window while the case is running, and
  that window is what a neighbouring file falls into. Splitting on "does this
  affect the whole deployment" is the same line the maintenance suite is on.
*/

/**
 * ⚠️ "AND PROVE IT WORKS" IS THE HALF USUALLY MISSING. A screen that accepts a
 * key and says "Saved" has told an operator nothing: the first real message is a
 * sign-in code, and the person who does not receive it cannot report what they
 * did not get.
 */
describe("proving the mail lane", () => {
  it("says which provider is in use once one is configured", async () => {
    const out = await operator("/api/admin.email");
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ ready: true, provider: "recorded" });
  });

  it("actually sends, and says which provider carried it", async () => {
    const out = await operator("/api/admin.email.test", { to: "check@example.test" });
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ sent: true, provider: "recorded" });
    expect(recorded.get("check@example.test")!.subject).toContain("Test");
  });

  /*
    ⚠️ A FAILURE IS AN ANSWER, NOT A PROBLEM. Refusing the request would tell an
    operator the CONSOLE is broken; what they asked was whether the mail lane is,
    and "no, because no sender is configured" is the useful version of that.
  */
  it("reports what is missing rather than refusing the request", async () => {
    await operator("/api/admin.config.set", { key: "email.from", value: "", scope: "app" });
    const lane = await operator("/api/admin.email");
    expect(lane.body).toMatchObject({ ready: false, why: "no_sender" });

    const sent = await operator("/api/admin.email.test", { to: "check@example.test" });
    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ sent: false, why: "no_sender" });

    /*
      ⚠️ AND A CODE THAT COULD NOT BE SENT IS NOT A CODE THAT WAS. Answering the
      request cleanly and telling somebody to check their inbox for a message
      that was never addressed to anybody is the failure this whole lane exists
      to end — it is what a `Map` did, silently, in every app here.
    */
    /*
      ⚠️ RE-BLANKED IMMEDIATELY BEFORE THE ONE ASSERTION THAT DEPENDS ON IT, and
      that is not belt-and-braces. `signIn` seeds the mail lane and REPAIRS a
      blank — it has to, or this file's deliberate blank leaks into the next
      file's sign-in — and every file here shares one deployment. So any sign-in
      that lands between the blank above and the request below puts the sender
      back, and what this test then proves is that a code which could not be sent
      WAS sent: the exact failure the lane exists to end, passing.

      A precondition established three round trips before the assertion that
      needs it is a precondition with a window in it.
    */
    await operator("/api/admin.config.set", { key: "email.from", value: "", scope: "app" });
    const asked = await worker.fetch(
      new Request(`${ORIGIN}/api/identity.code.request`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "nowhere@example.test" }),
      }),
      env as never,
    );
    expect(asked.status).toBe(503);

    /* ⚠️ PUT BACK HERE AND NOT ONLY IN `afterAll`. Every file in this project
       shares one deployment, and a blank sender left lying between this line and
       the end of the file is a neighbour's sign-in failing for a reason that has
       nothing to do with what it was testing. */
    await restoreMail();

  });

  /*
    ⚠️ PUT BACK WHETHER OR NOT THE TEST PASSED, and that is the whole reason this
    is an `afterAll` rather than the last line of the case. Restoring inside the
    body means a failure ANYWHERE above it leaves the deployment with no sender —
    and storage is shared across this package's files, so the next file's sign-in
    gets a 503 and the one after that gets the OTP cooldown on its retry. One
    failing assertion became a different test failing in a different file, with
    nothing naming the cause.

    ⚠️ AND IT IS A DIRECT WRITE RATHER THAN THE OPERATOR ROUTE, which it used to
    be. The route needs a session, and a restore that can fail for a reason
    unrelated to what it is restoring is a restore that leaves the deployment
    with no sender exactly when something has already gone wrong. The fixture
    that seeds this uses `seedOne` — which correctly does nothing where a row
    exists — so a blank row is not something a later sign-in repairs.
  */
  afterAll(restoreMail);

  it("is not reachable from inside a workspace", async () => {
    expect((await member("/api/admin.email.test", { to: "check@example.test" })).status).toBe(403);
  });
});
