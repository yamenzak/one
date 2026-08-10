/**
 * THE DECISION, THE REQUEST, AND THE REFUSALS.
 *
 * ⚠️ A MAILER THAT SILENTLY SUCCEEDS WHEN UNCONFIGURED IS A SIGN-IN CODE NOBODY
 * RECEIVES, REPORTED AS DELIVERED — which is what every app here had, in the
 * form of a `Map`. So what is asserted below is mostly what does NOT get sent,
 * and the one thing a stub would never catch: the request a provider actually
 * receives, where a wrong sender or a wrong field lives.
 */

import { describe, expect, it } from "vitest";
import { MAIL_HANDED_TO, addressOf, chooseProvider, recorded, send, senderOf, type Post } from "../src/mail.js";
import { MAIL_LANES } from "@one/kernel";
import type { Instant } from "@one/kernel";

const AT = "2026-01-10T00:00:00.000Z" as Instant;
const NOTE = { to: "ro@example.test", subject: "Hello", body: "Your code is 123456." };

const working = { "email.provider": "resend", "email.from": "Kova <noreply@4dl.app>", "email.resend.key": "re_1" };

const spy = (ok = true) => {
  const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
  const post: Post = async (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body });
    return { ok };
  };
  return { calls, post };
};

const never: Post = async () => {
  throw new Error("this must not be called");
};

/* -------------------------------------------------------------- choosing --- */

describe("what a deployment sends with", () => {
  it("takes the provider, the sender and the key it was given", () => {
    expect(chooseProvider(working)).toEqual({ ok: true, provider: "resend", from: "Kova <noreply@4dl.app>", key: "re_1" });
  });

  /*
    ⚠️ EACH REFUSAL IS A DIFFERENT THING TO GO AND DO. No provider is a choice
    nobody made; no sender is a verified address nobody entered; no key is a
    provider that will refuse every call. One "not configured" makes an operator
    guess which.
  */
  it("says which part is missing, not merely that something is", () => {
    expect(chooseProvider({})).toMatchObject({ why: "no_provider" });
    expect(chooseProvider({ "email.provider": "pigeon" })).toMatchObject({ why: "unknown_provider" });
    expect(chooseProvider({ "email.provider": "resend" })).toMatchObject({ why: "no_sender" });
    expect(chooseProvider({ "email.provider": "resend", "email.from": "a@b" })).toMatchObject({ why: "no_key" });
  });

  /*
    ⚠️ THE RECORDED PROVIDER IS A CHOICE, NOT A FALLBACK. It needs no key, and it
    is reached only by a deployment that named it — a branch this file took when
    something was missing is how a production deployment comes to record its
    sign-in codes and answer as though the mail went out.
  */
  it("takes the recorded provider without a key, and only when it is named", () => {
    expect(chooseProvider({ "email.provider": "recorded", "email.from": "a@b" })).toMatchObject({ ok: true, provider: "recorded" });
    expect(chooseProvider({ "email.from": "a@b" })).toMatchObject({ ok: false });
  });

  it("reads the sender as one string, blank when absent", () => {
    expect(senderOf(working)).toBe("Kova <noreply@4dl.app>");
    expect(senderOf({})).toBe("");
  });
});

/* --------------------------------------------------------------- sending --- */

