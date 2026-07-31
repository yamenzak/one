import { describe, expect, it } from "vitest";
import { findBoundaryViolations, formatViolations, violationKeys } from "@4dl/core/boundary";

/**
 * EMPTY, and it has to stay that way for this package more than most.
 *
 * A console is where product vocabulary collects: every section is named after
 * something an operator manages, and the temptation is to let the shared shell
 * "just know" about studios, or plans, or clients. The moment it does, the
 * second app inherits a console describing the first app's business.
 *
 * The section REGISTRY is the app's. This package owns the frame around it, and
 * the panels for configuration a shared package already owns — email delivery is
 * `@4dl/email`'s subject, not any app's.
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
