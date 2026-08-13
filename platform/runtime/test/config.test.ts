/**
 * THE TWO LAYERS, AND WHAT A CONSOLE MAY SEE.
 *
 * ⚠️ THE ARITHMETIC IS THE KERNEL'S; WHAT IS HERE IS THE STORAGE AND THE
 * REFUSALS — the parts that decide whether a rotated key reaches every product
 * or one of them, and whether a secret can leave the deployment.
 */

import { describe, expect, it } from "vitest";
import { chargeableFrom, DEPLOYMENT_SCOPE, lines, readAll, refuseWrite, seedOne, writeOne } from "../src/config.js";
import type { ConfigRegistry, Instant, SqlHandle } from "@one/kernel";

const AT = "2026-01-10T00:00:00.000Z" as Instant;

const registry: ConfigRegistry = {
  "stripe.mode": { shared: true, secret: false },
  "stripe.test.secret_key": { shared: true, secret: true },
  "stripe.live.secret_key": { shared: true, secret: true },
  "email.from": { shared: false, secret: false, why: "the display name is per-product" },
};

/*
  ⚠️ THE FAKE IS SCOPED BECAUSE THE REAL TABLE IS, and a fake that ignored the app
  would let a reader that ignored it pass — which is precisely how this store came
  to hold one `email.from` for every product on the deployment. `seed` is keyed
  `<app>/<key>`, so a fixture cannot express a row belonging to nobody.
*/
const store = (seed: Record<string, string> = {}) => {
  const rows = new Map<string, string>(Object.entries(seed));
  const at = (appId: string, key: string) => `${appId}/${key}`;
  return {
    rows,
    handle: {
      async all<T>(_sql: string, appId: string) {
        return [...rows]
          .filter(([k]) => k.startsWith(`${appId}/`))
          .map(([k, value]) => ({ key: k.slice(appId.length + 1), value })) as T[];
      },
      async first<T>() { return null as T | null; },
      async run(sql: string, appId: string, key: string, value: string) {
        /* ⚠️ The fake honours DO NOTHING, because that is the whole difference
           between seeding and writing and a fake that ignored it would prove
           nothing. */
        if (sql.includes("DO NOTHING") && rows.has(at(appId, key))) return;
        rows.set(at(appId, key), value);
      },
    } as unknown as SqlHandle,
  };
};

/* -------------------------------------------------------------- storage --- */

describe("reading and writing", () => {
  it("reads what was written", async () => {
    const s = store();
    await writeOne(s.handle, "kova", "stripe.mode", "live", AT);
    expect(await readAll(s.handle, "kova")).toEqual({ "stripe.mode": "live" });
  });

  /*
    ⚠️ NO STORE IS NOT AN ERROR. A deployment with one app binds no shared store,
    resolves its own values and falls through to nothing — which is what a
    self-host and every test run are.
  */
  it("treats an unbound store as empty rather than throwing", async () => {
    expect(await readAll(null, "kova")).toEqual({});
  });

  /*
    ⚠️ TWO PRODUCTS, ONE DATABASE, AND THE KEY THAT PROVES IT. This store is the
    directory, and the directory is bound with the same id into every worker — so
    `app_config` keyed by the key alone made every product's `email.from` one
    row. `email.from` is declared `shared: false` PRECISELY because it is
    per-app, which is the shape of the whole defect: a declaration promising
    something the storage could not keep, with nothing anywhere disagreeing.
  */
  it("keeps two products' values apart in the one store they share", async () => {
    const s = store();
    await writeOne(s.handle, "kova", "email.from", "Kova", AT);
    await writeOne(s.handle, "scena", "email.from", "Scena", AT);
    expect(await readAll(s.handle, "kova")).toEqual({ "email.from": "Kova" });
    expect(await readAll(s.handle, "scena")).toEqual({ "email.from": "Scena" });
  });

  /*
    ⚠️ AND THE SHARED STORE'S ROWS BELONG TO THE DEPLOYMENT, not to whichever
    product happened to write them. `DEPLOYMENT_SCOPE` is a value rather than a
    second table, so one resolver still reads both layers.
  */
  it("files a shared key under the deployment rather than under a product", async () => {
    const s = store();
    await writeOne(s.handle, DEPLOYMENT_SCOPE, "stripe.secret", "sk_x", AT);
    expect(await readAll(s.handle, DEPLOYMENT_SCOPE)).toEqual({ "stripe.secret": "sk_x" });
    expect(await readAll(s.handle, "kova")).toEqual({});
  });

  /*
    ⚠️ SEEDING IS NOT WRITING, and the difference is a live deployment's mail
    sender. Provisioning seeds one so the bootstrap deadlock can be broken —
    reaching the console needs a session, which needs a code, which needs mail —
    and it runs again on every re-provision. An upsert there resets what an
    operator configured, silently, back to whatever the automation shipped with.
  */
  it("seeds only where there is nothing, and never over what somebody set", async () => {
    const s = store();
    await seedOne(s.handle, "kova", "email.from", "Kova", AT);
    await writeOne(s.handle, "kova", "email.from", "Haddad Strength", AT);
    await seedOne(s.handle, "kova", "email.from", "Kova", AT);
    expect(await readAll(s.handle, "kova")).toEqual({ "email.from": "Haddad Strength" });
  });

  it("survives a database with no table yet", async () => {
    const broken = { async all() { throw new Error("no such table"); } } as unknown as SqlHandle;
    expect(await readAll(broken, "kova")).toEqual({});
  });
});

