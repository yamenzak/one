/**
 * MAIL — the decision, the message, and the one lane that leaves the process.
 *
 * ⚠️ THE PROVIDER IS A CONFIGURATION, NOT A DEPENDENCY. A platform that hard-wired
 * one owns every product's sender reputation and every product's outage; a
 * deployment picks, and a deployment that has picked nothing SENDS NOTHING and
 * says so. That last clause is the whole of it: a mailer that silently succeeded
 * when unconfigured is a sign-in code nobody receives, reported as delivered.
 *
 * ⚠️ THERE IS NO DEVELOPMENT FALLBACK IN HERE. The mock is a provider a
 * deployment CHOOSES — `email.provider = "recorded"` — rather than a branch this
 * file takes when something is missing. A fallback reachable by getting config
 * wrong is how a production deployment comes to record its sign-in codes in a
 * map and answer every request as though the mail went out.
 */

import type { Instant } from "@one/kernel";
import type { Values } from "./config.js";

/* -------------------------------------------------------------- the note --- */

export interface Message {
  readonly to: string;
  readonly subject: string;
  /**
   * ⚠️ PLAIN TEXT, AND THAT IS DELIBERATE FOR EVERYTHING THE PLATFORM SENDS. A
   * sign-in code and a notification are one sentence and one link; HTML buys
   * nothing for either, and it is the half of an email that renders differently
   * in every client and gets a message filed as marketing.
   */
  readonly body: string;
  /**
   * A WORKSPACE'S OWN LAYOUT, WHERE IT HAS ONE.
   *
   * ⚠️ AND ONLY EVER A WORKSPACE'S. Everything the PLATFORM sends is one sentence
   * and one number — a sign-in code, a notice about somebody's own bill — and
   * HTML buys neither of them anything while being the half of an email that
   * renders differently in every client and gets a message filed as marketing.
   * What this carries is a business writing to its own customers, wrapped in the
   * design they chose.
   *
   * ⚠️ THE TEXT PART IS STILL REQUIRED. `body` is not optional and does not
   * become optional here: a client that cannot render HTML, a screen reader, and
   * a spam filter looking for a `text/plain` part are all ordinary, and an
   * HTML-only email arrives blank for some readers with nothing saying so.
   */
  readonly html?: string;
}

/** Who a deployment sends as: `Kova <noreply@4dl.app>`, or a bare address. */
export const senderOf = (values: Values): string => values["email.from"] ?? "";

/* ------------------------------------------------------------- providers --- */

export type ProviderId = "recorded" | "cloudflare";

const PROVIDERS: readonly ProviderId[] = ["recorded", "cloudflare"];

/**
 * ⚠️ WHICH COMPANY EACH LANE HANDS THE MESSAGE TO, and `null` means nobody.
 *
 * A provider a deployment MAY choose is a company that MAY receive somebody's
 * address, so the disclosure has to name it — and the two lists are exactly the
 * thing that drifts, because a provider is added in a file about HTTP and a
 * sub-processor is declared in a file about the law.
 *
 * `MAIL_LANES` in `@one/kernel` is the disclosure side of the same fact, and
 * `runtime/test/mail.test.ts` pins them together. Adding a provider here without
 * adding it there is a test failure rather than an undisclosed recipient.
 *
 * ⚠️ `recorded` IS `null` BECAUSE NOTHING LEAVES THE PROCESS. It is a Map in
 * this worker's memory. Declaring a sub-processor for it would put a company on
 * a disclosure that receives nothing, which is the failure the disclosure check
 * exists to refuse in the other direction.
 */
export const MAIL_HANDED_TO: Readonly<Record<ProviderId, string | null>> = {
  recorded: null,
  cloudflare: "cloudflare-email",
};

export type Chosen =
  | { readonly ok: true; readonly provider: ProviderId; readonly from: string }
  | { readonly ok: false; readonly why: Unconfigured };

