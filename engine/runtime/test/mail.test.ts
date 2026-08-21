/**
 * MAIL THAT LEAVES THE PROCESS — the message, and the refusal to pretend.
 *
 * ⚠️ THE MIME IS ASSERTED AS BYTES, because every way of getting it wrong ships.
 * A long HTML line, a `=` in a body, a non-ASCII subject and a UTF-8 character
 * past `btoa`'s reach all produce a message some clients render and others turn
 * into mojibake or an attachment — and none of it fails anywhere we would see.
 *
 * ⚠️ AND THE MOCK IS PROVEN TO BE UNREACHABLE OUTSIDE DEVELOPMENT. A mock that
 * fabricates a successful send in production is a sign-in that answers "check
 * your email" over nothing; a previous platform shipped three such lanes,
 * because the suites all run where mocking is correct.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CONFIG_SCHEMA, applySchema, bareAddress, buildMime, sendMail, setConfig, type Db,
} from "../src/index.js";

const db = () => env.DIRECTORY as unknown as Db;
const SECRET = "test-config-secret";

/** What `base64` decodes back to, so the assertion is about the bytes. */
const decoded = (part: string): string =>
  new TextDecoder().decode(
    Uint8Array.from(atob(part.replace(/\r\n/g, "")), (c) => c.charCodeAt(0)));

beforeEach(async () => {
  await applySchema(db(), [CONFIG_SCHEMA]);
  await db().exec(`DELETE FROM deployment_config;`);
});

describe("the message", () => {
  it("carries the headers a mail server needs", () => {
    const raw = buildMime({
      from: "One <noreply@4dl.app>", to: "sam@example.com",
      subject: "123456 is your sign-in code", text: "123456",
    });
    expect(raw).toContain("From: One <noreply@4dl.app>");
    expect(raw).toContain("To: sam@example.com");
    expect(raw).toContain("MIME-Version: 1.0");
    /* ⚠️ CRLF, which the format requires — a bare `\n` is accepted by some
       servers and silently mangled by others. */
    expect(raw).toContain("\r\n");
  });

  /*
    ⚠️ `btoa` IS LATIN1, so a UTF-8 body goes through the encoder first. Without
    it every sign-in mail in a language that is not English arrives as bytes, and
    nothing in the send path fails.
  */
  it("survives a body and a subject that are not ASCII", () => {
    const raw = buildMime({
      from: "One <noreply@4dl.app>", to: "sam@example.com",
      subject: "Ihr Anmeldecode — 123456", text: "Grüße! Ihr Code ist 123456 ✓",
    });
    /* The subject is RFC 2047 encoded, because a header is ASCII. */
    expect(raw).toContain("Subject: =?UTF-8?B?");
    const body = raw.split("\r\n\r\n").slice(1).join("\r\n\r\n");
    expect(decoded(body)).toContain("Grüße! Ihr Code ist 123456 ✓");
  });

  /* ⚠️ ONE PART WHEN THERE IS ONE BODY. A `multipart/alternative` with a single
     part renders as an attachment in some clients, and every one of them is
     somebody's mail client rather than ours. */
  it("is multipart only when there are two bodies", () => {
    const plain = buildMime({
      from: "a@b.c", to: "d@e.f", subject: "s", text: "t",
    });
    expect(plain).not.toContain("multipart/alternative");
    expect(plain).toContain("Content-Type: text/plain; charset=UTF-8");

    const both = buildMime({
      from: "a@b.c", to: "d@e.f", subject: "s", text: "t", html: "<p>t</p>",
    });
    expect(both).toContain("multipart/alternative");
    expect(both).toContain("text/html; charset=UTF-8");
    /* The closing delimiter, without which the last part is never terminated. */
    expect(both).toContain("--one-boundary-0--");
  });

  /*
    ⚠️ THE SENDER IS OURS AND THE REPLY IS THEIRS, AND BOTH ARE IN THE MESSAGE.
    Mail is delivered on the strength of a domain set up to send it, so a
    workspace can never be the `From:` — and without a `Reply-To:` every answer
    to everything a business tells its own people lands in a mailbox nobody
    reads. Absent unless it was asked for: an empty header is a header some
    clients honour as an address of nothing.
  */
  it("puts the workspace's reply address beside our sender", () => {
    const raw = buildMime({
      from: "Harbour Works <noreply@4dl.app>", to: "sam@example.com",
      subject: "s", text: "t", replyTo: "hello@harbour.example",
    });
    expect(raw).toContain("From: Harbour Works <noreply@4dl.app>");
    expect(raw).toContain("Reply-To: hello@harbour.example");
    expect(buildMime({ from: "a@b.c", to: "d@e.f", subject: "s", text: "t" }))
      .not.toContain("Reply-To:");
  });

  /* ⚠️ The envelope takes an address; the display name stays in the header. */
  it("takes the address out of a display name", () => {
    expect(bareAddress("One <noreply@4dl.app>")).toBe("noreply@4dl.app");
    expect(bareAddress("noreply@4dl.app")).toBe("noreply@4dl.app");
  });
});