/* ----------------------------------------------------------- what shows --- */

describe("what a console is shown", () => {
  /*
    ⚠️ A SECRET'S VALUE NEVER TRAVELS. Whether it is SET is what an operator
    actually needs — "is Stripe configured" is the real question — and a console
    that can display a key is one that leaks it through a screen share, a
    support session, or any read vulnerability.
  */
  it("says whether a secret is set and never what it is", () => {
    const out = lines({ "stripe.test.secret_key": "sk_test_realvalue" }, {}, registry);
    const key = out.find((l) => l.key === "stripe.test.secret_key")!;
    expect(key.value).toBe(true);
    expect(JSON.stringify(out)).not.toContain("sk_test_realvalue");
  });

  it("shows a value that is not a secret", () => {
    expect(lines({ "stripe.mode": "live" }, {}, registry).find((l) => l.key === "stripe.mode")!.value).toBe("live");
  });

  /*
    ⚠️ WHERE THE LIVE VALUE CAME FROM IS PART OF THE ANSWER. "It is set" and "it
    is set HERE" have different fixes: somebody looking at a key that resolves
    from the shared store and typing a local value has just pinned this app to a
    copy that will not follow the next rotation.
  */
  it("says which layer each value came from", () => {
    const out = lines({ "stripe.mode": "live" }, { "stripe.mode": "test", "stripe.test.secret_key": "sk" }, registry);
    expect(out.find((l) => l.key === "stripe.mode")!.source).toBe("app");
    expect(out.find((l) => l.key === "stripe.test.secret_key")!.source).toBe("shared");
    expect(out.find((l) => l.key === "email.from")!.source).toBe("unset");
  });

  /*
    ⚠️ NON-EMPTY WINS, NOT PRESENT WINS. Every consumer reads `""` as
    unconfigured, so a blank local row falls THROUGH — otherwise an operator who
    opens a settings screen and saves it without typing anything switches off a
    key that was working.
  */
  it("falls through a blank local value to the shared one", () => {
    const out = lines({ "stripe.mode": "" }, { "stripe.mode": "live" }, registry);
    expect(out.find((l) => l.key === "stripe.mode")!.value).toBe("live");
    expect(out.find((l) => l.key === "stripe.mode")!.source).toBe("shared");
  });

  /*
    ⚠️ AND AN UNSHARED KEY DOES NOT FALL THROUGH AT ALL, however tempting the
    shared row looks. One verified sending address serves the platform; the
    display name in front of it is per-product, and sharing it means the last app
    to save renames the sender for every other one.
  */
  it("does not fall through for a key declared per-app", () => {
    const out = lines({}, { "email.from": "Somebody Else <x@y>" }, registry);
    expect(out.find((l) => l.key === "email.from")!.value).toBe("");
  });
});

/* -------------------------------------------------------------- refusals --- */

describe("what may be written, and where", () => {
  it("accepts a declared key in either scope it belongs to", () => {
    expect(refuseWrite("stripe.mode", "app", registry)).toBeNull();
    expect(refuseWrite("stripe.mode", "shared", registry)).toBeNull();
    expect(refuseWrite("email.from", "app", registry)).toBeNull();
  });

  /*
    ⚠️ AN UNDECLARED KEY IS REFUSED RATHER THAN STORED. Stored, it is a row an
    operator can see and no consumer will ever read — which looks exactly like a
    setting that does not work, and a typo is the ordinary way to produce one.
  */
  it("refuses a key nothing reads", () => {
    expect(refuseWrite("strip.mode", "app", registry)).toBe("unknown_key");
  });

  /*
    ⚠️ CHECKED ON WRITE, NOT ONLY ON READ. An unshared key written into the
    shared store is invisible until a second app resolves it, and by then it is
    another product's problem with no trace of where it came from.
  */
  it("refuses a per-app key aimed at the shared store", () => {
    expect(refuseWrite("email.from", "shared", registry)).toBe("not_shareable");
  });
});

/* ------------------------------------------------------------ chargeable --- */

describe("whether this deployment can take money", () => {
  it("is false with nothing configured", () => {
    expect(chargeableFrom({})).toBe(false);
  });

  it("is true once the lane in use has a key", () => {
    expect(chargeableFrom({ "stripe.test.secret_key": "sk_test_x" })).toBe(true);
    expect(chargeableFrom({ "stripe.mode": "live", "stripe.live.secret_key": "sk_live_x" })).toBe(true);
  });

  /*
    ⚠️ THE MODE PICKS THE LANE, and a deployment in live mode holding only a test
    key is NOT chargeable. Both are stored at once so going live is a mode change
    rather than a re-paste — and saying "yes" here would be a checkout that fails
    at the till instead of a workspace that is honestly told it cannot pay yet.
  */
  it("is false in live mode with only a test key", () => {
    expect(chargeableFrom({ "stripe.mode": "live", "stripe.test.secret_key": "sk_test_x" })).toBe(false);
  });

  it("is false in test mode with only a live key", () => {
    expect(chargeableFrom({ "stripe.mode": "test", "stripe.live.secret_key": "sk_live_x" })).toBe(false);
  });
});
