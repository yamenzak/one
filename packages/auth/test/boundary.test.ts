import { describe, expect, it } from "vitest";
import { findBoundaryViolations, formatViolations, violationKeys } from "@4dl/core/boundary";

/**
 * CLEAN — an empty list, and it took work to keep it that way.
 *
 * The checker caught two wire-contract strings on the way in: the guard returned
 * `no_studio` and `studio_read_only`. Error codes are the worst kind of leak,
 * because they are a CONTRACT: every consuming app's client would have to match
 * on a noun from a fitness product to detect "this tenant is behind on its bill".
 * They are `no_tenant` and `tenant_read_only`.
 */
const ALLOW: readonly string[] = [];

const dir = new URL("..", import.meta.url).pathname;

describe("package boundary", () => {
  it("imports nothing from an app", () => {
    const v = findBoundaryViolations({ dir }).filter((x) => x.kind === "app-import");
    expect(v, `\n${formatViolations(v)}`).toHaveLength(0);
  });

  it("acquires no NEW product vocabulary", () => {
    const v = findBoundaryViolations({ dir, allow: ALLOW });
    expect(v, `\n${formatViolations(v)}`).toHaveLength(0);
  });

  it("keeps the frozen list honest", () => {
    const all = violationKeys(findBoundaryViolations({ dir }));
    expect(ALLOW.filter((a) => !all.includes(a))).toEqual([]);
  });
});