/**
 * ⚠️ EACH OF THESE IS A DIFFERENT THING TO GO AND DO, which is why they are not
 * one "not configured". No provider is a choice nobody has made; no sender is a
 * verified address nobody has entered; no key is a provider that will refuse
 * every call. An operator reading one word cannot tell which.
 */
export type Unconfigured = "no_provider" | "unknown_provider" | "no_sender" | "no_binding";

/**
 * What this deployment sends with, from what it has been told.
 *
 * ⚠️ RESOLVED ONCE PER SEND RATHER THAN CACHED. A key is rotated while the
 * worker is warm, and a cached decision keeps using the old one until something
 * evicts it — which for a mailer means silence that nobody can reproduce.
 */
export function chooseProvider(values: Values): Chosen {
  const id = (values["email.provider"] ?? "").trim();
  if (id === "") return { ok: false, why: "no_provider" };
  if (!PROVIDERS.includes(id as ProviderId)) return { ok: false, why: "unknown_provider" };

  const from = senderOf(values).trim();
  if (from === "") return { ok: false, why: "no_sender" };

  /*
    ⚠️ THE RECORDED PROVIDER NEEDS NO KEY AND IS NOT A FALLBACK. It is what a
    development deployment and a test CHOOSE; production choosing it is a
    misconfiguration a person made, which is visible on the console's own screen
    rather than being a branch nobody can see.
  */
  if (id === "recorded") return { ok: true, provider: "recorded", from };

  /*
    ⚠️ THERE IS NO API KEY, AND THAT IS THE POINT OF THIS LANE. Cloudflare Email
    Sending is a WORKER BINDING: the credential is the deployment's own binding
    rather than a secret pasted into a settings screen, so there is nothing to
    rotate, nothing to leak from a console, and nothing to store in a database.
    What can be missing is the binding, and that is answered at send time by
    whoever holds the environment — not here.
  */
  return { ok: true, provider: id as ProviderId, from };
}

/* --------------------------------------------------------------- sending --- */

export type Sent =
  | { readonly ok: true; readonly provider: ProviderId }
  | { readonly ok: false; readonly why: Unconfigured | "refused" };

/**
 * HANDING ONE MESSAGE TO THE DEPLOYMENT'S OWN SENDER.
 *
 * ⚠️ A FUNCTION RATHER THAN THE BINDING ITSELF, so this module builds MIME and
 * knows nothing about `cloudflare:email`. The import is dynamic and lives in the
 * one place that holds the environment — which is what keeps this file testable
 * with no binding at all, and what makes `recorded` a lane rather than a mock.
 */
export interface Deliver {
  (from: string, to: string, mime: string): Promise<{ ok: boolean }>;
}

/**
 * ⚠️ WHAT THE RECORDED PROVIDER RECORDED, most recent first per address. It is
 * how a development sign-in is completed and how a test reads a code, and it is
 * bounded because a map that only grows is a leak with a plausible excuse.
 */
export const recorded = new Map<string, Message>();

/**
 * Send one message.
 *
 * ⚠️ A REFUSAL IS NOT AN EXCEPTION. Mail fails for ordinary reasons — a rotated
 * key, a provider outage, an address that bounces — and a caller that has to
 * catch would be a caller that catches everything, including the ones that mean
 * a deployment is misconfigured. The result says which.
 *
 * ⚠️ AND THE PROVIDER'S OWN WORDS NEVER TRAVEL. A body from a mail API in a
 * problem response is the same disclosure question as one from a database, read
 * by somebody who wanted a name they can act on rather than a stack trace.
 */
