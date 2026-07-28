/**
 * Teach this process that `*.localhost` is loopback.
 *
 * RFC 6761 §6.3 reserves `.localhost` and says resolvers SHOULD answer it as
 * loopback without consulting DNS. Browsers do this internally, macOS and any
 * Linux running systemd-resolved do it, and GitHub Actions runners do it — but a
 * minimal container image often does not, because it resolves through a bare
 * `/etc/hosts` that lists only `localhost` itself. There the suite dies at the
 * first request with `getaddrinfo ENOTFOUND setup.localhost`.
 *
 * The suite needs `*.localhost` because Kova is subdomain-first: the doors under
 * test (`setup.`, `admin.`, `<slug>.`) ARE hostnames, and testing them on a single
 * origin would test something the product does not do. The alternatives were both
 * worse — a wildcard public domain like `localtest.me` makes `pnpm e2e` depend on
 * outbound DNS from a clean checkout, and writing `/etc/hosts` needs root and
 * cannot express a wildcard for the per-run studio slugs.
 *
 * So: patch `dns.lookup`, which is what Node (and therefore Playwright's
 * `APIRequestContext`) uses, and only for names ending in `.localhost`. Everything
 * else falls through to the real resolver untouched. Chromium is handled
 * separately, by `--host-resolver-rules` in playwright.config.ts.
 */

import dns from "node:dns";

type LookupCb = (err: NodeJS.ErrnoException | null, address: unknown, family?: number) => void;

const LOOPBACK_V4 = "127.0.0.1";

function isDotLocalhost(hostname: string): boolean {
  return typeof hostname === "string" && hostname.toLowerCase().endsWith(".localhost");
}

let installed = false;

/** Idempotent — every spec imports this transitively. */
export function installLocalhostResolver(): void {
  if (installed) return;
  installed = true;

  const original = dns.lookup.bind(dns) as unknown as (...args: unknown[]) => void;

  const patched = (hostname: string, ...rest: unknown[]): void => {
    if (!isDotLocalhost(hostname)) return original(hostname, ...rest);

    const cb = rest[rest.length - 1] as LookupCb;
    const options = (rest.length > 1 ? rest[0] : undefined) as { all?: boolean } | number | undefined;
    // `dns.lookup(host, { all: true }, cb)` expects an array of records; the other
    // forms expect (address, family). Getting this wrong surfaces as a confusing
    // type error deep inside undici rather than as a resolver problem.
    const all = typeof options === "object" && options !== null && options.all === true;
    queueMicrotask(() =>
      all ? cb(null, [{ address: LOOPBACK_V4, family: 4 }]) : cb(null, LOOPBACK_V4, 4),
    );
  };

  // `dns.lookup` carries a promisified twin that `dns/promises` and some clients
  // reach for; without it they would bypass the patch entirely.
  (patched as unknown as { __promisify__: unknown }).__promisify__ = async (
    hostname: string,
    options?: { all?: boolean },
  ) =>
    !isDotLocalhost(hostname)
      ? (dns.promises.lookup as unknown as (h: string, o?: unknown) => Promise<unknown>)(hostname, options)
      : options?.all
        ? [{ address: LOOPBACK_V4, family: 4 }]
        : { address: LOOPBACK_V4, family: 4 };

  (dns as unknown as { lookup: unknown }).lookup = patched;
}
