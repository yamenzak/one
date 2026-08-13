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
import { MAIL_HANDED_TO, addressOf, chooseProvider, mimeFor, recorded, send, senderOf, type Deliver } from "../src/mail.js";
import { MAIL_LANES } from "@one/kernel";
import type { Instant } from "@one/kernel";

const AT = "2026-01-10T00:00:00.000Z" as Instant;
const NOTE = { to: "ro@example.test", subject: "Hello", body: "Your code is 123456." };

const working = { "email.provider": "cloudflare", "email.from": "Kova <noreply@4dl.app>" };

const spy = (ok = true) => {
  const calls: { from: string; to: string; mime: string }[] = [];
  const deliver: Deliver = async (from, to, mime) => {
    calls.push({ from, to, mime });
    return { ok };
  };
  return { calls, deliver };
};

const never: Deliver = async () => {
  throw new Error("this must not be called");
};

/* -------------------------------------------------------------- choosing --- */

describe("what a deployment sends with", () => {
  it("takes the provider, the sender and the key it was given", () => {
        /* ⚠️ NO KEY, and that is this lane rather than an omission: Cloudflare Email
       Sending is a WORKER BINDING, so the credential is the deployment's own
       binding — nothing to rotate, leak from a console, or store in a database. */
    expect(chooseProvider(working)).toEqual({ ok: true, provider: "cloudflare", from: "Kova <noreply@4dl.app>" });
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
    expect(chooseProvider({ "email.provider": "cloudflare" })).toMatchObject({ why: "no_sender" });
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
    const partial: Record<string, string>[] = [{}, { "email.provider": "cloudflare" }, { "email.provider": "pigeon", "email.from": "a@b" }];
    for (const values of partial) {
      expect(await send(values, NOTE, never, AT)).toMatchObject({ ok: false });
    }
  });

  it("hands the sender a MIME message the binding will accept", async () => {
    const s = spy();
    expect(await send(working, NOTE, s.deliver, AT)).toEqual({ ok: true, provider: "cloudflare" });
    expect(s.calls).toHaveLength(1);
    const { mime } = s.calls[0]!;
    /* ⚠️ CRLF, because a MIME message with bare newlines is rejected outright
       rather than delivered oddly. */
    expect(mime).toContain("\r\n");
    expect(mime).toContain("From: Kova <noreply@4dl.app>");
    expect(mime).toContain("To: ro@example.test");
    expect(mime).toMatch(/Message-ID: <[^>]+@4dl\.app>/);
    expect(mime).toContain('Content-Type: text/plain; charset="utf-8"');
    /* ⚠️ THE HEADER HAS TO MATCH THE BODY. A message declaring `8bit` and
       carrying base64 is not a formatting nit — every client renders the
       encoded blob verbatim, so the person is shown the base64 of their code. */
    expect(mime).toContain("Content-Transfer-Encoding: base64");
    expect(mime.split("\r\n\r\n")[1]).toMatch(/^[A-Za-z0-9+/=\r\n]+$/);
    /* ⚠️ The body is base64 — the header says so, and a raw body under that
       header is a message every client renders as gibberish. */
    expect(atob(mime.split("\r\n\r\n")[1]!)).toContain("123456");
  });

  /*
    ⚠️ NO BINDING IS ITS OWN REFUSAL. A deployment set to send through Cloudflare
    on a worker with no `send_email` binding is an ordinary mistake, and calling
    it "refused" sends an operator to look at DNS for one line of config.
  */
  it("says the binding is missing rather than reporting a refusal", async () => {
    expect(await send(working, NOTE, null, AT)).toEqual({ ok: false, why: "no_binding" });
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
    const gone = { "email.provider": "resend", "email.from": "a@b", "email.resend.key": "re_1" };
    expect(await send(gone, NOTE, never, AT)).toEqual({ ok: false, why: "unknown_provider" });
  });

  /*
    ⚠️ A PROVIDER THAT SAYS NO AND ONE THAT IS UNREACHABLE ARE THE SAME THING TO
    WHOEVER WAS WAITING. Both are refusals; neither is an exception a caller has
    to catch, because a caller that catches would catch the misconfigurations too.
  */
  it("reports a refusal rather than throwing, however the provider failed", async () => {
    expect(await send(working, NOTE, spy(false).deliver, AT)).toEqual({ ok: false, why: "refused" });
    expect(await send(working, NOTE, async () => { throw new Error("down"); }, AT)).toEqual({ ok: false, why: "refused" });
  });

  it("records rather than sending when that is what was chosen", async () => {
    const s = spy();
    const values = { "email.provider": "recorded", "email.from": "Kova <noreply@4dl.app>" };
    expect(await send(values, NOTE, s.deliver, AT)).toEqual({ ok: true, provider: "recorded" });
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

/* ------------------------------------------------------ a workspace's layout --- */

/**
 * ⚠️ THE PLATFORM'S OWN MAIL STAYS PLAIN AND A WORKSPACE'S MAY NOT. A sign-in
 * code is one sentence and one number; a business writing to its own customers
 * is sending something it wants to look like theirs.
 */
describe("the one message with two parts", () => {
  const AT = "2026-08-14T09:00:00.000Z" as Instant;

  it("stays a single plain part where there is no layout", () => {
    const mime = mimeFor("Kova <noreply@4dl.app>", { to: "a@b.test", subject: "Hi", body: "There." }, AT);
    expect(mime).toContain(`Content-Type: text/plain; charset="utf-8"`);
    expect(mime).not.toContain("multipart");
  });

  /*
    ⚠️ THE PLAIN PART COMES FIRST, and the order is the behaviour rather than
    tidiness: a reader takes the LAST part it can render, so plain-then-html
    shows the design to whoever can see it and the words to whoever cannot.
    Reversed, some clients show the plain text to everybody and the layout is
    never seen at all.
  */
  it("carries both parts, plain first, where a workspace has one", () => {
    const mime = mimeFor(
      "Kova <noreply@4dl.app>",
      { to: "a@b.test", subject: "Hi", body: "There.", html: "<main>There.</main>" },
      AT,
    );
    expect(mime).toContain("multipart/alternative");
    expect(mime.indexOf("text/plain")).toBeLessThan(mime.indexOf("text/html"));
  });

  /* ⚠️ The closing boundary ends with two hyphens, and a message without one is
     truncated by every parser that is strict about it. */
  it("closes the boundary it opened", () => {
    const mime = mimeFor("K <n@4dl.app>", { to: "a@b.test", subject: "Hi", body: "T", html: "<p>T</p>" }, AT);
    const edge = /boundary="([^"]+)"/.exec(mime)![1]!;
    expect(mime).toContain(`--${edge}--`);
    expect((mime.match(new RegExp(`--${edge}`, "g")) ?? []).length).toBe(3);
  });
});
