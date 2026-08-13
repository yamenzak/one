/**
 * WHAT A WORKSPACE CHOOSES ABOUT ITSELF — the declaration, the fallback and the
 * one setting somebody may see and not change.
 *
 * ⚠️ THIS IS NOT CONFIG. Config is the DEPLOYMENT's — one Stripe key, one mail
 * provider, set by an operator, the same for everybody. A setting is one
 * WORKSPACE's, set by its owner and different for every tenant on the same
 * deployment. Merging them would put a studio's accent colour and a live secret
 * key behind the same read.
 */

import { describe, expect, it } from "vitest";
import { BRANDING, refuseSetting, settingsOf, settingsProblems, type SettingsSpec } from "@one/kernel";
import { badHostname, dnsRecordFor, settingsFor, settingsOperations, SETTINGS } from "../src/settings-ops.js";
import type { SqlHandle } from "@one/kernel";

const spec: SettingsSpec = {
  "studio.weekStart": { label: "Weeks start on", kind: "enum", values: ["monday", "sunday"], fallback: "monday" },
  "studio.checkInDays": { label: "Check in every", kind: "number", min: 1, max: 90, fallback: 7 },
  "studio.publishFeed": { label: "Publish", kind: "bool", fallback: true, write: "commerce:manage" },
};

/* ------------------------------------------------------------ the values --- */

describe("what a workspace has, and what it was declared with", () => {
  /*
    ⚠️ THE FALLBACK IS APPLIED IN ONE PLACE. Three readers each deciding what an
    absent row means is three decisions, and the one that differs is a lapse
    policy read as "never" by a sweep and "fourteen days" by the screen showing
    it. Neither throws; they simply disagree.
  */
  it("falls back to the declaration where nothing is stored", () => {
    expect(settingsOf(spec, {})).toEqual({
      "studio.weekStart": "monday", "studio.checkInDays": 7, "studio.publishFeed": true,
    });
  });

  it("reads a stored value back in its declared type", () => {
    const out = settingsOf(spec, { "studio.checkInDays": "14", "studio.publishFeed": "false" });
    expect(out["studio.checkInDays"]).toBe(14);
    expect(out["studio.publishFeed"]).toBe(false);
  });

  /* ⚠️ Empty is not a value. A cleared field means "back to the declaration",
     which is the only reading under which clearing one is undoable. */
  it("treats an emptied value as unset", () => {
    expect(settingsOf(spec, { "studio.weekStart": "" })["studio.weekStart"]).toBe("monday");
  });

  it("ignores a key nobody declared", () => {
    expect(settingsOf(spec, { "studio.whatever": "x" })).not.toHaveProperty("studio.whatever");
  });
});

/* -------------------------------------------------------------- refusals --- */

describe("what may be stored under a key", () => {
  it("refuses an undeclared key", () => {
    expect(refuseSetting(spec, "studio.whatever", "x")).toBe("unknown");
  });

  it("refuses a value of the wrong kind", () => {
    expect(refuseSetting(spec, "studio.publishFeed", "yes")).toBe("kind");
    expect(refuseSetting(spec, "studio.checkInDays", "14")).toBe("kind");
  });

  it("refuses a number outside its declared range", () => {
    expect(refuseSetting(spec, "studio.checkInDays", 0)).toBe("range");
    expect(refuseSetting(spec, "studio.checkInDays", 400)).toBe("range");
    expect(refuseSetting(spec, "studio.checkInDays", 30)).toBeNull();
  });

  it("refuses a choice that is not on the list", () => {
    expect(refuseSetting(spec, "studio.weekStart", "thursday")).toBe("choice");
  });

  /*
    ⚠️ A HEX TRIPLE OR NOTHING. Anything a CSS parser would accept is also a way
    to put a `url(...)` or a variable reference into a stylesheet this product
    renders for other people — a stored injection wearing a colour picker's
    clothes. Empty is "use the product's own".
  */
  describe("a colour", () => {
    for (const bad of ["red", "var(--x)", "url(http://x)", "#fff", "#12345g", "#2f6f4f;color:red"]) {
      it(`refuses ${JSON.stringify(bad)}`, () => {
        expect(refuseSetting(BRANDING, "brand.accent", bad)).toBe("colour");
      });
    }
    /* ⚠️ Named rather than generated, so the guard registry has a literal to
       anchor to — a title built from a loop variable is one no check can find. */
    it("refuses anything a CSS parser would take", () => {
      expect(refuseSetting(BRANDING, "brand.accent", "var(--brand)")).toBe("colour");
      expect(refuseSetting(BRANDING, "brand.accent", "url(http://elsewhere/x.png)")).toBe("colour");
      expect(refuseSetting(BRANDING, "brand.accent", "#2f6f4f;background:url(x)")).toBe("colour");
    });

    it("accepts a six-digit triple", () => {
      expect(refuseSetting(BRANDING, "brand.accent", "#2f6f4f")).toBeNull();
    });
    it("accepts being cleared", () => {
      expect(refuseSetting(BRANDING, "brand.accent", "")).toBeNull();
    });
  });
});

