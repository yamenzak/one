/**
 * WHAT IS ACTUALLY PUBLISHED — a live DNS read, in the tenant's own terms.
 *
 * Cloudflare's answer when a custom hostname will not verify is
 * "custom hostname does not CNAME to this zone." That sentence is true and
 * unactionable: it says the record is not there, not where it went. So the
 * tenant re-reads the value they pasted, sees it is correct, pastes it again,
 * and waits.
 *
 * ── The mistake this exists to name ─────────────────────────────────────────
 *
 * Most registrars' DNS editors treat the **Host** field as RELATIVE to the
 * zone. Namecheap, GoDaddy, Hostinger and Squarespace all do. Our screen tells
 * the tenant to create a record called `coaching.byshujaa.com`, they paste that
 * whole thing into Host, and the registrar publishes:
 *
 *     coaching.byshujaa.com.byshujaa.com.  CNAME  saas.4dl.app.
 *
 * The record exists. It is correct. It is one label too deep, and every check
 * anywhere — ours, Cloudflare's, the CA's — reports the hostname as simply
 * absent. This was observed end to end on a real domain: `coaching.byshujaa.com`
 * returned NXDOMAIN while `coaching.byshujaa.com.byshujaa.com` answered with
 * exactly the right CNAME, and the three TXT records had gone the same way.
 *
 * There is no way to prevent it from our side — we do not control the
 * registrar's form. What we can do is LOOK, and say the sentence that ends it:
 * "your provider added the zone name for you; put `coaching` in the Host field."
 *
 * ── Why DNS-over-HTTPS ──────────────────────────────────────────────────────
 *
 * Workers have no DNS resolver API — `fetch` is the only way out. Cloudflare's
 * public DoH endpoint answers JSON, is reachable from a Worker, and is the same
 * resolver Cloudflare's own validation uses, so a disagreement between this and
 * the custom-hostname status is meaningful rather than noise.
 *
 * The resolver is INJECTED (`lookup`), so the tests are a map from question to
 * answer and never touch the network.
 */

const DOH = "https://cloudflare-dns.com/dns-query";

/** One DNS answer, flattened to what this module needs. */
export interface DnsAnswer {
  /** NOERROR = 0, NXDOMAIN = 3. Anything else is treated as "cannot tell". */
  status: number;
  /** `{ type, data }` per record, with `type` as the numeric RR type. */
  records: { type: number; data: string }[];
}

export type DnsLookup = (name: string, type: "CNAME" | "A" | "AAAA") => Promise<DnsAnswer>;

const RR = { A: 1, CNAME: 5, AAAA: 28 } as const;

/** The default resolver: Cloudflare's public DoH, JSON flavour. */
export const dohLookup: DnsLookup = async (name, type) => {
  const res = await fetch(`${DOH}?name=${encodeURIComponent(name)}&type=${type}`, {
    headers: { accept: "application/dns-json" },
  });
  if (!res.ok) return { status: -1, records: [] };
  const body = (await res.json().catch(() => null)) as { Status?: number; Answer?: { type?: number; data?: string }[] } | null;
  if (!body || typeof body.Status !== "number") return { status: -1, records: [] };
  return {
    status: body.Status,
    records: (body.Answer ?? []).map((a) => ({ type: Number(a.type ?? 0), data: String(a.data ?? "") })),
  };
};

/** Trailing dots are presentation, not identity. */
const canon = (s: string): string => s.trim().replace(/\.+$/, "").toLowerCase();

/**
 * Every suffix of `hostname` a registrar could have appended, longest first.
 *
 * Deliberately NOT a public-suffix lookup. We are not asking "what is the
 * registrable domain" — we are asking "if the editor appended its zone, which
 * zone could that have been", and the answer is any proper suffix with at least
 * two labels. `coaching.byshujaa.com` yields one candidate; `a.b.shop.co.uk`
 * yields three. Three extra DNS reads on a failing domain is a fair price for
 * needing no PSL and never being wrong about an unusual TLD.
 */
export function zoneCandidates(hostname: string): string[] {
  const labels = canon(hostname).split(".");
  const out: string[] = [];
  for (let i = 1; i < labels.length - 1; i++) out.push(labels.slice(i).join("."));
  return out;
}

export type DnsCode =
  | "ok"
  | "double-suffix"
  | "wrong-target"
  | "not-a-cname"
  | "missing"
  | "unknown";

export interface DnsFinding {
  code: DnsCode;
  /** Plain-language, addressed to the person editing the DNS. */
  message: string;
  /** For `double-suffix`: the name the record was actually published at. */
  publishedAt?: string;
  /** For `double-suffix`: what the Host field should have said. */
  hostShouldBe?: string;
  /** For `wrong-target`: where it points now. */
  actualTarget?: string;
}

/**
 * Is `hostname` a CNAME to `expected`, and if not, what went wrong?
 *
 * Answers only about DNS. A domain can pass every check here and still not
 * serve — the certificate has to issue, the worker route has to exist — which
 * is why this is reported ALONGSIDE Cloudflare's status rather than instead of
 * it. The two disagreeing is itself information.
 */
export async function checkCname(hostname: string, expected: string, lookup: DnsLookup = dohLookup): Promise<DnsFinding> {
  const host = canon(hostname);
  const want = canon(expected);

  const direct = await lookup(host, "CNAME").catch(() => ({ status: -1, records: [] }) as DnsAnswer);

  if (direct.status === 0) {
    const cname = direct.records.find((r) => r.type === RR.CNAME);
    if (cname) {
      const got = canon(cname.data);
      return got === want
        ? { code: "ok", message: `${host} points at ${want}.` }
        : {
            code: "wrong-target",
            actualTarget: got,
            message: `${host} is a CNAME to ${got}, but it must point at ${want}. Change the record's value — do not add a second one; a name can hold only one CNAME.`,
          };
    }
    // NOERROR with no CNAME: something else is published at this name.
    const addr = await lookup(host, "A").catch(() => ({ status: -1, records: [] }) as DnsAnswer);
    if (addr.records.some((r) => r.type === RR.A || r.type === RR.AAAA)) {
      return {
        code: "not-a-cname",
        message: `${host} has an A record. It has to be a CNAME to ${want} — an IP address cannot be used here, because the address behind ${want} changes.`,
      };
    }
    return { code: "missing", message: `${host} exists but has no CNAME. Add a CNAME record pointing it at ${want}.` };
  }

  if (direct.status === 3) {
    /**
     * NXDOMAIN. Before reporting "nothing there", check whether the record was
     * published one level too deep — the relative-Host mistake. This is the
     * branch the whole module exists for.
     */
    for (const zone of zoneCandidates(host)) {
      const deeper = `${host}.${zone}`;
      const probe = await lookup(deeper, "CNAME").catch(() => ({ status: -1, records: [] }) as DnsAnswer);
      if (probe.status !== 0 || !probe.records.some((r) => r.type === RR.CNAME)) continue;
      const label = host.slice(0, host.length - zone.length - 1);
      return {
        code: "double-suffix",
        publishedAt: deeper,
        hostShouldBe: label,
        message:
          `The record is published at ${deeper}, one level too deep — your DNS provider adds the domain name to whatever you type in the Host field. ` +
          `Edit the record and put just "${label}" in Host, not the full "${host}".`,
      };
    }
    return {
      code: "missing",
      message: `${host} does not exist in DNS. Add a CNAME record pointing it at ${want}, then check again — a new record can take a few minutes to appear.`,
    };
  }

  return { code: "unknown", message: `Could not read DNS for ${host} just now. This is a problem with the lookup, not with your records — try again shortly.` };
}
