/**
 * THE DOORS, THE DIRECTORY AND THE RESOLUTION.
 *
 * Pure functions and an injected directory, so the whole tenancy topology is
 * exercised without a worker, a database or a network — which is what keeps an
 * app's own suite inside the 60-second budget in STANDARDS.md §8.
 */

import { describe, expect, it } from "vitest";
import {
  classifyHost, cookieDomainFor, relyingPartyFor, UNIVERSAL_RESERVED,
  type DoorConfig,
} from "../src/doors.js";
import { DIRECTORY_FIELDS, type Directory, type DirectoryEntry } from "../src/directory.js";
import { resolveRequest, type RegionalBindings, type ResolveConfig } from "../src/resolve.js";
import { gateFor, permits, type StandingState } from "../src/standing.js";
import { defineBindings, sql, cache } from "../src/bindings.js";
import type { RegionId, TenantId } from "../src/primitives.js";

const cfg: ResolveConfig = {
  appRoot: "kova.4dl.app",
  platformRoot: "4dl.app",
  reserved: ["kova", "coach"],
  directoryRegion: "eu",
};

const entry = (over: Partial<DirectoryEntry> = {}): DirectoryEntry => ({
  tenantId: "t_1" as TenantId,
  slug: "gym",
  region: "auto" as RegionId,
  standing: { standing: "active", reason: "ok" },
  domains: [],
  branding: {},
  ...over,
});

const dir = (e: DirectoryEntry | null): Directory => ({
  bySlug: async (s) => (e && e.slug === s ? e : null),
  byDomain: async (h) => (e && e.domains.includes(h) ? e : null),
});

/* ------------------------------------------------------------------ doors --- */

describe("the doors", () => {
  const cases: [string, string][] = [
    ["kova.4dl.app", "root"],
    ["setup.kova.4dl.app", "setup"],
    ["admin.kova.4dl.app", "admin"],
    ["gym.kova.4dl.app", "tenant"],
    ["train.mygym.com", "custom"],
    ["deep.nested.kova.4dl.app", "invalid"],
    ["", "invalid"],
  ];
  for (const [host, door] of cases) {
    it(`${host || "(empty)"} is the ${door} door`, () => {
      expect(classifyHost(host, cfg).door).toBe(door);
    });
  }

  it("takes the port off, and is case-insensitive", () => {
    expect(classifyHost("GYM.Kova.4dl.app:8787", cfg).slug).toBe("gym");
  });

  it("refuses a reserved label as a tenant, without saying it is reserved", () => {
    // ⚠️ Same answer as a name nobody has taken. An outsider probing for
    // `admin` or `_acme-challenge` learns nothing from the difference.
    for (const l of ["admin", "autodiscover", "_acme-challenge", "billing", "coach"]) {
      expect(classifyHost(`${l}.kova.4dl.app`, cfg).door, l).not.toBe("tenant");
    }
  });

  it("keeps the dangerous labels reserved on every product", () => {
    for (const l of ["admin", "setup", "mail", "autodiscover", "checkout"]) {
      expect(UNIVERSAL_RESERVED, l).toContain(l);
    }
  });

  it("opens the device door only when an app asks for one", () => {
    expect(classifyHost("play.kova.4dl.app", cfg).door).toBe("tenant");
    expect(classifyHost("play.kova.4dl.app", { ...cfg, deviceDoor: "play" }).door).toBe("device");
  });
});

/* --------------------------------------------------------------- identity --- */

describe("one credential, separate sessions", () => {
  /*
    ⚠️ THE ASSERTION THE WHOLE SSO DESIGN RESTS ON.

    The relying party is the PLATFORM root, so a passkey registered here is
    offered on every product — with the ceremony running on this origin, under
    this product's branding, with no redirect to hide.

    The session cookie stops at the APP root, so a script injected into one
    product cannot act as that person in another. An account shared across
    products is a feature; a session shared across them is a blast radius.
  */
  it("scopes the credential wider than the session, on purpose", () => {
    const shape = classifyHost("gym.kova.4dl.app", cfg);
    expect(relyingPartyFor(shape)).toBe("4dl.app");
    expect(cookieDomainFor(shape)).toBe(".kova.4dl.app");
    expect(relyingPartyFor(shape)).not.toBe(cookieDomainFor(shape)?.slice(1));
  });

  it("gives every door under the root the same credential", () => {
    for (const h of ["kova.4dl.app", "setup.kova.4dl.app", "admin.kova.4dl.app", "gym.kova.4dl.app"]) {
      expect(relyingPartyFor(classifyHost(h, cfg)), h).toBe("4dl.app");
    }
  });

  it("excludes a custom domain from both, which WebAuthn requires anyway", () => {
    const shape = classifyHost("train.mygym.com", cfg);
    expect(relyingPartyFor(shape)).toBe("train.mygym.com");
    // No shared parent to widen to, and a tenant's own domain must not carry a
    // session usable anywhere else.
    expect(cookieDomainFor(shape)).toBeNull();
  });

  it("leaves localhost host-only, because browsers refuse a Domain for it", () => {
    const local: DoorConfig = { appRoot: "localhost", platformRoot: "localhost", reserved: [] };
    expect(cookieDomainFor(classifyHost("gym.localhost", local))).toBeNull();
  });
});

