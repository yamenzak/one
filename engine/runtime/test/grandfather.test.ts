/**
 * A PLAN IS EDITED DOWN, AND EVERYBODY ALREADY ON IT KEEPS WHAT THEY WERE SOLD.
 *
 * ⚠️ THIS IS THE ONE STEP AN EDITABLE CATALOGUE CANNOT SHIP WITHOUT, and its
 * absence has no symptom. Narrowing a tier changes what every existing customer
 * has, with nothing failing and nobody told — the numbers simply become smaller,
 * and the first anybody hears of it is a refusal on an ordinary Tuesday.
 *
 * ⚠️ SO WHAT IS ASSERTED IS THE ASYMMETRY. A narrowing is held; a raise is not.
 * Getting only the first half right freezes early customers below the tier they
 * are on, for ever, as a reward for having been early.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { PlanSpec, TenantId } from "@engine/kernel";
import { PLATFORM_ENTITLEMENTS, snapshotDowngrade } from "@engine/kernel";
import { BILLING_SCHEMA, applySchema, type Db } from "../src/index.js";
import { MEMBERSHIP, heldBy, holdEveryoneOn, subscribe, subscriptionFor } from "../src/billing.js";

const db = () => env.DIRECTORY as unknown as Db;
const OLD = "ten_old" as TenantId;
const NEW = "ten_new" as TenantId;
const NOW = "2026-08-17T12:00:00.000Z" as never;

const KEYS = { ...PLATFORM_ENTITLEMENTS, notes: { label: "Notes", withheld: "quota" as const } };

const plan = (over: Partial<PlanSpec> = {}): PlanSpec => ({
  id: "solo", name: "Solo", said: "", kind: "personal", price: 1200, currency: "USD",
  credits: 4000, order: 1,
  includes: { seats: 5, storage: 100, domains: 1, notes: -1 },
  ...over,
});

beforeEach(async () => {
  await applySchema(db(), [BILLING_SCHEMA]);
  await db().exec(`DELETE FROM subscription;`);
  await subscribe(db(), OLD, MEMBERSHIP, "solo", "active");
});

describe("what an edit takes", () => {
  /* ⚠️ ONLY WHAT WENT DOWN. A raise is a gift and must reach everybody. */
  it("names the narrowings and nothing else", () => {
    const kept = snapshotDowngrade(
      plan(),
      plan({ includes: { seats: 2, storage: 500, domains: 1, notes: -1 }, credits: 1000 }),
    );
    /* Seats fell 5 → 2, and the allowance 4,000 → 1,000. */
    expect(kept).toEqual({ seats: 5, credits: 4000 });
    /* ⚠️ Storage ROSE and is absent — snapshotting it would freeze an early
       customer at 100 while the tier they are on gives 500. */
    expect(kept.storage).toBeUndefined();
    /* ⚠️ And unlimited is unchanged, not narrowed. */
    expect(kept.notes).toBeUndefined();
  });

  /*
    ⚠️ A KEY THE NEW PLAN DOES NOT MENTION AT ALL IS THE SHARPEST NARROWING. It
    resolves to `false` for everybody, which is further down than any number —
    `refuseCatalog` refuses that catalogue, and this holds the line for anyone
    already on it in the window before somebody notices.
  */
  it("treats a dropped key as the deepest cut there is", () => {
    const kept = snapshotDowngrade(plan(), plan({ includes: { seats: 5, storage: 100, domains: 1 } }));
    expect(kept.notes).toBe(-1);
  });

  /* ⚠️ Unlimited beats every number, so a tier that WAS unlimited and is now 50
     is a narrowing by the same comparison the entitlements use. */
  it("reads unlimited becoming a number as a narrowing", () => {
    const kept = snapshotDowngrade(plan(), plan({ includes: { seats: 5, storage: 100, domains: 1, notes: 50 } }));
    expect(kept.notes).toBe(-1);
  });

  it("takes nothing at all from an edit that only raises", () => {
    expect(snapshotDowngrade(plan(), plan({ price: 9900, credits: 9000 }))).toEqual({});
  });
});

