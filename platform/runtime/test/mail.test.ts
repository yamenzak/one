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
import { addressOf, chooseProvider, recorded, send, senderOf, type Post } from "../src/mail.js";
import type { Instant } from "@one/kernel";

const AT = "2026-01-10T00:00:00.000Z" as Instant;
const NOTE = { to: "ro@example.test", subject: "Hello", body: "Your code is 123456." };

const working = { "email.provider": "brevo", "email.from": "Kova <noreply@4dl.app>", "email.brevo.key": "xkeysib-1" };

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
    expect(chooseProvider(working)).toEqual({ ok: true, provider: "brevo", from: "Kova <noreply@4dl.app>", key: "xkeysib-1" });
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
    expect(chooseProvider({ "email.provider": "brevo" })).toMatchObject({ why: "no_sender" });
    expect(chooseProvider({ "email.provider": "brevo", "email.from": "a@b" })).toMatchObject({ why: "no_key" });
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
    const partial: Record<string, string>[] = [{}, { "email.provider": "brevo" }, { "email.provider": "brevo", "email.from": "a@b" }];
    for (const values of partial) {
      expect(await send(values, NOTE, never, AT)).toMatchObject({ ok: false });
    }
  });

  it("sends what Brevo expects, with the sender split", async () => {
    const s = spy();
    expect(await send(working, NOTE, s.post, AT)).toEqual({ ok: true, provider: "brevo" });
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]!.url).toContain("brevo");
    expect(s.calls[0]!.headers["api-key"]).toBe("xkeysib-1");

    const body = JSON.parse(s.calls[0]!.body) as { sender: { name: string; email: string }; to: { email: string }[]; textContent: string };
    /* ⚠️ Not the whole string as an address — that arrives from nobody, or is refused. */
    expect(body.sender).toEqual({ name: "Kova", email: "noreply@4dl.app" });
    expect(body.to).toEqual([{ email: "ro@example.test" }]);
    expect(body.textContent).toContain("123456");
  });

  it("sends what Resend expects, with the sender whole", async () => {
    const s = spy();
    const values = { "email.provider": "resend", "email.from": "Kova <noreply@4dl.app>", "email.resend.key": "re_1" };
    expect(await send(values, NOTE, s.post, AT)).toEqual({ ok: true, provider: "resend" });
    expect(s.calls[0]!.headers.authorization).toBe("Bearer re_1");
    expect(JSON.parse(s.calls[0]!.body).from).toBe("Kova <noreply@4dl.app>");
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
