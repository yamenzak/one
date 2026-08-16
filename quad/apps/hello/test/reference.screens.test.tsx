/**
 * THE REFERENCE APP'S OWN DECLARATIONS, THROUGH THE REAL SCREENS.
 *
 * ⚠️ THIS IS THE AUTODISCOVERY RULE, ASSERTED IN BOTH DIRECTIONS, AGAINST A REAL
 * MANIFEST. Declared → surfaced: everything `hello` declares appears somewhere a
 * person could change it, and `hello/src/index.ts` contains no screen. Surfaced
 * → declared: the screens render nothing that is not in the manifest, so a
 * control a person can press is always a control something reads.
 *
 * ⚠️ AND IT IS THE REFERENCE APP ON PURPOSE. The next app is copied from this
 * one, so a declaration kind that never reaches a surface here is one that will
 * never reach a surface anywhere.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PLATFORM_ROLES, eventsOf, primaryOf, type Channel } from "@quad/kernel";
import {
  FlagConsole, Guide, NotificationPolicy, Settings, Shelf, Shell, settingsShown, policyShown,
} from "@quad/design";
import { HELLO } from "../src/index.js";

const html = (node: React.ReactNode): string => renderToStaticMarkup(node);

/** Everything a founder holds: the platform's `owner` office ∪ the app's
    founding role (D15) — resolved exactly as `permissionsFor` would. */
const OWNER = new Set([...(PLATFORM_ROLES.owner ?? []), ...(HELLO.access.roles.writer ?? [])]);
const EVERY: readonly Channel[] = ["inbox", "email", "push"];

describe("everything hello declares reaches a screen", () => {
  it("renders every workspace setting it declared", () => {
    const tenant = Object.values(HELLO.settings ?? {}).filter((s) => s.level === "tenant");
    expect(tenant.length).toBeGreaterThan(0);
    expect(settingsShown(HELLO.settings ?? {}, "tenant", OWNER)).toEqual(tenant.map((s) => s.id));

    const out = html(
      <Settings
        book={HELLO.settings ?? {}} level="tenant" stored={{}} held={OWNER} onChange={() => {}}
      />,
    );
    for (const s of tenant) expect(out).toContain(s.field.label);
  });

  it("renders every personal setting it declared", () => {
    const person = Object.values(HELLO.settings ?? {}).filter((s) => s.level === "person");
    expect(person.length).toBeGreaterThan(0);
    const out = html(
      <Settings
        book={HELLO.settings ?? {}} level="person" stored={{}} held={new Set()} onChange={() => {}}
      />,
    );
    for (const s of person) expect(out).toContain(s.field.label);
  });

  it("renders every notification it declared, to somebody in its audience", () => {
    const types = Object.values(HELLO.notifications ?? {});
    expect(types.length).toBeGreaterThan(0);
    expect(policyShown(HELLO.notifications ?? {}, OWNER, EVERY).map((o) => o.id))
      .toEqual(types.map((t) => t.id));

    const out = html(
      <NotificationPolicy
        book={HELLO.notifications ?? {}} level="tenant" policy={{}} preference={{}}
        available={EVERY} held={OWNER} onChange={() => {}}
      />,
    );
    for (const t of types) expect(out).toContain(t.label);
  });

  it("renders every flag it declared", () => {
    const flags = Object.values(HELLO.flags ?? {});
    expect(flags.length).toBeGreaterThan(0);
    const out = html(
      <FlagConsole
        book={HELLO.flags ?? {}} level="operator" deployment={{}} today="2026-08-14"
        onSet={() => {}}
      />,
    );
    for (const f of flags) expect(out).toContain(f.label);
  });

  it("renders every plan and every entitlement it sells", () => {
    const out = html(
      <Shelf
        plans={HELLO.plans} entitlements={HELLO.entitlements} current="free" onChoose={() => {}}
      />,
    );
    for (const plan of HELLO.plans) expect(out).toContain(plan.name);
    for (const [, def] of Object.entries(HELLO.entitlements)) {
      if (!def.reserved) expect(out).toContain(def.label);
    }
  });

  it("renders every onboarding step it declared", () => {
    const steps = Object.values(HELLO.guide ?? {});
    expect(steps.length).toBeGreaterThan(0);
    const out = html(
      <Guide book={HELLO.guide ?? {}} events={[]} held={OWNER} onGo={() => {}} />,
    );
    for (const step of steps) expect(out).toContain(step.label);
  });

  it("draws every primary destination it declared", () => {
    const primary = primaryOf(HELLO.screens);
    const out = html(
      <Shell
        screens={HELLO.screens} here="/" held={OWNER} flags={{ "note-search": true }}
        crown={{ appId: HELLO.id, appName: HELLO.name, appMark: HELLO.mark, tenantName: "Northwind" }}
        onGo={() => {}}
      />,
    );
    for (const screen of primary) expect(out).toContain(screen.label);
  });
});

describe("and the screens show nothing the manifest does not declare", () => {
  /*
    ⚠️ THE OTHER HALF, AND THE ONE THAT MATTERS MORE. A control somebody can
    press that nothing reads is worse than an absent feature: they turn it on,
    believe what it promised, and stop watching for the problem it claimed to
    solve.
  */
  it("offers no notification switch for a type that is not declared", () => {
    const offered = policyShown(HELLO.notifications ?? {}, OWNER, EVERY);
    for (const one of offered) expect(HELLO.notifications?.[one.id]).toBeDefined();
  });

  it("offers no setting that is not declared", () => {
    for (const level of ["tenant", "person"] as const) {
      for (const id of settingsShown(HELLO.settings ?? {}, level, OWNER)) {
        expect(HELLO.settings?.[id]).toBeDefined();
      }
    }
  });

  /* ⚠️ A checklist step waits for an event this app actually raises — including
     the ones its collections raise without anybody writing them. */
  it("waits only for events this app raises", () => {
    const events = eventsOf(HELLO);
    for (const step of Object.values(HELLO.guide ?? {})) expect(events).toContain(step.done);
    for (const m of Object.values(HELLO.milestones ?? {})) expect(events).toContain(m.on);
  });

  /* ⚠️ And every notification points at a screen that exists — the dead-link
     class, which only appears once something renders the row. */
  it("links every notification at a screen that exists", () => {
    const routes = HELLO.screens.map((s) => s.route);
    for (const t of Object.values(HELLO.notifications ?? {})) expect(routes).toContain(t.link);
  });
});
