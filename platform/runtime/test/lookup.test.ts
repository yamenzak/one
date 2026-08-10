/**
 * ASKING SOMEBODY ELSE'S SERVER — the one lane out of this worker that is not
 * mail or a model.
 *
 * ⚠️ THE WHOLE SUBJECT OF THIS FILE IS THAT A CALLER'S VALUE MAY NOT BECOME A
 * REQUEST. A worker sits inside a network, so a URL somebody else influences is a
 * request made FROM that position with whatever this identity gets — and the
 * classic form is not exotic. It is a product that takes a barcode, builds
 * `https://api.example/v1/${code}`, and one day is handed a code containing a
 * traversal or a whole other host.
 *
 * The defence is not validation. It is that there is no argument here that could
 * carry a URL: the host comes from a declaration, and every part a caller
 * supplies is escaped into a segment.
 */

import { describe, expect, it, vi } from "vitest";
import { serviceProblems, type Services } from "@one/kernel";
import { look, lookupProblem, MAX_ANSWER_BYTES, type Fetcher } from "../src/lookup.js";

const SERVICES: Services = {
  food: { host: "world.openfoodfacts.org", label: "Open Food Facts" },
  keyed: { host: "api.example.test", label: "Something paid", keyConfig: "some.key", keyHeader: "x-key" },
};

/** Records what was asked and answers with whatever it was given. */
const answering = (
  answer: { ok?: boolean; status?: number; text?: string } = {},
): { fetcher: Fetcher; asked: string[]; headers: Record<string, string>[] } => {
  const asked: string[] = [];
  const headers: Record<string, string>[] = [];
  const fetcher: Fetcher = async (url, init) => {
    asked.push(url);
    headers.push(init.headers);
    return {
      ok: answer.ok ?? true,
      status: answer.status ?? 200,
      text: async () => answer.text ?? `{"ok":1}`,
    };
  };
  return { fetcher, asked, headers };
};

/* ---------------------------------------------------------- the address --- */

