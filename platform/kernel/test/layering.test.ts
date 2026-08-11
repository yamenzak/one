/**
 * THE LAYER DIRECTION, enforced while it is still one package.
 *
 * `@one/kernel` holds five modules that become three packages when there is
 * implementation to separate. Package boundaries would make a violation a
 * compile error — level 1 — but four package.json files before a single type is
 * written is boilerplate paid in advance of knowing the shape.
 *
 * So the direction is enforced here instead, at level 2, which keeps the split
 * mechanical rather than archaeological. When the packages appear, this file is
 * deleted and the compiler takes over.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..", "src");

/** Lower may not import higher. Equal may not import equal. */
const LAYER: Record<string, number> = {
  "primitives.ts": 0,
  "bindings.ts": 1,
  "validate.ts": 1,
  "problem.ts": 1,
  "doors.ts": 1,
  "standing.ts": 1,
  "identity.ts": 1,
  "config.ts": 1,
  "measure.ts": 1,
  "meter.ts": 1,
  "milestone.ts": 1,
  "moment.ts": 1,
  "directory.ts": 2,
  "session.ts": 2,
  "membership.ts": 2,
  "schema.ts": 2,
  "protection.ts": 1,
  "collection.ts": 2,
  /* ⚠️ Above protection because it IMPORTS it: a fact declares what it is
     under the law, so the vault cannot sit level with the vocabulary for
     that. Beside collection rather than above it — neither knows the other,
     and the shadow check takes a shape rather than a `CollectionSpec` for
     exactly that reason. */
  "vault.ts": 2,
  "entitlement.ts": 2,
  "customer.ts": 2,
  "job.ts": 2,
  "generation.ts": 2,
  /* ⚠️ Declared, validated and defaulted with no I/O and nothing below it but
     primitives — the same shape as every other registry here. */
  "settings.ts": 2,
  /* Declared and validated with no I/O — the asking is the runtime's. */
  "lookup.ts": 2,
  "notify.ts": 3,
  "help.ts": 3,
  "guide.ts": 3,
  "market.ts": 3,
  "release.ts": 3,
  "operation.ts": 3,
  "resolve.ts": 3,
  "ddl.ts": 3,
  "document.ts": 3,
  "surface.ts": 4,
  "app.ts": 4,
  "index.ts": 5,
};

describe("the kernel's layers", () => {
  for (const [file, layer] of Object.entries(LAYER)) {
    it(`${file} imports only from below it`, () => {
      const src = readFileSync(join(SRC, file), "utf8");
      for (const m of src.matchAll(/from "\.\/([a-z]+\.js)"/g)) {
        const target = m[1]!.replace(/\.js$/, ".ts");
        const targetLayer = LAYER[target];
        expect(targetLayer, `${file} imports unknown module ${target}`).toBeDefined();
        expect(targetLayer! < layer, `${file} (L${layer}) imports ${target} (L${targetLayer}) — layers go DOWN only`).toBe(true);
      }
    });
  }

  it("primitives depends on nothing", () => {
    expect(readFileSync(join(SRC, "primitives.ts"), "utf8")).not.toMatch(/^import /m);
  });

  /*
    ⚠️ Every day-zero field from MANIFEST.md §9 must be REQUIRED, not optional.
    An optional field is one an app forgets, and the entire point of that list is
    that forgetting it means a migration rather than an edit.
  */
  it("keeps the day-zero fields non-optional", () => {
    const collection = readFileSync(join(SRC, "collection.ts"), "utf8");
    expect(collection, "collection.version must be required").toMatch(/readonly version: true;/);
    expect(collection, "retention must be required").toMatch(/readonly retention: Retention;/);
    expect(collection, "onDelete must be required").toMatch(/readonly onDelete: DeletePolicy;/);

    const operation = readFileSync(join(SRC, "operation.ts"), "utf8");
    expect(operation, "idempotency must be required").toMatch(/readonly idempotency: Idempotency;/);

    // A media field that strips metadata only when asked is a media field that
    // does not strip it. Stripping later never fixes what is already stored.
    expect(collection, "exifStrip must default to true").toMatch(/exifStrip: true/);
  });
});
