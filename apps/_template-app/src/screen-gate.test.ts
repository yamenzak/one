/**
 * WHICH SCREEN, AND THE TWO RUNGS THAT USED TO REACH NONE.
 *
 * `pickScreen` is the whole client-side gate: one pure function deciding what a
 * person sees before the Shell mounts. Two of its inputs were declared and never
 * read, and each failed in the direction that looks like a broken product rather
 * than a deliberate state:
 *
 *   `gate.blocked`         `session.ts` declared it; nothing in the app read it.
 *                          `Shell.tsx` said in a comment that `blocked` "is
 *                          handled before the Shell ever mounts". It was not, so
 *                          a workspace thirty days past due got the ordinary
 *                          application with a small read-only chip and every
 *                          write failing one at a time.
 *   `maintenance.level`    the deployment-wide switch. The operator panel has
 *                          shipped in all three consoles since `@4dl/admin`
 *                          existed; nothing here rendered it, so `full` dropped
 *                          people on a login they could never complete — the
 *                          sign-in lane is refused at `full`, so the code never
 *                          arrives and the screen gives no reason.
 *
 * Both are asserted here rather than through the DOM because the decision IS the
 * function: a screen component can be right while nothing ever routes to it,
 * which is exactly what happened.
 */

import { describe, expect, it } from "vitest";
import { pickScreen } from "./screen.js";

const CTX = { active: { gate: null } };
const tenantHost = (over: Record<string, unknown> = {}) => ({ role: "tenant", tenant: { name: "Acme" }, ...over });

describe("the deployment-wide switch", () => {
  it("withholds the app at `full`, on every door", () => {
    for (const role of ["tenant", "setup", "root", "custom"]) {
      expect(pickScreen(false, CTX, { role, tenant: { name: "Acme" }, maintenance: { level: "full" } })).toBe("maintenance");
    }
  });

  it("EXEMPTS the operator door, because the console is how the window ends", () => {
    // Same exemption the server makes. Locking an operator out of the console
    // during maintenance would make the switch a one-way door.
    expect(pickScreen(false, CTX, { role: "admin", tenant: null, maintenance: { level: "full" } })).toBe("admin");
  });

  it("serves the app normally at `readonly` — reads are never withheld", () => {
    // `readonly` refuses writes and shows the whole app, with the banner saying
    // so. Swapping the screen for it would withhold reads the ladder protects.
    expect(pickScreen(false, CTX, tenantHost({ maintenance: { level: "readonly" } }))).toBe("shell");
  });

  it("treats a server too old to send the field as `off`, not as unknown-so-block", () => {
    expect(pickScreen(false, CTX, tenantHost())).toBe("shell");
    expect(pickScreen(false, CTX, tenantHost({ maintenance: null }))).toBe("shell");
  });
});

describe("the standing ladder", () => {
  it("withholds the app for a BLOCKED workspace", () => {
    expect(pickScreen(false, { active: { gate: { blocked: true } } }, tenantHost())).toBe("blocked");
  });

  it("still serves it on the READ-ONLY rung", () => {
    // Rung one withholds writes, not the product. A workspace must be able to read
    // its own its own records while an invoice is outstanding.
    expect(pickScreen(false, { active: { gate: { readOnly: true } } }, tenantHost())).toBe("shell");
  });

  it("does not reach the blocked screen for somebody with no membership here", () => {
    // `notenant` comes first: they are not a member, so this workspace's standing
    // is not their business and "pay your invoice" would be addressed to a
    // stranger.
    expect(pickScreen(false, { active: null }, tenantHost())).toBe("notenant");
  });
});

describe("the order the two are checked in", () => {
  it("puts maintenance ABOVE a workspace's own standing", () => {
    // A deployment-wide window is the wider truth and the one nobody reading it
    // can act on. Showing "settle your invoice" during our own outage sends
    // somebody to fix a bill that is not the reason they are stuck.
    expect(pickScreen(false, { active: { gate: { blocked: true } } }, tenantHost({ maintenance: { level: "full" } }))).toBe("maintenance");
  });

  it("still boots first, so neither flashes before the host is known", () => {
    expect(pickScreen(true, null, null)).toBe("boot");
    expect(pickScreen(false, CTX, null)).toBe("boot");
  });
});
