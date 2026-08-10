/**
 * ASKING SOMEBODY ELSE'S SERVER — the one lane out of this worker that is not
 * mail or a model.
 *
 * ⚠️ AN OUTBOUND REQUEST IS A CAPABILITY, NOT A CONVENIENCE, and the reason is
 * where this code runs. A worker sits inside a network; a URL a caller can
 * influence is a request made FROM that position, to an address the caller
 * chose, with whatever the worker's identity gets it. That is server-side
 * request forgery, and the classic form is not exotic — it is a product that
 * takes a barcode, builds `https://api.example/v1/${code}`, and one day is handed
 * a code containing `../` or a whole other host.
 *
 * So this file has one shape: an app declares the SERVICES it may reach, by
 * host, and a caller may only ever supply values that are escaped into a path or
 * a query. There is no way to hand this a URL.
 *
 * ⚠️ AND THE ANSWER IS SIZE-BOUNDED AND TIME-BOUNDED. A worker that awaits an
 * unbounded body from a service that has stopped responding is a request holding
 * a connection until the platform kills it, and the symptom is a product that is
 * slow rather than one that is broken.
 */

import type { Instant, Services } from "@one/kernel";
import type { Values } from "./config.js";

/* ------------------------------------------------------------- refusals --- */

export type LookupRefusal = "unknown_service" | "unconfigured" | "refused" | "too_large" | "unreadable";

export type Looked<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly why: LookupRefusal; readonly status?: number };

/**
 * ⚠️ A CEILING ON WHAT SOMEBODY ELSE'S SERVER MAY HAND US. Without it a service
 * having a bad day — or one that decides to answer a barcode lookup with a
 * megabyte of HTML — is a worker that runs out of memory on a request nobody
 * could have predicted.
 */
export const MAX_ANSWER_BYTES = 512 * 1024;

/** ⚠️ Long enough for a slow service, short enough that a hung one is not us. */
export const LOOKUP_TIMEOUT_MS = 5_000;

export interface Fetcher {
  (url: string, init: { method: string; headers: Record<string, string>; signal?: AbortSignal }): Promise<{
    readonly ok: boolean;
    readonly status: number;
    text(): Promise<string>;
  }>;
}

export interface LookupInput {
  readonly services: Services;
  readonly values: Values;
  readonly fetcher: Fetcher;
  readonly service: string;
  /**
   * ⚠️ SEGMENTS, NOT A PATH. Each is escaped, so a caller's value carrying `/`,
   * `?` or `..` becomes those characters IN a segment rather than structure in a
   * URL. That is the whole defence and it is why this is a list.
   */
  readonly path: readonly string[];
  readonly query?: Readonly<Record<string, string>>;
  readonly at: Instant;
}

/**
 * Ask a declared service something.
 *
 * ⚠️ THE URL IS BUILT HERE AND NOWHERE ELSE. Every part a caller influences goes
 * through `encodeURIComponent`, and the host comes from the declaration — so a
 * value containing a host, a scheme or a traversal is a strange-looking segment
 * rather than a different request.
 */
export async function look<T = unknown>(input: LookupInput): Promise<Looked<T>> {
  const service = input.services[input.service];
  if (!service) return { ok: false, why: "unknown_service" };

  const headers: Record<string, string> = { accept: "application/json" };
  if (service.keyConfig) {
    const key = (input.values[service.keyConfig] ?? "").trim();
    /*
      ⚠️ AN EMPTY KEY IS UNCONFIGURED, NOT OPEN. Sending an empty header to a
      service that requires one gets a 401 the caller reads as "that food does
      not exist" — a wrong answer where a refusal was available.
    */
    if (key === "") return { ok: false, why: "unconfigured" };
    headers[service.keyHeader ?? "authorization"] = key;
  }

  const path = input.path.map((p) => encodeURIComponent(p)).join("/");
  const query = new URLSearchParams(input.query ?? {}).toString();
  const url = `https://${service.host}/${path}${query ? `?${query}` : ""}`;

  /*
    ⚠️ THE TIMEOUT IS OURS RATHER THAN THE SERVICE'S. A request with no deadline
    is one whose duration is decided by somebody else's outage, and the symptom
    is a product that is slow rather than one that says a lookup did not work.
  */
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const answered = await input.fetcher(url, { method: "GET", headers, signal: abort.signal });
    if (!answered.ok) return { ok: false, why: "refused", status: answered.status };

    const text = await answered.text();
    /*
      ⚠️ MEASURED AFTER READING, WHICH IS THE HONEST BOUND AVAILABLE HERE. A
      content-length can be absent or wrong; what protects the worker is that the
      value is discarded rather than parsed and passed on.
    */
    if (text.length > MAX_ANSWER_BYTES) return { ok: false, why: "too_large" };
    try {
      return { ok: true, value: JSON.parse(text) as T };
    } catch {
      /* ⚠️ A service answering with something that is not what it said is a
         refusal, not an exception — it is an ordinary Tuesday for a third party. */
      return { ok: false, why: "unreadable" };
    }
  } catch {
    return { ok: false, why: "refused" };
  } finally {
    clearTimeout(timer);
  }
}



/* ------------------------------------------------------------ the seam --- */

/** ⚠️ A symbol, so an app cannot reach the network by writing a property name. */
export const LOOKUP = Symbol.for("one.runtime.lookup");

export interface LookupDeps {
  readonly services: Services;
  values(): Promise<Values>;
  readonly fetcher: Fetcher;
}

export interface LookupCarrier { readonly [LOOKUP]: LookupDeps }

/**
 * Ask a declared service, from inside an app's own handler.
 *
 * ⚠️ THE SERVICE IS NAMED AND THE PARTS ARE SEGMENTS. There is no argument here
 * that could carry a URL, which is the whole design: an app cannot build a
 * request to somewhere its manifest did not declare, however its caller's input
 * is shaped.
 */
export async function lookUp<T = unknown>(
  ctx: { now(): Instant },
  service: string,
  path: readonly string[],
  query?: Readonly<Record<string, string>>,
): Promise<Looked<T>> {
  const d = (ctx as unknown as LookupCarrier)[LOOKUP];
  return look<T>({
    services: d.services, values: await d.values(), fetcher: d.fetcher,
    service, path, ...(query ? { query } : {}), at: ctx.now(),
  });
}

/**
 * ⚠️ EACH REFUSAL IS A DIFFERENT THING TO DO NEXT, so they do not collapse into
 * one "lookup failed". `unconfigured` is nobody's fault but ours and needs an
 * operator; `refused` is worth trying again; `unreadable` and `too_large` are
 * the service being wrong in a way retrying will not fix.
 */
export function lookupProblem(why: LookupRefusal): {
  readonly code: "platform.unavailable" | "platform.not_found";
  readonly meta: Readonly<Record<string, string>>;
} {
  switch (why) {
    /* ⚠️ A service that answered NO is not an outage — it is usually "there is
       no such barcode", which is a not-found rather than a broken product. */
    case "refused": return { code: "platform.not_found", meta: { reason: why } };
    default: return { code: "platform.unavailable", meta: { reason: why } };
  }
}