/* ---------------------------------------------------------- declarations --- */

describe("a setting that could not be used", () => {
  /*
    ⚠️ EVERY ONE OF THESE RENDERS, which is worse than being absent: somebody
    keeps trying. And the wrong-typed fallback travels furthest — a number
    declared with a string fallback is `NaN` for every workspace that has not set
    it, which on the day it ships is all of them.
  */
  it("catches a choice with nothing to choose from", () => {
    const bad: SettingsSpec = { k: { label: "K", kind: "enum", values: [], fallback: "x" } };
    expect(settingsProblems(bad).map((p) => p.why).join()).toMatch(/nothing to choose/);
  });

  it("catches a fallback that is not one of the choices", () => {
    const bad: SettingsSpec = { k: { label: "K", kind: "enum", values: ["a", "b"], fallback: "c" } };
    expect(settingsProblems(bad).map((p) => p.why).join()).toMatch(/not one of its choices/);
  });

  it("catches a fallback of the wrong type", () => {
    const bad: SettingsSpec = { k: { label: "K", kind: "number", fallback: "seven" } };
    expect(settingsProblems(bad).map((p) => p.why).join()).toMatch(/falls back to a string/);
  });

  it("catches a range no value satisfies", () => {
    const bad: SettingsSpec = { k: { label: "K", kind: "number", min: 10, max: 1, fallback: 5 } };
    expect(settingsProblems(bad).map((p) => p.why).join()).toMatch(/minimum above its maximum/);
  });

  it("says nothing about a sound one", () => {
    expect(settingsProblems({ ...BRANDING, ...spec })).toEqual([]);
  });
});

/* -------------------------------------------------------- a narrower write --- */

/**
 * ⚠️ A SETTING MAY BE NARROWER THAN THE SCREEN IT IS ON, and the narrowing has
 * to MEAN something or the declaration is decoration — which is exactly what
 * `write` on a collection field was until it was enforced.
 *
 * The shape it is for: a screen a coach may open, carrying one control that
 * withdraws something from every customer of the workspace.
 */
