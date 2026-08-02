/**
 * The DNS pre-flight, against a fake resolver.
 *
 * The `double-suffix` case is the reason this module exists and is asserted
 * against the exact answers a real domain gave: `coaching.byshujaa.com`
 * NXDOMAIN, `coaching.byshujaa.com.byshujaa.com` a perfectly good CNAME to
 * `saas.4dl.app`. Cloudflare's report of that state was "custom hostname does
 * not CNAME to this zone", which is true and tells you nothing.
 */

import { describe, expect, it } from "vitest";
import { checkCname, zoneCandidates, type DnsAnswer, type DnsLookup } from "../src/dns-check.js";

const NX: DnsAnswer = { status: 3, records: [] };
const cname = (to: string): DnsAnswer => ({ status: 0, records: [{ type: 5, data: to }] });
const a = (ip: string): DnsAnswer => ({ status: 0, records: [{ type: 1, data: ip }] });

/** A resolver that answers from a map and NXDOMAINs everything else. */
function resolver(answers: Record<string, DnsAnswer>): DnsLookup & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (name, type) => {
    calls.push(`${name}/${type}`);
    return answers[name] ?? NX;
  }) as DnsLookup & { calls: string[] };
  fn.calls = calls;
  return fn;
}

describe("zoneCandidates", () => {
  it("offers every suffix a registrar could have appended, longest first", () => {
    expect(zoneCandidates("coaching.byshujaa.com")).toEqual(["byshujaa.com"]);
    expect(zoneCandidates("a.b.shop.co.uk")).toEqual(["b.shop.co.uk", "shop.co.uk", "co.uk"]);
  });

  /** No public-suffix list, so no wrong answer about an unusual TLD either —
   *  the question is "which zone could have been appended", not "where does the
   *  registrable domain start". */
  it("never offers the bare TLD or the name itself", () => {
    expect(zoneCandidates("shop.co.uk")).toEqual(["co.uk"]);
    expect(zoneCandidates("example.com")).toEqual([]);
  });
});

describe("checkCname", () => {
  it("passes a hostname that points where it should", async () => {
    const r = resolver({ "coaching.byshujaa.com": cname("saas.4dl.app.") });
    expect((await checkCname("coaching.byshujaa.com", "saas.4dl.app", r)).code).toBe("ok");
  });

  it("ignores the trailing dot on either side", async () => {
    const r = resolver({ "coaching.byshujaa.com": cname("saas.4dl.app.") });
    expect((await checkCname("coaching.byshujaa.com.", "saas.4dl.app.", r)).code).toBe("ok");
  });

  /**
   * The case this module was written for, with the answers a real domain gave.
   */
  it("names the relative-Host mistake, and the label that fixes it", async () => {
    const r = resolver({ "coaching.byshujaa.com.byshujaa.com": cname("saas.4dl.app.") });
    const f = await checkCname("coaching.byshujaa.com", "saas.4dl.app", r);
    expect(f.code).toBe("double-suffix");
    expect(f.publishedAt).toBe("coaching.byshujaa.com.byshujaa.com");
    expect(f.hostShouldBe).toBe("coaching");
    expect(f.message).toContain("one level too deep");
  });

  it("finds the same mistake under a multi-label suffix", async () => {
    const r = resolver({ "app.gym.co.uk.gym.co.uk": cname("saas.4dl.app.") });
    const f = await checkCname("app.gym.co.uk", "saas.4dl.app", r);
    expect(f.code).toBe("double-suffix");
    expect(f.hostShouldBe).toBe("app");
  });

  it("reports a plain absence when nothing is published anywhere", async () => {
    const r = resolver({});
    const f = await checkCname("coaching.byshujaa.com", "saas.4dl.app", r);
    expect(f.code).toBe("missing");
    // The deeper probe still ran — "missing" is a conclusion, not a first guess.
    expect(r.calls).toContain("coaching.byshujaa.com.byshujaa.com/CNAME");
  });

  it("names the target it found when the CNAME points elsewhere", async () => {
    const r = resolver({ "coaching.byshujaa.com": cname("custom.involve.me.") });
    const f = await checkCname("coaching.byshujaa.com", "saas.4dl.app", r);
    expect(f.code).toBe("wrong-target");
    expect(f.actualTarget).toBe("custom.involve.me");
    // A second CNAME is not the fix, and saying so prevents the next attempt.
    expect(f.message).toContain("only one CNAME");
  });

  /** NOERROR with no CNAME, then an A at the same name — someone pointed the
   *  record at an IP. It cannot work here: the address behind the target moves. */
  it("catches an A record where a CNAME is required", async () => {
    const lookup: DnsLookup = async (n, t) =>
      n === "coaching.byshujaa.com" && t === "A" ? a("1.2.3.4") : { status: 0, records: [] };
    const f = await checkCname("coaching.byshujaa.com", "saas.4dl.app", lookup);
    expect(f.code).toBe("not-a-cname");
  });

  /** A resolver failure is not a DNS verdict. Saying "your record is missing"
   *  when we could not look would send someone to re-add a correct record. */
  it("does not turn a lookup failure into a verdict about the records", async () => {
    const f = await checkCname("coaching.byshujaa.com", "saas.4dl.app", async () => ({ status: -1, records: [] }));
    expect(f.code).toBe("unknown");
    expect(f.message).toContain("not with your records");
  });
});