describe("sending", () => {
  /*
    ⚠️ THE MOCK CANNOT RUN OUTSIDE DEVELOPMENT, AND THE CHECK IS ON THE
    ENVIRONMENT RATHER THAN ON CONFIGURATION. A switch an operator can press is a
    switch that gets pressed in production, and what it produces is a sign-in
    code written to a retained log and a send reported as successful.
  */
  it("refuses rather than pretending when nothing is configured", async () => {
    expect(await sendMail(
      { directory: db(), environment: "production" },
      { to: "sam@example.com", subject: "s", text: "t" })).toBe("no_lane");
  });

  it("logs in development, which is what a laptop signs in with", async () => {
    expect(await sendMail(
      { directory: db(), environment: "development" },
      { to: "sam@example.com", subject: "s", text: "t" })).toBe(null);
  });

  /*
    ⚠️ AND `off` IS REFUSED EVERYWHERE, development included. An operator who has
    switched mail off has said something, and a development lane that ignored it
    would make the switch untestable in the one place somebody would test it.
  */
  it("refuses where the operator turned it off", async () => {
    await setConfig(db(), SECRET, "email.provider", "off");
    expect(await sendMail(
      { directory: db(), configSecret: SECRET, environment: "development" },
      { to: "sam@example.com", subject: "s", text: "t" })).toBe("off");
  });

  it("sends through the binding, with the envelope sender bare", async () => {
    await setConfig(db(), SECRET, "email.provider", "cloudflare");
    await setConfig(db(), SECRET, "email.from", "One <noreply@4dl.app>");

    const sent: { from: string; to: string; raw: string }[] = [];
    const why = await sendMail({
      directory: db(), configSecret: SECRET, environment: "production",
      binding: { send: async (from, to, raw) => { sent.push({ from, to, raw }); } },
    }, { to: "sam@example.com", subject: "123456 is your sign-in code", text: "123456" });

    expect(why).toBe(null);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.from).toBe("noreply@4dl.app");
    expect(sent[0]!.raw).toContain("From: One <noreply@4dl.app>");
  });

  /*
    ⚠️ A BOUND SENDER WITH NO ADDRESS IS A REFUSAL. Sending from "" produces a
    message every receiving server rejects, one address at a time, with the
    deployment reporting each send as successful.
  */
  it("refuses a configured lane with no sender", async () => {
    await setConfig(db(), SECRET, "email.provider", "cloudflare");
    expect(await sendMail({
      directory: db(), configSecret: SECRET, environment: "production",
      binding: { send: async () => {} },
    }, { to: "sam@example.com", subject: "s", text: "t" })).toBe("no_sender");
  });

  /*
    ⚠️ A FAILED SEND IS A VALUE, NOT A THROW, AND CARRIES NO BODY. The caller has
    already written a code row and needs to withdraw it; and a failure logged
    with the letter would put the code in the logs by the back door.
  */
  it("reports a provider failure without the letter in it", async () => {
    await setConfig(db(), SECRET, "email.provider", "cloudflare");
    await setConfig(db(), SECRET, "email.from", "One <noreply@4dl.app>");
    expect(await sendMail({
      directory: db(), configSecret: SECRET, environment: "production",
      binding: { send: async () => { throw new Error("relay said no"); } },
    }, { to: "sam@example.com", subject: "s", text: "123456" })).toBe("send_failed");
  });
});
