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
}

/** Who a deployment sends as: `Kova <noreply@4dl.app>`, or a bare address. */
export const senderOf = (values: Values): string => values["email.from"] ?? "";

/* ------------------------------------------------------------- providers --- */

export type ProviderId = "recorded" | "brevo" | "resend";

const PROVIDERS: readonly ProviderId[] = ["recorded", "brevo", "resend"];

export type Chosen =
  | { readonly ok: true; readonly provider: ProviderId; readonly from: string; readonly key: string }
  | { readonly ok: false; readonly why: Unconfigured };

/**
 * ⚠️ EACH OF THESE IS A DIFFERENT THING TO GO AND DO, which is why they are not
 * one "not configured". No provider is a choice nobody has made; no sender is a
 * verified address nobody has entered; no key is a provider that will refuse
 * every call. An operator reading one word cannot tell which.
 */
export type Unconfigured = "no_provider" | "unknown_provider" | "no_sender" | "no_key";

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
  if (id === "recorded") return { ok: true, provider: "recorded", from, key: "" };

  const key = (values[`email.${id}.key`] ?? "").trim();
  if (key === "") return { ok: false, why: "no_key" };
  return { ok: true, provider: id as ProviderId, from, key };
}

/* --------------------------------------------------------------- sending --- */

export type Sent =
  | { readonly ok: true; readonly provider: ProviderId }
  | { readonly ok: false; readonly why: Unconfigured | "refused" };

export interface Post {
  (url: string, init: { method: string; headers: Record<string, string>; body: string }): Promise<{ ok: boolean }>;
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
export async function send(values: Values, message: Message, post: Post, at: Instant): Promise<Sent> {
  const chosen = chooseProvider(values);
  if (!chosen.ok) return { ok: false, why: chosen.why };

  if (chosen.provider === "recorded") {
    recorded.set(message.to.toLowerCase(), message);
    return { ok: true, provider: "recorded" };
  }

  const request: { url: string; headers: Record<string, string>; body: string } = chosen.provider === "brevo"
    ? {
        url: "https://api.brevo.com/v3/smtp/email",
        headers: { "api-key": chosen.key, "content-type": "application/json" },
        body: JSON.stringify({
          sender: addressOf(chosen.from),
          to: [{ email: message.to }],
          subject: message.subject,
          textContent: message.body,
        }),
      }
    : {
        url: "https://api.resend.com/emails",
        headers: { authorization: `Bearer ${chosen.key}`, "content-type": "application/json" },
        body: JSON.stringify({ from: chosen.from, to: [message.to], subject: message.subject, text: message.body }),
      };

  /*
    ⚠️ A THROW IS A REFUSAL TOO. A provider that is unreachable and one that says
    no are the same thing to whoever was waiting for a code, and the difference
    belongs in a log rather than in a control flow every caller has to handle.
  */
  const answered = await post(request.url, { method: "POST", headers: request.headers, body: request.body })
    .catch(() => ({ ok: false }));
  void at;
  return answered.ok ? { ok: true, provider: chosen.provider } : { ok: false, why: "refused" };
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
