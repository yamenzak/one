/**
 * MAIL THAT LEAVES THE PROCESS.
 *
 * ⚠️ SENDING IS THE ONE THING A DEPLOYMENT MUST NOT FAKE. A sign-in that answers
 * "check your email" with nothing sent is a product that appears to work and
 * cannot be used — and the person is then told to wait a minute for a code that
 * does not exist, which is a sentence pointing at them rather than at us. So the
 * mock lane is gated on the ENVIRONMENT, structurally, and everywhere else an
 * unconfigured deployment REFUSES.
 *
 * ⚠️ MIME IS WRITTEN OUT RATHER THAN DEPENDED ON, for the reason the push
 * encryption is: `cloudflare:email` takes an `EmailMessage` carrying a raw RFC
 * 5322 message, not an object with a subject on it. A library would be a
 * dependency for four headers and a base64 body.
 *
 * ⚠️ AND THE BODY IS BASE64, WHICH IS NOT TIDINESS. An HTML mail is one very long
 * line containing `=`, `"` and non-ASCII; sent as-is it violates the line-length
 * limit, and quoted-printable would mean implementing quoted-printable. Base64
 * is exact, and `btoa` is latin1-only — so the bytes are encoded before it, or
 * every non-English sign-in mail is mojibake nobody tests for.
 */

import { configOf } from "./config.js";
import type { Db } from "./sql.js";

/* ------------------------------------------------------------------- MIME --- */

/** ⚠️ `btoa` IS LATIN1. UTF-8 goes through the encoder first, or it corrupts. */
function base64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  /* ⚠️ Wrapped at 76 columns, which the format requires rather than prefers. */
  return (btoa(bin).match(/.{1,76}/g) ?? []).join("\r\n");
}

/**
 * ⚠️ A HEADER IS ASCII, so a subject with anything else in it is RFC 2047
 * encoded. Sent raw, a workspace's own name in a subject line arrives as bytes.
 */
const headerWord = (text: string): string =>
  // eslint-disable-next-line no-control-regex
  /^[\x20-\x7E]*$/.test(text) ? text : `=?UTF-8?B?${base64Utf8(text).replace(/\r\n/g, "")}?=`;

export interface Letter {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

/** The address inside `Name <a@b>`, which is what an envelope takes. */
export const bareAddress = (from: string): string =>
  from.match(/<([^>]+)>/)?.[1]?.trim() ?? from.trim();

/**
 * ⚠️ MULTIPART ONLY WHEN THERE ARE TWO BODIES. A `multipart/alternative` with one
 * part is a message some clients render as an attachment, and every one of them
 * is somebody's mail client rather than ours.
 */
export function buildMime(letter: Letter, boundary = "one-boundary-0"): string {
  const head = [
    `From: ${letter.from}`,
    `To: ${letter.to}`,
    `Subject: ${headerWord(letter.subject)}`,
    "MIME-Version: 1.0",
  ];

  if (!letter.html) {
    return [
      ...head,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      base64Utf8(letter.text),
      "",
    ].join("\r\n");
  }

  return [
    ...head,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Utf8(letter.text),
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Utf8(letter.html),
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

/* ------------------------------------------------------------------ lanes --- */

/**
 * ⚠️ THE ENVELOPE AND THE MESSAGE, AND NOTHING ABOUT CLOUDFLARE. The binding's
 * own `EmailMessage` is constructed by the DEPLOYMENT, because `cloudflare:email`
 * exists only inside a Worker that declares a `send_email` binding — importing it
 * here would make this package unbuildable anywhere that sends nothing, which is
 * every unit test and every self-host.
 *
 * ⚠️ AND IT IS THE SAME SHAPE AS EVERY OTHER BINDING HERE. A bucket, a push
 * sender and a model provider are all handed in; a mailer reaching for a Worker
 * global would be the one exception, and exceptions are where the layering rots.
 */
export interface SendBinding {
  send(from: string, to: string, raw: string): Promise<void>;
}

export type MailRefusal = "no_sender" | "off" | "no_lane" | "send_failed";

export interface MailDeps {
  readonly directory: Db;
  /** ⚠️ Secrets are encrypted under it — the sender address is not. */
  readonly configSecret?: string;
  readonly binding?: SendBinding;
  /** ⚠️ The one thing that decides whether the mock may run. Never configuration. */
  readonly environment: string;
}

/**
 * ⚠️ THE MOCK IS DEVELOPMENT-ONLY AND THE CHECK IS ON THE ENVIRONMENT. A mock
 * that can be switched on from a console writes sign-in codes — the sole auth
 * factor — into retained logs on a live deployment, and reports success. A
 * previous platform shipped three such paths, all of which typechecked and
 * passed every test, because the suites run where mocking is correct.
 */
const MOCK_ALLOWED = (environment: string): boolean => environment === "development";

/**
 * Send one letter, or say why not.
 *
 * ⚠️ EVERY REFUSAL IS A VALUE, NEVER A THROW. The caller is a sign-in route that
 * has already written a code row, and the difference between "we could not send"
 * and "something went wrong" is the difference between withdrawing that row and
 * leaving somebody locked out of an address they own.
 */
export async function sendMail(
  deps: MailDeps, letter: Omit<Letter, "from">,
): Promise<null | MailRefusal> {
  const provider = (await configOf(deps.directory, deps.configSecret, "email.provider")) ?? "";
  if (provider === "off") return "off";

  const from = (await configOf(deps.directory, deps.configSecret, "email.from")) ?? "";

  if (provider === "cloudflare" && deps.binding) {
    /* ⚠️ CHECKED HERE RATHER THAN AT THE TOP, because a deployment with no
       sender in development still logs — the mock lane below needs no address,
       and refusing before it would make a laptop unable to sign in. */
    if (!from) return "no_sender";
    try {
      /* ⚠️ THE ENVELOPE SENDER IS THE BARE ADDRESS, and the display name stays in
         the header. `Kova <noreply@4dl.app>` in an envelope is not an address. */
      await deps.binding.send(
        bareAddress(from), letter.to, buildMime({ ...letter, from }));
      return null;
    } catch {
      /* ⚠️ NOT LOGGED WITH THE LETTER. A failure carrying the body would put a
         sign-in code in the logs by the back door. */
      return "send_failed";
    }
  }

  if (!MOCK_ALLOWED(deps.environment)) return "no_lane";
  /* logs-exempt: the branch above returns outside development, so this cannot
     run on a deployment whose logs anybody keeps — and in development the
     console IS the mailer. A sign-in code in a retained log is a session
     anybody with dashboard access can take. */
  console.log(`[mail] to=${letter.to} subject="${letter.subject}"\n${letter.text}`);
  return null;
}
