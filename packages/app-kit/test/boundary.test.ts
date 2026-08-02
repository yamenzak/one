import { describe, expect, it } from "vitest";
import { findBoundaryViolations, formatViolations, violationKeys } from "@4dl/core/boundary";

/**
 * One waiver, and it is a false positive rather than a leak.
 *
 * `clientsClaim` is WORKBOX's option name — the service worker taking control of
 * open browser clients — and the checker's `client` token cannot tell that from
 * a coaching client. Unlike `@4dl/notify`'s `WebSocketPair` halves, which were
 * local variables and got renamed, this one is a third-party API key: there is
 * nothing to rename, and spelling it any other way would just break the build.
 *
 * Frozen by key, so the "keeps the frozen list honest" test below fails the
 * moment it stops being a real violation — a waiver that has quietly become
 * unnecessary is a waiver nobody re-examines.
 */
const ALLOW: readonly string[] = ["src/pwa.ts:client"];
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