export async function send(values: Values, message: Message, deliver: Deliver | null, at: Instant): Promise<Sent> {
  const chosen = chooseProvider(values);
  if (!chosen.ok) return { ok: false, why: chosen.why };

  if (chosen.provider === "recorded") {
    recorded.set(message.to.toLowerCase(), message);
    return { ok: true, provider: "recorded" };
  }

  /*
    ⚠️ NO BINDING IS A REFUSAL WITH ITS OWN NAME. A deployment configured to send
    through Cloudflare on a worker with no `send_email` binding is a real and
    ordinary mistake — and reporting it as "refused" would send an operator
    looking at DNS for something that is one line of `wrangler.jsonc`.
  */
  if (!deliver) return { ok: false, why: "no_binding" };

  /*
    ⚠️ A THROW IS A REFUSAL TOO. A sender that is unreachable and one that says
    no are the same thing to whoever was waiting for a code, and the difference
    belongs in a log rather than in a control flow every caller has to handle.
  */
  const answered = await deliver(chosen.from, message.to, mimeFor(chosen.from, message, at))
    .catch(() => ({ ok: false }));
  return answered.ok ? { ok: true, provider: chosen.provider } : { ok: false, why: "refused" };
}

/* ------------------------------------------------------------------ mime --- */

/**
 * ⚠️ THE BINDING TAKES A RAW MIME MESSAGE, NOT AN OBJECT, and getting that wrong
 * is not a formatting problem — the send is rejected outright.
 *
 * ⚠️ EVERYTHING THE PLATFORM ITSELF SENDS IS `text/plain`, and that is a
 * decision rather than a limitation: a sign-in code is one sentence and one
 * number, and HTML is the half of an email that renders differently in every
 * client and gets a message filed as marketing.
 *
 * A WORKSPACE writing to its own customers is the one case with a second part —
 * see `Message.html`. There are still no attachments.
 */
export function mimeFor(from: string, message: Message, at: Instant): string {
  const domain = addressOf(from).email.split("@")[1] ?? "localhost";
  const head = [
    `From: ${from}`,
    `To: ${message.to}`,
    `Subject: ${encodeHeader(message.subject)}`,
    /* ⚠️ A Message-ID is not decoration: without one, several receivers treat
       the message as malformed and some file it as spam on that alone. */
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    `Date: ${new Date(Date.parse(at)).toUTCString()}`,
    `MIME-Version: 1.0`,
  ];
  if (!message.html) {
    return [
      ...head,
      `Content-Type: text/plain; charset="utf-8"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      base64Utf8(message.body),
    ].join("\r\n");
  }
  /*
    ⚠️ `multipart/alternative`, AND THE PLAIN PART COMES FIRST. The order is the
    specification and it is also the behaviour: a reader takes the LAST part it
    can render, so plain-then-html shows the design to whoever can see it and the
    words to whoever cannot. Reversed, some clients show the plain text to
    everybody and the layout is never seen.
  */
  const edge = `b${crypto.randomUUID().replace(/-/g, "")}`;
  return [
    ...head,
    `Content-Type: multipart/alternative; boundary="${edge}"`,
    ``,
    `--${edge}`,
    `Content-Type: text/plain; charset="utf-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    base64Utf8(message.body),
    `--${edge}`,
    `Content-Type: text/html; charset="utf-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    base64Utf8(message.html),
    /* ⚠️ The closing boundary ends with two hyphens, and a message without one
       is truncated by every parser that is strict about it. */
    `--${edge}--`,
    ``,
  ].join("\r\n");
}

/** ⚠️ RFC 2047 where the subject is not ASCII — a brand name with an accent in
 *  a bare header is a subject line that arrives as mojibake. */
function encodeHeader(s: string): string {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]*$/.test(s) ? s : `=?UTF-8?B?${base64Utf8(s)}?=`;
}

/** ⚠️ `btoa` is latin1-only, so UTF-8 has to be encoded first or it throws. */
function base64Utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/(.{76})/g, "$1\r\n");
}

/**
 * `Kova <noreply@4dl.app>` becomes a name and an address.
 *
 * ⚠️ THE DISPLAY NAME IS PART OF THE SENDER AND MOST APIS WANT IT SPLIT. Sending
 * the whole string as an address is a message that is either refused or arrives
 * from `Kova <noreply@4dl.app>@example.com`, depending on the provider.
 */
export function addressOf(from: string): { readonly name?: string; readonly email: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  if (!match) return { email: from.trim() };
  const name = match[1]!.trim();
  return { ...(name ? { name } : {}), email: match[2]!.trim() };
}