describe("where a lookup goes", () => {
  it("asks the declared host, over https, at the segments it was given", async () => {
    const { fetcher, asked } = answering();
    const out = await look({
      services: SERVICES, values: {}, fetcher, service: "food",
      path: ["api", "v2", "product", "5000112637922"], at: "2026-08-10T00:00:00.000Z" as never,
    });
    expect(out.ok).toBe(true);
    expect(asked[0]).toBe("https://world.openfoodfacts.org/api/v2/product/5000112637922");
  });

  /*
    ⚠️ THE ONE THAT MATTERS. Every character below has structural meaning in a
    URL, and a product that pasted the caller's value into a template would have
    made a request to a different path — or, with `@`, to a different HOST.
  */
  it("cannot be talked into another path by a value that looks like one", async () => {
    const { fetcher, asked } = answering();
    for (const nasty of ["../../admin", "a/b", "?x=1", "#frag", "evil.test/x", "..%2f..", " "]) {
      await look({
        services: SERVICES, values: {}, fetcher, service: "food",
        path: ["product", nasty], at: "2026-08-10T00:00:00.000Z" as never,
      });
    }
    for (const url of asked) {
      expect(url.startsWith("https://world.openfoodfacts.org/product/")).toBe(true);
      /* Nothing after the escaped segment: no second path element, no query, no fragment. */
      expect(url.slice("https://world.openfoodfacts.org/product/".length)).not.toMatch(/[/?#]/);
    }
  });

  /* ⚠️ AND NOT TO ANOTHER HOST. `@` in a path segment is what turns an
     authority into a userinfo and moves the request somewhere else entirely. */
  it("cannot be talked into another host", async () => {
    const { fetcher, asked } = answering();
    await look({
      services: SERVICES, values: {}, fetcher, service: "food",
      path: ["x@attacker.test", "y"], at: "2026-08-10T00:00:00.000Z" as never,
    });
    expect(new URL(asked[0]!).hostname).toBe("world.openfoodfacts.org");
  });

  it("refuses a service nobody declared", async () => {
    const { fetcher, asked } = answering();
    const out = await look({
      services: SERVICES, values: {}, fetcher, service: "somewhere-else",
      path: ["x"], at: "2026-08-10T00:00:00.000Z" as never,
    });
    expect(out).toEqual({ ok: false, why: "unknown_service" });
    expect(asked).toEqual([]);
  });
});

/* ------------------------------------------------------------- the key --- */

describe("a service that wants a key", () => {
  it("sends it under the header the declaration names", async () => {
    const { fetcher, headers } = answering();
    const out = await look({
      services: SERVICES, values: { "some.key": "sekrit" }, fetcher, service: "keyed",
      path: ["x"], at: "2026-08-10T00:00:00.000Z" as never,
    });
    expect(out.ok).toBe(true);
    expect(headers[0]!["x-key"]).toBe("sekrit");
  });

  /*
    ⚠️ AN EMPTY KEY IS UNCONFIGURED, NOT OPEN. Sending an empty header gets a 401
    the caller reads as "there is no such food" — a wrong answer where a refusal
    naming the operator's own omission was available.
  */
  it("does not ask at all when the key is missing", async () => {
    const { fetcher, asked } = answering();
    const out = await look({
      services: SERVICES, values: { "some.key": "   " }, fetcher, service: "keyed",
      path: ["x"], at: "2026-08-10T00:00:00.000Z" as never,
    });
    expect(out).toEqual({ ok: false, why: "unconfigured" });
    expect(asked).toEqual([]);
  });
});

/* ---------------------------------------------------------- the answer --- */

describe("what comes back", () => {
  it("carries the status a service refused with", async () => {
    const { fetcher } = answering({ ok: false, status: 404 });
    expect(await look({
      services: SERVICES, values: {}, fetcher, service: "food",
      path: ["x"], at: "2026-08-10T00:00:00.000Z" as never,
    })).toEqual({ ok: false, why: "refused", status: 404 });
  });

  /* ⚠️ A third party answering with something that is not what it said is an
     ordinary Tuesday, not an exception for every caller to catch. */
  it("treats unparseable JSON as a refusal rather than throwing", async () => {
    const { fetcher } = answering({ text: "<!doctype html><html>we moved</html>" });
    expect(await look({
      services: SERVICES, values: {}, fetcher, service: "food",
      path: ["x"], at: "2026-08-10T00:00:00.000Z" as never,
    })).toEqual({ ok: false, why: "unreadable" });
  });

  it("treats a throw the same way", async () => {
    const fetcher: Fetcher = async () => { throw new Error("dns"); };
    expect(await look({
      services: SERVICES, values: {}, fetcher, service: "food",
      path: ["x"], at: "2026-08-10T00:00:00.000Z" as never,
    })).toEqual({ ok: false, why: "refused" });
  });

  /*
    ⚠️ A CEILING ON WHAT SOMEBODY ELSE MAY HAND US, and it is discarded rather
    than parsed. A service having a bad day — or one that answers a barcode
    lookup with a megabyte of HTML — must not be a worker that runs out of
    memory on a request nobody could have predicted.
  */
  it("discards an answer past the ceiling instead of parsing it", async () => {
    const huge = `{"a":"${"x".repeat(MAX_ANSWER_BYTES)}"}`;
    const { fetcher } = answering({ text: huge });
    expect(await look({
      services: SERVICES, values: {}, fetcher, service: "food",
      path: ["x"], at: "2026-08-10T00:00:00.000Z" as never,
    })).toEqual({ ok: false, why: "too_large" });
  });

  /* ⚠️ AND THE DEADLINE IS OURS. A request with no signal is one whose duration
     is decided by somebody else's outage. */
  it("hands the fetcher something to abort with", async () => {
    const seen: (AbortSignal | undefined)[] = [];
    const fetcher: Fetcher = async (_url, init) => {
      seen.push(init.signal);
      return { ok: true, status: 200, text: async () => "{}" };
    };
    await look({
      services: SERVICES, values: {}, fetcher, service: "food",
      path: ["x"], at: "2026-08-10T00:00:00.000Z" as never,
    });
    expect(seen[0]).toBeInstanceOf(AbortSignal);
    expect(seen[0]!.aborted).toBe(false);
  });

  it("aborts once the deadline passes", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const fetcher: Fetcher = (_url, init) => {
        signal = init.signal;
        return new Promise(() => undefined) as never;
      };
      void look({
        services: SERVICES, values: {}, fetcher, service: "food",
        path: ["x"], at: "2026-08-10T00:00:00.000Z" as never,
      });
      await Promise.resolve();
      expect(signal!.aborted).toBe(false);
      vi.advanceTimersByTime(10_000);
      expect(signal!.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

/* --------------------------------------------------------- the refusals --- */

describe("what a caller is told", () => {
  /*
    ⚠️ A SERVICE THAT ANSWERED NO IS NOT AN OUTAGE. For every lookup this
    platform makes it means "there is no such barcode" — and reporting that as
    503 tells somebody to come back later about a thing that will never exist.
  */
  it("reports a refusal as not-found and everything else as unavailable", () => {
    expect(lookupProblem("refused").code).toBe("platform.not_found");
    for (const why of ["unknown_service", "unconfigured", "too_large", "unreadable"] as const) {
      expect(lookupProblem(why).code, why).toBe("platform.unavailable");
    }
  });

  /* ⚠️ And each carries WHICH, because `unconfigured` is an operator's job and
     `refused` is worth trying again. */
  it("says which one it was", () => {
    expect(lookupProblem("unconfigured").meta).toEqual({ reason: "unconfigured" });
  });
});

/* ------------------------------------------------------- the declaration --- */

describe("what may be declared as a service", () => {
  it("accepts an ordinary public host", () => {
    expect(serviceProblems({ ok: { host: "world.openfoodfacts.org", label: "x" } })).toEqual([]);
  });

  /*
    ⚠️ A HOST, NEVER A BASE URL. Accepting `https://host/v2` would put a path in
    front of every escaped segment — and a `//` or a `@` in it moves the request
    somewhere else, at composition time, where no caller input is involved at all.
  */
  it("refuses a URL where a host belongs", () => {
    for (const host of ["https://x.example.test", "x.example.test/v2", "x.example.test?a=1", "*.example.test"]) {
      expect(serviceProblems({ bad: { host, label: "x" } }), host).not.toEqual([]);
    }
  });

  /*
    ⚠️ AND IT REFUSES THE INSIDE OF THE NETWORK. A worker's own position is what
    makes SSRF worth doing: loopback and the private ranges are where a metadata
    endpoint, an admin panel and an unauthenticated internal service live.
  */
  it("refuses anything pointed inside", () => {
    for (const host of ["localhost", "127.0.0.1", "10.1.2.3", "192.168.0.1", "169.254.169.254", "::1", "172.20.0.5"]) {
      expect(serviceProblems({ bad: { host, label: "x" } }), host).not.toEqual([]);
    }
  });

  /* ⚠️ A bare label is a name a resolver completes from a search domain — which
     is how `metadata` becomes an internal host on somebody's network. */
  it("refuses a host with no dot", () => {
    expect(serviceProblems({ bad: { host: "metadata", label: "x" } })).not.toEqual([]);
  });

  /* ⚠️ A header with no key names nothing, so the request goes out
     unauthenticated and is refused — which reads as "no such food". */
  it("refuses a key header with no key behind it", () => {
    expect(serviceProblems({ bad: { host: "x.example.test", label: "x", keyHeader: "x-key" } })).not.toEqual([]);
  });
});