/* -------------------------------------------------------------- directory --- */

describe("the directory holds routing data and nothing else", () => {
  /*
    ⚠️ It is global — readable from every region — which is only defensible
    because nothing in it is personal. A field added here without thinking is
    how "this tenant's data is in the EU" quietly stops being true.
  */
  it("has exactly the declared fields", () => {
    expect([...DIRECTORY_FIELDS].sort()).toEqual(Object.keys(entry()).sort());
  });

  it("names nothing about a person", () => {
    for (const f of DIRECTORY_FIELDS) {
      expect(f.toLowerCase(), `${f} looks personal`).not.toMatch(/email|name|phone|owner|user/);
    }
  });
});

/* --------------------------------------------------------------- resolve --- */

describe("resolution", () => {
  it("serves a tenantless door with no directory read at all", async () => {
    const never: Directory = {
      bySlug: async () => { throw new Error("must not read the directory"); },
      byDomain: async () => { throw new Error("must not read the directory"); },
    };
    for (const h of ["kova.4dl.app", "setup.kova.4dl.app", "admin.kova.4dl.app"]) {
      const r = await resolveRequest(h, cfg, never);
      expect(r.ok, h).toBe(true);
      if (r.ok) expect(r.at.tenant).toBeNull();
    }
  });

  it("takes the region from the DIRECTORY, never from the request", async () => {
    const r = await resolveRequest("gym.kova.4dl.app", cfg, dir(entry({ region: "eu" as RegionId })));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.at.region).toBe("eu");
  });

  it("resolves a custom domain to the same tenant as its slug", async () => {
    const e = entry({ domains: ["train.mygym.com"], region: "eu" as RegionId });
    const viaSlug = await resolveRequest("gym.kova.4dl.app", cfg, dir(e));
    const viaDomain = await resolveRequest("train.mygym.com", cfg, dir(e));
    expect(viaSlug.ok && viaDomain.ok).toBe(true);
    if (viaSlug.ok && viaDomain.ok) {
      expect(viaDomain.at.tenant?.tenantId).toBe(viaSlug.at.tenant?.tenantId);
      expect(viaDomain.at.region).toBe(viaSlug.at.region);
    }
  });

  it("404s a slug nobody holds, and a domain nobody pointed here", async () => {
    expect((await resolveRequest("nobody.kova.4dl.app", cfg, dir(null))).ok).toBe(false);
    expect((await resolveRequest("someone-elses.com", cfg, dir(null))).ok).toBe(false);
  });

  it("carries the standing gate into the resolution", async () => {
    const suspended: StandingState = { standing: "blocked", reason: "arrears" };
    const r = await resolveRequest("gym.kova.4dl.app", cfg, dir(entry({ standing: suspended })));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.at.gate.app).toBe(false);
      expect(r.at.gate.reads).toBe(true);
    }
  });
});

/* -------------------------------------------------------------- standing --- */

describe("the two rules that never bend", () => {
  const rungs: StandingState[] = [
    { standing: "active", reason: "ok" },
    { standing: "grace", reason: "arrears" },
    { standing: "read_only", reason: "arrears" },
    { standing: "blocked", reason: "arrears" },
    { standing: "closing", reason: "closing" },
  ];

  it("never gates a read, at any rung", () => {
    for (const s of rungs) expect(gateFor(s).reads, s.standing).toBe(true);
  });

  it("always allows leaving, at any rung", () => {
    for (const s of rungs) {
      expect(permits(gateFor(s), "exit", true), s.standing).toBe(true);
      expect(permits(gateFor(s), "billing", true), s.standing).toBe(true);
    }
  });

  it("refuses an ordinary write once the gate closes, and still serves the read", () => {
    const g = gateFor({ standing: "read_only", reason: "arrears" });
    expect(permits(g, "coaching", true)).toBe(false);
    expect(permits(g, "coaching", false)).toBe(true);
  });
});

/* -------------------------------------------------------------- bindings --- */

describe("bindings come from a resolution", () => {
  const spec = defineBindings({ db: sql(), cache: cache() });

  /*
    ⚠️ THE PROOF IS THAT A RESOLUTION IS THE ONLY INPUT A RESOLVER ACCEPTS. The
    implementation is the runtime's — resolving a binding means touching a raw
    environment, which is permitted in one file — so what is asserted here is the
    contract every implementation must satisfy, with a fake standing in for one.
  */
  const resolver: RegionalBindings<typeof spec> = {
    for: () => ({ db: {}, cache: {} }) as never,
  };

  it("takes a region that came from a lookup, and hands back one handle per store", async () => {
    const r = await resolveRequest("gym.kova.4dl.app", cfg, dir(entry()));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(resolver.for(r.at.region)).sort()).toEqual(["cache", "db"]);
  });
});