describe("a setting the screen's own opener may not change", () => {
  const ops = new Map(
    settingsOperations({ settings: spec } as never).map((op) => [op.id, op]),
  );

  const ctxFor = (...held: string[]) => {
    const written: unknown[][] = [];
    const db = {
      all: async () => [],
      first: async () => null,
      run: async (...p: unknown[]) => { written.push(p); },
      batch: async () => undefined,
    } as unknown as SqlHandle;
    return {
      written,
      ctx: {
        [SETTINGS]: { db, directory: db, tenantId: "t_1", isOperator: false },
        holds: (p: string) => held.includes(p),
        now: () => "2026-03-01T00:00:00.000Z",
        fail: (code: string, meta?: Record<string, unknown>) => {
          throw new Error(`${code}:${JSON.stringify(meta ?? {})}`);
        },
      },
    };
  };

  const write = (c: unknown, input: unknown) =>
    (ops.get("settings.write") as { handler: (c: unknown, i: unknown) => Promise<unknown> }).handler(c, input);

  it("refuses somebody who may open the screen and not hold the narrower key", async () => {
    const { ctx } = ctxFor("workspace:settings");
    await expect(write(ctx, { key: "studio.publishFeed", value: false }))
      .rejects.toThrow(/platform\.forbidden.*studio\.publishFeed/);
  });

  it("allows somebody who holds it", async () => {
    const { ctx, written } = ctxFor("workspace:settings", "commerce:manage");
    await expect(write(ctx, { key: "studio.publishFeed", value: false })).resolves.toBeTruthy();
    expect(written.length).toBeGreaterThan(0);
  });

  /* ⚠️ And the ordinary ones are untouched by the check — a refusal that fired
     on every setting would make the screen unusable. */
  it("leaves a setting with no narrower key alone", async () => {
    const { ctx } = ctxFor("workspace:settings");
    await expect(write(ctx, { key: "studio.checkInDays", value: 14 })).resolves.toBeTruthy();
  });

  /* ⚠️ REFUSED BEFORE IT IS STORED. A check after the write is a control that
     reports a refusal over a value that is now in the database. */
  it("stores nothing when it refuses", async () => {
    const { ctx, written } = ctxFor("workspace:settings");
    await write(ctx, { key: "studio.publishFeed", value: false }).catch(() => undefined);
    expect(written).toHaveLength(0);
  });
});

/* --------------------------------------------------------------- branding --- */

describe("the keys every app gets", () => {
  /*
    ⚠️ THE SIGN-IN SCREEN WEARS THE BRANDING AND IT RENDERS BEFORE THERE IS A
    SESSION — so an app declaring its own would be declaring keys the platform
    then has to guess the names of.

    ⚠️ THE SIGN-OFF IS HERE FOR THE MIRROR-IMAGE REASON: every message leaves
    from the DEPLOYMENT's verified address, so a customer's inbox shows the
    platform rather than the business they know, and the business has to be able
    to say who it is inside the message. The runtime reads this key on every
    dispatch, so it cannot be an app's to name.
  */
  it("are present whether an app declares any settings or not", () => {
    expect(Object.keys(settingsFor({}))).toEqual(["brand.name", "brand.mark", "brand.accent", "mail.signature", "mail.letterhead"]);
  });

  it("come before the app's own, so they render first", () => {
    expect(Object.keys(settingsFor({ settings: spec }))[0]).toBe("brand.name");
  });

  /* ⚠️ An app may not quietly redefine one — the last spread wins, and that is
     the app's own declaration. This asserts the ORDER is app-last on purpose. */
  it("are overridable by an app that means to", () => {
    const own: SettingsSpec = { "brand.name": { label: "Studio name", kind: "text", fallback: "" } };
    expect(settingsFor({ settings: own })["brand.name"]!.label).toBe("Studio name");
  });
});

/* --------------------------------------------------------------- hostnames --- */

/**
 * ⚠️ A HOSTNAME, NOT A URL AND NOT A PATTERN. A wildcard claimed by one
 * workspace covers hostnames belonging to others; a URL carries a scheme, a port
 * and a path, none of which a host lookup can use and all of which somebody will
 * paste in.
 */
describe("what may be claimed as a domain", () => {
  for (const bad of ["*.example.com", "https://x.example.com", "x.example.com:8787", "localhost", "", "x/y.example.com", "-", ".example.com", "example.com."]) {
    it(`refuses ${JSON.stringify(bad)}`, () => {
      expect(badHostname(bad)).not.toBeNull();
    });
  }

  it("accepts an ordinary hostname", () => {
    expect(badHostname("training.example.com")).toBeNull();
    expect(badHostname("a-b.example.co.uk")).toBeNull();
  });

  /*
    ⚠️ THE RECORD IS UNDER A NAME THE CLAIMANT MUST CONTROL, and it carries the
    token rather than anything derivable. A value computed from the workspace id
    or the hostname is one anybody can work out for a domain they do not own,
    which makes the whole ceremony decorative.
  */
  it("asks for a TXT record under a prefix of the domain itself", () => {
    const record = dnsRecordFor("training.example.com", "one-abc123");
    expect(record).toEqual({ name: "_one-verify.training.example.com", type: "TXT", value: "one-abc123" });
  });
});
