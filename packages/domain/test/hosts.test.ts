import { describe, expect, it } from "vitest";
import {
  ADMIN_LABEL,
  RESERVED_LABELS,
  SETUP_LABEL,
  SLUG_MAX,
  SLUG_MIN,
  adminHostname,
  checkSlug,
  classifyHost,
  cookieDomainFor,
  isDevRoot,
  normalizeHostname,
  rpIdFor,
  setupHostname,
  slugRejectionMessage,
  tenantHostname,
  type SlugRejection,
} from "../src/hosts.js";

const ROOT = "kova.4dl.app";

describe("normalizeHostname", () => {
  it("strips the port, the trailing dot and the case", () => {
    expect(normalizeHostname("ACME.Kova.4DL.app:8787")).toBe("acme.kova.4dl.app");
    expect(normalizeHostname("acme.kova.4dl.app.")).toBe("acme.kova.4dl.app");
  });

  it("unwraps a bracketed IPv6 literal rather than truncating it at the first colon", () => {
    // `[::1]:8787".split(":")[0]` is `"["` — a naive port strip turns loopback into
    // garbage, which would classify the dev host as a foreign custom domain.
    expect(normalizeHostname("[::1]:8787")).toBe("::1");
  });
});

describe("classifyHost — the five doors", () => {
  it("the bare root is a dead end, not an app", () => {
    const h = classifyHost(ROOT, ROOT);
    expect(h.role).toBe("root");
    expect(h.slug).toBeNull();
    expect(h.underRoot).toBe(true);
  });

  it("setup and admin are their own doors, never studios", () => {
    expect(classifyHost(`${SETUP_LABEL}.${ROOT}`, ROOT).role).toBe("setup");
    expect(classifyHost(`${ADMIN_LABEL}.${ROOT}`, ROOT).role).toBe("admin");
    expect(classifyHost(`${SETUP_LABEL}.${ROOT}`, ROOT).slug).toBeNull();
  });

  it("a plain label under the root is a studio, and carries its slug", () => {
    const h = classifyHost("acme-gym.kova.4dl.app", ROOT);
    expect(h.role).toBe("tenant");
    expect(h.slug).toBe("acme-gym");
  });

  it("a domain outside the root is a custom domain", () => {
    const h = classifyHost("coaching.byshujaa.com", ROOT);
    expect(h.role).toBe("custom");
    expect(h.underRoot).toBe(false);
  });

  it("a RESERVED label under the root is invalid — never a custom-domain candidate", () => {
    // This is the security-relevant case. `custom` would send the hostname to the
    // `tenant_domains` lookup, whose key column an owner can write to — so
    // classifying `api.kova.4dl.app` as custom would let a tenant claim one of our
    // infrastructure hosts by typing it into the domains form.
    for (const label of ["api", "admin", "www", "mail", "login", "billing", "autodiscover"]) {
      const h = classifyHost(`${label}.${ROOT}`, ROOT);
      expect(h.role, label).not.toBe("custom");
      expect(h.role, label).not.toBe("tenant");
    }
    expect(classifyHost(`api.${ROOT}`, ROOT).role).toBe("invalid");
  });

  it("nesting deeper than one label is invalid — the wildcard cert covers one level", () => {
    expect(classifyHost(`a.b.${ROOT}`, ROOT).role).toBe("invalid");
    expect(classifyHost(`_acme-challenge.acme.${ROOT}`, ROOT).role).toBe("invalid");
  });

  it("an empty hostname is invalid, not root", () => {
    expect(classifyHost("", ROOT).role).toBe("invalid");
  });

  it("a lookalike suffix is NOT under our root", () => {
    // `notkova.4dl.app` ends with `4dl.app` but is not `*.kova.4dl.app`. A suffix
    // test that forgot the dot would classify it as one of our studios.
    expect(classifyHost("notkova.4dl.app", ROOT).role).toBe("custom");
    expect(classifyHost("xkova.4dl.app", ROOT).role).toBe("custom");
    // And a domain that merely CONTAINS the root is not under it either.
    expect(classifyHost("kova.4dl.app.evil.com", ROOT).role).toBe("custom");
  });
});

