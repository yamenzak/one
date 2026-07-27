import { describe, expect, it } from "vitest";
import { apexOf, caaFixFromErrors } from "../src/dcv.js";

describe("apexOf — where a CAA record has to go", () => {
  it("takes the registrable apex, because CAA cannot sit on a CNAMEd hostname", () => {
    // DNS forbids other records alongside a CNAME, so `coaching.byshujaa.com`
    // cannot carry a CAA and it must be set at the apex.
    expect(apexOf("coaching.byshujaa.com")).toBe("byshujaa.com");
    expect(apexOf("a.b.c.example.com")).toBe("example.com");
    expect(apexOf("example.com")).toBe("example.com");
    expect(apexOf("EXAMPLE.COM.")).toBe("example.com");
  });

  it("is knowingly wrong for multi-label suffixes", () => {
    // Shipping a public-suffix list to be right here would be a 15,000-entry
    // dependency that also goes stale. The UI says "your domain's root" and the
    // owner places the record, so an approximation they can correct beats a
    // precision we cannot maintain. Pinned so the limitation is not a surprise.
    expect(apexOf("coaching.byshujaa.co.uk")).toBe("co.uk");
  });
});

describe("caaFixFromErrors — Cloudflare already told us the answer", () => {
  const REAL = "CAA records block issuance. Please remove all CAA records or add records for this authority (ssl.com)";

  it("extracts the authority from the message Cloudflare actually sends", () => {
    expect(caaFixFromErrors("coaching.byshujaa.com", [REAL])).toEqual({
      name: "byshujaa.com",
      authority: "ssl.com",
      value: '0 issue "ssl.com"',
    });
  });

  it("does not hardcode Cloudflare's CA — whatever it names is what we surface", () => {
    // Cloudflare has used Let's Encrypt, Google Trust Services and SSL.com at
    // different times and for different certificate packs. A list here would be a
    // guess with an expiry date; the message carries the truth.
    const g = caaFixFromErrors("x.example.com", ["CAA records block issuance … authority (pki.goog)"]);
    expect(g?.authority).toBe("pki.goog");
    expect(g?.value).toBe('0 issue "pki.goog"');
  });

  it("reads a bare authority when there are no parentheses", () => {
    expect(caaFixFromErrors("x.example.com", ["caa issue: add records for this authority letsencrypt.org"])?.authority)
      .toBe("letsencrypt.org");
  });

  it("ignores errors that are not about CAA", () => {
    // The other two messages an owner sees on this screen. Neither is fixed by a
    // CAA record, and offering one would send them at the wrong problem.
    expect(caaFixFromErrors("x.example.com", ["custom hostname does not CNAME to this zone"])).toBeNull();
    expect(caaFixFromErrors("x.example.com", ["pending_validation"])).toBeNull();
    expect(caaFixFromErrors("x.example.com", [])).toBeNull();
  });

  it("a CAA error with no parseable authority yields nothing rather than a wrong record", () => {
    // Better to show the raw error (which the UI does anyway) than to invent a
    // record that authorises the wrong CA.
    expect(caaFixFromErrors("x.example.com", ["CAA records block issuance."])).toBeNull();
  });
});