describe("sending", () => {
  /*
    ⚠️ NOTHING LEAVES THE PROCESS WHILE ANYTHING IS MISSING. Not a best-effort
    attempt, not a queued retry: a deployment that has picked nothing sends
    nothing and says so, because the alternative is a person waiting for a code
    that was never addressed to anybody.
  */
  it("does not call a provider when the deployment is not configured", async () => {
    const partial: Record<string, string>[] = [{}, { "email.provider": "resend" }, { "email.provider": "resend", "email.from": "a@b" }];
    for (const values of partial) {
      expect(await send(values, NOTE, never, AT)).toMatchObject({ ok: false });
    }
  });

  it("sends what the provider expects, with the sender whole", async () => {
    const s = spy();
    expect(await send(working, NOTE, s.post, AT)).toEqual({ ok: true, provider: "resend" });
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]!.url).toContain("resend");
    expect(s.calls[0]!.headers.authorization).toBe("Bearer re_1");

    const body = JSON.parse(s.calls[0]!.body) as { from: string; to: string[]; text: string };
    expect(body.from).toBe("Kova <noreply@4dl.app>");
    expect(body.to).toEqual(["ro@example.test"]);
    expect(body.text).toContain("123456");
  });

  /*
    ⚠️ AND A LANE THAT WAS REMOVED IS REFUSED RATHER THAN IGNORED. Brevo was a
    provider here; a deployment still configured with it now gets
    `unknown_provider` and sends nothing, which is the honest answer. Falling back
    to whichever lane remains would send a sign-in code through a company the
    operator did not choose and the disclosure would still be right, which is the
    worst combination available.
  */
  it("refuses a provider that no longer exists rather than picking one", async () => {
    const gone = { "email.provider": "brevo", "email.from": "a@b", "email.brevo.key": "x" };
    expect(await send(gone, NOTE, never, AT)).toEqual({ ok: false, why: "unknown_provider" });
  });

  /*
    ⚠️ A PROVIDER THAT SAYS NO AND ONE THAT IS UNREACHABLE ARE THE SAME THING TO
    WHOEVER WAS WAITING. Both are refusals; neither is an exception a caller has
    to catch, because a caller that catches would catch the misconfigurations too.
  */
  it("reports a refusal rather than throwing, however the provider failed", async () => {
    expect(await send(working, NOTE, spy(false).post, AT)).toEqual({ ok: false, why: "refused" });
    expect(await send(working, NOTE, async () => { throw new Error("down"); }, AT)).toEqual({ ok: false, why: "refused" });
  });

  it("records rather than sending when that is what was chosen", async () => {
    const s = spy();
    const values = { "email.provider": "recorded", "email.from": "Kova <noreply@4dl.app>" };
    expect(await send(values, NOTE, s.post, AT)).toEqual({ ok: true, provider: "recorded" });
    expect(s.calls).toHaveLength(0);
    expect(recorded.get("ro@example.test")!.body).toContain("123456");
  });

  /* ⚠️ Addresses are not case-sensitive, and people do not type them consistently. */
  it("records against the folded address", async () => {
    const values = { "email.provider": "recorded", "email.from": "a@b" };
    await send(values, { ...NOTE, to: "RO@Example.Test", body: "Your code is 999111." }, never, AT);
    expect(recorded.get("ro@example.test")!.body).toContain("999111");
  });
});

/* -------------------------------------------------------------- the from --- */

describe("splitting a sender", () => {
  it("takes a display name off the front", () => {
    expect(addressOf("Kova <noreply@4dl.app>")).toEqual({ name: "Kova", email: "noreply@4dl.app" });
  });

  it("takes a bare address as one", () => {
    expect(addressOf("noreply@4dl.app")).toEqual({ email: "noreply@4dl.app" });
  });

  it("does not invent an empty name", () => {
    expect(addressOf("<noreply@4dl.app>")).toEqual({ email: "noreply@4dl.app" });
  });
});

/* ------------------------------------------------------- what is disclosed --- */

/**
 * ⚠️ THE TWO LISTS THAT DRIFT, PINNED TO EACH OTHER.
 *
 * A mail provider is added in a file about HTTP requests. A sub-processor is
 * declared in a file about the law. Nothing connects them, so the first one to
 * change is right and the second is quietly wrong — and the wrongness is a
 * customer being told their address goes to a company it does not, or not being
 * told about one it does.
 *
 * `MAIL_HANDED_TO` is the sending side, `MAIL_LANES` is the disclosure side, and
 * `disclosureProblems` refuses any manifest whose list does not name every entry
 * in the second. This is the joint between the two.
 */
describe("every lane that leaves the process is disclosed", () => {
  it("names a company for every provider that sends, and nobody for the one that does not", () => {
    /* ⚠️ The recorded provider is a Map in this worker's memory. Giving it a
       sub-processor would put a company on a disclosure that receives nothing. */
    expect(MAIL_HANDED_TO.recorded).toBe(null);
    for (const [provider, company] of Object.entries(MAIL_HANDED_TO)) {
      if (provider === "recorded") continue;
      expect(company, `${provider} sends and hands the message to nobody`).toBeTruthy();
    }
  });

  /*
    ⚠️ EXACTLY EQUAL, IN BOTH DIRECTIONS. A provider the kernel does not know
    about is an undisclosed recipient; a lane the kernel demands and no provider
    uses is a company on the list that receives nothing, which every app would
    then be forced to declare falsely.
  */
  it("agrees exactly with what the kernel makes every manifest disclose", () => {
    const sending = Object.values(MAIL_HANDED_TO).filter((c): c is string => c !== null);
    expect([...sending].sort()).toEqual([...MAIL_LANES].sort());
  });
});