describe("classifyHost — dev topology", () => {
  it("classifies loopback against localhost whatever the configured root", () => {
    expect(classifyHost("localhost", ROOT).role).toBe("root");
    expect(classifyHost("setup.localhost", ROOT).role).toBe("setup");
    expect(classifyHost("acme.localhost", ROOT).slug).toBe("acme");
    expect(classifyHost("127.0.0.1", ROOT).role).toBe("root");
  });

  it("marks the dev root so controls that need a real domain can stand down", () => {
    expect(isDevRoot(classifyHost("acme.localhost", ROOT))).toBe(true);
    expect(isDevRoot(classifyHost(`acme.${ROOT}`, ROOT))).toBe(false);
  });
});

describe("checkSlug — a slug is a DNS label now", () => {
  const reject = (s: string, reason: SlugRejection) => {
    const r = checkSlug(s);
    expect(r.ok, `${s} should be rejected`).toBe(false);
    if (!r.ok) expect(r.reason).toBe(reason);
  };

  it("accepts what a studio name reasonably slugifies to", () => {
    for (const s of ["zenith", "acme-gym", "iron-house-2", "365fitness"]) {
      expect(checkSlug(s), s).toEqual({ ok: true, slug: s });
    }
  });

  it("lowercases and trims rather than refusing", () => {
    expect(checkSlug("  Acme-Gym  ")).toEqual({ ok: true, slug: "acme-gym" });
  });

  it("refuses every reserved label", () => {
    reject("admin", "reserved");
    reject("setup", "reserved");
    reject("www", "reserved");
    reject("kova", "reserved");
    reject("autodiscover", "reserved");
  });

  it("refuses a dot, so one slug can never span two DNS levels", () => {
    // Without this, slug `a.b` yields `a.b.kova.4dl.app` — two levels deep, which
    // the wildcard certificate does not cover and which shadows a real studio `b`.
    reject("evil.acme", "bad_charset");
  });

  it("refuses non-ASCII, so no homoglyph can impersonate another studio", () => {
    reject("аcme", "bad_charset"); // leading char is Cyrillic U+0430
    reject("acme_gym", "bad_charset");
    reject("acme gym", "bad_charset");
  });

  it("refuses hyphens at the edges and in the IDN-reserved positions", () => {
    reject("-acme", "edge_hyphen");
    reject("acme-", "edge_hyphen");
    reject("xn--80ak6aa92e", "punycode");
    reject("ab--cd", "punycode");
  });

  it("bounds the length at both ends", () => {
    reject("ab", "too_short");
    expect(checkSlug("a".repeat(SLUG_MIN)).ok).toBe(true);
    expect(checkSlug("a".repeat(SLUG_MAX)).ok).toBe(true);
    reject("a".repeat(SLUG_MAX + 1), "too_long");
  });

  it("refuses nothing at all", () => {
    reject("", "empty");
    expect(checkSlug(null).ok).toBe(false);
    expect(checkSlug(undefined).ok).toBe(false);
  });

  it("has a human message for every rejection reason", () => {
    const reasons: SlugRejection[] = ["empty", "too_short", "too_long", "bad_charset", "edge_hyphen", "punycode", "reserved"];
    for (const r of reasons) expect(slugRejectionMessage(r).length, r).toBeGreaterThan(0);
  });

  it("every reserved label is itself a well-formed label, so the list is reachable", () => {
    // A typo'd entry (uppercase, a stray dot) would sit in the set forever without
    // ever matching a slug, silently un-reserving the name it was meant to protect.
    for (const label of RESERVED_LABELS) {
      expect(label, label).toBe(label.toLowerCase());
      expect(label.includes(" "), label).toBe(false);
      // `_acme-challenge` is the one deliberate exception: it can never BE a slug
      // (the underscore fails the charset check) and is listed for explicitness.
      if (label.startsWith("_")) continue;
      expect(/^[a-z0-9-]+$/.test(label), label).toBe(true);
    }
  });

  it("the other doors' labels are reserved, so no studio can shadow them", () => {
    expect(RESERVED_LABELS.has(SETUP_LABEL)).toBe(true);
    expect(RESERVED_LABELS.has(ADMIN_LABEL)).toBe(true);
  });

  it("the Cloudflare-for-SaaS plumbing labels are reserved", () => {
    // The fallback origin and the CNAME target tenants point their own domain at
    // belong on the zone APEX (`saas.4dl.app`), so a studio slug does not collide
    // with them today. They are reserved anyway because the failure if the
    // convention ever slips is not a name clash: a studio sitting on the record
    // custom-domain issuance depends on breaks white-label for every other tenant,
    // and un-reserving later is free while un-squatting is a live URL migration.
    for (const label of ["ssl", "saas", "cname", "fallback"]) {
      reject(label, "reserved");
    }
  });
});