describe("holding everybody already on it", () => {
  /*
    ⚠️ THE WHOLE POINT, END TO END. Somebody sold five seats keeps five seats
    after the tier is cut to two — and `walk` reads the snapshot back as a floor
    rather than as a value, which is what makes a later RAISE still reach them.
  */
  it("holds an existing workspace at what it was sold", async () => {
    const before = plan();
    const after = plan({ includes: { seats: 2, storage: 100, domains: 1, notes: -1 }, credits: 1000 });

    expect(await holdEveryoneOn(db(), "solo", before, after)).toBe(1);

    const held = await heldBy(db(), OLD, { plans: [after], keys: KEYS }, NOW, true);
    expect(held.entitlements.find((e) => e.key === "seats")?.value).toBe(5);
    expect(held.entitlements.find((e) => e.key === "seats")?.source).toBe("grandfathered");
    /* ⚠️ AND THE ALLOWANCE, which is not an entitlement and would otherwise be
       cut without anybody holding it — see `allowanceFor`. */
    expect(held.credits).toBe(4000);
  });

  /*
    ⚠️ AND SOMEBODY WHO ARRIVES AFTERWARDS GETS THE NEW TIER. A snapshot written
    onto every future subscription as well would make the edit purely cosmetic.
  */
  it("gives the new number to a workspace that arrives after the edit", async () => {
    const before = plan();
    const after = plan({ includes: { seats: 2, storage: 100, domains: 1, notes: -1 }, credits: 1000 });
    await holdEveryoneOn(db(), "solo", before, after);

    await subscribe(db(), NEW, MEMBERSHIP, "solo", "active");
    const held = await heldBy(db(), NEW, { plans: [after], keys: KEYS }, NOW, true);
    expect(held.entitlements.find((e) => e.key === "seats")?.value).toBe(2);
    expect(held.credits).toBe(1000);
  });

  /*
    ⚠️ NARROWED TWICE, THE FIRST PROMISE STANDS. Grandfathering ratchets up: the
    second edit must not overwrite what the first one held, or a tier cut in two
    steps loses everything the first step protected.
  */
  it("keeps the highest number it ever promised", async () => {
    await holdEveryoneOn(db(), "solo", plan(), plan({ includes: { seats: 3, storage: 100, domains: 1, notes: -1 } }));
    await holdEveryoneOn(db(), "solo",
      plan({ includes: { seats: 3, storage: 100, domains: 1, notes: -1 } }),
      plan({ includes: { seats: 1, storage: 100, domains: 1, notes: -1 } }));

    const sub = await subscriptionFor(db(), OLD, MEMBERSHIP);
    expect(sub?.overrides.seats).toBe(5);
  });

  /* ⚠️ AN EDIT THAT TOOK NOTHING WRITES NOTHING — an empty snapshot on every
     subscription would make the next reader think a narrowing had happened. */
  it("writes nothing when the edit took nothing", async () => {
    expect(await holdEveryoneOn(db(), "solo", plan(), plan({ price: 9900 }))).toBe(0);
    /* ⚠️ `toEqual`, NEVER `toMatchObject` — a partial match against `{}` accepts
       every object there is, so the assertion would hold whatever was written. */
    expect((await subscriptionFor(db(), OLD, MEMBERSHIP))?.overrides).toEqual({});
  });

  /* ⚠️ AND A WORKSPACE ON A DIFFERENT PLAN IS UNTOUCHED. */
  it("holds only the workspaces that were on the plan", async () => {
    await subscribe(db(), NEW, MEMBERSHIP, "plus", "active");
    await holdEveryoneOn(db(), "solo", plan(), plan({ includes: { seats: 1, storage: 100, domains: 1, notes: -1 } }));
    expect((await subscriptionFor(db(), NEW, MEMBERSHIP))?.overrides).toEqual({});
  });
});