describe("hostname builders", () => {
  it("compose against the root", () => {
    expect(tenantHostname("acme", ROOT)).toBe("acme.kova.4dl.app");
    expect(setupHostname(ROOT)).toBe("setup.kova.4dl.app");
    expect(adminHostname(ROOT)).toBe("admin.kova.4dl.app");
  });

  it("round-trips: a built tenant hostname classifies back to its slug", () => {
    const h = classifyHost(tenantHostname("iron-house", ROOT), ROOT);
    expect(h.role).toBe("tenant");
    expect(h.slug).toBe("iron-house");
  });
});

describe("rpIdFor — one passkey across our doors, and no further", () => {
  it("shares the root as RP ID for every door beneath it", () => {
    // The property cross-tenant identity rests on: one credential, every studio.
    for (const h of [ROOT, `setup.${ROOT}`, `admin.${ROOT}`, `acme.${ROOT}`, `bolt.${ROOT}`]) {
      expect(rpIdFor(classifyHost(h, ROOT)), h).toBe(ROOT);
    }
  });

  it("does NOT leak to a sibling app sharing the parent zone", () => {
    // `otherapp.4dl.app` is a different app in the same zone. Its RP ID must be
    // itself — if it were `4dl.app` (or if ours were), either could assert the
    // other's RP and be offered its users' credentials.
    const sibling = classifyHost("otherapp.4dl.app", ROOT);
    expect(sibling.role).toBe("custom");
    expect(rpIdFor(sibling)).toBe("otherapp.4dl.app");
    expect(rpIdFor(sibling)).not.toBe("4dl.app");
    expect(rpIdFor(sibling)).not.toBe(ROOT);
  });

  it("gives a custom domain its own RP, because WebAuthn allows nothing else", () => {
    expect(rpIdFor(classifyHost("coaching.byshujaa.com", ROOT))).toBe("coaching.byshujaa.com");
  });

  it("keeps dev on localhost, so passkeys still enroll in the E2E suite", () => {
    expect(rpIdFor(classifyHost("acme.localhost", ROOT))).toBe("localhost");
    expect(rpIdFor(classifyHost("localhost", ROOT))).toBe("localhost");
  });
});

describe("cookieDomainFor — one session across our doors, and no further", () => {
  it("widens to the root under our subtree", () => {
    expect(cookieDomainFor(classifyHost(`acme.${ROOT}`, ROOT))).toBe(ROOT);
    expect(cookieDomainFor(classifyHost(`setup.${ROOT}`, ROOT))).toBe(ROOT);
  });

  it("stays host-only on a custom domain", () => {
    // A tenant's own domain must not carry a session that works anywhere else.
    expect(cookieDomainFor(classifyHost("coaching.byshujaa.com", ROOT))).toBeNull();
  });

  it("stays host-only for a dot-less root, because browsers reject Domain=localhost", () => {
    expect(cookieDomainFor(classifyHost("acme.localhost", ROOT))).toBeNull();
  });

  it("never widens to the registrable parent of our root", () => {
    // The bug this pins: widening to `4dl.app` would ship our session cookie to
    // every unrelated app in the zone.
    expect(cookieDomainFor(classifyHost(`acme.${ROOT}`, ROOT))).not.toBe("4dl.app");
  });
});
